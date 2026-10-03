"""
Policy-Based Access Control (PBAC) Middleware
Enforces authorization using OPA and Permify for NeoBank API endpoints
"""

import logging
import time
from typing import Optional, Dict, Any, Callable, List
from functools import wraps
from enum import Enum

from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ..services.opa_service import opa_service
from ..services.permify_service import get_permify_service

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


class ResourceType(str, Enum):
    """Resource types for authorization"""
    ACCOUNT = "account"
    TRANSACTION = "transaction"
    KYC = "kyc"
    KYB = "kyb"
    LOAN = "loan"
    INVESTMENT = "investment"
    INSURANCE = "insurance"
    ESCROW = "escrow"
    CARD = "card"
    REWARD = "reward"
    TELECOM = "telecom"
    BILL = "bill"
    BNPL = "bnpl"
    USER = "user"
    ANALYTICS = "analytics"
    SYSTEM = "system"
    # Mojaloop interoperability
    MOJALOOP_PARTY = "mojaloop_party"
    MOJALOOP_QUOTE = "mojaloop_quote"
    MOJALOOP_TRANSFER = "mojaloop_transfer"
    MOJALOOP_SETTLEMENT = "mojaloop_settlement"


class Action(str, Enum):
    """Actions for authorization"""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    TRANSFER = "transfer"
    APPROVE = "approve"
    REJECT = "reject"
    SUBMIT = "submit"
    REVIEW = "review"
    FUND = "fund"
    RELEASE = "release"
    DISPUTE = "dispute"
    RESOLVE = "resolve"
    FREEZE = "freeze"
    UNFREEZE = "unfreeze"
    BUY = "buy"
    SELL = "sell"
    CLAIM = "claim"
    REDEEM = "redeem"
    APPLY = "apply"
    PAY = "pay"


# Route to resource/action mapping
ROUTE_PERMISSIONS: Dict[str, Dict[str, Any]] = {
    # Account routes
    "GET /api/v1/accounts": {"resource": ResourceType.ACCOUNT, "action": Action.READ},
    "GET /api/v1/accounts/{id}": {"resource": ResourceType.ACCOUNT, "action": Action.READ},
    "POST /api/v1/accounts": {"resource": ResourceType.ACCOUNT, "action": Action.CREATE},
    "POST /api/v1/accounts/transfer": {"resource": ResourceType.ACCOUNT, "action": Action.TRANSFER},
    "POST /api/v1/accounts/{id}/freeze": {"resource": ResourceType.ACCOUNT, "action": Action.FREEZE},
    "POST /api/v1/accounts/{id}/unfreeze": {"resource": ResourceType.ACCOUNT, "action": Action.UNFREEZE},
    
    # Transaction routes
    "GET /api/v1/transactions": {"resource": ResourceType.TRANSACTION, "action": Action.READ},
    "GET /api/v1/transactions/{id}": {"resource": ResourceType.TRANSACTION, "action": Action.READ},
    "POST /api/v1/transactions": {"resource": ResourceType.TRANSACTION, "action": Action.CREATE},
    
    # KYC routes
    "GET /api/v1/kyc": {"resource": ResourceType.KYC, "action": Action.READ},
    "GET /api/v1/kyc/{id}": {"resource": ResourceType.KYC, "action": Action.READ},
    "POST /api/v1/kyc/initiate": {"resource": ResourceType.KYC, "action": Action.CREATE},
    "POST /api/v1/kyc/{id}/submit": {"resource": ResourceType.KYC, "action": Action.SUBMIT},
    "POST /api/v1/kyc/{id}/approve": {"resource": ResourceType.KYC, "action": Action.APPROVE},
    "POST /api/v1/kyc/{id}/reject": {"resource": ResourceType.KYC, "action": Action.REJECT},
    
    # KYB routes
    "GET /api/v1/kyb": {"resource": ResourceType.KYB, "action": Action.READ},
    "POST /api/v1/kyb/initiate": {"resource": ResourceType.KYB, "action": Action.CREATE},
    "POST /api/v1/kyb/{id}/approve": {"resource": ResourceType.KYB, "action": Action.APPROVE},
    
    # Loan routes
    "GET /api/v1/loans": {"resource": ResourceType.LOAN, "action": Action.READ},
    "GET /api/v1/loans/{id}": {"resource": ResourceType.LOAN, "action": Action.READ},
    "POST /api/v1/loans/apply": {"resource": ResourceType.LOAN, "action": Action.APPLY},
    "POST /api/v1/loans/{id}/approve": {"resource": ResourceType.LOAN, "action": Action.APPROVE},
    "POST /api/v1/loans/{id}/pay": {"resource": ResourceType.LOAN, "action": Action.PAY},
    
    # Investment routes
    "GET /api/v1/investments": {"resource": ResourceType.INVESTMENT, "action": Action.READ},
    "POST /api/v1/investments/buy": {"resource": ResourceType.INVESTMENT, "action": Action.BUY},
    "POST /api/v1/investments/sell": {"resource": ResourceType.INVESTMENT, "action": Action.SELL},
    
    # Insurance routes
    "GET /api/v1/insurance": {"resource": ResourceType.INSURANCE, "action": Action.READ},
    "POST /api/v1/insurance/purchase": {"resource": ResourceType.INSURANCE, "action": Action.CREATE},
    "POST /api/v1/insurance/{id}/claim": {"resource": ResourceType.INSURANCE, "action": Action.CLAIM},
    
    # Escrow routes
    "GET /api/v1/escrow": {"resource": ResourceType.ESCROW, "action": Action.READ},
    "GET /api/v1/escrow/{id}": {"resource": ResourceType.ESCROW, "action": Action.READ},
    "POST /api/v1/escrow": {"resource": ResourceType.ESCROW, "action": Action.CREATE},
    "POST /api/v1/escrow/{id}/fund": {"resource": ResourceType.ESCROW, "action": Action.FUND},
    "POST /api/v1/escrow/{id}/release": {"resource": ResourceType.ESCROW, "action": Action.RELEASE},
    "POST /api/v1/escrow/{id}/dispute": {"resource": ResourceType.ESCROW, "action": Action.DISPUTE},
    "POST /api/v1/escrow/{id}/resolve": {"resource": ResourceType.ESCROW, "action": Action.RESOLVE},
    
    # Card routes
    "GET /api/v1/cards": {"resource": ResourceType.CARD, "action": Action.READ},
    "POST /api/v1/cards": {"resource": ResourceType.CARD, "action": Action.CREATE},
    "POST /api/v1/cards/{id}/freeze": {"resource": ResourceType.CARD, "action": Action.FREEZE},
    "POST /api/v1/cards/{id}/unfreeze": {"resource": ResourceType.CARD, "action": Action.UNFREEZE},
    
    # Rewards routes
    "GET /api/v1/rewards": {"resource": ResourceType.REWARD, "action": Action.READ},
    "POST /api/v1/rewards/redeem": {"resource": ResourceType.REWARD, "action": Action.REDEEM},
    
    # Bill payment routes
    "GET /api/v1/bills": {"resource": ResourceType.BILL, "action": Action.READ},
    "POST /api/v1/bills/pay": {"resource": ResourceType.BILL, "action": Action.PAY},
    
    # BNPL routes
    "GET /api/v1/bnpl": {"resource": ResourceType.BNPL, "action": Action.READ},
    "POST /api/v1/bnpl/purchase": {"resource": ResourceType.BNPL, "action": Action.CREATE},
    "POST /api/v1/bnpl/{id}/pay": {"resource": ResourceType.BNPL, "action": Action.PAY},
    
    # Telecom routes
    "GET /api/v1/telecom": {"resource": ResourceType.TELECOM, "action": Action.READ},
    "POST /api/v1/telecom/airtime": {"resource": ResourceType.TELECOM, "action": Action.CREATE},
    "POST /api/v1/telecom/data": {"resource": ResourceType.TELECOM, "action": Action.CREATE},
    
    # Analytics routes
    "GET /api/v1/analytics": {"resource": ResourceType.ANALYTICS, "action": Action.READ},
    
    # Admin routes
    "GET /api/v1/admin/users": {"resource": ResourceType.USER, "action": Action.READ, "admin_only": True},
    "POST /api/v1/admin/users/{id}/suspend": {"resource": ResourceType.USER, "action": Action.UPDATE, "admin_only": True},
    
    # Mojaloop interoperability routes
    "GET /api/v1/mojaloop/parties/{id}": {"resource": ResourceType.MOJALOOP_PARTY, "action": Action.READ},
    "POST /api/v1/mojaloop/parties/lookup": {"resource": ResourceType.MOJALOOP_PARTY, "action": Action.READ},
    "GET /api/v1/mojaloop/quotes": {"resource": ResourceType.MOJALOOP_QUOTE, "action": Action.READ},
    "GET /api/v1/mojaloop/quotes/{id}": {"resource": ResourceType.MOJALOOP_QUOTE, "action": Action.READ},
    "POST /api/v1/mojaloop/quotes": {"resource": ResourceType.MOJALOOP_QUOTE, "action": Action.CREATE},
    "GET /api/v1/mojaloop/transfers": {"resource": ResourceType.MOJALOOP_TRANSFER, "action": Action.READ},
    "GET /api/v1/mojaloop/transfers/{id}": {"resource": ResourceType.MOJALOOP_TRANSFER, "action": Action.READ},
    "POST /api/v1/mojaloop/transfers": {"resource": ResourceType.MOJALOOP_TRANSFER, "action": Action.TRANSFER},
    "PUT /api/v1/mojaloop/transfers/{id}": {"resource": ResourceType.MOJALOOP_TRANSFER, "action": Action.UPDATE},
    "GET /api/v1/mojaloop/settlements": {"resource": ResourceType.MOJALOOP_SETTLEMENT, "action": Action.READ, "admin_only": True},
    "POST /api/v1/mojaloop/settlements/{id}/process": {"resource": ResourceType.MOJALOOP_SETTLEMENT, "action": Action.APPROVE, "admin_only": True},
}

# Public routes that don't require authorization
PUBLIC_ROUTES = [
    "GET /health",
    "GET /api/v1/health",
    "GET /api/v1/docs",
    "GET /api/v1/openapi.json",
    "POST /api/v1/auth/login",
    "POST /api/v1/auth/register",
    "POST /api/v1/auth/refresh",
    "GET /api/v1/auth/verify",
    "GET /api/v1/auth/validate",
    "POST /api/v1/auth/forgot-password",
    "POST /api/v1/auth/reset-password",
    # IDV endpoints authenticate via their own X-API-Key (idv_router.require_idv_api_key)
    "POST /api/v1/idv/",
    "GET /api/v1/idv/",
    "POST /api/idv/",
    "GET /api/idv/",
]


class PBACMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces Policy-Based Access Control on all API requests
    Uses both OPA (for policy evaluation) and Permify (for relationship checks)
    """

    def __init__(self, app, use_opa: bool = True, use_permify: bool = True):
        super().__init__(app)
        self.use_opa = use_opa
        self.use_permify = use_permify

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Build route key
        route_key = f"{request.method} {request.url.path}"
        
        # Normalize route key (replace UUIDs with {id})
        normalized_route = self._normalize_route(route_key)
        
        # Check if public route
        if self._is_public_route(normalized_route):
            return await call_next(request)
        
        # Get user from request (set by auth middleware)
        user = getattr(request.state, "user", None)
        if not user:
            return JSONResponse(
                status_code=401,
                content={"error": "Authentication required"}
            )
        
        # Get permission requirements for route
        permission_config = ROUTE_PERMISSIONS.get(normalized_route)
        if not permission_config:
            # Route not in permission map - allow by default but log
            logger.warning(f"Route not in permission map: {normalized_route}")
            return await call_next(request)
        
        # Check authorization
        try:
            allowed, reason = await self._check_authorization(
                request=request,
                user=user,
                permission_config=permission_config
            )
            
            if not allowed:
                logger.warning(
                    f"Authorization denied for user {user.get('id')} "
                    f"on {normalized_route}: {reason}"
                )
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "Access denied",
                        "reason": reason,
                        "resource": permission_config.get("resource"),
                        "action": permission_config.get("action")
                    }
                )
            
            # Log successful authorization
            duration = time.time() - start_time
            logger.debug(
                f"Authorization granted for user {user.get('id')} "
                f"on {normalized_route} in {duration:.3f}s"
            )
            
            return await call_next(request)
            
        except Exception as e:
            logger.error(f"Authorization error: {e}")
            # Fail closed - deny access on error
            return JSONResponse(
                status_code=500,
                content={"error": "Authorization service error"}
            )

    def _normalize_route(self, route: str) -> str:
        """Normalize route by replacing UUIDs and IDs with {id}"""
        import re
        # Replace UUIDs
        route = re.sub(
            r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            '/{id}',
            route,
            flags=re.IGNORECASE
        )
        # Replace numeric IDs
        route = re.sub(r'/\d+', '/{id}', route)
        return route

    def _is_public_route(self, route: str) -> bool:
        """Check if route is public (no auth required)"""
        for public_route in PUBLIC_ROUTES:
            if route.startswith(public_route.replace("{id}", "")):
                return True
        return route in PUBLIC_ROUTES

    async def _check_authorization(
        self,
        request: Request,
        user: Dict[str, Any],
        permission_config: Dict[str, Any]
    ) -> tuple[bool, str]:
        """
        Check authorization using OPA and/or Permify
        
        Returns:
            Tuple of (allowed, reason)
        """
        resource_type = permission_config.get("resource")
        action = permission_config.get("action")
        admin_only = permission_config.get("admin_only", False)
        
        # Quick check for admin-only routes
        if admin_only and user.get("role") not in ["admin", "super_admin"]:
            return False, "Admin access required"
        
        # Extract resource ID from path if present
        resource_id = self._extract_resource_id(request.url.path)
        
        # Build context
        context = {
            "ip_address": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "timestamp": time.time(),
            "daily_total": user.get("daily_transaction_total", 0),
            "purpose": request.headers.get("x-purpose"),
        }
        
        # Check with OPA
        if self.use_opa:
            opa_result = await self._check_opa(
                user=user,
                resource_type=resource_type,
                resource_id=resource_id,
                action=action,
                context=context
            )
            if not opa_result.get("allow", False):
                return False, opa_result.get("reason", "Policy denied access")
        
        # Check with Permify for relationship-based access
        if self.use_permify and resource_id:
            permify_result = await self._check_permify(
                user_id=user.get("id"),
                resource_type=resource_type,
                resource_id=resource_id,
                permission=action
            )
            if not permify_result.allowed:
                return False, permify_result.error or "Relationship check failed"
        
        return True, "Access granted"

    def _extract_resource_id(self, path: str) -> Optional[str]:
        """Extract resource ID from URL path"""
        import re
        # Try UUID first
        uuid_match = re.search(
            r'/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
            path,
            flags=re.IGNORECASE
        )
        if uuid_match:
            return uuid_match.group(1)
        
        # Try numeric ID
        parts = path.split('/')
        for part in reversed(parts):
            if part.isdigit():
                return part
        
        return None

    async def _check_opa(
        self,
        user: Dict[str, Any],
        resource_type: str,
        resource_id: Optional[str],
        action: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Check authorization with OPA"""
        input_data = {
            "user": {
                "id": user.get("id"),
                "role": user.get("role", "user"),
                "kyc_tier": user.get("kyc_tier", "tier_0"),
                "status": user.get("status", "active"),
            },
            "action": action,
            "resource": {
                "type": resource_type,
                "id": resource_id,
                "owner_id": user.get("id"),  # Will be overridden by actual resource data
            },
            "context": context,
            "timestamp": context.get("timestamp"),
        }
        
        result = await opa_service.evaluate_policy("neobank/authz", input_data)
        return result

    async def _check_permify(
        self,
        user_id: str,
        resource_type: str,
        resource_id: str,
        permission: str
    ):
        """Check authorization with Permify"""
        permify = get_permify_service()
        return await permify.check_permission(
            entity_type=resource_type,
            entity_id=resource_id,
            permission=permission,
            subject_type="user",
            subject_id=user_id
        )


def require_permission(
    resource_type: ResourceType,
    action: Action,
    resource_id_param: Optional[str] = None
):
    """
    Decorator for route handlers that require specific permissions
    
    Usage:
        @router.get("/accounts/{account_id}")
        @require_permission(ResourceType.ACCOUNT, Action.READ, "account_id")
        async def get_account(account_id: str, user: dict = Depends(get_current_user)):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request: Request = kwargs.get("request")
            user = kwargs.get("user") or kwargs.get("current_user")
            
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            # Get resource ID from kwargs if specified
            resource_id = None
            if resource_id_param:
                resource_id = kwargs.get(resource_id_param)
            
            # Build context
            context = {
                "ip_address": request.client.host if request and request.client else None,
                "timestamp": time.time(),
            }
            
            # Check OPA
            input_data = {
                "user": {
                    "id": user.get("id"),
                    "role": user.get("role", "user"),
                    "kyc_tier": user.get("kyc_tier", "tier_0"),
                    "status": user.get("status", "active"),
                },
                "action": action.value,
                "resource": {
                    "type": resource_type.value,
                    "id": resource_id,
                },
                "context": context,
            }
            
            result = await opa_service.evaluate_policy("neobank/authz", input_data)
            
            if not result.get("allow", False):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "Access denied",
                        "reason": result.get("denial_reason", "Policy denied access"),
                        "resource": resource_type.value,
                        "action": action.value
                    }
                )
            
            # Check Permify if resource ID is available
            if resource_id:
                permify = get_permify_service()
                permify_result = await permify.check_permission(
                    entity_type=resource_type.value,
                    entity_id=resource_id,
                    permission=action.value,
                    subject_type="user",
                    subject_id=str(user.get("id"))
                )
                
                if not permify_result.allowed:
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "error": "Access denied",
                            "reason": "Relationship check failed",
                            "resource": resource_type.value,
                            "action": action.value
                        }
                    )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator


def require_role(*roles: str):
    """
    Decorator for route handlers that require specific roles
    
    Usage:
        @router.get("/admin/users")
        @require_role("admin", "super_admin")
        async def list_users(user: dict = Depends(get_current_user)):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user = kwargs.get("user") or kwargs.get("current_user")
            
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            user_role = user.get("role", "user")
            
            if user_role not in roles:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "Access denied",
                        "reason": f"Required role: {', '.join(roles)}",
                        "current_role": user_role
                    }
                )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator


def require_kyc_tier(min_tier: int):
    """
    Decorator for route handlers that require minimum KYC tier
    
    Usage:
        @router.post("/investments/buy")
        @require_kyc_tier(2)
        async def buy_investment(user: dict = Depends(get_current_user)):
            ...
    """
    tier_map = {"tier_0": 0, "tier_1": 1, "tier_2": 2, "tier_3": 3}
    
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user = kwargs.get("user") or kwargs.get("current_user")
            
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            user_tier = user.get("kyc_tier", "tier_0")
            user_tier_level = tier_map.get(user_tier, 0)
            
            if user_tier_level < min_tier:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "Access denied",
                        "reason": f"KYC tier {min_tier} required",
                        "current_tier": user_tier,
                        "upgrade_url": "/api/v1/kyc/upgrade"
                    }
                )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator
