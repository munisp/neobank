"""
TigerBeetle Client Infrastructure - Enhanced Version
Centralized TigerBeetle client with:
- Two-phase pending transfers (auth/capture pattern)
- Consistent UUID to u128 ID mapping
- Account constraints (overdraft prevention)
- Transfer lookups for reconciliation
- Atomic linked transfers
- No virtual fallbacks (fail-fast in production)
"""

import os
import hashlib
from typing import Optional, List, Dict, Any, Tuple
from decimal import Decimal
from uuid import UUID
import structlog
from tigerbeetle import Client, Account, Transfer, AccountFlags, TransferFlags

logger = structlog.get_logger(__name__)

# Environment check - no virtual fallbacks in production
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
TIGERBEETLE_REQUIRED = ENVIRONMENT == "production"

# Legacy ledger constants (for backward compatibility)
WIRE_LEDGER = 1
ACH_LEDGER = 2
BILL_PAY_LEDGER = 3
FX_LEDGER_USD = 4
FX_LEDGER_EUR = 5
FX_LEDGER_GBP = 6
FX_LEDGER_JPY = 7
CARD_LEDGER = 8
FEE_LEDGER = 9
CLEARING_LEDGER = 10

# Legacy account codes (for backward compatibility)
CUSTOMER_ACCOUNT_CODE = 1
CLEARING_ACCOUNT_CODE = 2
REVENUE_ACCOUNT_CODE = 3
INTERMEDIARY_ACCOUNT_CODE = 4
BILLER_ACCOUNT_CODE = 5
MERCHANT_ACCOUNT_CODE = 6


class Ledger:
    """TigerBeetle ledger identifiers"""
    WIRE = 1
    ACH = 2
    BILL_PAY = 3
    CARD = 8
    FX_USD = 4
    FX_EUR = 5
    FX_GBP = 6
    FX_JPY = 7
    FX_NGN = 11
    FX_ZAR = 12
    FX_KES = 13
    FX_GHS = 14
    FX_EGP = 15
    FEE = 9
    CLEARING = 10
    ESCROW_HOLDING = 20
    ESCROW_FEES = 21
    ESCROW_INSURANCE = 22
    ESCROW_DISPUTES = 23
    MOJALOOP_SETTLEMENT = 30
    MOJALOOP_POSITION = 31


class AccountCode:
    """TigerBeetle account type codes"""
    CUSTOMER = 1
    CLEARING = 2
    REVENUE = 3
    INTERMEDIARY = 4
    BILLER = 5
    MERCHANT = 6
    ESCROW_HOLDING = 10
    ESCROW_FEE = 11
    ESCROW_INSURANCE = 12
    ESCROW_DISPUTE = 13
    MOJALOOP_DFSP = 20
    MOJALOOP_HUB = 21


class TransferCode:
    """Transfer type codes for audit"""
    WIRE_DOMESTIC = 1
    WIRE_INTERNATIONAL = 2
    ACH_CREDIT = 10
    ACH_DEBIT = 11
    CARD_AUTH = 20
    CARD_CAPTURE = 21
    CARD_REFUND = 22
    BILL_PAYMENT = 30
    FX_CONVERSION = 40
    FEE_COLLECTION = 50
    ESCROW_FUND = 60
    ESCROW_RELEASE = 61
    ESCROW_REFUND = 62
    MOJALOOP_TRANSFER = 70
    MOJALOOP_SETTLEMENT = 71


def uuid_to_u128(uuid_val: UUID) -> int:
    """Convert UUID to TigerBeetle u128 integer."""
    return int(uuid_val.hex, 16)


def string_to_u128(string_id: str) -> int:
    """Convert string ID to TigerBeetle u128 using SHA-256 hash."""
    hash_bytes = hashlib.sha256(string_id.encode()).digest()[:16]
    return int.from_bytes(hash_bytes, byteorder='big')


def u128_to_hex(u128_val: int) -> str:
    """Convert u128 to hex string for logging."""
    return format(u128_val, '032x')

class TigerBeetleClient:
    """Centralized TigerBeetle client for all payment services"""
    
    _instance: Optional['TigerBeetleClient'] = None
    _client: Optional[Client] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self._initialize_client()
    
    def _initialize_client(self):
        """Initialize TigerBeetle client connection"""
        try:
            # Connect to TigerBeetle cluster
            # In production, use actual cluster addresses
            cluster_id = 0
            addresses = ["3000"]  # Default port
            
            self._client = Client(
                cluster_id=cluster_id,
                replica_addresses=addresses
            )
            
            logger.info("TigerBeetle client initialized", cluster_id=cluster_id)
            
        except Exception as e:
            logger.error("Failed to initialize TigerBeetle client", error=str(e))
            raise
    
    @property
    def client(self) -> Client:
        """Get TigerBeetle client instance"""
        if self._client is None:
            self._initialize_client()
        return self._client
    
    def to_cents(self, amount: Decimal) -> int:
        """Convert decimal amount to cents (TigerBeetle uses integers)"""
        return int(amount * 100)
    
    def from_cents(self, cents: int) -> Decimal:
        """Convert cents to decimal amount"""
        return Decimal(cents) / 100
    
    def create_account(
        self,
        account_id: int,
        ledger: int,
        code: int,
        flags: AccountFlags = AccountFlags.NONE,
        user_data: int = 0
    ) -> bool:
        """Create a single TigerBeetle account"""
        try:
            account = Account(
                id=account_id,
                ledger=ledger,
                code=code,
                flags=flags,
                user_data=user_data
            )
            
            results = self.client.create_accounts([account])
            
            if results:
                logger.error("Account creation failed", 
                           account_id=account_id, 
                           error=str(results[0]))
                return False
            
            logger.info("Account created", account_id=account_id, ledger=ledger)
            return True
            
        except Exception as e:
            logger.error("Account creation exception", 
                        account_id=account_id, 
                        error=str(e))
            return False
    
    def create_accounts_batch(self, accounts: List[Account]) -> List:
        """Create multiple accounts in batch"""
        try:
            results = self.client.create_accounts(accounts)
            
            if results:
                logger.warning("Some accounts failed to create", 
                             failed_count=len(results))
            else:
                logger.info("All accounts created successfully", 
                          count=len(accounts))
            
            return results
            
        except Exception as e:
            logger.error("Batch account creation failed", error=str(e))
            raise
    
    def create_transfer(
        self,
        transfer_id: int,
        debit_account_id: int,
        credit_account_id: int,
        amount: int,  # in cents
        ledger: int,
        code: int,
        flags: TransferFlags = TransferFlags.NONE,
        user_data: int = 0,
        timeout: int = 0
    ) -> Optional[str]:
        """
        Create a single transfer
        Returns None on success, error message on failure
        """
        try:
            transfer = Transfer(
                id=transfer_id,
                debit_account_id=debit_account_id,
                credit_account_id=credit_account_id,
                amount=amount,
                ledger=ledger,
                code=code,
                flags=flags,
                user_data=user_data,
                timeout=timeout,
                timestamp=0
            )
            
            results = self.client.create_transfers([transfer])
            
            if results:
                error_msg = str(results[0])
                logger.error("Transfer failed", 
                           transfer_id=transfer_id, 
                           error=error_msg)
                return error_msg
            
            logger.info("Transfer created", 
                       transfer_id=transfer_id,
                       amount=amount)
            return None
            
        except Exception as e:
            error_msg = f"Transfer exception: {str(e)}"
            logger.error("Transfer creation exception", 
                        transfer_id=transfer_id, 
                        error=error_msg)
            return error_msg
    
    def create_transfers_batch(self, transfers: List[Transfer]) -> List:
        """Create multiple linked transfers atomically"""
        try:
            results = self.client.create_transfers(transfers)
            
            if results:
                logger.error("Batch transfer failed", 
                           failed_count=len(results),
                           errors=[str(r) for r in results])
            else:
                logger.info("Batch transfer successful", 
                          count=len(transfers))
            
            return results
            
        except Exception as e:
            logger.error("Batch transfer exception", error=str(e))
            raise
    
    def lookup_account(self, account_id: int) -> Optional[Account]:
        """Lookup single account"""
        try:
            accounts = self.client.lookup_accounts([account_id])
            
            if not accounts:
                logger.warning("Account not found", account_id=account_id)
                return None
            
            return accounts[0]
            
        except Exception as e:
            logger.error("Account lookup failed", 
                        account_id=account_id, 
                        error=str(e))
            return None
    
    def get_balance(self, account_id: int) -> Optional[Decimal]:
        """Get account balance in decimal"""
        account = self.lookup_account(account_id)
        
        if not account:
            return None
        
        balance_cents = account.debits_posted - account.credits_posted
        return self.from_cents(balance_cents)
    
    def get_account_details(self, account_id: int) -> Optional[dict]:
        """Get detailed account information"""
        account = self.lookup_account(account_id)
        
        if not account:
            return None
        
        posted_balance = account.credits_posted - account.debits_posted
        available = posted_balance - account.debits_pending
        
        return {
            "account_id": account.id,
            "account_id_hex": u128_to_hex(account.id),
            "ledger": account.ledger,
            "code": account.code,
            "balance": float(self.from_cents(posted_balance)),
            "available_balance": float(self.from_cents(available)),
            "debits_posted": account.debits_posted,
            "credits_posted": account.credits_posted,
            "debits_pending": account.debits_pending,
            "credits_pending": account.credits_pending,
            "timestamp": account.timestamp
        }
    
    # ==================== ID Mapping ====================
    
    def map_uuid(self, uuid_val: UUID) -> int:
        """Map UUID to TigerBeetle u128"""
        return uuid_to_u128(uuid_val)
    
    def map_string_id(self, string_id: str) -> int:
        """Map string ID to TigerBeetle u128"""
        return string_to_u128(string_id)
    
    def generate_transfer_id(self, *components: str) -> int:
        """Generate deterministic transfer ID from components for idempotency."""
        combined = ":".join(str(c) for c in components)
        return string_to_u128(combined)
    
    # ==================== Two-Phase Transfers ====================
    
    def create_pending_transfer(
        self,
        transfer_id: int,
        debit_account_id: int,
        credit_account_id: int,
        amount: int,
        ledger: int,
        code: int,
        timeout_seconds: int = 300,
        user_data: int = 0
    ) -> Optional[str]:
        """
        Create a pending (two-phase) transfer for auth/capture pattern.
        
        Used for:
        - Card authorizations
        - Escrow holds
        - ACH with potential returns
        """
        return self.create_transfer(
            transfer_id=transfer_id,
            debit_account_id=debit_account_id,
            credit_account_id=credit_account_id,
            amount=amount,
            ledger=ledger,
            code=code,
            flags=TransferFlags.PENDING,
            timeout=timeout_seconds,
            user_data=user_data
        )
    
    def post_pending_transfer(
        self,
        post_transfer_id: int,
        pending_transfer_id: int,
        amount: int = 0
    ) -> Optional[str]:
        """
        Post (capture) a pending transfer.
        
        Args:
            post_transfer_id: New transfer ID for the post operation
            pending_transfer_id: ID of the pending transfer to post
            amount: Amount to post (0 = full amount, or partial capture)
        """
        try:
            transfer = Transfer(
                id=post_transfer_id,
                debit_account_id=0,
                credit_account_id=0,
                amount=amount,
                ledger=0,
                code=0,
                flags=TransferFlags.POST_PENDING_TRANSFER,
                pending_id=pending_transfer_id,
                timestamp=0
            )
            
            results = self.client.create_transfers([transfer])
            
            if results:
                error_msg = str(results[0])
                logger.error("Post pending transfer failed", error=error_msg)
                return error_msg
            
            logger.info("Pending transfer posted",
                       post_id=post_transfer_id,
                       pending_id=pending_transfer_id)
            return None
            
        except Exception as e:
            return f"Post pending exception: {str(e)}"
    
    def void_pending_transfer(
        self,
        void_transfer_id: int,
        pending_transfer_id: int
    ) -> Optional[str]:
        """
        Void (cancel) a pending transfer.
        
        Used when:
        - Card authorization is reversed
        - Escrow is cancelled
        - ACH is returned
        """
        try:
            transfer = Transfer(
                id=void_transfer_id,
                debit_account_id=0,
                credit_account_id=0,
                amount=0,
                ledger=0,
                code=0,
                flags=TransferFlags.VOID_PENDING_TRANSFER,
                pending_id=pending_transfer_id,
                timestamp=0
            )
            
            results = self.client.create_transfers([transfer])
            
            if results:
                error_msg = str(results[0])
                logger.error("Void pending transfer failed", error=error_msg)
                return error_msg
            
            logger.info("Pending transfer voided",
                       void_id=void_transfer_id,
                       pending_id=pending_transfer_id)
            return None
            
        except Exception as e:
            return f"Void pending exception: {str(e)}"
    
    # ==================== Linked Transfers ====================
    
    def create_linked_transfers(
        self,
        transfers: List[Dict[str, Any]]
    ) -> Optional[str]:
        """
        Create multiple linked transfers atomically.
        All succeed or all fail together.
        
        Args:
            transfers: List of dicts with transfer_id, debit_account_id,
                      credit_account_id, amount, ledger, code
        """
        if not transfers:
            return "No transfers provided"
        
        try:
            tb_transfers = []
            for i, t in enumerate(transfers):
                flags = TransferFlags.LINKED if i < len(transfers) - 1 else TransferFlags.NONE
                
                tb_transfers.append(Transfer(
                    id=t["transfer_id"],
                    debit_account_id=t["debit_account_id"],
                    credit_account_id=t["credit_account_id"],
                    amount=t["amount"],
                    ledger=t["ledger"],
                    code=t["code"],
                    flags=flags,
                    user_data=t.get("user_data", 0),
                    timeout=0,
                    timestamp=0
                ))
            
            results = self.client.create_transfers(tb_transfers)
            
            if results:
                error_msg = f"Linked transfers failed: {[str(r) for r in results]}"
                logger.error(error_msg)
                return error_msg
            
            logger.info("Linked transfers successful", count=len(transfers))
            return None
            
        except Exception as e:
            return f"Linked transfers exception: {str(e)}"
    
    # ==================== Account Constraints ====================
    
    def create_account_with_constraints(
        self,
        account_id: int,
        ledger: int,
        code: int,
        prevent_overdraft: bool = True,
        user_data: int = 0
    ) -> bool:
        """
        Create account with overdraft prevention.
        Debits cannot exceed credits.
        """
        flags = AccountFlags.NONE
        if prevent_overdraft:
            flags |= AccountFlags.DEBITS_MUST_NOT_EXCEED_CREDITS
        
        return self.create_account(
            account_id=account_id,
            ledger=ledger,
            code=code,
            flags=flags,
            user_data=user_data
        )
    
    # ==================== Transfer Lookups ====================
    
    def lookup_transfer(self, transfer_id: int) -> Optional[Transfer]:
        """Lookup single transfer by ID"""
        try:
            transfers = self.client.lookup_transfers([transfer_id])
            if not transfers:
                return None
            return transfers[0]
        except Exception as e:
            logger.error("Transfer lookup failed", error=str(e))
            return None
    
    def lookup_transfers(self, transfer_ids: List[int]) -> List[Transfer]:
        """Lookup multiple transfers"""
        try:
            return self.client.lookup_transfers(transfer_ids)
        except Exception as e:
            logger.error("Transfers lookup failed", error=str(e))
            return []
    
    def get_transfer_details(self, transfer_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed transfer information"""
        transfer = self.lookup_transfer(transfer_id)
        if not transfer:
            return None
        
        return {
            "transfer_id": transfer.id,
            "transfer_id_hex": u128_to_hex(transfer.id),
            "debit_account_id": transfer.debit_account_id,
            "credit_account_id": transfer.credit_account_id,
            "amount": float(self.from_cents(transfer.amount)),
            "amount_cents": transfer.amount,
            "ledger": transfer.ledger,
            "code": transfer.code,
            "flags": transfer.flags,
            "pending_id": transfer.pending_id if transfer.pending_id else None,
            "timestamp": transfer.timestamp
        }
    
    # ==================== Reconciliation ====================
    
    def get_available_balance(self, account_id: int) -> Optional[Decimal]:
        """Get available balance (excluding pending holds)."""
        account = self.lookup_account(account_id)
        if not account:
            return None
        
        posted_balance = account.credits_posted - account.debits_posted
        available = posted_balance - account.debits_pending
        return self.from_cents(available)
    
    def verify_transfer_exists(self, transfer_id: int) -> bool:
        """Verify a transfer exists in the ledger"""
        return self.lookup_transfer(transfer_id) is not None
    
    def verify_account_balance(
        self,
        account_id: int,
        expected_balance: Decimal,
        tolerance_cents: int = 0
    ) -> Tuple[bool, Optional[Decimal]]:
        """Verify account balance matches expected value."""
        actual = self.get_balance(account_id)
        if actual is None:
            return (False, None)
        
        diff_cents = abs(self.to_cents(actual) - self.to_cents(expected_balance))
        matches = diff_cents <= tolerance_cents
        return (matches, actual)


# Global singleton instance
tigerbeetle_client = TigerBeetleClient()

# Convenience exports
__all__ = [
    "TigerBeetleClient",
    "tigerbeetle_client",
    "Ledger",
    "AccountCode",
    "TransferCode",
    "uuid_to_u128",
    "string_to_u128",
    "u128_to_hex",
    # Legacy exports
    "WIRE_LEDGER", "ACH_LEDGER", "BILL_PAY_LEDGER",
    "FX_LEDGER_USD", "FX_LEDGER_EUR", "FX_LEDGER_GBP", "FX_LEDGER_JPY",
    "CARD_LEDGER", "FEE_LEDGER", "CLEARING_LEDGER",
    "CUSTOMER_ACCOUNT_CODE", "CLEARING_ACCOUNT_CODE", "REVENUE_ACCOUNT_CODE",
    "INTERMEDIARY_ACCOUNT_CODE", "BILLER_ACCOUNT_CODE", "MERCHANT_ACCOUNT_CODE"
]
