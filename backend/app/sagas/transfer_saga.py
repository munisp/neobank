"""
Transfer Saga
Implements distributed transfer between PostgreSQL and TigerBeetle
"""

from typing import Dict, Any, Optional
from decimal import Decimal
from uuid import UUID
import structlog

from app.sagas.base_saga import BaseSaga, SagaContext
from app.events.models import (
    TransferInitiated,
    TransferCompleted,
    TransferFailed,
    BalanceReserved,
    BalanceReservationReleased,
    TigerBeetleTransferCreated,
)

logger = structlog.get_logger()


class TransferSaga(BaseSaga):
    """
    Saga for coordinating transfers between PostgreSQL and TigerBeetle
    
    Steps:
    1. Validate transfer (check balances, limits, etc.)
    2. Reserve balance in PostgreSQL
    3. Create transfer in TigerBeetle
    4. Commit transfer in PostgreSQL
    5. Emit success event
    
    Compensation:
    - Release reserved balance
    - Reverse TigerBeetle transfer
    - Emit failure event
    """
    
    def __init__(
        self,
        pg_service,
        tigerbeetle_service,
        event_store_service
    ):
        self.pg_service = pg_service
        self.tigerbeetle_service = tigerbeetle_service
        self.event_store_service = event_store_service
        
        super().__init__()
    
    def _define_steps(self) -> None:
        """Define the transfer saga steps"""
        
        # Step 1: Validate transfer
        self.add_step(
            step_name="validate_transfer",
            forward_action=self._validate_transfer,
            compensation_action=None,  # No compensation needed for validation
            max_retries=1,  # No retries for validation
            timeout=5.0
        )
        
        # Step 2: Reserve balance in PostgreSQL
        self.add_step(
            step_name="reserve_balance",
            forward_action=self._reserve_balance,
            compensation_action=self._release_balance,
            max_retries=3,
            timeout=10.0
        )
        
        # Step 3: Create transfer in TigerBeetle
        self.add_step(
            step_name="create_tigerbeetle_transfer",
            forward_action=self._create_tigerbeetle_transfer,
            compensation_action=self._reverse_tigerbeetle_transfer,
            max_retries=3,
            timeout=15.0
        )
        
        # Step 4: Commit transfer in PostgreSQL
        self.add_step(
            step_name="commit_transfer",
            forward_action=self._commit_transfer,
            compensation_action=self._rollback_transfer,
            max_retries=3,
            timeout=10.0
        )
        
        # Step 5: Emit success event
        self.add_step(
            step_name="emit_success_event",
            forward_action=self._emit_success_event,
            compensation_action=None,  # Events are immutable
            max_retries=3,
            timeout=5.0
        )
    
    # ========================================================================
    # STEP 1: VALIDATE TRANSFER
    # ========================================================================
    
    async def _validate_transfer(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate the transfer
        
        Checks:
        - Accounts exist
        - Sufficient balance
        - Transfer limits
        - Account status
        """
        logger.info("Validating transfer", saga_id=str(self.saga_id))
        
        from_account_id = context["input_data"]["from_account_id"]
        to_account_id = context["input_data"]["to_account_id"]
        amount = Decimal(str(context["input_data"]["amount"]))
        
        # Check accounts exist
        from_account = await self.pg_service.get_account(from_account_id)
        if not from_account:
            raise ValueError(f"From account not found: {from_account_id}")
        
        to_account = await self.pg_service.get_account(to_account_id)
        if not to_account:
            raise ValueError(f"To account not found: {to_account_id}")
        
        # Check account status
        if from_account["status"] != "ACTIVE":
            raise ValueError(f"From account is not active: {from_account['status']}")
        
        if to_account["status"] != "ACTIVE":
            raise ValueError(f"To account is not active: {to_account['status']}")
        
        # Check sufficient balance
        available_balance = Decimal(str(from_account["available_balance"]))
        if available_balance < amount:
            raise ValueError(
                f"Insufficient balance: {available_balance} < {amount}"
            )
        
        # Check transfer limits
        daily_limit = Decimal(str(from_account.get("daily_limit", "1000000")))
        daily_total = await self.pg_service.get_daily_transfer_total(from_account_id)
        
        if daily_total + amount > daily_limit:
            raise ValueError(
                f"Daily limit exceeded: {daily_total + amount} > {daily_limit}"
            )
        
        logger.info("Transfer validation passed", saga_id=str(self.saga_id))
        
        return {
            "from_account": from_account,
            "to_account": to_account,
            "amount": str(amount),
            "validated": True
        }
    
    # ========================================================================
    # STEP 2: RESERVE BALANCE
    # ========================================================================
    
    async def _reserve_balance(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Reserve balance in PostgreSQL
        
        This ensures the funds are held and not available for other transfers
        """
        logger.info("Reserving balance", saga_id=str(self.saga_id))
        
        from_account_id = context["input_data"]["from_account_id"]
        amount = Decimal(str(context["input_data"]["amount"]))
        
        # Create reservation
        reservation = await self.pg_service.create_balance_reservation(
            account_id=from_account_id,
            amount=amount,
            purpose="transfer",
            saga_id=str(self.saga_id)
        )
        
        # Emit event
        event = BalanceReserved(
            aggregate_id=from_account_id,
            version=await self.event_store_service.get_next_version(from_account_id),
            account_id=from_account_id,
            account_number=context["step_results"][1]["from_account"]["account_number"],
            reserved_amount=amount,
            available_balance=Decimal(str(context["step_results"][1]["from_account"]["available_balance"])) - amount,
            reservation_id=UUID(reservation["reservation_id"]),
            saga_id=UUID(str(self.saga_id)),
            correlation_id=UUID(context["correlation_id"]),
            user_id=context.get("user_id")
        )
        
        await self.event_store_service.append_event(event)
        
        logger.info("Balance reserved", 
                   saga_id=str(self.saga_id),
                   reservation_id=reservation["reservation_id"])
        
        return {
            "reservation_id": reservation["reservation_id"],
            "reserved_amount": str(amount)
        }
    
    async def _release_balance(
        self,
        context: Dict[str, Any],
        compensation_data: Optional[Dict[str, Any]]
    ) -> None:
        """
        Compensation: Release reserved balance
        """
        logger.info("Releasing reserved balance", saga_id=str(self.saga_id))
        
        # Get reservation ID from step 2 result
        step_2_result = context["step_results"].get(2)
        if not step_2_result:
            logger.warning("No reservation to release", saga_id=str(self.saga_id))
            return
        
        reservation_id = step_2_result["reservation_id"]
        
        # Release reservation
        await self.pg_service.release_balance_reservation(reservation_id)
        
        # Emit event
        from_account_id = context["input_data"]["from_account_id"]
        amount = Decimal(str(step_2_result["reserved_amount"]))
        
        event = BalanceReservationReleased(
            aggregate_id=from_account_id,
            version=await self.event_store_service.get_next_version(from_account_id),
            account_id=from_account_id,
            account_number=context["step_results"][1]["from_account"]["account_number"],
            released_amount=amount,
            available_balance=Decimal(str(context["step_results"][1]["from_account"]["available_balance"])),
            reservation_id=UUID(reservation_id),
            reason="saga_compensation",
            saga_id=UUID(str(self.saga_id)),
            correlation_id=UUID(context["correlation_id"]),
            user_id=context.get("user_id")
        )
        
        await self.event_store_service.append_event(event)
        
        logger.info("Reserved balance released", saga_id=str(self.saga_id))
    
    # ========================================================================
    # STEP 3: CREATE TIGERBEETLE TRANSFER
    # ========================================================================
    
    async def _create_tigerbeetle_transfer(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create transfer in TigerBeetle
        
        This performs the actual transfer between accounts in TigerBeetle
        """
        logger.info("Creating TigerBeetle transfer", saga_id=str(self.saga_id))
        
        from_account = context["step_results"][1]["from_account"]
        to_account = context["step_results"][1]["to_account"]
        amount = Decimal(str(context["input_data"]["amount"]))
        
        # Create transfer in TigerBeetle
        tb_transfer = await self.tigerbeetle_service.create_transfer(
            debit_account_id=from_account["tigerbeetle_account_id"],
            credit_account_id=to_account["tigerbeetle_account_id"],
            amount=int(amount * 100),  # Convert to cents
            ledger=1,
            code=1,
            user_data=str(self.saga_id)
        )
        
        # Emit event
        event = TigerBeetleTransferCreated(
            aggregate_id=str(self.saga_id),
            version=1,
            tigerbeetle_transfer_id=tb_transfer["id"],
            pg_transfer_id=str(self.saga_id),
            debit_account_id=from_account["tigerbeetle_account_id"],
            credit_account_id=to_account["tigerbeetle_account_id"],
            amount=int(amount * 100),
            ledger=1,
            correlation_id=UUID(context["correlation_id"]),
            user_id=context.get("user_id")
        )
        
        await self.event_store_service.append_event(event)
        
        logger.info("TigerBeetle transfer created",
                   saga_id=str(self.saga_id),
                   tb_transfer_id=tb_transfer["id"])
        
        return {
            "tigerbeetle_transfer_id": tb_transfer["id"],
            "tigerbeetle_timestamp": tb_transfer.get("timestamp")
        }
    
    async def _reverse_tigerbeetle_transfer(
        self,
        context: Dict[str, Any],
        compensation_data: Optional[Dict[str, Any]]
    ) -> None:
        """
        Compensation: Reverse TigerBeetle transfer
        """
        logger.info("Reversing TigerBeetle transfer", saga_id=str(self.saga_id))
        
        # Get TigerBeetle transfer ID from step 3 result
        step_3_result = context["step_results"].get(3)
        if not step_3_result:
            logger.warning("No TigerBeetle transfer to reverse", saga_id=str(self.saga_id))
            return
        
        from_account = context["step_results"][1]["from_account"]
        to_account = context["step_results"][1]["to_account"]
        amount = Decimal(str(context["input_data"]["amount"]))
        
        # Create reverse transfer (swap debit and credit)
        await self.tigerbeetle_service.create_transfer(
            debit_account_id=to_account["tigerbeetle_account_id"],
            credit_account_id=from_account["tigerbeetle_account_id"],
            amount=int(amount * 100),
            ledger=1,
            code=2,  # Reversal code
            user_data=f"reversal_{self.saga_id}"
        )
        
        logger.info("TigerBeetle transfer reversed", saga_id=str(self.saga_id))
    
    # ========================================================================
    # STEP 4: COMMIT TRANSFER
    # ========================================================================
    
    async def _commit_transfer(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Commit transfer in PostgreSQL
        
        This updates the account balances and creates the transfer record
        """
        logger.info("Committing transfer", saga_id=str(self.saga_id))
        
        from_account_id = context["input_data"]["from_account_id"]
        to_account_id = context["input_data"]["to_account_id"]
        amount = Decimal(str(context["input_data"]["amount"]))
        description = context["input_data"].get("description", "")
        reference = context["input_data"].get("reference", "")
        
        # Get reservation ID
        reservation_id = context["step_results"][2]["reservation_id"]
        
        # Commit transfer
        transfer = await self.pg_service.commit_transfer(
            from_account_id=from_account_id,
            to_account_id=to_account_id,
            amount=amount,
            description=description,
            reference=reference,
            reservation_id=reservation_id,
            tigerbeetle_transfer_id=context["step_results"][3]["tigerbeetle_transfer_id"],
            saga_id=str(self.saga_id)
        )
        
        logger.info("Transfer committed",
                   saga_id=str(self.saga_id),
                   transfer_id=transfer["transfer_id"])
        
        return {
            "transfer_id": transfer["transfer_id"],
            "from_balance": str(transfer["from_balance"]),
            "to_balance": str(transfer["to_balance"])
        }
    
    async def _rollback_transfer(
        self,
        context: Dict[str, Any],
        compensation_data: Optional[Dict[str, Any]]
    ) -> None:
        """
        Compensation: Rollback transfer in PostgreSQL
        """
        logger.info("Rolling back transfer", saga_id=str(self.saga_id))
        
        # Get transfer ID from step 4 result
        step_4_result = context["step_results"].get(4)
        if not step_4_result:
            logger.warning("No transfer to rollback", saga_id=str(self.saga_id))
            return
        
        transfer_id = step_4_result["transfer_id"]
        
        # Rollback transfer
        await self.pg_service.rollback_transfer(transfer_id)
        
        logger.info("Transfer rolled back", saga_id=str(self.saga_id))
    
    # ========================================================================
    # STEP 5: EMIT SUCCESS EVENT
    # ========================================================================
    
    async def _emit_success_event(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Emit transfer completed event
        """
        logger.info("Emitting success event", saga_id=str(self.saga_id))
        
        from_account_id = context["input_data"]["from_account_id"]
        to_account_id = context["input_data"]["to_account_id"]
        amount = Decimal(str(context["input_data"]["amount"]))
        
        transfer_id = context["step_results"][4]["transfer_id"]
        
        event = TransferCompleted(
            aggregate_id=transfer_id,
            version=1,
            transfer_id=transfer_id,
            from_account_id=from_account_id,
            to_account_id=to_account_id,
            amount=amount,
            currency=context["input_data"].get("currency", "NGN"),
            from_account_balance=Decimal(str(context["step_results"][4]["from_balance"])),
            to_account_balance=Decimal(str(context["step_results"][4]["to_balance"])),
            tigerbeetle_transfer_id=context["step_results"][3]["tigerbeetle_transfer_id"],
            tigerbeetle_timestamp=context["step_results"][3].get("tigerbeetle_timestamp"),
            saga_id=UUID(str(self.saga_id)),
            correlation_id=UUID(context["correlation_id"]),
            user_id=context.get("user_id")
        )
        
        await self.event_store_service.append_event(event)
        
        logger.info("Success event emitted", saga_id=str(self.saga_id))
        
        return {"event_emitted": True}
