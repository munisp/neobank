# Fluvio — edge/stream ingestion tuning (used for offline-first mobile event capture)

## Cluster (SPU sizing)
```bash
fluvio cluster start --spu 3 --spu-log-size 10Gi
```

## Topic provisioning — high-throughput mobile event streams
```bash
# offline transaction sync events: 8 partitions, compression on producers
fluvio topic create offline-tx-events --partitions 8 --replication 3
fluvio topic create device-telemetry --partitions 8 --replication 3
fluvio topic create ussd-session-events --partitions 4 --replication 3
```

## Producer settings (backend/app/infrastructure/fluvio producer)
- batch: linger 10ms, batch size 32KB, compression gzip
- acks: leader (speed) for telemetry; all (durability) for financial events
- smart-modules: use WASM filters server-side to drop noise before storage

## Consumer
- Use SmartModule map/filter at SPU to cut network transfer ~60%
- Consumer offsets committed every 1000 records, not per-record
