use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use prometheus::{Encoder, TextEncoder};
use serde::{Deserialize, Serialize};
use tokio::signal;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod client;
mod config;
mod error;
mod metrics;

use client::RustFSClient;
use config::AppConfig;
use metrics::Metrics;

#[derive(Clone)]
struct AppState {
    client: Arc<RustFSClient>,
    metrics: Arc<Metrics>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
    rustfs_connected: bool,
}

#[derive(Serialize)]
struct BucketInfo {
    name: String,
    creation_date: Option<String>,
}

#[derive(Deserialize)]
struct CreateBucketRequest {
    bucket_name: String,
}

#[derive(Deserialize)]
struct UploadRequest {
    bucket: String,
    key: String,
    content_type: Option<String>,
}

#[derive(Serialize)]
struct UploadResponse {
    bucket: String,
    key: String,
    etag: Option<String>,
    version_id: Option<String>,
}

#[derive(Deserialize)]
struct ListObjectsRequest {
    bucket: String,
    prefix: Option<String>,
    max_keys: Option<i32>,
}

#[derive(Serialize)]
struct ObjectInfo {
    key: String,
    size: i64,
    last_modified: Option<String>,
    etag: Option<String>,
}

#[derive(Serialize)]
struct ListObjectsResponse {
    bucket: String,
    prefix: Option<String>,
    objects: Vec<ObjectInfo>,
    is_truncated: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();

    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .json()
        .init();

    let config = AppConfig::from_env()?;
    info!("Starting NeoBank RustFS Client Service");
    info!("RustFS Endpoint: {}", config.rustfs_endpoint);

    let client = RustFSClient::new(&config).await?;
    let metrics = Metrics::new();

    let state = AppState {
        client: Arc::new(client),
        metrics: Arc::new(metrics),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/metrics", get(metrics_handler))
        .route("/api/v1/buckets", get(list_buckets))
        .route("/api/v1/buckets", post(create_bucket))
        .route("/api/v1/objects", get(list_objects))
        .route("/api/v1/objects/presigned-url", post(generate_presigned_url))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    let rustfs_connected = state.client.check_health().await.unwrap_or(false);

    Json(HealthResponse {
        status: if rustfs_connected { "healthy".to_string() } else { "degraded".to_string() },
        version: env!("CARGO_PKG_VERSION").to_string(),
        rustfs_connected,
    })
}

async fn metrics_handler(State(state): State<AppState>) -> Result<String, StatusCode> {
    let encoder = TextEncoder::new();
    let metric_families = state.metrics.registry.gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    String::from_utf8(buffer).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn list_buckets(State(state): State<AppState>) -> Result<Json<Vec<BucketInfo>>, StatusCode> {
    state.metrics.requests_total.with_label_values(&["list_buckets"]).inc();
    let _timer = state.metrics.request_duration.with_label_values(&["list_buckets"]).start_timer();

    let buckets = state.client.list_buckets().await.map_err(|e| {
        tracing::error!("Failed to list buckets: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(buckets.into_iter().map(|b| BucketInfo {
        name: b.name,
        creation_date: b.creation_date,
    }).collect()))
}

async fn create_bucket(
    State(state): State<AppState>,
    Json(req): Json<CreateBucketRequest>,
) -> Result<StatusCode, StatusCode> {
    state.metrics.requests_total.with_label_values(&["create_bucket"]).inc();
    let _timer = state.metrics.request_duration.with_label_values(&["create_bucket"]).start_timer();

    state.client.create_bucket(&req.bucket_name).await.map_err(|e| {
        tracing::error!("Failed to create bucket: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::CREATED)
}

async fn list_objects(
    State(state): State<AppState>,
    axum::extract::Query(req): axum::extract::Query<ListObjectsRequest>,
) -> Result<Json<ListObjectsResponse>, StatusCode> {
    state.metrics.requests_total.with_label_values(&["list_objects"]).inc();
    let _timer = state.metrics.request_duration.with_label_values(&["list_objects"]).start_timer();

    let result = state.client.list_objects(&req.bucket, req.prefix.as_deref(), req.max_keys).await.map_err(|e| {
        tracing::error!("Failed to list objects: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(ListObjectsResponse {
        bucket: req.bucket,
        prefix: req.prefix,
        objects: result.objects.into_iter().map(|o| ObjectInfo {
            key: o.key,
            size: o.size,
            last_modified: o.last_modified,
            etag: o.etag,
        }).collect(),
        is_truncated: result.is_truncated,
    }))
}

#[derive(Deserialize)]
struct PresignedUrlRequest {
    bucket: String,
    key: String,
    operation: String,
    expires_in_secs: Option<u64>,
}

#[derive(Serialize)]
struct PresignedUrlResponse {
    url: String,
    expires_in_secs: u64,
}

async fn generate_presigned_url(
    State(state): State<AppState>,
    Json(req): Json<PresignedUrlRequest>,
) -> Result<Json<PresignedUrlResponse>, StatusCode> {
    state.metrics.requests_total.with_label_values(&["presigned_url"]).inc();
    let _timer = state.metrics.request_duration.with_label_values(&["presigned_url"]).start_timer();

    let expires_in = req.expires_in_secs.unwrap_or(3600);
    let url = state.client.generate_presigned_url(&req.bucket, &req.key, &req.operation, expires_in).await.map_err(|e| {
        tracing::error!("Failed to generate presigned URL: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(PresignedUrlResponse {
        url,
        expires_in_secs: expires_in,
    }))
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("Shutdown signal received, starting graceful shutdown");
}
