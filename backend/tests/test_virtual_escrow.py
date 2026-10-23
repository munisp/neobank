"""Self-contained tests for virtual accounts and multiparty escrow rules."""

import sys
import types
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock


def _stub_env():
    config = types.ModuleType("config")
    cfg_settings = types.ModuleType("config.settings")
    cfg_settings.settings = MagicMock()
    config.settings = cfg_settings
    sys.modules.setdefault("config", config)
    sys.modules.setdefault("config.settings", cfg_settings)
    db = types.ModuleType("database")
    models = types.ModuleType("database.models")
    from datetime import datetime as _dt, timezone as _tz
    _col = {"user_id": "u", "occurred_at": _dt.min.replace(tzinfo=_tz.utc),
            "source": "", "status": "active"}
    for name in ("User", "VirtualAccount", "EscrowParty", "EscrowApprovalConfig",
                 "EscrowLedgerEntry", "Account", "CreditAssessment", "Transaction",
                 "AltDataConsent", "AltDataSignal"):
        setattr(models, name, type(name, (), dict(_col)))
    db.models = models
    sys.modules.setdefault("database", db)
    sys.modules.setdefault("database.models", models)
    conn = types.ModuleType("database.connection")
    conn.AsyncSessionLocal = MagicMock()
    sys.modules.setdefault("database.connection", conn)
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
    if "httpx" not in sys.modules:
        sys.modules["httpx"] = MagicMock()
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

from app.services.virtual_account_service import (  # noqa: E402
    _nuban_check_digit, _generate_number)
from app.services.multiparty_escrow_service import (  # noqa: E402
    MultipartyEscrowService, PartyRole, ApprovalType)


def test_nuban_checksum_validates():
    for _ in range(50):
        number = _generate_number()
        assert len(number) == 10 and number.startswith("99")
        # recompute: last digit must equal check digit of first 9
        assert int(number[-1]) == _nuban_check_digit(number[:9])


def test_nuban_check_digit_known_value():
    # 3,7,3,3,7,3,3,7,3 weights over "990000000"
    assert _nuban_check_digit("990000000") == (10 - (9 * 3 + 9 * 7) % 10) % 10


def test_multiparty_requires_100_percent_buyers():
    svc = MultipartyEscrowService()
    svc._persist = lambda *a, **k: asyncio.sleep(0)  # skip DB in unit test
    try:
        asyncio.run(svc.create_multiparty_escrow(
            title="t", description="d", total_amount=Decimal("100000"),
            currency="NGN",
            buyers=[{"user_id": "a", "contribution_percentage": 60}],
            sellers=[{"user_id": "s", "distribution_percentage": 100}]))
        raise SystemExit("should have raised")
    except ValueError as e:
        assert "100%" in str(e)


def test_multiparty_creates_parties_and_config():
    svc = MultipartyEscrowService()
    svc._persist = lambda *a, **k: asyncio.sleep(0)
    result = asyncio.run(svc.create_multiparty_escrow(
        title="Land co-buy", description="d", total_amount=Decimal("1000000"),
        currency="NGN",
        buyers=[{"user_id": "ada", "contribution_percentage": 60},
                {"user_id": "chidi", "contribution_percentage": 40}],
        sellers=[{"user_id": "obi", "distribution_percentage": 100}],
        approval_config={"approval_type": "all", "required_approvals": 2}))
    assert result["total_buyers"] == 2
    assert result["approval_config"]["approval_type"] == "all"
    escrow_id = result["escrow_id"]
    buyers = asyncio.run(svc.get_parties_by_role(escrow_id, PartyRole.BUYER))
    assert len(buyers) == 2
    # contribution amounts derived from percentages
    amounts = sorted(float(b["contribution_amount"]) for b in buyers)
    assert amounts == [400000.0, 600000.0]


def test_partial_funding_then_full():
    svc = MultipartyEscrowService()
    svc._persist = lambda *a, **k: asyncio.sleep(0)
    result = asyncio.run(svc.create_multiparty_escrow(
        title="t", description="d", total_amount=Decimal("100000"),
        currency="NGN",
        buyers=[{"user_id": "a", "contribution_percentage": 100}],
        sellers=[{"user_id": "s", "distribution_percentage": 100}]))
    escrow_id = result["escrow_id"]
    buyer = result["parties"][0] if result["parties"][0]["role"] == "buyer" else result["parties"][1]
    r1 = asyncio.run(svc.fund_contribution(escrow_id, buyer["id"], Decimal("40000"), "acct-1"))
    assert not r1["funding_complete"]
    r2 = asyncio.run(svc.fund_contribution(escrow_id, buyer["id"], Decimal("60000"), "acct-1"))
    assert r2["funding_complete"]


def test_approval_threshold_all_buyers():
    svc = MultipartyEscrowService()
    svc._persist = lambda *a, **k: asyncio.sleep(0)
    result = asyncio.run(svc.create_multiparty_escrow(
        title="t", description="d", total_amount=Decimal("100000"),
        currency="NGN",
        buyers=[{"user_id": "a", "contribution_percentage": 50},
                {"user_id": "b", "contribution_percentage": 50}],
        sellers=[{"user_id": "s", "distribution_percentage": 100}],
        approval_config={"approval_type": "all", "required_approvals": 2}))
    escrow_id = result["escrow_id"]
    buyers = [p for p in result["parties"] if p["role"] == "buyer"]
    r1 = asyncio.run(svc.record_approval(escrow_id, buyers[0]["id"]))
    assert not r1["threshold_met"]
    r2 = asyncio.run(svc.record_approval(escrow_id, buyers[1]["id"]))
    assert r2["threshold_met"]


def test_distribution_splits_and_fees():
    svc = MultipartyEscrowService()
    svc._persist = lambda *a, **k: asyncio.sleep(0)
    result = asyncio.run(svc.create_multiparty_escrow(
        title="t", description="d", total_amount=Decimal("1000000"),
        currency="NGN",
        buyers=[{"user_id": "a", "contribution_percentage": 100}],
        sellers=[{"user_id": "s1", "distribution_percentage": 75},
                 {"user_id": "s2", "distribution_percentage": 25}]))
    escrow_id = result["escrow_id"]
    dist = asyncio.run(svc.distribute_to_sellers(escrow_id, Decimal("1000000")))
    nets = sorted(float(d["net_amount"]) for d in dist["distributions"])
    assert nets == [243750.0, 731250.0]  # 2.5% platform fee
    assert float(dist["total_fees"]) == 25000.0


def test_hydrate_restores_state():
    """Simulate a restart: new service instance, persisted state rehydrated."""
    svc1 = MultipartyEscrowService()
    svc1._persist = lambda *a, **k: asyncio.sleep(0)
    result = asyncio.run(svc1.create_multiparty_escrow(
        title="t", description="d", total_amount=Decimal("500000"),
        currency="NGN",
        buyers=[{"user_id": "a", "contribution_percentage": 100}],
        sellers=[{"user_id": "s", "distribution_percentage": 100}]))
    escrow_id = result["escrow_id"]

    state = {
        "parties": [{"party_id": "p1", "user_id": "a", "role": "buyer",
                     "status": "funded", "account_id": "acct",
                     "contribution_percentage": 100, "distribution_percentage": 0,
                     "contributed_amount": 500000, "approval_weight": 1,
                     "approved": False, "metadata": {}}],
        "approval_config": {"approval_type": "all", "required_approvals": 1,
                            "required_percentage": 100},
        "contributions": [], "distributions": [],
    }

    svc2 = MultipartyEscrowService()  # fresh process
    import app.services.multiparty_escrow_service as mod
    orig = mod.__dict__.get("hydrate_escrow_state")
    # patch the lazy import target
    import app.services.escrow_persistence as ep
    async def fake_hydrate(eid):
        return state
    ep.hydrate_escrow_state = fake_hydrate
    try:
        asyncio.run(svc2._hydrate(escrow_id))
        assert escrow_id in svc2.parties
        party = svc2.parties[escrow_id]["p1"]
        assert party.user_id == "a"
        assert float(party.amount_funded) == 500000.0
        assert svc2.approval_configs[escrow_id].required_approvals == 1
    finally:
        if orig:
            ep.hydrate_escrow_state = orig
