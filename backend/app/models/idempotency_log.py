"""
IdempotencyLog compatibility shim.
Canonical definition lives in `database.models`.
"""

from database.models import IdempotencyLog

__all__ = ["IdempotencyLog"]
