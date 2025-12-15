"""
Event Store Service
Handles persistence and retrieval of events for event sourcing
"""

import asyncio
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from decimal import Decimal
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.events.models import BaseEvent, get_event_class, create_event_from_dict

logger = structlog.get_logger()


class EventStoreService:
    """
    Service for storing and retrieving events
    
    Features:
    - Append events to event store
    - Retrieve events by aggregate
    - Retrieve events by type
    - Event replay capability
    - Optimistic concurrency control
    - Snapshot support
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def append_event(self, event: BaseEvent) -> bool:
        """
        Append a single event to the event store
        
        Args:
            event: Event to append
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Prepare event data
            event_data = {
                "id": str(event.event_id),
                "aggregate_id": event.aggregate_id,
                "aggregate_type": event.aggregate_type,
                "event_type": event.event_type,
                "event_data": json.dumps(event.to_dict(), default=str),
                "metadata": json.dumps(event.metadata, default=str),
                "version": event.version,
                "created_at": event.created_at,
                "correlation_id": str(event.correlation_id) if event.correlation_id else None,
                "causation_id": str(event.causation_id) if event.causation_id else None,
                "user_id": event.user_id,
                "service_name": event.service_name,
                "service_version": event.service_version,
            }
            
            # Insert event
            query = text("""
                INSERT INTO events (
                    id, aggregate_id, aggregate_type, event_type, event_data, 
                    metadata, version, created_at, correlation_id, causation_id,
                    user_id, service_name, service_version
                )
                VALUES (
                    :id, :aggregate_id, :aggregate_type, :event_type, :event_data::jsonb,
                    :metadata::jsonb, :version, :created_at, :correlation_id, :causation_id,
                    :user_id, :service_name, :service_version
                )
            """)
            
            await self.db.execute(query, event_data)
            await self.db.commit()
            
            logger.info("Event appended to store",
                       event_id=str(event.event_id),
                       event_type=event.event_type,
                       aggregate_id=event.aggregate_id,
                       version=event.version)
            
            return True
            
        except IntegrityError as e:
            await self.db.rollback()
            logger.error("Concurrency conflict when appending event",
                        event_id=str(event.event_id),
                        aggregate_id=event.aggregate_id,
                        version=event.version,
                        error=str(e))
            return False
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to append event",
                        event_id=str(event.event_id),
                        error=str(e))
            return False
    
    async def append_events(self, events: List[BaseEvent]) -> bool:
        """
        Append multiple events atomically
        
        Args:
            events: List of events to append
            
        Returns:
            True if all successful, False otherwise
        """
        try:
            for event in events:
                await self.append_event(event)
            
            logger.info("Multiple events appended",
                       event_count=len(events))
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to append multiple events",
                        event_count=len(events),
                        error=str(e))
            return False
    
    async def get_events_by_aggregate(
        self,
        aggregate_id: str,
        from_version: int = 0
    ) -> List[BaseEvent]:
        """
        Retrieve all events for an aggregate
        
        Args:
            aggregate_id: Aggregate identifier
            from_version: Start from this version (inclusive)
            
        Returns:
            List of events ordered by version
        """
        try:
            query = text("""
                SELECT 
                    id, aggregate_id, aggregate_type, event_type, event_data,
                    metadata, version, created_at, correlation_id, causation_id,
                    user_id, service_name, service_version
                FROM events
                WHERE aggregate_id = :aggregate_id
                AND version >= :from_version
                ORDER BY version ASC
            """)
            
            result = await self.db.execute(
                query,
                {"aggregate_id": aggregate_id, "from_version": from_version}
            )
            
            rows = result.fetchall()
            
            events = []
            for row in rows:
                event_data = json.loads(row.event_data)
                event = create_event_from_dict(row.event_type, event_data)
                events.append(event)
            
            logger.info("Retrieved events for aggregate",
                       aggregate_id=aggregate_id,
                       event_count=len(events),
                       from_version=from_version)
            
            return events
            
        except Exception as e:
            logger.error("Failed to retrieve events",
                        aggregate_id=aggregate_id,
                        error=str(e))
            return []
    
    async def get_events_by_type(
        self,
        event_type: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[BaseEvent]:
        """
        Retrieve events by type
        
        Args:
            event_type: Event type name
            limit: Maximum number of events to return
            offset: Number of events to skip
            
        Returns:
            List of events ordered by created_at
        """
        try:
            query = text("""
                SELECT 
                    id, aggregate_id, aggregate_type, event_type, event_data,
                    metadata, version, created_at, correlation_id, causation_id,
                    user_id, service_name, service_version
                FROM events
                WHERE event_type = :event_type
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            
            result = await self.db.execute(
                query,
                {"event_type": event_type, "limit": limit, "offset": offset}
            )
            
            rows = result.fetchall()
            
            events = []
            for row in rows:
                event_data = json.loads(row.event_data)
                event = create_event_from_dict(row.event_type, event_data)
                events.append(event)
            
            logger.info("Retrieved events by type",
                       event_type=event_type,
                       event_count=len(events))
            
            return events
            
        except Exception as e:
            logger.error("Failed to retrieve events by type",
                        event_type=event_type,
                        error=str(e))
            return []
    
    async def get_events_by_correlation_id(
        self,
        correlation_id: UUID
    ) -> List[BaseEvent]:
        """
        Retrieve all events with the same correlation ID
        
        Args:
            correlation_id: Correlation identifier
            
        Returns:
            List of events ordered by created_at
        """
        try:
            query = text("""
                SELECT 
                    id, aggregate_id, aggregate_type, event_type, event_data,
                    metadata, version, created_at, correlation_id, causation_id,
                    user_id, service_name, service_version
                FROM events
                WHERE correlation_id = :correlation_id
                ORDER BY created_at ASC
            """)
            
            result = await self.db.execute(
                query,
                {"correlation_id": str(correlation_id)}
            )
            
            rows = result.fetchall()
            
            events = []
            for row in rows:
                event_data = json.loads(row.event_data)
                event = create_event_from_dict(row.event_type, event_data)
                events.append(event)
            
            logger.info("Retrieved events by correlation ID",
                       correlation_id=str(correlation_id),
                       event_count=len(events))
            
            return events
            
        except Exception as e:
            logger.error("Failed to retrieve events by correlation ID",
                        correlation_id=str(correlation_id),
                        error=str(e))
            return []
    
    async def get_next_version(self, aggregate_id: str) -> int:
        """
        Get the next version number for an aggregate
        
        Args:
            aggregate_id: Aggregate identifier
            
        Returns:
            Next version number
        """
        try:
            query = text("""
                SELECT get_next_version(:aggregate_id) as next_version
            """)
            
            result = await self.db.execute(
                query,
                {"aggregate_id": aggregate_id}
            )
            
            row = result.fetchone()
            return row.next_version if row else 1
            
        except Exception as e:
            logger.error("Failed to get next version",
                        aggregate_id=aggregate_id,
                        error=str(e))
            return 1
    
    async def save_snapshot(
        self,
        aggregate_id: str,
        aggregate_type: str,
        version: int,
        state: Dict[str, Any]
    ) -> bool:
        """
        Save a snapshot of aggregate state
        
        Args:
            aggregate_id: Aggregate identifier
            aggregate_type: Aggregate type
            version: Version at which snapshot was taken
            state: Aggregate state
            
        Returns:
            True if successful
        """
        try:
            query = text("""
                INSERT INTO event_snapshots (
                    aggregate_id, aggregate_type, version, state, created_at
                )
                VALUES (
                    :aggregate_id, :aggregate_type, :version, :state::jsonb, NOW()
                )
                ON CONFLICT (aggregate_id)
                DO UPDATE SET
                    version = EXCLUDED.version,
                    state = EXCLUDED.state,
                    created_at = EXCLUDED.created_at
            """)
            
            await self.db.execute(
                query,
                {
                    "aggregate_id": aggregate_id,
                    "aggregate_type": aggregate_type,
                    "version": version,
                    "state": json.dumps(state, default=str)
                }
            )
            
            await self.db.commit()
            
            logger.info("Snapshot saved",
                       aggregate_id=aggregate_id,
                       version=version)
            
            return True
            
        except Exception as e:
            await self.db.rollback()
            logger.error("Failed to save snapshot",
                        aggregate_id=aggregate_id,
                        error=str(e))
            return False
    
    async def get_snapshot(
        self,
        aggregate_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve the latest snapshot for an aggregate
        
        Args:
            aggregate_id: Aggregate identifier
            
        Returns:
            Snapshot data or None
        """
        try:
            query = text("""
                SELECT aggregate_type, version, state, created_at
                FROM event_snapshots
                WHERE aggregate_id = :aggregate_id
            """)
            
            result = await self.db.execute(
                query,
                {"aggregate_id": aggregate_id}
            )
            
            row = result.fetchone()
            
            if row:
                return {
                    "aggregate_id": aggregate_id,
                    "aggregate_type": row.aggregate_type,
                    "version": row.version,
                    "state": json.loads(row.state),
                    "created_at": row.created_at
                }
            
            return None
            
        except Exception as e:
            logger.error("Failed to get snapshot",
                        aggregate_id=aggregate_id,
                        error=str(e))
            return None
    
    async def replay_events(
        self,
        aggregate_id: str,
        event_handler: callable
    ) -> Any:
        """
        Replay all events for an aggregate
        
        Args:
            aggregate_id: Aggregate identifier
            event_handler: Function to handle each event
            
        Returns:
            Final state after replay
        """
        try:
            # Try to load from snapshot first
            snapshot = await self.get_snapshot(aggregate_id)
            
            if snapshot:
                state = snapshot["state"]
                from_version = snapshot["version"] + 1
                logger.info("Loaded snapshot",
                           aggregate_id=aggregate_id,
                           snapshot_version=snapshot["version"])
            else:
                state = None
                from_version = 0
            
            # Load events since snapshot
            events = await self.get_events_by_aggregate(aggregate_id, from_version)
            
            # Replay events
            for event in events:
                state = await event_handler(state, event)
            
            logger.info("Events replayed",
                       aggregate_id=aggregate_id,
                       event_count=len(events))
            
            return state
            
        except Exception as e:
            logger.error("Failed to replay events",
                        aggregate_id=aggregate_id,
                        error=str(e))
            return None
    
    async def get_event_count(self) -> int:
        """Get total number of events in store"""
        try:
            query = text("SELECT COUNT(*) as count FROM events")
            result = await self.db.execute(query)
            row = result.fetchone()
            return row.count if row else 0
        except Exception as e:
            logger.error("Failed to get event count", error=str(e))
            return 0
    
    async def get_aggregate_count(self) -> int:
        """Get total number of unique aggregates"""
        try:
            query = text("SELECT COUNT(DISTINCT aggregate_id) as count FROM events")
            result = await self.db.execute(query)
            row = result.fetchone()
            return row.count if row else 0
        except Exception as e:
            logger.error("Failed to get aggregate count", error=str(e))
            return 0
