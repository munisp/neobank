# NeoBank Monitoring & Observability Setup Guide

## Overview

This guide provides comprehensive instructions for setting up monitoring, logging, and observability for the NeoBank platform using Prometheus, Grafana, Loki, and related tools.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     NeoBank Platform                         │
├─────────────────────────────────────────────────────────────┤
│  Backend API  │  Frontend  │  PWA  │  KYC Frontend          │
└────────┬────────────┬────────┬─────────┬────────────────────┘
         │            │        │         │
         ▼            ▼        ▼         ▼
    ┌────────────────────────────────────────┐
    │         Metrics Exporters               │
    │  (Prometheus, Node Exporter, etc.)      │
    └────────────────┬───────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │   Prometheus    │  ◄─── Scrapes metrics
            │   (Time Series) │
            └────────┬────────┘
                     │
                     ├──────────────┐
                     ▼              ▼
            ┌────────────┐   ┌──────────────┐
            │  Grafana    │   │ Alertmanager │
            │ (Dashboard) │   │  (Alerts)    │
            └─────────────┘   └──────────────┘
```

---

## Quick Start

### Docker Compose (Recommended for Development/Staging)

```bash
# Navigate to monitoring directory
cd NEOBANK-DEPLOYMENT-COMPLETE/monitoring

# Start monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# Access dashboards
# Grafana: http://localhost:3000 (admin/admin)
# Prometheus: http://localhost:9090
# Alertmanager: http://localhost:9093
```

### Kubernetes (Production)

```bash
# Create monitoring namespace
kubectl create namespace monitoring

# Deploy Prometheus
kubectl apply -f ../kubernetes/monitoring-stack.yaml -n monitoring

# Verify deployment
kubectl get pods -n monitoring

# Port forward to access locally
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

---

## Components

### 1. Prometheus

**Purpose:** Metrics collection and storage

**Configuration:** `prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # Backend API
  - job_name: 'backend-api'
    static_configs:
      - targets: ['backend:8000']
    metrics_path: '/metrics'
  
  # Frontend Web
  - job_name: 'frontend'
    static_configs:
      - targets: ['frontend:3000']
  
  # PWA
  - job_name: 'pwa'
    static_configs:
      - targets: ['pwa:80']
  
  # PostgreSQL
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
  
  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
  
  # Node metrics
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

**Key Metrics:**
- HTTP request rate, latency, errors
- Database connection pool
- Redis cache hit/miss ratio
- CPU, memory, disk usage
- Rate limiter blocks
- Transaction volumes

---

### 2. Grafana

**Purpose:** Visualization and dashboards

**Default Credentials:**
- Username: `admin`
- Password: `admin` (change on first login)

**Pre-configured Dashboards:**
1. **NeoBank Overview** - System health at a glance
2. **Backend API Performance** - API metrics
3. **Database Monitoring** - PostgreSQL metrics
4. **Rate Limiter Dashboard** - Security metrics
5. **User Activity** - Business metrics

**Dashboard Import:**
```bash
# Import dashboard via UI
# Grafana → Dashboards → Import → Upload JSON file
# Or use dashboard ID from grafana.com
```

---

### 3. Alertmanager

**Purpose:** Alert routing and notification

**Configuration:** `alertmanager.yml`

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'YOUR_SLACK_WEBHOOK_URL'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  
  routes:
  - match:
      severity: critical
    receiver: 'pagerduty'
    continue: true
  
  - match:
      severity: warning
    receiver: 'slack'

receivers:
- name: 'default'
  email_configs:
  - to: 'alerts@neobank.com'
    from: 'prometheus@neobank.com'
    smarthost: 'smtp.gmail.com:587'
    auth_username: 'prometheus@neobank.com'
    auth_password: 'YOUR_PASSWORD'

- name: 'slack'
  slack_configs:
  - channel: '#alerts'
    title: '{{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

- name: 'pagerduty'
  pagerduty_configs:
  - service_key: 'YOUR_PAGERDUTY_KEY'
```

---

### 4. Loki (Log Aggregation)

**Purpose:** Centralized logging

**Configuration:** `loki-config.yml`

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
  - from: 2020-05-15
    store: boltdb
    object_store: filesystem
    schema: v11
    index:
      prefix: index_
      period: 168h

storage_config:
  boltdb:
    directory: /loki/index
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
```

---

### 5. Promtail (Log Shipper)

**Purpose:** Ship logs to Loki

**Configuration:** `promtail-config.yml`

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
- job_name: system
  static_configs:
  - targets:
      - localhost
    labels:
      job: varlogs
      __path__: /var/log/*log

- job_name: docker
  docker_sd_configs:
  - host: unix:///var/run/docker.sock
    refresh_interval: 5s
  relabel_configs:
  - source_labels: ['__meta_docker_container_name']
    regex: '/(.*)'
    target_label: 'container'
```

---

## Alert Rules

### Critical Alerts

**High Error Rate:**
```yaml
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High error rate detected"
    description: "Error rate is {{ $value }} errors/sec"
```

**Database Down:**
```yaml
- alert: DatabaseDown
  expr: up{job="postgres"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "PostgreSQL database is down"
```

**High Memory Usage:**
```yaml
- alert: HighMemoryUsage
  expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High memory usage"
    description: "Memory usage is above 90%"
```

---

## Metrics to Monitor

### Application Metrics

**Backend API:**
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency
- `http_requests_in_flight` - Active requests
- `database_connections_active` - DB connections
- `cache_hits_total` / `cache_misses_total` - Cache performance

**Business Metrics:**
- `user_registrations_total` - New users
- `transactions_total` - Transaction count
- `transaction_value_total` - Transaction volume
- `loan_applications_total` - Loan applications
- `insurance_policies_total` - Insurance policies

### Infrastructure Metrics

**CPU:**
- `node_cpu_seconds_total` - CPU usage
- `process_cpu_seconds_total` - Process CPU

**Memory:**
- `node_memory_MemAvailable_bytes` - Available memory
- `process_resident_memory_bytes` - Process memory

**Disk:**
- `node_filesystem_avail_bytes` - Available disk space
- `node_disk_io_time_seconds_total` - Disk I/O

**Network:**
- `node_network_receive_bytes_total` - Network RX
- `node_network_transmit_bytes_total` - Network TX

---

## Grafana Dashboard Setup

### 1. Add Prometheus Data Source

```bash
# Via UI
Grafana → Configuration → Data Sources → Add data source → Prometheus
URL: http://prometheus:9090
Access: Server (default)
```

### 2. Import Dashboards

**Method 1: Upload JSON**
```bash
Grafana → Dashboards → Import → Upload JSON file
Select: grafana-dashboard.json
```

**Method 2: Dashboard ID**
```bash
Grafana → Dashboards → Import
Enter ID: 1860 (Node Exporter Full)
Select Prometheus data source
```

### 3. Create Custom Dashboard

**Example Panel (Request Rate):**
```promql
rate(http_requests_total[5m])
```

**Example Panel (Error Rate):**
```promql
rate(http_requests_total{status=~"5.."}[5m])
```

**Example Panel (P95 Latency):**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

---

## Log Aggregation with Loki

### Query Logs in Grafana

**Add Loki Data Source:**
```bash
Grafana → Configuration → Data Sources → Add data source → Loki
URL: http://loki:3100
```

**Example LogQL Queries:**

**All logs from backend:**
```logql
{container="backend"}
```

**Error logs:**
```logql
{container="backend"} |= "error"
```

**Rate of errors:**
```logql
rate({container="backend"} |= "error" [5m])
```

**Filter by level:**
```logql
{container="backend"} | json | level="error"
```

---

## Cloud Provider Integration

### AWS CloudWatch

**Export Prometheus metrics to CloudWatch:**
```yaml
# Use CloudWatch exporter
docker run -d \
  -p 9106:9106 \
  prom/cloudwatch-exporter \
  --config.file=/config/cloudwatch.yml
```

### Azure Monitor

**Use Azure Monitor integration:**
```bash
# Install Azure Monitor agent
az monitor app-insights component create \
  --app neobank-prod \
  --location eastus \
  --resource-group neobank-prod
```

### GCP Cloud Monitoring

**Export to Cloud Monitoring:**
```yaml
# Use Stackdriver exporter
docker run -d \
  -p 9255:9255 \
  frodenas/stackdriver-exporter
```

---

## Performance Tuning

### Prometheus

**Increase retention:**
```yaml
command:
  - '--storage.tsdb.retention.time=30d'
  - '--storage.tsdb.retention.size=50GB'
```

**Optimize scrape interval:**
```yaml
global:
  scrape_interval: 30s  # Reduce for less frequent scraping
```

### Grafana

**Enable caching:**
```ini
[caching]
enabled = true
```

**Optimize queries:**
- Use recording rules for complex queries
- Limit time range
- Use appropriate step interval

---

## Troubleshooting

### Prometheus Not Scraping Targets

**Check target status:**
```bash
# Access Prometheus UI
http://localhost:9090/targets

# Check connectivity
curl http://backend:8000/metrics
```

**Common issues:**
- Network connectivity
- Incorrect port
- Missing /metrics endpoint
- Authentication required

### Grafana Dashboard Not Loading

**Check data source:**
```bash
# Test Prometheus connection
curl http://prometheus:9090/api/v1/query?query=up
```

**Check logs:**
```bash
docker logs grafana
kubectl logs -n monitoring grafana-xxx
```

### Alerts Not Firing

**Check alert rules:**
```bash
# Prometheus UI → Alerts
http://localhost:9090/alerts

# Check Alertmanager
http://localhost:9093
```

**Verify configuration:**
```bash
promtool check rules alert-rules.yml
```

---

## Best Practices

### 1. Metric Naming
- Use consistent naming: `app_subsystem_metric_unit`
- Example: `http_requests_total`, `database_connections_active`

### 2. Label Usage
- Keep cardinality low (avoid user IDs as labels)
- Use meaningful labels: `method`, `status`, `endpoint`

### 3. Alert Design
- Set appropriate thresholds
- Use `for` clause to avoid flapping
- Include actionable descriptions

### 4. Dashboard Organization
- Group related metrics
- Use consistent time ranges
- Add descriptions and links

### 5. Retention Policy
- Balance storage vs. retention needs
- Use recording rules for long-term data
- Archive old data if needed

---

## Maintenance

### Regular Tasks

**Daily:**
- Check alert status
- Review error rates
- Monitor resource usage

**Weekly:**
- Review dashboard usage
- Update alert thresholds
- Check disk space

**Monthly:**
- Audit metrics and logs
- Update dashboards
- Review retention policies
- Test backup/restore

---

## Security

### 1. Authentication
```yaml
# Enable Grafana auth
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=<strong-password>
```

### 2. TLS/SSL
```yaml
# Enable HTTPS
GF_SERVER_PROTOCOL=https
GF_SERVER_CERT_FILE=/etc/grafana/ssl/cert.pem
GF_SERVER_CERT_KEY=/etc/grafana/ssl/key.pem
```

### 3. Access Control
- Use RBAC in Kubernetes
- Limit network access
- Enable audit logging

---

## Resources

### Documentation
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)
- [Loki Docs](https://grafana.com/docs/loki/)

### Community Dashboards
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- Node Exporter Full: 1860
- PostgreSQL: 9628
- Redis: 11835

### Tools
- **PromQL Cheat Sheet**: https://promlabs.com/promql-cheat-sheet/
- **Grafana Play**: https://play.grafana.org/

---

## Support

For monitoring issues:
- **DevOps Team**: devops@neobank.com
- **On-call**: Use PagerDuty
- **Documentation**: /docs/monitoring/

---

**Last Updated:** November 2, 2025  
**Version:** 1.0
