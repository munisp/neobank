#!/usr/bin/env bash

# restore_system.sh - Production-ready system restoration script with point-in-time recovery.

# --- Configuration ---
LOG_FILE="/var/log/restore_system_$(date +%Y%m%d_%H%M%S).log"
NOTIFICATION_HOOK="https://your.notification.hook/here" # Replace with actual Slack/Email hook
BACKUP_DIR="/mnt/backups"
RESTORE_TARGET_DIR="/var/www/html"
# The name of the service to restart after restoration (e.g., 'apache2', 'nginx', 'mysql')
SERVICE_NAME="your_service_name" 

# --- Error Handling and Environment Setup ---
set -euo pipefail

# Function to handle script exit (success or failure)
cleanup_and_exit() {
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        log_success "Script completed successfully."
        send_notification "SUCCESS: System Restoration Completed" "The system restoration to $RESTORE_TARGET_DIR was successful. Log: $LOG_FILE"
    else
        log_error "Script failed with exit code $exit_code."
        send_notification "FAILURE: System Restoration Failed" "The system restoration failed. Check log: $LOG_FILE"
    fi
    exit $exit_code
}
trap cleanup_and_exit EXIT

# --- Color Definitions ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Logging Functions ---
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo -e "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "${BLUE}$1${NC}"
}

log_success() {
    log "SUCCESS" "${GREEN}$1${NC}"
}

log_warning() {
    log "WARNING" "${YELLOW}$1${NC}"
}

log_error() {
    log "ERROR" "${RED}$1${NC}" >&2
}

# --- Utility Functions ---

# Function for sending notifications (Placeholder - requires implementation)
send_notification() {
    local subject="$1"
    local body="$2"
    log_info "Sending notification: $subject"
    # Example: Using curl for a generic webhook (e.g., Slack, Teams, custom API)
    if [[ "$NOTIFICATION_HOOK" != "https://your.notification.hook/here" ]]; then
        local payload="{\"text\":\"*$subject*\\n$body\"}"
        curl -s -X POST -H 'Content-type: application/json' --data "$payload" "$NOTIFICATION_HOOK" > /dev/null 2>&1
        if [ $? -ne 0 ]; then
            log_warning "Failed to send notification via webhook."
        fi
    else
        log_warning "Notification hook is not configured. Skipping notification."
    }
}

# Function to display progress (Placeholder)
progress_indicator() {
    local message="$1"
    # Simple progress indicator for non-interactive commands
    echo -ne "${YELLOW}* ${message}...${NC}\r"
}

# --- Pre-flight Checks ---
pre_flight_checks() {
    log_info "Starting pre-flight checks..."

    # Check for root privileges
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root."
        exit 1
    fi

    # Check if backup directory exists
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    # Check if restore target directory exists
    if [[ ! -d "$RESTORE_TARGET_DIR" ]]; then
        log_warning "Restore target directory not found: $RESTORE_TARGET_DIR. Attempting to create it."
        mkdir -p "$RESTORE_TARGET_DIR" || { log_error "Failed to create restore target directory: $RESTORE_TARGET_DIR"; exit 1; }
    fi

    log_success "Pre-flight checks passed."
}

# --- Core Logic ---

# Function to find the latest or specified backup file
find_backup() {
    local timestamp_filter="$1"
    local backup_file=""

    if [[ -z "$timestamp_filter" ]]; then
        log_info "Searching for the latest backup file in $BACKUP_DIR..."
        # Find the latest .tar.gz file based on modification time
        backup_file=$(find "$BACKUP_DIR" -type f -name "*.tar.gz" -printf "%T@ %p\n" | sort -n | tail -1 | cut -d' ' -f2-)
    else
        log_info "Searching for backup file matching point-in-time filter: $timestamp_filter"
        # Find the latest backup file whose name contains the timestamp filter (e.g., YYYYMMDD_HHMMSS)
        # This assumes backup files are named with a timestamp, e.g., 'backup_20251102_103000.tar.gz'
        backup_file=$(find "$BACKUP_DIR" -type f -name "*${timestamp_filter}*.tar.gz" | sort -r | head -n 1)
    fi

    if [[ -z "$backup_file" ]]; then
        log_error "No backup file found. Check BACKUP_DIR and timestamp filter."
        exit 1
    fi

    echo "$backup_file"
}

# Function to perform the restoration
perform_restore() {
    local backup_file="$1"
    local restore_dir="$RESTORE_TARGET_DIR"

    log_info "Starting restoration from: $backup_file"
    log_info "Restoring to: $restore_dir"

    # Idempotency check: If the target directory is not empty, prompt for confirmation or skip
    if [ "$(ls -A "$restore_dir")" ]; then
        log_warning "Target directory $restore_dir is NOT empty."
        read -r -p "Do you want to proceed with restoration (this will overwrite/add files)? (y/N): " response
        if [[ ! "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            log_info "Restoration aborted by user."
            exit 0
        fi
    fi

    # 1. Stop the service (Rollback point: Service is running)
    progress_indicator "Stopping service $SERVICE_NAME"
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME" || log_warning "Failed to stop service $SERVICE_NAME. Proceeding anyway."
        log_info "Service $SERVICE_NAME stopped."
    else
        log_info "Service $SERVICE_NAME is already inactive."
    fi

    # 2. Create a temporary rollback point (optional, but good practice)
    # For a true rollback, you would back up the current state before restoring.
    # For simplicity, this script assumes the backup is the desired state.
    # A simple rollback could be moving the current content to a temporary folder.
    local rollback_dir="${restore_dir}_pre_restore_$(date +%Y%m%d_%H%M%S)"
    if [ "$(ls -A "$restore_dir")" ]; then
        progress_indicator "Creating pre-restore rollback point at $rollback_dir"
        mv "$restore_dir" "$rollback_dir" || { log_error "Failed to create rollback point."; exit 1; }
        mkdir -p "$restore_dir" || { log_error "Failed to recreate target directory."; exit 1; }
        log_info "Pre-restore rollback point created at $rollback_dir"
    fi

    # 3. Extract the backup (Progress indicator here)
    progress_indicator "Extracting backup file $backup_file"
    # Use a verbose tar command to show progress (though it's not a true progress bar)
    if ! tar -xzf "$backup_file" -C "$restore_dir" --checkpoint=.1000; then
        log_error "Failed to extract backup file. Attempting rollback of target directory."
        # Rollback: If extraction fails, remove the partially extracted content and restore the pre-restore content
        rm -rf "$restore_dir"
        if [ -d "$rollback_dir" ]; then
            mv "$rollback_dir" "$restore_dir"
            log_error "Rollback successful: Restored pre-restore content from $rollback_dir."
        else
            log_error "Rollback failed: Pre-restore content not found. Target directory is now empty or partially restored."
        fi
        exit 1
    fi
    log_info "Backup extracted successfully."

    # 4. Start the service
    progress_indicator "Starting service $SERVICE_NAME"
    if systemctl start "$SERVICE_NAME"; then
        log_info "Service $SERVICE_NAME started."
    else
        log_warning "Failed to start service $SERVICE_NAME. Check logs."
        # No exit here, as the restoration itself was successful, only the service start failed.
    fi

    # 5. Final check
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "Restoration complete and service $SERVICE_NAME is running."
    else
        log_warning "Restoration complete, but service $SERVICE_NAME is NOT running. Manual check required."
    fi
}

# --- Main Execution ---
main() {
    log_info "--- System Restoration Script Started ---"

    # Parse arguments for point-in-time recovery
    local timestamp_filter=""
    if [[ $# -gt 0 ]]; then
        timestamp_filter="$1"
        log_info "Point-in-time recovery requested for timestamp: $timestamp_filter"
    fi

    pre_flight_checks

    local backup_file
    backup_file=$(find_backup "$timestamp_filter")

    log_info "Selected backup file: $backup_file"

    perform_restore "$backup_file"

    log_info "--- System Restoration Script Finished ---"
}

main "$@"