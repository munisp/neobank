"""API Router for Rewards Service - Proxies to Go rewards-go service"""
from fastapi import APIRouter, HTTPException, Header
from typing import Dict, Any, Optional
import httpx
import os

router = APIRouter(prefix="/rewards", tags=["rewards"])

GO_SERVICE_URL = os.getenv("REWARDS_GO_URL", "http://localhost:8087")

async def proxy_request(method: str, path: str, data: Optional[Dict] = None, token: Optional[str] = None):
    """Proxy request to Go rewards service"""
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

# Programs
@router.get("/programs")
async def get_programs():
    """Get reward programs"""
    return await proxy_request("GET", "/programs")

# User rewards
@router.get("/summary")
async def get_rewards_summary(authorization: Optional[str] = Header(None)):
    """Get user's rewards summary"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/summary", token=token)

@router.post("/earn")
async def earn_reward(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Earn rewards"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/earn", data, token)

@router.get("/history")
async def get_reward_history(authorization: Optional[str] = Header(None)):
    """Get reward history"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/history", token=token)

# Redemption
@router.post("/redeem/points")
async def redeem_points(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Redeem points"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/redeem/points", data, token)

@router.post("/redeem/cashback")
async def redeem_cashback(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Redeem cashback"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/redeem/cashback", data, token)

@router.get("/redemptions")
async def get_redemptions(authorization: Optional[str] = Header(None)):
    """Get redemption history"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/redemptions", token=token)

# Partners
@router.get("/partners")
async def get_partners():
    """Get partner merchants"""
    return await proxy_request("GET", "/partners")

@router.get("/partners/{id}")
async def get_partner(id: str):
    """Get partner details"""
    return await proxy_request("GET", f"/partners/{id}")

# Referrals
@router.get("/referral-code")
async def get_referral_code(authorization: Optional[str] = Header(None)):
    """Get user's referral code"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/referral-code", token=token)

@router.post("/referral/apply")
async def apply_referral(data: Dict[str, Any], authorization: Optional[str] = Header(None)):
    """Apply referral code"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("POST", "/referral/apply", data, token)

@router.get("/referrals")
async def get_referrals(authorization: Optional[str] = Header(None)):
    """Get user's referrals"""
    token = authorization.replace("Bearer ", "") if authorization else None
    return await proxy_request("GET", "/referrals", token=token)

# Tiers
@router.get("/tiers")
async def get_tiers():
    """Get reward tiers"""
    return await proxy_request("GET", "/tiers")
