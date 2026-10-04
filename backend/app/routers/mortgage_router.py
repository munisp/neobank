"""Mortgages with payment plans.

Products are admin-managed. Users get an amortization quote (standard EMI
formula), apply, and — on admin approval — a full payment schedule is
generated. Installments can then be marked paid.
"""

import uuid
from datetime import datetime, timedelta, timezone
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
from database.models import MortgageApplication, MortgageProduct, MortgageScheduleEntry

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Mortgages"])

ADMIN_ROLES = {"admin", "manager"}

DEFAULT_PRODUCTS = [
    {"name": "NHF-Linked Home Loan", "annual_rate_pct": "6.00", "max_tenor_years": 30,
     "min_deposit_pct": "10", "max_amount": "50000000",
     "description": "National Housing Fund-linked mortgage for contributors."},
    {"name": "Standard Mortgage", "annual_rate_pct": "21.00", "max_tenor_years": 20,
     "min_deposit_pct": "20", "max_amount": "150000000",
     "description": "Market-rate mortgage for residential property."},
    {"name": "Diaspora Mortgage", "annual_rate_pct": "18.00", "max_tenor_years": 15,
     "min_deposit_pct": "30", "max_amount": "200000000",
     "description": "For Nigerians abroad buying property at home."},
]


class QuoteRequest(BaseModel):
    property_value: float
    deposit_pct: float = 20
    tenor_years: int = 20
    annual_rate_pct: float = 21.0


class ApplyRequest(BaseModel):
    product_id: str
    property_value: float
    deposit_pct: float
    tenor_years: int
    property_address: Optional[str] = None


class ProductUpsert(BaseModel):
    name: str
    description: Optional[str] = None
    annual_rate_pct: float
    max_tenor_years: int = 20
    min_deposit_pct: float = 20
    max_amount: Optional[float] = None
    is_active: bool = True


def amortize(principal: float, annual_rate_pct: float, months: int) -> Dict[str, Any]:
    """Standard EMI amortization. Returns payment + full schedule."""
    r = annual_rate_pct / 100 / 12
    if r == 0:
        emi = principal / months
    else:
        emi = principal * r / (1 - (1 + r) ** -months)
    schedule: List[Dict[str, Any]] = []
    balance = principal
    for i in range(1, months + 1):
        interest = balance * r
        principal_part = emi - interest
        balance = max(0.0, balance - principal_part)
        schedule.append({
            "sequence": i, "amount": round(emi, 2),
            "principal_part": round(principal_part, 2),
            "interest_part": round(interest, 2),
            "balance_after": round(balance, 2),
        })
    total = emi * months
    return {"monthly_payment": round(emi, 2), "total_repayable": round(total, 2),
            "total_interest": round(total - principal, 2), "schedule": schedule}


async def _seed_products(db: AsyncSession) -> None:
    for p in DEFAULT_PRODUCTS:
        db.add(MortgageProduct(id=uuid.uuid4(), annual_rate_pct=Decimal(p["annual_rate_pct"]),
                               min_deposit_pct=Decimal(p["min_deposit_pct"]),
                               max_amount=Decimal(p["max_amount"]) if p["max_amount"] else None,
                               name=p["name"], description=p["description"],
                               max_tenor_years=p["max_tenor_years"]))
    await db.commit()


@router.get("/mortgages/products")
async def list_products(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    products = (await db.execute(select(MortgageProduct).where(
        MortgageProduct.is_active.is_(True)))).scalars().all()
    if not products:
        await _seed_products(db)
        products = (await db.execute(select(MortgageProduct).where(
            MortgageProduct.is_active.is_(True)))).scalars().all()
    return {"products": [{
        "id": str(p.id), "name": p.name, "description": p.description,
        "annual_rate_pct": float(p.annual_rate_pct), "max_tenor_years": p.max_tenor_years,
        "min_deposit_pct": float(p.min_deposit_pct),
        "max_amount": float(p.max_amount) if p.max_amount else None,
    } for p in products]}


@router.post("/mortgages/quote")
async def quote(body: QuoteRequest) -> Dict[str, Any]:
    """Instant amortization quote — no auth needed so prospects can explore."""
    principal = body.property_value * (1 - body.deposit_pct / 100)
    months = body.tenor_years * 12
    result = amortize(principal, body.annual_rate_pct, months)
    return {
        "property_value": body.property_value,
        "deposit_amount": round(body.property_value * body.deposit_pct / 100, 2),
        "principal": round(principal, 2),
        "tenor_months": months,
        "annual_rate_pct": body.annual_rate_pct,
        **{k: v for k, v in result.items() if k != "schedule"},
        "schedule_preview": result["schedule"][:12],
    }


@router.post("/mortgages/apply", status_code=201)
async def apply(body: ApplyRequest,
                user: Dict[str, Any] = Depends(get_current_user),
                db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    try:
        from app.services.kyc_trigger_service import get_kyc_trigger_service
        from database.models import User as _User
        db_user = (await db.execute(select(_User).where(
            _User.id == uuid.UUID(str(user["user_id"]))))).scalar_one_or_none()
        if db_user is not None:
            gate = await get_kyc_trigger_service().check_gate(
                db, db_user, "mortgage_application", {"amount": body.property_value})
            if not gate["allowed"]:
                raise HTTPException(status_code=403, detail={
                    "error": "kyc_required", "required_level": gate.get("required_level"),
                    "triggers": gate.get("triggers"), "route": "/kyc/upgrade"})
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 — gate failure must not break applications
        pass
    product = (await db.execute(select(MortgageProduct).where(
        MortgageProduct.id == uuid.UUID(body.product_id),
        MortgageProduct.is_active.is_(True)))).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if body.deposit_pct < float(product.min_deposit_pct):
        raise HTTPException(status_code=422,
                            detail=f"Minimum deposit is {float(product.min_deposit_pct)}%")
    if body.tenor_years > product.max_tenor_years:
        raise HTTPException(status_code=422,
                            detail=f"Maximum tenor is {product.max_tenor_years} years")

    principal = body.property_value * (1 - body.deposit_pct / 100)
    if product.max_amount and principal > float(product.max_amount):
        raise HTTPException(status_code=422, detail="Principal exceeds product maximum")

    months = body.tenor_years * 12
    result = amortize(principal, float(product.annual_rate_pct), months)

    app_row = MortgageApplication(
        id=uuid.uuid4(), user_id=uuid.UUID(str(user["user_id"])), product_id=product.id,
        property_value=Decimal(str(body.property_value)),
        deposit_amount=Decimal(str(round(body.property_value * body.deposit_pct / 100, 2))),
        principal=Decimal(str(round(principal, 2))),
        annual_rate_pct=product.annual_rate_pct,
        tenor_months=months, monthly_payment=Decimal(str(result["monthly_payment"])),
        status="submitted", property_address=body.property_address,
    )
    db.add(app_row)
    await db.commit()
    logger.info("mortgage.applied", user=user["user_id"], principal=round(principal, 2))

    # Durable approval workflow (KYC/affordability/credit checks as activities)
    from app.infrastructure.middleware_adapters import get_temporal
    wf = await get_temporal().start_mortgage_approval(
        str(app_row.id), str(user["user_id"]))

    return {"application": _serialize_application(app_row), "workflow": wf, "quote": {
        "monthly_payment": result["monthly_payment"],
        "total_repayable": result["total_repayable"],
        "total_interest": result["total_interest"],
    }}


def _serialize_application(a: MortgageApplication) -> Dict[str, Any]:
    return {
        "id": str(a.id), "status": a.status,
        "property_value": float(a.property_value), "deposit_amount": float(a.deposit_amount),
        "principal": float(a.principal), "annual_rate_pct": float(a.annual_rate_pct),
        "tenor_months": a.tenor_months, "monthly_payment": float(a.monthly_payment),
        "property_address": a.property_address,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/mortgages/my")
async def my_applications(user: Dict[str, Any] = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    apps = (await db.execute(select(MortgageApplication).where(
        MortgageApplication.user_id == uuid.UUID(str(user["user_id"])))
        .order_by(MortgageApplication.created_at.desc()))).scalars().all()
    return {"applications": [_serialize_application(a) for a in apps]}


@router.get("/mortgages/{app_id}/schedule")
async def get_schedule(app_id: str,
                       user: Dict[str, Any] = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    app_row = (await db.execute(select(MortgageApplication).where(
        MortgageApplication.id == uuid.UUID(app_id)))).scalar_one_or_none()
    if not app_row or (str(app_row.user_id) != str(user["user_id"])
                       and not ADMIN_ROLES.intersection(user.get("roles") or [])):
        raise HTTPException(status_code=404, detail="Application not found")
    entries = (await db.execute(select(MortgageScheduleEntry).where(
        MortgageScheduleEntry.application_id == app_row.id)
        .order_by(MortgageScheduleEntry.sequence))).scalars().all()
    return {"application": _serialize_application(app_row), "schedule": [{
        "sequence": e.sequence, "due_date": e.due_date.isoformat() if e.due_date else None,
        "amount": float(e.amount), "principal_part": float(e.principal_part),
        "interest_part": float(e.interest_part), "balance_after": float(e.balance_after),
        "status": e.status,
    } for e in entries]}


@router.post("/admin/mortgages/{app_id}/approve")
async def approve_application(app_id: str,
                              user: Dict[str, Any] = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Approve → generate the full payment schedule, status becomes active."""
    if not ADMIN_ROLES.intersection(user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Admin or manager role required")
    app_row = (await db.execute(select(MortgageApplication).where(
        MortgageApplication.id == uuid.UUID(app_id)))).scalar_one_or_none()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    if app_row.status != "submitted":
        raise HTTPException(status_code=409, detail=f"Application is {app_row.status}")

    result = amortize(float(app_row.principal), float(app_row.annual_rate_pct),
                      app_row.tenor_months)
    now = datetime.now(timezone.utc)
    for item in result["schedule"]:
        due = now + timedelta(days=30 * item["sequence"])
        db.add(MortgageScheduleEntry(
            id=uuid.uuid4(), application_id=app_row.id, sequence=item["sequence"],
            due_date=due, amount=Decimal(str(item["amount"])),
            principal_part=Decimal(str(item["principal_part"])),
            interest_part=Decimal(str(item["interest_part"])),
            balance_after=Decimal(str(item["balance_after"])),
        ))
    app_row.status = "active"
    await db.commit()
    logger.info("mortgage.approved", app=str(app_row.id), by=user.get("email"))

    # Disbursement: mortgage pool → borrower, on the TigerBeetle ledger
    integ = get_platform_integration()
    ledger_result = integ.post_transfer(
        debit_system="mortgage_pool", credit_user=str(app_row.user_id),
        amount=Decimal(str(app_row.principal)), ledger=Ledger.MORTGAGE,
        code=TransferCode.MORTGAGE_DISBURSE, reference=f"mortgage-disburse:{app_row.id}")
    await integ.emit("MortgageActivated", aggregate_id=str(app_row.id),
                     aggregate_type="mortgage_application",
                     payload={"principal": float(app_row.principal),
                              "tenor_months": app_row.tenor_months,
                              "monthly_payment": float(app_row.monthly_payment)},
                     user_id=str(app_row.user_id))
    return {"application": _serialize_application(app_row),
            "schedule_entries": len(result["schedule"]), "ledger": ledger_result}


@router.post("/mortgages/{app_id}/pay/{sequence}")
async def pay_installment(app_id: str, sequence: int,
                          user: Dict[str, Any] = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    app_row = (await db.execute(select(MortgageApplication).where(
        MortgageApplication.id == uuid.UUID(app_id),
        MortgageApplication.user_id == uuid.UUID(str(user["user_id"]))))).scalar_one_or_none()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    entry = (await db.execute(select(MortgageScheduleEntry).where(
        MortgageScheduleEntry.application_id == app_row.id,
        MortgageScheduleEntry.sequence == sequence))).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Installment not found")
    if entry.status == "paid":
        return {"installment": sequence, "status": "paid", "already": True}
    entry.status = "paid"
    entry.paid_at = datetime.now(timezone.utc)

    # Complete the mortgage when the final installment is paid
    remaining = (await db.execute(select(MortgageScheduleEntry).where(
        MortgageScheduleEntry.application_id == app_row.id,
        MortgageScheduleEntry.status != "paid"))).scalars().all()
    if not remaining:
        app_row.status = "completed"
    await db.commit()

    # Repayment: borrower → mortgage pool (principal) + interest → revenue
    integ = get_platform_integration()
    ledger_result = integ.post_transfer(
        debit_user=str(user["user_id"]), credit_system="mortgage_pool",
        amount=Decimal(str(entry.amount)), ledger=Ledger.MORTGAGE,
        code=TransferCode.MORTGAGE_REPAY, reference=f"mortgage-repay:{app_id}:{sequence}")
    integ.post_transfer(
        debit_system="mortgage_pool", credit_system="fee_revenue",
        amount=Decimal(str(entry.interest_part)), ledger=Ledger.FEE,
        code=TransferCode.FEE_COLLECTION, reference=f"mortgage-interest:{app_id}:{sequence}")
    await integ.emit("MortgageInstallmentPaid", aggregate_id=str(app_row.id),
                     aggregate_type="mortgage_application",
                     payload={"sequence": sequence, "amount": float(entry.amount),
                              "application_status": app_row.status},
                     user_id=str(user["user_id"]))
    return {"installment": sequence, "status": "paid",
            "application_status": app_row.status, "ledger": ledger_result}
