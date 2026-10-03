"""
Monitoring Service for NeoBank Platform
Integrates Prometheus for metrics, Grafana for dashboards, and Jaeger for tracing
"""

import logging
from typing import Dict, Any
from prometheus_client import Counter, Gauge, Histogram, Summary, start_http_server
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from config.settings import settings

logger = logging.getLogger(__name__)

class MonitoringService:
    """Service for comprehensive monitoring and observability"""

    def __init__(self):
        self.metrics = {}
        self.tracer = None

    def initialize(self, app):
        """Initialize the monitoring service"""
        try:
            # Initialize Prometheus metrics
            self._initialize_prometheus()

            # Initialize Jaeger tracing
            self._initialize_jaeger()

            # Instrument FastAPI app
            FastAPIInstrumentor.instrument_app(app)

            logger.info("Monitoring Service initialized")

        except Exception as e:
            logger.error(f"Failed to initialize Monitoring Service: {e}")

    def _initialize_prometheus(self):
        """Initialize Prometheus metrics"""
        # Start Prometheus metrics server
        start_http_server(settings.PROMETHEUS_PORT or 8001)

        # Define standard metrics
        self.metrics['requests_total'] = Counter(
            'neobank_requests_total',
            'Total number of requests by endpoint and method',
            ['endpoint', 'method']
        )
        self.metrics['requests_latency'] = Histogram(
            'neobank_requests_latency_seconds',
            'Request latency in seconds',
            ['endpoint']
        )
        self.metrics['active_users'] = Gauge(
            'neobank_active_users',
            'Number of active users'
        )
        self.metrics['transactions_total'] = Counter(
            'neobank_transactions_total',
            'Total number of transactions by status',
            ['status']
        )
        self.metrics['transaction_amount'] = Summary(
            'neobank_transaction_amount_naira',
            'Transaction amount in Naira'
        )

    def _initialize_jaeger(self):
        """Initialize Jaeger tracing"""
        trace.set_tracer_provider(TracerProvider())
        self.tracer = trace.get_tracer(__name__)

        # Jaeger >= 1.35 ingests OTLP natively on :4317
        otlp_endpoint = getattr(settings, "OTEL_EXPORTER_OTLP_ENDPOINT", None) or "http://localhost:4317"
        otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)

        trace.get_tracer_provider().add_span_processor(
            BatchSpanProcessor(otlp_exporter)
        )

    def get_tracer(self):
        """Get the Jaeger tracer"""
        return self.tracer

    def get_metric(self, name: str):
        """Get a Prometheus metric by name"""
        return self.metrics.get(name)

# Global instance
monitoring_service = MonitoringService()

def initialize_monitoring(app):
    """Initialize the monitoring service"""
    monitoring_service.initialize(app)

