"""
Dashboard router — aggregated SQL views over accounts and transactions.
"""
import uuid
from decimal import Decimal

import structlog
from fastapi import APIRouter, Depends, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from database.models import Account, Transaction
from app.middleware.auth import get_current_user_from_credentials

logger = structlog.get_logger()

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
async def dashboard_overview(
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(current_user["user_id"])

    # 15s Redis cache: dashboard polls are frequent, data freshness SLA is seconds
    from app.services.response_cache import cache_get, cache_set
    cached = await cache_get("dashboard:overview", str(user_id))
    if cached is not None:
        return cached

    accounts_result = await db.execute(
        select(
            func.count(Account.id),
            func.coalesce(func.sum(Account.balance), 0),
            func.coalesce(func.sum(Account.available_balance), 0),
        ).where(Account.user_id == user_id, Account.status == "active")
    )
    account_count, total_balance, total_available = accounts_result.one()

    month_txns = await db.execute(
        select(func.count(Transaction.id))
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Account.user_id == user_id,
            func.date_trunc("month", Transaction.created_at)
            == func.date_trunc("month", func.now()),
        )
    )
    monthly_count = month_txns.scalar() or 0

    pending = await db.execute(
        select(func.count(Transaction.id))
        .join(Account, Transaction.account_id == Account.id)
        .where(Account.user_id == user_id, Transaction.status == "pending")
    )

    payload = {
        "account_count": account_count,
        "total_balance": float(total_balance),
        "available_balance": float(total_available),
        "currency": "NGN",
        "transactions_this_month": monthly_count,
        "pending_transactions": pending.scalar() or 0,
    }
    await cache_set("dashboard:overview", payload, 15, str(user_id))
    return payload


@router.get("/recent-transactions")
async def recent_transactions(
    limit: int = 5,
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(Account.user_id == user_id)
        .order_by(desc(Transaction.created_at))
        .limit(min(limit, 20))
    )
    txns = result.scalars().all()
    return {
        "transactions": [
            {
                "id": str(t.id),
                "reference": t.reference,
                "type": t.transaction_type,
                "amount": float(t.amount),
                "currency": t.currency,
                "description": t.description,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in txns
        ]
    }


@router.get("/account-summary")
async def account_summary(
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(Account).where(Account.user_id == user_id)
    )
    accounts = result.scalars().all()

    summaries = []
    for account in accounts:
        txn_stats = await db.execute(
            select(
                func.count(Transaction.id),
                func.coalesce(func.sum(Transaction.amount), 0),
            ).where(
                Transaction.account_id == account.id,
                Transaction.status == "completed",
            )
        )
        txn_count, txn_volume = txn_stats.one()
        summaries.append({
            "account_id": str(account.id),
            "account_number": account.account_number,
            "account_type": account.account_type,
            "account_name": account.account_name,
            "balance": float(account.balance),
            "available_balance": float(account.available_balance),
            "currency": account.currency,
            "is_primary": account.is_primary,
            "transaction_count": txn_count,
            "transaction_volume": float(txn_volume),
        })

    return {"accounts": summaries, "total_accounts": len(summaries)}
