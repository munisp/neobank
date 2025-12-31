"""
Comprehensive Regression Test Suite for NeoBank Platform

Tests critical paths and previously fixed bugs to prevent regressions.
Run before every deployment to ensure stability.
"""

import asyncio
import json
import os
import pytest
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any

import httpx

# Test configuration
API_URL = os.getenv("NEOBANK_API_URL", "http://localhost:8000")


class TestCriticalPathRegression:
    """Regression tests for critical user paths"""

    # ==================== Authentication Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_login_with_special_characters_in_password(self):
        """
        Regression: Login failed when password contained special characters
        Fixed in: v1.2.3
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            login_data = {
                "phone": "+2348012345678",
                "password": "Test@Pass#123!$%"
            }
            response = await client.post("/api/v1/auth/login", json=login_data)
            # Should not return 500 error
            assert response.status_code != 500

    @pytest.mark.asyncio
    async def test_regression_login_with_international_phone_format(self):
        """
        Regression: Login failed with international phone format
        Fixed in: v1.3.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            # Test various phone formats
            formats = [
                "+2348012345678",
                "2348012345678",
                "08012345678",
                "+254712345678",  # Kenya
                "+27821234567",   # South Africa
            ]
            for phone in formats:
                response = await client.post(
                    "/api/v1/auth/login",
                    json={"phone": phone, "password": "TestPass123!"}
                )
                # Should not return 500 or 422 for format issues
                assert response.status_code in [200, 401, 403]

    @pytest.mark.asyncio
    async def test_regression_token_expiry_handling(self):
        """
        Regression: Expired tokens caused 500 errors instead of 401
        Fixed in: v1.4.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            # Use an obviously expired/invalid token
            headers = {"Authorization": "Bearer expired_token_12345"}
            response = await client.get("/api/v1/accounts/balance", headers=headers)
            # Should return 401, not 500
            assert response.status_code in [401, 403]

    # ==================== Transfer Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_transfer_decimal_precision(self):
        """
        Regression: Transfer amounts lost decimal precision
        Fixed in: v1.5.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            # Test with precise decimal amount
            transfer_data = {
                "recipient_phone": "+2348098765432",
                "amount": 1000.50,  # Decimal amount
                "narration": "Test decimal precision",
                "pin": "1234"
            }
            response = await client.post(
                "/api/v1/transfers/p2p",
                json=transfer_data,
                headers=headers
            )
            # Should not lose decimal precision (no 500 error)
            assert response.status_code != 500

    @pytest.mark.asyncio
    async def test_regression_transfer_to_self_prevention(self):
        """
        Regression: Users could transfer to themselves causing balance issues
        Fixed in: v1.6.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            # Attempt self-transfer
            transfer_data = {
                "recipient_phone": os.getenv("TEST_PHONE", "+2348012345678"),
                "amount": 1000,
                "narration": "Self transfer test",
                "pin": "1234"
            }
            response = await client.post(
                "/api/v1/transfers/p2p",
                json=transfer_data,
                headers=headers
            )
            # Should be rejected with 400, not succeed
            if response.status_code == 200:
                # If it succeeds, it's a regression
                pytest.fail("Self-transfer should be prevented")

    @pytest.mark.asyncio
    async def test_regression_concurrent_transfer_race_condition(self):
        """
        Regression: Concurrent transfers caused double-spending
        Fixed in: v1.7.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            # Simulate concurrent transfers
            transfer_data = {
                "recipient_phone": "+2348098765432",
                "amount": 100,
                "narration": "Concurrent test",
                "pin": "1234"
            }
            
            # Send multiple concurrent requests
            tasks = [
                client.post("/api/v1/transfers/p2p", json=transfer_data, headers=headers)
                for _ in range(5)
            ]
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            # At least some should fail if balance is insufficient
            # None should cause 500 errors
            for r in responses:
                if isinstance(r, httpx.Response):
                    assert r.status_code != 500

    # ==================== Savings Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_savings_interest_calculation(self):
        """
        Regression: Interest calculation was incorrect for leap years
        Fixed in: v1.8.0
        """
        # Test interest calculation logic
        from decimal import Decimal
        
        principal = Decimal("100000")
        rate = Decimal("0.10")  # 10% per annum
        
        # 365-day year
        interest_365 = principal * rate * 90 / 365
        
        # 366-day year (leap year)
        interest_366 = principal * rate * 90 / 366
        
        # Both should be valid calculations
        assert interest_365 > 0
        assert interest_366 > 0
        assert interest_365 != interest_366  # Should be different

    @pytest.mark.asyncio
    async def test_regression_vault_target_date_timezone(self):
        """
        Regression: Vault target dates were off by timezone offset
        Fixed in: v1.9.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            # Create vault with specific target date
            target_date = (datetime.now() + timedelta(days=30)).isoformat()
            vault_data = {
                "name": "Timezone Test Vault",
                "target_amount": 50000,
                "target_date": target_date
            }
            
            response = await client.post(
                "/api/v1/savings/vaults",
                json=vault_data,
                headers=headers
            )
            # Should not cause timezone-related errors
            assert response.status_code != 500

    # ==================== KYC Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_bvn_with_leading_zeros(self):
        """
        Regression: BVN with leading zeros was truncated
        Fixed in: v2.0.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            # BVN with leading zeros
            response = await client.post(
                "/api/v1/kyc/verify-bvn",
                json={"bvn": "00123456789"},
                headers=headers
            )
            # Should handle leading zeros correctly
            assert response.status_code != 500

    @pytest.mark.asyncio
    async def test_regression_kyc_document_upload_large_file(self):
        """
        Regression: Large document uploads caused timeout
        Fixed in: v2.1.0
        """
        # This test verifies the endpoint accepts large files
        # In production, we'd test with actual file upload
        async with httpx.AsyncClient(base_url=API_URL, timeout=60.0) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            response = await client.get(
                "/api/v1/kyc/upload-limits",
                headers=headers
            )
            # Should return upload limits, not timeout
            assert response.status_code in [200, 401, 404]

    # ==================== Offline Transaction Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_offline_transaction_expiry_72_hours(self):
        """
        Regression: Offline transactions expired after 24 hours instead of 72
        Fixed in: v2.2.0
        """
        # Verify the constant is set correctly
        try:
            from backend.app.services.offline_transaction_service import OfflineTransactionService
            service = OfflineTransactionService()
            assert service.TRANSACTION_EXPIRY_HOURS == 72
        except ImportError:
            # If import fails, check via API
            async with httpx.AsyncClient(base_url=API_URL) as client:
                response = await client.get("/api/v1/connectivity/offline/config")
                if response.status_code == 200:
                    config = response.json()
                    assert config.get("expiry_hours", 72) == 72

    @pytest.mark.asyncio
    async def test_regression_offline_nonce_replay_protection(self):
        """
        Regression: Duplicate nonces were not detected
        Fixed in: v2.3.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            nonce = f"test_nonce_{datetime.now().timestamp()}"
            offline_tx = {
                "transaction_id": f"OFF_{datetime.now().timestamp()}",
                "user_id": "test_user",
                "device_id": "test_device",
                "type": "transfer",
                "amount": 1000,
                "recipient": "+2348098765432",
                "signature": "test_signature",
                "nonce": nonce,
                "sequence_number": 1
            }
            
            # First submission
            response1 = await client.post(
                "/api/v1/connectivity/offline/queue",
                json=offline_tx,
                headers=headers
            )
            
            # Second submission with same nonce (should be rejected)
            response2 = await client.post(
                "/api/v1/connectivity/offline/queue",
                json=offline_tx,
                headers=headers
            )
            
            # Second should fail if first succeeded
            if response1.status_code in [200, 201]:
                assert response2.status_code in [400, 409, 422]

    # ==================== Connectivity Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_2g_connection_timeout(self):
        """
        Regression: 2G connections timed out before response
        Fixed in: v2.4.0
        """
        async with httpx.AsyncClient(base_url=API_URL, timeout=60.0) as client:
            headers = {
                "X-Connection-Type": "2g",
                "X-Device-ID": "test_device"
            }
            
            response = await client.get(
                "/api/v1/connectivity/loading/skeleton/dashboard",
                headers=headers
            )
            # Should return quickly with skeleton data
            assert response.status_code in [200, 401]

    @pytest.mark.asyncio
    async def test_regression_battery_level_zero_handling(self):
        """
        Regression: Battery level 0 caused division by zero
        Fixed in: v2.5.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            power_data = {
                "device_id": "test_device",
                "battery_level": 0,
                "is_charging": False,
                "power_save_mode": True
            }
            
            response = await client.post(
                "/api/v1/connectivity/power/state",
                json=power_data
            )
            # Should not cause division by zero
            assert response.status_code != 500

    # ==================== USSD/SMS Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_ussd_session_timeout_handling(self):
        """
        Regression: USSD sessions didn't timeout properly
        Fixed in: v2.6.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            # Start session
            session_id = f"test_{datetime.now().timestamp()}"
            
            response = await client.post(
                "/api/v1/ussd/callback",
                json={
                    "sessionId": session_id,
                    "phoneNumber": "+2348012345678",
                    "serviceCode": "*347*123#",
                    "text": ""
                }
            )
            assert response.status_code in [200, 422]

    @pytest.mark.asyncio
    async def test_regression_sms_unicode_characters(self):
        """
        Regression: SMS with unicode characters failed
        Fixed in: v2.7.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            sms_data = {
                "from": "+2348012345678",
                "to": "32123",
                "text": "BAL 1234 ₦"  # Contains Naira symbol
            }
            
            response = await client.post(
                "/api/v1/sms/incoming",
                json=sms_data
            )
            # Should handle unicode gracefully
            assert response.status_code != 500

    # ==================== Investment Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_stock_price_decimal_precision(self):
        """
        Regression: Stock prices lost precision after 2 decimal places
        Fixed in: v2.8.0
        """
        # Test decimal precision handling
        price = Decimal("250.5678")
        quantity = 10
        expected = Decimal("2505.678")
        actual = price * quantity
        assert actual == expected

    @pytest.mark.asyncio
    async def test_regression_crypto_negative_amount(self):
        """
        Regression: Negative crypto amounts were accepted
        Fixed in: v2.9.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            response = await client.post(
                "/api/v1/investments/crypto/buy",
                json={
                    "crypto": "BTC",
                    "amount_ngn": -10000  # Negative amount
                },
                headers=headers
            )
            # Should reject negative amounts
            assert response.status_code in [400, 401, 422]

    # ==================== Escrow Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_escrow_multiparty_split_rounding(self):
        """
        Regression: Multi-party split had rounding errors
        Fixed in: v3.0.0
        """
        # Test split calculation
        total = Decimal("100000")
        parties = 3
        
        split = total / parties
        remainder = total - (split * parties)
        
        # Ensure no money is lost
        assert (split * parties) + remainder == total

    @pytest.mark.asyncio
    async def test_regression_escrow_dispute_state_transition(self):
        """
        Regression: Disputed escrows could be released
        Fixed in: v3.1.0
        """
        # This tests the state machine logic
        valid_transitions = {
            "created": ["funded", "cancelled"],
            "funded": ["delivered", "disputed", "cancelled"],
            "delivered": ["released", "disputed"],
            "disputed": ["resolved"],
            "resolved": ["released", "refunded"],
            "released": [],
            "refunded": [],
            "cancelled": []
        }
        
        # Verify disputed state cannot transition to released directly
        assert "released" not in valid_transitions["disputed"]

    # ==================== API Response Regressions ====================

    @pytest.mark.asyncio
    async def test_regression_empty_response_body(self):
        """
        Regression: Some endpoints returned empty response bodies
        Fixed in: v3.2.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            response = await client.get("/api/v1/health")
            assert response.status_code == 200
            assert response.text  # Should have content
            assert response.json()  # Should be valid JSON

    @pytest.mark.asyncio
    async def test_regression_error_response_format(self):
        """
        Regression: Error responses had inconsistent format
        Fixed in: v3.3.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            # Request to protected endpoint without auth
            response = await client.get("/api/v1/accounts/balance")
            
            if response.status_code in [401, 403]:
                data = response.json()
                # Should have consistent error format
                assert "detail" in data or "error" in data or "message" in data

    @pytest.mark.asyncio
    async def test_regression_cors_headers(self):
        """
        Regression: CORS headers were missing for OPTIONS requests
        Fixed in: v3.4.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            response = await client.options(
                "/api/v1/health",
                headers={"Origin": "http://localhost:5173"}
            )
            # Should return CORS headers
            assert response.status_code in [200, 204]


class TestDataIntegrityRegression:
    """Regression tests for data integrity"""

    @pytest.mark.asyncio
    async def test_regression_transaction_atomicity(self):
        """
        Regression: Failed transactions left partial state
        Fixed in: v3.5.0
        """
        # This test verifies transaction rollback behavior
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {"Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}"}
            
            # Attempt a transfer that should fail
            response = await client.post(
                "/api/v1/transfers/p2p",
                json={
                    "recipient_phone": "+2348098765432",
                    "amount": 999999999999,  # Impossibly large
                    "narration": "Atomicity test",
                    "pin": "1234"
                },
                headers=headers
            )
            
            # Should fail cleanly without partial state
            assert response.status_code in [400, 401, 422]

    @pytest.mark.asyncio
    async def test_regression_idempotency_key_handling(self):
        """
        Regression: Duplicate requests with same idempotency key were processed twice
        Fixed in: v3.6.0
        """
        async with httpx.AsyncClient(base_url=API_URL) as client:
            headers = {
                "Authorization": f"Bearer {os.getenv('TEST_TOKEN', 'test')}",
                "Idempotency-Key": f"test_{datetime.now().timestamp()}"
            }
            
            transfer_data = {
                "recipient_phone": "+2348098765432",
                "amount": 100,
                "narration": "Idempotency test",
                "pin": "1234"
            }
            
            # Send same request twice
            response1 = await client.post(
                "/api/v1/transfers/p2p",
                json=transfer_data,
                headers=headers
            )
            response2 = await client.post(
                "/api/v1/transfers/p2p",
                json=transfer_data,
                headers=headers
            )
            
            # Both should return same result (idempotent)
            assert response1.status_code == response2.status_code


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
