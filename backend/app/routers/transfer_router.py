"""
Transfer Router
API endpoints for transfers using Saga pattern
"""

from typing import Optional
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, validator
import structlog

from app.services.saga_orchestrator_service import get_saga_orchestrator
from app.middleware.auth import require_auth, get_current_user

logger = structlog.get_logger()

router = APIRouter(prefix="/transfers", tags=["transfers"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class TransferRequest(BaseModel):
    """Transfer request model"""
    
    from_account_id: str = Field(..., description="Source account ID")
    to_account_id: str = Field(..., description="Destination account ID")
    amount: Decimal = Field(..., gt=0, description="Transfer amount")
    currency: str = Field(default="NGN", description="Currency code")
    description: Optional[str] = Field(None, max_length=500, description="Transfer description")
    reference: Optional[str] = Field(None, max_length=100, description="External reference")
    
    @validator("amount")
    def validate_amount(cls, v):
        """Validate amount has max 2 decimal places"""
        if v.as_tuple().exponent < -2:
            raise ValueError("Amount cannot have more than 2 decimal places")
        return v
    
    @validator("currency")
    def validate_currency(cls, v):
        """Validate currency code"""
        valid_currencies = ["NGN", "USD", "EUR", "GBP"]
        if v not in valid_currencies:
            raise ValueError(f"Currency must be one of: {', '.join(valid_currencies)}")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "from_account_id": "acc_123456",
                "to_account_id": "acc_789012",
                "amount": "1000.00",
                "currency": "NGN",
                "description": "Payment for services",
                "reference": "INV-2025-001"
            }
        }


class TransferResponse(BaseModel):
    """Transfer response model"""
    
    saga_id: str = Field(..., description="Saga ID for tracking")
    correlation_id: str = Field(..., description="Correlation ID")
    status: str = Field(..., description="Initial status")
    message: str = Field(..., description="Response message")
    
    class Config:
        json_schema_extra = {
            "example": {
                "saga_id": "550e8400-e29b-41d4-a716-446655440000",
                "correlation_id": "660e8400-e29b-41d4-a716-446655440001",
                "status": "STARTED",
                "message": "Transfer initiated successfully"
            }
        }


class SagaStatusResponse(BaseModel):
    """Saga status response model"""
    
    saga_id: str
    saga_type: str
    status: str
    correlation_id: str
    current_step: int
    total_steps: int
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    steps: list
    
    class Config:
        json_schema_extra = {
            "example": {
                "saga_id": "550e8400-e29b-41d4-a716-446655440000",
                "saga_type": "transfer",
                "status": "COMPLETED",
                "correlation_id": "660e8400-e29b-41d4-a716-446655440001",
                "current_step": 5,
                "total_steps": 5,
                "error_message": None,
                "created_at": "2025-10-31T12:00:00Z",
                "updated_at": "2025-10-31T12:00:05Z",
                "steps": [
                    {
                        "step_number": 1,
                        "step_name": "validate_transfer",
                        "status": "COMPLETED",
                        "retry_count": 0,
                        "error_message": None
                    }
                ]
            }
        }


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post(
    "/",
    response_model=TransferResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create a new transfer",
    description="Initiates a new transfer using the Saga pattern for distributed transaction coordination"
)
async def create_transfer(
    request: TransferRequest,
    current_user: dict = Depends(get_current_user),
    orchestrator = Depends(get_saga_orchestrator),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new transfer
    
    This endpoint initiates a transfer saga that coordinates the transfer
    between PostgreSQL and TigerBeetle with automatic compensation on failure.
    
    The transfer is processed asynchronously. Use the returned saga_id to
    check the transfer status.
    """
    try:
        logger.info("Transfer request received",
                   from_account=request.from_account_id,
                   to_account=request.to_account_id,
                   amount=str(request.amount),
                   user_id=current_user["user_id"])
        
        # KYC step-up gate: tier ceilings, velocity, first-intl, device-change.
        # Advisory triggers fire-and-notify; hard triggers block the transfer.
        try:
            from app.services.kyc_trigger_service import get_kyc_trigger_service
            from database.models import User as _User
            import uuid as _uuid
            db_user = (await db.execute(select(_User).where(
                _User.id == _uuid.UUID(str(current_user["user_id"]))))).scalar_one_or_none()
            if db_user is not None:
                event = ("international_transfer" if str(request.currency).upper() != "NGN"
                         else "transfer")
                gate = await get_kyc_trigger_service().check_gate(
                    db, db_user, event,
                    {"amount": float(request.amount), "currency": request.currency,
                     "new_device": bool(getattr(request, "new_device", False))})
                if not gate["allowed"]:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={
                        "error": "kyc_required",
                        "required_level": gate.get("required_level"),
                        "triggers": gate.get("triggers"), "route": "/kyc/upgrade"})
        except HTTPException:
            raise
        except Exception as _kyc_exc:  # noqa: BLE001 — never break transfers on gate failure
            logger.warning("kyc_gate_error", error=str(_kyc_exc))

        # Start transfer saga
        saga_id = await orchestrator.start_saga(
            saga_type="transfer",
            input_data={
                "from_account_id": request.from_account_id,
                "to_account_id": request.to_account_id,
                "amount": str(request.amount),
                "currency": request.currency,
                "description": request.description,
                "reference": request.reference,
            },
            user_id=current_user["user_id"]
        )
        
        # Get saga status
        saga_status = await orchestrator.get_saga_status(saga_id)
        
        logger.info("Transfer saga started",
                   saga_id=str(saga_id),
                   user_id=current_user["user_id"])
        
        return TransferResponse(
            saga_id=str(saga_id),
            correlation_id=saga_status["correlation_id"],
            status="STARTED",
            message="Transfer initiated successfully. Use the saga_id to check status."
        )
        
    except ValueError as e:
        logger.warning("Invalid transfer request",
                      error=str(e),
                      user_id=current_user["user_id"])
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
    except Exception as e:
        logger.error("Transfer initiation failed",
                    error=str(e),
                    user_id=current_user["user_id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initiate transfer"
        )


@router.get(
    "/{saga_id}/status",
    response_model=SagaStatusResponse,
    summary="Get transfer status",
    description="Get the current status of a transfer saga"
)
async def get_transfer_status(
    saga_id: UUID,
    current_user: dict = Depends(get_current_user),
    orchestrator = Depends(get_saga_orchestrator)
):
    """
    Get transfer status
    
    Returns the current status of a transfer saga including:
    - Overall saga status
    - Current step being executed
    - Status of each individual step
    - Any error messages
    """
    try:
        saga_status = await orchestrator.get_saga_status(saga_id)
        
        if not saga_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transfer not found: {saga_id}"
            )
        
        return SagaStatusResponse(**saga_status)
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed to get transfer status",
                    saga_id=str(saga_id),
                    error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get transfer status"
        )


@router.get(
    "/",
    summary="List transfers",
    description="List recent transfers for the current user"
)
async def list_transfers(
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    orchestrator = Depends(get_saga_orchestrator)
):
    """
    List transfers
    
    Returns a list of recent transfers with optional status filtering.
    """
    try:
        # Convert status string to enum if provided
        from app.sagas.base_saga import SagaStatus
        status_enum = SagaStatus(status_filter) if status_filter else None
        
        sagas = await orchestrator.list_sagas(
            status=status_enum,
            limit=limit,
            offset=offset
        )
        
        return {
            "transfers": sagas,
            "count": len(sagas),
            "limit": limit,
            "offset": offset
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status filter: {status_filter}"
        )
        
    except Exception as e:
        logger.error("Failed to list transfers", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list transfers"
        )


@router.get(
    "/statistics",
    summary="Get transfer statistics",
    description="Get statistics about transfer execution"
)
async def get_transfer_statistics(
    current_user: dict = Depends(get_current_user),
    orchestrator = Depends(get_saga_orchestrator)
):
    """
    Get transfer statistics
    
    Returns statistics about transfer execution including:
    - Total number of transfers
    - Success rate
    - Average execution time
    - Status breakdown
    """
    try:
        # Check if user has admin role
        if current_user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        
        stats = await orchestrator.get_saga_statistics()
        
        return stats
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed to get transfer statistics", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get transfer statistics"
        )


@router.post(
    "/recover-failed",
    summary="Recover failed transfers",
    description="Attempt to recover failed transfers by compensating them"
)
async def recover_failed_transfers(
    max_age_hours: int = 24,
    current_user: dict = Depends(get_current_user),
    orchestrator = Depends(get_saga_orchestrator)
):
    """
    Recover failed transfers
    
    Attempts to recover failed transfers by executing their compensation logic.
    This ensures the system returns to a consistent state.
    
    Requires admin access.
    """
    try:
        # Check if user has admin role
        if current_user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        
        logger.info("Starting failed transfer recovery",
                   max_age_hours=max_age_hours,
                   user_id=current_user["user_id"])
        
        recovered_ids = await orchestrator.recover_failed_sagas(max_age_hours)
        
        logger.info("Failed transfer recovery completed",
                   recovered_count=len(recovered_ids),
                   user_id=current_user["user_id"])
        
        return {
            "message": f"Successfully recovered {len(recovered_ids)} failed transfers",
            "recovered_saga_ids": [str(id) for id in recovered_ids],
            "count": len(recovered_ids)
        }
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed transfer recovery failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to recover transfers"
        )
