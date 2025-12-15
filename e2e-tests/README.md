# NeoBank E2E Test Suite

Comprehensive end-to-end tests for critical user flows using Playwright.

## 📋 Overview

This test suite provides complete coverage for:
- **Login Flow**: Authentication, session management, security
- **Transaction Flow**: Transfer creation, validation, confirmation
- **Transaction History**: Viewing, searching, exporting transactions

## 🏗️ Test Structure

```
e2e-tests/
├── playwright.config.py      # Playwright configuration and constants
├── conftest.py               # Pytest fixtures and hooks
├── test_utils.py             # Reusable helper functions
├── test_login_flow.py        # Login authentication tests (17 tests)
├── test_transaction_flow.py  # Transaction submission tests (18 tests)
├── screenshots/              # Test failure screenshots
├── videos/                   # Test execution videos
├── traces/                   # Playwright traces
└── reports/                  # HTML test reports
```

## 🎯 Test Coverage

### Login Flow Tests (17 tests)

| Test | Description |
|------|-------------|
| `test_login_page_loads` | Verify login page elements |
| `test_successful_login_with_valid_credentials` | Valid login flow |
| `test_login_with_invalid_email` | Invalid email format |
| `test_login_with_wrong_password` | Incorrect password |
| `test_login_with_empty_fields` | Empty field validation |
| `test_login_with_unregistered_email` | Unregistered user |
| `test_admin_login_redirects_to_admin_dashboard` | Admin user flow |
| `test_remember_me_functionality` | Remember me checkbox |
| `test_logout_functionality` | Logout flow |
| `test_session_expiry_redirects_to_login` | Session expiration |
| `test_password_visibility_toggle` | Password show/hide |
| `test_login_rate_limiting` | Rate limiting |
| `test_csrf_token_present` | CSRF protection |
| `test_https_redirect` | HTTPS enforcement |
| `test_no_sensitive_data_in_url` | URL security |

### Transaction Flow Tests (18 tests)

| Test | Description |
|------|-------------|
| `test_transfer_page_loads` | Verify transfer page elements |
| `test_successful_transfer_submission` | Valid transfer flow |
| `test_transfer_with_insufficient_balance` | Insufficient funds |
| `test_transfer_with_invalid_account_number` | Invalid account |
| `test_transfer_with_negative_amount` | Negative amount validation |
| `test_transfer_with_zero_amount` | Zero amount validation |
| `test_transfer_to_same_account` | Same account validation |
| `test_transfer_cancellation` | Cancel transfer |
| `test_transfer_with_special_characters_in_description` | XSS prevention |
| `test_duplicate_transfer_prevention` | Idempotency |
| `test_transfer_with_beneficiary_selection` | Beneficiary feature |
| `test_transfer_amount_formatting` | Amount formatting |
| `test_transfer_confirmation_modal_details` | Confirmation modal |
| `test_transaction_history_displays` | Transaction list |
| `test_transaction_details_modal` | Transaction details |
| `test_transaction_search_functionality` | Search feature |
| `test_transaction_export_functionality` | Export to CSV |

## 🚀 Running Tests

### Prerequisites

```bash
# Install dependencies
pip3 install playwright pytest-playwright pytest-html

# Install Playwright browsers
python3 -m playwright install chromium
```

### Run All Tests

```bash
cd /home/ubuntu/e2e-tests

# Run all tests
pytest -v

# Run with HTML report
pytest -v --html=reports/test_report.html --self-contained-html

# Run specific test file
pytest test_login_flow.py -v

# Run specific test
pytest test_login_flow.py::TestLoginFlow::test_successful_login_with_valid_credentials -v
```

### Run Tests in Headed Mode

```bash
# See browser during test execution
pytest -v --headed

# Slow down operations for debugging
pytest -v --headed --slowmo=1000
```

### Run Tests with Different Browsers

```bash
# Chromium (default)
pytest -v --browser=chromium

# Firefox
pytest -v --browser=firefox

# WebKit (Safari)
pytest -v --browser=webkit
```

### Parallel Execution

```bash
# Install pytest-xdist
pip3 install pytest-xdist

# Run tests in parallel
pytest -v -n 4  # 4 workers
```

## 📊 Test Reports

### HTML Report

```bash
pytest -v --html=reports/test_report.html --self-contained-html
```

Open `reports/test_report.html` in a browser to view:
- Test results summary
- Pass/fail statistics
- Execution time
- Failure screenshots
- Stack traces

### JUnit XML Report

```bash
pytest -v --junitxml=reports/junit.xml
```

### Allure Report

```bash
# Install allure
pip3 install allure-pytest

# Run tests with allure
pytest -v --alluredir=reports/allure-results

# Generate and open report
allure serve reports/allure-results
```

## 🔧 Configuration

### Environment Variables

```bash
# Set base URLs
export BASE_URL=http://localhost:3000
export API_BASE_URL=http://localhost:8000

# Set test user credentials
export TEST_USER_EMAIL=test.user@neobank.com
export TEST_USER_PASSWORD=TestPassword123!
```

### Playwright Configuration

Edit `playwright.config.py` to customize:
- Base URLs
- Timeouts
- Browser settings
- Viewport size
- Screenshot/video settings

### Test Data

Edit `playwright.config.py` to customize test data:
- User credentials
- Account numbers
- Transfer amounts
- API endpoints

## 🛠️ Helper Functions

The `test_utils.py` module provides reusable functions:

```python
from test_utils import (
    login_as_user,
    login_as_admin,
    logout,
    create_transfer,
    get_account_balance,
    wait_for_transaction_to_complete,
    take_screenshot,
    mock_api_response
)

# Example usage
def test_example(page):
    login_as_user(page)
    
    result = create_transfer(
        page,
        from_account="1234567890",
        to_account="0987654321",
        amount=1000.00,
        description="Test transfer"
    )
    
    assert result["success"] == True
```

## 🐛 Debugging

### Screenshots on Failure

Screenshots are automatically captured on test failure and saved to `screenshots/`.

### Video Recording

Enable video recording in `playwright.config.py`:

```python
PLAYWRIGHT_CONFIG = {
    "video": "on",  # or "retain-on-failure"
}
```

### Playwright Inspector

```bash
# Run tests with inspector
PWDEBUG=1 pytest test_login_flow.py -v
```

### Traces

Enable trace recording:

```python
PLAYWRIGHT_CONFIG = {
    "trace": "on",  # or "retain-on-failure"
}
```

View traces:

```bash
playwright show-trace traces/trace.zip
```

## 📝 Writing New Tests

### Test Template

```python
import pytest
from playwright.sync_api import Page, expect
from playwright_config import BASE_URL, SELECTORS
from test_utils import login_as_user


class TestFeatureName:
    """Test suite for feature description"""
    
    @pytest.fixture(autouse=True)
    def setup(self, page: Page):
        """Setup before each test"""
        login_as_user(page)
        page.goto(f"{BASE_URL}/feature-page")
        yield page
    
    def test_feature_functionality(self, page: Page):
        """Test specific functionality"""
        # Arrange
        page.fill('input[name="field"]', "value")
        
        # Act
        page.click('button[type="submit"]')
        
        # Assert
        expect(page.locator('.success-message')).to_be_visible()
```

### Best Practices

1. **Use Page Object Model** for complex pages
2. **Use explicit waits** instead of sleep
3. **Use data-testid attributes** for stable selectors
4. **Keep tests independent** - no test should depend on another
5. **Use fixtures** for common setup/teardown
6. **Mock external dependencies** when appropriate
7. **Test edge cases** and error scenarios
8. **Add meaningful assertions** - verify actual behavior
9. **Use descriptive test names** - explain what is being tested
10. **Keep tests fast** - aim for <5 seconds per test

## 🔒 Security Testing

The test suite includes security tests:
- CSRF token validation
- XSS prevention
- SQL injection prevention
- Rate limiting
- Session management
- Password visibility
- HTTPS enforcement

## 📈 CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install playwright pytest-playwright pytest-html
          python -m playwright install chromium
      - name: Run tests
        run: |
          cd e2e-tests
          pytest -v --html=reports/test_report.html
      - name: Upload test results
        uses: actions/upload-artifact@v2
        if: always()
        with:
          name: test-results
          path: e2e-tests/reports/
```

## 📞 Support

For issues or questions:
- **Platform Team**: platform@neobank.com
- **QA Team**: qa@neobank.com
- **Slack**: #engineering-support

## 📄 License

Copyright © 2025 NeoBank. All rights reserved.
