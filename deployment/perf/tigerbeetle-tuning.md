# TigerBeetle — ledger tuning (the hot path: millions of transfers/day)

TigerBeetle is already the fastest component in the stack (~1M TPS per
cluster on NVMe). The wins are in *how the app uses it*:

## Client (backend/app/infrastructure/tigerbeetle_client.py)
- BATCH: submit transfers in batches of up to 8189 (protocol max).
  The saga orchestrator should collect pending ledger postings per 10ms
  window and submit one batched request.
- IDs: use `id()` monotonic generation (client does this).
- flags: use `linked` chains for multi-leg transfers (transfer + fees) —
  atomic, single round-trip.
- Keep the client singleton warm; TB connection setup is cheap but the
  request pipeline benefits from persistent saturation.

## Cluster
- 3 or 5 replicas, NVMe, `--cache-grid-blocks` sized to dataset
- data file on dedicated volume (io_uring required — Linux 5.10+)
- `--replica` memory default 2GB is fine; raise grid cache for large ledgers

## Durability note
TigerBeetle is the system of record for balances. PostgreSQL holds the
operational projection. Never trust PG balance as authoritative.
