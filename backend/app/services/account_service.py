"""
Account management service with TigerBeetle integration
"""
import secrets
import string
from decimal import Decimal
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import structlog

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from sqlalchemy.orm import selectinload
import httpx

from config.settings import settings
from database.models import User, Account, AccountType, AccountStatus
from app.schemas.accounts import AccountCreate, AccountResponse, AccountUpdate
from app.exceptions.accounts import (
    AccountNotFoundError,
    InsufficientBalanceError,
    AccountInactiveError,
    DailyLimitExceededError,
    MonthlyLimitExceededError,
    TigerBeetleUnavailableError
)

logger = structlog.get_logger()


class TigerBeetleClient:
    """Client for TigerBeetle accounting system integration"""
    
    def __init__(self):
        self.base_url = settings.TIGERBEETLE_URL
        self.timeout = 10.0
    
    async def create_account(self, account_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create account in TigerBeetle"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/accounts",
                    json=account_data
                )
                response.raise_for_status()
                return response.json()
        except httpx.RequestError as e:
            logger.error("TigerBeetle request failed", error=str(e))
            raise
        except httpx.HTTPStatusError as e:
            logger.error("TigerBeetle HTTP error", status_code=e.response.status_code)
            raise
    
    async def get_account_balance(self, account_id: str) -> Dict[str, Any]:
        """Get account balance from TigerBeetle"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/accounts/{account_id}/balance"
                )
                response.raise_for_status()
                return response.json()
        except httpx.RequestError as e:
            logger.error("TigerBeetle balance request failed", error=str(e))
            # In production, TigerBeetle is required - raise the error
            if settings.ENVIRONMENT == "production":
                raise TigerBeetleUnavailableError(
                    "TigerBeetle ledger is unavailable. Cannot retrieve account balance."
                )
            # In development, log warning and return cached/database balance
            logger.warning(
                "TigerBeetle unavailable in development mode, using database balance",
                account_id=account_id
            )
            raise TigerBeetleUnavailableError(
                "TigerBeetle unavailable - balance will be fetched from database"
            )
    
    async def update_account_balance(self, account_id: str, amount: Decimal, transaction_id: str) -> Dict[str, Any]:
        """Update account balance in TigerBeetle"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/accounts/{account_id}/balance",
                    json={
                        "amount": float(amount),
                        "transaction_id": transaction_id
                    }
                )
                response.raise_for_status()
                return response.json()
        except httpx.RequestError as e:
            logger.error("TigerBeetle balance update failed", error=str(e))
            raise


class AccountService:
    """Account management service with comprehensive features"""
    
    def __init__(self):
        self.tigerbeetle = TigerBeetleClient()
    
    def generate_account_number(self) -> str:
        """Generate unique account number"""
        # Nigerian bank account format: 10 digits
        # First 3 digits: bank code (e.g., 999 for NeoBank)
        # Last 7 digits: unique account identifier
        bank_code = "999"
        unique_part = ''.join(secrets.choice(string.digits) for _ in range(7))
        return bank_code + unique_part
    
    async def create_account(self, db: AsyncSession, user_id: str, account_data: AccountCreate) -> AccountResponse:
        """Create a new bank account"""
        
        # Verify user exists
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            raise AccountNotFoundError("User not found")
        
        # Generate unique account number
        account_number = self.generate_account_number()
        
        # Ensure account number is unique
        while await self._account_number_exists(db, account_number):
            account_number = self.generate_account_number()
        
        # Create account in database
        db_account = Account(
            account_number=account_number,
            user_id=user_id,
            account_type=account_data.account_type,
            account_name=account_data.account_name,
            currency=account_data.currency or "NGN",
            daily_limit=account_data.daily_limit or Decimal("1000000"),  # ₦1M default
            monthly_limit=account_data.monthly_limit or Decimal("10000000"),  # ₦10M default
        )
        
        db.add(db_account)
        await db.flush()  # Get the ID without committing
        
        # Create account in TigerBeetle
        try:
            tigerbeetle_data = {
                "id": str(db_account.id),
                "code": account_data.account_type.value,
                "ledger": 1,  # Default ledger
                "flags": 0,
                "user_data": str(user_id)
            }
            
            tigerbeetle_response = await self.tigerbeetle.create_account(tigerbeetle_data)
            db_account.tigerbeetle_account_id = tigerbeetle_response.get("id")
            
        except Exception as e:
            logger.warning("TigerBeetle account creation failed, continuing without", error=str(e))
        
        await db.commit()
        await db.refresh(db_account)
        
        logger.info(
            "Account created successfully",
            account_id=str(db_account.id),
            account_number=account_number,
            user_id=user_id
        )
        
        return AccountResponse.from_orm(db_account)
    
    async def get_user_accounts(self, db: AsyncSession, user_id: str) -> List[AccountResponse]:
        """Get all accounts for a user"""
        
        result = await db.execute(
            select(Account)
            .where(Account.user_id == user_id)
            .order_by(Account.created_at.desc())
        )
        accounts = result.scalars().all()
        
        # Update balances from TigerBeetle
        account_responses = []
        for account in accounts:
            try:
                if account.tigerbeetle_account_id:
                    balance_data = await self.tigerbeetle.get_account_balance(account.tigerbeetle_account_id)
                    account.balance = Decimal(str(balance_data.get("balance", 0)))
                    account.available_balance = Decimal(str(balance_data.get("available_balance", 0)))
            except Exception as e:
                logger.warning("Failed to get balance from TigerBeetle", account_id=str(account.id), error=str(e))
            
            account_responses.append(AccountResponse.from_orm(account))
        
        return account_responses
    
    async def get_account(self, db: AsyncSession, account_id: str, user_id: Optional[str] = None) -> AccountResponse:
        """Get account by ID"""
        
        query = select(Account).where(Account.id == account_id)
        if user_id:
            query = query.where(Account.user_id == user_id)
        
        result = await db.execute(query)
        account = result.scalar_one_or_none()
        
        if not account:
            raise AccountNotFoundError("Account not found")
        
        # Update balance from TigerBeetle
        try:
            if account.tigerbeetle_account_id:
                balance_data = await self.tigerbeetle.get_account_balance(account.tigerbeetle_account_id)
                account.balance = Decimal(str(balance_data.get("balance", 0)))
                account.available_balance = Decimal(str(balance_data.get("available_balance", 0)))
        except Exception as e:
            logger.warning("Failed to get balance from TigerBeetle", account_id=account_id, error=str(e))
        
        return AccountResponse.from_orm(account)
    
    async def get_account_by_number(self, db: AsyncSession, account_number: str) -> Optional[AccountResponse]:
        """Get account by account number"""
        
        result = await db.execute(
            select(Account).where(Account.account_number == account_number)
        )
        account = result.scalar_one_or_none()
        
        if not account:
            return None
        
        # Update balance from TigerBeetle
        try:
            if account.tigerbeetle_account_id:
                balance_data = await self.tigerbeetle.get_account_balance(account.tigerbeetle_account_id)
                account.balance = Decimal(str(balance_data.get("balance", 0)))
                account.available_balance = Decimal(str(balance_data.get("available_balance", 0)))
        except Exception as e:
            logger.warning("Failed to get balance from TigerBeetle", account_number=account_number, error=str(e))
        
        return AccountResponse.from_orm(account)
    
    async def update_account(self, db: AsyncSession, account_id: str, user_id: str, update_data: AccountUpdate) -> AccountResponse:
        """Update account information"""
        
        # Get existing account
        result = await db.execute(
            select(Account).where(
                and_(Account.id == account_id, Account.user_id == user_id)
            )
        )
        account = result.scalar_one_or_none()
        
        if not account:
            raise AccountNotFoundError("Account not found")
        
        # Update fields
        update_dict = update_data.dict(exclude_unset=True)
        
        for field, value in update_dict.items():
            setattr(account, field, value)
        
        account.updated_at = datetime.now(timezone.utc)
        
        await db.commit()
        await db.refresh(account)
        
        logger.info("Account updated successfully", account_id=account_id, user_id=user_id)
        
        return AccountResponse.from_orm(account)
    
    async def close_account(self, db: AsyncSession, account_id: str, user_id: str) -> AccountResponse:
        """Close an account"""
        
        # Get account
        account = await self.get_account(db, account_id, user_id)
        
        # Check if account has balance
        if account.balance > 0:
            raise InsufficientBalanceError("Cannot close account with positive balance")
        
        # Update account status
        await db.execute(
            update(Account)
            .where(and_(Account.id == account_id, Account.user_id == user_id))
            .values(
                status=AccountStatus.CLOSED,
                updated_at=datetime.now(timezone.utc)
            )
        )
        
        await db.commit()
        
        logger.info("Account closed successfully", account_id=account_id, user_id=user_id)
        
        # Return updated account
        return await self.get_account(db, account_id, user_id)
    
    async def check_account_limits(self, db: AsyncSession, account_id: str, amount: Decimal) -> bool:
        """Check if transaction amount is within account limits"""
        
        # This would typically check daily/monthly spending limits
        # For now, return True (implement based on business rules)
        return True
    
    async def _account_number_exists(self, db: AsyncSession, account_number: str) -> bool:
        """Check if account number already exists"""
        result = await db.execute(
            select(Account).where(Account.account_number == account_number)
        )
        return result.scalar_one_or_none() is not None


# Global account service instance
account_service = AccountService()
