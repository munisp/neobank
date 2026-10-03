# Mojaloop database layer — PostgreSQL (not MySQL)

Upstream Mojaloop defaults to MySQL 8 for central-ledger. **This platform
already runs Mojaloop on PostgreSQL** (see deployment/mojaloop-hub/helm-values
— `CLEDG_DATABASE__DIALECT: postgres` on CloudNativePG + PgBouncer pooler).
That is the right call for this stack: one less database engine to operate,
and PG handles the central-ledger write profile well with:

## central-ledger PG tuning (applied on the mojaloop-postgres cluster)
```
synchronous_commit = remote_write   # stricter than main API DB — ledger data
shared_buffers = 4GB
work_mem = 16MB
max_connections = 200               # behind pooler (transaction mode)
jit = off
autovacuum_vacuum_scale_factor = 0.03   # transfer tables churn hard
log_min_duration_statement = 50
```

## If MySQL were required (legacy upstream charts)
Apply these to my.cnf — but prefer the Postgres path above:
```
innodb_buffer_pool_size = 8G
innodb_flush_log_at_trx_commit = 2  # 1 if ledger-grade durability needed
innodb_io_capacity = 4000
innodb_flush_method = O_DIRECT
binlog_format = ROW
transaction_isolation = READ-COMMITTED   # central-ledger assumes this
```

## Throughput notes
- Mojaloop quoting/transfer path is Kafka-bound, not DB-bound. Partition
  `topic-transfer-prepare` and `topic-transfer-position` by fsp id (24+).
- position-handler batch window: 20ms (default 100ms) — set via
  `POSITION_BATCH_PROCESSING_INTERVAL_MS=20`.
