use thiserror::Error;

#[derive(Debug, Error)]
pub enum TransactionError {
    #[error("Insufficient funds: available {available}, required {required}")]
    InsufficientFunds {
        available: rust_decimal::Decimal,
        required: rust_decimal::Decimal,
    },

    #[error("Account not found: {0}")]
    AccountNotFound(uuid::Uuid),

    #[error("Transaction not found: {0}")]
    TransactionNotFound(uuid::Uuid),

    #[error("Invalid amount: {0}")]
    InvalidAmount(String),

    #[error("Invalid currency: {0}")]
    InvalidCurrency(String),

    #[error("Account frozen: {0}")]
    AccountFrozen(uuid::Uuid),

    #[error("Daily limit exceeded: limit {limit}, attempted {attempted}")]
    DailyLimitExceeded {
        limit: rust_decimal::Decimal,
        attempted: rust_decimal::Decimal,
    },

    #[error("Duplicate transaction: {0}")]
    DuplicateTransaction(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Redis error: {0}")]
    RedisError(String),

    #[error("Kafka error: {0}")]
    KafkaError(String),

    #[error("Ledger error: {0}")]
    LedgerError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Timeout error: {0}")]
    TimeoutError(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

impl TransactionError {
    pub fn error_code(&self) -> String {
        match self {
            TransactionError::InsufficientFunds { .. } => "INSUFFICIENT_FUNDS".to_string(),
            TransactionError::AccountNotFound(_) => "ACCOUNT_NOT_FOUND".to_string(),
            TransactionError::TransactionNotFound(_) => "TRANSACTION_NOT_FOUND".to_string(),
            TransactionError::InvalidAmount(_) => "INVALID_AMOUNT".to_string(),
            TransactionError::InvalidCurrency(_) => "INVALID_CURRENCY".to_string(),
            TransactionError::AccountFrozen(_) => "ACCOUNT_FROZEN".to_string(),
            TransactionError::DailyLimitExceeded { .. } => "DAILY_LIMIT_EXCEEDED".to_string(),
            TransactionError::DuplicateTransaction(_) => "DUPLICATE_TRANSACTION".to_string(),
            TransactionError::DatabaseError(_) => "DATABASE_ERROR".to_string(),
            TransactionError::RedisError(_) => "REDIS_ERROR".to_string(),
            TransactionError::KafkaError(_) => "KAFKA_ERROR".to_string(),
            TransactionError::LedgerError(_) => "LEDGER_ERROR".to_string(),
            TransactionError::ValidationError(_) => "VALIDATION_ERROR".to_string(),
            TransactionError::TimeoutError(_) => "TIMEOUT_ERROR".to_string(),
            TransactionError::InternalError(_) => "INTERNAL_ERROR".to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, TransactionError>;
