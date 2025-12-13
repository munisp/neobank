"""
Production KYC Router - Proxies to Go KYC/KYB Service for high performance
"""
import os
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
import httpx
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/kyc", tags=["kyc"])

# Go KYC/KYB service URL - configurable via environment
GO_KYC_SERVICE_URL = os.getenv("GO_KYC_SERVICE_URL", "http://localhost:8080")


async def proxy_to_go_service(
    method: str,
    path: str,
    json_data: Optional[Dict] = None,
    files: Optional[Dict] = None,
    headers: Optional[Dict] = None
) -> Dict[str, Any]:
    """Proxy request to Go KYC/KYB service"""
    url = f"{GO_KYC_SERVICE_URL}/api/kyc{path}"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                if files:
                    response = await client.post(url, files=files, headers=headers)
                else:
                    response = await client.post(url, json=json_data, headers=headers)
            elif method == "PUT":
                response = await client.put(url, json=json_data, headers=headers)
            elif method == "DELETE":
                response = await client.delete(url, headers=headers)
            else:
                raise HTTPException(status_code=405, detail="Method not allowed")
            
            if response.status_code >= 400:
                logger.warning(
                    "Go KYC service error",
                    status_code=response.status_code,
                    path=path,
                    response=response.text
                )
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json() if response.text else "Service error"
                )
            
            return response.json()
        
    except httpx.ConnectError:
        logger.error("Failed to connect to Go KYC service", url=url)
        raise HTTPException(
            status_code=503,
            detail="KYC service temporarily unavailable"
        )
    except httpx.TimeoutException:
        logger.error("Go KYC service timeout", url=url)
        raise HTTPException(
            status_code=504,
            detail="KYC service timeout"
        )


@router.post("/initiate")
async def initiate_kyc(request: Request, data: Dict[str, Any]):
    """Initiate a new KYC application"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "/initiate", json_data=data, headers=headers)


@router.get("/applications")
async def get_user_applications(request: Request):
    """Get all KYC applications for the current user"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", "/applications", headers=headers)


@router.get("/applications/{application_id}")
async def get_application(application_id: str, request: Request):
    """Get a specific KYC application"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/applications/{application_id}", headers=headers)


@router.post("/applications/{application_id}/personal-info")
async def submit_personal_info(application_id: str, data: Dict[str, Any], request: Request):
    """Submit personal information for KYC application"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service(
        "POST", f"/applications/{application_id}/personal-info",
        json_data=data, headers=headers
    )


@router.post("/applications/{application_id}/address")
async def submit_address_info(application_id: str, data: Dict[str, Any], request: Request):
    """Submit address information for KYC application"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service(
        "POST", f"/applications/{application_id}/address",
        json_data=data, headers=headers
    )


@router.post("/applications/{application_id}/identity")
async def submit_identity_verification(application_id: str, data: Dict[str, Any], request: Request):
    """Submit identity verification for KYC application"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service(
        "POST", f"/applications/{application_id}/identity",
        json_data=data, headers=headers
    )


@router.post("/applications/{application_id}/documents")
async def upload_document(
    application_id: str,
    request: Request,
    document_type: str = Form(...),
    file: UploadFile = File(...)
):
    """Upload a document for KYC verification"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    file_content = await file.read()
    files = {
        "file": (file.filename, file_content, file.content_type),
        "document_type": (None, document_type)
    }
    url = f"{GO_KYC_SERVICE_URL}/api/kyc/applications/{application_id}/documents"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, files=files, headers=headers)
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json() if response.text else "Upload failed"
                )
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="KYC service unavailable")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Upload timeout")


@router.get("/applications/{application_id}/documents")
async def get_documents(application_id: str, request: Request):
    """Get all documents for a KYC application"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/applications/{application_id}/documents", headers=headers)


@router.post("/applications/{application_id}/biometric")
async def submit_biometric(application_id: str, request: Request, selfie: UploadFile = File(...)):
    """Submit biometric data (selfie) for verification"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    file_content = await selfie.read()
    files = {"selfie": (selfie.filename, file_content, selfie.content_type)}
    url = f"{GO_KYC_SERVICE_URL}/api/kyc/applications/{application_id}/biometric"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, files=files, headers=headers)
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json() if response.text else "Biometric submission failed"
                )
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="KYC service unavailable")


@router.post("/applications/{application_id}/submit")
async def submit_for_review(application_id: str, request: Request):
    """Submit KYC application for review"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", f"/applications/{application_id}/submit", headers=headers)


@router.get("/applications/{application_id}/aml-screening")
async def get_aml_screening(application_id: str, request: Request):
    """Get AML screening results for an application"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/applications/{application_id}/aml-screening", headers=headers)


@router.post("/applications/{application_id}/upgrade")
async def upgrade_tier(application_id: str, data: Dict[str, Any], request: Request):
    """Upgrade KYC tier"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service(
        "POST", f"/applications/{application_id}/upgrade",
        json_data=data, headers=headers
    )


# Legacy endpoints for backward compatibility
@router.post("/")
async def create_kyc_legacy(data: Dict[str, Any], request: Request):
    """Legacy KYC creation endpoint - redirects to initiate"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("POST", "/initiate", json_data=data, headers=headers)


@router.get("/{id}")
async def get_kyc_legacy(id: str, request: Request):
    """Legacy KYC get endpoint"""
    headers = {"Authorization": request.headers.get("Authorization", "")}
    return await proxy_to_go_service("GET", f"/applications/{id}", headers=headers)
