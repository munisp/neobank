#!/usr/bin/env bash

# deploy.sh - Production Deployment Script

# --- Configuration ---
# The deployment target (e.g., 'docker-compose.yml' or a Kubernetes context/manifest)
DEPLOYMENT_TARGET="docker-compose.yml"
# Backup file for rollback (will be created during deployment)
BACKUP_FILE="docker-compose.yml.bak"
# Log file location
LOG_FILE="/var/log/deploy_$(date +%Y%m%d_%H%M%S).log"
# Notification settings (replace with actual values)
NOTIFICATION_SLACK_WEBHOOK=""
NOTIFICATION_EMAIL_TO=""
NOTIFICATION_EMAIL_FROM="deploy-bot@example.com"

# --- Error Handling and Safety ---
# Exit immediately if a command exits with a non-zero status.
set -e
# Exit if any command in a pipeline fails.
set -o pipefail
# Exit if an uninitialized variable is used.
set -u

# --- Colors for Readability ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Logging Functions ---

# Function to log a message to the console and the log file
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo -e "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Function to display a success message
success() {
    log "SUCCESS" "${GREEN}✓ ${1}${NC}"
}

# Function to display an informational message
info() {
    log "INFO" "${BLUE}i ${1}${NC}"
}

# Function to display a warning message
warn() {
    log "WARN" "${YELLOW}! ${1}${NC}"
}

# Function to display an error message and exit
error() {
    log "ERROR" "${RED}✗ ${1}${NC}"
    exit 1
}

# Function to display a header
header() {
    echo -e "\n${BLUE}==================================================${NC}" | tee -a "${LOG_FILE}"
    echo -e "${BLUE}== ${1} ==${NC}" | tee -a "${LOG_FILE}"
    echo -e "${BLUE}==================================================${NC}\n" | tee -a "${LOG_FILE}"
}

# --- Progress Indicator Function ---
# Simple spinner for long-running tasks
spinner() {
    local pid=$!
    local delay=0.1
    local spinstr='|/-\\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf "  [%c]  " "$spinstr"
        local spinstr=$temp${spinstr:0:1}
        sleep $delay
        printf "\b\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# --- Notification Function (Placeholder) ---
notify() {
    local status="$1" # SUCCESS or FAILURE
    local subject="Deployment ${status} on $(hostname)"
    local body="Deployment finished with status: ${status}. See log file: ${LOG_FILE}"

    if [ "${status}" == "FAILURE" ]; then
        local color="${RED}"
    else
        local color="${GREEN}"
    fi

    # Slack Notification (requires 'curl')
    if [ -n "${NOTIFICATION_SLACK_WEBHOOK}" ]; then
        info "Sending Slack notification..."
        curl -s -X POST -H 'Content-type: application/json' --data "{\"text\":\"${subject}\",\"attachments\":[{\"text\":\"${body}\",\"color\":\"${color}\"}]}" "${NOTIFICATION_SLACK_WEBHOOK}" > /dev/null || warn "Failed to send Slack notification."
    fi

    # Email Notification (requires 'mail' or similar)
    if [ -n "${NOTIFICATION_EMAIL_TO}" ]; then
        info "Sending Email notification..."
        echo "${body}" | mail -s "${subject}" -r "${NOTIFICATION_EMAIL_FROM}" "${NOTIFICATION_EMAIL_TO}" || warn "Failed to send email notification."
    fi
}

# --- Rollback Function ---
rollback() {
    header "ROLLBACK INITIATED"
    warn "Attempting to roll back to previous state..."

    if [ -f "${BACKUP_FILE}" ]; then
        info "Restoring ${DEPLOYMENT_TARGET} from ${BACKUP_FILE}..."
        # Simulate rollback by restoring the previous configuration file
        cp "${BACKUP_FILE}" "${DEPLOYMENT_TARGET}" || error "Failed to restore backup file."

        # Re-deploy the old configuration
        info "Re-deploying previous configuration..."
        # In a real scenario, this would be the command to deploy the backup
        # e.g., docker-compose -f "${DEPLOYMENT_TARGET}" up -d --force-recreate
        sleep 3 # Simulate re-deployment time
        
        # Check health of the rolled-back services
        if check_health; then
            success "Rollback successful. Previous services are running."
            notify "ROLLBACK_SUCCESS"
            exit 0
        else
            error "Rollback failed. Previous services are not healthy. Manual intervention required."
        fi
    else
        error "No backup file found at ${BACKUP_FILE}. Cannot perform automatic rollback."
    fi
}

# Trap function to handle errors and ensure notifications are sent
trap '
    if [ $? -ne 0 ]; then
        error_line=$LINENO
        error_command=$BASH_COMMAND
        log "FATAL" "Script failed at line ${error_line} executing command: ${error_command}"
        notify "FAILURE"
        # Optionally call rollback here, but it\'s safer to let the main script decide
        # rollback
    fi
' ERR

# --- Main Deployment Logic ---

# Function to perform pre-flight checks
check_preflight() {
    header "PRE-FLIGHT CHECKS"
    info "Checking for required tools (docker-compose)..."
    if ! command -v docker-compose &> /dev/null; then
        error "docker-compose is not installed. Please install it to proceed."
    fi

    info "Checking for deployment target file: ${DEPLOYMENT_TARGET}"
    if [ ! -f "${DEPLOYMENT_TARGET}" ]; then
        error "Deployment target file not found: ${DEPLOYMENT_TARGET}. Aborting."
    fi

    success "All pre-flight checks passed."
    return 0
}

# Function to perform the actual deployment
deploy_services() {
    header "DEPLOYMENT"
    info "Creating backup of current deployment file: ${DEPLOYMENT_TARGET} -> ${BACKUP_FILE}"
    cp "${DEPLOYMENT_TARGET}" "${BACKUP_FILE}" || error "Failed to create backup."

    info "Pulling latest images and deploying services..."
    # Start spinner in background
    (docker-compose pull && docker-compose up -d --no-deps) &
    spinner
    wait $! || error "Deployment failed during docker-compose operation."

    success "Deployment complete."
    return 0
}

# Function to perform health checks
check_health() {
    header "HEALTH CHECKS"
    info "Waiting for services to stabilize (30 seconds)..."
    sleep 30

    info "Checking service health..."
    # Placeholder for actual health check logic
    # Example: Check if all containers are 'running'
    if docker-compose ps | grep -q 'Exit'; then
        warn "Some containers have exited. Check logs for details."
        return 1
    fi

    success "All services are healthy and running."
    return 0
}

# Main function to orchestrate the deployment
main() {
    header "STARTING PRODUCTION DEPLOYMENT"
    info "Log file: ${LOG_FILE}"

    # 1. Pre-flight Checks
    check_preflight

    # 2. Deployment
    deploy_services

    # 3. Health Checks
    if ! check_health; then
        warn "Health checks failed after deployment."
        rollback # Rollback on failed health check
    fi

    # 4. Final Success
    success "Deployment completed successfully."
    notify "SUCCESS"
}

# Execute main function
main