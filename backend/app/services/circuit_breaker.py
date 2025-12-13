"""
Circuit Breaker Service - Resilience Pattern for External Services

Provides fault tolerance for:
- External API calls (payment gateways, KYC providers, etc.)
- Database connections
- Third-party services
- Microservice communication
"""

import asyncio
import time
from typing import Callable, Any, Optional, Dict, TypeVar, Generic
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
import structlog

logger = structlog.get_logger(__name__)

T = TypeVar('T')


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    success_threshold: int = 3
    timeout: float = 30.0
    half_open_max_calls: int = 3
    excluded_exceptions: tuple = ()


@dataclass
class CircuitStats:
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    state_changes: int = 0


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is open"""
    def __init__(self, circuit_name: str, retry_after: float):
        self.circuit_name = circuit_name
        self.retry_after = retry_after
        super().__init__(f"Circuit breaker '{circuit_name}' is open. Retry after {retry_after:.1f}s")


class CircuitBreaker:
    """
    Circuit breaker implementation with three states:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Requests are rejected immediately
    - HALF_OPEN: Limited requests allowed to test recovery
    """
    
    def __init__(self, name: str, config: CircuitBreakerConfig = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._stats = CircuitStats()
        self._last_state_change = time.time()
        self._half_open_calls = 0
        self._lock = asyncio.Lock()
    
    @property
    def state(self) -> CircuitState:
        return self._state
    
    @property
    def stats(self) -> CircuitStats:
        return self._stats
    
    def _should_allow_request(self) -> bool:
        """Determine if request should be allowed based on current state"""
        if self._state == CircuitState.CLOSED:
            return True
        
        if self._state == CircuitState.OPEN:
            if time.time() - self._last_state_change >= self.config.timeout:
                self._transition_to(CircuitState.HALF_OPEN)
                return True
            return False
        
        if self._state == CircuitState.HALF_OPEN:
            return self._half_open_calls < self.config.half_open_max_calls
        
        return False
    
    def _transition_to(self, new_state: CircuitState):
        """Transition to a new state"""
        if self._state != new_state:
            old_state = self._state
            self._state = new_state
            self._last_state_change = time.time()
            self._stats.state_changes += 1
            
            if new_state == CircuitState.HALF_OPEN:
                self._half_open_calls = 0
            
            logger.info(
                "circuit_breaker_state_change",
                name=self.name,
                old_state=old_state.value,
                new_state=new_state.value
            )
    
    def _record_success(self):
        """Record a successful call"""
        self._stats.total_calls += 1
        self._stats.successful_calls += 1
        self._stats.last_success_time = time.time()
        self._stats.consecutive_successes += 1
        self._stats.consecutive_failures = 0
        
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_calls += 1
            if self._stats.consecutive_successes >= self.config.success_threshold:
                self._transition_to(CircuitState.CLOSED)
    
    def _record_failure(self, error: Exception):
        """Record a failed call"""
        if isinstance(error, self.config.excluded_exceptions):
            return
        
        self._stats.total_calls += 1
        self._stats.failed_calls += 1
        self._stats.last_failure_time = time.time()
        self._stats.consecutive_failures += 1
        self._stats.consecutive_successes = 0
        
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_calls += 1
            self._transition_to(CircuitState.OPEN)
        elif self._state == CircuitState.CLOSED:
            if self._stats.consecutive_failures >= self.config.failure_threshold:
                self._transition_to(CircuitState.OPEN)
    
    def _record_rejection(self):
        """Record a rejected call"""
        self._stats.total_calls += 1
        self._stats.rejected_calls += 1
    
    def get_retry_after(self) -> float:
        """Get time until circuit might close"""
        if self._state == CircuitState.OPEN:
            elapsed = time.time() - self._last_state_change
            return max(0, self.config.timeout - elapsed)
        return 0
    
    async def call(self, func: Callable[..., T], *args, **kwargs) -> T:
        """Execute function with circuit breaker protection"""
        async with self._lock:
            if not self._should_allow_request():
                self._record_rejection()
                raise CircuitBreakerError(self.name, self.get_retry_after())
        
        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)
            
            async with self._lock:
                self._record_success()
            
            return result
        
        except Exception as e:
            async with self._lock:
                self._record_failure(e)
            raise
    
    def reset(self):
        """Reset circuit breaker to initial state"""
        self._state = CircuitState.CLOSED
        self._stats = CircuitStats()
        self._last_state_change = time.time()
        self._half_open_calls = 0
        logger.info("circuit_breaker_reset", name=self.name)


class CircuitBreakerRegistry:
    """Registry for managing multiple circuit breakers"""
    
    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._lock = asyncio.Lock()
    
    async def get_or_create(self, name: str, config: CircuitBreakerConfig = None) -> CircuitBreaker:
        """Get existing circuit breaker or create new one"""
        async with self._lock:
            if name not in self._breakers:
                self._breakers[name] = CircuitBreaker(name, config)
                logger.info("circuit_breaker_created", name=name)
            return self._breakers[name]
    
    def get(self, name: str) -> Optional[CircuitBreaker]:
        """Get circuit breaker by name"""
        return self._breakers.get(name)
    
    def get_all_stats(self) -> Dict[str, Dict]:
        """Get stats for all circuit breakers"""
        return {
            name: {
                "state": breaker.state.value,
                "total_calls": breaker.stats.total_calls,
                "successful_calls": breaker.stats.successful_calls,
                "failed_calls": breaker.stats.failed_calls,
                "rejected_calls": breaker.stats.rejected_calls,
                "consecutive_failures": breaker.stats.consecutive_failures,
                "state_changes": breaker.stats.state_changes
            }
            for name, breaker in self._breakers.items()
        }
    
    async def reset_all(self):
        """Reset all circuit breakers"""
        async with self._lock:
            for breaker in self._breakers.values():
                breaker.reset()


registry = CircuitBreakerRegistry()


def circuit_breaker(
    name: str,
    failure_threshold: int = 5,
    success_threshold: int = 3,
    timeout: float = 30.0,
    excluded_exceptions: tuple = ()
):
    """Decorator to apply circuit breaker to a function"""
    config = CircuitBreakerConfig(
        failure_threshold=failure_threshold,
        success_threshold=success_threshold,
        timeout=timeout,
        excluded_exceptions=excluded_exceptions
    )
    
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            breaker = await registry.get_or_create(name, config)
            return await breaker.call(func, *args, **kwargs)
        return wrapper
    return decorator


EXTERNAL_SERVICE_CONFIGS = {
    "paystack": CircuitBreakerConfig(failure_threshold=3, timeout=60.0),
    "flutterwave": CircuitBreakerConfig(failure_threshold=3, timeout=60.0),
    "africas_talking": CircuitBreakerConfig(failure_threshold=5, timeout=30.0),
    "smile_identity": CircuitBreakerConfig(failure_threshold=3, timeout=45.0),
    "verifyme": CircuitBreakerConfig(failure_threshold=3, timeout=45.0),
    "stock_exchange_api": CircuitBreakerConfig(failure_threshold=5, timeout=30.0),
    "fx_rate_api": CircuitBreakerConfig(failure_threshold=5, timeout=30.0),
}


async def get_service_breaker(service_name: str) -> CircuitBreaker:
    """Get circuit breaker for a specific external service"""
    config = EXTERNAL_SERVICE_CONFIGS.get(service_name, CircuitBreakerConfig())
    return await registry.get_or_create(service_name, config)


def get_circuit_breaker_registry() -> CircuitBreakerRegistry:
    return registry
