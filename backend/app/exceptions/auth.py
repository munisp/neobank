"""
Custom authentication exceptions
"""


class AuthenticationError(Exception):
    """Base authentication error"""
    def __init__(self, message: str = "Authentication failed"):
        self.message = message
        super().__init__(self.message)


class UserAlreadyExistsError(AuthenticationError):
    """User already exists error"""
    def __init__(self, message: str = "User already exists"):
        super().__init__(message)


class UserNotFoundError(AuthenticationError):
    """User not found error"""
    def __init__(self, message: str = "User not found"):
        super().__init__(message)


class InvalidCredentialsError(AuthenticationError):
    """Invalid credentials error"""
    def __init__(self, message: str = "Invalid credentials"):
        super().__init__(message)


class AccountLockedError(AuthenticationError):
    """Account locked error"""
    def __init__(self, message: str = "Account is locked"):
        super().__init__(message)


class InvalidTokenError(AuthenticationError):
    """Invalid token error"""
    def __init__(self, message: str = "Invalid token"):
        super().__init__(message)


class TokenExpiredError(AuthenticationError):
    """Token expired error"""
    def __init__(self, message: str = "Token has expired"):
        super().__init__(message)


class InsufficientPermissionsError(AuthenticationError):
    """Insufficient permissions error"""
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message)


class EmailNotVerifiedError(AuthenticationError):
    """Email not verified error"""
    def __init__(self, message: str = "Email address not verified"):
        super().__init__(message)


class PhoneNotVerifiedError(AuthenticationError):
    """Phone not verified error"""
    def __init__(self, message: str = "Phone number not verified"):
        super().__init__(message)


class KYCNotCompletedError(AuthenticationError):
    """KYC not completed error"""
    def __init__(self, message: str = "KYC verification not completed"):
        super().__init__(message)
