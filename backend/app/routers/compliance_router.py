"""
Production Compliance Router - Proxies to Go Banking Service for high performance
"""
import os
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Request
import httpx
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/compliance", tags=["compliance"])

GO_BANKING_SERVICE_URL = os.getenv("GO_BANKING_SERVICE_URL", "http://localhost:8081")


async def proxy_to_go_service(
    method: str,
    path: str,
    json_data: Optional[Dict] = None,
    headers: Optional[Dict] = None
) -> Dict[str, Any]:
    """Proxy request to Go Banking service"""
    url = f"{GO_BANKING_SERVICE_URL}/api/compliance{path}"
    
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
        raise HTTPException(status_code=503, detail="Compliance service temporarily unavailable")
    except httpx.TimeoutException:
        logger.error("Go Banking service timeout", url=url)
        raise HTTPException(status_code=504, detail="Compliance service timeout")


@router.post("/check")
async def run_compliance_check(request: Request, data: Dict[str, Any]):
    """Run compliance checks for a user"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "/check", json_data=data, headers=headers)


@router.get("/checks/{check_id}")
async def get_compliance_check(check_id: str, request: Request):
    """Get a specific compliance check"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/checks/{check_id}", headers=headers)


@router.get("/users/{user_id}/checks")
async def get_user_compliance_checks(user_id: str, request: Request):
    """Get all compliance checks for a user"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/users/{user_id}/checks", headers=headers)


@router.get("/users/{user_id}/summary")
async def get_compliance_summary(user_id: str, request: Request):
    """Get compliance summary for a user"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/users/{user_id}/summary", headers=headers)


@router.get("/alerts")
async def get_alerts(request: Request):
    """Get compliance alerts"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", "/alerts", headers=headers)


@router.get("/alerts/{alert_id}")
async def get_alert(alert_id: str, request: Request):
    """Get a specific alert"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/alerts/{alert_id}", headers=headers)


@router.put("/alerts/{alert_id}/review")
async def review_alert(alert_id: str, data: Dict[str, Any], request: Request):
    """Review and update an alert"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("PUT", f"/alerts/{alert_id}/review", json_data=data, headers=headers)


# Legacy endpoints for backward compatibility
@router.post("/")
async def create_compliance_legacy(data: Dict[str, Any], request: Request):
    """Legacy compliance check - redirects to check"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "/check", json_data=data, headers=headers)


@router.get("/{id}")
async def get_compliance_legacy(id: str, request: Request):
    """Legacy compliance get"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/checks/{id}", headers=headers)
