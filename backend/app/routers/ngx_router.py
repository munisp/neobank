"""NGX (Nigerian Exchange) stock investing.

Seeded securities master of major NGX listings, deterministic quote
simulation (price drifts per symbol+day so demos are stable), buy/sell
orders with a fee, aggregated holdings, and portfolio valuation.
"""

import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.platform_integration import get_platform_integration
from app.middleware.auth import get_current_user
from database.connection import get_db
from app.infrastructure.tigerbeetle_client import Ledger, TransferCode
from database.models import NgxHolding, NgxOrder, NgxSecurity

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["NGX Investing"])

FEE_PCT = Decimal("0.0125")  # 1.25% brokerage+SEC+stamp combined estimate

NGX_SEED = [
    ("DANGCEM", "Dangote Cement Plc", "Industrial", "478.00"),
    ("MTNN", "MTN Nigeria Communications", "Telecoms", "220.00"),
    ("GTCO", "Guaranty Trust Holding Co", "Banking", "44.50"),
    ("ZENITHBANK", "Zenith Bank Plc", "Banking", "38.25"),
    ("ACCESSCORP", "Access Holdings Plc", "Banking", "19.80"),
    ("UBA", "United Bank for Africa", "Banking", "22.40"),
    ("BUFOODS", "BUA Foods Plc", "Consumer", "379.00"),
    ("AIRTELAFRI", "Airtel Africa Plc", "Telecoms", "2150.00"),
    ("SEPLAT", "Seplat Energy Plc", "Oil & Gas", "3410.00"),
    ("NESTLE", "Nestlé Nigeria Plc", "Consumer", "890.00"),
]


def _quote(symbol: str, base: float) -> float:
    """Deterministic per-day drift: stable within a day, varies across days.
    ±3% band derived from a hash of symbol+date."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    h = int(hashlib.sha256(f"{symbol}:{day}".encode()).hexdigest()[:8], 16)
    drift = ((h % 600) - 300) / 10000.0  # -3.00% .. +2.99%
    return round(base * (1 + drift), 2)


async def _seed_securities(db: AsyncSession) -> None:
    for symbol, name, sector, price in NGX_SEED:
        db.add(NgxSecurity(id=uuid.uuid4(), symbol=symbol, name=name,
                           sector=sector, last_price=Decimal(price)))
    await db.commit()
    logger.info("ngx.seeded", count=len(NGX_SEED))


@router.get("/ngx/securities")
async def list_securities(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    secs = (await db.execute(select(NgxSecurity).where(
        NgxSecurity.is_active.is_(True)).order_by(NgxSecurity.symbol))).scalars().all()
    if not secs:
        await _seed_securities(db)
        secs = (await db.execute(select(NgxSecurity).where(
            NgxSecurity.is_active.is_(True)).order_by(NgxSecurity.symbol))).scalars().all()
    return {"securities": [{
        "symbol": s.symbol, "name": s.name, "sector": s.sector,
        "price": _quote(s.symbol, float(s.last_price)), "currency": s.currency,
    } for s in secs]}


@router.get("/ngx/securities/{symbol}/quote")
async def get_quote(symbol: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    s = (await db.execute(select(NgxSecurity).where(
        NgxSecurity.symbol == symbol.upper()))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Security not found")
    price = _quote(s.symbol, float(s.last_price))
    return {"symbol": s.symbol, "name": s.name, "price": price,
            "currency": s.currency, "fee_pct": float(FEE_PCT * 100),
            "as_of": datetime.now(timezone.utc).isoformat()}


class OrderRequest(BaseModel):
    symbol: str
    side: str  # buy | sell
    quantity: int




async def _kyc_gate(db: AsyncSession, user: Dict[str, Any], event: str,
                    context: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate KYC triggers for a product event; never raises."""
    try:
        from app.services.kyc_trigger_service import get_kyc_trigger_service
        from database.models import User as _User
        db_user = (await db.execute(select(_User).where(
            _User.id == uuid.UUID(str(user["user_id"]))))).scalar_one_or_none()
        if db_user is None:
            return {"allowed": True, "triggers": []}
        return await get_kyc_trigger_service().check_gate(db, db_user, event, context)
    except Exception:  # noqa: BLE001
        return {"allowed": True, "triggers": []}

@router.post("/ngx/orders", status_code=201)
async def place_order(body: OrderRequest,
                      user: Dict[str, Any] = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    gate = await _kyc_gate(db, user, "ngx_order", {"amount": 0, "symbol": body.symbol})
    if not gate["allowed"]:
        raise HTTPException(status_code=403, detail={
            "error": "kyc_required", "required_level": gate.get("required_level"),
            "triggers": gate.get("triggers"), "route": "/kyc/upgrade"})
    if body.side not in ("buy", "sell"):
        raise HTTPException(status_code=422, detail="side must be buy or sell")
    if body.quantity <= 0:
        raise HTTPException(status_code=422, detail="quantity must be positive")

    s = (await db.execute(select(NgxSecurity).where(
        NgxSecurity.symbol == body.symbol.upper()))).scalar_one_or_none()
    if not s or not s.is_active:
        raise HTTPException(status_code=404, detail="Security not found")

    uid = uuid.UUID(str(user["user_id"]))
    price = Decimal(str(_quote(s.symbol, float(s.last_price))))
    gross = price * body.quantity
    fee = (gross * FEE_PCT).quantize(Decimal("0.01"))

    holding = (await db.execute(select(NgxHolding).where(
        NgxHolding.user_id == uid, NgxHolding.security_id == s.id))).scalar_one_or_none()

    if body.side == "sell":
        if not holding or holding.quantity < body.quantity:
            raise HTTPException(status_code=422, detail="Insufficient shares to sell")
        holding.quantity -= body.quantity
    else:
        if holding is None:
            holding = NgxHolding(id=uuid.uuid4(), user_id=uid, security_id=s.id,
                                 quantity=0, avg_cost=Decimal("0"))
            db.add(holding)
        total_cost = Decimal(str(holding.avg_cost)) * holding.quantity + gross
        holding.quantity += body.quantity
        holding.avg_cost = (total_cost / holding.quantity).quantize(Decimal("0.01"))

    order = NgxOrder(id=uuid.uuid4(), user_id=uid, security_id=s.id, side=body.side,
                     quantity=body.quantity, price=price, gross_amount=gross,
                     fee=fee, status="executed")
    db.add(order)
    await db.commit()
    logger.info("ngx.order", user=str(uid), side=body.side, symbol=s.symbol,
                qty=body.quantity, price=float(price))

    # --- middleware integration: TigerBeetle double-entry + domain event ---
    integ = get_platform_integration()
    if body.side == "buy":
        ledger_result = integ.post_transfer(
            debit_user=str(uid), credit_system="broker_clearing",
            amount=gross + fee, ledger=Ledger.NGX_BROKERAGE, code=TransferCode.NGX_BUY,
            reference=f"ngx-buy:{order.id}")
        integ.post_transfer(
            debit_system="broker_clearing", credit_system="fee_revenue",
            amount=fee, ledger=Ledger.FEE, code=TransferCode.FEE_COLLECTION,
            reference=f"ngx-fee:{order.id}")
    else:
        ledger_result = integ.post_transfer(
            debit_system="broker_clearing", credit_user=str(uid),
            amount=gross - fee, ledger=Ledger.NGX_BROKERAGE, code=TransferCode.NGX_SELL,
            reference=f"ngx-sell:{order.id}")
    await integ.emit("NgxOrderExecuted", aggregate_id=str(order.id),
                     aggregate_type="ngx_order",
                     payload={"symbol": s.symbol, "side": body.side,
                              "quantity": body.quantity, "price": float(price),
                              "gross": float(gross), "fee": float(fee)},
                     user_id=str(uid))

    return {"order": {
        "id": str(order.id), "symbol": s.symbol, "side": body.side,
        "quantity": body.quantity, "price": float(price),
        "gross_amount": float(gross), "fee": float(fee),
        "total": float(gross + fee) if body.side == "buy" else float(gross - fee),
        "status": "executed",
    }, "ledger": ledger_result}


@router.get("/ngx/portfolio")
async def portfolio(user: Dict[str, Any] = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(str(user["user_id"]))
    holdings = (await db.execute(select(NgxHolding).where(
        NgxHolding.user_id == uid, NgxHolding.quantity > 0))).scalars().all()
    out: List[Dict[str, Any]] = []
    total_value = 0.0
    total_cost = 0.0
    for h in holdings:
        s = h.security or (await db.execute(select(NgxSecurity).where(
            NgxSecurity.id == h.security_id))).scalar_one()
        price = _quote(s.symbol, float(s.last_price))
        value = price * h.quantity
        cost = float(h.avg_cost) * h.quantity
        total_value += value
        total_cost += cost
        out.append({
            "symbol": s.symbol, "name": s.name, "quantity": h.quantity,
            "avg_cost": float(h.avg_cost), "current_price": price,
            "market_value": round(value, 2),
            "unrealized_pnl": round(value - cost, 2),
        })
    return {"holdings": out, "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "unrealized_pnl": round(total_value - total_cost, 2)}


@router.get("/ngx/orders")
async def order_history(user: Dict[str, Any] = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(str(user["user_id"]))
    orders = (await db.execute(select(NgxOrder).where(NgxOrder.user_id == uid)
              .order_by(NgxOrder.created_at.desc()).limit(100))).scalars().all()
    return {"orders": [{
        "id": str(o.id), "symbol": o.security.symbol if o.security else None,
        "side": o.side, "quantity": o.quantity, "price": float(o.price),
        "gross_amount": float(o.gross_amount), "fee": float(o.fee),
        "status": o.status,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    } for o in orders]}
