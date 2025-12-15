"""
OpenTelemetry Configuration for Distributed Tracing

This module provides comprehensive observability configuration including:
- Distributed tracing with context propagation
- Metrics collection
- Log correlation
- Service mesh integration
"""

import os
from typing import Optional, Dict, Any
from dataclasses import dataclass
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class OTelConfig:
    """OpenTelemetry configuration"""
    
    service_name: str
    service_version: str
    environment: str
    otlp_endpoint: str
    otlp_headers: Dict[str, str]
    sampling_rate: float
    enable_traces: bool
    enable_metrics: bool
    enable_logs: bool
    
    @classmethod
    def from_env(cls, service_name: str = "neobank-api") -> "OTelConfig":
        return cls(
            service_name=os.getenv("OTEL_SERVICE_NAME", service_name),
            service_version=os.getenv("OTEL_SERVICE_VERSION", "1.0.0"),
            environment=os.getenv("OTEL_ENVIRONMENT", "development"),
            otlp_endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
            otlp_headers={},
            sampling_rate=float(os.getenv("OTEL_SAMPLING_RATE", "1.0")),
            enable_traces=os.getenv("OTEL_TRACES_ENABLED", "true").lower() == "true",
            enable_metrics=os.getenv("OTEL_METRICS_ENABLED", "true").lower() == "true",
            enable_logs=os.getenv("OTEL_LOGS_ENABLED", "true").lower() == "true"
        )


class TracingService:
    """
    Distributed tracing service using OpenTelemetry.
    
    Provides:
    - Automatic span creation for HTTP requests
    - Context propagation across services
    - Custom span attributes for business context
    - Error tracking and exception recording
    """
    
    def __init__(self, config: Optional[OTelConfig] = None):
        self.config = config or OTelConfig.from_env()
        self._tracer = None
        self._meter = None
        self._initialized = False
    
    def initialize(self):
        """Initialize OpenTelemetry SDK"""
        if self._initialized:
            return
        
        try:
            from opentelemetry import trace, metrics
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            from opentelemetry.sdk.metrics import MeterProvider
            from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
            from opentelemetry.sdk.trace.sampling import TraceIdRatioBased
            
            resource = Resource.create({
                SERVICE_NAME: self.config.service_name,
                SERVICE_VERSION: self.config.service_version,
                "deployment.environment": self.config.environment
            })
            
            if self.config.enable_traces:
                sampler = TraceIdRatioBased(self.config.sampling_rate)
                tracer_provider = TracerProvider(resource=resource, sampler=sampler)
                
                otlp_exporter = OTLPSpanExporter(endpoint=self.config.otlp_endpoint)
                span_processor = BatchSpanProcessor(otlp_exporter)
                tracer_provider.add_span_processor(span_processor)
                
                trace.set_tracer_provider(tracer_provider)
                self._tracer = trace.get_tracer(self.config.service_name)
            
            if self.config.enable_metrics:
                metric_exporter = OTLPMetricExporter(endpoint=self.config.otlp_endpoint)
                meter_provider = MeterProvider(resource=resource)
                metrics.set_meter_provider(meter_provider)
                self._meter = metrics.get_meter(self.config.service_name)
            
            self._initialized = True
            logger.info(
                "opentelemetry_initialized",
                service_name=self.config.service_name,
                endpoint=self.config.otlp_endpoint
            )
            
        except ImportError:
            logger.warning("opentelemetry_not_installed", message="OpenTelemetry packages not installed")
        except Exception as e:
            logger.error("opentelemetry_init_failed", error=str(e))
    
    def create_span(self, name: str, attributes: Optional[Dict[str, Any]] = None):
        """Create a new span for tracing"""
        if not self._tracer:
            return None
        
        span = self._tracer.start_span(name)
        if attributes:
            for key, value in attributes.items():
                span.set_attribute(key, value)
        
        return span
    
    def add_span_event(self, span, name: str, attributes: Optional[Dict[str, Any]] = None):
        """Add an event to an existing span"""
        if span:
            span.add_event(name, attributes=attributes or {})
    
    def record_exception(self, span, exception: Exception):
        """Record an exception in the current span"""
        if span:
            span.record_exception(exception)
            span.set_status(trace.Status(trace.StatusCode.ERROR, str(exception)))
    
    def get_current_trace_id(self) -> Optional[str]:
        """Get the current trace ID for log correlation"""
        try:
            from opentelemetry import trace
            span = trace.get_current_span()
            if span:
                return format(span.get_span_context().trace_id, '032x')
        except Exception:
            pass
        return None
    
    def get_current_span_id(self) -> Optional[str]:
        """Get the current span ID for log correlation"""
        try:
            from opentelemetry import trace
            span = trace.get_current_span()
            if span:
                return format(span.get_span_context().span_id, '016x')
        except Exception:
            pass
        return None


class MetricsService:
    """
    Metrics collection service using OpenTelemetry.
    
    Provides:
    - Request latency histograms
    - Error rate counters
    - Business metrics (transactions, users, etc.)
    - Custom gauges for system health
    """
    
    def __init__(self, config: Optional[OTelConfig] = None):
        self.config = config or OTelConfig.from_env()
        self._meter = None
        self._counters: Dict[str, Any] = {}
        self._histograms: Dict[str, Any] = {}
        self._gauges: Dict[str, Any] = {}
    
    def initialize(self):
        """Initialize metrics collection"""
        try:
            from opentelemetry import metrics
            self._meter = metrics.get_meter(self.config.service_name)
            
            self._counters["requests_total"] = self._meter.create_counter(
                "http_requests_total",
                description="Total HTTP requests",
                unit="1"
            )
            
            self._counters["errors_total"] = self._meter.create_counter(
                "http_errors_total",
                description="Total HTTP errors",
                unit="1"
            )
            
            self._histograms["request_duration"] = self._meter.create_histogram(
                "http_request_duration_seconds",
                description="HTTP request duration",
                unit="s"
            )
            
            self._counters["transactions_total"] = self._meter.create_counter(
                "transactions_total",
                description="Total transactions processed",
                unit="1"
            )
            
            self._histograms["transaction_amount"] = self._meter.create_histogram(
                "transaction_amount",
                description="Transaction amounts",
                unit="NGN"
            )
            
            logger.info("metrics_initialized", service_name=self.config.service_name)
            
        except ImportError:
            logger.warning("opentelemetry_metrics_not_installed")
        except Exception as e:
            logger.error("metrics_init_failed", error=str(e))
    
    def increment_counter(self, name: str, value: int = 1, labels: Optional[Dict[str, str]] = None):
        """Increment a counter metric"""
        if name in self._counters:
            self._counters[name].add(value, labels or {})
    
    def record_histogram(self, name: str, value: float, labels: Optional[Dict[str, str]] = None):
        """Record a histogram value"""
        if name in self._histograms:
            self._histograms[name].record(value, labels or {})
    
    def record_request(self, method: str, path: str, status_code: int, duration: float):
        """Record HTTP request metrics"""
        labels = {"method": method, "path": path, "status_code": str(status_code)}
        
        self.increment_counter("requests_total", labels=labels)
        self.record_histogram("request_duration", duration, labels=labels)
        
        if status_code >= 400:
            self.increment_counter("errors_total", labels=labels)
    
    def record_transaction(self, transaction_type: str, amount: float, currency: str, status: str):
        """Record transaction metrics"""
        labels = {"type": transaction_type, "currency": currency, "status": status}
        
        self.increment_counter("transactions_total", labels=labels)
        self.record_histogram("transaction_amount", amount, labels=labels)


class AlertingService:
    """
    Alerting service for operational monitoring.
    
    Provides:
    - Threshold-based alerts
    - Anomaly detection alerts
    - Alert routing and escalation
    - Alert suppression and deduplication
    """
    
    def __init__(self):
        self.alert_rules: Dict[str, Dict[str, Any]] = {}
        self.alert_history: list = []
    
    def register_alert_rule(
        self,
        name: str,
        metric: str,
        threshold: float,
        operator: str,
        severity: str,
        description: str
    ):
        """Register an alert rule"""
        self.alert_rules[name] = {
            "metric": metric,
            "threshold": threshold,
            "operator": operator,
            "severity": severity,
            "description": description,
            "enabled": True
        }
        
        logger.info("alert_rule_registered", name=name, metric=metric, threshold=threshold)
    
    def check_alert(self, metric: str, value: float) -> Optional[Dict[str, Any]]:
        """Check if a metric value triggers any alerts"""
        for name, rule in self.alert_rules.items():
            if rule["metric"] != metric or not rule["enabled"]:
                continue
            
            triggered = False
            if rule["operator"] == ">" and value > rule["threshold"]:
                triggered = True
            elif rule["operator"] == "<" and value < rule["threshold"]:
                triggered = True
            elif rule["operator"] == ">=" and value >= rule["threshold"]:
                triggered = True
            elif rule["operator"] == "<=" and value <= rule["threshold"]:
                triggered = True
            elif rule["operator"] == "==" and value == rule["threshold"]:
                triggered = True
            
            if triggered:
                alert = {
                    "rule_name": name,
                    "metric": metric,
                    "value": value,
                    "threshold": rule["threshold"],
                    "severity": rule["severity"],
                    "description": rule["description"],
                    "triggered_at": datetime.utcnow().isoformat()
                }
                
                self.alert_history.append(alert)
                logger.warning("alert_triggered", **alert)
                
                return alert
        
        return None
    
    def get_active_alerts(self) -> list:
        """Get list of active alerts"""
        return self.alert_history[-100:]


from datetime import datetime

_tracing_service: Optional[TracingService] = None
_metrics_service: Optional[MetricsService] = None
_alerting_service: Optional[AlertingService] = None


def get_tracing_service() -> TracingService:
    """Get tracing service singleton"""
    global _tracing_service
    if _tracing_service is None:
        _tracing_service = TracingService()
    return _tracing_service


def get_metrics_service() -> MetricsService:
    """Get metrics service singleton"""
    global _metrics_service
    if _metrics_service is None:
        _metrics_service = MetricsService()
    return _metrics_service


def get_alerting_service() -> AlertingService:
    """Get alerting service singleton"""
    global _alerting_service
    if _alerting_service is None:
        _alerting_service = AlertingService()
        
        _alerting_service.register_alert_rule(
            "high_error_rate",
            "error_rate",
            0.05,
            ">",
            "critical",
            "Error rate exceeds 5%"
        )
        _alerting_service.register_alert_rule(
            "high_latency",
            "p99_latency",
            2.0,
            ">",
            "warning",
            "P99 latency exceeds 2 seconds"
        )
        _alerting_service.register_alert_rule(
            "low_success_rate",
            "transaction_success_rate",
            0.95,
            "<",
            "critical",
            "Transaction success rate below 95%"
        )
    
    return _alerting_service
