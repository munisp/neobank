"""
Redis-backed sliding-window rate limiter.

Uses a Redis sorted set per key (score = timestamp-ms) trimmed via pipeline.
Falls back to a bounded in-memory counter when Redis is unavailable, so the
application never fails closed on infra blips but never grows unbounded.
"""

import logging
import threading
import time
from collections import defaultdict
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import redis
except ImportError:  # pragma: no cover
    redis = None


class RedisSlidingWindowRateLimiter:
    """Sliding window rate limiter backed by Redis (ZSET), memory fallback."""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        key_prefix: str = "rl",
        fallback_max_keys: int = 100_000,
    ):
        self.redis_url = redis_url
        self.key_prefix = key_prefix
        self.fallback_max_keys = fallback_max_keys
        self._client: Optional["redis.Redis"] = None
        self._client_failed_at: float = 0
        self._retry_after_seconds = 5.0
        self._lock = threading.Lock()
        # fallback: key -> list of timestamps (seconds)
        self._memory: dict = defaultdict(list)

    # -- redis plumbing ------------------------------------------------------
    def _get_client(self) -> Optional["redis.Redis"]:
        if redis is None:
            return None
        now = time.monotonic()
        if self._client is None:
            if now - self._client_failed_at < self._retry_after_seconds:
                return None
            try:
                client = redis.Redis.from_url(
                    self.redis_url,
                    socket_connect_timeout=1.0,
                    socket_timeout=1.0,
                    decode_responses=True,
                )
                client.ping()
                self._client = client
            except Exception as exc:  # noqa: BLE001
                logger.warning("rate limiter: redis unavailable (%s), using memory fallback", exc)
                self._client_failed_at = now
                return None
        return self._client

    def _reset_client(self) -> None:
        try:
            if self._client is not None:
                self._client.close()
        except Exception:  # noqa: BLE001
            pass
        self._client = None
        self._client_failed_at = time.monotonic()

    def _key(self, key: str) -> str:
        return f"{self.key_prefix}:{key}"

    # -- core algorithm --------------------------------------------------------
    def _redis_hit(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        """Record a hit in Redis; return True if allowed."""
        client = self._get_client()
        if client is None:
            raise RuntimeError("redis unavailable")

        now_ms = int(time.time() * 1000)
        window_ms = window_seconds * 1000
        cutoff = now_ms - window_ms
        rkey = self._key(key)

        pipe = client.pipeline(transaction=True)
        pipe.zremrangebyscore(rkey, 0, cutoff)
        pipe.zcard(rkey)
        pipe.zadd(rkey, {f"{now_ms}": now_ms})
        pipe.expire(rkey, window_seconds)
        _, count, *_ = pipe.execute()
        return count < max_attempts

    def _memory_hit(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            if len(self._memory) > self.fallback_max_keys:
                # bounded fallback: drop stale keys
                for k in list(self._memory.keys()):
                    if not self._memory[k] or self._memory[k][-1] < cutoff:
                        self._memory.pop(k, None)
            hits = [t for t in self._memory[key] if t > cutoff]
            allowed = len(hits) < max_attempts
            hits.append(now)
            self._memory[key] = hits
            return allowed

    def hit(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        """Record an attempt; True if within limit."""
        try:
            return self._redis_hit(key, max_attempts, window_seconds)
        except Exception:  # noqa: BLE001
            self._reset_client()
            return self._memory_hit(key, max_attempts, window_seconds)

    async def ahit(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        """Async wrapper (redis client is sync; calls are ~1ms with 1s timeouts)."""
        return self.hit(key, max_attempts, window_seconds)

    def reset(self, key: str) -> None:
        """Clear all attempts for a key (e.g. after successful login)."""
        client = self._get_client()
        if client is not None:
            try:
                client.delete(self._key(key))
            except Exception:  # noqa: BLE001
                self._reset_client()
        with self._lock:
            self._memory.pop(key, None)


from config.settings import settings  # noqa: E402

_redis_url = getattr(settings, "REDIS_URL", None) or "redis://localhost:6379/0"

# Singletons used across the app
auth_rate_limiter = RedisSlidingWindowRateLimiter(_redis_url, key_prefix="rl:auth")
api_rate_limiter = RedisSlidingWindowRateLimiter(_redis_url, key_prefix="rl:api")
