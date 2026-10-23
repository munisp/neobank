"""Virtual account endpoints — create, list, freeze, close, resolve."""

from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from app.services.virtual_account_service import get_virtual_account_service
from database.connection import get_db
from database.models import User

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/virtual-accounts", tags=["Virtual Accounts"])


class CreateVirtualAccountRequest(BaseModel):
    account_name: str = Field(min_length=2, max_length=128)
    label: Optional[str] = Field(default=None, max_length=64)
    purpose: str = Field(default="collections",
                         pattern="^(collections|escrow|savings|gig)$")
    linked_account_id: Optional[str] = None
    escrow_id: Optional[str] = None


async def _resolve_user(db: AsyncSession, claims: dict) -> User:
    import uuid as _uuid
    from sqlalchemy import select as _sel
    user = (await db.execute(_sel(User).where(
        User.id == _uuid.UUID(str(claims["user_id"]))))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.post("")
async def create_virtual_account(body: CreateVirtualAccountRequest,
                                 db: AsyncSession = Depends(get_db),
                                 claims: dict = Depends(get_current_user)):
    """Create a virtual account number (tier2 KYC required)."""
    user = await _resolve_user(db, claims)
    try:
        return await get_virtual_account_service().create(
            db, user, body.account_name, body.label, body.purpose,
            body.linked_account_id, body.escrow_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("")
async def list_virtual_accounts(db: AsyncSession = Depends(get_db),
                                claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    return {"virtual_accounts": await get_virtual_account_service().list_mine(db, user)}


@router.post("/{va_id}/freeze")
async def freeze_virtual_account(va_id: str, db: AsyncSession = Depends(get_db),
                                 claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    try:
        return await get_virtual_account_service().freeze(db, user, va_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/{va_id}")
async def close_virtual_account(va_id: str, db: AsyncSession = Depends(get_db),
                                claims: dict = Depends(get_current_user)):
    """Soft-close — the number is retired and never reissued."""
    user = await _resolve_user(db, claims)
    try:
        return await get_virtual_account_service().close(db, user, va_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/resolve/{account_number}")
async def resolve_virtual_account(account_number: str,
                                  db: AsyncSession = Depends(get_db)):
    """Resolve a virtual number to its owner (used by inbound transfer routing)."""
    result = await get_virtual_account_service().resolve(db, account_number)
    if not result:
        raise HTTPException(status_code=404, detail="Virtual account not found or inactive")
    return result
