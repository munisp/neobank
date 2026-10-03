"""
Transactions router — direct PostgreSQL CRUD for the canonical
`transactions` table (owned by the Python API; transfers themselves are
executed via /transfers and the Go services).
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from database.models import Account, Transaction, TransactionStatus, utcnow
from app.middleware.auth import get_current_user_from_credentials

logger = structlog.get_logger()

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionResponse(BaseModel):
    id: str
    reference: str
    account_id: str
    transaction_type: str
    amount: float
    currency: str
    description: str
    status: str
    created_at: Optional[str] = None
    processed_at: Optional[str] = None


def _to_response(txn: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=str(txn.id),
        reference=txn.reference,
        account_id=str(txn.account_id),
        transaction_type=txn.transaction_type,
        amount=float(txn.amount),
        currency=txn.currency,
        description=txn.description,
        status=txn.status,
        created_at=txn.created_at.isoformat() if txn.created_at else None,
        processed_at=txn.processed_at.isoformat() if txn.processed_at else None,
    )


async def _user_account_ids(db: AsyncSession, user_id: str) -> list:
    result = await db.execute(
        select(Account.id).where(Account.user_id == uuid.UUID(user_id))
    )
    return [row[0] for row in result.all()]


@router.get("", response_model=dict)
@router.get("/", response_model=dict)
async def list_transactions(
    status_filter: Optional[str] = Query(None, alias="status"),
    type_filter: Optional[str] = Query(None, alias="type"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    """List transactions across all accounts owned by the caller."""
    account_ids = await _user_account_ids(db, current_user["user_id"])
    if not account_ids:
        return {"transactions": [], "total": 0}

    conditions = [Transaction.account_id.in_(account_ids)]
    if status_filter:
        conditions.append(Transaction.status == status_filter)
    if type_filter:
        conditions.append(Transaction.transaction_type == type_filter)

    result = await db.execute(
        select(Transaction)
        .where(and_(*conditions))
        .order_by(desc(Transaction.created_at))
        .offset(offset)
        .limit(limit)
    )
    txns = result.scalars().all()
    return {
        "transactions": [_to_response(t).dict() for t in txns],
        "total": len(txns),
        "limit": limit,
        "offset": offset,
    }


@router.get("/{transaction_id}", response_model=dict)
async def get_transaction(
    transaction_id: str,
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    """Get a single transaction, scoped to the caller's accounts."""
    account_ids = await _user_account_ids(db, current_user["user_id"])
    result = await db.execute(
        select(Transaction).where(Transaction.id == uuid.UUID(transaction_id))
    )
    txn = result.scalar_one_or_none()
    if not txn or txn.account_id not in account_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Transaction not found")
    return _to_response(txn).dict()
