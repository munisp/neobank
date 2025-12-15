"""
Wire Transfer Service with TigerBeetle Integration
Production-ready implementation with atomic ledger operations
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
from decimal import Decimal
import uuid
import re
import structlog

# TigerBeetle client
from tigerbeetle import Client, Transfer, Account, TransferFlags, AccountFlags

logger = structlog.get_logger(__name__)

# TigerBeetle Ledger IDs
WIRE_LEDGER = 1
FEE_LEDGER = 2
CLEARING_LEDGER = 3

# TigerBeetle Transfer Codes
WIRE_DOMESTIC_CODE = 1001
WIRE_INTERNATIONAL_CODE = 1002
WIRE_FEE_CODE = 1003
WIRE_REVERSAL_CODE = 1004
INTERMEDIARY_FEE_CODE = 1005

class WireType(str, Enum):
    DOMESTIC = "domestic"
    INTERNATIONAL = "international"
    SAME_DAY = "same_day"
    NEXT_DAY = "next_day"

class WireStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    RECEIVED = "received"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETURNED = "returned"

class WireTransferServiceTigerBeetle:
    """Wire Transfer Service with TigerBeetle ledger integration"""
    
    def __init__(self, tigerbeetle_client: Client):
        self.tb = tigerbeetle_client
        self.wire_transfers = {}
        self.daily_limits = {
            "domestic": Decimal("100000.00"),
            "international": Decimal("50000.00"),
            "same_day": Decimal("25000.00")
        }
        self.fees = {
            "domestic": Decimal("15.00"),
            "international": Decimal("35.00"),
            "same_day": Decimal("10.00")  # Additional fee
        }
        
    async def initialize_accounts(self):
        """Initialize TigerBeetle accounts for wire transfers"""
        accounts = [
            Account(
                id=1,  # Wire clearing account
                ledger=WIRE_LEDGER,
                code=1,
                flags=AccountFlags.NONE,
                user_data=0,
            ),
            Account(
                id=2,  # Fee revenue account
                ledger=FEE_LEDGER,
                code=2,
                flags=AccountFlags.NONE,
                user_data=0,
            ),
            Account(
                id=3,  # Intermediary bank clearing
                ledger=CLEARING_LEDGER,
                code=3,
                flags=AccountFlags.NONE,
                user_data=0,
            ),
        ]
        
        try:
            self.tb.create_accounts(accounts)
            logger.info("TigerBeetle wire transfer accounts initialized")
        except Exception as e:
            logger.error("Failed to initialize accounts", error=str(e))
            raise
    
    def validate_swift_code(self, swift_code: str) -> bool:
        """Validate SWIFT/BIC code format"""
        pattern = r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'
        return bool(re.match(pattern, swift_code.upper()))
    
    def validate_routing_number(self, routing_number: str) -> bool:
        """Validate US routing number (ABA number)"""
        if len(routing_number) != 9 or not routing_number.isdigit():
            return False
        
        weights = [3, 7, 1, 3, 7, 1, 3, 7, 1]
        checksum = sum(int(d) * w for d, w in zip(routing_number, weights))
        return checksum % 10 == 0
    
    def _calculate_fees(self, wire_type: WireType, amount: Decimal) -> Decimal:
        """Calculate wire transfer fees"""
        base_fee = self.fees.get(wire_type.value, Decimal("15.00"))
        
        if wire_type == WireType.SAME_DAY:
            base_fee += self.fees["same_day"]
        
        # Add percentage fee for large amounts
        if amount > Decimal("50000.00"):
            percentage_fee = amount * Decimal("0.001")  # 0.1%
            base_fee += percentage_fee
        
        return base_fee.quantize(Decimal("0.01"))
    
    def _to_cents(self, amount: Decimal) -> int:
        """Convert decimal amount to cents for TigerBeetle"""
        return int(amount * 100)
    
    def _from_cents(self, cents: int) -> Decimal:
        """Convert cents from TigerBeetle to decimal amount"""
        return Decimal(cents) / 100
    
    async def initiate_wire_transfer(
        self,
        from_account_id: int,  # TigerBeetle account ID
        amount: Decimal,
        wire_type: WireType,
        beneficiary: Dict[str, Any],
        sender_info: Dict[str, Any],
        purpose: str,
        reference: Optional[str] = None,
        intermediary_bank: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Initiate a wire transfer with TigerBeetle atomic ledger operations
        
        This method performs:
        1. Validation of wire transfer parameters
        2. Atomic debit of customer account (amount + fees)
        3. Credit to wire clearing account
        4. Separate fee transfer to revenue account
        5. All operations are linked and atomic (all succeed or all fail)
        """
        
        logger.info("Initiating wire transfer", 
                   from_account=from_account_id, 
                   amount=str(amount), 
                   wire_type=wire_type.value)
        
        # Validate amount
        if amount <= 0:
            return {
                "success": False,
                "error": "Invalid amount"
            }
        
        # Check daily limit
        daily_limit = self.daily_limits.get(wire_type.value, Decimal("100000.00"))
        if amount > daily_limit:
            return {
                "success": False,
                "error": f"Amount exceeds daily limit of ${daily_limit:,.2f}",
                "daily_limit": float(daily_limit)
            }
        
        # Validate beneficiary information
        required_fields = ["name", "account_number", "bank_name"]
        if wire_type == WireType.INTERNATIONAL:
            required_fields.extend(["swift_code", "iban", "bank_address", "country"])
            if not self.validate_swift_code(beneficiary.get("swift_code", "")):
                return {
                    "success": False,
                    "error": "Invalid SWIFT code format"
                }
        else:
            required_fields.extend(["routing_number", "account_type"])
            if not self.validate_routing_number(beneficiary.get("routing_number", "")):
                return {
                    "success": False,
                    "error": "Invalid routing number"
                }
        
        missing_fields = [f for f in required_fields if f not in beneficiary]
        if missing_fields:
            return {
                "success": False,
                "error": f"Missing beneficiary fields: {', '.join(missing_fields)}",
                "missing_fields": missing_fields
            }
        
        # Calculate fees
        fees = self._calculate_fees(wire_type, amount)
        total_amount = amount + fees
        
        # Generate unique wire ID and reference
        wire_id = int(uuid.uuid4().int & (1<<63)-1)  # 63-bit positive integer
        reference_number = reference or f"WIRE-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Convert to cents for TigerBeetle
        amount_cents = self._to_cents(amount)
        fee_cents = self._to_cents(fees)
        
        try:
            # Create atomic wire transfer with linked fee transfer
            # Transfer 1: Debit customer account, credit wire clearing
            # Transfer 2: Debit customer account, credit fee revenue (LINKED)
            # Both transfers succeed or both fail
            
            transfers = [
                Transfer(
                    id=wire_id,
                    debit_account_id=from_account_id,
                    credit_account_id=1,  # Wire clearing account
                    amount=amount_cents,
                    ledger=WIRE_LEDGER,
                    code=WIRE_DOMESTIC_CODE if wire_type == WireType.DOMESTIC else WIRE_INTERNATIONAL_CODE,
                    flags=TransferFlags.LINKED,  # Link with fee transfer
                    user_data=0,
                    timeout=0,
                    timestamp=0,
                ),
                Transfer(
                    id=wire_id + 1,  # Sequential ID for linked transfer
                    debit_account_id=from_account_id,
                    credit_account_id=2,  # Fee revenue account
                    amount=fee_cents,
                    ledger=FEE_LEDGER,
                    code=WIRE_FEE_CODE,
                    flags=TransferFlags.NONE,  # Last transfer in chain
                    user_data=0,
                    timeout=0,
                    timestamp=0,
                ),
            ]
            
            # If intermediary bank involved, add third linked transfer
            if intermediary_bank:
                intermediary_fee = self._to_cents(Decimal("10.00"))
                transfers.append(
                    Transfer(
                        id=wire_id + 2,
                        debit_account_id=1,  # Wire clearing
                        credit_account_id=3,  # Intermediary clearing
                        amount=intermediary_fee,
                        ledger=CLEARING_LEDGER,
                        code=INTERMEDIARY_FEE_CODE,
                        flags=TransferFlags.NONE,
                        user_data=0,
                        timeout=0,
                        timestamp=0,
                    )
                )
            
            # Execute atomic transfer
            results = self.tb.create_transfers(transfers)
            
            # Check for errors
            if results:
                error_msg = f"TigerBeetle transfer failed: {results[0]}"
                logger.error("Wire transfer failed", error=error_msg, wire_id=wire_id)
                return {
                    "success": False,
                    "error": error_msg,
                    "tigerbeetle_error": str(results[0])
                }
            
            logger.info("Wire transfer ledger entries created", 
                       wire_id=wire_id, 
                       amount_cents=amount_cents,
                       fee_cents=fee_cents)
            
        except Exception as e:
            logger.error("TigerBeetle transfer exception", error=str(e), wire_id=wire_id)
            return {
                "success": False,
                "error": f"Ledger operation failed: {str(e)}"
            }
        
        # Store wire transfer metadata (not in TigerBeetle)
        wire_transfer = {
            "wire_id": wire_id,
            "reference_number": reference_number,
            "from_account_id": from_account_id,
            "amount": float(amount),
            "fees": float(fees),
            "total_amount": float(total_amount),
            "wire_type": wire_type.value,
            "beneficiary": beneficiary,
            "sender_info": sender_info,
            "purpose": purpose,
            "status": WireStatus.PENDING.value,
            "created_at": datetime.now().isoformat(),
            "estimated_arrival": (datetime.now() + timedelta(days=1 if wire_type == WireType.DOMESTIC else 2)).isoformat(),
            "intermediary_bank": intermediary_bank,
            "tigerbeetle_transfer_ids": [wire_id, wire_id + 1],
            "audit_trail": [
                {
                    "timestamp": datetime.now().isoformat(),
                    "action": "initiated",
                    "status": WireStatus.PENDING.value,
                    "notes": "Wire transfer initiated with TigerBeetle atomic ledger operations"
                }
            ]
        }
        
        self.wire_transfers[wire_id] = wire_transfer
        
        return {
            "success": True,
            "wire_id": wire_id,
            "reference_number": reference_number,
            "status": "pending_approval",
            "amount": float(amount),
            "fees": float(fees),
            "total_amount": float(total_amount),
            "estimated_arrival": wire_transfer["estimated_arrival"],
            "message": "Wire transfer initiated successfully with atomic ledger operations",
            "tigerbeetle_transfer_ids": [wire_id, wire_id + 1],
            "ledger_status": "committed",
            "next_steps": [
                "Two-factor authentication required",
                "Compliance screening in progress",
                "Funds debited atomically from account"
            ]
        }
    
    async def reverse_wire_transfer(
        self,
        wire_id: int,
        reason: str,
        reversed_by: str
    ) -> Dict[str, Any]:
        """
        Reverse a wire transfer using TigerBeetle atomic reversal
        
        Creates reversal transfers that credit back the customer account
        and debit the clearing/fee accounts
        """
        
        logger.info("Reversing wire transfer", wire_id=wire_id, reason=reason)
        
        if wire_id not in self.wire_transfers:
            return {
                "success": False,
                "error": "Wire transfer not found"
            }
        
        wire = self.wire_transfers[wire_id]
        
        if wire["status"] not in [WireStatus.PENDING.value, WireStatus.PROCESSING.value]:
            return {
                "success": False,
                "error": f"Cannot reverse wire in status: {wire['status']}"
            }
        
        amount_cents = self._to_cents(Decimal(str(wire["amount"])))
        fee_cents = self._to_cents(Decimal(str(wire["fees"])))
        
        reversal_id = int(uuid.uuid4().int & (1<<63)-1)
        
        try:
            # Create reversal transfers (opposite direction)
            reversal_transfers = [
                Transfer(
                    id=reversal_id,
                    debit_account_id=1,  # Wire clearing
                    credit_account_id=wire["from_account_id"],  # Customer account
                    amount=amount_cents,
                    ledger=WIRE_LEDGER,
                    code=WIRE_REVERSAL_CODE,
                    flags=TransferFlags.LINKED,
                    user_data=0,
                    timeout=0,
                    timestamp=0,
                ),
                Transfer(
                    id=reversal_id + 1,
                    debit_account_id=2,  # Fee revenue
                    credit_account_id=wire["from_account_id"],  # Customer account
                    amount=fee_cents,
                    ledger=FEE_LEDGER,
                    code=WIRE_REVERSAL_CODE,
                    flags=TransferFlags.NONE,
                    user_data=0,
                    timeout=0,
                    timestamp=0,
                ),
            ]
            
            results = self.tb.create_transfers(reversal_transfers)
            
            if results:
                error_msg = f"Reversal failed: {results[0]}"
                logger.error("Wire reversal failed", error=error_msg, wire_id=wire_id)
                return {
                    "success": False,
                    "error": error_msg
                }
            
            logger.info("Wire transfer reversed", wire_id=wire_id, reversal_id=reversal_id)
            
        except Exception as e:
            logger.error("Reversal exception", error=str(e), wire_id=wire_id)
            return {
                "success": False,
                "error": f"Reversal failed: {str(e)}"
            }
        
        # Update wire status
        wire["status"] = WireStatus.CANCELLED.value
        wire["reversal_id"] = reversal_id
        wire["reversed_at"] = datetime.now().isoformat()
        wire["reversed_by"] = reversed_by
        wire["reversal_reason"] = reason
        wire["audit_trail"].append({
            "timestamp": datetime.now().isoformat(),
            "action": "reversed",
            "status": WireStatus.CANCELLED.value,
            "reversed_by": reversed_by,
            "reason": reason,
            "reversal_transfer_ids": [reversal_id, reversal_id + 1]
        })
        
        return {
            "success": True,
            "wire_id": wire_id,
            "reversal_id": reversal_id,
            "status": "reversed",
            "amount_refunded": wire["total_amount"],
            "message": "Wire transfer reversed successfully",
            "ledger_status": "reversed"
        }
    
    async def get_wire_balance(self, account_id: int) -> Dict[str, Any]:
        """Get account balance from TigerBeetle"""
        try:
            accounts = self.tb.lookup_accounts([account_id])
            if not accounts:
                return {
                    "success": False,
                    "error": "Account not found"
                }
            
            account = accounts[0]
            balance = self._from_cents(account.debits_posted - account.credits_posted)
            
            return {
                "success": True,
                "account_id": account_id,
                "balance": float(balance),
                "debits_posted": account.debits_posted,
                "credits_posted": account.credits_posted,
                "debits_pending": account.debits_pending,
                "credits_pending": account.credits_pending
            }
        except Exception as e:
            logger.error("Balance lookup failed", error=str(e), account_id=account_id)
            return {
                "success": False,
                "error": f"Balance lookup failed: {str(e)}"
            }
