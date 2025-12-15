"""
Integration tests for authentication endpoints
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.integration
class TestAuthEndpoints:
    """Integration tests for authentication API endpoints"""
    
    @pytest.mark.asyncio
    async def test_register_user_success(self, client: AsyncClient, sample_user_data):
        """Test successful user registration"""
        response = await client.post("/api/auth/register", json=sample_user_data)
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["email"] == sample_user_data["email"].lower()
        assert data["full_name"] == sample_user_data["full_name"]
        assert data["phone_number"] == sample_user_data["phone_number"]
        assert data["is_active"] is True
        assert data["is_verified"] is False
        assert data["kyc_status"] == "pending"
        assert "id" in data
        assert "created_at" in data
    
    @pytest.mark.asyncio
    async def test_register_user_duplicate_email(self, client: AsyncClient, sample_user_data):
        """Test registration with duplicate email"""
        # Register first user
        response1 = await client.post("/api/auth/register", json=sample_user_data)
        assert response1.status_code == 201
        
        # Try to register with same email
        response2 = await client.post("/api/auth/register", json=sample_user_data)
        assert response2.status_code == 409
        
        data = response2.json()
        assert "already exists" in data["detail"].lower()
    
    @pytest.mark.asyncio
    async def test_register_user_invalid_password(self, client: AsyncClient, sample_user_data):
        """Test registration with invalid password"""
        invalid_data = sample_user_data.copy()
        invalid_data["password"] = "weak"
        invalid_data["confirm_password"] = "weak"
        
        response = await client.post("/api/auth/register", json=invalid_data)
        assert response.status_code == 422
        
        data = response.json()
        assert "detail" in data
    
    @pytest.mark.asyncio
    async def test_register_user_password_mismatch(self, client: AsyncClient, sample_user_data):
        """Test registration with password mismatch"""
        invalid_data = sample_user_data.copy()
        invalid_data["confirm_password"] = "DifferentPassword123!"
        
        response = await client.post("/api/auth/register", json=invalid_data)
        assert response.status_code == 422
        
        data = response.json()
        assert "detail" in data
    
    @pytest.mark.asyncio
    async def test_register_user_invalid_email(self, client: AsyncClient, sample_user_data):
        """Test registration with invalid email"""
        invalid_data = sample_user_data.copy()
        invalid_data["email"] = "invalid-email"
        
        response = await client.post("/api/auth/register", json=invalid_data)
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient, sample_user_data, sample_login_data):
        """Test successful login"""
        # Register user first
        register_response = await client.post("/api/auth/register", json=sample_user_data)
        assert register_response.status_code == 201
        
        # Login
        login_response = await client.post("/api/auth/login", json=sample_login_data)
        assert login_response.status_code == 200
        
        data = login_response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
        assert "user" in data
        
        user_data = data["user"]
        assert user_data["email"] == sample_login_data["email"].lower()
    
    @pytest.mark.asyncio
    async def test_login_invalid_email(self, client: AsyncClient):
        """Test login with invalid email"""
        login_data = {
            "email": "nonexistent@example.com",
            "password": "TestPassword123!"
        }
        
        response = await client.post("/api/auth/login", json=login_data)
        assert response.status_code == 401
        
        data = response.json()
        assert "Invalid email or password" in data["detail"]
    
    @pytest.mark.asyncio
    async def test_login_invalid_password(self, client: AsyncClient, sample_user_data):
        """Test login with invalid password"""
        # Register user first
        register_response = await client.post("/api/auth/register", json=sample_user_data)
        assert register_response.status_code == 201
        
        # Login with wrong password
        login_data = {
            "email": sample_user_data["email"],
            "password": "WrongPassword123!"
        }
        
        response = await client.post("/api/auth/login", json=login_data)
        assert response.status_code == 401
        
        data = response.json()
        assert "Invalid email or password" in data["detail"]
    
    @pytest.mark.asyncio
    async def test_refresh_token_success(self, client: AsyncClient, authenticated_user):
        """Test successful token refresh"""
        # Get refresh token from authenticated user
        login_response = await client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "TestPassword123!"
        })
        
        refresh_token = login_response.json()["refresh_token"]
        
        # Refresh token
        refresh_data = {"refresh_token": refresh_token}
        response = await client.post("/api/auth/refresh", json=refresh_data)
        
        assert response.status_code == 200
        
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
    
    @pytest.mark.asyncio
    async def test_refresh_token_invalid(self, client: AsyncClient):
        """Test token refresh with invalid token"""
        refresh_data = {"refresh_token": "invalid_token"}
        response = await client.post("/api/auth/refresh", json=refresh_data)
        
        assert response.status_code == 401
        
        data = response.json()
        assert "Invalid token" in data["detail"]
    
    @pytest.mark.asyncio
    async def test_get_profile_success(self, client: AsyncClient, authenticated_user):
        """Test getting user profile"""
        response = await client.get(
            "/api/auth/profile",
            headers=authenticated_user["headers"]
        )
        
        assert response.status_code == 200
        
        data = response.json()
        assert data["email"] == authenticated_user["user"]["email"]
        assert data["full_name"] == authenticated_user["user"]["full_name"]
        assert "id" in data
        assert "created_at" in data
    
    @pytest.mark.asyncio
    async def test_get_profile_unauthorized(self, client: AsyncClient):
        """Test getting profile without authentication"""
        response = await client.get("/api/auth/profile")
        
        assert response.status_code == 403
    
    @pytest.mark.asyncio
    async def test_get_profile_invalid_token(self, client: AsyncClient):
        """Test getting profile with invalid token"""
        headers = {"Authorization": "Bearer invalid_token"}
        response = await client.get("/api/auth/profile", headers=headers)
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_logout_success(self, client: AsyncClient, authenticated_user):
        """Test successful logout"""
        response = await client.post(
            "/api/auth/logout",
            headers=authenticated_user["headers"]
        )
        
        assert response.status_code == 200
        
        data = response.json()
        assert "Successfully logged out" in data["message"]
    
    @pytest.mark.asyncio
    async def test_logout_unauthorized(self, client: AsyncClient):
        """Test logout without authentication"""
        response = await client.post("/api/auth/logout")
        
        assert response.status_code == 403
    
    @pytest.mark.asyncio
    async def test_verify_token_success(self, client: AsyncClient, authenticated_user):
        """Test token verification"""
        response = await client.get(
            "/api/auth/verify-token",
            headers=authenticated_user["headers"]
        )
        
        assert response.status_code == 200
        
        data = response.json()
        assert data["valid"] is True
        assert "user" in data
        assert data["user"]["email"] == authenticated_user["user"]["email"]
    
    @pytest.mark.asyncio
    async def test_verify_token_invalid(self, client: AsyncClient):
        """Test token verification with invalid token"""
        headers = {"Authorization": "Bearer invalid_token"}
        response = await client.get("/api/auth/verify-token", headers=headers)
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_authentication_flow_complete(self, client: AsyncClient, sample_user_data):
        """Test complete authentication flow"""
        # 1. Register user
        register_response = await client.post("/api/auth/register", json=sample_user_data)
        assert register_response.status_code == 201
        
        # 2. Login
        login_data = {
            "email": sample_user_data["email"],
            "password": sample_user_data["password"]
        }
        login_response = await client.post("/api/auth/login", json=login_data)
        assert login_response.status_code == 200
        
        tokens = login_response.json()
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]
        
        # 3. Access protected endpoint
        headers = {"Authorization": f"Bearer {access_token}"}
        profile_response = await client.get("/api/auth/profile", headers=headers)
        assert profile_response.status_code == 200
        
        # 4. Refresh token
        refresh_data = {"refresh_token": refresh_token}
        refresh_response = await client.post("/api/auth/refresh", json=refresh_data)
        assert refresh_response.status_code == 200
        
        new_tokens = refresh_response.json()
        new_access_token = new_tokens["access_token"]
        
        # 5. Use new token
        new_headers = {"Authorization": f"Bearer {new_access_token}"}
        verify_response = await client.get("/api/auth/verify-token", headers=new_headers)
        assert verify_response.status_code == 200
        
        # 6. Logout
        logout_response = await client.post("/api/auth/logout", headers=new_headers)
        assert logout_response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_case_insensitive_email(self, client: AsyncClient, sample_user_data):
        """Test that email handling is case insensitive"""
        # Register with lowercase email
        register_response = await client.post("/api/auth/register", json=sample_user_data)
        assert register_response.status_code == 201
        
        # Login with uppercase email
        login_data = {
            "email": sample_user_data["email"].upper(),
            "password": sample_user_data["password"]
        }
        login_response = await client.post("/api/auth/login", json=login_data)
        assert login_response.status_code == 200
        
        # Email should be stored as lowercase
        user_data = login_response.json()["user"]
        assert user_data["email"] == sample_user_data["email"].lower()
    
    @pytest.mark.asyncio
    async def test_concurrent_registrations(self, client: AsyncClient, sample_user_data):
        """Test concurrent registration attempts with same email"""
        import asyncio
        
        # Create multiple registration tasks with same email
        tasks = []
        for i in range(3):
            task = client.post("/api/auth/register", json=sample_user_data)
            tasks.append(task)
        
        # Execute concurrently
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Only one should succeed
        success_count = sum(1 for r in responses if hasattr(r, 'status_code') and r.status_code == 201)
        assert success_count == 1
        
        # Others should fail with conflict
        conflict_count = sum(1 for r in responses if hasattr(r, 'status_code') and r.status_code == 409)
        assert conflict_count == 2
