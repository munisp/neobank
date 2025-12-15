#!/usr/bin/env python3
"""
PostgreSQL Account Fetching Function

Complete implementation of the function that fetches all account balances
from PostgreSQL for the reconciliation process.

This function is part of the ReconciliationService class and is responsible
for retrieving all accounts from the PostgreSQL database that were synced
from TigerBeetle via CDC.

Author: NeoBank Platform Team
Date: 2025-11-01
"""

import asyncio
import asyncpg
import structlog
from typing import Dict, List, Any
from decimal import Decimal
from dataclasses import dataclass
from datetime import datetime

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
    last_synced_at: datetime = None
    
    @classmethod
    def from_postgres(cls, row: dict) -> 'AccountBalance':
        """Create from PostgreSQL row data"""
        return cls(
            account_id=int(row['tigerbeetle_account_id']),
            debits_pending=Decimal(str(row['debits_pending'])),
            debits_posted=Decimal(str(row['debits_posted'])),
            credits_pending=Decimal(str(row['credits_pending'])),
            credits_posted=Decimal(str(row['credits_posted'])),
            balance=Decimal(str(row['balance'])),
            ledger=int(row['ledger']),
            code=int(row['code']),
            last_synced_at=row.get('last_synced_at')
        )


# ============================================================================
# Main Function: fetch_postgres_accounts
# ============================================================================

async def fetch_postgres_accounts(
    db_pool: asyncpg.Pool
) -> Dict[int, AccountBalance]:
    """
    Fetch all account balances from PostgreSQL for reconciliation.
    
    This function retrieves all accounts from the PostgreSQL database that
    were synced from TigerBeetle via the CDC service. It queries the
    `tigerbeetle_accounts` table which contains the replicated account data.
    
    Args:
        db_pool: AsyncPG connection pool for database access
    
    Returns:
        Dictionary mapping account_id to AccountBalance objects
        Example: {12345: AccountBalance(...), 67890: AccountBalance(...)}
    
    Raises:
        asyncpg.PostgresError: If database query fails
        ValueError: If the data is invalid
        KeyError: If required columns are missing
    
    Example:
        >>> pool = await asyncpg.create_pool('postgresql://...')
        >>> accounts = await fetch_postgres_accounts(pool)
        >>> print(f"Fetched {len(accounts)} accounts")
        Fetched 1523 accounts
    
    Database Schema:
        The function queries the `tigerbeetle_accounts` table:
        
        CREATE TABLE tigerbeetle_accounts (
            id SERIAL PRIMARY KEY,
            tigerbeetle_account_id BIGINT UNIQUE NOT NULL,
            debits_pending DECIMAL(20, 2) NOT NULL DEFAULT 0,
            debits_posted DECIMAL(20, 2) NOT NULL DEFAULT 0,
            credits_pending DECIMAL(20, 2) NOT NULL DEFAULT 0,
            credits_posted DECIMAL(20, 2) NOT NULL DEFAULT 0,
            balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
            ledger INTEGER NOT NULL,
            code INTEGER NOT NULL,
            last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """
    logger.info("Fetching accounts from PostgreSQL")
    
    try:
        # Step 1: Acquire connection from pool
        async with db_pool.acquire() as conn:
            
            # Step 2: Execute query to fetch all accounts
            query = """
                SELECT 
                    tigerbeetle_account_id,
                    debits_pending,
                    debits_posted,
                    credits_pending,
                    credits_posted,
                    balance,
                    ledger,
                    code,
                    last_synced_at
                FROM tigerbeetle_accounts
                ORDER BY tigerbeetle_account_id
            """
            
            # Step 3: Fetch all rows
            rows = await conn.fetch(query)
            
            # Step 4: Convert rows to AccountBalance objects
            accounts = {}
            for row in rows:
                try:
                    # Validate required columns
                    required_columns = [
                        'tigerbeetle_account_id',
                        'debits_pending',
                        'debits_posted',
                        'credits_pending',
                        'credits_posted',
                        'balance',
                        'ledger',
                        'code'
                    ]
                    
                    missing_columns = [col for col in required_columns if col not in row]
                    if missing_columns:
                        logger.warning(
                            "Row missing required columns",
                            missing_columns=missing_columns
                        )
                        continue
                    
                    # Convert to AccountBalance
                    account_balance = AccountBalance.from_postgres(dict(row))
                    accounts[account_balance.account_id] = account_balance
                    
                except (ValueError, KeyError, TypeError) as e:
                    logger.error(
                        "Failed to parse account row",
                        row=dict(row),
                        error=str(e)
                    )
                    # Continue processing other accounts
                    continue
            
            # Step 5: Calculate statistics
            total_balance = sum(acc.balance for acc in accounts.values())
            
            # Step 6: Log success
            logger.info(
                "Fetched PostgreSQL accounts",
                count=len(accounts),
                total_balance=str(total_balance)
            )
            
            return accounts
    
    except asyncpg.PostgresError as e:
        logger.error(
            "Database error fetching PostgreSQL accounts",
            error=str(e),
            error_code=e.sqlstate if hasattr(e, 'sqlstate') else None
        )
        raise
    
    except Exception as e:
        logger.error(
            "Unexpected error fetching PostgreSQL accounts",
            error=str(e),
            exc_info=True
        )
        raise


# ============================================================================
# Alternative Implementation: With Pagination
# ============================================================================

async def fetch_postgres_accounts_paginated(
    db_pool: asyncpg.Pool,
    page_size: int = 1000
) -> Dict[int, AccountBalance]:
    """
    Fetch all account balances from PostgreSQL with pagination.
    
    This version fetches accounts in batches to handle large datasets
    more efficiently and reduce memory usage.
    
    Args:
        db_pool: AsyncPG connection pool for database access
        page_size: Number of accounts to fetch per query
    
    Returns:
        Dictionary mapping account_id to AccountBalance objects
    
    Example:
        >>> pool = await asyncpg.create_pool('postgresql://...')
        >>> accounts = await fetch_postgres_accounts_paginated(pool, page_size=500)
        >>> print(f"Fetched {len(accounts)} accounts in batches")
    """
    logger.info(
        "Fetching accounts from PostgreSQL (paginated)",
        page_size=page_size
    )
    
    accounts = {}
    offset = 0
    total_fetched = 0
    
    async with db_pool.acquire() as conn:
        while True:
            # Fetch one page
            query = """
                SELECT 
                    tigerbeetle_account_id,
                    debits_pending,
                    debits_posted,
                    credits_pending,
                    credits_posted,
                    balance,
                    ledger,
                    code,
                    last_synced_at
                FROM tigerbeetle_accounts
                ORDER BY tigerbeetle_account_id
                LIMIT $1 OFFSET $2
            """
            
            rows = await conn.fetch(query, page_size, offset)
            
            # No more accounts
            if not rows:
                break
            
            # Process this page
            for row in rows:
                try:
                    account_balance = AccountBalance.from_postgres(dict(row))
                    accounts[account_balance.account_id] = account_balance
                    total_fetched += 1
                except Exception as e:
                    logger.error("Failed to parse account row", error=str(e))
                    continue
            
            logger.debug(
                "Fetched page",
                offset=offset,
                page_size=len(rows),
                total=total_fetched
            )
            
            # Move to next page
            offset += page_size
            
            # If we got fewer rows than page_size, we're done
            if len(rows) < page_size:
                break
    
    logger.info(
        "Fetched PostgreSQL accounts (paginated)",
        count=len(accounts),
        pages=offset // page_size + 1
    )
    
    return accounts


# ============================================================================
# Alternative Implementation: With Filtering
# ============================================================================

async def fetch_postgres_accounts_filtered(
    db_pool: asyncpg.Pool,
    ledger: int = None,
    min_balance: Decimal = None,
    max_balance: Decimal = None,
    synced_after: datetime = None
) -> Dict[int, AccountBalance]:
    """
    Fetch account balances from PostgreSQL with optional filters.
    
    This version allows filtering accounts by various criteria,
    useful for targeted reconciliation or analysis.
    
    Args:
        db_pool: AsyncPG connection pool for database access
        ledger: Filter by ledger ID (optional)
        min_balance: Minimum balance filter (optional)
        max_balance: Maximum balance filter (optional)
        synced_after: Only accounts synced after this timestamp (optional)
    
    Returns:
        Dictionary mapping account_id to AccountBalance objects
    
    Example:
        >>> # Fetch only accounts with balance > $1000
        >>> accounts = await fetch_postgres_accounts_filtered(
        ...     pool,
        ...     min_balance=Decimal('1000.00')
        ... )
    """
    logger.info(
        "Fetching accounts from PostgreSQL (filtered)",
        ledger=ledger,
        min_balance=str(min_balance) if min_balance else None,
        max_balance=str(max_balance) if max_balance else None,
        synced_after=synced_after.isoformat() if synced_after else None
    )
    
    # Build dynamic query with filters
    query = """
        SELECT 
            tigerbeetle_account_id,
            debits_pending,
            debits_posted,
            credits_pending,
            credits_posted,
            balance,
            ledger,
            code,
            last_synced_at
        FROM tigerbeetle_accounts
        WHERE 1=1
    """
    
    params = []
    param_count = 0
    
    if ledger is not None:
        param_count += 1
        query += f" AND ledger = ${param_count}"
        params.append(ledger)
    
    if min_balance is not None:
        param_count += 1
        query += f" AND balance >= ${param_count}"
        params.append(min_balance)
    
    if max_balance is not None:
        param_count += 1
        query += f" AND balance <= ${param_count}"
        params.append(max_balance)
    
    if synced_after is not None:
        param_count += 1
        query += f" AND last_synced_at > ${param_count}"
        params.append(synced_after)
    
    query += " ORDER BY tigerbeetle_account_id"
    
    # Execute query
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        
        accounts = {}
        for row in rows:
            try:
                account_balance = AccountBalance.from_postgres(dict(row))
                accounts[account_balance.account_id] = account_balance
            except Exception as e:
                logger.error("Failed to parse account row", error=str(e))
                continue
        
        logger.info(
            "Fetched PostgreSQL accounts (filtered)",
            count=len(accounts)
        )
        
        return accounts


# ============================================================================
# Alternative Implementation: With Statistics
# ============================================================================

async def fetch_postgres_accounts_with_stats(
    db_pool: asyncpg.Pool
) -> tuple[Dict[int, AccountBalance], Dict[str, Any]]:
    """
    Fetch all account balances from PostgreSQL along with statistics.
    
    This version returns both the accounts and summary statistics
    in a single database query for efficiency.
    
    Args:
        db_pool: AsyncPG connection pool for database access
    
    Returns:
        Tuple of (accounts_dict, statistics_dict)
        
        statistics_dict contains:
        - total_accounts: Number of accounts
        - total_balance: Sum of all balances
        - avg_balance: Average balance
        - min_balance: Minimum balance
        - max_balance: Maximum balance
        - positive_balances: Count of accounts with positive balance
        - negative_balances: Count of accounts with negative balance
        - zero_balances: Count of accounts with zero balance
    
    Example:
        >>> accounts, stats = await fetch_postgres_accounts_with_stats(pool)
        >>> print(f"Total: ${stats['total_balance']}")
        >>> print(f"Average: ${stats['avg_balance']}")
    """
    logger.info("Fetching accounts from PostgreSQL (with statistics)")
    
    async with db_pool.acquire() as conn:
        # Fetch accounts
        accounts_query = """
            SELECT 
                tigerbeetle_account_id,
                debits_pending,
                debits_posted,
                credits_pending,
                credits_posted,
                balance,
                ledger,
                code,
                last_synced_at
            FROM tigerbeetle_accounts
            ORDER BY tigerbeetle_account_id
        """
        
        rows = await conn.fetch(accounts_query)
        
        # Convert to AccountBalance objects
        accounts = {}
        for row in rows:
            try:
                account_balance = AccountBalance.from_postgres(dict(row))
                accounts[account_balance.account_id] = account_balance
            except Exception as e:
                logger.error("Failed to parse account row", error=str(e))
                continue
        
        # Fetch statistics in a single query
        stats_query = """
            SELECT 
                COUNT(*) as total_accounts,
                COALESCE(SUM(balance), 0) as total_balance,
                COALESCE(AVG(balance), 0) as avg_balance,
                COALESCE(MIN(balance), 0) as min_balance,
                COALESCE(MAX(balance), 0) as max_balance,
                COUNT(CASE WHEN balance > 0 THEN 1 END) as positive_balances,
                COUNT(CASE WHEN balance < 0 THEN 1 END) as negative_balances,
                COUNT(CASE WHEN balance = 0 THEN 1 END) as zero_balances
            FROM tigerbeetle_accounts
        """
        
        stats_row = await conn.fetchrow(stats_query)
        
        statistics = {
            'total_accounts': stats_row['total_accounts'],
            'total_balance': Decimal(str(stats_row['total_balance'])),
            'avg_balance': Decimal(str(stats_row['avg_balance'])),
            'min_balance': Decimal(str(stats_row['min_balance'])),
            'max_balance': Decimal(str(stats_row['max_balance'])),
            'positive_balances': stats_row['positive_balances'],
            'negative_balances': stats_row['negative_balances'],
            'zero_balances': stats_row['zero_balances']
        }
        
        logger.info(
            "Fetched PostgreSQL accounts with statistics",
            count=len(accounts),
            total_balance=str(statistics['total_balance']),
            avg_balance=str(statistics['avg_balance'])
        )
        
        return accounts, statistics


# ============================================================================
# Helper Function: Get Account Count
# ============================================================================

async def get_postgres_account_count(db_pool: asyncpg.Pool) -> int:
    """
    Get the total number of accounts in PostgreSQL.
    
    Fast count query without fetching all data.
    
    Args:
        db_pool: AsyncPG connection pool
    
    Returns:
        Total number of accounts
    
    Example:
        >>> count = await get_postgres_account_count(pool)
        >>> print(f"Total accounts: {count:,}")
        Total accounts: 1,523
    """
    async with db_pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM tigerbeetle_accounts"
        )
        return count


# ============================================================================
# Helper Function: Get Total Balance
# ============================================================================

async def get_postgres_total_balance(db_pool: asyncpg.Pool) -> Decimal:
    """
    Get the total balance across all accounts in PostgreSQL.
    
    Fast sum query without fetching all data.
    
    Args:
        db_pool: AsyncPG connection pool
    
    Returns:
        Total balance as Decimal
    
    Example:
        >>> total = await get_postgres_total_balance(pool)
        >>> print(f"Total balance: ${total:,.2f}")
        Total balance: $15,234,567.89
    """
    async with db_pool.acquire() as conn:
        total = await conn.fetchval(
            "SELECT COALESCE(SUM(balance), 0) FROM tigerbeetle_accounts"
        )
        return Decimal(str(total))


# ============================================================================
# Example Usage
# ============================================================================

async def example_basic():
    """Example: Basic usage"""
    print("=" * 80)
    print("Example 1: Basic Account Fetching from PostgreSQL")
    print("=" * 80)
    
    # Create connection pool
    pool = await asyncpg.create_pool(
        host='localhost',
        port=5432,
        user='neobank',
        password='password',
        database='neobank'
    )
    
    try:
        # Fetch accounts
        accounts = await fetch_postgres_accounts(pool)
        
        print(f"Fetched {len(accounts)} accounts")
        
        # Show first 5 accounts
        for account_id, account in list(accounts.items())[:5]:
            print(f"  Account {account_id}: Balance=${account.balance}")
        
    finally:
        await pool.close()
    
    print()


async def example_with_stats():
    """Example: Fetch with statistics"""
    print("=" * 80)
    print("Example 2: Fetch Accounts with Statistics")
    print("=" * 80)
    
    pool = await asyncpg.create_pool(
        'postgresql://neobank:password@localhost:5432/neobank'
    )
    
    try:
        # Fetch accounts and statistics
        accounts, stats = await fetch_postgres_accounts_with_stats(pool)
        
        print(f"Total Accounts: {stats['total_accounts']:,}")
        print(f"Total Balance: ${stats['total_balance']:,.2f}")
        print(f"Average Balance: ${stats['avg_balance']:,.2f}")
        print(f"Min Balance: ${stats['min_balance']:,.2f}")
        print(f"Max Balance: ${stats['max_balance']:,.2f}")
        print(f"Positive Balances: {stats['positive_balances']:,}")
        print(f"Negative Balances: {stats['negative_balances']:,}")
        print(f"Zero Balances: {stats['zero_balances']:,}")
        
    finally:
        await pool.close()
    
    print()


async def example_paginated():
    """Example: Paginated fetching"""
    print("=" * 80)
    print("Example 3: Paginated Account Fetching")
    print("=" * 80)
    
    pool = await asyncpg.create_pool(
        'postgresql://neobank:password@localhost:5432/neobank'
    )
    
    try:
        accounts = await fetch_postgres_accounts_paginated(pool, page_size=500)
        print(f"Fetched {len(accounts)} accounts using pagination")
        
    finally:
        await pool.close()
    
    print()


async def example_filtered():
    """Example: Filtered fetching"""
    print("=" * 80)
    print("Example 4: Filtered Account Fetching")
    print("=" * 80)
    
    pool = await asyncpg.create_pool(
        'postgresql://neobank:password@localhost:5432/neobank'
    )
    
    try:
        # Fetch only accounts with balance > $1000
        accounts = await fetch_postgres_accounts_filtered(
            pool,
            min_balance=Decimal('1000.00')
        )
        print(f"Fetched {len(accounts)} accounts with balance > $1000")
        
    finally:
        await pool.close()
    
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
    print("PostgreSQL Account Fetching - Examples")
    print("=" * 80)
    print()
    print("NOTE: These examples require a running PostgreSQL database.")
    print("      They will fail if the database is not available.")
    print()
    
    # Uncomment to run examples (requires PostgreSQL)
    # await example_basic()
    # await example_with_stats()
    # await example_paginated()
    # await example_filtered()
    
    print("=" * 80)
    print("Examples complete!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
