"""
Reconciliation Service
Periodic reconciliation between PostgreSQL and TigerBeetle
"""

from typing import Dict, Any, List, Optional, Tuple
from decimal import Decimal
from datetime import datetime, timedelta
from uuid import UUID, uuid4
import asyncio
import structlog
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.event_store_service import EventStoreService
from app.events.models import (
    ReconciliationStarted,
    ReconciliationCompleted,
    DiscrepancyDetected,
    DiscrepancyResolved
)

logger = structlog.get_logger()


class DiscrepancyType:
    """Types of discrepancies"""
    BALANCE_MISMATCH = "balance_mismatch"
    MISSING_ACCOUNT = "missing_account"
    ORPHANED_TRANSACTION = "orphaned_transaction"
    PENDING_TOO_LONG = "pending_too_long"
    DUPLICATE_TRANSACTION = "duplicate_transaction"


class DiscrepancySeverity:
    """Severity levels for discrepancies"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ReconciliationService:
    """
    Reconciliation service for PostgreSQL and TigerBeetle
    
    Features:
    - Periodic balance reconciliation
    - Account existence verification
    - Transaction consistency checks
    - Automated discrepancy resolution
    - Comprehensive reporting
    """
    
    def __init__(
        self,
        db_session: AsyncSession,
        tigerbeetle_service: Any,
        event_store: EventStoreService
    ):
        self.db = db_session
        self.tigerbeetle = tigerbeetle_service
        self.event_store = event_store
        self.reconciliation_id: Optional[UUID] = None
        self.discrepancies: List[Dict[str, Any]] = []
    
    async def run_full_reconciliation(
        self,
        account_ids: Optional[List[str]] = None,
        auto_resolve: bool = True
    ) -> Dict[str, Any]:
        """
        Run full reconciliation
        
        Args:
            account_ids: Specific accounts to reconcile (None = all)
            auto_resolve: Automatically resolve discrepancies
            
        Returns:
            Reconciliation results
        """
        self.reconciliation_id = uuid4()
        start_time = datetime.utcnow()
        
        logger.info("Starting full reconciliation",
                   reconciliation_id=str(self.reconciliation_id),
                   account_count=len(account_ids) if account_ids else "all")
        
        try:
            # Emit reconciliation started event
            await self._emit_reconciliation_started()
            
            # Get accounts to reconcile
            accounts = await self._get_accounts_to_reconcile(account_ids)
            
            logger.info("Accounts loaded for reconciliation",
                       account_count=len(accounts))
            
            # Run reconciliation checks
            await self._check_account_existence(accounts)
            await self._check_balance_consistency(accounts)
            await self._check_transaction_consistency(accounts)
            await self._check_pending_transactions()
            
            # Auto-resolve if enabled
            resolved_count = 0
            if auto_resolve and self.discrepancies:
                resolved_count = await self._auto_resolve_discrepancies()
            
            # Calculate statistics
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            results = {
                "reconciliation_id": str(self.reconciliation_id),
                "started_at": start_time.isoformat(),
                "completed_at": end_time.isoformat(),
                "duration_seconds": round(duration, 2),
                "accounts_checked": len(accounts),
                "discrepancies_found": len(self.discrepancies),
                "discrepancies_resolved": resolved_count,
                "discrepancies_remaining": len(self.discrepancies) - resolved_count,
                "status": "completed",
                "discrepancies": self.discrepancies
            }
            
            # Persist results
            await self._persist_reconciliation_results(results)
            
            # Emit reconciliation completed event
            await self._emit_reconciliation_completed(results)
            
            logger.info("Reconciliation completed",
                       reconciliation_id=str(self.reconciliation_id),
                       discrepancies_found=len(self.discrepancies),
                       discrepancies_resolved=resolved_count)
            
            return results
            
        except Exception as e:
            logger.error("Reconciliation failed",
                        reconciliation_id=str(self.reconciliation_id),
                        error=str(e))
            
            # Persist error
            await self._persist_reconciliation_error(str(e))
            
            raise
    
    async def _get_accounts_to_reconcile(
        self,
        account_ids: Optional[List[str]]
    ) -> List[Dict[str, Any]]:
        """Get accounts to reconcile"""
        query = select("accounts").where("status" != "CLOSED")
        
        if account_ids:
            query = query.where("account_id".in_(account_ids))
        
        result = await self.db.execute(query)
        accounts = result.fetchall()
        
        return [
            {
                "account_id": acc.account_id,
                "account_number": acc.account_number,
                "tigerbeetle_account_id": acc.tigerbeetle_account_id,
                "balance": Decimal(str(acc.balance)),
                "available_balance": Decimal(str(acc.available_balance)),
                "reserved_balance": Decimal(str(acc.reserved_balance)),
                "status": acc.status
            }
            for acc in accounts
        ]
    
    async def _check_account_existence(
        self,
        accounts: List[Dict[str, Any]]
    ) -> None:
        """Check that all PostgreSQL accounts exist in TigerBeetle"""
        logger.info("Checking account existence", account_count=len(accounts))
        
        for account in accounts:
            try:
                # Check if account exists in TigerBeetle
                tb_account = await self.tigerbeetle.get_account(
                    account["tigerbeetle_account_id"]
                )
                
                if not tb_account:
                    await self._record_discrepancy(
                        discrepancy_type=DiscrepancyType.MISSING_ACCOUNT,
                        severity=DiscrepancySeverity.CRITICAL,
                        account_id=account["account_id"],
                        description=f"Account exists in PostgreSQL but not in TigerBeetle",
                        details={
                            "pg_account_id": account["account_id"],
                            "tb_account_id": account["tigerbeetle_account_id"]
                        }
                    )
                    
            except Exception as e:
                logger.error("Error checking account existence",
                            account_id=account["account_id"],
                            error=str(e))
    
    async def _check_balance_consistency(
        self,
        accounts: List[Dict[str, Any]]
    ) -> None:
        """Check balance consistency between PostgreSQL and TigerBeetle"""
        logger.info("Checking balance consistency", account_count=len(accounts))
        
        for account in accounts:
            try:
                # Get TigerBeetle balance
                tb_account = await self.tigerbeetle.get_account(
                    account["tigerbeetle_account_id"]
                )
                
                if not tb_account:
                    continue  # Already recorded as missing account
                
                # Compare balances
                pg_balance = account["balance"]
                tb_balance = Decimal(str(tb_account.get("balance", 0))) / 100  # Convert from cents
                
                # Allow for small rounding differences (0.01)
                difference = abs(pg_balance - tb_balance)
                
                if difference > Decimal("0.01"):
                    severity = self._calculate_balance_discrepancy_severity(difference)
                    
                    await self._record_discrepancy(
                        discrepancy_type=DiscrepancyType.BALANCE_MISMATCH,
                        severity=severity,
                        account_id=account["account_id"],
                        description=f"Balance mismatch: PostgreSQL={pg_balance}, TigerBeetle={tb_balance}",
                        details={
                            "pg_balance": str(pg_balance),
                            "tb_balance": str(tb_balance),
                            "difference": str(difference),
                            "account_number": account["account_number"]
                        }
                    )
                    
            except Exception as e:
                logger.error("Error checking balance consistency",
                            account_id=account["account_id"],
                            error=str(e))
    
    async def _check_transaction_consistency(
        self,
        accounts: List[Dict[str, Any]]
    ) -> None:
        """Check transaction consistency"""
        logger.info("Checking transaction consistency")
        
        # Get recent transactions from PostgreSQL
        cutoff_time = datetime.utcnow() - timedelta(hours=24)
        
        result = await self.db.execute(
            select("transactions")
            .where("created_at" >= cutoff_time)
            .where("status".in_(["COMPLETED", "PENDING"]))
        )
        pg_transactions = result.fetchall()
        
        for tx in pg_transactions:
            try:
                # Check if transaction exists in TigerBeetle
                if tx.tigerbeetle_transfer_id:
                    tb_transfer = await self.tigerbeetle.get_transfer(
                        tx.tigerbeetle_transfer_id
                    )
                    
                    if not tb_transfer and tx.status == "COMPLETED":
                        await self._record_discrepancy(
                            discrepancy_type=DiscrepancyType.ORPHANED_TRANSACTION,
                            severity=DiscrepancySeverity.HIGH,
                            account_id=tx.from_account_id,
                            description=f"Transaction marked complete in PostgreSQL but not found in TigerBeetle",
                            details={
                                "transaction_id": tx.transaction_id,
                                "tb_transfer_id": tx.tigerbeetle_transfer_id,
                                "amount": str(tx.amount)
                            }
                        )
                        
            except Exception as e:
                logger.error("Error checking transaction consistency",
                            transaction_id=tx.transaction_id,
                            error=str(e))
    
    async def _check_pending_transactions(self) -> None:
        """Check for transactions pending too long"""
        logger.info("Checking pending transactions")
        
        # Transactions pending for more than 1 hour
        cutoff_time = datetime.utcnow() - timedelta(hours=1)
        
        result = await self.db.execute(
            select("transactions")
            .where("status" == "PENDING")
            .where("created_at" < cutoff_time)
        )
        pending_transactions = result.fetchall()
        
        for tx in pending_transactions:
            await self._record_discrepancy(
                discrepancy_type=DiscrepancyType.PENDING_TOO_LONG,
                severity=DiscrepancySeverity.MEDIUM,
                account_id=tx.from_account_id,
                description=f"Transaction pending for {(datetime.utcnow() - tx.created_at).total_seconds() / 3600:.1f} hours",
                details={
                    "transaction_id": tx.transaction_id,
                    "created_at": tx.created_at.isoformat(),
                    "amount": str(tx.amount)
                }
            )
    
    def _calculate_balance_discrepancy_severity(
        self,
        difference: Decimal
    ) -> str:
        """Calculate severity based on balance difference"""
        if difference >= Decimal("10000"):
            return DiscrepancySeverity.CRITICAL
        elif difference >= Decimal("1000"):
            return DiscrepancySeverity.HIGH
        elif difference >= Decimal("100"):
            return DiscrepancySeverity.MEDIUM
        else:
            return DiscrepancySeverity.LOW
    
    async def _record_discrepancy(
        self,
        discrepancy_type: str,
        severity: str,
        account_id: str,
        description: str,
        details: Dict[str, Any]
    ) -> None:
        """Record a discrepancy"""
        discrepancy_id = uuid4()
        
        discrepancy = {
            "discrepancy_id": str(discrepancy_id),
            "reconciliation_id": str(self.reconciliation_id),
            "discrepancy_type": discrepancy_type,
            "severity": severity,
            "account_id": account_id,
            "description": description,
            "details": details,
            "detected_at": datetime.utcnow().isoformat(),
            "resolved": False,
            "resolution_action": None
        }
        
        self.discrepancies.append(discrepancy)
        
        # Persist to database
        await self.db.execute(
            """
            INSERT INTO discrepancies 
            (discrepancy_id, reconciliation_id, discrepancy_type, severity, 
             account_id, description, details, detected_at, resolved)
            VALUES (:discrepancy_id, :reconciliation_id, :discrepancy_type, 
                    :severity, :account_id, :description, :details, :detected_at, :resolved)
            """,
            {
                "discrepancy_id": str(discrepancy_id),
                "reconciliation_id": str(self.reconciliation_id),
                "discrepancy_type": discrepancy_type,
                "severity": severity,
                "account_id": account_id,
                "description": description,
                "details": details,
                "detected_at": datetime.utcnow(),
                "resolved": False
            }
        )
        await self.db.commit()
        
        # Emit event
        event = DiscrepancyDetected(
            aggregate_id=account_id,
            discrepancy_id=str(discrepancy_id),
            discrepancy_type=discrepancy_type,
            severity=severity,
            description=description,
            details=details
        )
        await self.event_store.append_event(event)
        
        logger.warning("Discrepancy detected",
                      discrepancy_id=str(discrepancy_id),
                      type=discrepancy_type,
                      severity=severity,
                      account_id=account_id)
    
    async def _auto_resolve_discrepancies(self) -> int:
        """Automatically resolve discrepancies where possible"""
        logger.info("Attempting auto-resolution",
                   discrepancy_count=len(self.discrepancies))
        
        resolved_count = 0
        
        for discrepancy in self.discrepancies:
            if discrepancy["resolved"]:
                continue
            
            try:
                resolved = await self._resolve_discrepancy(discrepancy)
                if resolved:
                    resolved_count += 1
                    
            except Exception as e:
                logger.error("Failed to resolve discrepancy",
                            discrepancy_id=discrepancy["discrepancy_id"],
                            error=str(e))
        
        return resolved_count
    
    async def _resolve_discrepancy(
        self,
        discrepancy: Dict[str, Any]
    ) -> bool:
        """Resolve a single discrepancy"""
        discrepancy_type = discrepancy["discrepancy_type"]
        
        if discrepancy_type == DiscrepancyType.BALANCE_MISMATCH:
            return await self._resolve_balance_mismatch(discrepancy)
        elif discrepancy_type == DiscrepancyType.MISSING_ACCOUNT:
            return await self._resolve_missing_account(discrepancy)
        elif discrepancy_type == DiscrepancyType.PENDING_TOO_LONG:
            return await self._resolve_pending_transaction(discrepancy)
        else:
            logger.warning("No auto-resolution available",
                          discrepancy_type=discrepancy_type)
            return False
    
    async def _resolve_balance_mismatch(
        self,
        discrepancy: Dict[str, Any]
    ) -> bool:
        """Resolve balance mismatch by trusting TigerBeetle as source of truth"""
        try:
            details = discrepancy["details"]
            account_id = discrepancy["account_id"]
            tb_balance = Decimal(details["tb_balance"])
            
            # Update PostgreSQL balance to match TigerBeetle
            await self.db.execute(
                """
                UPDATE accounts 
                SET balance = :balance,
                    updated_at = :updated_at
                WHERE account_id = :account_id
                """,
                {
                    "balance": tb_balance,
                    "updated_at": datetime.utcnow(),
                    "account_id": account_id
                }
            )
            await self.db.commit()
            
            # Mark discrepancy as resolved
            await self._mark_discrepancy_resolved(
                discrepancy["discrepancy_id"],
                f"Updated PostgreSQL balance to match TigerBeetle: {tb_balance}"
            )
            
            logger.info("Balance mismatch resolved",
                       discrepancy_id=discrepancy["discrepancy_id"],
                       account_id=account_id,
                       new_balance=str(tb_balance))
            
            return True
            
        except Exception as e:
            logger.error("Failed to resolve balance mismatch",
                        discrepancy_id=discrepancy["discrepancy_id"],
                        error=str(e))
            return False
    
    async def _resolve_missing_account(
        self,
        discrepancy: Dict[str, Any]
    ) -> bool:
        """Resolve missing account by creating it in TigerBeetle"""
        try:
            details = discrepancy["details"]
            account_id = discrepancy["account_id"]
            
            # Get account details from PostgreSQL
            result = await self.db.execute(
                select("accounts").where("account_id" == account_id)
            )
            account = result.first()
            
            if not account:
                return False
            
            # Create account in TigerBeetle
            tb_account_id = await self.tigerbeetle.create_account(
                account_id=account.tigerbeetle_account_id,
                ledger=1,
                code=1,
                flags=0
            )
            
            # Mark discrepancy as resolved
            await self._mark_discrepancy_resolved(
                discrepancy["discrepancy_id"],
                f"Created account in TigerBeetle: {tb_account_id}"
            )
            
            logger.info("Missing account resolved",
                       discrepancy_id=discrepancy["discrepancy_id"],
                       account_id=account_id)
            
            return True
            
        except Exception as e:
            logger.error("Failed to resolve missing account",
                        discrepancy_id=discrepancy["discrepancy_id"],
                        error=str(e))
            return False
    
    async def _resolve_pending_transaction(
        self,
        discrepancy: Dict[str, Any]
    ) -> bool:
        """Resolve pending transaction by marking it as failed"""
        try:
            details = discrepancy["details"]
            transaction_id = details["transaction_id"]
            
            # Mark transaction as failed
            await self.db.execute(
                """
                UPDATE transactions 
                SET status = 'FAILED',
                    error_message = 'Transaction timed out during reconciliation',
                    updated_at = :updated_at
                WHERE transaction_id = :transaction_id
                """,
                {
                    "updated_at": datetime.utcnow(),
                    "transaction_id": transaction_id
                }
            )
            await self.db.commit()
            
            # Mark discrepancy as resolved
            await self._mark_discrepancy_resolved(
                discrepancy["discrepancy_id"],
                f"Marked transaction as failed: {transaction_id}"
            )
            
            logger.info("Pending transaction resolved",
                       discrepancy_id=discrepancy["discrepancy_id"],
                       transaction_id=transaction_id)
            
            return True
            
        except Exception as e:
            logger.error("Failed to resolve pending transaction",
                        discrepancy_id=discrepancy["discrepancy_id"],
                        error=str(e))
            return False
    
    async def _mark_discrepancy_resolved(
        self,
        discrepancy_id: str,
        resolution_action: str
    ) -> None:
        """Mark discrepancy as resolved"""
        await self.db.execute(
            """
            UPDATE discrepancies 
            SET resolved = true,
                resolution_action = :resolution_action,
                resolved_at = :resolved_at
            WHERE discrepancy_id = :discrepancy_id
            """,
            {
                "resolution_action": resolution_action,
                "resolved_at": datetime.utcnow(),
                "discrepancy_id": discrepancy_id
            }
        )
        await self.db.commit()
        
        # Update in-memory discrepancy
        for disc in self.discrepancies:
            if disc["discrepancy_id"] == discrepancy_id:
                disc["resolved"] = True
                disc["resolution_action"] = resolution_action
                break
        
        # Emit event
        event = DiscrepancyResolved(
            aggregate_id=discrepancy_id,
            discrepancy_id=discrepancy_id,
            resolution_action=resolution_action
        )
        await self.event_store.append_event(event)
    
    async def _persist_reconciliation_results(
        self,
        results: Dict[str, Any]
    ) -> None:
        """Persist reconciliation results"""
        await self.db.execute(
            """
            INSERT INTO reconciliation_runs
            (reconciliation_id, started_at, completed_at, duration_seconds,
             accounts_checked, discrepancies_found, discrepancies_resolved, status)
            VALUES (:reconciliation_id, :started_at, :completed_at, :duration_seconds,
                    :accounts_checked, :discrepancies_found, :discrepancies_resolved, :status)
            """,
            {
                "reconciliation_id": results["reconciliation_id"],
                "started_at": datetime.fromisoformat(results["started_at"]),
                "completed_at": datetime.fromisoformat(results["completed_at"]),
                "duration_seconds": results["duration_seconds"],
                "accounts_checked": results["accounts_checked"],
                "discrepancies_found": results["discrepancies_found"],
                "discrepancies_resolved": results["discrepancies_resolved"],
                "status": results["status"]
            }
        )
        await self.db.commit()
    
    async def _persist_reconciliation_error(self, error_message: str) -> None:
        """Persist reconciliation error"""
        await self.db.execute(
            """
            INSERT INTO reconciliation_runs
            (reconciliation_id, started_at, status, error_message)
            VALUES (:reconciliation_id, :started_at, :status, :error_message)
            """,
            {
                "reconciliation_id": str(self.reconciliation_id),
                "started_at": datetime.utcnow(),
                "status": "failed",
                "error_message": error_message
            }
        )
        await self.db.commit()
    
    async def _emit_reconciliation_started(self) -> None:
        """Emit reconciliation started event"""
        event = ReconciliationStarted(
            aggregate_id=str(self.reconciliation_id),
            reconciliation_id=str(self.reconciliation_id)
        )
        await self.event_store.append_event(event)
    
    async def _emit_reconciliation_completed(
        self,
        results: Dict[str, Any]
    ) -> None:
        """Emit reconciliation completed event"""
        event = ReconciliationCompleted(
            aggregate_id=str(self.reconciliation_id),
            reconciliation_id=str(self.reconciliation_id),
            accounts_checked=results["accounts_checked"],
            discrepancies_found=results["discrepancies_found"],
            discrepancies_resolved=results["discrepancies_resolved"],
            duration_seconds=results["duration_seconds"]
        )
        await self.event_store.append_event(event)


# Global reconciliation service instance
_reconciliation_service: Optional[ReconciliationService] = None


async def get_reconciliation_service() -> ReconciliationService:
    """Get or create reconciliation service instance"""
    global _reconciliation_service
    
    if _reconciliation_service is None:
        from app.services.tigerbeetle_integration_service import get_tigerbeetle_service
        from app.services.event_store_service import get_event_store_service
        
        db = await get_db()
        tigerbeetle = await get_tigerbeetle_service()
        event_store = await get_event_store_service()
        
        _reconciliation_service = ReconciliationService(db, tigerbeetle, event_store)
    
    return _reconciliation_service
