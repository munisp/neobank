"""
Account Opening and Closing Service
Handles new account creation, verification, and account closure
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
import uuid
import random
import string

class AccountType(str, Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    MONEY_MARKET = "money_market"
    CD = "certificate_of_deposit"
    INVESTMENT = "investment"
    BUSINESS_CHECKING = "business_checking"
    BUSINESS_SAVINGS = "business_savings"
    JOINT = "joint"

class AccountStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    FROZEN = "frozen"
    CLOSED = "closed"
    SUSPENDED = "suspended"

class ClosureReason(str, Enum):
    CUSTOMER_REQUEST = "customer_request"
    INACTIVITY = "inactivity"
    FRAUD = "fraud"
    COMPLIANCE = "compliance"
    NEGATIVE_BALANCE = "negative_balance"
    DUPLICATE = "duplicate"

class AccountOpeningService:
    """Service for opening and closing bank accounts"""
    
    def __init__(self):
        self.accounts_db = {}  # In production, use actual database
        self.pending_applications = {}
        self.closed_accounts = {}
        
    def generate_account_number(self, account_type: AccountType) -> str:
        """Generate unique account number"""
        # Format: TTBBBBBBBBCC where TT=type, B=random, CC=checksum
        type_codes = {
            AccountType.CHECKING: "01",
            AccountType.SAVINGS: "02",
            AccountType.MONEY_MARKET: "03",
            AccountType.CD: "04",
            AccountType.INVESTMENT: "05",
            AccountType.BUSINESS_CHECKING: "11",
            AccountType.BUSINESS_SAVINGS: "12",
            AccountType.JOINT: "21"
        }
        
        type_code = type_codes.get(account_type, "00")
        random_digits = ''.join(random.choices(string.digits, k=8))
        
        # Simple checksum (last 2 digits)
        checksum = str(sum(int(d) for d in random_digits) % 100).zfill(2)
        
        return f"{type_code}{random_digits}{checksum}"
    
    def generate_routing_number(self) -> str:
        """Generate routing number (ABA number)"""
        # Format: 9 digits with checksum
        # First 4 digits: Federal Reserve routing symbol
        # Next 4 digits: ABA institution identifier
        # Last digit: Check digit
        
        fed_symbol = "0210"  # Example: Federal Reserve Bank
        institution = ''.join(random.choices(string.digits, k=4))
        
        # Calculate check digit using ABA algorithm
        routing_base = fed_symbol + institution
        weights = [3, 7, 1, 3, 7, 1, 3, 7]
        checksum = sum(int(d) * w for d, w in zip(routing_base, weights)) % 10
        check_digit = (10 - checksum) % 10
        
        return routing_base + str(check_digit)
    
    async def open_account(
        self,
        user_id: str,
        account_type: AccountType,
        initial_deposit: float,
        applicant_info: Dict[str, Any],
        joint_owners: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Open a new bank account
        
        Args:
            user_id: Primary account holder ID
            account_type: Type of account to open
            initial_deposit: Initial deposit amount
            applicant_info: Applicant personal information
            joint_owners: List of joint owner IDs (for joint accounts)
            
        Returns:
            Account opening result with account details
        """
        
        # Validate initial deposit requirements
        min_deposits = {
            AccountType.CHECKING: 25.00,
            AccountType.SAVINGS: 100.00,
            AccountType.MONEY_MARKET: 2500.00,
            AccountType.CD: 1000.00,
            AccountType.INVESTMENT: 500.00,
            AccountType.BUSINESS_CHECKING: 500.00,
            AccountType.BUSINESS_SAVINGS: 1000.00,
            AccountType.JOINT: 100.00
        }
        
        min_deposit = min_deposits.get(account_type, 0)
        if initial_deposit < min_deposit:
            return {
                "success": False,
                "error": f"Minimum deposit of ${min_deposit} required",
                "min_deposit": min_deposit
            }
        
        # Validate applicant information
        required_fields = [
            "full_name", "date_of_birth", "ssn", "address",
            "city", "state", "zip_code", "phone", "email"
        ]
        
        missing_fields = [f for f in required_fields if f not in applicant_info]
        if missing_fields:
            return {
                "success": False,
                "error": f"Missing required fields: {', '.join(missing_fields)}",
                "missing_fields": missing_fields
            }
        
        # Age verification (must be 18+)
        dob = datetime.fromisoformat(applicant_info["date_of_birth"])
        age = (datetime.now() - dob).days / 365.25
        if age < 18:
            return {
                "success": False,
                "error": "Applicant must be 18 years or older",
                "age": int(age)
            }
        
        # Generate account details
        application_id = str(uuid.uuid4())
        account_number = self.generate_account_number(account_type)
        routing_number = self.generate_routing_number()
        
        # Create account application
        application = {
            "application_id": application_id,
            "user_id": user_id,
            "account_type": account_type.value,
            "account_number": account_number,
            "routing_number": routing_number,
            "initial_deposit": initial_deposit,
            "applicant_info": applicant_info,
            "joint_owners": joint_owners or [],
            "status": AccountStatus.PENDING.value,
            "application_date": datetime.now().isoformat(),
            "approval_status": "under_review",
            "kyc_status": "pending",
            "credit_check_status": "pending",
            "verification_steps": {
                "identity_verified": False,
                "address_verified": False,
                "ssn_verified": False,
                "credit_checked": False,
                "compliance_cleared": False
            }
        }
        
        self.pending_applications[application_id] = application
        
        # In production, trigger background verification processes:
        # - KYC verification
        # - Credit check
        # - Compliance screening
        # - Identity verification
        
        return {
            "success": True,
            "application_id": application_id,
            "account_number": account_number,
            "routing_number": routing_number,
            "status": "pending_approval",
            "message": "Account application submitted successfully",
            "estimated_approval_time": "1-2 business days",
            "next_steps": [
                "Identity verification required",
                "Document upload needed",
                "Initial deposit will be held until approval"
            ]
        }
    
    async def approve_account(
        self,
        application_id: str,
        approved_by: str,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Approve pending account application"""
        
        if application_id not in self.pending_applications:
            return {
                "success": False,
                "error": "Application not found"
            }
        
        application = self.pending_applications[application_id]
        
        # Verify all checks are complete
        verification = application["verification_steps"]
        if not all(verification.values()):
            incomplete = [k for k, v in verification.items() if not v]
            return {
                "success": False,
                "error": "Verification incomplete",
                "incomplete_steps": incomplete
            }
        
        # Create active account
        account = {
            "account_id": str(uuid.uuid4()),
            "account_number": application["account_number"],
            "routing_number": application["routing_number"],
            "user_id": application["user_id"],
            "account_type": application["account_type"],
            "status": AccountStatus.ACTIVE.value,
            "balance": application["initial_deposit"],
            "available_balance": application["initial_deposit"],
            "joint_owners": application["joint_owners"],
            "opened_date": datetime.now().isoformat(),
            "approved_by": approved_by,
            "approval_notes": notes,
            "interest_rate": self._get_interest_rate(application["account_type"]),
            "monthly_fee": self._get_monthly_fee(application["account_type"]),
            "overdraft_protection": False,
            "debit_card_issued": False,
            "online_banking_enabled": True,
            "mobile_banking_enabled": True,
            "statements": [],
            "transactions": []
        }
        
        self.accounts_db[account["account_id"]] = account
        
        # Remove from pending
        del self.pending_applications[application_id]
        
        return {
            "success": True,
            "account_id": account["account_id"],
            "account_number": account["account_number"],
            "routing_number": account["routing_number"],
            "status": "active",
            "message": "Account approved and activated",
            "welcome_bonus": self._calculate_welcome_bonus(application["initial_deposit"]),
            "next_steps": [
                "Order debit card",
                "Set up direct deposit",
                "Enable overdraft protection"
            ]
        }
    
    async def close_account(
        self,
        account_id: str,
        user_id: str,
        reason: ClosureReason,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Close an existing account
        
        Args:
            account_id: Account to close
            user_id: User requesting closure
            reason: Reason for closure
            notes: Additional notes
            
        Returns:
            Closure result
        """
        
        if account_id not in self.accounts_db:
            return {
                "success": False,
                "error": "Account not found"
            }
        
        account = self.accounts_db[account_id]
        
        # Verify ownership
        if account["user_id"] != user_id and user_id not in account.get("joint_owners", []):
            return {
                "success": False,
                "error": "Unauthorized: You don't own this account"
            }
        
        # Check account status
        if account["status"] == AccountStatus.CLOSED.value:
            return {
                "success": False,
                "error": "Account is already closed"
            }
        
        # Check for pending transactions
        pending_transactions = [
            t for t in account.get("transactions", [])
            if t.get("status") == "pending"
        ]
        
        if pending_transactions:
            return {
                "success": False,
                "error": "Cannot close account with pending transactions",
                "pending_count": len(pending_transactions),
                "message": "Please wait for all transactions to clear"
            }
        
        # Check balance
        balance = account["balance"]
        if balance < 0:
            return {
                "success": False,
                "error": "Cannot close account with negative balance",
                "balance": balance,
                "message": "Please bring account to positive balance"
            }
        
        # Calculate final balance (including interest, fees)
        final_balance = self._calculate_final_balance(account)
        
        # Create closure record
        closure = {
            "closure_id": str(uuid.uuid4()),
            "account_id": account_id,
            "account_number": account["account_number"],
            "user_id": user_id,
            "closure_date": datetime.now().isoformat(),
            "reason": reason.value,
            "notes": notes,
            "final_balance": final_balance,
            "refund_method": "check" if final_balance > 0 else None,
            "refund_amount": final_balance if final_balance > 0 else 0,
            "account_history_retained": True,
            "reopen_eligible": reason == ClosureReason.CUSTOMER_REQUEST
        }
        
        # Update account status
        account["status"] = AccountStatus.CLOSED.value
        account["closed_date"] = datetime.now().isoformat()
        account["closure_reason"] = reason.value
        account["final_balance"] = final_balance
        
        # Move to closed accounts
        self.closed_accounts[account_id] = account
        del self.accounts_db[account_id]
        
        return {
            "success": True,
            "closure_id": closure["closure_id"],
            "account_number": account["account_number"],
            "status": "closed",
            "final_balance": final_balance,
            "refund_amount": closure["refund_amount"],
            "refund_method": closure["refund_method"],
            "message": "Account closed successfully",
            "next_steps": [
                f"Refund check will be mailed within 5-7 business days" if final_balance > 0 else "No refund due",
                "Destroy all debit cards associated with this account",
                "Update any direct deposits or automatic payments",
                "Account history will be retained for 7 years"
            ],
            "reopen_eligible": closure["reopen_eligible"]
        }
    
    async def reopen_account(
        self,
        account_id: str,
        user_id: str,
        initial_deposit: float
    ) -> Dict[str, Any]:
        """Reopen a previously closed account"""
        
        if account_id not in self.closed_accounts:
            return {
                "success": False,
                "error": "Closed account not found"
            }
        
        account = self.closed_accounts[account_id]
        
        # Check eligibility
        if account.get("closure_reason") not in [
            ClosureReason.CUSTOMER_REQUEST.value,
            ClosureReason.INACTIVITY.value
        ]:
            return {
                "success": False,
                "error": "Account not eligible for reopening",
                "reason": account.get("closure_reason")
            }
        
        # Check time since closure (must be < 90 days)
        closed_date = datetime.fromisoformat(account["closed_date"])
        days_closed = (datetime.now() - closed_date).days
        
        if days_closed > 90:
            return {
                "success": False,
                "error": "Account closed for too long",
                "days_closed": days_closed,
                "message": "Please open a new account instead"
            }
        
        # Reopen account
        account["status"] = AccountStatus.ACTIVE.value
        account["balance"] = initial_deposit
        account["available_balance"] = initial_deposit
        account["reopened_date"] = datetime.now().isoformat()
        account["reopening_deposit"] = initial_deposit
        
        # Remove closure info
        del account["closed_date"]
        del account["closure_reason"]
        del account["final_balance"]
        
        # Move back to active accounts
        self.accounts_db[account_id] = account
        del self.closed_accounts[account_id]
        
        return {
            "success": True,
            "account_id": account_id,
            "account_number": account["account_number"],
            "status": "active",
            "balance": initial_deposit,
            "message": "Account reopened successfully",
            "welcome_back_bonus": 25.00 if initial_deposit >= 500 else 0
        }
    
    def _get_interest_rate(self, account_type: str) -> float:
        """Get interest rate for account type"""
        rates = {
            "checking": 0.01,
            "savings": 0.50,
            "money_market": 1.25,
            "certificate_of_deposit": 2.50,
            "investment": 0.00,
            "business_checking": 0.05,
            "business_savings": 0.75,
            "joint": 0.50
        }
        return rates.get(account_type, 0.0)
    
    def _get_monthly_fee(self, account_type: str) -> float:
        """Get monthly maintenance fee"""
        fees = {
            "checking": 5.00,
            "savings": 0.00,
            "money_market": 10.00,
            "certificate_of_deposit": 0.00,
            "investment": 0.00,
            "business_checking": 15.00,
            "business_savings": 10.00,
            "joint": 8.00
        }
        return fees.get(account_type, 0.0)
    
    def _calculate_welcome_bonus(self, initial_deposit: float) -> float:
        """Calculate welcome bonus based on initial deposit"""
        if initial_deposit >= 10000:
            return 300.00
        elif initial_deposit >= 5000:
            return 200.00
        elif initial_deposit >= 1000:
            return 100.00
        elif initial_deposit >= 500:
            return 50.00
        else:
            return 0.00
    
    def _calculate_final_balance(self, account: Dict[str, Any]) -> float:
        """Calculate final balance including interest and fees"""
        balance = account["balance"]
        
        # Add accrued interest
        interest_rate = account.get("interest_rate", 0)
        days_open = (datetime.now() - datetime.fromisoformat(account["opened_date"])).days
        interest = balance * (interest_rate / 100) * (days_open / 365)
        
        # Subtract any outstanding fees
        monthly_fee = account.get("monthly_fee", 0)
        months_open = days_open / 30
        total_fees = monthly_fee * months_open
        
        final_balance = balance + interest - total_fees
        
        return round(final_balance, 2)
    
    async def get_account_details(self, account_id: str) -> Dict[str, Any]:
        """Get detailed account information"""
        
        if account_id in self.accounts_db:
            return {
                "success": True,
                "account": self.accounts_db[account_id]
            }
        elif account_id in self.closed_accounts:
            return {
                "success": True,
                "account": self.closed_accounts[account_id],
                "status": "closed"
            }
        else:
            return {
                "success": False,
                "error": "Account not found"
            }
    
    async def list_user_accounts(
        self,
        user_id: str,
        include_closed: bool = False
    ) -> Dict[str, Any]:
        """List all accounts for a user"""
        
        active_accounts = [
            acc for acc in self.accounts_db.values()
            if acc["user_id"] == user_id or user_id in acc.get("joint_owners", [])
        ]
        
        result = {
            "success": True,
            "user_id": user_id,
            "active_accounts": active_accounts,
            "total_balance": sum(acc["balance"] for acc in active_accounts)
        }
        
        if include_closed:
            closed_accounts = [
                acc for acc in self.closed_accounts.values()
                if acc["user_id"] == user_id
            ]
            result["closed_accounts"] = closed_accounts
        
        return result

