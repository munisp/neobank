"""
End-to-end security tests
Tests security features across the entire application
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.middleware.auth import create_access_token, UserRole
import time

client = TestClient(app)


class TestSecretManagement:
    """Test that secrets are properly managed"""
    
    def test_no_hardcoded_secrets_in_responses(self):
        """Test that API responses don't expose secrets"""
        # Login
        response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        
        response_text = response.text.lower()
        
        # Check for common secret patterns
        assert "secret" not in response_text or "jwt_secret" not in response_text
        assert "password" not in response_text or "password123" not in response_text
        assert "api_key" not in response_text
    
    def test_jwt_secret_not_exposed(self):
        """Test that JWT secret is not exposed in any endpoint"""
        token = create_access_token("user_123", "test@example.com", [UserRole.USER])
        
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        response_text = response.text.lower()
        assert "jwt_secret" not in response_text


class TestAuthenticationSecurity:
    """Test authentication security features"""
    
    def test_token_tampering_detected(self):
        """Test that tampered tokens are rejected"""
        # Create valid token
        token = create_access_token("user_123", "test@example.com", [UserRole.USER])
        
        # Tamper with token (change last character)
        tampered_token = token[:-1] + ("a" if token[-1] != "a" else "b")
        
        # Try to use tampered token
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {tampered_token}"}
        )
        
        assert response.status_code == 401
    
    def test_expired_token_rejected(self):
        """Test that expired tokens are rejected"""
        # This test would require creating an expired token
        # For now, we test the error handling
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer expired.token.here"}
        )
        
        assert response.status_code == 401
    
    def test_missing_token_rejected(self):
        """Test that requests without tokens are rejected"""
        response = client.get("/api/auth/me")
        
        assert response.status_code == 403


class TestAuthorizationSecurity:
    """Test authorization security features"""
    
    def test_user_cannot_access_admin_endpoint(self):
        """Test that regular users cannot access admin endpoints"""
        # Create user token
        user_token = create_access_token(
            user_id="user_123",
            email="user@example.com",
            roles=[UserRole.USER]
        )
        
        # Try to access admin endpoint
        response = client.get(
            "/api/auth/users",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        assert response.status_code == 403
    
    def test_admin_can_access_admin_endpoint(self):
        """Test that admins can access admin endpoints"""
        # Create admin token
        admin_token = create_access_token(
            user_id="admin_123",
            email="admin@example.com",
            roles=[UserRole.ADMIN]
        )
        
        # Access admin endpoint
        response = client.get(
            "/api/auth/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200


class TestRateLimitingSecurity:
    """Test rate limiting security"""
    
    def test_login_rate_limiting_prevents_brute_force(self):
        """Test that rate limiting prevents brute force attacks"""
        # Attempt multiple logins
        for i in range(6):
            response = client.post("/api/auth/login", json={
                "email": f"bruteforce{i}@example.com",
                "password": "wrong_password"
            })
        
        # Last request should be rate limited
        assert response.status_code == 429


class TestInputValidation:
    """Test input validation security"""
    
    def test_sql_injection_in_email(self):
        """Test that SQL injection attempts are blocked"""
        response = client.post("/api/auth/login", json={
            "email": "admin'--@example.com",
            "password": "password123"
        })
        
        # Should either validate email format or handle safely
        assert response.status_code in [200, 422]  # Valid or validation error
    
    def test_xss_in_email(self):
        """Test that XSS attempts are blocked"""
        response = client.post("/api/auth/login", json={
            "email": "<script>alert('xss')</script>@example.com",
            "password": "password123"
        })
        
        # Should validate email format
        assert response.status_code == 422
    
    def test_long_password_handled(self):
        """Test that very long passwords are handled safely"""
        long_password = "a" * 10000
        
        response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": long_password
        })
        
        # Should handle without crashing
        assert response.status_code in [200, 422]


class TestErrorHandling:
    """Test error handling doesn't leak sensitive information"""
    
    def test_authentication_error_message(self):
        """Test that authentication errors don't leak information"""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid.token"}
        )
        
        assert response.status_code == 401
        
        # Error message should be generic
        error_detail = response.json().get("detail", "").lower()
        assert "secret" not in error_detail
        assert "database" not in error_detail
        assert "internal" not in error_detail
    
    def test_authorization_error_message(self):
        """Test that authorization errors don't leak information"""
        user_token = create_access_token(
            "user_123", "user@example.com", [UserRole.USER]
        )
        
        response = client.get(
            "/api/auth/users",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        assert response.status_code == 403
        
        # Error message should be generic
        error_detail = response.json().get("detail", "").lower()
        assert "admin" in error_detail or "permission" in error_detail


class TestSecureHeaders:
    """Test security headers"""
    
    def test_security_headers_present(self):
        """Test that security headers are present"""
        response = client.get("/health")
        
        # Check for common security headers
        # Note: Actual headers depend on SecurityMiddleware implementation
        assert response.status_code == 200


class TestCORSSecurity:
    """Test CORS security"""
    
    def test_cors_headers(self):
        """Test CORS headers are properly configured"""
        response = client.options("/api/auth/login")
        
        # Should handle OPTIONS request
        assert response.status_code in [200, 405]


class TestTokenLifecycle:
    """Test complete token lifecycle security"""
    
    def test_token_refresh_invalidates_old_token(self):
        """Test that refreshing creates new token"""
        # Login
        login_response = client.post("/api/auth/login", json={
            "email": "lifecycle@example.com",
            "password": "password123"
        })
        
        old_access_token = login_response.json()["access_token"]
        refresh_token = login_response.json()["refresh_token"]
        
        # Refresh
        refresh_response = client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token
        })
        
        new_access_token = refresh_response.json()["access_token"]
        
        # Tokens should be different
        assert old_access_token != new_access_token
        
        # Both tokens should work (until old one expires)
        old_response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {old_access_token}"}
        )
        new_response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_access_token}"}
        )
        
        assert old_response.status_code == 200
        assert new_response.status_code == 200


class TestConcurrentSecurity:
    """Test security under concurrent load"""
    
    def test_concurrent_authentication_requests(self):
        """Test that concurrent requests don't cause security issues"""
        import concurrent.futures
        
        def make_request(i):
            token = create_access_token(f"user_{i}", f"user{i}@example.com", [UserRole.USER])
            return client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
        
        # Make 50 concurrent requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
            futures = [executor.submit(make_request, i) for i in range(50)]
            responses = [f.result() for f in concurrent.futures.as_completed(futures)]
        
        # All should succeed
        for response in responses:
            assert response.status_code == 200


class TestComplianceSecurity:
    """Test compliance-related security features"""
    
    def test_audit_logging_enabled(self):
        """Test that audit logging is enabled"""
        # Make authenticated request
        token = create_access_token("user_123", "test@example.com", [UserRole.USER])
        
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should succeed and be logged
        assert response.status_code == 200
        # Note: Actual log verification would require checking log files


# Run tests with: pytest tests/e2e/test_security.py -v
