"""
Rate Limiter Middleware - API Throttling

Provides configurable rate limiting for:
- Per-user rate limits
- Per-IP rate limits
- Per-endpoint rate limits
- Tiered limits based on user subscription
"""

import asyncio
import time
from typing import Dict, Optional, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
from fastapi import Request, Response, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

logger = structlog.get_logger(__name__)


class RateLimitTier(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"


@dataclass
class RateLimitConfig:
    requests_per_minute: int = 60
    requests_per_hour: int = 1000
    requests_per_day: int = 10000
    burst_limit: int = 10


TIER_LIMITS: Dict[RateLimitTier, RateLimitConfig] = {
    RateLimitTier.FREE: RateLimitConfig(
        requests_per_minute=30,
        requests_per_hour=500,
        requests_per_day=5000,
        burst_limit=5
    ),
    RateLimitTier.BASIC: RateLimitConfig(
        requests_per_minute=60,
        requests_per_hour=2000,
        requests_per_day=20000,
        burst_limit=10
    ),
    RateLimitTier.PREMIUM: RateLimitConfig(
        requests_per_minute=120,
        requests_per_hour=5000,
        requests_per_day=50000,
        burst_limit=20
    ),
    RateLimitTier.ENTERPRISE: RateLimitConfig(
        requests_per_minute=300,
        requests_per_hour=15000,
        requests_per_day=150000,
        burst_limit=50
    ),
}

ENDPOINT_LIMITS: Dict[str, RateLimitConfig] = {
    "/api/v1/auth/login": RateLimitConfig(requests_per_minute=5, requests_per_hour=20, burst_limit=3),
    "/api/v1/auth/register": RateLimitConfig(requests_per_minute=3, requests_per_hour=10, burst_limit=2),
    "/api/v1/transfers": RateLimitConfig(requests_per_minute=10, requests_per_hour=100, burst_limit=5),
    "/api/v1/kyc": RateLimitConfig(requests_per_minute=5, requests_per_hour=30, burst_limit=3),
    "/api/v1/loans/apply": RateLimitConfig(requests_per_minute=3, requests_per_hour=10, burst_limit=2),
}


@dataclass
class TokenBucket:
    capacity: int
    tokens: float = field(default=0)
    last_update: float = field(default_factory=time.time)
    refill_rate: float = 1.0
    
    def __post_init__(self):
        self.tokens = float(self.capacity)
    
    def consume(self, tokens: int = 1) -> bool:
        now = time.time()
        elapsed = now - self.last_update
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_update = now
        
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False
    
    def get_retry_after(self) -> float:
        if self.tokens >= 1:
            return 0
        return (1 - self.tokens) / self.refill_rate


class SlidingWindowCounter:
    """Sliding window rate limiter for accurate rate limiting"""
    
    def __init__(self, window_size: int, max_requests: int):
        self.window_size = window_size
        self.max_requests = max_requests
        self.requests: Dict[str, list] = defaultdict(list)
        self._lock = asyncio.Lock()
    
    async def is_allowed(self, key: str) -> Tuple[bool, int, float]:
        """
        Check if request is allowed
        Returns: (allowed, remaining, retry_after)
        """
        async with self._lock:
            now = time.time()
            window_start = now - self.window_size
            
            self.requests[key] = [t for t in self.requests[key] if t > window_start]
            
            current_count = len(self.requests[key])
            remaining = max(0, self.max_requests - current_count)
            
            if current_count < self.max_requests:
                self.requests[key].append(now)
                return True, remaining - 1, 0
            
            oldest = self.requests[key][0] if self.requests[key] else now
            retry_after = oldest + self.window_size - now
            return False, 0, max(0, retry_after)
    
    async def cleanup(self):
        """Remove expired entries"""
        async with self._lock:
            now = time.time()
            window_start = now - self.window_size
            for key in list(self.requests.keys()):
                self.requests[key] = [t for t in self.requests[key] if t > window_start]
                if not self.requests[key]:
                    del self.requests[key]


class RateLimiter:
    """Main rate limiter with multiple strategies"""
    
    def __init__(self):
        self.minute_limiters: Dict[str, SlidingWindowCounter] = {}
        self.hour_limiters: Dict[str, SlidingWindowCounter] = {}
        self.day_limiters: Dict[str, SlidingWindowCounter] = {}
        self.burst_buckets: Dict[str, TokenBucket] = {}
        self._lock = asyncio.Lock()
    
    def _get_key(self, request: Request, user_id: Optional[str] = None) -> str:
        if user_id:
            return f"user:{user_id}"
        
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"
        return f"ip:{ip}"
    
    def _get_config(self, path: str, tier: RateLimitTier = RateLimitTier.FREE) -> RateLimitConfig:
        for endpoint, config in ENDPOINT_LIMITS.items():
            if path.startswith(endpoint):
                return config
        return TIER_LIMITS.get(tier, TIER_LIMITS[RateLimitTier.FREE])
    
    async def _get_or_create_limiters(self, key: str, config: RateLimitConfig):
        # Bucket per identity *and* limit profile. Without the config suffix, a
        # strict endpoint bucket (e.g. register burst=2) is reused for every
        # later request from the same IP and exhausts unrelated endpoints.
        cfg_key = (
            f"{key}:{config.requests_per_minute}:{config.requests_per_hour}:"
            f"{config.requests_per_day}:{config.burst_limit}"
        )
        async with self._lock:
            if cfg_key not in self.minute_limiters:
                self.minute_limiters[cfg_key] = SlidingWindowCounter(60, config.requests_per_minute)
            if cfg_key not in self.hour_limiters:
                self.hour_limiters[cfg_key] = SlidingWindowCounter(3600, config.requests_per_hour)
            if cfg_key not in self.day_limiters:
                self.day_limiters[cfg_key] = SlidingWindowCounter(86400, config.requests_per_day)
            if cfg_key not in self.burst_buckets:
                self.burst_buckets[cfg_key] = TokenBucket(
                    capacity=config.burst_limit,
                    refill_rate=config.requests_per_minute / 60
                )
        
        return (
            self.minute_limiters[cfg_key],
            self.hour_limiters[cfg_key],
            self.day_limiters[cfg_key],
            self.burst_buckets[cfg_key]
        )
    
    async def check_rate_limit(
        self,
        request: Request,
        user_id: Optional[str] = None,
        tier: RateLimitTier = RateLimitTier.FREE
    ) -> Tuple[bool, Dict[str, any]]:
        """
        Check if request is within rate limits
        Returns: (allowed, headers_dict)
        """
        key = self._get_key(request, user_id)
        config = self._get_config(request.url.path, tier)
        
        minute_limiter, hour_limiter, day_limiter, burst_bucket = \
            await self._get_or_create_limiters(key, config)
        
        if not burst_bucket.consume():
            retry_after = burst_bucket.get_retry_after()
            logger.warning("rate_limit_burst", key=key, path=request.url.path)
            return False, {
                "X-RateLimit-Limit": str(config.burst_limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(time.time() + retry_after)),
                "Retry-After": str(int(retry_after) + 1)
            }
        
        minute_allowed, minute_remaining, minute_retry = await minute_limiter.is_allowed(key)
        if not minute_allowed:
            logger.warning("rate_limit_minute", key=key, path=request.url.path)
            return False, {
                "X-RateLimit-Limit": str(config.requests_per_minute),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(time.time() + minute_retry)),
                "Retry-After": str(int(minute_retry) + 1)
            }
        
        hour_allowed, hour_remaining, hour_retry = await hour_limiter.is_allowed(key)
        if not hour_allowed:
            logger.warning("rate_limit_hour", key=key, path=request.url.path)
            return False, {
                "X-RateLimit-Limit": str(config.requests_per_hour),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(time.time() + hour_retry)),
                "Retry-After": str(int(hour_retry) + 1)
            }
        
        day_allowed, day_remaining, day_retry = await day_limiter.is_allowed(key)
        if not day_allowed:
            logger.warning("rate_limit_day", key=key, path=request.url.path)
            return False, {
                "X-RateLimit-Limit": str(config.requests_per_day),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(time.time() + day_retry)),
                "Retry-After": str(int(day_retry) + 1)
            }
        
        return True, {
            "X-RateLimit-Limit": str(config.requests_per_minute),
            "X-RateLimit-Remaining": str(minute_remaining),
            "X-RateLimit-Reset": str(int(time.time() + 60))
        }


rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for rate limiting"""
    
    def __init__(self, app, get_user_id: Optional[Callable] = None, get_user_tier: Optional[Callable] = None):
        super().__init__(app)
        self.get_user_id = get_user_id
        self.get_user_tier = get_user_tier
        self.excluded_paths = {"/health", "/metrics", "/docs", "/openapi.json", "/redoc"}
    
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in self.excluded_paths:
            return await call_next(request)
        
        user_id = None
        tier = RateLimitTier.FREE
        
        if self.get_user_id:
            try:
                user_id = await self.get_user_id(request)
            except Exception:
                pass
        
        if self.get_user_tier and user_id:
            try:
                tier = await self.get_user_tier(user_id)
            except Exception:
                pass
        
        allowed, headers = await rate_limiter.check_rate_limit(request, user_id, tier)
        
        if not allowed:
            response = Response(
                content='{"error": "Rate limit exceeded", "message": "Too many requests. Please try again later."}',
                status_code=429,
                media_type="application/json"
            )
            for key, value in headers.items():
                response.headers[key] = value
            return response
        
        response = await call_next(request)
        
        for key, value in headers.items():
            response.headers[key] = value
        
        return response


def get_rate_limiter() -> RateLimiter:
    return rate_limiter
