"""
User Database Model
Implements secure user authentication with password hashing
"""

from sqlalchemy import Column, String, Boolean, DateTime, Enum as SQLEnum, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum
from passlib.context import CryptContext
from typing import Optional, List

from .base import Base

# Password hashing context
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


class UserRole(str, enum.Enum):
    """User roles for RBAC"""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    OPERATOR = "operator"
    USER = "user"
    AUDITOR = "auditor"


class UserStatus(str, enum.Enum):
    """User account status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    LOCKED = "locked"
    PENDING_VERIFICATION = "pending_verification"


class User(Base):
    """
    User model for authentication and authorization
    
    Features:
    - Secure password hashing with Argon2
    - Account lockout after failed attempts
    - Email verification
    - Role-based access control
    - Audit trail for authentication attempts
    """
    __tablename__ = "users"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Authentication
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Profile
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    phone_number = Column(String(20), nullable=True)
    
    # Authorization
    roles = Column(JSON, nullable=False, default=list)  # List of UserRole values
    permissions = Column(JSON, nullable=False, default=list)  # Additional permissions
    
    # Status
    status = Column(SQLEnum(UserStatus), nullable=False, default=UserStatus.PENDING_VERIFICATION)
    is_email_verified = Column(Boolean, default=False, nullable=False)
    is_phone_verified = Column(Boolean, default=False, nullable=False)
    
    # Security
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    last_failed_login = Column(DateTime, nullable=True)
    locked_until = Column(DateTime, nullable=True)
    password_changed_at = Column(DateTime, nullable=True)
    
    # MFA
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    mfa_secret = Column(String(255), nullable=True)  # Encrypted TOTP secret
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    
    # Metadata
    metadata = Column(JSON, nullable=True)  # Additional user data
    
    def set_password(self, password: str) -> None:
        """Hash and set user password"""
        self.password_hash = pwd_context.hash(password)
        self.password_changed_at = datetime.utcnow()
    
    def verify_password(self, password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(password, self.password_hash)
    
    def is_locked(self) -> bool:
        """Check if account is locked"""
        if self.status == UserStatus.LOCKED:
            return True
        
        if self.locked_until and self.locked_until > datetime.utcnow():
            return True
        
        return False
    
    def increment_failed_login(self) -> None:
        """Increment failed login attempts and lock if threshold exceeded"""
        self.failed_login_attempts += 1
        self.last_failed_login = datetime.utcnow()
        
        # Lock account after 5 failed attempts for 30 minutes
        if self.failed_login_attempts >= 5:
            from datetime import timedelta
            self.locked_until = datetime.utcnow() + timedelta(minutes=30)
            self.status = UserStatus.LOCKED
    
    def reset_failed_login(self) -> None:
        """Reset failed login attempts after successful login"""
        self.failed_login_attempts = 0
        self.last_failed_login = None
        self.locked_until = None
        if self.status == UserStatus.LOCKED:
            self.status = UserStatus.ACTIVE
    
    def has_role(self, role: UserRole) -> bool:
        """Check if user has specific role"""
        return role.value in self.roles
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has specific permission"""
        return permission in self.permissions
    
    def to_dict(self, include_sensitive: bool = False) -> dict:
        """Convert user to dictionary (exclude sensitive data by default)"""
        data = {
            "id": str(self.id),
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "phone_number": self.phone_number,
            "roles": self.roles,
            "status": self.status.value,
            "is_email_verified": self.is_email_verified,
            "is_phone_verified": self.is_phone_verified,
            "mfa_enabled": self.mfa_enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }
        
        if include_sensitive:
            data.update({
                "failed_login_attempts": self.failed_login_attempts,
                "last_failed_login": self.last_failed_login.isoformat() if self.last_failed_login else None,
                "locked_until": self.locked_until.isoformat() if self.locked_until else None,
            })
        
        return data
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, status={self.status.value})>"


class AuthenticationAttempt(Base):
    """
    Authentication attempt audit log
    Tracks all login attempts for security monitoring
    """
    __tablename__ = "authentication_attempts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=True)  # Nullable for failed attempts with unknown user
    email = Column(String(255), nullable=False, index=True)
    
    # Attempt details
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(255), nullable=True)
    
    # Request metadata
    ip_address = Column(String(45), nullable=True)  # IPv6 max length
    user_agent = Column(String(500), nullable=True)
    
    # Timestamps
    attempted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Additional metadata
    metadata = Column(JSON, nullable=True)
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "email": self.email,
            "success": self.success,
            "failure_reason": self.failure_reason,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "attempted_at": self.attempted_at.isoformat() if self.attempted_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<AuthenticationAttempt(email={self.email}, success={self.success}, attempted_at={self.attempted_at})>"


class RefreshToken(Base):
    """
    Refresh token storage for token revocation
    """
    __tablename__ = "refresh_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Token details
    token_jti = Column(String(255), unique=True, nullable=False, index=True)  # JWT ID
    
    # Status
    is_revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    
    # Expiration
    expires_at = Column(DateTime, nullable=False)
    
    # Request metadata
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def is_expired(self) -> bool:
        """Check if token is expired"""
        return datetime.utcnow() > self.expires_at
    
    def is_valid(self) -> bool:
        """Check if token is valid (not revoked and not expired)"""
        return not self.is_revoked and not self.is_expired()
    
    def revoke(self) -> None:
        """Revoke token"""
        self.is_revoked = True
        self.revoked_at = datetime.utcnow()
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "token_jti": self.token_jti,
            "is_revoked": self.is_revoked,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<RefreshToken(user_id={self.user_id}, is_revoked={self.is_revoked})>"
