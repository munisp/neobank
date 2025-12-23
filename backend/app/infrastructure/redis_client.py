"""
Redis Client Infrastructure for NeoBank
Provides Redis connection with Sentinel HA support for production deployments.
"""

import os
import json
from typing import Optional, Dict, Any, List
from datetime import timedelta
import redis
from redis.sentinel import Sentinel
import structlog

logger = structlog.get_logger(__name__)

# Environment configuration
REDIS_MODE = os.getenv("REDIS_MODE", "standalone")  # standalone or sentinel
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

# Sentinel configuration
REDIS_SENTINEL_HOSTS = os.getenv("REDIS_SENTINEL_HOSTS", "localhost:26379")
REDIS_SENTINEL_MASTER = os.getenv("REDIS_SENTINEL_MASTER", "mymaster")


class RedisClient:
    """
    Redis client with Sentinel HA support.
    Singleton pattern for connection reuse.
    """
    
    _instance: Optional['RedisClient'] = None
    _client: Optional[redis.Redis] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Redis client based on configuration"""
        try:
            if REDIS_MODE == "sentinel":
                # Parse sentinel hosts
                sentinel_hosts = []
                for host_port in REDIS_SENTINEL_HOSTS.split(","):
                    host, port = host_port.strip().split(":")
                    sentinel_hosts.append((host, int(port)))
                
                sentinel = Sentinel(
                    sentinel_hosts,
                    socket_timeout=5.0,
                    password=REDIS_PASSWORD
                )
                
                self._client = sentinel.master_for(
                    REDIS_SENTINEL_MASTER,
                    socket_timeout=5.0,
                    password=REDIS_PASSWORD,
                    db=REDIS_DB
                )
                
                logger.info("Redis Sentinel client initialized",
                           master=REDIS_SENTINEL_MASTER,
                           sentinels=sentinel_hosts)
            else:
                # Standalone mode
                self._client = redis.Redis(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    password=REDIS_PASSWORD,
                    db=REDIS_DB,
                    decode_responses=True,
                    socket_timeout=5.0,
                    socket_connect_timeout=5.0
                )
                
                logger.info("Redis standalone client initialized",
                           host=REDIS_HOST,
                           port=REDIS_PORT)
            
            # Test connection
            self._client.ping()
            logger.info("Redis connection verified")
            
        except Exception as e:
            logger.error("Failed to initialize Redis client", error=str(e))
            # Don't raise - allow graceful degradation
            self._client = None
    
    @property
    def client(self) -> Optional[redis.Redis]:
        """Get Redis client instance"""
        return self._client
    
    def is_available(self) -> bool:
        """Check if Redis is available"""
        if self._client is None:
            return False
        try:
            self._client.ping()
            return True
        except:
            return False
    
    # ==================== Key-Value Operations ====================
    
    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> bool:
        """Set a key-value pair with optional TTL"""
        if not self._client:
            return False
        try:
            serialized = json.dumps(value) if not isinstance(value, str) else value
            if ttl_seconds:
                self._client.setex(key, ttl_seconds, serialized)
            else:
                self._client.set(key, serialized)
            return True
        except Exception as e:
            logger.error("Redis SET failed", key=key, error=str(e))
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """Get a value by key"""
        if not self._client:
            return None
        try:
            value = self._client.get(key)
            if value is None:
                return None
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        except Exception as e:
            logger.error("Redis GET failed", key=key, error=str(e))
            return None
    
    def delete(self, key: str) -> bool:
        """Delete a key"""
        if not self._client:
            return False
        try:
            self._client.delete(key)
            return True
        except Exception as e:
            logger.error("Redis DELETE failed", key=key, error=str(e))
            return False
    
    def exists(self, key: str) -> bool:
        """Check if key exists"""
        if not self._client:
            return False
        try:
            return bool(self._client.exists(key))
        except Exception as e:
            logger.error("Redis EXISTS failed", key=key, error=str(e))
            return False
    
    # ==================== Hash Operations ====================
    
    def hset(self, name: str, key: str, value: Any) -> bool:
        """Set a hash field"""
        if not self._client:
            return False
        try:
            serialized = json.dumps(value) if not isinstance(value, str) else value
            self._client.hset(name, key, serialized)
            return True
        except Exception as e:
            logger.error("Redis HSET failed", name=name, key=key, error=str(e))
            return False
    
    def hget(self, name: str, key: str) -> Optional[Any]:
        """Get a hash field"""
        if not self._client:
            return None
        try:
            value = self._client.hget(name, key)
            if value is None:
                return None
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        except Exception as e:
            logger.error("Redis HGET failed", name=name, key=key, error=str(e))
            return None
    
    def hgetall(self, name: str) -> Dict[str, Any]:
        """Get all hash fields"""
        if not self._client:
            return {}
        try:
            result = self._client.hgetall(name)
            parsed = {}
            for k, v in result.items():
                try:
                    parsed[k] = json.loads(v)
                except json.JSONDecodeError:
                    parsed[k] = v
            return parsed
        except Exception as e:
            logger.error("Redis HGETALL failed", name=name, error=str(e))
            return {}
    
    def hdel(self, name: str, key: str) -> bool:
        """Delete a hash field"""
        if not self._client:
            return False
        try:
            self._client.hdel(name, key)
            return True
        except Exception as e:
            logger.error("Redis HDEL failed", name=name, key=key, error=str(e))
            return False
    
    # ==================== Expiration ====================
    
    def expire(self, key: str, seconds: int) -> bool:
        """Set expiration on a key"""
        if not self._client:
            return False
        try:
            self._client.expire(key, seconds)
            return True
        except Exception as e:
            logger.error("Redis EXPIRE failed", key=key, error=str(e))
            return False
    
    def ttl(self, key: str) -> int:
        """Get TTL of a key (-1 if no expiry, -2 if not exists)"""
        if not self._client:
            return -2
        try:
            return self._client.ttl(key)
        except Exception as e:
            logger.error("Redis TTL failed", key=key, error=str(e))
            return -2


# Global singleton instance
redis_client = RedisClient()


# Convenience exports
__all__ = [
    "RedisClient",
    "redis_client",
    "REDIS_MODE",
    "REDIS_HOST",
    "REDIS_PORT"
]
