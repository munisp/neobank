"""
TigerBeetle Client Infrastructure
Centralized TigerBeetle client with connection pooling and error handling
"""

from typing import Optional, List
from decimal import Decimal
import structlog
from tigerbeetle import Client, Account, Transfer, AccountFlags, TransferFlags

logger = structlog.get_logger(__name__)

# Ledger IDs
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

# Account Codes
CUSTOMER_ACCOUNT_CODE = 1
CLEARING_ACCOUNT_CODE = 2
REVENUE_ACCOUNT_CODE = 3
INTERMEDIARY_ACCOUNT_CODE = 4
BILLER_ACCOUNT_CODE = 5
MERCHANT_ACCOUNT_CODE = 6

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
        
        return {
            "account_id": account.id,
            "ledger": account.ledger,
            "code": account.code,
            "balance": float(self.from_cents(
                account.debits_posted - account.credits_posted
            )),
            "debits_posted": account.debits_posted,
            "credits_posted": account.credits_posted,
            "debits_pending": account.debits_pending,
            "credits_pending": account.credits_pending,
            "timestamp": account.timestamp
        }

# Global singleton instance
tigerbeetle_client = TigerBeetleClient()
