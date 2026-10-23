"""Self-contained tests for model-risk control testing (anomaly probes)."""

import sys
import types
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
    for name in ("User", "Account", "CreditAssessment", "Transaction",
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
    sys.modules.setdefault("httpx", MagicMock())
    sys.modules.setdefault("aiohttp", MagicMock())
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

from app.services.control_tests_service import (  # noqa: E402
    ANOMALY_PROBES, get_control_tests_service)


def test_anomaly_probes_all_caught():
    """Every synthetic anomaly must be declined by today's policy+blend."""
    out = get_control_tests_service().run_anomaly_probes()
    assert out["status"] == "PASS", out["results"]
    assert out["failures"] == 0
    assert out["probes"] == len(ANOMALY_PROBES)


def test_probes_cover_the_three_policy_dimensions():
    names = {p["name"] for p in ANOMALY_PROBES}
    assert "zero_history_jumbo_loan" in names      # seasoning/thin-file
    assert "manipulated_history" in names          # authenticity
    assert "unverified_identity" in names          # KYC
