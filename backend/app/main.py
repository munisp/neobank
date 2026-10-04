"""
Production-grade NeoBank API
"""
import logging
import time
from contextlib import asynccontextmanager
from typing import Dict, Any

import structlog
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from config.settings import settings
from database.connection import init_database, close_database, DatabaseHealthCheck
from app.middleware.security import SecurityMiddleware
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.logging_middleware import LoggingMiddleware
from app.middleware.auth import AuthenticationMiddleware
from app.middleware.pbac_middleware import PBACMiddleware
from app.middleware.connectivity_middleware import (
    ConnectivityMiddleware,
    ProgressiveLoadingMiddleware,
    OfflineSyncMiddleware,
)
from app.routers import auth, transactions, dashboard, fraud
from app.exceptions import setup_exception_handlers
from app.services.opa_service import initialize_opa_service, close_opa_service, opa_service
from app.services.monitoring_service import initialize_monitoring, monitoring_service
from app.services.permify_service import initialize_permify_service, close_permify_service

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup
    logger.info("Starting NeoBank API", version=settings.APP_VERSION)

    try:
        await init_database()
        logger.info("Database initialized successfully")
        await initialize_opa_service()
        logger.info("OPA service initialized")
        await initialize_permify_service()
        logger.info("Permify service initialized")
        initialize_monitoring(app)
    except Exception as e:
        logger.error("Failed to initialize services", error=str(e))
        raise

    # Check database health
    if not await DatabaseHealthCheck.check_connection():
        logger.error("Database health check failed")
        raise HTTPException(status_code=503, detail="Database unavailable")

    logger.info("NeoBank API started successfully")
    yield

    # Shutdown
    logger.info("Shutting down NeoBank API")
    await close_database()
    await close_opa_service()
    await close_permify_service()
    logger.info("NeoBank API shutdown complete")


def create_application() -> FastAPI:
    """Create and configure FastAPI application"""

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Production-grade digital banking platform API",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    # Security middleware
    if not settings.DEBUG:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["localhost", "127.0.0.1", "testserver", "*.neobank.ng"]
        )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=settings.ALLOWED_METHODS,
        allow_headers=settings.ALLOWED_HEADERS,
    )

    # Compress responses > 1KB (JSON APIs benefit heavily; ~70% smaller payloads)
    from fastapi.middleware.gzip import GZipMiddleware
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    # Custom middleware (order matters - first added is last executed)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(SecurityMiddleware)
    # PBAC middleware - enforces policy-based access control using OPA and Permify
    app.add_middleware(
        PBACMiddleware,
        use_opa=settings.ENVIRONMENT == "production",
        use_permify=settings.ENVIRONMENT == "production",
    )
    # Authentication must run before PBAC so request.state.user is populated.
    app.add_middleware(AuthenticationMiddleware)
    # Connectivity middleware - adaptive data handling for low-connectivity environments
    app.add_middleware(ConnectivityMiddleware)
    app.add_middleware(ProgressiveLoadingMiddleware)
    app.add_middleware(OfflineSyncMiddleware)

    # Exception handlers
    setup_exception_handlers(app)

    # Metrics middleware
    @app.middleware("http")
    async def metrics_middleware(request: Request, call_next):
        start_time = time.time()

        response = await call_next(request)

        duration = time.time() - start_time

        # Record metrics
        requests_total = monitoring_service.get_metric("requests_total")
        if requests_total:
            requests_total.labels(
                endpoint=request.url.path,
                method=request.method
            ).inc()

        requests_latency = monitoring_service.get_metric("requests_latency")
        if requests_latency:
            requests_latency.labels(endpoint=request.url.path).observe(duration)

        return response

    # Health check endpoints
    @app.get("/health")
    async def health_check():
        """Basic health check"""
        return {"status": "healthy", "timestamp": time.time()}

    @app.get("/health/detailed")
    async def detailed_health_check():
        """Detailed health check with dependencies"""
        health_status = {
            "status": "healthy",
            "timestamp": time.time(),
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
        }

        # Check database
        db_healthy = await DatabaseHealthCheck.check_connection()
        health_status["database"] = {
            "status": "healthy" if db_healthy else "unhealthy",
            "details": await DatabaseHealthCheck.get_connection_info() if db_healthy else None
        }

        # Check OPA
        opa_healthy = await opa_service.evaluate_policy("system/health", {}) is not None
        health_status["opa"] = {"status": "healthy" if opa_healthy else "unhealthy"}

        # Overall status
        if not all([db_healthy, opa_healthy]):
            health_status["status"] = "unhealthy"

        status_code = 200 if health_status["status"] == "healthy" else 503
        return JSONResponse(content=health_status, status_code=status_code)

    @app.get("/metrics")
    async def metrics():
        """Prometheus metrics endpoint"""
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    # ------------------------------------------------------------------
    # Router registry
    # Convention: routers declare *relative* prefixes (e.g. "/transfers").
    # Only this module applies the "/api/v1" (canonical) and "/api"
    # (backward-compatible) version prefixes.
    # ------------------------------------------------------------------
    from app.routers import auth_router

    # Auth: canonical JWT router at /api/v1/auth + /api/auth
    app.include_router(auth_router.router, prefix="/api/v1")
    app.include_router(auth_router.router, prefix="/api")
    # Legacy auth router (older request/response shapes)
    app.include_router(auth.router, prefix="/api/legacy/auth", tags=["Authentication (legacy)"])

    # Direct-DB routers (canonical PostgreSQL CRUD)
    app.include_router(transactions.router, prefix="/api/v1")
    app.include_router(transactions.router, prefix="/api")
    app.include_router(dashboard.router, prefix="/api/v1")
    app.include_router(dashboard.router, prefix="/api")
    app.include_router(fraud.router, prefix="/api/v1")
    app.include_router(fraud.router, prefix="/api")

    # Feature routers (proxy to Go services or self-contained) — each router
    # carries its own relative prefix; mounted under both API prefixes.
    from app.routers import (
        investment_router,
        savings_router,
        insurance_router,
        bnpl_router,
        accounts_router,
        rewards_router,
        analytics_router,
        bill_payment_router,
        telecom_router,
        escrow_router,
        biometrics_router,
        budget_router,
        idv_router,
        ml_router,
        card_router,
        compliance_router,
        device_router,
        dispute_router,
        fx_router,
        kyc_router,
        lakehouse_router,
        lite_router,
        loan_router,
        mojaloop_router,
        notification_router,
        qr_router,
        reconciliation_router,
        segment_router,
        sms_router,
        developer_router,
        settlement_router,
        mortgage_router,
        ngx_router,
        stablecoin_router,
        innovation_router,
        theme_router,
        transfer_router,
        ussd_router,
    )

    feature_routers = [
        investment_router,
        savings_router,
        insurance_router,
        bnpl_router,
        accounts_router,
        rewards_router,
        analytics_router,
        bill_payment_router,
        telecom_router,
        escrow_router,
        biometrics_router,
        budget_router,
        idv_router,
        ml_router,
        card_router,
        compliance_router,
        device_router,
        dispute_router,
        fx_router,
        kyc_router,
        lakehouse_router,
        lite_router,
        loan_router,
        mojaloop_router,
        notification_router,
        qr_router,
        reconciliation_router,
        segment_router,
        sms_router,
        developer_router,
        settlement_router,
        mortgage_router,
        ngx_router,
        stablecoin_router,
        innovation_router,
        theme_router,
        transfer_router,
        ussd_router,
    ]

    for module in feature_routers:
        app.include_router(module.router, prefix="/api/v1")
        app.include_router(module.router, prefix="/api")

    # Notification legacy singular alias + investment plural alias
    app.include_router(notification_router.legacy_router, prefix="/api/v1")
    app.include_router(notification_router.legacy_router, prefix="/api")
    app.include_router(investment_router.alias_router, prefix="/api/v1")
    app.include_router(investment_router.alias_router, prefix="/api")

    # KYB proxy (lives alongside the KYC proxy in kyc_router)
    app.include_router(kyc_router.kyb_router, prefix="/api/v1")
    app.include_router(kyc_router.kyb_router, prefix="/api")

    # Connectivity (power management, adaptive data, offline sync, data saver)
    from app.routers import connectivity_router
    app.include_router(connectivity_router.router, prefix="/api/v1/connectivity", tags=["Connectivity"])
    app.include_router(connectivity_router.router, prefix="/api/connectivity", tags=["Connectivity"])

    return app


# Create the application instance
app = create_application()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=True,
    )
