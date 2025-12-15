"""
FX Service with TigerBeetle Multi-Ledger Integration
Handles foreign exchange with atomic cross-currency transfers
"""

from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from decimal import Decimal
import uuid
import structlog

from ..infrastructure.tigerbeetle_client import (
    tigerbeetle_client, 
    FX_LEDGER_USD, FX_LEDGER_EUR, FX_LEDGER_GBP, FX_LEDGER_JPY,
    FEE_LEDGER
)
from tigerbeetle import Transfer, TransferFlags

logger = structlog.get_logger(__name__)

# FX Transfer Codes
FX_CONVERSION_CODE = 4001
FX_FEE_CODE = 4002
FX_SPREAD_CODE = 4003

class FXServiceTigerBeetle:
    """FX Service with TigerBeetle multi-ledger atomic transfers"""
    
    def __init__(self):
        self.tb = tigerbeetle_client
        self.fx_transfers = {}
        
        # Ledger mapping
        self.currency_ledgers = {
            "USD": FX_LEDGER_USD,
            "EUR": FX_LEDGER_EUR,
            "GBP": FX_LEDGER_GBP,
            "JPY": FX_LEDGER_JPY
        }
        
        # Mock FX rates (in production, fetch from API)
        self.fx_rates = {
            ("USD", "EUR"): Decimal("0.92"),
            ("USD", "GBP"): Decimal("0.79"),
            ("USD", "JPY"): Decimal("149.50"),
            ("EUR", "USD"): Decimal("1.09"),
            ("EUR", "GBP"): Decimal("0.86"),
            ("GBP", "USD"): Decimal("1.27"),
            ("GBP", "EUR"): Decimal("1.16"),
            ("JPY", "USD"): Decimal("0.0067")
        }
        
        self.spread_percentage = Decimal("0.015")  # 1.5% spread
    
    def get_fx_rate(self, from_currency: str, to_currency: str) -> Decimal:
        """Get FX rate with spread"""
        if from_currency == to_currency:
            return Decimal("1.0")
        
        base_rate = self.fx_rates.get((from_currency, to_currency), Decimal("1.0"))
        # Apply spread (bank margin)
        rate_with_spread = base_rate * (Decimal("1.0") - self.spread_percentage)
        return rate_with_spread.quantize(Decimal("0.0001"))
    
    async def execute_fx_transfer(
        self,
        from_account_id: int,
        to_account_id: int,
        amount: Decimal,
        from_currency: str,
        to_currency: str,
        beneficiary_name: str,
        beneficiary_bank: str,
        swift_code: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute FX transfer with TigerBeetle multi-ledger atomic operation
        
        Process:
        1. Debit source currency account (e.g., USD ledger)
        2. Credit FX clearing account (USD ledger)
        3. Debit FX clearing account (EUR ledger)
        4. Credit destination currency account (EUR ledger)
        
        All 4 transfers are linked and atomic
        """
        
        logger.info("Executing FX transfer",
                   from_currency=from_currency,
                   to_currency=to_currency,
                   amount=str(amount))
        
        if amount <= 0:
            return {"success": False, "error": "Invalid amount"}
        
        # Get FX rate
        fx_rate = self.get_fx_rate(from_currency, to_currency)
        converted_amount = (amount * fx_rate).quantize(Decimal("0.01"))
        
        # Calculate spread (bank revenue)
        market_rate = self.fx_rates.get((from_currency, to_currency), Decimal("1.0"))
        spread_amount = amount * (market_rate - fx_rate)
        
        # FX fee
        fx_fee = Decimal("15.00") + (amount * Decimal("0.005"))  # $15 + 0.5%
        
        # Generate transfer ID
        fx_id = int(uuid.uuid4().int & (1<<63)-1)
        
        # Get ledger IDs
        from_ledger = self.currency_ledgers.get(from_currency, FX_LEDGER_USD)
        to_ledger = self.currency_ledgers.get(to_currency, FX_LEDGER_EUR)
        
        # Convert to cents
        amount_cents = self.tb.to_cents(amount)
        converted_cents = self.tb.to_cents(converted_amount)
        fee_cents = self.tb.to_cents(fx_fee)
        spread_cents = self.tb.to_cents(spread_amount)
        
        try:
            # Multi-ledger atomic FX transfer
            transfers = [
                # 1. Debit source currency from customer
                Transfer(
                    id=fx_id,
                    debit_account_id=from_account_id,
                    credit_account_id=100,  # FX clearing (source currency)
                    amount=amount_cents,
                    ledger=from_ledger,
                    code=FX_CONVERSION_CODE,
                    flags=TransferFlags.LINKED,
                    user_data=0,
                    timeout=0,
                    timestamp=0
                ),
                # 2. Credit destination currency to beneficiary
                Transfer(
                    id=fx_id + 1,
                    debit_account_id=101,  # FX clearing (dest currency)
                    credit_account_id=to_account_id,
                    amount=converted_cents,
                    ledger=to_ledger,
                    code=FX_CONVERSION_CODE,
                    flags=TransferFlags.LINKED,
                    user_data=0,
                    timeout=0,
                    timestamp=0
                ),
                # 3. FX fee
                Transfer(
                    id=fx_id + 2,
                    debit_account_id=from_account_id,
                    credit_account_id=2,  # Fee revenue
                    amount=fee_cents,
                    ledger=FEE_LEDGER,
                    code=FX_FEE_CODE,
                    flags=TransferFlags.LINKED,
                    user_data=0,
                    timeout=0,
                    timestamp=0
                ),
                # 4. FX spread revenue
                Transfer(
                    id=fx_id + 3,
                    debit_account_id=100,  # FX clearing
                    credit_account_id=2,  # Revenue
                    amount=spread_cents,
                    ledger=from_ledger,
                    code=FX_SPREAD_CODE,
                    flags=TransferFlags.NONE,  # Last in chain
                    user_data=0,
                    timeout=0,
                    timestamp=0
                )
            ]
            
            results = self.tb.client.create_transfers(transfers)
            
            if results:
                error_msg = f"FX transfer failed: {results[0]}"
                logger.error("FX transfer failed", error=error_msg)
                return {"success": False, "error": error_msg}
            
            logger.info("FX transfer completed",
                       fx_id=fx_id,
                       fx_rate=str(fx_rate),
                       converted_amount=str(converted_amount))
            
        except Exception as e:
            logger.error("FX transfer exception", error=str(e))
            return {"success": False, "error": str(e)}
        
        # Store FX transfer metadata
        self.fx_transfers[fx_id] = {
            "fx_id": fx_id,
            "from_account_id": from_account_id,
            "to_account_id": to_account_id,
            "from_currency": from_currency,
            "to_currency": to_currency,
            "source_amount": float(amount),
            "converted_amount": float(converted_amount),
            "fx_rate": float(fx_rate),
            "spread": float(spread_amount),
            "fee": float(fx_fee),
            "beneficiary_name": beneficiary_name,
            "beneficiary_bank": beneficiary_bank,
            "swift_code": swift_code,
            "status": "completed",
            "created_at": datetime.now().isoformat(),
            "estimated_delivery": (datetime.now() + timedelta(days=2)).isoformat()
        }
        
        return {
            "success": True,
            "fx_id": fx_id,
            "status": "completed",
            "source_amount": float(amount),
            "source_currency": from_currency,
            "converted_amount": float(converted_amount),
            "destination_currency": to_currency,
            "fx_rate": float(fx_rate),
            "spread": float(spread_amount),
            "fee": float(fx_fee),
            "total_cost": float(amount + fx_fee),
            "estimated_delivery": self.fx_transfers[fx_id]["estimated_delivery"],
            "tigerbeetle_transfer_ids": [fx_id, fx_id + 1, fx_id + 2, fx_id + 3],
            "message": "FX transfer completed successfully"
        }
    
    async def get_fx_quote(
        self,
        from_currency: str,
        to_currency: str,
        amount: Decimal
    ) -> Dict[str, Any]:
        """Get FX quote without executing transfer"""
        
        fx_rate = self.get_fx_rate(from_currency, to_currency)
        converted_amount = (amount * fx_rate).quantize(Decimal("0.01"))
        
        market_rate = self.fx_rates.get((from_currency, to_currency), Decimal("1.0"))
        spread_amount = amount * (market_rate - fx_rate)
        
        fx_fee = Decimal("15.00") + (amount * Decimal("0.005"))
        
        return {
            "success": True,
            "from_currency": from_currency,
            "to_currency": to_currency,
            "source_amount": float(amount),
            "converted_amount": float(converted_amount),
            "fx_rate": float(fx_rate),
            "market_rate": float(market_rate),
            "spread": float(spread_amount),
            "spread_percentage": float(self.spread_percentage * 100),
            "fee": float(fx_fee),
            "total_cost": float(amount + fx_fee),
            "quote_valid_until": (datetime.now() + timedelta(hours=24)).isoformat()
        }
