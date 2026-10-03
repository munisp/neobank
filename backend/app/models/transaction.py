"""
Transaction model compatibility shim.
Canonical definitions live in `database.models`.
"""

from database.models import Transaction, TransactionType, TransactionStatus

__all__ = ["Transaction", "TransactionType", "TransactionStatus"]
