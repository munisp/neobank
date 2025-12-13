"""API Router for Insurance Service - Proxies to Go insurance-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/insurance", tags=["insurance"])

GO_SERVICE_URL = os.getenv("INSURANCE_GO_URL", "http://localhost:8084")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go insurance service"""
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
        else:
            raise HTTPException(status_code=405, detail="Method not allowed")
        
        return response.json()

# Products
@router.get("/products")
async def get_products(product_type: Optional[str] = None):
    """Get insurance products"""
    path = "/products"
    if product_type:
        path += f"?type={product_type}"
    return await proxy_request("GET", path)

@router.get("/products/{id}")
async def get_product(id: str):
    """Get product details"""
    return await proxy_request("GET", f"/products/{id}")

# Quotes
@router.post("/quotes")
async def get_quote(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Get insurance quote"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/quotes", data, token)

# Policies
@router.post("/policies")
async def purchase_policy(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Purchase insurance policy"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/policies", data, token)

@router.get("/policies")
async def get_policies(authorization: Optional[str] = Header(None)):
    """Get user's policies"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/policies", token=token)

@router.get("/policies/{id}")
async def get_policy(id: str, authorization: Optional[str] = Header(None)):
    """Get policy details"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/policies/{id}", token=token)

@router.post("/policies/{id}/cancel")
async def cancel_policy(id: str, authorization: Optional[str] = Header(None)):
    """Cancel policy"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/policies/{id}/cancel", token=token)

# Claims
@router.post("/claims")
async def file_claim(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """File insurance claim"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/claims", data, token)

@router.get("/claims")
async def get_claims(authorization: Optional[str] = Header(None)):
    """Get user's claims"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/claims", token=token)

@router.get("/claims/{id}")
async def get_claim(id: str, authorization: Optional[str] = Header(None)):
    """Get claim details"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/claims/{id}", token=token)
