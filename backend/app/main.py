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
from app.middleware.rate_limiting import RateLimitMiddleware
from app.middleware.logging import LoggingMiddleware
from app.middleware.auth import AuthenticationMiddleware
from app.middleware.pbac_middleware import PBACMiddleware
from app.routers import auth, accounts, transactions, kyc, dashboard, fraud
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
            allowed_hosts=["localhost", "127.0.0.1", "*.neobank.ng"]
        )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=settings.ALLOWED_METHODS,
        allow_headers=settings.ALLOWED_HEADERS,
    )
    
    # Custom middleware (order matters - first added is last executed)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(SecurityMiddleware)
    app.add_middleware(AuthenticationMiddleware)
    # PBAC middleware - enforces policy-based access control using OPA and Permify
    app.add_middleware(PBACMiddleware, use_opa=True, use_permify=True)
    
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
    
    # API routers
    # Import new auth router
    from app.routers import auth_router
    app.include_router(auth_router.router, prefix="/api")  # New JWT auth endpoints
    app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])  # Existing auth
    app.include_router(accounts.router, prefix="/api/accounts", tags=["Accounts"])
    app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
    app.include_router(kyc.router, prefix="/api/kyc", tags=["KYC"])
    app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
    app.include_router(fraud.router, prefix="/api/fraud", tags=["Fraud Detection"])
    
    # New Go service proxy routers (Revolut features with African focus)
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
    )
    
    # Additional routers (previously unmounted)
    from app.routers import (
        biometrics_router,
        card_router,
        compliance_router,
        device_router,
        dispute_router,
        fx_router,
        kyc_router as kyc_router_v2,
        lakehouse_router,
        lite_router,
        loan_router,
        notification_router,
        qr_router,
        reconciliation_router,
        sms_router,
        transfer_router,
        ussd_router,
    )
    
    # Investment & Trading (African exchanges: NGX, JSE, NSE, etc.)
    app.include_router(investment_router.router, prefix="/api/v1", tags=["Investments"])
    # Also mount at /api for backward compatibility
    app.include_router(investment_router.router, prefix="/api", tags=["Investments"])
    
    # Savings (Vaults, Fixed Deposits, Group Savings - Ajo/Esusu/Stokvel)
    app.include_router(savings_router.router, prefix="/api/v1", tags=["Savings"])
    app.include_router(savings_router.router, prefix="/api", tags=["Savings"])
    
    # Insurance (Travel, Device, Life)
    app.include_router(insurance_router.router, prefix="/api/v1", tags=["Insurance"])
    app.include_router(insurance_router.router, prefix="/api", tags=["Insurance"])
    
    # Buy Now Pay Later
    app.include_router(bnpl_router.router, prefix="/api/v1", tags=["BNPL"])
    app.include_router(bnpl_router.router, prefix="/api", tags=["BNPL"])
    
    # Kids & Joint Accounts
    app.include_router(accounts_router.router, prefix="/api/v1", tags=["Account Types"])
    app.include_router(accounts_router.router, prefix="/api", tags=["Account Types"])
    
    # Rewards & Cashback
    app.include_router(rewards_router.router, prefix="/api/v1", tags=["Rewards"])
    app.include_router(rewards_router.router, prefix="/api", tags=["Rewards"])
    
    # Analytics & Budgets
    app.include_router(analytics_router.router, prefix="/api/v1", tags=["Analytics"])
    app.include_router(analytics_router.router, prefix="/api", tags=["Analytics"])
    
    # Bill Payments & Subscriptions
    app.include_router(bill_payment_router.router, prefix="/api/v1", tags=["Bills"])
    app.include_router(bill_payment_router.router, prefix="/api", tags=["Bills"])
    
    # Telecom (Airtime, Data, eSIM)
    app.include_router(telecom_router.router, prefix="/api/v1", tags=["Telecom"])
    app.include_router(telecom_router.router, prefix="/api", tags=["Telecom"])
    
    # Escrow (P2P, Marketplace, Real Estate, Vehicle, Service, Milestone)
    app.include_router(escrow_router.router, prefix="/api/v1", tags=["Escrow"])
    app.include_router(escrow_router.router, prefix="/api", tags=["Escrow"])
    
    # Biometrics (Face ID, Fingerprint, Voice)
    app.include_router(biometrics_router.router, prefix="/api/v1/biometrics", tags=["Biometrics"])
    app.include_router(biometrics_router.router, prefix="/api/biometrics", tags=["Biometrics"])
    
    # Cards (Virtual, Physical, Controls)
    app.include_router(card_router.router, prefix="/api/v1/cards", tags=["Cards"])
    app.include_router(card_router.router, prefix="/api/cards", tags=["Cards"])
    
    # Compliance (AML, Sanctions, Reporting)
    app.include_router(compliance_router.router, prefix="/api/v1/compliance", tags=["Compliance"])
    app.include_router(compliance_router.router, prefix="/api/compliance", tags=["Compliance"])
    
    # Device Management (Registration, Trust)
    app.include_router(device_router.router, prefix="/api/v1/devices", tags=["Devices"])
    app.include_router(device_router.router, prefix="/api/devices", tags=["Devices"])
    
    # Disputes (Chargebacks, Resolution)
    app.include_router(dispute_router.router, prefix="/api/v1/disputes", tags=["Disputes"])
    app.include_router(dispute_router.router, prefix="/api/disputes", tags=["Disputes"])
    
    # FX (Currency Exchange, Rates)
    app.include_router(fx_router.router, prefix="/api/v1/fx", tags=["FX"])
    app.include_router(fx_router.router, prefix="/api/fx", tags=["FX"])
    
    # KYC v2 (Enhanced verification)
    app.include_router(kyc_router_v2.router, prefix="/api/v1/kyc", tags=["KYC v2"])
    
    # Lakehouse (Analytics, Data Lake)
    app.include_router(lakehouse_router.router, prefix="/api/v1/lakehouse", tags=["Lakehouse"])
    app.include_router(lakehouse_router.router, prefix="/api/lakehouse", tags=["Lakehouse"])
    
    # Lite (Low bandwidth, Feature phones)
    app.include_router(lite_router.router, prefix="/api/v1/lite", tags=["Lite"])
    app.include_router(lite_router.router, prefix="/api/lite", tags=["Lite"])
    
    # Loans (Personal, Business, Mortgage)
    app.include_router(loan_router.router, prefix="/api/v1/loans", tags=["Loans"])
    app.include_router(loan_router.router, prefix="/api/loans", tags=["Loans"])
    
    # Notifications (Push, SMS, Email)
    app.include_router(notification_router.router, prefix="/api/v1/notifications", tags=["Notifications"])
    app.include_router(notification_router.router, prefix="/api/notifications", tags=["Notifications"])
    
    # QR Payments (Generate, Scan, Pay)
    app.include_router(qr_router.router, prefix="/api/v1/qr", tags=["QR Payments"])
    app.include_router(qr_router.router, prefix="/api/qr", tags=["QR Payments"])
    
    # Reconciliation (Settlement, Matching)
    app.include_router(reconciliation_router.router, prefix="/api/v1/reconciliation", tags=["Reconciliation"])
    app.include_router(reconciliation_router.router, prefix="/api/reconciliation", tags=["Reconciliation"])
    
    # SMS Banking (Feature phones)
    app.include_router(sms_router.router, prefix="/api/v1/sms", tags=["SMS Banking"])
    app.include_router(sms_router.router, prefix="/api/sms", tags=["SMS Banking"])
    
    # Transfers (Domestic, International, P2P)
    app.include_router(transfer_router.router, prefix="/api/v1/transfers", tags=["Transfers"])
    app.include_router(transfer_router.router, prefix="/api/transfers", tags=["Transfers"])
    
    # USSD Banking (Feature phones, Low connectivity)
    app.include_router(ussd_router.router, prefix="/api/v1/ussd", tags=["USSD"])
    app.include_router(ussd_router.router, prefix="/api/ussd", tags=["USSD"])
    
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

