"""
Authentication router with login, registration, and token management
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from app.services.auth_service import auth_service
from app.schemas.auth import (
    UserCreate, 
    UserLogin, 
    UserResponse, 
    TokenResponse,
    RefreshTokenRequest
)
from app.exceptions.auth import (
    AuthenticationError,
    UserAlreadyExistsError,
    UserNotFoundError,
    AccountLockedError,
    InvalidTokenError
)

router = APIRouter()
security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Dependency to get current authenticated user"""
    try:
        return await auth_service.get_current_user(db, credentials.credentials)
    except (InvalidTokenError, UserNotFoundError, AuthenticationError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Register a new user account
    
    Creates a new user account with the provided information.
    Email addresses are automatically converted to lowercase.
    """
    try:
        return await auth_service.register_user(db, user_data)
    except UserAlreadyExistsError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Authenticate user and return access tokens
    
    Validates user credentials and returns JWT access and refresh tokens.
    Implements account lockout after multiple failed attempts.
    """
    try:
        return await auth_service.authenticate_user(
            db, 
            login_data.email, 
            login_data.password
        )
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except AccountLockedError as e:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Refresh access token using refresh token
    
    Generates a new access token and refresh token pair using a valid refresh token.
    """
    try:
        return await auth_service.refresh_access_token(db, refresh_data.refresh_token)
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )


@router.get("/profile", response_model=UserResponse)
async def get_profile(
    current_user: Annotated[UserResponse, Depends(get_current_user)]
):
    """
    Get current user profile
    
    Returns the profile information of the currently authenticated user.
    """
    return current_user


@router.post("/logout")
async def logout(
    current_user: Annotated[UserResponse, Depends(get_current_user)]
):
    """
    Logout current user
    
    Invalidates the current session. In a production environment,
    this would typically blacklist the token.
    """
    # In a production environment, you would typically:
    # 1. Add the token to a blacklist/revocation list
    # 2. Clear any server-side session data
    # 3. Log the logout event
    
    return {"message": "Successfully logged out"}


@router.get("/verify-token")
async def verify_token(
    current_user: Annotated[UserResponse, Depends(get_current_user)]
):
    """
    Verify if the current token is valid
    
    Returns user information if the token is valid, otherwise returns 401.
    """
    return {
        "valid": True,
        "user": current_user,
        "message": "Token is valid"
    }
