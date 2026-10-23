"""API Router for BNPL Service - Proxies to Go bnpl-go service"""
from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/bnpl", tags=["bnpl"])

GO_SERVICE_URL = os.getenv("BNPL_GO_URL", "http://localhost:8085")

from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402
from app.middleware.auth import get_current_user  # noqa: E402
from app.services.credit_decision_service import gate_credit_application  # noqa: E402
from database.connection import get_db  # noqa: E402

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go BNPL service"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{GO_SERVICE_URL}/api{path}"
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, json=data, headers=headers)
        else:
            raise HTTPException(status_code=405, detail="Method not allowed")
        
        return response.json()

# Eligibility
@router.get("/eligibility")
async def check_eligibility(authorization: Optional[str] = Header(None)):
    """Check BNPL eligibility"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/eligibility", token=token)

# Plans
@router.get("/plans")
async def get_plans():
    """Get available BNPL plans"""
    return await proxy_request("GET", "/plans")

@router.post("/calculate")
async def calculate_installments(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Calculate installment options"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/calculate", data, token)

# Orders
@router.post("/orders")
async def create_order(data: Dict[str, Any], authorization: Optional[str] = Header(None),
                       claims: Dict[str, Any] = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    """Create BNPL order — gated on authentic credit assessment"""
    amount = data.get("amount") or data.get("total_amount") or data.get("total")
    decision = await gate_credit_application(db, claims, "bnpl",
                                             float(amount) if amount else None)
    data["credit_assessment"] = {"credit_score": decision["credit_score"],
                                 "grade": decision["grade"],
                                 "max_limit": decision["max_limit"]}
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/orders", data, token)

@router.get("/orders")
async def get_orders(authorization: Optional[str] = Header(None)):
    """Get user's BNPL orders"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/orders", token=token)

@router.get("/orders/{id}")
async def get_order(id: str, authorization: Optional[str] = Header(None)):
    """Get order details"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/orders/{id}", token=token)

@router.get("/orders/{id}/schedule")
async def get_payment_schedule(id: str, authorization: Optional[str] = Header(None)):
    """Get payment schedule"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/orders/{id}/schedule", token=token)

@router.post("/orders/{id}/pay")
async def make_payment(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Make installment payment"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/orders/{id}/pay", data, token)

# Merchants
@router.get("/merchants")
async def get_merchants():
    """Get partner merchants"""
    return await proxy_request("GET", "/merchants")
