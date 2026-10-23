"""Tests for the intelligence layer: behavior learning, triage, copilot,
reconciliation, and model lifecycle. Self-contained (stubs heavy deps)."""
import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock


def _stub_env():
    for name in ("structlog", "httpx", "aiohttp", "tigerbeetle"):
        sys.modules.setdefault(name, MagicMock())


_stub_env()

from app.services.behavior_intelligence_service import BehaviorIntelligenceService  # noqa: E402
from app.services.exception_triage_service import ExceptionTriageService  # noqa: E402
from app.services.model_lifecycle import ModelRegistry  # noqa: E402
from app.services.ops_copilot_service import OpsCopilotService  # noqa: E402
from app.services.reconciliation_service import ReconciliationService  # noqa: E402


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def _tx(counterparty, amount, days_ago, direction="debit"):
    return {"counterparty": counterparty, "amount": amount,
            "direction": direction,
            "occurred_at": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()}


# --- next-action prediction --------------------------------------------------

def test_next_actions_learns_transitions():
    svc = BehaviorIntelligenceService()
    for _ in range(3):
        run(svc.record_action("u1", "salary_credit"))
        run(svc.record_action("u1", "pay_rent"))
    run(svc.record_action("u1", "salary_credit"))
    suggestions = svc.next_actions("u1")
    assert suggestions[0]["action_type"] == "pay_rent"
    assert suggestions[0]["score"] > 0.5


def test_next_actions_empty_for_new_user():
    svc = BehaviorIntelligenceService()
    assert svc.next_actions("ghost") == []


def test_suggestion_feedback_acceptance_rate():
    svc = BehaviorIntelligenceService()
    svc.mark_suggestion_shown("s1")
    run(svc.record_suggestion_feedback("u1", "s1", True))
    run(svc.record_suggestion_feedback("u2", "s1", True))
    run(svc.record_suggestion_feedback("u3", "s1", False))
    stats = svc.suggestion_stats("s1")
    assert stats["shown"] == 1 and stats["accepted"] == 2 and stats["dismissed"] == 1
    assert stats["acceptance_rate"] == round(2 / 3, 4)


# --- recurring detection ------------------------------------------------------

def _monthly_rent():
    return [_tx("landlord", 500.0, 90), _tx("landlord", 500.0, 60),
            _tx("landlord", 500.0, 30), _tx("landlord", 500.0, 0)]


def test_detect_recurring_monthly():
    svc = BehaviorIntelligenceService()
    patterns = run(svc.detect_recurring("u1", _monthly_rent()))
    assert len(patterns) == 1
    p = patterns[0]
    assert p["cadence"] == "monthly" and p["average_amount"] == 500.0
    assert p["occurrences"] == 4


def test_detect_recurring_rejects_irregular():
    svc = BehaviorIntelligenceService()
    txns = [_tx("shop", 100.0, 50), _tx("shop", 250.0, 21), _tx("shop", 40.0, 3)]
    assert run(svc.detect_recurring("u1", txns)) == []


def test_due_soon_window():
    svc = BehaviorIntelligenceService()
    run(svc.detect_recurring("u1", _monthly_rent()))
    due = svc.due_soon("u1", within_days=31)
    assert len(due) == 1 and due[0]["counterparty"] == "landlord"
    assert svc.due_soon("u1", within_days=1) == [] or due[0]["days_until"] <= 1


# --- categories -----------------------------------------------------------------

def test_category_user_overrides_global():
    svc = BehaviorIntelligenceService()
    run(svc.learn_category("u1", "NEPA", "utilities"))
    run(svc.learn_category("u2", "NEPA", "bills"))
    run(svc.learn_category("u3", "NEPA", "bills"))
    assert svc.suggest_category("u1", "nepa")["category"] == "utilities"      # user memory wins
    g = svc.suggest_category("u9", "nepa")
    assert g["category"] == "bills" and g["source"] == "global_majority"
    assert svc.suggest_category("u9", "unknown")["category"] is None


# --- forecast ---------------------------------------------------------------------

def test_forecast_balance_projects_recurring():
    svc = BehaviorIntelligenceService()
    run(svc.detect_recurring("u1", _monthly_rent()))
    out = svc.forecast_balance("u1", current_balance=1000.0, days=30)
    assert out["scheduled_events"] >= 1
    assert out["projected_end_balance"] <= 1000.0  # rent goes out
    assert out["low_balance_warning"] is False


def test_forecast_warns_on_negative():
    svc = BehaviorIntelligenceService()
    run(svc.detect_recurring("u1", _monthly_rent()))
    out = svc.forecast_balance("u1", current_balance=100.0, days=30)
    assert out["low_balance_warning"] is True


# --- triage -------------------------------------------------------------------------

def test_triage_ranks_high_risk_first():
    svc = ExceptionTriageService()
    items = [
        {"id": "low", "reason": "over_daily_limit"},
        {"id": "high", "reason": "unregistered_payee", "prior_rejections": 3,
         "amount": 9000, "over_single_limit": True},
    ]
    ranked = svc.rank_queue(items)
    assert ranked[0]["id"] == "high"
    assert ranked[0]["risk_score"] > ranked[1]["risk_score"]


def test_triage_split_auto_vs_review():
    svc = ExceptionTriageService()
    items = [{"id": "a"}, {"id": "b", "reason": "unregistered_payee"}]
    ranked = svc.rank_queue(items)
    split = svc.split_auto_vs_review(ranked)
    assert split["auto_count"] == 1 and split["review_count"] == 1
    assert split["needs_review"][0]["id"] == "b"


def test_triage_learns_from_disagreement():
    svc = ExceptionTriageService()
    before = svc.weights["unregistered_payee"]
    svc.learn_from_decision({"reason": "unregistered_payee"}, "reject", "pay")
    assert svc.weights["unregistered_payee"] < before
    stats = svc.stats()
    assert stats["decisions_seen"] == 1 and stats["agreement_rate"] == 0.0


# --- copilot -------------------------------------------------------------------------

def test_copilot_template_fallback_and_audit_safe():
    svc = OpsCopilotService()
    svc.register_context("open_exceptions", lambda: [{"id": "e1"}, {"id": "e2"}])
    svc.register_context("broken_source", lambda: (_ for _ in ()).throw(RuntimeError("down")))
    out = run(svc.ask("staff-1", "How many open exceptions?"))
    assert out["engine"] == "template-fallback"
    assert "open_exceptions: 2 item(s)" in out["answer"]
    assert "broken_source: unavailable" in out["answer"]
    assert svc.history()[-1]["query_id"] == out["query_id"]


# --- reconciliation --------------------------------------------------------------------

def test_reconcile_matches_and_residue():
    svc = ReconciliationService()
    src = [{"trace_number": "T1", "amount_cents": 100},
           {"trace_number": "T2", "amount_cents": 200},
           {"trace_number": "T3", "amount_cents": 300}]
    tgt = [{"trace_number": "T1", "amount_cents": 100},
           {"trace_number": "T2", "amount_cents": 250},   # amount mismatch
           {"trace_number": "T9", "amount_cents": 50}]
    out = svc.reconcile(src, tgt, key_fn=lambda r: r["trace_number"],
                        amount_fn=lambda r: r["amount_cents"], amount_tolerance=1.0)
    assert out["matched_count"] == 1
    assert out["unmatched_source"] == [src[1], src[2]]
    assert out["unmatched_target"] == [tgt[1], tgt[2]]


def test_reconcile_ach_returns_run_recorded():
    svc = ReconciliationService()
    transfers = {"ach-1": {"trace_number": "T1", "amount_cents": 100}}
    out = run(svc.reconcile_ach_returns([{"trace_number": "T1", "amount_cents": 100}],
                                        transfers))
    assert out["matched_count"] == 1 and out["run_id"]
    assert svc.runs[-1]["kind"] == "ach_returns"


# --- model lifecycle ---------------------------------------------------------------------

def test_model_registry_modes_and_promotion():
    reg = ModelRegistry()
    reg.register("triage-scorer", "1.0.0")
    assert reg.get("triage-scorer")["mode"] == "shadow"
    reg.set_mode("triage-scorer", "canary")
    for i in range(60):
        reg.record_decision("triage-scorer", f"h{i}", "reject",
                            agreed_with_champion=(i != 0))  # 59/60 agree
    promo = reg.can_promote("triage-scorer", threshold=0.95, min_decisions=50)
    assert promo["promotable"] is True and promo["agreement_rate"] == round(59 / 60, 4)
    reg.set_mode("triage-scorer", "enforce")
    assert reg.can_promote("triage-scorer")["promotable"] is False  # already enforced


def test_model_registry_rejects_bad_mode_and_unknown():
    reg = ModelRegistry()
    try:
        reg.register("m", "1", "yolo")
        assert False, "should raise"
    except ValueError:
        pass
    try:
        reg.set_mode("ghost", "shadow")
        assert False, "should raise"
    except KeyError:
        pass
