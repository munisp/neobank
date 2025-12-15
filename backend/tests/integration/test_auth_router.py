"""
Integration tests for authentication router
Tests all authentication endpoints end-to-end
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.middleware.auth import create_access_token, create_refresh_token, UserRole

client = TestClient(app)


class TestLoginEndpoint:
    """Test /api/auth/login endpoint"""
    
    def test_login_success(self):
        """Test successful login"""
        response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 86400
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"
    
    def test_login_invalid_email(self):
        """Test login with invalid email format"""
        response = client.post("/api/auth/login", json={
            "email": "invalid-email",
            "password": "password123"
        })
        
        assert response.status_code == 422  # Validation error
    
    def test_login_short_password(self):
        """Test login with password too short"""
        response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "short"
        })
        
        assert response.status_code == 422  # Validation error
    
    def test_login_missing_fields(self):
        """Test login with missing fields"""
        response = client.post("/api/auth/login", json={
            "email": "test@example.com"
        })
        
        assert response.status_code == 422  # Validation error
    
    def test_login_rate_limiting(self):
        """Test login rate limiting"""
        # Make 6 requests (limit is 5)
        for i in range(6):
            response = client.post("/api/auth/login", json={
                "email": f"test{i}@example.com",
                "password": "password123"
            })
            
            if i < 5:
                assert response.status_code == 200
            else:
                assert response.status_code == 429  # Too many requests


class TestRefreshEndpoint:
    """Test /api/auth/refresh endpoint"""
    
    def test_refresh_token_success(self):
        """Test successful token refresh"""
        # First login to get refresh token
        login_response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        refresh_token = login_response.json()["refresh_token"]
        
        # Refresh the token
        response = client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 86400
    
    def test_refresh_with_access_token(self):
        """Test refresh with access token (should fail)"""
        # Get access token
        login_response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        access_token = login_response.json()["access_token"]
        
        # Try to refresh with access token
        response = client.post("/api/auth/refresh", json={
            "refresh_token": access_token
        })
        
        assert response.status_code == 401
    
    def test_refresh_with_invalid_token(self):
        """Test refresh with invalid token"""
        response = client.post("/api/auth/refresh", json={
            "refresh_token": "invalid.token.here"
        })
        
        assert response.status_code == 401


class TestLogoutEndpoint:
    """Test /api/auth/logout endpoint"""
    
    def test_logout_success(self):
        """Test successful logout"""
        # Login first
        login_response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        access_token = login_response.json()["access_token"]
        
        # Logout
        response = client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == 200
        assert "message" in response.json()
    
    def test_logout_without_token(self):
        """Test logout without authentication"""
        response = client.post("/api/auth/logout")
        
        assert response.status_code == 403  # Forbidden (no token)


class TestGetCurrentUserEndpoint:
    """Test /api/auth/me endpoint"""
    
    def test_get_current_user_success(self):
        """Test getting current user info"""
        # Login first
        login_response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        access_token = login_response.json()["access_token"]
        
        # Get current user
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "user_id" in data
        assert "email" in data
        assert "roles" in data
        assert data["authenticated"] is True
    
    def test_get_current_user_without_token(self):
        """Test getting current user without authentication"""
        response = client.get("/api/auth/me")
        
        assert response.status_code == 403


class TestVerifyTokenEndpoint:
    """Test /api/auth/verify endpoint"""
    
    def test_verify_valid_token(self):
        """Test verifying valid token"""
        # Login first
        login_response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        access_token = login_response.json()["access_token"]
        
        # Verify token
        response = client.get(
            "/api/auth/verify",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["valid"] is True
        assert "user_id" in data
    
    def test_verify_invalid_token(self):
        """Test verifying invalid token"""
        response = client.get(
            "/api/auth/verify",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        
        assert response.status_code == 401


class TestListUsersEndpoint:
    """Test /api/auth/users endpoint (admin only)"""
    
    def test_list_users_as_admin(self):
        """Test listing users as admin"""
        # Create admin token
        admin_token = create_access_token(
            user_id="admin_123",
            email="admin@example.com",
            roles=[UserRole.ADMIN]
        )
        
        # List users
        response = client.get(
            "/api/auth/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "users" in data
        assert isinstance(data["users"], list)
    
    def test_list_users_as_regular_user(self):
        """Test listing users as regular user (should fail)"""
        # Create regular user token
        user_token = create_access_token(
            user_id="user_123",
            email="user@example.com",
            roles=[UserRole.USER]
        )
        
        # Try to list users
        response = client.get(
            "/api/auth/users",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        assert response.status_code == 403  # Forbidden


class TestHealthCheckEndpoint:
    """Test /api/auth/health endpoint"""
    
    def test_health_check(self):
        """Test authentication service health check"""
        response = client.get("/api/auth/health")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "healthy"
        assert data["service"] == "authentication"


class TestAuthenticationFlow:
    """Test complete authentication flow"""
    
    def test_complete_flow(self):
        """Test complete authentication flow: login -> use token -> refresh -> logout"""
        # 1. Login
        login_response = client.post("/api/auth/login", json={
            "email": "flow@example.com",
            "password": "password123"
        })
        assert login_response.status_code == 200
        
        access_token = login_response.json()["access_token"]
        refresh_token = login_response.json()["refresh_token"]
        
        # 2. Use access token
        me_response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        assert me_response.status_code == 200
        
        # 3. Refresh token
        refresh_response = client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token
        })
        assert refresh_response.status_code == 200
        
        new_access_token = refresh_response.json()["access_token"]
        
        # 4. Use new access token
        me_response_2 = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_access_token}"}
        )
        assert me_response_2.status_code == 200
        
        # 5. Logout
        logout_response = client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {new_access_token}"}
        )
        assert logout_response.status_code == 200


class TestTokenInHeaders:
    """Test token handling in headers"""
    
    def test_bearer_token_format(self):
        """Test that Bearer token format is required"""
        # Create valid token
        token = create_access_token("user_123", "test@example.com", [UserRole.USER])
        
        # Try without "Bearer " prefix
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": token}
        )
        
        assert response.status_code == 403  # Should fail without Bearer prefix
    
    def test_missing_authorization_header(self):
        """Test request without Authorization header"""
        response = client.get("/api/auth/me")
        
        assert response.status_code == 403


class TestConcurrentRequests:
    """Test concurrent authentication requests"""
    
    def test_multiple_simultaneous_logins(self):
        """Test multiple simultaneous login requests"""
        import concurrent.futures
        
        def login(email):
            return client.post("/api/auth/login", json={
                "email": email,
                "password": "password123"
            })
        
        # Make 10 concurrent login requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(login, f"user{i}@example.com") for i in range(10)]
            responses = [f.result() for f in concurrent.futures.as_completed(futures)]
        
        # All should succeed
        for response in responses:
            assert response.status_code == 200


# Run tests with: pytest tests/integration/test_auth_router.py -v
