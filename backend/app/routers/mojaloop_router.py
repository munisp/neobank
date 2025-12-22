"""
Mojaloop FSPIOP API Router

Exposes endpoints for Mojaloop interoperability:
- Party lookup (GET /parties/{type}/{id})
- Quote requests (POST /quotes, PUT /quotes/{id})
- Transfer requests (POST /transfers, PUT /transfers/{id})
- Callbacks from Mojaloop hub
"""

from fastapi import APIRouter, HTTPException, Header, Request, BackgroundTasks
from typing import Optional, Dict, Any
from pydantic import BaseModel
from decimal import Decimal
import structlog

from app.services.mojaloop_dfsp_service import (
    mojaloop_service,
    PartyIdType,
    AmountType,
    Party,
    Money,
    MojaloopConfig
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/mojaloop", tags=["Mojaloop Interoperability"])


# ==================== Request/Response Models ====================

class PartyLookupResponse(BaseModel):
    party_id_type: str
    party_id: str
    fsp_id: Optional[str] = None
    name: Optional[str] = None


class QuoteRequest(BaseModel):
    payer_id_type: str
    payer_id: str
    payee_id_type: str
    payee_id: str
    payee_fsp_id: str
    amount: str
    currency: str
    amount_type: str = "SEND"


class QuoteResponse(BaseModel):
    quote_id: str
    transaction_id: str
    transfer_amount: str
    currency: str
    fees: str
    expiration: str
    condition: str


class TransferRequest(BaseModel):
    quote_id: str
    payer_account_id: str


class TransferResponse(BaseModel):
    transfer_id: str
    state: str
    amount: str
    currency: str


class TransferStatusResponse(BaseModel):
    transfer_id: str
    state: str
    completed_timestamp: Optional[str] = None


# ==================== Outbound API (NeoBank initiating) ====================

@router.get("/parties/{party_id_type}/{party_id}", response_model=PartyLookupResponse)
async def lookup_party(
    party_id_type: str,
    party_id: str
):
    """
    Look up a party in the Mojaloop network.
    
    This identifies the recipient and their DFSP before initiating a transfer.
    """
    try:
        id_type = PartyIdType(party_id_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid party ID type: {party_id_type}")
    
    party = await mojaloop_service.lookup_party(id_type, party_id)
    
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    return PartyLookupResponse(
        party_id_type=party.party_id_type.value,
        party_id=party.party_id,
        fsp_id=party.fsp_id,
        name=party.name
    )


@router.post("/quotes", response_model=QuoteResponse)
async def request_quote(request: QuoteRequest):
    """
    Request a quote for a transfer.
    
    Gets fees and FX rate for the transfer.
    """
    try:
        payer_id_type = PartyIdType(request.payer_id_type)
        payee_id_type = PartyIdType(request.payee_id_type)
        amount_type = AmountType(request.amount_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    payer = Party(
        party_id_type=payer_id_type,
        party_id=request.payer_id,
        fsp_id=MojaloopConfig.DFSP_ID
    )
    
    payee = Party(
        party_id_type=payee_id_type,
        party_id=request.payee_id,
        fsp_id=request.payee_fsp_id
    )
    
    amount = Money(
        currency=request.currency,
        amount=request.amount
    )
    
    quote = await mojaloop_service.request_quote(payer, payee, amount, amount_type)
    
    if not quote:
        raise HTTPException(status_code=500, detail="Failed to get quote")
    
    return QuoteResponse(
        quote_id=quote.quote_id,
        transaction_id=quote.transaction_id,
        transfer_amount=quote.transfer_amount.amount if quote.transfer_amount else quote.amount.amount,
        currency=quote.amount.currency,
        fees=quote.fees.amount if quote.fees else "0",
        expiration=quote.expiration or "",
        condition=quote.condition or ""
    )


@router.post("/transfers", response_model=TransferResponse)
async def initiate_transfer(request: TransferRequest):
    """
    Initiate a transfer based on an accepted quote.
    
    Reserves funds and sends transfer to Mojaloop hub.
    """
    quote = mojaloop_service._quotes.get(request.quote_id)
    
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    transfer = await mojaloop_service.initiate_transfer(quote, request.payer_account_id)
    
    if not transfer:
        raise HTTPException(status_code=500, detail="Failed to initiate transfer")
    
    return TransferResponse(
        transfer_id=transfer.transfer_id,
        state=transfer.state.value,
        amount=transfer.amount.amount,
        currency=transfer.amount.currency
    )


@router.get("/transfers/{transfer_id}", response_model=TransferStatusResponse)
async def get_transfer_status(transfer_id: str):
    """Get the status of a transfer."""
    transfer = mojaloop_service._transfers.get(transfer_id)
    
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    
    return TransferStatusResponse(
        transfer_id=transfer.transfer_id,
        state=transfer.state.value,
        completed_timestamp=transfer.completed_timestamp
    )


# ==================== Inbound Callbacks (Mojaloop hub calling us) ====================

@router.get("/callbacks/parties/{party_id_type}/{party_id}")
async def handle_party_lookup_callback(
    party_id_type: str,
    party_id: str,
    fspiop_source: Optional[str] = Header(None, alias="FSPIOP-Source")
):
    """
    Handle incoming party lookup request from another DFSP.
    
    Returns party info if the account exists in our system.
    """
    logger.info(
        "Party lookup callback received",
        party_id_type=party_id_type,
        party_id=party_id,
        source=fspiop_source
    )
    
    try:
        id_type = PartyIdType(party_id_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid party ID type: {party_id_type}")
    
    party = await mojaloop_service.handle_party_lookup_callback(id_type, party_id)
    
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    return party.to_dict()


@router.post("/callbacks/quotes")
async def handle_quote_request_callback(
    request: Request,
    background_tasks: BackgroundTasks,
    fspiop_source: Optional[str] = Header(None, alias="FSPIOP-Source"),
    fspiop_destination: Optional[str] = Header(None, alias="FSPIOP-Destination")
):
    """
    Handle incoming quote request from another DFSP.
    
    Calculate fees and return quote response.
    """
    body = await request.json()
    
    logger.info(
        "Quote request callback received",
        quote_id=body.get("quoteId"),
        source=fspiop_source
    )
    
    response = await mojaloop_service.handle_quote_request(body)
    
    if not response:
        raise HTTPException(status_code=500, detail="Failed to process quote")
    
    return response


@router.put("/callbacks/quotes/{quote_id}")
async def handle_quote_response_callback(
    quote_id: str,
    request: Request,
    fspiop_source: Optional[str] = Header(None, alias="FSPIOP-Source")
):
    """
    Handle quote response callback from payee DFSP.
    
    Updates the quote with fees and transfer amount.
    """
    body = await request.json()
    
    logger.info(
        "Quote response callback received",
        quote_id=quote_id,
        source=fspiop_source
    )
    
    quote = mojaloop_service._quotes.get(quote_id)
    if quote:
        if "transferAmount" in body:
            quote.transfer_amount = Money(
                currency=body["transferAmount"]["currency"],
                amount=body["transferAmount"]["amount"]
            )
        if "payeeFspFee" in body:
            quote.fees = Money(
                currency=body["payeeFspFee"]["currency"],
                amount=body["payeeFspFee"]["amount"]
            )
        if "ilpPacket" in body:
            quote.ilp_packet = body["ilpPacket"]
        if "condition" in body:
            quote.condition = body["condition"]
        if "expiration" in body:
            quote.expiration = body["expiration"]
    
    return {"status": "ok"}


@router.post("/callbacks/transfers")
async def handle_transfer_request_callback(
    request: Request,
    fspiop_source: Optional[str] = Header(None, alias="FSPIOP-Source"),
    fspiop_destination: Optional[str] = Header(None, alias="FSPIOP-Destination")
):
    """
    Handle incoming transfer request from another DFSP.
    
    Verify and credit the payee's account.
    """
    body = await request.json()
    
    logger.info(
        "Transfer request callback received",
        transfer_id=body.get("transferId"),
        source=fspiop_source
    )
    
    response = await mojaloop_service.handle_transfer_request(body)
    
    if not response:
        raise HTTPException(status_code=500, detail="Failed to process transfer")
    
    return response


@router.put("/callbacks/transfers/{transfer_id}")
async def handle_transfer_fulfilment_callback(
    transfer_id: str,
    request: Request,
    fspiop_source: Optional[str] = Header(None, alias="FSPIOP-Source")
):
    """
    Handle transfer fulfilment callback.
    
    Verify fulfilment and commit the pending transfer.
    """
    body = await request.json()
    
    logger.info(
        "Transfer fulfilment callback received",
        transfer_id=transfer_id,
        state=body.get("transferState"),
        source=fspiop_source
    )
    
    fulfilment = body.get("fulfilment")
    
    if fulfilment:
        success = await mojaloop_service.handle_transfer_fulfilment(transfer_id, fulfilment)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to process fulfilment")
    
    return {"status": "ok"}


@router.put("/callbacks/transfers/{transfer_id}/error")
async def handle_transfer_error_callback(
    transfer_id: str,
    request: Request,
    fspiop_source: Optional[str] = Header(None, alias="FSPIOP-Source")
):
    """
    Handle transfer error callback.
    
    Void the pending transfer and release reserved funds.
    """
    body = await request.json()
    
    logger.info(
        "Transfer error callback received",
        transfer_id=transfer_id,
        error=body,
        source=fspiop_source
    )
    
    success = await mojaloop_service.handle_transfer_error(transfer_id, body)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to process error")
    
    return {"status": "ok"}


# ==================== Settlement ====================

@router.post("/callbacks/settlements/{settlement_id}")
async def handle_settlement_callback(
    settlement_id: str,
    request: Request
):
    """
    Handle settlement callback from Mojaloop hub.
    
    Reconcile position account with actual settlements.
    """
    body = await request.json()
    
    logger.info(
        "Settlement callback received",
        settlement_id=settlement_id
    )
    
    settlements = body.get("settlements", [])
    success = await mojaloop_service.process_settlement(settlement_id, settlements)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to process settlement")
    
    return {"status": "ok"}


# ==================== Admin ====================

@router.post("/admin/setup")
async def setup_mojaloop_accounts():
    """
    Set up TigerBeetle accounts for Mojaloop integration.
    
    Creates position and settlement accounts.
    """
    success = await mojaloop_service.setup_mojaloop_accounts()
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to setup accounts")
    
    return {
        "status": "ok",
        "dfsp_id": MojaloopConfig.DFSP_ID,
        "message": "Mojaloop accounts created successfully"
    }


@router.get("/admin/status")
async def get_mojaloop_status():
    """Get Mojaloop integration status."""
    return {
        "dfsp_id": MojaloopConfig.DFSP_ID,
        "hub_url": MojaloopConfig.HUB_URL,
        "callback_url": MojaloopConfig.CALLBACK_URL,
        "active_quotes": len(mojaloop_service._quotes),
        "active_transfers": len(mojaloop_service._transfers)
    }
