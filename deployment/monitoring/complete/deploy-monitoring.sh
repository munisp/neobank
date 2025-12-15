#!/bin/bash

# NeoBank Rate Limiter Monitoring - Quick Start Deployment Script
# This script sets up complete monitoring infrastructure for rate limiter

set -e

echo "=========================================="
echo "NeoBank Rate Limiter Monitoring Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MONITORING_DIR="/opt/neobank-monitoring"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-neobank_admin_2024}"
REDIS_PASSWORD="${REDIS_PASSWORD:-neobank_redis_2024}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

echo -e "${GREEN}Step 1: Creating monitoring directory${NC}"
mkdir -p $MONITORING_DIR/{prometheus,grafana,alertmanager,grafana-provisioning/{datasources,dashboards,notifiers}}
cd $MONITORING_DIR

echo -e "${GREEN}Step 2: Copying configuration files${NC}"
# Copy Prometheus config
if [ -f "/home/ubuntu/prometheus-rate-limiter-config.yml" ]; then
    cp /home/ubuntu/prometheus-rate-limiter-config.yml $MONITORING_DIR/prometheus/prometheus.yml
    echo "  ✓ Prometheus config copied"
else
    echo -e "${RED}  ✗ Prometheus config not found${NC}"
    exit 1
fi

# Copy alert rules
if [ -f "/home/ubuntu/rate_limiter_alerts.yml" ]; then
    cp /home/ubuntu/rate_limiter_alerts.yml $MONITORING_DIR/prometheus/
    echo "  ✓ Alert rules copied"
else
    echo -e "${RED}  ✗ Alert rules not found${NC}"
    exit 1
fi

# Copy Grafana dashboard
if [ -f "/home/ubuntu/grafana-rate-limiter-dashboard.json" ]; then
    cp /home/ubuntu/grafana-rate-limiter-dashboard.json $MONITORING_DIR/grafana-provisioning/dashboards/
    echo "  ✓ Grafana dashboard copied"
else
    echo -e "${RED}  ✗ Grafana dashboard not found${NC}"
    exit 1
fi

# Copy Docker Compose
if [ -f "/home/ubuntu/docker-compose-monitoring.yml" ]; then
    cp /home/ubuntu/docker-compose-monitoring.yml $MONITORING_DIR/docker-compose.yml
    echo "  ✓ Docker Compose config copied"
else
    echo -e "${RED}  ✗ Docker Compose config not found${NC}"
    exit 1
fi

echo -e "${GREEN}Step 3: Creating Grafana datasource config${NC}"
cat > $MONITORING_DIR/grafana-provisioning/datasources/prometheus.yml <<EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: "10s"
      queryTimeout: "60s"
      httpMethod: POST
    version: 1
EOF
echo "  ✓ Datasource config created"

echo -e "${GREEN}Step 4: Creating Grafana dashboard provisioning config${NC}"
cat > $MONITORING_DIR/grafana-provisioning/dashboards/dashboards.yml <<EOF
apiVersion: 1

providers:
  - name: 'Rate Limiter Dashboards'
    orgId: 1
    folder: 'NeoBank'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: true
EOF
echo "  ✓ Dashboard provisioning config created"

echo -e "${GREEN}Step 5: Creating Alertmanager config${NC}"
cat > $MONITORING_DIR/alertmanager/alertmanager.yml <<EOF
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default-receiver'

receivers:
  - name: 'default-receiver'
    webhook_configs:
      - url: 'http://localhost:5001/webhook'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'endpoint']
EOF
echo "  ✓ Alertmanager config created"

echo -e "${GREEN}Step 6: Creating environment file${NC}"
cat > $MONITORING_DIR/.env <<EOF
# Grafana Configuration
GF_SECURITY_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD

# Redis Configuration
REDIS_PASSWORD=$REDIS_PASSWORD

# Slack Configuration (optional)
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# PagerDuty Configuration (optional)
# PAGERDUTY_SERVICE_KEY=your-pagerduty-service-key

# SMTP Configuration (optional)
# SMTP_USERNAME=your-smtp-username
# SMTP_PASSWORD=your-smtp-password
EOF
echo "  ✓ Environment file created"

echo -e "${GREEN}Step 7: Checking Docker installation${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}  ✗ Docker not found. Please install Docker first.${NC}"
    exit 1
fi
echo "  ✓ Docker is installed"

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}  ✗ Docker Compose not found. Please install Docker Compose first.${NC}"
    exit 1
fi
echo "  ✓ Docker Compose is installed"

echo -e "${GREEN}Step 8: Starting monitoring stack${NC}"
cd $MONITORING_DIR
docker-compose up -d

echo ""
echo -e "${GREEN}Step 9: Waiting for services to start...${NC}"
sleep 10

echo ""
echo -e "${GREEN}Step 10: Verifying services${NC}"

# Check Prometheus
if curl -s http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Prometheus is running${NC}"
else
    echo -e "  ${RED}✗ Prometheus is not responding${NC}"
fi

# Check Grafana
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Grafana is running${NC}"
else
    echo -e "  ${RED}✗ Grafana is not responding${NC}"
fi

# Check Alertmanager
if curl -s http://localhost:9093/-/healthy > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Alertmanager is running${NC}"
else
    echo -e "  ${RED}✗ Alertmanager is not responding${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Monitoring Stack Deployed Successfully!${NC}"
echo "=========================================="
echo ""
echo "Access URLs:"
echo "  - Grafana:       http://localhost:3000"
echo "  - Prometheus:    http://localhost:9090"
echo "  - Alertmanager:  http://localhost:9093"
echo ""
echo "Grafana Credentials:"
echo "  - Username: admin"
echo "  - Password: $GRAFANA_ADMIN_PASSWORD"
echo ""
echo "Next Steps:"
echo "  1. Access Grafana at http://localhost:3000"
echo "  2. Navigate to Dashboards → NeoBank → Rate Limiter Dashboard"
echo "  3. Configure alert notifications in Alertmanager"
echo "  4. Update .env file with Slack/PagerDuty credentials"
echo ""
echo "To stop the stack:"
echo "  cd $MONITORING_DIR && docker-compose down"
echo ""
echo "To view logs:"
echo "  cd $MONITORING_DIR && docker-compose logs -f"
echo ""
echo "Documentation:"
echo "  See RATE_LIMITER_MONITORING_SETUP_GUIDE.md for detailed instructions"
echo ""
