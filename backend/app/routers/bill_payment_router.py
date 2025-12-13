"""API Router for Bill Payment Service - Proxies to Go bills-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/bills", tags=["bills"])

GO_SERVICE_URL = os.getenv("BILLS_GO_URL", "http://localhost:8089")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go bills service"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{GO_SERVICE_URL}/api{path}"
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, json=data, headers=headers)
        elif method == "DELETE":
            response = await client.delete(url, headers=headers)
        else:
            raise HTTPException(status_code=405, detail="Method not allowed")
        
        return response.json()

@router.get("/summary")
async def get_summary(authorization: Optional[str] = Header(None)):
    """Get bills summary"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/summary", token=token)

@router.get("/billers")
async def get_billers(category: Optional[str] = None):
    """Get available billers"""
    path = "/billers"
    if category:
        path += f"?category={category}"
    return await proxy_request("GET", path)

@router.get("/categories")
async def get_categories():
    """Get bill categories"""
    return await proxy_request("GET", "/categories")

@router.post("/validate")
async def validate_customer(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Validate customer ID with biller"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/validate", data, token)

@router.post("/pay")
async def pay_bill(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Pay a bill"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/pay", data, token)

@router.get("/payments")
async def get_payments(authorization: Optional[str] = Header(None)):
    """Get payment history"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/payments", token=token)

@router.get("/subscriptions")
async def get_subscriptions(authorization: Optional[str] = Header(None)):
    """Get subscriptions"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/subscriptions", token=token)

@router.post("/subscriptions")
async def create_subscription(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create a subscription"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/subscriptions", data, token)

@router.post("/subscriptions/{id}/pause")
async def pause_subscription(id: str, authorization: Optional[str] = Header(None)):
    """Pause a subscription"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/subscriptions/{id}/pause", token=token)

@router.post("/subscriptions/{id}/cancel")
async def cancel_subscription(id: str, authorization: Optional[str] = Header(None)):
    """Cancel a subscription"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/subscriptions/{id}/cancel", token=token)
