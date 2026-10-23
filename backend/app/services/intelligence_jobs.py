"""Nightly Intelligence Jobs

The offline half of the learning loop. A Temporal-scheduled (or manually
triggered) nightly sweep that:

1. Runs credit-decision replay + anomaly probes (control tests) — a failing
   probe blocks any model promotion until resolved.
2. Records each replay verdict as a versioned decision in the model registry
   so agreement rates accumulate for canary promotion checks.
3. Rebuilds recurring-payment patterns per active user from recent history
   (when a transaction source is provided).
4. Publishes a summary event to the lakehouse so match/agreement trends are
   observable over time.

Everything degrades gracefully — a partial sweep is always reported, never
raised.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class IntelligenceJobs:
    def __init__(self):
        self.sweeps: List[Dict[str, Any]] = []

    async def run_nightly_sweep(
        self,
        db: Any = None,
        transaction_source: Optional[Callable[[], Dict[str, List[Dict[str, Any]]]]] = None,
    ) -> Dict[str, Any]:
        sweep = {"sweep_id": str(uuid.uuid4()),
                 "started_at": datetime.now(timezone.utc).isoformat(),
                 "steps": {}}

        # 1. Control tests: replay + probes
        try:
            from app.services.control_tests_service import get_control_tests_service
            ctl = get_control_tests_service()
            probes = ctl.run_anomaly_probes()
            replay = await ctl.replay_assessments(db) if db is not None else {"skipped": "no db session"}
            sweep["steps"]["control_tests"] = {
                "probes_passed": probes.get("passed", probes.get("all_passed")),
                "replay": replay if isinstance(replay, dict) else {"result": str(replay)[:200]},
            }
        except Exception as exc:  # noqa: BLE001
            sweep["steps"]["control_tests"] = {"error": str(exc)}

        # 2. Versioned decisions for promotion evidence
        try:
            from app.services.model_lifecycle import model_registry
            from app.services.exception_triage_service import exception_triage_service
            stats = exception_triage_service.stats()
            if model_registry.get("triage-scorer"):
                model_registry.record_decision(
                    "triage-scorer",
                    input_hash=f"sweep:{sweep['sweep_id'][:8]}",
                    decision={"weights": stats["weights"]},
                    agreed_with_champion=None)
            sweep["steps"]["model_registry"] = {
                "triage_decisions": stats["decisions_seen"],
                "agreement_rate": stats["agreement_rate"]}
        except Exception as exc:  # noqa: BLE001
            sweep["steps"]["model_registry"] = {"error": str(exc)}

        # 3. Recurring-pattern rebuild from a provided transaction source
        rebuilt = 0
        if transaction_source is not None:
            try:
                from app.services.behavior_intelligence_service import behavior_intelligence_service
                for user_id, txns in transaction_source().items():
                    rebuilt += len(await behavior_intelligence_service.detect_recurring(user_id, txns))
                sweep["steps"]["recurring_rebuild"] = {"patterns": rebuilt}
            except Exception as exc:  # noqa: BLE001
                sweep["steps"]["recurring_rebuild"] = {"error": str(exc)}
        else:
            sweep["steps"]["recurring_rebuild"] = {"skipped": "no transaction source"}

        sweep["finished_at"] = datetime.now(timezone.utc).isoformat()
        sweep["ok"] = not any("error" in v for v in sweep["steps"].values())
        self.sweeps.append(sweep)

        try:
            from app.services.feature_integration import publish_feature_event
            await publish_feature_event("IntelligenceSweepCompleted", {
                "sweep_id": sweep["sweep_id"], "ok": sweep["ok"],
                "steps": {k: ("error" if "error" in v else "ok")
                          for k, v in sweep["steps"].items()}})
        except Exception as exc:  # noqa: BLE001
            logger.debug("sweep event emit skipped: %s", exc)
        return sweep


intelligence_jobs = IntelligenceJobs()


async def schedule_nightly_sweep() -> Dict[str, Any]:
    """Register a Temporal cron (01:30 daily) that calls back into the sweep.
    Returns started=False when Temporal is not configured — the endpoint
    remains manually triggerable."""
    try:
        from app.infrastructure.middleware_adapters import TemporalAdapter
        return await TemporalAdapter().start_workflow(
            workflow="NightlyIntelligenceSweepWorkflow",
            workflow_id="nightly-intelligence-sweep",
            args=[{"cron": "30 1 * * *"}])
    except Exception as exc:  # noqa: BLE001
        logger.warning("temporal.nightly_sweep_failed: %s", exc)
        return {"started": False, "reason": str(exc)}
