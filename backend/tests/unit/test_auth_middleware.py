"""
Unit tests for authentication middleware
Tests JWT token creation, validation, and RBAC
"""
import pytest
import jwt
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from app.middleware.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_token,
    get_current_user,
    require_roles,
    require_admin,
    validate_token_for_refresh,
    is_token_expired,
    get_token_expiration,
    UserRole,
    TokenType,
    AuthenticationError,
    AuthorizationError,
    rate_limiter,
    JWT_SECRET,
    JWT_ALGORITHM
)


class TestTokenCreation:
    """Test JWT token creation"""
    
    def test_create_access_token(self):
        """Test access token creation"""
        user_id = "user_123"
        email = "test@example.com"
        roles = [UserRole.USER]
        
        token = create_access_token(user_id, email, roles)
        
        assert token is not None
        assert isinstance(token, str)
        
        # Decode and verify
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        assert payload["sub"] == user_id
        assert payload["email"] == email
        assert payload["roles"] == roles
        assert payload["type"] == TokenType.ACCESS
    
    def test_create_access_token_with_additional_claims(self):
        """Test access token with additional claims"""
        user_id = "user_123"
        email = "test@example.com"
        roles = [UserRole.USER]
        additional_claims = {"custom_field": "custom_value"}
        
        token = create_access_token(user_id, email, roles, additional_claims)
        
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        assert payload["custom_field"] == "custom_value"
    
    def test_create_refresh_token(self):
        """Test refresh token creation"""
        user_id = "user_123"
        
        token = create_refresh_token(user_id)
        
        assert token is not None
        assert isinstance(token, str)
        
        # Decode and verify
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        assert payload["sub"] == user_id
        assert payload["type"] == TokenType.REFRESH
        assert "email" not in payload  # Refresh tokens don't include email
        assert "roles" not in payload  # Refresh tokens don't include roles


class TestTokenValidation:
    """Test JWT token validation"""
    
    def test_decode_valid_token(self):
        """Test decoding valid token"""
        user_id = "user_123"
        email = "test@example.com"
        roles = [UserRole.USER]
        
        token = create_access_token(user_id, email, roles)
        payload = decode_token(token)
        
        assert payload["sub"] == user_id
        assert payload["email"] == email
        assert payload["roles"] == roles
    
    def test_decode_expired_token(self):
        """Test decoding expired token"""
        # Create token that expires immediately
        now = datetime.now(timezone.utc)
        expires = now - timedelta(hours=1)  # Already expired
        
        payload = {
            "sub": "user_123",
            "type": TokenType.ACCESS,
            "iat": now,
            "exp": expires,
            "nbf": now
        }
        
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        with pytest.raises(AuthenticationError) as exc_info:
            decode_token(token)
        
        assert "expired" in str(exc_info.value.detail).lower()
    
    def test_decode_invalid_token(self):
        """Test decoding invalid token"""
        invalid_token = "invalid.token.here"
        
        with pytest.raises(AuthenticationError):
            decode_token(invalid_token)
    
    def test_decode_token_wrong_secret(self):
        """Test decoding token with wrong secret"""
        payload = {
            "sub": "user_123",
            "type": TokenType.ACCESS,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1)
        }
        
        # Sign with different secret
        token = jwt.encode(payload, "wrong_secret", algorithm=JWT_ALGORITHM)
        
        with pytest.raises(AuthenticationError):
            decode_token(token)


class TestTokenType:
    """Test token type validation"""
    
    def test_validate_refresh_token_success(self):
        """Test validating correct refresh token"""
        user_id = "user_123"
        refresh_token = create_refresh_token(user_id)
        
        validated_user_id = validate_token_for_refresh(refresh_token)
        
        assert validated_user_id == user_id
    
    def test_validate_refresh_token_with_access_token(self):
        """Test validating access token as refresh token (should fail)"""
        user_id = "user_123"
        access_token = create_access_token(user_id, "test@example.com", [UserRole.USER])
        
        with pytest.raises(AuthenticationError) as exc_info:
            validate_token_for_refresh(access_token)
        
        assert "invalid token type" in str(exc_info.value.detail).lower()


class TestRBAC:
    """Test role-based access control"""
    
    @pytest.mark.asyncio
    async def test_require_admin_with_admin_role(self):
        """Test admin requirement with admin user"""
        current_user = {
            "user_id": "admin_123",
            "email": "admin@example.com",
            "roles": [UserRole.ADMIN]
        }
        
        result = require_admin(current_user)
        
        assert result == current_user
    
    @pytest.mark.asyncio
    async def test_require_admin_without_admin_role(self):
        """Test admin requirement with non-admin user"""
        current_user = {
            "user_id": "user_123",
            "email": "user@example.com",
            "roles": [UserRole.USER]
        }
        
        with pytest.raises(AuthorizationError) as exc_info:
            require_admin(current_user)
        
        assert "admin" in str(exc_info.value.detail).lower()
    
    @pytest.mark.asyncio
    async def test_require_roles_with_matching_role(self):
        """Test role requirement with matching role"""
        current_user = {
            "user_id": "manager_123",
            "email": "manager@example.com",
            "roles": [UserRole.MANAGER]
        }
        
        check_roles = require_roles([UserRole.MANAGER, UserRole.ADMIN])
        result = await check_roles(current_user)
        
        assert result == current_user
    
    @pytest.mark.asyncio
    async def test_require_roles_without_matching_role(self):
        """Test role requirement without matching role"""
        current_user = {
            "user_id": "user_123",
            "email": "user@example.com",
            "roles": [UserRole.USER]
        }
        
        check_roles = require_roles([UserRole.MANAGER, UserRole.ADMIN])
        
        with pytest.raises(AuthorizationError):
            await check_roles(current_user)
    
    @pytest.mark.asyncio
    async def test_admin_bypasses_role_requirements(self):
        """Test that admin role bypasses all role requirements"""
        current_user = {
            "user_id": "admin_123",
            "email": "admin@example.com",
            "roles": [UserRole.ADMIN]
        }
        
        # Admin should pass even if not in required roles
        check_roles = require_roles([UserRole.MANAGER, UserRole.SUPPORT])
        result = await check_roles(current_user)
        
        assert result == current_user


class TestRateLimiting:
    """Test rate limiting functionality"""
    
    def test_rate_limit_within_limit(self):
        """Test rate limiting within allowed attempts"""
        key = "test_key_1"
        
        # Should allow first 5 attempts
        for i in range(5):
            result = rate_limiter.check_rate_limit(key, max_attempts=5)
            assert result is True
    
    def test_rate_limit_exceeded(self):
        """Test rate limiting when limit exceeded"""
        key = "test_key_2"
        
        # First 5 attempts should succeed
        for i in range(5):
            rate_limiter.check_rate_limit(key, max_attempts=5)
        
        # 6th attempt should fail
        result = rate_limiter.check_rate_limit(key, max_attempts=5)
        assert result is False
    
    def test_rate_limit_cleanup(self):
        """Test rate limit cleanup of old attempts"""
        key = "test_key_3"
        
        # Make attempts
        for i in range(3):
            rate_limiter.check_rate_limit(key, max_attempts=5, window_seconds=1)
        
        # Wait for window to expire
        import time
        time.sleep(2)
        
        # Should allow new attempts after window expires
        result = rate_limiter.check_rate_limit(key, max_attempts=5, window_seconds=1)
        assert result is True


class TestTokenUtilities:
    """Test token utility functions"""
    
    def test_is_token_expired_with_valid_token(self):
        """Test checking if valid token is expired"""
        token = create_access_token("user_123", "test@example.com", [UserRole.USER])
        
        is_expired = is_token_expired(token)
        
        assert is_expired is False
    
    def test_is_token_expired_with_expired_token(self):
        """Test checking if expired token is expired"""
        # Create expired token
        now = datetime.now(timezone.utc)
        expires = now - timedelta(hours=1)
        
        payload = {
            "sub": "user_123",
            "type": TokenType.ACCESS,
            "iat": now,
            "exp": expires
        }
        
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        is_expired = is_token_expired(token)
        
        assert is_expired is True
    
    def test_get_token_expiration(self):
        """Test getting token expiration time"""
        token = create_access_token("user_123", "test@example.com", [UserRole.USER])
        
        expiration = get_token_expiration(token)
        
        assert expiration is not None
        assert isinstance(expiration, datetime)
        assert expiration > datetime.now(timezone.utc)
    
    def test_get_token_expiration_invalid_token(self):
        """Test getting expiration from invalid token"""
        invalid_token = "invalid.token.here"
        
        expiration = get_token_expiration(invalid_token)
        
        assert expiration is None


class TestAuthenticationErrors:
    """Test authentication error handling"""
    
    def test_authentication_error_default_message(self):
        """Test AuthenticationError with default message"""
        error = AuthenticationError()
        
        assert error.status_code == 401
        assert "authentication failed" in error.detail.lower()
    
    def test_authentication_error_custom_message(self):
        """Test AuthenticationError with custom message"""
        custom_message = "Custom auth error"
        error = AuthenticationError(detail=custom_message)
        
        assert error.status_code == 401
        assert error.detail == custom_message
    
    def test_authorization_error_default_message(self):
        """Test AuthorizationError with default message"""
        error = AuthorizationError()
        
        assert error.status_code == 403
        assert "insufficient permissions" in error.detail.lower()
    
    def test_authorization_error_custom_message(self):
        """Test AuthorizationError with custom message"""
        custom_message = "Custom authz error"
        error = AuthorizationError(detail=custom_message)
        
        assert error.status_code == 403
        assert error.detail == custom_message


class TestTokenClaims:
    """Test JWT token claims"""
    
    def test_token_includes_required_claims(self):
        """Test that tokens include all required claims"""
        user_id = "user_123"
        email = "test@example.com"
        roles = [UserRole.USER]
        
        token = create_access_token(user_id, email, roles)
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Check required claims
        assert "sub" in payload
        assert "email" in payload
        assert "roles" in payload
        assert "type" in payload
        assert "iat" in payload
        assert "exp" in payload
        assert "nbf" in payload
    
    def test_token_timestamps(self):
        """Test token timestamp claims"""
        token = create_access_token("user_123", "test@example.com", [UserRole.USER])
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        now = datetime.now(timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        nbf = datetime.fromtimestamp(payload["nbf"], tz=timezone.utc)
        
        # iat and nbf should be approximately now
        assert abs((iat - now).total_seconds()) < 5
        assert abs((nbf - now).total_seconds()) < 5
        
        # exp should be in the future
        assert exp > now
        
        # exp should be approximately 24 hours from now
        expected_exp = now + timedelta(hours=24)
        assert abs((exp - expected_exp).total_seconds()) < 60


# Run tests with: pytest tests/unit/test_auth_middleware.py -v
