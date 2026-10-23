"""Self-contained tests for the trust fabric: audit chain, billing,
plugin registry, document intake, positive-pay decision rules."""

import sys
import types
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
            "source": "", "status": "active", "domain": "platform",
            "sequence": 0, "entry_hash": "", "created_at": _dt.min.replace(tzinfo=_tz.utc)}
    for name in ("User", "VirtualAccount", "EscrowParty", "EscrowApprovalConfig",
                 "EscrowLedgerEntry", "Account", "CreditAssessment", "Transaction",
                 "AltDataConsent", "AltDataSignal", "AuditChainEntry",
                 "RegisteredPayee", "PaymentException", "FeeScheduleItem",
                 "BillingStatement"):
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
    sys.modules.setdefault("httpx", MagicMock())
    sys.modules.setdefault("aiohttp", MagicMock())
    sys.modules.setdefault("tigerbeetle", MagicMock())


_stub_env()

import asyncio  # noqa: E402
import io  # noqa: E402
import os  # noqa: E402

from app.services.audit_chain_service import (  # noqa: E402
    GENESIS, compute_hash, AuditChainService)
from app.services.billing_service import (  # noqa: E402
    _price_with_tiers, get_usage, record_usage, _USAGE)
from app.services.plugin_registry import PluginRegistry  # noqa: E402
from app.services import document_intake_service as di  # noqa: E402
from app.services.positive_pay_service import _recommend  # noqa: E402


# ---------------------------------------------------------------------------
# Audit chain
# ---------------------------------------------------------------------------

class _FakeEntry:
    def __init__(self, domain, seq, action, payload, prev_hash):
        self.domain = domain; self.sequence = seq; self.action = action
        self.actor_id = "u1"; self.aggregate_id = "a1"; self.payload = payload
        self.prev_hash = prev_hash
        self.entry_hash = compute_hash(domain, seq, action, "u1", "a1",
                                       payload, prev_hash)


def _fake_db(entries):
    db = MagicMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = entries
    db.execute = asyncio.coroutine(lambda *a, **k: result) if False else None

    async def _execute(*a, **k):
        return result
    db.execute = _execute
    return db


def _chain(n=3):
    entries, prev = [], GENESIS
    for i in range(1, n + 1):
        e = _FakeEntry("platform", i, f"action.{i}", {"i": i}, prev)
        prev = e.entry_hash
        entries.append(e)
    return entries


def test_audit_chain_valid():
    svc = AuditChainService()
    out = asyncio.new_event_loop().run_until_complete(
        svc.verify_chain(_fake_db(_chain(3))))
    assert out["valid"] is True and out["entries_checked"] == 3


def test_audit_chain_detects_tampered_entry():
    entries = _chain(3)
    entries[1].payload = {"i": 999}  # tamper
    svc = AuditChainService()
    out = asyncio.new_event_loop().run_until_complete(
        svc.verify_chain(_fake_db(entries)))
    assert out["valid"] is False and out["broken_at"] == 2


def test_audit_chain_detects_deletion():
    entries = _chain(3)
    del entries[1]  # middle entry deleted → prev_hash link broken
    svc = AuditChainService()
    out = asyncio.new_event_loop().run_until_complete(
        svc.verify_chain(_fake_db(entries)))
    assert out["valid"] is False


def test_audit_chain_hash_is_deterministic():
    h1 = compute_hash("d", 1, "a", "u", "g", {"x": 1}, GENESIS)
    h2 = compute_hash("d", 1, "a", "u", "g", {"x": 1}, GENESIS)
    assert h1 == h2 and len(h1) == 64


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

def test_flat_pricing():
    item = types.SimpleNamespace(unit_price=Decimal("100"), tiers=[])
    assert _price_with_tiers(item, 5) == Decimal("500")


def test_tiered_pricing():
    item = types.SimpleNamespace(unit_price=Decimal("100"), tiers=[
        {"up_to": 10, "unit_price": "100"},
        {"up_to": None, "unit_price": "50"},
    ])
    # 12 units: 10 @ 100 + 2 @ 50 = 1100
    assert _price_with_tiers(item, 12) == Decimal("1100")


def test_usage_metering():
    _USAGE.clear()
    record_usage("u1", "escrow_deal", 2, period="2026-10")
    record_usage("u1", "escrow_deal", 1, period="2026-10")
    record_usage("u1", "virtual_account", 1, period="2026-10")
    usage = get_usage("u1", "2026-10")
    assert usage == {"escrow_deal": 3, "virtual_account": 1}


# ---------------------------------------------------------------------------
# Plugin registry
# ---------------------------------------------------------------------------

def test_plugin_allowlist_blocks_unlisted():
    os.environ["NB_PLUGINS"] = "allowed_one"
    reg = PluginRegistry()
    assert reg.register("sms_parser", "allowed_one", lambda x: x) is True
    assert reg.register("sms_parser", "sneaky", lambda x: x) is False
    assert reg.skipped()[0]["reason"] == "not allowlisted"
    del os.environ["NB_PLUGINS"]


def test_plugin_collision_skipped():
    reg = PluginRegistry()
    assert reg.register("doc_provider", "ocr", lambda: None) is True
    assert reg.register("doc_provider", "ocr", lambda: None) is False
    assert reg.skipped()[0]["reason"] == "name collision"


# ---------------------------------------------------------------------------
# Document intake
# ---------------------------------------------------------------------------

def _png_bytes():
    from PIL import Image
    img = Image.new("RGB", (400, 200), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_field_validation_accepts_valid_fields():
    fields = {"cheque_number": "123456", "account_number": "0123456789",
              "amount_numeric": "50,000.00", "date": "12/10/2026"}
    out = di.validate_fields(fields)
    assert set(out["valid"]) == set(fields) and out["invalid"] == []


def test_field_validation_rejects_bad_account():
    fields = {"account_number": "12345"}  # not 10 digits
    out = di.validate_fields(fields)
    assert out["invalid"] == ["account_number"]


def test_signature_crop_returns_png():
    png = di.crop_signature_region(_png_bytes())
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_extract_with_ocr_degrades_gracefully():
    # pytesseract absent → structured error, no exception
    out = asyncio.new_event_loop().run_until_complete(
        di.get_document_intake_service().extract_cheque(
            _png_bytes(), provider="ocr"))
    assert "fields" in out and out["provider"] == "ocr"


def test_batch_isolates_bad_images():
    good = _png_bytes()
    out = asyncio.new_event_loop().run_until_complete(
        di.get_document_intake_service().extract_batch(
            [good, b"not-an-image"], provider="ocr"))
    assert out["total"] == 2 and out["failed"] == 1 and out["succeeded"] == 1


def test_unknown_provider_rejected():
    try:
        asyncio.new_event_loop().run_until_complete(
            di.get_document_intake_service().extract_cheque(
                _png_bytes(), provider="magic"))
        assert False, "should raise"
    except ValueError:
        pass


# ---------------------------------------------------------------------------
# Positive pay recommendation heuristic
# ---------------------------------------------------------------------------

def test_recommend_unregistered_payee_high_risk():
    score, rec = _recommend("unregistered_payee", Decimal("600000"))
    assert score >= 0.8 and rec == "reject"


def test_recommend_small_over_limit_is_review():
    score, rec = _recommend("over_single_limit", Decimal("5000"))
    assert rec == "review"
