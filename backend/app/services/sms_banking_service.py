"""
SMS Banking Service for NeoBank

Provides banking services via SMS for basic phones and areas with
limited data connectivity. Supports both inbound SMS commands and
outbound notifications/alerts.

Integrates with Africa's Talking, Twilio, and Infobip SMS gateways.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


class SMSProvider(Enum):
    """Supported SMS gateway providers"""
    AFRICAS_TALKING = "africas_talking"
    TWILIO = "twilio"
    INFOBIP = "infobip"
    TERMII = "termii"  # Popular in Nigeria


class SMSCommandType(Enum):
    """Types of SMS commands"""
    BALANCE = "balance"
    SEND = "send"
    AIRTIME = "airtime"
    STATEMENT = "statement"
    HELP = "help"
    REGISTER = "register"
    PIN = "pin"
    BLOCK = "block"
    UNKNOWN = "unknown"


@dataclass
class SMSMessage:
    """Represents an SMS message"""
    message_id: str
    sender: str
    recipient: str
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    provider: SMSProvider = SMSProvider.AFRICAS_TALKING


@dataclass
class SMSResponse:
    """Response to send back via SMS"""
    recipient: str
    content: str
    message_id: Optional[str] = None
    
    def __post_init__(self):
        # SMS has 160 character limit for single message
        # Truncate if necessary
        if len(self.content) > 160:
            self.content = self.content[:157] + "..."


class SMSBankingService:
    """
    SMS Banking Service
    
    Provides banking functionality via SMS commands for basic phones.
    Supports balance checks, transfers, airtime, and mini statements.
    
    Command Format Examples:
    - BAL <PIN> - Check balance
    - SEND <PHONE> <AMOUNT> <PIN> - Send money
    - AIR <PHONE> <AMOUNT> <PIN> - Buy airtime
    - STMT <PIN> - Mini statement
    - HELP - Get help
    - PIN <OLD> <NEW> <CONFIRM> - Change PIN
    - BLOCK - Block account (emergency)
    """
    
    # SMS short codes by country
    SHORT_CODES = {
        "NG": "32123",  # Nigeria
        "KE": "22123",  # Kenya
        "ZA": "32123",  # South Africa
        "GH": "1234",   # Ghana
    }
    
    # Rate limiting: max SMS per phone per hour
    RATE_LIMIT = 20
    
    def __init__(self, provider: SMSProvider = SMSProvider.AFRICAS_TALKING):
        self.provider = provider
        self._rate_limits: Dict[str, List[datetime]] = {}
        # In production, these would be database-backed
        self._user_pins: Dict[str, str] = {}
        self._blocked_accounts: set = set()
    
    async def handle_incoming_sms(self, message: SMSMessage) -> SMSResponse:
        """
        Handle incoming SMS message
        
        Args:
            message: Incoming SMS message
            
        Returns:
            SMSResponse to send back to user
        """
        sender = self._normalize_phone(message.sender)
        content = message.content.strip().upper()
        
        logger.info(
            "SMS received",
            sender=sender[-4:],
            content_length=len(content)
        )
        
        # Check rate limiting
        if self._is_rate_limited(sender):
            return SMSResponse(
                recipient=sender,
                content="Too many requests. Please try again later."
            )
        
        # Check if account is blocked
        if sender in self._blocked_accounts:
            return SMSResponse(
                recipient=sender,
                content="Account blocked. Call 0800-NEOBANK to unblock."
            )
        
        # Parse command
        command_type, params = self._parse_command(content)
        
        # Handle command
        try:
            return await self._process_command(sender, command_type, params)
        except Exception as e:
            logger.error("SMS processing error", error=str(e), sender=sender[-4:])
            return SMSResponse(
                recipient=sender,
                content="Error processing request. Please try again."
            )
    
    def _parse_command(self, content: str) -> Tuple[SMSCommandType, List[str]]:
        """Parse SMS content into command and parameters"""
        parts = content.split()
        
        if not parts:
            return SMSCommandType.UNKNOWN, []
        
        command = parts[0]
        params = parts[1:] if len(parts) > 1 else []
        
        command_map = {
            "BAL": SMSCommandType.BALANCE,
            "BALANCE": SMSCommandType.BALANCE,
            "B": SMSCommandType.BALANCE,
            "SEND": SMSCommandType.SEND,
            "TRANSFER": SMSCommandType.SEND,
            "S": SMSCommandType.SEND,
            "T": SMSCommandType.SEND,
            "AIR": SMSCommandType.AIRTIME,
            "AIRTIME": SMSCommandType.AIRTIME,
            "A": SMSCommandType.AIRTIME,
            "STMT": SMSCommandType.STATEMENT,
            "STATEMENT": SMSCommandType.STATEMENT,
            "ST": SMSCommandType.STATEMENT,
            "HELP": SMSCommandType.HELP,
            "H": SMSCommandType.HELP,
            "?": SMSCommandType.HELP,
            "REG": SMSCommandType.REGISTER,
            "REGISTER": SMSCommandType.REGISTER,
            "PIN": SMSCommandType.PIN,
            "BLOCK": SMSCommandType.BLOCK,
            "STOP": SMSCommandType.BLOCK,
        }
        
        return command_map.get(command, SMSCommandType.UNKNOWN), params
    
    async def _process_command(
        self,
        sender: str,
        command_type: SMSCommandType,
        params: List[str]
    ) -> SMSResponse:
        """Process parsed command"""
        
        handlers = {
            SMSCommandType.BALANCE: self._handle_balance,
            SMSCommandType.SEND: self._handle_send,
            SMSCommandType.AIRTIME: self._handle_airtime,
            SMSCommandType.STATEMENT: self._handle_statement,
            SMSCommandType.HELP: self._handle_help,
            SMSCommandType.REGISTER: self._handle_register,
            SMSCommandType.PIN: self._handle_pin_change,
            SMSCommandType.BLOCK: self._handle_block,
            SMSCommandType.UNKNOWN: self._handle_unknown,
        }
        
        handler = handlers.get(command_type, self._handle_unknown)
        return await handler(sender, params)
    
    async def _handle_balance(self, sender: str, params: List[str]) -> SMSResponse:
        """
        Handle balance check
        Format: BAL <PIN>
        """
        if len(params) < 1:
            return SMSResponse(
                recipient=sender,
                content="Format: BAL <PIN>\nExample: BAL 1234"
            )
        
        pin = params[0]
        
        # Verify user and PIN
        user = await self._get_user_by_phone(sender)
        if not user:
            return SMSResponse(
                recipient=sender,
                content="Not registered. Download NeoBank app to register."
            )
        
        if not await self._verify_pin(user["id"], pin):
            return SMSResponse(
                recipient=sender,
                content="Invalid PIN. Try again or call 0800-NEOBANK."
            )
        
        # Get balance
        balance = await self._get_balance(user["id"])
        
        return SMSResponse(
            recipient=sender,
            content=f"NeoBank Balance\nAvailable: NGN {balance:,.2f}\n{datetime.now().strftime('%d/%m %H:%M')}"
        )
    
    async def _handle_send(self, sender: str, params: List[str]) -> SMSResponse:
        """
        Handle money transfer
        Format: SEND <PHONE> <AMOUNT> <PIN>
        """
        if len(params) < 3:
            return SMSResponse(
                recipient=sender,
                content="Format: SEND <PHONE> <AMOUNT> <PIN>\nExample: SEND 08012345678 5000 1234"
            )
        
        recipient_phone = self._normalize_phone(params[0])
        try:
            amount = Decimal(params[1])
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return SMSResponse(
                recipient=sender,
                content="Invalid amount. Example: SEND 08012345678 5000 1234"
            )
        
        pin = params[2]
        
        # Verify user and PIN
        user = await self._get_user_by_phone(sender)
        if not user:
            return SMSResponse(
                recipient=sender,
                content="Not registered. Download NeoBank app."
            )
        
        if not await self._verify_pin(user["id"], pin):
            return SMSResponse(
                recipient=sender,
                content="Invalid PIN."
            )
        
        # Check balance
        balance = await self._get_balance(user["id"])
        fee = self._calculate_fee(amount)
        total = amount + fee
        
        if total > balance:
            return SMSResponse(
                recipient=sender,
                content=f"Insufficient balance. Available: NGN {balance:,.2f}"
            )
        
        # SMS transfer limit
        if amount > 50000:
            return SMSResponse(
                recipient=sender,
                content="SMS transfer limit is NGN 50,000. Use app for larger amounts."
            )
        
        # Process transfer
        result = await self._process_transfer(user["id"], recipient_phone, amount)
        
        if result["success"]:
            return SMSResponse(
                recipient=sender,
                content=f"Sent NGN {amount:,.0f} to {recipient_phone[-4:]}. Ref:{result['reference']}. Bal:NGN {result['balance']:,.0f}"
            )
        else:
            return SMSResponse(
                recipient=sender,
                content=f"Transfer failed: {result['error']}"
            )
    
    async def _handle_airtime(self, sender: str, params: List[str]) -> SMSResponse:
        """
        Handle airtime purchase
        Format: AIR <PHONE> <AMOUNT> <PIN>
        or: AIR <AMOUNT> <PIN> (for self)
        """
        if len(params) < 2:
            return SMSResponse(
                recipient=sender,
                content="Format: AIR <PHONE> <AMOUNT> <PIN> or AIR <AMOUNT> <PIN> (self)"
            )
        
        # Determine if buying for self or other
        if len(params) == 2:
            # Self purchase
            recipient_phone = sender
            try:
                amount = Decimal(params[0])
            except (ValueError, TypeError):
                return SMSResponse(
                    recipient=sender,
                    content="Invalid amount."
                )
            pin = params[1]
        else:
            # Other number
            recipient_phone = self._normalize_phone(params[0])
            try:
                amount = Decimal(params[1])
            except (ValueError, TypeError):
                return SMSResponse(
                    recipient=sender,
                    content="Invalid amount."
                )
            pin = params[2]
        
        if amount < 50 or amount > 50000:
            return SMSResponse(
                recipient=sender,
                content="Airtime amount must be NGN 50 - 50,000"
            )
        
        # Verify user and PIN
        user = await self._get_user_by_phone(sender)
        if not user:
            return SMSResponse(
                recipient=sender,
                content="Not registered."
            )
        
        if not await self._verify_pin(user["id"], pin):
            return SMSResponse(
                recipient=sender,
                content="Invalid PIN."
            )
        
        # Check balance
        balance = await self._get_balance(user["id"])
        if amount > balance:
            return SMSResponse(
                recipient=sender,
                content=f"Insufficient balance. Available: NGN {balance:,.2f}"
            )
        
        # Process airtime purchase
        result = await self._process_airtime(user["id"], recipient_phone, amount)
        
        if result["success"]:
            return SMSResponse(
                recipient=sender,
                content=f"NGN {amount:,.0f} airtime sent to {recipient_phone[-4:]}. Ref:{result['reference']}"
            )
        else:
            return SMSResponse(
                recipient=sender,
                content=f"Airtime failed: {result['error']}"
            )
    
    async def _handle_statement(self, sender: str, params: List[str]) -> SMSResponse:
        """
        Handle mini statement
        Format: STMT <PIN>
        """
        if len(params) < 1:
            return SMSResponse(
                recipient=sender,
                content="Format: STMT <PIN>"
            )
        
        pin = params[0]
        
        # Verify user and PIN
        user = await self._get_user_by_phone(sender)
        if not user:
            return SMSResponse(
                recipient=sender,
                content="Not registered."
            )
        
        if not await self._verify_pin(user["id"], pin):
            return SMSResponse(
                recipient=sender,
                content="Invalid PIN."
            )
        
        # Get recent transactions
        transactions = await self._get_recent_transactions(user["id"], limit=3)
        balance = await self._get_balance(user["id"])
        
        if not transactions:
            return SMSResponse(
                recipient=sender,
                content=f"No recent transactions. Bal: NGN {balance:,.0f}"
            )
        
        # Format mini statement (must fit in 160 chars)
        stmt = "NeoBank\n"
        for tx in transactions:
            sign = "+" if tx["type"] == "credit" else "-"
            stmt += f"{tx['date']} {sign}{tx['amount']:,.0f}\n"
        stmt += f"Bal: NGN {balance:,.0f}"
        
        return SMSResponse(
            recipient=sender,
            content=stmt
        )
    
    async def _handle_help(self, sender: str, params: List[str]) -> SMSResponse:
        """Handle help request"""
        return SMSResponse(
            recipient=sender,
            content="NeoBank SMS:\nBAL <PIN> - Balance\nSEND <PHONE> <AMT> <PIN>\nAIR <AMT> <PIN>\nSTMT <PIN>\nPIN <OLD> <NEW> <NEW>"
        )
    
    async def _handle_register(self, sender: str, params: List[str]) -> SMSResponse:
        """Handle registration request"""
        return SMSResponse(
            recipient=sender,
            content="To register, download NeoBank app from neobank.com or dial *347*123# for USSD registration."
        )
    
    async def _handle_pin_change(self, sender: str, params: List[str]) -> SMSResponse:
        """
        Handle PIN change
        Format: PIN <OLD_PIN> <NEW_PIN> <CONFIRM_PIN>
        """
        if len(params) < 3:
            return SMSResponse(
                recipient=sender,
                content="Format: PIN <OLD> <NEW> <CONFIRM>\nExample: PIN 1234 5678 5678"
            )
        
        old_pin = params[0]
        new_pin = params[1]
        confirm_pin = params[2]
        
        # Verify user
        user = await self._get_user_by_phone(sender)
        if not user:
            return SMSResponse(
                recipient=sender,
                content="Not registered."
            )
        
        # Verify old PIN
        if not await self._verify_pin(user["id"], old_pin):
            return SMSResponse(
                recipient=sender,
                content="Current PIN is incorrect."
            )
        
        # Validate new PIN
        if len(new_pin) != 4 or not new_pin.isdigit():
            return SMSResponse(
                recipient=sender,
                content="New PIN must be 4 digits."
            )
        
        if new_pin != confirm_pin:
            return SMSResponse(
                recipient=sender,
                content="New PINs don't match."
            )
        
        # Check for weak PINs
        weak_pins = ["0000", "1111", "1234", "4321", "0123", "9999"]
        if new_pin in weak_pins:
            return SMSResponse(
                recipient=sender,
                content="PIN too weak. Choose another."
            )
        
        # Update PIN
        await self._update_pin(user["id"], new_pin)
        
        return SMSResponse(
            recipient=sender,
            content="PIN changed successfully. Keep it safe!"
        )
    
    async def _handle_block(self, sender: str, params: List[str]) -> SMSResponse:
        """Handle emergency account block"""
        user = await self._get_user_by_phone(sender)
        if not user:
            return SMSResponse(
                recipient=sender,
                content="Not registered."
            )
        
        # Block account immediately (no PIN required for security)
        self._blocked_accounts.add(sender)
        
        logger.warning("Account blocked via SMS", phone=sender[-4:])
        
        return SMSResponse(
            recipient=sender,
            content="Account BLOCKED. Call 0800-NEOBANK immediately to unblock."
        )
    
    async def _handle_unknown(self, sender: str, params: List[str]) -> SMSResponse:
        """Handle unknown command"""
        return SMSResponse(
            recipient=sender,
            content="Unknown command. Send HELP for available commands."
        )
    
    # Outbound SMS methods
    
    async def send_transaction_alert(
        self,
        phone: str,
        transaction_type: str,
        amount: Decimal,
        balance: Decimal,
        reference: str
    ) -> bool:
        """Send transaction alert SMS"""
        if transaction_type == "credit":
            message = f"NeoBank: NGN {amount:,.0f} credited. Bal: NGN {balance:,.0f}. Ref:{reference}"
        else:
            message = f"NeoBank: NGN {amount:,.0f} debited. Bal: NGN {balance:,.0f}. Ref:{reference}"
        
        return await self._send_sms(phone, message)
    
    async def send_otp(self, phone: str, otp: str, purpose: str = "verification") -> bool:
        """Send OTP via SMS"""
        message = f"NeoBank: Your {purpose} code is {otp}. Valid for 10 mins. Do not share."
        return await self._send_sms(phone, message)
    
    async def send_login_alert(self, phone: str, device: str, location: str) -> bool:
        """Send login alert SMS"""
        message = f"NeoBank: Login from {device} in {location}. If not you, call 0800-NEOBANK."
        return await self._send_sms(phone, message)
    
    async def send_low_balance_alert(self, phone: str, balance: Decimal, threshold: Decimal) -> bool:
        """Send low balance alert"""
        message = f"NeoBank: Balance low (NGN {balance:,.0f}). Top up to avoid service interruption."
        return await self._send_sms(phone, message)
    
    async def send_loan_reminder(self, phone: str, amount: Decimal, due_date: str) -> bool:
        """Send loan repayment reminder"""
        message = f"NeoBank: Loan repayment of NGN {amount:,.0f} due on {due_date}. Pay via app or *347*123#."
        return await self._send_sms(phone, message)
    
    async def send_promotional_sms(self, phone: str, message: str) -> bool:
        """Send promotional SMS (with opt-out)"""
        full_message = f"{message} Reply STOP to opt out."
        return await self._send_sms(phone, full_message)
    
    # Helper methods
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number"""
        phone = phone.strip().replace(" ", "").replace("-", "")
        if phone.startswith("+"):
            phone = phone[1:]
        if phone.startswith("234") and len(phone) == 13:
            return phone
        if phone.startswith("0") and len(phone) == 11:
            return "234" + phone[1:]
        return phone
    
    def _is_rate_limited(self, phone: str) -> bool:
        """Check if phone is rate limited"""
        now = datetime.utcnow()
        hour_ago = now - timedelta(hours=1)
        
        if phone not in self._rate_limits:
            self._rate_limits[phone] = []
        
        # Clean old entries
        self._rate_limits[phone] = [
            t for t in self._rate_limits[phone] if t > hour_ago
        ]
        
        # Check limit
        if len(self._rate_limits[phone]) >= self.RATE_LIMIT:
            return True
        
        # Add current request
        self._rate_limits[phone].append(now)
        return False
    
    def _calculate_fee(self, amount: Decimal) -> Decimal:
        """Calculate transfer fee"""
        if amount <= 5000:
            return Decimal("10")
        elif amount <= 50000:
            return Decimal("25")
        else:
            return Decimal("50")
    
    async def _send_sms(self, phone: str, message: str) -> bool:
        """Send SMS via configured provider"""
        # In production, integrate with actual SMS gateway
        logger.info(
            "SMS sent",
            recipient=phone[-4:],
            length=len(message),
            provider=self.provider.value
        )
        return True
    
    # Database operations (would be replaced with actual DB calls)
    
    async def _get_user_by_phone(self, phone: str) -> Optional[Dict]:
        """Get user by phone"""
        return {"id": f"user_{phone}", "phone": phone}
    
    async def _verify_pin(self, user_id: str, pin: str) -> bool:
        """Verify PIN"""
        stored_pin = self._user_pins.get(user_id, "1234")
        return pin == stored_pin
    
    async def _update_pin(self, user_id: str, new_pin: str):
        """Update PIN"""
        self._user_pins[user_id] = new_pin
    
    async def _get_balance(self, user_id: str) -> Decimal:
        """Get balance"""
        return Decimal("50000")
    
    async def _get_recent_transactions(self, user_id: str, limit: int = 3) -> List[Dict]:
        """Get recent transactions"""
        return [
            {"date": "13/12", "type": "credit", "amount": 5000},
            {"date": "12/12", "type": "debit", "amount": 2500},
            {"date": "11/12", "type": "credit", "amount": 10000},
        ]
    
    async def _process_transfer(self, user_id: str, recipient: str, amount: Decimal) -> Dict:
        """Process transfer"""
        reference = f"SMS{secrets.token_hex(4).upper()}"
        return {
            "success": True,
            "reference": reference,
            "balance": Decimal("45000")
        }
    
    async def _process_airtime(self, user_id: str, recipient: str, amount: Decimal) -> Dict:
        """Process airtime"""
        reference = f"AIR{secrets.token_hex(4).upper()}"
        return {"success": True, "reference": reference}


# Global SMS service instance
sms_banking_service = SMSBankingService()
