"""
Authentication middleware for NeoBank API
Implements JWT-based authentication with role-based access control
"""
import os
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from functools import wraps

from fastapi import HTTPException, Security, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

logger = structlog.get_logger()

# Security scheme
security = HTTPBearer()

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
JWT_REFRESH_EXPIRATION_DAYS = 30

if not JWT_SECRET:
    logger.warning("JWT_SECRET not set in environment variables. Using default (INSECURE for production)")
    JWT_SECRET = "INSECURE_DEFAULT_SECRET_CHANGE_IN_PRODUCTION"


class TokenType:
    """Token types"""
    ACCESS = "access"
    REFRESH = "refresh"


class UserRole:
    """User roles for RBAC"""
    ADMIN = "admin"
    USER = "user"
    MANAGER = "manager"
    SUPPORT = "support"
    AUDITOR = "auditor"


class AuthenticationError(HTTPException):
    """Custom authentication error"""
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(status_code=401, detail=detail)


class AuthorizationError(HTTPException):
    """Custom authorization error"""
    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(status_code=403, detail=detail)


def create_access_token(user_id: str, email: str, roles: List[str], 
                       additional_claims: Optional[Dict[str, Any]] = None) -> str:
    """
    Create JWT access token
    
    Args:
        user_id: User ID
        email: User email
        roles: List of user roles
        additional_claims: Additional claims to include in token
        
    Returns:
        JWT token string
    """
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    payload = {
        "sub": user_id,
        "email": email,
        "roles": roles,
        "type": TokenType.ACCESS,
        "iat": now,
        "exp": expires,
        "nbf": now
    }
    
    if additional_claims:
        payload.update(additional_claims)
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    logger.info("Access token created", user_id=user_id, expires=expires.isoformat())
    
    return token


def create_refresh_token(user_id: str) -> str:
    """
    Create JWT refresh token
    
    Args:
        user_id: User ID
        
    Returns:
        JWT refresh token string
    """
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=JWT_REFRESH_EXPIRATION_DAYS)
    
    payload = {
        "sub": user_id,
        "type": TokenType.REFRESH,
        "iat": now,
        "exp": expires,
        "nbf": now
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    logger.info("Refresh token created", user_id=user_id, expires=expires.isoformat())
    
    return token


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode and verify JWT token
    
    Args:
        token: JWT token string
        
    Returns:
        Token payload
        
    Raises:
        AuthenticationError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_nbf": True,
                "require": ["sub", "type", "iat", "exp"]
            }
        )
        return payload
        
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        raise AuthenticationError("Token has expired")
        
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token", error=str(e))
        raise AuthenticationError("Invalid token")
        
    except Exception as e:
        logger.error("Token decode error", error=str(e))
        raise AuthenticationError("Token verification failed")


async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    """
    Verify JWT token from Authorization header
    
    Args:
        credentials: HTTP Bearer credentials
        
    Returns:
        Token payload
        
    Raises:
        AuthenticationError: If token is invalid
    """
    try:
        token = credentials.credentials
        payload = decode_token(token)
        
        # Verify token type
        if payload.get("type") != TokenType.ACCESS:
            raise AuthenticationError("Invalid token type")
        
        return payload
        
    except AuthenticationError:
        raise
    except Exception as e:
        logger.error("Token verification failed", error=str(e))
        raise AuthenticationError("Authentication failed")


async def get_current_user(token_payload: Dict[str, Any] = Depends(verify_token)) -> Dict[str, Any]:
    """
    Get current authenticated user from token
    
    Args:
        token_payload: Verified token payload
        
    Returns:
        User information
    """
    return {
        "user_id": token_payload["sub"],
        "email": token_payload.get("email"),
        "roles": token_payload.get("roles", []),
        "token_payload": token_payload
    }


def require_roles(required_roles: List[str]):
    """
    Decorator to require specific roles
    
    Args:
        required_roles: List of required roles
        
    Returns:
        Dependency function
    """
    async def check_roles(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_roles = current_user.get("roles", [])
        
        # Admin has access to everything
        if UserRole.ADMIN in user_roles:
            return current_user
        
        # Check if user has any of the required roles
        if not any(role in user_roles for role in required_roles):
            logger.warning(
                "Insufficient permissions",
                user_id=current_user.get("user_id"),
                user_roles=user_roles,
                required_roles=required_roles
            )
            raise AuthorizationError(
                f"Requires one of: {', '.join(required_roles)}"
            )
        
        return current_user
    
    return check_roles


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Require admin role"""
    if UserRole.ADMIN not in current_user.get("roles", []):
        raise AuthorizationError("Admin access required")
    return current_user


def require_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Require user role (any authenticated user)"""
    return current_user


async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Optional[Dict[str, Any]]:
    """
    Get current user if authenticated, None otherwise
    Useful for endpoints that work with or without authentication
    
    Args:
        credentials: HTTP Bearer credentials (optional)
        
    Returns:
        User information or None
    """
    if not credentials:
        return None
    
    try:
        token_payload = await verify_token(credentials)
        return {
            "user_id": token_payload["sub"],
            "email": token_payload.get("email"),
            "roles": token_payload.get("roles", []),
            "token_payload": token_payload
        }
    except:
        return None


class AuthenticationMiddleware:
    """
    Middleware to add authentication context to requests
    """
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, request: Request, call_next):
        """Process request and add auth context"""
        
        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization")
        
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
            try:
                payload = decode_token(token)
                
                # Add user info to request state
                request.state.user_id = payload.get("sub")
                request.state.user_email = payload.get("email")
                request.state.user_roles = payload.get("roles", [])
                request.state.authenticated = True
                
                logger.debug(
                    "Request authenticated",
                    user_id=request.state.user_id,
                    path=request.url.path
                )
                
            except AuthenticationError as e:
                # Token invalid, but don't block request
                # Let route handlers decide if auth is required
                request.state.authenticated = False
                logger.debug("Authentication failed", error=str(e), path=request.url.path)
        else:
            request.state.authenticated = False
        
        # Process request
        response = await call_next(request)
        
        return response


def validate_token_for_refresh(token: str) -> str:
    """
    Validate refresh token and return user_id
    
    Args:
        token: Refresh token
        
    Returns:
        User ID
        
    Raises:
        AuthenticationError: If token is invalid
    """
    payload = decode_token(token)
    
    if payload.get("type") != TokenType.REFRESH:
        raise AuthenticationError("Invalid token type for refresh")
    
    return payload["sub"]


# Rate limiting for authentication endpoints
class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self):
        self.attempts = {}  # {key: [(timestamp, count)]}
    
    def check_rate_limit(self, key: str, max_attempts: int = 5, window_seconds: int = 300) -> bool:
        """
        Check if rate limit is exceeded
        
        Args:
            key: Rate limit key (e.g., IP address or user ID)
            max_attempts: Maximum attempts allowed
            window_seconds: Time window in seconds
            
        Returns:
            True if within limit, False if exceeded
        """
        now = datetime.now(timezone.utc)
        
        # Clean old attempts
        if key in self.attempts:
            self.attempts[key] = [
                (ts, count) for ts, count in self.attempts[key]
                if (now - ts).total_seconds() < window_seconds
            ]
        else:
            self.attempts[key] = []
        
        # Count attempts in window
        total_attempts = sum(count for _, count in self.attempts[key])
        
        if total_attempts >= max_attempts:
            logger.warning("Rate limit exceeded", key=key, attempts=total_attempts)
            return False
        
        # Add current attempt
        self.attempts[key].append((now, 1))
        
        return True


# Global rate limiter instance
rate_limiter = RateLimiter()


def check_auth_rate_limit(request: Request, max_attempts: int = 5):
    """
    Check authentication rate limit
    
    Args:
        request: FastAPI request
        max_attempts: Maximum attempts allowed
        
    Raises:
        HTTPException: If rate limit exceeded
    """
    # Use IP address as rate limit key
    client_ip = request.client.host if request.client else "unknown"
    
    if not rate_limiter.check_rate_limit(client_ip, max_attempts=max_attempts):
        raise HTTPException(
            status_code=429,
            detail="Too many authentication attempts. Please try again later."
        )


# Utility functions for token management

def extract_token_from_header(authorization: str) -> Optional[str]:
    """Extract token from Authorization header"""
    if not authorization:
        return None
    
    if not authorization.startswith("Bearer "):
        return None
    
    return authorization.split(" ")[1]


def is_token_expired(token: str) -> bool:
    """Check if token is expired without raising exception"""
    try:
        jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": True}
        )
        return False
    except jwt.ExpiredSignatureError:
        return True
    except:
        return True


def get_token_expiration(token: str) -> Optional[datetime]:
    """Get token expiration time"""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": False}
        )
        exp_timestamp = payload.get("exp")
        if exp_timestamp:
            return datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        return None
    except:
        return None


# Export commonly used dependencies
__all__ = [
    "security",
    "verify_token",
    "get_current_user",
    "get_optional_user",
    "require_roles",
    "require_admin",
    "require_user",
    "create_access_token",
    "create_refresh_token",
    "validate_token_for_refresh",
    "AuthenticationMiddleware",
    "check_auth_rate_limit",
    "UserRole",
    "TokenType",
    "AuthenticationError",
    "AuthorizationError"
]
