"""
Playwright E2E Test Configuration for NeoBank Platform
"""
import os
from typing import Dict, Any

# Base URL for the application
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# Test user credentials
TEST_USER = {
    "email": "test.user@neobank.com",
    "password": "TestPassword123!",
    "phone": "+2348012345678"
}

TEST_ADMIN = {
    "email": "admin@neobank.com",
    "password": "AdminPassword123!",
    "role": "admin"
}

# Playwright configuration
PLAYWRIGHT_CONFIG: Dict[str, Any] = {
    "base_url": BASE_URL,
    "timeout": 30000,  # 30 seconds
    "expect_timeout": 5000,  # 5 seconds
    "screenshot": "only-on-failure",
    "video": "retain-on-failure",
    "trace": "retain-on-failure",
}

# Browser configuration
BROWSER_CONFIG = {
    "headless": True,
    "slow_mo": 0,  # Slow down operations by N milliseconds
    "viewport": {"width": 1920, "height": 1080},
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Test data
TEST_ACCOUNTS = {
    "source_account": "1234567890",
    "destination_account": "0987654321",
    "amount": 1000.00,
    "currency": "NGN"
}

# Timeouts
TIMEOUTS = {
    "navigation": 30000,
    "action": 10000,
    "assertion": 5000
}

# Selectors
SELECTORS = {
    "login": {
        "email_input": 'input[name="email"]',
        "password_input": 'input[name="password"]',
        "submit_button": 'button[type="submit"]',
        "error_message": '.error-message',
        "success_message": '.success-message'
    },
    "dashboard": {
        "welcome_message": '.welcome-message',
        "account_balance": '.account-balance',
        "transactions_list": '.transactions-list'
    },
    "transfer": {
        "from_account": 'select[name="from_account"]',
        "to_account": 'input[name="to_account"]',
        "amount": 'input[name="amount"]',
        "description": 'textarea[name="description"]',
        "submit_button": 'button[type="submit"]',
        "confirmation_modal": '.confirmation-modal',
        "success_message": '.success-message'
    }
}

# API endpoints
API_ENDPOINTS = {
    "login": f"{API_BASE_URL}/api/v1/auth/login",
    "register": f"{API_BASE_URL}/api/v1/auth/register",
    "transfer": f"{API_BASE_URL}/api/v1/transfers",
    "accounts": f"{API_BASE_URL}/api/v1/accounts",
    "transactions": f"{API_BASE_URL}/api/v1/transactions"
}
