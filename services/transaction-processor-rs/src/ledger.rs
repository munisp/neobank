use chrono::Utc;
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, instrument};
use uuid::Uuid;

use crate::config::AppConfig;
use crate::error::{Result, TransactionError};
use crate::models::{AccountBalance, LedgerEntry, LedgerEntryType};

pub struct LedgerService {
    entries: Arc<RwLock<HashMap<Uuid, LedgerEntry>>>,
    account_entries: Arc<RwLock<HashMap<Uuid, Vec<Uuid>>>>,
    balances: Arc<RwLock<HashMap<Uuid, AccountBalance>>>,
    tigerbeetle_enabled: bool,
}

impl LedgerService {
    pub fn new(config: &AppConfig) -> Result<Self> {
        info!("Initializing Ledger Service");
        info!("TigerBeetle addresses: {}", config.tigerbeetle_addresses);

        Ok(Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            account_entries: Arc::new(RwLock::new(HashMap::new())),
            balances: Arc::new(RwLock::new(HashMap::new())),
            tigerbeetle_enabled: !config.tigerbeetle_addresses.is_empty(),
        })
    }

    #[instrument(skip(self))]
    pub async fn create_transfer(
        &self,
        transaction_id: Uuid,
        source_account_id: Uuid,
        destination_account_id: Uuid,
        amount: Decimal,
        currency: &str,
    ) -> Result<(LedgerEntry, LedgerEntry)> {
        debug!(
            "Creating transfer: {} -> {}, amount: {} {}",
            source_account_id, destination_account_id, amount, currency
        );

        let source_balance = self.get_or_create_balance(source_account_id, currency).await?;
        if source_balance.available < amount {
            return Err(TransactionError::InsufficientFunds {
                available: source_balance.available,
                required: amount,
            });
        }

        let debit_entry = self
            .create_entry(
                transaction_id,
                source_account_id,
                LedgerEntryType::Debit,
                amount,
                currency,
            )
            .await?;

        let credit_entry = self
            .create_entry(
                transaction_id,
                destination_account_id,
                LedgerEntryType::Credit,
                amount,
                currency,
            )
            .await?;

        info!(
            "Transfer created: debit {} credit {}",
            debit_entry.id, credit_entry.id
        );

        Ok((debit_entry, credit_entry))
    }

    #[instrument(skip(self))]
    pub async fn create_entry(
        &self,
        transaction_id: Uuid,
        account_id: Uuid,
        entry_type: LedgerEntryType,
        amount: Decimal,
        currency: &str,
    ) -> Result<LedgerEntry> {
        let mut balances = self.balances.write().await;
        let balance = balances.entry(account_id).or_insert_with(|| AccountBalance {
            account_id,
            available: Decimal::new(100000, 2),
            pending: Decimal::ZERO,
            currency: currency.to_string(),
            last_updated: Utc::now(),
        });

        let balance_after = match entry_type {
            LedgerEntryType::Debit => {
                balance.available -= amount;
                balance.available
            }
            LedgerEntryType::Credit => {
                balance.available += amount;
                balance.available
            }
        };
        balance.last_updated = Utc::now();

        let entry = LedgerEntry {
            id: Uuid::now_v7(),
            transaction_id,
            account_id,
            entry_type,
            amount,
            currency: currency.to_string(),
            balance_after,
            created_at: Utc::now(),
        };

        {
            let mut entries = self.entries.write().await;
            entries.insert(entry.id, entry.clone());
        }

        {
            let mut account_entries = self.account_entries.write().await;
            account_entries
                .entry(account_id)
                .or_insert_with(Vec::new)
                .push(entry.id);
        }

        debug!("Ledger entry created: {}", entry.id);
        Ok(entry)
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

    async fn get_or_create_balance(&self, account_id: Uuid, currency: &str) -> Result<AccountBalance> {
        let balances = self.balances.read().await;
        Ok(balances.get(&account_id).cloned().unwrap_or_else(|| AccountBalance {
            account_id,
            available: Decimal::new(100000, 2),
            pending: Decimal::ZERO,
            currency: currency.to_string(),
            last_updated: Utc::now(),
        }))
    }

    #[instrument(skip(self))]
    pub async fn get_account_entries(
        &self,
        account_id: Uuid,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<LedgerEntry>> {
        let account_entries = self.account_entries.read().await;
        let entries = self.entries.read().await;

        let entry_ids = account_entries.get(&account_id).cloned().unwrap_or_default();

        let mut result: Vec<LedgerEntry> = entry_ids
            .iter()
            .filter_map(|id| entries.get(id).cloned())
            .collect();

        result.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(result.into_iter().skip(offset).take(limit).collect())
    }

    #[instrument(skip(self))]
    pub async fn reverse_entry(&self, entry_id: Uuid, reason: &str) -> Result<LedgerEntry> {
        let entries = self.entries.read().await;
        let original = entries
            .get(&entry_id)
            .ok_or_else(|| TransactionError::InternalError("Entry not found".to_string()))?
            .clone();
        drop(entries);

        let reverse_type = match original.entry_type {
            LedgerEntryType::Debit => LedgerEntryType::Credit,
            LedgerEntryType::Credit => LedgerEntryType::Debit,
        };

        let reversal = self
            .create_entry(
                original.transaction_id,
                original.account_id,
                reverse_type,
                original.amount,
                &original.currency,
            )
            .await?;

        info!("Entry {} reversed with entry {}: {}", entry_id, reversal.id, reason);
        Ok(reversal)
    }

    pub fn is_connected(&self) -> bool {
        self.tigerbeetle_enabled
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ledger_service_creation() {
        let config = AppConfig::from_env().unwrap();
        let ledger = LedgerService::new(&config);
        assert!(ledger.is_ok());
    }

    #[tokio::test]
    async fn test_create_entry() {
        let config = AppConfig::from_env().unwrap();
        let ledger = LedgerService::new(&config).unwrap();

        let entry = ledger
            .create_entry(
                Uuid::new_v4(),
                Uuid::new_v4(),
                LedgerEntryType::Credit,
                Decimal::new(10000, 2),
                "NGN",
            )
            .await;

        assert!(entry.is_ok());
    }

    #[tokio::test]
    async fn test_create_transfer() {
        let config = AppConfig::from_env().unwrap();
        let ledger = LedgerService::new(&config).unwrap();

        let source = Uuid::new_v4();
        let dest = Uuid::new_v4();

        let result = ledger
            .create_transfer(Uuid::new_v4(), source, dest, Decimal::new(5000, 2), "NGN")
            .await;

        assert!(result.is_ok());
        let (debit, credit) = result.unwrap();
        assert_eq!(debit.entry_type, LedgerEntryType::Debit);
        assert_eq!(credit.entry_type, LedgerEntryType::Credit);
    }
}
