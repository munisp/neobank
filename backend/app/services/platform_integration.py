"""Platform integration bridge — TigerBeetle ledger + event bus.

Every money-moving feature (NGX orders, stablecoin ramps, mortgage
disbursements/repayments, settlement netting, developer payouts) posts a
double-entry transfer to TigerBeetle and emits a domain event onto the
event bus (RabbitMQ in production, in-memory in dev).

Design rules:
- NEVER fail the business operation because infrastructure is down. If
  TigerBeetle is disabled/unavailable, `post_transfer` returns
  {"posted": False, "reason": ...} and the caller records the Postgres
  state as the source of truth; reconciliation will catch any drift later.
- System accounts (broker clearing, stablecoin reserve, mortgage pool,
  settlement clearing, fee revenue) are deterministic u128 mappings of
  stable string ids, auto-created on first use.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

import structlog

from app.events.models import BaseEvent
from app.infrastructure.tigerbeetle_client import (
    AccountCode, Ledger, TigerBeetleClient, TransferCode,
)

logger = structlog.get_logger(__name__)


@dataclass(kw_only=True)
class PlatformEvent(BaseEvent):
    """Generic domain event for the platform-expansion features."""
    payload: Dict[str, Any] = field(default_factory=dict)
    name: str = "PlatformEvent"

    def __post_init__(self):
        self.event_type = self.name


# System accounts: stable string ids → deterministic TigerBeetle u128
SYSTEM_ACCOUNTS = {
    "broker_clearing": AccountCode.BROKER_CLEARING,
    "stablecoin_reserve": AccountCode.STABLECOIN_RESERVE,
    "mortgage_pool": AccountCode.MORTGAGE_POOL,
    "settlement_clearing": AccountCode.SETTLEMENT_CLEARING,
    "fee_revenue": AccountCode.REVENUE,
}

# ledger per system account
ACCOUNT_LEDGER = {
    "broker_clearing": Ledger.NGX_BROKERAGE,
    "stablecoin_reserve": Ledger.STABLECOIN,
    "mortgage_pool": Ledger.MORTGAGE,
    "settlement_clearing": Ledger.PLATFORM_SETTLEMENT,
    "fee_revenue": Ledger.FEE,
}


class PlatformIntegration:
    """Singleton bridge used by the feature routers."""

    _instance: Optional["PlatformIntegration"] = None

    def __new__(cls) -> "PlatformIntegration":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self.tb = None
        try:
            self.tb = TigerBeetleClient()
        except Exception as exc:  # noqa: BLE001 — ledger may be down; degrade gracefully
            logger.warning("ledger.init_failed", error=str(exc))
        self._initialized = True

    # ------------------------------------------------------------------
    # TigerBeetle ledger
    # ------------------------------------------------------------------

    @property
    def ledger_available(self) -> bool:
        try:
            return bool(self.tb and self.tb.is_available)  # property, not method
        except Exception:
            return False

    def user_account_id(self, user_id: str) -> int:
        """Deterministic TigerBeetle id for a user's ledger account."""
        return self.tb.map_string_id(f"user:{user_id}")

    def system_account_id(self, name: str) -> int:
        return self.tb.map_string_id(f"sys:{name}")

    def ensure_system_account(self, name: str) -> Optional[str]:
        """Create the system account if the ledger is up. Returns error or None."""
        if not self.ledger_available:
            return "tigerbeetle unavailable"
        if name not in SYSTEM_ACCOUNTS:
            return f"unknown system account: {name}"
        ok = self.tb.create_account(
            account_id=self.system_account_id(name),
            ledger=ACCOUNT_LEDGER[name],
            code=SYSTEM_ACCOUNTS[name],
        )
        return None if ok else "create_account returned failure (may already exist)"

    def post_transfer(self, *, debit_user: Optional[str] = None,
                      credit_user: Optional[str] = None,
                      debit_system: Optional[str] = None,
                      credit_system: Optional[str] = None,
                      amount: Decimal, ledger: int, code: int,
                      reference: str = "") -> Dict[str, Any]:
        """Post a double-entry transfer. Never raises."""
        if not self.ledger_available:
            return {"posted": False, "reason": "tigerbeetle unavailable"}

        # Ensure system legs exist (idempotent — TB ignores existing)
        for name in (debit_system, credit_system):
            if name:
                self.ensure_system_account(name)

        debit_id = (self.user_account_id(debit_user) if debit_user
                    else self.system_account_id(debit_system))
        credit_id = (self.user_account_id(credit_user) if credit_user
                     else self.system_account_id(credit_system))
        transfer_id = self.tb.generate_transfer_id(
            reference or f"{ledger}:{code}:{datetime.utcnow().timestamp()}")

        error = self.tb.create_transfer(
            transfer_id=transfer_id,
            debit_account_id=debit_id,
            credit_account_id=credit_id,
            amount=self.tb.to_cents(amount),
            ledger=ledger,
            code=code,
        )
        if error:
            logger.warning("ledger.post_failed", error=error, ledger=ledger,
                           code=code, ref=reference)
            return {"posted": False, "reason": error}
        logger.info("ledger.posted", ledger=ledger, code=code,
                    amount=float(amount), ref=reference)
        return {"posted": True, "transfer_id": str(transfer_id)}

    # ------------------------------------------------------------------
    # Event bus (RabbitMQ in prod, in-memory in dev)
    # ------------------------------------------------------------------

    async def emit(self, name: str, *, aggregate_id: str,
                   aggregate_type: str, payload: Dict[str, Any],
                   user_id: Optional[str] = None) -> bool:
        """Publish a domain event. Never raises."""
        try:
            from app.services.event_bus_service import get_event_bus
            event = PlatformEvent(
                name=name, aggregate_id=aggregate_id,
                aggregate_type=aggregate_type, version=1,
                payload=payload, user_id=user_id,
            )
            await get_event_bus().publish(event)
            logger.info("event.emitted", type=name, aggregate=aggregate_id)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("event.emit_failed", type=name, error=str(exc))
            return False


_integration: Optional[PlatformIntegration] = None


def get_platform_integration() -> PlatformIntegration:
    global _integration
    if _integration is None:
        _integration = PlatformIntegration()
    return _integration
