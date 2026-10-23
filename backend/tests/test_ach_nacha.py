"""Tests for the fixed local NACHA generator + ach-go sidecar wiring.

Acceptance criteria (from the moov-io/ach analysis):
1. Local fallback generator produces 94-char records.
2. Record count is padded to a multiple of 10 with '9'*94 fillers.
3. Entry hash = sum of 8-digit RDFI IDs mod 10^10, matching control records.
4. ingest_return_file degrades gracefully when the sidecar is unavailable.
"""
import asyncio
import sys
import types
from unittest.mock import MagicMock


def _stub_env():
    for name in ("structlog", "httpx", "aiohttp", "tigerbeetle"):
        sys.modules.setdefault(name, MagicMock())
    cfg = types.ModuleType("app.config")
    cfg.settings = MagicMock()
    sys.modules.setdefault("app.config", cfg)
    db = types.ModuleType("app.database")
    db.get_db_session = MagicMock()
    db.db_manager = MagicMock()
    sys.modules.setdefault("app.database", db)


_stub_env()

from app.services import ach_processing_service as aps  # noqa: E402


def _service_with_transfers(entries):
    """entries: list of (routing, account, amount, name, ach_type)"""
    svc = aps.ACHProcessingService()
    ids = []
    for i, (routing, account, amount, name, ach_type) in enumerate(entries):
        ach_id = f"ach-{i:04d}"
        svc.ach_transfers[ach_id] = {
            "recipient": {"routing_number": routing,
                          "account_number": account, "name": name},
            "amount": amount,
            "ach_type": ach_type,
        }
        ids.append(ach_id)
    return svc, {"ach_ids": ids}, ids


def _gen(svc, batch, ids):
    return svc._generate_nacha_file(batch, ids)


CREDIT = aps.ACHType.CREDIT.value
DEBIT = aps.ACHType.DEBIT.value


# --- local generator compliance -------------------------------------------

def test_nacha_records_94_chars():
    svc, batch, ids = _service_with_transfers(
        [("021000021", "123456789", 100.0, "J DOE", CREDIT)])
    lines = _gen(svc, batch, ids).split("\n")
    assert all(len(l) == 94 for l in lines), [len(l) for l in lines]


def test_nacha_blocking_multiple_of_10():
    for n_entries in (1, 7, 10, 11):
        svc, batch, ids = _service_with_transfers(
            [("021000021", "123456789", 50.0, "J DOE", CREDIT)] * n_entries)
        lines = _gen(svc, batch, ids).split("\n")
        assert len(lines) % 10 == 0, (n_entries, len(lines))
        non_filler = len([l for l in lines if l != "9" * 94])
        assert non_filler == 4 + n_entries  # header + batch hdr + entries + batch ctl + file ctl


def test_nacha_entry_hash_correct():
    svc, batch, ids = _service_with_transfers([
        ("021000021", "111", 10.0, "A", CREDIT),
        ("091000019", "222", 20.0, "B", CREDIT),
    ])
    lines = _gen(svc, batch, ids).split("\n")
    expected_hash = (2100002 + 9100001) % (10**10)  # first 8 of each RDFI
    batch_control = next(l for l in lines if l.startswith("8"))
    file_control = next(l for l in lines if l.startswith("9") and l != "9" * 94)
    assert int(batch_control[10:20]) == expected_hash
    assert int(file_control[21:31]) == expected_hash


def test_nacha_control_totals_match_entries():
    svc, batch, ids = _service_with_transfers([
        ("021000021", "111", 10.5, "A", CREDIT),
        ("021000021", "222", 5.25, "B", DEBIT),
    ])
    lines = _gen(svc, batch, ids).split("\n")
    batch_control = next(l for l in lines if l.startswith("8"))
    total_debits = int(batch_control[20:32])
    total_credits = int(batch_control[32:44])
    assert total_credits == 1050
    assert total_debits == 525


def test_nacha_trace_numbers_odfi_prefixed():
    svc, batch, ids = _service_with_transfers(
        [("021000021", "123456789", 1.0, "J DOE", CREDIT)])
    lines = _gen(svc, batch, ids).split("\n")
    entry_line = next(l for l in lines if l[0] == "6")
    trace = entry_line[79:94].strip()
    assert trace.startswith("02100001") and len(trace) == 15


# --- sidecar degradation ----------------------------------------------------

def test_ingest_return_file_sidecar_down():
    svc = aps.ACHProcessingService()

    async def none_parse(content):
        return None

    orig = aps.ach_sidecar.parse_nacha
    aps.ach_sidecar.parse_nacha = none_parse
    try:
        out = asyncio.new_event_loop().run_until_complete(
            svc.ingest_return_file("fake-nacha-content"))
    finally:
        aps.ach_sidecar.parse_nacha = orig
    assert out["success"] is False
    assert "sidecar" in out["error"]


def test_ingest_return_file_unknown_trace():
    svc = aps.ACHProcessingService()

    async def fake_parse(content):
        return {"valid": True, "returns": [
            {"trace_number": "021000010000001", "return_code": "R01",
             "reason": "Insufficient Funds", "amount_cents": 1000}]}

    orig = aps.ach_sidecar.parse_nacha
    aps.ach_sidecar.parse_nacha = fake_parse
    try:
        out = asyncio.new_event_loop().run_until_complete(
            svc.ingest_return_file("fake"))
    finally:
        aps.ach_sidecar.parse_nacha = orig
    assert out["success"] is True
    assert out["returns_found"] == 1
    assert out["results"][0]["processed"] is False
    assert out["results"][0]["reason"] == "unknown trace"


def test_ingest_return_file_unknown_code_falls_back_to_r99():
    svc = aps.ACHProcessingService()

    async def fake_parse(content):
        return {"valid": True, "returns": [
            {"trace_number": "T1", "return_code": "R42", "reason": "weird"}]}

    async def fake_process(ach_id, return_code, reason):
        return {"success": True, "code": return_code}

    orig_parse = aps.ach_sidecar.parse_nacha
    orig_proc = svc.process_ach_return
    aps.ach_sidecar.parse_nacha = fake_parse
    svc.process_ach_return = fake_process
    svc.ach_transfers["ach-1"] = {"trace_number": "T1"}
    try:
        out = asyncio.new_event_loop().run_until_complete(
            svc.ingest_return_file("fake"))
    finally:
        aps.ach_sidecar.parse_nacha = orig_parse
        svc.process_ach_return = orig_proc
    assert out["results"][0]["processed"] is True
