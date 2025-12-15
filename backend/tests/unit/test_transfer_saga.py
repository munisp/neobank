"""
Transfer Saga Tests
Comprehensive tests for the transfer saga implementation
"""

import pytest
import asyncio
from decimal import Decimal
from uuid import uuid4
from unittest.mock import Mock, AsyncMock, patch

from app.sagas.transfer_saga import TransferSaga
from app.sagas.base_saga import SagaContext, SagaStatus, StepStatus


@pytest.fixture
def mock_pg_service():
    """Mock PostgreSQL service"""
    service = Mock()
    service.get_account = AsyncMock()
    service.create_balance_reservation = AsyncMock()
    service.release_balance_reservation = AsyncMock()
    service.commit_transfer = AsyncMock()
    service.rollback_transfer = AsyncMock()
    service.get_daily_transfer_total = AsyncMock(return_value=Decimal("0"))
    return service


@pytest.fixture
def mock_tigerbeetle_service():
    """Mock TigerBeetle service"""
    service = Mock()
    service.create_transfer = AsyncMock()
    return service


@pytest.fixture
def mock_event_store_service():
    """Mock event store service"""
    service = Mock()
    service.append_event = AsyncMock()
    service.get_next_version = AsyncMock(return_value=1)
    return service


@pytest.fixture
def valid_context():
    """Valid saga context for testing"""
    return SagaContext(
        saga_id=uuid4(),
        correlation_id=uuid4(),
        user_id="user_123",
        input_data={
            "from_account_id": "acc_from",
            "to_account_id": "acc_to",
            "amount": "1000.00",
            "currency": "NGN",
            "description": "Test transfer",
            "reference": "TEST-001"
        }
    )


class TestTransferSagaSuccess:
    """Test successful transfer saga execution"""
    
    @pytest.mark.asyncio
    async def test_successful_transfer(
        self,
        mock_pg_service,
        mock_tigerbeetle_service,
        mock_event_store_service,
        valid_context
    ):
        """Test complete successful transfer"""
        # Setup mocks
        mock_pg_service.get_account.side_effect = [
            {
                "account_id": "acc_from",
                "account_number": "1234567890",
                "status": "ACTIVE",
                "available_balance": "5000.00",
                "daily_limit": "10000.00",
                "tigerbeetle_account_id": "tb_from"
            },
            {
                "account_id": "acc_to",
                "account_number": "0987654321",
                "status": "ACTIVE",
                "available_balance": "1000.00",
                "tigerbeetle_account_id": "tb_to"
            }
        ]
        
        mock_pg_service.create_balance_reservation.return_value = {
            "reservation_id": "res_123"
        }
        
        mock_tigerbeetle_service.create_transfer.return_value = {
            "id": "tb_transfer_123",
            "timestamp": "2025-10-31T12:00:00Z"
        }
        
        mock_pg_service.commit_transfer.return_value = {
            "transfer_id": "transfer_123",
            "from_balance": "4000.00",
            "to_balance": "2000.00"
        }
        
        # Create and execute saga
        saga = TransferSaga(
            mock_pg_service,
            mock_tigerbeetle_service,
            mock_event_store_service
        )
        
        success = await saga.execute(valid_context)
        
        # Assertions
        assert success is True
        assert saga.status == SagaStatus.COMPLETED
        assert saga.current_step == 5
        
        # Verify all steps completed
        for step in saga.steps:
            assert step.status == StepStatus.COMPLETED
        
        # Verify service calls
        assert mock_pg_service.get_account.call_count == 2
        assert mock_pg_service.create_balance_reservation.called
        assert mock_tigerbeetle_service.create_transfer.called
        assert mock_pg_service.commit_transfer.called
        assert mock_event_store_service.append_event.call_count >= 3


class TestTransferSagaValidation:
    """Test transfer validation"""
    
    @pytest.mark.asyncio
    async def test_insufficient_balance(
        self,
        mock_pg_service,
        mock_tigerbeetle_service,
        mock_event_store_service,
        valid_context
    ):
        """Test transfer fails with insufficient balance"""
        # Setup mock - insufficient balance
        mock_pg_service.get_account.side_effect = [
            {
                "account_id": "acc_from",
                "account_number": "1234567890",
                "status": "ACTIVE",
                "available_balance": "500.00",  # Less than transfer amount
                "daily_limit": "10000.00",
                "tigerbeetle_account_id": "tb_from"
            },
            {
                "account_id": "acc_to",
                "account_number": "0987654321",
                "status": "ACTIVE",
                "available_balance": "1000.00",
                "tigerbeetle_account_id": "tb_to"
            }
        ]
        
        # Create and execute saga
        saga = TransferSaga(
            mock_pg_service,
            mock_tigerbeetle_service,
            mock_event_store_service
        )
        
        success = await saga.execute(valid_context)
        
        # Assertions
        assert success is False
        assert saga.status == SagaStatus.COMPENSATED
        assert saga.current_step == 1  # Failed at validation
        assert saga.steps[0].status == StepStatus.FAILED
        assert "Insufficient balance" in saga.steps[0].error_message
    
    @pytest.mark.asyncio
    async def test_inactive_account(
        self,
        mock_pg_service,
        mock_tigerbeetle_service,
        mock_event_store_service,
        valid_context
    ):
        """Test transfer fails with inactive account"""
        # Setup mock - inactive account
        mock_pg_service.get_account.side_effect = [
            {
                "account_id": "acc_from",
                "account_number": "1234567890",
                "status": "SUSPENDED",  # Inactive
                "available_balance": "5000.00",
                "daily_limit": "10000.00",
                "tigerbeetle_account_id": "tb_from"
            },
            {
                "account_id": "acc_to",
                "account_number": "0987654321",
                "status": "ACTIVE",
                "available_balance": "1000.00",
                "tigerbeetle_account_id": "tb_to"
            }
        ]
        
        # Create and execute saga
        saga = TransferSaga(
            mock_pg_service,
            mock_tigerbeetle_service,
            mock_event_store_service
        )
        
        success = await saga.execute(valid_context)
        
        # Assertions
        assert success is False
        assert "not active" in saga.steps[0].error_message.lower()


class TestTransferSagaCompensation:
    """Test saga compensation logic"""
    
    @pytest.mark.asyncio
    async def test_compensation_after_tigerbeetle_failure(
        self,
        mock_pg_service,
        mock_tigerbeetle_service,
        mock_event_store_service,
        valid_context
    ):
        """Test compensation when TigerBeetle transfer fails"""
        # Setup mocks - TigerBeetle fails
        mock_pg_service.get_account.side_effect = [
            {
                "account_id": "acc_from",
                "account_number": "1234567890",
                "status": "ACTIVE",
                "available_balance": "5000.00",
                "daily_limit": "10000.00",
                "tigerbeetle_account_id": "tb_from"
            },
            {
                "account_id": "acc_to",
                "account_number": "0987654321",
                "status": "ACTIVE",
                "available_balance": "1000.00",
                "tigerbeetle_account_id": "tb_to"
            }
        ]
        
        mock_pg_service.create_balance_reservation.return_value = {
            "reservation_id": "res_123"
        }
        
        # TigerBeetle fails
        mock_tigerbeetle_service.create_transfer.side_effect = Exception("TigerBeetle error")
        
        # Create and execute saga
        saga = TransferSaga(
            mock_pg_service,
            mock_tigerbeetle_service,
            mock_event_store_service
        )
        
        success = await saga.execute(valid_context)
        
        # Assertions
        assert success is False
        assert saga.status == SagaStatus.COMPENSATED
        
        # Verify compensation was called
        assert mock_pg_service.release_balance_reservation.called
        
        # Verify step 2 was compensated
        assert saga.steps[1].status == StepStatus.COMPENSATED


class TestTransferSagaRetry:
    """Test saga retry logic"""
    
    @pytest.mark.asyncio
    async def test_retry_on_transient_failure(
        self,
        mock_pg_service,
        mock_tigerbeetle_service,
        mock_event_store_service,
        valid_context
    ):
        """Test retry on transient failure"""
        # Setup mocks
        mock_pg_service.get_account.side_effect = [
            {
                "account_id": "acc_from",
                "account_number": "1234567890",
                "status": "ACTIVE",
                "available_balance": "5000.00",
                "daily_limit": "10000.00",
                "tigerbeetle_account_id": "tb_from"
            },
            {
                "account_id": "acc_to",
                "account_number": "0987654321",
                "status": "ACTIVE",
                "available_balance": "1000.00",
                "tigerbeetle_account_id": "tb_to"
            }
        ]
        
        mock_pg_service.create_balance_reservation.return_value = {
            "reservation_id": "res_123"
        }
        
        # TigerBeetle fails twice, then succeeds
        mock_tigerbeetle_service.create_transfer.side_effect = [
            Exception("Transient error 1"),
            Exception("Transient error 2"),
            {
                "id": "tb_transfer_123",
                "timestamp": "2025-10-31T12:00:00Z"
            }
        ]
        
        mock_pg_service.commit_transfer.return_value = {
            "transfer_id": "transfer_123",
            "from_balance": "4000.00",
            "to_balance": "2000.00"
        }
        
        # Create and execute saga
        saga = TransferSaga(
            mock_pg_service,
            mock_tigerbeetle_service,
            mock_event_store_service
        )
        
        success = await saga.execute(valid_context)
        
        # Assertions
        assert success is True
        assert saga.status == SagaStatus.COMPLETED
        
        # Verify retry count
        assert saga.steps[2].retry_count == 2
        assert mock_tigerbeetle_service.create_transfer.call_count == 3


@pytest.mark.asyncio
async def test_saga_context():
    """Test saga context functionality"""
    context = SagaContext(
        saga_id=uuid4(),
        correlation_id=uuid4(),
        user_id="user_123",
        input_data={"key": "value"}
    )
    
    # Test set/get step result
    context.set_step_result(1, {"result": "data"})
    assert context.get_step_result(1) == {"result": "data"}
    assert context.get_step_result(2) is None
    
    # Test to_dict
    context_dict = context.to_dict()
    assert "saga_id" in context_dict
    assert "correlation_id" in context_dict
    assert context_dict["user_id"] == "user_123"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
