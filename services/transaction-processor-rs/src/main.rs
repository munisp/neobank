use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use prometheus::{Encoder, TextEncoder};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tokio::signal;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;
use uuid::Uuid;

mod config;
mod error;
mod kafka;
mod ledger;
mod metrics;
mod models;
mod processor;
mod validation;

use config::AppConfig;
use error::TransactionError;
use metrics::Metrics;
use models::{Transaction, TransactionRequest, TransactionResponse, TransactionStatus};
use processor::TransactionProcessor;

#[derive(Clone)]
struct AppState {
    processor: Arc<TransactionProcessor>,
    metrics: Arc<Metrics>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
    kafka_connected: bool,
    redis_connected: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();

    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .json()
        .init();

    let config = AppConfig::from_env()?;
    info!("Starting NeoBank Transaction Processor");

    let processor = TransactionProcessor::new(&config).await?;
    let metrics = Metrics::new();

    let state = AppState {
        processor: Arc::new(processor),
        metrics: Arc::new(metrics),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/metrics", get(metrics_handler))
        .route("/api/v1/transactions", post(create_transaction))
        .route("/api/v1/transactions/:id", get(get_transaction))
        .route("/api/v1/transactions/:id/status", get(get_transaction_status))
        .route("/api/v1/accounts/:account_id/balance", get(get_balance))
        .route("/api/v1/accounts/:account_id/transactions", get(list_account_transactions))
        .route("/api/v1/batch", post(process_batch))
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
    let (kafka_connected, redis_connected) = state.processor.check_connections().await;

    Json(HealthResponse {
        status: if kafka_connected && redis_connected {
            "healthy".to_string()
        } else {
            "degraded".to_string()
        },
        version: env!("CARGO_PKG_VERSION").to_string(),
        kafka_connected,
        redis_connected,
    })
}

async fn metrics_handler(State(state): State<AppState>) -> Result<String, StatusCode> {
    let encoder = TextEncoder::new();
    let metric_families = state.metrics.registry.gather();
    let mut buffer = Vec::new();
    encoder
        .encode(&metric_families, &mut buffer)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    String::from_utf8(buffer).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn create_transaction(
    State(state): State<AppState>,
    Json(req): Json<TransactionRequest>,
) -> Result<Json<TransactionResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .metrics
        .requests_total
        .with_label_values(&["create_transaction"])
        .inc();
    let _timer = state
        .metrics
        .request_duration
        .with_label_values(&["create_transaction"])
        .start_timer();

    match state.processor.process_transaction(req).await {
        Ok(response) => {
            state
                .metrics
                .transactions_processed
                .with_label_values(&["success"])
                .inc();
            Ok(Json(response))
        }
        Err(e) => {
            state
                .metrics
                .transactions_processed
                .with_label_values(&["failed"])
                .inc();
            tracing::error!("Transaction failed: {}", e);
            Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: e.error_code(),
                }),
            ))
        }
    }
}

async fn get_transaction(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Transaction>, (StatusCode, Json<ErrorResponse>)> {
    state
        .metrics
        .requests_total
        .with_label_values(&["get_transaction"])
        .inc();

    match state.processor.get_transaction(id).await {
        Ok(Some(tx)) => Ok(Json(tx)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Transaction not found".to_string(),
                code: "TRANSACTION_NOT_FOUND".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "INTERNAL_ERROR".to_string(),
            }),
        )),
    }
}

async fn get_transaction_status(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<TransactionStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.processor.get_transaction_status(id).await {
        Ok(Some(status)) => Ok(Json(TransactionStatusResponse {
            transaction_id: id,
            status,
        })),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Transaction not found".to_string(),
                code: "TRANSACTION_NOT_FOUND".to_string(),
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "INTERNAL_ERROR".to_string(),
            }),
        )),
    }
}

async fn get_balance(
    State(state): State<AppState>,
    Path(account_id): Path<Uuid>,
) -> Result<Json<BalanceResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .metrics
        .requests_total
        .with_label_values(&["get_balance"])
        .inc();

    match state.processor.get_balance(account_id).await {
        Ok(balance) => Ok(Json(BalanceResponse {
            account_id,
            available_balance: balance.available,
            pending_balance: balance.pending,
            currency: balance.currency,
            last_updated: balance.last_updated,
        })),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "INTERNAL_ERROR".to_string(),
            }),
        )),
    }
}

async fn list_account_transactions(
    State(state): State<AppState>,
    Path(account_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<ListTransactionsParams>,
) -> Result<Json<ListTransactionsResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .metrics
        .requests_total
        .with_label_values(&["list_transactions"])
        .inc();

    match state
        .processor
        .list_account_transactions(account_id, params.limit.unwrap_or(50), params.offset.unwrap_or(0))
        .await
    {
        Ok(transactions) => Ok(Json(ListTransactionsResponse {
            account_id,
            transactions,
            total: transactions.len() as i64,
        })),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "INTERNAL_ERROR".to_string(),
            }),
        )),
    }
}

async fn process_batch(
    State(state): State<AppState>,
    Json(req): Json<BatchRequest>,
) -> Result<Json<BatchResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .metrics
        .requests_total
        .with_label_values(&["process_batch"])
        .inc();
    let _timer = state
        .metrics
        .request_duration
        .with_label_values(&["process_batch"])
        .start_timer();

    match state.processor.process_batch(req.transactions).await {
        Ok(results) => {
            let successful = results.iter().filter(|r| r.success).count();
            let failed = results.len() - successful;
            state
                .metrics
                .batch_transactions
                .with_label_values(&["success"])
                .inc_by(successful as f64);
            state
                .metrics
                .batch_transactions
                .with_label_values(&["failed"])
                .inc_by(failed as f64);

            Ok(Json(BatchResponse {
                total: results.len(),
                successful,
                failed,
                results,
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "BATCH_PROCESSING_ERROR".to_string(),
            }),
        )),
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    code: String,
}

#[derive(Serialize)]
struct TransactionStatusResponse {
    transaction_id: Uuid,
    status: TransactionStatus,
}

#[derive(Serialize)]
struct BalanceResponse {
    account_id: Uuid,
    available_balance: Decimal,
    pending_balance: Decimal,
    currency: String,
    last_updated: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
struct ListTransactionsParams {
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Serialize)]
struct ListTransactionsResponse {
    account_id: Uuid,
    transactions: Vec<Transaction>,
    total: i64,
}

#[derive(Deserialize)]
struct BatchRequest {
    transactions: Vec<TransactionRequest>,
}

#[derive(Serialize)]
struct BatchResponse {
    total: usize,
    successful: usize,
    failed: usize,
    results: Vec<BatchResult>,
}

#[derive(Serialize)]
struct BatchResult {
    index: usize,
    success: bool,
    transaction_id: Option<Uuid>,
    error: Option<String>,
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
