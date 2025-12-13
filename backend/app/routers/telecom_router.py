"""API Router for Telecom Service - Proxies to Go telecom-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/telecom", tags=["telecom"])

GO_SERVICE_URL = os.getenv("TELECOM_GO_URL", "http://localhost:8090")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go telecom service"""
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

# Networks
@router.get("/networks")
async def get_networks(country: Optional[str] = None):
    """Get mobile networks"""
    path = "/networks"
    if country:
        path += f"?country={country}"
    return await proxy_request("GET", path)

@router.get("/networks/{id}")
async def get_network(id: str):
    """Get network details"""
    return await proxy_request("GET", f"/networks/{id}")

@router.get("/networks/{id}/data-plans")
async def get_data_plans(id: str):
    """Get data plans for network"""
    return await proxy_request("GET", f"/networks/{id}/data-plans")

# Phone validation
@router.post("/validate-phone")
async def validate_phone(data: Dict[str, Any]):
    """Validate phone number and detect network"""
    return await proxy_request("POST", "/validate-phone", data)

# Airtime
@router.post("/airtime")
async def buy_airtime(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Buy airtime"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/airtime", data, token)

@router.get("/airtime/history")
async def get_airtime_history(authorization: Optional[str] = Header(None)):
    """Get airtime purchase history"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/airtime/history", token=token)

# Data
@router.post("/data")
async def buy_data(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Buy data plan"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/data", data, token)

@router.get("/data/history")
async def get_data_history(authorization: Optional[str] = Header(None)):
    """Get data purchase history"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/data/history", token=token)

# eSIM
@router.get("/esim/plans")
async def get_esim_plans(region: Optional[str] = None):
    """Get eSIM plans"""
    path = "/esim/plans"
    if region:
        path += f"?region={region}"
    return await proxy_request("GET", path)

@router.get("/esim/regions")
async def get_esim_regions():
    """Get eSIM regions"""
    return await proxy_request("GET", "/esim/regions")

@router.post("/esim")
async def buy_esim(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Buy eSIM"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/esim", data, token)

@router.get("/esim/my")
async def get_my_esims(authorization: Optional[str] = Header(None)):
    """Get user's eSIMs"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/esim/my", token=token)

@router.get("/esim/{id}")
async def get_esim(id: str, authorization: Optional[str] = Header(None)):
    """Get eSIM details"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/esim/{id}", token=token)

@router.post("/esim/{id}/activate")
async def activate_esim(id: str, authorization: Optional[str] = Header(None)):
    """Activate eSIM"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/esim/{id}/activate", token=token)

# Beneficiaries
@router.post("/beneficiaries")
async def save_beneficiary(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Save phone number as beneficiary"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/beneficiaries", data, token)

@router.get("/beneficiaries")
async def get_beneficiaries(authorization: Optional[str] = Header(None)):
    """Get saved beneficiaries"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/beneficiaries", token=token)

@router.delete("/beneficiaries/{id}")
async def delete_beneficiary(id: str, authorization: Optional[str] = Header(None)):
    """Delete beneficiary"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("DELETE", f"/beneficiaries/{id}", token=token)
