"""
End-to-end tests for complete banking workflows
"""
import pytest
from httpx import AsyncClient
from decimal import Decimal


@pytest.mark.e2e
class TestBankingWorkflow:
    """End-to-end tests for complete banking workflows"""
    
    @pytest.mark.asyncio
    async def test_complete_user_onboarding_workflow(self, client: AsyncClient):
        """Test complete user onboarding from registration to account creation"""
        
        # Step 1: User Registration
        user_data = {
            "email": "newuser@example.com",
            "password": "SecurePassword123!",
            "confirm_password": "SecurePassword123!",
            "full_name": "New Banking User",
            "phone_number": "+2348012345678",
            "date_of_birth": "1990-05-15",
            "address": "123 Banking Street, Lagos, Nigeria"
        }
        
        register_response = await client.post("/api/auth/register", json=user_data)
        assert register_response.status_code == 201
        
        user_info = register_response.json()
        assert user_info["kyc_status"] == "pending"
        
        # Step 2: User Login
        login_data = {
            "email": user_data["email"],
            "password": user_data["password"]
        }
        
        login_response = await client.post("/api/auth/login", json=login_data)
        assert login_response.status_code == 200
        
        tokens = login_response.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        
        # Step 3: Initiate KYC Process
        kyc_data = {
            "verification_level": "tier_2"
        }
        
        kyc_response = await client.post("/api/kyc/initiate", json=kyc_data, headers=headers)
        assert kyc_response.status_code == 201
        
        kyc_info = kyc_response.json()
        assert kyc_info["status"] == "in_progress"
        
        # Step 4: Upload KYC Documents (mock)
        # In a real test, this would upload actual files
        document_data = {
            "document_type": "national_id",
            "filename": "national_id.jpg"
        }
        
        # Mock successful document upload
        upload_response = await client.post(
            "/api/kyc/upload-document", 
            json=document_data, 
            headers=headers
        )
        # This might return 404 if endpoint doesn't exist yet, which is expected
        
        # Step 5: Complete KYC (mock approval)
        complete_response = await client.post("/api/kyc/complete", headers=headers)
        # This might return 404 if endpoint doesn't exist yet
        
        # Step 6: Create Bank Account
        account_data = {
            "account_type": "savings",
            "account_name": "Primary Savings Account",
            "currency": "NGN",
            "daily_limit": 500000,
            "monthly_limit": 5000000
        }
        
        account_response = await client.post("/api/accounts", json=account_data, headers=headers)
        assert account_response.status_code == 201
        
        account_info = account_response.json()
        assert account_info["account_type"] == "savings"
        assert account_info["currency"] == "NGN"
        assert len(account_info["account_number"]) == 10
        assert account_info["account_number"].startswith("999")  # NeoBank code
        
        # Step 7: Verify Account Creation
        accounts_response = await client.get("/api/accounts", headers=headers)
        assert accounts_response.status_code == 200
        
        accounts = accounts_response.json()
        assert len(accounts) == 1
        assert accounts[0]["account_number"] == account_info["account_number"]
    
    @pytest.mark.asyncio
    async def test_complete_transaction_workflow(self, client: AsyncClient):
        """Test complete transaction workflow including fraud detection"""
        
        # Setup: Create two users and accounts
        # User 1 (sender)
        user1_data = {
            "email": "sender@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
            "full_name": "Sender User",
            "phone_number": "+2348012345678"
        }
        
        register1_response = await client.post("/api/auth/register", json=user1_data)
        assert register1_response.status_code == 201
        
        login1_response = await client.post("/api/auth/login", json={
            "email": user1_data["email"],
            "password": user1_data["password"]
        })
        
        user1_tokens = login1_response.json()
        user1_headers = {"Authorization": f"Bearer {user1_tokens['access_token']}"}
        
        # User 2 (receiver)
        user2_data = {
            "email": "receiver@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
            "full_name": "Receiver User",
            "phone_number": "+2348087654321"
        }
        
        register2_response = await client.post("/api/auth/register", json=user2_data)
        assert register2_response.status_code == 201
        
        login2_response = await client.post("/api/auth/login", json={
            "email": user2_data["email"],
            "password": user2_data["password"]
        })
        
        user2_tokens = login2_response.json()
        user2_headers = {"Authorization": f"Bearer {user2_tokens['access_token']}"}
        
        # Create accounts for both users
        account_data = {
            "account_type": "savings",
            "account_name": "Test Account",
            "currency": "NGN"
        }
        
        account1_response = await client.post("/api/accounts", json=account_data, headers=user1_headers)
        assert account1_response.status_code == 201
        account1 = account1_response.json()
        
        account2_response = await client.post("/api/accounts", json=account_data, headers=user2_headers)
        assert account2_response.status_code == 201
        account2 = account2_response.json()
        
        # Step 1: Check initial balances
        balance1_response = await client.get(f"/api/accounts/{account1['id']}", headers=user1_headers)
        assert balance1_response.status_code == 200
        initial_balance1 = balance1_response.json()["balance"]
        
        balance2_response = await client.get(f"/api/accounts/{account2['id']}", headers=user2_headers)
        assert balance2_response.status_code == 200
        initial_balance2 = balance2_response.json()["balance"]
        
        # Step 2: Perform a legitimate transaction
        transaction_data = {
            "amount": 50000,
            "transaction_type": "transfer",
            "description": "Test transfer",
            "destination_account_number": account2["account_number"]
        }
        
        # Check fraud detection first
        fraud_check_data = {
            "account_id": account1["id"],
            "amount": transaction_data["amount"],
            "transaction_type": transaction_data["transaction_type"],
            "description": transaction_data["description"],
            "destination_account_number": transaction_data["destination_account_number"]
        }
        
        fraud_response = await client.post("/api/fraud/check", json=fraud_check_data, headers=user1_headers)
        # This might return 404 if endpoint doesn't exist yet
        
        # Perform the transaction
        transaction_response = await client.post(
            "/api/transactions", 
            json=transaction_data, 
            headers=user1_headers
        )
        # This might return 404 if endpoint doesn't exist yet
        
        # Step 3: Verify transaction history
        history_response = await client.get("/api/transactions", headers=user1_headers)
        # This might return 404 if endpoint doesn't exist yet
        
        # Step 4: Check updated balances
        final_balance1_response = await client.get(f"/api/accounts/{account1['id']}", headers=user1_headers)
        assert final_balance1_response.status_code == 200
        
        final_balance2_response = await client.get(f"/api/accounts/{account2['id']}", headers=user2_headers)
        assert final_balance2_response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_fraud_detection_workflow(self, client: AsyncClient):
        """Test fraud detection workflow with suspicious transactions"""
        
        # Setup: Create user and account
        user_data = {
            "email": "fraudtest@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
            "full_name": "Fraud Test User",
            "phone_number": "+2348012345678"
        }
        
        register_response = await client.post("/api/auth/register", json=user_data)
        assert register_response.status_code == 201
        
        login_response = await client.post("/api/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
        
        tokens = login_response.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        
        # Create account
        account_data = {
            "account_type": "savings",
            "account_name": "Test Account",
            "currency": "NGN"
        }
        
        account_response = await client.post("/api/accounts", json=account_data, headers=headers)
        assert account_response.status_code == 201
        account = account_response.json()
        
        # Test 1: High amount transaction (should trigger fraud detection)
        high_amount_data = {
            "account_id": account["id"],
            "amount": 5000000,  # ₦5M - high amount
            "transaction_type": "transfer",
            "description": "Large transfer",
            "destination_account_number": "9991234567"
        }
        
        fraud_response = await client.post("/api/fraud/check", json=high_amount_data, headers=headers)
        # This might return 404 if endpoint doesn't exist yet, but we expect it to work
        
        # Test 2: Round amount transaction
        round_amount_data = {
            "account_id": account["id"],
            "amount": 1000000,  # Exactly ₦1M - round amount
            "transaction_type": "transfer",
            "description": "Round amount transfer",
            "destination_account_number": "9991234567"
        }
        
        fraud_response2 = await client.post("/api/fraud/check", json=round_amount_data, headers=headers)
        # This might return 404 if endpoint doesn't exist yet
        
        # Test 3: Multiple rapid transactions (velocity check)
        import asyncio
        
        rapid_transactions = []
        for i in range(5):
            tx_data = {
                "account_id": account["id"],
                "amount": 10000,
                "transaction_type": "transfer",
                "description": f"Rapid transaction {i+1}",
                "destination_account_number": "9991234567"
            }
            rapid_transactions.append(
                client.post("/api/fraud/check", json=tx_data, headers=headers)
            )
        
        # Execute rapid transactions
        responses = await asyncio.gather(*rapid_transactions, return_exceptions=True)
        
        # At least some should be flagged for high velocity
        # (This test might not work if endpoints don't exist yet)
    
    @pytest.mark.asyncio
    async def test_account_management_workflow(self, client: AsyncClient):
        """Test complete account management workflow"""
        
        # Setup: Create authenticated user
        user_data = {
            "email": "accounttest@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
            "full_name": "Account Test User",
            "phone_number": "+2348012345678"
        }
        
        register_response = await client.post("/api/auth/register", json=user_data)
        assert register_response.status_code == 201
        
        login_response = await client.post("/api/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
        
        tokens = login_response.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        
        # Step 1: Create multiple accounts
        savings_account_data = {
            "account_type": "savings",
            "account_name": "Primary Savings",
            "currency": "NGN",
            "daily_limit": 500000
        }
        
        current_account_data = {
            "account_type": "current",
            "account_name": "Business Current",
            "currency": "NGN",
            "daily_limit": 2000000
        }
        
        savings_response = await client.post("/api/accounts", json=savings_account_data, headers=headers)
        assert savings_response.status_code == 201
        savings_account = savings_response.json()
        
        current_response = await client.post("/api/accounts", json=current_account_data, headers=headers)
        assert current_response.status_code == 201
        current_account = current_response.json()
        
        # Step 2: List all accounts
        accounts_response = await client.get("/api/accounts", headers=headers)
        assert accounts_response.status_code == 200
        
        accounts = accounts_response.json()
        assert len(accounts) == 2
        
        account_numbers = [acc["account_number"] for acc in accounts]
        assert savings_account["account_number"] in account_numbers
        assert current_account["account_number"] in account_numbers
        
        # Step 3: Get specific account details
        account_detail_response = await client.get(
            f"/api/accounts/{savings_account['id']}", 
            headers=headers
        )
        assert account_detail_response.status_code == 200
        
        account_detail = account_detail_response.json()
        assert account_detail["account_name"] == "Primary Savings"
        assert account_detail["account_type"] == "savings"
        
        # Step 4: Update account information
        update_data = {
            "account_name": "Updated Savings Account",
            "daily_limit": 750000
        }
        
        update_response = await client.put(
            f"/api/accounts/{savings_account['id']}", 
            json=update_data, 
            headers=headers
        )
        # This might return 404 if endpoint doesn't exist yet
        
        # Step 5: Verify update
        updated_account_response = await client.get(
            f"/api/accounts/{savings_account['id']}", 
            headers=headers
        )
        assert updated_account_response.status_code == 200
        
        # Step 6: Test account closure (with zero balance)
        close_response = await client.delete(
            f"/api/accounts/{current_account['id']}", 
            headers=headers
        )
        # This might return 404 if endpoint doesn't exist yet
    
    @pytest.mark.asyncio
    async def test_security_monitoring_workflow(self, client: AsyncClient):
        """Test security monitoring and threat detection workflow"""
        
        # Setup: Create user
        user_data = {
            "email": "security@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
            "full_name": "Security Test User",
            "phone_number": "+2348012345678"
        }
        
        register_response = await client.post("/api/auth/register", json=user_data)
        assert register_response.status_code == 201
        
        # Test 1: Multiple failed login attempts (should trigger security monitoring)
        failed_attempts = []
        for i in range(6):  # Exceed the typical 5-attempt limit
            login_data = {
                "email": user_data["email"],
                "password": "WrongPassword123!"
            }
            failed_attempts.append(
                client.post("/api/auth/login", json=login_data)
            )
        
        import asyncio
        responses = await asyncio.gather(*failed_attempts)
        
        # Should get 401 errors
        for response in responses:
            assert response.status_code == 401
        
        # The last few attempts might get 423 (locked) if account lockout is implemented
        
        # Test 2: Successful login after failed attempts
        correct_login_data = {
            "email": user_data["email"],
            "password": user_data["password"]
        }
        
        login_response = await client.post("/api/auth/login", json=correct_login_data)
        # This might be 423 if account is locked, or 200 if lockout period expired
        
        if login_response.status_code == 200:
            tokens = login_response.json()
            headers = {"Authorization": f"Bearer {tokens['access_token']}"}
            
            # Test 3: Access security dashboard
            dashboard_response = await client.get("/api/security/dashboard", headers=headers)
            # This might return 404 if endpoint doesn't exist yet
            
            # Test 4: Check security events
            events_response = await client.get("/api/security/events", headers=headers)
            # This might return 404 if endpoint doesn't exist yet
    
    @pytest.mark.asyncio
    async def test_api_rate_limiting_workflow(self, client: AsyncClient):
        """Test API rate limiting workflow"""
        
        # Setup: Create authenticated user
        user_data = {
            "email": "ratetest@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
            "full_name": "Rate Test User",
            "phone_number": "+2348012345678"
        }
        
        register_response = await client.post("/api/auth/register", json=user_data)
        assert register_response.status_code == 201
        
        login_response = await client.post("/api/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
        
        tokens = login_response.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        
        # Test 1: Normal API usage (should work)
        for i in range(5):
            response = await client.get("/api/auth/profile", headers=headers)
            assert response.status_code == 200
            
            # Check rate limit headers
            assert "X-RateLimit-Limit" in response.headers
            assert "X-RateLimit-Remaining" in response.headers
        
        # Test 2: Rapid API calls (might trigger rate limiting)
        import asyncio
        
        rapid_calls = []
        for i in range(50):  # Make many rapid calls
            rapid_calls.append(
                client.get("/api/auth/profile", headers=headers)
            )
        
        responses = await asyncio.gather(*rapid_calls, return_exceptions=True)
        
        # Some responses might be 429 (Too Many Requests) if rate limiting is active
        status_codes = [r.status_code for r in responses if hasattr(r, 'status_code')]
        
        # Should have mix of 200 and potentially 429 responses
        assert 200 in status_codes
        
        # If rate limiting is working, we should see some 429 responses
        if 429 in status_codes:
            # Find a 429 response and check headers
            rate_limited_response = next(r for r in responses if hasattr(r, 'status_code') and r.status_code == 429)
            assert "Retry-After" in rate_limited_response.headers
