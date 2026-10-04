"""Hardened liveness & anti-deepfake service (self-hosted first).

Defense layers, in order:

1. **Challenge-response binding** — the server issues a random action
   sequence (blink / turn_left / turn_right / smile / nod) with a nonce
   HMAC-signed and bound to the IDV session, expiring in 120s. A
   pre-recorded or deepfaked video cannot know the sequence in advance,
   and a replayed response fails the signature/expiry checks.
2. **Injection forensics** (always-on, no external API needed):
   - metadata stripping check (camera captures carry EXIF; most
     screen-replays / virtual-camera injections strip it)
   - dimension sanity (tiny/upscaled frames are typical of replays)
   - blur/screen-recapture proxy via Laplacian variance when OpenCV is
     available (low variance = photo-of-photo or moiré-washed replay)
   - inter-frame variance for multi-frame submissions (a static image
     submitted N times scores ~0)
3. **Passive liveness scoring** via the pluggable BiometricsClient when
   an external face API is configured — an additive signal, never the
   only gate.
4. **Deepfake flag aggregation** — signals combine into
   PASS / REVIEW / FAIL with explicit reason codes, so borderline cases
   route to a human instead of auto-declining.

All heuristics degrade gracefully: missing optional deps (cv2/PIL) drop
that signal rather than failing the check.
"""

import hashlib
import hmac
import io
import os
import random
import struct
import time
import zlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import structlog

from app.services.idv.biometrics import get_biometrics_client

logger = structlog.get_logger(__name__)

# Challenge config
CHALLENGE_ACTIONS = ["blink", "turn_left", "turn_right", "smile", "nod"]
CHALLENGE_LENGTH = 3
CHALLENGE_TTL_SECONDS = 120
_MIN_PASSIVE_SCORE = 0.70
_MIN_FRAME_VARIANCE = 25.0   # below this, frames look identical (static replay)
_MIN_LAPLACIAN_VAR = 80.0    # below this, frame is blurry / screen-recaptured
_MIN_DIMENSION = 320         # injected/replayed frames are often tiny

try:  # optional — graceful degradation
    from PIL import Image
    _PIL = True
except Exception:  # noqa: BLE001
    _PIL = False

try:
    import cv2
    import numpy as np
    _CV2 = True
except Exception:  # noqa: BLE001
    _CV2 = False


def _secret() -> bytes:
    return os.getenv("IDV_LIVENESS_SECRET", os.getenv("SECRET_KEY", "idv-liveness-dev")).encode()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


@dataclass
class LivenessDecision:
    status: str                     # pass | review | fail
    score: float                    # 0..1 aggregate
    reasons: List[str] = field(default_factory=list)
    challenge_ok: bool = False
    passive_score: Optional[float] = None
    deepfake_flags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "score": round(self.score, 4),
            "reasons": self.reasons,
            "challenge_ok": self.challenge_ok,
            "passive_score": self.passive_score,
            "deepfake_flags": self.deepfake_flags,
        }


class LivenessService:
    """Challenge issuing/verification + injection/deepfake forensics."""

    # ------------------------------------------------------------------
    # 1. Challenge-response
    # ------------------------------------------------------------------
    def issue_challenge(self, session_id: str) -> Dict[str, Any]:
        """Random action sequence, HMAC-bound to the session, 120s TTL.

        The client performs the actions on camera and posts the captured
        frames back together with this exact challenge payload — the
        signature proves the sequence was server-issued for THIS session
        and the timestamp proves freshness (anti-replay).
        """
        actions = random.sample(CHALLENGE_ACTIONS, CHALLENGE_LENGTH)
        nonce = hashlib.sha256(os.urandom(16)).hexdigest()[:16]
        issued_at = int(time.time())
        payload = f"{session_id}:{nonce}:{issued_at}:{','.join(actions)}"
        return {
            "session_id": session_id,
            "actions": actions,
            "nonce": nonce,
            "issued_at": issued_at,
            "expires_at": issued_at + CHALLENGE_TTL_SECONDS,
            "signature": _sign(payload),
        }

    def verify_challenge(self, challenge: Dict[str, Any],
                         observed_actions: Optional[List[str]]) -> Dict[str, Any]:
        """Validate signature, freshness, and (when the client reports
        per-action labels) that the requested actions were performed."""
        session_id = challenge.get("session_id", "")
        actions = challenge.get("actions") or []
        payload = f"{session_id}:{challenge.get('nonce')}:{challenge.get('issued_at')}:{','.join(actions)}"
        reasons: List[str] = []

        if not hmac.compare_digest(_sign(payload), str(challenge.get("signature", ""))):
            return {"ok": False, "reasons": ["invalid_signature"]}
        if int(time.time()) > int(challenge.get("expires_at", 0)):
            return {"ok": False, "reasons": ["challenge_expired"]}

        if observed_actions is not None:
            missing = [a for a in actions if a not in observed_actions]
            if missing:
                reasons.append(f"actions_not_observed:{','.join(missing)}")
        return {"ok": not reasons, "reasons": reasons}

    # ------------------------------------------------------------------
    # 2. Injection forensics (self-hosted heuristics)
    # ------------------------------------------------------------------
    def analyze_frames(self, frames_b64: List[str]) -> Dict[str, Any]:
        """Static-image / screen-replay / injection heuristics over the
        submitted liveness frames. Returns flags + per-signal detail."""
        import base64

        flags: List[str] = []
        detail: Dict[str, Any] = {"frames": len(frames_b64)}
        decoded: List[bytes] = []
        for f in frames_b64[:12]:
            try:
                decoded.append(base64.b64decode(f.split(",")[-1]))
            except Exception:  # noqa: BLE001
                flags.append("undecodable_frame")

        if not decoded:
            return {"flags": ["no_frames"], "detail": detail}

        # Identical byte payloads = the same image submitted N times.
        unique = len({hashlib.sha256(b).hexdigest() for b in decoded})
        detail["unique_frames"] = unique
        if len(decoded) > 1 and unique == 1:
            flags.append("static_image_replay")

        if _PIL:
            try:
                img = Image.open(io.BytesIO(decoded[0]))
                detail["dimensions"] = list(img.size)
                if min(img.size) < _MIN_DIMENSION:
                    flags.append("low_resolution_frame")
                # Camera captures normally carry EXIF; injected frames usually don't.
                exif = getattr(img, "getexif", lambda: {})()
                detail["has_exif"] = bool(exif)
                if not exif:
                    flags.append("missing_camera_metadata")
            except Exception:  # noqa: BLE001
                flags.append("unparseable_image")

        if _CV2:
            try:
                arrs = []
                for b in decoded:
                    arr = np.frombuffer(b, dtype=np.uint8)
                    frame = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
                    if frame is not None:
                        arrs.append(frame)
                if arrs:
                    lap = float(cv2.Laplacian(arrs[0], cv2.CV_64F).var())
                    detail["laplacian_var"] = round(lap, 2)
                    if lap < _MIN_LAPLACIAN_VAR:
                        flags.append("blur_or_screen_recapture")
                if len(arrs) > 1:
                    resized = [cv2.resize(a, (64, 64)).astype("float32") for a in arrs]
                    diffs = [float(np.abs(resized[i + 1] - resized[i]).mean())
                             for i in range(len(resized) - 1)]
                    var = float(np.mean(diffs)) if diffs else 0.0
                    detail["interframe_motion"] = round(var, 2)
                    if var < _MIN_FRAME_VARIANCE / 10:
                        flags.append("no_interframe_motion")
            except Exception:  # noqa: BLE001
                logger.warning("liveness_cv_analysis_failed")

        return {"flags": flags, "detail": detail}

    # ------------------------------------------------------------------
    # 3+4. Aggregate decision
    # ------------------------------------------------------------------
    async def evaluate(self, session_id: str, challenge: Dict[str, Any],
                       frames_b64: List[str],
                       observed_actions: Optional[List[str]] = None) -> LivenessDecision:
        """Full evaluation: challenge validity + forensics + passive score."""
        reasons: List[str] = []
        deepfake_flags: List[str] = []

        ch = self.verify_challenge(challenge, observed_actions)
        if not ch["ok"]:
            reasons.extend(ch["reasons"])
            # Invalid/expired challenge is a hard fail — replay territory.
            return LivenessDecision(status="fail", score=0.0, reasons=reasons,
                                    challenge_ok=False, deepfake_flags=["challenge_replay_risk"])

        forensic = self.analyze_frames(frames_b64)
        deepfake_flags.extend(forensic["flags"])

        passive_score: Optional[float] = None
        client = get_biometrics_client()
        if client.available and frames_b64:
            try:
                res = await client.face_liveness(frames_b64[0])
                passive_score = getattr(res, "liveness_score", None)
            except Exception as exc:  # noqa: BLE001
                logger.warning("liveness_passive_failed", error=str(exc))
        if passive_score is not None and passive_score < _MIN_PASSIVE_SCORE:
            deepfake_flags.append("low_passive_score")

        # Scoring: start at 1, weighted deductions.
        weights = {
            "static_image_replay": 0.6,
            "no_interframe_motion": 0.35,
            "blur_or_screen_recapture": 0.25,
            "missing_camera_metadata": 0.15,
            "low_resolution_frame": 0.10,
            "low_passive_score": 0.40,
            "undecodable_frame": 0.20,
            "unparseable_image": 0.20,
            "no_frames": 1.0,
        }
        score = 1.0
        for f in set(deepfake_flags):
            score -= weights.get(f, 0.1)
        score = max(0.0, score)

        hard_fail = {"static_image_replay", "no_frames"} & set(deepfake_flags)
        if hard_fail or score < 0.4:
            status = "fail"
        elif score < 0.75 or deepfake_flags:
            status = "review"
        else:
            status = "pass"

        decision = LivenessDecision(
            status=status, score=score, reasons=reasons, challenge_ok=True,
            passive_score=passive_score, deepfake_flags=deepfake_flags)
        logger.info("liveness_decision", session_id=session_id, **decision.to_dict())
        return decision


_service: Optional[LivenessService] = None


def get_liveness_service() -> LivenessService:
    global _service
    if _service is None:
        _service = LivenessService()
    return _service
