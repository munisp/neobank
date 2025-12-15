"""
ACH Processing Service
Handles ACH (Automated Clearing House) transfers for direct deposits, bill payments, and transfers
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
import uuid
import re

class ACHType(str, Enum):
    CREDIT = "credit"  # Money coming in (direct deposit, refunds)
    DEBIT = "debit"    # Money going out (bill payments, transfers)

class ACHClass(str, Enum):
    PPD = "ppd"  # Prearranged Payment and Deposit (consumer)
    CCD = "ccd"  # Corporate Credit or Debit
    WEB = "web"  # Internet-initiated
    TEL = "tel"  # Telephone-initiated
    POP = "pop"  # Point of Purchase
    ARC = "arc"  # Accounts Receivable Conversion
    BOC = "boc"  # Back Office Conversion

class ACHStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SUBMITTED = "submitted"
    SETTLED = "settled"
    RETURNED = "returned"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ReturnCode(str, Enum):
    R01 = "insufficient_funds"
    R02 = "account_closed"
    R03 = "no_account"
    R04 = "invalid_account_number"
    R05 = "unauthorized_debit"
    R06 = "returned_per_request"
    R07 = "authorization_revoked"
    R08 = "payment_stopped"
    R09 = "uncollected_funds"
    R10 = "customer_advises_not_authorized"

class ACHProcessingService:
    """Service for processing ACH transfers"""
    
    def __init__(self):
        self.ach_transfers = {}
        self.ach_batches = {}
        self.recurring_ach = {}
        self.ach_limits = {
            "daily_debit": 10000.00,
            "daily_credit": 50000.00,
            "monthly_debit": 100000.00,
            "monthly_credit": 500000.00
        }
        
    def validate_routing_number(self, routing_number: str) -> bool:
        """Validate routing number using ABA checksum"""
        if len(routing_number) != 9 or not routing_number.isdigit():
            return False
        
        # ABA checksum algorithm
        weights = [3, 7, 1, 3, 7, 1, 3, 7, 1]
        checksum = sum(int(d) * w for d, w in zip(routing_number, weights))
        
        return checksum % 10 == 0
    
    def validate_account_number(self, account_number: str) -> bool:
        """Validate account number format"""
        # Account numbers are typically 4-17 digits
        return 4 <= len(account_number) <= 17 and account_number.isdigit()
    
    async def initiate_ach_transfer(
        self,
        from_account_id: str,
        amount: float,
        ach_type: ACHType,
        ach_class: ACHClass,
        recipient: Dict[str, Any],
        description: str,
        effective_date: Optional[str] = None,
        same_day: bool = False
    ) -> Dict[str, Any]:
        """
        Initiate an ACH transfer
        
        Args:
            from_account_id: Source account ID
            amount: Transfer amount
            ach_type: Credit or debit
            ach_class: ACH SEC code
            recipient: Recipient bank and account details
            description: Transaction description
            effective_date: Desired effective date (default: next business day)
            same_day: Use same-day ACH (additional fee)
            
        Returns:
            ACH transfer initiation result
        """
        
        # Validate amount
        if amount <= 0:
            return {
                "success": False,
                "error": "Invalid amount"
            }
        
        # Check limits
        limit_key = f"daily_{ach_type.value}"
        if amount > self.ach_limits.get(limit_key, 10000.00):
            return {
                "success": False,
                "error": f"Amount exceeds daily {ach_type.value} limit",
                "limit": self.ach_limits[limit_key]
            }
        
        # Validate recipient information
        required_fields = ["name", "account_number", "routing_number", "account_type"]
        missing_fields = [f for f in required_fields if f not in recipient]
        
        if missing_fields:
            return {
                "success": False,
                "error": f"Missing recipient fields: {', '.join(missing_fields)}",
                "missing_fields": missing_fields
            }
        
        # Validate routing number
        if not self.validate_routing_number(recipient["routing_number"]):
            return {
                "success": False,
                "error": "Invalid routing number"
            }
        
        # Validate account number
        if not self.validate_account_number(recipient["account_number"]):
            return {
                "success": False,
                "error": "Invalid account number format"
            }
        
        # Calculate effective date
        if not effective_date:
            # Next business day for standard ACH
            # Same day for same-day ACH (if before cutoff)
            days_ahead = 0 if same_day else 1
            effective_date = (datetime.now() + timedelta(days=days_ahead)).date().isoformat()
        
        # Validate effective date
        effective_dt = datetime.fromisoformat(effective_date)
        if effective_dt.date() < datetime.now().date():
            return {
                "success": False,
                "error": "Effective date cannot be in the past"
            }
        
        # Check same-day ACH cutoff (2:45 PM ET)
        if same_day:
            cutoff_hour = 14  # 2 PM local time
            if datetime.now().hour >= cutoff_hour:
                return {
                    "success": False,
                    "error": "Same-day ACH cutoff time passed (2:45 PM ET)",
                    "message": "Please use standard ACH or try again tomorrow"
                }
        
        # Calculate fees
        fees = self._calculate_ach_fees(amount, same_day)
        
        # Generate ACH transfer ID and trace number
        ach_id = str(uuid.uuid4())
        trace_number = self._generate_trace_number()
        
        # Create ACH transfer record
        ach_transfer = {
            "ach_id": ach_id,
            "trace_number": trace_number,
            "from_account_id": from_account_id,
            "ach_type": ach_type.value,
            "ach_class": ach_class.value,
            "amount": amount,
            "fees": fees,
            "recipient": recipient,
            "description": description,
            "effective_date": effective_date,
            "same_day": same_day,
            "status": ACHStatus.PENDING.value,
            "initiated_date": datetime.now().isoformat(),
            "submission_date": None,
            "settlement_date": None,
            "return_code": None,
            "return_reason": None,
            "addenda": [],
            "audit_trail": [
                {
                    "timestamp": datetime.now().isoformat(),
                    "action": "initiated",
                    "status": ACHStatus.PENDING.value,
                    "notes": "ACH transfer initiated"
                }
            ]
        }
        
        self.ach_transfers[ach_id] = ach_transfer
        
        return {
            "success": True,
            "ach_id": ach_id,
            "trace_number": trace_number,
            "status": "pending",
            "amount": amount,
            "fees": fees,
            "effective_date": effective_date,
            "same_day": same_day,
            "message": "ACH transfer initiated successfully",
            "settlement_time": "Same day" if same_day else "1-2 business days",
            "cutoff_time": "2:45 PM ET" if same_day else "5:00 PM ET"
        }
    
    async def submit_ach_batch(
        self,
        ach_ids: List[str],
        batch_name: str
    ) -> Dict[str, Any]:
        """Submit multiple ACH transfers as a batch"""
        
        # Validate all ACH transfers exist
        invalid_ids = [ach_id for ach_id in ach_ids if ach_id not in self.ach_transfers]
        if invalid_ids:
            return {
                "success": False,
                "error": "Some ACH transfers not found",
                "invalid_ids": invalid_ids
            }
        
        # Validate all are pending
        non_pending = [
            ach_id for ach_id in ach_ids
            if self.ach_transfers[ach_id]["status"] != ACHStatus.PENDING.value
        ]
        if non_pending:
            return {
                "success": False,
                "error": "Some ACH transfers are not pending",
                "non_pending_ids": non_pending
            }
        
        # Create batch
        batch_id = str(uuid.uuid4())
        batch = {
            "batch_id": batch_id,
            "batch_name": batch_name,
            "ach_ids": ach_ids,
            "total_credits": sum(
                self.ach_transfers[ach_id]["amount"]
                for ach_id in ach_ids
                if self.ach_transfers[ach_id]["ach_type"] == ACHType.CREDIT.value
            ),
            "total_debits": sum(
                self.ach_transfers[ach_id]["amount"]
                for ach_id in ach_ids
                if self.ach_transfers[ach_id]["ach_type"] == ACHType.DEBIT.value
            ),
            "transfer_count": len(ach_ids),
            "submission_date": datetime.now().isoformat(),
            "status": "submitted",
            "nacha_file": None
        }
        
        # Update all ACH transfers to submitted
        for ach_id in ach_ids:
            ach = self.ach_transfers[ach_id]
            ach["status"] = ACHStatus.SUBMITTED.value
            ach["submission_date"] = datetime.now().isoformat()
            ach["batch_id"] = batch_id
            
            ach["audit_trail"].append({
                "timestamp": datetime.now().isoformat(),
                "action": "submitted",
                "status": ACHStatus.SUBMITTED.value,
                "batch_id": batch_id
            })
        
        # Generate NACHA file
        batch["nacha_file"] = self._generate_nacha_file(batch, ach_ids)
        
        self.ach_batches[batch_id] = batch
        
        return {
            "success": True,
            "batch_id": batch_id,
            "batch_name": batch_name,
            "transfer_count": len(ach_ids),
            "total_credits": batch["total_credits"],
            "total_debits": batch["total_debits"],
            "status": "submitted",
            "message": "ACH batch submitted successfully",
            "nacha_file_generated": True
        }
    
    async def setup_recurring_ach(
        self,
        from_account_id: str,
        amount: float,
        ach_type: ACHType,
        recipient: Dict[str, Any],
        description: str,
        frequency: str,  # daily, weekly, biweekly, monthly, quarterly
        start_date: str,
        end_date: Optional[str] = None,
        max_occurrences: Optional[int] = None
    ) -> Dict[str, Any]:
        """Setup recurring ACH transfer"""
        
        # Validate frequency
        valid_frequencies = ["daily", "weekly", "biweekly", "monthly", "quarterly", "annually"]
        if frequency not in valid_frequencies:
            return {
                "success": False,
                "error": f"Invalid frequency. Must be one of: {', '.join(valid_frequencies)}"
            }
        
        # Validate dates
        start_dt = datetime.fromisoformat(start_date)
        if start_dt.date() < datetime.now().date():
            return {
                "success": False,
                "error": "Start date cannot be in the past"
            }
        
        if end_date:
            end_dt = datetime.fromisoformat(end_date)
            if end_dt <= start_dt:
                return {
                    "success": False,
                    "error": "End date must be after start date"
                }
        
        # Create recurring ACH
        recurring_id = str(uuid.uuid4())
        recurring = {
            "recurring_id": recurring_id,
            "from_account_id": from_account_id,
            "amount": amount,
            "ach_type": ach_type.value,
            "recipient": recipient,
            "description": description,
            "frequency": frequency,
            "start_date": start_date,
            "end_date": end_date,
            "max_occurrences": max_occurrences,
            "occurrence_count": 0,
            "next_execution_date": start_date,
            "status": "active",
            "created_date": datetime.now().isoformat(),
            "execution_history": []
        }
        
        self.recurring_ach[recurring_id] = recurring
        
        return {
            "success": True,
            "recurring_id": recurring_id,
            "status": "active",
            "frequency": frequency,
            "next_execution_date": start_date,
            "message": "Recurring ACH setup successfully"
        }
    
    async def process_ach_return(
        self,
        ach_id: str,
        return_code: ReturnCode,
        return_reason: str
    ) -> Dict[str, Any]:
        """Process ACH return"""
        
        if ach_id not in self.ach_transfers:
            return {
                "success": False,
                "error": "ACH transfer not found"
            }
        
        ach = self.ach_transfers[ach_id]
        
        # Update status
        ach["status"] = ACHStatus.RETURNED.value
        ach["return_code"] = return_code.value
        ach["return_reason"] = return_reason
        ach["return_date"] = datetime.now().isoformat()
        
        # Add audit trail
        ach["audit_trail"].append({
            "timestamp": datetime.now().isoformat(),
            "action": "returned",
            "status": ACHStatus.RETURNED.value,
            "return_code": return_code.value,
            "return_reason": return_reason
        })
        
        # Determine if retry is possible
        retryable_codes = [ReturnCode.R01, ReturnCode.R09]  # Insufficient/uncollected funds
        can_retry = return_code in retryable_codes
        
        return {
            "success": True,
            "ach_id": ach_id,
            "status": "returned",
            "return_code": return_code.value,
            "return_reason": return_reason,
            "can_retry": can_retry,
            "message": "ACH return processed",
            "next_steps": [
                "Review return reason",
                "Contact recipient if needed",
                "Retry transfer if eligible" if can_retry else "Cannot retry this transfer"
            ]
        }
    
    async def cancel_ach_transfer(
        self,
        ach_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Cancel pending ACH transfer"""
        
        if ach_id not in self.ach_transfers:
            return {
                "success": False,
                "error": "ACH transfer not found"
            }
        
        ach = self.ach_transfers[ach_id]
        
        # Can only cancel pending transfers
        if ach["status"] != ACHStatus.PENDING.value:
            return {
                "success": False,
                "error": f"Cannot cancel ACH with status: {ach['status']}"
            }
        
        # Update status
        ach["status"] = ACHStatus.CANCELLED.value
        ach["cancelled_date"] = datetime.now().isoformat()
        ach["cancelled_by"] = user_id
        
        # Add audit trail
        ach["audit_trail"].append({
            "timestamp": datetime.now().isoformat(),
            "action": "cancelled",
            "status": ACHStatus.CANCELLED.value,
            "cancelled_by": user_id
        })
        
        return {
            "success": True,
            "ach_id": ach_id,
            "status": "cancelled",
            "message": "ACH transfer cancelled successfully"
        }
    
    async def track_ach_transfer(
        self,
        ach_id: Optional[str] = None,
        trace_number: Optional[str] = None
    ) -> Dict[str, Any]:
        """Track ACH transfer status"""
        
        # Find ACH transfer
        ach = None
        if ach_id:
            ach = self.ach_transfers.get(ach_id)
        elif trace_number:
            ach = next(
                (a for a in self.ach_transfers.values() if a["trace_number"] == trace_number),
                None
            )
        
        if not ach:
            return {
                "success": False,
                "error": "ACH transfer not found"
            }
        
        return {
            "success": True,
            "ach_id": ach["ach_id"],
            "trace_number": ach["trace_number"],
            "status": ach["status"],
            "amount": ach["amount"],
            "recipient_name": ach["recipient"]["name"],
            "effective_date": ach["effective_date"],
            "initiated_date": ach["initiated_date"],
            "settlement_date": ach.get("settlement_date"),
            "return_code": ach.get("return_code"),
            "return_reason": ach.get("return_reason"),
            "audit_trail": ach["audit_trail"]
        }
    
    async def get_ach_history(
        self,
        account_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        ach_type: Optional[ACHType] = None
    ) -> Dict[str, Any]:
        """Get ACH transfer history"""
        
        transfers = [
            t for t in self.ach_transfers.values()
            if t["from_account_id"] == account_id
        ]
        
        # Filter by date range
        if start_date:
            start = datetime.fromisoformat(start_date)
            transfers = [t for t in transfers if datetime.fromisoformat(t["initiated_date"]) >= start]
        
        if end_date:
            end = datetime.fromisoformat(end_date)
            transfers = [t for t in transfers if datetime.fromisoformat(t["initiated_date"]) <= end]
        
        # Filter by type
        if ach_type:
            transfers = [t for t in transfers if t["ach_type"] == ach_type.value]
        
        # Calculate totals
        total_credits = sum(t["amount"] for t in transfers if t["ach_type"] == ACHType.CREDIT.value)
        total_debits = sum(t["amount"] for t in transfers if t["ach_type"] == ACHType.DEBIT.value)
        
        return {
            "success": True,
            "account_id": account_id,
            "transfer_count": len(transfers),
            "total_credits": total_credits,
            "total_debits": total_debits,
            "transfers": transfers
        }
    
    def _calculate_ach_fees(self, amount: float, same_day: bool) -> Dict[str, float]:
        """Calculate ACH fees"""
        
        base_fee = 0.25  # Standard ACH fee
        same_day_fee = 1.00 if same_day else 0.00
        
        # Volume discount (over 100 transfers per month)
        volume_discount = 0.00  # In production, calculate based on monthly volume
        
        total_fee = base_fee + same_day_fee - volume_discount
        
        return {
            "base_fee": base_fee,
            "same_day_fee": same_day_fee,
            "volume_discount": volume_discount,
            "total_fee": total_fee
        }
    
    def _generate_trace_number(self) -> str:
        """Generate ACH trace number"""
        # Format: 8-digit routing + 7-digit sequence
        routing = "02100001"  # Bank routing number
        sequence = str(uuid.uuid4().int)[:7]
        return routing + sequence
    
    def _generate_nacha_file(self, batch: Dict[str, Any], ach_ids: List[str]) -> str:
        """Generate NACHA file format"""
        
        # Simplified NACHA file format
        lines = []
        
        # File Header Record (Type 1)
        lines.append("101 021000018 1234567890" + datetime.now().strftime("%y%m%d%H%M") + "A094101BANK NAME           COMPANY NAME           ")
        
        # Batch Header Record (Type 5)
        lines.append("5200COMPANY NAME                        1234567890PPDPAYROLL        " + datetime.now().strftime("%y%m%d") + "   1021000010000001")
        
        # Entry Detail Records (Type 6)
        for ach_id in ach_ids:
            ach = self.ach_transfers[ach_id]
            transaction_code = "22" if ach["ach_type"] == ACHType.CREDIT.value else "27"
            lines.append(f"6{transaction_code}{ach['recipient']['routing_number']}{ach['recipient']['account_number']}        {int(ach['amount']*100):010d}{ach['trace_number']}               0{ach['recipient']['name'][:22]:22s}  0")
        
        # Batch Control Record (Type 8)
        lines.append(f"82000000{len(ach_ids):06d}000000000000{int(batch['total_credits']*100):012d}000000000000{int(batch['total_debits']*100):012d}1234567890                         021000010000001")
        
        # File Control Record (Type 9)
        lines.append(f"9000001000001{len(ach_ids):08d}000000000000{int(batch['total_credits']*100):012d}000000000000{int(batch['total_debits']*100):012d}" + " " * 39)
        
        return "\n".join(lines)

