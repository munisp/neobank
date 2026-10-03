"""
QR Code API Router - FastAPI

Endpoints for generating and verifying secure QR codes
"""

import base64
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field, validator

from app.services.secure_qr_service import SecureQRService, QRCodeType
from app.dependencies import get_qr_service


router = APIRouter(prefix="/qr", tags=["qr"])


# Request Models

class GeneratePaymentQRRequest(BaseModel):
    """Payment QR code generation request"""
    amount: float = Field(..., gt=0, description="Payment amount")
    currency: str = Field(..., min_length=3, max_length=3, description="Currency code (e.g., USD)")
    recipient: str = Field(..., description="Recipient identifier")
    description: Optional[str] = Field(None, description="Payment description")
    expiry_minutes: int = Field(5, ge=1, le=60, description="QR code expiry in minutes")
    encrypt: bool = Field(True, description="Whether to encrypt the payload")
    size: int = Field(10, ge=1, le=40, description="QR code size")

    @validator('currency')
    def currency_uppercase(cls, v):
        return v.upper()


class GenerateTransferQRRequest(BaseModel):
    """Transfer QR code generation request"""
    account_number: str = Field(..., description="Account number")
    amount: float = Field(..., gt=0, description="Transfer amount")
    currency: str = Field(..., min_length=3, max_length=3, description="Currency code")
    reference: Optional[str] = Field(None, description="Transfer reference")
    expiry_minutes: int = Field(5, ge=1, le=60)
    encrypt: bool = Field(True)
    size: int = Field(10, ge=1, le=40)

    @validator('currency')
    def currency_uppercase(cls, v):
        return v.upper()


class GenerateMerchantQRRequest(BaseModel):
    """Merchant QR code generation request"""
    merchant_id: str = Field(..., description="Merchant identifier")
    amount: float = Field(..., gt=0, description="Payment amount")
    currency: str = Field(..., min_length=3, max_length=3, description="Currency code")
    order_id: Optional[str] = Field(None, description="Order identifier")
    description: Optional[str] = Field(None, description="Payment description")
    expiry_minutes: int = Field(5, ge=1, le=60)
    encrypt: bool = Field(True)
    size: int = Field(10, ge=1, le=40)

    @validator('currency')
    def currency_uppercase(cls, v):
        return v.upper()


class GenerateP2PQRRequest(BaseModel):
    """P2P QR code generation request"""
    user_id: str = Field(..., description="User identifier")
    amount: float = Field(..., gt=0, description="Payment amount")
    currency: str = Field(..., min_length=3, max_length=3, description="Currency code")
    message: Optional[str] = Field(None, description="Payment message")
    expiry_minutes: int = Field(5, ge=1, le=60)
    encrypt: bool = Field(True)
    size: int = Field(10, ge=1, le=40)

    @validator('currency')
    def currency_uppercase(cls, v):
        return v.upper()


class VerifyQRRequest(BaseModel):
    """QR code verification request"""
    qr_data: str = Field(..., description="JSON data from scanned QR code")


# Response Models

class QRResponse(BaseModel):
    """QR code generation response"""
    qr_code_image: str = Field(..., description="Base64-encoded PNG image")
    qr_data: str = Field(..., description="JSON data string")
    expires_at: int = Field(..., description="Expiration timestamp (milliseconds)")
    type: str = Field(..., description="QR code type")


class VerifyQRResponse(BaseModel):
    """QR code verification response"""
    verified: bool = Field(..., description="Whether QR code is valid")
    data: dict = Field(..., description="Verified QR data")


class PublicKeyResponse(BaseModel):
    """Public key response"""
    public_key: str = Field(..., description="RSA public key in PEM format")


# Endpoints

@router.post("/payment", response_model=QRResponse, status_code=status.HTTP_201_CREATED)
async def generate_payment_qr(
    request: GeneratePaymentQRRequest,
    qr_service: SecureQRService = Depends(get_qr_service)
):
    """
    Generate a secure payment QR code

    - **amount**: Payment amount (must be > 0)
    - **currency**: 3-letter currency code (e.g., USD, EUR)
    - **recipient**: Recipient identifier (email, user ID, etc.)
    - **description**: Optional payment description
    - **expiry_minutes**: QR code expiry time (1-60 minutes, default 5)
    - **encrypt**: Whether to encrypt the payload (default true)
    - **size**: QR code size (1-40, default 10)

    Returns QR code image (base64-encoded PNG) and JSON data
    """
    try:
        qr_image, qr_data = qr_service.generate_payment_qr(
            amount=request.amount,
            currency=request.currency,
            recipient=request.recipient,
            description=request.description,
            expiry_minutes=request.expiry_minutes,
            encrypt=request.encrypt,
            size=request.size
        )

        # Parse QR data to get expiration
        import json
        qr_data_dict = json.loads(qr_data)

        return QRResponse(
            qr_code_image=base64.b64encode(qr_image).decode('utf-8'),
            qr_data=qr_data,
            expires_at=qr_data_dict["expiresAt"],
            type=QRCodeType.PAYMENT.value
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/transfer", response_model=QRResponse, status_code=status.HTTP_201_CREATED)
async def generate_transfer_qr(
    request: GenerateTransferQRRequest,
    qr_service: SecureQRService = Depends(get_qr_service)
):
    """Generate a secure transfer QR code"""
    try:
        qr_image, qr_data = qr_service.generate_transfer_qr(
            account_number=request.account_number,
            amount=request.amount,
            currency=request.currency,
            reference=request.reference,
            expiry_minutes=request.expiry_minutes,
            encrypt=request.encrypt,
            size=request.size
        )

        import json
        qr_data_dict = json.loads(qr_data)

        return QRResponse(
            qr_code_image=base64.b64encode(qr_image).decode('utf-8'),
            qr_data=qr_data,
            expires_at=qr_data_dict["expiresAt"],
            type=QRCodeType.TRANSFER.value
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/merchant", response_model=QRResponse, status_code=status.HTTP_201_CREATED)
async def generate_merchant_qr(
    request: GenerateMerchantQRRequest,
    qr_service: SecureQRService = Depends(get_qr_service)
):
    """Generate a secure merchant QR code"""
    try:
        qr_image, qr_data = qr_service.generate_merchant_qr(
            merchant_id=request.merchant_id,
            amount=request.amount,
            currency=request.currency,
            order_id=request.order_id,
            description=request.description,
            expiry_minutes=request.expiry_minutes,
            encrypt=request.encrypt,
            size=request.size
        )

        import json
        qr_data_dict = json.loads(qr_data)

        return QRResponse(
            qr_code_image=base64.b64encode(qr_image).decode('utf-8'),
            qr_data=qr_data,
            expires_at=qr_data_dict["expiresAt"],
            type=QRCodeType.MERCHANT.value
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/p2p", response_model=QRResponse, status_code=status.HTTP_201_CREATED)
async def generate_p2p_qr(
    request: GenerateP2PQRRequest,
    qr_service: SecureQRService = Depends(get_qr_service)
):
    """Generate a secure P2P QR code"""
    try:
        qr_image, qr_data = qr_service.generate_p2p_qr(
            user_id=request.user_id,
            amount=request.amount,
            currency=request.currency,
            message=request.message,
            expiry_minutes=request.expiry_minutes,
            encrypt=request.encrypt,
            size=request.size
        )

        import json
        qr_data_dict = json.loads(qr_data)

        return QRResponse(
            qr_code_image=base64.b64encode(qr_image).decode('utf-8'),
            qr_data=qr_data,
            expires_at=qr_data_dict["expiresAt"],
            type=QRCodeType.P2P.value
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/verify", response_model=VerifyQRResponse)
async def verify_qr(
    request: VerifyQRRequest,
    qr_service: SecureQRService = Depends(get_qr_service)
):
    """
    Verify a scanned QR code

    - **qr_data**: JSON data from scanned QR code

    Returns verified QR data with decrypted payload if valid
    """
    try:
        verified_data = qr_service.verify_qr_code(request.qr_data)

        return VerifyQRResponse(
            verified=True,
            data=verified_data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/public-key", response_model=PublicKeyResponse)
async def get_public_key(qr_service: SecureQRService = Depends(get_qr_service)):
    """
    Get RSA public key for QR code signature verification

    Returns public key in PEM format
    """
    try:
        public_key = qr_service.get_public_key_pem()

        return PublicKeyResponse(public_key=public_key)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# Health check endpoint
@router.get("/health")
async def health_check():
    """QR service health check"""
    return {"status": "healthy", "service": "qr"}

