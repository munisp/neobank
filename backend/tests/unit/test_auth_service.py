"""
Unit tests for authentication service
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth_service import AuthService
from app.schemas.auth import UserCreate
from app.exceptions.auth import (
    AuthenticationError,
    UserAlreadyExistsError,
    UserNotFoundError,
    AccountLockedError,
    InvalidTokenError
)
from database.models import User, KYCStatus


@pytest.mark.unit
class TestAuthService:
    """Test cases for AuthService"""
    
    def setup_method(self):
        """Set up test method"""
        self.auth_service = AuthService()
    
    def test_hash_password(self):
        """Test password hashing"""
        password = "TestPassword123!"
        hashed = self.auth_service.hash_password(password)
        
        assert hashed != password
        assert len(hashed) > 50  # bcrypt hash should be long
        assert hashed.startswith("$2b$")  # bcrypt prefix
    
    def test_verify_password(self):
        """Test password verification"""
        password = "TestPassword123!"
        hashed = self.auth_service.hash_password(password)
        
        # Correct password should verify
        assert self.auth_service.verify_password(password, hashed) is True
        
        # Wrong password should not verify
        assert self.auth_service.verify_password("WrongPassword", hashed) is False
    
    def test_create_access_token(self):
        """Test access token creation"""
        data = {"sub": "user123", "email": "test@example.com"}
        token = self.auth_service.create_access_token(data)
        
        assert isinstance(token, str)
        assert len(token) > 100  # JWT tokens are long
        
        # Verify token can be decoded
        payload = self.auth_service.verify_token(token)
        assert payload["sub"] == "user123"
        assert payload["email"] == "test@example.com"
        assert payload["type"] == "access"
    
    def test_create_refresh_token(self):
        """Test refresh token creation"""
        data = {"sub": "user123", "email": "test@example.com"}
        token = self.auth_service.create_refresh_token(data)
        
        assert isinstance(token, str)
        assert len(token) > 100
        
        # Verify token can be decoded
        payload = self.auth_service.verify_token(token, "refresh")
        assert payload["sub"] == "user123"
        assert payload["type"] == "refresh"
    
    def test_verify_token_invalid(self):
        """Test token verification with invalid token"""
        with pytest.raises(InvalidTokenError):
            self.auth_service.verify_token("invalid_token")
    
    def test_verify_token_wrong_type(self):
        """Test token verification with wrong token type"""
        data = {"sub": "user123"}
        refresh_token = self.auth_service.create_refresh_token(data)
        
        # Try to verify refresh token as access token
        with pytest.raises(InvalidTokenError):
            self.auth_service.verify_token(refresh_token, "access")
    
    @pytest.mark.asyncio
    async def test_register_user_success(self, test_db: AsyncSession):
        """Test successful user registration"""
        user_data = UserCreate(
            email="test@example.com",
            password="TestPassword123!",
            confirm_password="TestPassword123!",
            full_name="Test User",
            phone_number="+2348012345678"
        )
        
        with patch.object(self.auth_service, 'get_user_by_email', return_value=None):
            result = await self.auth_service.register_user(test_db, user_data)
            
            assert result.email == "test@example.com"
            assert result.full_name == "Test User"
            assert result.phone_number == "+2348012345678"
            assert result.is_active is True
            assert result.kyc_status == KYCStatus.PENDING
    
    @pytest.mark.asyncio
    async def test_register_user_already_exists(self, test_db: AsyncSession):
        """Test user registration when user already exists"""
        user_data = UserCreate(
            email="test@example.com",
            password="TestPassword123!",
            confirm_password="TestPassword123!",
            full_name="Test User"
        )
        
        # Mock existing user
        existing_user = MagicMock()
        existing_user.email = "test@example.com"
        
        with patch.object(self.auth_service, 'get_user_by_email', return_value=existing_user):
            with pytest.raises(UserAlreadyExistsError):
                await self.auth_service.register_user(test_db, user_data)
    
    @pytest.mark.asyncio
    async def test_authenticate_user_success(self, test_db: AsyncSession):
        """Test successful user authentication"""
        email = "test@example.com"
        password = "TestPassword123!"
        hashed_password = self.auth_service.hash_password(password)
        
        # Mock user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.email = email
        mock_user.hashed_password = hashed_password
        mock_user.is_active = True
        mock_user.locked_until = None
        mock_user.failed_login_attempts = 0
        
        with patch.object(self.auth_service, 'get_user_by_email', return_value=mock_user):
            with patch.object(test_db, 'execute') as mock_execute:
                with patch.object(test_db, 'commit'):
                    result = await self.auth_service.authenticate_user(test_db, email, password)
                    
                    assert result.access_token is not None
                    assert result.refresh_token is not None
                    assert result.token_type == "bearer"
                    assert result.user.email == email
    
    @pytest.mark.asyncio
    async def test_authenticate_user_not_found(self, test_db: AsyncSession):
        """Test authentication with non-existent user"""
        with patch.object(self.auth_service, 'get_user_by_email', return_value=None):
            with pytest.raises(AuthenticationError):
                await self.auth_service.authenticate_user(test_db, "nonexistent@example.com", "password")
    
    @pytest.mark.asyncio
    async def test_authenticate_user_wrong_password(self, test_db: AsyncSession):
        """Test authentication with wrong password"""
        email = "test@example.com"
        correct_password = "TestPassword123!"
        wrong_password = "WrongPassword"
        hashed_password = self.auth_service.hash_password(correct_password)
        
        # Mock user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.email = email
        mock_user.hashed_password = hashed_password
        mock_user.is_active = True
        mock_user.locked_until = None
        mock_user.failed_login_attempts = 0
        
        with patch.object(self.auth_service, 'get_user_by_email', return_value=mock_user):
            with patch.object(self.auth_service, '_handle_failed_login') as mock_handle_failed:
                with pytest.raises(AuthenticationError):
                    await self.auth_service.authenticate_user(test_db, email, wrong_password)
                
                # Should call failed login handler
                mock_handle_failed.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_authenticate_user_account_locked(self, test_db: AsyncSession):
        """Test authentication with locked account"""
        email = "test@example.com"
        password = "TestPassword123!"
        
        # Mock locked user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.email = email
        mock_user.is_active = True
        mock_user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=30)
        mock_user.failed_login_attempts = 5
        
        with patch.object(self.auth_service, 'get_user_by_email', return_value=mock_user):
            with pytest.raises(AccountLockedError):
                await self.auth_service.authenticate_user(test_db, email, password)
    
    @pytest.mark.asyncio
    async def test_authenticate_user_inactive(self, test_db: AsyncSession):
        """Test authentication with inactive user"""
        email = "test@example.com"
        password = "TestPassword123!"
        hashed_password = self.auth_service.hash_password(password)
        
        # Mock inactive user
        mock_user = MagicMock()
        mock_user.id = "user123"
        mock_user.email = email
        mock_user.hashed_password = hashed_password
        mock_user.is_active = False
        mock_user.locked_until = None
        mock_user.failed_login_attempts = 0
        
        with patch.object(self.auth_service, 'get_user_by_email', return_value=mock_user):
            with pytest.raises(AuthenticationError):
                await self.auth_service.authenticate_user(test_db, email, password)
    
    @pytest.mark.asyncio
    async def test_refresh_access_token_success(self, test_db: AsyncSession):
        """Test successful token refresh"""
        user_id = "user123"
        email = "test@example.com"
        
        # Create refresh token
        token_data = {"sub": user_id, "email": email}
        refresh_token = self.auth_service.create_refresh_token(token_data)
        
        # Mock user
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = email
        mock_user.is_active = True
        
        with patch.object(self.auth_service, 'get_user_by_id', return_value=mock_user):
            result = await self.auth_service.refresh_access_token(test_db, refresh_token)
            
            assert result.access_token is not None
            assert result.refresh_token is not None
            assert result.user.email == email
    
    @pytest.mark.asyncio
    async def test_refresh_access_token_invalid_token(self, test_db: AsyncSession):
        """Test token refresh with invalid token"""
        with pytest.raises(InvalidTokenError):
            await self.auth_service.refresh_access_token(test_db, "invalid_token")
    
    @pytest.mark.asyncio
    async def test_refresh_access_token_user_not_found(self, test_db: AsyncSession):
        """Test token refresh with non-existent user"""
        token_data = {"sub": "nonexistent_user"}
        refresh_token = self.auth_service.create_refresh_token(token_data)
        
        with patch.object(self.auth_service, 'get_user_by_id', return_value=None):
            with pytest.raises(InvalidTokenError):
                await self.auth_service.refresh_access_token(test_db, refresh_token)
    
    @pytest.mark.asyncio
    async def test_get_current_user_success(self, test_db: AsyncSession):
        """Test getting current user from token"""
        user_id = "user123"
        email = "test@example.com"
        
        # Create access token
        token_data = {"sub": user_id, "email": email}
        access_token = self.auth_service.create_access_token(token_data)
        
        # Mock user
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = email
        mock_user.is_active = True
        
        with patch.object(self.auth_service, 'get_user_by_id', return_value=mock_user):
            result = await self.auth_service.get_current_user(test_db, access_token)
            
            assert result.id == user_id
            assert result.email == email
    
    @pytest.mark.asyncio
    async def test_get_current_user_invalid_token(self, test_db: AsyncSession):
        """Test getting current user with invalid token"""
        with pytest.raises(InvalidTokenError):
            await self.auth_service.get_current_user(test_db, "invalid_token")
    
    @pytest.mark.asyncio
    async def test_get_current_user_not_found(self, test_db: AsyncSession):
        """Test getting current user when user not found"""
        token_data = {"sub": "nonexistent_user"}
        access_token = self.auth_service.create_access_token(token_data)
        
        with patch.object(self.auth_service, 'get_user_by_id', return_value=None):
            with pytest.raises(UserNotFoundError):
                await self.auth_service.get_current_user(test_db, access_token)
    
    @pytest.mark.asyncio
    async def test_get_current_user_inactive(self, test_db: AsyncSession):
        """Test getting current user when user is inactive"""
        user_id = "user123"
        token_data = {"sub": user_id}
        access_token = self.auth_service.create_access_token(token_data)
        
        # Mock inactive user
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.is_active = False
        
        with patch.object(self.auth_service, 'get_user_by_id', return_value=mock_user):
            with pytest.raises(AuthenticationError):
                await self.auth_service.get_current_user(test_db, access_token)
    
    def test_generate_secure_token(self):
        """Test secure token generation"""
        token1 = self.auth_service.generate_secure_token()
        token2 = self.auth_service.generate_secure_token()
        
        assert isinstance(token1, str)
        assert isinstance(token2, str)
        assert len(token1) > 40  # URL-safe base64 encoded
        assert len(token2) > 40
        assert token1 != token2  # Should be unique
    
    def test_hash_api_key(self):
        """Test API key hashing"""
        api_key = "test_api_key_123"
        hashed1 = self.auth_service.hash_api_key(api_key)
        hashed2 = self.auth_service.hash_api_key(api_key)
        
        assert isinstance(hashed1, str)
        assert len(hashed1) == 64  # SHA256 hex digest
        assert hashed1 == hashed2  # Same input should produce same hash
        assert hashed1 != api_key  # Should be different from original
