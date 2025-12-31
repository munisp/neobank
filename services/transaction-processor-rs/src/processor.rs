use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use rust_decimal::Decimal;
use tokio::sync::RwLock;
use tracing::{debug, error, info, instrument};
use uuid::Uuid;

use crate::config::AppConfig;
use crate::error::{Result, TransactionError};
use crate::models::{
    AccountBalance, Transaction, TransactionRequest, TransactionResponse, TransactionStatus,
    TransactionType,
};

pub struct TransactionProcessor {
    config: AppConfig,
    transactions: Arc<RwLock<HashMap<Uuid, Transaction>>>,
    balances: Arc<RwLock<HashMap<Uuid, AccountBalance>>>,
    idempotency_cache: Arc<RwLock<HashMap<String, Uuid>>>,
}

pub struct BatchResult {
    pub index: usize,
    pub success: bool,
    pub transaction_id: Option<Uuid>,
    pub error: Option<String>,
}

impl TransactionProcessor {
    pub async fn new(config: &AppConfig) -> Result<Self> {
        info!("Initializing Transaction Processor");

        Ok(Self {
            config: config.clone(),
            transactions: Arc::new(RwLock::new(HashMap::new())),
            balances: Arc::new(RwLock::new(HashMap::new())),
            idempotency_cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    pub async fn check_connections(&self) -> (bool, bool) {
        (true, true)
    }

    #[instrument(skip(self, req))]
    pub async fn process_transaction(&self, req: TransactionRequest) -> Result<TransactionResponse> {
        debug!("Processing transaction: {:?}", req.idempotency_key);

        {
            let cache = self.idempotency_cache.read().await;
            if let Some(existing_id) = cache.get(&req.idempotency_key) {
                let transactions = self.transactions.read().await;
                if let Some(tx) = transactions.get(existing_id) {
                    info!("Returning cached transaction for idempotency key: {}", req.idempotency_key);
                    return Ok(TransactionResponse {
                        transaction_id: tx.id,
                        status: tx.status.clone(),
                        created_at: tx.created_at,
                        reference: tx.reference.clone(),
                    });
                }
            }
        }

        self.validate_request(&req)?;

        if req.amount <= Decimal::ZERO {
            return Err(TransactionError::InvalidAmount("Amount must be positive".to_string()));
        }

        let mut transaction = Transaction::new(&req);

        match req.transaction_type {
            TransactionType::Transfer => {
                let source_id = req.source_account_id
                    .ok_or_else(|| TransactionError::ValidationError("Source account required for transfer".to_string()))?;
                let dest_id = req.destination_account_id
                    .ok_or_else(|| TransactionError::ValidationError("Destination account required for transfer".to_string()))?;

                self.execute_transfer(source_id, dest_id, req.amount, &req.currency).await?;
            }
            TransactionType::Deposit => {
                let dest_id = req.destination_account_id
                    .ok_or_else(|| TransactionError::ValidationError("Destination account required for deposit".to_string()))?;

                self.execute_deposit(dest_id, req.amount, &req.currency).await?;
            }
            TransactionType::Withdrawal => {
                let source_id = req.source_account_id
                    .ok_or_else(|| TransactionError::ValidationError("Source account required for withdrawal".to_string()))?;

                self.execute_withdrawal(source_id, req.amount, &req.currency).await?;
            }
            TransactionType::Payment => {
                let source_id = req.source_account_id
                    .ok_or_else(|| TransactionError::ValidationError("Source account required for payment".to_string()))?;

                self.execute_withdrawal(source_id, req.amount, &req.currency).await?;
            }
            _ => {
                debug!("Processing {} transaction", format!("{:?}", req.transaction_type));
            }
        }

        transaction.status = TransactionStatus::Completed;
        transaction.completed_at = Some(Utc::now());
        transaction.updated_at = Utc::now();

        let response = TransactionResponse {
            transaction_id: transaction.id,
            status: transaction.status.clone(),
            created_at: transaction.created_at,
            reference: transaction.reference.clone(),
        };

        {
            let mut transactions = self.transactions.write().await;
            transactions.insert(transaction.id, transaction.clone());
        }

        {
            let mut cache = self.idempotency_cache.write().await;
            cache.insert(req.idempotency_key.clone(), transaction.id);
        }

        info!("Transaction completed: {}", transaction.id);
        Ok(response)
    }

    async fn execute_transfer(
        &self,
        source_id: Uuid,
        dest_id: Uuid,
        amount: Decimal,
        currency: &str,
    ) -> Result<()> {
        let mut balances = self.balances.write().await;

        let source_balance = balances.entry(source_id).or_insert_with(|| AccountBalance {
            account_id: source_id,
            available: Decimal::new(100000, 2),
            pending: Decimal::ZERO,
            currency: currency.to_string(),
            last_updated: Utc::now(),
        });

        if source_balance.available < amount {
            return Err(TransactionError::InsufficientFunds {
                available: source_balance.available,
                required: amount,
            });
        }

        source_balance.available -= amount;
        source_balance.last_updated = Utc::now();

        let dest_balance = balances.entry(dest_id).or_insert_with(|| AccountBalance {
            account_id: dest_id,
            available: Decimal::ZERO,
            pending: Decimal::ZERO,
            currency: currency.to_string(),
            last_updated: Utc::now(),
        });

        dest_balance.available += amount;
        dest_balance.last_updated = Utc::now();

        Ok(())
    }

    async fn execute_deposit(&self, account_id: Uuid, amount: Decimal, currency: &str) -> Result<()> {
        let mut balances = self.balances.write().await;

        let balance = balances.entry(account_id).or_insert_with(|| AccountBalance {
            account_id,
            available: Decimal::ZERO,
            pending: Decimal::ZERO,
            currency: currency.to_string(),
            last_updated: Utc::now(),
        });

        balance.available += amount;
        balance.last_updated = Utc::now();

        Ok(())
    }

    async fn execute_withdrawal(&self, account_id: Uuid, amount: Decimal, currency: &str) -> Result<()> {
        let mut balances = self.balances.write().await;

        let balance = balances.entry(account_id).or_insert_with(|| AccountBalance {
            account_id,
            available: Decimal::new(100000, 2),
            pending: Decimal::ZERO,
            currency: currency.to_string(),
            last_updated: Utc::now(),
        });

        if balance.available < amount {
            return Err(TransactionError::InsufficientFunds {
                available: balance.available,
                required: amount,
            });
        }

        balance.available -= amount;
        balance.last_updated = Utc::now();

        Ok(())
    }

    fn validate_request(&self, req: &TransactionRequest) -> Result<()> {
        if req.idempotency_key.is_empty() {
            return Err(TransactionError::ValidationError("Idempotency key is required".to_string()));
        }

        if req.currency.len() != 3 {
            return Err(TransactionError::InvalidCurrency(req.currency.clone()));
        }

        let valid_currencies = ["NGN", "USD", "EUR", "GBP", "KES", "ZAR", "GHS", "UGX", "TZS"];
        if !valid_currencies.contains(&req.currency.as_str()) {
            return Err(TransactionError::InvalidCurrency(req.currency.clone()));
        }

        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn get_transaction(&self, id: Uuid) -> Result<Option<Transaction>> {
        let transactions = self.transactions.read().await;
        Ok(transactions.get(&id).cloned())
    }

    #[instrument(skip(self))]
    pub async fn get_transaction_status(&self, id: Uuid) -> Result<Option<TransactionStatus>> {
        let transactions = self.transactions.read().await;
        Ok(transactions.get(&id).map(|tx| tx.status.clone()))
    }

    #[instrument(skip(self))]
    pub async fn get_balance(&self, account_id: Uuid) -> Result<AccountBalance> {
        let balances = self.balances.read().await;
        Ok(balances.get(&account_id).cloned().unwrap_or_else(|| AccountBalance {
            account_id,
            available: Decimal::new(100000, 2),
            pending: Decimal::ZERO,
            currency: "NGN".to_string(),
            last_updated: Utc::now(),
        }))
    }

    #[instrument(skip(self))]
    pub async fn list_account_transactions(
        &self,
        account_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Transaction>> {
        let transactions = self.transactions.read().await;
        let mut account_txs: Vec<_> = transactions
            .values()
            .filter(|tx| {
                tx.source_account_id == Some(account_id) || tx.destination_account_id == Some(account_id)
            })
            .cloned()
            .collect();

        account_txs.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(account_txs
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect())
    }

    #[instrument(skip(self, requests))]
    pub async fn process_batch(&self, requests: Vec<TransactionRequest>) -> Result<Vec<BatchResult>> {
        info!("Processing batch of {} transactions", requests.len());

        if requests.len() > self.config.max_batch_size {
            return Err(TransactionError::ValidationError(format!(
                "Batch size {} exceeds maximum {}",
                requests.len(),
                self.config.max_batch_size
            )));
        }

        let mut results = Vec::with_capacity(requests.len());

        for (index, req) in requests.into_iter().enumerate() {
            match self.process_transaction(req).await {
                Ok(response) => {
                    results.push(BatchResult {
                        index,
                        success: true,
                        transaction_id: Some(response.transaction_id),
                        error: None,
                    });
                }
                Err(e) => {
                    results.push(BatchResult {
                        index,
                        success: false,
                        transaction_id: None,
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_processor_creation() {
        let config = AppConfig::from_env().unwrap();
        let processor = TransactionProcessor::new(&config).await;
        assert!(processor.is_ok());
    }

    #[tokio::test]
    async fn test_deposit_transaction() {
        let config = AppConfig::from_env().unwrap();
        let processor = TransactionProcessor::new(&config).await.unwrap();

        let req = TransactionRequest {
            idempotency_key: "test-deposit-1".to_string(),
            transaction_type: TransactionType::Deposit,
            source_account_id: None,
            destination_account_id: Some(Uuid::new_v4()),
            amount: Decimal::new(10000, 2),
            currency: "NGN".to_string(),
            description: Some("Test deposit".to_string()),
            metadata: None,
            reference: None,
        };

        let result = processor.process_transaction(req).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().status, TransactionStatus::Completed);
    }

    #[tokio::test]
    async fn test_idempotency() {
        let config = AppConfig::from_env().unwrap();
        let processor = TransactionProcessor::new(&config).await.unwrap();

        let req = TransactionRequest {
            idempotency_key: "test-idempotent-1".to_string(),
            transaction_type: TransactionType::Deposit,
            source_account_id: None,
            destination_account_id: Some(Uuid::new_v4()),
            amount: Decimal::new(10000, 2),
            currency: "NGN".to_string(),
            description: None,
            metadata: None,
            reference: None,
        };

        let result1 = processor.process_transaction(req.clone()).await.unwrap();
        let result2 = processor.process_transaction(req).await.unwrap();

        assert_eq!(result1.transaction_id, result2.transaction_id);
    }
}
