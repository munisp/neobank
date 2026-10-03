"""
Reconciliation Router
API endpoints for reconciliation operations
"""

from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
import structlog

from app.services.reconciliation_service import get_reconciliation_service
from app.middleware.auth import require_auth, get_current_user

logger = structlog.get_logger()

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class ReconciliationRequest(BaseModel):
    """Reconciliation request model"""
    
    account_ids: Optional[List[str]] = Field(None, description="Specific accounts to reconcile (None = all)")
    auto_resolve: bool = Field(True, description="Automatically resolve discrepancies")
    
    class Config:
        json_schema_extra = {
            "example": {
                "account_ids": ["acc_123", "acc_456"],
                "auto_resolve": True
            }
        }


class ReconciliationResponse(BaseModel):
    """Reconciliation response model"""
    
    reconciliation_id: str
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    accounts_checked: int
    discrepancies_found: int
    discrepancies_resolved: int
    discrepancies_remaining: int
    status: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "reconciliation_id": "550e8400-e29b-41d4-a716-446655440000",
                "started_at": "2025-10-31T12:00:00Z",
                "completed_at": "2025-10-31T12:05:30Z",
                "duration_seconds": 330.5,
                "accounts_checked": 1000,
                "discrepancies_found": 5,
                "discrepancies_resolved": 4,
                "discrepancies_remaining": 1,
                "status": "completed"
            }
        }


class DiscrepancyResponse(BaseModel):
    """Discrepancy response model"""
    
    discrepancy_id: str
    reconciliation_id: str
    discrepancy_type: str
    severity: str
    account_id: str
    description: str
    details: dict
    detected_at: str
    resolved: bool
    resolution_action: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "discrepancy_id": "660e8400-e29b-41d4-a716-446655440001",
                "reconciliation_id": "550e8400-e29b-41d4-a716-446655440000",
                "discrepancy_type": "balance_mismatch",
                "severity": "medium",
                "account_id": "acc_123",
                "description": "Balance mismatch: PostgreSQL=1000.00, TigerBeetle=1005.50",
                "details": {
                    "pg_balance": "1000.00",
                    "tb_balance": "1005.50",
                    "difference": "5.50"
                },
                "detected_at": "2025-10-31T12:02:15Z",
                "resolved": True,
                "resolution_action": "Updated PostgreSQL balance to match TigerBeetle: 1005.50"
            }
        }


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post(
    "/run",
    response_model=ReconciliationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Run reconciliation",
    description="Start a full reconciliation between PostgreSQL and TigerBeetle"
)
async def run_reconciliation(
    request: ReconciliationRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    reconciliation_service = Depends(get_reconciliation_service)
):
    """
    Run reconciliation
    
    Starts a full reconciliation process that:
    - Checks account existence in both systems
    - Verifies balance consistency
    - Validates transaction integrity
    - Detects pending transactions
    - Auto-resolves discrepancies (if enabled)
    
    Requires admin access.
    """
    try:
        # Check if user has admin role
        if current_user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        
        logger.info("Reconciliation requested",
                   user_id=current_user["user_id"],
                   account_count=len(request.account_ids) if request.account_ids else "all")
        
        # Run reconciliation in background
        background_tasks.add_task(
            reconciliation_service.run_full_reconciliation,
            account_ids=request.account_ids,
            auto_resolve=request.auto_resolve
        )
        
        return ReconciliationResponse(
            reconciliation_id=str(reconciliation_service.reconciliation_id),
            started_at=datetime.utcnow().isoformat(),
            completed_at=None,
            duration_seconds=None,
            accounts_checked=0,
            discrepancies_found=0,
            discrepancies_resolved=0,
            discrepancies_remaining=0,
            status="running"
        )
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed to start reconciliation", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start reconciliation"
        )


@router.get(
    "/{reconciliation_id}",
    response_model=ReconciliationResponse,
    summary="Get reconciliation status",
    description="Get the status and results of a reconciliation run"
)
async def get_reconciliation_status(
    reconciliation_id: UUID,
    current_user: dict = Depends(get_current_user),
    reconciliation_service = Depends(get_reconciliation_service)
):
    """Get reconciliation status"""
    try:
        # Check if user has admin role
        if current_user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        
        # Get reconciliation from database
        result = await reconciliation_service.db.execute(
            """
            SELECT * FROM reconciliation_runs
            WHERE reconciliation_id = :reconciliation_id
            """,
            {"reconciliation_id": str(reconciliation_id)}
        )
        reconciliation = result.first()
        
        if not reconciliation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Reconciliation not found: {reconciliation_id}"
            )
        
        return ReconciliationResponse(
            reconciliation_id=reconciliation.reconciliation_id,
            started_at=reconciliation.started_at.isoformat(),
            completed_at=reconciliation.completed_at.isoformat() if reconciliation.completed_at else None,
            duration_seconds=reconciliation.duration_seconds,
            accounts_checked=reconciliation.accounts_checked or 0,
            discrepancies_found=reconciliation.discrepancies_found or 0,
            discrepancies_resolved=reconciliation.discrepancies_resolved or 0,
            discrepancies_remaining=(reconciliation.discrepancies_found or 0) - (reconciliation.discrepancies_resolved or 0),
            status=reconciliation.status
        )
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed to get reconciliation status", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get reconciliation status"
        )


@router.get(
    "/{reconciliation_id}/discrepancies",
    response_model=List[DiscrepancyResponse],
    summary="Get discrepancies",
    description="Get all discrepancies found during a reconciliation run"
)
async def get_discrepancies(
    reconciliation_id: UUID,
    resolved: Optional[bool] = None,
    severity: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    reconciliation_service = Depends(get_reconciliation_service)
):
    """Get discrepancies for a reconciliation run"""
    try:
        # Check if user has admin role
        if current_user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        
        # Build query
        query = """
            SELECT * FROM discrepancies
            WHERE reconciliation_id = :reconciliation_id
        """
        params = {"reconciliation_id": str(reconciliation_id)}
        
        if resolved is not None:
            query += " AND resolved = :resolved"
            params["resolved"] = resolved
        
        if severity:
            query += " AND severity = :severity"
            params["severity"] = severity
        
        query += " ORDER BY detected_at DESC"
        
        # Execute query
        result = await reconciliation_service.db.execute(query, params)
        discrepancies = result.fetchall()
        
        return [
            DiscrepancyResponse(
                discrepancy_id=d.discrepancy_id,
                reconciliation_id=d.reconciliation_id,
                discrepancy_type=d.discrepancy_type,
                severity=d.severity,
                account_id=d.account_id,
                description=d.description,
                details=d.details,
                detected_at=d.detected_at.isoformat(),
                resolved=d.resolved,
                resolution_action=d.resolution_action
            )
            for d in discrepancies
        ]
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed to get discrepancies", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get discrepancies"
        )


@router.get(
    "/",
    summary="List reconciliation runs",
    description="List recent reconciliation runs"
)
async def list_reconciliations(
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    reconciliation_service = Depends(get_reconciliation_service)
):
    """List reconciliation runs"""
    try:
        # Check if user has admin role
        if current_user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        
        result = await reconciliation_service.db.execute(
            """
            SELECT * FROM reconciliation_runs
            ORDER BY started_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"limit": limit, "offset": offset}
        )
        reconciliations = result.fetchall()
        
        return {
            "reconciliations": [
                {
                    "reconciliation_id": r.reconciliation_id,
                    "started_at": r.started_at.isoformat(),
                    "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                    "duration_seconds": r.duration_seconds,
                    "accounts_checked": r.accounts_checked or 0,
                    "discrepancies_found": r.discrepancies_found or 0,
                    "discrepancies_resolved": r.discrepancies_resolved or 0,
                    "status": r.status
                }
                for r in reconciliations
            ],
            "count": len(reconciliations),
            "limit": limit,
            "offset": offset
        }
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed to list reconciliations", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list reconciliations"
        )


@router.get(
    "/statistics",
    summary="Get reconciliation statistics",
    description="Get overall reconciliation statistics"
)
async def get_reconciliation_statistics(
    current_user: dict = Depends(get_current_user),
    reconciliation_service = Depends(get_reconciliation_service)
):
    """Get reconciliation statistics"""
    try:
        # Check if user has admin role
        if current_user.get("role") not in ["admin", "super_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
        
        # Get statistics
        result = await reconciliation_service.db.execute(
            """
            SELECT 
                COUNT(*) as total_runs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_runs,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
                SUM(accounts_checked) as total_accounts_checked,
                SUM(discrepancies_found) as total_discrepancies_found,
                SUM(discrepancies_resolved) as total_discrepancies_resolved,
                AVG(duration_seconds) as avg_duration_seconds
            FROM reconciliation_runs
            """
        )
        stats = result.first()
        
        # Get discrepancy breakdown
        result = await reconciliation_service.db.execute(
            """
            SELECT severity, COUNT(*) as count
            FROM discrepancies
            WHERE NOT resolved
            GROUP BY severity
            """
        )
        unresolved_by_severity = {row.severity: row.count for row in result.fetchall()}
        
        return {
            "total_runs": stats.total_runs or 0,
            "completed_runs": stats.completed_runs or 0,
            "failed_runs": stats.failed_runs or 0,
            "total_accounts_checked": stats.total_accounts_checked or 0,
            "total_discrepancies_found": stats.total_discrepancies_found or 0,
            "total_discrepancies_resolved": stats.total_discrepancies_resolved or 0,
            "unresolved_discrepancies": sum(unresolved_by_severity.values()),
            "unresolved_by_severity": unresolved_by_severity,
            "average_duration_seconds": round(stats.avg_duration_seconds or 0, 2),
            "resolution_rate": round(
                (stats.total_discrepancies_resolved / stats.total_discrepancies_found * 100)
                if stats.total_discrepancies_found else 0,
                2
            )
        }
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error("Failed to get reconciliation statistics", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get reconciliation statistics"
        )
