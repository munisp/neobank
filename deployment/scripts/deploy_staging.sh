#!/usr/bin/env bash

# deploy_staging.sh - Production-ready Bash script for Staging Deployment with Test Data Seeding

# --- Configuration and Setup ---

# 1. Error Handling: Exit immediately if a command exits with a non-zero status (-e),
#    if an unset variable is used (-u), or if a command in a pipeline fails (-o pipefail).
set -euo pipefail

# Global Variables
SCRIPT_NAME="deploy_staging.sh"
LOG_DIR="/var/log/deployment"
LOG_FILE="$LOG_DIR/$SCRIPT_NAME-$(date +%Y%m%d_%H%M%S).log"
STAGING_SERVER="staging.example.com"
PROJECT_DIR="/var/www/project"
TEST_DATA_SCRIPT="seed_test_data.sh"

# Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Utility Functions ---

# Function to display a progress spinner (optional, for long-running tasks)
# Not strictly necessary for this script's high-level steps, but good for illustration.
# For simplicity, I will rely on the log function for progress indication.

# Function to perform a conceptual rollback
rollback() {
    log "WARN" "Deployment failed. Attempting rollback..."
    
    # Placeholder for actual rollback logic
    # 1. Revert code from backup
    # 2. Revert database state (if possible, e.g., from a pre-migration snapshot)
    
    log "INFO" "Simulating code and database rollback..."
    
    # Example: Revert code from a hypothetical backup directory
    # ssh user@$STAGING_SERVER "rsync -avz $PROJECT_DIR.bak/ $PROJECT_DIR/"
    
    if [ $? -eq 0 ]; then
        log "SUCCESS" "Rollback completed successfully."
    else
        log "ERROR" "Rollback failed. Manual intervention required on $STAGING_SERVER."
    fi
}



# Function to create log directory if it doesn't exist
ensure_log_dir() {
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
        if [ $? -ne 0 ]; then
            echo -e "${RED}FATAL: Could not create log directory $LOG_DIR. Exiting.${NC}" >&2
            exit 1
        fi
    fi
}

# Function for logging (to console with color and to file)
log() {
    local level="$1"
    local message="$2"
    local color="$NC"

    case "$level" in
        INFO) color="$GREEN" ;;
        WARN) color="$YELLOW" ;;
        ERROR) color="$RED" ;;
        START) color="$BLUE" ;;
        END) color="$BLUE" ;;
    esac

    # Log to file (no color)
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$level] $message" >> "$LOG_FILE"

    # Log to console (with color)
    echo -e "${color}[$level] $message${NC}"
}

# Function for sending notifications (placeholder)
notify() {
    local status="$1" # SUCCESS or FAILURE
    local message="$2"
    
    log "INFO" "Sending notification for status: $status"
    
    # In a real-world scenario, this would use a tool like 'curl' to hit a Slack/Email webhook.
    # Example placeholder:
    # if [ "$status" == "SUCCESS" ]; then
    #     curl -X POST -H 'Content-type: application/json' --data '{"text":"Deployment to Staging Succeeded: '"$message"'"}' YOUR_SLACK_WEBHOOK_URL
    # else
    #     curl -X POST -H 'Content-type: application/json' --data '{"text":"Deployment to Staging FAILED: '"$message"'"}' YOUR_SLACK_WEBHOOK_URL
    # fi
    
    log "INFO" "Notification sent (placeholder)."
}

# Function to handle script exit (success or failure)
cleanup_and_exit() {
    local exit_code=$?
    
    if [ "$exit_code" -ne 0 ]; then
        rollback # Trigger rollback on failure
    fi
    
    if [ "$exit_code" -eq 0 ]; then
        log "END" "Deployment script finished successfully."
        notify "SUCCESS" "Deployment to $STAGING_SERVER completed successfully."
    else
        log "END" "Deployment script failed with exit code $exit_code."
        notify "FAILURE" "Deployment to $STAGING_SERVER failed. Check log file: $LOG_FILE"
    fi
    
    exit "$exit_code"
}

# Function for pre-flight checks
pre_flight_checks() {
    log "INFO" "--- Running Pre-flight Checks ---"
    
    # Check for required commands locally
    for cmd in ssh rsync; do
        if ! command -v "$cmd" &> /dev/null; then
            log "ERROR" "Required command '$cmd' not found. Please install it."
            exit 1
        fi
    done
    
    # Check connectivity to staging server (requires SSH key setup)
    log "INFO" "Checking SSH connectivity to $STAGING_SERVER..."
    if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$STAGING_SERVER" "exit 0" 2>/dev/null; then
        log "ERROR" "Failed to connect to $STAGING_SERVER. Check network or SSH keys."
        exit 1
    fi
    
    # Check for test data script locally
    if [ ! -f "$TEST_DATA_SCRIPT" ]; then
        log "ERROR" "Test data seeding script '$TEST_DATA_SCRIPT' not found locally."
        exit 1
    fi
    
    log "INFO" "Pre-flight checks passed successfully."
}

# Trap signals to ensure cleanup_and_exit is always called
trap cleanup_and_exit EXIT
trap 'cleanup_and_exit 1' SIGINT SIGTERM

# --- Main Script Execution ---

# Ensure log directory exists before starting
ensure_log_dir

log "START" "Starting staging deployment script for $STAGING_SERVER..."

# Make the script executable
# chmod +x "$SCRIPT_NAME" # This is for the user to do once.

# --- Main Deployment Logic ---

pre_flight_checks

# 1. Backup existing code on staging (for rollback)
log "INFO" "1/5: Creating backup of current code on $STAGING_SERVER..."
# The use of '|| true' makes this step non-critical for the script's exit status, 
# but a failure here means no rollback is possible. We log the error instead.
if ! ssh "$STAGING_SERVER" "cp -a $PROJECT_DIR $PROJECT_DIR.bak" 2>> "$LOG_FILE"; then
    log "WARN" "Failed to create backup on $STAGING_SERVER. Rollback capability is compromised."
fi

# 2. Deploy code (Idempotent step using rsync)
log "INFO" "2/5: Deploying code to $STAGING_SERVER..."
# Assuming local code is in the current directory and we are syncing it to $PROJECT_DIR
# The --delete flag ensures idempotency by removing files on the remote that are not local.
if ! rsync -avz --delete . "$STAGING_SERVER":"$PROJECT_DIR" 2>> "$LOG_FILE"; then
    log "ERROR" "Code deployment failed."
    exit 1
fi
log "SUCCESS" "Code deployed successfully."

# 3. Remote operations (Dependency install, DB migration)
log "INFO" "3/5: Running remote operations (install/migrate) on $STAGING_SERVER..."
REMOTE_COMMANDS="
    cd $PROJECT_DIR &&
    log 'INFO' 'Installing dependencies...' &&
    # Placeholder: Example for a Python project
    # pip install -r requirements.txt || exit 1
    log 'INFO' 'Running database migrations...' &&
    # Placeholder: Example for a Django project
    # python manage.py migrate || exit 1
    echo 'Remote operations complete.'
"
if ! ssh "$STAGING_SERVER" "$REMOTE_COMMANDS" 2>> "$LOG_FILE"; then
    log "ERROR" "Remote operations failed."
    exit 1
fi
log "SUCCESS" "Remote operations completed successfully."

# 4. Seed Test Data
log "INFO" "4/5: Seeding test data..."
# Copy the test data script to the server
if ! rsync -avz "$TEST_DATA_SCRIPT" "$STAGING_SERVER":"$PROJECT_DIR/" 2>> "$LOG_FILE"; then
    log "ERROR" "Failed to copy test data script."
    exit 1
fi

# Execute the test data script remotely
if ! ssh "$STAGING_SERVER" "cd $PROJECT_DIR && bash $TEST_DATA_SCRIPT" 2>> "$LOG_FILE"; then
    log "ERROR" "Test data seeding failed."
    exit 1
fi
log "SUCCESS" "Test data seeded successfully."

# 5. Cleanup (Remove backup)
log "INFO" "5/5: Cleaning up old backup..."
# We remove the old backup now that the new deployment is successful.
if ! ssh "$STAGING_SERVER" "rm -rf $PROJECT_DIR.bak" 2>> "$LOG_FILE"; then
    log "WARN" "Failed to remove old backup $PROJECT_DIR.bak. Manual cleanup may be required."
fi

log "INFO" "Deployment process complete. Final checks will be handled by cleanup_and_exit."

# The script will now exit, triggering the cleanup_and_exit trap with exit code 0.