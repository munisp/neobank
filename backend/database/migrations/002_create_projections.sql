-- Migration: Create Event Projection Tables
-- Description: Creates read model tables for CQRS pattern
-- Version: 002
-- Date: 2025-10-31

-- Account Balance Projection
-- Optimized for fast balance queries
CREATE TABLE IF NOT EXISTS account_balance_projection (
    account_id VARCHAR(255) PRIMARY KEY,
    balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
    available_balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
    pending_credits DECIMAL(20, 2) NOT NULL DEFAULT 0,
    pending_debits DECIMAL(20, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL,
    last_event_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_account_balance_last_updated ON account_balance_projection(last_updated DESC);
CREATE INDEX idx_account_balance_version ON account_balance_projection(last_event_version);

-- Transaction History Projection
-- Denormalized transaction history for fast queries
CREATE TABLE IF NOT EXISTS transaction_history_projection (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(255) NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    counterparty_account_id VARCHAR(255),
    amount DECIMAL(20, 2) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- transfer_in, transfer_out, deposit, withdrawal
    status VARCHAR(50) NOT NULL, -- completed, failed, pending
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    event_version INTEGER NOT NULL,
    UNIQUE(transaction_id, account_id)
);

CREATE INDEX idx_transaction_history_account ON transaction_history_projection(account_id, created_at DESC);
CREATE INDEX idx_transaction_history_transaction ON transaction_history_projection(transaction_id);
CREATE INDEX idx_transaction_history_created ON transaction_history_projection(created_at DESC);
CREATE INDEX idx_transaction_history_status ON transaction_history_projection(status);
CREATE INDEX idx_transaction_history_type ON transaction_history_projection(transaction_type);

-- Audit Trail Projection
-- Comprehensive audit log for compliance
CREATE TABLE IF NOT EXISTS audit_trail_projection (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB,
    user_id VARCHAR(255),
    correlation_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    service_name VARCHAR(100),
    indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_trail_aggregate ON audit_trail_projection(aggregate_id, created_at DESC);
CREATE INDEX idx_audit_trail_event_type ON audit_trail_projection(event_type);
CREATE INDEX idx_audit_trail_user ON audit_trail_projection(user_id, created_at DESC);
CREATE INDEX idx_audit_trail_correlation ON audit_trail_projection(correlation_id);
CREATE INDEX idx_audit_trail_created ON audit_trail_projection(created_at DESC);
CREATE INDEX idx_audit_trail_service ON audit_trail_projection(service_name);

-- GIN index for JSONB queries
CREATE INDEX idx_audit_trail_event_data ON audit_trail_projection USING GIN (event_data);
CREATE INDEX idx_audit_trail_metadata ON audit_trail_projection USING GIN (metadata);

-- Projection Checkpoint Table
-- Tracks last processed event for each projection
CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name VARCHAR(100) PRIMARY KEY,
    last_event_id VARCHAR(255),
    last_event_version INTEGER NOT NULL DEFAULT 0,
    last_processed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, rebuilding, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projection_checkpoints_status ON projection_checkpoints(status);

-- Materialized View for Account Summary
-- Combines account balance with recent transaction count
CREATE MATERIALIZED VIEW IF NOT EXISTS account_summary_view AS
SELECT 
    ab.account_id,
    ab.balance,
    ab.available_balance,
    ab.pending_credits,
    ab.pending_debits,
    ab.last_updated,
    COUNT(th.id) FILTER (WHERE th.created_at > NOW() - INTERVAL '30 days') as transactions_30d,
    COUNT(th.id) FILTER (WHERE th.created_at > NOW() - INTERVAL '7 days') as transactions_7d,
    SUM(th.amount) FILTER (WHERE th.created_at > NOW() - INTERVAL '30 days' AND th.amount > 0) as total_credits_30d,
    SUM(ABS(th.amount)) FILTER (WHERE th.created_at > NOW() - INTERVAL '30 days' AND th.amount < 0) as total_debits_30d
FROM account_balance_projection ab
LEFT JOIN transaction_history_projection th ON ab.account_id = th.account_id
GROUP BY 
    ab.account_id, ab.balance, ab.available_balance, 
    ab.pending_credits, ab.pending_debits, ab.last_updated;

CREATE UNIQUE INDEX idx_account_summary_account ON account_summary_view(account_id);

-- Function to refresh account summary view
CREATE OR REPLACE FUNCTION refresh_account_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY account_summary_view;
END;
$$ LANGUAGE plpgsql;

-- Function to update projection checkpoint
CREATE OR REPLACE FUNCTION update_projection_checkpoint(
    p_projection_name VARCHAR(100),
    p_event_id VARCHAR(255),
    p_event_version INTEGER
)
RETURNS void AS $$
BEGIN
    INSERT INTO projection_checkpoints (
        projection_name, last_event_id, last_event_version, 
        last_processed_at, status
    )
    VALUES (
        p_projection_name, p_event_id, p_event_version,
        NOW(), 'active'
    )
    ON CONFLICT (projection_name)
    DO UPDATE SET
        last_event_id = EXCLUDED.last_event_id,
        last_event_version = EXCLUDED.last_event_version,
        last_processed_at = EXCLUDED.last_processed_at,
        status = 'active',
        error_message = NULL,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get account balance (fast query)
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id VARCHAR(255))
RETURNS TABLE (
    balance DECIMAL(20, 2),
    available_balance DECIMAL(20, 2),
    pending_credits DECIMAL(20, 2),
    pending_debits DECIMAL(20, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ab.balance,
        ab.available_balance,
        ab.pending_credits,
        ab.pending_debits
    FROM account_balance_projection ab
    WHERE ab.account_id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent transactions (fast query)
CREATE OR REPLACE FUNCTION get_recent_transactions(
    p_account_id VARCHAR(255),
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    transaction_id VARCHAR(255),
    amount DECIMAL(20, 2),
    transaction_type VARCHAR(50),
    status VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        th.transaction_id,
        th.amount,
        th.transaction_type,
        th.status,
        th.description,
        th.created_at
    FROM transaction_history_projection th
    WHERE th.account_id = p_account_id
    ORDER BY th.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get audit trail for aggregate
CREATE OR REPLACE FUNCTION get_audit_trail(
    p_aggregate_id VARCHAR(255),
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    event_id VARCHAR(255),
    event_type VARCHAR(100),
    event_data JSONB,
    user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        at.event_id,
        at.event_type,
        at.event_data,
        at.user_id,
        at.created_at
    FROM audit_trail_projection at
    WHERE at.aggregate_id = p_aggregate_id
    ORDER BY at.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_account_balance_updated_at
    BEFORE UPDATE ON account_balance_projection
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projection_checkpoints_updated_at
    BEFORE UPDATE ON projection_checkpoints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert initial checkpoint records
INSERT INTO projection_checkpoints (projection_name, last_event_version, status)
VALUES 
    ('account_balance', 0, 'active'),
    ('transaction_history', 0, 'active'),
    ('audit_trail', 0, 'active')
ON CONFLICT (projection_name) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE account_balance_projection IS 'Read model for fast account balance queries';
COMMENT ON TABLE transaction_history_projection IS 'Denormalized transaction history for fast queries';
COMMENT ON TABLE audit_trail_projection IS 'Comprehensive audit log for compliance and debugging';
COMMENT ON TABLE projection_checkpoints IS 'Tracks last processed event for each projection';
COMMENT ON MATERIALIZED VIEW account_summary_view IS 'Combines account balance with transaction statistics';
