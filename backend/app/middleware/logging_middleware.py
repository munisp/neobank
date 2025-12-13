"""
Logging Middleware - Comprehensive Request/Response Logging

Provides:
- Structured logging with correlation IDs
- Request/response timing
- Error tracking
- Audit logging for sensitive operations
"""

import asyncio
import time
import uuid
from typing import Optional, Dict, Any, Callable
from contextvars import ContextVar
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

correlation_id_var: ContextVar[str] = ContextVar('correlation_id', default='')
user_id_var: ContextVar[str] = ContextVar('user_id', default='')

logger = structlog.get_logger(__name__)


def get_correlation_id() -> str:
    """Get current correlation ID from context"""
    return correlation_id_var.get()


def get_user_id() -> str:
    """Get current user ID from context"""
    return user_id_var.get()


def add_correlation_id(logger, method_name, event_dict):
    """Structlog processor to add correlation ID to all log entries"""
    correlation_id = correlation_id_var.get()
    if correlation_id:
        event_dict['correlation_id'] = correlation_id
    
    user_id = user_id_var.get()
    if user_id:
        event_dict['user_id'] = user_id
    
    return event_dict


SENSITIVE_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/password",
    "/api/v1/kyc",
    "/api/v1/transfers",
    "/api/v1/payments",
}

SENSITIVE_HEADERS = {
    "authorization",
    "x-api-key",
    "cookie",
    "set-cookie",
}

SENSITIVE_FIELDS = {
    "password",
    "pin",
    "cvv",
    "card_number",
    "account_number",
    "bvn",
    "nin",
    "ssn",
    "secret",
    "token",
    "otp",
}


def sanitize_headers(headers: Dict[str, str]) -> Dict[str, str]:
    """Remove sensitive information from headers"""
    sanitized = {}
    for key, value in headers.items():
        if key.lower() in SENSITIVE_HEADERS:
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = value
    return sanitized


def sanitize_body(body: Dict[str, Any]) -> Dict[str, Any]:
    """Remove sensitive information from request/response body"""
    if not isinstance(body, dict):
        return body
    
    sanitized = {}
    for key, value in body.items():
        if key.lower() in SENSITIVE_FIELDS:
            sanitized[key] = "[REDACTED]"
        elif isinstance(value, dict):
            sanitized[key] = sanitize_body(value)
        elif isinstance(value, list):
            sanitized[key] = [sanitize_body(item) if isinstance(item, dict) else item for item in value]
        else:
            sanitized[key] = value
    return sanitized


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for comprehensive request/response logging"""
    
    def __init__(
        self,
        app,
        get_user_id_func: Optional[Callable] = None,
        log_request_body: bool = False,
        log_response_body: bool = False,
        excluded_paths: set = None
    ):
        super().__init__(app)
        self.get_user_id_func = get_user_id_func
        self.log_request_body = log_request_body
        self.log_response_body = log_response_body
        self.excluded_paths = excluded_paths or {"/health", "/metrics", "/favicon.ico"}
    
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in self.excluded_paths:
            return await call_next(request)
        
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        correlation_id_var.set(correlation_id)
        
        user_id = ""
        if self.get_user_id_func:
            try:
                user_id = await self.get_user_id_func(request) or ""
                user_id_var.set(user_id)
            except Exception:
                pass
        
        start_time = time.time()
        
        request_info = {
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "client_ip": self._get_client_ip(request),
            "user_agent": request.headers.get("user-agent", ""),
        }
        
        if self.log_request_body and request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.json()
                request_info["body"] = sanitize_body(body)
            except Exception:
                pass
        
        logger.info("request_started", **request_info)
        
        response = None
        error = None
        
        try:
            response = await call_next(request)
        except Exception as e:
            error = e
            logger.error(
                "request_error",
                error_type=type(e).__name__,
                error_message=str(e),
                **request_info
            )
            raise
        finally:
            duration_ms = (time.time() - start_time) * 1000
            
            response_info = {
                **request_info,
                "duration_ms": round(duration_ms, 2),
                "status_code": response.status_code if response else 500,
            }
            
            if response and response.status_code >= 400:
                logger.warning("request_completed", **response_info)
            else:
                logger.info("request_completed", **response_info)
            
            if request.url.path in SENSITIVE_PATHS:
                await self._log_audit(request, response, user_id, duration_ms)
        
        if response:
            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    async def _log_audit(self, request: Request, response: Response, user_id: str, duration_ms: float):
        """Log audit entry for sensitive operations"""
        audit_entry = {
            "event_type": "api_access",
            "user_id": user_id,
            "method": request.method,
            "path": request.url.path,
            "client_ip": self._get_client_ip(request),
            "status_code": response.status_code if response else 500,
            "duration_ms": round(duration_ms, 2),
            "user_agent": request.headers.get("user-agent", ""),
        }
        logger.info("audit_log", **audit_entry)


class AuditLogger:
    """Dedicated audit logger for security-sensitive operations"""
    
    def __init__(self):
        self.logger = structlog.get_logger("audit")
    
    async def log_login_attempt(self, user_id: str, success: bool, ip_address: str, user_agent: str, reason: str = None):
        self.logger.info(
            "login_attempt",
            user_id=user_id,
            success=success,
            ip_address=ip_address,
            user_agent=user_agent,
            reason=reason
        )
    
    async def log_password_change(self, user_id: str, ip_address: str):
        self.logger.info(
            "password_change",
            user_id=user_id,
            ip_address=ip_address
        )
    
    async def log_transaction(self, user_id: str, transaction_id: str, amount: float, currency: str, transaction_type: str, status: str):
        self.logger.info(
            "transaction",
            user_id=user_id,
            transaction_id=transaction_id,
            amount=amount,
            currency=currency,
            transaction_type=transaction_type,
            status=status
        )
    
    async def log_kyc_verification(self, user_id: str, verification_type: str, status: str, provider: str):
        self.logger.info(
            "kyc_verification",
            user_id=user_id,
            verification_type=verification_type,
            status=status,
            provider=provider
        )
    
    async def log_permission_change(self, admin_id: str, target_user_id: str, permission: str, action: str):
        self.logger.info(
            "permission_change",
            admin_id=admin_id,
            target_user_id=target_user_id,
            permission=permission,
            action=action
        )
    
    async def log_data_export(self, user_id: str, export_type: str, record_count: int):
        self.logger.info(
            "data_export",
            user_id=user_id,
            export_type=export_type,
            record_count=record_count
        )
    
    async def log_security_event(self, event_type: str, user_id: str, details: Dict[str, Any]):
        self.logger.warning(
            "security_event",
            event_type=event_type,
            user_id=user_id,
            **details
        )


audit_logger = AuditLogger()


def get_audit_logger() -> AuditLogger:
    return audit_logger


def configure_structlog():
    """Configure structlog for the application"""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            add_correlation_id,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(20),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
