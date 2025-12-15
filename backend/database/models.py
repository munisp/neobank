"""
Production-grade database models for NeoBank
"""
from datetime import datetime, timezone
from typing import Optional
from decimal import Decimal
import uuid
from enum import Enum

from sqlalchemy import (
    Column, String, Integer, DateTime, Boolean, Text, 
    Numeric, ForeignKey, Index, CheckConstraint, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

Base = declarative_base()


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps"""
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


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


class User(Base, TimestampMixin):
    """User account model"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone_number = Column(String(20), unique=True, nullable=True)
    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    address = Column(Text, nullable=True)
    
    # Status fields
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    phone_verified = Column(Boolean, default=False, nullable=False)
    
    # KYC status
    kyc_status = Column(String(20), default=KYCStatus.NOT_STARTED, nullable=False)
    kyc_completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Security
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    kyc_records = relationship("KYCRecord", back_populates="user", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_user_email', 'email'),
        Index('idx_user_phone', 'phone_number'),
        CheckConstraint('failed_login_attempts >= 0', name='check_failed_attempts_positive'),
    )


class Account(Base, TimestampMixin):
    """Bank account model"""
    __tablename__ = "accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_number = Column(String(20), unique=True, nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Account details
    account_type = Column(String(20), default=AccountType.SAVINGS, nullable=False)
    account_name = Column(String(255), nullable=False)
    currency = Column(String(3), default="NGN", nullable=False)
    
    # Balance (stored in kobo/cents for precision)
    balance = Column(Numeric(precision=15, scale=2), default=0, nullable=False)
    available_balance = Column(Numeric(precision=15, scale=2), default=0, nullable=False)
    
    # Status and limits
    status = Column(String(20), default=AccountStatus.ACTIVE, nullable=False)
    daily_limit = Column(Numeric(precision=15, scale=2), default=1000000, nullable=False)  # ₦1M
    monthly_limit = Column(Numeric(precision=15, scale=2), default=10000000, nullable=False)  # ₦10M
    
    # TigerBeetle integration
    tigerbeetle_account_id = Column(String(50), unique=True, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan")
    
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
    
    # Transaction details
    transaction_type = Column(String(20), nullable=False)
    amount = Column(Numeric(precision=15, scale=2), nullable=False)
    currency = Column(String(3), default="NGN", nullable=False)
    description = Column(Text, nullable=False)
    
    # Status and processing
    status = Column(String(20), default=TransactionStatus.PENDING, nullable=False)
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
    
    # Metadata
    metadata = Column(JSONB, nullable=True)
    
    # Relationships
    account = relationship("Account", foreign_keys=[account_id], back_populates="transactions")
    destination_account = relationship("Account", foreign_keys=[destination_account_id])
    
    __table_args__ = (
        Index('idx_transaction_reference', 'reference'),
        Index('idx_transaction_account', 'account_id'),
        Index('idx_transaction_status', 'status'),
        Index('idx_transaction_created', 'created_at'),
        CheckConstraint('amount > 0', name='check_amount_positive'),
    )


class KYCRecord(Base, TimestampMixin):
    """KYC verification record"""
    __tablename__ = "kyc_records"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # KYC details
    status = Column(String(20), default=KYCStatus.NOT_STARTED, nullable=False)
    verification_level = Column(String(20), default="basic", nullable=False)
    
    # Document information
    documents_submitted = Column(JSONB, nullable=True)
    verification_data = Column(JSONB, nullable=True)
    
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
