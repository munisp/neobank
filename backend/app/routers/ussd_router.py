"""
USSD Router for NeoBank

Handles USSD gateway callbacks from Africa's Talking, Infobip, and other providers.
Provides endpoints for USSD session management.
"""

from fastapi import APIRouter, Form, Request, HTTPException
from fastapi.responses import PlainTextResponse
from typing import Optional
import structlog

from app.services.ussd_service import ussd_service, USSDResponse

logger = structlog.get_logger()

router = APIRouter(prefix="/ussd", tags=["USSD Banking"])


@router.post("/callback", response_class=PlainTextResponse)
async def ussd_callback(
    sessionId: str = Form(...),
    phoneNumber: str = Form(...),
    text: str = Form(default=""),
    serviceCode: str = Form(default=""),
    networkCode: Optional[str] = Form(default=None),
):
    """
    Africa's Talking USSD callback endpoint
    
    This endpoint receives USSD requests from Africa's Talking gateway
    and returns menu responses.
    
    Args:
        sessionId: Unique session identifier
        phoneNumber: User's phone number (MSISDN)
        text: User input (accumulated, separated by *)
        serviceCode: USSD short code dialed
        networkCode: Mobile network code (optional)
    
    Returns:
        USSD response in Africa's Talking format (CON/END prefix)
    """
    logger.info(
        "USSD callback received",
        session_id=sessionId,
        phone=phoneNumber[-4:],
        service_code=serviceCode
    )
    
    try:
        response = await ussd_service.handle_request(
            session_id=sessionId,
            phone_number=phoneNumber,
            text=text,
            service_code=serviceCode
        )
        
        return response.to_africas_talking()
        
    except Exception as e:
        logger.error("USSD callback error", error=str(e))
        return "END An error occurred. Please try again."


@router.post("/infobip/callback", response_class=PlainTextResponse)
async def infobip_ussd_callback(request: Request):
    """
    Infobip USSD callback endpoint
    
    Handles USSD requests from Infobip gateway.
    """
    try:
        data = await request.json()
        
        session_id = data.get("sessionId", "")
        phone_number = data.get("msisdn", "")
        text = data.get("text", "")
        service_code = data.get("shortCode", "")
        
        response = await ussd_service.handle_request(
            session_id=session_id,
            phone_number=phone_number,
            text=text,
            service_code=service_code
        )
        
        return response.message
        
    except Exception as e:
        logger.error("Infobip USSD callback error", error=str(e))
        return "An error occurred. Please try again."


@router.get("/health")
async def ussd_health():
    """Health check for USSD service"""
    return {
        "status": "healthy",
        "service": "ussd",
        "active_sessions": len(ussd_service.sessions)
    }


@router.get("/short-codes")
async def get_short_codes():
    """Get USSD short codes by country"""
    return {
        "short_codes": ussd_service.SHORT_CODES,
        "instructions": {
            "NG": "Dial *347*123# to access NeoBank USSD",
            "KE": "Dial *483*123# to access NeoBank USSD",
            "ZA": "Dial *120*123# to access NeoBank USSD",
            "GH": "Dial *713*123# to access NeoBank USSD",
        }
    }
