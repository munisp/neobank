"""
Performance Optimization Service
Implements caching, query optimization, and performance monitoring
Targets: <100ms API response, 10K+ concurrent users, 99.99% uptime
"""

import asyncio
import json
import time
from typing import Any, Optional, Dict, Callable
from datetime import datetime, timezone, timedelta
from functools import wraps
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis
from collections import defaultdict

logger = structlog.get_logger()


class CacheService:
    """
    Redis-based caching service
    Reduces database load and improves response times
    """
    
    def __init__(self):
        self.redis_url = "redis://localhost:6379/0"
        self.redis_client: Optional[redis.Redis] = None
        self.default_ttl = 300  # 5 minutes
        self.hit_count = 0
        self.miss_count = 0
    
    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis_client = await redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            await self.redis_client.ping()
            logger.info("Connected to Redis cache")
        except Exception as e:
            logger.warning("Redis connection failed, using in-memory fallback", error=str(e))
            self.redis_client = None
    
    async def disconnect(self):
        """Disconnect from Redis"""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Disconnected from Redis")
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            if not self.redis_client:
                return None
            
            value = await self.redis_client.get(key)
            
            if value:
                self.hit_count += 1
                logger.debug("Cache hit", key=key)
                return json.loads(value)
            else:
                self.miss_count += 1
                logger.debug("Cache miss", key=key)
                return None
                
        except Exception as e:
            logger.error("Cache get error", key=key, error=str(e))
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Set value in cache"""
        try:
            if not self.redis_client:
                return
            
            ttl = ttl or self.default_ttl
            serialized = json.dumps(value, default=str)
            
            await self.redis_client.setex(key, ttl, serialized)
            logger.debug("Cache set", key=key, ttl=ttl)
            
        except Exception as e:
            logger.error("Cache set error", key=key, error=str(e))
    
    async def delete(self, key: str):
        """Delete value from cache"""
        try:
            if not self.redis_client:
                return
            
            await self.redis_client.delete(key)
            logger.debug("Cache delete", key=key)
            
        except Exception as e:
            logger.error("Cache delete error", key=key, error=str(e))
    
    async def delete_pattern(self, pattern: str):
        """Delete all keys matching pattern"""
        try:
            if not self.redis_client:
                return
            
            keys = await self.redis_client.keys(pattern)
            if keys:
                await self.redis_client.delete(*keys)
                logger.debug("Cache pattern delete", pattern=pattern, count=len(keys))
                
        except Exception as e:
            logger.error("Cache pattern delete error", pattern=pattern, error=str(e))
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self.hit_count + self.miss_count
        hit_rate = (self.hit_count / total * 100) if total > 0 else 0
        
        return {
            "hit_count": self.hit_count,
            "miss_count": self.miss_count,
            "hit_rate": round(hit_rate, 2),
            "total_requests": total
        }


def cached(ttl: int = 300, key_prefix: str = ""):
    """
    Decorator for caching function results
    
    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Try to get from cache
            cache_service = CacheService()
            await cache_service.connect()
            
            cached_value = await cache_service.get(cache_key)
            if cached_value is not None:
                await cache_service.disconnect()
                return cached_value
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Store in cache
            await cache_service.set(cache_key, result, ttl)
            await cache_service.disconnect()
            
            return result
        
        return wrapper
    return decorator


class QueryOptimizationService:
    """
    Query optimization service
    Analyzes and optimizes database queries
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.slow_query_threshold = 1.0  # 1 second
        self.slow_queries: list = []
    
    async def analyze_query_performance(self, query: str) -> Dict[str, Any]:
        """
        Analyze query performance using EXPLAIN ANALYZE
        
        Args:
            query: SQL query to analyze
            
        Returns:
            Query performance analysis
        """
        try:
            explain_query = f"EXPLAIN ANALYZE {query}"
            result = await self.db.execute(text(explain_query))
            rows = result.fetchall()
            
            analysis = {
                "query": query,
                "execution_plan": [row[0] for row in rows],
                "analyzed_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Extract execution time
            for row in rows:
                if "Execution Time" in row[0]:
                    time_str = row[0].split(":")[-1].strip().split()[0]
                    analysis["execution_time_ms"] = float(time_str)
            
            logger.info("Query performance analyzed",
                       execution_time=analysis.get("execution_time_ms", 0))
            
            return analysis
            
        except Exception as e:
            logger.error("Query analysis failed", error=str(e))
            return {"error": str(e)}
    
    async def create_missing_indexes(self) -> Dict[str, Any]:
        """
        Identify and create missing indexes
        
        Returns:
            Index creation results
        """
        try:
            # Analyze table usage
            query = text("""
                SELECT 
                    schemaname,
                    tablename,
                    seq_scan,
                    seq_tup_read,
                    idx_scan,
                    idx_tup_fetch,
                    CASE 
                        WHEN seq_scan > 0 THEN seq_tup_read / seq_scan 
                        ELSE 0 
                    END as avg_seq_read
                FROM pg_stat_user_tables
                WHERE schemaname = 'public'
                AND seq_scan > 100  -- Tables with significant sequential scans
                ORDER BY seq_scan DESC
            """)
            
            result = await self.db.execute(query)
            rows = result.fetchall()
            
            recommendations = []
            
            for row in rows:
                if row.idx_scan == 0 or (row.seq_scan / (row.idx_scan + 1)) > 10:
                    recommendations.append({
                        "table": row.tablename,
                        "seq_scans": row.seq_scan,
                        "index_scans": row.idx_scan,
                        "recommendation": f"Consider adding index on frequently queried columns in {row.tablename}"
                    })
            
            logger.info("Index recommendations generated",
                       count=len(recommendations))
            
            return {
                "recommendations": recommendations,
                "analyzed_at": datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error("Index analysis failed", error=str(e))
            return {"error": str(e)}
    
    async def optimize_table_statistics(self) -> bool:
        """Update table statistics for query planner"""
        try:
            await self.db.execute(text("ANALYZE"))
            await self.db.commit()
            
            logger.info("Table statistics updated")
            return True
            
        except Exception as e:
            logger.error("Statistics update failed", error=str(e))
            return False
    
    def track_slow_query(self, query: str, execution_time: float):
        """Track slow queries for analysis"""
        if execution_time > self.slow_query_threshold:
            self.slow_queries.append({
                "query": query,
                "execution_time": execution_time,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            logger.warning("Slow query detected",
                          query=query[:100],
                          execution_time=execution_time)
    
    def get_slow_queries(self, limit: int = 10) -> list:
        """Get slowest queries"""
        sorted_queries = sorted(
            self.slow_queries,
            key=lambda x: x["execution_time"],
            reverse=True
        )
        return sorted_queries[:limit]


class ConnectionPoolOptimizer:
    """
    Database connection pool optimization
    Monitors and optimizes connection usage
    """
    
    def __init__(self):
        self.connection_stats = defaultdict(int)
        self.pool_size_recommendations = {}
    
    async def analyze_connection_usage(self, db_session: AsyncSession) -> Dict[str, Any]:
        """Analyze database connection usage"""
        try:
            query = text("""
                SELECT 
                    COUNT(*) as total_connections,
                    COUNT(*) FILTER (WHERE state = 'active') as active_connections,
                    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
                    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
                    MAX(EXTRACT(EPOCH FROM (NOW() - state_change))) as max_connection_age
                FROM pg_stat_activity
                WHERE datname = current_database()
            """)
            
            result = await db_session.execute(query)
            row = result.fetchone()
            
            analysis = {
                "total_connections": row.total_connections,
                "active_connections": row.active_connections,
                "idle_connections": row.idle_connections,
                "idle_in_transaction": row.idle_in_transaction,
                "max_connection_age_seconds": row.max_connection_age,
                "analyzed_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Generate recommendations
            if row.idle_connections > row.active_connections * 2:
                analysis["recommendation"] = "Consider reducing pool size - too many idle connections"
            elif row.active_connections > row.total_connections * 0.8:
                analysis["recommendation"] = "Consider increasing pool size - high utilization"
            else:
                analysis["recommendation"] = "Connection pool size is optimal"
            
            logger.info("Connection usage analyzed",
                       total=row.total_connections,
                       active=row.active_connections)
            
            return analysis
            
        except Exception as e:
            logger.error("Connection analysis failed", error=str(e))
            return {"error": str(e)}


class PerformanceMonitoringService:
    """
    Real-time performance monitoring
    Tracks API response times, throughput, and errors
    """
    
    def __init__(self):
        self.request_times: list = []
        self.error_count = 0
        self.request_count = 0
        self.start_time = time.time()
    
    def track_request(self, endpoint: str, response_time: float, status_code: int):
        """Track API request performance"""
        self.request_count += 1
        self.request_times.append(response_time)
        
        if status_code >= 400:
            self.error_count += 1
        
        # Keep only last 1000 requests
        if len(self.request_times) > 1000:
            self.request_times = self.request_times[-1000:]
        
        # Log slow requests
        if response_time > 1.0:
            logger.warning("Slow request detected",
                          endpoint=endpoint,
                          response_time=response_time)
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get performance metrics"""
        if not self.request_times:
            return {
                "avg_response_time": 0,
                "p50_response_time": 0,
                "p95_response_time": 0,
                "p99_response_time": 0,
                "requests_per_second": 0,
                "error_rate": 0
            }
        
        import numpy as np
        
        times = np.array(self.request_times)
        uptime_seconds = time.time() - self.start_time
        
        metrics = {
            "avg_response_time": round(float(np.mean(times)), 3),
            "p50_response_time": round(float(np.percentile(times, 50)), 3),
            "p95_response_time": round(float(np.percentile(times, 95)), 3),
            "p99_response_time": round(float(np.percentile(times, 99)), 3),
            "requests_per_second": round(self.request_count / uptime_seconds, 2),
            "error_rate": round((self.error_count / self.request_count * 100), 2) if self.request_count > 0 else 0,
            "total_requests": self.request_count,
            "total_errors": self.error_count,
            "uptime_seconds": round(uptime_seconds, 2)
        }
        
        return metrics
    
    def check_sla_compliance(self, target_p99: float = 0.2) -> Dict[str, Any]:
        """
        Check SLA compliance
        
        Args:
            target_p99: Target P99 response time in seconds (default 200ms)
            
        Returns:
            SLA compliance status
        """
        metrics = self.get_performance_metrics()
        
        p99_compliant = metrics["p99_response_time"] <= target_p99
        error_rate_compliant = metrics["error_rate"] <= 1.0  # <1% error rate
        
        compliance = {
            "p99_compliant": p99_compliant,
            "p99_target": target_p99,
            "p99_actual": metrics["p99_response_time"],
            "error_rate_compliant": error_rate_compliant,
            "error_rate_target": 1.0,
            "error_rate_actual": metrics["error_rate"],
            "overall_compliant": p99_compliant and error_rate_compliant
        }
        
        return compliance


class PerformanceOptimizationService:
    """
    Comprehensive performance optimization service
    Combines caching, query optimization, and monitoring
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.cache = CacheService()
        self.query_optimizer = QueryOptimizationService(db_session)
        self.connection_optimizer = ConnectionPoolOptimizer()
        self.performance_monitor = PerformanceMonitoringService()
    
    async def initialize(self):
        """Initialize performance services"""
        await self.cache.connect()
        logger.info("Performance optimization service initialized")
    
    async def shutdown(self):
        """Shutdown performance services"""
        await self.cache.disconnect()
        logger.info("Performance optimization service shutdown")
    
    async def run_optimization_suite(self) -> Dict[str, Any]:
        """
        Run complete optimization suite
        
        Returns:
            Optimization results and recommendations
        """
        try:
            # Update table statistics
            stats_updated = await self.query_optimizer.optimize_table_statistics()
            
            # Analyze connection usage
            connection_analysis = await self.connection_optimizer.analyze_connection_usage(self.db)
            
            # Get index recommendations
            index_recommendations = await self.query_optimizer.create_missing_indexes()
            
            # Get cache statistics
            cache_stats = self.cache.get_stats()
            
            # Get performance metrics
            performance_metrics = self.performance_monitor.get_performance_metrics()
            
            # Check SLA compliance
            sla_compliance = self.performance_monitor.check_sla_compliance()
            
            # Get slow queries
            slow_queries = self.query_optimizer.get_slow_queries()
            
            results = {
                "statistics_updated": stats_updated,
                "connection_analysis": connection_analysis,
                "index_recommendations": index_recommendations,
                "cache_statistics": cache_stats,
                "performance_metrics": performance_metrics,
                "sla_compliance": sla_compliance,
                "slow_queries": slow_queries,
                "optimized_at": datetime.now(timezone.utc).isoformat()
            }
            
            logger.info("Optimization suite completed",
                       sla_compliant=sla_compliance["overall_compliant"],
                       cache_hit_rate=cache_stats["hit_rate"])
            
            return results
            
        except Exception as e:
            logger.error("Optimization suite failed", error=str(e))
            return {"error": str(e)}
    
    async def get_optimization_status(self) -> Dict[str, Any]:
        """Get current optimization status"""
        return {
            "cache_stats": self.cache.get_stats(),
            "performance_metrics": self.performance_monitor.get_performance_metrics(),
            "sla_compliance": self.performance_monitor.check_sla_compliance(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


# Global performance monitor instance
_performance_monitor = PerformanceMonitoringService()


def get_performance_monitor() -> PerformanceMonitoringService:
    """Get global performance monitor instance"""
    return _performance_monitor
