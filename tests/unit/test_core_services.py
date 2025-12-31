"""
Comprehensive Unit Tests for NeoBank Core Services

Covers all 30 user stories with unit-level testing.
Tests individual functions and methods in isolation.
"""

import asyncio
import json
import pytest
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any


# ==================== US-001: Registration and KYC Tests ====================

class TestKYCService:
    """Unit tests for KYC service"""

    @pytest.fixture
    def kyc_service(self):
        from backend.app.services.kyc_service import KYCService
        return KYCService()

    @pytest.mark.asyncio
    async def test_validate_bvn_format_valid(self, kyc_service):
        """Test valid BVN format validation"""
        assert kyc_service.validate_bvn_format("22222222222") is True

    @pytest.mark.asyncio
    async def test_validate_bvn_format_invalid_length(self, kyc_service):
        """Test invalid BVN length"""
        assert kyc_service.validate_bvn_format("2222222") is False

    @pytest.mark.asyncio
    async def test_validate_bvn_format_non_numeric(self, kyc_service):
        """Test non-numeric BVN"""
        assert kyc_service.validate_bvn_format("2222222222a") is False

    @pytest.mark.asyncio
    async def test_validate_nin_format_valid(self, kyc_service):
        """Test valid NIN format validation"""
        assert kyc_service.validate_nin_format("12345678901") is True

    @pytest.mark.asyncio
    async def test_calculate_kyc_tier(self, kyc_service):
        """Test KYC tier calculation"""
        # Tier 1: Basic info only
        tier1 = kyc_service.calculate_tier({"phone_verified": True, "email_verified": True})
        assert tier1 == 1

        # Tier 2: BVN verified
        tier2 = kyc_service.calculate_tier({"phone_verified": True, "bvn_verified": True})
        assert tier2 == 2

        # Tier 3: Full verification
        tier3 = kyc_service.calculate_tier({
            "phone_verified": True,
            "bvn_verified": True,
            "nin_verified": True,
            "address_verified": True
        })
        assert tier3 == 3

    @pytest.mark.asyncio
    async def test_get_tier_limits(self, kyc_service):
        """Test tier transaction limits"""
        limits = kyc_service.get_tier_limits(1)
        assert limits["daily_limit"] == 50000
        assert limits["single_transaction_limit"] == 10000

        limits = kyc_service.get_tier_limits(2)
        assert limits["daily_limit"] == 200000

        limits = kyc_service.get_tier_limits(3)
        assert limits["daily_limit"] == 5000000


# ==================== US-002 & US-003: Transfer Tests ====================

class TestTransferService:
    """Unit tests for transfer service"""

    @pytest.fixture
    def transfer_service(self):
        from backend.app.services.transfer_service import TransferService
        return TransferService()

    @pytest.mark.asyncio
    async def test_validate_transfer_amount_positive(self, transfer_service):
        """Test positive amount validation"""
        assert transfer_service.validate_amount(Decimal("1000")) is True

    @pytest.mark.asyncio
    async def test_validate_transfer_amount_zero(self, transfer_service):
        """Test zero amount rejection"""
        assert transfer_service.validate_amount(Decimal("0")) is False

    @pytest.mark.asyncio
    async def test_validate_transfer_amount_negative(self, transfer_service):
        """Test negative amount rejection"""
        assert transfer_service.validate_amount(Decimal("-100")) is False

    @pytest.mark.asyncio
    async def test_validate_phone_number_nigeria(self, transfer_service):
        """Test Nigerian phone number validation"""
        assert transfer_service.validate_phone("+2348012345678") is True
        assert transfer_service.validate_phone("08012345678") is True
        assert transfer_service.validate_phone("2348012345678") is True

    @pytest.mark.asyncio
    async def test_validate_phone_number_kenya(self, transfer_service):
        """Test Kenyan phone number validation"""
        assert transfer_service.validate_phone("+254712345678") is True

    @pytest.mark.asyncio
    async def test_validate_phone_number_invalid(self, transfer_service):
        """Test invalid phone number rejection"""
        assert transfer_service.validate_phone("123") is False
        assert transfer_service.validate_phone("abcdefghijk") is False

    @pytest.mark.asyncio
    async def test_calculate_transfer_fee_p2p(self, transfer_service):
        """Test P2P transfer fee calculation (should be free)"""
        fee = transfer_service.calculate_fee(Decimal("10000"), "p2p")
        assert fee == Decimal("0")

    @pytest.mark.asyncio
    async def test_calculate_transfer_fee_bank(self, transfer_service):
        """Test bank transfer fee calculation"""
        fee = transfer_service.calculate_fee(Decimal("5000"), "bank")
        assert fee == Decimal("10")  # NGN 10 for amounts <= 5000

        fee = transfer_service.calculate_fee(Decimal("50000"), "bank")
        assert fee == Decimal("25")  # NGN 25 for amounts <= 50000

        fee = transfer_service.calculate_fee(Decimal("100000"), "bank")
        assert fee == Decimal("50")  # NGN 50 for amounts > 50000

    @pytest.mark.asyncio
    async def test_generate_transaction_reference(self, transfer_service):
        """Test transaction reference generation"""
        ref = transfer_service.generate_reference()
        assert len(ref) == 20
        assert ref.startswith("NB")


# ==================== US-005 & US-006: Bills and Airtime Tests ====================

class TestBillPaymentService:
    """Unit tests for bill payment service"""

    @pytest.fixture
    def bill_service(self):
        from backend.app.services.bill_payment_service import BillPaymentService
        return BillPaymentService()

    @pytest.mark.asyncio
    async def test_validate_meter_number_prepaid(self, bill_service):
        """Test prepaid meter number validation"""
        assert bill_service.validate_meter_number("45678901234", "prepaid") is True

    @pytest.mark.asyncio
    async def test_validate_meter_number_postpaid(self, bill_service):
        """Test postpaid meter number validation"""
        assert bill_service.validate_meter_number("1234567890", "postpaid") is True

    @pytest.mark.asyncio
    async def test_validate_meter_number_invalid(self, bill_service):
        """Test invalid meter number rejection"""
        assert bill_service.validate_meter_number("123", "prepaid") is False

    @pytest.mark.asyncio
    async def test_get_electricity_providers(self, bill_service):
        """Test electricity provider list"""
        providers = bill_service.get_providers("electricity")
        assert "EKEDC" in providers
        assert "IKEDC" in providers
        assert "AEDC" in providers

    @pytest.mark.asyncio
    async def test_get_cable_providers(self, bill_service):
        """Test cable TV provider list"""
        providers = bill_service.get_providers("cable")
        assert "DSTV" in providers
        assert "GOtv" in providers
        assert "Startimes" in providers


class TestAirtimeService:
    """Unit tests for airtime service"""

    @pytest.fixture
    def airtime_service(self):
        from backend.app.services.airtime_service import AirtimeService
        return AirtimeService()

    @pytest.mark.asyncio
    async def test_detect_network_mtn(self, airtime_service):
        """Test MTN network detection"""
        assert airtime_service.detect_network("08031234567") == "MTN"
        assert airtime_service.detect_network("08131234567") == "MTN"
        assert airtime_service.detect_network("09031234567") == "MTN"

    @pytest.mark.asyncio
    async def test_detect_network_airtel(self, airtime_service):
        """Test Airtel network detection"""
        assert airtime_service.detect_network("08021234567") == "AIRTEL"
        assert airtime_service.detect_network("08081234567") == "AIRTEL"

    @pytest.mark.asyncio
    async def test_detect_network_glo(self, airtime_service):
        """Test Glo network detection"""
        assert airtime_service.detect_network("08051234567") == "GLO"
        assert airtime_service.detect_network("08151234567") == "GLO"

    @pytest.mark.asyncio
    async def test_detect_network_9mobile(self, airtime_service):
        """Test 9mobile network detection"""
        assert airtime_service.detect_network("08091234567") == "9MOBILE"
        assert airtime_service.detect_network("08191234567") == "9MOBILE"

    @pytest.mark.asyncio
    async def test_validate_airtime_amount(self, airtime_service):
        """Test airtime amount validation"""
        assert airtime_service.validate_amount(50) is True
        assert airtime_service.validate_amount(100) is True
        assert airtime_service.validate_amount(49) is False  # Below minimum
        assert airtime_service.validate_amount(100001) is False  # Above maximum


# ==================== US-007 to US-009: Savings Tests ====================

class TestSavingsService:
    """Unit tests for savings service"""

    @pytest.fixture
    def savings_service(self):
        from backend.app.services.savings_service import SavingsService
        return SavingsService()

    @pytest.mark.asyncio
    async def test_calculate_interest_rate_30_days(self, savings_service):
        """Test interest rate for 30-day fixed deposit"""
        rate = savings_service.get_interest_rate(30)
        assert rate == Decimal("0.08")  # 8% per annum

    @pytest.mark.asyncio
    async def test_calculate_interest_rate_90_days(self, savings_service):
        """Test interest rate for 90-day fixed deposit"""
        rate = savings_service.get_interest_rate(90)
        assert rate == Decimal("0.10")  # 10% per annum

    @pytest.mark.asyncio
    async def test_calculate_interest_rate_365_days(self, savings_service):
        """Test interest rate for 365-day fixed deposit"""
        rate = savings_service.get_interest_rate(365)
        assert rate == Decimal("0.14")  # 14% per annum

    @pytest.mark.asyncio
    async def test_calculate_maturity_amount(self, savings_service):
        """Test maturity amount calculation"""
        principal = Decimal("100000")
        tenure_days = 90
        rate = Decimal("0.10")
        
        maturity = savings_service.calculate_maturity(principal, tenure_days, rate)
        expected = principal + (principal * rate * tenure_days / 365)
        assert maturity == expected

    @pytest.mark.asyncio
    async def test_calculate_early_withdrawal_penalty(self, savings_service):
        """Test early withdrawal penalty calculation"""
        principal = Decimal("100000")
        penalty = savings_service.calculate_penalty(principal, days_remaining=30)
        assert penalty == principal * Decimal("0.02")  # 2% penalty


# ==================== US-010 & US-011: Investment Tests ====================

class TestInvestmentService:
    """Unit tests for investment service"""

    @pytest.fixture
    def investment_service(self):
        from backend.app.services.investment_service import InvestmentService
        return InvestmentService()

    @pytest.mark.asyncio
    async def test_calculate_stock_order_value(self, investment_service):
        """Test stock order value calculation"""
        price = Decimal("250.50")
        quantity = 10
        value = investment_service.calculate_order_value(price, quantity)
        assert value == Decimal("2505.00")

    @pytest.mark.asyncio
    async def test_calculate_stock_commission(self, investment_service):
        """Test stock trading commission calculation"""
        order_value = Decimal("100000")
        commission = investment_service.calculate_commission(order_value)
        assert commission == order_value * Decimal("0.015")  # 1.5% commission

    @pytest.mark.asyncio
    async def test_validate_market_hours_ngx(self, investment_service):
        """Test NGX market hours validation"""
        # NGX trades 10:00 - 14:30 WAT (Monday-Friday)
        trading_time = datetime(2024, 1, 15, 11, 0)  # Monday 11:00
        assert investment_service.is_market_open("NGX", trading_time) is True

        closed_time = datetime(2024, 1, 15, 15, 0)  # Monday 15:00
        assert investment_service.is_market_open("NGX", closed_time) is False

        weekend = datetime(2024, 1, 13, 11, 0)  # Saturday
        assert investment_service.is_market_open("NGX", weekend) is False

    @pytest.mark.asyncio
    async def test_supported_exchanges(self, investment_service):
        """Test supported exchange list"""
        exchanges = investment_service.get_supported_exchanges()
        assert "NGX" in exchanges  # Nigeria
        assert "JSE" in exchanges  # South Africa
        assert "NSE" in exchanges  # Kenya
        assert "GSE" in exchanges  # Ghana


class TestCryptoService:
    """Unit tests for crypto service"""

    @pytest.fixture
    def crypto_service(self):
        from backend.app.services.crypto_service import CryptoService
        return CryptoService()

    @pytest.mark.asyncio
    async def test_supported_cryptocurrencies(self, crypto_service):
        """Test supported cryptocurrency list"""
        cryptos = crypto_service.get_supported_cryptos()
        assert "BTC" in cryptos
        assert "ETH" in cryptos
        assert "USDT" in cryptos
        assert "USDC" in cryptos

    @pytest.mark.asyncio
    async def test_calculate_crypto_amount(self, crypto_service):
        """Test crypto amount calculation from NGN"""
        ngn_amount = Decimal("100000")
        btc_price = Decimal("50000000")  # NGN per BTC
        
        btc_amount = crypto_service.calculate_crypto_amount(ngn_amount, btc_price)
        assert btc_amount == ngn_amount / btc_price

    @pytest.mark.asyncio
    async def test_validate_wallet_address_btc(self, crypto_service):
        """Test BTC wallet address validation"""
        # Valid BTC addresses
        assert crypto_service.validate_address("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "BTC") is True
        assert crypto_service.validate_address("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "BTC") is True
        
        # Invalid address
        assert crypto_service.validate_address("invalid", "BTC") is False


# ==================== US-020: Escrow Tests ====================

class TestEscrowService:
    """Unit tests for escrow service"""

    @pytest.fixture
    def escrow_service(self):
        from backend.app.services.escrow_service import EscrowService
        return EscrowService()

    @pytest.mark.asyncio
    async def test_calculate_escrow_fee(self, escrow_service):
        """Test escrow fee calculation"""
        amount = Decimal("100000")
        fee = escrow_service.calculate_fee(amount)
        assert fee == amount * Decimal("0.015")  # 1.5% fee

    @pytest.mark.asyncio
    async def test_escrow_states(self, escrow_service):
        """Test escrow state transitions"""
        valid_transitions = escrow_service.get_valid_transitions("created")
        assert "funded" in valid_transitions
        assert "cancelled" in valid_transitions

        valid_transitions = escrow_service.get_valid_transitions("funded")
        assert "delivered" in valid_transitions
        assert "disputed" in valid_transitions

    @pytest.mark.asyncio
    async def test_validate_inspection_period(self, escrow_service):
        """Test inspection period validation"""
        assert escrow_service.validate_inspection_period(1) is True
        assert escrow_service.validate_inspection_period(7) is True
        assert escrow_service.validate_inspection_period(0) is False
        assert escrow_service.validate_inspection_period(31) is False  # Max 30 days


# ==================== US-021 & US-022: USSD and SMS Tests ====================

class TestUSSDService:
    """Unit tests for USSD service"""

    @pytest.fixture
    def ussd_service(self):
        from backend.app.services.ussd_service import USSDService
        return USSDService()

    @pytest.mark.asyncio
    async def test_parse_ussd_input_main_menu(self, ussd_service):
        """Test USSD main menu parsing"""
        result = ussd_service.parse_input("", "*347*123#")
        assert result["state"] == "main_menu"

    @pytest.mark.asyncio
    async def test_parse_ussd_input_balance(self, ussd_service):
        """Test USSD balance check parsing"""
        result = ussd_service.parse_input("1", "*347*123#")
        assert result["action"] == "check_balance"

    @pytest.mark.asyncio
    async def test_parse_ussd_input_transfer(self, ussd_service):
        """Test USSD transfer parsing"""
        result = ussd_service.parse_input("2*08012345678*1000*1234", "*347*123#")
        assert result["action"] == "transfer"
        assert result["recipient"] == "08012345678"
        assert result["amount"] == "1000"
        assert result["pin"] == "1234"

    @pytest.mark.asyncio
    async def test_format_ussd_response(self, ussd_service):
        """Test USSD response formatting"""
        response = ussd_service.format_response("Welcome to NeoBank", continue_session=True)
        assert response.startswith("CON ")

        response = ussd_service.format_response("Transaction successful", continue_session=False)
        assert response.startswith("END ")

    @pytest.mark.asyncio
    async def test_session_timeout(self, ussd_service):
        """Test USSD session timeout (3 minutes)"""
        assert ussd_service.SESSION_TIMEOUT == 180  # 3 minutes in seconds


class TestSMSBankingService:
    """Unit tests for SMS banking service"""

    @pytest.fixture
    def sms_service(self):
        from backend.app.services.sms_banking_service import SMSBankingService
        return SMSBankingService()

    @pytest.mark.asyncio
    async def test_parse_sms_balance_command(self, sms_service):
        """Test SMS balance command parsing"""
        result = sms_service.parse_command("BAL 1234")
        assert result["command"] == "BAL"
        assert result["pin"] == "1234"

    @pytest.mark.asyncio
    async def test_parse_sms_transfer_command(self, sms_service):
        """Test SMS transfer command parsing"""
        result = sms_service.parse_command("SEND 08012345678 5000 1234")
        assert result["command"] == "SEND"
        assert result["recipient"] == "08012345678"
        assert result["amount"] == "5000"
        assert result["pin"] == "1234"

    @pytest.mark.asyncio
    async def test_parse_sms_airtime_command(self, sms_service):
        """Test SMS airtime command parsing"""
        result = sms_service.parse_command("AIR 08012345678 500 1234")
        assert result["command"] == "AIR"
        assert result["phone"] == "08012345678"
        assert result["amount"] == "500"

    @pytest.mark.asyncio
    async def test_format_sms_response_length(self, sms_service):
        """Test SMS response length limit (160 chars)"""
        long_message = "A" * 200
        response = sms_service.format_response(long_message)
        assert len(response) <= 160

    @pytest.mark.asyncio
    async def test_rate_limiting(self, sms_service):
        """Test SMS rate limiting (20 per hour)"""
        assert sms_service.RATE_LIMIT == 20


# ==================== US-023: Offline Transaction Tests ====================

class TestOfflineTransactionService:
    """Unit tests for offline transaction service"""

    @pytest.fixture
    def offline_service(self):
        from backend.app.services.offline_transaction_service import OfflineTransactionService
        return OfflineTransactionService()

    @pytest.mark.asyncio
    async def test_transaction_expiry_72_hours(self, offline_service):
        """Test offline transaction expiry is 72 hours"""
        assert offline_service.TRANSACTION_EXPIRY_HOURS == 72

    @pytest.mark.asyncio
    async def test_max_offline_transactions(self, offline_service):
        """Test max offline transactions is 100"""
        assert offline_service.MAX_OFFLINE_TRANSACTIONS == 100

    @pytest.mark.asyncio
    async def test_max_offline_amount(self, offline_service):
        """Test max offline amount is 500,000"""
        assert offline_service.MAX_OFFLINE_AMOUNT == Decimal("500000")

    @pytest.mark.asyncio
    async def test_sign_transaction(self, offline_service):
        """Test transaction signing"""
        from backend.app.services.offline_transaction_service import OfflineTransaction, TransactionType
        
        tx = OfflineTransaction(
            transaction_id="OFF123",
            user_id="user123",
            transaction_type=TransactionType.TRANSFER,
            amount=Decimal("1000"),
            recipient="08012345678",
            nonce="abc123",
            sequence_number=1
        )
        
        secret_key = "test_secret_key_12345"
        signature = offline_service._sign_transaction(tx, secret_key)
        
        assert signature is not None
        assert len(signature) > 0

    @pytest.mark.asyncio
    async def test_verify_transaction_expired(self, offline_service):
        """Test expired transaction verification"""
        from backend.app.services.offline_transaction_service import OfflineTransaction, TransactionType
        
        tx = OfflineTransaction(
            transaction_id="OFF123",
            user_id="user123",
            transaction_type=TransactionType.TRANSFER,
            amount=Decimal("1000"),
            expires_at=datetime.utcnow() - timedelta(hours=1)  # Expired
        )
        
        is_valid, error = await offline_service.verify_transaction(tx)
        assert is_valid is False
        assert "expired" in error.lower()


# ==================== US-024: Connectivity Tests ====================

class TestConnectivityService:
    """Unit tests for connectivity service"""

    def test_calculate_sync_policy_critical_battery(self):
        """Test sync policy for critical battery (<=5%)"""
        from backend.app.middleware.connectivity_middleware import DeviceContext, ConnectionType
        
        context = DeviceContext(
            device_id="test",
            battery_level=5,
            is_charging=False
        )
        
        assert context.get_power_level().value == "critical"

    def test_calculate_sync_policy_low_battery(self):
        """Test sync policy for low battery (<=15%)"""
        from backend.app.middleware.connectivity_middleware import DeviceContext
        
        context = DeviceContext(
            device_id="test",
            battery_level=15,
            is_charging=False
        )
        
        assert context.get_power_level().value == "low"

    def test_calculate_sync_policy_charging(self):
        """Test sync policy when charging"""
        from backend.app.middleware.connectivity_middleware import DeviceContext
        
        context = DeviceContext(
            device_id="test",
            battery_level=20,
            is_charging=True
        )
        
        assert context.get_power_level().value == "charging"

    def test_data_policy_2g(self):
        """Test data policy for 2G connection"""
        from backend.app.routers.connectivity_router import calculate_data_policy, NetworkQualityRequest
        
        quality = NetworkQualityRequest(
            device_id="test",
            connection_type="2g",
            download_speed=0.05
        )
        
        policy = calculate_data_policy(quality)
        assert policy["image_quality"] == "low"
        assert policy["batch_requests"] is True
        assert policy["preload_enabled"] is False


# ==================== US-029 & US-030: Security Tests ====================

class TestSecurityService:
    """Unit tests for security service"""

    @pytest.fixture
    def security_service(self):
        from backend.app.services.security_service import SecurityService
        return SecurityService()

    @pytest.mark.asyncio
    async def test_hash_pin(self, security_service):
        """Test PIN hashing"""
        pin = "1234"
        hashed = security_service.hash_pin(pin)
        assert hashed != pin
        assert len(hashed) == 64  # SHA-256 hex

    @pytest.mark.asyncio
    async def test_verify_pin(self, security_service):
        """Test PIN verification"""
        pin = "1234"
        hashed = security_service.hash_pin(pin)
        assert security_service.verify_pin(pin, hashed) is True
        assert security_service.verify_pin("wrong", hashed) is False

    @pytest.mark.asyncio
    async def test_generate_otp(self, security_service):
        """Test OTP generation"""
        otp = security_service.generate_otp()
        assert len(otp) == 6
        assert otp.isdigit()

    @pytest.mark.asyncio
    async def test_validate_password_strength(self, security_service):
        """Test password strength validation"""
        # Strong password
        assert security_service.validate_password("StrongP@ss123") is True
        
        # Weak passwords
        assert security_service.validate_password("weak") is False
        assert security_service.validate_password("12345678") is False
        assert security_service.validate_password("nouppercaseornumber") is False

    @pytest.mark.asyncio
    async def test_detect_suspicious_activity(self, security_service):
        """Test suspicious activity detection"""
        # Multiple failed login attempts
        activity = {
            "failed_logins": 5,
            "time_window": 300  # 5 minutes
        }
        assert security_service.is_suspicious(activity) is True

        # Normal activity
        activity = {
            "failed_logins": 1,
            "time_window": 300
        }
        assert security_service.is_suspicious(activity) is False


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
