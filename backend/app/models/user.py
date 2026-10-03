"""
User model compatibility shim.

Canonical definitions live in `database.models`. This module re-exports them
plus the shared bcrypt password context for legacy imports.
"""

from database.models import (
    User,
    UserRole,
    UserStatus,
    AuthenticationAttempt,
    RefreshToken,
    pwd_context,
)

__all__ = [
    "User",
    "UserRole",
    "UserStatus",
    "AuthenticationAttempt",
    "RefreshToken",
    "pwd_context",
]
