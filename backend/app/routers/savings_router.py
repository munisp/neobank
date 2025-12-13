"""API Router for Savings Service - Proxies to Go savings-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/savings", tags=["savings"])

GO_SERVICE_URL = os.getenv("SAVINGS_GO_URL", "http://localhost:8083")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go savings service"""
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

# Vaults (Goal-based savings)
@router.post("/vaults")
async def create_vault(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create a savings vault"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/vaults", data, token)

@router.get("/vaults")
async def get_vaults(authorization: Optional[str] = Header(None)):
    """Get user's vaults"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/vaults", token=token)

@router.get("/vaults/{id}")
async def get_vault(id: str, authorization: Optional[str] = Header(None)):
    """Get vault details"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/vaults/{id}", token=token)

@router.post("/vaults/{id}/deposit")
async def deposit_to_vault(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Deposit to vault"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/vaults/{id}/deposit", data, token)

@router.post("/vaults/{id}/withdraw")
async def withdraw_from_vault(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Withdraw from vault"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/vaults/{id}/withdraw", data, token)

# Fixed deposits
@router.get("/fixed-deposits/rates")
async def get_fixed_deposit_rates():
    """Get fixed deposit rates"""
    return await proxy_request("GET", "/fixed-deposits/rates")

@router.post("/fixed-deposits")
async def create_fixed_deposit(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create fixed deposit"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/fixed-deposits", data, token)

@router.get("/fixed-deposits")
async def get_fixed_deposits(authorization: Optional[str] = Header(None)):
    """Get user's fixed deposits"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/fixed-deposits", token=token)

# Group savings (Ajo/Esusu/Stokvel)
@router.post("/groups")
async def create_group(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create savings group"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/groups", data, token)

@router.get("/groups")
async def get_groups(authorization: Optional[str] = Header(None)):
    """Get user's groups"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/groups", token=token)

@router.post("/groups/{id}/contribute")
async def contribute_to_group(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Contribute to group"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/groups/{id}/contribute", data, token)

# Salary advance
@router.get("/salary-advance/eligibility")
async def check_salary_advance_eligibility(authorization: Optional[str] = Header(None)):
    """Check salary advance eligibility"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/salary-advance/eligibility", token=token)

@router.post("/salary-advance")
async def request_salary_advance(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Request salary advance"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/salary-advance", data, token)

@router.get("/salary-advance")
async def get_salary_advances(authorization: Optional[str] = Header(None)):
    """Get salary advance history"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/salary-advance", token=token)
