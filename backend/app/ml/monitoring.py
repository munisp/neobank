"""Model monitoring: drift detection (PSI) + score telemetry + A/B routing.

PSI (Population Stability Index) compares the live feature/score
distribution against the training baseline. Thresholds:
  PSI < 0.1  no drift
  0.1-0.25   moderate drift — alert
  > 0.25     significant drift — trigger retraining (continuous_training.py)
"""

import hashlib
import json
import math
import time
from typing import Any, Dict, List, Optional

import numpy as np
import structlog

logger = structlog.get_logger(__name__)


def psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index between two 1-D distributions."""
    breakpoints = np.quantile(expected, np.linspace(0, 1, bins + 1))
    breakpoints[0], breakpoints[-1] = -np.inf, np.inf
    e, _ = np.histogram(expected, bins=breakpoints)
    a, _ = np.histogram(actual, bins=breakpoints)
    e_pct = np.clip(e / max(e.sum(), 1), 1e-4, None)
    a_pct = np.clip(a / max(a.sum(), 1), 1e-4, None)
    return float(np.sum((a_pct - e_pct) * np.log(a_pct / e_pct)))


class DriftMonitor:
    """Redis-backed rolling window of live scores/features per model."""

    def __init__(self, redis_url: str = "redis://localhost:6379/0", window: int = 5000):
        self.redis_url = redis_url
        self.window = window
        self._redis = None

    async def _client(self):
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(self.redis_url, decode_responses=True,
                                                socket_timeout=0.5)
                await self._redis.ping()
            except Exception:  # noqa: BLE001
                self._redis = None
        return self._redis

    async def record_score(self, model: str, score: float) -> None:
        r = await self._client()
        if not r:
            return
        key = f"ml:scores:{model}"
        try:
            pipe = r.pipeline()
            pipe.lpush(key, score)
            pipe.ltrim(key, 0, self.window - 1)
            await pipe.execute()
        except Exception:  # noqa: BLE001
            pass

    async def drift_report(self, model: str, baseline_scores: np.ndarray) -> Dict[str, Any]:
        r = await self._client()
        if not r:
            return {"available": False, "detail": "redis unavailable"}
        try:
            raw = await r.lrange(f"ml:scores:{model}", 0, self.window - 1)
        except Exception:  # noqa: BLE001
            return {"available": False, "detail": "redis read failed"}
        if len(raw) < 200:
            return {"available": False, "detail": f"insufficient live samples ({len(raw)})"}
        live = np.array([float(x) for x in raw])
        value = psi(baseline_scores, live)
        verdict = ("ok" if value < 0.1 else
                   "moderate_drift" if value < 0.25 else "significant_drift")
        report = {
            "available": True, "model": model, "psi": round(value, 4),
            "verdict": verdict, "live_samples": len(live),
            "live_mean": round(float(live.mean()), 4),
            "timestamp": int(time.time()),
        }
        if verdict == "significant_drift":
            logger.warning("ml_drift_detected", **report)
        return report


class ABRouter:
    """Champion/challenger routing with consistent hashing on account_id.
    Deterministic per account (no flapping), configurable challenger share."""

    def __init__(self, challenger_share: float = 0.10):
        self.challenger_share = challenger_share

    def assign(self, account_id: str) -> str:
        digest = hashlib.sha256(account_id.encode()).hexdigest()
        bucket = int(digest[:8], 16) % 10_000 / 10_000.0
        return "challenger" if bucket < self.challenger_share else "champion"

    def assignment_payload(self, account_id: str, registry: Dict[str, Any]) -> Dict[str, Any]:
        cohort = self.assign(account_id)
        return {"cohort": cohort,
                "champion": {k: v.get("version") for k, v in registry.items()
                             if v.get("status") == "champion"},
                "challenger_share": self.challenger_share}


_monitor: Optional[DriftMonitor] = None


def get_drift_monitor() -> DriftMonitor:
    global _monitor
    if _monitor is None:
        _monitor = DriftMonitor()
    return _monitor
