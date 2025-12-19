#!/usr/bin/env bash

# Production-Ready Health Check Script
# Requirements: set -euo pipefail, colored output, logging, pre-flight checks,
# progress indicators, notification placeholders, idempotent.

# 1. Error Handling and Safety
set -euo pipefail

# 2. Configuration
readonly LOG_FILE="/var/log/health_check_$(date +\%Y\%m\%d_\%H\%M\%S).log"
readonly NOTIFICATION_EMAIL="ops@example.com"
readonly NOTIFICATION_SLACK_WEBHOOK="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
readonly DB_HOST="localhost"
readonly DB_PORT="5432"
readonly DB_USER="health_checker"
readonly REDIS_HOST="localhost"
readonly REDIS_PORT="6379"
readonly API_ENDPOINT="http://localhost:8080/health"
readonly API_EXPECTED_STATUS=200

# 3. Colored Output and Logging Functions
# ANSI Color Codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Function to log messages to file and stdout
log() {
    local type="$1"
    local message="$2"
    local timestamp
    timestamp=$(date +"\%Y-\%m-\%d \%H:\%M:\%S")
    echo -e "${timestamp} [${type}] ${message}" | tee -a "${LOG_FILE}"
}

# Function for success messages
success() {
    log "SUCCESS" "${GREEN}[OK]${NC} $1"
}

# Function for error messages
error() {
    log "ERROR" "${RED}[FAIL]${NC} $1"
    EXIT_CODE=1
}

# Function for warning messages
warn() {
    log "WARN" "${YELLOW}[WARN]${NC} $1"
}

# Function for informational messages
info() {
    log "INFO" "${BLUE}[INFO]${NC} $1"
}

# 4. Progress Indicator (Simple echo)
progress() {
    echo -n "-> $1... "
}

# 5. Pre-flight Checks
pre_flight_checks() {
    info "Starting pre-flight checks..."
    local required_commands=("curl" "psql" "redis-cli")
    local missing_commands=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_commands+=("$cmd")
        fi
    done

    if [ ${#missing_commands[@]} -ne 0 ]; then
        error "Missing required commands: ${missing_commands[*]}. Please install them."
        exit 1
    fi
    success "All required commands found."
}

# 6. Service Check Functions

# Check API Endpoint
check_api() {
    progress "Checking API endpoint: ${API_ENDPOINT}"
    local http_code
    http_code=$(curl -s -o /dev/null -w "\%{http_code}" -X GET -H "Accept: application/json" --connect-timeout 5 --max-time 10 "${API_ENDPOINT}")

    if [ "$http_code" -eq "${API_EXPECTED_STATUS}" ]; then
        success "API check passed (Status: ${http_code})."
    else
        error "API check failed (Status: ${http_code}, Expected: ${API_EXPECTED_STATUS})."
    fi
}

# Check Database Connectivity (PostgreSQL example)
check_database() {
    progress "Checking Database connectivity (PostgreSQL)"
    # Note: psql requires the PGPASSWORD environment variable to be set for non-interactive login.
    # For a production script, consider using a .pgpass file or a secure secret manager.
    # For this example, we'll use a simple connection check.
    if PGPASSWORD="${PGPASSWORD:-CHANGE_ME_DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -c "SELECT 1;" > /dev/null 2>&1; then
        success "Database check passed."
    else
        error "Database check failed. Check credentials, host (${DB_HOST}:${DB_PORT}), and user (${DB_USER})."
    fi
}

# Check Redis Connectivity
check_redis() {
    progress "Checking Redis connectivity"
    if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping | grep -q PONG; then
        success "Redis check passed."
    else
        error "Redis check failed. Check host (${REDIS_HOST}:${REDIS_PORT})."
    fi
}

# 7. Notification Function (Placeholder)
send_notification() {
    local status="$1"
    local subject="Health Check ${status}"
    local body="The health check completed with status: ${status}. See log file: ${LOG_FILE}"

    info "Sending notification for status: ${status}..."

    # Email Notification Placeholder (requires 'mail' or 'sendmail' command)
    # echo "${body}" | mail -s "${subject}" "${NOTIFICATION_EMAIL}"
    warn "Email notification is a placeholder. Uncomment and configure 'mail' command to enable."

    # Slack Notification Placeholder (requires 'curl')
    # curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"${subject}\n${body}\"}" "${NOTIFICATION_SLACK_WEBHOOK}" > /dev/null 2>&1
    warn "Slack notification is a placeholder. Uncomment and configure 'curl' and webhook to enable."

    info "Notification process finished."
}

# 8. Main Execution
main() {
    local EXIT_CODE=0
    info "--- Starting Health Check Script ---"
    info "Log file: ${LOG_FILE}"

    # 4. Pre-flight checks
    pre_flight_checks

    # 6. Rollback capability note (Idempotency)
    warn "This is a read-only health check script, which is inherently idempotent."
    warn "No rollback is necessary as no state changes are made."

    # Perform checks
    check_api
    check_database
    check_redis

    # Final Status Report
    if [ "${EXIT_CODE}" -eq 0 ]; then
        success "All health checks passed successfully."
        send_notification "SUCCESS"
    else
        error "One or more health checks failed. Review the log file for details."
        send_notification "FAILURE"
    fi

    info "--- Health Check Script Finished ---"
    return "${EXIT_CODE}"
}

# Execute main function
main
