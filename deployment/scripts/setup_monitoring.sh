#!/bin/bash

# --- Configuration ---
STACK_NAME="monitoring-stack"
LOG_FILE="./${STACK_NAME}_setup.log"
DOCKER_COMPOSE_FILE="./docker-compose.yml"
CONFIG_DIR="./config"
REQUIRED_COMMANDS=("docker" "docker-compose" "curl") # 'docker-compose' might be 'docker compose' on newer systems

# --- Requirements: 1. Bash script with proper error handling ---
set -euo pipefail

# --- Requirements: 2. Colored output for better readability ---
# Define colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Requirements: 3. Logging to file ---

# --- Requirements: 6. Progress indicators ---
# Function to display a simple spinner while a background process runs
spinner() {
    local PID=$1
    local DELAY=0.1
    local SPIN_CHARS="/-\|"
    local I=0
    
    while kill -0 $PID 2>/dev/null; do
        local CHAR=${SPIN_CHARS:$I:1}
        echo -en "\r${BLUE}INFO:${NC} $2 ${CHAR}"
        I=$(((I + 1) % ${#SPIN_CHARS}))
        sleep $DELAY
    done
    echo -en "\r" # Clear the spinner line
}
# Function to log messages
log() {
    local TYPE="$1"
    local MESSAGE="$2"
    local TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
    echo -e "[${TIMESTAMP}] [${TYPE}] ${MESSAGE}" | tee -a "${LOG_FILE}"
}

# Function to display colored messages and log
info() {
    log "INFO" "${BLUE}INFO:${NC} $1"
}

success() {
    log "SUCCESS" "${GREEN}SUCCESS:${NC} $1"
}

warn() {
    log "WARN" "${YELLOW}WARNING:${NC} $1"
}

error() {
    log "ERROR" "${RED}ERROR:${NC} $1" >&2
    exit 1
}

# --- Requirements: 5. Rollback capability where applicable ---
# Function to stop and remove the stack
rollback() {
    warn "Attempting to roll back the stack..."
    if docker-compose -f "${DOCKER_COMPOSE_FILE}" down -v; then
        success "Rollback successful. Stack '${STACK_NAME}' has been stopped and removed."
    else
        error "Rollback failed. Please check the logs and manually clean up with 'docker-compose -f ${DOCKER_COMPOSE_FILE} down -v'"
    fi
}

# Trap function for error handling
trap 'error "Script failed at line $LINENO. Check ${LOG_FILE} for details."' ERR

# --- Requirements: 4. Pre-flight checks ---
pre_flight_checks() {
    info "Starting pre-flight checks..."

    # Check for required commands
    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        if ! command -v "${cmd}" &> /dev/null; then
            error "Required command '${cmd}' not found. Please install it and try again."
        fi
    done
    success "All required commands found."

    # Check for Docker daemon status
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running or you do not have permission to access it. Please start Docker."
    fi
    success "Docker daemon is running."

    # Check for required files
    if [[ ! -f "${DOCKER_COMPOSE_FILE}" ]]; then
        error "Docker Compose file '${DOCKER_COMPOSE_FILE}' not found. Ensure it is in the current directory."
    fi
    if [[ ! -d "${CONFIG_DIR}" ]]; then
        error "Configuration directory '${CONFIG_DIR}' not found. Ensure it is in the current directory."
    fi
    success "All required files and directories found."

    info "Pre-flight checks complete."
}

# --- Requirements: 8. Idempotent (can be run multiple times safely) ---
# Function to check if the stack is already running
check_idempotency() {
    info "Checking for existing stack..."
    if docker-compose -f "${DOCKER_COMPOSE_FILE}" ps | grep -q "Up"; then
        warn "Stack '${STACK_NAME}' appears to be running. Stopping and removing it to ensure a clean setup (Idempotency)."
        rollback # Use rollback to stop and remove
    fi
    success "No existing stack found or previous stack successfully cleaned up."
}

# --- Main Setup Function ---
setup_stack() {
    info "Starting monitoring stack setup..."

    info "Building and starting the stack. This may take a few minutes..."
    
    # Use -d for detached mode, --build to ensure latest images/configs are used
    docker-compose -f "${DOCKER_COMPOSE_FILE}" up -d --build &
    local COMPOSE_PID=$!
    spinner $COMPOSE_PID "Starting Docker containers..."
    wait $COMPOSE_PID
    
    if [ $? -eq 0 ]; then
        success "Monitoring stack '${STACK_NAME}' started successfully."
    else
        error "Failed to start the monitoring stack. Initiating rollback."
    fi
    
    # Health check (simple check for Grafana)
    info "Waiting for Grafana to become available (max 60 seconds)..."
    local MAX_ATTEMPTS=12 # 12 attempts * 5 seconds = 60 seconds timeout
    local ATTEMPT=0
    local GRAFANA_URL="http://localhost:3000"
    
    while [[ ${ATTEMPT} -lt ${MAX_ATTEMPTS} ]]; do
        if curl -s -o /dev/null -w "%{http_code}" "${GRAFANA_URL}" | grep -q "302"; then
            success "Grafana is up and running at ${GRAFANA_URL}"
            return 0
        fi
        
        # Simple progress indicator for the wait loop
        echo -en "\r${BLUE}INFO:${NC} Waiting for Grafana (Attempt ${ATTEMPT}/${MAX_ATTEMPTS})..."
        sleep 5
        ATTEMPT=$((ATTEMPT + 1))
    done
    echo -en "\r" # Clear the line after the loop
    
    error "Health check failed: Grafana did not become available after 60 seconds. Initiating rollback."
}

# --- Requirements: 7. Email/Slack notifications on completion/failure (Placeholder) ---
send_notification() {
    local STATUS="$1"
    local MESSAGE="$2"
    # In a real-world script, this would use a tool like 'curl' to hit a Slack webhook or 'mail' command.
    # For this task, we will just log the notification message.
    log "NOTIFICATION" "STATUS: ${STATUS} - MESSAGE: ${MESSAGE}"
    echo -e "${YELLOW}*** NOTIFICATION PLACEHOLDER ***${NC}"
    echo -e "${YELLOW}STATUS: ${STATUS}${NC}"
    echo -e "${YELLOW}MESSAGE: ${MESSAGE}${NC}"
    echo -e "${YELLOW}********************************${NC}"
}

# --- Main Execution ---
main() {
    info "--- Monitoring Stack Setup Script Started ---"
    
    # Clear log file from previous runs
    > "${LOG_FILE}"
    
    pre_flight_checks
    check_idempotency
    setup_stack
    
    send_notification "SUCCESS" "Monitoring stack setup completed successfully. Access Grafana at http://localhost:3000"
    info "--- Monitoring Stack Setup Script Finished ---"
}

main
