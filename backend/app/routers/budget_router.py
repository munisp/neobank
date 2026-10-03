"""Budgeting endpoints — persisted budgets, settings, and savings tips.

Serves the PWA Budget + SpendingInsights screens. Spending actuals are
computed live from the transactions table (categorized debits this month).
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from database.connection import get_db
from database.models import Account, Budget, BudgetSettings, Transaction

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Budgeting"])


class BudgetUpsert(BaseModel):
    category: str
    limit_amount: float
    alert_threshold: int = 80
    period: str = "monthly"


class BudgetSettingsUpdate(BaseModel):
    monthly_income: Optional[float] = None
    currency: Optional[str] = None
    alerts_enabled: Optional[bool] = None
    rollover_enabled: Optional[bool] = None


def _serialize_budget(b: Budget, spent: float = 0.0) -> Dict[str, Any]:
    return {
        "id": str(b.id), "category": b.category,
        "limit": float(b.limit_amount), "spent": spent,
        "alertThreshold": b.alert_threshold, "period": b.period,
        "is_active": b.is_active,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


async def _spent_by_category(db: AsyncSession, user_id: uuid.UUID) -> Dict[str, float]:
    """Current-month debit totals per description-category keyword."""
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0,
                                                     second=0, microsecond=0)
    rows = (await db.execute(
        select(Transaction.transaction_type, Transaction.description,
               func.sum(Transaction.amount))
        .join(Account, Transaction.account_id == Account.id)
        .where(Account.user_id == user_id,
               Transaction.created_at >= month_start,
               Transaction.status == "completed")
        .group_by(Transaction.transaction_type, Transaction.description)
    )).all()
    # Coarse category mapping from transaction types/descriptions
    cat_map = {
        "bill_payment": "Bills & Utilities", "airtime": "Airtime & Data",
        "transfer": "Transfers", "withdrawal": "Cash Withdrawal",
        "card": "Card Spending", "qr_payment": "QR Payments",
    }
    spent: Dict[str, float] = {}
    for tx_type, desc, total in rows:
        cat = cat_map.get(tx_type, "Other")
        spent[cat] = spent.get(cat, 0.0) + float(total or 0)
    return spent


@router.get("/budgets")
async def list_budgets(current_user: dict = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(current_user["user_id"])
    budgets = (await db.execute(
        select(Budget).where(Budget.user_id == uid, Budget.is_active.is_(True))
        .order_by(Budget.category))).scalars().all()
    spent = await _spent_by_category(db, uid)
    return {"budgets": [_serialize_budget(b, spent.get(b.category, 0.0)) for b in budgets]}


@router.post("/budgets", status_code=201)
async def create_budget(payload: BudgetUpsert,
                        current_user: dict = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(current_user["user_id"])
    existing = (await db.execute(
        select(Budget).where(Budget.user_id == uid, Budget.category == payload.category,
                             Budget.period == payload.period))).scalar_one_or_none()
    if existing:
        existing.limit_amount = Decimal(str(payload.limit_amount))
        existing.alert_threshold = payload.alert_threshold
        existing.is_active = True
        await db.commit()
        return {"success": True, "budget": _serialize_budget(existing)}
    b = Budget(user_id=uid, category=payload.category[:64],
               limit_amount=Decimal(str(payload.limit_amount)),
               alert_threshold=payload.alert_threshold, period=payload.period)
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return {"success": True, "budget": _serialize_budget(b)}


@router.put("/budgets/{budget_id}")
async def update_budget(budget_id: uuid.UUID, payload: BudgetUpsert,
                        current_user: dict = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    b = (await db.execute(select(Budget).where(
        Budget.id == budget_id, Budget.user_id == uuid.UUID(current_user["user_id"])))
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    b.category = payload.category[:64]
    b.limit_amount = Decimal(str(payload.limit_amount))
    b.alert_threshold = payload.alert_threshold
    b.period = payload.period
    await db.commit()
    return {"success": True, "budget": _serialize_budget(b)}


@router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: uuid.UUID,
                        current_user: dict = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    b = (await db.execute(select(Budget).where(
        Budget.id == budget_id, Budget.user_id == uuid.UUID(current_user["user_id"])))
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    b.is_active = False  # soft delete — keeps history
    await db.commit()
    return {"success": True}


# Singular aliases used by the PWA budget screens
@router.get("/budget")
async def list_budgets_alias(current_user: dict = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    return await list_budgets(current_user, db)


@router.get("/budget/{budget_id}")
async def get_budget(budget_id: uuid.UUID,
                     current_user: dict = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(current_user["user_id"])
    b = (await db.execute(select(Budget).where(
        Budget.id == budget_id, Budget.user_id == uid))).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    spent = await _spent_by_category(db, uid)
    return {"budget": _serialize_budget(b, spent.get(b.category, 0.0))}


@router.get("/budget-settings")
async def get_budget_settings(current_user: dict = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)):
    s = (await db.execute(select(BudgetSettings).where(
        BudgetSettings.user_id == uuid.UUID(current_user["user_id"])))).scalar_one_or_none()
    if not s:
        return {"monthly_income": None, "currency": "NGN",
                "alerts_enabled": True, "rollover_enabled": False}
    return {"monthly_income": float(s.monthly_income) if s.monthly_income else None,
            "currency": s.currency, "alerts_enabled": s.alerts_enabled,
            "rollover_enabled": s.rollover_enabled}


@router.post("/budget-settings")
async def update_budget_settings(payload: BudgetSettingsUpdate,
                                 current_user: dict = Depends(get_current_user),
                                 db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(current_user["user_id"])
    s = (await db.execute(select(BudgetSettings).where(
        BudgetSettings.user_id == uid))).scalar_one_or_none()
    if not s:
        s = BudgetSettings(user_id=uid)
        db.add(s)
    if payload.monthly_income is not None:
        s.monthly_income = Decimal(str(payload.monthly_income))
    if payload.currency:
        s.currency = payload.currency[:3].upper()
    if payload.alerts_enabled is not None:
        s.alerts_enabled = payload.alerts_enabled
    if payload.rollover_enabled is not None:
        s.rollover_enabled = payload.rollover_enabled
    await db.commit()
    return {"success": True}


@router.get("/savings-tips")
async def savings_tips(current_user: dict = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    """Rule-based tips derived from actual spending vs budgets (no data loss,
    computed live from transactions — never fabricated)."""
    uid = uuid.UUID(current_user["user_id"])
    spent = await _spent_by_category(db, uid)
    budgets = (await db.execute(select(Budget).where(
        Budget.user_id == uid, Budget.is_active.is_(True)))).scalars().all()

    tips: List[Dict[str, Any]] = []
    budget_by_cat = {b.category: b for b in budgets}
    for cat, amount in sorted(spent.items(), key=lambda kv: -kv[1]):
        b = budget_by_cat.get(cat)
        if b and amount > float(b.limit_amount) * (b.alert_threshold / 100):
            tips.append({
                "category": cat,
                "tip": f"You've used {amount / float(b.limit_amount) * 100:.0f}% of your {cat} budget this month.",
                "potential_saving": round(amount - float(b.limit_amount), 2),
                "severity": "high" if amount > float(b.limit_amount) else "medium",
            })
    if not spent:
        tips.append({"category": "general",
                     "tip": "Make your first transaction to unlock personalised savings insights.",
                     "potential_saving": 0, "severity": "info"})
    return {"tips": tips}
