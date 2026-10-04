"""Stablecoin support — custodial USDT/USDC wallets.

Wallets per user per asset, NGN on/off ramp with a quoted rate (spread over
a reference USD/NGN rate), and wallet-to-wallet transfers. Ledger entries
record every movement. Reference rate is deterministic-per-day for demo
stability; wire a real oracle/provider in production.
"""

import hashlib
import secrets
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
from database.models import StablecoinTransfer, StablecoinWallet

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Stablecoins"])

SUPPORTED_ASSETS = ("USDT", "USDC")
REFERENCE_USDNGN = Decimal("1550.00")   # reference rate; production: oracle feed
RAMP_SPREAD_PCT = Decimal("0.015")      # 1.5% ramp spread


def _rate(side: str) -> Decimal:
    """NGN per 1 USD-stablecoin. Deterministic daily jitter ±0.5%."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    h = int(hashlib.sha256(f"usdrate:{day}".encode()).hexdigest()[:8], 16)
    jitter = Decimal(((h % 100) - 50)) / Decimal("10000")
    base = REFERENCE_USDNGN * (1 + jitter)
    return base * (1 + RAMP_SPREAD_PCT) if side == "buy" else base * (1 - RAMP_SPREAD_PCT)


async def _get_wallet(db: AsyncSession, uid: uuid.UUID, asset: str,
                      create: bool = False) -> Optional[StablecoinWallet]:
    w = (await db.execute(select(StablecoinWallet).where(
        StablecoinWallet.user_id == uid,
        StablecoinWallet.asset == asset))).scalar_one_or_none()
    if w is None and create:
        w = StablecoinWallet(id=uuid.uuid4(), user_id=uid, asset=asset,
                             balance=Decimal("0"),
                             address=f"0x{secrets.token_hex(20)}")
        db.add(w)
        await db.flush()
    return w


def _serialize_wallet(w: StablecoinWallet, rate: Decimal) -> Dict[str, Any]:
    bal = Decimal(str(w.balance))
    return {"asset": w.asset, "balance": float(bal), "address": w.address,
            "ngn_value": float((bal * rate).quantize(Decimal("0.01")))}


class RampRequest(BaseModel):
    asset: str
    ngn_amount: Optional[float] = None   # ramp in: NGN spent
    token_amount: Optional[float] = None  # ramp out: tokens sold


class TransferRequest(BaseModel):
    asset: str
    to_address: str
    amount: float


@router.get("/stablecoins/wallets")
async def list_wallets(user: Dict[str, Any] = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(str(user["user_id"]))
    rate = _rate("buy")
    wallets = []
    for asset in SUPPORTED_ASSETS:
        w = await _get_wallet(db, uid, asset, create=True)
        wallets.append(_serialize_wallet(w, rate))
    await db.commit()
    return {"wallets": wallets, "rate_buy_ngn": float(_rate("buy")),
            "rate_sell_ngn": float(_rate("sell"))}


@router.get("/stablecoins/rate")
async def get_rate() -> Dict[str, Any]:
    return {"asset_pair": "USD/NGN", "buy_ngn": float(_rate("buy")),
            "sell_ngn": float(_rate("sell")), "spread_pct": float(RAMP_SPREAD_PCT * 100),
            "as_of": datetime.now(timezone.utc).isoformat()}




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

@router.post("/stablecoins/ramp/in", status_code=201)
async def ramp_in(body: RampRequest,
                  user: Dict[str, Any] = Depends(get_current_user),
                  db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Buy stablecoins with NGN."""
    gate = await _kyc_gate(db, user, "stablecoin_ramp", {"amount": body.ngn_amount, "asset": body.asset})
    if not gate["allowed"]:
        raise HTTPException(status_code=403, detail={
            "error": "kyc_required", "required_level": gate.get("required_level"),
            "triggers": gate.get("triggers"), "route": "/kyc/upgrade"})
    if body.asset not in SUPPORTED_ASSETS:
        raise HTTPException(status_code=422, detail=f"Supported: {SUPPORTED_ASSETS}")
    if not body.ngn_amount or body.ngn_amount <= 0:
        raise HTTPException(status_code=422, detail="ngn_amount required")
    uid = uuid.UUID(str(user["user_id"]))
    rate = _rate("buy")
    tokens = (Decimal(str(body.ngn_amount)) / rate).quantize(Decimal("0.00000001"))
    w = await _get_wallet(db, uid, body.asset, create=True)
    w.balance = Decimal(str(w.balance)) + tokens
    db.add(StablecoinTransfer(id=uuid.uuid4(), wallet_id=w.id, type="ramp_in",
                              asset=body.asset, amount=tokens,
                              ngn_amount=Decimal(str(body.ngn_amount)), rate=rate,
                              tx_hash=f"0x{secrets.token_hex(32)}"))
    await db.commit()
    logger.info("stablecoin.ramp_in", user=str(uid), asset=body.asset, tokens=float(tokens))
    integ = get_platform_integration()
    ledger_result = integ.post_transfer(
        debit_user=str(uid), credit_system="stablecoin_reserve",
        amount=Decimal(str(body.ngn_amount)), ledger=Ledger.STABLECOIN,
        code=TransferCode.STABLECOIN_RAMP_IN, reference=f"ramp-in:{w.id}")
    await integ.emit("StablecoinRampIn", aggregate_id=str(w.id),
                     aggregate_type="stablecoin_wallet",
                     payload={"asset": body.asset, "tokens": float(tokens),
                              "ngn": body.ngn_amount, "rate": float(rate)},
                     user_id=str(uid))
    return {"wallet": _serialize_wallet(w, rate), "received": float(tokens),
            "rate": float(rate), "ledger": ledger_result}


@router.post("/stablecoins/ramp/out", status_code=201)
async def ramp_out(body: RampRequest,
                   user: Dict[str, Any] = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Sell stablecoins for NGN."""
    if body.asset not in SUPPORTED_ASSETS:
        raise HTTPException(status_code=422, detail=f"Supported: {SUPPORTED_ASSETS}")
    if not body.token_amount or body.token_amount <= 0:
        raise HTTPException(status_code=422, detail="token_amount required")
    uid = uuid.UUID(str(user["user_id"]))
    w = await _get_wallet(db, uid, body.asset)
    amount = Decimal(str(body.token_amount))
    if not w or Decimal(str(w.balance)) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    rate = _rate("sell")
    ngn = (amount * rate).quantize(Decimal("0.01"))
    w.balance = Decimal(str(w.balance)) - amount
    db.add(StablecoinTransfer(id=uuid.uuid4(), wallet_id=w.id, type="ramp_out",
                              asset=body.asset, amount=amount, ngn_amount=ngn,
                              rate=rate, tx_hash=f"0x{secrets.token_hex(32)}"))
    await db.commit()
    logger.info("stablecoin.ramp_out", user=str(uid), asset=body.asset, tokens=float(amount))
    integ = get_platform_integration()
    ledger_result = integ.post_transfer(
        debit_system="stablecoin_reserve", credit_user=str(uid),
        amount=ngn, ledger=Ledger.STABLECOIN, code=TransferCode.STABLECOIN_RAMP_OUT,
        reference=f"ramp-out:{w.id}")
    await integ.emit("StablecoinRampOut", aggregate_id=str(w.id),
                     aggregate_type="stablecoin_wallet",
                     payload={"asset": body.asset, "tokens": float(amount),
                              "ngn": float(ngn), "rate": float(rate)},
                     user_id=str(uid))
    return {"wallet": _serialize_wallet(w, rate), "ngn_credited": float(ngn),
            "rate": float(rate), "ledger": ledger_result}


@router.post("/stablecoins/send", status_code=201)
async def send(body: TransferRequest,
               user: Dict[str, Any] = Depends(get_current_user),
               db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if body.asset not in SUPPORTED_ASSETS:
        raise HTTPException(status_code=422, detail=f"Supported: {SUPPORTED_ASSETS}")
    uid = uuid.UUID(str(user["user_id"]))
    w = await _get_wallet(db, uid, body.asset)
    amount = Decimal(str(body.amount))
    if not w or Decimal(str(w.balance)) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    w.balance = Decimal(str(w.balance)) - amount
    tx_hash = f"0x{secrets.token_hex(32)}"
    db.add(StablecoinTransfer(id=uuid.uuid4(), wallet_id=w.id, type="send",
                              asset=body.asset, amount=amount,
                              counterparty=body.to_address, tx_hash=tx_hash))
    await db.commit()
    logger.info("stablecoin.send", user=str(uid), asset=body.asset, amount=float(amount))
    integ = get_platform_integration()
    await integ.emit("StablecoinSent", aggregate_id=str(w.id),
                     aggregate_type="stablecoin_wallet",
                     payload={"asset": body.asset, "amount": float(amount),
                              "to": body.to_address, "tx_hash": tx_hash},
                     user_id=str(uid))
    return {"sent": float(amount), "to": body.to_address, "tx_hash": tx_hash,
            "wallet": _serialize_wallet(w, _rate("buy"))}


@router.get("/stablecoins/history")
async def history(user: Dict[str, Any] = Depends(get_current_user),
                  db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(str(user["user_id"]))
    wallets = (await db.execute(select(StablecoinWallet).where(
        StablecoinWallet.user_id == uid))).scalars().all()
    ids = [w.id for w in wallets]
    if not ids:
        return {"transfers": []}
    transfers = (await db.execute(select(StablecoinTransfer)
                 .where(StablecoinTransfer.wallet_id.in_(ids))
                 .order_by(StablecoinTransfer.created_at.desc()).limit(100))).scalars().all()
    return {"transfers": [{
        "id": str(t.id), "type": t.type, "asset": t.asset, "amount": float(t.amount),
        "ngn_amount": float(t.ngn_amount) if t.ngn_amount else None,
        "rate": float(t.rate) if t.rate else None, "counterparty": t.counterparty,
        "status": t.status, "tx_hash": t.tx_hash,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    } for t in transfers]}
