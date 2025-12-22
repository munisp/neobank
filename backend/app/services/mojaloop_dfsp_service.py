"""
Mojaloop DFSP (Digital Financial Service Provider) Adapter

This service implements the Mojaloop FSPIOP API for interoperability with
other financial institutions in the Mojaloop network.

Features:
- Party/Account Lookup (identify recipient and their DFSP)
- Quotes (price/fees/FX and acceptance)
- Transfers (commit the payment)
- Settlement integration with TigerBeetle
- Security (mTLS + JWS signing)
"""

import os
import json
import uuid
import hashlib
import hmac
import base64
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Dict, Any, List, Tuple
from enum import Enum
from dataclasses import dataclass, field, asdict
import httpx
import structlog
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.backends import default_backend

from app.infrastructure.tigerbeetle_client import (
    tigerbeetle_client,
    Ledger,
    AccountCode,
    TransferCode,
    string_to_u128
)

logger = structlog.get_logger(__name__)


# ==================== Configuration ====================

class MojaloopConfig:
    """Mojaloop connection configuration"""
    HUB_URL = os.getenv("MOJALOOP_HUB_URL", "http://localhost:4000")
    DFSP_ID = os.getenv("MOJALOOP_DFSP_ID", "neobank")
    CALLBACK_URL = os.getenv("MOJALOOP_CALLBACK_URL", "http://localhost:8000/mojaloop/callbacks")
    
    # Security
    PRIVATE_KEY_PATH = os.getenv("MOJALOOP_PRIVATE_KEY_PATH", "/etc/mojaloop/private.pem")
    PUBLIC_KEY_PATH = os.getenv("MOJALOOP_PUBLIC_KEY_PATH", "/etc/mojaloop/public.pem")
    HUB_PUBLIC_KEY_PATH = os.getenv("MOJALOOP_HUB_PUBLIC_KEY_PATH", "/etc/mojaloop/hub_public.pem")
    
    # mTLS
    CLIENT_CERT_PATH = os.getenv("MOJALOOP_CLIENT_CERT_PATH", "/etc/mojaloop/client.crt")
    CLIENT_KEY_PATH = os.getenv("MOJALOOP_CLIENT_KEY_PATH", "/etc/mojaloop/client.key")
    CA_CERT_PATH = os.getenv("MOJALOOP_CA_CERT_PATH", "/etc/mojaloop/ca.crt")
    
    # Timeouts
    QUOTE_EXPIRY_SECONDS = int(os.getenv("MOJALOOP_QUOTE_EXPIRY_SECONDS", "300"))
    TRANSFER_TIMEOUT_SECONDS = int(os.getenv("MOJALOOP_TRANSFER_TIMEOUT_SECONDS", "30"))


# ==================== Enums ====================

class PartyIdType(str, Enum):
    """Mojaloop party identifier types"""
    MSISDN = "MSISDN"  # Phone number
    EMAIL = "EMAIL"
    PERSONAL_ID = "PERSONAL_ID"
    BUSINESS = "BUSINESS"
    DEVICE = "DEVICE"
    ACCOUNT_ID = "ACCOUNT_ID"
    IBAN = "IBAN"
    ALIAS = "ALIAS"


class TransferState(str, Enum):
    """Mojaloop transfer states"""
    RECEIVED = "RECEIVED"
    RESERVED = "RESERVED"
    COMMITTED = "COMMITTED"
    ABORTED = "ABORTED"


class AmountType(str, Enum):
    """Amount type for quotes"""
    SEND = "SEND"
    RECEIVE = "RECEIVE"


# ==================== Data Classes ====================

@dataclass
class Party:
    """Mojaloop party (account holder)"""
    party_id_type: PartyIdType
    party_id: str
    fsp_id: Optional[str] = None
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "partyIdInfo": {
                "partyIdType": self.party_id_type.value,
                "partyIdentifier": self.party_id
            }
        }
        if self.fsp_id:
            result["partyIdInfo"]["fspId"] = self.fsp_id
        if self.name:
            result["name"] = self.name
        if self.first_name or self.last_name:
            result["personalInfo"] = {
                "complexName": {
                    "firstName": self.first_name or "",
                    "lastName": self.last_name or ""
                }
            }
        return result


@dataclass
class Money:
    """Mojaloop money amount"""
    currency: str
    amount: str  # String representation for precision
    
    def to_dict(self) -> Dict[str, str]:
        return {"currency": self.currency, "amount": self.amount}
    
    def to_decimal(self) -> Decimal:
        return Decimal(self.amount)


@dataclass
class Quote:
    """Mojaloop quote"""
    quote_id: str
    transaction_id: str
    payer: Party
    payee: Party
    amount_type: AmountType
    amount: Money
    fees: Optional[Money] = None
    transfer_amount: Optional[Money] = None
    expiration: Optional[str] = None
    ilp_packet: Optional[str] = None
    condition: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "quoteId": self.quote_id,
            "transactionId": self.transaction_id,
            "payer": self.payer.to_dict(),
            "payee": self.payee.to_dict(),
            "amountType": self.amount_type.value,
            "amount": self.amount.to_dict()
        }
        if self.fees:
            result["fees"] = self.fees.to_dict()
        if self.transfer_amount:
            result["transferAmount"] = self.transfer_amount.to_dict()
        if self.expiration:
            result["expiration"] = self.expiration
        if self.ilp_packet:
            result["ilpPacket"] = self.ilp_packet
        if self.condition:
            result["condition"] = self.condition
        return result


@dataclass
class Transfer:
    """Mojaloop transfer"""
    transfer_id: str
    payer_fsp: str
    payee_fsp: str
    amount: Money
    ilp_packet: str
    condition: str
    expiration: str
    state: TransferState = TransferState.RECEIVED
    fulfilment: Optional[str] = None
    completed_timestamp: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "transferId": self.transfer_id,
            "payerFsp": self.payer_fsp,
            "payeeFsp": self.payee_fsp,
            "amount": self.amount.to_dict(),
            "ilpPacket": self.ilp_packet,
            "condition": self.condition,
            "expiration": self.expiration,
            "transferState": self.state.value
        }
        if self.fulfilment:
            result["fulfilment"] = self.fulfilment
        if self.completed_timestamp:
            result["completedTimestamp"] = self.completed_timestamp
        return result


# ==================== Security ====================

class MojaloopSecurity:
    """Handles JWS signing and mTLS for Mojaloop"""
    
    def __init__(self):
        self._private_key = None
        self._public_key = None
        self._hub_public_key = None
        self._load_keys()
    
    def _load_keys(self):
        """Load cryptographic keys"""
        try:
            if os.path.exists(MojaloopConfig.PRIVATE_KEY_PATH):
                with open(MojaloopConfig.PRIVATE_KEY_PATH, "rb") as f:
                    self._private_key = serialization.load_pem_private_key(
                        f.read(),
                        password=None,
                        backend=default_backend()
                    )
            
            if os.path.exists(MojaloopConfig.PUBLIC_KEY_PATH):
                with open(MojaloopConfig.PUBLIC_KEY_PATH, "rb") as f:
                    self._public_key = serialization.load_pem_public_key(
                        f.read(),
                        backend=default_backend()
                    )
            
            if os.path.exists(MojaloopConfig.HUB_PUBLIC_KEY_PATH):
                with open(MojaloopConfig.HUB_PUBLIC_KEY_PATH, "rb") as f:
                    self._hub_public_key = serialization.load_pem_public_key(
                        f.read(),
                        backend=default_backend()
                    )
        except Exception as e:
            logger.warning("Failed to load Mojaloop keys", error=str(e))
    
    def sign_request(self, body: Dict[str, Any], headers: Dict[str, str]) -> str:
        """
        Create JWS signature for request.
        Returns the signature to be added to FSPIOP-Signature header.
        """
        if not self._private_key:
            logger.warning("No private key available for signing")
            return ""
        
        try:
            # Create protected header
            protected = {
                "alg": "RS256",
                "FSPIOP-URI": headers.get("FSPIOP-URI", ""),
                "FSPIOP-HTTP-Method": headers.get("FSPIOP-HTTP-Method", ""),
                "FSPIOP-Source": headers.get("FSPIOP-Source", MojaloopConfig.DFSP_ID)
            }
            
            if "FSPIOP-Destination" in headers:
                protected["FSPIOP-Destination"] = headers["FSPIOP-Destination"]
            
            # Encode protected header and payload
            protected_b64 = base64.urlsafe_b64encode(
                json.dumps(protected).encode()
            ).decode().rstrip("=")
            
            payload_b64 = base64.urlsafe_b64encode(
                json.dumps(body).encode()
            ).decode().rstrip("=")
            
            # Sign
            signing_input = f"{protected_b64}.{payload_b64}".encode()
            signature = self._private_key.sign(
                signing_input,
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            signature_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
            
            return f"{protected_b64}..{signature_b64}"
            
        except Exception as e:
            logger.error("Failed to sign request", error=str(e))
            return ""
    
    def verify_signature(self, signature: str, body: Dict[str, Any]) -> bool:
        """Verify JWS signature from hub"""
        if not self._hub_public_key:
            logger.warning("No hub public key available for verification")
            return True  # Skip verification if no key
        
        try:
            parts = signature.split("..")
            if len(parts) != 2:
                return False
            
            protected_b64, signature_b64 = parts
            
            payload_b64 = base64.urlsafe_b64encode(
                json.dumps(body).encode()
            ).decode().rstrip("=")
            
            signing_input = f"{protected_b64}.{payload_b64}".encode()
            signature_bytes = base64.urlsafe_b64decode(signature_b64 + "==")
            
            self._hub_public_key.verify(
                signature_bytes,
                signing_input,
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            return True
            
        except Exception as e:
            logger.error("Signature verification failed", error=str(e))
            return False
    
    def get_mtls_config(self) -> Optional[Tuple[str, str, str]]:
        """Get mTLS configuration (cert, key, ca)"""
        if all(os.path.exists(p) for p in [
            MojaloopConfig.CLIENT_CERT_PATH,
            MojaloopConfig.CLIENT_KEY_PATH,
            MojaloopConfig.CA_CERT_PATH
        ]):
            return (
                MojaloopConfig.CLIENT_CERT_PATH,
                MojaloopConfig.CLIENT_KEY_PATH,
                MojaloopConfig.CA_CERT_PATH
            )
        return None


# ==================== ILP (Interledger Protocol) ====================

class ILPPacketGenerator:
    """Generate ILP packets for Mojaloop transfers"""
    
    @staticmethod
    def generate_condition() -> Tuple[str, str]:
        """
        Generate ILP condition and fulfilment.
        Returns (condition, fulfilment) tuple.
        """
        # Generate random fulfilment (32 bytes)
        fulfilment_bytes = os.urandom(32)
        fulfilment = base64.urlsafe_b64encode(fulfilment_bytes).decode().rstrip("=")
        
        # Condition is SHA-256 hash of fulfilment
        condition_bytes = hashlib.sha256(fulfilment_bytes).digest()
        condition = base64.urlsafe_b64encode(condition_bytes).decode().rstrip("=")
        
        return condition, fulfilment
    
    @staticmethod
    def generate_packet(
        destination_account: str,
        amount: Decimal,
        currency: str,
        expiry: datetime
    ) -> str:
        """Generate ILP packet for transfer"""
        # Simplified ILP packet structure
        packet_data = {
            "destination": destination_account,
            "amount": str(int(amount * 100)),  # In minor units
            "currency": currency,
            "expiry": expiry.isoformat()
        }
        
        packet_json = json.dumps(packet_data)
        return base64.urlsafe_b64encode(packet_json.encode()).decode().rstrip("=")
    
    @staticmethod
    def verify_fulfilment(condition: str, fulfilment: str) -> bool:
        """Verify that fulfilment matches condition"""
        try:
            fulfilment_bytes = base64.urlsafe_b64decode(fulfilment + "==")
            expected_condition = hashlib.sha256(fulfilment_bytes).digest()
            expected_condition_b64 = base64.urlsafe_b64encode(expected_condition).decode().rstrip("=")
            return condition == expected_condition_b64
        except Exception:
            return False


# ==================== DFSP Service ====================

class MojaloopDFSPService:
    """
    Mojaloop DFSP Adapter Service.
    
    Implements FSPIOP API for interoperability with other financial institutions.
    """
    
    def __init__(self):
        self.security = MojaloopSecurity()
        self.ilp = ILPPacketGenerator()
        self._quotes: Dict[str, Quote] = {}
        self._transfers: Dict[str, Transfer] = {}
        self._pending_fulfilments: Dict[str, str] = {}  # transfer_id -> fulfilment
    
    async def _make_request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        destination_fsp: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Make authenticated request to Mojaloop hub"""
        url = f"{MojaloopConfig.HUB_URL}{path}"
        
        headers = {
            "Content-Type": "application/vnd.interoperability.parties+json;version=1.1",
            "Accept": "application/vnd.interoperability.parties+json;version=1.1",
            "Date": datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT"),
            "FSPIOP-Source": MojaloopConfig.DFSP_ID,
            "FSPIOP-URI": path,
            "FSPIOP-HTTP-Method": method
        }
        
        if destination_fsp:
            headers["FSPIOP-Destination"] = destination_fsp
        
        if body:
            signature = self.security.sign_request(body, headers)
            if signature:
                headers["FSPIOP-Signature"] = signature
        
        try:
            mtls_config = self.security.get_mtls_config()
            
            async with httpx.AsyncClient(
                timeout=MojaloopConfig.TRANSFER_TIMEOUT_SECONDS,
                cert=mtls_config[:2] if mtls_config else None,
                verify=mtls_config[2] if mtls_config else True
            ) as client:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                elif method == "POST":
                    response = await client.post(url, headers=headers, json=body)
                elif method == "PUT":
                    response = await client.put(url, headers=headers, json=body)
                else:
                    raise ValueError(f"Unsupported method: {method}")
                
                if response.status_code in [200, 202]:
                    if response.content:
                        return response.json()
                    return {}
                else:
                    logger.error(
                        "Mojaloop request failed",
                        status=response.status_code,
                        body=response.text
                    )
                    return None
                    
        except Exception as e:
            logger.error("Mojaloop request exception", error=str(e))
            return None
    
    # ==================== Party Lookup ====================
    
    async def lookup_party(
        self,
        party_id_type: PartyIdType,
        party_id: str
    ) -> Optional[Party]:
        """
        Lookup a party (account holder) in the Mojaloop network.
        
        This is the first step in a transfer - identify the recipient
        and their DFSP.
        """
        path = f"/parties/{party_id_type.value}/{party_id}"
        
        result = await self._make_request("GET", path)
        
        if result and "party" in result:
            party_data = result["party"]
            party_id_info = party_data.get("partyIdInfo", {})
            personal_info = party_data.get("personalInfo", {})
            complex_name = personal_info.get("complexName", {})
            
            return Party(
                party_id_type=PartyIdType(party_id_info.get("partyIdType")),
                party_id=party_id_info.get("partyIdentifier"),
                fsp_id=party_id_info.get("fspId"),
                name=party_data.get("name"),
                first_name=complex_name.get("firstName"),
                last_name=complex_name.get("lastName")
            )
        
        return None
    
    async def handle_party_lookup_callback(
        self,
        party_id_type: PartyIdType,
        party_id: str
    ) -> Optional[Party]:
        """
        Handle incoming party lookup request from another DFSP.
        
        Returns party info if the account exists in our system.
        """
        # Look up account in our system
        account_id = string_to_u128(f"account:{party_id_type.value}:{party_id}")
        account = tigerbeetle_client.lookup_account(account_id)
        
        if not account:
            logger.info("Party not found", party_id_type=party_id_type.value, party_id=party_id)
            return None
        
        # Return party info
        return Party(
            party_id_type=party_id_type,
            party_id=party_id,
            fsp_id=MojaloopConfig.DFSP_ID,
            name=f"NeoBank Customer {party_id[-4:]}"  # Masked name
        )
    
    # ==================== Quotes ====================
    
    async def request_quote(
        self,
        payer: Party,
        payee: Party,
        amount: Money,
        amount_type: AmountType = AmountType.SEND
    ) -> Optional[Quote]:
        """
        Request a quote for a transfer.
        
        This gets the fees and FX rate for the transfer.
        """
        quote_id = str(uuid.uuid4())
        transaction_id = str(uuid.uuid4())
        
        # Generate ILP condition
        condition, fulfilment = self.ilp.generate_condition()
        
        # Store fulfilment for later
        self._pending_fulfilments[transaction_id] = fulfilment
        
        # Calculate expiration
        expiration = datetime.now(timezone.utc) + timedelta(
            seconds=MojaloopConfig.QUOTE_EXPIRY_SECONDS
        )
        
        quote = Quote(
            quote_id=quote_id,
            transaction_id=transaction_id,
            payer=payer,
            payee=payee,
            amount_type=amount_type,
            amount=amount,
            condition=condition,
            expiration=expiration.isoformat()
        )
        
        path = "/quotes"
        result = await self._make_request(
            "POST",
            path,
            body=quote.to_dict(),
            destination_fsp=payee.fsp_id
        )
        
        if result:
            # Store quote
            self._quotes[quote_id] = quote
            return quote
        
        return None
    
    async def handle_quote_request(
        self,
        quote_request: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Handle incoming quote request from another DFSP.
        
        Calculate fees and return quote response.
        """
        quote_id = quote_request.get("quoteId")
        amount = Decimal(quote_request.get("amount", {}).get("amount", "0"))
        currency = quote_request.get("amount", {}).get("currency", "NGN")
        
        # Calculate fees (example: 1% fee, min 10 NGN)
        fee_percentage = Decimal("0.01")
        min_fee = Decimal("10")
        fee = max(amount * fee_percentage, min_fee)
        
        # Transfer amount = amount + fee (for SEND type)
        transfer_amount = amount + fee
        
        # Generate ILP packet and condition
        expiration = datetime.now(timezone.utc) + timedelta(
            seconds=MojaloopConfig.QUOTE_EXPIRY_SECONDS
        )
        condition, fulfilment = self.ilp.generate_condition()
        
        # Store fulfilment
        self._pending_fulfilments[quote_id] = fulfilment
        
        ilp_packet = self.ilp.generate_packet(
            destination_account=f"g.neobank.{quote_request.get('payee', {}).get('partyIdInfo', {}).get('partyIdentifier', '')}",
            amount=transfer_amount,
            currency=currency,
            expiry=expiration
        )
        
        return {
            "transferAmount": {
                "currency": currency,
                "amount": str(transfer_amount)
            },
            "payeeFspFee": {
                "currency": currency,
                "amount": str(fee)
            },
            "expiration": expiration.isoformat(),
            "ilpPacket": ilp_packet,
            "condition": condition
        }
    
    # ==================== Transfers ====================
    
    async def initiate_transfer(
        self,
        quote: Quote,
        payer_account_id: str
    ) -> Optional[Transfer]:
        """
        Initiate a transfer based on an accepted quote.
        
        This reserves funds in TigerBeetle and sends the transfer
        to the Mojaloop hub.
        """
        if not quote.condition or not quote.transfer_amount:
            logger.error("Quote missing required fields")
            return None
        
        transfer_id = str(uuid.uuid4())
        
        # Reserve funds in TigerBeetle (pending transfer)
        payer_tb_id = string_to_u128(payer_account_id)
        mojaloop_position_id = string_to_u128(f"mojaloop:position:{MojaloopConfig.DFSP_ID}")
        
        amount_cents = int(quote.transfer_amount.to_decimal() * 100)
        tb_transfer_id = string_to_u128(f"mojaloop:transfer:{transfer_id}")
        
        error = tigerbeetle_client.create_pending_transfer(
            transfer_id=tb_transfer_id,
            debit_account_id=payer_tb_id,
            credit_account_id=mojaloop_position_id,
            amount=amount_cents,
            ledger=Ledger.MOJALOOP_POSITION,
            code=TransferCode.MOJALOOP_TRANSFER,
            timeout_seconds=MojaloopConfig.TRANSFER_TIMEOUT_SECONDS
        )
        
        if error:
            logger.error("Failed to reserve funds", error=error)
            return None
        
        # Calculate expiration
        expiration = datetime.now(timezone.utc) + timedelta(
            seconds=MojaloopConfig.TRANSFER_TIMEOUT_SECONDS
        )
        
        # Generate ILP packet
        ilp_packet = self.ilp.generate_packet(
            destination_account=f"g.{quote.payee.fsp_id}.{quote.payee.party_id}",
            amount=quote.transfer_amount.to_decimal(),
            currency=quote.transfer_amount.currency,
            expiry=expiration
        )
        
        transfer = Transfer(
            transfer_id=transfer_id,
            payer_fsp=MojaloopConfig.DFSP_ID,
            payee_fsp=quote.payee.fsp_id or "",
            amount=quote.transfer_amount,
            ilp_packet=ilp_packet,
            condition=quote.condition,
            expiration=expiration.isoformat(),
            state=TransferState.RESERVED
        )
        
        # Send to Mojaloop hub
        path = "/transfers"
        result = await self._make_request(
            "POST",
            path,
            body=transfer.to_dict(),
            destination_fsp=quote.payee.fsp_id
        )
        
        if result:
            self._transfers[transfer_id] = transfer
            return transfer
        else:
            # Void the pending transfer
            void_id = string_to_u128(f"mojaloop:void:{transfer_id}")
            tigerbeetle_client.void_pending_transfer(void_id, tb_transfer_id)
            return None
    
    async def handle_transfer_request(
        self,
        transfer_request: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Handle incoming transfer request from another DFSP.
        
        Verify the transfer and credit the payee's account.
        """
        transfer_id = transfer_request.get("transferId")
        amount = Decimal(transfer_request.get("amount", {}).get("amount", "0"))
        currency = transfer_request.get("amount", {}).get("currency", "NGN")
        condition = transfer_request.get("condition")
        ilp_packet = transfer_request.get("ilpPacket")
        
        # Decode ILP packet to get destination
        try:
            packet_data = json.loads(
                base64.urlsafe_b64decode(ilp_packet + "==").decode()
            )
            destination = packet_data.get("destination", "")
            # Extract account ID from destination (g.neobank.{account_id})
            parts = destination.split(".")
            if len(parts) >= 3:
                payee_id = parts[-1]
            else:
                payee_id = destination
        except Exception:
            logger.error("Failed to decode ILP packet")
            return None
        
        # Get fulfilment for this transfer
        fulfilment = self._pending_fulfilments.get(transfer_id)
        if not fulfilment:
            # Generate new fulfilment if we don't have one
            # (This happens when we're the payee DFSP)
            _, fulfilment = self.ilp.generate_condition()
        
        # Credit payee's account in TigerBeetle
        payee_tb_id = string_to_u128(f"account:MSISDN:{payee_id}")
        mojaloop_position_id = string_to_u128(f"mojaloop:position:{MojaloopConfig.DFSP_ID}")
        
        amount_cents = int(amount * 100)
        tb_transfer_id = string_to_u128(f"mojaloop:receive:{transfer_id}")
        
        error = tigerbeetle_client.create_transfer(
            transfer_id=tb_transfer_id,
            debit_account_id=mojaloop_position_id,
            credit_account_id=payee_tb_id,
            amount=amount_cents,
            ledger=Ledger.MOJALOOP_POSITION,
            code=TransferCode.MOJALOOP_TRANSFER
        )
        
        if error:
            logger.error("Failed to credit payee", error=error)
            return {"transferState": TransferState.ABORTED.value}
        
        return {
            "fulfilment": fulfilment,
            "completedTimestamp": datetime.now(timezone.utc).isoformat(),
            "transferState": TransferState.COMMITTED.value
        }
    
    async def handle_transfer_fulfilment(
        self,
        transfer_id: str,
        fulfilment: str
    ) -> bool:
        """
        Handle transfer fulfilment callback.
        
        Verify fulfilment and commit the pending transfer.
        """
        transfer = self._transfers.get(transfer_id)
        if not transfer:
            logger.error("Transfer not found", transfer_id=transfer_id)
            return False
        
        # Verify fulfilment matches condition
        if not self.ilp.verify_fulfilment(transfer.condition, fulfilment):
            logger.error("Fulfilment verification failed", transfer_id=transfer_id)
            return False
        
        # Commit the pending transfer in TigerBeetle
        tb_transfer_id = string_to_u128(f"mojaloop:transfer:{transfer_id}")
        post_id = string_to_u128(f"mojaloop:commit:{transfer_id}")
        
        error = tigerbeetle_client.post_pending_transfer(post_id, tb_transfer_id)
        
        if error:
            logger.error("Failed to commit transfer", error=error)
            return False
        
        # Update transfer state
        transfer.state = TransferState.COMMITTED
        transfer.fulfilment = fulfilment
        transfer.completed_timestamp = datetime.now(timezone.utc).isoformat()
        
        logger.info("Transfer committed", transfer_id=transfer_id)
        return True
    
    async def handle_transfer_error(
        self,
        transfer_id: str,
        error_info: Dict[str, Any]
    ) -> bool:
        """
        Handle transfer error callback.
        
        Void the pending transfer and release reserved funds.
        """
        transfer = self._transfers.get(transfer_id)
        if not transfer:
            logger.error("Transfer not found", transfer_id=transfer_id)
            return False
        
        # Void the pending transfer in TigerBeetle
        tb_transfer_id = string_to_u128(f"mojaloop:transfer:{transfer_id}")
        void_id = string_to_u128(f"mojaloop:void:{transfer_id}")
        
        error = tigerbeetle_client.void_pending_transfer(void_id, tb_transfer_id)
        
        if error:
            logger.error("Failed to void transfer", error=error)
            return False
        
        # Update transfer state
        transfer.state = TransferState.ABORTED
        
        logger.info("Transfer aborted", transfer_id=transfer_id, error=error_info)
        return True
    
    # ==================== Settlement ====================
    
    async def process_settlement(
        self,
        settlement_id: str,
        settlements: List[Dict[str, Any]]
    ) -> bool:
        """
        Process settlement from Mojaloop hub.
        
        This reconciles the position account with actual settlements.
        """
        for settlement in settlements:
            participant_id = settlement.get("participantId")
            if participant_id != MojaloopConfig.DFSP_ID:
                continue
            
            amount = Decimal(settlement.get("amount", "0"))
            currency = settlement.get("currency", "NGN")
            
            # Create settlement transfer in TigerBeetle
            mojaloop_position_id = string_to_u128(f"mojaloop:position:{MojaloopConfig.DFSP_ID}")
            settlement_account_id = string_to_u128(f"mojaloop:settlement:{MojaloopConfig.DFSP_ID}")
            
            amount_cents = int(amount * 100)
            tb_transfer_id = string_to_u128(f"mojaloop:settlement:{settlement_id}")
            
            if amount > 0:
                # We owe money - debit position, credit settlement
                error = tigerbeetle_client.create_transfer(
                    transfer_id=tb_transfer_id,
                    debit_account_id=mojaloop_position_id,
                    credit_account_id=settlement_account_id,
                    amount=amount_cents,
                    ledger=Ledger.MOJALOOP_SETTLEMENT,
                    code=TransferCode.MOJALOOP_SETTLEMENT
                )
            else:
                # We're owed money - debit settlement, credit position
                error = tigerbeetle_client.create_transfer(
                    transfer_id=tb_transfer_id,
                    debit_account_id=settlement_account_id,
                    credit_account_id=mojaloop_position_id,
                    amount=abs(amount_cents),
                    ledger=Ledger.MOJALOOP_SETTLEMENT,
                    code=TransferCode.MOJALOOP_SETTLEMENT
                )
            
            if error:
                logger.error("Settlement transfer failed", error=error)
                return False
        
        logger.info("Settlement processed", settlement_id=settlement_id)
        return True
    
    # ==================== Account Setup ====================
    
    async def setup_mojaloop_accounts(self) -> bool:
        """
        Set up TigerBeetle accounts for Mojaloop integration.
        
        Creates position and settlement accounts.
        """
        position_id = string_to_u128(f"mojaloop:position:{MojaloopConfig.DFSP_ID}")
        settlement_id = string_to_u128(f"mojaloop:settlement:{MojaloopConfig.DFSP_ID}")
        
        # Create position account (tracks net position with hub)
        success1 = tigerbeetle_client.create_account(
            account_id=position_id,
            ledger=Ledger.MOJALOOP_POSITION,
            code=AccountCode.MOJALOOP_DFSP
        )
        
        # Create settlement account (tracks settled amounts)
        success2 = tigerbeetle_client.create_account(
            account_id=settlement_id,
            ledger=Ledger.MOJALOOP_SETTLEMENT,
            code=AccountCode.MOJALOOP_DFSP
        )
        
        return success1 and success2


# Global service instance
mojaloop_service = MojaloopDFSPService()
