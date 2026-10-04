"""Innovation layer — ten differentiators, each a working endpoint.

1. Round-Up Savings     — spare change swept to savings on every debit
2. Subscription Radar   — detect recurring debits, flag forgotten subs
3. Salary Sorter        — auto-split inbound salary into save/spend/bills
4. Money Copilot        — rule-based insights feed over real transaction data
5. Safe-to-Spend        — balance minus upcoming commitments (surfaced here)
6. Group Goals          — shared savings targets (via segments store tile)
7. Settlement Netting   — /settlement router (ops innovation)
8. Segment App Store    — /app-store (distribution innovation)
9. Developer Ecosystem  — /developers (platform innovation)
10. Stablecoin Ramp     — /stablecoins (cross-border innovation)

This router implements 1–5; the rest live in their own routers and are
surfaced as segment store tiles.
"""

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from database.connection import get_db
from database.models import Account, Transaction

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Innovations"])

# Simple per-user settings store (in-memory + JSONB upgrade path)
_ROUNDUP_ENABLED: Dict[str, Dict[str, Any]] = {}
_SALARY_RULES: Dict[str, Dict[str, Any]] = {}


class RoundUpSettings(BaseModel):
    enabled: bool
    multiplier: int = 1          # 1 = nearest ₦100, 2 = double round-ups
    round_to: int = 100          # round to nearest ₦100


class SalarySplit(BaseModel):
    save_pct: int = 20
    bills_pct: int = 30
    # remainder lands in spending


def _uid(user: Dict[str, Any]) -> str:
    return str(user["user_id"])


# --------------------------------------------------------------------------
# 1. Round-Up Savings
# --------------------------------------------------------------------------

@router.post("/innovations/round-ups/settings")
async def set_roundups(body: RoundUpSettings,
                       user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    _ROUNDUP_ENABLED[_uid(user)] = body.model_dump()
    logger.info("roundups.settings", user=_uid(user), enabled=body.enabled)
    return {"settings": body.model_dump()}


@router.get("/innovations/round-ups/preview")
async def roundup_preview(user: Dict[str, Any] = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """What would have been swept this month from recent debits."""
    settings = _ROUNDUP_ENABLED.get(_uid(user), {"enabled": False, "multiplier": 1, "round_to": 100})
    uid = uuid.UUID(_uid(user))
    since = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
    txns = (await db.execute(select(Transaction).where(
        Transaction.user_id == uid,
        Transaction.transaction_type == "debit",
        Transaction.created_at >= since).limit(200))).scalars().all()

    round_to = settings.get("round_to", 100)
    total = 0.0
    examples = []
    for t in txns[:50]:
        amt = float(t.amount)
        sweep = (round_to - (amt % round_to)) % round_to
        if sweep:
            total += sweep * settings.get("multiplier", 1)
            if len(examples) < 5:
                examples.append({"description": t.description, "amount": amt,
                                 "sweep": round(sweep * settings.get("multiplier", 1), 2)})
    return {"enabled": settings.get("enabled", False),
            "month_to_date_sweep": round(total, 2), "transactions_scanned": len(txns),
            "examples": examples, "settings": settings}


# --------------------------------------------------------------------------
# 2. Subscription Radar
# --------------------------------------------------------------------------

@router.get("/innovations/subscriptions")
async def subscription_radar(user: Dict[str, Any] = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Group debits by normalized description; 3+ similar amounts in 90 days
    = likely subscription."""
    uid = uuid.UUID(_uid(user))
    since = datetime.now(timezone.utc) - timedelta(days=90)
    txns = (await db.execute(select(Transaction).where(
        Transaction.user_id == uid,
        Transaction.transaction_type == "debit",
        Transaction.created_at >= since).limit(1000))).scalars().all()

    groups: Dict[str, List[float]] = defaultdict(list)
    for t in txns:
        key = " ".join((t.description or "").lower().split()[:3])
        if key:
            groups[key].append(float(t.amount))

    subs = []
    for key, amounts in groups.items():
        if len(amounts) >= 3:
            avg = sum(amounts) / len(amounts)
            spread = max(amounts) - min(amounts)
            if spread <= avg * 0.1:  # amounts within 10% = recurring
                subs.append({"merchant": key.title(), "occurrences": len(amounts),
                             "avg_amount": round(avg, 2),
                             "monthly_cost": round(avg * len(amounts) / 3, 2)})
    subs.sort(key=lambda s: s["monthly_cost"], reverse=True)
    return {"subscriptions": subs,
            "total_monthly_cost": round(sum(s["monthly_cost"] for s in subs), 2)}


# --------------------------------------------------------------------------
# 3. Salary Sorter
# --------------------------------------------------------------------------

@router.post("/innovations/salary-sorter/rules")
async def set_salary_rules(body: SalarySplit,
                           user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if body.save_pct + body.bills_pct >= 100:
        raise HTTPException(status_code=422, detail="save% + bills% must be < 100")
    _SALARY_RULES[_uid(user)] = body.model_dump()
    return {"rules": body.model_dump(),
            "spend_pct": 100 - body.save_pct - body.bills_pct}


@router.get("/innovations/salary-sorter/preview")
async def salary_preview(user: Dict[str, Any] = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Apply the split to the most recent large credit."""
    uid = uuid.UUID(_uid(user))
    rules = _SALARY_RULES.get(_uid(user), {"save_pct": 20, "bills_pct": 30})
    last_salary = (await db.execute(select(Transaction).where(
        Transaction.user_id == uid,
        Transaction.transaction_type == "credit",
        Transaction.amount >= 50000)
        .order_by(Transaction.created_at.desc()).limit(1))).scalars().first()
    if not last_salary:
        return {"rules": rules, "detected_salary": None,
                "message": "No salary-sized credit detected yet"}
    amt = float(last_salary.amount)
    return {
        "rules": rules,
        "detected_salary": {"amount": amt, "date": last_salary.created_at.isoformat(),
                            "description": last_salary.description},
        "split": {
            "save": round(amt * rules["save_pct"] / 100, 2),
            "bills": round(amt * rules["bills_pct"] / 100, 2),
            "spend": round(amt * (100 - rules["save_pct"] - rules["bills_pct"]) / 100, 2),
        },
    }


# --------------------------------------------------------------------------
# 4. Money Copilot (rule-based insights over real data)
# --------------------------------------------------------------------------

@router.get("/innovations/copilot")
async def money_copilot(user: Dict[str, Any] = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(_uid(user))
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)

    txns = (await db.execute(select(Transaction).where(
        Transaction.user_id == uid,
        Transaction.created_at >= last_month_start).limit(2000))).scalars().all()

    this_m = sum(float(t.amount) for t in txns
                 if t.transaction_type == "debit" and t.created_at >= month_start)
    last_m = sum(float(t.amount) for t in txns
                 if t.transaction_type == "debit" and t.created_at < month_start)
    income = sum(float(t.amount) for t in txns
                 if t.transaction_type == "credit" and t.created_at >= month_start)

    insights: List[Dict[str, Any]] = []
    if last_m > 0:
        delta = (this_m - last_m) / last_m * 100
        insights.append({
            "type": "spending_trend",
            "title": f"Spending is {'up' if delta > 0 else 'down'} {abs(delta):.0f}% vs last month",
            "body": (f"You've spent ₦{this_m:,.0f} so far this month vs "
                     f"₦{last_m:,.0f} last month."),
            "severity": "warning" if delta > 20 else "info",
        })
    if income > 0 and this_m / income > 0.9:
        insights.append({
            "type": "burn_rate", "severity": "warning",
            "title": "You're spending almost everything you earn",
            "body": (f"₦{this_m:,.0f} of ₦{income:,.0f} income is already spent. "
                     "Try the Salary Sorter to save first, automatically."),
        })
    if income > this_m > 0:
        insights.append({
            "type": "savings_window", "severity": "success",
            "title": f"You could save ₦{income - this_m:,.0f} this month",
            "body": "Income is ahead of spending — sweep the surplus to savings now.",
        })
    if not insights:
        insights.append({"type": "empty", "severity": "info",
                         "title": "Not enough data yet",
                         "body": "Make a few transactions and I'll start finding insights."})
    return {"insights": insights, "generated_at": now.isoformat()}


# --------------------------------------------------------------------------
# 5. Safe-to-Spend (server-side, shared with PWA insights screen)
# --------------------------------------------------------------------------

@router.get("/innovations/safe-to-spend")
async def safe_to_spend(user: Dict[str, Any] = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(_uid(user))
    accounts = (await db.execute(select(Account).where(
        Account.user_id == uid))).scalars().all()
    total_balance = sum(float(a.balance or 0) for a in accounts)

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    spent = (await db.execute(select(Transaction).where(
        Transaction.user_id == uid, Transaction.transaction_type == "debit",
        Transaction.created_at >= month_start).limit(1000))).scalars().all()
    spent_total = sum(float(t.amount) for t in spent)

    days_in_month = 30
    day = now.day
    daily_pace = spent_total / day if day else 0
    projected = daily_pace * days_in_month
    safe = max(0.0, total_balance - (projected - spent_total))

    return {
        "total_balance": round(total_balance, 2),
        "spent_this_month": round(spent_total, 2),
        "projected_month_spend": round(projected, 2),
        "safe_to_spend": round(safe, 2),
        "formula": "balance − (projected spend − spend so far)",
        "days_elapsed": day,
    }
