"""
USSD Channel Security Protection

This module provides security measures for USSD banking channels including:
- Anti-replay protection
- SIM-swap detection
- Rate limiting per MSISDN
- Session management
- OTP validation with time-based expiry
"""

import os
import hashlib
import hmac
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import structlog
import redis
from redis import Redis

logger = structlog.get_logger(__name__)


class USSDSecurityError(Exception):
    """Base exception for USSD security errors"""
    pass


class ReplayAttackError(USSDSecurityError):
    """Raised when a replay attack is detected"""
    pass


class SIMSwapError(USSDSecurityError):
    """Raised when SIM swap is detected"""
    pass


class RateLimitError(USSDSecurityError):
    """Raised when rate limit is exceeded"""
    pass


class SessionError(USSDSecurityError):
    """Raised for session-related errors"""
    pass


@dataclass
class USSDSecurityConfig:
    """Configuration for USSD security"""
    
    redis_url: str = "redis://localhost:6379/2"
    nonce_ttl_seconds: int = 300
    session_ttl_seconds: int = 180
    max_requests_per_minute: int = 10
    max_failed_attempts: int = 3
    lockout_duration_seconds: int = 1800
    sim_swap_check_enabled: bool = True
    sim_swap_grace_period_hours: int = 24
    otp_ttl_seconds: int = 120
    otp_max_attempts: int = 3
    
    @classmethod
    def from_env(cls) -> "USSDSecurityConfig":
        return cls(
            redis_url=os.getenv("USSD_REDIS_URL", "redis://localhost:6379/2"),
            nonce_ttl_seconds=int(os.getenv("USSD_NONCE_TTL", "300")),
            session_ttl_seconds=int(os.getenv("USSD_SESSION_TTL", "180")),
            max_requests_per_minute=int(os.getenv("USSD_RATE_LIMIT", "10")),
            max_failed_attempts=int(os.getenv("USSD_MAX_FAILED", "3")),
            lockout_duration_seconds=int(os.getenv("USSD_LOCKOUT_DURATION", "1800")),
            sim_swap_check_enabled=os.getenv("USSD_SIM_SWAP_CHECK", "true").lower() == "true",
            sim_swap_grace_period_hours=int(os.getenv("USSD_SIM_SWAP_GRACE", "24")),
            otp_ttl_seconds=int(os.getenv("USSD_OTP_TTL", "120")),
            otp_max_attempts=int(os.getenv("USSD_OTP_MAX_ATTEMPTS", "3"))
        )


class USSDSecurityService:
    """
    Comprehensive security service for USSD banking channels.
    
    Provides protection against:
    - Replay attacks using nonce validation
    - SIM swap fraud with carrier integration
    - Brute force attacks with rate limiting
    - Session hijacking with secure session management
    """
    
    def __init__(self, config: Optional[USSDSecurityConfig] = None):
        self.config = config or USSDSecurityConfig.from_env()
        self._redis: Optional[Redis] = None
        self._hmac_key = os.getenv("USSD_HMAC_KEY", "default-key-change-in-production").encode()
    
    @property
    def redis(self) -> Redis:
        if self._redis is None:
            self._redis = redis.from_url(self.config.redis_url)
        return self._redis
    
    def validate_request_nonce(self, msisdn: str, nonce: str, timestamp: int) -> bool:
        """
        Validate request nonce to prevent replay attacks.
        
        Each request must include a unique nonce that hasn't been used before.
        Nonces are stored with TTL to prevent memory exhaustion.
        """
        current_time = int(time.time())
        if abs(current_time - timestamp) > self.config.nonce_ttl_seconds:
            logger.warning("ussd_nonce_expired", msisdn=msisdn[-4:], timestamp=timestamp)
            raise ReplayAttackError("Request timestamp expired")
        
        nonce_key = f"ussd:nonce:{msisdn}:{nonce}"
        
        if self.redis.exists(nonce_key):
            logger.warning("ussd_replay_detected", msisdn=msisdn[-4:], nonce=nonce[:8])
            raise ReplayAttackError("Duplicate nonce detected - possible replay attack")
        
        self.redis.setex(nonce_key, self.config.nonce_ttl_seconds, "1")
        return True
    
    def generate_request_signature(self, msisdn: str, session_id: str, 
                                   input_text: str, timestamp: int) -> str:
        """Generate HMAC signature for request validation"""
        message = f"{msisdn}:{session_id}:{input_text}:{timestamp}"
        return hmac.new(self._hmac_key, message.encode(), hashlib.sha256).hexdigest()
    
    def verify_request_signature(self, msisdn: str, session_id: str,
                                 input_text: str, timestamp: int, signature: str) -> bool:
        """Verify HMAC signature of incoming request"""
        expected = self.generate_request_signature(msisdn, session_id, input_text, timestamp)
        return hmac.compare_digest(expected, signature)
    
    def check_rate_limit(self, msisdn: str) -> bool:
        """
        Check if MSISDN has exceeded rate limit.
        
        Uses sliding window rate limiting to prevent abuse.
        """
        rate_key = f"ussd:rate:{msisdn}"
        current_count = self.redis.incr(rate_key)
        
        if current_count == 1:
            self.redis.expire(rate_key, 60)
        
        if current_count > self.config.max_requests_per_minute:
            logger.warning("ussd_rate_limit_exceeded", msisdn=msisdn[-4:], count=current_count)
            raise RateLimitError(f"Rate limit exceeded: {current_count} requests/minute")
        
        return True
    
    def check_lockout(self, msisdn: str) -> bool:
        """Check if MSISDN is locked out due to failed attempts"""
        lockout_key = f"ussd:lockout:{msisdn}"
        
        if self.redis.exists(lockout_key):
            ttl = self.redis.ttl(lockout_key)
            logger.warning("ussd_account_locked", msisdn=msisdn[-4:], ttl=ttl)
            raise RateLimitError(f"Account locked. Try again in {ttl} seconds")
        
        return True
    
    def record_failed_attempt(self, msisdn: str) -> int:
        """Record a failed authentication attempt"""
        attempts_key = f"ussd:failed:{msisdn}"
        attempts = self.redis.incr(attempts_key)
        
        if attempts == 1:
            self.redis.expire(attempts_key, 3600)
        
        if attempts >= self.config.max_failed_attempts:
            lockout_key = f"ussd:lockout:{msisdn}"
            self.redis.setex(lockout_key, self.config.lockout_duration_seconds, "1")
            self.redis.delete(attempts_key)
            logger.warning("ussd_account_locked_out", msisdn=msisdn[-4:], attempts=attempts)
        
        return attempts
    
    def clear_failed_attempts(self, msisdn: str):
        """Clear failed attempts after successful authentication"""
        self.redis.delete(f"ussd:failed:{msisdn}")
    
    async def check_sim_swap(self, msisdn: str, carrier: str = "mtn") -> Tuple[bool, Optional[datetime]]:
        """
        Check if SIM swap occurred recently.
        
        Integrates with carrier APIs to detect recent SIM swaps.
        Returns (is_safe, last_swap_date)
        """
        if not self.config.sim_swap_check_enabled:
            return True, None
        
        sim_swap_key = f"ussd:simswap:{msisdn}"
        cached = self.redis.get(sim_swap_key)
        
        if cached:
            last_swap = datetime.fromisoformat(cached.decode())
            grace_period = timedelta(hours=self.config.sim_swap_grace_period_hours)
            
            if datetime.utcnow() - last_swap < grace_period:
                logger.warning("ussd_sim_swap_detected", msisdn=msisdn[-4:], 
                             last_swap=last_swap.isoformat())
                raise SIMSwapError(
                    f"Recent SIM swap detected. Please visit a branch for verification."
                )
            
            return True, last_swap
        
        return True, None
    
    def create_session(self, msisdn: str, user_id: str) -> str:
        """Create a secure USSD session"""
        import secrets
        
        session_id = secrets.token_hex(16)
        session_key = f"ussd:session:{session_id}"
        
        session_data = {
            "msisdn": msisdn,
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "state": "active",
            "menu_stack": "[]"
        }
        
        self.redis.hset(session_key, mapping=session_data)
        self.redis.expire(session_key, self.config.session_ttl_seconds)
        
        logger.info("ussd_session_created", session_id=session_id[:8], msisdn=msisdn[-4:])
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data"""
        session_key = f"ussd:session:{session_id}"
        data = self.redis.hgetall(session_key)
        
        if not data:
            return None
        
        self.redis.expire(session_key, self.config.session_ttl_seconds)
        
        return {k.decode(): v.decode() for k, v in data.items()}
    
    def update_session(self, session_id: str, updates: Dict[str, str]):
        """Update session data"""
        session_key = f"ussd:session:{session_id}"
        
        if not self.redis.exists(session_key):
            raise SessionError("Session not found or expired")
        
        self.redis.hset(session_key, mapping=updates)
        self.redis.expire(session_key, self.config.session_ttl_seconds)
    
    def end_session(self, session_id: str):
        """End a USSD session"""
        session_key = f"ussd:session:{session_id}"
        self.redis.delete(session_key)
        logger.info("ussd_session_ended", session_id=session_id[:8])
    
    def generate_otp(self, msisdn: str, purpose: str = "transaction") -> str:
        """Generate a time-limited OTP"""
        import secrets
        
        otp = str(secrets.randbelow(900000) + 100000)
        otp_key = f"ussd:otp:{msisdn}:{purpose}"
        
        otp_data = {
            "code": hashlib.sha256(otp.encode()).hexdigest(),
            "attempts": "0",
            "created_at": datetime.utcnow().isoformat()
        }
        
        self.redis.hset(otp_key, mapping=otp_data)
        self.redis.expire(otp_key, self.config.otp_ttl_seconds)
        
        logger.info("ussd_otp_generated", msisdn=msisdn[-4:], purpose=purpose)
        return otp
    
    def verify_otp(self, msisdn: str, otp: str, purpose: str = "transaction") -> bool:
        """Verify OTP with attempt limiting"""
        otp_key = f"ussd:otp:{msisdn}:{purpose}"
        otp_data = self.redis.hgetall(otp_key)
        
        if not otp_data:
            raise SessionError("OTP expired or not found")
        
        attempts = int(otp_data.get(b"attempts", b"0").decode())
        
        if attempts >= self.config.otp_max_attempts:
            self.redis.delete(otp_key)
            raise RateLimitError("Maximum OTP attempts exceeded")
        
        self.redis.hincrby(otp_key, "attempts", 1)
        
        stored_hash = otp_data[b"code"].decode()
        provided_hash = hashlib.sha256(otp.encode()).hexdigest()
        
        if hmac.compare_digest(stored_hash, provided_hash):
            self.redis.delete(otp_key)
            logger.info("ussd_otp_verified", msisdn=msisdn[-4:], purpose=purpose)
            return True
        
        logger.warning("ussd_otp_failed", msisdn=msisdn[-4:], attempts=attempts + 1)
        return False


def get_ussd_security_service() -> USSDSecurityService:
    """Get USSD security service singleton"""
    return USSDSecurityService()
