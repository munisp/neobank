use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::config::AppConfig;
use crate::error::{Result, TransactionError};
use crate::models::{Transaction, TransactionEvent};

pub struct KafkaProducer {
    topic_transactions: String,
    topic_events: String,
    enabled: bool,
}

impl KafkaProducer {
    pub fn new(config: &AppConfig) -> Result<Self> {
        info!("Initializing Kafka producer");
        info!("Kafka brokers: {}", config.kafka_brokers);

        Ok(Self {
            topic_transactions: config.kafka_topic_transactions.clone(),
            topic_events: config.kafka_topic_events.clone(),
            enabled: !config.kafka_brokers.is_empty(),
        })
    }

    pub async fn publish_transaction(&self, transaction: &Transaction) -> Result<()> {
        if !self.enabled {
            debug!("Kafka disabled, skipping transaction publish");
            return Ok(());
        }

        let message = TransactionMessage {
            transaction_id: transaction.id,
            transaction_type: format!("{:?}", transaction.transaction_type),
            source_account_id: transaction.source_account_id,
            destination_account_id: transaction.destination_account_id,
            amount: transaction.amount.to_string(),
            currency: transaction.currency.clone(),
            status: format!("{:?}", transaction.status),
            reference: transaction.reference.clone(),
            created_at: transaction.created_at.to_rfc3339(),
        };

        let payload = serde_json::to_string(&message)
            .map_err(|e| TransactionError::KafkaError(e.to_string()))?;

        debug!("Publishing transaction to Kafka: {}", transaction.id);
        info!("Would publish to topic {}: {}", self.topic_transactions, payload);

        Ok(())
    }

    pub async fn publish_event(&self, event: &TransactionEvent) -> Result<()> {
        if !self.enabled {
            debug!("Kafka disabled, skipping event publish");
            return Ok(());
        }

        let payload = serde_json::to_string(event)
            .map_err(|e| TransactionError::KafkaError(e.to_string()))?;

        debug!("Publishing event to Kafka: {}", event.event_id);
        info!("Would publish to topic {}: {}", self.topic_events, payload);

        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.enabled
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct TransactionMessage {
    transaction_id: Uuid,
    transaction_type: String,
    source_account_id: Option<Uuid>,
    destination_account_id: Option<Uuid>,
    amount: String,
    currency: String,
    status: String,
    reference: String,
    created_at: String,
}

pub struct KafkaConsumer {
    consumer_group: String,
    topics: Vec<String>,
    enabled: bool,
}

impl KafkaConsumer {
    pub fn new(config: &AppConfig) -> Result<Self> {
        info!("Initializing Kafka consumer");

        Ok(Self {
            consumer_group: config.kafka_consumer_group.clone(),
            topics: vec![
                config.kafka_topic_transactions.clone(),
                config.kafka_topic_events.clone(),
            ],
            enabled: !config.kafka_brokers.is_empty(),
        })
    }

    pub async fn start<F>(&self, handler: F) -> Result<()>
    where
        F: Fn(String, String) -> Result<()> + Send + Sync + 'static,
    {
        if !self.enabled {
            info!("Kafka disabled, consumer not started");
            return Ok(());
        }

        info!("Starting Kafka consumer for topics: {:?}", self.topics);
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.enabled
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_kafka_producer_creation() {
        let config = AppConfig::from_env().unwrap();
        let producer = KafkaProducer::new(&config);
        assert!(producer.is_ok());
    }

    #[tokio::test]
    async fn test_kafka_consumer_creation() {
        let config = AppConfig::from_env().unwrap();
        let consumer = KafkaConsumer::new(&config);
        assert!(consumer.is_ok());
    }
}
