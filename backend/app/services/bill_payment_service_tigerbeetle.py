"""
Bill Payment Service with TigerBeetle Integration
Handles bill payments with atomic multi-biller settlement
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
from decimal import Decimal
import uuid
import structlog

from ..infrastructure.tigerbeetle_client import tigerbeetle_client, BILL_PAY_LEDGER, FEE_LEDGER
from tigerbeetle import Transfer, TransferFlags

logger = structlog.get_logger(__name__)

# Bill Payment Transfer Codes
UTILITY_PAYMENT_CODE = 3001
TELECOM_PAYMENT_CODE = 3002
CREDIT_CARD_PAYMENT_CODE = 3003
LOAN_PAYMENT_CODE = 3004
INSURANCE_PAYMENT_CODE = 3005
BILL_PAY_FEE_CODE = 3006
RECURRING_PAYMENT_CODE = 3007

class PaymentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"

class BillCategory(str, Enum):
    UTILITY = "utility"
    TELECOM = "telecom"
    CREDIT_CARD = "credit_card"
    LOAN = "loan"
    INSURANCE = "insurance"

class BillPaymentServiceTigerBeetle:
    """Bill Payment with TigerBeetle atomic transfers"""
    
    def __init__(self):
        self.tb = tigerbeetle_client
        self.payments = {}
        self.recurring_payments = {}
        self.fees = {
            "standard": Decimal("1.00"),
            "expedited": Decimal("10.00"),
            "recurring": Decimal("0.50")
        }
        
        # Biller account mappings (in production, from database)
        self.biller_accounts = {}
    
    async def pay_bill(
        self,
        customer_account_id: int,
        biller_id: str,
        biller_account_id: int,
        amount: Decimal,
        category: BillCategory,
        account_number: str,
        expedited: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Pay bill with atomic TigerBeetle transfer
        
        Atomically debits customer account and credits biller account
        Plus linked convenience fee transfer
        """
        
        logger.info("Processing bill payment",
                   customer_account=customer_account_id,
                   biller=biller_id,
                   amount=str(amount))
        
        if amount <= 0:
            return {"success": False, "error": "Invalid amount"}
        
        # Calculate fee
        fee = self.fees["expedited"] if expedited else self.fees["standard"]
        
        # Generate payment ID
        payment_id = int(uuid.uuid4().int & (1<<63)-1)
        
        # Determine transfer code
        code_map = {
            BillCategory.UTILITY: UTILITY_PAYMENT_CODE,
            BillCategory.TELECOM: TELECOM_PAYMENT_CODE,
            BillCategory.CREDIT_CARD: CREDIT_CARD_PAYMENT_CODE,
            BillCategory.LOAN: LOAN_PAYMENT_CODE,
            BillCategory.INSURANCE: INSURANCE_PAYMENT_CODE
        }
        code = code_map.get(category, UTILITY_PAYMENT_CODE)
        
        amount_cents = self.tb.to_cents(amount)
        fee_cents = self.tb.to_cents(fee)
        
        try:
            # Atomic payment + fee transfer
            transfers = [
                Transfer(
                    id=payment_id,
                    debit_account_id=customer_account_id,
                    credit_account_id=biller_account_id,
                    amount=amount_cents,
                    ledger=BILL_PAY_LEDGER,
                    code=code,
                    flags=TransferFlags.LINKED,
                    user_data=0,
                    timeout=0,
                    timestamp=0
                ),
                Transfer(
                    id=payment_id + 1,
                    debit_account_id=customer_account_id,
                    credit_account_id=2,  # Fee revenue
                    amount=fee_cents,
                    ledger=FEE_LEDGER,
                    code=BILL_PAY_FEE_CODE,
                    flags=TransferFlags.NONE,
                    user_data=0,
                    timeout=0,
                    timestamp=0
                )
            ]
            
            results = self.tb.client.create_transfers(transfers)
            
            if results:
                error_msg = f"Payment failed: {results[0]}"
                logger.error("Bill payment failed", error=error_msg)
                return {"success": False, "error": error_msg}
            
            logger.info("Bill payment completed",
                       payment_id=payment_id,
                       amount_cents=amount_cents)
            
        except Exception as e:
            logger.error("Bill payment exception", error=str(e))
            return {"success": False, "error": str(e)}
        
        # Store payment metadata
        self.payments[payment_id] = {
            "payment_id": payment_id,
            "customer_account_id": customer_account_id,
            "biller_id": biller_id,
            "amount": float(amount),
            "fee": float(fee),
            "category": category.value,
            "account_number": account_number,
            "status": PaymentStatus.COMPLETED.value,
            "created_at": datetime.now().isoformat(),
            "expedited": expedited
        }
        
        return {
            "success": True,
            "payment_id": payment_id,
            "status": "completed",
            "amount": float(amount),
            "fee": float(fee),
            "total": float(amount + fee),
            "confirmation_number": f"BP{payment_id}",
            "tigerbeetle_transfer_ids": [payment_id, payment_id + 1],
            "message": "Bill payment processed successfully"
        }
    
    async def setup_recurring_payment(
        self,
        customer_account_id: int,
        biller_id: str,
        biller_account_id: int,
        amount: Decimal,
        category: BillCategory,
        frequency: str,  # "monthly", "weekly", "biweekly"
        start_date: datetime,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Setup recurring bill payment
        
        Uses TigerBeetle scheduled transfers (future feature)
        Currently stores schedule and processes manually
        """
        
        logger.info("Setting up recurring payment",
                   customer_account=customer_account_id,
                   biller=biller_id,
                   frequency=frequency)
        
        recurring_id = int(uuid.uuid4().int & (1<<63)-1)
        
        self.recurring_payments[recurring_id] = {
            "recurring_id": recurring_id,
            "customer_account_id": customer_account_id,
            "biller_id": biller_id,
            "biller_account_id": biller_account_id,
            "amount": float(amount),
            "category": category.value,
            "frequency": frequency,
            "start_date": start_date.isoformat(),
            "next_payment_date": start_date.isoformat(),
            "status": "active",
            "created_at": datetime.now().isoformat()
        }
        
        return {
            "success": True,
            "recurring_id": recurring_id,
            "status": "active",
            "next_payment_date": start_date.isoformat(),
            "message": "Recurring payment setup successful"
        }
    
    async def process_multi_biller_batch(
        self,
        customer_account_id: int,
        payments: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Process multiple bill payments atomically
        
        All payments succeed or all fail
        """
        
        batch_id = int(uuid.uuid4().int & (1<<63)-1)
        
        logger.info("Processing multi-biller batch",
                   batch_id=batch_id,
                   payment_count=len(payments))
        
        transfers = []
        
        for idx, payment in enumerate(payments):
            payment_id = batch_id + idx * 2
            
            amount_cents = self.tb.to_cents(Decimal(str(payment["amount"])))
            fee_cents = self.tb.to_cents(self.fees["standard"])
            
            category = BillCategory(payment["category"])
            code_map = {
                BillCategory.UTILITY: UTILITY_PAYMENT_CODE,
                BillCategory.TELECOM: TELECOM_PAYMENT_CODE,
                BillCategory.CREDIT_CARD: CREDIT_CARD_PAYMENT_CODE,
                BillCategory.LOAN: LOAN_PAYMENT_CODE,
                BillCategory.INSURANCE: INSURANCE_PAYMENT_CODE
            }
            code = code_map.get(category, UTILITY_PAYMENT_CODE)
            
            # Link all transfers
            flags = TransferFlags.LINKED
            
            transfers.append(
                Transfer(
                    id=payment_id,
                    debit_account_id=customer_account_id,
                    credit_account_id=payment["biller_account_id"],
                    amount=amount_cents,
                    ledger=BILL_PAY_LEDGER,
                    code=code,
                    flags=flags,
                    user_data=0,
                    timeout=0,
                    timestamp=0
                )
            )
            
            transfers.append(
                Transfer(
                    id=payment_id + 1,
                    debit_account_id=customer_account_id,
                    credit_account_id=2,
                    amount=fee_cents,
                    ledger=FEE_LEDGER,
                    code=BILL_PAY_FEE_CODE,
                    flags=TransferFlags.LINKED if idx < len(payments) - 1 else TransferFlags.NONE,
                    user_data=0,
                    timeout=0,
                    timestamp=0
                )
            )
        
        try:
            results = self.tb.client.create_transfers(transfers)
            
            if results:
                error_msg = f"Batch failed: {len(results)} errors"
                logger.error("Multi-biller batch failed", error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "failed_count": len(results)
                }
            
            logger.info("Multi-biller batch completed",
                       batch_id=batch_id,
                       payment_count=len(payments))
            
        except Exception as e:
            logger.error("Batch exception", error=str(e))
            return {"success": False, "error": str(e)}
        
        total_amount = sum(Decimal(str(p["amount"])) for p in payments)
        total_fees = self.fees["standard"] * len(payments)
        
        return {
            "success": True,
            "batch_id": batch_id,
            "payment_count": len(payments),
            "total_amount": float(total_amount),
            "total_fees": float(total_fees),
            "grand_total": float(total_amount + total_fees),
            "status": "completed",
            "message": f"Successfully processed {len(payments)} bill payments"
        }
