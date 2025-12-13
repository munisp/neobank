"""
SMS Router for NeoBank

Handles SMS gateway callbacks and provides SMS banking endpoints.
Supports Africa's Talking, Twilio, Infobip, and Termii.
"""

from fastapi import APIRouter, Form, Request, HTTPException
from fastapi.responses import PlainTextResponse
from typing import Optional
from datetime import datetime
import structlog

from app.services.sms_banking_service import (
    sms_banking_service,
    SMSMessage,
    SMSProvider
)

logger = structlog.get_logger()

router = APIRouter(prefix="/sms", tags=["SMS Banking"])


@router.post("/callback/africas-talking", response_class=PlainTextResponse)
async def africas_talking_callback(
    from_: str = Form(..., alias="from"),
    to: str = Form(...),
    text: str = Form(...),
    date: str = Form(...),
    id: str = Form(...),
    linkId: Optional[str] = Form(default=None),
):
    """
    Africa's Talking SMS callback endpoint
    
    Receives incoming SMS from Africa's Talking gateway.
    """
    logger.info(
        "SMS received from Africa's Talking",
        sender=from_[-4:],
        message_id=id
    )
    
    try:
        message = SMSMessage(
            message_id=id,
            sender=from_,
            recipient=to,
            content=text,
            provider=SMSProvider.AFRICAS_TALKING
        )
        
        response = await sms_banking_service.handle_incoming_sms(message)
        
        # Africa's Talking expects empty response for success
        # The response SMS is sent via their API
        return ""
        
    except Exception as e:
        logger.error("SMS callback error", error=str(e))
        return ""


@router.post("/callback/twilio")
async def twilio_callback(
    From: str = Form(...),
    To: str = Form(...),
    Body: str = Form(...),
    MessageSid: str = Form(...),
    AccountSid: Optional[str] = Form(default=None),
):
    """
    Twilio SMS callback endpoint
    
    Receives incoming SMS from Twilio gateway.
    Returns TwiML response.
    """
    logger.info(
        "SMS received from Twilio",
        sender=From[-4:],
        message_id=MessageSid
    )
    
    try:
        message = SMSMessage(
            message_id=MessageSid,
            sender=From,
            recipient=To,
            content=Body,
            provider=SMSProvider.TWILIO
        )
        
        response = await sms_banking_service.handle_incoming_sms(message)
        
        # Return TwiML response
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{response.content}</Message>
</Response>"""
        
        return PlainTextResponse(content=twiml, media_type="application/xml")
        
    except Exception as e:
        logger.error("Twilio SMS callback error", error=str(e))
        return PlainTextResponse(
            content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            media_type="application/xml"
        )


@router.post("/callback/infobip")
async def infobip_callback(request: Request):
    """
    Infobip SMS callback endpoint
    
    Receives incoming SMS from Infobip gateway.
    """
    try:
        data = await request.json()
        
        results = data.get("results", [])
        
        for result in results:
            message = SMSMessage(
                message_id=result.get("messageId", ""),
                sender=result.get("from", ""),
                recipient=result.get("to", ""),
                content=result.get("text", ""),
                provider=SMSProvider.INFOBIP
            )
            
            await sms_banking_service.handle_incoming_sms(message)
        
        return {"status": "ok"}
        
    except Exception as e:
        logger.error("Infobip SMS callback error", error=str(e))
        return {"status": "error"}


@router.post("/callback/termii")
async def termii_callback(request: Request):
    """
    Termii SMS callback endpoint (popular in Nigeria)
    
    Receives incoming SMS from Termii gateway.
    """
    try:
        data = await request.json()
        
        message = SMSMessage(
            message_id=data.get("message_id", ""),
            sender=data.get("from", ""),
            recipient=data.get("to", ""),
            content=data.get("sms", ""),
            provider=SMSProvider.TERMII
        )
        
        response = await sms_banking_service.handle_incoming_sms(message)
        
        return {"status": "success", "response": response.content}
        
    except Exception as e:
        logger.error("Termii SMS callback error", error=str(e))
        return {"status": "error"}


@router.get("/health")
async def sms_health():
    """Health check for SMS service"""
    return {
        "status": "healthy",
        "service": "sms_banking",
        "providers": ["africas_talking", "twilio", "infobip", "termii"]
    }


@router.get("/commands")
async def get_sms_commands():
    """Get available SMS banking commands"""
    return {
        "commands": {
            "BAL <PIN>": "Check account balance",
            "SEND <PHONE> <AMOUNT> <PIN>": "Send money to another number",
            "AIR <PHONE> <AMOUNT> <PIN>": "Buy airtime for a number",
            "AIR <AMOUNT> <PIN>": "Buy airtime for yourself",
            "STMT <PIN>": "Get mini statement (last 3 transactions)",
            "PIN <OLD> <NEW> <CONFIRM>": "Change your PIN",
            "BLOCK": "Emergency block your account",
            "HELP": "Get list of commands"
        },
        "short_codes": {
            "NG": "32123",
            "KE": "22123",
            "ZA": "32123",
            "GH": "1234"
        },
        "examples": [
            "BAL 1234",
            "SEND 08012345678 5000 1234",
            "AIR 500 1234",
            "STMT 1234"
        ]
    }
