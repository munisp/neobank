#!/bin/bash

# ==============================================================================
# Script: cert_renewal.sh
# Description: Automated Let's Encrypt certificate renewal with Nginx reload.
# Requirements: certbot, nginx, root/sudo privileges.
# ==============================================================================

# --- Configuration ---
NOTIFICATION_EMAIL="admin@example.com" # Replace with your email
SLACK_WEBHOOK="" # Replace with your Slack webhook URL
NOTIFICATION_ENABLED="false" # Set to 'true' to enable notifications

BACKUP_DIR="/var/backups/nginx_config"
BACKUP_FILE="${BACKUP_DIR}/nginx_config_$(date +%Y%m%d_%H%M%S).tar.gz"
LAST_BACKUP_FILE="" # To store the path of the last successful backup for rollback
SCRIPT_NAME=$(basename "$0")
LOG_FILE="/var/log/${SCRIPT_NAME%.*}.log"
NGINX_SERVICE="nginx"
CERTBOT_CMD="certbot"
# Optional: Set to 'true' to enable dry-run for certbot
DRY_RUN="false"

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Strict Mode and Trap ---
# -e: Exit immediately if a command exits with a non-zero status.
# -u: Treat unset variables as an error.
# -o pipefail: Exit status of a pipeline is the status of the last command that exited with a non-zero status.
set -euo pipefail

# --- Logging and Output Functions ---

# Function to log messages to file and console
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo -e "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

# Colored output functions
success() {
    log "SUCCESS" "${GREEN}$1${NC}"
}

info() {
    log "INFO" "${BLUE}$1${NC}"
}

warn() {
    log "WARN" "${YELLOW}$1${NC}"
}

error() {
    log "ERROR" "${RED}$1${NC}"
    # Exit on error
    exit 1
}

# Function to display progress indicator
progress() {
    local message="$1"
    printf "${BLUE}>>> %s...${NC}\n" "$message"
}

# --- Trap for Exit ---
# Function to be executed on EXIT, regardless of success or failure
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        error "Script failed with exit code $exit_code. Check logs in $LOG_FILE for details."
        notify_failure "Certificate renewal script failed."
    else
        success "Script finished successfully."
        notify_success "Certificate renewal script completed successfully."
    fi
}
trap cleanup EXIT

# --- Notification Stubs ---
notify_success() {
    local subject="SUCCESS: $SCRIPT_NAME completed successfully"
    local body="The certificate renewal script completed successfully at $(date).
Log file: $LOG_FILE"

    info "Notification: Success notification stub called."
    if [ "$NOTIFICATION_ENABLED" = "true" ]; then
        # Example: Sending email via 'mail' command (requires mailutils/postfix)
        # echo "$body" | mail -s "$subject" "$NOTIFICATION_EMAIL"

        # Example: Sending to Slack via webhook (requires 'curl')
        # if [ -n "$SLACK_WEBHOOK" ]; then
        #     curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"$subject\n$body\"}" "$SLACK_WEBHOOK"
        # fi
        info "Notification sent (stub)."
    fi
}

notify_failure() {
    local subject="FAILURE: $SCRIPT_NAME failed"
    local body="The certificate renewal script failed at $(date).
Check the logs in $LOG_FILE for details.
Error message: $1"

    info "Notification: Failure notification stub called."
    if [ "$NOTIFICATION_ENABLED" = "true" ]; then
        # Example: Sending email via 'mail' command (requires mailutils/postfix)
        # echo "$body" | mail -s "$subject" "$NOTIFICATION_EMAIL"

        # Example: Sending to Slack via webhook (requires 'curl')
        # if [ -n "$SLACK_WEBHOOK" ]; then
        #     curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"$subject\n$body\"}" "$SLACK_WEBHOOK"
        # fi
        info "Notification sent (stub)."
    fi
}

# --- Main Logic ---

# Function to check for required commands
check_dependencies() {
    progress "Checking required dependencies ($CERTBOT_CMD, $NGINX_SERVICE)"
    if ! command -v "$CERTBOT_CMD" &> /dev/null; then
        error "$CERTBOT_CMD could not be found. Please install it."
    fi
    if ! command -v "systemctl" &> /dev/null; then
        error "systemctl could not be found. This script requires systemd."
    fi
    success "Dependencies check passed."
}

# Function to check if running as root
check_root() {
    progress "Checking user privileges"
    if [ "$EUID" -ne 0 ]; then
        error "Please run as root or using sudo."
    fi
    success "Root privileges confirmed."
}

# Function to backup Nginx configuration
backup_nginx_config() {
    progress "Backing up Nginx configuration"
    mkdir -p "$BACKUP_DIR"
    if tar -czf "$BACKUP_FILE" /etc/nginx; then
        LAST_BACKUP_FILE="$BACKUP_FILE"
        success "Nginx configuration backed up to $LAST_BACKUP_FILE"
    else
        error "Failed to create Nginx configuration backup."
    fi
}

# Function to rollback Nginx configuration
rollback_nginx_config() {
    warn "Attempting to rollback Nginx configuration from $LAST_BACKUP_FILE"
    if [ -n "$LAST_BACKUP_FILE" ] && [ -f "$LAST_BACKUP_FILE" ]; then
        # Stop Nginx before restoring
        info "Stopping Nginx before rollback..."
        systemctl stop "$NGINX_SERVICE" || warn "Could not stop Nginx. Proceeding with rollback."

        # Restore the backup
        if tar -xzf "$LAST_BACKUP_FILE" -C /; then
            success "Nginx configuration successfully rolled back."
            # Try to start Nginx again
            info "Attempting to start Nginx after rollback..."
            systemctl start "$NGINX_SERVICE" || error "Failed to start Nginx after rollback. Manual intervention required."
        else
            error "Failed to restore Nginx configuration from $LAST_BACKUP_FILE. Manual intervention required."
        fi
    else
        error "No valid backup file found for rollback. Manual intervention required."
    fi
}

# Function to test and reload Nginx
reload_nginx() {
    progress "Testing Nginx configuration"
    if ! nginx -t; then
        error "Nginx configuration test failed. Attempting rollback."
        rollback_nginx_config
        error "Nginx configuration test failed even after rollback. Manual intervention required."
    fi
    success "Nginx configuration test passed."

    progress "Reloading Nginx service"
    if systemctl reload "$NGINX_SERVICE"; then
        success "Nginx service reloaded successfully."
    else
        error "Failed to reload Nginx service. Attempting rollback."
        rollback_nginx_config
        error "Nginx service failed to reload even after rollback. Manual intervention required."
    fi
}

# Function to renew certificates
renew_certificates() {
    local renew_cmd="$CERTBOT_CMD renew --nginx --non-interactive"
    local certbot_log_output

    if [ "$DRY_RUN" = "true" ]; then
        warn "DRY-RUN mode is enabled. No actual changes will be made."
        renew_cmd="$renew_cmd --dry-run"
    fi

    progress "Running certificate renewal command: $renew_cmd"
    
    # Execute certbot and capture output for logging
    if certbot_log_output=$($renew_cmd 2>&1); then
        info "Certbot output:\n$certbot_log_output"
        if echo "$certbot_log_output" | grep -q "No renewals were attempted"; then
            warn "Certificates are not due for renewal. Nginx will not be reloaded."
            return 1 # Indicate no renewal happened
        elif echo "$certbot_log_output" | grep -q "The following certificates were renewed"; then
            success "Certificate renewal successful."
            return 0 # Indicate renewal happened
        else
            # This case covers successful runs where no renewal was needed, but certbot didn't explicitly say "No renewals were attempted"
            # It's safer to assume success if the command returned 0, but we'll check for the "renewed" message to decide on Nginx reload.
            warn "Certbot ran successfully, but renewal status is ambiguous. Assuming no renewal needed."
            return 1
        fi
    else
        error "Certificate renewal failed. Certbot output:\n$certbot_log_output"
    fi
}

main() {
    info "Starting $SCRIPT_NAME at $(date)"
    info "Log file: $LOG_FILE"

    # Phase 1: Pre-flight Checks
    check_root
    check_dependencies

    # Phase 2: Certificate Renewal
    if renew_certificates; then
        # Renewal happened, proceed with Nginx backup and reload
        info "Renewal detected. Proceeding with Nginx update."
        
        # Backup Nginx config before attempting reload
        backup_nginx_config

        # Reload Nginx
        reload_nginx
    else
        info "No certificates were renewed. Skipping Nginx reload."
    fi

    info "Script execution complete."
}

# Execute main function
main "$@"