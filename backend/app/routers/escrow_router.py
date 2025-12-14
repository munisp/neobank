"""
Escrow Router - Proxies requests to Go Escrow Service
Next-generation escrow management for P2P, marketplace, real estate, vehicle, and service transactions
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
import httpx
import os

router = APIRouter(prefix="/escrow", tags=["Escrow"])

ESCROW_SERVICE_URL = os.getenv("ESCROW_SERVICE_URL", "http://localhost:8090")


class EscrowType(str, Enum):
    P2P = "p2p"
    MARKETPLACE = "marketplace"
    REAL_ESTATE = "real_estate"
    VEHICLE = "vehicle"
    SERVICE = "service"
    MILESTONE = "milestone"
    M_AND_A = "m_and_a"
    CRYPTO = "crypto"
    FREELANCE = "freelance"
    GENERAL = "general"


class EscrowStatus(str, Enum):
    CREATED = "created"
    PENDING = "pending"
    FUNDED = "funded"
    IN_PROGRESS = "in_progress"
    DELIVERED = "delivered"
    INSPECTION = "inspection"
    APPROVED = "approved"
    DISPUTED = "disputed"
    RESOLVED = "resolved"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    EXPIRED = "expired"


class ItemDetails(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = 1
    unit_price: Optional[float] = None
    condition: Optional[str] = None
    images: Optional[List[str]] = None
    vin: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    mileage: Optional[int] = None
    property_address: Optional[str] = None
    property_type: Optional[str] = None
    title_number: Optional[str] = None
    domain_name: Optional[str] = None


class Address(BaseModel):
    street: str
    city: str
    state: str
    country: str
    postal_code: str


class ShippingDetails(BaseModel):
    method: Optional[str] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    origin_address: Optional[Address] = None
    destination_address: Optional[Address] = None
    shipping_cost: Optional[float] = 0
    shipping_paid_by: Optional[str] = "buyer"


class MilestoneInput(BaseModel):
    title: str
    description: Optional[str] = None
    amount: Optional[float] = None
    percentage: Optional[float] = None
    due_date: Optional[datetime] = None
    deliverables: Optional[List[str]] = None


class CreateEscrowRequest(BaseModel):
    type: EscrowType = EscrowType.GENERAL
    title: str
    description: Optional[str] = None
    buyer_id: str
    seller_id: str
    broker_id: Optional[str] = None
    amount: float = Field(..., gt=0)
    currency: str = "NGN"
    fee_percentage: Optional[float] = 2.5
    fee_paid_by: Optional[str] = "buyer"
    inspection_days: Optional[int] = 3
    auto_release: Optional[bool] = False
    expires_in_days: Optional[int] = None
    item_details: Optional[ItemDetails] = None
    shipping_details: Optional[ShippingDetails] = None
    terms: Optional[str] = None
    special_conditions: Optional[str] = None
    requires_kyc: Optional[bool] = False
    insurance_enabled: Optional[bool] = False
    milestones: Optional[List[MilestoneInput]] = None


class FundEscrowRequest(BaseModel):
    amount: float
    user_id: str


class DeliverRequest(BaseModel):
    user_id: str
    tracking_number: Optional[str] = None


class UserActionRequest(BaseModel):
    user_id: str


class RefundRequest(BaseModel):
    user_id: str
    reason: str


class DisputeRequest(BaseModel):
    user_id: str
    reason: str
    description: Optional[str] = None


class EvidenceRequest(BaseModel):
    user_id: str
    type: str
    title: str
    description: Optional[str] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None


class ResolveDisputeRequest(BaseModel):
    arbitrator_id: str
    resolution: str
    notes: Optional[str] = None
    buyer_amount: float
    seller_amount: float


class CompleteMilestoneRequest(BaseModel):
    user_id: str
    evidence: Optional[List[str]] = None


async def proxy_to_escrow_service(method: str, path: str, data: dict = None):
    """Proxy request to Go escrow service"""
    url = f"{ESCROW_SERVICE_URL}/api/v1{path}"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                response = await client.get(url, params=data)
            elif method == "POST":
                response = await client.post(url, json=data)
            elif method == "PUT":
                response = await client.put(url, json=data)
            elif method == "DELETE":
                response = await client.delete(url)
            else:
                raise HTTPException(status_code=405, detail="Method not allowed")
            
            if response.status_code >= 400:
                error_detail = response.json().get("error", "Unknown error")
                raise HTTPException(status_code=response.status_code, detail=error_detail)
            
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Escrow service unavailable")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Escrow service timeout")


@router.post("/")
async def create_escrow(request: CreateEscrowRequest):
    """Create a new escrow transaction"""
    return await proxy_to_escrow_service("POST", "/escrows", request.dict())


@router.get("/")
async def list_escrows(
    user_id: str,
    role: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
):
    """List escrows for a user"""
    params = {
        "user_id": user_id,
        "role": role,
        "status": status,
        "type": type,
        "page": page,
        "page_size": page_size
    }
    params = {k: v for k, v in params.items() if v is not None}
    return await proxy_to_escrow_service("GET", "/escrows", params)


@router.get("/stats")
async def get_escrow_stats(user_id: Optional[str] = None):
    """Get escrow statistics"""
    params = {"user_id": user_id} if user_id else {}
    return await proxy_to_escrow_service("GET", "/escrows/stats", params)


@router.get("/templates")
async def get_escrow_templates():
    """Get available escrow templates"""
    return await proxy_to_escrow_service("GET", "/escrows/templates", {})


@router.get("/{escrow_id}")
async def get_escrow(escrow_id: str):
    """Get escrow details by ID"""
    return await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}", {})


@router.get("/reference/{reference}")
async def get_escrow_by_reference(reference: str):
    """Get escrow by reference number"""
    return await proxy_to_escrow_service("GET", f"/escrows/reference/{reference}", {})


@router.post("/{escrow_id}/fund")
async def fund_escrow(escrow_id: str, request: FundEscrowRequest):
    """Fund an escrow transaction"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/fund", request.dict())


@router.post("/{escrow_id}/deliver")
async def mark_delivered(escrow_id: str, request: DeliverRequest):
    """Mark escrow item/service as delivered"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/deliver", request.dict())


@router.post("/{escrow_id}/inspect")
async def start_inspection(escrow_id: str, request: UserActionRequest):
    """Start inspection period"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/inspect", request.dict())


@router.post("/{escrow_id}/approve")
async def approve_release(escrow_id: str, request: UserActionRequest):
    """Approve fund release to seller"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/approve", request.dict())


@router.post("/{escrow_id}/release")
async def release_funds(escrow_id: str, request: UserActionRequest):
    """Release funds to seller"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/release", request.dict())


@router.post("/{escrow_id}/refund")
async def request_refund(escrow_id: str, request: RefundRequest):
    """Request a refund"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/refund", request.dict())


@router.post("/{escrow_id}/cancel")
async def cancel_escrow(escrow_id: str, request: RefundRequest):
    """Cancel an unfunded escrow"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/cancel", request.dict())


@router.post("/{escrow_id}/dispute")
async def initiate_dispute(escrow_id: str, request: DisputeRequest):
    """Initiate a dispute"""
    return await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/dispute", request.dict())


@router.get("/{escrow_id}/dispute")
async def get_escrow_dispute(escrow_id: str):
    """Get active dispute for an escrow"""
    return await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}/dispute", {})


@router.get("/{escrow_id}/milestones")
async def get_milestones(escrow_id: str):
    """Get milestones for an escrow"""
    return await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}/milestones", {})


@router.post("/{escrow_id}/milestones/{milestone_id}/complete")
async def complete_milestone(escrow_id: str, milestone_id: str, request: CompleteMilestoneRequest):
    """Mark a milestone as complete"""
    return await proxy_to_escrow_service(
        "POST", 
        f"/escrows/{escrow_id}/milestones/{milestone_id}/complete", 
        request.dict()
    )


@router.post("/{escrow_id}/milestones/{milestone_id}/approve")
async def approve_milestone(escrow_id: str, milestone_id: str, request: UserActionRequest):
    """Approve a milestone and release funds"""
    return await proxy_to_escrow_service(
        "POST", 
        f"/escrows/{escrow_id}/milestones/{milestone_id}/approve", 
        request.dict()
    )


@router.get("/{escrow_id}/events")
async def get_escrow_events(escrow_id: str):
    """Get audit trail for an escrow"""
    return await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}/events", {})


@router.get("/disputes/{dispute_id}")
async def get_dispute(dispute_id: str):
    """Get dispute details"""
    return await proxy_to_escrow_service("GET", f"/disputes/{dispute_id}", {})


@router.post("/disputes/{dispute_id}/evidence")
async def submit_evidence(dispute_id: str, request: EvidenceRequest):
    """Submit evidence for a dispute"""
    return await proxy_to_escrow_service("POST", f"/disputes/{dispute_id}/evidence", request.dict())


@router.get("/disputes/{dispute_id}/evidence")
async def get_dispute_evidence(dispute_id: str):
    """Get all evidence for a dispute"""
    return await proxy_to_escrow_service("GET", f"/disputes/{dispute_id}/evidence", {})


@router.post("/disputes/{dispute_id}/resolve")
async def resolve_dispute(dispute_id: str, request: ResolveDisputeRequest):
    """Resolve a dispute (arbitrator only)"""
    return await proxy_to_escrow_service("POST", f"/disputes/{dispute_id}/resolve", request.dict())
