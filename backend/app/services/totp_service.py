"""
TOTP (Time-based One-Time Password) Service for Two-Factor Authentication
RFC 6238 compliant implementation
"""

import hmac
import hashlib
import struct
import time
import secrets
import base64
from typing import Optional, List, Tuple
from dataclasses import dataclass
import structlog

logger = structlog.get_logger()


@dataclass
class TOTPConfig:
    """TOTP configuration"""
    issuer: str = "NeoBank"
    secret_size: int = 20
    period: int = 30  # Time step in seconds
    digits: int = 6
    algorithm: str = "SHA1"
    drift_tolerance: int = 1  # Number of periods to allow for clock drift


class TOTPService:
    """
    TOTP-based two-factor authentication service
    
    Implements RFC 6238 for time-based one-time passwords.
    Used for wire transfer approval, high-value transactions, and account security.
    """
    
    def __init__(self, config: Optional[TOTPConfig] = None):
        self.config = config or TOTPConfig()
        
    def generate_secret(self) -> str:
        """
        Generate a new TOTP secret
        
        Returns:
            Base32-encoded secret string
        """
        secret_bytes = secrets.token_bytes(self.config.secret_size)
        return base64.b32encode(secret_bytes).decode('utf-8').rstrip('=')
    
    def generate_code(self, secret: str, timestamp: Optional[int] = None) -> str:
        """
        Generate a TOTP code for the given secret and time
        
        Args:
            secret: Base32-encoded secret
            timestamp: Unix timestamp (defaults to current time)
            
        Returns:
            TOTP code as string with leading zeros
        """
        if timestamp is None:
            timestamp = int(time.time())
            
        # Decode the secret
        secret_bytes = self._decode_secret(secret)
        
        # Calculate the counter (time step)
        counter = timestamp // self.config.period
        
        # Generate HOTP
        code = self._hotp(secret_bytes, counter)
        
        # Format with leading zeros
        return str(code).zfill(self.config.digits)
    
    def validate_code(self, secret: str, code: str, user_id: Optional[str] = None) -> bool:
        """
        Validate a TOTP code against the secret
        
        Checks the current time step and adjacent steps for clock drift tolerance.
        
        Args:
            secret: Base32-encoded secret
            code: TOTP code to validate
            user_id: Optional user ID for logging
            
        Returns:
            True if code is valid, False otherwise
        """
        if not code or len(code) != self.config.digits:
            logger.warning("Invalid TOTP code format", user_id=user_id)
            return False
            
        if not code.isdigit():
            logger.warning("TOTP code contains non-digit characters", user_id=user_id)
            return False
            
        current_time = int(time.time())
        
        # Check current time step and adjacent steps for clock drift tolerance
        for offset in range(-self.config.drift_tolerance, self.config.drift_tolerance + 1):
            check_time = current_time + (offset * self.config.period)
            expected_code = self.generate_code(secret, check_time)
            
            if hmac.compare_digest(expected_code, code):
                logger.info(
                    "TOTP code validated successfully",
                    user_id=user_id,
                    drift_offset=offset
                )
                return True
        
        logger.warning("TOTP code validation failed", user_id=user_id)
        return False
    
    def get_provisioning_uri(self, secret: str, account_name: str) -> str:
        """
        Generate a URI for QR code generation (for authenticator apps)
        
        Args:
            secret: Base32-encoded secret
            account_name: User's account name/email
            
        Returns:
            otpauth:// URI for QR code generation
        """
        return (
            f"otpauth://totp/{self.config.issuer}:{account_name}"
            f"?secret={secret}"
            f"&issuer={self.config.issuer}"
            f"&algorithm={self.config.algorithm}"
            f"&digits={self.config.digits}"
            f"&period={self.config.period}"
        )
    
    def generate_backup_codes(self, count: int = 10) -> List[str]:
        """
        Generate backup codes for account recovery
        
        Args:
            count: Number of backup codes to generate
            
        Returns:
            List of backup codes
        """
        codes = []
        for _ in range(count):
            # Generate 8-character alphanumeric codes
            code = secrets.token_hex(4).upper()
            codes.append(f"{code[:4]}-{code[4:]}")
        return codes
    
    def hash_backup_code(self, code: str) -> str:
        """
        Hash a backup code for secure storage
        
        Args:
            code: Backup code to hash
            
        Returns:
            SHA-256 hash of the code
        """
        # Remove dashes and normalize
        normalized = code.replace("-", "").upper()
        return hashlib.sha256(normalized.encode()).hexdigest()
    
    def validate_backup_code(self, code: str, hashed_codes: List[str]) -> Tuple[bool, int]:
        """
        Validate a backup code against stored hashes
        
        Args:
            code: Backup code to validate
            hashed_codes: List of hashed backup codes
            
        Returns:
            Tuple of (is_valid, index) where index is the position of the used code
        """
        hashed_input = self.hash_backup_code(code)
        
        for i, hashed_code in enumerate(hashed_codes):
            if hmac.compare_digest(hashed_input, hashed_code):
                return True, i
                
        return False, -1
    
    def _decode_secret(self, secret: str) -> bytes:
        """Decode a base32 secret, handling padding"""
        # Add padding if necessary
        padding = 8 - (len(secret) % 8)
        if padding != 8:
            secret += '=' * padding
        return base64.b32decode(secret.upper())
    
    def _hotp(self, secret: bytes, counter: int) -> int:
        """
        Generate an HOTP code using HMAC-SHA1
        
        Args:
            secret: Secret key bytes
            counter: Counter value
            
        Returns:
            HOTP code as integer
        """
        # Convert counter to bytes (big-endian, 8 bytes)
        counter_bytes = struct.pack('>Q', counter)
        
        # Generate HMAC-SHA1
        h = hmac.new(secret, counter_bytes, hashlib.sha1)
        digest = h.digest()
        
        # Dynamic truncation (RFC 4226)
        offset = digest[-1] & 0x0f
        truncated = struct.unpack('>I', digest[offset:offset + 4])[0]
        truncated &= 0x7fffffff  # Clear the most significant bit
        
        # Get the specified number of digits
        code = truncated % (10 ** self.config.digits)
        
        return code


# Global TOTP service instance
totp_service = TOTPService()


class TwoFactorManager:
    """
    Manager for two-factor authentication operations
    
    Handles 2FA setup, verification, and backup code management.
    """
    
    def __init__(self, totp_service: Optional[TOTPService] = None):
        self.totp = totp_service or TOTPService()
        # In production, this would be backed by a database
        self._user_secrets = {}
        self._user_backup_codes = {}
        self._enabled_users = set()
    
    async def setup_2fa(self, user_id: str, email: str) -> dict:
        """
        Initialize 2FA setup for a user
        
        Args:
            user_id: User's unique identifier
            email: User's email address
            
        Returns:
            Setup information including secret and provisioning URI
        """
        secret = self.totp.generate_secret()
        backup_codes = self.totp.generate_backup_codes(10)
        
        # Store secret and hashed backup codes
        self._user_secrets[user_id] = secret
        self._user_backup_codes[user_id] = [
            self.totp.hash_backup_code(code) for code in backup_codes
        ]
        
        provisioning_uri = self.totp.get_provisioning_uri(secret, email)
        
        logger.info("2FA setup initiated", user_id=user_id)
        
        return {
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "backup_codes": backup_codes,
            "message": "Scan the QR code with your authenticator app"
        }
    
    async def verify_and_enable_2fa(self, user_id: str, code: str) -> bool:
        """
        Verify a TOTP code and enable 2FA for the user
        
        Args:
            user_id: User's unique identifier
            code: TOTP code from authenticator app
            
        Returns:
            True if verification successful and 2FA enabled
        """
        secret = self._user_secrets.get(user_id)
        if not secret:
            logger.warning("No 2FA secret found for user", user_id=user_id)
            return False
            
        if self.totp.validate_code(secret, code, user_id):
            self._enabled_users.add(user_id)
            logger.info("2FA enabled for user", user_id=user_id)
            return True
            
        return False
    
    async def verify_code(self, user_id: str, code: str) -> bool:
        """
        Verify a TOTP code for an authenticated operation
        
        Args:
            user_id: User's unique identifier
            code: TOTP code to verify
            
        Returns:
            True if code is valid
        """
        if user_id not in self._enabled_users:
            logger.warning("2FA not enabled for user", user_id=user_id)
            return False
            
        secret = self._user_secrets.get(user_id)
        if not secret:
            logger.error("2FA enabled but no secret found", user_id=user_id)
            return False
            
        return self.totp.validate_code(secret, code, user_id)
    
    async def verify_backup_code(self, user_id: str, code: str) -> bool:
        """
        Verify and consume a backup code
        
        Args:
            user_id: User's unique identifier
            code: Backup code to verify
            
        Returns:
            True if backup code is valid (code is consumed)
        """
        hashed_codes = self._user_backup_codes.get(user_id, [])
        
        is_valid, index = self.totp.validate_backup_code(code, hashed_codes)
        
        if is_valid:
            # Remove the used backup code
            self._user_backup_codes[user_id].pop(index)
            logger.info(
                "Backup code used",
                user_id=user_id,
                remaining_codes=len(self._user_backup_codes[user_id])
            )
            return True
            
        return False
    
    async def disable_2fa(self, user_id: str, code: str) -> bool:
        """
        Disable 2FA for a user (requires valid code)
        
        Args:
            user_id: User's unique identifier
            code: TOTP code to verify
            
        Returns:
            True if 2FA was disabled
        """
        if await self.verify_code(user_id, code):
            self._enabled_users.discard(user_id)
            self._user_secrets.pop(user_id, None)
            self._user_backup_codes.pop(user_id, None)
            logger.info("2FA disabled for user", user_id=user_id)
            return True
            
        return False
    
    def is_2fa_enabled(self, user_id: str) -> bool:
        """Check if 2FA is enabled for a user"""
        return user_id in self._enabled_users


# Global 2FA manager instance
two_factor_manager = TwoFactorManager()
