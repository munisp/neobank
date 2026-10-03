"""
Security middleware: request size guard + security response headers.
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB

# Paths where relaxed headers are acceptable (API docs)
_HEADER_EXEMPT_PREFIXES = ("/docs", "/redoc", "/openapi.json")


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Request size guard
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_CONTENT_LENGTH:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request entity too large"},
                    )
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})

        response = await call_next(request)

        if not request.url.path.startswith(_HEADER_EXEMPT_PREFIXES):
            response.headers.setdefault("Strict-Transport-Security",
                                        "max-age=31536000; includeSubDomains")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
            response.headers.setdefault("Permissions-Policy",
                                        "geolocation=(), microphone=(), camera=()")
            response.headers.setdefault("Cache-Control", "no-store")

        # Don't advertise the server stack
        if "server" in response.headers:
            del response.headers["server"]
        return response
