"""
Cache Service - Redis Caching Layer

Provides caching for:
- User sessions and tokens
- Account balances
- Exchange rates
- Stock prices
- Frequently accessed data
"""

import asyncio
import json
import os
import hashlib
from typing import Any, Optional, Dict, List, Callable, TypeVar, Union
from datetime import datetime, timedelta
from functools import wraps
from dataclasses import dataclass
from enum import Enum
import structlog

logger = structlog.get_logger(__name__)

T = TypeVar('T')


class CacheBackend(str, Enum):
    REDIS = "redis"
    MEMORY = "memory"


@dataclass
class CacheConfig:
    backend: CacheBackend = CacheBackend.MEMORY
    redis_url: str = "redis://localhost:6379"
    default_ttl: int = 300
    max_memory_items: int = 10000
    key_prefix: str = "neobank:"


class MemoryCache:
    """In-memory cache implementation for development/fallback"""
    
    def __init__(self, max_items: int = 10000):
        self.cache: Dict[str, tuple] = {}
        self.max_items = max_items
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            if key in self.cache:
                value, expiry = self.cache[key]
                if expiry is None or expiry > datetime.utcnow():
                    return value
                del self.cache[key]
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None):
        async with self._lock:
            if len(self.cache) >= self.max_items:
                await self._evict_expired()
                if len(self.cache) >= self.max_items:
                    oldest_key = next(iter(self.cache))
                    del self.cache[oldest_key]
            
            expiry = datetime.utcnow() + timedelta(seconds=ttl) if ttl else None
            self.cache[key] = (value, expiry)
    
    async def delete(self, key: str) -> bool:
        async with self._lock:
            if key in self.cache:
                del self.cache[key]
                return True
            return False
    
    async def exists(self, key: str) -> bool:
        return await self.get(key) is not None
    
    async def clear(self):
        async with self._lock:
            self.cache.clear()
    
    async def _evict_expired(self):
        now = datetime.utcnow()
        expired = [k for k, (_, exp) in self.cache.items() if exp and exp <= now]
        for key in expired:
            del self.cache[key]
    
    async def keys(self, pattern: str = "*") -> List[str]:
        async with self._lock:
            if pattern == "*":
                return list(self.cache.keys())
            import fnmatch
            return [k for k in self.cache.keys() if fnmatch.fnmatch(k, pattern)]
    
    async def mget(self, keys: List[str]) -> List[Optional[Any]]:
        return [await self.get(k) for k in keys]
    
    async def mset(self, mapping: Dict[str, Any], ttl: Optional[int] = None):
        for key, value in mapping.items():
            await self.set(key, value, ttl)
    
    async def incr(self, key: str, amount: int = 1) -> int:
        async with self._lock:
            current = 0
            if key in self.cache:
                value, expiry = self.cache[key]
                if expiry is None or expiry > datetime.utcnow():
                    current = int(value)
            new_value = current + amount
            self.cache[key] = (new_value, self.cache.get(key, (None, None))[1])
            return new_value


class RedisCache:
    """Redis cache implementation for production"""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._client = None
        self._connected = False
    
    async def _get_client(self):
        if self._client is None:
            try:
                import redis.asyncio as redis
                self._client = redis.from_url(self.redis_url, decode_responses=True)
                await self._client.ping()
                self._connected = True
                logger.info("redis_connected", url=self.redis_url)
            except Exception as e:
                logger.error("redis_connection_failed", error=str(e))
                self._connected = False
                raise
        return self._client
    
    async def get(self, key: str) -> Optional[Any]:
        try:
            client = await self._get_client()
            value = await client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error("redis_get_failed", key=key, error=str(e))
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None):
        try:
            client = await self._get_client()
            serialized = json.dumps(value, default=str)
            if ttl:
                await client.setex(key, ttl, serialized)
            else:
                await client.set(key, serialized)
        except Exception as e:
            logger.error("redis_set_failed", key=key, error=str(e))
    
    async def delete(self, key: str) -> bool:
        try:
            client = await self._get_client()
            result = await client.delete(key)
            return result > 0
        except Exception as e:
            logger.error("redis_delete_failed", key=key, error=str(e))
            return False
    
    async def exists(self, key: str) -> bool:
        try:
            client = await self._get_client()
            return await client.exists(key) > 0
        except Exception as e:
            logger.error("redis_exists_failed", key=key, error=str(e))
            return False
    
    async def clear(self):
        try:
            client = await self._get_client()
            await client.flushdb()
        except Exception as e:
            logger.error("redis_clear_failed", error=str(e))
    
    async def keys(self, pattern: str = "*") -> List[str]:
        try:
            client = await self._get_client()
            return await client.keys(pattern)
        except Exception as e:
            logger.error("redis_keys_failed", pattern=pattern, error=str(e))
            return []
    
    async def mget(self, keys: List[str]) -> List[Optional[Any]]:
        try:
            client = await self._get_client()
            values = await client.mget(keys)
            return [json.loads(v) if v else None for v in values]
        except Exception as e:
            logger.error("redis_mget_failed", error=str(e))
            return [None] * len(keys)
    
    async def mset(self, mapping: Dict[str, Any], ttl: Optional[int] = None):
        try:
            client = await self._get_client()
            serialized = {k: json.dumps(v, default=str) for k, v in mapping.items()}
            await client.mset(serialized)
            if ttl:
                for key in mapping.keys():
                    await client.expire(key, ttl)
        except Exception as e:
            logger.error("redis_mset_failed", error=str(e))
    
    async def incr(self, key: str, amount: int = 1) -> int:
        try:
            client = await self._get_client()
            return await client.incrby(key, amount)
        except Exception as e:
            logger.error("redis_incr_failed", key=key, error=str(e))
            return 0


class CacheService:
    """Main cache service with automatic backend selection"""
    
    def __init__(self, config: CacheConfig = None):
        self.config = config or CacheConfig()
        self._backend: Union[MemoryCache, RedisCache] = None
        self._fallback = MemoryCache(self.config.max_memory_items)
    
    async def _get_backend(self):
        if self._backend is None:
            if self.config.backend == CacheBackend.REDIS:
                try:
                    self._backend = RedisCache(self.config.redis_url)
                    await self._backend._get_client()
                except Exception:
                    logger.warning("redis_unavailable_using_memory")
                    self._backend = self._fallback
            else:
                self._backend = self._fallback
        return self._backend
    
    def _make_key(self, key: str) -> str:
        return f"{self.config.key_prefix}{key}"
    
    async def get(self, key: str) -> Optional[Any]:
        backend = await self._get_backend()
        return await backend.get(self._make_key(key))
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None):
        backend = await self._get_backend()
        await backend.set(self._make_key(key), value, ttl or self.config.default_ttl)
    
    async def delete(self, key: str) -> bool:
        backend = await self._get_backend()
        return await backend.delete(self._make_key(key))
    
    async def exists(self, key: str) -> bool:
        backend = await self._get_backend()
        return await backend.exists(self._make_key(key))
    
    async def clear_pattern(self, pattern: str):
        backend = await self._get_backend()
        keys = await backend.keys(self._make_key(pattern))
        for key in keys:
            await backend.delete(key)
    
    async def get_or_set(self, key: str, factory: Callable, ttl: Optional[int] = None) -> Any:
        value = await self.get(key)
        if value is not None:
            return value
        
        if asyncio.iscoroutinefunction(factory):
            value = await factory()
        else:
            value = factory()
        
        await self.set(key, value, ttl)
        return value
    
    async def cache_user_balance(self, user_id: str, account_id: str, balance: float, currency: str):
        key = f"balance:{user_id}:{account_id}"
        await self.set(key, {"balance": balance, "currency": currency, "updated_at": datetime.utcnow().isoformat()}, ttl=60)
    
    async def get_user_balance(self, user_id: str, account_id: str) -> Optional[Dict]:
        key = f"balance:{user_id}:{account_id}"
        return await self.get(key)
    
    async def cache_exchange_rate(self, from_currency: str, to_currency: str, rate: float):
        key = f"fx:{from_currency}:{to_currency}"
        await self.set(key, {"rate": rate, "updated_at": datetime.utcnow().isoformat()}, ttl=300)
    
    async def get_exchange_rate(self, from_currency: str, to_currency: str) -> Optional[float]:
        key = f"fx:{from_currency}:{to_currency}"
        data = await self.get(key)
        return data["rate"] if data else None
    
    async def cache_stock_price(self, symbol: str, exchange: str, price: float, currency: str):
        key = f"stock:{exchange}:{symbol}"
        await self.set(key, {
            "price": price,
            "currency": currency,
            "updated_at": datetime.utcnow().isoformat()
        }, ttl=60)
    
    async def get_stock_price(self, symbol: str, exchange: str) -> Optional[Dict]:
        key = f"stock:{exchange}:{symbol}"
        return await self.get(key)
    
    async def cache_user_session(self, user_id: str, session_data: Dict, ttl: int = 3600):
        key = f"session:{user_id}"
        await self.set(key, session_data, ttl)
    
    async def get_user_session(self, user_id: str) -> Optional[Dict]:
        key = f"session:{user_id}"
        return await self.get(key)
    
    async def invalidate_user_session(self, user_id: str):
        key = f"session:{user_id}"
        await self.delete(key)


def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator for caching function results"""
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            cache = get_cache_service()
            
            key_parts = [key_prefix or func.__name__]
            key_parts.extend(str(arg) for arg in args)
            key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
            cache_key = hashlib.md5(":".join(key_parts).encode()).hexdigest()
            
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                logger.debug("cache_hit", key=cache_key, func=func.__name__)
                return cached_value
            
            logger.debug("cache_miss", key=cache_key, func=func.__name__)
            
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)
            
            await cache.set(cache_key, result, ttl)
            return result
        
        return wrapper
    return decorator


_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    global _cache_service
    if _cache_service is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        backend = CacheBackend.REDIS if os.getenv("CACHE_BACKEND") == "redis" else CacheBackend.MEMORY
        _cache_service = CacheService(CacheConfig(
            backend=backend,
            redis_url=redis_url
        ))
    return _cache_service
