"""
Authentication service with JWT, password hashing, and security features
"""
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import structlog

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from config.settings import settings
from database.models import User, KYCStatus
from app.schemas.auth import UserCreate, UserResponse, TokenResponse
from app.exceptions.auth import (
    AuthenticationError, 
    UserAlreadyExistsError, 
    UserNotFoundError,
    AccountLockedError,
    InvalidTokenError
)

logger = structlog.get_logger()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Authentication service with comprehensive security features"""
    
    def __init__(self):
        self.max_failed_attempts = 5
        self.lockout_duration = timedelta(minutes=30)
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)
    
    def create_access_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire, "type": "access"})
        
        encoded_jwt = jwt.encode(
            to_encode, 
            settings.JWT_SECRET_KEY, 
            algorithm=settings.JWT_ALGORITHM
        )
        
        return encoded_jwt
    
    def create_refresh_token(self, data: Dict[str, Any]) -> str:
        """Create JWT refresh token"""
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        
        to_encode.update({"exp": expire, "type": "refresh"})
        
        encoded_jwt = jwt.encode(
            to_encode,
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM
        )
        
        return encoded_jwt
    
    def verify_token(self, token: str, token_type: str = "access") -> Dict[str, Any]:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM]
            )
            
            if payload.get("type") != token_type:
                raise InvalidTokenError("Invalid token type")
            
            return payload
            
        except JWTError as e:
            logger.warning("Token verification failed", error=str(e))
            raise InvalidTokenError("Invalid token")
    
    async def register_user(self, db: AsyncSession, user_data: UserCreate) -> UserResponse:
        """Register a new user with validation"""
        
        # Check if user already exists
        existing_user = await self.get_user_by_email(db, user_data.email)
        if existing_user:
            raise UserAlreadyExistsError("User with this email already exists")
        
        # Create new user
        hashed_password = self.hash_password(user_data.password)
        
        db_user = User(
            email=user_data.email.lower(),
            hashed_password=hashed_password,
            full_name=user_data.full_name,
            phone_number=user_data.phone_number,
            date_of_birth=user_data.date_of_birth,
            address=user_data.address,
        )
        
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        
        logger.info("User registered successfully", user_id=str(db_user.id), email=user_data.email)
        
        return UserResponse.from_orm(db_user)
    
    async def authenticate_user(self, db: AsyncSession, email: str, password: str) -> TokenResponse:
        """Authenticate user and return tokens"""
        
        user = await self.get_user_by_email(db, email)
        if not user:
            logger.warning("Authentication failed - user not found", email=email)
            raise AuthenticationError("Invalid email or password")
        
        # Check if account is locked
        if user.locked_until and user.locked_until > datetime.now(timezone.utc):
            logger.warning("Authentication failed - account locked", user_id=str(user.id))
            raise AccountLockedError("Account is temporarily locked due to too many failed attempts")
        
        # Verify password
        if not self.verify_password(password, user.hashed_password):
            await self._handle_failed_login(db, user)
            logger.warning("Authentication failed - invalid password", user_id=str(user.id))
            raise AuthenticationError("Invalid email or password")
        
        # Check if user is active
        if not user.is_active:
            logger.warning("Authentication failed - inactive user", user_id=str(user.id))
            raise AuthenticationError("Account is inactive")
        
        # Reset failed attempts on successful login
        if user.failed_login_attempts > 0:
            await db.execute(
                update(User)
                .where(User.id == user.id)
                .values(failed_login_attempts=0, locked_until=None)
            )
        
        # Update last login
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(last_login=datetime.now(timezone.utc))
        )
        
        await db.commit()
        
        # Create tokens
        token_data = {"sub": str(user.id), "email": user.email}
        access_token = self.create_access_token(token_data)
        refresh_token = self.create_refresh_token(token_data)
        
        logger.info("User authenticated successfully", user_id=str(user.id))
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.from_orm(user)
        )
    
    async def refresh_access_token(self, db: AsyncSession, refresh_token: str) -> TokenResponse:
        """Refresh access token using refresh token"""
        
        try:
            payload = self.verify_token(refresh_token, "refresh")
            user_id = payload.get("sub")
            
            if not user_id:
                raise InvalidTokenError("Invalid token payload")
            
            user = await self.get_user_by_id(db, user_id)
            if not user or not user.is_active:
                raise InvalidTokenError("User not found or inactive")
            
            # Create new tokens
            token_data = {"sub": str(user.id), "email": user.email}
            new_access_token = self.create_access_token(token_data)
            new_refresh_token = self.create_refresh_token(token_data)
            
            logger.info("Token refreshed successfully", user_id=str(user.id))
            
            return TokenResponse(
                access_token=new_access_token,
                refresh_token=new_refresh_token,
                token_type="bearer",
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                user=UserResponse.from_orm(user)
            )
            
        except JWTError:
            raise InvalidTokenError("Invalid refresh token")
    
    async def get_current_user(self, db: AsyncSession, token: str) -> User:
        """Get current user from JWT token"""
        
        try:
            payload = self.verify_token(token)
            user_id = payload.get("sub")
            
            if not user_id:
                raise InvalidTokenError("Invalid token payload")
            
            user = await self.get_user_by_id(db, user_id)
            if not user:
                raise UserNotFoundError("User not found")
            
            if not user.is_active:
                raise AuthenticationError("User account is inactive")
            
            return user
            
        except JWTError:
            raise InvalidTokenError("Invalid token")
    
    async def get_user_by_email(self, db: AsyncSession, email: str) -> Optional[User]:
        """Get user by email"""
        result = await db.execute(
            select(User)
            .options(selectinload(User.accounts))
            .where(User.email == email.lower())
        )
        return result.scalar_one_or_none()
    
    async def get_user_by_id(self, db: AsyncSession, user_id: str) -> Optional[User]:
        """Get user by ID"""
        result = await db.execute(
            select(User)
            .options(selectinload(User.accounts))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()
    
    async def _handle_failed_login(self, db: AsyncSession, user: User):
        """Handle failed login attempt"""
        failed_attempts = user.failed_login_attempts + 1
        locked_until = None
        
        if failed_attempts >= self.max_failed_attempts:
            locked_until = datetime.now(timezone.utc) + self.lockout_duration
            logger.warning(
                "User account locked due to too many failed attempts",
                user_id=str(user.id),
                attempts=failed_attempts
            )
        
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(failed_login_attempts=failed_attempts, locked_until=locked_until)
        )
        await db.commit()
    
    def generate_secure_token(self, length: int = 32) -> str:
        """Generate a secure random token"""
        return secrets.token_urlsafe(length)
    
    def hash_api_key(self, api_key: str) -> str:
        """Hash API key for storage"""
        return hashlib.sha256(api_key.encode()).hexdigest()


# Global auth service instance
auth_service = AuthService()
