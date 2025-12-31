use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransactionType {
    Transfer,
    Deposit,
    Withdrawal,
    Payment,
    Refund,
    Fee,
    Interest,
    Adjustment,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransactionStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Reversed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct TransactionRequest {
    #[validate(length(min = 1))]
    pub idempotency_key: String,

    pub transaction_type: TransactionType,

    pub source_account_id: Option<Uuid>,

    pub destination_account_id: Option<Uuid>,

    #[validate(range(min = 0.01))]
    pub amount: Decimal,

    #[validate(length(min = 3, max = 3))]
    pub currency: String,

    pub description: Option<String>,

    pub metadata: Option<serde_json::Value>,

    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionResponse {
    pub transaction_id: Uuid,
    pub status: TransactionStatus,
    pub created_at: DateTime<Utc>,
    pub reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: Uuid,
    pub idempotency_key: String,
    pub transaction_type: TransactionType,
    pub source_account_id: Option<Uuid>,
    pub destination_account_id: Option<Uuid>,
    pub amount: Decimal,
    pub currency: String,
    pub status: TransactionStatus,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub reference: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountBalance {
    pub account_id: Uuid,
    pub available: Decimal,
    pub pending: Decimal,
    pub currency: String,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub id: Uuid,
    pub transaction_id: Uuid,
    pub account_id: Uuid,
    pub entry_type: LedgerEntryType,
    pub amount: Decimal,
    pub currency: String,
    pub balance_after: Decimal,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LedgerEntryType {
    Debit,
    Credit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionEvent {
    pub event_id: Uuid,
    pub event_type: String,
    pub transaction_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub data: serde_json::Value,
}

impl Transaction {
    pub fn new(req: &TransactionRequest) -> Self {
        let now = Utc::now();
        let id = Uuid::now_v7();
        let reference = format!("TXN-{}", id.to_string().split('-').next().unwrap().to_uppercase());

        Self {
            id,
            idempotency_key: req.idempotency_key.clone(),
            transaction_type: req.transaction_type.clone(),
            source_account_id: req.source_account_id,
            destination_account_id: req.destination_account_id,
            amount: req.amount,
            currency: req.currency.clone(),
            status: TransactionStatus::Pending,
            description: req.description.clone(),
            metadata: req.metadata.clone(),
            reference,
            created_at: now,
            updated_at: now,
            completed_at: None,
            error_message: None,
        }
    }
}
