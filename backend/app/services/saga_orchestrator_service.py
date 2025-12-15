"""
Saga Orchestrator Service
Manages saga execution, persistence, and recovery
"""

from typing import Dict, Any, Optional, List, Type
from uuid import UUID, uuid4
from datetime import datetime, timedelta
import asyncio
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.sagas.base_saga import BaseSaga, SagaContext, SagaStatus
from app.database import get_db

logger = structlog.get_logger()


class SagaOrchestratorService:
    """
    Orchestrates saga execution with persistence and recovery
    
    Features:
    - Saga execution management
    - State persistence to database
    - Automatic recovery of failed sagas
    - Saga monitoring and reporting
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self._saga_registry: Dict[str, Type[BaseSaga]] = {}
        self._running_sagas: Dict[UUID, BaseSaga] = {}
    
    def register_saga(self, saga_type: str, saga_class: Type[BaseSaga]) -> None:
        """
        Register a saga type
        
        Args:
            saga_type: Unique saga type identifier
            saga_class: Saga class to register
        """
        self._saga_registry[saga_type] = saga_class
        logger.info("Saga type registered", saga_type=saga_type)
    
    async def start_saga(
        self,
        saga_type: str,
        input_data: Dict[str, Any],
        user_id: Optional[str] = None,
        correlation_id: Optional[UUID] = None
    ) -> UUID:
        """
        Start a new saga
        
        Args:
            saga_type: Type of saga to start
            input_data: Input data for the saga
            user_id: User initiating the saga
            correlation_id: Correlation ID for tracking
            
        Returns:
            Saga ID
        """
        if saga_type not in self._saga_registry:
            raise ValueError(f"Unknown saga type: {saga_type}")
        
        # Create saga context
        context = SagaContext(
            saga_id=uuid4(),
            correlation_id=correlation_id or uuid4(),
            user_id=user_id,
            input_data=input_data
        )
        
        # Create saga instance
        saga_class = self._saga_registry[saga_type]
        saga = saga_class()
        
        # Persist saga state
        await self._persist_saga_state(saga, context, SagaStatus.STARTED)
        
        # Add to running sagas
        self._running_sagas[context.saga_id] = saga
        
        logger.info("Saga started",
                   saga_id=str(context.saga_id),
                   saga_type=saga_type,
                   correlation_id=str(context.correlation_id))
        
        # Execute saga asynchronously
        asyncio.create_task(self._execute_saga(saga, context))
        
        return context.saga_id
    
    async def _execute_saga(self, saga: BaseSaga, context: SagaContext) -> None:
        """
        Execute a saga with state persistence
        
        Args:
            saga: Saga to execute
            context: Saga context
        """
        try:
            # Execute saga
            success = await saga.execute(context)
            
            # Persist final state
            final_status = SagaStatus.COMPLETED if success else SagaStatus.COMPENSATED
            await self._persist_saga_state(saga, context, final_status)
            
            # Remove from running sagas
            self._running_sagas.pop(context.saga_id, None)
            
            if success:
                logger.info("Saga completed successfully",
                           saga_id=str(context.saga_id))
            else:
                logger.warning("Saga compensated after failure",
                              saga_id=str(context.saga_id))
                
        except Exception as e:
            logger.error("Saga execution failed",
                        saga_id=str(context.saga_id),
                        error=str(e))
            
            # Persist error state
            await self._persist_saga_state(saga, context, SagaStatus.FAILED)
            
            # Remove from running sagas
            self._running_sagas.pop(context.saga_id, None)
    
    async def _persist_saga_state(
        self,
        saga: BaseSaga,
        context: SagaContext,
        status: SagaStatus
    ) -> None:
        """
        Persist saga state to database
        
        Args:
            saga: Saga instance
            context: Saga context
            status: Current saga status
        """
        try:
            # Check if saga instance exists
            result = await self.db.execute(
                select("saga_instances").where(
                    "saga_id" == str(context.saga_id)
                )
            )
            existing = result.first()
            
            saga_data = {
                "saga_id": str(context.saga_id),
                "saga_type": saga.saga_type,
                "status": status.value,
                "correlation_id": str(context.correlation_id),
                "user_id": context.user_id,
                "input_data": context.input_data,
                "current_step": saga.current_step,
                "total_steps": len(saga.steps),
                "error_message": saga.error_message,
                "updated_at": datetime.utcnow()
            }
            
            if existing:
                # Update existing saga
                await self.db.execute(
                    update("saga_instances")
                    .where("saga_id" == str(context.saga_id))
                    .values(**saga_data)
                )
            else:
                # Insert new saga
                saga_data["created_at"] = datetime.utcnow()
                await self.db.execute(
                    "INSERT INTO saga_instances VALUES (:saga_id, :saga_type, :status, ...)",
                    saga_data
                )
            
            # Persist step states
            for step in saga.steps:
                await self._persist_step_state(context.saga_id, step)
            
            await self.db.commit()
            
        except Exception as e:
            logger.error("Failed to persist saga state",
                        saga_id=str(context.saga_id),
                        error=str(e))
            await self.db.rollback()
    
    async def _persist_step_state(self, saga_id: UUID, step: Any) -> None:
        """
        Persist saga step state
        
        Args:
            saga_id: Saga ID
            step: Saga step
        """
        try:
            step_data = {
                "saga_id": str(saga_id),
                "step_number": step.step_number,
                "step_name": step.step_name,
                "status": step.status.value,
                "retry_count": step.retry_count,
                "error_message": step.error_message,
                "started_at": step.started_at,
                "completed_at": step.completed_at,
                "updated_at": datetime.utcnow()
            }
            
            # Upsert step state
            await self.db.execute(
                """
                INSERT INTO saga_steps (saga_id, step_number, step_name, status, ...)
                VALUES (:saga_id, :step_number, :step_name, :status, ...)
                ON CONFLICT (saga_id, step_number) 
                DO UPDATE SET status = :status, ...
                """,
                step_data
            )
            
        except Exception as e:
            logger.error("Failed to persist step state",
                        saga_id=str(saga_id),
                        step_number=step.step_number,
                        error=str(e))
    
    async def get_saga_status(self, saga_id: UUID) -> Optional[Dict[str, Any]]:
        """
        Get saga status
        
        Args:
            saga_id: Saga ID
            
        Returns:
            Saga status or None if not found
        """
        # Check running sagas first
        if saga_id in self._running_sagas:
            saga = self._running_sagas[saga_id]
            return saga.get_status()
        
        # Check database
        result = await self.db.execute(
            select("saga_instances").where("saga_id" == str(saga_id))
        )
        saga_row = result.first()
        
        if not saga_row:
            return None
        
        # Get step states
        steps_result = await self.db.execute(
            select("saga_steps")
            .where("saga_id" == str(saga_id))
            .order_by("step_number")
        )
        steps = steps_result.fetchall()
        
        return {
            "saga_id": saga_row.saga_id,
            "saga_type": saga_row.saga_type,
            "status": saga_row.status,
            "correlation_id": saga_row.correlation_id,
            "current_step": saga_row.current_step,
            "total_steps": saga_row.total_steps,
            "error_message": saga_row.error_message,
            "created_at": saga_row.created_at.isoformat() if saga_row.created_at else None,
            "updated_at": saga_row.updated_at.isoformat() if saga_row.updated_at else None,
            "steps": [
                {
                    "step_number": step.step_number,
                    "step_name": step.step_name,
                    "status": step.status,
                    "retry_count": step.retry_count,
                    "error_message": step.error_message,
                }
                for step in steps
            ]
        }
    
    async def recover_failed_sagas(self, max_age_hours: int = 24) -> List[UUID]:
        """
        Recover failed sagas
        
        Args:
            max_age_hours: Maximum age of sagas to recover
            
        Returns:
            List of recovered saga IDs
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
        
        # Find failed sagas
        result = await self.db.execute(
            select("saga_instances")
            .where("status" == SagaStatus.FAILED.value)
            .where("updated_at" >= cutoff_time)
        )
        failed_sagas = result.fetchall()
        
        recovered_ids = []
        
        for saga_row in failed_sagas:
            try:
                logger.info("Attempting saga recovery",
                           saga_id=saga_row.saga_id)
                
                # Recreate saga context
                context = SagaContext(
                    saga_id=UUID(saga_row.saga_id),
                    correlation_id=UUID(saga_row.correlation_id),
                    user_id=saga_row.user_id,
                    input_data=saga_row.input_data
                )
                
                # Recreate saga instance
                saga_class = self._saga_registry.get(saga_row.saga_type)
                if not saga_class:
                    logger.warning("Cannot recover saga - unknown type",
                                  saga_id=saga_row.saga_id,
                                  saga_type=saga_row.saga_type)
                    continue
                
                saga = saga_class()
                
                # Restore saga state
                saga.saga_id = context.saga_id
                saga.current_step = saga_row.current_step
                saga.status = SagaStatus(saga_row.status)
                
                # Execute compensation
                await saga._compensate()
                
                # Update status
                await self._persist_saga_state(saga, context, SagaStatus.COMPENSATED)
                
                recovered_ids.append(context.saga_id)
                
                logger.info("Saga recovered successfully",
                           saga_id=saga_row.saga_id)
                
            except Exception as e:
                logger.error("Failed to recover saga",
                            saga_id=saga_row.saga_id,
                            error=str(e))
        
        return recovered_ids
    
    async def list_sagas(
        self,
        status: Optional[SagaStatus] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List sagas
        
        Args:
            status: Filter by status
            limit: Maximum number of results
            offset: Offset for pagination
            
        Returns:
            List of saga summaries
        """
        query = select("saga_instances").order_by("created_at DESC")
        
        if status:
            query = query.where("status" == status.value)
        
        query = query.limit(limit).offset(offset)
        
        result = await self.db.execute(query)
        sagas = result.fetchall()
        
        return [
            {
                "saga_id": saga.saga_id,
                "saga_type": saga.saga_type,
                "status": saga.status,
                "correlation_id": saga.correlation_id,
                "current_step": saga.current_step,
                "total_steps": saga.total_steps,
                "created_at": saga.created_at.isoformat() if saga.created_at else None,
                "updated_at": saga.updated_at.isoformat() if saga.updated_at else None,
            }
            for saga in sagas
        ]
    
    async def get_saga_statistics(self) -> Dict[str, Any]:
        """
        Get saga statistics
        
        Returns:
            Saga statistics
        """
        # Count by status
        result = await self.db.execute(
            """
            SELECT status, COUNT(*) as count
            FROM saga_instances
            GROUP BY status
            """
        )
        status_counts = {row.status: row.count for row in result.fetchall()}
        
        # Average execution time
        result = await self.db.execute(
            """
            SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration
            FROM saga_instances
            WHERE status IN ('COMPLETED', 'COMPENSATED')
            """
        )
        avg_duration = result.scalar() or 0
        
        # Success rate
        total = sum(status_counts.values())
        completed = status_counts.get(SagaStatus.COMPLETED.value, 0)
        success_rate = (completed / total * 100) if total > 0 else 0
        
        return {
            "total_sagas": total,
            "running": len(self._running_sagas),
            "completed": status_counts.get(SagaStatus.COMPLETED.value, 0),
            "failed": status_counts.get(SagaStatus.FAILED.value, 0),
            "compensated": status_counts.get(SagaStatus.COMPENSATED.value, 0),
            "success_rate": round(success_rate, 2),
            "average_duration_seconds": round(avg_duration, 2),
            "status_breakdown": status_counts
        }


# Global orchestrator instance
_orchestrator: Optional[SagaOrchestratorService] = None


async def get_saga_orchestrator() -> SagaOrchestratorService:
    """Get or create saga orchestrator instance"""
    global _orchestrator
    
    if _orchestrator is None:
        db = await get_db()
        _orchestrator = SagaOrchestratorService(db)
        
        # Register saga types
        from app.sagas.transfer_saga import TransferSaga
        _orchestrator.register_saga("transfer", TransferSaga)
    
    return _orchestrator
