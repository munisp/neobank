"""API Router for Analytics Service - Proxies to Go analytics-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/analytics", tags=["analytics"])

GO_SERVICE_URL = os.getenv("ANALYTICS_GO_URL", "http://localhost:8088")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go analytics service"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{GO_SERVICE_URL}/api{path}"
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, json=data, headers=headers)
        elif method == "PUT":
            response = await client.put(url, json=data, headers=headers)
        elif method == "DELETE":
            response = await client.delete(url, headers=headers)
        else:
            raise HTTPException(status_code=405, detail="Method not allowed")
        
        return response.json()

@router.get("/summary")
async def get_summary(authorization: Optional[str] = Header(None)):
    """Get financial summary"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/summary", token=token)

@router.get("/spending")
async def get_spending(period: str = "monthly", authorization: Optional[str] = Header(None)):
    """Get spending analytics"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/spending?period={period}", token=token)

@router.get("/spending/category/{category}")
async def get_category_spending(category: str, authorization: Optional[str] = Header(None)):
    """Get spending for a specific category"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/spending/category/{category}", token=token)

@router.post("/budgets")
async def create_budget(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create a budget"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/budgets", data, token)

@router.get("/budgets")
async def get_budgets(authorization: Optional[str] = Header(None)):
    """Get user's budgets"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/budgets", token=token)

@router.put("/budgets/{id}")
async def update_budget(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Update a budget"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("PUT", f"/budgets/{id}", data, token)

@router.delete("/budgets/{id}")
async def delete_budget(id: str, authorization: Optional[str] = Header(None)):
    """Delete a budget"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("DELETE", f"/budgets/{id}", token=token)

@router.get("/alerts")
async def get_alerts(authorization: Optional[str] = Header(None)):
    """Get budget alerts"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/alerts", token=token)

@router.get("/insights")
async def get_insights(authorization: Optional[str] = Header(None)):
    """Get financial insights"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/insights", token=token)

@router.get("/recurring")
async def get_recurring(authorization: Optional[str] = Header(None)):
    """Get detected recurring transactions"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/recurring", token=token)
