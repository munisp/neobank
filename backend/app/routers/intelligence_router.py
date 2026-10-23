"""Intelligence Router — user-facing learned behaviors.

Endpoints power one-tap repeat tiles, prefill defaults, recurring-payment
nudges, category suggestions, cash-flow forecasts, and suggestion feedback.
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.middleware.auth_middleware import get_current_user
from app.services.behavior_intelligence_service import behavior_intelligence_service as svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intelligence", tags=["intelligence"])


def _uid(user: dict) -> str:
    return str(user.get("id") or user.get("sub"))


class ActionEvent(BaseModel):
    action_type: str = Field(..., min_length=1, max_length=120)
    context: Optional[Dict[str, Any]] = None


class FeedbackPayload(BaseModel):
    accepted: bool


class CategoryLearnPayload(BaseModel):
    counterparty: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)


class RecurringScanPayload(BaseModel):
    transactions: List[Dict[str, Any]]


@router.post("/events")
async def record_action(payload: ActionEvent, user: dict = Depends(get_current_user)):
    return await svc.record_action(_uid(user), payload.action_type, payload.context)


@router.get("/next-actions")
async def next_actions(user: dict = Depends(get_current_user),
                       limit: int = Query(3, ge=1, le=10)):
    return {"suggestions": svc.next_actions(_uid(user), limit)}


@router.post("/recurring/scan")
async def scan_recurring(payload: RecurringScanPayload, user: dict = Depends(get_current_user)):
    return {"patterns": await svc.detect_recurring(_uid(user), payload.transactions)}


@router.get("/recurring")
async def list_recurring(user: dict = Depends(get_current_user)):
    return {"patterns": svc.list_recurring(_uid(user))}


@router.get("/recurring/due-soon")
async def due_soon(user: dict = Depends(get_current_user),
                   within_days: int = Query(3, ge=1, le=30)):
    return {"due": svc.due_soon(_uid(user), within_days)}


@router.post("/categories/learn")
async def learn_category(payload: CategoryLearnPayload, user: dict = Depends(get_current_user)):
    return await svc.learn_category(_uid(user), payload.counterparty, payload.category)


@router.get("/categories/suggest")
async def suggest_category(counterparty: str = Query(..., min_length=1),
                           user: dict = Depends(get_current_user)):
    return svc.suggest_category(_uid(user), counterparty)


@router.get("/forecast")
async def forecast(user: dict = Depends(get_current_user),
                   balance: float = Query(...),
                   days: int = Query(30, ge=1, le=365)):
    return svc.forecast_balance(_uid(user), balance, days)


@router.post("/suggestions/{suggestion_id}/feedback")
async def suggestion_feedback(suggestion_id: str, payload: FeedbackPayload,
                              user: dict = Depends(get_current_user)):
    return await svc.record_suggestion_feedback(_uid(user), suggestion_id, payload.accepted)


@router.get("/suggestions/stats")
async def suggestion_stats(user: dict = Depends(get_current_user)):
    return svc.suggestion_stats()
