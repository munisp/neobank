"""Self-contained tests for the Permify integration helpers."""

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
    if "structlog" not in sys.modules:
        st = types.ModuleType("structlog")
        st.get_logger = lambda *a, **k: MagicMock()
        sys.modules["structlog"] = st
    if "aiohttp" not in sys.modules:
        sys.modules["aiohttp"] = MagicMock()


_stub_env()

import asyncio  # noqa: E402
import enum  # noqa: E402


def _install_permify_stub(write_ok=True, check_allowed=True, check_error=None,
                          raise_exc=None):
    ps = types.ModuleType("app.services.permify_service")

    class PermifyEntityType(str, enum.Enum):
        USER = "user"; ESCROW = "escrow"; VIRTUAL_ACCOUNT = "virtual_account"
        CREDIT_ASSESSMENT = "credit_assessment"; ALT_DATA_SOURCE = "alt_data_source"

    class _Res:
        def __init__(self):
            self.allowed = check_allowed
            self.error = check_error

    calls = []

    async def _w(*a, **k):
        calls.append(("write", a, k))
        if raise_exc:
            raise raise_exc
        return write_ok

    async def _d(*a, **k):
        calls.append(("delete", a, k))
        if raise_exc:
            raise raise_exc
        return write_ok

    async def _c(*a, **k):
        calls.append(("check", a, k))
        if raise_exc:
            raise raise_exc
        return _Res()

    svc = types.SimpleNamespace(write_relationship=_w, delete_relationship=_d,
                                check_permission=_c)
    ps.PermifyEntityType = PermifyEntityType
    ps.get_permify_service = lambda: svc
    sys.modules["app.services.permify_service"] = ps
    sys.modules.pop("app.services.permify_integration", None)
    return calls


def _fresh_module():
    sys.modules.pop("app.services.permify_integration", None)
    import importlib
    return importlib.import_module("app.services.permify_integration")


def test_grant_escrow_party_maps_roles():
    calls = _install_permify_stub()
    pi = _fresh_module()
    ok = asyncio.new_event_loop().run_until_complete(
        pi.grant_escrow_party("esc-1", "u-1", "guarantor"))
    assert ok is True
    assert calls[0][2]["relation"] == "guarantor"
    assert calls[0][2]["entity_type"] == "escrow"


def test_grant_escrow_party_unknown_role_falls_back_to_witness():
    calls = _install_permify_stub()
    pi = _fresh_module()
    asyncio.new_event_loop().run_until_complete(
        pi.grant_escrow_party("esc-1", "u-1", "mystery"))
    assert calls[0][2]["relation"] == "witness"


def test_check_fails_open_when_permify_unreachable():
    _install_permify_stub(raise_exc=ConnectionError("permify down"))
    pi = _fresh_module()
    allowed = asyncio.new_event_loop().run_until_complete(
        pi.check_escrow_permission("esc-1", "u-1", "approve"))
    assert allowed is True  # DB-level checks still enforce; gap is logged


def test_check_denies_when_permify_denies():
    _install_permify_stub(check_allowed=False)
    pi = _fresh_module()
    allowed = asyncio.new_event_loop().run_until_complete(
        pi.check_escrow_permission("esc-1", "u-1", "approve"))
    assert allowed is False


def test_virtual_account_owner_grant():
    calls = _install_permify_stub()
    pi = _fresh_module()
    ok = asyncio.new_event_loop().run_until_complete(
        pi.grant_virtual_account_owner("va-9", "u-2"))
    assert ok is True
    assert calls[0][2]["relation"] == "owner"
    assert calls[0][2]["entity_type"] == "virtual_account"


def test_grant_failure_returns_false_not_exception():
    _install_permify_stub(raise_exc=RuntimeError("boom"))
    pi = _fresh_module()
    ok = asyncio.new_event_loop().run_until_complete(
        pi.grant_credit_assessment_subject("ca-1", "u-3"))
    assert ok is False
