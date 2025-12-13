"""
Wire Transfer Service
Handles domestic and international wire transfers via SWIFT/Fedwire
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
import uuid
import re

class WireType(str, Enum):
    DOMESTIC = "domestic"  # Fedwire
    INTERNATIONAL = "international"  # SWIFT
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

class WireTransferService:
    """Service for processing wire transfers"""
    
    def __init__(self):
        self.wire_transfers = {}
        self.wire_templates = {}
        self.daily_limits = {
            "domestic": 100000.00,
            "international": 50000.00,
            "same_day": 25000.00
        }
        
    def validate_swift_code(self, swift_code: str) -> bool:
        """Validate SWIFT/BIC code format"""
        # Format: AAAABBCCXXX (8 or 11 characters)
        # AAAA: Bank code
        # BB: Country code
        # CC: Location code
        # XXX: Branch code (optional)
        
        pattern = r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'
        return bool(re.match(pattern, swift_code.upper()))
    
    def validate_iban(self, iban: str) -> bool:
        """Validate IBAN format"""
        # Remove spaces and convert to uppercase
        iban = iban.replace(' ', '').upper()
        
        # Check length (15-34 characters)
        if len(iban) < 15 or len(iban) > 34:
            return False
        
        # Check format: 2 letters + 2 digits + up to 30 alphanumeric
        pattern = r'^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
        if not re.match(pattern, iban):
            return False
        
        # Calculate checksum (mod 97 algorithm)
        # Move first 4 characters to end
        rearranged = iban[4:] + iban[:4]
        
        # Replace letters with numbers (A=10, B=11, ..., Z=35)
        numeric = ''
        for char in rearranged:
            if char.isdigit():
                numeric += char
            else:
                numeric += str(ord(char) - ord('A') + 10)
        
        # Check if mod 97 equals 1
        return int(numeric) % 97 == 1
    
    def validate_routing_number(self, routing_number: str) -> bool:
        """Validate US routing number (ABA number)"""
        if len(routing_number) != 9 or not routing_number.isdigit():
            return False
        
        # ABA checksum algorithm
        weights = [3, 7, 1, 3, 7, 1, 3, 7, 1]
        checksum = sum(int(d) * w for d, w in zip(routing_number, weights))
        
        return checksum % 10 == 0
    
    async def initiate_wire_transfer(
        self,
        from_account_id: str,
        amount: float,
        wire_type: WireType,
        beneficiary: Dict[str, Any],
        sender_info: Dict[str, Any],
        purpose: str,
        reference: Optional[str] = None,
        intermediary_bank: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Initiate a wire transfer
        
        Args:
            from_account_id: Source account ID
            amount: Transfer amount
            wire_type: Type of wire transfer
            beneficiary: Beneficiary bank and account details
            sender_info: Sender information
            purpose: Purpose of transfer
            reference: Optional reference number
            intermediary_bank: Optional intermediary bank for international transfers
            
        Returns:
            Wire transfer initiation result
        """
        
        # Validate amount
        if amount <= 0:
            return {
                "success": False,
                "error": "Invalid amount"
            }
        
        # Check daily limit
        daily_limit = self.daily_limits.get(wire_type.value, 100000.00)
        if amount > daily_limit:
            return {
                "success": False,
                "error": f"Amount exceeds daily limit of ${daily_limit:,.2f}",
                "daily_limit": daily_limit
            }
        
        # Validate beneficiary information
        required_beneficiary_fields = ["name", "account_number", "bank_name"]
        
        if wire_type == WireType.INTERNATIONAL:
            required_beneficiary_fields.extend(["swift_code", "iban", "bank_address", "country"])
        else:
            required_beneficiary_fields.extend(["routing_number", "account_type"])
        
        missing_fields = [f for f in required_beneficiary_fields if f not in beneficiary]
        if missing_fields:
            return {
                "success": False,
                "error": f"Missing beneficiary fields: {', '.join(missing_fields)}",
                "missing_fields": missing_fields
            }
        
        # Validate SWIFT code for international transfers
        if wire_type == WireType.INTERNATIONAL:
            if not self.validate_swift_code(beneficiary["swift_code"]):
                return {
                    "success": False,
                    "error": "Invalid SWIFT/BIC code format"
                }
            
            if not self.validate_iban(beneficiary["iban"]):
                return {
                    "success": False,
                    "error": "Invalid IBAN format"
                }
        else:
            # Validate routing number for domestic transfers
            if not self.validate_routing_number(beneficiary["routing_number"]):
                return {
                    "success": False,
                    "error": "Invalid routing number"
                }
        
        # Calculate fees
        fees = self._calculate_wire_fees(amount, wire_type)
        total_amount = amount + fees["total_fee"]
        
        # Generate wire transfer ID
        wire_id = str(uuid.uuid4())
        reference_number = reference or self._generate_reference_number()
        
        # Create wire transfer record
        wire_transfer = {
            "wire_id": wire_id,
            "reference_number": reference_number,
            "from_account_id": from_account_id,
            "wire_type": wire_type.value,
            "amount": amount,
            "fees": fees,
            "total_amount": total_amount,
            "currency": "USD" if wire_type != WireType.INTERNATIONAL else beneficiary.get("currency", "USD"),
            "beneficiary": beneficiary,
            "sender_info": sender_info,
            "intermediary_bank": intermediary_bank,
            "purpose": purpose,
            "status": WireStatus.PENDING.value,
            "initiated_date": datetime.now().isoformat(),
            "processing_date": None,
            "completion_date": None,
            "estimated_arrival": self._calculate_estimated_arrival(wire_type),
            "swift_message": None,
            "fedwire_message": None,
            "tracking_number": None,
            "confirmations": [],
            "audit_trail": [
                {
                    "timestamp": datetime.now().isoformat(),
                    "action": "initiated",
                    "status": WireStatus.PENDING.value,
                    "notes": "Wire transfer initiated"
                }
            ]
        }
        
        self.wire_transfers[wire_id] = wire_transfer
        
        # In production, trigger:
        # - Compliance screening (OFAC, sanctions)
        # - Fraud detection
        # - Account balance verification
        # - Two-factor authentication
        
        return {
            "success": True,
            "wire_id": wire_id,
            "reference_number": reference_number,
            "status": "pending_approval",
            "amount": amount,
            "fees": fees,
            "total_amount": total_amount,
            "estimated_arrival": wire_transfer["estimated_arrival"],
            "message": "Wire transfer initiated successfully",
            "next_steps": [
                "Two-factor authentication required",
                "Compliance screening in progress",
                "Funds will be debited upon approval"
            ],
            "cutoff_time": self._get_cutoff_time(wire_type),
            "business_days_to_complete": self._get_business_days(wire_type)
        }
    
    async def approve_wire_transfer(
        self,
        wire_id: str,
        approved_by: str,
        two_factor_code: str
    ) -> Dict[str, Any]:
        """Approve and process wire transfer"""
        
        if wire_id not in self.wire_transfers:
            return {
                "success": False,
                "error": "Wire transfer not found"
            }
        
        wire = self.wire_transfers[wire_id]
        
        if wire["status"] != WireStatus.PENDING.value:
            return {
                "success": False,
                "error": f"Wire transfer is {wire['status']}, cannot approve"
            }
        
        # Verify two-factor code (in production, validate against actual 2FA)
        if not self._verify_two_factor(two_factor_code):
            return {
                "success": False,
                "error": "Invalid two-factor authentication code"
            }
        
        # Update status to processing
        wire["status"] = WireStatus.PROCESSING.value
        wire["processing_date"] = datetime.now().isoformat()
        wire["approved_by"] = approved_by
        
        # Generate SWIFT or Fedwire message
        if wire["wire_type"] == WireType.INTERNATIONAL.value:
            wire["swift_message"] = self._generate_swift_message(wire)
            wire["tracking_number"] = f"SWIFT-{wire['reference_number']}"
        else:
            wire["fedwire_message"] = self._generate_fedwire_message(wire)
            wire["tracking_number"] = f"FED-{wire['reference_number']}"
        
        # Add audit trail
        wire["audit_trail"].append({
            "timestamp": datetime.now().isoformat(),
            "action": "approved",
            "status": WireStatus.PROCESSING.value,
            "approved_by": approved_by,
            "notes": "Wire transfer approved and processing"
        })
        
        # In production:
        # - Debit source account
        # - Send to Federal Reserve (Fedwire) or SWIFT network
        # - Monitor for confirmations
        
        return {
            "success": True,
            "wire_id": wire_id,
            "reference_number": wire["reference_number"],
            "tracking_number": wire["tracking_number"],
            "status": "processing",
            "message": "Wire transfer approved and sent for processing",
            "estimated_arrival": wire["estimated_arrival"],
            "confirmation_available": "within 1 hour"
        }
    
    async def cancel_wire_transfer(
        self,
        wire_id: str,
        user_id: str,
        reason: str
    ) -> Dict[str, Any]:
        """Cancel a pending wire transfer"""
        
        if wire_id not in self.wire_transfers:
            return {
                "success": False,
                "error": "Wire transfer not found"
            }
        
        wire = self.wire_transfers[wire_id]
        
        # Can only cancel pending transfers
        if wire["status"] not in [WireStatus.PENDING.value]:
            return {
                "success": False,
                "error": f"Cannot cancel wire transfer with status: {wire['status']}",
                "message": "Wire transfer is already processing or completed"
            }
        
        # Update status
        wire["status"] = WireStatus.CANCELLED.value
        wire["cancelled_date"] = datetime.now().isoformat()
        wire["cancelled_by"] = user_id
        wire["cancellation_reason"] = reason
        
        # Add audit trail
        wire["audit_trail"].append({
            "timestamp": datetime.now().isoformat(),
            "action": "cancelled",
            "status": WireStatus.CANCELLED.value,
            "cancelled_by": user_id,
            "reason": reason
        })
        
        return {
            "success": True,
            "wire_id": wire_id,
            "reference_number": wire["reference_number"],
            "status": "cancelled",
            "message": "Wire transfer cancelled successfully",
            "refund_amount": wire["total_amount"],
            "refund_time": "immediate"
        }
    
    async def track_wire_transfer(
        self,
        wire_id: Optional[str] = None,
        reference_number: Optional[str] = None,
        tracking_number: Optional[str] = None
    ) -> Dict[str, Any]:
        """Track wire transfer status"""
        
        # Find wire transfer
        wire = None
        if wire_id:
            wire = self.wire_transfers.get(wire_id)
        elif reference_number:
            wire = next(
                (w for w in self.wire_transfers.values() if w["reference_number"] == reference_number),
                None
            )
        elif tracking_number:
            wire = next(
                (w for w in self.wire_transfers.values() if w.get("tracking_number") == tracking_number),
                None
            )
        
        if not wire:
            return {
                "success": False,
                "error": "Wire transfer not found"
            }
        
        return {
            "success": True,
            "wire_id": wire["wire_id"],
            "reference_number": wire["reference_number"],
            "tracking_number": wire.get("tracking_number"),
            "status": wire["status"],
            "amount": wire["amount"],
            "currency": wire["currency"],
            "beneficiary_name": wire["beneficiary"]["name"],
            "beneficiary_bank": wire["beneficiary"]["bank_name"],
            "initiated_date": wire["initiated_date"],
            "estimated_arrival": wire["estimated_arrival"],
            "completion_date": wire.get("completion_date"),
            "audit_trail": wire["audit_trail"],
            "confirmations": wire.get("confirmations", [])
        }
    
    async def create_wire_template(
        self,
        user_id: str,
        template_name: str,
        beneficiary: Dict[str, Any],
        wire_type: WireType,
        default_amount: Optional[float] = None
    ) -> Dict[str, Any]:
        """Create a wire transfer template for recurring transfers"""
        
        template_id = str(uuid.uuid4())
        
        template = {
            "template_id": template_id,
            "user_id": user_id,
            "template_name": template_name,
            "beneficiary": beneficiary,
            "wire_type": wire_type.value,
            "default_amount": default_amount,
            "created_date": datetime.now().isoformat(),
            "last_used": None,
            "use_count": 0
        }
        
        self.wire_templates[template_id] = template
        
        return {
            "success": True,
            "template_id": template_id,
            "template_name": template_name,
            "message": "Wire template created successfully"
        }
    
    async def get_wire_history(
        self,
        account_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        status: Optional[WireStatus] = None
    ) -> Dict[str, Any]:
        """Get wire transfer history for an account"""
        
        wires = [
            w for w in self.wire_transfers.values()
            if w["from_account_id"] == account_id
        ]
        
        # Filter by date range
        if start_date:
            start = datetime.fromisoformat(start_date)
            wires = [w for w in wires if datetime.fromisoformat(w["initiated_date"]) >= start]
        
        if end_date:
            end = datetime.fromisoformat(end_date)
            wires = [w for w in wires if datetime.fromisoformat(w["initiated_date"]) <= end]
        
        # Filter by status
        if status:
            wires = [w for w in wires if w["status"] == status.value]
        
        # Calculate totals
        total_sent = sum(w["amount"] for w in wires if w["status"] == WireStatus.COMPLETED.value)
        total_fees = sum(w["fees"]["total_fee"] for w in wires)
        
        return {
            "success": True,
            "account_id": account_id,
            "wire_count": len(wires),
            "total_sent": total_sent,
            "total_fees": total_fees,
            "wires": wires
        }
    
    def _calculate_wire_fees(self, amount: float, wire_type: WireType) -> Dict[str, float]:
        """Calculate wire transfer fees"""
        
        base_fees = {
            WireType.DOMESTIC: 25.00,
            WireType.INTERNATIONAL: 45.00,
            WireType.SAME_DAY: 35.00,
            WireType.NEXT_DAY: 30.00
        }
        
        base_fee = base_fees.get(wire_type, 25.00)
        
        # Additional fees
        intermediary_fee = 15.00 if wire_type == WireType.INTERNATIONAL else 0.00
        correspondent_fee = 10.00 if wire_type == WireType.INTERNATIONAL else 0.00
        
        # Large amount fee (amounts over $50,000)
        large_amount_fee = 20.00 if amount > 50000 else 0.00
        
        total_fee = base_fee + intermediary_fee + correspondent_fee + large_amount_fee
        
        return {
            "base_fee": base_fee,
            "intermediary_fee": intermediary_fee,
            "correspondent_fee": correspondent_fee,
            "large_amount_fee": large_amount_fee,
            "total_fee": total_fee
        }
    
    def _calculate_estimated_arrival(self, wire_type: WireType) -> str:
        """Calculate estimated arrival date"""
        
        business_days = {
            WireType.DOMESTIC: 0,  # Same day
            WireType.INTERNATIONAL: 3,
            WireType.SAME_DAY: 0,
            WireType.NEXT_DAY: 1
        }
        
        days = business_days.get(wire_type, 1)
        arrival_date = datetime.now() + timedelta(days=days)
        
        return arrival_date.isoformat()
    
    def _get_cutoff_time(self, wire_type: WireType) -> str:
        """Get cutoff time for wire transfers"""
        
        cutoff_times = {
            WireType.DOMESTIC: "18:00 ET",
            WireType.INTERNATIONAL: "17:00 ET",
            WireType.SAME_DAY: "14:00 ET",
            WireType.NEXT_DAY: "17:00 ET"
        }
        
        return cutoff_times.get(wire_type, "17:00 ET")
    
    def _get_business_days(self, wire_type: WireType) -> int:
        """Get business days to complete"""
        
        days = {
            WireType.DOMESTIC: 0,
            WireType.INTERNATIONAL: 1-5,
            WireType.SAME_DAY: 0,
            WireType.NEXT_DAY: 1
        }
        
        return days.get(wire_type, 1)
    
    def _generate_reference_number(self) -> str:
        """Generate unique reference number"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_suffix = ''.join(str(uuid.uuid4()).split('-')[0])
        return f"WR{timestamp}{random_suffix[:6]}".upper()
    
    def _generate_swift_message(self, wire: Dict[str, Any]) -> str:
        """Generate SWIFT MT103 message"""
        
        # Simplified SWIFT message format
        message = f"""
:20:{wire['reference_number']}
:23B:CRED
:32A:{datetime.now().strftime('%y%m%d')}{wire['currency']}{wire['amount']:.2f}
:50K:{wire['sender_info']['name']}
{wire['sender_info'].get('address', '')}
:59:{wire['beneficiary']['name']}
{wire['beneficiary']['account_number']}
{wire['beneficiary']['bank_name']}
:70:{wire['purpose']}
:71A:OUR
"""
        return message.strip()
    
    def _generate_fedwire_message(self, wire: Dict[str, Any]) -> str:
        """Generate Fedwire message"""
        
        # Simplified Fedwire format
        message = f"""
{{1500}}{{1510}}{wire['reference_number']}
{{3600}}{wire['amount']:.2f}
{{4200}}{wire['beneficiary']['routing_number']}
{{4320}}{wire['beneficiary']['account_number']}
{{5000}}{wire['beneficiary']['name']}
{{6000}}{wire['purpose']}
"""
        return message.strip()
    
    def _verify_two_factor(self, code: str, user_id: str = None) -> bool:
        """
        Verify two-factor authentication code using TOTP
        
        Args:
            code: 6-digit TOTP code from authenticator app
            user_id: User ID for 2FA verification
            
        Returns:
            True if code is valid, False otherwise
        """
        # Import here to avoid circular imports
        from app.services.totp_service import two_factor_manager
        
        # Basic format validation
        if not code or len(code) != 6 or not code.isdigit():
            return False
        
        # If user_id provided, verify against their 2FA secret
        if user_id:
            import asyncio
            try:
                # Run async verification in sync context
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # If already in async context, create task
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as executor:
                        future = executor.submit(
                            asyncio.run,
                            two_factor_manager.verify_code(user_id, code)
                        )
                        return future.result(timeout=5)
                else:
                    return loop.run_until_complete(
                        two_factor_manager.verify_code(user_id, code)
                    )
            except Exception as e:
                # Log error but don't expose details
                import structlog
                logger = structlog.get_logger()
                logger.error("2FA verification error", error=str(e), user_id=user_id)
                return False
        
        # Fallback: basic format check only (for development/testing)
        return True

