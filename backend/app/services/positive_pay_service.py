"""Positive pay for transfers: declared payees vs. actual debits.

Adapted from OpenClear's positive-pay model to instant transfers:
users pre-register payees (with per-payment and daily limits). An outbound
transfer is verified against the allowlist:

  - registered payee, within limits  → verified (pass-through)
  - anything else                    → PaymentException in a review queue

A reviewer (or the account holder) decides pay/reject. Every decision is
labeled training data: decide() appends the outcome to the audit chain and
emits an event the fraud/credit pipelines can consume — the ML feedback
loop (OpenClear trains per-network models on human pay/return decisions).
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import PaymentException, RegisteredPayee, User
from app.services import feature_integration
from app.services.audit_chain_service import get_audit_chain_service

logger = structlog.get_logger(__name__)

# Simple risk heuristic → recommendation. A trained model can replace this
# by writing risk_score/recommendation on the exception before review.
def _recommend(reason: str, amount: Decimal) -> tuple:
    score = {"unregistered_payee": 0.7, "over_single_limit": 0.5,
             "over_daily_limit": 0.55, "dormant_payee": 0.4}.get(reason, 0.5)
    if amount > Decimal("500000"):
        score = min(1.0, score + 0.2)
    recommendation = "reject" if score >= 0.8 else ("review" if score >= 0.5 else "pay")
    return round(score, 4), recommendation


class PositivePayService:
    async def register_payee(self, db: AsyncSession, user: User, *,
                             payee_account: str, payee_name: str,
                             bank_code: Optional[str] = None,
                             max_single_amount: Optional[float] = None,
                             daily_limit: Optional[float] = None,
                             category: Optional[str] = None) -> Dict[str, Any]:
        payee = RegisteredPayee(
            id=uuid.uuid4(), user_id=user.id, payee_account=payee_account,
            payee_name=payee_name[:128], bank_code=bank_code,
            max_single_amount=max_single_amount, daily_limit=daily_limit,
            category=category)
        db.add(payee)
        await db.commit()
        await get_audit_chain_service().record(
            db, action="positive_pay.payee_registered", domain="positive_pay",
            actor_id=str(user.id), aggregate_id=str(payee.id),
            payload={"payee_account": payee_account})
        await db.commit()
        await feature_integration.publish_feature_event(
            "PayeeRegistered", aggregate_id=str(payee.id),
            aggregate_type="positive_pay", user_id=str(user.id),
            payload={"payee_account": payee_account})
        return self._serialize_payee(payee)

    async def list_payees(self, db: AsyncSession, user: User) -> List[Dict[str, Any]]:
        rows = (await db.execute(select(RegisteredPayee).where(
            RegisteredPayee.user_id == user.id,
            RegisteredPayee.status == "active"))).scalars().all()
        return [self._serialize_payee(r) for r in rows]

    async def suspend_payee(self, db: AsyncSession, user: User,
                            payee_id: str) -> Dict[str, Any]:
        payee = (await db.execute(select(RegisteredPayee).where(
            RegisteredPayee.id == uuid.UUID(payee_id),
            RegisteredPayee.user_id == user.id))).scalar_one_or_none()
        if not payee:
            raise ValueError("payee not found")
        payee.status = "suspended"
        await db.commit()
        await get_audit_chain_service().record(
            db, action="positive_pay.payee_suspended", domain="positive_pay",
            actor_id=str(user.id), aggregate_id=payee_id)
        await db.commit()
        return {"id": payee_id, "status": "suspended"}

    async def verify_transfer(self, db: AsyncSession, user: User, *,
                              payee_account: str, amount: Decimal,
                              transfer_reference: str,
                              payee_name: Optional[str] = None,
                              currency: str = "NGN") -> Dict[str, Any]:
        """Verify an outbound transfer against the allowlist. Returns
        {'verified': True} or creates an exception and returns it."""
        payee = (await db.execute(select(RegisteredPayee).where(
            RegisteredPayee.user_id == user.id,
            RegisteredPayee.payee_account == payee_account,
            RegisteredPayee.status == "active"))).scalar_one_or_none()

        reason = None
        if payee is None:
            reason = "unregistered_payee"
        elif payee.max_single_amount is not None and amount > payee.max_single_amount:
            reason = "over_single_limit"
        elif payee.daily_limit is not None:
            since = datetime.now(timezone.utc) - timedelta(days=1)
            spent = (await db.execute(select(func.coalesce(func.sum(PaymentException.amount), 0)).where(
                PaymentException.user_id == user.id,
                PaymentException.payee_account == payee_account,
                PaymentException.status == "paid",
                PaymentException.decided_at >= since))).scalar() or 0
            if Decimal(str(spent)) + amount > payee.daily_limit:
                reason = "over_daily_limit"

        if reason is None:
            await get_audit_chain_service().record(
                db, action="positive_pay.transfer_verified", domain="positive_pay",
                actor_id=str(user.id), aggregate_id=transfer_reference,
                payload={"payee_account": payee_account, "amount": str(amount)})
            await db.commit()
            return {"verified": True, "transfer_reference": transfer_reference,
                    "payee": self._serialize_payee(payee)}

        score, recommendation = _recommend(reason, amount)
        exc = PaymentException(
            id=uuid.uuid4(), user_id=user.id, transfer_reference=transfer_reference,
            payee_account=payee_account, payee_name=payee_name
            or (payee.payee_name if payee else None),
            amount=amount, currency=currency, reason=reason,
            risk_score=score, recommendation=recommendation)
        db.add(exc)
        await db.commit()
        await get_audit_chain_service().record(
            db, action="positive_pay.exception_raised", domain="positive_pay",
            actor_id=str(user.id), aggregate_id=str(exc.id),
            payload={"reason": reason, "amount": str(amount),
                     "risk_score": score})
        await db.commit()
        await feature_integration.publish_feature_event(
            "PaymentExceptionRaised", aggregate_id=str(exc.id),
            aggregate_type="positive_pay", user_id=str(user.id),
            payload={"reason": reason, "amount": str(amount),
                     "recommendation": recommendation})
        logger.info("payment_exception_raised", user_id=str(user.id),
                    reason=reason, amount=str(amount))
        return {"verified": False, "exception": self._serialize_exception(exc)}

    async def list_exceptions(self, db: AsyncSession, user: User,
                              status: Optional[str] = None) -> List[Dict[str, Any]]:
        q = select(PaymentException).where(PaymentException.user_id == user.id)
        if status:
            q = q.where(PaymentException.status == status)
        rows = (await db.execute(q.order_by(
            PaymentException.created_at.desc()))).scalars().all()
        return [self._serialize_exception(r) for r in rows]

    async def decide(self, db: AsyncSession, user: User, exception_id: str,
                     decision: str, note: Optional[str] = None) -> Dict[str, Any]:
        """Human pay/reject decision — the labeled-data feedback loop."""
        if decision not in ("paid", "rejected"):
            raise ValueError("decision must be 'paid' or 'rejected'")
        exc = (await db.execute(select(PaymentException).where(
            PaymentException.id == uuid.UUID(exception_id),
            PaymentException.user_id == user.id))).scalar_one_or_none()
        if not exc:
            raise ValueError("exception not found")
        if exc.status != "open":
            raise ValueError(f"exception already decided ({exc.status})")

        # SoD-style guard: large payments need a different decider than the
        # initiator in enforce mode — hook point documented; per-user wallets
        # are single-actor so self-decision is allowed for retail users.
        exc.status = decision
        exc.decided_by = str(user.id)
        exc.decided_at = datetime.now(timezone.utc)
        exc.decision_note = (note or "")[:512] or None
        await db.commit()

        await get_audit_chain_service().record(
            db, action=f"positive_pay.exception_{decision}", domain="positive_pay",
            actor_id=str(user.id), aggregate_id=exception_id,
            payload={"reason": exc.reason, "amount": str(exc.amount),
                     "model_recommendation": exc.recommendation,
                     "human_decision": decision})
        await db.commit()
        # Labeled outcome → fraud/credit feedback loop
        await feature_integration.publish_feature_event(
            "PaymentExceptionDecided", aggregate_id=exception_id,
            aggregate_type="positive_pay", user_id=str(user.id),
            payload={"decision": decision, "reason": exc.reason,
                     "risk_score": float(exc.risk_score or 0),
                     "agreed_with_model": exc.recommendation == (
                         "pay" if decision == "paid" else "reject")})
        # Feed the labeled decision into the triage learner so the exception
        # queue's risk ranking improves with every human call.
        try:
            from app.services.exception_triage_service import exception_triage_service
            exception_triage_service.learn_from_decision(
                {"reason": exc.reason, "amount": float(exc.amount or 0),
                 "risk_score": float(exc.risk_score or 0)},
                model_recommendation=exc.recommendation or "review",
                human_decision="pay" if decision == "paid" else "reject")
        except Exception as learn_exc:  # noqa: BLE001
            logger.warning("triage.learn_failed", error=str(learn_exc))
        return self._serialize_exception(exc)

    @staticmethod
    def _serialize_payee(p: RegisteredPayee) -> Dict[str, Any]:
        return {"id": str(p.id), "payee_account": p.payee_account,
                "payee_name": p.payee_name, "bank_code": p.bank_code,
                "max_single_amount": str(p.max_single_amount) if p.max_single_amount is not None else None,
                "daily_limit": str(p.daily_limit) if p.daily_limit is not None else None,
                "category": p.category, "status": p.status}

    @staticmethod
    def _serialize_exception(e: PaymentException) -> Dict[str, Any]:
        return {"id": str(e.id), "transfer_reference": e.transfer_reference,
                "payee_account": e.payee_account, "payee_name": e.payee_name,
                "amount": str(e.amount), "currency": e.currency,
                "reason": e.reason, "risk_score": float(e.risk_score) if e.risk_score is not None else None,
                "recommendation": e.recommendation, "status": e.status,
                "decided_by": e.decided_by,
                "decided_at": e.decided_at.isoformat() if e.decided_at else None,
                "created_at": e.created_at.isoformat() if e.created_at else None}


_service: Optional[PositivePayService] = None


def get_positive_pay_service() -> PositivePayService:
    global _service
    if _service is None:
        _service = PositivePayService()
    return _service
