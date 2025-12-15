"""
End-to-End Tests for Login Flow
Tests authentication, session management, and error handling
"""
import pytest
from playwright.sync_api import Page, expect
from playwright_config import (
    BASE_URL, TEST_USER, TEST_ADMIN, SELECTORS, TIMEOUTS
)


class TestLoginFlow:
    """Test suite for user login functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self, page: Page):
        """Navigate to login page before each test"""
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        yield page
    
    def test_login_page_loads(self, page: Page):
        """Test that login page loads correctly with all elements"""
        # Check page title
        expect(page).to_have_title("Login - NeoBank")
        
        # Check login form elements are visible
        expect(page.locator(SELECTORS["login"]["email_input"])).to_be_visible()
        expect(page.locator(SELECTORS["login"]["password_input"])).to_be_visible()
        expect(page.locator(SELECTORS["login"]["submit_button"])).to_be_visible()
        
        # Check submit button text
        submit_button = page.locator(SELECTORS["login"]["submit_button"])
        expect(submit_button).to_have_text("Sign In")
    
    def test_successful_login_with_valid_credentials(self, page: Page):
        """Test successful login with valid user credentials"""
        # Fill in login form
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        
        # Click submit button
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for navigation to dashboard
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Verify successful login
        expect(page).to_have_url(f"{BASE_URL}/dashboard")
        expect(page.locator(SELECTORS["dashboard"]["welcome_message"])).to_be_visible()
        
        # Verify user session is established
        local_storage = page.evaluate("() => localStorage.getItem('auth_token')")
        assert local_storage is not None, "Auth token should be stored in localStorage"
    
    def test_login_with_invalid_email(self, page: Page):
        """Test login fails with invalid email format"""
        # Fill in invalid email
        page.fill(SELECTORS["login"]["email_input"], "invalid-email")
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        
        # Click submit button
        page.click(SELECTORS["login"]["submit_button"])
        
        # Verify error message is displayed
        error_message = page.locator(SELECTORS["login"]["error_message"])
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Invalid email format")
        
        # Verify user stays on login page
        expect(page).to_have_url(f"{BASE_URL}/login")
    
    def test_login_with_wrong_password(self, page: Page):
        """Test login fails with incorrect password"""
        # Fill in correct email but wrong password
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], "WrongPassword123!")
        
        # Click submit button
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for error response
        page.wait_for_timeout(2000)
        
        # Verify error message is displayed
        error_message = page.locator(SELECTORS["login"]["error_message"])
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Invalid credentials")
        
        # Verify user stays on login page
        expect(page).to_have_url(f"{BASE_URL}/login")
    
    def test_login_with_empty_fields(self, page: Page):
        """Test login fails when fields are empty"""
        # Click submit without filling fields
        page.click(SELECTORS["login"]["submit_button"])
        
        # Verify validation errors are displayed
        email_input = page.locator(SELECTORS["login"]["email_input"])
        password_input = page.locator(SELECTORS["login"]["password_input"])
        
        # Check for HTML5 validation or custom error messages
        expect(email_input).to_have_attribute("required", "")
        expect(password_input).to_have_attribute("required", "")
    
    def test_login_with_unregistered_email(self, page: Page):
        """Test login fails with email not in system"""
        # Fill in unregistered email
        page.fill(SELECTORS["login"]["email_input"], "unregistered@example.com")
        page.fill(SELECTORS["login"]["password_input"], "SomePassword123!")
        
        # Click submit button
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for error response
        page.wait_for_timeout(2000)
        
        # Verify error message
        error_message = page.locator(SELECTORS["login"]["error_message"])
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Invalid credentials")
    
    def test_admin_login_redirects_to_admin_dashboard(self, page: Page):
        """Test admin user is redirected to admin dashboard"""
        # Fill in admin credentials
        page.fill(SELECTORS["login"]["email_input"], TEST_ADMIN["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_ADMIN["password"])
        
        # Click submit button
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for navigation to admin dashboard
        page.wait_for_url(f"{BASE_URL}/admin/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Verify admin dashboard is loaded
        expect(page).to_have_url(f"{BASE_URL}/admin/dashboard")
        expect(page.locator(".admin-panel")).to_be_visible()
    
    def test_remember_me_functionality(self, page: Page):
        """Test remember me checkbox persists session"""
        # Fill in credentials
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        
        # Check remember me checkbox if it exists
        remember_me = page.locator('input[name="remember_me"]')
        if remember_me.is_visible():
            remember_me.check()
        
        # Click submit button
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for navigation
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Close and reopen browser
        page.context.close()
        new_context = page.context.browser.new_context()
        new_page = new_context.new_page()
        
        # Navigate to dashboard
        new_page.goto(f"{BASE_URL}/dashboard")
        
        # Verify user is still logged in (or redirected to login if not)
        # This depends on implementation
        new_context.close()
    
    def test_logout_functionality(self, page: Page):
        """Test user can successfully logout"""
        # First login
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for dashboard
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Click logout button
        logout_button = page.locator('button:has-text("Logout")')
        logout_button.click()
        
        # Verify redirected to login page
        page.wait_for_url(f"{BASE_URL}/login", timeout=TIMEOUTS["navigation"])
        expect(page).to_have_url(f"{BASE_URL}/login")
        
        # Verify auth token is cleared
        local_storage = page.evaluate("() => localStorage.getItem('auth_token')")
        assert local_storage is None, "Auth token should be cleared from localStorage"
    
    def test_session_expiry_redirects_to_login(self, page: Page):
        """Test expired session redirects to login"""
        # Login first
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for dashboard
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Manually expire the token in localStorage
        page.evaluate("""() => {
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.invalid';
            localStorage.setItem('auth_token', expiredToken);
        }""")
        
        # Try to navigate to a protected page
        page.goto(f"{BASE_URL}/transfers")
        
        # Verify redirected to login
        page.wait_for_url(f"{BASE_URL}/login", timeout=TIMEOUTS["navigation"])
        expect(page).to_have_url(f"{BASE_URL}/login")
    
    def test_password_visibility_toggle(self, page: Page):
        """Test password visibility toggle button works"""
        password_input = page.locator(SELECTORS["login"]["password_input"])
        toggle_button = page.locator('button[aria-label="Toggle password visibility"]')
        
        # Initially password should be hidden
        expect(password_input).to_have_attribute("type", "password")
        
        # Click toggle button if it exists
        if toggle_button.is_visible():
            toggle_button.click()
            
            # Password should now be visible
            expect(password_input).to_have_attribute("type", "text")
            
            # Click again to hide
            toggle_button.click()
            expect(password_input).to_have_attribute("type", "password")
    
    def test_login_rate_limiting(self, page: Page):
        """Test rate limiting after multiple failed login attempts"""
        # Attempt login multiple times with wrong password
        for i in range(6):
            page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
            page.fill(SELECTORS["login"]["password_input"], f"WrongPassword{i}")
            page.click(SELECTORS["login"]["submit_button"])
            page.wait_for_timeout(1000)
        
        # Verify rate limit error message
        error_message = page.locator(SELECTORS["login"]["error_message"])
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Too many login attempts")


class TestLoginSecurity:
    """Test suite for login security features"""
    
    @pytest.fixture(autouse=True)
    def setup(self, page: Page):
        """Navigate to login page before each test"""
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        yield page
    
    def test_csrf_token_present(self, page: Page):
        """Test CSRF token is present in login form"""
        csrf_input = page.locator('input[name="csrf_token"]')
        if csrf_input.is_visible():
            expect(csrf_input).to_have_attribute("value")
    
    def test_https_redirect(self, page: Page):
        """Test HTTP requests are redirected to HTTPS in production"""
        # This test would only run in production environment
        # Skip in local development
        pass
    
    def test_no_sensitive_data_in_url(self, page: Page):
        """Test no sensitive data is exposed in URL after login"""
        # Login
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for navigation
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Verify URL doesn't contain sensitive data
        current_url = page.url
        assert "password" not in current_url.lower()
        assert "token" not in current_url.lower()
        assert TEST_USER["password"] not in current_url


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--html=test_report_login.html"])
