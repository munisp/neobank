"""
Authentication router for NeoBank API with Database Integration
Provides login, logout, refresh, and user management endpoints
All TODOs implemented with actual database operations
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, timedelta
from collections import defaultdict
import structlog
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_db
from app.models.user import User, UserRole, UserStatus, AuthenticationAttempt, RefreshToken
from app.middleware.auth import (
    create_access_token,
    create_refresh_token,
    validate_token_for_refresh,
    get_current_user,
    require_admin,
    verify_password,
    hash_password
)

logger = structlog.get_logger()

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()

# Rate limiting store (use Redis in production for distributed systems)
rate_limit_store = defaultdict(list)


def check_auth_rate_limit(request: Request, max_attempts: int = 5, window_minutes: int = 15):
    """
    Check authentication rate limit
    
    Args:
        request: FastAPI request object
        max_attempts: Maximum attempts allowed
        window_minutes: Time window in minutes
    
    Raises:
        HTTPException: If rate limit exceeded
    """
    client_ip = request.client.host
    current_time = datetime.utcnow()
    cutoff_time = current_time - timedelta(minutes=window_minutes)
    
    # Clean old attempts
    rate_limit_store[client_ip] = [
        attempt_time for attempt_time in rate_limit_store[client_ip]
        if attempt_time > cutoff_time
    ]
    
    # Check limit
    if len(rate_limit_store[client_ip]) >= max_attempts:
        logger.warning("Rate limit exceeded", client_ip=client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many authentication attempts. Please try again in {window_minutes} minutes."
        )
    
    # Record attempt
    rate_limit_store[client_ip].append(current_time)


# Request/Response Models

class RegisterRequest(BaseModel):
    """User registration request"""
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone_number: Optional[str] = None


class RegisterResponse(BaseModel):
    """Registration response"""
    success: bool
    message: str
    user: dict


class LoginRequest(BaseModel):
    """Login request"""
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginResponse(BaseModel):
    """Login response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 86400  # 24 hours in seconds
    user: dict


class RefreshRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str


class RefreshResponse(BaseModel):
    """Token refresh response"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400


class UserResponse(BaseModel):
    """User information response"""
    user_id: str
    email: str
    roles: List[str]
    authenticated: bool = True


# Authentication Endpoints

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    register_data: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register new user with database persistence
    
    Creates new user account with email verification required
    """
    try:
        # Check if user already exists
        result = await db.execute(
            select(User).where(User.email == register_data.email)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )
        
        # Create new user
        user = User(
            id=uuid.uuid4(),
            email=register_data.email,
            password_hash=hash_password(register_data.password),
            first_name=register_data.first_name,
            last_name=register_data.last_name,
            phone_number=register_data.phone_number,
            roles=[UserRole.USER.value],
            status=UserStatus.PENDING_VERIFICATION.value,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        # Save to database
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        logger.info("User registered successfully", user_id=str(user.id), email=user.email)
        
        return RegisterResponse(
            success=True,
            message="User registered successfully. Please verify your email.",
            user={
                "user_id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "roles": user.roles,
                "status": user.status
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Registration error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    User login endpoint with database authentication
    
    Authenticates user credentials against database and returns JWT tokens
    """
    # Check rate limit
    check_auth_rate_limit(request, max_attempts=5)
    
    # Get client metadata
    ip_address = request.client.host
    user_agent = request.headers.get("user-agent", "")
    
    try:
        # Query user from database
        result = await db.execute(
            select(User).where(User.email == login_data.email)
        )
        user = result.scalar_one_or_none()
        
        # Create authentication attempt record
        attempt = AuthenticationAttempt(
            id=uuid.uuid4(),
            user_id=user.id if user else None,
            email=login_data.email,
            success=False,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=datetime.utcnow()
        )
        
        # Validate user exists
        if not user:
            attempt.failure_reason = "User not found"
            db.add(attempt)
            await db.commit()
            
            logger.warning("Login attempt for non-existent user", email=login_data.email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Check if account is locked
        if user.locked_until and user.locked_until > datetime.utcnow():
            attempt.failure_reason = "Account locked"
            db.add(attempt)
            await db.commit()
            
            logger.warning("Login attempt for locked account", email=user.email)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked. Please contact support."
            )
        
        # Check account status
        if user.status not in [UserStatus.ACTIVE.value, UserStatus.PENDING_VERIFICATION.value]:
            attempt.failure_reason = f"Account status: {user.status}"
            db.add(attempt)
            await db.commit()
            
            logger.warning("Login attempt for inactive account", email=user.email, status=user.status)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is {user.status}"
            )
        
        # Verify password
        if not verify_password(login_data.password, user.password_hash):
            # Increment failed login attempts
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            
            # Lock account after 5 failed attempts
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=30)
                logger.warning("Account locked due to failed attempts", email=user.email)
            
            attempt.failure_reason = "Invalid password"
            db.add(attempt)
            await db.commit()
            
            logger.warning("Failed login attempt", email=user.email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Reset failed login attempts on successful login
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = datetime.utcnow()
        
        # Create tokens
        access_token = create_access_token(
            user_id=str(user.id),
            email=user.email,
            roles=user.roles
        )
        
        refresh_token_value = create_refresh_token(user_id=str(user.id))
        
        # Store refresh token in database
        refresh_token_jti = str(uuid.uuid4())
        refresh_token_record = RefreshToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_jti=refresh_token_jti,
            token_hash=hash_password(refresh_token_value),
            expires_at=datetime.utcnow() + timedelta(days=30),
            ip_address=ip_address,
            user_agent=user_agent,
            is_revoked=False,
            created_at=datetime.utcnow()
        )
        db.add(refresh_token_record)
        
        # Log successful authentication
        attempt.success = True
        attempt.user_id = user.id
        db.add(attempt)
        
        await db.commit()
        
        logger.info("User logged in successfully", user_id=str(user.id), email=user.email)
        
        return LoginResponse(
            access_token=access_token,
            refresh_token=refresh_token_value,
            user={
                "user_id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "roles": user.roles,
                "status": user.status
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Login error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


@router.post("/refresh", response_model=RefreshResponse, status_code=status.HTTP_200_OK)
async def refresh_token(
    refresh_data: RefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh access token with database validation
    
    Uses refresh token to generate new access token after validating against database
    """
    try:
        # Validate refresh token and get user_id
        user_id = validate_token_for_refresh(refresh_data.refresh_token)
        
        # Query user from database to verify they still exist and are active
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        
        if not user:
            logger.warning("User not found for refresh token", user_id=user_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Verify user is still active
        if user.status not in [UserStatus.ACTIVE.value, UserStatus.PENDING_VERIFICATION.value]:
            logger.warning("Refresh token for inactive account", email=user.email, status=user.status)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is {user.status}"
            )
        
        # Check if account is locked
        if user.locked_until and user.locked_until > datetime.utcnow():
            logger.warning("Refresh token for locked account", email=user.email)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked"
            )
        
        # Create new access token with current user data
        access_token = create_access_token(
            user_id=str(user.id),
            email=user.email,
            roles=user.roles
        )
        
        logger.info("Token refreshed", user_id=str(user.id))
        
        return RefreshResponse(access_token=access_token)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Token refresh failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    User logout endpoint with token revocation
    
    Revokes all refresh tokens for the user in the database
    """
    try:
        current_user = await get_current_user(credentials)
        user_id = current_user["user_id"]
        
        # Revoke all refresh tokens for user in database
        result = await db.execute(
            select(RefreshToken).where(
                and_(
                    RefreshToken.user_id == uuid.UUID(user_id),
                    RefreshToken.is_revoked == False
                )
            )
        )
        refresh_tokens = result.scalars().all()
        
        for token in refresh_tokens:
            token.is_revoked = True
            token.revoked_at = datetime.utcnow()
        
        await db.commit()
        
        logger.info("User logged out", user_id=user_id, tokens_revoked=len(refresh_tokens))
        
        return {"success": True, "message": "Successfully logged out"}
    
    except Exception as e:
        await db.rollback()
        logger.error("Logout error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )


@router.get("/me", response_model=UserResponse, status_code=status.HTTP_200_OK)
async def get_current_user_info(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current authenticated user information from database
    """
    try:
        current_user = await get_current_user(credentials)
        user_id = current_user["user_id"]
        
        # Query user from database for latest info
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        return UserResponse(
            user_id=str(user.id),
            email=user.email,
            roles=user.roles
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Get current user error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


@router.get("/verify", status_code=status.HTTP_200_OK)
async def verify_token_endpoint(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Verify if token is valid
    
    Returns 200 if token is valid, 401 if invalid
    """
    try:
        current_user = await get_current_user(credentials)
        return {
            "valid": True,
            "user_id": current_user["user_id"]
        }
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


# Admin-only endpoints

@router.get("/users", status_code=status.HTTP_200_OK)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    List all users from database (admin only)
    
    Returns paginated list of users
    """
    try:
        current_user = await require_admin(credentials)
        
        # Query users from database with pagination
        result = await db.execute(
            select(User).offset(skip).limit(limit)
        )
        users = result.scalars().all()
        
        # Get total count
        count_result = await db.execute(select(User))
        total = len(count_result.scalars().all())
        
        logger.info("Admin listed users", admin_id=current_user["user_id"], count=len(users))
        
        return {
            "success": True,
            "users": [
                {
                    "user_id": str(user.id),
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "roles": user.roles,
                    "status": user.status,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                    "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None
                }
                for user in users
            ],
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("List users error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list users"
        )


@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete user (admin only)
    """
    try:
        current_user = await require_admin(credentials)
        
        # Query user from database
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(user_id))
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Soft delete - update status
        user.status = UserStatus.DELETED.value
        user.updated_at = datetime.utcnow()
        
        await db.commit()
        
        logger.info("User deleted", admin_id=current_user["user_id"], deleted_user_id=user_id)
        
        return {"success": True, "message": "User deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Delete user error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user"
        )


# Health check (no authentication required)

@router.get("/health", status_code=status.HTTP_200_OK)
async def auth_health():
    """
    Authentication service health check
    """
    return {
        "status": "healthy",
        "service": "authentication"
    }
