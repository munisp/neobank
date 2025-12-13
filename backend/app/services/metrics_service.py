"""
Metrics Service - Prometheus Metrics for Observability

Provides metrics for:
- HTTP request latency and counts
- Business metrics (transactions, loans, etc.)
- System metrics (connections, cache hits, etc.)
- Circuit breaker states
"""

import time
from typing import Dict, Optional, Callable
from dataclasses import dataclass, field
from collections import defaultdict
from functools import wraps
import asyncio
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class Counter:
    """Simple counter metric"""
    name: str
    help: str
    labels: tuple = ()
    values: Dict[tuple, float] = field(default_factory=lambda: defaultdict(float))
    
    def inc(self, amount: float = 1, **label_values):
        key = tuple(label_values.get(l, "") for l in self.labels)
        self.values[key] += amount
    
    def get(self, **label_values) -> float:
        key = tuple(label_values.get(l, "") for l in self.labels)
        return self.values.get(key, 0)


@dataclass
class Gauge:
    """Simple gauge metric"""
    name: str
    help: str
    labels: tuple = ()
    values: Dict[tuple, float] = field(default_factory=lambda: defaultdict(float))
    
    def set(self, value: float, **label_values):
        key = tuple(label_values.get(l, "") for l in self.labels)
        self.values[key] = value
    
    def inc(self, amount: float = 1, **label_values):
        key = tuple(label_values.get(l, "") for l in self.labels)
        self.values[key] += amount
    
    def dec(self, amount: float = 1, **label_values):
        key = tuple(label_values.get(l, "") for l in self.labels)
        self.values[key] -= amount
    
    def get(self, **label_values) -> float:
        key = tuple(label_values.get(l, "") for l in self.labels)
        return self.values.get(key, 0)


@dataclass
class Histogram:
    """Simple histogram metric with predefined buckets"""
    name: str
    help: str
    labels: tuple = ()
    buckets: tuple = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10)
    counts: Dict[tuple, Dict[float, int]] = field(default_factory=lambda: defaultdict(lambda: defaultdict(int)))
    sums: Dict[tuple, float] = field(default_factory=lambda: defaultdict(float))
    totals: Dict[tuple, int] = field(default_factory=lambda: defaultdict(int))
    
    def observe(self, value: float, **label_values):
        key = tuple(label_values.get(l, "") for l in self.labels)
        self.sums[key] += value
        self.totals[key] += 1
        for bucket in self.buckets:
            if value <= bucket:
                self.counts[key][bucket] += 1
        self.counts[key][float('inf')] += 1


class MetricsRegistry:
    """Registry for all application metrics"""
    
    def __init__(self):
        self.http_requests_total = Counter(
            name="http_requests_total",
            help="Total HTTP requests",
            labels=("method", "path", "status")
        )
        
        self.http_request_duration_seconds = Histogram(
            name="http_request_duration_seconds",
            help="HTTP request duration in seconds",
            labels=("method", "path"),
            buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10)
        )
        
        self.active_connections = Gauge(
            name="active_connections",
            help="Number of active connections",
            labels=("type",)
        )
        
        self.transactions_total = Counter(
            name="transactions_total",
            help="Total transactions processed",
            labels=("type", "status", "currency")
        )
        
        self.transaction_amount_total = Counter(
            name="transaction_amount_total",
            help="Total transaction amount",
            labels=("type", "currency")
        )
        
        self.loans_total = Counter(
            name="loans_total",
            help="Total loans processed",
            labels=("type", "status")
        )
        
        self.loan_amount_total = Counter(
            name="loan_amount_total",
            help="Total loan amount disbursed",
            labels=("type", "currency")
        )
        
        self.kyc_verifications_total = Counter(
            name="kyc_verifications_total",
            help="Total KYC verifications",
            labels=("country", "status", "tier")
        )
        
        self.investments_total = Counter(
            name="investments_total",
            help="Total investment trades",
            labels=("exchange", "type", "status")
        )
        
        self.investment_volume_total = Counter(
            name="investment_volume_total",
            help="Total investment volume",
            labels=("exchange", "currency")
        )
        
        self.cache_hits_total = Counter(
            name="cache_hits_total",
            help="Total cache hits",
            labels=("cache_type",)
        )
        
        self.cache_misses_total = Counter(
            name="cache_misses_total",
            help="Total cache misses",
            labels=("cache_type",)
        )
        
        self.circuit_breaker_state = Gauge(
            name="circuit_breaker_state",
            help="Circuit breaker state (0=closed, 1=half_open, 2=open)",
            labels=("service",)
        )
        
        self.circuit_breaker_failures_total = Counter(
            name="circuit_breaker_failures_total",
            help="Total circuit breaker failures",
            labels=("service",)
        )
        
        self.external_api_requests_total = Counter(
            name="external_api_requests_total",
            help="Total external API requests",
            labels=("service", "status")
        )
        
        self.external_api_duration_seconds = Histogram(
            name="external_api_duration_seconds",
            help="External API request duration",
            labels=("service",),
            buckets=(0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30)
        )
        
        self.websocket_connections = Gauge(
            name="websocket_connections",
            help="Active WebSocket connections",
            labels=()
        )
        
        self.notifications_sent_total = Counter(
            name="notifications_sent_total",
            help="Total notifications sent",
            labels=("type", "channel")
        )
        
        self.rate_limit_exceeded_total = Counter(
            name="rate_limit_exceeded_total",
            help="Total rate limit exceeded events",
            labels=("tier",)
        )
        
        self.fraud_events_total = Counter(
            name="fraud_events_total",
            help="Total fraud events detected",
            labels=("type", "severity")
        )
        
        self.bill_payments_total = Counter(
            name="bill_payments_total",
            help="Total bill payments",
            labels=("type", "provider", "status")
        )
        
        self.savings_deposits_total = Counter(
            name="savings_deposits_total",
            help="Total savings deposits",
            labels=("vault_type",)
        )
        
        self.rewards_earned_total = Counter(
            name="rewards_earned_total",
            help="Total rewards points earned",
            labels=("source",)
        )
    
    def to_prometheus_format(self) -> str:
        """Export all metrics in Prometheus text format"""
        lines = []
        
        for attr_name in dir(self):
            attr = getattr(self, attr_name)
            if isinstance(attr, Counter):
                lines.append(f"# HELP {attr.name} {attr.help}")
                lines.append(f"# TYPE {attr.name} counter")
                for labels, value in attr.values.items():
                    label_str = self._format_labels(attr.labels, labels)
                    lines.append(f"{attr.name}{label_str} {value}")
            
            elif isinstance(attr, Gauge):
                lines.append(f"# HELP {attr.name} {attr.help}")
                lines.append(f"# TYPE {attr.name} gauge")
                for labels, value in attr.values.items():
                    label_str = self._format_labels(attr.labels, labels)
                    lines.append(f"{attr.name}{label_str} {value}")
            
            elif isinstance(attr, Histogram):
                lines.append(f"# HELP {attr.name} {attr.help}")
                lines.append(f"# TYPE {attr.name} histogram")
                for labels in attr.counts.keys():
                    label_str = self._format_labels(attr.labels, labels)
                    for bucket, count in sorted(attr.counts[labels].items()):
                        le = "+Inf" if bucket == float('inf') else str(bucket)
                        bucket_labels = label_str[:-1] + f',le="{le}"}}' if label_str else f'{{le="{le}"}}'
                        lines.append(f"{attr.name}_bucket{bucket_labels} {count}")
                    lines.append(f"{attr.name}_sum{label_str} {attr.sums[labels]}")
                    lines.append(f"{attr.name}_count{label_str} {attr.totals[labels]}")
        
        return "\n".join(lines)
    
    def _format_labels(self, label_names: tuple, label_values: tuple) -> str:
        """Format labels for Prometheus output"""
        if not label_names:
            return ""
        pairs = [f'{name}="{value}"' for name, value in zip(label_names, label_values)]
        return "{" + ",".join(pairs) + "}"


metrics = MetricsRegistry()


def get_metrics() -> MetricsRegistry:
    return metrics


def track_request(method: str, path: str, status: int, duration: float):
    """Track HTTP request metrics"""
    normalized_path = _normalize_path(path)
    metrics.http_requests_total.inc(method=method, path=normalized_path, status=str(status))
    metrics.http_request_duration_seconds.observe(duration, method=method, path=normalized_path)


def track_transaction(transaction_type: str, status: str, currency: str, amount: float):
    """Track transaction metrics"""
    metrics.transactions_total.inc(type=transaction_type, status=status, currency=currency)
    if status == "completed":
        metrics.transaction_amount_total.inc(amount, type=transaction_type, currency=currency)


def track_loan(loan_type: str, status: str, currency: str = "NGN", amount: float = 0):
    """Track loan metrics"""
    metrics.loans_total.inc(type=loan_type, status=status)
    if status == "disbursed":
        metrics.loan_amount_total.inc(amount, type=loan_type, currency=currency)


def track_kyc(country: str, status: str, tier: str):
    """Track KYC verification metrics"""
    metrics.kyc_verifications_total.inc(country=country, status=status, tier=tier)


def track_investment(exchange: str, trade_type: str, status: str, currency: str = "USD", amount: float = 0):
    """Track investment metrics"""
    metrics.investments_total.inc(exchange=exchange, type=trade_type, status=status)
    if status == "executed":
        metrics.investment_volume_total.inc(amount, exchange=exchange, currency=currency)


def track_cache(cache_type: str, hit: bool):
    """Track cache hit/miss metrics"""
    if hit:
        metrics.cache_hits_total.inc(cache_type=cache_type)
    else:
        metrics.cache_misses_total.inc(cache_type=cache_type)


def track_circuit_breaker(service: str, state: str, failure: bool = False):
    """Track circuit breaker metrics"""
    state_map = {"closed": 0, "half_open": 1, "open": 2}
    metrics.circuit_breaker_state.set(state_map.get(state, 0), service=service)
    if failure:
        metrics.circuit_breaker_failures_total.inc(service=service)


def track_external_api(service: str, status: str, duration: float):
    """Track external API call metrics"""
    metrics.external_api_requests_total.inc(service=service, status=status)
    metrics.external_api_duration_seconds.observe(duration, service=service)


def track_websocket_connection(connected: bool):
    """Track WebSocket connection metrics"""
    if connected:
        metrics.websocket_connections.inc()
    else:
        metrics.websocket_connections.dec()


def track_notification(notification_type: str, channel: str):
    """Track notification metrics"""
    metrics.notifications_sent_total.inc(type=notification_type, channel=channel)


def track_rate_limit(tier: str):
    """Track rate limit exceeded events"""
    metrics.rate_limit_exceeded_total.inc(tier=tier)


def track_fraud_event(fraud_type: str, severity: str):
    """Track fraud detection metrics"""
    metrics.fraud_events_total.inc(type=fraud_type, severity=severity)


def track_bill_payment(bill_type: str, provider: str, status: str):
    """Track bill payment metrics"""
    metrics.bill_payments_total.inc(type=bill_type, provider=provider, status=status)


def track_savings_deposit(vault_type: str, amount: float):
    """Track savings deposit metrics"""
    metrics.savings_deposits_total.inc(amount, vault_type=vault_type)


def track_reward(source: str, points: int):
    """Track rewards metrics"""
    metrics.rewards_earned_total.inc(points, source=source)


def _normalize_path(path: str) -> str:
    """Normalize path for metrics (replace IDs with placeholders)"""
    import re
    path = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{id}', path)
    path = re.sub(r'/\d+', '/{id}', path)
    return path


def timed(metric_name: Optional[str] = None):
    """Decorator to track function execution time"""
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start = time.time()
            try:
                return await func(*args, **kwargs)
            finally:
                duration = time.time() - start
                name = metric_name or func.__name__
                logger.debug("function_timed", function=name, duration_ms=duration * 1000)
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start = time.time()
            try:
                return func(*args, **kwargs)
            finally:
                duration = time.time() - start
                name = metric_name or func.__name__
                logger.debug("function_timed", function=name, duration_ms=duration * 1000)
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator
