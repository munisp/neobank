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
    pub rustfs_endpoint: String,
    pub rustfs_access_key: String,
    pub rustfs_secret_key: String,
    pub rustfs_region: String,
    pub rustfs_bucket: String,
    pub port: u16,
    pub log_level: String,
    pub enable_metrics: bool,
    pub connection_timeout_secs: u64,
    pub request_timeout_secs: u64,
    pub max_retries: u32,
    pub use_path_style: bool,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        Ok(Self {
            rustfs_endpoint: env::var("RUSTFS_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:9000".to_string()),
            rustfs_access_key: env::var("RUSTFS_ACCESS_KEY")
                .unwrap_or_else(|_| "rustfsadmin".to_string()),
            rustfs_secret_key: env::var("RUSTFS_SECRET_KEY")
                .unwrap_or_else(|_| "rustfsadmin".to_string()),
            rustfs_region: env::var("RUSTFS_REGION")
                .unwrap_or_else(|_| "us-east-1".to_string()),
            rustfs_bucket: env::var("RUSTFS_BUCKET")
                .unwrap_or_else(|_| "neobank-lakehouse".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8090".to_string())
                .parse()
                .map_err(|_| ConfigError::InvalidConfig("Invalid PORT".to_string()))?,
            log_level: env::var("LOG_LEVEL")
                .unwrap_or_else(|_| "info".to_string()),
            enable_metrics: env::var("ENABLE_METRICS")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            connection_timeout_secs: env::var("CONNECTION_TIMEOUT_SECS")
                .unwrap_or_else(|_| "30".to_string())
                .parse()
                .unwrap_or(30),
            request_timeout_secs: env::var("REQUEST_TIMEOUT_SECS")
                .unwrap_or_else(|_| "60".to_string())
                .parse()
                .unwrap_or(60),
            max_retries: env::var("MAX_RETRIES")
                .unwrap_or_else(|_| "3".to_string())
                .parse()
                .unwrap_or(3),
            use_path_style: env::var("USE_PATH_STYLE")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::from_env().unwrap();
        assert_eq!(config.rustfs_region, "us-east-1");
        assert_eq!(config.port, 8090);
        assert!(config.use_path_style);
    }
}
