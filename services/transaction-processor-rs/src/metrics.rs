use prometheus::{Counter, CounterVec, Histogram, HistogramOpts, HistogramVec, Opts, Registry};

pub struct Metrics {
    pub registry: Registry,
    pub requests_total: CounterVec,
    pub request_duration: HistogramVec,
    pub transactions_processed: CounterVec,
    pub transaction_amount: HistogramVec,
    pub batch_transactions: CounterVec,
    pub ledger_operations: CounterVec,
    pub kafka_messages_sent: Counter,
    pub kafka_messages_failed: Counter,
}

impl Metrics {
    pub fn new() -> Self {
        let registry = Registry::new();

        let requests_total = CounterVec::new(
            Opts::new("transaction_processor_requests_total", "Total number of requests"),
            &["operation"],
        )
        .unwrap();

        let request_duration = HistogramVec::new(
            HistogramOpts::new(
                "transaction_processor_request_duration_seconds",
                "Request duration in seconds",
            )
            .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]),
            &["operation"],
        )
        .unwrap();

        let transactions_processed = CounterVec::new(
            Opts::new(
                "transaction_processor_transactions_total",
                "Total number of transactions processed",
            ),
            &["status"],
        )
        .unwrap();

        let transaction_amount = HistogramVec::new(
            HistogramOpts::new(
                "transaction_processor_amount",
                "Transaction amounts",
            )
            .buckets(vec![1.0, 10.0, 100.0, 1000.0, 10000.0, 100000.0, 1000000.0]),
            &["currency", "type"],
        )
        .unwrap();

        let batch_transactions = CounterVec::new(
            Opts::new(
                "transaction_processor_batch_transactions_total",
                "Total number of batch transactions",
            ),
            &["status"],
        )
        .unwrap();

        let ledger_operations = CounterVec::new(
            Opts::new(
                "transaction_processor_ledger_operations_total",
                "Total number of ledger operations",
            ),
            &["operation", "status"],
        )
        .unwrap();

        let kafka_messages_sent = Counter::new(
            "transaction_processor_kafka_messages_sent_total",
            "Total Kafka messages sent",
        )
        .unwrap();

        let kafka_messages_failed = Counter::new(
            "transaction_processor_kafka_messages_failed_total",
            "Total Kafka messages failed",
        )
        .unwrap();

        registry.register(Box::new(requests_total.clone())).unwrap();
        registry.register(Box::new(request_duration.clone())).unwrap();
        registry.register(Box::new(transactions_processed.clone())).unwrap();
        registry.register(Box::new(transaction_amount.clone())).unwrap();
        registry.register(Box::new(batch_transactions.clone())).unwrap();
        registry.register(Box::new(ledger_operations.clone())).unwrap();
        registry.register(Box::new(kafka_messages_sent.clone())).unwrap();
        registry.register(Box::new(kafka_messages_failed.clone())).unwrap();

        Self {
            registry,
            requests_total,
            request_duration,
            transactions_processed,
            transaction_amount,
            batch_transactions,
            ledger_operations,
            kafka_messages_sent,
            kafka_messages_failed,
        }
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}
