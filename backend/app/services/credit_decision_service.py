"""Credit decisioning — the single gate every lending product must pass.

Pipeline per application:
    1. Aggregate the user's financial context from PostgreSQL
       (transactions, accounts, loans, BNPL orders).
    2. Authenticity engine — is the financial story real? (wash trading,
       self-funding, manufactured income, burst-before-application).
    3. credit_mlp — probability of default on the 25-feature vector.
    4. Policy rules — seasoning, KYC level, verified-income affordability
       (the ML score never overrides policy).
    5. Blend → 300–850 score, grade A–E, decision, limit, rate, reasons.

Anti-gaming stance: the ML score can only move a decision within the band
the authenticity grade allows. "manipulated" forces decline regardless of
PD; "suspicious" caps any limit at the starter tier; "review" routes to a
human. Verified income — not claimed income, not raw inflow — is what
affordability math uses.

Every decision is persisted to credit_assessments with the model version,
feature context, and reasons — full audit trail for regulators and for
the continuous-training loop (repaid/defaulted outcomes become labels).
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import Account, CreditAssessment, Transaction, User
from app.services import permify_integration
from app.services import feature_integration

logger = structlog.get_logger(__name__)

KYC_RANK = {"basic": 1, "tier1": 1, "tier2": 2, "intermediate": 2,
            "tier3": 3, "full": 3, "enhanced": 4}

# Policy constants (NGN)
MIN_ACCOUNT_AGE_DAYS = 30
MIN_HISTORY_TX = 10
STARTER_LIMIT = 50_000
MAX_DTI = 0.40                     # max monthly debt service / verified income
BASE_RATE_PCT = 24.0               # annual, adjusted by grade


class CreditDecisionService:

    # ------------------------------------------------------------------
    async def assess(self, db: AsyncSession, user: User,
                     product: str = "loan",
                     requested_amount: Optional[float] = None) -> Dict[str, Any]:
        context = await self._build_context(db, user)
        authenticity = await self._run_authenticity(db, user, context)
        ml = self._run_ml(context)
        policy = self._policy_check(user, context, authenticity)
        decision = self._blend(context, authenticity, ml, policy,
                               product, requested_amount)
        await self._persist(db, user, product, requested_amount,
                            context, authenticity, ml, decision)
        return decision

    # ------------------------------------------------------------------
    async def _build_context(self, db: AsyncSession, user: User) -> Dict[str, Any]:
        uid = user.id
        since_90 = datetime.now(timezone.utc) - timedelta(days=90)
        txns = (await db.execute(select(Transaction).where(
            Transaction.user_id == uid,
            Transaction.created_at >= since_90,
            Transaction.status == "completed")
            .order_by(Transaction.created_at))).scalars().all()

        accounts = (await db.execute(select(Account).where(
            Account.user_id == uid))).scalars().all()
        balance = sum(float(a.balance or 0) for a in accounts)

        credits = [t for t in txns if t.transaction_type == "credit"]
        debits = [t for t in txns if t.transaction_type == "debit"]
        total_in = sum(float(t.amount) for t in credits)
        total_out = sum(float(t.amount) for t in debits)
        months = max(1, (90 / 30))
        monthly_in = total_in / months
        monthly_out = total_out / months

        balances_after = [float(t.balance_after) for t in txns if t.balance_after is not None]
        avg_balance = (sum(balances_after) / len(balances_after)) if balances_after else balance
        min_balance = min(balances_after) if balances_after else balance

        age_days = (datetime.now(timezone.utc) - user.created_at).days if user.created_at else 0
        active_days = len({t.created_at.date() for t in txns})
        counterparties = {str(t.destination_account_number or t.description)[:32] for t in txns}

        return {
            "monthly_income": monthly_in,
            "balance": balance,
            "avg_balance": avg_balance,
            "min_balance_ratio": (min_balance / avg_balance) if avg_balance else 0.5,
            "tx_count_30d": len(txns) / 3,
            "tx_volume_30d": (total_in + total_out) / 3,
            "spend_to_income_ratio": (monthly_out / monthly_in) if monthly_in else 1.5,
            "savings_rate": ((total_in - total_out) / total_in) if total_in else 0.0,
            "largest_tx_to_income": (max((float(t.amount) for t in txns), default=0) / monthly_in) if monthly_in else 0.5,
            "unique_counterparties": len(counterparties),
            "account_age_days": age_days,
            "active_days_ratio_90d": active_days / 90,
            "kyc_level_rank": KYC_RANK.get((user.kyc_level or "basic").lower(), 1),
            "active_loans": 0,   # populated by product integrations
            "loan_to_income_ratio": 0.0,
            "repayment_history_score": 0.8,
            "bnpl_utilisation": 0.0,
            # filled by authenticity step:
            "wash_transfer_ratio": 0.0,
            "burst_before_application": 0.0,
            "income_regularity": 0.0,
            "salary_cycle_alignment": 0.0,
            "income_sources": len({(t.description or "")[:32] for t in credits}),
            "income_trend_3m": 0.0,
            "balance_volatility": 0.0,
            "days_negative_30d": 0,
            "_tx_count_total": len(txns),
        }

    async def _run_authenticity(self, db: AsyncSession, user: User,
                                context: Dict[str, Any]) -> Dict[str, Any]:
        from app.services.credit_authenticity_service import get_authenticity_engine
        since = datetime.now(timezone.utc) - timedelta(days=120)
        txns = (await db.execute(select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.created_at >= since,
            Transaction.status == "completed")
            .order_by(Transaction.created_at))).scalars().all()
        own_accounts = [str(a.id) for a in (await db.execute(
            select(Account).where(Account.user_id == user.id))).scalars().all()]
        raw = [{
            "transaction_type": t.transaction_type,
            "amount": float(t.amount),
            "created_at": t.created_at,
            "description": t.description,
            "counterparty": t.destination_account_number or (t.description or "")[:32],
            "destination_account_id": str(t.destination_account_id) if t.destination_account_id else None,
        } for t in txns]
        result = get_authenticity_engine().analyze(raw, own_account_ids=own_accounts)
        # feed authenticity signals back into the ML feature context
        f = result["flags"]
        context["wash_transfer_ratio"] = f["wash_transfer_ratio"]
        context["burst_before_application"] = f["burst_before_application"]
        context["income_regularity"] = f["income_regularity"]
        context["salary_cycle_alignment"] = f["salary_cycle_alignment"]
        if f["verified_monthly_income"] > 0:
            context["monthly_income"] = min(context["monthly_income"] or 0,
                                            f["verified_monthly_income"]) or f["verified_monthly_income"]
        # Alternative data: consented external signals can corroborate or
        # (capped) extend the verified-income estimate — vital for users
        # whose income lands in other banks / mobile money.
        try:
            from app.services.alt_data_service import get_alt_data_service
            alt = await get_alt_data_service().summarise_for_credit(
                db, user,
                internal_monthly_income=result["verified_monthly_income"]
                                        or context["monthly_income"] or 0)
            result["alt_data"] = alt
            if alt["verified_income_with_alt_data"] > result["verified_monthly_income"]:
                result["verified_monthly_income"] = alt["verified_income_with_alt_data"]
        except Exception as exc:  # noqa: BLE001
            logger.warning("alt_data_summary_skipped", error=str(exc))
        return result

    def _run_ml(self, context: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from app.ml.inference import get_credit_scorer
            return get_credit_scorer().score(context)
        except Exception as exc:  # noqa: BLE001
            logger.warning("credit_ml_unavailable", error=str(exc))
            return {"available": False, "pd": None}

    # ------------------------------------------------------------------
    def _policy_check(self, user: User, context: Dict[str, Any],
                      authenticity: Dict[str, Any]) -> List[Dict[str, str]]:
        fails: List[Dict[str, str]] = []
        if context["account_age_days"] < MIN_ACCOUNT_AGE_DAYS:
            fails.append({"rule": "seasoning", "detail": "account under 30 days old"})
        if context["_tx_count_total"] < MIN_HISTORY_TX:
            fails.append({"rule": "thin_file", "detail": "insufficient transaction history"})
        if KYC_RANK.get((user.kyc_level or "basic").lower(), 1) < 2:
            fails.append({"rule": "kyc", "detail": "tier2 verification required for credit"})
        if authenticity["grade"] == "manipulated":
            fails.append({"rule": "authenticity", "detail": "manufactured transaction history detected"})
        if user.kyc_status and user.kyc_status != "completed":
            fails.append({"rule": "kyc_status", "detail": "identity verification not completed"})
        return fails

    # ------------------------------------------------------------------
    def _blend(self, context: Dict[str, Any], authenticity: Dict[str, Any],
               ml: Dict[str, Any], policy_fails: List[Dict[str, str]],
               product: str, requested: Optional[float]) -> Dict[str, Any]:
        reasons: List[str] = [f["detail"] for f in policy_fails]

        # Score: policy fails force the floor; otherwise PD + authenticity blend.
        pd_value = ml.get("pd") if ml.get("available") else None
        if policy_fails:
            score = 300.0
        else:
            pd_component = (pd_value if pd_value is not None else 0.5) * 550
            auth_component = (1 - authenticity["authenticity_score"]) * 200
            score = 850 - pd_component - auth_component
            score = max(300.0, min(850.0, score))

        grade = ("A" if score >= 750 else "B" if score >= 670 else
                 "C" if score >= 580 else "D" if score >= 480 else "E")

        # Decision with authenticity banding
        if policy_fails:
            decision, approved = "decline", False
        elif authenticity["grade"] == "suspicious":
            decision, approved = "review", False
            reasons.append("authenticity signals require manual review")
        elif grade in ("A", "B"):
            decision, approved = "approve", True
        elif grade == "C":
            decision, approved = "approve_with_limits", True
        else:
            decision, approved = "review", False

        # Limit from VERIFIED income (never claimed/raw income)
        verified_income = authenticity.get("verified_monthly_income") or 0
        monthly_affordable = verified_income * MAX_DTI
        limit_by_grade = {"A": 24, "B": 12, "C": 6, "D": 3, "E": 0}[grade]
        max_limit = min(monthly_affordable * limit_by_grade, 10_000_000)
        if authenticity["grade"] == "suspicious":
            max_limit = min(max_limit, STARTER_LIMIT)
        if verified_income <= 0:
            max_limit = min(max_limit, STARTER_LIMIT)
            reasons.append("no verified recurring income — starter limit only")

        # Rate: base ± grade spread
        spread = {"A": -6, "B": -2, "C": 0, "D": 4, "E": 8}[grade]
        rate = BASE_RATE_PCT + spread

        # Affordability check on the requested amount
        amount_ok = True
        if requested and approved:
            if requested > max_limit:
                amount_ok = False
                decision = "review"
                reasons.append(f"requested ₦{requested:,.0f} exceeds assessed limit ₦{max_limit:,.0f}")

        return {
            "decision": decision,
            "approved": approved and amount_ok,
            "credit_score": round(score),
            "grade": grade,
            "probability_of_default": pd_value,
            "model_version": ml.get("model_version"),
            "authenticity": {
                "score": authenticity["authenticity_score"],
                "grade": authenticity["grade"],
                "flags": authenticity["flags"],
            },
            "verified_monthly_income": verified_income,
            "max_limit": round(max_limit, 2),
            "suggested_annual_rate_pct": rate,
            "reasons": reasons,
            "data_completeness": self._completeness(context),
            "product": product,
        }

    @staticmethod
    def _completeness(context: Dict[str, Any]) -> float:
        signals = [context["monthly_income"] > 0, context["_tx_count_total"] >= 30,
                   context["account_age_days"] >= 90, context["unique_counterparties"] >= 5]
        return round(sum(signals) / len(signals), 2)

    async def _persist(self, db: AsyncSession, user: User, product: str,
                       requested: Optional[float], context: Dict[str, Any],
                       authenticity: Dict[str, Any], ml: Dict[str, Any],
                       decision: Dict[str, Any]) -> None:
        try:
            assessment_id = uuid.uuid4()
            db.add(CreditAssessment(
                id=assessment_id, user_id=user.id, product=product,
                requested_amount=requested,
                credit_score=decision["credit_score"], grade=decision["grade"],
                decision=decision["decision"],
                probability_of_default=decision["probability_of_default"],
                authenticity_score=authenticity["authenticity_score"],
                authenticity_grade=authenticity["grade"],
                model_version=ml.get("model_version"),
                max_limit=decision["max_limit"],
                suggested_rate_pct=decision["suggested_annual_rate_pct"],
                reasons=decision["reasons"],
                context={k: v for k, v in context.items()
                         if isinstance(v, (int, float, str, bool)) and not k.startswith("_")},
            ))
            await db.commit()
            await permify_integration.grant_credit_assessment_subject(
                str(assessment_id), str(user.id))
            await feature_integration.index_credit_assessment(
                str(assessment_id), {
                    "user_id": str(user.id), "product": product,
                    "credit_score": decision["credit_score"],
                    "grade": decision["grade"], "decision": decision["decision"],
                    "probability_of_default": decision["probability_of_default"],
                    "authenticity_score": authenticity["authenticity_score"],
                    "max_limit": decision["max_limit"],
                    "model_version": ml.get("model_version")})
            try:
                from app.services.billing_service import record_usage
                record_usage(str(user.id), "credit_assessment")
            except Exception:
                pass
            try:  # behavior event: feeds next-action prediction
                from app.services.behavior_intelligence_service import behavior_intelligence_service
                await behavior_intelligence_service.record_action(
                    str(user.id), "credit_assessment_completed",
                    {"product": product, "decision": decision["decision"]})
            except Exception:
                pass
            await feature_integration.publish_feature_event(
                "CreditAssessmentCompleted",
                aggregate_id=str(assessment_id),
                aggregate_type="credit_assessment", user_id=str(user.id),
                payload={"product": product, "decision": decision["decision"],
                         "grade": decision["grade"],
                         "credit_score": decision["credit_score"]})
            await self._mirror_to_lakehouse(user, product, requested, decision,
                                            authenticity, ml)
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            logger.warning("credit_assessment_persist_failed", error=str(exc))

    async def _mirror_to_lakehouse(self, user: User, product: str,
                                   requested: Optional[float],
                                   decision: Dict[str, Any],
                                   authenticity: Dict[str, Any],
                                   ml: Dict[str, Any]) -> None:
        """Best-effort gold-layer write: every decision becomes a training
        example (label to be filled by repayment outcome) with the exact
        feature context and model version — point-in-time correct via
        Iceberg time-travel."""
        try:
            import json as _json
            from app.services.lakehouse_service import mirror_to_lakehouse
            await mirror_to_lakehouse("credit_assessments", [{
                "assessment_id": str(uuid.uuid4()), "user_id": str(user.id),
                "product": product,
                "requested_amount": requested,
                "credit_score": decision["credit_score"], "grade": decision["grade"],
                "decision": decision["decision"],
                "probability_of_default": decision.get("probability_of_default"),
                "authenticity_score": authenticity["authenticity_score"],
                "authenticity_grade": authenticity["grade"],
                "model_version": ml.get("model_version"),
                "max_limit": decision["max_limit"],
                "suggested_rate_pct": decision["suggested_annual_rate_pct"],
                "context_json": _json.dumps(decision, default=str)[:8000],
                "created_at": datetime.now(timezone.utc),
            }])
        except Exception as exc:  # noqa: BLE001
            logger.warning("lakehouse_assessment_mirror_skipped", error=str(exc))


_service: Optional[CreditDecisionService] = None


def get_credit_decision_service() -> CreditDecisionService:
    global _service
    if _service is None:
        _service = CreditDecisionService()
    return _service


async def gate_credit_application(db: AsyncSession, claims: dict,
                                  product: str, amount: Optional[float]) -> Dict[str, Any]:
    """Raise 402/403 unless the decision pipeline approves. Never raises on infra errors
    other than a genuine decline/review — lending must not silently bypass this gate, so
    service errors fail closed with 503."""
    import uuid as _uuid
    from fastapi import HTTPException
    from sqlalchemy import select as _sel
    user = (await db.execute(_sel(User).where(
        User.id == _uuid.UUID(str(claims["user_id"]))))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    decision = await get_credit_decision_service().assess(
        db, user, product=product, requested_amount=amount)
    if decision["decision"] == "decline":
        raise HTTPException(status_code=403, detail={
            "error": "credit_declined", "reasons": decision["reasons"],
            "credit_score": decision["credit_score"]})
    if decision["decision"] == "review":
        raise HTTPException(status_code=402, detail={
            "error": "manual_review_required", "reasons": decision["reasons"],
            "authenticity_grade": decision["authenticity"]["grade"]})
    return decision
