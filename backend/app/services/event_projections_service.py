"""
Event Projections Service
Creates and maintains read models from event streams
Implements CQRS pattern for optimized queries
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Callable
from uuid import UUID
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from decimal import Decimal

from app.events.models import BaseEvent, create_event_from_dict

logger = structlog.get_logger()


class ProjectionHandler:
    """Base class for projection handlers"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.projection_name = self.__class__.__name__
    
    async def handle_event(self, event: BaseEvent) -> bool:
        """
        Handle an event and update the projection
        
        Args:
            event: Event to process
            
        Returns:
            True if successful
        """
        raise NotImplementedError("Subclasses must implement handle_event")
    
    async def rebuild(self, events: List[BaseEvent]) -> bool:
        """
        Rebuild projection from scratch
        
        Args:
            events: All events to process
            
        Returns:
            True if successful
        """
        raise NotImplementedError("Subclasses must implement rebuild")


class AccountBalanceProjection(ProjectionHandler):
    """
    Maintains current account balances
    Optimized for fast balance queries
    """
    
    async def handle_event(self, event: BaseEvent) -> bool:
        """Update account balance based on event"""
        try:
            if event.event_type == "AccountCreated":
                # Create initial balance record
                query = text("""
                    INSERT INTO account_balance_projection (
                        account_id, balance, available_balance, 
                        pending_credits, pending_debits,
                        last_updated, last_event_version
                    )
                    VALUES (
                        :account_id, :balance, :available_balance,
                        0, 0, :timestamp, :version
                    )
                    ON CONFLICT (account_id) DO NOTHING
                """)
                
                await self.db.execute(query, {
                    "account_id": event.aggregate_id,
                    "balance": Decimal("0"),
                    "available_balance": Decimal("0"),
                    "timestamp": event.created_at,
                    "version": event.version
                })
                
            elif event.event_type == "TransferCompleted":
                # Update balances for both accounts
                event_data = event.to_dict()
                
                # Debit from source
                await self._update_balance(
                    event.metadata.get("source_account_id"),
                    -Decimal(str(event_data.get("amount", 0))),
                    event.version,
                    event.created_at
                )
                
                # Credit to destination
                await self._update_balance(
                    event.metadata.get("destination_account_id"),
                    Decimal(str(event_data.get("amount", 0))),
                    event.version,
                    event.created_at
                )
                
            elif event.event_type == "TransferInitiated":
                # Add to pending debits
                event_data = event.to_dict()
                await self._update_pending(
                    event.metadata.get("source_account_id"),
                    Decimal(str(event_data.get("amount", 0))),
                    "debit",
                    event.version,
                    event.created_at
                )
                
            elif event.event_type == "TransferFailed":
                # Remove from pending
                event_data = event.to_dict()
                await self._update_pending(
                    event.metadata.get("source_account_id"),
                    -Decimal(str(event_data.get("amount", 0))),
                    "debit",
                    event.version,
                    event.created_at
                )
            
            await self.db.commit()
            
            logger.info("Account balance projection updated",
                       event_type=event.event_type,
                       event_version=event.version)
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to update account balance projection",
                        event_type=event.event_type,
                        error=str(e))
            return False
    
    async def _update_balance(
        self,
        account_id: str,
        amount: Decimal,
        version: int,
        timestamp: datetime
    ):
        """Update account balance"""
        query = text("""
            UPDATE account_balance_projection
            SET 
                balance = balance + :amount,
                available_balance = available_balance + :amount,
                last_updated = :timestamp,
                last_event_version = :version
            WHERE account_id = :account_id
            AND last_event_version < :version
        """)
        
        await self.db.execute(query, {
            "account_id": account_id,
            "amount": amount,
            "timestamp": timestamp,
            "version": version
        })
    
    async def _update_pending(
        self,
        account_id: str,
        amount: Decimal,
        pending_type: str,
        version: int,
        timestamp: datetime
    ):
        """Update pending amounts"""
        if pending_type == "debit":
            query = text("""
                UPDATE account_balance_projection
                SET 
                    pending_debits = pending_debits + :amount,
                    available_balance = available_balance - :amount,
                    last_updated = :timestamp,
                    last_event_version = :version
                WHERE account_id = :account_id
                AND last_event_version < :version
            """)
        else:
            query = text("""
                UPDATE account_balance_projection
                SET 
                    pending_credits = pending_credits + :amount,
                    last_updated = :timestamp,
                    last_event_version = :version
                WHERE account_id = :account_id
                AND last_event_version < :version
            """)
        
        await self.db.execute(query, {
            "account_id": account_id,
            "amount": amount,
            "timestamp": timestamp,
            "version": version
        })
    
    async def rebuild(self, events: List[BaseEvent]) -> bool:
        """Rebuild projection from events"""
        try:
            # Clear existing projection
            await self.db.execute(text("TRUNCATE account_balance_projection"))
            
            # Process all events
            for event in events:
                await self.handle_event(event)
            
            await self.db.commit()
            
            logger.info("Account balance projection rebuilt",
                       event_count=len(events))
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to rebuild projection", error=str(e))
            return False


class TransactionHistoryProjection(ProjectionHandler):
    """
    Maintains denormalized transaction history
    Optimized for transaction list queries
    """
    
    async def handle_event(self, event: BaseEvent) -> bool:
        """Update transaction history based on event"""
        try:
            if event.event_type in ["TransferCompleted", "TransferFailed"]:
                event_data = event.to_dict()
                
                query = text("""
                    INSERT INTO transaction_history_projection (
                        transaction_id, account_id, counterparty_account_id,
                        amount, transaction_type, status, description,
                        created_at, event_version
                    )
                    VALUES (
                        :transaction_id, :account_id, :counterparty_account_id,
                        :amount, :transaction_type, :status, :description,
                        :created_at, :event_version
                    )
                    ON CONFLICT (transaction_id, account_id) 
                    DO UPDATE SET
                        status = EXCLUDED.status,
                        event_version = EXCLUDED.event_version
                """)
                
                status = "completed" if event.event_type == "TransferCompleted" else "failed"
                
                # Insert for source account (debit)
                await self.db.execute(query, {
                    "transaction_id": event.aggregate_id,
                    "account_id": event.metadata.get("source_account_id"),
                    "counterparty_account_id": event.metadata.get("destination_account_id"),
                    "amount": -Decimal(str(event_data.get("amount", 0))),
                    "transaction_type": "transfer_out",
                    "status": status,
                    "description": event_data.get("description", "Transfer"),
                    "created_at": event.created_at,
                    "event_version": event.version
                })
                
                # Insert for destination account (credit)
                await self.db.execute(query, {
                    "transaction_id": event.aggregate_id,
                    "account_id": event.metadata.get("destination_account_id"),
                    "counterparty_account_id": event.metadata.get("source_account_id"),
                    "amount": Decimal(str(event_data.get("amount", 0))),
                    "transaction_type": "transfer_in",
                    "status": status,
                    "description": event_data.get("description", "Transfer"),
                    "created_at": event.created_at,
                    "event_version": event.version
                })
            
            await self.db.commit()
            
            logger.info("Transaction history projection updated",
                       event_type=event.event_type)
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to update transaction history projection",
                        error=str(e))
            return False
    
    async def rebuild(self, events: List[BaseEvent]) -> bool:
        """Rebuild projection from events"""
        try:
            await self.db.execute(text("TRUNCATE transaction_history_projection"))
            
            for event in events:
                await self.handle_event(event)
            
            await self.db.commit()
            
            logger.info("Transaction history projection rebuilt",
                       event_count=len(events))
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to rebuild projection", error=str(e))
            return False


class AuditTrailProjection(ProjectionHandler):
    """
    Maintains comprehensive audit trail
    All events for compliance and debugging
    """
    
    async def handle_event(self, event: BaseEvent) -> bool:
        """Add event to audit trail"""
        try:
            query = text("""
                INSERT INTO audit_trail_projection (
                    event_id, aggregate_id, aggregate_type, event_type,
                    event_data, metadata, user_id, correlation_id,
                    created_at, service_name
                )
                VALUES (
                    :event_id, :aggregate_id, :aggregate_type, :event_type,
                    :event_data::jsonb, :metadata::jsonb, :user_id, :correlation_id,
                    :created_at, :service_name
                )
                ON CONFLICT (event_id) DO NOTHING
            """)
            
            await self.db.execute(query, {
                "event_id": str(event.event_id),
                "aggregate_id": event.aggregate_id,
                "aggregate_type": event.aggregate_type,
                "event_type": event.event_type,
                "event_data": json.dumps(event.to_dict(), default=str),
                "metadata": json.dumps(event.metadata, default=str),
                "user_id": event.user_id,
                "correlation_id": str(event.correlation_id) if event.correlation_id else None,
                "created_at": event.created_at,
                "service_name": event.service_name
            })
            
            await self.db.commit()
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to update audit trail projection", error=str(e))
            return False
    
    async def rebuild(self, events: List[BaseEvent]) -> bool:
        """Rebuild projection from events"""
        try:
            await self.db.execute(text("TRUNCATE audit_trail_projection"))
            
            for event in events:
                await self.handle_event(event)
            
            await self.db.commit()
            
            logger.info("Audit trail projection rebuilt",
                       event_count=len(events))
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to rebuild projection", error=str(e))
            return False


class EventProjectionsService:
    """
    Service for managing event projections
    Coordinates multiple projection handlers
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.projections: Dict[str, ProjectionHandler] = {
            "account_balance": AccountBalanceProjection(db_session),
            "transaction_history": TransactionHistoryProjection(db_session),
            "audit_trail": AuditTrailProjection(db_session)
        }
    
    async def project_event(self, event: BaseEvent) -> bool:
        """
        Project an event to all relevant projections
        
        Args:
            event: Event to project
            
        Returns:
            True if all projections successful
        """
        try:
            results = []
            
            for name, projection in self.projections.items():
                try:
                    result = await projection.handle_event(event)
                    results.append(result)
                    
                    if result:
                        logger.debug("Event projected",
                                   projection=name,
                                   event_type=event.event_type)
                    else:
                        logger.warning("Projection failed",
                                     projection=name,
                                     event_type=event.event_type)
                        
                except Exception as e:
                    logger.error("Projection error",
                               projection=name,
                               event_type=event.event_type,
                               error=str(e))
                    results.append(False)
            
            return all(results)
            
        except Exception as e:
            logger.error("Failed to project event", error=str(e))
            return False
    
    async def rebuild_projection(
        self,
        projection_name: str,
        events: List[BaseEvent]
    ) -> bool:
        """
        Rebuild a specific projection from events
        
        Args:
            projection_name: Name of projection to rebuild
            events: Events to process
            
        Returns:
            True if successful
        """
        try:
            if projection_name not in self.projections:
                logger.error("Unknown projection", projection=projection_name)
                return False
            
            projection = self.projections[projection_name]
            result = await projection.rebuild(events)
            
            if result:
                logger.info("Projection rebuilt",
                           projection=projection_name,
                           event_count=len(events))
            else:
                logger.error("Projection rebuild failed",
                           projection=projection_name)
            
            return result
            
        except Exception as e:
            logger.error("Failed to rebuild projection",
                        projection=projection_name,
                        error=str(e))
            return False
    
    async def rebuild_all_projections(self, events: List[BaseEvent]) -> bool:
        """
        Rebuild all projections from events
        
        Args:
            events: Events to process
            
        Returns:
            True if all successful
        """
        try:
            results = []
            
            for name in self.projections.keys():
                result = await self.rebuild_projection(name, events)
                results.append(result)
            
            if all(results):
                logger.info("All projections rebuilt",
                           projection_count=len(self.projections),
                           event_count=len(events))
                return True
            else:
                logger.warning("Some projections failed to rebuild")
                return False
                
        except Exception as e:
            logger.error("Failed to rebuild all projections", error=str(e))
            return False
    
    async def get_projection_status(self) -> Dict[str, Any]:
        """Get status of all projections"""
        try:
            status = {}
            
            # Account balance projection
            result = await self.db.execute(text("""
                SELECT 
                    COUNT(*) as account_count,
                    SUM(balance) as total_balance,
                    MAX(last_updated) as last_updated
                FROM account_balance_projection
            """))
            row = result.fetchone()
            status["account_balance"] = {
                "account_count": row.account_count if row else 0,
                "total_balance": float(row.total_balance) if row and row.total_balance else 0,
                "last_updated": row.last_updated if row else None
            }
            
            # Transaction history projection
            result = await self.db.execute(text("""
                SELECT 
                    COUNT(*) as transaction_count,
                    MAX(created_at) as last_transaction
                FROM transaction_history_projection
            """))
            row = result.fetchone()
            status["transaction_history"] = {
                "transaction_count": row.transaction_count if row else 0,
                "last_transaction": row.last_transaction if row else None
            }
            
            # Audit trail projection
            result = await self.db.execute(text("""
                SELECT 
                    COUNT(*) as event_count,
                    MAX(created_at) as last_event
                FROM audit_trail_projection
            """))
            row = result.fetchone()
            status["audit_trail"] = {
                "event_count": row.event_count if row else 0,
                "last_event": row.last_event if row else None
            }
            
            return status
            
        except Exception as e:
            logger.error("Failed to get projection status", error=str(e))
            return {}
