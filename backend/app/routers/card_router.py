"""
Production Card Router - Proxies to Go Banking Service for high performance
"""
import os
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Request
import httpx
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/cards", tags=["cards"])

GO_BANKING_SERVICE_URL = os.getenv("GO_BANKING_SERVICE_URL", "http://localhost:8081")


async def proxy_to_go_service(
    method: str,
    path: str,
    json_data: Optional[Dict] = None,
    headers: Optional[Dict] = None
) -> Dict[str, Any]:
    """Proxy request to Go Banking service"""
    url = f"{GO_BANKING_SERVICE_URL}/api/cards{path}"
    
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
        raise HTTPException(status_code=503, detail="Card service temporarily unavailable")
    except httpx.TimeoutException:
        logger.error("Go Banking service timeout", url=url)
        raise HTTPException(status_code=504, detail="Card service timeout")


@router.post("")
async def create_card(request: Request, data: Dict[str, Any]):
    """Create a new card"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "", json_data=data, headers=headers)


@router.get("")
async def get_user_cards(request: Request):
    """Get all cards for the current user"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", "", headers=headers)


@router.get("/{card_id}")
async def get_card(card_id: str, request: Request):
    """Get a specific card"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/{card_id}", headers=headers)


@router.post("/{card_id}/activate")
async def activate_card(card_id: str, request: Request):
    """Activate a card"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{card_id}/activate", headers=headers)


@router.post("/{card_id}/freeze")
async def freeze_card(card_id: str, request: Request):
    """Freeze a card"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{card_id}/freeze", headers=headers)


@router.post("/{card_id}/unfreeze")
async def unfreeze_card(card_id: str, request: Request):
    """Unfreeze a card"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{card_id}/unfreeze", headers=headers)


@router.post("/{card_id}/block")
async def block_card(card_id: str, request: Request):
    """Block a card permanently"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{card_id}/block", headers=headers)


@router.put("/{card_id}/limits")
async def update_card_limits(card_id: str, data: Dict[str, Any], request: Request):
    """Update card spending limits"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("PUT", f"/{card_id}/limits", json_data=data, headers=headers)


@router.put("/{card_id}/controls")
async def update_card_controls(card_id: str, data: Dict[str, Any], request: Request):
    """Update card controls"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("PUT", f"/{card_id}/controls", json_data=data, headers=headers)


@router.post("/{card_id}/pin")
async def set_pin(card_id: str, data: Dict[str, Any], request: Request):
    """Set or change card PIN"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/{card_id}/pin", json_data=data, headers=headers)


@router.get("/{card_id}/transactions")
async def get_card_transactions(card_id: str, request: Request):
    """Get transactions for a card"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/{card_id}/transactions", headers=headers)


# Legacy endpoint for backward compatibility
@router.post("/")
async def create_card_legacy(data: Dict[str, Any], request: Request):
    """Legacy card creation"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "", json_data=data, headers=headers)
