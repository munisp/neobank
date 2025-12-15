#!/usr/bin/env python3
"""
Discrepancy and ReconciliationReport Dataclasses

Complete implementation of the dataclasses used in the reconciliation service
to track discrepancies and generate comprehensive reports.

Author: NeoBank Platform Team
Date: 2025-11-01
"""

from dataclasses import dataclass, field
from decimal import Decimal
from datetime import datetime
from typing import List, Optional, Dict, Any
import json


# ============================================================================
# Discrepancy Dataclass
# ============================================================================

@dataclass
class Discrepancy:
    """
    Represents a single discrepancy found during reconciliation.
    
    A discrepancy can be:
    - missing_in_postgres: Account exists in TigerBeetle but not PostgreSQL
    - missing_in_tigerbeetle: Account exists in PostgreSQL but not TigerBeetle
    - balance_mismatch: Account balances don't match between systems
    - field_mismatch: Individual fields (debits, credits) don't match
    
    Attributes:
        account_id: The account ID where the discrepancy was found
        discrepancy_type: Type of discrepancy (see above)
        tigerbeetle_balance: Balance in TigerBeetle (None if account missing)
        postgres_balance: Balance in PostgreSQL (None if account missing)
        difference: Difference between balances (TigerBeetle - PostgreSQL)
        details: Human-readable description of the discrepancy
        severity: Severity level ('critical', 'warning', 'info')
    """
    
    account_id: int
    discrepancy_type: str
    tigerbeetle_balance: Optional[Decimal]
    postgres_balance: Optional[Decimal]
    difference: Decimal
    details: str
    severity: str
    
    def __post_init__(self):
        """Validate discrepancy data after initialization"""
        # Validate severity
        valid_severities = ['critical', 'warning', 'info']
        if self.severity not in valid_severities:
            raise ValueError(f"Invalid severity: {self.severity}. Must be one of {valid_severities}")
        
        # Validate discrepancy type
        valid_types = [
            'missing_in_postgres',
            'missing_in_tigerbeetle',
            'balance_mismatch',
            'field_mismatch'
        ]
        if self.discrepancy_type not in valid_types:
            raise ValueError(f"Invalid discrepancy_type: {self.discrepancy_type}. Must be one of {valid_types}")
        
        # Convert balances to Decimal if not None
        if self.tigerbeetle_balance is not None:
            self.tigerbeetle_balance = Decimal(str(self.tigerbeetle_balance))
        if self.postgres_balance is not None:
            self.postgres_balance = Decimal(str(self.postgres_balance))
        self.difference = Decimal(str(self.difference))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'account_id': self.account_id,
            'discrepancy_type': self.discrepancy_type,
            'tigerbeetle_balance': str(self.tigerbeetle_balance) if self.tigerbeetle_balance is not None else None,
            'postgres_balance': str(self.postgres_balance) if self.postgres_balance is not None else None,
            'difference': str(self.difference),
            'details': self.details,
            'severity': self.severity
        }
    
    def __str__(self) -> str:
        """Human-readable string representation"""
        return f"Discrepancy(account={self.account_id}, type={self.discrepancy_type}, severity={self.severity})"
    
    def __repr__(self) -> str:
        """Detailed string representation for debugging"""
        return (
            f"Discrepancy("
            f"account_id={self.account_id}, "
            f"type={self.discrepancy_type}, "
            f"tb_balance={self.tigerbeetle_balance}, "
            f"pg_balance={self.postgres_balance}, "
            f"diff={self.difference}, "
            f"severity={self.severity})"
        )


# ============================================================================
# ReconciliationReport Dataclass
# ============================================================================

@dataclass
class ReconciliationReport:
    """
    Comprehensive report of a reconciliation run.
    
    Contains all information about a single reconciliation execution,
    including summary statistics, discrepancies found, and execution metadata.
    
    Attributes:
        timestamp: When the reconciliation was run
        total_accounts_tigerbeetle: Number of accounts in TigerBeetle
        total_accounts_postgres: Number of accounts in PostgreSQL
        accounts_matched: Number of accounts present in both systems
        discrepancies: List of all discrepancies found
        total_tigerbeetle_balance: Sum of all balances in TigerBeetle
        total_postgres_balance: Sum of all balances in PostgreSQL
        balance_difference: Difference between total balances
        duration_seconds: How long the reconciliation took
        status: Overall status ('success', 'warning', 'critical')
    """
    
    timestamp: datetime
    total_accounts_tigerbeetle: int
    total_accounts_postgres: int
    accounts_matched: int
    discrepancies: List[Discrepancy]
    total_tigerbeetle_balance: Decimal
    total_postgres_balance: Decimal
    balance_difference: Decimal
    duration_seconds: float
    status: str
    
    def __post_init__(self):
        """Validate report data after initialization"""
        # Validate status
        valid_statuses = ['success', 'warning', 'critical']
        if self.status not in valid_statuses:
            raise ValueError(f"Invalid status: {self.status}. Must be one of {valid_statuses}")
        
        # Convert balances to Decimal
        self.total_tigerbeetle_balance = Decimal(str(self.total_tigerbeetle_balance))
        self.total_postgres_balance = Decimal(str(self.total_postgres_balance))
        self.balance_difference = Decimal(str(self.balance_difference))
        
        # Validate counts
        if self.total_accounts_tigerbeetle < 0:
            raise ValueError("total_accounts_tigerbeetle cannot be negative")
        if self.total_accounts_postgres < 0:
            raise ValueError("total_accounts_postgres cannot be negative")
        if self.accounts_matched < 0:
            raise ValueError("accounts_matched cannot be negative")
        if self.accounts_matched > min(self.total_accounts_tigerbeetle, self.total_accounts_postgres):
            raise ValueError("accounts_matched cannot exceed total accounts in either system")
    
    @property
    def discrepancy_count(self) -> int:
        """Total number of discrepancies"""
        return len(self.discrepancies)
    
    @property
    def critical_discrepancy_count(self) -> int:
        """Number of critical discrepancies"""
        return len([d for d in self.discrepancies if d.severity == 'critical'])
    
    @property
    def warning_discrepancy_count(self) -> int:
        """Number of warning discrepancies"""
        return len([d for d in self.discrepancies if d.severity == 'warning'])
    
    @property
    def info_discrepancy_count(self) -> int:
        """Number of info discrepancies"""
        return len([d for d in self.discrepancies if d.severity == 'info'])
    
    @property
    def accounts_missing_in_postgres(self) -> int:
        """Number of accounts missing in PostgreSQL"""
        return len([d for d in self.discrepancies if d.discrepancy_type == 'missing_in_postgres'])
    
    @property
    def accounts_missing_in_tigerbeetle(self) -> int:
        """Number of accounts missing in TigerBeetle"""
        return len([d for d in self.discrepancies if d.discrepancy_type == 'missing_in_tigerbeetle'])
    
    @property
    def balance_mismatches(self) -> int:
        """Number of balance mismatches"""
        return len([d for d in self.discrepancies if d.discrepancy_type == 'balance_mismatch'])
    
    @property
    def field_mismatches(self) -> int:
        """Number of field mismatches"""
        return len([d for d in self.discrepancies if d.discrepancy_type == 'field_mismatch'])
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'total_accounts_tigerbeetle': self.total_accounts_tigerbeetle,
            'total_accounts_postgres': self.total_accounts_postgres,
            'accounts_matched': self.accounts_matched,
            'discrepancy_count': self.discrepancy_count,
            'critical_discrepancies': self.critical_discrepancy_count,
            'warning_discrepancies': self.warning_discrepancy_count,
            'info_discrepancies': self.info_discrepancy_count,
            'accounts_missing_in_postgres': self.accounts_missing_in_postgres,
            'accounts_missing_in_tigerbeetle': self.accounts_missing_in_tigerbeetle,
            'balance_mismatches': self.balance_mismatches,
            'field_mismatches': self.field_mismatches,
            'total_tigerbeetle_balance': str(self.total_tigerbeetle_balance),
            'total_postgres_balance': str(self.total_postgres_balance),
            'balance_difference': str(self.balance_difference),
            'duration_seconds': self.duration_seconds,
            'status': self.status,
            'discrepancies': [d.to_dict() for d in self.discrepancies]
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), indent=indent)
    
    def summary(self) -> str:
        """Generate human-readable summary"""
        lines = [
            "=" * 80,
            "RECONCILIATION REPORT",
            "=" * 80,
            f"Timestamp: {self.timestamp.isoformat()}",
            f"Status: {self.status.upper()}",
            f"Duration: {self.duration_seconds:.2f} seconds",
            "",
            "ACCOUNT SUMMARY",
            "-" * 80,
            f"TigerBeetle Accounts: {self.total_accounts_tigerbeetle:,}",
            f"PostgreSQL Accounts: {self.total_accounts_postgres:,}",
            f"Matched Accounts: {self.accounts_matched:,}",
            f"Missing in PostgreSQL: {self.accounts_missing_in_postgres:,}",
            f"Missing in TigerBeetle: {self.accounts_missing_in_tigerbeetle:,}",
            "",
            "BALANCE SUMMARY",
            "-" * 80,
            f"TigerBeetle Total: ${self.total_tigerbeetle_balance:,.2f}",
            f"PostgreSQL Total: ${self.total_postgres_balance:,.2f}",
            f"Difference: ${self.balance_difference:,.2f}",
            "",
            "DISCREPANCY SUMMARY",
            "-" * 80,
            f"Total Discrepancies: {self.discrepancy_count:,}",
            f"  Critical: {self.critical_discrepancy_count:,}",
            f"  Warning: {self.warning_discrepancy_count:,}",
            f"  Info: {self.info_discrepancy_count:,}",
            "",
            "DISCREPANCY BREAKDOWN",
            "-" * 80,
            f"Balance Mismatches: {self.balance_mismatches:,}",
            f"Field Mismatches: {self.field_mismatches:,}",
            f"Missing in PostgreSQL: {self.accounts_missing_in_postgres:,}",
            f"Missing in TigerBeetle: {self.accounts_missing_in_tigerbeetle:,}",
        ]
        
        if self.discrepancies:
            lines.extend([
                "",
                "DISCREPANCY DETAILS (First 10)",
                "-" * 80
            ])
            for i, disc in enumerate(self.discrepancies[:10], 1):
                lines.append(f"{i}. {disc.details}")
        
        lines.append("=" * 80)
        
        return "\n".join(lines)
    
    def __str__(self) -> str:
        """Human-readable string representation"""
        return (
            f"ReconciliationReport("
            f"status={self.status}, "
            f"accounts={self.accounts_matched}/{self.total_accounts_tigerbeetle}, "
            f"discrepancies={self.discrepancy_count})"
        )
    
    def __repr__(self) -> str:
        """Detailed string representation for debugging"""
        return (
            f"ReconciliationReport("
            f"timestamp={self.timestamp.isoformat()}, "
            f"status={self.status}, "
            f"tb_accounts={self.total_accounts_tigerbeetle}, "
            f"pg_accounts={self.total_accounts_postgres}, "
            f"matched={self.accounts_matched}, "
            f"discrepancies={self.discrepancy_count}, "
            f"duration={self.duration_seconds:.2f}s)"
        )


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    print("=" * 80)
    print("Discrepancy and ReconciliationReport Dataclasses - Examples")
    print("=" * 80)
    print()
    
    # Example 1: Create a missing account discrepancy
    print("Example 1: Missing Account Discrepancy")
    print("-" * 80)
    disc1 = Discrepancy(
        account_id=12345,
        discrepancy_type='missing_in_postgres',
        tigerbeetle_balance=Decimal('1000.00'),
        postgres_balance=None,
        difference=Decimal('1000.00'),
        details="Account 12345 exists in TigerBeetle but missing in PostgreSQL",
        severity='critical'
    )
    print(disc1)
    print(f"Details: {disc1.details}")
    print(f"Severity: {disc1.severity}")
    print(f"Dictionary: {json.dumps(disc1.to_dict(), indent=2)}")
    print()
    
    # Example 2: Create a balance mismatch discrepancy
    print("Example 2: Balance Mismatch Discrepancy")
    print("-" * 80)
    disc2 = Discrepancy(
        account_id=67890,
        discrepancy_type='balance_mismatch',
        tigerbeetle_balance=Decimal('5000.00'),
        postgres_balance=Decimal('4850.00'),
        difference=Decimal('150.00'),
        details="Balance mismatch: TigerBeetle=$5000.00, PostgreSQL=$4850.00, Diff=$150.00",
        severity='critical'
    )
    print(disc2)
    print(f"TigerBeetle Balance: ${disc2.tigerbeetle_balance}")
    print(f"PostgreSQL Balance: ${disc2.postgres_balance}")
    print(f"Difference: ${disc2.difference}")
    print()
    
    # Example 3: Create a field mismatch discrepancy
    print("Example 3: Field Mismatch Discrepancy")
    print("-" * 80)
    disc3 = Discrepancy(
        account_id=11111,
        discrepancy_type='field_mismatch',
        tigerbeetle_balance=Decimal('2500.00'),
        postgres_balance=Decimal('2500.00'),
        difference=Decimal('0.00'),
        details="Field mismatches: debits_pending: TB=50.00, PG=50.05",
        severity='warning'
    )
    print(disc3)
    print(f"Details: {disc3.details}")
    print()
    
    # Example 4: Create a reconciliation report (success)
    print("Example 4: Successful Reconciliation Report")
    print("-" * 80)
    report_success = ReconciliationReport(
        timestamp=datetime.now(),
        total_accounts_tigerbeetle=1523,
        total_accounts_postgres=1523,
        accounts_matched=1523,
        discrepancies=[],
        total_tigerbeetle_balance=Decimal('15234567.89'),
        total_postgres_balance=Decimal('15234567.89'),
        balance_difference=Decimal('0.00'),
        duration_seconds=2.345,
        status='success'
    )
    print(report_success)
    print(f"Discrepancy Count: {report_success.discrepancy_count}")
    print(f"Critical Count: {report_success.critical_discrepancy_count}")
    print()
    print(report_success.summary())
    print()
    
    # Example 5: Create a reconciliation report (with discrepancies)
    print("Example 5: Reconciliation Report with Discrepancies")
    print("-" * 80)
    report_with_issues = ReconciliationReport(
        timestamp=datetime.now(),
        total_accounts_tigerbeetle=1523,
        total_accounts_postgres=1521,
        accounts_matched=1521,
        discrepancies=[disc1, disc2, disc3],
        total_tigerbeetle_balance=Decimal('15234567.89'),
        total_postgres_balance=Decimal('15231917.89'),
        balance_difference=Decimal('2650.00'),
        duration_seconds=2.567,
        status='critical'
    )
    print(report_with_issues)
    print(f"Discrepancy Count: {report_with_issues.discrepancy_count}")
    print(f"Critical Count: {report_with_issues.critical_discrepancy_count}")
    print(f"Warning Count: {report_with_issues.warning_discrepancy_count}")
    print(f"Missing in PostgreSQL: {report_with_issues.accounts_missing_in_postgres}")
    print(f"Balance Mismatches: {report_with_issues.balance_mismatches}")
    print()
    print(report_with_issues.summary())
    print()
    
    # Example 6: JSON export
    print("Example 6: JSON Export")
    print("-" * 80)
    print(report_with_issues.to_json())
    print()
    
    # Example 7: Property access
    print("Example 7: Report Properties")
    print("-" * 80)
    print(f"Total Discrepancies: {report_with_issues.discrepancy_count}")
    print(f"Critical: {report_with_issues.critical_discrepancy_count}")
    print(f"Warning: {report_with_issues.warning_discrepancy_count}")
    print(f"Info: {report_with_issues.info_discrepancy_count}")
    print(f"Missing in PostgreSQL: {report_with_issues.accounts_missing_in_postgres}")
    print(f"Missing in TigerBeetle: {report_with_issues.accounts_missing_in_tigerbeetle}")
    print(f"Balance Mismatches: {report_with_issues.balance_mismatches}")
    print(f"Field Mismatches: {report_with_issues.field_mismatches}")
    print()
    
    print("=" * 80)
    print("All examples completed successfully!")
    print("=" * 80)
