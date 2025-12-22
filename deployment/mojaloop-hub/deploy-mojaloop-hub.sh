#!/bin/bash
set -euo pipefail

# Mojaloop Hub Deployment Script with PostgreSQL HA
# This script deploys a full Mojaloop hub using PostgreSQL instead of MySQL
# while keeping TigerBeetle as the DFSP's internal ledger

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="mojaloop"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    if ! command -v helm &> /dev/null; then
        log_error "helm not found. Please install helm."
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Please configure kubectl."
        exit 1
    fi
    
    log_success "Prerequisites check passed."
}

# Install CloudNativePG operator
install_cloudnativepg() {
    log_info "Installing CloudNativePG operator..."
    
    if kubectl get deployment -n cnpg-system cnpg-controller-manager &> /dev/null; then
        log_warn "CloudNativePG operator already installed."
        return
    fi
    
    kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.22/releases/cnpg-1.22.1.yaml
    
    log_info "Waiting for CloudNativePG operator to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/cnpg-controller-manager -n cnpg-system
    
    log_success "CloudNativePG operator installed."
}

# Install Strimzi Kafka operator
install_strimzi() {
    log_info "Installing Strimzi Kafka operator..."
    
    if kubectl get deployment -n strimzi-system strimzi-cluster-operator &> /dev/null 2>&1; then
        log_warn "Strimzi operator already installed."
        return
    fi
    
    helm repo add strimzi https://strimzi.io/charts/ || true
    helm repo update
    
    kubectl create namespace strimzi-system --dry-run=client -o yaml | kubectl apply -f -
    
    helm upgrade --install strimzi-kafka-operator strimzi/strimzi-kafka-operator \
        --namespace strimzi-system \
        --set watchNamespaces="{mojaloop}" \
        --wait
    
    log_success "Strimzi Kafka operator installed."
}

# Create namespace and secrets
setup_namespace() {
    log_info "Setting up namespace and secrets..."
    
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
    
    # Generate random password if not set
    POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)}
    
    # Create PostgreSQL credentials secret
    kubectl create secret generic mojaloop-postgres-credentials \
        --namespace ${NAMESPACE} \
        --from-literal=username=mojaloop \
        --from-literal=password="${POSTGRES_PASSWORD}" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Namespace and secrets configured."
    log_info "PostgreSQL password: ${POSTGRES_PASSWORD}"
}

# Deploy PostgreSQL HA cluster
deploy_postgresql() {
    log_info "Deploying PostgreSQL HA cluster..."
    
    kubectl apply -f "${SCRIPT_DIR}/postgresql-ha/cloudnativepg-cluster.yaml"
    
    log_info "Waiting for PostgreSQL cluster to be ready (this may take several minutes)..."
    
    # Wait for the cluster to be ready
    for i in {1..60}; do
        STATUS=$(kubectl get cluster mojaloop-postgres -n ${NAMESPACE} -o jsonpath='{.status.phase}' 2>/dev/null || echo "Pending")
        if [ "$STATUS" == "Cluster in healthy state" ]; then
            log_success "PostgreSQL cluster is ready."
            return
        fi
        log_info "PostgreSQL cluster status: $STATUS (attempt $i/60)"
        sleep 10
    done
    
    log_warn "PostgreSQL cluster may not be fully ready. Check status with: kubectl get cluster mojaloop-postgres -n ${NAMESPACE}"
}

# Deploy Kafka cluster
deploy_kafka() {
    log_info "Deploying Kafka cluster..."
    
    kubectl apply -f "${SCRIPT_DIR}/infrastructure/kafka-cluster.yaml"
    
    log_info "Waiting for Kafka cluster to be ready (this may take several minutes)..."
    
    for i in {1..60}; do
        READY=$(kubectl get kafka mojaloop-kafka -n ${NAMESPACE} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")
        if [ "$READY" == "True" ]; then
            log_success "Kafka cluster is ready."
            return
        fi
        log_info "Kafka cluster not ready yet (attempt $i/60)"
        sleep 10
    done
    
    log_warn "Kafka cluster may not be fully ready. Check status with: kubectl get kafka mojaloop-kafka -n ${NAMESPACE}"
}

# Deploy Redis cluster
deploy_redis() {
    log_info "Deploying Redis cluster..."
    
    kubectl apply -f "${SCRIPT_DIR}/infrastructure/redis-cluster.yaml"
    
    log_info "Waiting for Redis to be ready..."
    kubectl wait --for=condition=ready pod -l app=mojaloop-redis,role=master -n ${NAMESPACE} --timeout=300s || true
    
    log_success "Redis cluster deployed."
}

# Deploy Mojaloop hub using Helm
deploy_mojaloop() {
    log_info "Deploying Mojaloop hub..."
    
    # Add Mojaloop Helm repo
    helm repo add mojaloop https://mojaloop.io/helm/repo/ || true
    helm repo update
    
    # Deploy Mojaloop with PostgreSQL configuration
    helm upgrade --install mojaloop mojaloop/mojaloop \
        --namespace ${NAMESPACE} \
        --values "${SCRIPT_DIR}/helm-values/mojaloop-values.yaml" \
        --timeout 30m \
        --wait
    
    log_success "Mojaloop hub deployed."
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Central Ledger migrations
    kubectl exec -n ${NAMESPACE} deploy/mojaloop-centralledger-service -- npm run migrate || log_warn "Central Ledger migrations may have already run"
    
    # Account Lookup Service migrations
    kubectl exec -n ${NAMESPACE} deploy/mojaloop-account-lookup-service -- npm run migrate || log_warn "ALS migrations may have already run"
    
    # Quoting Service migrations
    kubectl exec -n ${NAMESPACE} deploy/mojaloop-quoting-service -- npm run migrate || log_warn "Quoting Service migrations may have already run"
    
    # Central Settlement migrations
    kubectl exec -n ${NAMESPACE} deploy/mojaloop-centralsettlement-service -- npm run migrate || log_warn "Central Settlement migrations may have already run"
    
    log_success "Database migrations completed."
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    echo ""
    echo "=== PostgreSQL Cluster Status ==="
    kubectl get cluster mojaloop-postgres -n ${NAMESPACE} -o wide || true
    
    echo ""
    echo "=== Kafka Cluster Status ==="
    kubectl get kafka mojaloop-kafka -n ${NAMESPACE} -o wide || true
    
    echo ""
    echo "=== Mojaloop Pods ==="
    kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/instance=mojaloop || true
    
    echo ""
    echo "=== Services ==="
    kubectl get svc -n ${NAMESPACE} | grep -E "(mojaloop|postgres|kafka|redis)" || true
    
    log_success "Deployment verification complete."
}

# Print connection info
print_connection_info() {
    log_info "Connection Information:"
    
    echo ""
    echo "=== PostgreSQL ==="
    echo "  Host: mojaloop-postgres-pooler-rw.${NAMESPACE}.svc.cluster.local"
    echo "  Port: 5432"
    echo "  User: mojaloop"
    echo "  Databases: central_ledger, account_lookup, quoting_service, central_settlement, bulk_api_adapter"
    
    echo ""
    echo "=== Kafka ==="
    echo "  Bootstrap: mojaloop-kafka-kafka-bootstrap.${NAMESPACE}.svc.cluster.local:9092"
    
    echo ""
    echo "=== Redis ==="
    echo "  Master: mojaloop-redis-master.${NAMESPACE}.svc.cluster.local:6379"
    echo "  Sentinel: mojaloop-redis-sentinel.${NAMESPACE}.svc.cluster.local:26379"
    
    echo ""
    echo "=== Mojaloop API ==="
    echo "  ML API Adapter: http://mojaloop-ml-api-adapter.${NAMESPACE}.svc.cluster.local:3000"
    echo "  Central Ledger: http://mojaloop-centralledger-service.${NAMESPACE}.svc.cluster.local:3001"
    echo "  Account Lookup: http://mojaloop-account-lookup-service.${NAMESPACE}.svc.cluster.local:4002"
    echo "  Quoting Service: http://mojaloop-quoting-service.${NAMESPACE}.svc.cluster.local:3002"
    
    echo ""
    log_success "Mojaloop Hub with PostgreSQL HA is ready!"
    echo ""
    echo "TigerBeetle remains as the DFSP's internal ledger at:"
    echo "  DFSP Adapter: /backend/app/services/mojaloop_dfsp_service.py"
    echo "  TigerBeetle Client: /backend/app/infrastructure/tigerbeetle_client.py"
}

# Main deployment flow
main() {
    echo ""
    echo "=========================================="
    echo "  Mojaloop Hub Deployment with PostgreSQL HA"
    echo "=========================================="
    echo ""
    
    check_prerequisites
    install_cloudnativepg
    install_strimzi
    setup_namespace
    deploy_postgresql
    deploy_kafka
    deploy_redis
    deploy_mojaloop
    run_migrations
    verify_deployment
    print_connection_info
}

# Parse arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    verify)
        verify_deployment
        print_connection_info
        ;;
    cleanup)
        log_info "Cleaning up Mojaloop deployment..."
        helm uninstall mojaloop -n ${NAMESPACE} || true
        kubectl delete -f "${SCRIPT_DIR}/infrastructure/redis-cluster.yaml" || true
        kubectl delete -f "${SCRIPT_DIR}/infrastructure/kafka-cluster.yaml" || true
        kubectl delete -f "${SCRIPT_DIR}/postgresql-ha/cloudnativepg-cluster.yaml" || true
        kubectl delete namespace ${NAMESPACE} || true
        log_success "Cleanup complete."
        ;;
    *)
        echo "Usage: $0 {deploy|verify|cleanup}"
        exit 1
        ;;
esac
