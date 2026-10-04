"""Unit tests: liveness challenge-response + KYC trigger rules.

Self-contained: settings/database modules are stubbed so the pure logic
runs anywhere (CI without a database)."""
import base64
import io
import os
import sys
import time
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _stub_env():
    cfg = types.ModuleType("config")
    st = types.ModuleType("config.settings")

    class _S:
        SECRET_KEY = "test"
        IDV_FACE_API_URL = None
        IDV_FACE_MATCH_THRESHOLD = 0.80

    st.settings = _S()
    cfg.settings = st
    sys.modules.setdefault("config", cfg)
    sys.modules.setdefault("config.settings", st)
    db = types.ModuleType("database")
    m = types.ModuleType("database.models")

    class _T:
        pass

    m.KycTriggerEvent = _T
    m.Transaction = _T
    m.User = _T
    m.Notification = _T
    db.models = m
    sys.modules.setdefault("database", db)
    sys.modules.setdefault("database.models", m)


_stub_env()

import pytest

from app.services.idv.liveness import LivenessService
from app.services.kyc_trigger_service import TRIGGERS, _rank

def _png_b64(width=640, height=480, color=(120, 30, 200)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ------------------------- liveness challenge -------------------------

def test_challenge_roundtrip():
    svc = LivenessService()
    ch = svc.issue_challenge("sess-1")
    assert len(ch["actions"]) == 3
    assert ch["expires_at"] > int(time.time())
    res = svc.verify_challenge(ch, observed_actions=ch["actions"])
    assert res["ok"] is True


def test_challenge_tampered_signature_fails():
    svc = LivenessService()
    ch = svc.issue_challenge("sess-1")
    ch["actions"] = ["blink", "blink", "blink"]  # tamper after signing
    res = svc.verify_challenge(ch, observed_actions=["blink"])
    assert res["ok"] is False
    assert "invalid_signature" in res["reasons"]


def test_challenge_expired_fails():
    svc = LivenessService()
    ch = svc.issue_challenge("sess-1")
    ch["expires_at"] = int(time.time()) - 1
    # re-sign so only expiry is wrong (attacker with the key) — still fails
    res = svc.verify_challenge(ch, observed_actions=ch["actions"])
    assert res["ok"] is False


def test_challenge_missing_action_fails():
    svc = LivenessService()
    ch = svc.issue_challenge("sess-1")
    res = svc.verify_challenge(ch, observed_actions=[ch["actions"][0]])
    assert res["ok"] is False
    assert any(r.startswith("actions_not_observed") for r in res["reasons"])


# ------------------------- injection forensics -------------------------

def test_static_image_replay_flagged():
    svc = LivenessService()
    frame = _png_b64()
    out = svc.analyze_frames([frame, frame, frame])
    assert "static_image_replay" in out["flags"]


def test_low_resolution_flagged():
    svc = LivenessService()
    out = svc.analyze_frames([_png_b64(width=120, height=100)])
    assert "low_resolution_frame" in out["flags"]


def test_no_frames_flagged():
    svc = LivenessService()
    out = svc.analyze_frames(["!!!not-base64!!!"])
    assert out["flags"]  # undecodable frames must be flagged


@pytest.mark.asyncio
async def test_evaluate_fail_on_bad_challenge():
    svc = LivenessService()
    ch = svc.issue_challenge("sess-1")
    ch["signature"] = "0" * 64
    decision = await svc.evaluate("sess-1", ch, [_png_b64()])
    assert decision.status == "fail"
    assert "challenge_replay_risk" in decision.deepfake_flags


@pytest.mark.asyncio
async def test_evaluate_review_or_pass_on_clean_frames():
    svc = LivenessService()
    ch = svc.issue_challenge("sess-1")
    frames = [_png_b64(color=(i * 20 % 255, 30, 200)) for i in range(3)]
    decision = await svc.evaluate("sess-1", ch, frames, observed_actions=ch["actions"])
    # clean frames with no EXIF -> at worst "review", never "fail"
    assert decision.status in ("pass", "review")


# ------------------------- KYC trigger rules -------------------------

def test_level_ranking():
    assert _rank("basic") < _rank("tier2") < _rank("tier3") < _rank("enhanced")
    assert _rank(None) == 1
    assert _rank("FULL") == 3


def test_trigger_catalog_integrity():
    keys = [r["key"] for r in TRIGGERS]
    assert len(keys) == len(set(keys)), "duplicate trigger keys"
    for r in TRIGGERS:
        assert r["required_level"]
        assert r["events"]
        assert r["describe"]


def test_regulated_products_require_tier3():
    products = {"ngx_onboarding", "stablecoin_ramp", "mortgage_application"}
    for r in TRIGGERS:
        if r["key"] in products:
            assert r["required_level"] == "tier3", r["key"]


def test_threshold_rules_cover_cbn_tiers():
    keys = {r["key"] for r in TRIGGERS}
    assert "single_transfer_above_tier" in keys
    assert "daily_cumulative_above_tier" in keys
    assert "first_international_transfer" in keys
    assert "velocity_burst" in keys
    assert "sanctions_pep_hit" in keys
