"""Credit endpoints — score, assessment, authenticity.

Every lending surface (BNPL, loans, mortgages) must route its decision
through CreditDecisionService; these endpoints expose it to clients and
to internal services.
"""

from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from app.services.credit_decision_service import get_credit_decision_service
from database.connection import get_db
from database.models import User

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/credit", tags=["Credit"])


class AssessRequest(BaseModel):
    product: str = Field(default="loan", pattern="^(loan|bnpl|mortgage)$")
    requested_amount: Optional[float] = Field(default=None, gt=0, le=100_000_000)


async def _resolve_user(db: AsyncSession, claims: dict) -> User:
    import uuid as _uuid
    from sqlalchemy import select as _sel
    user = (await db.execute(_sel(User).where(
        User.id == _uuid.UUID(str(claims["user_id"]))))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.post("/assess")
async def assess_credit(body: AssessRequest, db: AsyncSession = Depends(get_db),
                        claims: dict = Depends(get_current_user)):
    """Run the full decision pipeline: context → authenticity → ML PD → policy → decision."""
    user = await _resolve_user(db, claims)
    return await get_credit_decision_service().assess(
        db, user, product=body.product, requested_amount=body.requested_amount)


@router.get("/score")
async def get_credit_score(db: AsyncSession = Depends(get_db),
                           claims: dict = Depends(get_current_user)):
    """User-facing credit score summary (same pipeline, no product attached)."""
    user = await _resolve_user(db, claims)
    result = await get_credit_decision_service().assess(db, user, product="loan")
    return {
        "credit_score": result["credit_score"],
        "grade": result["grade"],
        "max_limit": result["max_limit"],
        "data_completeness": result["data_completeness"],
        "verified_monthly_income": result["verified_monthly_income"],
        "model_version": result["model_version"],
        "tips": _score_tips(result),
    }


def _score_tips(result: dict) -> list:
    tips = []
    if result["data_completeness"] < 0.75:
        tips.append("Use your account for everyday transactions for 90 days to build history.")
    if not result.get("verified_monthly_income"):
        tips.append("Receive your salary into this account regularly to verify income.")
    if result["authenticity"]["grade"] not in ("authentic", "review"):
        tips.append("Avoid circular or self-funded transfers — they reduce your score.")
    return tips or ["Your credit profile is in good shape."]
