"""Self-contained tests for alternative data ingestion."""

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
    from datetime import datetime as _dt, timezone as _tz
    _col = {"user_id": "u", "occurred_at": _dt.min.replace(tzinfo=_tz.utc),
            "source": "", "signal_type": "", "amount": 0, "revoked_at": None}
    for name in ("AltDataConsent", "AltDataSignal", "User", "Account",
                 "CreditAssessment", "Transaction"):
        setattr(models, name, type(name, (), dict(_col)))
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

from app.services.alt_data_service import (  # noqa: E402
    AltDataService, parse_bank_sms, _parse_dt)

svc = AltDataService()
NOW = datetime.now(timezone.utc)


def test_parse_credit_alert_gtb_style():
    r = parse_bank_sms("Acct: 0123****456 Amt: NGN50,000.00 CR Desc: TRANSFER FROM ACME Bal: NGN120,000.00")
    assert r["type"] == "credit" and r["amount"] == 50_000.0
    assert r["balance_after"] == 120_000.0


def test_parse_debit_alert():
    r = parse_bank_sms("Debit: N5,000.00 on 12/03/2026. Bal: N45,300.00")
    assert r["type"] == "debit" and r["amount"] == 5_000.0


def test_parse_credit_alert_keyword():
    r = parse_bank_sms("CREDIT alert! Amount: 25,000.00 NGN from Kuda. Your balance is 30,000.00")
    assert r["type"] == "credit" and r["amount"] == 25_000.0


def test_unparseable_sms_returns_none():
    assert parse_bank_sms("Your OTP is 123456. Do not share.") is None
    assert parse_bank_sms("Promo! Dial *123# for bonus data") is None


def test_date_parsing_formats():
    assert _parse_dt("2026-03-12") is not None
    assert _parse_dt("12/03/2026") is not None
    assert _parse_dt("12 Mar 2026") is not None
    assert _parse_dt("not a date") is None
    assert _parse_dt(None) is None


class _FakeSignal:
    def __init__(self, source, signal_type, amount, occurred_at, trust):
        self.source = source; self.signal_type = signal_type
        self.amount = amount; self.occurred_at = occurred_at; self.trust = trust


class _FakeDB:
    def __init__(self, signals):
        self._signals = signals
    async def execute(self, q):
        m = MagicMock()
        m.scalars.return_value.all.return_value = self._signals
        return m


import asyncio


def _signals_for_income(monthly, months=6, source="aggregator", trust=0.9):
    out = []
    for i in range(months):
        out.append(_FakeSignal(source, "bank_credit", monthly,
                               NOW - timedelta(days=30 * i), trust))
        out.append(_FakeSignal(source, "bank_debit", monthly * 0.7,
                               NOW - timedelta(days=30 * i) + timedelta(days=2), trust))
    return out


def test_external_income_capped_without_corroboration():
    # external claims 800k, internal shows 100k -> uncorroborated, contribution capped at 50%
    sigs = _signals_for_income(800_000)
    db = _FakeDB(sigs)
    r = asyncio.run(svc.summarise_for_credit(db, MagicMock(id="u"),
                                             internal_monthly_income=100_000))
    assert r["external_monthly_income"] > 600_000
    assert not r["external_income_corroborated"]
    contribution = r["verified_income_with_alt_data"] - 100_000
    assert contribution <= r["external_monthly_income"] * 0.5 + 1


def test_corroborated_income_raises_confidence_not_estimate():
    sigs = _signals_for_income(110_000)
    db = _FakeDB(sigs)
    r = asyncio.run(svc.summarise_for_credit(db, MagicMock(id="u"),
                                             internal_monthly_income=100_000))
    assert r["external_income_corroborated"]
    assert r["verified_income_with_alt_data"] == max(100_000, r["external_monthly_income"])


def test_no_signals_returns_zero_external():
    r = asyncio.run(svc.summarise_for_credit(_FakeDB([]), MagicMock(id="u"),
                                             internal_monthly_income=50_000))
    assert r["external_monthly_income"] == 0
    assert r["verified_income_with_alt_data"] == 50_000
