"""
End-to-End Tests for Transaction Submission Flow
Tests transfer creation, validation, confirmation, and error handling
"""
import pytest
from playwright.sync_api import Page, expect
from playwright_config import (
    BASE_URL, TEST_USER, TEST_ACCOUNTS, SELECTORS, TIMEOUTS
)
import time


class TestTransactionFlow:
    """Test suite for transaction submission functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self, page: Page):
        """Login and navigate to transfer page before each test"""
        # Login first
        page.goto(f"{BASE_URL}/login")
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for dashboard
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Navigate to transfer page
        page.goto(f"{BASE_URL}/transfers")
        page.wait_for_load_state("networkidle")
        
        yield page
    
    def test_transfer_page_loads(self, page: Page):
        """Test that transfer page loads correctly with all elements"""
        # Check page title
        expect(page).to_have_title("Transfer Funds - NeoBank")
        
        # Check transfer form elements are visible
        expect(page.locator(SELECTORS["transfer"]["from_account"])).to_be_visible()
        expect(page.locator(SELECTORS["transfer"]["to_account"])).to_be_visible()
        expect(page.locator(SELECTORS["transfer"]["amount"])).to_be_visible()
        expect(page.locator(SELECTORS["transfer"]["description"])).to_be_visible()
        expect(page.locator(SELECTORS["transfer"]["submit_button"])).to_be_visible()
    
    def test_successful_transfer_submission(self, page: Page):
        """Test successful transfer with valid data"""
        # Fill in transfer form
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test transfer via E2E"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Wait for confirmation modal
        confirmation_modal = page.locator(SELECTORS["transfer"]["confirmation_modal"])
        expect(confirmation_modal).to_be_visible(timeout=TIMEOUTS["action"])
        
        # Verify transfer details in confirmation modal
        expect(confirmation_modal).to_contain_text(TEST_ACCOUNTS["destination_account"])
        expect(confirmation_modal).to_contain_text(str(TEST_ACCOUNTS["amount"]))
        expect(confirmation_modal).to_contain_text(TEST_ACCOUNTS["currency"])
        
        # Confirm transfer
        confirm_button = confirmation_modal.locator('button:has-text("Confirm")')
        confirm_button.click()
        
        # Wait for success message
        success_message = page.locator(SELECTORS["transfer"]["success_message"])
        expect(success_message).to_be_visible(timeout=TIMEOUTS["action"])
        expect(success_message).to_contain_text("Transfer successful")
        
        # Verify transaction ID is displayed
        transaction_id = page.locator('.transaction-id')
        expect(transaction_id).to_be_visible()
        expect(transaction_id).to_have_text(/TX-\d+/)
    
    def test_transfer_with_insufficient_balance(self, page: Page):
        """Test transfer fails when account has insufficient balance"""
        # Fill in transfer form with large amount
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            "999999999.00"  # Very large amount
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test insufficient balance"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Wait for error message
        page.wait_for_timeout(2000)
        
        # Verify error message is displayed
        error_message = page.locator('.error-message')
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Insufficient balance")
    
    def test_transfer_with_invalid_account_number(self, page: Page):
        """Test transfer fails with invalid destination account"""
        # Fill in transfer form with invalid account
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            "0000000000"  # Invalid account
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test invalid account"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Wait for error message
        page.wait_for_timeout(2000)
        
        # Verify error message
        error_message = page.locator('.error-message')
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Invalid account number")
    
    def test_transfer_with_negative_amount(self, page: Page):
        """Test transfer fails with negative amount"""
        # Fill in transfer form with negative amount
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            "-100.00"
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test negative amount"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Verify validation error
        amount_input = page.locator(SELECTORS["transfer"]["amount"])
        expect(amount_input).to_have_attribute("min", "0.01")
    
    def test_transfer_with_zero_amount(self, page: Page):
        """Test transfer fails with zero amount"""
        # Fill in transfer form with zero amount
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            "0.00"
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test zero amount"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Verify error message
        error_message = page.locator('.error-message')
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Amount must be greater than zero")
    
    def test_transfer_to_same_account(self, page: Page):
        """Test transfer fails when source and destination are the same"""
        # Fill in transfer form with same account
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["source_account"]  # Same as source
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test same account"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Verify error message
        error_message = page.locator('.error-message')
        expect(error_message).to_be_visible()
        expect(error_message).to_contain_text("Cannot transfer to the same account")
    
    def test_transfer_cancellation(self, page: Page):
        """Test user can cancel transfer from confirmation modal"""
        # Fill in transfer form
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test cancellation"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Wait for confirmation modal
        confirmation_modal = page.locator(SELECTORS["transfer"]["confirmation_modal"])
        expect(confirmation_modal).to_be_visible(timeout=TIMEOUTS["action"])
        
        # Click cancel button
        cancel_button = confirmation_modal.locator('button:has-text("Cancel")')
        cancel_button.click()
        
        # Verify modal is closed
        expect(confirmation_modal).not_to_be_visible()
        
        # Verify still on transfer page
        expect(page).to_have_url(f"{BASE_URL}/transfers")
    
    def test_transfer_with_special_characters_in_description(self, page: Page):
        """Test transfer with special characters in description"""
        # Fill in transfer form with special characters
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test <script>alert('XSS')</script> & special chars"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Wait for confirmation modal
        confirmation_modal = page.locator(SELECTORS["transfer"]["confirmation_modal"])
        expect(confirmation_modal).to_be_visible(timeout=TIMEOUTS["action"])
        
        # Verify special characters are properly escaped
        description_text = confirmation_modal.locator('.description-text').text_content()
        assert "<script>" not in description_text
    
    def test_duplicate_transfer_prevention(self, page: Page):
        """Test duplicate transfer prevention with idempotency"""
        # Generate unique idempotency key
        idempotency_key = f"test_transfer_{int(time.time())}"
        
        # Fill in transfer form
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test duplicate prevention"
        )
        
        # Set idempotency key in hidden field if it exists
        idempotency_input = page.locator('input[name="idempotency_key"]')
        if idempotency_input.is_visible():
            page.fill('input[name="idempotency_key"]', idempotency_key)
        
        # Submit first transfer
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Confirm in modal
        confirmation_modal = page.locator(SELECTORS["transfer"]["confirmation_modal"])
        expect(confirmation_modal).to_be_visible(timeout=TIMEOUTS["action"])
        confirm_button = confirmation_modal.locator('button:has-text("Confirm")')
        confirm_button.click()
        
        # Wait for success
        success_message = page.locator(SELECTORS["transfer"]["success_message"])
        expect(success_message).to_be_visible(timeout=TIMEOUTS["action"])
        
        # Get first transaction ID
        first_transaction_id = page.locator('.transaction-id').text_content()
        
        # Try to submit the same transfer again (simulate double-click)
        page.goto(f"{BASE_URL}/transfers")
        page.wait_for_load_state("networkidle")
        
        # Fill in same transfer details
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test duplicate prevention"
        )
        
        # Set same idempotency key
        if idempotency_input.is_visible():
            page.fill('input[name="idempotency_key"]', idempotency_key)
        
        # Submit second transfer
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Confirm in modal
        confirmation_modal = page.locator(SELECTORS["transfer"]["confirmation_modal"])
        expect(confirmation_modal).to_be_visible(timeout=TIMEOUTS["action"])
        confirm_button = confirmation_modal.locator('button:has-text("Confirm")')
        confirm_button.click()
        
        # Wait for response
        page.wait_for_timeout(2000)
        
        # Get second transaction ID
        second_transaction_id = page.locator('.transaction-id').text_content()
        
        # Verify same transaction ID (duplicate prevented)
        assert first_transaction_id == second_transaction_id
    
    def test_transfer_with_beneficiary_selection(self, page: Page):
        """Test transfer using saved beneficiary"""
        # Check if beneficiary dropdown exists
        beneficiary_dropdown = page.locator('select[name="beneficiary"]')
        
        if beneficiary_dropdown.is_visible():
            # Select a beneficiary
            page.select_option('select[name="beneficiary"]', index=1)
            
            # Verify account number is auto-filled
            to_account_input = page.locator(SELECTORS["transfer"]["to_account"])
            account_value = to_account_input.input_value()
            assert len(account_value) == 10  # Assuming 10-digit account numbers
    
    def test_transfer_amount_formatting(self, page: Page):
        """Test amount input accepts various formats"""
        amount_input = page.locator(SELECTORS["transfer"]["amount"])
        
        # Test different amount formats
        test_amounts = ["1000", "1,000", "1000.00", "1,000.00"]
        
        for amount in test_amounts:
            amount_input.fill(amount)
            # Verify value is properly formatted
            formatted_value = amount_input.input_value()
            assert float(formatted_value.replace(",", "")) == 1000.00
    
    def test_transfer_confirmation_modal_details(self, page: Page):
        """Test confirmation modal displays all transfer details correctly"""
        # Fill in transfer form
        page.select_option(
            SELECTORS["transfer"]["from_account"], 
            TEST_ACCOUNTS["source_account"]
        )
        page.fill(
            SELECTORS["transfer"]["to_account"], 
            TEST_ACCOUNTS["destination_account"]
        )
        page.fill(
            SELECTORS["transfer"]["amount"], 
            str(TEST_ACCOUNTS["amount"])
        )
        page.fill(
            SELECTORS["transfer"]["description"], 
            "Test confirmation details"
        )
        
        # Click submit button
        page.click(SELECTORS["transfer"]["submit_button"])
        
        # Wait for confirmation modal
        confirmation_modal = page.locator(SELECTORS["transfer"]["confirmation_modal"])
        expect(confirmation_modal).to_be_visible(timeout=TIMEOUTS["action"])
        
        # Verify all details are displayed
        expect(confirmation_modal.locator('.from-account')).to_contain_text(TEST_ACCOUNTS["source_account"])
        expect(confirmation_modal.locator('.to-account')).to_contain_text(TEST_ACCOUNTS["destination_account"])
        expect(confirmation_modal.locator('.amount')).to_contain_text(str(TEST_ACCOUNTS["amount"]))
        expect(confirmation_modal.locator('.currency')).to_contain_text(TEST_ACCOUNTS["currency"])
        expect(confirmation_modal.locator('.description')).to_contain_text("Test confirmation details")
        
        # Verify fees are displayed if applicable
        fees_element = confirmation_modal.locator('.fees')
        if fees_element.is_visible():
            expect(fees_element).to_have_text(/\d+\.\d{2}/)


class TestTransactionHistory:
    """Test suite for transaction history and tracking"""
    
    @pytest.fixture(autouse=True)
    def setup(self, page: Page):
        """Login and navigate to transactions page before each test"""
        # Login first
        page.goto(f"{BASE_URL}/login")
        page.fill(SELECTORS["login"]["email_input"], TEST_USER["email"])
        page.fill(SELECTORS["login"]["password_input"], TEST_USER["password"])
        page.click(SELECTORS["login"]["submit_button"])
        
        # Wait for dashboard
        page.wait_for_url(f"{BASE_URL}/dashboard", timeout=TIMEOUTS["navigation"])
        
        # Navigate to transactions page
        page.goto(f"{BASE_URL}/transactions")
        page.wait_for_load_state("networkidle")
        
        yield page
    
    def test_transaction_history_displays(self, page: Page):
        """Test transaction history page displays transactions"""
        # Check page title
        expect(page).to_have_title("Transaction History - NeoBank")
        
        # Verify transactions list is visible
        transactions_list = page.locator(SELECTORS["dashboard"]["transactions_list"])
        expect(transactions_list).to_be_visible()
        
        # Verify at least one transaction is displayed
        transaction_items = page.locator('.transaction-item')
        expect(transaction_items).to_have_count_greater_than(0)
    
    def test_transaction_details_modal(self, page: Page):
        """Test clicking transaction opens details modal"""
        # Click first transaction
        first_transaction = page.locator('.transaction-item').first
        first_transaction.click()
        
        # Verify details modal opens
        details_modal = page.locator('.transaction-details-modal')
        expect(details_modal).to_be_visible(timeout=TIMEOUTS["action"])
        
        # Verify transaction details are displayed
        expect(details_modal.locator('.transaction-id')).to_be_visible()
        expect(details_modal.locator('.amount')).to_be_visible()
        expect(details_modal.locator('.date')).to_be_visible()
        expect(details_modal.locator('.status')).to_be_visible()
    
    def test_transaction_search_functionality(self, page: Page):
        """Test transaction search filters results"""
        # Enter search query
        search_input = page.locator('input[name="search"]')
        search_input.fill("test transfer")
        
        # Click search button or press Enter
        search_input.press("Enter")
        
        # Wait for results
        page.wait_for_timeout(1000)
        
        # Verify filtered results
        transaction_items = page.locator('.transaction-item')
        expect(transaction_items).to_have_count_greater_than(0)
    
    def test_transaction_export_functionality(self, page: Page):
        """Test transaction export to CSV"""
        # Click export button
        export_button = page.locator('button:has-text("Export")')
        
        if export_button.is_visible():
            # Start waiting for download
            with page.expect_download() as download_info:
                export_button.click()
            
            download = download_info.value
            
            # Verify download occurred
            assert download.suggested_filename.endswith('.csv')


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--html=test_report_transactions.html"])
