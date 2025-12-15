"""
AccountBalance Dataclass - Complete Implementation
Handles data mapping between TigerBeetle and PostgreSQL account representations
"""

from dataclasses import dataclass, asdict, field
from decimal import Decimal
from typing import Dict, Optional, Any
from datetime import datetime


@dataclass
class AccountBalance:
    """
    Represents an account balance from either TigerBeetle or PostgreSQL.
    
    This dataclass provides a unified representation of account balances
    regardless of the source system, enabling easy comparison and reconciliation.
    
    Attributes:
        account_id (int): Unique account identifier (128-bit in TigerBeetle)
        debits_pending (Decimal): Pending debit amount (not yet posted)
        debits_posted (Decimal): Posted debit amount (finalized)
        credits_pending (Decimal): Pending credit amount (not yet posted)
        credits_posted (Decimal): Posted credit amount (finalized)
        balance (Decimal): Net balance (credits_posted - debits_posted)
        ledger (int): Ledger/currency identifier (e.g., 1=NGN, 2=USD)
        code (int): Account type code (e.g., 1=checking, 2=savings)
        timestamp (Optional[int]): Account creation timestamp (nanoseconds since epoch)
        last_synced_at (Optional[datetime]): Last sync time (PostgreSQL only)
    
    Note:
        - All monetary amounts are stored as Decimal for precision
        - TigerBeetle stores amounts in cents (integer), we convert to dollars (Decimal)
        - Balance is always calculated as: credits_posted - debits_posted
    """
    
    account_id: int
    debits_pending: Decimal
    debits_posted: Decimal
    credits_pending: Decimal
    credits_posted: Decimal
    balance: Decimal
    ledger: int
    code: int
    timestamp: Optional[int] = None
    last_synced_at: Optional[datetime] = None
    
    def __post_init__(self):
        """
        Validate data after initialization.
        
        Ensures:
        - All monetary values are Decimal type
        - Balance is consistent with posted amounts
        - Account ID is positive
        """
        # Convert to Decimal if not already
        self.debits_pending = Decimal(str(self.debits_pending))
        self.debits_posted = Decimal(str(self.debits_posted))
        self.credits_pending = Decimal(str(self.credits_pending))
        self.credits_posted = Decimal(str(self.credits_posted))
        self.balance = Decimal(str(self.balance))
        
        # Validate account ID
        if self.account_id <= 0:
            raise ValueError(f"Invalid account_id: {self.account_id}")
        
        # Validate balance calculation
        calculated_balance = self.credits_posted - self.debits_posted
        if abs(self.balance - calculated_balance) > Decimal('0.01'):
            raise ValueError(
                f"Balance mismatch: provided={self.balance}, "
                f"calculated={calculated_balance}"
            )
    
    @classmethod
    def from_tigerbeetle(cls, data: Dict[str, Any]) -> 'AccountBalance':
        """
        Create AccountBalance from TigerBeetle account data.
        
        TigerBeetle stores amounts as 64-bit unsigned integers representing cents.
        This method converts them to Decimal dollars for easier handling.
        
        Args:
            data: Dictionary containing TigerBeetle account data with keys:
                - id: Account ID (string or int, 128-bit)
                - debits_pending: Pending debits in cents (int)
                - debits_posted: Posted debits in cents (int)
                - credits_pending: Pending credits in cents (int)
                - credits_posted: Posted credits in cents (int)
                - ledger: Ledger ID (int)
                - code: Account type code (int)
                - timestamp: Creation timestamp in nanoseconds (int)
        
        Returns:
            AccountBalance instance with amounts converted to dollars
        
        Example:
            >>> tigerbeetle_data = {
            ...     'id': '123456789012345678901234567890123456',
            ...     'debits_pending': 5000,      # $50.00
            ...     'debits_posted': 100000,     # $1,000.00
            ...     'credits_pending': 0,
            ...     'credits_posted': 150000,    # $1,500.00
            ...     'ledger': 1,                 # NGN
            ...     'code': 1,                   # Checking
            ...     'timestamp': 1730472645000000000
            ... }
            >>> account = AccountBalance.from_tigerbeetle(tigerbeetle_data)
            >>> print(account.balance)
            500.00
            >>> print(account.debits_posted)
            1000.00
        
        Note:
            - TigerBeetle uses 128-bit account IDs (very large integers)
            - Amounts are stored in cents to avoid floating-point issues
            - We divide by 100 to convert cents to dollars
            - Timestamp is in nanoseconds since Unix epoch
        """
        # Parse account ID (handle both string and int)
        account_id = int(data['id'])
        
        # Convert amounts from cents to dollars
        # TigerBeetle stores as integer cents, we convert to Decimal dollars
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
            code=data['code'],
            timestamp=data.get('timestamp'),
            last_synced_at=None  # Not available from TigerBeetle
        )
    
    @classmethod
    def from_postgres(cls, row: Dict[str, Any]) -> 'AccountBalance':
        """
        Create AccountBalance from PostgreSQL row data.
        
        PostgreSQL stores amounts as NUMERIC(20, 2) which are already in dollars.
        This method converts them to Decimal for consistency.
        
        Args:
            row: Dictionary containing PostgreSQL row data with keys:
                - tigerbeetle_account_id: Account ID (Decimal or int)
                - debits_pending: Pending debits in dollars (Decimal)
                - debits_posted: Posted debits in dollars (Decimal)
                - credits_pending: Pending credits in dollars (Decimal)
                - credits_posted: Posted credits in dollars (Decimal)
                - balance: Net balance in dollars (Decimal, computed column)
                - ledger: Ledger ID (int)
                - code: Account type code (int)
                - last_synced_at: Last sync timestamp (datetime, optional)
        
        Returns:
            AccountBalance instance
        
        Example:
            >>> postgres_row = {
            ...     'tigerbeetle_account_id': Decimal('123456789012345678901234567890123456'),
            ...     'debits_pending': Decimal('50.00'),
            ...     'debits_posted': Decimal('1000.00'),
            ...     'credits_pending': Decimal('0.00'),
            ...     'credits_posted': Decimal('1500.00'),
            ...     'balance': Decimal('500.00'),
            ...     'ledger': 1,
            ...     'code': 1,
            ...     'last_synced_at': datetime(2025, 11, 1, 16, 0, 0)
            ... }
            >>> account = AccountBalance.from_postgres(postgres_row)
            >>> print(account.balance)
            500.00
            >>> print(account.last_synced_at)
            2025-11-01 16:00:00
        
        Note:
            - PostgreSQL stores amounts as NUMERIC(20, 2) (already in dollars)
            - Balance is a computed column: credits_posted - debits_posted
            - last_synced_at tracks when this data was synced from TigerBeetle
        """
        # Parse account ID (handle both Decimal and int from PostgreSQL)
        account_id = int(row['tigerbeetle_account_id'])
        
        # PostgreSQL amounts are already in dollars, just ensure Decimal type
        debits_pending = Decimal(str(row['debits_pending']))
        debits_posted = Decimal(str(row['debits_posted']))
        credits_pending = Decimal(str(row['credits_pending']))
        credits_posted = Decimal(str(row['credits_posted']))
        balance = Decimal(str(row['balance']))
        
        return cls(
            account_id=account_id,
            debits_pending=debits_pending,
            debits_posted=debits_posted,
            credits_pending=credits_pending,
            credits_posted=credits_posted,
            balance=balance,
            ledger=row['ledger'],
            code=row['code'],
            timestamp=None,  # Not stored in PostgreSQL
            last_synced_at=row.get('last_synced_at')
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to dictionary with string values for JSON serialization.
        
        Returns:
            Dictionary with all fields, Decimal values converted to strings
        
        Example:
            >>> account = AccountBalance(...)
            >>> data = account.to_dict()
            >>> print(data)
            {
                'account_id': 123456789012345678901234567890123456,
                'debits_pending': '50.00',
                'debits_posted': '1000.00',
                'credits_pending': '0.00',
                'credits_posted': '1500.00',
                'balance': '500.00',
                'ledger': 1,
                'code': 1,
                'timestamp': 1730472645000000000,
                'last_synced_at': '2025-11-01T16:00:00'
            }
        """
        return {
            'account_id': self.account_id,
            'debits_pending': str(self.debits_pending),
            'debits_posted': str(self.debits_posted),
            'credits_pending': str(self.credits_pending),
            'credits_posted': str(self.credits_posted),
            'balance': str(self.balance),
            'ledger': self.ledger,
            'code': self.code,
            'timestamp': self.timestamp,
            'last_synced_at': self.last_synced_at.isoformat() if self.last_synced_at else None
        }
    
    def compare_with(self, other: 'AccountBalance', tolerance: Decimal = Decimal('0.01')) -> Dict[str, Any]:
        """
        Compare this account with another and return differences.
        
        Args:
            other: Another AccountBalance to compare with
            tolerance: Maximum allowed difference (default: $0.01)
        
        Returns:
            Dictionary containing:
                - matches: Boolean indicating if accounts match within tolerance
                - differences: List of field names with differences
                - details: Dictionary of field-by-field comparison
        
        Example:
            >>> tb_account = AccountBalance.from_tigerbeetle(tb_data)
            >>> pg_account = AccountBalance.from_postgres(pg_data)
            >>> comparison = tb_account.compare_with(pg_account)
            >>> if not comparison['matches']:
            ...     print(f"Differences: {comparison['differences']}")
            ...     print(f"Details: {comparison['details']}")
        """
        if self.account_id != other.account_id:
            raise ValueError("Cannot compare accounts with different IDs")
        
        differences = []
        details = {}
        
        # Compare each field
        fields_to_compare = [
            'debits_pending',
            'debits_posted',
            'credits_pending',
            'credits_posted',
            'balance'
        ]
        
        for field_name in fields_to_compare:
            self_value = getattr(self, field_name)
            other_value = getattr(other, field_name)
            diff = abs(self_value - other_value)
            
            if diff > tolerance:
                differences.append(field_name)
                details[field_name] = {
                    'self': str(self_value),
                    'other': str(other_value),
                    'difference': str(diff)
                }
        
        # Compare non-monetary fields
        if self.ledger != other.ledger:
            differences.append('ledger')
            details['ledger'] = {
                'self': self.ledger,
                'other': other.ledger
            }
        
        if self.code != other.code:
            differences.append('code')
            details['code'] = {
                'self': self.code,
                'other': other.code
            }
        
        return {
            'matches': len(differences) == 0,
            'differences': differences,
            'details': details
        }
    
    def __str__(self) -> str:
        """String representation for logging"""
        return (
            f"AccountBalance(id={self.account_id}, "
            f"balance={self.balance}, "
            f"ledger={self.ledger}, "
            f"code={self.code})"
        )
    
    def __repr__(self) -> str:
        """Detailed representation for debugging"""
        return (
            f"AccountBalance("
            f"account_id={self.account_id}, "
            f"debits_pending={self.debits_pending}, "
            f"debits_posted={self.debits_posted}, "
            f"credits_pending={self.credits_pending}, "
            f"credits_posted={self.credits_posted}, "
            f"balance={self.balance}, "
            f"ledger={self.ledger}, "
            f"code={self.code}, "
            f"timestamp={self.timestamp}, "
            f"last_synced_at={self.last_synced_at})"
        )


# ============================================================================
# Usage Examples
# ============================================================================

def example_tigerbeetle_mapping():
    """Example: Creating AccountBalance from TigerBeetle data"""
    
    # Simulated TigerBeetle API response
    tigerbeetle_response = {
        'id': '123456789012345678901234567890123456',
        'debits_pending': 5000,        # $50.00 in cents
        'debits_posted': 100000,       # $1,000.00 in cents
        'credits_pending': 0,
        'credits_posted': 150000,      # $1,500.00 in cents
        'ledger': 1,                   # NGN (Nigerian Naira)
        'code': 1,                     # Checking account
        'timestamp': 1730472645000000000,  # Nanoseconds
        'flags': 0,
        'user_data': 0
    }
    
    # Create AccountBalance
    account = AccountBalance.from_tigerbeetle(tigerbeetle_response)
    
    print("TigerBeetle Account:")
    print(f"  Account ID: {account.account_id}")
    print(f"  Balance: ${account.balance}")
    print(f"  Debits Posted: ${account.debits_posted}")
    print(f"  Credits Posted: ${account.credits_posted}")
    print(f"  Ledger: {account.ledger}")
    print(f"  Code: {account.code}")
    
    return account


def example_postgres_mapping():
    """Example: Creating AccountBalance from PostgreSQL data"""
    
    # Simulated PostgreSQL query result
    postgres_row = {
        'tigerbeetle_account_id': Decimal('123456789012345678901234567890123456'),
        'debits_pending': Decimal('50.00'),
        'debits_posted': Decimal('1000.00'),
        'credits_pending': Decimal('0.00'),
        'credits_posted': Decimal('1500.00'),
        'balance': Decimal('500.00'),
        'ledger': 1,
        'code': 1,
        'last_synced_at': datetime(2025, 11, 1, 16, 0, 0),
        'created_at': datetime(2025, 10, 1, 10, 0, 0)
    }
    
    # Create AccountBalance
    account = AccountBalance.from_postgres(postgres_row)
    
    print("\nPostgreSQL Account:")
    print(f"  Account ID: {account.account_id}")
    print(f"  Balance: ${account.balance}")
    print(f"  Debits Posted: ${account.debits_posted}")
    print(f"  Credits Posted: ${account.credits_posted}")
    print(f"  Last Synced: {account.last_synced_at}")
    
    return account


def example_comparison():
    """Example: Comparing accounts from different sources"""
    
    # TigerBeetle account (source of truth)
    tb_data = {
        'id': '123456789012345678901234567890123456',
        'debits_pending': 5000,
        'debits_posted': 100000,
        'credits_pending': 0,
        'credits_posted': 150000,
        'ledger': 1,
        'code': 1,
        'timestamp': 1730472645000000000
    }
    tb_account = AccountBalance.from_tigerbeetle(tb_data)
    
    # PostgreSQL account (synced copy)
    pg_data = {
        'tigerbeetle_account_id': Decimal('123456789012345678901234567890123456'),
        'debits_pending': Decimal('50.00'),
        'debits_posted': Decimal('1000.05'),  # Slight difference!
        'credits_pending': Decimal('0.00'),
        'credits_posted': Decimal('1500.00'),
        'balance': Decimal('499.95'),
        'ledger': 1,
        'code': 1,
        'last_synced_at': datetime(2025, 11, 1, 16, 0, 0)
    }
    pg_account = AccountBalance.from_postgres(pg_data)
    
    # Compare
    comparison = tb_account.compare_with(pg_account, tolerance=Decimal('0.01'))
    
    print("\nComparison Result:")
    print(f"  Matches: {comparison['matches']}")
    if not comparison['matches']:
        print(f"  Differences: {comparison['differences']}")
        for field, details in comparison['details'].items():
            print(f"    {field}:")
            print(f"      TigerBeetle: {details['self']}")
            print(f"      PostgreSQL: {details['other']}")
            if 'difference' in details:
                print(f"      Difference: {details['difference']}")


def example_serialization():
    """Example: Serializing AccountBalance for JSON/logging"""
    
    tb_data = {
        'id': '123456789012345678901234567890123456',
        'debits_pending': 5000,
        'debits_posted': 100000,
        'credits_pending': 0,
        'credits_posted': 150000,
        'ledger': 1,
        'code': 1,
        'timestamp': 1730472645000000000
    }
    account = AccountBalance.from_tigerbeetle(tb_data)
    
    # Convert to dictionary for JSON
    data = account.to_dict()
    
    print("\nSerialized Account:")
    import json
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    print("=" * 60)
    print("AccountBalance Dataclass Examples")
    print("=" * 60)
    
    example_tigerbeetle_mapping()
    example_postgres_mapping()
    example_comparison()
    example_serialization()
