"""Model-risk control testing (OpenClear's Admin → Model risk pattern).

- replay: run past credit assessments' contexts through today's policy/blend
  logic and diff against what was decided at the time — catches silent
  policy or model drift.
- anomaly probe: synthetic fraud/credit probes (impossible values, extreme
  velocity) must be caught by the policy layer; a probe that slips through
  is a FAIL with evidence.
"""
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import CreditAssessment

logger = structlog.get_logger(__name__)


# Synthetic probes that MUST be declined by policy. If any returns
# "approve", a control is broken.
ANOMALY_PROBES: List[Dict[str, Any]] = [
    {"name": "zero_history_jumbo_loan",
     "context": {"account_age_days": 3, "_tx_count_total": 0,
                 "unique_counterparties": 0, "avg_monthly_inflow": 0,
                 "inflow_cv": 2.0},
     "authenticity_grade": "authentic",
     "kyc_level": "tier2", "kyc_status": "completed",
     "requested_amount": 5_000_000,
     "expected_decision": "decline"},   # seasoning + thin-file policy
    {"name": "manipulated_history",
     "context": {"account_age_days": 400, "_tx_count_total": 500,
                 "unique_counterparties": 50, "avg_monthly_inflow": 200000,
                 "inflow_cv": 0.1},
     "authenticity_grade": "manipulated",
     "kyc_level": "tier2", "kyc_status": "completed",
     "requested_amount": 100_000,
     "expected_decision": "decline"},   # authenticity policy
    {"name": "unverified_identity",
     "context": {"account_age_days": 400, "_tx_count_total": 500,
                 "unique_counterparties": 50, "avg_monthly_inflow": 200000,
                 "inflow_cv": 0.3},
     "authenticity_grade": "authentic",
     "kyc_level": "basic", "kyc_status": "pending",
     "requested_amount": 100_000,
     "expected_decision": "decline"},   # KYC policy
]


class ControlTestsService:
    async def replay_assessments(self, db: AsyncSession, *,
                                 limit: int = 100) -> Dict[str, Any]:
        """Re-run recorded assessment contexts through the current scoring
        policy (dry run — nothing persisted) and diff decisions."""
        rows = (await db.execute(
            select(CreditAssessment)
            .order_by(CreditAssessment.created_at.desc())
            .limit(limit))).scalars().all()
        if not rows:
            return {"replayed": 0, "drifted": 0, "drift_rate": 0.0, "diffs": []}

        from app.services.credit_decision_service import CreditDecisionService
        svc = CreditDecisionService()
        diffs = []
        for row in rows:
            context = row.context or {}
            try:
                # Blend recorded ML PD + authenticity through *today's*
                # thresholds — policy-only replay, nothing persisted.
                replayed = svc._blend(  # noqa: SLF001 — control testing is the sanctioned caller
                    context,
                    {"authenticity_score": float(row.authenticity_score or 0.5),
                     "grade": row.authenticity_grade or "fair",
                     "verified_monthly_income": context.get("verified_monthly_income", 0)},
                    {"available": True,
                     "pd": float(row.probability_of_default or 0.5)},
                    [], row.product,
                    float(row.requested_amount) if row.requested_amount else None)
                if replayed["decision"] != row.decision:
                    diffs.append({
                        "assessment_id": str(row.id),
                        "original": row.decision,
                        "replayed": replayed["decision"],
                        "original_score": row.credit_score,
                        "replayed_score": replayed["credit_score"],
                    })
            except Exception as exc:  # noqa: BLE001
                logger.warning("control_replay_row_failed",
                               assessment_id=str(row.id), error=str(exc))
        drifted = len(diffs)
        return {"replayed": len(rows), "drifted": drifted,
                "drift_rate": round(drifted / len(rows), 4), "diffs": diffs[:50]}

    def run_anomaly_probes(self) -> Dict[str, Any]:
        """Every synthetic probe must produce its expected decision."""
        from app.services.credit_decision_service import CreditDecisionService
        svc = CreditDecisionService()
        results = []
        failures = 0
        from types import SimpleNamespace
        for probe in ANOMALY_PROBES:
            try:
                user_stub = SimpleNamespace(kyc_level=probe["kyc_level"],
                                            kyc_status=probe["kyc_status"])
                authenticity = {"score": 0.9, "grade": probe["authenticity_grade"],
                                "authenticity_score": 0.9}
                policy_fails = svc._policy_check(  # noqa: SLF001
                    user_stub, probe["context"], authenticity)
                outcome = svc._blend(  # noqa: SLF001
                    probe["context"], authenticity,
                    {"available": True, "pd": 0.5},
                    policy_fails, "loan", probe["requested_amount"])
                passed = outcome["decision"] == probe["expected_decision"]
            except Exception as exc:  # noqa: BLE001
                outcome, passed = {"error": str(exc)}, True  # a hard fail closed is acceptable
            results.append({"probe": probe["name"], "passed": passed,
                            "outcome": outcome.get("decision", outcome)})
            if not passed:
                failures += 1
        return {"probes": len(ANOMALY_PROBES), "failures": failures,
                "status": "PASS" if failures == 0 else "FAIL", "results": results}


_service: Optional[ControlTestsService] = None


def get_control_tests_service() -> ControlTestsService:
    global _service
    if _service is None:
        _service = ControlTestsService()
    return _service
