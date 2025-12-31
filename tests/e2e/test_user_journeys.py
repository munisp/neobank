"""
Comprehensive E2E User Journey Tests for NeoBank Platform

Covers all 30 user stories with automated testing using Playwright.
Tests are designed to run against staging/production environments.
"""

import asyncio
import json
import os
import random
import string
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import pytest
from playwright.async_api import Page, expect, async_playwright

# Test configuration
BASE_URL = os.getenv("NEOBANK_BASE_URL", "http://localhost:5173")
API_URL = os.getenv("NEOBANK_API_URL", "http://localhost:8000")
TEST_PHONE = os.getenv("TEST_PHONE", "+2348012345678")
TEST_PIN = os.getenv("TEST_PIN", "1234")
TEST_BVN = os.getenv("TEST_BVN", "22222222222")


def generate_random_string(length: int = 8) -> str:
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


def generate_test_phone() -> str:
    return f"+234801{random.randint(1000000, 9999999)}"


class TestUserJourneys:
    """E2E tests for all 30 user journeys"""

    # ==================== Core Banking (US-001 to US-006) ====================

    @pytest.mark.asyncio
    async def test_us001_new_user_registration_and_kyc(self, page: Page):
        """US-001: New User Registration and KYC"""
        # Navigate to registration page
        await page.goto(f"{BASE_URL}/register")
        
        # Fill registration form
        test_phone = generate_test_phone()
        await page.fill('[data-testid="phone-input"]', test_phone)
        await page.fill('[data-testid="email-input"]', f"test_{generate_random_string()}@test.com")
        await page.fill('[data-testid="password-input"]', "TestPassword123!")
        await page.fill('[data-testid="confirm-password-input"]', "TestPassword123!")
        
        # Submit registration
        await page.click('[data-testid="register-button"]')
        
        # Wait for OTP screen
        await expect(page.locator('[data-testid="otp-input"]')).to_be_visible(timeout=10000)
        
        # Enter OTP (test environment uses 123456)
        await page.fill('[data-testid="otp-input"]', "123456")
        await page.click('[data-testid="verify-otp-button"]')
        
        # Wait for KYC screen
        await expect(page.locator('[data-testid="kyc-bvn-input"]')).to_be_visible(timeout=10000)
        
        # Enter BVN
        await page.fill('[data-testid="kyc-bvn-input"]', TEST_BVN)
        await page.click('[data-testid="verify-bvn-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="kyc-success"]')).to_be_visible(timeout=30000)

    @pytest.mark.asyncio
    async def test_us002_fund_account_via_bank_transfer(self, page: Page):
        """US-002: Fund Account via Bank Transfer"""
        await self._login(page)
        
        # Navigate to fund account
        await page.click('[data-testid="fund-account-button"]')
        
        # Select bank transfer
        await page.click('[data-testid="bank-transfer-option"]')
        
        # Verify virtual account details displayed
        await expect(page.locator('[data-testid="virtual-account-number"]')).to_be_visible()
        await expect(page.locator('[data-testid="virtual-account-bank"]')).to_be_visible()
        
        # Copy account number
        account_number = await page.locator('[data-testid="virtual-account-number"]').text_content()
        assert len(account_number) == 10

    @pytest.mark.asyncio
    async def test_us003_peer_to_peer_transfer(self, page: Page):
        """US-003: Peer-to-Peer Transfer"""
        await self._login(page)
        
        # Navigate to transfer
        await page.click('[data-testid="transfer-button"]')
        
        # Select P2P transfer
        await page.click('[data-testid="p2p-transfer-option"]')
        
        # Enter recipient phone
        await page.fill('[data-testid="recipient-phone"]', "+2348098765432")
        
        # Wait for recipient name verification
        await expect(page.locator('[data-testid="recipient-name"]')).to_be_visible(timeout=5000)
        
        # Enter amount
        await page.fill('[data-testid="amount-input"]', "1000")
        
        # Enter narration
        await page.fill('[data-testid="narration-input"]', "Test transfer")
        
        # Click continue
        await page.click('[data-testid="continue-button"]')
        
        # Enter PIN
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-transfer-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="transfer-success"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us004_bank_transfer_to_external_account(self, page: Page):
        """US-004: Bank Transfer to External Account"""
        await self._login(page)
        
        # Navigate to transfer
        await page.click('[data-testid="transfer-button"]')
        
        # Select bank transfer
        await page.click('[data-testid="bank-transfer-option"]')
        
        # Select bank
        await page.click('[data-testid="bank-select"]')
        await page.click('[data-testid="bank-option-gtbank"]')
        
        # Enter account number
        await page.fill('[data-testid="account-number-input"]', "0123456789")
        
        # Wait for account name verification
        await expect(page.locator('[data-testid="account-name"]')).to_be_visible(timeout=10000)
        
        # Enter amount
        await page.fill('[data-testid="amount-input"]', "5000")
        
        # Verify fee displayed
        await expect(page.locator('[data-testid="transfer-fee"]')).to_be_visible()
        
        # Continue and confirm
        await page.click('[data-testid="continue-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-transfer-button"]')
        
        # Wait for success or pending
        await expect(page.locator('[data-testid="transfer-success"], [data-testid="transfer-pending"]')).to_be_visible(timeout=15000)

    @pytest.mark.asyncio
    async def test_us005_bill_payment(self, page: Page):
        """US-005: Bill Payment"""
        await self._login(page)
        
        # Navigate to bills
        await page.click('[data-testid="bills-tab"]')
        
        # Select electricity
        await page.click('[data-testid="electricity-category"]')
        
        # Select provider
        await page.click('[data-testid="provider-ekedc"]')
        
        # Enter meter number
        await page.fill('[data-testid="meter-number-input"]', "45678901234")
        
        # Verify meter details
        await expect(page.locator('[data-testid="meter-name"]')).to_be_visible(timeout=10000)
        
        # Enter amount
        await page.fill('[data-testid="amount-input"]', "5000")
        
        # Continue and confirm
        await page.click('[data-testid="continue-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-payment-button"]')
        
        # Wait for token
        await expect(page.locator('[data-testid="electricity-token"]')).to_be_visible(timeout=30000)

    @pytest.mark.asyncio
    async def test_us006_airtime_and_data_purchase(self, page: Page):
        """US-006: Airtime and Data Purchase"""
        await self._login(page)
        
        # Navigate to airtime
        await page.click('[data-testid="airtime-tab"]')
        
        # Select MTN
        await page.click('[data-testid="network-mtn"]')
        
        # Enter phone number
        await page.fill('[data-testid="phone-input"]', TEST_PHONE)
        
        # Enter amount
        await page.fill('[data-testid="amount-input"]', "500")
        
        # Continue and confirm
        await page.click('[data-testid="continue-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="airtime-success"]')).to_be_visible(timeout=10000)

    # ==================== Savings and Investments (US-007 to US-012) ====================

    @pytest.mark.asyncio
    async def test_us007_create_savings_vault(self, page: Page):
        """US-007: Create Savings Vault"""
        await self._login(page)
        
        # Navigate to savings
        await page.click('[data-testid="savings-tab"]')
        
        # Create new vault
        await page.click('[data-testid="create-vault-button"]')
        
        # Fill vault details
        await page.fill('[data-testid="vault-name-input"]', "Emergency Fund")
        await page.fill('[data-testid="target-amount-input"]', "100000")
        await page.fill('[data-testid="target-date-input"]', (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d"))
        
        # Enable auto-debit
        await page.click('[data-testid="auto-debit-toggle"]')
        await page.fill('[data-testid="auto-debit-amount"]', "10000")
        await page.click('[data-testid="auto-debit-frequency-monthly"]')
        
        # Create vault
        await page.click('[data-testid="create-vault-submit"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="vault-created-success"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us008_group_savings_ajo(self, page: Page):
        """US-008: Group Savings (Ajo/Esusu/Stokvel)"""
        await self._login(page)
        
        # Navigate to group savings
        await page.click('[data-testid="savings-tab"]')
        await page.click('[data-testid="group-savings-tab"]')
        
        # Create new group
        await page.click('[data-testid="create-group-button"]')
        
        # Fill group details
        await page.fill('[data-testid="group-name-input"]', f"Test Ajo {generate_random_string()}")
        await page.fill('[data-testid="contribution-amount"]', "5000")
        await page.click('[data-testid="frequency-weekly"]')
        await page.fill('[data-testid="max-members"]', "5")
        
        # Create group
        await page.click('[data-testid="create-group-submit"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="group-created-success"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us009_fixed_deposit(self, page: Page):
        """US-009: Fixed Deposit"""
        await self._login(page)
        
        # Navigate to fixed deposits
        await page.click('[data-testid="savings-tab"]')
        await page.click('[data-testid="fixed-deposit-tab"]')
        
        # Create new fixed deposit
        await page.click('[data-testid="create-fd-button"]')
        
        # Fill details
        await page.fill('[data-testid="fd-amount-input"]', "50000")
        await page.click('[data-testid="tenure-90-days"]')
        
        # Verify interest rate displayed
        await expect(page.locator('[data-testid="interest-rate"]')).to_be_visible()
        await expect(page.locator('[data-testid="maturity-amount"]')).to_be_visible()
        
        # Enable auto-rollover
        await page.click('[data-testid="auto-rollover-toggle"]')
        
        # Create FD
        await page.click('[data-testid="create-fd-submit"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="fd-created-success"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us010_stock_trading_african_exchanges(self, page: Page):
        """US-010: Stock Trading on African Exchanges"""
        await self._login(page)
        
        # Navigate to investments
        await page.click('[data-testid="investments-tab"]')
        await page.click('[data-testid="stocks-tab"]')
        
        # Select NGX exchange
        await page.click('[data-testid="exchange-ngx"]')
        
        # Search for stock
        await page.fill('[data-testid="stock-search"]', "DANGCEM")
        await page.click('[data-testid="stock-result-dangcem"]')
        
        # View stock details
        await expect(page.locator('[data-testid="stock-price"]')).to_be_visible()
        await expect(page.locator('[data-testid="stock-chart"]')).to_be_visible()
        
        # Buy stock
        await page.click('[data-testid="buy-stock-button"]')
        await page.fill('[data-testid="quantity-input"]', "10")
        
        # Verify total amount
        await expect(page.locator('[data-testid="total-amount"]')).to_be_visible()
        
        # Confirm purchase
        await page.click('[data-testid="confirm-buy-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="execute-order-button"]')
        
        # Wait for order confirmation
        await expect(page.locator('[data-testid="order-success"]')).to_be_visible(timeout=15000)

    @pytest.mark.asyncio
    async def test_us011_cryptocurrency_trading(self, page: Page):
        """US-011: Cryptocurrency Trading"""
        await self._login(page)
        
        # Navigate to crypto
        await page.click('[data-testid="investments-tab"]')
        await page.click('[data-testid="crypto-tab"]')
        
        # Select BTC
        await page.click('[data-testid="crypto-btc"]')
        
        # View price and chart
        await expect(page.locator('[data-testid="crypto-price"]')).to_be_visible()
        await expect(page.locator('[data-testid="crypto-chart"]')).to_be_visible()
        
        # Buy crypto
        await page.click('[data-testid="buy-crypto-button"]')
        await page.fill('[data-testid="amount-ngn-input"]', "10000")
        
        # Verify BTC amount
        await expect(page.locator('[data-testid="btc-amount"]')).to_be_visible()
        
        # Confirm purchase
        await page.click('[data-testid="confirm-buy-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="execute-buy-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="crypto-buy-success"]')).to_be_visible(timeout=15000)

    @pytest.mark.asyncio
    async def test_us012_buy_now_pay_later(self, page: Page):
        """US-012: Buy Now Pay Later (BNPL)"""
        await self._login(page)
        
        # Navigate to BNPL
        await page.click('[data-testid="bnpl-tab"]')
        
        # Check credit limit
        await expect(page.locator('[data-testid="bnpl-credit-limit"]')).to_be_visible()
        
        # Start new BNPL
        await page.click('[data-testid="new-bnpl-button"]')
        
        # Enter purchase details
        await page.fill('[data-testid="purchase-amount"]', "50000")
        await page.fill('[data-testid="merchant-name"]', "Test Merchant")
        
        # Select payment plan
        await page.click('[data-testid="plan-3-months"]')
        
        # Verify installment amount
        await expect(page.locator('[data-testid="monthly-payment"]')).to_be_visible()
        
        # Confirm BNPL
        await page.click('[data-testid="confirm-bnpl-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="activate-bnpl-button"]')
        
        # Wait for approval
        await expect(page.locator('[data-testid="bnpl-approved"]')).to_be_visible(timeout=15000)

    # ==================== Cards and Payments (US-013 to US-016) ====================

    @pytest.mark.asyncio
    async def test_us013_virtual_card_creation(self, page: Page):
        """US-013: Virtual Card Creation"""
        await self._login(page)
        
        # Navigate to cards
        await page.click('[data-testid="cards-tab"]')
        
        # Create virtual card
        await page.click('[data-testid="create-virtual-card-button"]')
        
        # Select card type
        await page.click('[data-testid="card-type-usd"]')
        
        # Set spending limit
        await page.fill('[data-testid="spending-limit-input"]', "100000")
        
        # Create card
        await page.click('[data-testid="create-card-submit"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for card creation
        await expect(page.locator('[data-testid="virtual-card-created"]')).to_be_visible(timeout=15000)
        
        # Verify card details displayed
        await expect(page.locator('[data-testid="card-number"]')).to_be_visible()
        await expect(page.locator('[data-testid="card-expiry"]')).to_be_visible()
        await expect(page.locator('[data-testid="card-cvv"]')).to_be_visible()

    @pytest.mark.asyncio
    async def test_us014_physical_card_request(self, page: Page):
        """US-014: Physical Card Request"""
        await self._login(page)
        
        # Navigate to cards
        await page.click('[data-testid="cards-tab"]')
        
        # Request physical card
        await page.click('[data-testid="request-physical-card-button"]')
        
        # Fill delivery address
        await page.fill('[data-testid="address-line1"]', "123 Test Street")
        await page.fill('[data-testid="city"]', "Lagos")
        await page.fill('[data-testid="state"]', "Lagos")
        await page.fill('[data-testid="postal-code"]', "100001")
        
        # Select card design
        await page.click('[data-testid="card-design-premium"]')
        
        # Confirm request
        await page.click('[data-testid="request-card-submit"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for confirmation
        await expect(page.locator('[data-testid="card-request-success"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us015_qr_code_payments(self, page: Page):
        """US-015: QR Code Payments"""
        await self._login(page)
        
        # Navigate to QR payments
        await page.click('[data-testid="qr-tab"]')
        
        # Generate receive QR
        await page.click('[data-testid="generate-qr-button"]')
        await page.fill('[data-testid="qr-amount-input"]', "5000")
        await page.click('[data-testid="generate-qr-submit"]')
        
        # Verify QR displayed
        await expect(page.locator('[data-testid="qr-code-image"]')).to_be_visible(timeout=5000)
        
        # Test scan QR (simulated)
        await page.click('[data-testid="scan-qr-button"]')
        await expect(page.locator('[data-testid="qr-scanner"]')).to_be_visible()

    @pytest.mark.asyncio
    async def test_us016_nfc_tap_to_pay(self, page: Page):
        """US-016: NFC/Tap to Pay"""
        await self._login(page)
        
        # Navigate to cards
        await page.click('[data-testid="cards-tab"]')
        
        # Select a card
        await page.click('[data-testid="card-item-0"]')
        
        # Enable NFC
        await page.click('[data-testid="enable-nfc-button"]')
        
        # Verify NFC enabled
        await expect(page.locator('[data-testid="nfc-enabled-badge"]')).to_be_visible(timeout=5000)

    # ==================== Insurance and Loans (US-017 to US-020) ====================

    @pytest.mark.asyncio
    async def test_us017_micro_insurance_purchase(self, page: Page):
        """US-017: Micro-Insurance Purchase"""
        await self._login(page)
        
        # Navigate to insurance
        await page.click('[data-testid="insurance-tab"]')
        
        # Select device insurance
        await page.click('[data-testid="device-insurance-option"]')
        
        # Fill device details
        await page.fill('[data-testid="device-type"]', "Smartphone")
        await page.fill('[data-testid="device-value"]', "200000")
        await page.fill('[data-testid="device-imei"]', "123456789012345")
        
        # Select coverage
        await page.click('[data-testid="coverage-comprehensive"]')
        
        # Verify premium
        await expect(page.locator('[data-testid="premium-amount"]')).to_be_visible()
        
        # Purchase insurance
        await page.click('[data-testid="purchase-insurance-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="insurance-purchased"]')).to_be_visible(timeout=15000)

    @pytest.mark.asyncio
    async def test_us018_personal_loan_application(self, page: Page):
        """US-018: Personal Loan Application"""
        await self._login(page)
        
        # Navigate to loans
        await page.click('[data-testid="loans-tab"]')
        
        # Apply for personal loan
        await page.click('[data-testid="apply-personal-loan-button"]')
        
        # Check loan offers
        await expect(page.locator('[data-testid="loan-offers"]')).to_be_visible(timeout=10000)
        
        # Select loan amount
        await page.fill('[data-testid="loan-amount-input"]', "100000")
        
        # Select tenure
        await page.click('[data-testid="tenure-6-months"]')
        
        # Verify monthly payment
        await expect(page.locator('[data-testid="monthly-payment"]')).to_be_visible()
        
        # Apply
        await page.click('[data-testid="apply-loan-button"]')
        
        # Accept terms
        await page.click('[data-testid="accept-terms-checkbox"]')
        await page.click('[data-testid="submit-application-button"]')
        
        # Wait for decision
        await expect(page.locator('[data-testid="loan-approved"], [data-testid="loan-pending"]')).to_be_visible(timeout=30000)

    @pytest.mark.asyncio
    async def test_us019_business_loan_application(self, page: Page):
        """US-019: Business Loan Application"""
        await self._login(page)
        
        # Navigate to business loans
        await page.click('[data-testid="loans-tab"]')
        await page.click('[data-testid="business-loans-tab"]')
        
        # Start application
        await page.click('[data-testid="apply-business-loan-button"]')
        
        # Fill business details
        await page.fill('[data-testid="business-name"]', "Test Business Ltd")
        await page.fill('[data-testid="rc-number"]', "RC123456")
        await page.fill('[data-testid="annual-revenue"]', "10000000")
        
        # Upload documents (simulated)
        await page.click('[data-testid="upload-cac-button"]')
        
        # Select loan amount
        await page.fill('[data-testid="loan-amount-input"]', "500000")
        
        # Submit application
        await page.click('[data-testid="submit-application-button"]')
        
        # Wait for submission confirmation
        await expect(page.locator('[data-testid="application-submitted"]')).to_be_visible(timeout=15000)

    @pytest.mark.asyncio
    async def test_us020_escrow_transaction(self, page: Page):
        """US-020: Escrow Transaction"""
        await self._login(page)
        
        # Navigate to escrow
        await page.click('[data-testid="escrow-tab"]')
        
        # Create new escrow
        await page.click('[data-testid="create-escrow-button"]')
        
        # Select escrow type
        await page.click('[data-testid="escrow-type-p2p"]')
        
        # Fill escrow details
        await page.fill('[data-testid="escrow-title"]', "Test P2P Transaction")
        await page.fill('[data-testid="escrow-amount"]', "50000")
        await page.fill('[data-testid="seller-phone"]', "+2348098765432")
        await page.fill('[data-testid="escrow-description"]', "Test item purchase")
        
        # Set terms
        await page.fill('[data-testid="inspection-period"]', "3")
        
        # Create escrow
        await page.click('[data-testid="create-escrow-submit"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for escrow creation
        await expect(page.locator('[data-testid="escrow-created"]')).to_be_visible(timeout=15000)

    # ==================== Offline and Low-Connectivity (US-021 to US-024) ====================

    @pytest.mark.asyncio
    async def test_us021_ussd_banking(self, page: Page):
        """US-021: USSD Banking - API simulation"""
        # USSD is tested via API, not UI
        import httpx
        
        async with httpx.AsyncClient() as client:
            # Simulate USSD session start
            response = await client.post(
                f"{API_URL}/api/v1/ussd/callback",
                json={
                    "sessionId": f"test_{generate_random_string()}",
                    "phoneNumber": TEST_PHONE,
                    "serviceCode": "*347*123#",
                    "text": ""
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert "Welcome to NeoBank" in data.get("response", "")
            
            # Simulate balance check (option 1)
            response = await client.post(
                f"{API_URL}/api/v1/ussd/callback",
                json={
                    "sessionId": f"test_{generate_random_string()}",
                    "phoneNumber": TEST_PHONE,
                    "serviceCode": "*347*123#",
                    "text": "1"
                }
            )
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_us022_sms_banking(self, page: Page):
        """US-022: SMS Banking - API simulation"""
        import httpx
        
        async with httpx.AsyncClient() as client:
            # Simulate SMS balance check
            response = await client.post(
                f"{API_URL}/api/v1/sms/incoming",
                json={
                    "from": TEST_PHONE,
                    "to": "32123",
                    "text": f"BAL {TEST_PIN}"
                }
            )
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_us023_offline_transaction_queue(self, page: Page):
        """US-023: Offline Transaction Queue"""
        await self._login(page)
        
        # Enable offline mode (simulated)
        await page.evaluate("window.navigator.onLine = false")
        
        # Navigate to transfer
        await page.click('[data-testid="transfer-button"]')
        
        # Create offline transfer
        await page.click('[data-testid="p2p-transfer-option"]')
        await page.fill('[data-testid="recipient-phone"]', "+2348098765432")
        await page.fill('[data-testid="amount-input"]', "1000")
        await page.fill('[data-testid="narration-input"]', "Offline transfer")
        
        # Submit (should queue)
        await page.click('[data-testid="continue-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-transfer-button"]')
        
        # Verify queued
        await expect(page.locator('[data-testid="transfer-queued"]')).to_be_visible(timeout=5000)
        
        # Re-enable online mode
        await page.evaluate("window.navigator.onLine = true")
        
        # Trigger sync
        await page.click('[data-testid="sync-button"]')
        
        # Wait for sync completion
        await expect(page.locator('[data-testid="sync-complete"]')).to_be_visible(timeout=30000)

    @pytest.mark.asyncio
    async def test_us024_data_saver_mode(self, page: Page):
        """US-024: Data Saver Mode"""
        await self._login(page)
        
        # Navigate to settings
        await page.click('[data-testid="settings-tab"]')
        
        # Enable data saver
        await page.click('[data-testid="data-saver-toggle"]')
        
        # Verify data saver enabled
        await expect(page.locator('[data-testid="data-saver-enabled"]')).to_be_visible()
        
        # Enable extreme saver
        await page.click('[data-testid="extreme-saver-toggle"]')
        
        # Verify extreme saver enabled
        await expect(page.locator('[data-testid="extreme-saver-enabled"]')).to_be_visible()
        
        # Verify reduced features
        await page.click('[data-testid="home-tab"]')
        await expect(page.locator('[data-testid="text-only-mode"]')).to_be_visible()

    # ==================== Account Management (US-025 to US-028) ====================

    @pytest.mark.asyncio
    async def test_us025_kids_account(self, page: Page):
        """US-025: Kids Account"""
        await self._login(page)
        
        # Navigate to accounts
        await page.click('[data-testid="accounts-tab"]')
        
        # Create kids account
        await page.click('[data-testid="create-kids-account-button"]')
        
        # Fill child details
        await page.fill('[data-testid="child-name"]', "Test Child")
        await page.fill('[data-testid="child-dob"]', "2015-01-01")
        
        # Set spending limit
        await page.fill('[data-testid="spending-limit"]', "5000")
        
        # Enable allowance
        await page.click('[data-testid="enable-allowance-toggle"]')
        await page.fill('[data-testid="allowance-amount"]', "2000")
        await page.click('[data-testid="allowance-frequency-weekly"]')
        
        # Create account
        await page.click('[data-testid="create-kids-account-submit"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="kids-account-created"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us026_joint_account(self, page: Page):
        """US-026: Joint Account"""
        await self._login(page)
        
        # Navigate to accounts
        await page.click('[data-testid="accounts-tab"]')
        
        # Create joint account
        await page.click('[data-testid="create-joint-account-button"]')
        
        # Invite co-owner
        await page.fill('[data-testid="co-owner-phone"]', "+2348098765432")
        
        # Set authorization type
        await page.click('[data-testid="dual-authorization-toggle"]')
        
        # Create account
        await page.click('[data-testid="create-joint-account-submit"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-button"]')
        
        # Wait for invitation sent
        await expect(page.locator('[data-testid="invitation-sent"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us027_business_account(self, page: Page):
        """US-027: Business Account"""
        await self._login(page)
        
        # Navigate to accounts
        await page.click('[data-testid="accounts-tab"]')
        
        # Create business account
        await page.click('[data-testid="create-business-account-button"]')
        
        # Fill business details
        await page.fill('[data-testid="business-name"]', "Test Business Ltd")
        await page.fill('[data-testid="rc-number"]', "RC123456")
        await page.fill('[data-testid="business-address"]', "123 Business Street, Lagos")
        
        # Upload CAC document (simulated)
        await page.click('[data-testid="upload-cac-button"]')
        
        # Submit for verification
        await page.click('[data-testid="submit-business-account"]')
        
        # Wait for submission
        await expect(page.locator('[data-testid="business-account-submitted"]')).to_be_visible(timeout=10000)

    @pytest.mark.asyncio
    async def test_us028_multi_currency_account(self, page: Page):
        """US-028: Multi-Currency Account"""
        await self._login(page)
        
        # Navigate to accounts
        await page.click('[data-testid="accounts-tab"]')
        
        # Create USD wallet
        await page.click('[data-testid="create-currency-wallet-button"]')
        await page.click('[data-testid="currency-usd"]')
        await page.click('[data-testid="create-wallet-submit"]')
        
        # Wait for wallet creation
        await expect(page.locator('[data-testid="wallet-created"]')).to_be_visible(timeout=10000)
        
        # Convert NGN to USD
        await page.click('[data-testid="convert-currency-button"]')
        await page.fill('[data-testid="convert-amount"]', "50000")
        await page.click('[data-testid="from-ngn"]')
        await page.click('[data-testid="to-usd"]')
        
        # Verify rate
        await expect(page.locator('[data-testid="exchange-rate"]')).to_be_visible()
        await expect(page.locator('[data-testid="converted-amount"]')).to_be_visible()
        
        # Confirm conversion
        await page.click('[data-testid="confirm-conversion-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="execute-conversion-button"]')
        
        # Wait for success
        await expect(page.locator('[data-testid="conversion-success"]')).to_be_visible(timeout=10000)

    # ==================== Security and Support (US-029 to US-030) ====================

    @pytest.mark.asyncio
    async def test_us029_biometric_authentication(self, page: Page):
        """US-029: Biometric Authentication"""
        await self._login(page)
        
        # Navigate to security settings
        await page.click('[data-testid="settings-tab"]')
        await page.click('[data-testid="security-settings"]')
        
        # Enable biometric
        await page.click('[data-testid="enable-biometric-toggle"]')
        
        # Verify PIN first
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="verify-pin-button"]')
        
        # Biometric enrollment (simulated)
        await expect(page.locator('[data-testid="biometric-prompt"]')).to_be_visible(timeout=5000)
        
        # Simulate successful enrollment
        await page.evaluate("window.dispatchEvent(new CustomEvent('biometric-success'))")
        
        # Verify biometric enabled
        await expect(page.locator('[data-testid="biometric-enabled"]')).to_be_visible(timeout=5000)

    @pytest.mark.asyncio
    async def test_us030_fraud_detection_and_blocking(self, page: Page):
        """US-030: Fraud Detection and Blocking"""
        await self._login(page)
        
        # Navigate to cards
        await page.click('[data-testid="cards-tab"]')
        
        # Select a card
        await page.click('[data-testid="card-item-0"]')
        
        # Block card
        await page.click('[data-testid="block-card-button"]')
        await page.click('[data-testid="confirm-block-button"]')
        
        # Verify card blocked
        await expect(page.locator('[data-testid="card-blocked"]')).to_be_visible(timeout=5000)
        
        # Unblock card
        await page.click('[data-testid="unblock-card-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-unblock-button"]')
        
        # Verify card unblocked
        await expect(page.locator('[data-testid="card-active"]')).to_be_visible(timeout=5000)
        
        # Test account freeze
        await page.click('[data-testid="settings-tab"]')
        await page.click('[data-testid="security-settings"]')
        await page.click('[data-testid="freeze-account-button"]')
        await page.fill('[data-testid="pin-input"]', TEST_PIN)
        await page.click('[data-testid="confirm-freeze-button"]')
        
        # Verify account frozen
        await expect(page.locator('[data-testid="account-frozen"]')).to_be_visible(timeout=5000)

    # ==================== Helper Methods ====================

    async def _login(self, page: Page):
        """Helper method to login"""
        await page.goto(f"{BASE_URL}/login")
        await page.fill('[data-testid="phone-input"]', TEST_PHONE)
        await page.fill('[data-testid="password-input"]', "TestPassword123!")
        await page.click('[data-testid="login-button"]')
        
        # Wait for dashboard
        await expect(page.locator('[data-testid="dashboard"]')).to_be_visible(timeout=15000)


# Pytest fixtures
@pytest.fixture
async def page():
    """Create a new browser page for each test"""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        yield page
        await browser.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
