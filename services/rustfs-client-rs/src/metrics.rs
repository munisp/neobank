use prometheus::{
    Counter, CounterVec, Histogram, HistogramOpts, HistogramVec, Opts, Registry,
};

pub struct Metrics {
    pub registry: Registry,
    pub requests_total: CounterVec,
    pub request_duration: HistogramVec,
    pub bytes_uploaded: Counter,
    pub bytes_downloaded: Counter,
    pub errors_total: CounterVec,
    pub active_connections: prometheus::Gauge,
    pub multipart_uploads_active: prometheus::Gauge,
}

impl Metrics {
    pub fn new() -> Self {
        let registry = Registry::new();

        let requests_total = CounterVec::new(
            Opts::new("rustfs_requests_total", "Total number of RustFS requests"),
            &["operation"],
        )
        .unwrap();

        let request_duration = HistogramVec::new(
            HistogramOpts::new("rustfs_request_duration_seconds", "Request duration in seconds")
                .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]),
            &["operation"],
        )
        .unwrap();

        let bytes_uploaded = Counter::new("rustfs_bytes_uploaded_total", "Total bytes uploaded").unwrap();
        let bytes_downloaded = Counter::new("rustfs_bytes_downloaded_total", "Total bytes downloaded").unwrap();

        let errors_total = CounterVec::new(
            Opts::new("rustfs_errors_total", "Total number of errors"),
            &["operation", "error_type"],
        )
        .unwrap();

        let active_connections = prometheus::Gauge::new(
            "rustfs_active_connections",
            "Number of active connections",
        )
        .unwrap();

        let multipart_uploads_active = prometheus::Gauge::new(
            "rustfs_multipart_uploads_active",
            "Number of active multipart uploads",
        )
        .unwrap();

        registry.register(Box::new(requests_total.clone())).unwrap();
        registry.register(Box::new(request_duration.clone())).unwrap();
        registry.register(Box::new(bytes_uploaded.clone())).unwrap();
        registry.register(Box::new(bytes_downloaded.clone())).unwrap();
        registry.register(Box::new(errors_total.clone())).unwrap();
        registry.register(Box::new(active_connections.clone())).unwrap();
        registry.register(Box::new(multipart_uploads_active.clone())).unwrap();

        Self {
            registry,
            requests_total,
            request_duration,
            bytes_uploaded,
            bytes_downloaded,
            errors_total,
            active_connections,
            multipart_uploads_active,
        }
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}
