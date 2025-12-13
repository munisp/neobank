"""
USSD Banking Service for NeoBank

Provides banking services via USSD (*123#) for feature phones and areas
with limited data connectivity. Essential for African market penetration.

Supports Africa's Talking, Infobip, and generic USSD gateway integrations.
"""

import hashlib
import secrets
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


class USSDProvider(Enum):
    """Supported USSD gateway providers"""
    AFRICAS_TALKING = "africas_talking"
    INFOBIP = "infobip"
    HUBTEL = "hubtel"
    GENERIC = "generic"


class USSDSessionState(Enum):
    """USSD session states"""
    INITIAL = "initial"
    MAIN_MENU = "main_menu"
    CHECK_BALANCE = "check_balance"
    SEND_MONEY = "send_money"
    SEND_MONEY_AMOUNT = "send_money_amount"
    SEND_MONEY_CONFIRM = "send_money_confirm"
    BUY_AIRTIME = "buy_airtime"
    BUY_AIRTIME_AMOUNT = "buy_airtime_amount"
    BUY_AIRTIME_CONFIRM = "buy_airtime_confirm"
    PAY_BILLS = "pay_bills"
    PAY_BILLS_PROVIDER = "pay_bills_provider"
    PAY_BILLS_ACCOUNT = "pay_bills_account"
    PAY_BILLS_AMOUNT = "pay_bills_amount"
    PAY_BILLS_CONFIRM = "pay_bills_confirm"
    MINI_STATEMENT = "mini_statement"
    CHANGE_PIN = "change_pin"
    CHANGE_PIN_NEW = "change_pin_new"
    CHANGE_PIN_CONFIRM = "change_pin_confirm"
    LOANS = "loans"
    LOAN_REQUEST = "loan_request"
    LOAN_REPAY = "loan_repay"
    SAVINGS = "savings"
    SAVINGS_DEPOSIT = "savings_deposit"
    SAVINGS_WITHDRAW = "savings_withdraw"
    PIN_ENTRY = "pin_entry"
    COMPLETED = "completed"
    ERROR = "error"


@dataclass
class USSDSession:
    """Represents an active USSD session"""
    session_id: str
    phone_number: str
    state: USSDSessionState = USSDSessionState.INITIAL
    user_id: Optional[str] = None
    data: Dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    pin_attempts: int = 0
    is_authenticated: bool = False


@dataclass
class USSDResponse:
    """USSD response to send back to user"""
    message: str
    end_session: bool = False
    
    def to_africas_talking(self) -> str:
        """Format for Africa's Talking"""
        prefix = "END " if self.end_session else "CON "
        return prefix + self.message
    
    def to_infobip(self) -> Dict:
        """Format for Infobip"""
        return {
            "text": self.message,
            "action": "end" if self.end_session else "continue"
        }


class USSDService:
    """
    USSD Banking Service
    
    Provides full banking functionality via USSD menus for feature phones.
    Supports balance checks, transfers, airtime, bills, loans, and savings.
    """
    
    # Session timeout in minutes
    SESSION_TIMEOUT = 3
    MAX_PIN_ATTEMPTS = 3
    
    # USSD short codes by country
    SHORT_CODES = {
        "NG": "*347*123#",  # Nigeria
        "KE": "*483*123#",  # Kenya
        "ZA": "*120*123#",  # South Africa
        "GH": "*713*123#",  # Ghana
        "UG": "*185*123#",  # Uganda
        "TZ": "*150*123#",  # Tanzania
    }
    
    def __init__(self, provider: USSDProvider = USSDProvider.AFRICAS_TALKING):
        self.provider = provider
        self.sessions: Dict[str, USSDSession] = {}
        # In production, these would be database-backed
        self._user_pins: Dict[str, str] = {}
        self._user_balances: Dict[str, Decimal] = {}
        self._user_accounts: Dict[str, Dict] = {}
    
    async def handle_request(
        self,
        session_id: str,
        phone_number: str,
        text: str,
        service_code: str = None
    ) -> USSDResponse:
        """
        Handle incoming USSD request
        
        Args:
            session_id: Unique session identifier from gateway
            phone_number: User's phone number (MSISDN)
            text: User input (empty for initial request, or accumulated inputs)
            service_code: USSD short code dialed
            
        Returns:
            USSDResponse with menu text and session continuation flag
        """
        # Clean phone number
        phone_number = self._normalize_phone(phone_number)
        
        # Get or create session
        session = self._get_or_create_session(session_id, phone_number)
        
        # Check session timeout
        if self._is_session_expired(session):
            self._end_session(session_id)
            return USSDResponse(
                "Session expired. Please dial again.",
                end_session=True
            )
        
        # Update last activity
        session.last_activity = datetime.utcnow()
        
        # Parse user input
        inputs = text.split("*") if text else []
        current_input = inputs[-1] if inputs else ""
        
        logger.info(
            "USSD request",
            session_id=session_id,
            phone=phone_number[-4:],  # Log only last 4 digits
            state=session.state.value,
            input=current_input
        )
        
        try:
            return await self._process_state(session, current_input)
        except Exception as e:
            logger.error("USSD processing error", error=str(e), session_id=session_id)
            return USSDResponse(
                "An error occurred. Please try again.",
                end_session=True
            )
    
    async def _process_state(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Process current state and user input"""
        
        state_handlers = {
            USSDSessionState.INITIAL: self._handle_initial,
            USSDSessionState.PIN_ENTRY: self._handle_pin_entry,
            USSDSessionState.MAIN_MENU: self._handle_main_menu,
            USSDSessionState.CHECK_BALANCE: self._handle_check_balance,
            USSDSessionState.SEND_MONEY: self._handle_send_money,
            USSDSessionState.SEND_MONEY_AMOUNT: self._handle_send_money_amount,
            USSDSessionState.SEND_MONEY_CONFIRM: self._handle_send_money_confirm,
            USSDSessionState.BUY_AIRTIME: self._handle_buy_airtime,
            USSDSessionState.BUY_AIRTIME_AMOUNT: self._handle_buy_airtime_amount,
            USSDSessionState.BUY_AIRTIME_CONFIRM: self._handle_buy_airtime_confirm,
            USSDSessionState.PAY_BILLS: self._handle_pay_bills,
            USSDSessionState.PAY_BILLS_PROVIDER: self._handle_pay_bills_provider,
            USSDSessionState.PAY_BILLS_ACCOUNT: self._handle_pay_bills_account,
            USSDSessionState.PAY_BILLS_AMOUNT: self._handle_pay_bills_amount,
            USSDSessionState.PAY_BILLS_CONFIRM: self._handle_pay_bills_confirm,
            USSDSessionState.MINI_STATEMENT: self._handle_mini_statement,
            USSDSessionState.CHANGE_PIN: self._handle_change_pin,
            USSDSessionState.CHANGE_PIN_NEW: self._handle_change_pin_new,
            USSDSessionState.CHANGE_PIN_CONFIRM: self._handle_change_pin_confirm,
            USSDSessionState.LOANS: self._handle_loans,
            USSDSessionState.LOAN_REQUEST: self._handle_loan_request,
            USSDSessionState.LOAN_REPAY: self._handle_loan_repay,
            USSDSessionState.SAVINGS: self._handle_savings,
            USSDSessionState.SAVINGS_DEPOSIT: self._handle_savings_deposit,
            USSDSessionState.SAVINGS_WITHDRAW: self._handle_savings_withdraw,
        }
        
        handler = state_handlers.get(session.state, self._handle_error)
        return await handler(session, user_input)
    
    async def _handle_initial(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle initial USSD dial"""
        # Check if user is registered
        user = await self._get_user_by_phone(session.phone_number)
        
        if not user:
            return USSDResponse(
                "Welcome to NeoBank!\n"
                "You are not registered.\n"
                "Please download our app or visit\n"
                "neobank.com to register.",
                end_session=True
            )
        
        session.user_id = user.get("id")
        session.state = USSDSessionState.PIN_ENTRY
        
        return USSDResponse(
            "Welcome to NeoBank\n"
            "Enter your 4-digit PIN:"
        )
    
    async def _handle_pin_entry(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle PIN entry"""
        if not user_input or len(user_input) != 4 or not user_input.isdigit():
            session.pin_attempts += 1
            if session.pin_attempts >= self.MAX_PIN_ATTEMPTS:
                return USSDResponse(
                    "Too many incorrect attempts.\n"
                    "Your account has been locked.\n"
                    "Please contact support.",
                    end_session=True
                )
            return USSDResponse(
                f"Invalid PIN. {self.MAX_PIN_ATTEMPTS - session.pin_attempts} attempts remaining.\n"
                "Enter your 4-digit PIN:"
            )
        
        # Verify PIN
        if not await self._verify_pin(session.user_id, user_input):
            session.pin_attempts += 1
            if session.pin_attempts >= self.MAX_PIN_ATTEMPTS:
                return USSDResponse(
                    "Too many incorrect attempts.\n"
                    "Your account has been locked.\n"
                    "Please contact support.",
                    end_session=True
                )
            return USSDResponse(
                f"Wrong PIN. {self.MAX_PIN_ATTEMPTS - session.pin_attempts} attempts remaining.\n"
                "Enter your 4-digit PIN:"
            )
        
        session.is_authenticated = True
        session.state = USSDSessionState.MAIN_MENU
        return await self._show_main_menu(session)
    
    async def _show_main_menu(self, session: USSDSession) -> USSDResponse:
        """Show main menu"""
        return USSDResponse(
            "NeoBank Menu\n"
            "1. Check Balance\n"
            "2. Send Money\n"
            "3. Buy Airtime\n"
            "4. Pay Bills\n"
            "5. Mini Statement\n"
            "6. Loans\n"
            "7. Savings\n"
            "8. Change PIN\n"
            "0. Exit"
        )
    
    async def _handle_main_menu(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle main menu selection"""
        menu_map = {
            "1": (USSDSessionState.CHECK_BALANCE, self._handle_check_balance),
            "2": (USSDSessionState.SEND_MONEY, None),
            "3": (USSDSessionState.BUY_AIRTIME, None),
            "4": (USSDSessionState.PAY_BILLS, None),
            "5": (USSDSessionState.MINI_STATEMENT, self._handle_mini_statement),
            "6": (USSDSessionState.LOANS, None),
            "7": (USSDSessionState.SAVINGS, None),
            "8": (USSDSessionState.CHANGE_PIN, None),
            "0": (USSDSessionState.COMPLETED, None),
        }
        
        if user_input not in menu_map:
            return USSDResponse(
                "Invalid option.\n"
                "Please select 1-8 or 0 to exit."
            )
        
        new_state, handler = menu_map[user_input]
        session.state = new_state
        
        if user_input == "0":
            return USSDResponse("Thank you for using NeoBank!", end_session=True)
        
        if handler:
            return await handler(session, "")
        
        return await self._process_state(session, "")
    
    async def _handle_check_balance(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle balance check"""
        balance = await self._get_balance(session.user_id)
        
        session.state = USSDSessionState.MAIN_MENU
        return USSDResponse(
            f"Your NeoBank Balance:\n"
            f"Available: NGN {balance:,.2f}\n\n"
            "0. Back to Menu",
            end_session=False
        )
    
    async def _handle_send_money(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle send money - enter recipient"""
        if not user_input:
            return USSDResponse(
                "Send Money\n"
                "Enter recipient phone number\n"
                "(e.g., 08012345678):"
            )
        
        # Validate phone number
        recipient = self._normalize_phone(user_input)
        if not self._is_valid_phone(recipient):
            return USSDResponse(
                "Invalid phone number.\n"
                "Enter recipient phone number:"
            )
        
        session.data["recipient"] = recipient
        session.state = USSDSessionState.SEND_MONEY_AMOUNT
        
        return USSDResponse(
            f"Sending to: {recipient[-4:]}\n"
            "Enter amount (NGN):"
        )
    
    async def _handle_send_money_amount(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle send money - enter amount"""
        try:
            amount = Decimal(user_input)
            if amount <= 0:
                raise ValueError("Amount must be positive")
            if amount > 1000000:
                return USSDResponse(
                    "Maximum transfer is NGN 1,000,000.\n"
                    "Enter amount (NGN):"
                )
        except (ValueError, TypeError):
            return USSDResponse(
                "Invalid amount.\n"
                "Enter amount (NGN):"
            )
        
        balance = await self._get_balance(session.user_id)
        if amount > balance:
            return USSDResponse(
                f"Insufficient balance.\n"
                f"Available: NGN {balance:,.2f}\n"
                "Enter amount (NGN):"
            )
        
        session.data["amount"] = str(amount)
        session.state = USSDSessionState.SEND_MONEY_CONFIRM
        
        recipient = session.data["recipient"]
        fee = self._calculate_transfer_fee(amount)
        total = amount + fee
        
        return USSDResponse(
            f"Confirm Transfer:\n"
            f"To: {recipient[-4:]}\n"
            f"Amount: NGN {amount:,.2f}\n"
            f"Fee: NGN {fee:,.2f}\n"
            f"Total: NGN {total:,.2f}\n\n"
            "1. Confirm\n"
            "2. Cancel"
        )
    
    async def _handle_send_money_confirm(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle send money confirmation"""
        if user_input == "2":
            session.state = USSDSessionState.MAIN_MENU
            return await self._show_main_menu(session)
        
        if user_input != "1":
            return USSDResponse(
                "1. Confirm\n"
                "2. Cancel"
            )
        
        # Process transfer
        amount = Decimal(session.data["amount"])
        recipient = session.data["recipient"]
        
        result = await self._process_transfer(
            session.user_id,
            recipient,
            amount
        )
        
        if result["success"]:
            return USSDResponse(
                f"Transfer Successful!\n"
                f"NGN {amount:,.2f} sent to {recipient[-4:]}\n"
                f"Ref: {result['reference']}\n"
                f"New Balance: NGN {result['balance']:,.2f}",
                end_session=True
            )
        else:
            return USSDResponse(
                f"Transfer Failed.\n"
                f"{result['error']}\n"
                "Please try again later.",
                end_session=True
            )
    
    async def _handle_buy_airtime(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle buy airtime - select network or self"""
        if not user_input:
            return USSDResponse(
                "Buy Airtime\n"
                "1. Self ({phone})\n"
                "2. Other Number\n\n"
                "Select option:".format(phone=session.phone_number[-4:])
            )
        
        if user_input == "1":
            session.data["airtime_recipient"] = session.phone_number
            session.state = USSDSessionState.BUY_AIRTIME_AMOUNT
            return USSDResponse(
                "Enter airtime amount (NGN):\n"
                "(Min: 50, Max: 50,000)"
            )
        elif user_input == "2":
            return USSDResponse(
                "Enter phone number\n"
                "(e.g., 08012345678):"
            )
        else:
            # Assume it's a phone number
            recipient = self._normalize_phone(user_input)
            if not self._is_valid_phone(recipient):
                return USSDResponse(
                    "Invalid phone number.\n"
                    "Enter phone number:"
                )
            session.data["airtime_recipient"] = recipient
            session.state = USSDSessionState.BUY_AIRTIME_AMOUNT
            return USSDResponse(
                f"Buying for: {recipient[-4:]}\n"
                "Enter airtime amount (NGN):\n"
                "(Min: 50, Max: 50,000)"
            )
    
    async def _handle_buy_airtime_amount(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle airtime amount entry"""
        try:
            amount = Decimal(user_input)
            if amount < 50:
                return USSDResponse("Minimum amount is NGN 50.\nEnter amount:")
            if amount > 50000:
                return USSDResponse("Maximum amount is NGN 50,000.\nEnter amount:")
        except (ValueError, TypeError):
            return USSDResponse("Invalid amount.\nEnter amount (NGN):")
        
        balance = await self._get_balance(session.user_id)
        if amount > balance:
            return USSDResponse(
                f"Insufficient balance.\n"
                f"Available: NGN {balance:,.2f}\n"
                "Enter amount:"
            )
        
        session.data["airtime_amount"] = str(amount)
        session.state = USSDSessionState.BUY_AIRTIME_CONFIRM
        
        recipient = session.data["airtime_recipient"]
        
        return USSDResponse(
            f"Confirm Airtime Purchase:\n"
            f"Phone: {recipient[-4:]}\n"
            f"Amount: NGN {amount:,.2f}\n\n"
            "1. Confirm\n"
            "2. Cancel"
        )
    
    async def _handle_buy_airtime_confirm(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle airtime purchase confirmation"""
        if user_input == "2":
            session.state = USSDSessionState.MAIN_MENU
            return await self._show_main_menu(session)
        
        if user_input != "1":
            return USSDResponse("1. Confirm\n2. Cancel")
        
        amount = Decimal(session.data["airtime_amount"])
        recipient = session.data["airtime_recipient"]
        
        result = await self._process_airtime_purchase(
            session.user_id,
            recipient,
            amount
        )
        
        if result["success"]:
            return USSDResponse(
                f"Airtime Purchase Successful!\n"
                f"NGN {amount:,.2f} to {recipient[-4:]}\n"
                f"Ref: {result['reference']}",
                end_session=True
            )
        else:
            return USSDResponse(
                f"Purchase Failed.\n{result['error']}",
                end_session=True
            )
    
    async def _handle_pay_bills(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle bill payment - select category"""
        if not user_input:
            return USSDResponse(
                "Pay Bills\n"
                "1. Electricity\n"
                "2. Cable TV (DSTV/GOtv)\n"
                "3. Internet\n"
                "4. Water\n"
                "5. School Fees\n"
                "0. Back"
            )
        
        categories = {
            "1": "electricity",
            "2": "cable_tv",
            "3": "internet",
            "4": "water",
            "5": "school_fees"
        }
        
        if user_input == "0":
            session.state = USSDSessionState.MAIN_MENU
            return await self._show_main_menu(session)
        
        if user_input not in categories:
            return USSDResponse("Invalid option. Select 1-5 or 0:")
        
        session.data["bill_category"] = categories[user_input]
        session.state = USSDSessionState.PAY_BILLS_PROVIDER
        
        return await self._show_bill_providers(session, categories[user_input])
    
    async def _show_bill_providers(self, session: USSDSession, category: str) -> USSDResponse:
        """Show bill providers for category"""
        providers = {
            "electricity": ["1. IKEDC", "2. EKEDC", "3. AEDC", "4. PHED", "5. BEDC"],
            "cable_tv": ["1. DSTV", "2. GOtv", "3. StarTimes", "4. ShowMax"],
            "internet": ["1. Spectranet", "2. Smile", "3. Swift", "4. NTEL"],
            "water": ["1. Lagos Water", "2. FCT Water"],
            "school_fees": ["1. Enter School Code"]
        }
        
        provider_list = providers.get(category, ["1. Other"])
        
        return USSDResponse(
            f"Select Provider:\n" + "\n".join(provider_list) + "\n0. Back"
        )
    
    async def _handle_pay_bills_provider(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle bill provider selection"""
        if user_input == "0":
            session.state = USSDSessionState.PAY_BILLS
            return await self._handle_pay_bills(session, "")
        
        session.data["bill_provider"] = user_input
        session.state = USSDSessionState.PAY_BILLS_ACCOUNT
        
        return USSDResponse(
            "Enter meter/decoder/account number:"
        )
    
    async def _handle_pay_bills_account(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle bill account number entry"""
        if not user_input or len(user_input) < 5:
            return USSDResponse("Invalid account number.\nEnter account number:")
        
        session.data["bill_account"] = user_input
        session.state = USSDSessionState.PAY_BILLS_AMOUNT
        
        return USSDResponse(
            f"Account: {user_input}\n"
            "Enter amount (NGN):"
        )
    
    async def _handle_pay_bills_amount(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle bill amount entry"""
        try:
            amount = Decimal(user_input)
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return USSDResponse("Invalid amount.\nEnter amount (NGN):")
        
        balance = await self._get_balance(session.user_id)
        if amount > balance:
            return USSDResponse(
                f"Insufficient balance.\n"
                f"Available: NGN {balance:,.2f}\n"
                "Enter amount:"
            )
        
        session.data["bill_amount"] = str(amount)
        session.state = USSDSessionState.PAY_BILLS_CONFIRM
        
        return USSDResponse(
            f"Confirm Bill Payment:\n"
            f"Account: {session.data['bill_account']}\n"
            f"Amount: NGN {amount:,.2f}\n\n"
            "1. Confirm\n"
            "2. Cancel"
        )
    
    async def _handle_pay_bills_confirm(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle bill payment confirmation"""
        if user_input == "2":
            session.state = USSDSessionState.MAIN_MENU
            return await self._show_main_menu(session)
        
        if user_input != "1":
            return USSDResponse("1. Confirm\n2. Cancel")
        
        amount = Decimal(session.data["bill_amount"])
        
        result = await self._process_bill_payment(
            session.user_id,
            session.data["bill_category"],
            session.data["bill_provider"],
            session.data["bill_account"],
            amount
        )
        
        if result["success"]:
            return USSDResponse(
                f"Bill Payment Successful!\n"
                f"Amount: NGN {amount:,.2f}\n"
                f"Token: {result.get('token', 'N/A')}\n"
                f"Ref: {result['reference']}",
                end_session=True
            )
        else:
            return USSDResponse(
                f"Payment Failed.\n{result['error']}",
                end_session=True
            )
    
    async def _handle_mini_statement(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle mini statement request"""
        transactions = await self._get_recent_transactions(session.user_id, limit=5)
        
        if not transactions:
            return USSDResponse(
                "No recent transactions.\n\n"
                "0. Back to Menu",
                end_session=False
            )
        
        statement = "Recent Transactions:\n"
        for tx in transactions:
            sign = "+" if tx["type"] == "credit" else "-"
            statement += f"{tx['date']} {sign}NGN{tx['amount']:,.0f}\n"
        
        balance = await self._get_balance(session.user_id)
        statement += f"\nBalance: NGN {balance:,.2f}"
        
        session.state = USSDSessionState.MAIN_MENU
        return USSDResponse(statement, end_session=False)
    
    async def _handle_change_pin(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle change PIN - enter current PIN"""
        if not user_input:
            return USSDResponse("Enter current PIN:")
        
        if not await self._verify_pin(session.user_id, user_input):
            return USSDResponse("Wrong PIN.\nEnter current PIN:")
        
        session.state = USSDSessionState.CHANGE_PIN_NEW
        return USSDResponse("Enter new 4-digit PIN:")
    
    async def _handle_change_pin_new(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle new PIN entry"""
        if not user_input or len(user_input) != 4 or not user_input.isdigit():
            return USSDResponse("PIN must be 4 digits.\nEnter new PIN:")
        
        # Check for weak PINs
        weak_pins = ["0000", "1111", "1234", "4321", "0123", "9999"]
        if user_input in weak_pins:
            return USSDResponse("PIN too weak. Choose another.\nEnter new PIN:")
        
        session.data["new_pin"] = user_input
        session.state = USSDSessionState.CHANGE_PIN_CONFIRM
        
        return USSDResponse("Confirm new PIN:")
    
    async def _handle_change_pin_confirm(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle PIN confirmation"""
        if user_input != session.data.get("new_pin"):
            session.state = USSDSessionState.CHANGE_PIN_NEW
            return USSDResponse("PINs don't match.\nEnter new PIN:")
        
        # Update PIN
        await self._update_pin(session.user_id, user_input)
        
        return USSDResponse(
            "PIN changed successfully!\n"
            "Keep your PIN safe.",
            end_session=True
        )
    
    async def _handle_loans(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle loans menu"""
        if not user_input:
            loan_info = await self._get_loan_info(session.user_id)
            
            menu = "Loans\n"
            if loan_info.get("active_loan"):
                menu += f"Active Loan: NGN {loan_info['active_loan']:,.2f}\n"
                menu += f"Due: {loan_info['due_date']}\n\n"
            menu += f"Eligible: NGN {loan_info.get('eligible_amount', 0):,.2f}\n\n"
            menu += "1. Request Loan\n"
            menu += "2. Repay Loan\n"
            menu += "0. Back"
            
            return USSDResponse(menu)
        
        if user_input == "0":
            session.state = USSDSessionState.MAIN_MENU
            return await self._show_main_menu(session)
        elif user_input == "1":
            session.state = USSDSessionState.LOAN_REQUEST
            return await self._handle_loan_request(session, "")
        elif user_input == "2":
            session.state = USSDSessionState.LOAN_REPAY
            return await self._handle_loan_repay(session, "")
        
        return USSDResponse("Invalid option. Select 1-2 or 0:")
    
    async def _handle_loan_request(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle loan request"""
        loan_info = await self._get_loan_info(session.user_id)
        
        if loan_info.get("active_loan"):
            return USSDResponse(
                "You have an active loan.\n"
                "Please repay before requesting new loan.",
                end_session=True
            )
        
        if not user_input:
            return USSDResponse(
                f"Loan Request\n"
                f"Eligible: NGN {loan_info.get('eligible_amount', 0):,.2f}\n"
                f"Interest: 5% per month\n\n"
                "Enter loan amount:"
            )
        
        try:
            amount = Decimal(user_input)
            if amount <= 0 or amount > loan_info.get("eligible_amount", 0):
                return USSDResponse(
                    f"Amount must be between NGN 1,000 and NGN {loan_info.get('eligible_amount', 0):,.2f}\n"
                    "Enter amount:"
                )
        except (ValueError, TypeError):
            return USSDResponse("Invalid amount.\nEnter loan amount:")
        
        # Process loan request
        result = await self._process_loan_request(session.user_id, amount)
        
        if result["success"]:
            return USSDResponse(
                f"Loan Approved!\n"
                f"Amount: NGN {amount:,.2f}\n"
                f"Repay: NGN {result['repayment']:,.2f}\n"
                f"Due: {result['due_date']}\n"
                f"Credited to your account.",
                end_session=True
            )
        else:
            return USSDResponse(
                f"Loan request failed.\n{result['error']}",
                end_session=True
            )
    
    async def _handle_loan_repay(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle loan repayment"""
        loan_info = await self._get_loan_info(session.user_id)
        
        if not loan_info.get("active_loan"):
            return USSDResponse(
                "You have no active loan.",
                end_session=True
            )
        
        if not user_input:
            return USSDResponse(
                f"Loan Repayment\n"
                f"Outstanding: NGN {loan_info['active_loan']:,.2f}\n"
                f"Due: {loan_info['due_date']}\n\n"
                "1. Pay Full Amount\n"
                "2. Pay Partial\n"
                "0. Back"
            )
        
        if user_input == "0":
            session.state = USSDSessionState.LOANS
            return await self._handle_loans(session, "")
        elif user_input == "1":
            amount = loan_info["active_loan"]
        else:
            try:
                amount = Decimal(user_input)
            except (ValueError, TypeError):
                return USSDResponse("Enter amount or select option:")
        
        balance = await self._get_balance(session.user_id)
        if amount > balance:
            return USSDResponse(
                f"Insufficient balance.\n"
                f"Available: NGN {balance:,.2f}"
            )
        
        result = await self._process_loan_repayment(session.user_id, amount)
        
        if result["success"]:
            return USSDResponse(
                f"Repayment Successful!\n"
                f"Paid: NGN {amount:,.2f}\n"
                f"Remaining: NGN {result['remaining']:,.2f}",
                end_session=True
            )
        else:
            return USSDResponse(
                f"Repayment failed.\n{result['error']}",
                end_session=True
            )
    
    async def _handle_savings(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle savings menu"""
        if not user_input:
            savings = await self._get_savings_info(session.user_id)
            
            return USSDResponse(
                f"Savings\n"
                f"Balance: NGN {savings.get('balance', 0):,.2f}\n"
                f"Interest: {savings.get('interest_rate', 10)}% p.a.\n\n"
                "1. Deposit\n"
                "2. Withdraw\n"
                "0. Back"
            )
        
        if user_input == "0":
            session.state = USSDSessionState.MAIN_MENU
            return await self._show_main_menu(session)
        elif user_input == "1":
            session.state = USSDSessionState.SAVINGS_DEPOSIT
            return USSDResponse("Enter deposit amount (NGN):")
        elif user_input == "2":
            session.state = USSDSessionState.SAVINGS_WITHDRAW
            return USSDResponse("Enter withdrawal amount (NGN):")
        
        return USSDResponse("Invalid option. Select 1-2 or 0:")
    
    async def _handle_savings_deposit(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle savings deposit"""
        try:
            amount = Decimal(user_input)
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return USSDResponse("Invalid amount.\nEnter deposit amount:")
        
        balance = await self._get_balance(session.user_id)
        if amount > balance:
            return USSDResponse(
                f"Insufficient balance.\n"
                f"Available: NGN {balance:,.2f}"
            )
        
        result = await self._process_savings_deposit(session.user_id, amount)
        
        if result["success"]:
            return USSDResponse(
                f"Deposit Successful!\n"
                f"Amount: NGN {amount:,.2f}\n"
                f"Savings Balance: NGN {result['savings_balance']:,.2f}",
                end_session=True
            )
        else:
            return USSDResponse(f"Deposit failed.\n{result['error']}", end_session=True)
    
    async def _handle_savings_withdraw(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle savings withdrawal"""
        try:
            amount = Decimal(user_input)
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return USSDResponse("Invalid amount.\nEnter withdrawal amount:")
        
        savings = await self._get_savings_info(session.user_id)
        if amount > savings.get("balance", 0):
            return USSDResponse(
                f"Insufficient savings.\n"
                f"Available: NGN {savings.get('balance', 0):,.2f}"
            )
        
        result = await self._process_savings_withdrawal(session.user_id, amount)
        
        if result["success"]:
            return USSDResponse(
                f"Withdrawal Successful!\n"
                f"Amount: NGN {amount:,.2f}\n"
                f"Credited to main account.",
                end_session=True
            )
        else:
            return USSDResponse(f"Withdrawal failed.\n{result['error']}", end_session=True)
    
    async def _handle_error(self, session: USSDSession, user_input: str) -> USSDResponse:
        """Handle error state"""
        return USSDResponse(
            "An error occurred.\nPlease try again.",
            end_session=True
        )
    
    # Helper methods
    
    def _get_or_create_session(self, session_id: str, phone_number: str) -> USSDSession:
        """Get existing session or create new one"""
        if session_id not in self.sessions:
            self.sessions[session_id] = USSDSession(
                session_id=session_id,
                phone_number=phone_number
            )
        return self.sessions[session_id]
    
    def _end_session(self, session_id: str):
        """End and remove session"""
        self.sessions.pop(session_id, None)
    
    def _is_session_expired(self, session: USSDSession) -> bool:
        """Check if session has expired"""
        timeout = timedelta(minutes=self.SESSION_TIMEOUT)
        return datetime.utcnow() - session.last_activity > timeout
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number to standard format"""
        phone = phone.strip().replace(" ", "").replace("-", "")
        if phone.startswith("+"):
            phone = phone[1:]
        if phone.startswith("234") and len(phone) == 13:
            return phone
        if phone.startswith("0") and len(phone) == 11:
            return "234" + phone[1:]
        return phone
    
    def _is_valid_phone(self, phone: str) -> bool:
        """Validate phone number"""
        return len(phone) >= 10 and phone.isdigit()
    
    def _calculate_transfer_fee(self, amount: Decimal) -> Decimal:
        """Calculate transfer fee"""
        if amount <= 5000:
            return Decimal("10")
        elif amount <= 50000:
            return Decimal("25")
        else:
            return Decimal("50")
    
    # Database operations (would be replaced with actual DB calls in production)
    
    async def _get_user_by_phone(self, phone: str) -> Optional[Dict]:
        """Get user by phone number"""
        # In production, query database
        return {"id": f"user_{phone}", "phone": phone, "name": "User"}
    
    async def _verify_pin(self, user_id: str, pin: str) -> bool:
        """Verify user PIN"""
        # In production, compare hashed PIN from database
        stored_pin = self._user_pins.get(user_id, "1234")  # Default for testing
        return pin == stored_pin
    
    async def _update_pin(self, user_id: str, new_pin: str):
        """Update user PIN"""
        # In production, hash and store in database
        self._user_pins[user_id] = new_pin
    
    async def _get_balance(self, user_id: str) -> Decimal:
        """Get user account balance"""
        # In production, query from TigerBeetle/database
        return self._user_balances.get(user_id, Decimal("50000"))
    
    async def _get_recent_transactions(self, user_id: str, limit: int = 5) -> List[Dict]:
        """Get recent transactions"""
        # In production, query from database
        return [
            {"date": "Dec 13", "type": "credit", "amount": 5000},
            {"date": "Dec 12", "type": "debit", "amount": 2500},
            {"date": "Dec 11", "type": "credit", "amount": 10000},
        ]
    
    async def _process_transfer(self, user_id: str, recipient: str, amount: Decimal) -> Dict:
        """Process money transfer"""
        # In production, call transfer service
        reference = f"TRF{secrets.token_hex(4).upper()}"
        balance = await self._get_balance(user_id)
        new_balance = balance - amount - self._calculate_transfer_fee(amount)
        self._user_balances[user_id] = new_balance
        
        return {
            "success": True,
            "reference": reference,
            "balance": new_balance
        }
    
    async def _process_airtime_purchase(self, user_id: str, recipient: str, amount: Decimal) -> Dict:
        """Process airtime purchase"""
        reference = f"AIR{secrets.token_hex(4).upper()}"
        balance = await self._get_balance(user_id)
        self._user_balances[user_id] = balance - amount
        
        return {"success": True, "reference": reference}
    
    async def _process_bill_payment(
        self, user_id: str, category: str, provider: str, account: str, amount: Decimal
    ) -> Dict:
        """Process bill payment"""
        reference = f"BIL{secrets.token_hex(4).upper()}"
        token = secrets.token_hex(8).upper() if category == "electricity" else None
        
        balance = await self._get_balance(user_id)
        self._user_balances[user_id] = balance - amount
        
        return {"success": True, "reference": reference, "token": token}
    
    async def _get_loan_info(self, user_id: str) -> Dict:
        """Get loan information"""
        return {
            "active_loan": None,
            "eligible_amount": Decimal("100000"),
            "due_date": None
        }
    
    async def _process_loan_request(self, user_id: str, amount: Decimal) -> Dict:
        """Process loan request"""
        from datetime import date, timedelta
        
        interest = amount * Decimal("0.05")
        repayment = amount + interest
        due_date = (date.today() + timedelta(days=30)).strftime("%d %b %Y")
        
        balance = await self._get_balance(user_id)
        self._user_balances[user_id] = balance + amount
        
        return {
            "success": True,
            "repayment": repayment,
            "due_date": due_date
        }
    
    async def _process_loan_repayment(self, user_id: str, amount: Decimal) -> Dict:
        """Process loan repayment"""
        return {"success": True, "remaining": Decimal("0")}
    
    async def _get_savings_info(self, user_id: str) -> Dict:
        """Get savings information"""
        return {"balance": Decimal("25000"), "interest_rate": 10}
    
    async def _process_savings_deposit(self, user_id: str, amount: Decimal) -> Dict:
        """Process savings deposit"""
        return {"success": True, "savings_balance": Decimal("25000") + amount}
    
    async def _process_savings_withdrawal(self, user_id: str, amount: Decimal) -> Dict:
        """Process savings withdrawal"""
        return {"success": True}


# Global USSD service instance
ussd_service = USSDService()
