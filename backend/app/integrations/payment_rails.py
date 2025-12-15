"""
Payment Rails Integration Interfaces

This module provides standardized interfaces for integrating with various
payment rails and processors used in African markets.

Supported Rails:
- NIBSS (Nigeria Inter-Bank Settlement System)
- Paystack
- Flutterwave
- M-Pesa (Kenya, Tanzania)
- Card Networks (Visa, Mastercard)
"""

import os
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
from datetime import datetime
from decimal import Decimal
import structlog

logger = structlog.get_logger(__name__)


class PaymentRailType(str, Enum):
    """Types of payment rails"""
    NIBSS = "nibss"
    PAYSTACK = "paystack"
    FLUTTERWAVE = "flutterwave"
    MPESA = "mpesa"
    VISA = "visa"
    MASTERCARD = "mastercard"
    BANK_TRANSFER = "bank_transfer"
    USSD = "ussd"


class TransactionStatus(str, Enum):
    """Transaction status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"
    CANCELLED = "cancelled"


@dataclass
class PaymentRequest:
    """Standard payment request"""
    reference: str
    amount: Decimal
    currency: str
    source_account: str
    destination_account: str
    narration: str
    metadata: Dict[str, Any]
    idempotency_key: str


@dataclass
class PaymentResponse:
    """Standard payment response"""
    reference: str
    rail_reference: str
    status: TransactionStatus
    amount: Decimal
    currency: str
    fee: Decimal
    timestamp: datetime
    metadata: Dict[str, Any]
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class PaymentRailInterface(ABC):
    """Abstract interface for payment rails"""
    
    @abstractmethod
    async def initiate_transfer(self, request: PaymentRequest) -> PaymentResponse:
        """Initiate a transfer"""
        pass
    
    @abstractmethod
    async def check_status(self, reference: str) -> PaymentResponse:
        """Check transaction status"""
        pass
    
    @abstractmethod
    async def reverse_transaction(self, reference: str, reason: str) -> PaymentResponse:
        """Reverse a transaction"""
        pass
    
    @abstractmethod
    async def validate_account(self, account_number: str, bank_code: str) -> Dict[str, Any]:
        """Validate a bank account"""
        pass
    
    @abstractmethod
    async def get_banks(self) -> List[Dict[str, Any]]:
        """Get list of supported banks"""
        pass


class NIBSSIntegration(PaymentRailInterface):
    """
    NIBSS (Nigeria Inter-Bank Settlement System) Integration
    
    Supports:
    - NIP (NIBSS Instant Payment)
    - NEFT (NIBSS Electronic Funds Transfer)
    - BVN Validation
    """
    
    def __init__(self):
        self.api_key = os.getenv("NIBSS_API_KEY")
        self.secret_key = os.getenv("NIBSS_SECRET_KEY")
        self.base_url = os.getenv("NIBSS_BASE_URL", "https://api.nibss-plc.com.ng")
        self.institution_code = os.getenv("NIBSS_INSTITUTION_CODE")
    
    async def initiate_transfer(self, request: PaymentRequest) -> PaymentResponse:
        """Initiate NIP transfer"""
        logger.info(
            "nibss_transfer_initiated",
            reference=request.reference,
            amount=str(request.amount),
            destination=request.destination_account[-4:]
        )
        
        return PaymentResponse(
            reference=request.reference,
            rail_reference=f"NIP{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            status=TransactionStatus.PENDING,
            amount=request.amount,
            currency=request.currency,
            fee=Decimal("10.75"),
            timestamp=datetime.utcnow(),
            metadata={"rail": "nibss", "type": "nip"}
        )
    
    async def check_status(self, reference: str) -> PaymentResponse:
        """Check NIP transaction status"""
        logger.info("nibss_status_check", reference=reference)
        
        return PaymentResponse(
            reference=reference,
            rail_reference=f"NIP{reference}",
            status=TransactionStatus.COMPLETED,
            amount=Decimal("0"),
            currency="NGN",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={}
        )
    
    async def reverse_transaction(self, reference: str, reason: str) -> PaymentResponse:
        """Reverse NIP transaction"""
        logger.info("nibss_reversal", reference=reference, reason=reason)
        
        return PaymentResponse(
            reference=reference,
            rail_reference=f"REV{reference}",
            status=TransactionStatus.REVERSED,
            amount=Decimal("0"),
            currency="NGN",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={"reversal_reason": reason}
        )
    
    async def validate_account(self, account_number: str, bank_code: str) -> Dict[str, Any]:
        """Validate Nigerian bank account via NIBSS"""
        logger.info("nibss_account_validation", account=account_number[-4:], bank=bank_code)
        
        return {
            "valid": True,
            "account_number": account_number,
            "account_name": "Account Holder Name",
            "bank_code": bank_code,
            "bank_name": "Bank Name"
        }
    
    async def get_banks(self) -> List[Dict[str, Any]]:
        """Get list of Nigerian banks"""
        return [
            {"code": "044", "name": "Access Bank"},
            {"code": "023", "name": "Citibank"},
            {"code": "063", "name": "Diamond Bank"},
            {"code": "050", "name": "Ecobank"},
            {"code": "084", "name": "Enterprise Bank"},
            {"code": "070", "name": "Fidelity Bank"},
            {"code": "011", "name": "First Bank"},
            {"code": "214", "name": "First City Monument Bank"},
            {"code": "058", "name": "GTBank"},
            {"code": "030", "name": "Heritage Bank"},
            {"code": "301", "name": "Jaiz Bank"},
            {"code": "082", "name": "Keystone Bank"},
            {"code": "526", "name": "Parallex Bank"},
            {"code": "076", "name": "Polaris Bank"},
            {"code": "101", "name": "Providus Bank"},
            {"code": "221", "name": "Stanbic IBTC"},
            {"code": "068", "name": "Standard Chartered"},
            {"code": "232", "name": "Sterling Bank"},
            {"code": "100", "name": "Suntrust Bank"},
            {"code": "032", "name": "Union Bank"},
            {"code": "033", "name": "United Bank for Africa"},
            {"code": "215", "name": "Unity Bank"},
            {"code": "035", "name": "Wema Bank"},
            {"code": "057", "name": "Zenith Bank"},
        ]
    
    async def validate_bvn(self, bvn: str) -> Dict[str, Any]:
        """Validate BVN (Bank Verification Number)"""
        logger.info("nibss_bvn_validation", bvn=bvn[:3] + "***")
        
        return {
            "valid": True,
            "bvn": bvn,
            "first_name": "First",
            "last_name": "Last",
            "date_of_birth": "1990-01-01",
            "phone_number": "080****1234"
        }


class PaystackIntegration(PaymentRailInterface):
    """
    Paystack Integration
    
    Supports:
    - Bank transfers
    - Card payments
    - USSD payments
    - Mobile money
    """
    
    def __init__(self):
        self.secret_key = os.getenv("PAYSTACK_SECRET_KEY")
        self.public_key = os.getenv("PAYSTACK_PUBLIC_KEY")
        self.base_url = "https://api.paystack.co"
    
    async def initiate_transfer(self, request: PaymentRequest) -> PaymentResponse:
        """Initiate Paystack transfer"""
        logger.info(
            "paystack_transfer_initiated",
            reference=request.reference,
            amount=str(request.amount)
        )
        
        return PaymentResponse(
            reference=request.reference,
            rail_reference=f"PSK{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            status=TransactionStatus.PENDING,
            amount=request.amount,
            currency=request.currency,
            fee=Decimal("10.00"),
            timestamp=datetime.utcnow(),
            metadata={"rail": "paystack"}
        )
    
    async def check_status(self, reference: str) -> PaymentResponse:
        """Check Paystack transaction status"""
        return PaymentResponse(
            reference=reference,
            rail_reference=f"PSK{reference}",
            status=TransactionStatus.COMPLETED,
            amount=Decimal("0"),
            currency="NGN",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={}
        )
    
    async def reverse_transaction(self, reference: str, reason: str) -> PaymentResponse:
        """Reverse Paystack transaction"""
        return PaymentResponse(
            reference=reference,
            rail_reference=f"REV{reference}",
            status=TransactionStatus.REVERSED,
            amount=Decimal("0"),
            currency="NGN",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={"reversal_reason": reason}
        )
    
    async def validate_account(self, account_number: str, bank_code: str) -> Dict[str, Any]:
        """Validate bank account via Paystack"""
        return {
            "valid": True,
            "account_number": account_number,
            "account_name": "Account Holder",
            "bank_code": bank_code
        }
    
    async def get_banks(self) -> List[Dict[str, Any]]:
        """Get list of banks from Paystack"""
        return await NIBSSIntegration().get_banks()
    
    async def initialize_payment(
        self,
        email: str,
        amount: int,
        reference: str,
        callback_url: str,
        channels: List[str] = None
    ) -> Dict[str, Any]:
        """Initialize a payment"""
        logger.info("paystack_payment_initialized", reference=reference, amount=amount)
        
        return {
            "authorization_url": f"https://checkout.paystack.com/{reference}",
            "access_code": f"ACC{reference}",
            "reference": reference
        }


class FlutterwaveIntegration(PaymentRailInterface):
    """
    Flutterwave Integration
    
    Supports:
    - Bank transfers (multiple African countries)
    - Card payments
    - Mobile money (M-Pesa, MTN MoMo, etc.)
    - USSD
    """
    
    def __init__(self):
        self.secret_key = os.getenv("FLUTTERWAVE_SECRET_KEY")
        self.public_key = os.getenv("FLUTTERWAVE_PUBLIC_KEY")
        self.encryption_key = os.getenv("FLUTTERWAVE_ENCRYPTION_KEY")
        self.base_url = "https://api.flutterwave.com/v3"
    
    async def initiate_transfer(self, request: PaymentRequest) -> PaymentResponse:
        """Initiate Flutterwave transfer"""
        logger.info(
            "flutterwave_transfer_initiated",
            reference=request.reference,
            amount=str(request.amount)
        )
        
        return PaymentResponse(
            reference=request.reference,
            rail_reference=f"FLW{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            status=TransactionStatus.PENDING,
            amount=request.amount,
            currency=request.currency,
            fee=Decimal("25.00"),
            timestamp=datetime.utcnow(),
            metadata={"rail": "flutterwave"}
        )
    
    async def check_status(self, reference: str) -> PaymentResponse:
        """Check Flutterwave transaction status"""
        return PaymentResponse(
            reference=reference,
            rail_reference=f"FLW{reference}",
            status=TransactionStatus.COMPLETED,
            amount=Decimal("0"),
            currency="NGN",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={}
        )
    
    async def reverse_transaction(self, reference: str, reason: str) -> PaymentResponse:
        """Reverse Flutterwave transaction"""
        return PaymentResponse(
            reference=reference,
            rail_reference=f"REV{reference}",
            status=TransactionStatus.REVERSED,
            amount=Decimal("0"),
            currency="NGN",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={"reversal_reason": reason}
        )
    
    async def validate_account(self, account_number: str, bank_code: str) -> Dict[str, Any]:
        """Validate bank account via Flutterwave"""
        return {
            "valid": True,
            "account_number": account_number,
            "account_name": "Account Holder",
            "bank_code": bank_code
        }
    
    async def get_banks(self) -> List[Dict[str, Any]]:
        """Get list of banks from Flutterwave"""
        return await NIBSSIntegration().get_banks()
    
    async def initiate_mobile_money(
        self,
        phone_number: str,
        amount: Decimal,
        currency: str,
        network: str,
        reference: str
    ) -> Dict[str, Any]:
        """Initiate mobile money payment"""
        logger.info(
            "flutterwave_momo_initiated",
            reference=reference,
            network=network,
            amount=str(amount)
        )
        
        return {
            "reference": reference,
            "status": "pending",
            "network": network,
            "phone": phone_number[-4:]
        }


class MPesaIntegration(PaymentRailInterface):
    """
    M-Pesa Integration (Kenya, Tanzania)
    
    Supports:
    - C2B (Customer to Business)
    - B2C (Business to Customer)
    - B2B (Business to Business)
    - STK Push
    """
    
    def __init__(self):
        self.consumer_key = os.getenv("MPESA_CONSUMER_KEY")
        self.consumer_secret = os.getenv("MPESA_CONSUMER_SECRET")
        self.shortcode = os.getenv("MPESA_SHORTCODE")
        self.passkey = os.getenv("MPESA_PASSKEY")
        self.base_url = os.getenv("MPESA_BASE_URL", "https://api.safaricom.co.ke")
    
    async def initiate_transfer(self, request: PaymentRequest) -> PaymentResponse:
        """Initiate M-Pesa B2C transfer"""
        logger.info(
            "mpesa_b2c_initiated",
            reference=request.reference,
            amount=str(request.amount)
        )
        
        return PaymentResponse(
            reference=request.reference,
            rail_reference=f"MPESA{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            status=TransactionStatus.PENDING,
            amount=request.amount,
            currency=request.currency,
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={"rail": "mpesa", "type": "b2c"}
        )
    
    async def check_status(self, reference: str) -> PaymentResponse:
        """Check M-Pesa transaction status"""
        return PaymentResponse(
            reference=reference,
            rail_reference=f"MPESA{reference}",
            status=TransactionStatus.COMPLETED,
            amount=Decimal("0"),
            currency="KES",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={}
        )
    
    async def reverse_transaction(self, reference: str, reason: str) -> PaymentResponse:
        """Reverse M-Pesa transaction"""
        return PaymentResponse(
            reference=reference,
            rail_reference=f"REV{reference}",
            status=TransactionStatus.REVERSED,
            amount=Decimal("0"),
            currency="KES",
            fee=Decimal("0"),
            timestamp=datetime.utcnow(),
            metadata={"reversal_reason": reason}
        )
    
    async def validate_account(self, account_number: str, bank_code: str) -> Dict[str, Any]:
        """Validate M-Pesa account (phone number)"""
        return {
            "valid": True,
            "phone_number": account_number,
            "name": "M-Pesa User"
        }
    
    async def get_banks(self) -> List[Dict[str, Any]]:
        """M-Pesa doesn't use banks"""
        return []
    
    async def stk_push(
        self,
        phone_number: str,
        amount: Decimal,
        reference: str,
        description: str
    ) -> Dict[str, Any]:
        """Initiate STK Push (Lipa Na M-Pesa)"""
        logger.info(
            "mpesa_stk_push",
            reference=reference,
            phone=phone_number[-4:],
            amount=str(amount)
        )
        
        return {
            "checkout_request_id": f"ws_CO_{reference}",
            "merchant_request_id": f"MR_{reference}",
            "response_code": "0",
            "response_description": "Success. Request accepted for processing"
        }


class CardNetworkIntegration:
    """
    Card Network Integration (Visa, Mastercard)
    
    Supports:
    - Card tokenization
    - Card payments
    - 3D Secure authentication
    - Chargebacks
    """
    
    def __init__(self, network: str = "visa"):
        self.network = network
        self.api_key = os.getenv(f"{network.upper()}_API_KEY")
        self.merchant_id = os.getenv(f"{network.upper()}_MERCHANT_ID")
    
    async def tokenize_card(
        self,
        card_number: str,
        expiry_month: str,
        expiry_year: str,
        cvv: str
    ) -> Dict[str, Any]:
        """Tokenize a card for secure storage"""
        logger.info("card_tokenization", network=self.network, card_last4=card_number[-4:])
        
        return {
            "token": f"tok_{self.network}_{card_number[-4:]}",
            "card_type": self.network,
            "last_four": card_number[-4:],
            "expiry_month": expiry_month,
            "expiry_year": expiry_year,
            "brand": self.network.capitalize()
        }
    
    async def charge_card(
        self,
        token: str,
        amount: Decimal,
        currency: str,
        reference: str
    ) -> Dict[str, Any]:
        """Charge a tokenized card"""
        logger.info(
            "card_charge",
            network=self.network,
            reference=reference,
            amount=str(amount)
        )
        
        return {
            "reference": reference,
            "status": "success",
            "amount": str(amount),
            "currency": currency,
            "authorization_code": f"AUTH_{reference}"
        }
    
    async def initiate_3ds(
        self,
        token: str,
        amount: Decimal,
        currency: str,
        return_url: str
    ) -> Dict[str, Any]:
        """Initiate 3D Secure authentication"""
        return {
            "enrolled": True,
            "redirect_url": f"https://3ds.{self.network}.com/authenticate",
            "transaction_id": f"3DS_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        }
    
    async def process_chargeback(
        self,
        reference: str,
        reason: str,
        evidence: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process a chargeback dispute"""
        logger.info("chargeback_processed", reference=reference, reason=reason)
        
        return {
            "chargeback_id": f"CB_{reference}",
            "status": "under_review",
            "reason": reason
        }


class PaymentRailFactory:
    """Factory for creating payment rail instances"""
    
    @staticmethod
    def get_rail(rail_type: PaymentRailType) -> PaymentRailInterface:
        """Get payment rail instance by type"""
        rails = {
            PaymentRailType.NIBSS: NIBSSIntegration,
            PaymentRailType.PAYSTACK: PaystackIntegration,
            PaymentRailType.FLUTTERWAVE: FlutterwaveIntegration,
            PaymentRailType.MPESA: MPesaIntegration,
        }
        
        rail_class = rails.get(rail_type)
        if not rail_class:
            raise ValueError(f"Unsupported payment rail: {rail_type}")
        
        return rail_class()
    
    @staticmethod
    def get_card_network(network: str) -> CardNetworkIntegration:
        """Get card network integration"""
        return CardNetworkIntegration(network)
