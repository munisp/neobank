"""Trust-fabric endpoints: billing, document intake, audit-chain
verification, and model-risk control tests."""

from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from app.services.billing_service import get_billing_service, record_usage
from app.services.control_tests_service import get_control_tests_service
from app.services.document_intake_service import get_document_intake_service
from app.services.audit_chain_service import get_audit_chain_service
from database.connection import get_db
from database.models import User

logger = structlog.get_logger(__name__)

billing_router = APIRouter(prefix="/billing", tags=["Billing"])
documents_router = APIRouter(prefix="/documents", tags=["Document Intake"])
controls_router = APIRouter(prefix="/controls", tags=["Controls"])


async def _resolve_user(db: AsyncSession, claims: dict) -> User:
    import uuid as _uuid
    from sqlalchemy import select as _sel
    user = (await db.execute(_sel(User).where(
        User.id == _uuid.UUID(str(claims["user_id"]))))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _require_admin(claims: dict) -> None:
    role = (claims.get("role") or "").lower()
    if role not in ("admin", "super_admin", "compliance_officer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="admin role required")


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

class UpsertFeeRequest(BaseModel):
    metric: str = Field(min_length=2, max_length=48)
    unit_price: float = Field(ge=0)
    schedule: str = "default"
    currency: str = "NGN"
    tiers: Optional[List[Dict[str, Any]]] = None
    monthly_minimum: Optional[float] = None


@billing_router.get("/schedule")
async def get_schedule(schedule: str = "default",
                       db: AsyncSession = Depends(get_db),
                       claims: dict = Depends(get_current_user)):
    return await get_billing_service().get_schedule(db, schedule)


@billing_router.post("/schedule")
async def upsert_fee(body: UpsertFeeRequest,
                     db: AsyncSession = Depends(get_db),
                     claims: dict = Depends(get_current_user)):
    _require_admin(claims)
    return await get_billing_service().upsert_fee(db, **body.model_dump())


@billing_router.get("/statements")
async def list_statements(db: AsyncSession = Depends(get_db),
                          claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    return await get_billing_service().list_statements(db, user)


@billing_router.get("/statements/current")
async def current_statement(period: Optional[str] = None,
                            db: AsyncSession = Depends(get_db),
                            claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    return await get_billing_service().calculate_period(db, user, period)


@billing_router.post("/statements/finalize")
async def finalize_statement(period: Optional[str] = None,
                             db: AsyncSession = Depends(get_db),
                             claims: dict = Depends(get_current_user)):
    user = await _resolve_user(db, claims)
    return await get_billing_service().finalize_period(db, user, period)


# ---------------------------------------------------------------------------
# Document intake (cheques)
# ---------------------------------------------------------------------------

@documents_router.post("/cheques/extract")
async def extract_cheque(provider: str = "llm",
                         file: UploadFile = File(...),
                         claims: dict = Depends(get_current_user)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="image too large (max 10MB)")
    try:
        return await get_document_intake_service().extract_cheque(
            data, provider=provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@documents_router.post("/cheques/extract-batch")
async def extract_cheque_batch(provider: str = "llm",
                               files: List[UploadFile] = File(...),
                               claims: dict = Depends(get_current_user)):
    if len(files) > 50:
        raise HTTPException(status_code=413, detail="batch too large (max 50)")
    images = [await f.read() for f in files]
    return await get_document_intake_service().extract_batch(
        images, provider=provider)


# ---------------------------------------------------------------------------
# Controls: audit-chain verification + model-risk testing (admin)
# ---------------------------------------------------------------------------

@controls_router.get("/audit/verify")
async def verify_audit_chain(domain: str = "platform",
                             db: AsyncSession = Depends(get_db),
                             claims: dict = Depends(get_current_user)):
    _require_admin(claims)
    return await get_audit_chain_service().verify_chain(db, domain)


@controls_router.post("/credit/replay")
async def replay_credit(limit: int = 100,
                        db: AsyncSession = Depends(get_db),
                        claims: dict = Depends(get_current_user)):
    _require_admin(claims)
    return await get_control_tests_service().replay_assessments(db, limit=limit)


@controls_router.post("/credit/anomaly-probes")
async def anomaly_probes(claims: dict = Depends(get_current_user)):
    _require_admin(claims)
    return get_control_tests_service().run_anomaly_probes()


@controls_router.get("/plugins")
async def list_plugins(claims: dict = Depends(get_current_user)):
    _require_admin(claims)
    from app.services.plugin_registry import get_plugin_registry
    reg = get_plugin_registry()
    return {"registered": reg.list_plugins(), "skipped": reg.skipped()}
