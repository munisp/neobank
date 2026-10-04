"""
Production-grade database models for NeoBank

Canonical SQLAlchemy model layer. `app/models/*` are compatibility shims
re-exporting from here — do not define new models outside this module.

Password hashing: bcrypt via passlib (canonical scheme).
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from decimal import Decimal
import uuid
from enum import Enum

from passlib.context import CryptContext
from sqlalchemy import (
    Column, String, Integer, DateTime, Boolean, Text,
    Numeric, ForeignKey, Index, CheckConstraint, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

Base = declarative_base()

# Canonical password hashing context (bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def utcnow() -> datetime:
    """Timezone-aware UTC now (asyncpg requires tz-aware datetimes)."""
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps"""
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    OPERATOR = "operator"
    USER = "user"
    AUDITOR = "auditor"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    LOCKED = "locked"
    PENDING_VERIFICATION = "pending_verification"
    DELETED = "deleted"


class AccountType(str, Enum):
    SAVINGS = "savings"
    CURRENT = "current"
    FIXED_DEPOSIT = "fixed_deposit"
    BUSINESS = "business"


class AccountStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    CLOSED = "closed"


class TransactionType(str, Enum):
    CREDIT = "credit"
    DEBIT = "debit"
    TRANSFER = "transfer"
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"


class TransactionStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class KYCStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"
    EXPIRED = "expired"


# ---------------------------------------------------------------------------
# User & auth
# ---------------------------------------------------------------------------

class User(Base, TimestampMixin):
    """User account model (canonical)."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    # Profile
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    phone_number = Column(String(20), unique=True, nullable=True)
    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    address = Column(Text, nullable=True)
    country = Column(String(2), nullable=True)

    # Authorization
    roles = Column(JSONB, nullable=False, default=list)  # List of UserRole values

    # Status (stored as string for migration simplicity)
    status = Column(String(30), default=UserStatus.PENDING_VERIFICATION.value, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    phone_verified = Column(Boolean, default=False, nullable=False)

    # KYC
    kyc_status = Column(String(20), default=KYCStatus.NOT_STARTED.value, nullable=False)
    kyc_level = Column(String(20), default="basic", nullable=False)
    kyc_completed_at = Column(DateTime(timezone=True), nullable=True)

    # Security
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)

    # MFA
    mfa_enabled = Column(Boolean, default=False, nullable=False)

    # Relationships
    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    kyc_records = relationship("KYCRecord", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_user_email', 'email'),
        Index('idx_user_phone', 'phone_number'),
        CheckConstraint('failed_login_attempts >= 0', name='check_failed_attempts_positive'),
    )

    # -- compatibility aliases -------------------------------------------------
    @property
    def hashed_password(self) -> str:
        return self.password_hash

    @hashed_password.setter
    def hashed_password(self, value: str) -> None:
        self.password_hash = value

    @property
    def full_name(self) -> str:
        parts = [p for p in [self.first_name, self.last_name] if p]
        return " ".join(parts) or self.email

    @full_name.setter
    def full_name(self, value: str) -> None:
        parts = (value or "").split(None, 1)
        self.first_name = parts[0] if parts else None
        self.last_name = parts[1] if len(parts) > 1 else None

    @property
    def is_email_verified(self) -> bool:
        return bool(self.email_verified)

    @property
    def is_phone_verified(self) -> bool:
        return bool(self.phone_verified)

    # -- password helpers --------------------------------------------------------
    def set_password(self, password: str) -> None:
        self.password_hash = pwd_context.hash(password)
        self.password_changed_at = utcnow()

    def verify_password(self, password: str) -> bool:
        try:
            return pwd_context.verify(password, self.password_hash)
        except Exception:
            return False

    # -- security helpers --------------------------------------------------------
    def is_locked(self) -> bool:
        if self.status == UserStatus.LOCKED.value:
            return True
        if self.locked_until:
            locked_until = self.locked_until
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > utcnow():
                return True
        return False

    def increment_failed_login(self) -> None:
        self.failed_login_attempts = (self.failed_login_attempts or 0) + 1
        if self.failed_login_attempts >= 5:
            self.locked_until = utcnow() + timedelta(minutes=30)
            self.status = UserStatus.LOCKED.value

    def reset_failed_login(self) -> None:
        self.failed_login_attempts = 0
        self.locked_until = None
        if self.status == UserStatus.LOCKED.value:
            self.status = UserStatus.ACTIVE.value

    def has_role(self, role) -> bool:
        value = role.value if isinstance(role, UserRole) else str(role)
        return value in (self.roles or [])

    def to_dict(self, include_sensitive: bool = False) -> dict:
        data = {
            "id": str(self.id),
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "phone_number": self.phone_number,
            "country": self.country,
            "roles": self.roles or [],
            "status": self.status,
            "is_active": self.is_active,
            "is_verified": self.is_verified,
            "email_verified": self.email_verified,
            "phone_verified": self.phone_verified,
            "mfa_enabled": self.mfa_enabled,
            "kyc_status": self.kyc_status,
            "kyc_level": self.kyc_level,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": (self.last_login_at or self.last_login).isoformat()
                             if (self.last_login_at or self.last_login) else None,
        }
        if include_sensitive:
            data.update({
                "failed_login_attempts": self.failed_login_attempts,
                "locked_until": self.locked_until.isoformat() if self.locked_until else None,
            })
        return data

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, status={self.status})>"


class AuthenticationAttempt(Base):
    """Audit log of all authentication attempts."""
    __tablename__ = "authentication_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    email = Column(String(255), nullable=False, index=True)

    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(255), nullable=True)

    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)

    attempted_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    # `metadata` is reserved by SQLAlchemy's declarative API
    extra_data = Column("metadata", JSONB, nullable=True)

    def to_dict(self) -> dict:
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


class RefreshToken(Base, TimestampMixin):
    """Refresh token records for revocation-aware refresh flow."""
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_jti = Column(String(64), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True)  # SHA-256 hex of the token
    is_revoked = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")

    __table_args__ = (
        Index('idx_refresh_token_user', 'user_id'),
        Index('idx_refresh_token_jti', 'token_jti'),
    )

    def revoke(self) -> None:
        self.is_revoked = True
        self.revoked_at = utcnow()

    def is_valid(self) -> bool:
        if self.is_revoked:
            return False
        expires_at = self.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return expires_at > utcnow()


# ---------------------------------------------------------------------------
# Accounts & transactions
# ---------------------------------------------------------------------------

class Account(Base, TimestampMixin):
    """Bank account model"""
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_number = Column(String(20), unique=True, nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Account details
    account_type = Column(String(20), default=AccountType.SAVINGS.value, nullable=False)
    account_name = Column(String(255), nullable=False)
    currency = Column(String(3), default="NGN", nullable=False)

    # Balance (stored in naira with 2dp precision)
    balance = Column(Numeric(precision=15, scale=2), default=0, nullable=False)
    available_balance = Column(Numeric(precision=15, scale=2), default=0, nullable=False)

    # Status and limits
    status = Column(String(20), default=AccountStatus.ACTIVE.value, nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    daily_limit = Column(Numeric(precision=15, scale=2), default=1000000, nullable=False)  # N1M
    monthly_limit = Column(Numeric(precision=15, scale=2), default=10000000, nullable=False)  # N10M

    # TigerBeetle integration
    tigerbeetle_account_id = Column(String(50), unique=True, nullable=True)

    # Relationships
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan",
                                foreign_keys="Transaction.account_id")

    __table_args__ = (
        Index('idx_account_number', 'account_number'),
        Index('idx_account_user', 'user_id'),
        CheckConstraint('balance >= 0', name='check_balance_positive'),
        CheckConstraint('available_balance >= 0', name='check_available_balance_positive'),
        CheckConstraint('daily_limit > 0', name='check_daily_limit_positive'),
        CheckConstraint('monthly_limit > 0', name='check_monthly_limit_positive'),
    )


class Transaction(Base, TimestampMixin):
    """Transaction model"""
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference = Column(String(50), unique=True, nullable=False, index=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Transaction details
    transaction_type = Column(String(20), nullable=False)
    amount = Column(Numeric(precision=15, scale=2), nullable=False)
    currency = Column(String(3), default="NGN", nullable=False)
    description = Column(Text, nullable=False)

    # Status and processing
    status = Column(String(20), default=TransactionStatus.PENDING.value, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)

    # Transfer details (for transfers)
    destination_account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True)
    destination_account_number = Column(String(20), nullable=True)
    destination_bank_code = Column(String(10), nullable=True)

    # Balance tracking
    balance_before = Column(Numeric(precision=15, scale=2), nullable=True)
    balance_after = Column(Numeric(precision=15, scale=2), nullable=True)

    # Fraud detection
    fraud_score = Column(Numeric(precision=5, scale=4), nullable=True)
    fraud_checked = Column(Boolean, default=False, nullable=False)
    fraud_flagged = Column(Boolean, default=False, nullable=False)

    # External references
    tigerbeetle_transfer_id = Column(String(50), nullable=True)
    external_reference = Column(String(100), nullable=True)

    # `metadata` is reserved by SQLAlchemy's declarative API
    extra_data = Column("metadata", JSONB, nullable=True)

    # Relationships
    account = relationship("Account", foreign_keys=[account_id], back_populates="transactions")
    destination_account = relationship("Account", foreign_keys=[destination_account_id])
    user = relationship("User")

    __table_args__ = (
        Index('idx_transaction_reference', 'reference'),
        Index('idx_transaction_account', 'account_id'),
        Index('idx_transaction_user', 'user_id'),
        Index('idx_transaction_status', 'status'),
        Index('idx_transaction_created', 'created_at'),
        CheckConstraint('amount > 0', name='check_amount_positive'),
    )


# ---------------------------------------------------------------------------
# KYC, fraud, API keys
# ---------------------------------------------------------------------------

class KYCRecord(Base, TimestampMixin):
    """KYC verification record"""
    __tablename__ = "kyc_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # KYC details
    status = Column(String(20), default=KYCStatus.NOT_STARTED.value, nullable=False)
    verification_level = Column(String(20), default="basic", nullable=False)

    # Document information
    documents_submitted = Column(JSONB, nullable=True)
    verification_data = Column(JSONB, nullable=True)  # also stores KYB payloads (verification_level="kyb")

    # Processing
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Review details
    reviewer_notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    # External service references
    external_kyc_id = Column(String(100), nullable=True)

    # Relationships
    user = relationship("User", back_populates="kyc_records")

    __table_args__ = (
        Index('idx_kyc_user', 'user_id'),
        Index('idx_kyc_status', 'status'),
    )


class FraudAlert(Base, TimestampMixin):
    """Fraud detection alerts"""
    __tablename__ = "fraud_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Alert details
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)  # low, medium, high, critical
    fraud_score = Column(Numeric(precision=5, scale=4), nullable=False)

    # Detection details
    detection_rules = Column(JSONB, nullable=True)
    ml_model_output = Column(JSONB, nullable=True)

    # Status
    status = Column(String(20), default="open", nullable=False)  # open, investigating, resolved, false_positive
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_notes = Column(Text, nullable=True)

    # Relationships
    transaction = relationship("Transaction")
    user = relationship("User")

    __table_args__ = (
        Index('idx_fraud_alert_transaction', 'transaction_id'),
        Index('idx_fraud_alert_user', 'user_id'),
        Index('idx_fraud_alert_severity', 'severity'),
        Index('idx_fraud_alert_status', 'status'),
    )


class APIKey(Base, TimestampMixin):
    """API keys for external integrations"""
    __tablename__ = "api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    key_hash = Column(String(255), nullable=False, unique=True)

    # Permissions and limits
    permissions = Column(JSONB, nullable=True)
    rate_limit = Column(Integer, default=1000, nullable=False)

    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_used = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index('idx_api_key_hash', 'key_hash'),
        Index('idx_api_key_active', 'is_active'),
    )


class IdempotencyLog(Base, TimestampMixin):
    """Idempotency keys for mutating API calls."""
    __tablename__ = "idempotency_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(128), nullable=False, unique=True, index=True)
    endpoint = Column(String(255), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), default="in_progress", nullable=False)  # in_progress, completed, failed
    response_status = Column(Integer, nullable=True)
    response_body = Column(JSONB, nullable=True)
    locked_until = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index('idx_idempotency_key', 'key'),
    )


class IDVSession(Base, TimestampMixin):
    """Identity verification session (self-hosted OpenKYC replacement)."""
    __tablename__ = "idv_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(String(30), default="NOT_STARTED", nullable=False)
    vendor_id = Column(String(64), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    session_url = Column(Text, nullable=True)
    front_image_b64 = Column(Text, nullable=True)
    back_image_b64 = Column(Text, nullable=True)
    selfie_image_b64 = Column(Text, nullable=True)
    biometrics_result = Column(JSONB, nullable=True)  # liveness + face-match decision
    result = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)

    __table_args__ = (
        Index('idx_idv_session_status', 'status'),
        Index('idx_idv_session_user', 'user_id'),
    )


class IDVWebhookLog(Base, TimestampMixin):
    """Delivery log for IDV webhook notifications."""
    __tablename__ = "idv_webhook_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("idv_sessions.id", ondelete="CASCADE"), nullable=False)
    event = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False)  # delivered, failed, skipped
    response_status = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)

    __table_args__ = (
        Index('idx_idv_webhook_session', 'session_id'),
    )


class KycTriggerEvent(Base, TimestampMixin):
    """Event-driven KYC requirement raised by the trigger engine.

    Fired by money-movement, product-onboarding, and risk events; tracks
    the level the user must reach and whether it has been satisfied."""
    __tablename__ = "kyc_trigger_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trigger_key = Column(String(64), nullable=False)      # e.g. daily_limit_tier1, ngx_onboarding
    event_type = Column(String(64), nullable=False)        # originating event (transfer, ngx_order, ...)
    current_level = Column(String(20), nullable=False)     # user's level when fired
    required_level = Column(String(20), nullable=False)    # level the trigger demands
    context = Column(JSONB, nullable=True)                 # amount, currency, channel, ...
    status = Column(String(20), default="open", nullable=False)  # open | satisfied | waived
    satisfied_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index('idx_kyc_trigger_user', 'user_id'),
        Index('idx_kyc_trigger_status', 'status'),
    )


class Notification(Base, TimestampMixin):
    """Persistent user notifications (in-app + push)."""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    type = Column(String(50), default="info", nullable=False)  # info, transaction, security, promo, alert
    data = Column(JSONB, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index('idx_notifications_user_read', 'user_id', 'is_read'),
        Index('idx_notifications_user_created', 'user_id', 'created_at'),
    )


class PushSubscription(Base, TimestampMixin):
    """Web-push subscriptions per device (VAPID)."""
    __tablename__ = "push_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(Text, nullable=False, unique=True)
    keys = Column(JSONB, nullable=False)  # {p256dh, auth}
    user_agent = Column(String(255), nullable=True)


class Budget(Base, TimestampMixin):
    """Per-category monthly spending budgets."""
    __tablename__ = "budgets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(64), nullable=False)
    limit_amount = Column(Numeric(18, 2), nullable=False)
    alert_threshold = Column(Integer, default=80, nullable=False)  # percent
    period = Column(String(20), default="monthly", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint('user_id', 'category', 'period', name='uq_budget_user_category_period'),
    )


class BudgetSettings(Base, TimestampMixin):
    """User-level budgeting preferences."""
    __tablename__ = "budget_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    monthly_income = Column(Numeric(18, 2), nullable=True)
    currency = Column(String(3), default="NGN", nullable=False)
    alerts_enabled = Column(Boolean, default=True, nullable=False)
    rollover_enabled = Column(Boolean, default=False, nullable=False)


class Segment(Base, TimestampMixin):
    """Market segment definition (e.g. students, SMEs, gig workers)."""
    __tablename__ = "segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(64), unique=True, nullable=False)          # e.g. 'students'
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(64), nullable=True)                       # lucide icon name
    criteria = Column(JSONB, default=dict)                         # auto-match rules (age_range, kyc_flags, etc.)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)


class SegmentApp(Base, TimestampMixin):
    """An app/feature tile offered through the segment app store."""
    __tablename__ = "segment_apps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    segment_id = Column(UUID(as_uuid=True), ForeignKey("segments.id", ondelete="CASCADE"), nullable=False)
    key = Column(String(64), nullable=False)                       # e.g. 'split-bills'
    name = Column(String(128), nullable=False)
    tagline = Column(String(255), nullable=True)
    route = Column(String(255), nullable=False)                    # frontend route, e.g. /transfers?mode=request
    icon = Column(String(64), nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint('segment_id', 'key', name='uq_segment_app_key'),
    )
    segment = relationship("Segment", backref="apps")


class UserSegment(Base, TimestampMixin):
    """User ↔ segment membership (manual enroll or rule-matched)."""
    __tablename__ = "user_segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    segment_id = Column(UUID(as_uuid=True), ForeignKey("segments.id", ondelete="CASCADE"), nullable=False)
    source = Column(String(32), default="manual", nullable=False)  # manual | rule | admin

    __table_args__ = (
        UniqueConstraint('user_id', 'segment_id', name='uq_user_segment'),
        Index('idx_user_segments_user', 'user_id'),
    )
    segment = relationship("Segment")



# ============================================================================
# Platform expansion: developer ecosystem, settlement, mortgages, NGX,
# stablecoins, tenant themes, segment analytics
# ============================================================================

class Developer(Base, TimestampMixin):
    """Third-party developer account."""
    __tablename__ = "developers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    company_name = Column(String(255), nullable=False)
    website = Column(String(255), nullable=True)
    status = Column(String(32), default="pending", nullable=False)  # pending | verified | suspended


class DeveloperApp(Base, TimestampMixin):
    """A third-party app going through vetting for the segment app store."""
    __tablename__ = "developer_apps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    developer_id = Column(UUID(as_uuid=True), ForeignKey("developers.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(128), nullable=False)
    tagline = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    icon = Column(String(64), nullable=True)
    callback_url = Column(String(512), nullable=True)               # webhook endpoint
    scopes = Column(JSONB, default=list)                            # e.g. ["accounts:read", "payments:initiate"]
    target_segments = Column(JSONB, default=list)                   # segment keys the app targets
    status = Column(String(32), default="draft", nullable=False)    # draft | submitted | approved | rejected | suspended
    review_notes = Column(Text, nullable=True)
    api_key_hash = Column(String(128), nullable=True)               # sha256 of issued key
    api_key_prefix = Column(String(16), nullable=True)              # "nbk_live_ab12" for identification
    published_segment_app_id = Column(UUID(as_uuid=True), ForeignKey("segment_apps.id", ondelete="SET NULL"), nullable=True)

    developer = relationship("Developer", backref="apps")


class DeveloperWebhook(Base, TimestampMixin):
    """Webhook subscription for a developer app (HMAC-signed deliveries)."""
    __tablename__ = "developer_webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    app_id = Column(UUID(as_uuid=True), ForeignKey("developer_apps.id", ondelete="CASCADE"), nullable=False)
    event = Column(String(64), nullable=False)                      # e.g. payment.completed
    url = Column(String(512), nullable=False)
    secret = Column(String(128), nullable=False)                    # signing secret
    is_active = Column(Boolean, default=True, nullable=False)


class TenantTheme(Base, TimestampMixin):
    """Server-side tenant Brand Pack (replaces localStorage-only persistence)."""
    __tablename__ = "tenant_themes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_key = Column(String(64), unique=True, nullable=False)
    seed_color = Column(String(7), nullable=False)                  # hex
    radius = Column(String(16), default="default", nullable=False)  # sharp | default | round
    motion_bias = Column(String(16), default="standard", nullable=False)
    voice = Column(String(32), default="neutral", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class SegmentEvent(Base, TimestampMixin):
    """Analytics: enroll / launch / view events per segment and app."""
    __tablename__ = "segment_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    segment_key = Column(String(64), nullable=False)
    app_key = Column(String(64), nullable=True)
    event = Column(String(32), nullable=False)                      # view | enroll | launch

    __table_args__ = (
        Index('idx_segment_events_seg_event', 'segment_key', 'event'),
        Index('idx_segment_events_user', 'user_id'),
    )


class SettlementBatch(Base, TimestampMixin):
    """A settlement run over a period (pairs with the reconciliation engine)."""
    __tablename__ = "settlement_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference = Column(String(64), unique=True, nullable=False)     # e.g. STL-20261004-001
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(32), default="open", nullable=False)     # open | processing | settled | failed
    total_debits = Column(Numeric(18, 2), default=0, nullable=False)
    total_credits = Column(Numeric(18, 2), default=0, nullable=False)
    net_position = Column(Numeric(18, 2), default=0, nullable=False)
    entry_count = Column(Integer, default=0, nullable=False)
    settled_at = Column(DateTime(timezone=True), nullable=True)


class SettlementEntry(Base, TimestampMixin):
    """One line in a settlement batch (per counterparty/account)."""
    __tablename__ = "settlement_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("settlement_batches.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    direction = Column(String(8), nullable=False)                   # debit | credit
    amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(3), default="NGN", nullable=False)
    reference = Column(String(128), nullable=True)
    reconciled = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index('idx_settlement_entries_batch', 'batch_id'),
    )
    batch = relationship("SettlementBatch", backref="entries")


class MortgageProduct(Base, TimestampMixin):
    """A mortgage offer (property type, rate, tenor) — admin-managed."""
    __tablename__ = "mortgage_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    annual_rate_pct = Column(Numeric(5, 2), nullable=False)         # e.g. 21.00
    max_tenor_years = Column(Integer, default=20, nullable=False)
    min_deposit_pct = Column(Numeric(5, 2), default=20, nullable=False)
    max_amount = Column(Numeric(18, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)


class MortgageApplication(Base, TimestampMixin):
    """A user's mortgage application with payment plan."""
    __tablename__ = "mortgage_applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("mortgage_products.id"), nullable=False)
    property_value = Column(Numeric(18, 2), nullable=False)
    deposit_amount = Column(Numeric(18, 2), nullable=False)
    principal = Column(Numeric(18, 2), nullable=False)
    annual_rate_pct = Column(Numeric(5, 2), nullable=False)
    tenor_months = Column(Integer, nullable=False)
    monthly_payment = Column(Numeric(18, 2), nullable=False)
    status = Column(String(32), default="draft", nullable=False)    # draft | submitted | approved | declined | active | completed
    property_address = Column(Text, nullable=True)

    __table_args__ = (
        Index('idx_mortgage_apps_user', 'user_id'),
    )
    product = relationship("MortgageProduct")


class MortgageScheduleEntry(Base, TimestampMixin):
    """One installment in a mortgage payment plan."""
    __tablename__ = "mortgage_schedule"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), ForeignKey("mortgage_applications.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)                      # 1..tenor_months
    due_date = Column(DateTime(timezone=True), nullable=False)
    amount = Column(Numeric(18, 2), nullable=False)                 # EMI
    principal_part = Column(Numeric(18, 2), nullable=False)
    interest_part = Column(Numeric(18, 2), nullable=False)
    balance_after = Column(Numeric(18, 2), nullable=False)
    status = Column(String(16), default="due", nullable=False)      # due | paid | late
    paid_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint('application_id', 'sequence', name='uq_mortgage_schedule_seq'),
        Index('idx_mortgage_schedule_app', 'application_id'),
    )
    application = relationship("MortgageApplication", backref="schedule")


class NgxSecurity(Base, TimestampMixin):
    """NGX-listed security master (seeded with major listings)."""
    __tablename__ = "ngx_securities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol = Column(String(16), unique=True, nullable=False)        # e.g. DANGCEM
    name = Column(String(255), nullable=False)
    sector = Column(String(64), nullable=True)
    last_price = Column(Numeric(14, 2), nullable=False)             # NGN per share
    currency = Column(String(3), default="NGN", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class NgxOrder(Base, TimestampMixin):
    """A buy/sell order for an NGX security."""
    __tablename__ = "ngx_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    security_id = Column(UUID(as_uuid=True), ForeignKey("ngx_securities.id"), nullable=False)
    side = Column(String(4), nullable=False)                        # buy | sell
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(14, 2), nullable=False)                  # execution price
    gross_amount = Column(Numeric(18, 2), nullable=False)
    fee = Column(Numeric(18, 2), default=0, nullable=False)
    status = Column(String(16), default="executed", nullable=False) # executed | pending | cancelled

    __table_args__ = (
        Index('idx_ngx_orders_user', 'user_id'),
    )
    security = relationship("NgxSecurity")


class NgxHolding(Base, TimestampMixin):
    """Aggregated NGX position per user/security."""
    __tablename__ = "ngx_holdings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    security_id = Column(UUID(as_uuid=True), ForeignKey("ngx_securities.id"), nullable=False)
    quantity = Column(Integer, default=0, nullable=False)
    avg_cost = Column(Numeric(14, 2), default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint('user_id', 'security_id', name='uq_ngx_holding'),
    )
    security = relationship("NgxSecurity")


class StablecoinWallet(Base, TimestampMixin):
    """Custodial stablecoin balance (USDT/USDC) per user."""
    __tablename__ = "stablecoin_wallets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    asset = Column(String(8), nullable=False)                       # USDT | USDC
    balance = Column(Numeric(28, 8), default=0, nullable=False)
    address = Column(String(128), nullable=True)                    # deposit address (custodial)

    __table_args__ = (
        UniqueConstraint('user_id', 'asset', name='uq_stablecoin_wallet'),
        Index('idx_stablecoin_wallets_user', 'user_id'),
    )


class StablecoinTransfer(Base, TimestampMixin):
    """Stablecoin ledger entries: ramp in/out, P2P transfers."""
    __tablename__ = "stablecoin_transfers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_id = Column(UUID(as_uuid=True), ForeignKey("stablecoin_wallets.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(16), nullable=False)                       # ramp_in | ramp_out | send | receive
    asset = Column(String(8), nullable=False)
    amount = Column(Numeric(28, 8), nullable=False)
    ngn_amount = Column(Numeric(18, 2), nullable=True)              # for ramps
    rate = Column(Numeric(18, 4), nullable=True)                    # NGN per USD for ramps
    counterparty = Column(String(128), nullable=True)               # address or user ref
    status = Column(String(16), default="completed", nullable=False)
    tx_hash = Column(String(128), nullable=True)

    __table_args__ = (
        Index('idx_stablecoin_transfers_wallet', 'wallet_id'),
    )
    wallet = relationship("StablecoinWallet", backref="transfers")
