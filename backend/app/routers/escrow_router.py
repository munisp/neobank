"""
Escrow Router - Proxies requests to Go Escrow Service with Account Integration
Next-generation escrow management for P2P, marketplace, real estate, vehicle, and service transactions

This router integrates with:
- Go Escrow Service (escrow lifecycle management)
- Escrow Account Service (TigerBeetle ledger for fund movements)
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from decimal import Decimal
from enum import Enum
import httpx
import os
import structlog

from app.services.escrow_account_service import escrow_account_service

logger = structlog.get_logger()

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
    buyer_account_id: str  # Bank account to debit


class DeliverRequest(BaseModel):
    user_id: str
    tracking_number: Optional[str] = None


class UserActionRequest(BaseModel):
    user_id: str
    seller_account_id: Optional[str] = None  # For release operations


class RefundRequest(BaseModel):
    user_id: str
    reason: str
    buyer_account_id: Optional[str] = None  # For refund operations


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
async def fund_escrow(escrow_id: str, request: FundEscrowRequest, background_tasks: BackgroundTasks):
    """
    Fund an escrow transaction.
    
    This endpoint:
    1. Verifies buyer has sufficient balance
    2. Creates escrow holding account in TigerBeetle
    3. Debits buyer's bank account
    4. Credits escrow holding account
    5. Updates escrow status in Go service
    """
    # First, get escrow details to know the fee structure
    escrow_data = await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}", {})
    
    amount = Decimal(str(request.amount))
    fee_amount = Decimal(str(escrow_data.get("fee_amount", 0)))
    insurance_premium = Decimal(str(escrow_data.get("insurance_premium", 0)))
    currency = escrow_data.get("currency", "NGN")
    
    # Verify buyer has sufficient balance
    balance_check = await escrow_account_service.verify_buyer_balance(
        buyer_account_id=request.buyer_account_id,
        required_amount=amount + fee_amount + insurance_premium
    )
    
    if not balance_check.get("has_sufficient_balance"):
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Required: {balance_check.get('required_amount')}, "
                   f"Available: {balance_check.get('available_balance')}, "
                   f"Shortfall: {balance_check.get('shortfall')}"
        )
    
    # Create escrow holding account
    holding_account = await escrow_account_service.create_escrow_holding_account(
        escrow_id=escrow_id,
        buyer_id=str(escrow_data.get("buyer_id")),
        seller_id=str(escrow_data.get("seller_id")),
        amount=amount,
        currency=currency
    )
    
    # Fund the escrow (debit buyer, credit escrow holding)
    fund_result = await escrow_account_service.fund_escrow(
        escrow_id=escrow_id,
        buyer_account_id=request.buyer_account_id,
        amount=amount,
        fee_amount=fee_amount if escrow_data.get("fee_paid_by") == "buyer" else Decimal("0"),
        insurance_premium=insurance_premium,
        currency=currency
    )
    
    logger.info(
        "Escrow funded via account service",
        escrow_id=escrow_id,
        transaction_id=fund_result.get("transaction_id"),
        amount=str(amount)
    )
    
    # Update escrow status in Go service
    go_result = await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/fund", {
        "amount": float(amount),
        "user_id": request.user_id
    })
    
    # Return combined result
    return {
        **go_result,
        "account_transaction": fund_result,
        "holding_account": holding_account
    }


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
    """
    Release funds to seller.
    
    This endpoint:
    1. Gets escrow details including amounts
    2. Debits escrow holding account
    3. Credits seller's bank account (minus fees if seller pays)
    4. Updates escrow status in Go service
    """
    # Get escrow details
    escrow_data = await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}", {})
    
    if escrow_data.get("status") not in ["approved", "funded", "delivered", "inspection"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot release funds in current status: {escrow_data.get('status')}"
        )
    
    amount = Decimal(str(escrow_data.get("amount", 0)))
    fee_amount = Decimal(str(escrow_data.get("fee_amount", 0)))
    currency = escrow_data.get("currency", "NGN")
    
    # Determine fee deduction (if seller pays)
    fee_deduction = fee_amount if escrow_data.get("fee_paid_by") == "seller" else Decimal("0")
    
    # Get seller account ID from request or escrow data
    seller_account_id = request.seller_account_id or f"ACCOUNT_{escrow_data.get('seller_id')}"
    
    # Release funds to seller
    release_result = await escrow_account_service.release_funds_to_seller(
        escrow_id=escrow_id,
        seller_account_id=seller_account_id,
        amount=amount,
        fee_deduction=fee_deduction,
        currency=currency
    )
    
    logger.info(
        "Escrow funds released to seller",
        escrow_id=escrow_id,
        transaction_id=release_result.get("transaction_id"),
        net_amount=release_result.get("net_amount")
    )
    
    # Update escrow status in Go service
    go_result = await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/release", {
        "user_id": request.user_id
    })
    
    return {
        **go_result,
        "account_transaction": release_result
    }


@router.post("/{escrow_id}/refund")
async def request_refund(escrow_id: str, request: RefundRequest):
    """
    Request a refund.
    
    This endpoint:
    1. Gets escrow details
    2. Debits escrow holding account
    3. Credits buyer's bank account
    4. Optionally refunds platform fee
    5. Updates escrow status in Go service
    """
    # Get escrow details
    escrow_data = await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}", {})
    
    amount = Decimal(str(escrow_data.get("funded_amount", escrow_data.get("amount", 0))))
    fee_amount = Decimal(str(escrow_data.get("fee_amount", 0)))
    currency = escrow_data.get("currency", "NGN")
    
    # Get buyer account ID from request or escrow data
    buyer_account_id = request.buyer_account_id or f"ACCOUNT_{escrow_data.get('buyer_id')}"
    
    # Refund to buyer (including fee if buyer paid it)
    refund_fee = escrow_data.get("fee_paid_by") == "buyer"
    
    refund_result = await escrow_account_service.refund_to_buyer(
        escrow_id=escrow_id,
        buyer_account_id=buyer_account_id,
        amount=amount,
        refund_fee=refund_fee,
        fee_amount=fee_amount if refund_fee else Decimal("0"),
        currency=currency
    )
    
    logger.info(
        "Escrow refunded to buyer",
        escrow_id=escrow_id,
        transaction_id=refund_result.get("transaction_id"),
        total_refund=refund_result.get("total_refund")
    )
    
    # Update escrow status in Go service
    go_result = await proxy_to_escrow_service("POST", f"/escrows/{escrow_id}/refund", {
        "user_id": request.user_id,
        "reason": request.reason
    })
    
    return {
        **go_result,
        "account_transaction": refund_result
    }


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
    """
    Approve a milestone and release partial funds.
    
    This endpoint:
    1. Gets milestone details including amount
    2. Releases milestone amount from escrow to seller
    3. Updates milestone status in Go service
    """
    # Get escrow and milestone details
    escrow_data = await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}", {})
    milestones = await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}/milestones", {})
    
    # Find the specific milestone
    milestone = next((m for m in milestones if str(m.get("id")) == milestone_id), None)
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    milestone_amount = Decimal(str(milestone.get("amount", 0)))
    currency = escrow_data.get("currency", "NGN")
    fee_percentage = Decimal(str(escrow_data.get("fee_percentage", 2.5)))
    
    # Get seller account ID
    seller_account_id = request.seller_account_id or f"ACCOUNT_{escrow_data.get('seller_id')}"
    
    # Release milestone payment
    release_result = await escrow_account_service.release_milestone_payment(
        escrow_id=escrow_id,
        milestone_id=milestone_id,
        seller_account_id=seller_account_id,
        amount=milestone_amount,
        fee_percentage=fee_percentage,
        currency=currency
    )
    
    logger.info(
        "Milestone payment released",
        escrow_id=escrow_id,
        milestone_id=milestone_id,
        amount=str(milestone_amount),
        transaction_id=release_result.get("transaction_id")
    )
    
    # Update milestone status in Go service
    go_result = await proxy_to_escrow_service(
        "POST", 
        f"/escrows/{escrow_id}/milestones/{milestone_id}/approve", 
        {"user_id": request.user_id}
    )
    
    return {
        **go_result,
        "account_transaction": release_result
    }


@router.get("/{escrow_id}/events")
async def get_escrow_events(escrow_id: str):
    """Get audit trail for an escrow"""
    return await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}/events", {})


@router.get("/{escrow_id}/balance")
async def get_escrow_balance(escrow_id: str):
    """
    Get the current balance of an escrow holding account.
    
    Returns the balance from TigerBeetle ledger.
    """
    balance = await escrow_account_service.get_escrow_balance(escrow_id)
    return balance


@router.get("/{escrow_id}/transactions")
async def get_escrow_transactions(escrow_id: str, limit: int = 50):
    """
    Get transaction history for an escrow account.
    
    Returns all ledger transactions (fund, release, refund, etc.)
    """
    transactions = await escrow_account_service.get_escrow_transactions(escrow_id, limit)
    return {"escrow_id": escrow_id, "transactions": transactions}


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
    """
    Resolve a dispute (arbitrator only).
    
    This endpoint:
    1. Gets dispute and escrow details
    2. Distributes funds according to resolution (buyer_amount, seller_amount)
    3. Updates dispute status in Go service
    """
    # Get dispute details to find escrow
    dispute_data = await proxy_to_escrow_service("GET", f"/disputes/{dispute_id}", {})
    escrow_id = dispute_data.get("escrow_id")
    
    # Get escrow details
    escrow_data = await proxy_to_escrow_service("GET", f"/escrows/{escrow_id}", {})
    
    buyer_amount = Decimal(str(request.buyer_amount))
    seller_amount = Decimal(str(request.seller_amount))
    currency = escrow_data.get("currency", "NGN")
    
    # Get account IDs
    buyer_account_id = f"ACCOUNT_{escrow_data.get('buyer_id')}"
    seller_account_id = f"ACCOUNT_{escrow_data.get('seller_id')}"
    
    # Resolve dispute by distributing funds
    resolve_result = await escrow_account_service.resolve_dispute(
        escrow_id=escrow_id,
        dispute_id=dispute_id,
        buyer_account_id=buyer_account_id,
        seller_account_id=seller_account_id,
        buyer_amount=buyer_amount,
        seller_amount=seller_amount,
        currency=currency
    )
    
    logger.info(
        "Dispute resolved with fund distribution",
        dispute_id=dispute_id,
        escrow_id=escrow_id,
        buyer_amount=str(buyer_amount),
        seller_amount=str(seller_amount),
        transaction_id=resolve_result.get("transaction_id")
    )
    
    # Update dispute status in Go service
    go_result = await proxy_to_escrow_service("POST", f"/disputes/{dispute_id}/resolve", request.dict())
    
    return {
        **go_result,
        "account_transaction": resolve_result
    }
