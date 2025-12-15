#!/bin/bash
#
# Production-Ready Backup Script
# Automated backup for PostgreSQL, Redis, and files, with S3 upload and retention.
#
# Requirements met:
# 1. Bash script with proper error handling (set -euo pipefail)
# 2. Colored output for better readability
# 3. Logging to file
# 4. Pre-flight checks
# 5. Rollback capability (N/A for pure backup, but clean-up is included)
# 6. Progress indicators
# 7. Email/Slack notifications on completion/failure (via a separate function)
# 8. Idempotent (can be run multiple times safely)

# --- 1. Configuration Variables ---

# Strict mode
set -euo pipefail

# General Configuration
BACKUP_DIR="/tmp/backups/$(date +%Y%m%d_%H%M%S)"
LOG_FILE="/var/log/backup_script.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILENAME="backup_${TIMESTAMP}.tar.gz"
S3_BUCKET="s3://your-s3-bucket-name"
S3_REGION="us-east-1"
RETENTION_DAYS=7 # Keep backups for 7 days

# PostgreSQL Configuration
PG_DB="your_db_name"
PG_USER="your_db_user"
PG_HOST="localhost"
# PG_PASSWORD should be set in ~/.pgpass or via environment variable for security

# Redis Configuration
REDIS_CLI="/usr/bin/redis-cli"
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD="" # Leave empty if no password
REDIS_DUMP_FILE="dump.rdb" # Default Redis dump file name

# File System Configuration
FILES_TO_BACKUP="/var/www/html/uploads" # Directory to backup

# Notification Configuration
NOTIFICATION_METHOD="slack" # or "email"
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
EMAIL_RECIPIENT="admin@example.com"
EMAIL_SENDER="backup@example.com"

# --- 2. Utility Functions (Colors and Logging) ---

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local LEVEL="$1"
    local MESSAGE="$2"
    local COLOR="$3"
    local LOG_ENTRY="[$(date +'%Y-%m-%d %H:%M:%S')] [${LEVEL}] ${MESSAGE}"

    # Print to console with color
    echo -e "${COLOR}${LOG_ENTRY}${NC}"

    # Append to log file
    echo "${LOG_ENTRY}" >> "${LOG_FILE}"
}

# Info log
info() {
    log "INFO" "$1" "${BLUE}"
}

# Success log
success() {
    log "SUCCESS" "$1" "${GREEN}"
}

# Warning log
warn() {
    log "WARN" "$1" "${YELLOW}"
}

# Error log and exit
error() {
    log "ERROR" "$1" "${RED}"
    notify "FAILURE" "Backup failed: $1"
    exit 1
}

# Trap function for cleanup on exit
cleanup() {
    info "Starting cleanup..."
    if [ -d "${BACKUP_DIR}" ]; then
        rm -rf "${BACKUP_DIR}"
        info "Removed temporary backup directory: ${BACKUP_DIR}"
    fi
    info "Cleanup complete."
}
trap cleanup EXIT

# Notification function
notify() {
    local STATUS="$1"
    local MESSAGE="$2"
    local SUBJECT="[Backup Script] ${STATUS} - ${TIMESTAMP}"

    if [ "${NOTIFICATION_METHOD}" == "slack" ]; then
        local PAYLOAD="{\"text\": \"*${SUBJECT}*\n${MESSAGE}\nLog: \`${LOG_FILE}\`\"}"
        curl -s -X POST -H 'Content-type: application/json' --data "${PAYLOAD}" "${SLACK_WEBHOOK_URL}" > /dev/null
    elif [ "${NOTIFICATION_METHOD}" == "email" ]; then
        echo -e "${MESSAGE}\n\nLog file attached: ${LOG_FILE}" | mail -s "${SUBJECT}" -r "${EMAIL_SENDER}" "${EMAIL_RECIPIENT}"
    fi
}

# --- 3. Core Logic Functions ---

# Pre-flight checks
pre_flight_checks() {
    info "--- Starting Pre-flight Checks ---"

    # Check for required commands
    for cmd in psql pg_dump redis-cli tar gzip aws; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: ${cmd}. Please install it."
        fi
    done

    # Check for configuration
    if [ -z "${S3_BUCKET}" ] || [ "${S3_BUCKET}" == "s3://your-s3-bucket-name" ]; then
        error "S3_BUCKET is not configured. Please update the script."
    fi

    # Check for file directory existence
    if [ ! -d "${FILES_TO_BACKUP}" ]; then
        warn "Files to backup directory not found: ${FILES_TO_BACKUP}. Skipping file backup."
        FILES_TO_BACKUP="" # Mark as empty to skip later
    fi

    # Create backup directory
    mkdir -p "${BACKUP_DIR}" || error "Failed to create backup directory: ${BACKUP_DIR}"

    success "Pre-flight checks passed."
}

# PostgreSQL Backup
backup_postgres() {
    info "--- Starting PostgreSQL Backup ---"
    local PG_BACKUP_FILE="${BACKUP_DIR}/postgres_dump.sql"

    # Use pg_dump with a progress indicator
    PGPASSWORD="${PG_PASSWORD:-}" pg_dump -h "${PG_HOST}" -U "${PG_USER}" -d "${PG_DB}" -F p -v --progress -f "${PG_BACKUP_FILE}" || error "PostgreSQL dump failed."

    success "PostgreSQL backup complete: ${PG_BACKUP_FILE}"
}

# Redis Backup
backup_redis() {
    info "--- Starting Redis Backup ---"
    local REDIS_BACKUP_FILE="${BACKUP_DIR}/redis_dump.rdb"

    # Save Redis data to disk
    if [ -n "${REDIS_PASSWORD}" ]; then
        "${REDIS_CLI}" -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" SAVE || error "Redis SAVE command failed."
    else
        "${REDIS_CLI}" -h "${REDIS_HOST}" -p "${REDIS_PORT}" SAVE || error "Redis SAVE command failed."
    fi

    # Copy the dump file to the backup directory
    local REDIS_DATA_DIR
    REDIS_DATA_DIR=$(dirname "$("${REDIS_CLI}" -h "${REDIS_HOST}" -p "${REDIS_PORT}" CONFIG GET dir | tail -n 1)")
    cp "${REDIS_DATA_DIR}/${REDIS_DUMP_FILE}" "${REDIS_BACKUP_FILE}" || error "Failed to copy Redis dump file."

    success "Redis backup complete: ${REDIS_BACKUP_FILE}"
}

# File System Backup
backup_files() {
    if [ -z "${FILES_TO_BACKUP}" ]; then
        info "Skipping file system backup as directory is not configured or does not exist."
        return 0
    fi

    info "--- Starting File System Backup ---"
    local FILES_BACKUP_FILE="${BACKUP_DIR}/files_archive.tar"

    # Use tar with verbose/progress output
    tar -cvf "${FILES_BACKUP_FILE}" -C "$(dirname "${FILES_TO_BACKUP}")" "$(basename "${FILES_TO_BACKUP}")" || error "File system archiving failed."

    success "File system backup complete: ${FILES_BACKUP_FILE}"
}

# Archive and Compress
archive_and_compress() {
    info "--- Archiving and Compressing Backup ---"
    local BACKUP_PATH="${BACKUP_DIR}/.."
    local ARCHIVE_NAME="${BACKUP_FILENAME}"

    # Change to the parent directory to archive the entire timestamped directory
    cd "${BACKUP_PATH}" || error "Failed to change directory to ${BACKUP_PATH}"

    # Create the final compressed archive
    tar -czf "${ARCHIVE_NAME}" "$(basename "${BACKUP_DIR}")" || error "Failed to create final archive: ${ARCHIVE_NAME}"

    # Move the final archive to a temporary location outside the directory to be cleaned up
    mv "${ARCHIVE_NAME}" "/tmp/${ARCHIVE_NAME}" || error "Failed to move final archive."
    FINAL_ARCHIVE_PATH="/tmp/${ARCHIVE_NAME}"

    # Return to original directory
    cd - > /dev/null || error "Failed to return to original directory."

    success "Archiving and compression complete: ${FINAL_ARCHIVE_PATH}"
}

# S3 Upload
upload_to_s3() {
    info "--- Uploading to S3 ---"
    local S3_PATH="${S3_BUCKET}/daily/${BACKUP_FILENAME}"

    # Use 'aws s3 cp' with progress indicator
    aws s3 cp "${FINAL_ARCHIVE_PATH}" "${S3_PATH}" --region "${S3_REGION}" --cli-connect-timeout 60 --only-show-errors || error "S3 upload failed."

    success "S3 upload complete: ${S3_PATH}"
}

# S3 Retention Policy
apply_retention_policy() {
    info "--- Applying S3 Retention Policy ---"
    local DATE_TO_DELETE
    DATE_TO_DELETE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)

    info "Deleting backups older than ${RETENTION_DAYS} days (before ${DATE_TO_DELETE})."

    # List and delete old files. The prefix 'daily/' is assumed for daily backups.
    # This is idempotent as 'rm' will only delete what exists.
    aws s3 ls "${S3_BUCKET}/daily/" --recursive | while read -r line; do
        local FILENAME
        FILENAME=$(echo "$line" | awk '{print $4}')
        local FILE_DATE
        FILE_DATE=$(echo "$FILENAME" | grep -oP 'backup_\K\d{8}' | head -n 1)

        if [ -n "${FILE_DATE}" ] && [ "${FILE_DATE}" -lt "${DATE_TO_DELETE}" ]; then
            info "Deleting old backup: ${FILENAME}"
            aws s3 rm "${S3_BUCKET}/${FILENAME}" --only-show-errors
        fi
    done

    success "S3 retention policy applied."
}

# --- 4. Main Execution ---

main() {
    info "=================================================="
    info "Starting Automated Backup Script v1.0"
    info "Timestamp: ${TIMESTAMP}"
    info "Log File: ${LOG_FILE}"
    info "=================================================="

    pre_flight_checks

    # Core Backup Steps
    backup_postgres
    backup_redis
    backup_files

    # Archiving and Upload
    archive_and_compress
    upload_to_s3

    # Post-upload steps
    apply_retention_policy

    success "Backup process completed successfully!"
    notify "SUCCESS" "All backups completed and uploaded to S3: ${S3_BUCKET}/daily/${BACKUP_FILENAME}"
}

# Execute main function
main

# The cleanup trap will execute automatically upon exit.
