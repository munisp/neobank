use std::env;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Missing environment variable: {0}")]
    MissingEnvVar(String),
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub kafka_brokers: String,
    pub kafka_topic_transactions: String,
    pub kafka_topic_events: String,
    pub kafka_consumer_group: String,
    pub tigerbeetle_addresses: String,
    pub log_level: String,
    pub enable_metrics: bool,
    pub max_batch_size: usize,
    pub transaction_timeout_secs: u64,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        Ok(Self {
            port: env::var("PORT")
                .unwrap_or_else(|_| "8091".to_string())
                .parse()
                .map_err(|_| ConfigError::InvalidConfig("Invalid PORT".to_string()))?,
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://neobank:neobank@localhost:5432/neobank".to_string()),
            redis_url: env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".to_string()),
            kafka_brokers: env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "localhost:9092".to_string()),
            kafka_topic_transactions: env::var("KAFKA_TOPIC_TRANSACTIONS")
                .unwrap_or_else(|_| "neobank.transactions".to_string()),
            kafka_topic_events: env::var("KAFKA_TOPIC_EVENTS")
                .unwrap_or_else(|_| "neobank.events".to_string()),
            kafka_consumer_group: env::var("KAFKA_CONSUMER_GROUP")
                .unwrap_or_else(|_| "transaction-processor".to_string()),
            tigerbeetle_addresses: env::var("TIGERBEETLE_ADDRESSES")
                .unwrap_or_else(|_| "127.0.0.1:3000".to_string()),
            log_level: env::var("LOG_LEVEL")
                .unwrap_or_else(|_| "info".to_string()),
            enable_metrics: env::var("ENABLE_METRICS")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            max_batch_size: env::var("MAX_BATCH_SIZE")
                .unwrap_or_else(|_| "1000".to_string())
                .parse()
                .unwrap_or(1000),
            transaction_timeout_secs: env::var("TRANSACTION_TIMEOUT_SECS")
                .unwrap_or_else(|_| "30".to_string())
                .parse()
                .unwrap_or(30),
        })
    }
}
