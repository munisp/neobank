"""Tests for escrow rule extensions: per-deal fees, milestone rules, deadline expiry."""

import sys
import types
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock


def _stub_env():
    config = types.ModuleType("config")
    cfg_settings = types.ModuleType("config.settings")
    cfg_settings.settings = MagicMock()
    sys.modules.setdefault("config", config)
    sys.modules.setdefault("config.settings", cfg_settings)
    db = types.ModuleType("database")
    models = types.ModuleType("database.models")
    from datetime import datetime as _dt, timezone as _tz
    _col = {"user_id": "u", "occurred_at": _dt.min.replace(tzinfo=_tz.utc),
            "source": "", "signal_type": "", "amount": 0, "revoked_at": None,
            "status": "active"}
    for name in ("EscrowParty", "EscrowApprovalConfig", "EscrowLedgerEntry", "User",
                 "VirtualAccount", "Account", "CreditAssessment", "Transaction",
                 "AltDataConsent", "AltDataSignal"):
        setattr(models, name, type(name, (), dict(_col)))
    db.models = models
    sys.modules.setdefault("database", db)
    sys.modules.setdefault("database.models", models)
    conn = types.ModuleType("database.connection")
    conn.AsyncSessionLocal = MagicMock()
    sys.modules.setdefault("database.connection", conn)
    st = types.ModuleType("structlog")
    st.get_logger = lambda *a, **k: MagicMock()
    sys.modules.setdefault("structlog", st)
    sys.modules.setdefault("httpx", MagicMock())
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

import asyncio  # noqa: E402

from app.services.multiparty_escrow_service import (  # noqa: E402
    MultipartyEscrowService, PartyRole)


def _svc():
    svc = MultipartyEscrowService()
    svc._persist = lambda *a, **k: asyncio.sleep(0)
    return svc


def _create(svc, **kw):
    args = dict(title="Deal", description="d", total_amount=Decimal("1000000"),
                currency="NGN",
                buyers=[{"user_id": "b1", "contribution_percentage": 100}],
                sellers=[{"user_id": "s1", "distribution_percentage": 70},
                         {"user_id": "s2", "distribution_percentage": 30}])
    args.update(kw)
    return asyncio.run(svc.create_multiparty_escrow(**args))


def test_per_deal_fee_override_applies():
    svc = _svc()
    r = _create(svc, fee_percentage=1.0)
    escrow_id = r["escrow_id"]
    dist = asyncio.run(svc.distribute_to_sellers(escrow_id, Decimal("1000000")))
    assert float(dist["total_fees"]) == 10000.0  # 1% not 2.5%
    nets = sorted(float(d["net_amount"]) for d in dist["distributions"])
    assert nets == [297000.0, 693000.0]


def test_explicit_fee_beats_deal_override():
    svc = _svc()
    r = _create(svc, fee_percentage=1.0)
    dist = asyncio.run(svc.distribute_to_sellers(r["escrow_id"], Decimal("1000000"),
                                                 Decimal("5")))
    assert float(dist["total_fees"]) == 50000.0


def test_default_fee_unchanged():
    svc = _svc()
    r = _create(svc)
    dist = asyncio.run(svc.distribute_to_sellers(r["escrow_id"], Decimal("1000000")))
    assert float(dist["total_fees"]) == 25000.0


def test_fee_bounds_enforced():
    svc = _svc()
    r = _create(svc)
    try:
        asyncio.run(svc.distribute_to_sellers(r["escrow_id"], Decimal("1000"), Decimal("15")))
        raise SystemExit("should have raised")
    except ValueError as e:
        assert "0% and 10%" in str(e)


def test_milestone_rule_overrides_escrow_default():
    svc = _svc()
    r = _create(svc, approval_config={"approval_type": "all", "required_approvals": 1})
    escrow_id = r["escrow_id"]
    buyer = [p for p in r["parties"] if p["role"] == "buyer"][0]
    seller = [p for p in r["parties"] if p["role"] == "seller"][0]

    # milestone requiring an agent-style approver: seller not allowed
    asyncio.run(svc.set_milestone_rule(escrow_id, "ms-1",
                                       approval_type="any", approver_roles=["buyer"]))
    try:
        asyncio.run(svc.record_milestone_approval(escrow_id, "ms-1", seller["id"]))
        raise SystemExit("should have raised")
    except ValueError as e:
        assert "cannot approve" in str(e)
    res = asyncio.run(svc.record_milestone_approval(escrow_id, "ms-1", buyer["id"]))
    assert res["milestone_approved"]  # "any" + 1 approval
    # double approval rejected
    try:
        asyncio.run(svc.record_milestone_approval(escrow_id, "ms-1", buyer["id"]))
        raise SystemExit("should have raised")
    except ValueError as e:
        assert "already approved" in str(e)


def test_milestone_falls_back_to_escrow_config():
    svc = _svc()
    r = _create(svc)
    escrow_id = r["escrow_id"]
    buyer = [p for p in r["parties"] if p["role"] == "buyer"][0]
    res = asyncio.run(svc.record_milestone_approval(escrow_id, "ms-x", buyer["id"]))
    assert res["milestone_approved"]  # default ALL with 1 buyer


def test_deadline_blocks_late_approval():
    svc = _svc()
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    r = _create(svc, approval_config={"approval_type": "all",
                                      "required_approvals": 1,
                                      "approval_deadline": past})
    buyer = [p for p in r["parties"] if p["role"] == "buyer"][0]
    try:
        asyncio.run(svc.record_approval(r["escrow_id"], buyer["id"]))
        raise SystemExit("should have raised")
    except ValueError as e:
        assert "deadline" in str(e)


def test_deadline_expiry_auto_refunds():
    svc = _svc()
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    r = _create(svc, approval_config={"approval_type": "all",
                                      "required_approvals": 1,
                                      "approval_deadline": past})
    escrow_id = r["escrow_id"]
    buyer = [p for p in r["parties"] if p["role"] == "buyer"][0]
    asyncio.run(svc.fund_contribution(escrow_id, buyer["id"], Decimal("400000"), "acct-1"))
    asyncio.run(svc.fund_contribution(escrow_id, buyer["id"], Decimal("600000"), "acct-1"))

    res = asyncio.run(svc.check_deadline_and_expire(escrow_id))
    assert res["expired"]
    assert float(res["total_refunded"]) == 1000000.0
    assert len(res["refunds"]) == 2
    # idempotent: second call records no new refunds
    res2 = asyncio.run(svc.check_deadline_and_expire(escrow_id))
    assert len(res2["refunds"]) == 2
    assert len(svc.distributions[escrow_id]) == 2


def test_no_expiry_when_approved_or_before_deadline():
    svc = _svc()
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    r = _create(svc, approval_config={"approval_type": "all",
                                      "required_approvals": 1,
                                      "approval_deadline": future})
    res = asyncio.run(svc.check_deadline_and_expire(r["escrow_id"]))
    assert not res["expired"]
    buyer = [p for p in r["parties"] if p["role"] == "buyer"][0]
    asyncio.run(svc.record_approval(r["escrow_id"], buyer["id"]))
    # now move deadline to past — still not expired because approved
    svc.approval_configs[r["escrow_id"]].approval_deadline = (
        datetime.now(timezone.utc) - timedelta(hours=1))
    res2 = asyncio.run(svc.check_deadline_and_expire(r["escrow_id"]))
    assert not res2["expired"]
