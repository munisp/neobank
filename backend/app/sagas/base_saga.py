"""
Base Saga Classes
Implements the Saga pattern for distributed transactions
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Callable
from uuid import UUID, uuid4
from enum import Enum
from datetime import datetime
import structlog
import asyncio

logger = structlog.get_logger()


class SagaStatus(Enum):
    """Saga execution status"""
    STARTED = "STARTED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    COMPENSATING = "COMPENSATING"
    COMPENSATED = "COMPENSATED"


class StepStatus(Enum):
    """Saga step execution status"""
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    COMPENSATING = "COMPENSATING"
    COMPENSATED = "COMPENSATED"


@dataclass
class SagaStep:
    """
    Represents a single step in a saga
    
    Each step has:
    - Forward action (the operation to perform)
    - Compensation action (how to undo the operation)
    - Retry logic
    """
    
    step_number: int
    step_name: str
    forward_action: Callable
    compensation_action: Optional[Callable] = None
    max_retries: int = 3
    retry_delay: float = 1.0  # seconds
    timeout: float = 30.0  # seconds
    
    # Runtime state
    status: StepStatus = StepStatus.PENDING
    retry_count: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    result: Optional[Any] = None
    compensation_data: Optional[Dict[str, Any]] = None
    
    async def execute(self, context: Dict[str, Any]) -> Any:
        """
        Execute the forward action
        
        Args:
            context: Saga execution context
            
        Returns:
            Result of the action
        """
        self.status = StepStatus.RUNNING
        self.started_at = datetime.utcnow()
        
        try:
            logger.info("Executing saga step",
                       step_number=self.step_number,
                       step_name=self.step_name)
            
            # Execute with timeout
            result = await asyncio.wait_for(
                self.forward_action(context),
                timeout=self.timeout
            )
            
            self.result = result
            self.status = StepStatus.COMPLETED
            self.completed_at = datetime.utcnow()
            
            logger.info("Saga step completed",
                       step_number=self.step_number,
                       step_name=self.step_name)
            
            return result
            
        except asyncio.TimeoutError:
            self.error_message = f"Step timed out after {self.timeout}s"
            self.status = StepStatus.FAILED
            logger.error("Saga step timeout",
                        step_number=self.step_number,
                        step_name=self.step_name,
                        timeout=self.timeout)
            raise
            
        except Exception as e:
            self.error_message = str(e)
            self.status = StepStatus.FAILED
            logger.error("Saga step failed",
                        step_number=self.step_number,
                        step_name=self.step_name,
                        error=str(e))
            raise
    
    async def compensate(self, context: Dict[str, Any]) -> None:
        """
        Execute the compensation action
        
        Args:
            context: Saga execution context
        """
        if not self.compensation_action:
            logger.warning("No compensation action defined",
                          step_number=self.step_number,
                          step_name=self.step_name)
            return
        
        self.status = StepStatus.COMPENSATING
        
        try:
            logger.info("Compensating saga step",
                       step_number=self.step_number,
                       step_name=self.step_name)
            
            # Execute compensation with timeout
            await asyncio.wait_for(
                self.compensation_action(context, self.compensation_data),
                timeout=self.timeout
            )
            
            self.status = StepStatus.COMPENSATED
            
            logger.info("Saga step compensated",
                       step_number=self.step_number,
                       step_name=self.step_name)
            
        except Exception as e:
            logger.error("Compensation failed",
                        step_number=self.step_number,
                        step_name=self.step_name,
                        error=str(e))
            # Compensation failures are logged but don't stop the compensation process
            self.status = StepStatus.FAILED


@dataclass
class SagaContext:
    """
    Context passed through saga execution
    
    Contains:
    - Input data
    - Intermediate results
    - Correlation IDs
    - User context
    """
    
    saga_id: UUID = field(default_factory=uuid4)
    correlation_id: UUID = field(default_factory=uuid4)
    user_id: Optional[str] = None
    
    # Input data
    input_data: Dict[str, Any] = field(default_factory=dict)
    
    # Step results
    step_results: Dict[int, Any] = field(default_factory=dict)
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Timestamps
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    
    def set_step_result(self, step_number: int, result: Any) -> None:
        """Store result from a step"""
        self.step_results[step_number] = result
    
    def get_step_result(self, step_number: int) -> Optional[Any]:
        """Get result from a previous step"""
        return self.step_results.get(step_number)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert context to dictionary"""
        return {
            "saga_id": str(self.saga_id),
            "correlation_id": str(self.correlation_id),
            "user_id": self.user_id,
            "input_data": self.input_data,
            "step_results": self.step_results,
            "metadata": self.metadata,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class BaseSaga(ABC):
    """
    Base class for all sagas
    
    Implements the Saga pattern with:
    - Sequential step execution
    - Automatic compensation on failure
    - Retry logic
    - State persistence
    """
    
    def __init__(self):
        self.saga_id: UUID = uuid4()
        self.saga_type: str = self.__class__.__name__
        self.status: SagaStatus = SagaStatus.STARTED
        self.steps: List[SagaStep] = []
        self.current_step: int = 0
        self.context: Optional[SagaContext] = None
        self.error_message: Optional[str] = None
        
        # Initialize steps
        self._define_steps()
    
    @abstractmethod
    def _define_steps(self) -> None:
        """
        Define the saga steps
        
        Subclasses must implement this to define their steps
        """
        pass
    
    def add_step(
        self,
        step_name: str,
        forward_action: Callable,
        compensation_action: Optional[Callable] = None,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        timeout: float = 30.0
    ) -> None:
        """
        Add a step to the saga
        
        Args:
            step_name: Name of the step
            forward_action: Function to execute
            compensation_action: Function to compensate
            max_retries: Maximum retry attempts
            retry_delay: Delay between retries
            timeout: Step timeout in seconds
        """
        step_number = len(self.steps) + 1
        step = SagaStep(
            step_number=step_number,
            step_name=step_name,
            forward_action=forward_action,
            compensation_action=compensation_action,
            max_retries=max_retries,
            retry_delay=retry_delay,
            timeout=timeout
        )
        self.steps.append(step)
    
    async def execute(self, context: SagaContext) -> bool:
        """
        Execute the saga
        
        Args:
            context: Saga execution context
            
        Returns:
            True if successful, False otherwise
        """
        self.context = context
        self.saga_id = context.saga_id
        self.status = SagaStatus.RUNNING
        
        logger.info("Starting saga execution",
                   saga_id=str(self.saga_id),
                   saga_type=self.saga_type,
                   total_steps=len(self.steps))
        
        try:
            # Execute each step sequentially
            for step in self.steps:
                self.current_step = step.step_number
                
                # Try to execute step with retries
                success = await self._execute_step_with_retry(step)
                
                if not success:
                    # Step failed after all retries, start compensation
                    logger.error("Step failed, starting compensation",
                                saga_id=str(self.saga_id),
                                failed_step=step.step_number)
                    await self._compensate()
                    return False
                
                # Store step result in context
                context.set_step_result(step.step_number, step.result)
            
            # All steps completed successfully
            self.status = SagaStatus.COMPLETED
            context.completed_at = datetime.utcnow()
            
            logger.info("Saga completed successfully",
                       saga_id=str(self.saga_id),
                       saga_type=self.saga_type)
            
            return True
            
        except Exception as e:
            self.error_message = str(e)
            self.status = SagaStatus.FAILED
            logger.error("Saga execution failed",
                        saga_id=str(self.saga_id),
                        error=str(e))
            
            # Attempt compensation
            await self._compensate()
            return False
    
    async def _execute_step_with_retry(self, step: SagaStep) -> bool:
        """
        Execute a step with retry logic
        
        Args:
            step: Step to execute
            
        Returns:
            True if successful, False otherwise
        """
        for attempt in range(step.max_retries):
            try:
                await step.execute(self.context.to_dict())
                return True
                
            except Exception as e:
                step.retry_count = attempt + 1
                
                if attempt < step.max_retries - 1:
                    logger.warning("Step failed, retrying",
                                  saga_id=str(self.saga_id),
                                  step_number=step.step_number,
                                  attempt=attempt + 1,
                                  max_retries=step.max_retries)
                    
                    # Wait before retry
                    await asyncio.sleep(step.retry_delay)
                else:
                    logger.error("Step failed after all retries",
                                saga_id=str(self.saga_id),
                                step_number=step.step_number,
                                attempts=step.max_retries)
                    return False
        
        return False
    
    async def _compensate(self) -> None:
        """
        Compensate all completed steps in reverse order
        """
        self.status = SagaStatus.COMPENSATING
        
        logger.info("Starting saga compensation",
                   saga_id=str(self.saga_id),
                   steps_to_compensate=self.current_step - 1)
        
        # Compensate completed steps in reverse order
        for step in reversed(self.steps[:self.current_step]):
            if step.status == StepStatus.COMPLETED:
                try:
                    await step.compensate(self.context.to_dict())
                except Exception as e:
                    logger.error("Compensation error (continuing)",
                                saga_id=str(self.saga_id),
                                step_number=step.step_number,
                                error=str(e))
        
        self.status = SagaStatus.COMPENSATED
        
        logger.info("Saga compensation completed",
                   saga_id=str(self.saga_id))
    
    def get_status(self) -> Dict[str, Any]:
        """Get saga status"""
        return {
            "saga_id": str(self.saga_id),
            "saga_type": self.saga_type,
            "status": self.status.value,
            "current_step": self.current_step,
            "total_steps": len(self.steps),
            "error_message": self.error_message,
            "steps": [
                {
                    "step_number": step.step_number,
                    "step_name": step.step_name,
                    "status": step.status.value,
                    "retry_count": step.retry_count,
                    "error_message": step.error_message,
                }
                for step in self.steps
            ]
        }
