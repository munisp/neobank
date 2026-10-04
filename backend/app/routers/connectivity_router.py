"""
Connectivity Router for NeoBank

Provides endpoints for device connectivity management, power-aware sync,
adaptive data handling, and offline transaction support.

Integrates with:
- Go Connectivity Service via Dapr
- Redis for state caching
- Kafka for event streaming
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

# Go connectivity service URL (via Dapr or direct)
CONNECTIVITY_SERVICE_URL = "http://localhost:8089"


# Request/Response Models
class PowerStateRequest(BaseModel):
    device_id: str
    battery_level: int = Field(ge=0, le=100)
    is_charging: bool = False
    power_save_mode: bool = False


class SyncPolicyResponse(BaseModel):
    sync_interval: int  # seconds
    enable_push: bool
    enable_polling: bool
    reduced_features: List[str] = []


class NetworkQualityRequest(BaseModel):
    device_id: str
    connection_type: str  # 2g, 3g, 4g, 5g, wifi
    download_speed: float = 0.0  # Mbps
    upload_speed: float = 0.0  # Mbps
    latency: int = 0  # ms
    packet_loss: float = 0.0  # percentage


class DataPolicyResponse(BaseModel):
    image_quality: str
    enable_compression: bool
    batch_requests: bool
    batch_interval: int
    max_payload_size: int
    enable_delta_sync: bool
    preload_enabled: bool


class OfflineTransactionRequest(BaseModel):
    transaction_id: str
    user_id: str
    device_id: str
    type: str
    amount: float
    recipient: Optional[str] = None
    metadata: Optional[Dict] = None
    signature: str
    nonce: str
    sequence_number: int


class ConflictResolutionRequest(BaseModel):
    resolution: str  # cancel, retry, adjust


class DataSaverSettingsRequest(BaseModel):
    enabled: bool = False
    text_only_mode: bool = False
    disable_auto_play: bool = False
    disable_preload: bool = False
    reduce_animations: bool = False
    compress_images: bool = True
    image_quality: int = Field(default=80, ge=1, le=100)
    disabled_features: List[str] = []


class LoadingPlanRequest(BaseModel):
    device_id: str
    resources: List[Dict]
    network_speed: float


# Power Management Endpoints
@router.post("/power/state", response_model=SyncPolicyResponse)
async def update_power_state(request: PowerStateRequest):
    """
    Update device power state and get sync policy.
    
    The sync policy adapts based on battery level:
    - Critical (<=5%): Minimal sync, 30-minute intervals
    - Low (<=15%): Reduced sync, 15-minute intervals
    - Medium (<=50%): Normal sync, 2-5 minute intervals
    - High (>50%): Full sync, 30-second intervals
    - Charging: Full features enabled
    """
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/power/state",
                json=request.dict(),
                timeout=10.0
            )
            if response.status_code == 200:
                return response.json()
            else:
                # Fallback to local calculation
                return calculate_sync_policy(request)
    except Exception as e:
        logger.warning(f"Connectivity service unavailable, using fallback: {e}")
        return calculate_sync_policy(request)


def calculate_sync_policy(state: PowerStateRequest) -> Dict:
    """Calculate sync policy locally as fallback"""
    policy = {
        "sync_interval": 30,
        "enable_push": True,
        "enable_polling": True,
        "reduced_features": []
    }
    
    if state.is_charging:
        return policy
    
    if state.battery_level <= 5:
        policy["sync_interval"] = 1800  # 30 minutes
        policy["enable_polling"] = False
        policy["reduced_features"] = ["analytics", "notifications", "background_refresh", "image_loading", "animations"]
    elif state.battery_level <= 15:
        policy["sync_interval"] = 900  # 15 minutes
        policy["enable_polling"] = False
        policy["reduced_features"] = ["analytics", "background_refresh", "animations"]
    elif state.battery_level <= 30:
        policy["sync_interval"] = 300  # 5 minutes
        policy["reduced_features"] = ["background_refresh"]
    elif state.battery_level <= 50:
        policy["sync_interval"] = 120  # 2 minutes
    
    if state.power_save_mode:
        policy["sync_interval"] = max(policy["sync_interval"], 900)
        policy["enable_polling"] = False
        if "animations" not in policy["reduced_features"]:
            policy["reduced_features"].append("animations")
    
    return policy


@router.get("/power/policy/{device_id}", response_model=SyncPolicyResponse)
async def get_sync_policy(device_id: str):
    """Get current sync policy for a device"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/power/policy/{device_id}",
                timeout=10.0
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
    
    raise HTTPException(status_code=404, detail="Device policy not found")


# Adaptive Data Endpoints
@router.post("/adaptive/network", response_model=DataPolicyResponse)
async def update_network_quality(request: NetworkQualityRequest):
    """
    Update network quality and get data policy.
    
    The data policy adapts based on connection type and speed:
    - 2G: Low quality images, request batching, 10KB max payload
    - 3G: Medium quality, batching, 50KB max payload
    - 4G: High quality, no batching, 500KB max payload
    - 5G/WiFi: Original quality, preloading enabled, 5MB max payload
    """
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/adaptive/network",
                json=request.dict(),
                timeout=10.0
            )
            if response.status_code == 200:
                return response.json()
            else:
                return calculate_data_policy(request)
    except Exception as e:
        logger.warning(f"Connectivity service unavailable, using fallback: {e}")
        return calculate_data_policy(request)


def calculate_data_policy(quality: NetworkQualityRequest) -> Dict:
    """Calculate data policy locally as fallback"""
    policy = {
        "image_quality": "high",
        "enable_compression": True,
        "batch_requests": False,
        "batch_interval": 0,
        "max_payload_size": 500 * 1024,
        "enable_delta_sync": True,
        "preload_enabled": True
    }
    
    if quality.connection_type == "2g":
        policy["image_quality"] = "low"
        policy["batch_requests"] = True
        policy["batch_interval"] = 30
        policy["max_payload_size"] = 10 * 1024
        policy["preload_enabled"] = False
    elif quality.connection_type == "3g":
        policy["image_quality"] = "medium"
        policy["batch_requests"] = True
        policy["batch_interval"] = 10
        policy["max_payload_size"] = 50 * 1024
        policy["preload_enabled"] = False
    elif quality.connection_type in ["5g", "wifi"]:
        policy["image_quality"] = "original"
        policy["max_payload_size"] = 5 * 1024 * 1024
    
    # Adjust based on actual speed
    if quality.download_speed < 0.1:  # < 100 Kbps
        policy["image_quality"] = "low"
        policy["batch_requests"] = True
        policy["batch_interval"] = 60
        policy["max_payload_size"] = 5 * 1024
    
    return policy


@router.get("/adaptive/policy/{device_id}", response_model=DataPolicyResponse)
async def get_data_policy(device_id: str):
    """Get current data policy for a device"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/adaptive/policy/{device_id}",
                timeout=10.0
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
    
    raise HTTPException(status_code=404, detail="Device policy not found")


# Offline Transaction Endpoints
@router.post("/offline/queue")
async def queue_offline_transaction(request: OfflineTransactionRequest):
    """
    Queue an offline transaction for later processing.
    
    Transactions are stored with 72-hour expiry for remote areas.
    Maximum 100 transactions per user, 500,000 NGN per transaction.
    """
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/offline/queue",
                json=request.dict(),
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        # Fallback to local service
        from app.services.offline_transaction_service import offline_transaction_service
        from app.services.offline_transaction_service import TransactionType
        
        tx_type = TransactionType(request.type) if request.type in [t.value for t in TransactionType] else TransactionType.TRANSFER
        
        try:
            tx = await offline_transaction_service.create_offline_transaction(
                user_id=request.user_id,
                transaction_type=tx_type,
                amount=request.amount,
                recipient=request.recipient,
                metadata=request.metadata
            )
            # Edge ingestion: stream to Fluvio (offline-tx-events, durable acks)
            try:
                from app.infrastructure.fluvio_client import get_fluvio_producer
                get_fluvio_producer().produce("offline-tx-events", {
                    "transaction_id": tx.transaction_id,
                    "user_id": request.user_id, "type": request.type,
                    "amount": float(request.amount), "recipient": request.recipient,
                }, key=request.user_id, durable=True)
            except Exception as fe:  # noqa: BLE001
                logger.warning(f"Fluvio produce failed (non-blocking): {fe}")
            return {
                "transaction_id": tx.transaction_id,
                "status": "queued",
                "expires_at": tx.expires_at.isoformat() if tx.expires_at else None
            }
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))


@router.post("/offline/sync/{user_id}")
async def sync_offline_transactions(user_id: str):
    """
    Sync all pending offline transactions for a user.
    
    Called when device comes back online.
    """
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/offline/sync/{user_id}",
                timeout=60.0  # Longer timeout for sync
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        # Fallback to local service
        from app.services.offline_transaction_service import offline_transaction_service
        result = await offline_transaction_service.sync_offline_transactions(user_id)
        return result


@router.get("/offline/pending/{user_id}")
async def get_pending_count(user_id: str):
    """Get count of pending offline transactions"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/offline/pending/{user_id}",
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        from app.services.offline_transaction_service import offline_transaction_service
        pending = await offline_transaction_service.get_pending_transactions(user_id)
        return {"pending_count": len(pending)}


# Conflict Resolution Endpoints
@router.get("/conflicts/{user_id}")
async def get_user_conflicts(user_id: str):
    """Get all unresolved conflicts for a user"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/conflicts/{user_id}",
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        return []


@router.post("/conflicts/resolve/{conflict_id}")
async def resolve_conflict(conflict_id: str, request: ConflictResolutionRequest):
    """
    Resolve a transaction conflict.
    
    Resolution options depend on conflict type:
    - insufficient_balance: cancel, retry_with_available, wait_for_funds
    - recipient_changed: cancel, proceed_anyway, update_recipient
    - rate_changed: cancel, accept_new_rate, retry_later
    - duplicate_nonce: cancel, regenerate
    - account_locked: cancel, contact_support
    """
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/conflicts/resolve/{conflict_id}",
                json=request.dict(),
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        raise HTTPException(status_code=503, detail="Conflict resolution service unavailable")


# Data Saver Endpoints
@router.get("/datasaver/{user_id}")
async def get_data_saver_settings(user_id: str):
    """Get data saver settings for a user"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/datasaver/{user_id}",
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        # Return defaults
        return {
            "user_id": user_id,
            "enabled": False,
            "text_only_mode": False,
            "disable_auto_play": False,
            "disable_preload": False,
            "reduce_animations": False,
            "compress_images": True,
            "image_quality": 80,
            "disabled_features": []
        }


@router.put("/datasaver/{user_id}")
async def update_data_saver_settings(user_id: str, request: DataSaverSettingsRequest):
    """Update data saver settings for a user"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/datasaver/{user_id}",
                json=request.dict(),
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        return {"user_id": user_id, **request.dict()}


@router.post("/datasaver/{user_id}/extreme")
async def enable_extreme_saver(user_id: str):
    """
    Enable extreme data saver mode.
    
    This enables:
    - Text-only mode
    - All auto-play disabled
    - All preloading disabled
    - All animations disabled
    - Maximum image compression (20% quality)
    - Disabled features: analytics, charts, maps, videos, rich_notifications
    """
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/datasaver/{user_id}/extreme",
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        return {
            "user_id": user_id,
            "enabled": True,
            "text_only_mode": True,
            "disable_auto_play": True,
            "disable_preload": True,
            "reduce_animations": True,
            "compress_images": True,
            "image_quality": 20,
            "disabled_features": ["analytics", "charts", "maps", "videos", "rich_notifications"]
        }


# Progressive Loading Endpoints
@router.post("/loading/plan")
async def create_loading_plan(request: LoadingPlanRequest):
    """
    Create a prioritized loading plan for resources.
    
    Resources are sorted by priority and estimated load time is calculated
    based on network speed.
    """
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CONNECTIVITY_SERVICE_URL}/api/v1/connectivity/loading/plan",
                json=request.dict(),
                timeout=10.0
            )
            return response.json()
    except Exception as e:
        logger.warning(f"Connectivity service unavailable: {e}")
        # Simple local calculation
        resources = sorted(request.resources, key=lambda r: r.get("priority", 3))
        total_size = sum(r.get("size", 0) for r in resources)
        estimated_time = int(total_size / (request.network_speed * 125000)) if request.network_speed > 0 else 0
        
        return {
            "device_id": request.device_id,
            "resources": resources,
            "total_size": total_size,
            "estimated_time": estimated_time
        }


@router.get("/loading/skeleton/{screen_type}")
async def get_skeleton(screen_type: str):
    """
    Get skeleton data for a screen type.
    
    Skeleton data allows immediate UI rendering while actual data loads.
    Supported screens: dashboard, transactions, accounts, investments
    """
    skeletons = {
        "dashboard": {
            "balance": {"loading": True, "placeholder": "***"},
            "quick_actions": [{"loading": True}] * 4,
            "recent_transactions": [{"loading": True}] * 5,
            "cards": [{"loading": True}] * 2,
        },
        "transactions": {
            "filter": {"loading": True},
            "transactions": [{"loading": True}] * 10,
            "pagination": {"loading": True},
        },
        "accounts": {
            "accounts": [{"loading": True}] * 3,
            "total_balance": {"loading": True},
        },
        "investments": {
            "portfolio": {"loading": True},
            "stocks": [{"loading": True}] * 5,
            "crypto": [{"loading": True}] * 5,
        },
    }
    
    return skeletons.get(screen_type, {"loading": True})


# Health check
@router.get("/health")
async def connectivity_health():
    """Check connectivity service health"""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CONNECTIVITY_SERVICE_URL}/health",
                timeout=5.0
            )
            if response.status_code == 200:
                return {"status": "healthy", "go_service": "connected"}
    except Exception:
        pass
    
    return {"status": "degraded", "go_service": "unavailable", "fallback": "active"}
