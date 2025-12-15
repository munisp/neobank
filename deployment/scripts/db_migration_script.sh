#!/bin/bash

# ==============================================================================
# Database Migration Script with Backup, Rollback, and Notifications
# ==============================================================================

# --- Configuration ---
DB_NAME="your_database_name"
DB_USER="your_db_user"
DB_HOST="localhost"
MIGRATION_FILE="migration.sql"
LOG_FILE="/var/log/db_migration_$(date +%Y%m%d_%H%M%S).log"
BACKUP_DIR="/var/backups/db_migration"
MIGRATION_STATUS_FILE="/tmp/${DB_NAME}_migration_status" # For idempotency

# --- Color Codes ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Error Handling and Safety ---
set -euo pipefail

# Trap function to ensure cleanup and logging on exit
function cleanup {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_message "ERROR" "Script failed with exit code $exit_code."
        send_notification "FAILURE" "Database migration for $DB_NAME failed. Check log file: $LOG_FILE"
    else
        log_message "INFO" "Script finished successfully."
        send_notification "SUCCESS" "Database migration for $DB_NAME completed successfully."
    fi
    # Remove temporary status file on success or failure
    rm -f "$MIGRATION_STATUS_FILE"
}
trap cleanup EXIT

# --- Core Functions ---

# Function to log messages to console (with color) and file
function log_message {
    local level="$1" # INFO, WARN, ERROR, SUCCESS
    local message="$2"
    local color=""

    case "$level" in
        "INFO") color="$BLUE";;
        "WARN") color="$YELLOW";;
        "ERROR") color="$RED";;
        "SUCCESS") color="$GREEN";;
        *) color="$NC";;
    esac

    # Log to file (plain text)
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$level] $message" >> "$LOG_FILE"

    # Log to console (with color)
    echo -e "${color}[$level] $message${NC}" >&2
}

# Function to display a progress indicator
function progress_indicator {
    local message="$1"
    local duration="${2:-1}" # Default duration of 1 second
    local pid=$$
    local i=0
    local spin='-\|/'

    log_message "INFO" "$message"
    
    # Run in background
    (
        while kill -0 $pid 2>/dev/null; do
            i=$(( (i+1) % 4 ))
            echo -en "\r${BLUE}Processing... [${spin:$i:1}]${NC}"
            sleep 0.1
        done
    ) &
    SPINNER_PID=$!
    
    # Wait for the main process to finish its task, then kill spinner
    sleep "$duration" # Placeholder for actual task execution time
    kill $SPINNER_PID 2>/dev/null || true
    echo -en "\r" # Clear the spinner line
}

# Placeholder for sending notifications
function send_notification {
    local status="$1" # SUCCESS or FAILURE
    local message="$2"
    
    log_message "INFO" "Sending $status notification..."
    # In a real-world scenario, this would use 'curl' for Slack/Teams webhook
    # or 'mail' command for email.
    # Example:
    # if [ "$status" == "FAILURE" ]; then
    #     curl -X POST -H 'Content-type: application/json' --data '{"text":"Migration Failed: '$message'"}' $SLACK_WEBHOOK_URL
    # fi
    log_message "INFO" "Notification content: $message"
}

# Function to check for required dependencies and configuration
function pre_flight_checks {
    log_message "INFO" "Starting pre-flight checks..."
    
    # Check for required commands
    for cmd in mysql mysqldump; do
        if ! command -v "$cmd" &> /dev/null; then
            log_message "ERROR" "Required command '$cmd' not found. Please install it."
            exit 1
        fi
    done

    # Check for migration file existence
    if [ ! -f "$MIGRATION_FILE" ]; then
        log_message "ERROR" "Migration file '$MIGRATION_FILE' not found. Aborting."
        exit 1
    fi

    # Check for database connectivity (simplified check)
    if ! mysql -h "$DB_HOST" -u "$DB_USER" -e "SELECT 1;" "$DB_NAME" &> /dev/null; then
        log_message "ERROR" "Cannot connect to database '$DB_NAME' on '$DB_HOST' with user '$DB_USER'. Check credentials and connectivity."
        exit 1
    fi

    log_message "SUCCESS" "Pre-flight checks passed."
}

# Function to create a database backup
function create_backup {
    log_message "INFO" "Starting database backup for '$DB_NAME'..."
    
    mkdir -p "$BACKUP_DIR"
    local backup_file="$BACKUP_DIR/${DB_NAME}_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    progress_indicator "Dumping database to $backup_file" 2 # Simulate a 2-second dump
    
    if mysqldump -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" > "$backup_file"; then
        log_message "SUCCESS" "Database backup created successfully: $backup_file"
        echo "$backup_file" > "$MIGRATION_STATUS_FILE" # Store backup path for rollback
    else
        log_message "ERROR" "Database backup failed."
        exit 1
    fi
}

# Function to run the migration
function run_migration {
    log_message "INFO" "Applying migration from '$MIGRATION_FILE'..."
    
    progress_indicator "Executing SQL migration script" 3 # Simulate a 3-second migration
    
    if mysql -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" < "$MIGRATION_FILE"; then
        log_message "SUCCESS" "Migration applied successfully."
    else
        log_message "ERROR" "Migration failed. Initiating rollback..."
        rollback
        exit 1
    fi
}

# Function to rollback the migration
function rollback {
    log_message "WARN" "Starting rollback process..."
    
    if [ -f "$MIGRATION_STATUS_FILE" ]; then
        local backup_file=$(cat "$MIGRATION_STATUS_FILE")
        
        if [ -f "$backup_file" ]; then
            log_message "INFO" "Restoring database from backup: $backup_file"
            
            progress_indicator "Restoring database from backup" 4 # Simulate a 4-second restore
            
            if mysql -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" < "$backup_file"; then
                log_message "SUCCESS" "Rollback completed successfully. Database restored to pre-migration state."
            else
                log_message "ERROR" "CRITICAL: Database restore failed. Manual intervention required. Backup file: $backup_file"
                exit 1
            fi
        else
            log_message "ERROR" "CRITICAL: Backup file not found at '$backup_file'. Manual intervention required."
            exit 1
        fi
    else
        log_message "ERROR" "CRITICAL: No backup file path found. Cannot rollback. Manual intervention required."
        exit 1
    fi
}

# Function to check for idempotency
function check_idempotency {
    if [ -f "$MIGRATION_STATUS_FILE" ]; then
        log_message "WARN" "Migration status file found at '$MIGRATION_STATUS_FILE'. This indicates a previous run failed or is still in progress."
        log_message "WARN" "To prevent running the migration twice, please resolve the previous issue or manually remove the status file."
        log_message "ERROR" "Aborting to maintain idempotency."
        exit 1
    fi
}

# --- Main Execution ---

function main {
    log_message "INFO" "Starting database migration script."
    
    # 1. Idempotency Check
    check_idempotency
    
    # 2. Pre-flight Checks
    pre_flight_checks
    
    # 3. Backup
    create_backup
    
    # 4. Migration
    run_migration
    
    log_message "SUCCESS" "Migration process finished."
}

main
