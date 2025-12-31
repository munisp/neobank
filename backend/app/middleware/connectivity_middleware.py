"""
Connectivity Middleware for NeoBank

Provides adaptive data handling, power-aware sync, and progressive loading
for low-connectivity environments and developing country infrastructure.

Integrates with:
- Redis for state caching
- Kafka for event streaming
- Dapr for service invocation
- APISIX for API gateway policies
"""

import asyncio
import gzip
import hashlib
import io
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, StreamingResponse

logger = logging.getLogger(__name__)


class ConnectionType(str, Enum):
    """Network connection types"""
    UNKNOWN = "unknown"
    OFFLINE = "offline"
    G2 = "2g"
    G3 = "3g"
    G4 = "4g"
    G5 = "5g"
    WIFI = "wifi"


class PowerLevel(str, Enum):
    """Device power levels"""
    CRITICAL = "critical"  # <= 5%
    LOW = "low"            # <= 15%
    MEDIUM = "medium"      # <= 50%
    HIGH = "high"          # > 50%
    CHARGING = "charging"


@dataclass
class DeviceContext:
    """Device context from request headers"""
    device_id: str
    connection_type: ConnectionType = ConnectionType.UNKNOWN
    battery_level: int = 100
    is_charging: bool = False
    power_save_mode: bool = False
    data_saver_mode: bool = False
    effective_bandwidth: float = 0.0  # Mbps
    rtt: int = 0  # Round-trip time in ms
    
    @classmethod
    def from_headers(cls, headers: Dict[str, str]) -> "DeviceContext":
        """Parse device context from request headers"""
        return cls(
            device_id=headers.get("x-device-id", "unknown"),
            connection_type=ConnectionType(headers.get("x-connection-type", "unknown")),
            battery_level=int(headers.get("x-battery-level", "100")),
            is_charging=headers.get("x-is-charging", "false").lower() == "true",
            power_save_mode=headers.get("x-power-save-mode", "false").lower() == "true",
            data_saver_mode=headers.get("x-data-saver-mode", "false").lower() == "true",
            effective_bandwidth=float(headers.get("x-effective-bandwidth", "0")),
            rtt=int(headers.get("x-rtt", "0")),
        )
    
    def get_power_level(self) -> PowerLevel:
        """Get power level category"""
        if self.is_charging:
            return PowerLevel.CHARGING
        if self.battery_level <= 5:
            return PowerLevel.CRITICAL
        if self.battery_level <= 15:
            return PowerLevel.LOW
        if self.battery_level <= 50:
            return PowerLevel.MEDIUM
        return PowerLevel.HIGH


@dataclass
class AdaptiveResponse:
    """Adaptive response configuration"""
    compress: bool = True
    image_quality: int = 80
    include_analytics: bool = True
    include_charts: bool = True
    batch_notifications: bool = False
    reduce_payload: bool = False
    cache_duration: int = 300  # seconds


class ConnectivityMiddleware(BaseHTTPMiddleware):
    """
    Middleware that adapts responses based on device connectivity and power state.
    
    Features:
    - Adaptive compression based on connection type
    - Power-aware response optimization
    - Progressive loading support
    - Data saver mode enforcement
    - Request batching for slow connections
    """
    
    # Endpoints that should always be fully loaded
    CRITICAL_ENDPOINTS = [
        "/api/v1/auth/",
        "/api/v1/transfers/",
        "/api/v1/payments/",
        "/api/v1/escrow/",
        "/api/v1/mojaloop/",
    ]
    
    # Endpoints that can be heavily optimized
    OPTIMIZABLE_ENDPOINTS = [
        "/api/v1/analytics/",
        "/api/v1/insights/",
        "/api/v1/notifications/",
        "/api/v1/rewards/",
    ]
    
    def __init__(self, app, redis_client=None, kafka_publisher=None):
        super().__init__(app)
        self.redis = redis_client
        self.kafka = kafka_publisher
        self._request_batches: Dict[str, List] = {}
        self._batch_timers: Dict[str, asyncio.Task] = {}
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Parse device context from headers
        context = DeviceContext.from_headers(dict(request.headers))
        
        # Store context in request state for downstream use
        request.state.device_context = context
        
        # Determine adaptive response config
        adaptive_config = self._get_adaptive_config(context, request.url.path)
        request.state.adaptive_config = adaptive_config
        
        # Check if request should be batched
        if self._should_batch_request(context, request.url.path):
            return await self._handle_batched_request(request, context)
        
        # Process request
        response = await call_next(request)
        
        # Apply adaptive optimizations to response
        response = await self._optimize_response(response, context, adaptive_config)
        
        # Log connectivity metrics
        duration = time.time() - start_time
        await self._log_metrics(context, request.url.path, duration)
        
        return response
    
    def _get_adaptive_config(self, context: DeviceContext, path: str) -> AdaptiveResponse:
        """Determine adaptive response configuration based on context"""
        config = AdaptiveResponse()
        
        # Check if critical endpoint
        is_critical = any(path.startswith(ep) for ep in self.CRITICAL_ENDPOINTS)
        is_optimizable = any(path.startswith(ep) for ep in self.OPTIMIZABLE_ENDPOINTS)
        
        # Connection-based optimization
        if context.connection_type == ConnectionType.G2:
            config.compress = True
            config.image_quality = 20
            config.include_analytics = False
            config.include_charts = False
            config.batch_notifications = True
            config.reduce_payload = True
            config.cache_duration = 3600
        elif context.connection_type == ConnectionType.G3:
            config.compress = True
            config.image_quality = 50
            config.include_analytics = False
            config.include_charts = is_critical
            config.batch_notifications = True
            config.reduce_payload = not is_critical
            config.cache_duration = 1800
        elif context.connection_type in [ConnectionType.G4, ConnectionType.G5, ConnectionType.WIFI]:
            config.compress = True
            config.image_quality = 80
            config.include_analytics = True
            config.include_charts = True
            config.cache_duration = 300
        
        # Power-based optimization
        power_level = context.get_power_level()
        if power_level == PowerLevel.CRITICAL:
            config.include_analytics = False
            config.include_charts = False
            config.batch_notifications = True
            config.cache_duration = 7200
        elif power_level == PowerLevel.LOW:
            config.include_analytics = False
            config.batch_notifications = True
            config.cache_duration = 3600
        
        # Data saver mode override
        if context.data_saver_mode:
            config.image_quality = min(config.image_quality, 30)
            config.include_analytics = False
            config.include_charts = False
            config.reduce_payload = True
        
        # Power save mode override
        if context.power_save_mode:
            config.batch_notifications = True
            config.cache_duration = max(config.cache_duration, 1800)
        
        return config
    
    def _should_batch_request(self, context: DeviceContext, path: str) -> bool:
        """Determine if request should be batched"""
        # Only batch for slow connections
        if context.connection_type not in [ConnectionType.G2, ConnectionType.G3]:
            return False
        
        # Only batch optimizable endpoints
        if not any(path.startswith(ep) for ep in self.OPTIMIZABLE_ENDPOINTS):
            return False
        
        # Don't batch if RTT is low (good connection despite type)
        if context.rtt < 500:
            return False
        
        return True
    
    async def _handle_batched_request(self, request: Request, context: DeviceContext) -> Response:
        """Handle request batching for slow connections"""
        batch_key = f"{context.device_id}:{request.url.path}"
        
        # Add to batch
        if batch_key not in self._request_batches:
            self._request_batches[batch_key] = []
        
        self._request_batches[batch_key].append({
            "method": request.method,
            "path": str(request.url.path),
            "query": str(request.url.query),
            "timestamp": time.time(),
        })
        
        # Return acknowledgment
        return JSONResponse({
            "status": "batched",
            "batch_id": batch_key,
            "message": "Request added to batch. Results will be delivered when batch completes.",
        })
    
    async def _optimize_response(
        self,
        response: Response,
        context: DeviceContext,
        config: AdaptiveResponse
    ) -> Response:
        """Apply adaptive optimizations to response"""
        # Skip optimization for non-JSON responses
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response
        
        # Read response body
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        
        # Parse and optimize JSON
        try:
            data = json.loads(body)
            
            # Reduce payload if configured
            if config.reduce_payload:
                data = self._reduce_payload(data)
            
            # Remove analytics if configured
            if not config.include_analytics and isinstance(data, dict):
                data.pop("analytics", None)
                data.pop("insights", None)
                data.pop("recommendations", None)
            
            # Remove charts if configured
            if not config.include_charts and isinstance(data, dict):
                data.pop("charts", None)
                data.pop("graphs", None)
                data.pop("visualizations", None)
            
            # Re-serialize
            optimized_body = json.dumps(data, separators=(",", ":")).encode()
            
        except (json.JSONDecodeError, TypeError):
            optimized_body = body
        
        # Apply compression if configured and beneficial
        if config.compress and len(optimized_body) > 1024:
            compressed = gzip.compress(optimized_body)
            if len(compressed) < len(optimized_body) * 0.9:  # Only if 10%+ savings
                return Response(
                    content=compressed,
                    status_code=response.status_code,
                    headers={
                        **dict(response.headers),
                        "content-encoding": "gzip",
                        "content-length": str(len(compressed)),
                        "x-original-size": str(len(optimized_body)),
                        "x-compressed-size": str(len(compressed)),
                    },
                    media_type="application/json",
                )
        
        # Add cache headers
        headers = dict(response.headers)
        headers["cache-control"] = f"max-age={config.cache_duration}"
        headers["x-adaptive-config"] = json.dumps({
            "image_quality": config.image_quality,
            "reduced": config.reduce_payload,
        })
        
        return Response(
            content=optimized_body,
            status_code=response.status_code,
            headers=headers,
            media_type="application/json",
        )
    
    def _reduce_payload(self, data: Any, depth: int = 0, max_depth: int = 3) -> Any:
        """Reduce payload size by trimming nested data"""
        if depth >= max_depth:
            if isinstance(data, dict):
                return {"_truncated": True, "_keys": list(data.keys())}
            if isinstance(data, list):
                return {"_truncated": True, "_count": len(data)}
            return data
        
        if isinstance(data, dict):
            return {k: self._reduce_payload(v, depth + 1, max_depth) for k, v in data.items()}
        
        if isinstance(data, list):
            # Limit list items
            max_items = 10 if depth == 0 else 5
            if len(data) > max_items:
                return [self._reduce_payload(item, depth + 1, max_depth) for item in data[:max_items]] + [
                    {"_more": len(data) - max_items}
                ]
            return [self._reduce_payload(item, depth + 1, max_depth) for item in data]
        
        # Truncate long strings
        if isinstance(data, str) and len(data) > 200:
            return data[:200] + "..."
        
        return data
    
    async def _log_metrics(self, context: DeviceContext, path: str, duration: float):
        """Log connectivity metrics for analytics"""
        if self.kafka:
            try:
                await self.kafka.publish(
                    "neobank.connectivity.metrics",
                    {
                        "device_id": context.device_id,
                        "connection_type": context.connection_type.value,
                        "battery_level": context.battery_level,
                        "power_save_mode": context.power_save_mode,
                        "data_saver_mode": context.data_saver_mode,
                        "path": path,
                        "duration_ms": int(duration * 1000),
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to publish connectivity metrics: {e}")


class ProgressiveLoadingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that supports progressive loading for slow connections.
    
    Features:
    - Skeleton data for immediate UI rendering
    - Chunked responses for large payloads
    - Priority-based resource loading
    """
    
    # Screen types and their skeleton structures
    SKELETONS = {
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
    
    async def dispatch(self, request: Request, call_next):
        # Check for skeleton request
        if request.headers.get("x-request-skeleton") == "true":
            screen_type = request.headers.get("x-screen-type", "dashboard")
            skeleton = self.SKELETONS.get(screen_type, {"loading": True})
            return JSONResponse(skeleton)
        
        # Check for progressive loading
        if request.headers.get("x-progressive-loading") == "true":
            return await self._handle_progressive_request(request, call_next)
        
        return await call_next(request)
    
    async def _handle_progressive_request(self, request: Request, call_next) -> Response:
        """Handle progressive loading request"""
        response = await call_next(request)
        
        # For large responses, stream in chunks
        content_length = response.headers.get("content-length")
        if content_length and int(content_length) > 50000:  # > 50KB
            return await self._stream_response(response)
        
        return response
    
    async def _stream_response(self, response: Response) -> StreamingResponse:
        """Stream response in chunks"""
        async def generate():
            async for chunk in response.body_iterator:
                yield chunk
        
        return StreamingResponse(
            generate(),
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )


class OfflineSyncMiddleware(BaseHTTPMiddleware):
    """
    Middleware that handles offline transaction synchronization.
    
    Features:
    - Queued transaction processing
    - Conflict detection and resolution
    - Delta sync for efficient updates
    """
    
    def __init__(self, app, redis_client=None, tigerbeetle_client=None):
        super().__init__(app)
        self.redis = redis_client
        self.tigerbeetle = tigerbeetle_client
        # Extended expiry: 72 hours for remote areas
        self.transaction_expiry = timedelta(hours=72)
        self.max_offline_transactions = 100
        self.max_offline_amount = 500000
    
    async def dispatch(self, request: Request, call_next):
        # Check for offline sync request
        if request.url.path == "/api/v1/offline/sync":
            return await self._handle_sync_request(request)
        
        # Check for offline transaction submission
        if request.headers.get("x-offline-transaction") == "true":
            return await self._handle_offline_transaction(request)
        
        # Check for delta sync request
        if request.headers.get("x-delta-sync") == "true":
            return await self._handle_delta_sync(request, call_next)
        
        return await call_next(request)
    
    async def _handle_sync_request(self, request: Request) -> Response:
        """Handle offline transaction sync"""
        try:
            body = await request.json()
            user_id = body.get("user_id")
            transactions = body.get("transactions", [])
            
            results = []
            for tx in transactions:
                result = await self._process_offline_transaction(tx)
                results.append(result)
            
            return JSONResponse({
                "synced": len([r for r in results if r.get("success")]),
                "failed": len([r for r in results if not r.get("success")]),
                "results": results,
            })
        except Exception as e:
            logger.error(f"Sync error: {e}")
            return JSONResponse({"error": str(e)}, status_code=500)
    
    async def _handle_offline_transaction(self, request: Request) -> Response:
        """Handle individual offline transaction"""
        try:
            tx = await request.json()
            result = await self._process_offline_transaction(tx)
            return JSONResponse(result)
        except Exception as e:
            logger.error(f"Offline transaction error: {e}")
            return JSONResponse({"error": str(e)}, status_code=500)
    
    async def _process_offline_transaction(self, tx: Dict) -> Dict:
        """Process a single offline transaction"""
        tx_id = tx.get("transaction_id")
        
        # Validate expiry
        created_at = datetime.fromisoformat(tx.get("created_at", datetime.utcnow().isoformat()))
        if datetime.utcnow() - created_at > self.transaction_expiry:
            return {
                "transaction_id": tx_id,
                "success": False,
                "error": "Transaction expired",
                "conflict_type": "expired",
            }
        
        # Validate amount
        amount = float(tx.get("amount", 0))
        if amount > self.max_offline_amount:
            return {
                "transaction_id": tx_id,
                "success": False,
                "error": f"Amount exceeds offline limit of {self.max_offline_amount}",
                "conflict_type": "amount_exceeded",
            }
        
        # Check for duplicate nonce
        nonce = tx.get("nonce")
        if self.redis:
            if await self.redis.exists(f"offline:nonce:{nonce}"):
                return {
                    "transaction_id": tx_id,
                    "success": False,
                    "error": "Duplicate transaction (replay detected)",
                    "conflict_type": "duplicate_nonce",
                }
            # Mark nonce as used
            await self.redis.set(f"offline:nonce:{nonce}", "1", ex=86400 * 7)
        
        # Process transaction (would call actual services)
        # For now, return success
        return {
            "transaction_id": tx_id,
            "success": True,
            "reference": f"OFF{int(time.time() * 1000)}",
            "processed_at": datetime.utcnow().isoformat(),
        }
    
    async def _handle_delta_sync(self, request: Request, call_next) -> Response:
        """Handle delta sync request"""
        last_sync = request.headers.get("x-last-sync-timestamp")
        
        # Get response
        response = await call_next(request)
        
        # Add delta sync headers
        headers = dict(response.headers)
        headers["x-sync-timestamp"] = datetime.utcnow().isoformat()
        headers["x-delta-sync"] = "true"
        
        # Read and filter response for delta
        if last_sync:
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            
            try:
                data = json.loads(body)
                # Filter to only items modified since last sync
                if isinstance(data, list):
                    last_sync_dt = datetime.fromisoformat(last_sync)
                    data = [
                        item for item in data
                        if datetime.fromisoformat(item.get("updated_at", "1970-01-01")) > last_sync_dt
                    ]
                    body = json.dumps(data).encode()
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
            
            return Response(
                content=body,
                status_code=response.status_code,
                headers=headers,
                media_type="application/json",
            )
        
        return response


# Dapr integration helper
class DaprConnectivityClient:
    """Client for invoking connectivity service via Dapr"""
    
    def __init__(self, dapr_port: int = 3500):
        self.dapr_url = f"http://localhost:{dapr_port}"
        self.app_id = "connectivity-service"
    
    async def update_power_state(self, device_id: str, battery_level: int, is_charging: bool) -> Dict:
        """Update device power state"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.dapr_url}/v1.0/invoke/{self.app_id}/method/api/v1/connectivity/power/state",
                json={
                    "device_id": device_id,
                    "battery_level": battery_level,
                    "is_charging": is_charging,
                }
            )
            return response.json()
    
    async def update_network_quality(self, device_id: str, connection_type: str, speed: float) -> Dict:
        """Update network quality"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.dapr_url}/v1.0/invoke/{self.app_id}/method/api/v1/connectivity/adaptive/network",
                json={
                    "device_id": device_id,
                    "connection_type": connection_type,
                    "download_speed": speed,
                }
            )
            return response.json()
    
    async def get_data_saver_settings(self, user_id: str) -> Dict:
        """Get data saver settings"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.dapr_url}/v1.0/invoke/{self.app_id}/method/api/v1/connectivity/datasaver/{user_id}"
            )
            return response.json()


# APISIX plugin configuration generator
def generate_apisix_connectivity_plugin() -> Dict:
    """Generate APISIX plugin configuration for connectivity optimization"""
    return {
        "name": "connectivity-optimizer",
        "config": {
            "enable_compression": True,
            "compression_threshold": 1024,
            "enable_caching": True,
            "cache_ttl": 300,
            "adaptive_headers": [
                "x-connection-type",
                "x-battery-level",
                "x-data-saver-mode",
            ],
            "slow_connection_types": ["2g", "3g"],
            "batch_endpoints": [
                "/api/v1/analytics/*",
                "/api/v1/notifications/*",
            ],
            "critical_endpoints": [
                "/api/v1/transfers/*",
                "/api/v1/payments/*",
                "/api/v1/escrow/*",
            ],
        }
    }
