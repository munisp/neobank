-- Event Store Schema for TigerBeetle-PostgreSQL Synchronization
-- Migration: 001_create_event_store
-- Date: 2025-10-31
-- Purpose: Create event sourcing infrastructure for distributed transaction coordination

-- ============================================================================
-- EVENTS TABLE - Core event store
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Aggregate information
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    
    -- Event information
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Versioning for optimistic locking
    version INTEGER NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Causality tracking
    correlation_id UUID,
    causation_id UUID,
    
    -- User context
    user_id VARCHAR(255),
    
    -- System information
    service_name VARCHAR(100),
    service_version VARCHAR(50),
    
    -- Ensure version uniqueness per aggregate
    CONSTRAINT events_aggregate_version_unique UNIQUE(aggregate_id, version)
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

-- Query by aggregate (most common query pattern)
CREATE INDEX idx_events_aggregate ON events(aggregate_id, version);

-- Query by event type
CREATE INDEX idx_events_type ON events(event_type);

-- Query by timestamp (for time-based queries)
CREATE INDEX idx_events_created ON events(created_at DESC);

-- Query by correlation (for distributed tracing)
CREATE INDEX idx_events_correlation ON events(correlation_id) WHERE correlation_id IS NOT NULL;

-- Query by user (for audit trails)
CREATE INDEX idx_events_user ON events(user_id) WHERE user_id IS NOT NULL;

-- Composite index for aggregate type + created_at (for projections)
CREATE INDEX idx_events_aggregate_type_created ON events(aggregate_type, created_at DESC);

-- GIN index on event_data for JSONB queries
CREATE INDEX idx_events_data_gin ON events USING GIN (event_data);

-- GIN index on metadata for JSONB queries
CREATE INDEX idx_events_metadata_gin ON events USING GIN (metadata);

-- ============================================================================
-- SNAPSHOTS TABLE - For performance optimization
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Only keep latest snapshot per aggregate
    CONSTRAINT snapshots_aggregate_unique UNIQUE(aggregate_id)
);

CREATE INDEX idx_snapshots_aggregate ON event_snapshots(aggregate_id);
CREATE INDEX idx_snapshots_type ON event_snapshots(aggregate_type);

-- ============================================================================
-- SAGA_INSTANCES TABLE - For saga pattern coordination
-- ============================================================================

CREATE TABLE IF NOT EXISTS saga_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_type VARCHAR(100) NOT NULL,
    saga_data JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'STARTED',
    current_step INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL,
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Correlation
    correlation_id UUID,
    
    CONSTRAINT saga_status_check CHECK (status IN ('STARTED', 'RUNNING', 'COMPLETED', 'FAILED', 'COMPENSATING', 'COMPENSATED'))
);

CREATE INDEX idx_saga_status ON saga_instances(status, updated_at);
CREATE INDEX idx_saga_type ON saga_instances(saga_type);
CREATE INDEX idx_saga_correlation ON saga_instances(correlation_id) WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- SAGA_STEPS TABLE - Track individual saga steps
-- ============================================================================

CREATE TABLE IF NOT EXISTS saga_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_id UUID NOT NULL REFERENCES saga_instances(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    step_name VARCHAR(100) NOT NULL,
    step_data JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Compensation
    compensation_data JSONB,
    compensated_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT saga_steps_unique UNIQUE(saga_id, step_number),
    CONSTRAINT step_status_check CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'COMPENSATING', 'COMPENSATED'))
);

CREATE INDEX idx_saga_steps_saga ON saga_steps(saga_id, step_number);
CREATE INDEX idx_saga_steps_status ON saga_steps(status);

-- ============================================================================
-- RECONCILIATION_RUNS TABLE - Track reconciliation jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'RUNNING',
    
    -- Statistics
    accounts_checked INTEGER DEFAULT 0,
    discrepancies_found INTEGER DEFAULT 0,
    auto_fixed INTEGER DEFAULT 0,
    manual_review_required INTEGER DEFAULT 0,
    
    -- Results
    results JSONB,
    
    CONSTRAINT reconciliation_status_check CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_reconciliation_date ON reconciliation_runs(run_date DESC);
CREATE INDEX idx_reconciliation_status ON reconciliation_runs(status);

-- ============================================================================
-- DISCREPANCIES TABLE - Track found discrepancies
-- ============================================================================

CREATE TABLE IF NOT EXISTS discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_run_id UUID REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    
    -- Account information
    account_id VARCHAR(255) NOT NULL,
    account_number VARCHAR(50),
    tigerbeetle_account_id BIGINT,
    
    -- Discrepancy details
    pg_balance DECIMAL(20, 2) NOT NULL,
    tb_balance DECIMAL(20, 2) NOT NULL,
    difference DECIMAL(20, 2) NOT NULL,
    
    -- Resolution
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    resolution_method VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    
    -- Timestamps
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT discrepancy_status_check CHECK (status IN ('PENDING', 'AUTO_FIXED', 'MANUAL_REVIEW', 'RESOLVED', 'IGNORED'))
);

CREATE INDEX idx_discrepancies_run ON discrepancies(reconciliation_run_id);
CREATE INDEX idx_discrepancies_account ON discrepancies(account_id);
CREATE INDEX idx_discrepancies_status ON discrepancies(status);
CREATE INDEX idx_discrepancies_detected ON discrepancies(detected_at DESC);

-- ============================================================================
-- IDEMPOTENCY_KEYS TABLE - Prevent duplicate processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    request_hash VARCHAR(64) NOT NULL,
    response_data JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSING',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    
    CONSTRAINT idempotency_status_check CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_idempotency_key ON idempotency_keys(idempotency_key);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at) WHERE status = 'COMPLETED';

-- ============================================================================
-- AUDIT_LOG TABLE - Comprehensive audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who
    user_id VARCHAR(255),
    user_email VARCHAR(255),
    user_role VARCHAR(100),
    
    -- What
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    
    -- Details
    old_value JSONB,
    new_value JSONB,
    changes JSONB,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    
    -- When
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ============================================================================
-- FUNCTIONS - Helper functions
-- ============================================================================

-- Function to get next version for an aggregate
CREATE OR REPLACE FUNCTION get_next_version(p_aggregate_id VARCHAR)
RETURNS INTEGER AS $$
DECLARE
    v_max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version), 0) INTO v_max_version
    FROM events
    WHERE aggregate_id = p_aggregate_id;
    
    RETURN v_max_version + 1;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency_keys
    WHERE expires_at < NOW() AND status = 'COMPLETED';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS - Automatic timestamp updates
-- ============================================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to saga_instances
CREATE TRIGGER saga_instances_updated_at
    BEFORE UPDATE ON saga_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS - Documentation
-- ============================================================================

COMMENT ON TABLE events IS 'Event store for event sourcing pattern. Stores all domain events immutably.';
COMMENT ON TABLE event_snapshots IS 'Snapshots of aggregate state for performance optimization.';
COMMENT ON TABLE saga_instances IS 'Saga orchestration instances for distributed transactions.';
COMMENT ON TABLE saga_steps IS 'Individual steps within a saga instance.';
COMMENT ON TABLE reconciliation_runs IS 'Tracks reconciliation jobs between PostgreSQL and TigerBeetle.';
COMMENT ON TABLE discrepancies IS 'Records discrepancies found during reconciliation.';
COMMENT ON TABLE idempotency_keys IS 'Ensures idempotent request processing.';
COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for all system actions.';

-- ============================================================================
-- GRANTS - Permissions (adjust as needed)
-- ============================================================================

-- Grant permissions to application user (replace 'neobank_app' with actual user)
-- GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO neobank_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neobank_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO neobank_app;

-- ============================================================================
-- INITIAL DATA - Event types registry (optional)
-- ============================================================================

-- You can add a table to register known event types for validation
-- CREATE TABLE event_types (
--     event_type VARCHAR(100) PRIMARY KEY,
--     description TEXT,
--     schema JSONB,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Verify tables created
SELECT 
    table_name, 
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name IN ('events', 'event_snapshots', 'saga_instances', 'saga_steps', 
                   'reconciliation_runs', 'discrepancies', 'idempotency_keys', 'audit_log')
ORDER BY table_name;
