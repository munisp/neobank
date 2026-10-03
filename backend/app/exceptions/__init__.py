"""
Exception package: domain exceptions + FastAPI handler wiring.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .accounts import (
    AccountException,
    AccountNotFoundError,
    InsufficientBalanceError,
    AccountInactiveError,
    DailyLimitExceededError,
    MonthlyLimitExceededError,
    TigerBeetleUnavailableError,
    AccountFrozenError,
    InvalidAccountTypeError,
    DuplicateAccountError,
    AccountClosedError,
)
from .auth import (
    AuthenticationError,
    UserAlreadyExistsError,
    UserNotFoundError,
    InvalidCredentialsError,
    AccountLockedError,
    InvalidTokenError,
    TokenExpiredError,
    InsufficientPermissionsError,
    EmailNotVerifiedError,
    PhoneNotVerifiedError,
    KYCNotCompletedError,
)

logger = logging.getLogger(__name__)

__all__ = [
    "AccountException", "AccountNotFoundError", "InsufficientBalanceError",
    "AccountInactiveError", "DailyLimitExceededError", "MonthlyLimitExceededError",
    "TigerBeetleUnavailableError", "AccountFrozenError", "InvalidAccountTypeError",
    "DuplicateAccountError", "AccountClosedError",
    "AuthenticationError", "UserAlreadyExistsError", "UserNotFoundError",
    "InvalidCredentialsError", "AccountLockedError", "InvalidTokenError",
    "TokenExpiredError", "InsufficientPermissionsError", "EmailNotVerifiedError",
    "PhoneNotVerifiedError", "KYCNotCompletedError",
    "setup_exception_handlers",
]


def _detail(exc: Exception) -> str:
    return getattr(exc, "detail", None) or str(exc) or exc.__class__.__name__


def setup_exception_handlers(app: FastAPI) -> None:
    """Register consistent JSON error responses for domain exceptions."""

    account_status = {
        AccountNotFoundError: status.HTTP_404_NOT_FOUND,
        InsufficientBalanceError: status.HTTP_422_UNPROCESSABLE_ENTITY,
        AccountInactiveError: status.HTTP_409_CONFLICT,
        DailyLimitExceededError: status.HTTP_429_TOO_MANY_REQUESTS,
        MonthlyLimitExceededError: status.HTTP_429_TOO_MANY_REQUESTS,
        TigerBeetleUnavailableError: status.HTTP_503_SERVICE_UNAVAILABLE,
        AccountFrozenError: status.HTTP_409_CONFLICT,
        InvalidAccountTypeError: status.HTTP_422_UNPROCESSABLE_ENTITY,
        DuplicateAccountError: status.HTTP_409_CONFLICT,
        AccountClosedError: status.HTTP_409_CONFLICT,
    }
    auth_status = {
        UserAlreadyExistsError: status.HTTP_409_CONFLICT,
        UserNotFoundError: status.HTTP_404_NOT_FOUND,
        InvalidCredentialsError: status.HTTP_401_UNAUTHORIZED,
        AccountLockedError: status.HTTP_423_LOCKED,
        InvalidTokenError: status.HTTP_401_UNAUTHORIZED,
        TokenExpiredError: status.HTTP_401_UNAUTHORIZED,
        InsufficientPermissionsError: status.HTTP_403_FORBIDDEN,
        EmailNotVerifiedError: status.HTTP_403_FORBIDDEN,
        PhoneNotVerifiedError: status.HTTP_403_FORBIDDEN,
        KYCNotCompletedError: status.HTTP_403_FORBIDDEN,
    }

    def _make_handler(default_status: int, mapping: dict):
        async def handler(request: Request, exc: Exception) -> JSONResponse:
            status_code = next(
                (code for cls, code in mapping.items() if isinstance(exc, cls)),
                default_status,
            )
            return JSONResponse(status_code=status_code, content={"detail": _detail(exc)})
        return handler

    app.add_exception_handler(AccountException, _make_handler(status.HTTP_400_BAD_REQUEST, account_status))
    app.add_exception_handler(AuthenticationError, _make_handler(status.HTTP_401_UNAUTHORIZED, auth_status))

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": "Validation error", "errors": exc.errors()},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )
