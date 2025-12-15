"""
Test Utilities and Helper Functions for E2E Tests
Provides reusable functions for common test operations
"""
from playwright.sync_api import Page, expect
from playwright_config import (
    BASE_URL, TEST_USER, TEST_ADMIN, SELECTORS, TIMEOUTS, API_ENDPOINTS
)
import json
from typing import Dict, Any, Optional


def login_as_user(page: Page, email: str = None, password: str = None) -> None:
    """
    Helper function to login as a user
    
    Args:
        page: Playwright page object
        email: User email (defaults to TEST_USER email)
        password: User password (defaults to TEST_USER password)
    """
    email = email or TEST_USER["email"]
    password = password or TEST_USER["password"]
    
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    
    page.fill(SELECTORS["login"]["email_input"], email)
    page.fill(SELECTORS["login"]["password_input"], password)
    page.click(SELECTORS["login"]["submit_button"])
    
    # Wait for successful login
    page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])


def login_as_admin(page: Page) -> None:
    """
    Helper function to login as admin user
    
    Args:
        page: Playwright page object
    """
    login_as_user(page, TEST_ADMIN["email"], TEST_ADMIN["password"])
    
    # Wait for admin dashboard
    page.wait_for_url(f"{BASE_URL}/admin/dashboard", timeout=TIMEOUTS["navigation"])


def logout(page: Page) -> None:
    """
    Helper function to logout current user
    
    Args:
        page: Playwright page object
    """
    logout_button = page.locator('button:has-text("Logout")')
    if logout_button.is_visible():
        logout_button.click()
        page.wait_for_url(f"{BASE_URL}/login", timeout=TIMEOUTS["navigation"])


def get_auth_token(page: Page) -> Optional[str]:
    """
    Get authentication token from localStorage
    
    Args:
        page: Playwright page object
        
    Returns:
        Auth token string or None
    """
    return page.evaluate("() => localStorage.getItem('auth_token')")


def set_auth_token(page: Page, token: str) -> None:
    """
    Set authentication token in localStorage
    
    Args:
        page: Playwright page object
        token: JWT token string
    """
    page.evaluate(f"() => localStorage.setItem('auth_token', '{token}')")


def clear_auth_token(page: Page) -> None:
    """
    Clear authentication token from localStorage
    
    Args:
        page: Playwright page object
    """
    page.evaluate("() => localStorage.removeItem('auth_token')")


def create_transfer(
    page: Page,
    from_account: str,
    to_account: str,
    amount: float,
    description: str = "Test transfer",
    confirm: bool = True
) -> Dict[str, Any]:
    """
    Helper function to create a transfer
    
    Args:
        page: Playwright page object
        from_account: Source account number
        to_account: Destination account number
        amount: Transfer amount
        description: Transfer description
        confirm: Whether to confirm the transfer in modal
        
    Returns:
        Dictionary with transfer result
    """
    # Navigate to transfer page
    page.goto(f"{BASE_URL}/transfers")
    page.wait_for_load_state("networkidle")
    
    # Fill in transfer form
    page.select_option(SELECTORS["transfer"]["from_account"], from_account)
    page.fill(SELECTORS["transfer"]["to_account"], to_account)
    page.fill(SELECTORS["transfer"]["amount"], str(amount))
    page.fill(SELECTORS["transfer"]["description"], description)
    
    # Click submit button
    page.click(SELECTORS["transfer"]["submit_button"])
    
    # Wait for confirmation modal
    confirmation_modal = page.locator(SELECTORS["transfer"]["confirmation_modal"])
    expect(confirmation_modal).to_be_visible(timeout=TIMEOUTS["action"])
    
    if confirm:
        # Confirm transfer
        confirm_button = confirmation_modal.locator('button:has-text("Confirm")')
        confirm_button.click()
        
        # Wait for success message
        success_message = page.locator(SELECTORS["transfer"]["success_message"])
        expect(success_message).to_be_visible(timeout=TIMEOUTS["action"])
        
        # Get transaction ID
        transaction_id = page.locator('.transaction-id').text_content()
        
        return {
            "success": True,
            "transaction_id": transaction_id,
            "from_account": from_account,
            "to_account": to_account,
            "amount": amount,
            "description": description
        }
    else:
        # Cancel transfer
        cancel_button = confirmation_modal.locator('button:has-text("Cancel")')
        cancel_button.click()
        
        return {
            "success": False,
            "cancelled": True
        }


def get_account_balance(page: Page, account_number: str) -> float:
    """
    Get account balance from dashboard or account page
    
    Args:
        page: Playwright page object
        account_number: Account number to check
        
    Returns:
        Account balance as float
    """
    page.goto(f"{BASE_URL}/accounts/{account_number}")
    page.wait_for_load_state("networkidle")
    
    balance_element = page.locator('.account-balance')
    balance_text = balance_element.text_content()
    
    # Extract numeric value from balance text (e.g., "₦1,000.00" -> 1000.00)
    balance = float(balance_text.replace(',', '').replace('₦', '').strip())
    
    return balance


def wait_for_transaction_to_complete(page: Page, transaction_id: str, timeout: int = 30000) -> bool:
    """
    Wait for a transaction to complete processing
    
    Args:
        page: Playwright page object
        transaction_id: Transaction ID to monitor
        timeout: Maximum time to wait in milliseconds
        
    Returns:
        True if transaction completed successfully, False otherwise
    """
    page.goto(f"{BASE_URL}/transactions/{transaction_id}")
    
    # Wait for status to change to "completed"
    status_element = page.locator('.transaction-status')
    
    try:
        expect(status_element).to_have_text("completed", timeout=timeout)
        return True
    except:
        return False


def take_screenshot(page: Page, name: str) -> str:
    """
    Take a screenshot and save it
    
    Args:
        page: Playwright page object
        name: Screenshot name
        
    Returns:
        Path to saved screenshot
    """
    screenshot_path = f"/home/ubuntu/e2e-tests/screenshots/{name}.png"
    page.screenshot(path=screenshot_path, full_page=True)
    return screenshot_path


def assert_no_console_errors(page: Page) -> None:
    """
    Assert that no console errors occurred during test
    
    Args:
        page: Playwright page object
    """
    console_errors = []
    
    def handle_console(msg):
        if msg.type == "error":
            console_errors.append(msg.text)
    
    page.on("console", handle_console)
    
    assert len(console_errors) == 0, f"Console errors found: {console_errors}"


def mock_api_response(page: Page, endpoint: str, response_data: Dict[str, Any], status_code: int = 200) -> None:
    """
    Mock an API response for testing
    
    Args:
        page: Playwright page object
        endpoint: API endpoint to mock
        response_data: Response data to return
        status_code: HTTP status code
    """
    page.route(
        f"**{endpoint}",
        lambda route: route.fulfill(
            status=status_code,
            body=json.dumps(response_data),
            headers={"Content-Type": "application/json"}
        )
    )


def wait_for_api_call(page: Page, endpoint: str, timeout: int = 10000) -> Dict[str, Any]:
    """
    Wait for an API call to be made and capture the response
    
    Args:
        page: Playwright page object
        endpoint: API endpoint to wait for
        timeout: Maximum time to wait in milliseconds
        
    Returns:
        API response data
    """
    with page.expect_response(f"**{endpoint}", timeout=timeout) as response_info:
        pass
    
    response = response_info.value
    return response.json()


def fill_form_fields(page: Page, field_data: Dict[str, str]) -> None:
    """
    Fill multiple form fields at once
    
    Args:
        page: Playwright page object
        field_data: Dictionary mapping field selectors to values
    """
    for selector, value in field_data.items():
        element = page.locator(selector)
        
        if element.get_attribute("type") == "select-one":
            page.select_option(selector, value)
        else:
            page.fill(selector, value)


def verify_form_validation_errors(page: Page, expected_errors: Dict[str, str]) -> None:
    """
    Verify form validation errors are displayed
    
    Args:
        page: Playwright page object
        expected_errors: Dictionary mapping field names to expected error messages
    """
    for field_name, expected_message in expected_errors.items():
        error_element = page.locator(f'.error-{field_name}')
        expect(error_element).to_be_visible()
        expect(error_element).to_contain_text(expected_message)


def wait_for_loading_to_complete(page: Page, timeout: int = 10000) -> None:
    """
    Wait for loading spinner or indicator to disappear
    
    Args:
        page: Playwright page object
        timeout: Maximum time to wait in milliseconds
    """
    loading_indicator = page.locator('.loading-spinner, .loading-indicator')
    
    if loading_indicator.is_visible():
        expect(loading_indicator).not_to_be_visible(timeout=timeout)


def get_transaction_history(page: Page, limit: int = 10) -> list:
    """
    Get transaction history from transactions page
    
    Args:
        page: Playwright page object
        limit: Maximum number of transactions to retrieve
        
    Returns:
        List of transaction dictionaries
    """
    page.goto(f"{BASE_URL}/transactions")
    page.wait_for_load_state("networkidle")
    
    transactions = []
    transaction_items = page.locator('.transaction-item').all()[:limit]
    
    for item in transaction_items:
        transaction = {
            "id": item.locator('.transaction-id').text_content(),
            "amount": item.locator('.amount').text_content(),
            "date": item.locator('.date').text_content(),
            "status": item.locator('.status').text_content(),
            "description": item.locator('.description').text_content()
        }
        transactions.append(transaction)
    
    return transactions


def verify_responsive_design(page: Page, viewports: list = None) -> None:
    """
    Verify page works correctly across different viewport sizes
    
    Args:
        page: Playwright page object
        viewports: List of viewport dictionaries with width and height
    """
    if viewports is None:
        viewports = [
            {"width": 375, "height": 667},   # Mobile
            {"width": 768, "height": 1024},  # Tablet
            {"width": 1920, "height": 1080}  # Desktop
        ]
    
    for viewport in viewports:
        page.set_viewport_size(viewport)
        page.wait_for_timeout(1000)
        
        # Verify page is still functional
        expect(page.locator('body')).to_be_visible()


def check_accessibility(page: Page) -> Dict[str, Any]:
    """
    Run basic accessibility checks on the page
    
    Args:
        page: Playwright page object
        
    Returns:
        Dictionary with accessibility check results
    """
    # Check for alt text on images
    images_without_alt = page.locator('img:not([alt])').count()
    
    # Check for form labels
    inputs_without_labels = page.locator('input:not([aria-label]):not([aria-labelledby])').count()
    
    # Check for heading hierarchy
    h1_count = page.locator('h1').count()
    
    return {
        "images_without_alt": images_without_alt,
        "inputs_without_labels": inputs_without_labels,
        "h1_count": h1_count,
        "passed": images_without_alt == 0 and inputs_without_labels == 0 and h1_count == 1
    }


def simulate_network_conditions(page: Page, condition: str = "slow_3g") -> None:
    """
    Simulate different network conditions
    
    Args:
        page: Playwright page object
        condition: Network condition preset (slow_3g, fast_3g, offline)
    """
    conditions = {
        "slow_3g": {
            "download_throughput": 50 * 1024 / 8,
            "upload_throughput": 50 * 1024 / 8,
            "latency": 2000
        },
        "fast_3g": {
            "download_throughput": 1.6 * 1024 * 1024 / 8,
            "upload_throughput": 750 * 1024 / 8,
            "latency": 562.5
        },
        "offline": {
            "offline": True
        }
    }
    
    if condition in conditions:
        page.context.set_offline(conditions[condition].get("offline", False))


# Export all utility functions
__all__ = [
    'login_as_user',
    'login_as_admin',
    'logout',
    'get_auth_token',
    'set_auth_token',
    'clear_auth_token',
    'create_transfer',
    'get_account_balance',
    'wait_for_transaction_to_complete',
    'take_screenshot',
    'assert_no_console_errors',
    'mock_api_response',
    'wait_for_api_call',
    'fill_form_fields',
    'verify_form_validation_errors',
    'wait_for_loading_to_complete',
    'get_transaction_history',
    'verify_responsive_design',
    'check_accessibility',
    'simulate_network_conditions'
]
