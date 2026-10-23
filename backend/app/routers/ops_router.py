"""Ops Intelligence Router — staff productivity endpoints.

Copilot queries, risk-ranked exception triage, auto-reconciliation runs,
and the model lifecycle registry. Admin/compliance roles only.
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth_middleware import get_current_user
from app.services.exception_triage_service import exception_triage_service as triage
from app.services.model_lifecycle import model_registry
from app.services.ops_copilot_service import ops_copilot_service as copilot
from app.services.reconciliation_service import reconciliation_service as recon

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ops", tags=["ops-intelligence"])

_ADMIN_ROLES = {"admin", "super_admin", "compliance_officer", "operations"}


def _require_staff(user: dict) -> None:
    role = (user.get("role") or "").lower()
    if role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="staff role required")


class CopilotQuery(BaseModel):
    question: str = Field(..., min_length=3, max_length=4000)
    context_names: Optional[List[str]] = None


class RankPayload(BaseModel):
    items: List[Dict[str, Any]]


class LearnDecisionPayload(BaseModel):
    exception: Dict[str, Any]
    model_recommendation: str
    human_decision: str


class ReconcilePayload(BaseModel):
    source_records: List[Dict[str, Any]]
    target_records: List[Dict[str, Any]]
    key_field: str = "trace_number"
    amount_field: Optional[str] = None
    amount_tolerance: float = 0.01


class ModelRegisterPayload(BaseModel):
    name: str = Field(..., min_length=1)
    version: str = Field(..., min_length=1)
    mode: str = "shadow"


class ModelModePayload(BaseModel):
    mode: str


@router.post("/copilot/query")
async def copilot_query(payload: CopilotQuery, user: dict = Depends(get_current_user)):
    _require_staff(user)
    return await copilot.ask(str(user.get("id") or user.get("sub")),
                             payload.question, payload.context_names)


@router.get("/copilot/history")
async def copilot_history(user: dict = Depends(get_current_user)):
    _require_staff(user)
    return {"history": copilot.history()}


@router.post("/triage/rank")
async def triage_rank(payload: RankPayload, user: dict = Depends(get_current_user)):
    _require_staff(user)
    ranked = triage.rank_queue(payload.items)
    return {**triage.split_auto_vs_review(ranked), "ranked": ranked}


@router.post("/triage/learn")
async def triage_learn(payload: LearnDecisionPayload, user: dict = Depends(get_current_user)):
    _require_staff(user)
    return triage.learn_from_decision(payload.exception, payload.model_recommendation,
                                      payload.human_decision)


@router.get("/triage/stats")
async def triage_stats(user: dict = Depends(get_current_user)):
    _require_staff(user)
    return triage.stats()


@router.post("/reconciliation/run")
async def reconciliation_run(payload: ReconcilePayload, user: dict = Depends(get_current_user)):
    _require_staff(user)
    amount_fn = None
    if payload.amount_field:
        amount_fn = lambda r: float(r.get(payload.amount_field) or 0)  # noqa: E731
    result = recon.reconcile(payload.source_records, payload.target_records,
                             key_fn=lambda r: r.get(payload.key_field),
                             amount_fn=amount_fn,
                             amount_tolerance=payload.amount_tolerance)
    run = await recon._record_run("adhoc", result)
    return {**result, "run_id": run["run_id"]}


@router.get("/reconciliation/runs")
async def reconciliation_runs(user: dict = Depends(get_current_user)):
    _require_staff(user)
    return {"runs": recon.runs[-50:]}


@router.get("/models")
async def list_models(user: dict = Depends(get_current_user)):
    _require_staff(user)
    return {"models": model_registry.list_models()}


@router.post("/models")
async def register_model(payload: ModelRegisterPayload, user: dict = Depends(get_current_user)):
    _require_staff(user)
    try:
        return model_registry.register(payload.name, payload.version, payload.mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/models/{name}/mode")
async def set_model_mode(name: str, payload: ModelModePayload,
                         user: dict = Depends(get_current_user)):
    _require_staff(user)
    try:
        return model_registry.set_mode(name, payload.mode)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/models/{name}/promotion")
async def model_promotion(name: str, user: dict = Depends(get_current_user)):
    _require_staff(user)
    try:
        return model_registry.can_promote(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
