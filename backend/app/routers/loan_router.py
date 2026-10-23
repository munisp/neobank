"""
Production Loan Router - Proxies to Go Banking Service for high performance
"""
import os
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402
from app.middleware.auth import get_current_user  # noqa: E402
from app.services.credit_decision_service import gate_credit_application  # noqa: E402
from database.connection import get_db  # noqa: E402
from fastapi import APIRouter, HTTPException, Request
import httpx
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/loans", tags=["loans"])

GO_BANKING_SERVICE_URL = os.getenv("GO_BANKING_SERVICE_URL", "http://localhost:8081")


async def proxy_to_go_service(
    method: str,
    path: str,
    json_data: Optional[Dict] = None,
    headers: Optional[Dict] = None
) -> Dict[str, Any]:
    """Proxy request to Go Banking service"""
    url = f"{GO_BANKING_SERVICE_URL}/api/loans{path}"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                response = await client.post(url, json=json_data, headers=headers)
            elif method == "PUT":
                response = await client.put(url, json=json_data, headers=headers)
            elif method == "DELETE":
                response = await client.delete(url, headers=headers)
            else:
                raise HTTPException(status_code=405, detail="Method not allowed")
            
            if response.status_code >= 400:
                logger.warning("Go Banking service error", status_code=response.status_code, path=path)
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json() if response.text else "Service error"
                )
            
            return response.json()
        
    except httpx.ConnectError:
        logger.error("Failed to connect to Go Banking service", url=url)
        raise HTTPException(status_code=503, detail="Loan service temporarily unavailable")
    except httpx.TimeoutException:
        logger.error("Go Banking service timeout", url=url)
        raise HTTPException(status_code=504, detail="Loan service timeout")


@router.post("/apply")
async def apply_for_loan(request: Request, data: Dict[str, Any],
                         claims: Dict[str, Any] = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """Apply for a loan — gated on authentic credit assessment"""
    amount = data.get("amount") or data.get("principal") or data.get("loan_amount")
    decision = await gate_credit_application(db, claims, "loan",
                                             float(amount) if amount else None)
    data["credit_assessment"] = {"credit_score": decision["credit_score"],
                                 "grade": decision["grade"],
                                 "suggested_annual_rate_pct": decision["suggested_annual_rate_pct"],
                                 "max_limit": decision["max_limit"]}
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "/apply", json_data=data, headers=headers)


@router.get("")
async def get_user_loans(request: Request):
    """Get all loans for the current user"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", "", headers=headers)


@router.get("/summary")
async def get_loan_summary(request: Request):
    """Get loan summary for the current user"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", "/summary", headers=headers)


@router.get("/{loan_id}")
async def get_loan(loan_id: str, request: Request):
    """Get a specific loan"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/{loan_id}", headers=headers)


@router.post("/{loan_id}/decision")
async def process_loan_decision(loan_id: str, data: Dict[str, Any], request: Request):
    """Process loan approval/rejection decision"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{loan_id}/decision", json_data=data, headers=headers)


@router.post("/{loan_id}/disburse")
async def disburse_loan(loan_id: str, request: Request):
    """Disburse an approved loan"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{loan_id}/disburse", headers=headers)


@router.get("/{loan_id}/schedule")
async def get_repayment_schedule(loan_id: str, request: Request):
    """Get repayment schedule for a loan"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/{loan_id}/schedule", headers=headers)


@router.post("/{loan_id}/payments")
async def make_payment(loan_id: str, data: Dict[str, Any], request: Request):
    """Make a loan payment"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{loan_id}/payments", json_data=data, headers=headers)


# Legacy endpoints for backward compatibility
@router.post("/")
async def create_loan_legacy(data: Dict[str, Any], request: Request):
    """Legacy loan creation - redirects to apply"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "/apply", json_data=data, headers=headers)
