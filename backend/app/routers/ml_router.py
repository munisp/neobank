"""ML model management + scoring endpoints.

/ml/fraud/score      — ML-backed fraud scoring (ensemble, CPU, <10ms)
/ml/models           — registry listing with metrics
/ml/models/promote   — promote challenger to champion
/ml/drift/{model}    — PSI drift report vs training baseline
/ml/ab/assign        — A/B cohort assignment for an account
/ml/retrain          — trigger a continuous-training cycle (admin)
"""

from typing import Any, Dict, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from database.connection import get_db

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


class FraudScoreRequest(BaseModel):
    amount: float
    transaction_type: str = "transfer"
    channel: str = "mobile"
    account_balance: float = 0.0
    account_age_days: float = 365.0
    kyc_level: int = 1
    hour: Optional[int] = None
    weekday: Optional[int] = None
    tx_count_1h: float = 0.0
    tx_count_24h: float = 0.0
    amount_sum_24h: float = 0.0
    unique_dest_24h: float = 0.0
    is_new_destination: bool = False
    is_new_device: bool = False
    dest_age_days: float = 365.0
    dest_is_internal: bool = False


class PromoteRequest(BaseModel):
    model: str
    version: str


@router.post("/fraud/score")
async def ml_fraud_score(payload: FraudScoreRequest,
                         current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    from datetime import datetime
    from app.ml.inference import get_fraud_scorer
    from app.ml.monitoring import get_drift_monitor

    ctx = payload.model_dump()
    now = datetime.utcnow()
    ctx.setdefault("hour", now.hour)
    ctx.setdefault("weekday", now.weekday())

    result = get_fraud_scorer().score(ctx)
    if result.get("score") is not None:
        await get_drift_monitor().record_score("fraud_mlp", result["score"])
    return result


@router.get("/models")
async def list_models(current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    from app.ml.inference import ModelRegistry
    return {"models": ModelRegistry().load()}


@router.post("/models/promote")
async def promote_model(payload: PromoteRequest,
                        current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    if "admin" not in current_user.get("roles", []):
        raise HTTPException(status_code=403, detail="Admin required")
    from app.ml.inference import ModelRegistry
    ok = ModelRegistry().promote(payload.model, payload.version)
    if not ok:
        raise HTTPException(status_code=404, detail="Model not found in registry")
    return {"promoted": True, "model": payload.model, "version": payload.version}


@router.get("/drift/{model}")
async def drift_report(model: str,
                       current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    import numpy as np
    from app.ml.inference import ModelRegistry
    from app.ml.monitoring import get_drift_monitor
    from app.ml.synthetic_data import generate_corpus

    # Baseline: regenerate the training distribution (same seed) for reference
    corpus = generate_corpus(n_samples=2000, seed=42)
    from app.ml.inference import get_fraud_scorer
    scorer = get_fraud_scorer()
    baseline = []
    for c in corpus.contexts[:500]:
        r = scorer.score(c)
        if r.get("score") is not None:
            baseline.append(r["score"])
    if not baseline:
        return {"available": False, "detail": "no champion model to baseline"}
    return await get_drift_monitor().drift_report(model, np.array(baseline))


@router.get("/ab/assign")
async def ab_assign(account_id: str,
                    current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    from app.ml.inference import ModelRegistry
    from app.ml.monitoring import ABRouter
    return ABRouter().assignment_payload(account_id, ModelRegistry().load())


@router.post("/retrain")
async def trigger_retrain(current_user: dict = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if "admin" not in current_user.get("roles", []):
        raise HTTPException(status_code=403, detail="Admin required")
    from app.ml.continuous_training import run_continuous_training
    return await run_continuous_training(db)
