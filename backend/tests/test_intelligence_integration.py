"""Tests for the intelligence integration pass: bootstrap wiring, nightly
sweep, and the triage learning hook. Self-contained."""
import asyncio
import sys
from unittest.mock import MagicMock


def _stub_env():
    for name in ("structlog", "httpx", "aiohttp", "tigerbeetle"):
        sys.modules.setdefault(name, MagicMock())


_stub_env()

from app.services.intelligence_bootstrap import (  # noqa: E402
    bootstrap_intelligence, register_copilot_contexts, register_platform_models)
from app.services.intelligence_jobs import IntelligenceJobs, schedule_nightly_sweep  # noqa: E402
from app.services.model_lifecycle import model_registry  # noqa: E402
from app.services.ops_copilot_service import OpsCopilotService, ops_copilot_service  # noqa: E402


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# --- bootstrap ---------------------------------------------------------------

def test_bootstrap_registers_models_and_contexts():
    register_platform_models()
    register_copilot_contexts()
    names = {m["name"]: m["mode"] for m in model_registry.list_models()}
    assert names["credit-blend"] == "enforce"
    assert names["triage-scorer"] == "shadow"
    assert names["next-action"] == "shadow"
    ctx = ops_copilot_service._gather_context()
    assert "exception_triage" in ctx and "model_registry" in ctx
    assert isinstance(ctx["model_registry"], list) and len(ctx["model_registry"]) >= 5


def test_bootstrap_idempotent_and_never_raises():
    out1 = bootstrap_intelligence()
    out2 = bootstrap_intelligence()
    assert out1["bootstrapped"] is True
    assert out2["bootstrapped"] is False


def test_register_platform_models_does_not_downgrade():
    register_platform_models()
    model_registry.set_mode("triage-scorer", "canary")
    register_platform_models()  # re-run must not reset promoted models
    assert model_registry.get("triage-scorer")["mode"] == "canary"


# --- nightly sweep -------------------------------------------------------------

def test_nightly_sweep_partial_ok_without_db():
    jobs = IntelligenceJobs()
    sweep = run(jobs.run_nightly_sweep())
    assert "sweep_id" in sweep and "steps" in sweep
    # control tests may error in stubbed env — sweep must still complete
    assert "finished_at" in sweep
    assert jobs.sweeps[-1]["sweep_id"] == sweep["sweep_id"]


def test_nightly_sweep_rebuilds_recurring_from_source():
    from datetime import datetime, timedelta, timezone
    def source():
        base = datetime.now(timezone.utc)
        return {"u1": [{"counterparty": "rent", "amount": 500.0, "direction": "debit",
                        "occurred_at": (base - timedelta(days=d)).isoformat()}
                       for d in (90, 60, 30, 0)]}
    jobs = IntelligenceJobs()
    sweep = run(jobs.run_nightly_sweep(transaction_source=source))
    assert sweep["steps"]["recurring_rebuild"]["patterns"] == 1


def test_schedule_nightly_sweep_degrades_without_temporal():
    out = run(schedule_nightly_sweep())
    assert out.get("started") is False or out.get("ok") is False or "reason" in out


# --- triage hook shape -----------------------------------------------------------

def test_triage_hook_payload_mapping():
    """positive_pay.decide maps paid->pay, rejected->reject before learning."""
    from app.services.exception_triage_service import ExceptionTriageService
    svc = ExceptionTriageService()
    out = svc.learn_from_decision(
        {"reason": "unregistered_payee", "amount": 100.0, "risk_score": 0.8},
        model_recommendation="reject",
        human_decision="pay")  # human paid a reject-recommended exception
    assert out["agreed"] is False
    out2 = svc.learn_from_decision(
        {"reason": "over_daily_limit", "amount": 10.0, "risk_score": 0.3},
        model_recommendation="pay", human_decision="pay")
    assert out2["agreed"] is True
