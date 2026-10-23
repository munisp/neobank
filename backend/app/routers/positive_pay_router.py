"""Positive pay endpoints — payee allowlist, transfer verification,
exception review queue with human decisions (ML feedback loop)."""

from decimal import Decimal
from typing import List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from app.services.positive_pay_service import get_positive_pay_service
from database.connection import get_db
from database.models import User

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/positive-pay", tags=["Positive Pay"])


class RegisterPayeeRequest(BaseModel):
    payee_account: str = Field(min_length=4, max_length=32)
    payee_name: str = Field(min_length=2, max_length=128)
    bank_code: Optional[str] = None
    max_single_amount: Optional[float] = None
    daily_limit: Optional[float] = None
    category: Optional[str] = None


class VerifyTransferRequest(BaseModel):
    payee_account: str
    amount: Decimal = Field(gt=0)
    transfer_reference: str = Field(min_length=6, max_length=64)
    payee_name: Optional[str] = None
    currency: str = "NGN"


class DecideRequest(BaseModel):
    decision: str = Field(pattern="^(paid|rejected)$")
    note: Optional[str] = Field(default=None, max_length=512)


async def _resolve_user(db: AsyncSession, claims: dict) -> User:
    import uuid as _uuid
    from sqlalchemy import select as _sel
    user = (await db.execute(_sel(User).where(
        User.id == _uuid.UUID(str(claims["user_id"]))))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.post("/payees")
async def register_payee(body: RegisterPayeeRequest,
                         db: AsyncSession = Depends(get_db),
                         claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    return await get_positive_pay_service().register_payee(
        db, user, **body.model_dump())


@router.get("/payees")
async def list_payees(db: AsyncSession = Depends(get_db),
                      claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    return await get_positive_pay_service().list_payees(db, user)


@router.delete("/payees/{payee_id}")
async def suspend_payee(payee_id: str, db: AsyncSession = Depends(get_db),
                        claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    try:
        return await get_positive_pay_service().suspend_payee(db, user, payee_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/verify")
async def verify_transfer(body: VerifyTransferRequest,
                          db: AsyncSession = Depends(get_db),
                          claims: dict = Depends(get_current_user)):
    """Called by the transfer flow before executing an outbound payment."""
    user = await _resolve_user(db, claims)
    return await get_positive_pay_service().verify_transfer(
        db, user, payee_account=body.payee_account, amount=body.amount,
        transfer_reference=body.transfer_reference,
        payee_name=body.payee_name, currency=body.currency)


@router.get("/exceptions")
async def list_exceptions(status: Optional[str] = None,
                          db: AsyncSession = Depends(get_db),
                          claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    return await get_positive_pay_service().list_exceptions(db, user, status)


@router.post("/exceptions/{exception_id}/decide")
async def decide_exception(exception_id: str, body: DecideRequest,
                           db: AsyncSession = Depends(get_db),
                           claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    try:
        return await get_positive_pay_service().decide(
            db, user, exception_id, body.decision, body.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
