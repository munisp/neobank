"""Alternative data endpoints — consent-gated ingestion for credit evidence.

Every ingestion route requires an active, revocable NDPR consent for its
source. Withdrawal deletes the signals (right to erasure).
"""

from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from app.services.alt_data_service import VALID_SOURCES, get_alt_data_service
from database.connection import get_db
from database.models import User

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/alt-data", tags=["Alternative Data"])


class ConsentRequest(BaseModel):
    source: str = Field(pattern="^(sms|statement|aggregator|telco|utility|self_declared)$")


class SmsBatchRequest(BaseModel):
    messages: List[Dict[str, str]] = Field(max_length=500)


class StatementUploadRequest(BaseModel):
    csv_text: str = Field(max_length=5_000_000)


class AggregatorWebhookRequest(BaseModel):
    user_id: str
    payload: Dict[str, Any]


class RecurringHistoryRequest(BaseModel):
    source: str = Field(pattern="^(telco|utility)$")
    events: List[Dict[str, Any]] = Field(max_length=1000)


async def _resolve_user(db: AsyncSession, claims: dict) -> User:
    import uuid as _uuid
    from sqlalchemy import select as _sel
    user = (await db.execute(_sel(User).where(
        User.id == _uuid.UUID(str(claims["user_id"]))))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("/sources")
async def list_sources():
    """Supported sources and their trust tiers."""
    return {"sources": sorted(VALID_SOURCES)}


@router.post("/consent")
async def grant_consent(body: ConsentRequest, db: AsyncSession = Depends(get_db),
                        claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    try:
        return await get_alt_data_service().grant_consent(db, user, body.source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/consent/{source}")
async def withdraw_consent(source: str, db: AsyncSession = Depends(get_db),
                           claims: dict = Depends(get_current_user)):
    """Revoke consent and delete all signals from that source (NDPR erasure)."""
    user = await _resolve_user(db, claims)
    return await get_alt_data_service().withdraw_consent(db, user, source)


@router.post("/sms-alerts")
async def ingest_sms(body: SmsBatchRequest, db: AsyncSession = Depends(get_db),
                     claims: dict = Depends(get_current_user)):
    """User-forwarded bank/mobile-money alert SMS (Nigerian formats)."""
    user = await _resolve_user(db, claims)
    try:
        return await get_alt_data_service().ingest_sms_batch(db, user, body.messages)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.post("/statements")
async def ingest_statement(body: StatementUploadRequest,
                           db: AsyncSession = Depends(get_db),
                           claims: dict = Depends(get_current_user)):
    """Bank or mobile-money statement upload (CSV)."""
    user = await _resolve_user(db, claims)
    try:
        return await get_alt_data_service().ingest_statement_csv(db, user, body.csv_text)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.post("/recurring-history")
async def ingest_recurring(body: RecurringHistoryRequest,
                           db: AsyncSession = Depends(get_db),
                           claims: dict = Depends(get_current_user)):
    """Telco airtime/data or utility bill payment history."""
    user = await _resolve_user(db, claims)
    try:
        return await get_alt_data_service().ingest_recurring_history(
            db, user, body.source, body.events)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/aggregator/webhook")
async def aggregator_webhook(body: AggregatorWebhookRequest,
                             db: AsyncSession = Depends(get_db)):
    """Open-banking aggregator webhook (Mono/Okra-style). Authenticated via
    aggregator signing in production; the payload must reference a user with
    active 'aggregator' consent."""
    import uuid as _uuid
    from sqlalchemy import select as _sel
    user = (await db.execute(_sel(User).where(
        User.id == _uuid.UUID(body.user_id)))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return await get_alt_data_service().ingest_aggregator_payload(
            db, user, body.payload)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.get("/summary")
async def alt_data_summary(db: AsyncSession = Depends(get_db),
                           claims: dict = Depends(get_current_user)):
    """What the user's consented alternative data currently tells the credit engine."""
    user = await _resolve_user(db, claims)
    return await get_alt_data_service().summarise_for_credit(db, user)
