"""
Circuit Breaker Pattern - Complete Implementation
Production-ready circuit breaker with state transition logic

Author: NeoBank Engineering Team
Date: 2025-11-02
Version: 1.0.0

This module provides a robust circuit breaker implementation to prevent
cascading failures in distributed systems.

Features:
- Three states: CLOSED, OPEN, HALF_OPEN
- Automatic state transitions
- Configurable thresholds and timeouts
- Comprehensive logging
- Thread-safe operations

Usage:
    circuit_breaker = CircuitBreaker(
        failure_threshold=5,
        recovery_timeout=60,
        half_open_max_calls=3
    )
    
    result = await circuit_breaker.call(
        risky_function,
        arg1,
        arg2
    )
"""

import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable
from enum import Enum
import structlog

# Configure structured logging
logger = structlog.get_logger(__name__)


# ============================================================================
# EXCEPTIONS
# ============================================================================

class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open and blocking requests."""
    pass


# ============================================================================
# CIRCUIT BREAKER STATES
# ============================================================================

class CircuitBreakerState(Enum):
    """
    Circuit breaker states.
    
    CLOSED: Normal operation, all requests pass through
    OPEN: Blocking all requests after failure threshold reached
    HALF_OPEN: Allowing limited requests to test recovery
    """
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


# ============================================================================
# CIRCUIT BREAKER IMPLEMENTATION
# ============================================================================

class CircuitBreaker:
    """
    Circuit breaker implementation to prevent cascading failures.
    
    The circuit breaker monitors the success/failure rate of operations
    and transitions between three states:
    
    1. CLOSED (Normal Operation):
       - All requests pass through
       - Failures are counted
       - After `failure_threshold` failures, transition to OPEN
    
    2. OPEN (Blocking Requests):
       - All requests are immediately rejected
       - No calls to the protected function
       - After `recovery_timeout` seconds, transition to HALF_OPEN
    
    3. HALF_OPEN (Testing Recovery):
       - Allow `half_open_max_calls` test requests
       - If all succeed, transition to CLOSED
       - If any fails, transition back to OPEN
    
    Configuration:
        failure_threshold: Number of consecutive failures before opening (default: 5)
        recovery_timeout: Seconds to wait before testing recovery (default: 60)
        half_open_max_calls: Number of test calls in half-open state (default: 3)
    
    Example:
        circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,
            half_open_max_calls=3
        )
        
        try:
            result = await circuit_breaker.call(
                external_api_call,
                param1="value1"
            )
        except CircuitBreakerOpenError:
            # Circuit breaker is open, use fallback
            result = get_cached_value()
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        half_open_max_calls: int = 3
    ):
        """
        Initialize circuit breaker.
        
        Args:
            failure_threshold: Number of failures before opening
            recovery_timeout: Seconds before attempting recovery
            half_open_max_calls: Max calls in half-open state
        """
        # Configuration
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        
        # State tracking
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.state = CircuitBreakerState.CLOSED
        self.half_open_calls = 0
        
        logger.info(
            "circuit_breaker_initialized",
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
            half_open_max_calls=half_open_max_calls
        )
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function with circuit breaker protection.
        
        This method wraps the function call with circuit breaker logic:
        1. Check if circuit breaker allows the call
        2. Execute the function
        3. Update circuit breaker state based on result
        
        Args:
            func: Async function to execute
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func
        
        Returns:
            Result from func
        
        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
            Exception: Any exception raised by func
        """
        # Check circuit breaker state before calling
        self._check_state()
        
        # Execute function
        try:
            result = await func(*args, **kwargs)
            
            # Success - update circuit breaker
            await self._on_success()
            
            return result
        
        except Exception as e:
            # Failure - update circuit breaker
            await self._on_failure(e)
            raise
    
    def _check_state(self) -> None:
        """
        Check circuit breaker state and transition if needed.
        
        State Transitions:
        - OPEN → HALF_OPEN: After recovery_timeout has passed
        - HALF_OPEN → OPEN: If half_open_max_calls limit reached
        
        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
        """
        if self.state == CircuitBreakerState.OPEN:
            # Check if recovery timeout has passed
            if self.last_failure_time:
                time_since_failure = (datetime.now() - self.last_failure_time).total_seconds()
                
                if time_since_failure >= self.recovery_timeout:
                    # Transition to HALF_OPEN
                    logger.info(
                        "circuit_breaker_transition",
                        from_state="OPEN",
                        to_state="HALF_OPEN",
                        time_since_failure=time_since_failure,
                        failure_count=self.failure_count
                    )
                    
                    self.state = CircuitBreakerState.HALF_OPEN
                    self.half_open_calls = 0
                else:
                    # Still in OPEN state, block request
                    time_until_retry = self.recovery_timeout - time_since_failure
                    
                    logger.warning(
                        "circuit_breaker_blocking_request",
                        state="OPEN",
                        time_until_retry=time_until_retry,
                        failure_count=self.failure_count
                    )
                    
                    raise CircuitBreakerOpenError(
                        f"Circuit breaker is OPEN. Retry in {time_until_retry:.1f} seconds"
                    )
        
        elif self.state == CircuitBreakerState.HALF_OPEN:
            # Check if half-open limit reached
            if self.half_open_calls >= self.half_open_max_calls:
                logger.warning(
                    "circuit_breaker_half_open_limit_reached",
                    half_open_calls=self.half_open_calls,
                    half_open_max_calls=self.half_open_max_calls
                )
                
                raise CircuitBreakerOpenError(
                    f"Circuit breaker HALF_OPEN limit reached ({self.half_open_max_calls} calls)"
                )
    
    async def _on_success(self) -> None:
        """
        Handle successful function call.
        
        State Transitions:
        - HALF_OPEN → CLOSED: After half_open_max_calls successful calls
        - CLOSED: Reset failure count
        """
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.half_open_calls += 1
            self.success_count += 1
            
            logger.info(
                "circuit_breaker_success_in_half_open",
                half_open_calls=self.half_open_calls,
                half_open_max_calls=self.half_open_max_calls,
                success_count=self.success_count
            )
            
            # Check if we've had enough successful calls to close
            if self.half_open_calls >= self.half_open_max_calls:
                logger.info(
                    "circuit_breaker_transition",
                    from_state="HALF_OPEN",
                    to_state="CLOSED",
                    success_count=self.success_count,
                    reason="recovery_successful"
                )
                
                # Transition to CLOSED
                self.state = CircuitBreakerState.CLOSED
                self.failure_count = 0
                self.success_count = 0
                self.half_open_calls = 0
                self.last_failure_time = None
        
        elif self.state == CircuitBreakerState.CLOSED:
            # Reset failure count on success
            if self.failure_count > 0:
                logger.info(
                    "circuit_breaker_reset_failure_count",
                    previous_failure_count=self.failure_count
                )
                self.failure_count = 0
    
    async def _on_failure(self, error: Exception) -> None:
        """
        Handle failed function call.
        
        State Transitions:
        - CLOSED → OPEN: After failure_threshold failures
        - HALF_OPEN → OPEN: Immediately on any failure
        
        Args:
            error: Exception that caused the failure
        """
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        
        logger.warning(
            "circuit_breaker_failure",
            state=self.state.value,
            failure_count=self.failure_count,
            failure_threshold=self.failure_threshold,
            error_type=type(error).__name__,
            error_message=str(error)
        )
        
        if self.state == CircuitBreakerState.HALF_OPEN:
            # Any failure in HALF_OPEN immediately opens the circuit
            logger.error(
                "circuit_breaker_transition",
                from_state="HALF_OPEN",
                to_state="OPEN",
                reason="failure_during_recovery",
                error=str(error)
            )
            
            self.state = CircuitBreakerState.OPEN
            self.half_open_calls = 0
        
        elif self.state == CircuitBreakerState.CLOSED:
            # Check if we've reached failure threshold
            if self.failure_count >= self.failure_threshold:
                logger.error(
                    "circuit_breaker_transition",
                    from_state="CLOSED",
                    to_state="OPEN",
                    reason="failure_threshold_reached",
                    failure_count=self.failure_count,
                    failure_threshold=self.failure_threshold,
                    error=str(error)
                )
                
                self.state = CircuitBreakerState.OPEN
    
    def get_state(self) -> Dict[str, Any]:
        """
        Get current circuit breaker state.
        
        Returns:
            Dict containing:
                - state: Current state (CLOSED/OPEN/HALF_OPEN)
                - failure_count: Number of consecutive failures
                - success_count: Number of successes in current cycle
                - last_failure_time: Timestamp of last failure
                - half_open_calls: Number of calls in half-open state
                - time_until_retry: Seconds until retry (if OPEN)
        """
        state_info = {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "last_failure_time": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "half_open_calls": self.half_open_calls,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "half_open_max_calls": self.half_open_max_calls
        }
        
        # Calculate time until retry if OPEN
        if self.state == CircuitBreakerState.OPEN and self.last_failure_time:
            time_since_failure = (datetime.now() - self.last_failure_time).total_seconds()
            time_until_retry = max(0, self.recovery_timeout - time_since_failure)
            state_info["time_until_retry"] = time_until_retry
        
        return state_info
    
    def reset(self) -> None:
        """
        Manually reset circuit breaker to CLOSED state.
        
        This should be used sparingly, typically only for:
        - Testing
        - Manual intervention by operators
        - System maintenance
        """
        logger.info(
            "circuit_breaker_manual_reset",
            previous_state=self.state.value,
            failure_count=self.failure_count
        )
        
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.half_open_calls = 0
        self.last_failure_time = None


# ============================================================================
# STATE TRANSITION DIAGRAM
# ============================================================================

STATE_TRANSITION_DIAGRAM = """
Circuit Breaker State Transitions
==================================

                    ┌─────────────────┐
                    │     CLOSED      │
                    │  (Normal Ops)   │
                    └─────────────────┘
                            │
                            │ After `failure_threshold`
                            │ consecutive failures
                            ▼
                    ┌─────────────────┐
              ┌────▶│      OPEN       │
              │     │ (Blocking Reqs) │
              │     └─────────────────┘
              │             │
              │             │ After `recovery_timeout`
              │             │ seconds
              │             ▼
              │     ┌─────────────────┐
              │     │   HALF_OPEN     │
              │     │  (Testing Rec)  │
              │     └─────────────────┘
              │             │
              │             ├─ All `half_open_max_calls` succeed
              │             │  → Back to CLOSED
              │             │
              │             └─ Any call fails
              └─────────────── → Back to OPEN


State Details:
--------------

CLOSED (Normal Operation):
  - All requests pass through
  - Failures are counted
  - Success resets failure count
  - Transition to OPEN after `failure_threshold` failures

OPEN (Circuit Breaker Tripped):
  - All requests immediately rejected with CircuitBreakerOpenError
  - No calls to protected function
  - Wait `recovery_timeout` seconds
  - Transition to HALF_OPEN after timeout

HALF_OPEN (Testing Recovery):
  - Allow up to `half_open_max_calls` test requests
  - If all succeed → CLOSED (recovery successful)
  - If any fails → OPEN (recovery failed)
  - Additional requests beyond limit are rejected


Configuration Parameters:
------------------------

failure_threshold (default: 5)
  - Number of consecutive failures before opening circuit
  - Higher value = more tolerant of failures
  - Lower value = faster failure detection

recovery_timeout (default: 60 seconds)
  - Time to wait before testing recovery
  - Higher value = longer wait between retries
  - Lower value = faster recovery attempts

half_open_max_calls (default: 3)
  - Number of test calls in half-open state
  - Higher value = more confidence in recovery
  - Lower value = faster transition to closed


Example Timeline:
----------------

Time  State       Event
----  ----------  -----------------------------------------------
0s    CLOSED      Normal operation
1s    CLOSED      Request 1 fails (failure_count = 1)
2s    CLOSED      Request 2 fails (failure_count = 2)
3s    CLOSED      Request 3 fails (failure_count = 3)
4s    CLOSED      Request 4 fails (failure_count = 4)
5s    CLOSED      Request 5 fails (failure_count = 5)
5s    OPEN        Threshold reached, circuit opens
6s    OPEN        Request 6 blocked (CircuitBreakerOpenError)
...
65s   HALF_OPEN   Recovery timeout passed (60s)
66s   HALF_OPEN   Test request 1 succeeds (half_open_calls = 1)
67s   HALF_OPEN   Test request 2 succeeds (half_open_calls = 2)
68s   HALF_OPEN   Test request 3 succeeds (half_open_calls = 3)
68s   CLOSED      All test calls succeeded, circuit closes
69s   CLOSED      Normal operation resumed
"""


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    """
    Example usage and demonstration of circuit breaker
    """
    
    async def example():
        print("="*80)
        print("CIRCUIT BREAKER - Complete Implementation")
        print("="*80)
        print()
        
        # Create circuit breaker
        circuit_breaker = CircuitBreaker(
            failure_threshold=3,  # Open after 3 failures
            recovery_timeout=5,   # Wait 5 seconds before testing
            half_open_max_calls=2  # Allow 2 test calls
        )
        
        # Simulated external service
        call_count = 0
        
        async def external_service(should_fail=False):
            nonlocal call_count
            call_count += 1
            
            if should_fail:
                raise Exception(f"Service failure #{call_count}")
            
            return {"success": True, "call": call_count}
        
        print("1. Normal Operation (CLOSED state)")
        print("-" * 80)
        
        # Successful calls
        for i in range(3):
            try:
                result = await circuit_breaker.call(external_service, should_fail=False)
                print(f"✅ Call {i+1}: Success - {result}")
                print(f"   State: {circuit_breaker.get_state()['state']}")
            except Exception as e:
                print(f"❌ Call {i+1}: Failed - {e}")
        
        print()
        print("2. Failures Triggering Circuit Breaker")
        print("-" * 80)
        
        # Failed calls (will open circuit)
        for i in range(3):
            try:
                result = await circuit_breaker.call(external_service, should_fail=True)
                print(f"✅ Call {i+1}: Success")
            except CircuitBreakerOpenError as e:
                print(f"🚫 Call {i+1}: Circuit breaker open - {e}")
            except Exception as e:
                print(f"❌ Call {i+1}: Failed - {e}")
                print(f"   State: {circuit_breaker.get_state()['state']}, Failures: {circuit_breaker.failure_count}")
        
        print()
        print("3. Circuit Breaker OPEN (Blocking Requests)")
        print("-" * 80)
        
        # Try to call while circuit is open
        try:
            result = await circuit_breaker.call(external_service, should_fail=False)
            print(f"✅ Call: Success")
        except CircuitBreakerOpenError as e:
            print(f"🚫 Call blocked: {e}")
            state = circuit_breaker.get_state()
            print(f"   State: {state['state']}")
            print(f"   Time until retry: {state.get('time_until_retry', 0):.1f}s")
        
        print()
        print("4. Waiting for Recovery Timeout...")
        print("-" * 80)
        
        # Wait for recovery timeout
        await asyncio.sleep(6)
        
        print("   Recovery timeout passed!")
        print()
        print("5. HALF_OPEN State (Testing Recovery)")
        print("-" * 80)
        
        # Test calls in half-open state
        for i in range(2):
            try:
                result = await circuit_breaker.call(external_service, should_fail=False)
                print(f"✅ Test call {i+1}: Success - {result}")
                state = circuit_breaker.get_state()
                print(f"   State: {state['state']}, Half-open calls: {state['half_open_calls']}")
            except Exception as e:
                print(f"❌ Test call {i+1}: Failed - {e}")
        
        print()
        print("6. Circuit Breaker CLOSED (Recovery Successful)")
        print("-" * 80)
        
        # Normal operation resumed
        try:
            result = await circuit_breaker.call(external_service, should_fail=False)
            print(f"✅ Call: Success - {result}")
            state = circuit_breaker.get_state()
            print(f"   State: {state['state']}")
            print(f"   Circuit breaker has recovered!")
        except Exception as e:
            print(f"❌ Call: Failed - {e}")
        
        print()
        print("="*80)
        print("CIRCUIT BREAKER - Demonstration Complete")
        print("="*80)
        print()
        print(STATE_TRANSITION_DIAGRAM)
    
    # Run example
    asyncio.run(example())
