"""API Router for Accounts Service - Proxies to Go accounts-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/accounts", tags=["accounts"])

GO_SERVICE_URL = os.getenv("ACCOUNTS_GO_URL", "http://localhost:8086")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go accounts service"""
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

# Account management
@router.get("/")
async def get_accounts(authorization: Optional[str] = Header(None)):
    """Get user's accounts"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/accounts", token=token)

@router.get("/{id}")
async def get_account(id: str, authorization: Optional[str] = Header(None)):
    """Get account details"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", f"/accounts/{id}", token=token)

# Joint accounts
@router.post("/joint")
async def create_joint_account(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create joint account"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/joint", data, token)

@router.post("/joint/{id}/invite")
async def invite_to_joint(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Invite to joint account"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/joint/{id}/invite", data, token)

@router.get("/invitations")
async def get_invitations(authorization: Optional[str] = Header(None)):
    """Get pending invitations"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/invitations", token=token)

@router.post("/invitations/{id}/respond")
async def respond_to_invitation(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Respond to invitation"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/invitations/{id}/respond", data, token)

# Kids accounts
@router.post("/kids")
async def create_kids_account(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create kids account"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/kids", data, token)

@router.get("/kids")
async def get_kids_accounts(authorization: Optional[str] = Header(None)):
    """Get kids accounts"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/kids", token=token)

@router.post("/kids/{id}/spending-limit")
async def set_spending_limit(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Set spending limit for kids account"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/kids/{id}/spending-limit", data, token)

@router.post("/kids/{id}/categories")
async def set_category_restrictions(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Set category restrictions"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/kids/{id}/categories", data, token)

@router.post("/kids/{id}/tasks")
async def create_task(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Create task for kids"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/kids/{id}/tasks", data, token)

@router.post("/kids/{id}/tasks/{task_id}/complete")
async def complete_task(id: str, task_id: str, authorization: Optional[str] = Header(None)):
    """Mark task as complete"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/kids/{id}/tasks/{task_id}/complete", token=token)

@router.post("/kids/{id}/transfer")
async def transfer_to_kids(id: str, data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Transfer to kids account"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/kids/{id}/transfer", data, token)

# Account controls
@router.post("/{id}/freeze")
async def freeze_account(id: str, authorization: Optional[str] = Header(None)):
    """Freeze account"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/accounts/{id}/freeze", token=token)

@router.post("/{id}/unfreeze")
async def unfreeze_account(id: str, authorization: Optional[str] = Header(None)):
    """Unfreeze account"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", f"/accounts/{id}/unfreeze", token=token)
