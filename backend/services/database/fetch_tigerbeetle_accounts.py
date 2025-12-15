#!/usr/bin/env python3
"""
TigerBeetle Account Fetching Function

Complete implementation of the function that fetches all account balances
from TigerBeetle for the reconciliation process.

This function is part of the ReconciliationService class and is responsible
for retrieving all accounts from TigerBeetle via the HTTP middleware.

Author: NeoBank Platform Team
Date: 2025-11-01
"""

import asyncio
import httpx
import structlog
from typing import Dict, List, Any
from decimal import Decimal
from dataclasses import dataclass

# Configure structured logging
logger = structlog.get_logger()


# ============================================================================
# AccountBalance Dataclass (for reference)
# ============================================================================

@dataclass
class AccountBalance:
    """Account balance representation"""
    account_id: int
    debits_pending: Decimal
    debits_posted: Decimal
    credits_pending: Decimal
    credits_posted: Decimal
    balance: Decimal
    ledger: int
    code: int
    
    @classmethod
    def from_tigerbeetle(cls, data: dict) -> 'AccountBalance':
        """Create from TigerBeetle account data"""
        account_id = int(data['id'])
        
        # Convert from cents to dollars
        debits_pending = Decimal(str(data['debits_pending'])) / Decimal('100')
        debits_posted = Decimal(str(data['debits_posted'])) / Decimal('100')
        credits_pending = Decimal(str(data['credits_pending'])) / Decimal('100')
        credits_posted = Decimal(str(data['credits_posted'])) / Decimal('100')
        
        # Calculate balance
        balance = credits_posted - debits_posted
        
        return cls(
            account_id=account_id,
            debits_pending=debits_pending,
            debits_posted=debits_posted,
            credits_pending=credits_pending,
            credits_posted=credits_posted,
            balance=balance,
            ledger=data['ledger'],
            code=data['code']
        )


# ============================================================================
# Main Function: fetch_tigerbeetle_accounts
# ============================================================================

async def fetch_tigerbeetle_accounts(
    http_client: httpx.AsyncClient,
    tigerbeetle_url: str = "http://tigerbeetle-middleware:8080"
) -> Dict[int, AccountBalance]:
    """
    Fetch all account balances from TigerBeetle for reconciliation.
    
    This function retrieves all accounts from TigerBeetle via the HTTP middleware
    and converts them to AccountBalance objects for comparison with PostgreSQL.
    
    Args:
        http_client: Async HTTP client for making requests
        tigerbeetle_url: Base URL of the TigerBeetle middleware (optional)
    
    Returns:
        Dictionary mapping account_id to AccountBalance objects
        Example: {12345: AccountBalance(...), 67890: AccountBalance(...)}
    
    Raises:
        httpx.HTTPError: If the HTTP request fails
        httpx.TimeoutException: If the request times out
        ValueError: If the response data is invalid
        KeyError: If required fields are missing from the response
    
    Example:
        >>> async with httpx.AsyncClient() as client:
        ...     accounts = await fetch_tigerbeetle_accounts(client)
        ...     print(f"Fetched {len(accounts)} accounts")
        Fetched 1523 accounts
    """
    logger.info("Fetching accounts from TigerBeetle", url=tigerbeetle_url)
    
    try:
        # Step 1: Make HTTP GET request to TigerBeetle middleware
        response = await http_client.get(
            f"{tigerbeetle_url}/accounts",
            timeout=30.0  # 30 second timeout
        )
        
        # Step 2: Check for HTTP errors (4xx, 5xx)
        response.raise_for_status()
        
        # Step 3: Parse JSON response
        accounts_data = response.json()
        
        # Step 4: Validate response is a list
        if not isinstance(accounts_data, list):
            raise ValueError(f"Expected list of accounts, got {type(accounts_data)}")
        
        # Step 5: Convert each account to AccountBalance
        accounts = {}
        for acc_data in accounts_data:
            try:
                # Validate required fields
                required_fields = ['id', 'debits_pending', 'debits_posted', 
                                 'credits_pending', 'credits_posted', 'ledger', 'code']
                missing_fields = [f for f in required_fields if f not in acc_data]
                if missing_fields:
                    logger.warning(
                        "Account missing required fields",
                        account_id=acc_data.get('id', 'unknown'),
                        missing_fields=missing_fields
                    )
                    continue
                
                # Convert to AccountBalance
                account_balance = AccountBalance.from_tigerbeetle(acc_data)
                accounts[account_balance.account_id] = account_balance
                
            except (ValueError, KeyError, TypeError) as e:
                logger.error(
                    "Failed to parse account",
                    account_data=acc_data,
                    error=str(e)
                )
                # Continue processing other accounts
                continue
        
        # Step 6: Log success
        logger.info(
            "Fetched TigerBeetle accounts",
            count=len(accounts),
            total_balance=str(sum(acc.balance for acc in accounts.values()))
        )
        
        return accounts
        
    except httpx.TimeoutException as e:
        logger.error(
            "Timeout fetching TigerBeetle accounts",
            url=tigerbeetle_url,
            error=str(e)
        )
        raise
        
    except httpx.HTTPStatusError as e:
        logger.error(
            "HTTP error fetching TigerBeetle accounts",
            url=tigerbeetle_url,
            status_code=e.response.status_code,
            error=str(e)
        )
        raise
        
    except httpx.HTTPError as e:
        logger.error(
            "Network error fetching TigerBeetle accounts",
            url=tigerbeetle_url,
            error=str(e)
        )
        raise
        
    except ValueError as e:
        logger.error(
            "Invalid response from TigerBeetle",
            url=tigerbeetle_url,
            error=str(e)
        )
        raise
        
    except Exception as e:
        logger.error(
            "Unexpected error fetching TigerBeetle accounts",
            url=tigerbeetle_url,
            error=str(e),
            exc_info=True
        )
        raise


# ============================================================================
# Alternative Implementation: With Pagination
# ============================================================================

async def fetch_tigerbeetle_accounts_paginated(
    http_client: httpx.AsyncClient,
    tigerbeetle_url: str = "http://tigerbeetle-middleware:8080",
    page_size: int = 1000
) -> Dict[int, AccountBalance]:
    """
    Fetch all account balances from TigerBeetle with pagination.
    
    This version fetches accounts in batches to handle large datasets
    more efficiently and avoid memory issues.
    
    Args:
        http_client: Async HTTP client for making requests
        tigerbeetle_url: Base URL of the TigerBeetle middleware
        page_size: Number of accounts to fetch per request
    
    Returns:
        Dictionary mapping account_id to AccountBalance objects
    
    Example:
        >>> async with httpx.AsyncClient() as client:
        ...     accounts = await fetch_tigerbeetle_accounts_paginated(
        ...         client, page_size=500
        ...     )
        ...     print(f"Fetched {len(accounts)} accounts in batches")
    """
    logger.info(
        "Fetching accounts from TigerBeetle (paginated)",
        url=tigerbeetle_url,
        page_size=page_size
    )
    
    accounts = {}
    offset = 0
    total_fetched = 0
    
    while True:
        try:
            # Fetch one page
            response = await http_client.get(
                f"{tigerbeetle_url}/accounts",
                params={
                    'limit': page_size,
                    'offset': offset
                },
                timeout=30.0
            )
            response.raise_for_status()
            
            accounts_data = response.json()
            
            # No more accounts
            if not accounts_data:
                break
            
            # Process this page
            for acc_data in accounts_data:
                try:
                    account_balance = AccountBalance.from_tigerbeetle(acc_data)
                    accounts[account_balance.account_id] = account_balance
                    total_fetched += 1
                except Exception as e:
                    logger.error("Failed to parse account", error=str(e))
                    continue
            
            logger.debug(
                "Fetched page",
                offset=offset,
                page_size=len(accounts_data),
                total=total_fetched
            )
            
            # Move to next page
            offset += page_size
            
            # If we got fewer accounts than page_size, we're done
            if len(accounts_data) < page_size:
                break
                
        except httpx.HTTPError as e:
            logger.error("Error fetching page", offset=offset, error=str(e))
            raise
    
    logger.info(
        "Fetched TigerBeetle accounts (paginated)",
        count=len(accounts),
        pages=offset // page_size + 1
    )
    
    return accounts


# ============================================================================
# Alternative Implementation: With Retry Logic
# ============================================================================

async def fetch_tigerbeetle_accounts_with_retry(
    http_client: httpx.AsyncClient,
    tigerbeetle_url: str = "http://tigerbeetle-middleware:8080",
    max_retries: int = 3,
    retry_delay: float = 5.0
) -> Dict[int, AccountBalance]:
    """
    Fetch all account balances from TigerBeetle with automatic retry.
    
    This version automatically retries on transient failures (network errors,
    timeouts) to improve reliability.
    
    Args:
        http_client: Async HTTP client for making requests
        tigerbeetle_url: Base URL of the TigerBeetle middleware
        max_retries: Maximum number of retry attempts
        retry_delay: Delay between retries in seconds
    
    Returns:
        Dictionary mapping account_id to AccountBalance objects
    
    Raises:
        Exception: If all retry attempts fail
    
    Example:
        >>> async with httpx.AsyncClient() as client:
        ...     accounts = await fetch_tigerbeetle_accounts_with_retry(
        ...         client, max_retries=5
        ...     )
    """
    logger.info(
        "Fetching accounts from TigerBeetle (with retry)",
        url=tigerbeetle_url,
        max_retries=max_retries
    )
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            # Try to fetch accounts
            accounts = await fetch_tigerbeetle_accounts(http_client, tigerbeetle_url)
            
            # Success!
            if attempt > 0:
                logger.info(
                    "Successfully fetched accounts after retry",
                    attempt=attempt + 1
                )
            
            return accounts
            
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            # Transient error - retry
            last_error = e
            logger.warning(
                "Transient error fetching accounts, will retry",
                attempt=attempt + 1,
                max_retries=max_retries,
                error=str(e)
            )
            
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
            
        except httpx.HTTPStatusError as e:
            # HTTP error - don't retry 4xx errors
            if 400 <= e.response.status_code < 500:
                logger.error("Client error, not retrying", status=e.response.status_code)
                raise
            
            # Retry 5xx errors
            last_error = e
            logger.warning(
                "Server error, will retry",
                attempt=attempt + 1,
                status=e.response.status_code
            )
            
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
    
    # All retries failed
    logger.error("Failed to fetch accounts after all retries", max_retries=max_retries)
    raise last_error


# ============================================================================
# Example Usage
# ============================================================================

async def example_basic():
    """Example: Basic usage"""
    print("=" * 80)
    print("Example 1: Basic Account Fetching")
    print("=" * 80)
    
    async with httpx.AsyncClient() as client:
        try:
            accounts = await fetch_tigerbeetle_accounts(
                client,
                tigerbeetle_url="http://tigerbeetle-middleware:8080"
            )
            
            print(f"Fetched {len(accounts)} accounts")
            
            # Show first 5 accounts
            for account_id, account in list(accounts.items())[:5]:
                print(f"  Account {account_id}: Balance=${account.balance}")
            
        except Exception as e:
            print(f"Error: {e}")
    
    print()


async def example_with_processing():
    """Example: Fetch and process accounts"""
    print("=" * 80)
    print("Example 2: Fetch and Process Accounts")
    print("=" * 80)
    
    async with httpx.AsyncClient() as client:
        try:
            accounts = await fetch_tigerbeetle_accounts(client)
            
            # Calculate statistics
            total_balance = sum(acc.balance for acc in accounts.values())
            avg_balance = total_balance / len(accounts) if accounts else Decimal('0')
            
            positive_balances = [acc for acc in accounts.values() if acc.balance > 0]
            negative_balances = [acc for acc in accounts.values() if acc.balance < 0]
            zero_balances = [acc for acc in accounts.values() if acc.balance == 0]
            
            print(f"Total Accounts: {len(accounts):,}")
            print(f"Total Balance: ${total_balance:,.2f}")
            print(f"Average Balance: ${avg_balance:,.2f}")
            print(f"Positive Balances: {len(positive_balances):,}")
            print(f"Negative Balances: {len(negative_balances):,}")
            print(f"Zero Balances: {len(zero_balances):,}")
            
        except Exception as e:
            print(f"Error: {e}")
    
    print()


async def example_paginated():
    """Example: Paginated fetching"""
    print("=" * 80)
    print("Example 3: Paginated Account Fetching")
    print("=" * 80)
    
    async with httpx.AsyncClient() as client:
        try:
            accounts = await fetch_tigerbeetle_accounts_paginated(
                client,
                page_size=500
            )
            
            print(f"Fetched {len(accounts)} accounts using pagination")
            
        except Exception as e:
            print(f"Error: {e}")
    
    print()


async def example_with_retry():
    """Example: Fetch with retry logic"""
    print("=" * 80)
    print("Example 4: Account Fetching with Retry")
    print("=" * 80)
    
    async with httpx.AsyncClient() as client:
        try:
            accounts = await fetch_tigerbeetle_accounts_with_retry(
                client,
                max_retries=5,
                retry_delay=2.0
            )
            
            print(f"Fetched {len(accounts)} accounts (with retry logic)")
            
        except Exception as e:
            print(f"Error after all retries: {e}")
    
    print()


async def main():
    """Run all examples"""
    # Configure structured logging
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer()
        ]
    )
    
    print()
    print("=" * 80)
    print("TigerBeetle Account Fetching - Examples")
    print("=" * 80)
    print()
    print("NOTE: These examples require a running TigerBeetle middleware.")
    print("      They will fail if the middleware is not available.")
    print()
    
    # Uncomment to run examples (requires TigerBeetle middleware)
    # await example_basic()
    # await example_with_processing()
    # await example_paginated()
    # await example_with_retry()
    
    print("=" * 80)
    print("Examples complete!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
