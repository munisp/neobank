"""
Account-related exceptions for NeoBank platform
"""


class AccountException(Exception):
    """Base exception for account-related errors"""
    pass


class AccountNotFoundError(AccountException):
    """Raised when an account is not found"""
    pass


class InsufficientBalanceError(AccountException):
    """Raised when account has insufficient balance for a transaction"""
    pass


class AccountInactiveError(AccountException):
    """Raised when trying to perform operations on an inactive account"""
    pass


class DailyLimitExceededError(AccountException):
    """Raised when daily transaction limit is exceeded"""
    pass


class MonthlyLimitExceededError(AccountException):
    """Raised when monthly transaction limit is exceeded"""
    pass


class TigerBeetleUnavailableError(AccountException):
    """Raised when TigerBeetle ledger is unavailable"""
    pass


class AccountFrozenError(AccountException):
    """Raised when account is frozen and cannot perform transactions"""
    pass


class InvalidAccountTypeError(AccountException):
    """Raised when an invalid account type is specified"""
    pass


class DuplicateAccountError(AccountException):
    """Raised when trying to create a duplicate account"""
    pass


class AccountClosedError(AccountException):
    """Raised when trying to perform operations on a closed account"""
    pass
