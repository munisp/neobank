"""Redis-backed response caching for hot read paths.

Targets sub-10ms reads for expensive, frequently-polled endpoints
(dashboard overview, account summary, exchange rates) without changing
their business logic. Fails open: if Redis is unavailable the handler
runs normally.

Usage:
    @cached("dashboard:overview", ttl=15, key_from=lambda u: u["id"])
    async def overview(...): ...
or the lower-level cache_get / cache_set / cache_invalidate helpers.
"""

import functools
import hashlib
import json
from typing import Any, Callable, Optional

import structlog

logger = structlog.get_logger(__name__)

_redis = None
_redis_failed = False


async def _get_redis():
    """Lazy shared async redis client (fail-open)."""
    global _redis, _redis_failed
    if _redis is not None or _redis_failed:
        return _redis
    try:
        import redis.asyncio as aioredis
        from config.settings import settings

        _redis = aioredis.from_url(
            str(getattr(settings, "REDIS_URL", "redis://localhost:6379/0")),
            socket_timeout=0.5,
            socket_connect_timeout=0.5,
            decode_responses=True,
        )
        await _redis.ping()
    except Exception as exc:  # noqa: BLE001
        logger.warning("response_cache_redis_unavailable", error=str(exc))
        _redis_failed = True
        _redis = None
    return _redis


def _make_key(namespace: str, parts: tuple) -> str:
    raw = ":".join(str(p) for p in parts if p is not None)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"rc:{namespace}:{digest}"


async def cache_get(namespace: str, *parts) -> Optional[Any]:
    r = await _get_redis()
    if r is None:
        return None
    try:
        blob = await r.get(_make_key(namespace, parts))
        return json.loads(blob) if blob is not None else None
    except Exception:  # noqa: BLE001
        return None


async def cache_set(namespace: str, value: Any, ttl: int, *parts) -> None:
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.set(_make_key(namespace, parts), json.dumps(value, default=str), ex=ttl)
    except Exception:  # noqa: BLE001
        pass


async def cache_invalidate(namespace: str, *parts) -> None:
    r = await _get_redis()
    if r is None:
        return
    try:
        if parts:
            await r.delete(_make_key(namespace, parts))
        else:
            async for key in r.scan_iter(f"rc:{namespace}:*", count=100):
                await r.delete(key)
    except Exception:  # noqa: BLE001
        pass


def cached(namespace: str, ttl: int = 15, key_from: Optional[Callable[..., tuple]] = None):
    """Decorator: cache an async endpoint's JSON-serialisable return value."""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            parts = key_from(*args, **kwargs) if key_from else ()
            hit = await cache_get(namespace, *parts)
            if hit is not None:
                return hit
            result = await func(*args, **kwargs)
            await cache_set(namespace, result, ttl, *parts)
            return result
        return wrapper
    return decorator
