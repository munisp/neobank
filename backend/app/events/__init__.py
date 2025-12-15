"""
Events Package
Event sourcing infrastructure for NeoBank
"""

from .models import (
    BaseEvent,
    # Account events
    AccountCreated,
    AccountActivated,
    AccountSuspended,
    AccountClosed,
    # Transaction events
    TransferInitiated,
    TransferCompleted,
    TransferFailed,
    TransferReversed,
    # Balance events
    BalanceUpdated,
    BalanceReserved,
    BalanceReservationReleased,
    # Reconciliation events
    ReconciliationStarted,
    ReconciliationCompleted,
    DiscrepancyDetected,
    DiscrepancyResolved,
    # Saga events
    SagaStarted,
    SagaStepCompleted,
    SagaStepFailed,
    SagaCompleted,
    SagaFailed,
    SagaCompensating,
    SagaCompensated,
    # TigerBeetle sync events
    TigerBeetleAccountCreated,
    TigerBeetleTransferCreated,
    TigerBeetleSyncFailed,
    # Utility functions
    get_event_class,
    create_event_from_dict,
    EVENT_TYPES,
)

__all__ = [
    "BaseEvent",
    # Account events
    "AccountCreated",
    "AccountActivated",
    "AccountSuspended",
    "AccountClosed",
    # Transaction events
    "TransferInitiated",
    "TransferCompleted",
    "TransferFailed",
    "TransferReversed",
    # Balance events
    "BalanceUpdated",
    "BalanceReserved",
    "BalanceReservationReleased",
    # Reconciliation events
    "ReconciliationStarted",
    "ReconciliationCompleted",
    "DiscrepancyDetected",
    "DiscrepancyResolved",
    # Saga events
    "SagaStarted",
    "SagaStepCompleted",
    "SagaStepFailed",
    "SagaCompleted",
    "SagaFailed",
    "SagaCompensating",
    "SagaCompensated",
    # TigerBeetle sync events
    "TigerBeetleAccountCreated",
    "TigerBeetleTransferCreated",
    "TigerBeetleSyncFailed",
    # Utility functions
    "get_event_class",
    "create_event_from_dict",
    "EVENT_TYPES",
]
