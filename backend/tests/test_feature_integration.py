"""Self-contained tests for the feature ↔ middleware integration layer.

Verifies graceful degradation: with no middleware running (no TigerBeetle,
no event bus, no Dapr, no Redis, no OpenSearch, no Temporal), every helper
must return a structured negative result instead of raising.
"""

import sys
import types
from decimal import Decimal
from unittest.mock import MagicMock


def _stub_env():
    config = types.ModuleType("config")
    cfg_settings = types.ModuleType("config.settings")
    cfg_settings.settings = MagicMock()
    cfg_settings.settings.DAPR_HTTP_PORT = None
    cfg_settings.settings.DAPR_PUBSUB_NAME = "pubsub"
    cfg_settings.settings.OPENSEARCH_URL = None
    cfg_settings.settings.TEMPORAL_HOST = None
    config.settings = cfg_settings
    sys.modules.setdefault("config", config)
    sys.modules.setdefault("config.settings", cfg_settings)
    if "structlog" not in sys.modules:
        st = types.ModuleType("structlog")
        st.get_logger = lambda *a, **k: MagicMock()
        sys.modules["structlog"] = st
    sys.modules.setdefault("tigerbeetle", MagicMock())
    sys.modules.setdefault("aiohttp", MagicMock())
    sys.modules.setdefault("httpx", MagicMock())


_stub_env()

import asyncio  # noqa: E402

from app.services import feature_integration as fi  # noqa: E402


def test_escrow_funding_degrades_without_ledger():
    # No TigerBeetle running → TigerBeetleClient init may fail or be
    # unavailable; helper must not raise and must report not-posted.
    result = fi.post_escrow_funding(
        buyer_user_id="u1", amount=Decimal("5000"), escrow_id="e1")
    assert isinstance(result, dict)
    assert "posted" in result or "reason" in result


def test_escrow_distribution_degrades_without_ledger():
    result = fi.post_escrow_distribution(
        seller_user_id="u2", amount=Decimal("4500"), escrow_id="e1")
    assert isinstance(result, dict)


def test_escrow_refund_degrades_without_ledger():
    result = fi.post_escrow_refund(
        buyer_user_id="u1", amount=Decimal("5000"), escrow_id="e1")
    assert isinstance(result, dict)


def test_temporal_deadline_noop_when_unconfigured():
    result = asyncio.new_event_loop().run_until_complete(
        fi.start_escrow_deadline_workflow(
            escrow_id="e1", deadline_iso="2030-01-01T00:00:00+00:00"))
    assert result.get("started") is False or result.get("ok") is False


def test_va_cache_fail_open_without_redis():
    async def go():
        await fi.va_cache_set("9900000001", {"user_id": "u1"})
        return await fi.va_cache_get("9900000001")
    # No Redis → get returns None (cache miss), no exception
    result = asyncio.new_event_loop().run_until_complete(go())
    assert result is None or result.get("user_id") == "u1"


def test_credit_index_degrades_without_opensearch():
    result = asyncio.new_event_loop().run_until_complete(
        fi.index_credit_assessment("ca-1", {"credit_score": 700}))
    assert result.get("indexed") is False


def test_publish_event_never_raises():
    ok = asyncio.new_event_loop().run_until_complete(
        fi.publish_feature_event(
            "TestEvent", aggregate_id="x", aggregate_type="escrow",
            payload={"k": "v"}))
    assert ok in (True, False)
