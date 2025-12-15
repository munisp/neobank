"""
Event Models for Event Sourcing
Defines all domain events for TigerBeetle-PostgreSQL synchronization
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from decimal import Decimal
from enum import Enum
from dataclasses import dataclass, field, asdict
from uuid import UUID, uuid4
import json


# ============================================================================
# BASE EVENT CLASSES
# ============================================================================

@dataclass
class BaseEvent:
    """Base class for all domain events"""
    
    # Event identification
    event_id: UUID = field(default_factory=uuid4)
    event_type: str = field(init=False)
    
    # Aggregate information
    aggregate_id: str
    aggregate_type: str
    version: int
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    # Causality tracking
    correlation_id: Optional[UUID] = None
    causation_id: Optional[UUID] = None
    
    # User context
    user_id: Optional[str] = None
    
    # System information
    service_name: str = "neobank-backend"
    service_version: str = "1.0.0"
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Set event_type from class name"""
        if not hasattr(self, 'event_type') or not self.event_type:
            self.event_type = self.__class__.__name__
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary"""
        data = asdict(self)
        # Convert UUID to string
        for key, value in data.items():
            if isinstance(value, UUID):
                data[key] = str(value)
            elif isinstance(value, datetime):
                data[key] = value.isoformat()
            elif isinstance(value, Decimal):
                data[key] = str(value)
        return data
    
    def to_json(self) -> str:
        """Convert event to JSON string"""
        return json.dumps(self.to_dict(), default=str)


# ============================================================================
# ACCOUNT EVENTS
# ============================================================================

@dataclass
class AccountCreated(BaseEvent):
    """Event emitted when a new account is created"""
    
    aggregate_type: str = "Account"
    
    # Account details
    account_number: str = ""
    account_type: str = ""
    currency: str = "NGN"
    initial_balance: Decimal = Decimal("0.00")
    
    # TigerBeetle mapping
    tigerbeetle_account_id: Optional[int] = None
    tigerbeetle_ledger: Optional[int] = None
    tigerbeetle_code: Optional[int] = None
    
    # Account metadata
    branch_code: Optional[str] = None
    product_code: Optional[str] = None
    interest_rate: Optional[Decimal] = None


@dataclass
class AccountActivated(BaseEvent):
    """Event emitted when an account is activated"""
    
    aggregate_type: str = "Account"
    account_number: str = ""
    activated_by: Optional[str] = None


@dataclass
class AccountSuspended(BaseEvent):
    """Event emitted when an account is suspended"""
    
    aggregate_type: str = "Account"
    account_number: str = ""
    reason: str = ""
    suspended_by: Optional[str] = None


@dataclass
class AccountClosed(BaseEvent):
    """Event emitted when an account is closed"""
    
    aggregate_type: str = "Account"
    account_number: str = ""
    final_balance: Decimal = Decimal("0.00")
    reason: str = ""
    closed_by: Optional[str] = None


# ============================================================================
# TRANSACTION EVENTS
# ============================================================================

@dataclass
class TransferInitiated(BaseEvent):
    """Event emitted when a transfer is initiated"""
    
    aggregate_type: str = "Transfer"
    
    # Transfer details
    from_account_id: str = ""
    to_account_id: str = ""
    amount: Decimal = Decimal("0.00")
    currency: str = "NGN"
    description: str = ""
    reference: str = ""
    
    # TigerBeetle mapping
    tigerbeetle_transfer_id: Optional[int] = None
    tigerbeetle_debit_account_id: Optional[int] = None
    tigerbeetle_credit_account_id: Optional[int] = None
    
    # Saga tracking
    saga_id: Optional[UUID] = None


@dataclass
class TransferCompleted(BaseEvent):
    """Event emitted when a transfer is completed"""
    
    aggregate_type: str = "Transfer"
    
    transfer_id: str = ""
    from_account_id: str = ""
    to_account_id: str = ""
    amount: Decimal = Decimal("0.00")
    currency: str = "NGN"
    
    # Balances after transfer
    from_account_balance: Decimal = Decimal("0.00")
    to_account_balance: Decimal = Decimal("0.00")
    
    # TigerBeetle confirmation
    tigerbeetle_transfer_id: Optional[int] = None
    tigerbeetle_timestamp: Optional[int] = None
    
    # Saga tracking
    saga_id: Optional[UUID] = None


@dataclass
class TransferFailed(BaseEvent):
    """Event emitted when a transfer fails"""
    
    aggregate_type: str = "Transfer"
    
    transfer_id: str = ""
    from_account_id: str = ""
    to_account_id: str = ""
    amount: Decimal = Decimal("0.00")
    currency: str = "NGN"
    
    # Failure details
    error_code: str = ""
    error_message: str = ""
    failure_reason: str = ""
    
    # Saga tracking
    saga_id: Optional[UUID] = None


@dataclass
class TransferReversed(BaseEvent):
    """Event emitted when a transfer is reversed"""
    
    aggregate_type: str = "Transfer"
    
    original_transfer_id: str = ""
    reversal_transfer_id: str = ""
    from_account_id: str = ""
    to_account_id: str = ""
    amount: Decimal = Decimal("0.00")
    currency: str = "NGN"
    reason: str = ""
    
    # TigerBeetle confirmation
    tigerbeetle_reversal_id: Optional[int] = None


# ============================================================================
# BALANCE EVENTS
# ============================================================================

@dataclass
class BalanceUpdated(BaseEvent):
    """Event emitted when an account balance is updated"""
    
    aggregate_type: str = "Account"
    
    account_id: str = ""
    account_number: str = ""
    old_balance: Decimal = Decimal("0.00")
    new_balance: Decimal = Decimal("0.00")
    change_amount: Decimal = Decimal("0.00")
    change_type: str = ""  # "credit" or "debit"
    
    # Transaction reference
    transaction_id: Optional[str] = None
    transaction_type: Optional[str] = None


@dataclass
class BalanceReserved(BaseEvent):
    """Event emitted when funds are reserved (pending transfer)"""
    
    aggregate_type: str = "Account"
    
    account_id: str = ""
    account_number: str = ""
    reserved_amount: Decimal = Decimal("0.00")
    available_balance: Decimal = Decimal("0.00")
    
    # Reservation details
    reservation_id: UUID = field(default_factory=uuid4)
    expires_at: Optional[datetime] = None
    purpose: str = ""
    
    # Saga tracking
    saga_id: Optional[UUID] = None


@dataclass
class BalanceReservationReleased(BaseEvent):
    """Event emitted when a balance reservation is released"""
    
    aggregate_type: str = "Account"
    
    account_id: str = ""
    account_number: str = ""
    released_amount: Decimal = Decimal("0.00")
    available_balance: Decimal = Decimal("0.00")
    
    # Reservation details
    reservation_id: UUID = field(default_factory=uuid4)
    reason: str = ""
    
    # Saga tracking
    saga_id: Optional[UUID] = None


# ============================================================================
# RECONCILIATION EVENTS
# ============================================================================

@dataclass
class ReconciliationStarted(BaseEvent):
    """Event emitted when reconciliation starts"""
    
    aggregate_type: str = "Reconciliation"
    
    run_date: datetime = field(default_factory=datetime.utcnow)
    accounts_to_check: int = 0


@dataclass
class ReconciliationCompleted(BaseEvent):
    """Event emitted when reconciliation completes"""
    
    aggregate_type: str = "Reconciliation"
    
    run_date: datetime = field(default_factory=datetime.utcnow)
    accounts_checked: int = 0
    discrepancies_found: int = 0
    auto_fixed: int = 0
    manual_review_required: int = 0
    duration_seconds: float = 0.0


@dataclass
class DiscrepancyDetected(BaseEvent):
    """Event emitted when a discrepancy is detected"""
    
    aggregate_type: str = "Discrepancy"
    
    account_id: str = ""
    account_number: str = ""
    pg_balance: Decimal = Decimal("0.00")
    tb_balance: Decimal = Decimal("0.00")
    difference: Decimal = Decimal("0.00")
    
    # Reconciliation context
    reconciliation_run_id: UUID = field(default_factory=uuid4)


@dataclass
class DiscrepancyResolved(BaseEvent):
    """Event emitted when a discrepancy is resolved"""
    
    aggregate_type: str = "Discrepancy"
    
    discrepancy_id: UUID = field(default_factory=uuid4)
    account_id: str = ""
    resolution_method: str = ""  # "auto_fix", "manual", "ignored"
    resolved_by: Optional[str] = None
    notes: str = ""


# ============================================================================
# SAGA EVENTS
# ============================================================================

@dataclass
class SagaStarted(BaseEvent):
    """Event emitted when a saga starts"""
    
    aggregate_type: str = "Saga"
    
    saga_type: str = ""
    total_steps: int = 0
    saga_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SagaStepCompleted(BaseEvent):
    """Event emitted when a saga step completes"""
    
    aggregate_type: str = "Saga"
    
    saga_id: UUID = field(default_factory=uuid4)
    step_number: int = 0
    step_name: str = ""
    step_result: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SagaStepFailed(BaseEvent):
    """Event emitted when a saga step fails"""
    
    aggregate_type: str = "Saga"
    
    saga_id: UUID = field(default_factory=uuid4)
    step_number: int = 0
    step_name: str = ""
    error_message: str = ""
    retry_count: int = 0


@dataclass
class SagaCompleted(BaseEvent):
    """Event emitted when a saga completes successfully"""
    
    aggregate_type: str = "Saga"
    
    saga_id: UUID = field(default_factory=uuid4)
    saga_type: str = ""
    duration_seconds: float = 0.0


@dataclass
class SagaFailed(BaseEvent):
    """Event emitted when a saga fails"""
    
    aggregate_type: str = "Saga"
    
    saga_id: UUID = field(default_factory=uuid4)
    saga_type: str = ""
    failed_step: int = 0
    error_message: str = ""


@dataclass
class SagaCompensating(BaseEvent):
    """Event emitted when a saga starts compensation"""
    
    aggregate_type: str = "Saga"
    
    saga_id: UUID = field(default_factory=uuid4)
    saga_type: str = ""
    failed_step: int = 0
    steps_to_compensate: int = 0


@dataclass
class SagaCompensated(BaseEvent):
    """Event emitted when a saga completes compensation"""
    
    aggregate_type: str = "Saga"
    
    saga_id: UUID = field(default_factory=uuid4)
    saga_type: str = ""
    compensated_steps: int = 0


# ============================================================================
# TIGERBEETLE SYNC EVENTS
# ============================================================================

@dataclass
class TigerBeetleAccountCreated(BaseEvent):
    """Event emitted when a TigerBeetle account is created"""
    
    aggregate_type: str = "TigerBeetleAccount"
    
    tigerbeetle_account_id: int = 0
    pg_account_id: str = ""
    account_number: str = ""
    ledger: int = 0
    code: int = 0
    currency: str = "NGN"


@dataclass
class TigerBeetleTransferCreated(BaseEvent):
    """Event emitted when a TigerBeetle transfer is created"""
    
    aggregate_type: str = "TigerBeetleTransfer"
    
    tigerbeetle_transfer_id: int = 0
    pg_transfer_id: str = ""
    debit_account_id: int = 0
    credit_account_id: int = 0
    amount: int = 0  # In currency units
    ledger: int = 0


@dataclass
class TigerBeetleSyncFailed(BaseEvent):
    """Event emitted when TigerBeetle sync fails"""
    
    aggregate_type: str = "TigerBeetleSync"
    
    operation: str = ""  # "create_account", "create_transfer", etc.
    pg_entity_id: str = ""
    error_message: str = ""
    retry_count: int = 0


# ============================================================================
# EVENT REGISTRY
# ============================================================================

EVENT_TYPES = {
    # Account events
    "AccountCreated": AccountCreated,
    "AccountActivated": AccountActivated,
    "AccountSuspended": AccountSuspended,
    "AccountClosed": AccountClosed,
    
    # Transaction events
    "TransferInitiated": TransferInitiated,
    "TransferCompleted": TransferCompleted,
    "TransferFailed": TransferFailed,
    "TransferReversed": TransferReversed,
    
    # Balance events
    "BalanceUpdated": BalanceUpdated,
    "BalanceReserved": BalanceReserved,
    "BalanceReservationReleased": BalanceReservationReleased,
    
    # Reconciliation events
    "ReconciliationStarted": ReconciliationStarted,
    "ReconciliationCompleted": ReconciliationCompleted,
    "DiscrepancyDetected": DiscrepancyDetected,
    "DiscrepancyResolved": DiscrepancyResolved,
    
    # Saga events
    "SagaStarted": SagaStarted,
    "SagaStepCompleted": SagaStepCompleted,
    "SagaStepFailed": SagaStepFailed,
    "SagaCompleted": SagaCompleted,
    "SagaFailed": SagaFailed,
    "SagaCompensating": SagaCompensating,
    "SagaCompensated": SagaCompensated,
    
    # TigerBeetle sync events
    "TigerBeetleAccountCreated": TigerBeetleAccountCreated,
    "TigerBeetleTransferCreated": TigerBeetleTransferCreated,
    "TigerBeetleSyncFailed": TigerBeetleSyncFailed,
}


def get_event_class(event_type: str):
    """Get event class by event type name"""
    return EVENT_TYPES.get(event_type)


def create_event_from_dict(event_type: str, data: Dict[str, Any]) -> BaseEvent:
    """Create event instance from dictionary"""
    event_class = get_event_class(event_type)
    if not event_class:
        raise ValueError(f"Unknown event type: {event_type}")
    
    return event_class(**data)
