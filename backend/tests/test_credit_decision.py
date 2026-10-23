"""Self-contained tests for credit decisioning — no DB or torch required.

Stubs config/database modules so the service modules import cleanly, then
exercises the policy/blend logic and the authenticity engine wiring.
"""

import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock


def _stub_env():
    config = types.ModuleType("config")
    config.settings = MagicMock()
    sys.modules.setdefault("config", config)
    db = types.ModuleType("database")
    models = types.ModuleType("database.models")
    for name in ("Account", "CreditAssessment", "Transaction", "User"):
        setattr(models, name, type(name, (), {}))
    db.models = models
    sys.modules.setdefault("database", db)
    sys.modules.setdefault("database.models", models)
    if "structlog" not in sys.modules:
        st = types.ModuleType("structlog")
        st.get_logger = lambda *a, **k: MagicMock()
        sys.modules["structlog"] = st
    if "sqlalchemy" not in sys.modules:
        sa = types.ModuleType("sqlalchemy")
        sa.func = MagicMock(); sa.select = MagicMock()
        ext = types.ModuleType("sqlalchemy.ext")
        aio = types.ModuleType("sqlalchemy.ext.asyncio")
        aio.AsyncSession = object
        ext.asyncio = aio; sa.ext = ext
        sys.modules["sqlalchemy"] = sa
        sys.modules["sqlalchemy.ext"] = ext
        sys.modules["sqlalchemy.ext.asyncio"] = aio
    if "aiohttp" not in sys.modules:
        sys.modules["aiohttp"] = MagicMock()
    sys.modules.setdefault("tigerbeetle", MagicMock())
    if "app.services.permify_service" not in sys.modules:
        import enum as _enum
        ps = types.ModuleType("app.services.permify_service")
        class PermifyEntityType(str, _enum.Enum):
            USER = "user"; ESCROW = "escrow"; VIRTUAL_ACCOUNT = "virtual_account"
            CREDIT_ASSESSMENT = "credit_assessment"; ALT_DATA_SOURCE = "alt_data_source"
        class _Res:
            allowed = True
            error = None
        async def _w(*a, **k):
            return True
        async def _c(*a, **k):
            return _Res()
        _svc = types.SimpleNamespace(write_relationship=_w,
                                     delete_relationship=_w,
                                     check_permission=_c)
        ps.PermifyEntityType = PermifyEntityType
        ps.get_permify_service = lambda: _svc
        sys.modules["app.services.permify_service"] = ps


_stub_env()

from app.services.credit_decision_service import (  # noqa: E402
    CreditDecisionService, STARTER_LIMIT)
from app.services.credit_authenticity_service import (  # noqa: E402
    CreditAuthenticityEngine)

svc = CreditDecisionService()
NOW = datetime.now(timezone.utc)


def _user(kyc_level="tier3", kyc_status="completed", age_days=200):
    u = MagicMock()
    u.kyc_level = kyc_level
    u.kyc_status = kyc_status
    u.created_at = NOW - timedelta(days=age_days)
    return u


def _ctx(**kw):
    base = dict(monthly_income=300_000, balance=150_000, avg_balance=120_000,
                min_balance_ratio=0.6, tx_count_30d=20, tx_volume_30d=500_000,
                spend_to_income_ratio=0.6, savings_rate=0.25,
                largest_tx_to_income=1.2, unique_counterparties=12,
                account_age_days=200, active_days_ratio_90d=0.6, kyc_level_rank=3,
                active_loans=0, loan_to_income_ratio=0.0, repayment_history_score=0.85,
                bnpl_utilisation=0.1, wash_transfer_ratio=0.0,
                burst_before_application=0.0, income_regularity=0.9,
                salary_cycle_alignment=0.8, income_sources=3, income_trend_3m=0.05,
                balance_volatility=0.2, days_negative_30d=0, _tx_count_total=60)
    base.update(kw)
    return base


def _auth(grade="authentic", score=0.8, income=300_000):
    return {"authenticity_score": score, "grade": grade,
            "verified_monthly_income": income,
            "flags": {"wash_transfer_ratio": 0.0, "burst_before_application": 0.0,
                      "income_regularity": 0.9, "salary_cycle_alignment": 0.8}}


def test_clean_profile_approves_with_limit():
    d = svc._blend(_ctx(), _auth(), {"available": True, "pd": 0.05, "model_version": "v1"},
                   [], "loan", 500_000)
    assert d["decision"] in ("approve", "approve_with_limits")
    assert d["approved"]
    assert d["credit_score"] > 700
    assert d["max_limit"] > 0


def test_manipulated_data_declines_regardless_of_ml():
    fails = svc._policy_check(_user(), _ctx(), _auth(grade="manipulated", score=0.1))
    assert any(f["rule"] == "authenticity" for f in fails)
    d = svc._blend(_ctx(), _auth(grade="manipulated", score=0.1),
                   {"available": True, "pd": 0.01}, fails, "loan", 100_000)
    assert d["decision"] == "decline"
    assert not d["approved"]


def test_suspicious_caps_limit_and_reviews():
    d = svc._blend(_ctx(), _auth(grade="suspicious", score=0.45),
                   {"available": True, "pd": 0.03}, [], "bnpl", 20_000)
    assert d["decision"] == "review"
    assert d["max_limit"] <= STARTER_LIMIT


def test_new_account_and_thin_file_decline():
    ctx = _ctx(account_age_days=10, _tx_count_total=3)
    fails = svc._policy_check(_user(age_days=10), ctx, _auth())
    rules = {f["rule"] for f in fails}
    assert "seasoning" in rules and "thin_file" in rules
    d = svc._blend(ctx, _auth(), {"available": False, "pd": None}, fails, "loan", None)
    assert d["decision"] == "decline"
    assert d["credit_score"] == 300


def test_low_kyc_blocks_credit():
    fails = svc._policy_check(_user(kyc_level="basic"), _ctx(), _auth())
    assert any(f["rule"] == "kyc" for f in fails)


def test_no_verified_income_gets_starter_limit_only():
    d = svc._blend(_ctx(), _auth(income=0),
                   {"available": True, "pd": 0.05}, [], "loan", 200_000)
    assert d["max_limit"] <= STARTER_LIMIT
    assert any("starter limit" in r for r in d["reasons"])


def test_over_limit_request_goes_to_review():
    d = svc._blend(_ctx(), _auth(income=100_000),
                   {"available": True, "pd": 0.05}, [], "loan", 50_000_000)
    assert d["decision"] == "review"
    assert not d["approved"]


def test_wash_trading_detected_by_engine():
    eng = CreditAuthenticityEngine()
    txns = []
    base = NOW - timedelta(days=30)
    for i in range(6):  # ping-pong same counterparty within 72h
        out_t = base + timedelta(days=i * 4)
        txns.append({"transaction_type": "debit", "amount": 50_000,
                     "created_at": out_t, "counterparty": "friend-A", "description": "transfer"})
        txns.append({"transaction_type": "credit", "amount": 50_000,
                     "created_at": out_t + timedelta(hours=10), "counterparty": "friend-A",
                     "description": "transfer"})
    result = eng.analyze(txns, own_account_ids=[])
    assert result["flags"]["wash_transfer_ratio"] > 0.4
    assert result["grade"] in ("manipulated", "suspicious")


def test_salary_pattern_grades_authentic():
    eng = CreditAuthenticityEngine()
    txns = []
    for i in range(6):
        txns.append({"transaction_type": "credit", "amount": 250_000 + i * 1_000,
                     "created_at": NOW - timedelta(days=30 * (6 - i)) + timedelta(days=-3),
                     "counterparty": "ACME LTD PAYROLL", "description": "SALARY ACME LTD"})
        for j in range(8):
            txns.append({"transaction_type": "debit", "amount": 8_000 + j * 700,
                         "created_at": NOW - timedelta(days=30 * (6 - i)) + timedelta(days=j),
                         "counterparty": f"merchant-{j}", "description": "POS PURCHASE"})
    result = eng.analyze(txns, own_account_ids=[])
    assert result["verified_monthly_income"] >= 200_000
    assert result["flags"]["income_regularity"] >= 0.6
    assert result["grade"] in ("authentic", "review")


def test_self_funding_flagged():
    eng = CreditAuthenticityEngine()
    txns = [{"transaction_type": "credit", "amount": 100_000,
             "created_at": NOW - timedelta(days=i), "counterparty": "own-savings",
             "description": "transfer in", "destination_account_id": "own-1"}
            for i in range(5)]
    result = eng.analyze(txns, own_account_ids=["own-1"])
    assert result["flags"]["self_funded_volume"] > 0
    assert result["grade"] in ("manipulated", "suspicious", "review")
