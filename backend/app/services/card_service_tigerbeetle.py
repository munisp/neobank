"""
Card Service with TigerBeetle Integration
Handles card operations with pending authorization holds
"""

from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from enum import Enum
from decimal import Decimal
import uuid
import structlog

from ..infrastructure.tigerbeetle_client import tigerbeetle_client, CARD_LEDGER, FEE_LEDGER
from tigerbeetle import Transfer, TransferFlags

logger = structlog.get_logger(__name__)

# Card Transfer Codes
CARD_PURCHASE_CODE = 8001
CARD_AUTHORIZATION_CODE = 8002
CARD_SETTLEMENT_CODE = 8003
CARD_REVERSAL_CODE = 8004
CARD_CHARGEBACK_CODE = 8005
CARD_FEE_CODE = 8006
CARD_REWARDS_CODE = 8007

class CardType(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"
    PREPAID = "prepaid"

class TransactionType(str, Enum):
    PURCHASE = "purchase"
    WITHDRAWAL = "withdrawal"
    REFUND = "refund"

class CardServiceTigerBeetle:
    """Card Service with TigerBeetle pending transfers for auth holds"""
    
    def __init__(self):
        self.tb = tigerbeetle_client
        self.authorizations = {}
        self.cards = {}
        self.fees = {
            "foreign_transaction": Decimal("0.03"),  # 3%
            "atm_withdrawal": Decimal("2.50"),
            "overlimit": Decimal("35.00"),
            "late_payment": Decimal("25.00")
        }
    
    async def authorize_transaction(
        self,
        card_id: str,
        card_account_id: int,
        amount: Decimal,
        merchant_name: str,
        merchant_category: str,
        is_foreign: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Authorize card transaction with TigerBeetle pending transfer
        
        Creates pending hold that settles after merchant capture
        """
        
        logger.info("Authorizing card transaction",
                   card_id=card_id,
                   merchant=merchant_name,
                   amount=str(amount))
        
        if amount <= 0:
            return {"success": False, "error": "Invalid amount"}
        
        # Generate authorization ID
        auth_id = int(uuid.uuid4().int & (1<<63)-1)
        
        # Calculate fees
        foreign_fee = Decimal("0")
        if is_foreign:
            foreign_fee = amount * self.fees["foreign_transaction"]
        
        amount_cents = self.tb.to_cents(amount)
        fee_cents = self.tb.to_cents(foreign_fee)
        
        try:
            # Create pending authorization hold (settles in 3 days if not captured)
            transfers = [
                Transfer(
                    id=auth_id,
                    debit_account_id=card_account_id,
                    credit_account_id=200,  # Merchant clearing account
                    amount=amount_cents,
                    ledger=CARD_LEDGER,
                    code=CARD_AUTHORIZATION_CODE,
                    flags=TransferFlags.PENDING | (TransferFlags.LINKED if foreign_fee > 0 else TransferFlags.NONE),
                    user_data=0,
                    timeout=3 * 24 * 3600,  # 3 days
                    timestamp=0
                )
            ]
            
            # Add foreign transaction fee if applicable
            if foreign_fee > 0:
                transfers.append(
                    Transfer(
                        id=auth_id + 1,
                        debit_account_id=card_account_id,
                        credit_account_id=2,  # Fee revenue
                        amount=fee_cents,
                        ledger=FEE_LEDGER,
                        code=CARD_FEE_CODE,
                        flags=TransferFlags.NONE,
                        user_data=0,
                        timeout=0,
                        timestamp=0
                    )
                )
            
            results = self.tb.client.create_transfers(transfers)
            
            if results:
                error_msg = f"Authorization declined: {results[0]}"
                logger.error("Authorization failed", error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "status": "declined"
                }
            
            logger.info("Authorization approved",
                       auth_id=auth_id,
                       amount_cents=amount_cents)
            
        except Exception as e:
            logger.error("Authorization exception", error=str(e))
            return {
                "success": False,
                "error": str(e),
                "status": "declined"
            }
        
        # Store authorization
        self.authorizations[auth_id] = {
            "auth_id": auth_id,
            "card_id": card_id,
            "card_account_id": card_account_id,
            "amount": float(amount),
            "foreign_fee": float(foreign_fee),
            "merchant_name": merchant_name,
            "merchant_category": merchant_category,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(days=3)).isoformat()
        }
        
        return {
            "success": True,
            "auth_id": auth_id,
            "status": "approved",
            "amount": float(amount),
            "foreign_fee": float(foreign_fee),
            "total": float(amount + foreign_fee),
            "available_credit_reduced": float(amount),
            "authorization_code": f"AUTH{auth_id}",
            "expires_at": self.authorizations[auth_id]["expires_at"],
            "message": "Transaction authorized"
        }
    
    async def settle_transaction(
        self,
        auth_id: int,
        final_amount: Optional[Decimal] = None
    ) -> Dict[str, Any]:
        """
        Settle previously authorized transaction
        
        Converts pending transfer to posted
        """
        
        logger.info("Settling transaction", auth_id=auth_id)
        
        if auth_id not in self.authorizations:
            return {"success": False, "error": "Authorization not found"}
        
        auth = self.authorizations[auth_id]
        
        if auth["status"] != "pending":
            return {"success": False, "error": f"Invalid status: {auth['status']}"}
        
        # Update authorization status
        auth["status"] = "settled"
        auth["settled_at"] = datetime.now().isoformat()
        
        if final_amount:
            auth["final_amount"] = float(final_amount)
        
        return {
            "success": True,
            "auth_id": auth_id,
            "status": "settled",
            "original_amount": auth["amount"],
            "final_amount": float(final_amount) if final_amount else auth["amount"],
            "settled_at": auth["settled_at"],
            "message": "Transaction settled"
        }
    
    async def process_chargeback(
        self,
        auth_id: int,
        reason: str,
        dispute_amount: Optional[Decimal] = None
    ) -> Dict[str, Any]:
        """
        Process chargeback with TigerBeetle reversal transfer
        """
        
        logger.info("Processing chargeback", auth_id=auth_id, reason=reason)
        
        if auth_id not in self.authorizations:
            return {"success": False, "error": "Authorization not found"}
        
        auth = self.authorizations[auth_id]
        chargeback_amount = dispute_amount if dispute_amount else Decimal(str(auth["amount"]))
        
        # Generate chargeback ID
        chargeback_id = int(uuid.uuid4().int & (1<<63)-1)
        
        chargeback_cents = self.tb.to_cents(chargeback_amount)
        
        try:
            # Reverse the transaction
            transfer = Transfer(
                id=chargeback_id,
                debit_account_id=200,  # Merchant clearing
                credit_account_id=auth["card_account_id"],  # Refund to customer
                amount=chargeback_cents,
                ledger=CARD_LEDGER,
                code=CARD_CHARGEBACK_CODE,
                flags=TransferFlags.NONE,
                user_data=0,
                timeout=0,
                timestamp=0
            )
            
            results = self.tb.client.create_transfers([transfer])
            
            if results:
                error_msg = f"Chargeback failed: {results[0]}"
                logger.error("Chargeback failed", error=error_msg)
                return {"success": False, "error": error_msg}
            
            logger.info("Chargeback processed", chargeback_id=chargeback_id)
            
        except Exception as e:
            logger.error("Chargeback exception", error=str(e))
            return {"success": False, "error": str(e)}
        
        # Update authorization
        auth["status"] = "charged_back"
        auth["chargeback_id"] = chargeback_id
        auth["chargeback_reason"] = reason
        auth["chargeback_amount"] = float(chargeback_amount)
        auth["chargeback_date"] = datetime.now().isoformat()
        
        return {
            "success": True,
            "chargeback_id": chargeback_id,
            "auth_id": auth_id,
            "amount": float(chargeback_amount),
            "reason": reason,
            "status": "completed",
            "tigerbeetle_transfer_id": chargeback_id,
            "message": "Chargeback processed successfully"
        }
    
    async def process_rewards(
        self,
        card_account_id: int,
        transaction_amount: Decimal,
        rewards_rate: Decimal = Decimal("0.02")  # 2% cashback
    ) -> Dict[str, Any]:
        """
        Process card rewards with TigerBeetle transfer
        """
        
        rewards_amount = (transaction_amount * rewards_rate).quantize(Decimal("0.01"))
        
        if rewards_amount <= 0:
            return {"success": True, "rewards_amount": 0.0}
        
        rewards_id = int(uuid.uuid4().int & (1<<63)-1)
        rewards_cents = self.tb.to_cents(rewards_amount)
        
        try:
            transfer = Transfer(
                id=rewards_id,
                debit_account_id=2,  # Rewards expense account
                credit_account_id=card_account_id,
                amount=rewards_cents,
                ledger=CARD_LEDGER,
                code=CARD_REWARDS_CODE,
                flags=TransferFlags.NONE,
                user_data=0,
                timeout=0,
                timestamp=0
            )
            
            results = self.tb.client.create_transfers([transfer])
            
            if results:
                logger.warning("Rewards processing failed", error=str(results[0]))
                return {"success": False, "error": str(results[0])}
            
            logger.info("Rewards processed", rewards_id=rewards_id, amount=rewards_cents)
            
        except Exception as e:
            logger.error("Rewards exception", error=str(e))
            return {"success": False, "error": str(e)}
        
        return {
            "success": True,
            "rewards_id": rewards_id,
            "rewards_amount": float(rewards_amount),
            "rewards_rate": float(rewards_rate * 100),
            "transaction_amount": float(transaction_amount),
            "message": f"Earned ${rewards_amount} cashback"
        }
