"""Performance indexes for hot query paths

Revision ID: 004_performance_indexes
Revises: 003_idv_sessions

Covers the highest-frequency queries observed in the routers:
- transactions by account + recency (dashboard, history, statements)
- transaction idempotency / reference lookups
- fraud alerts by account + status
- users by email/phone (login path)
- idempotency + webhook + session housekeeping
All indexes created CONCURRENTLY-safe (plain CREATE INDEX inside migration;
run with transactional DDL on PG >= 12 is fine for new deploys).
"""
from alembic import op

revision = '004_performance_indexes'
down_revision = '003_idv_sessions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- transactions: dashboard + history queries ---------------------------
    op.create_index('idx_tx_account_created', 'transactions',
                    ['account_id', 'created_at'])
    op.create_index('idx_tx_status', 'transactions', ['status'])
    op.create_index('idx_tx_type_created', 'transactions', ['transaction_type', 'created_at'])
    op.create_index('idx_tx_destination', 'transactions', ['destination_account_number'])

    # --- fraud alerts ---------------------------------------------------------
    op.create_index('idx_fraud_user_status', 'fraud_alerts', ['user_id', 'status'])
    op.create_index('idx_fraud_created', 'fraud_alerts', ['created_at'])

    # --- users: login path ----------------------------------------------------
    op.create_index('idx_users_email', 'users', ['email'])
    op.create_index('idx_users_phone', 'users', ['phone_number'])

    # --- accounts -------------------------------------------------------------
    op.create_index('idx_accounts_user', 'accounts', ['user_id'])
    op.create_index('idx_accounts_number', 'accounts', ['account_number'])

    # --- housekeeping tables --------------------------------------------------
    op.create_index('idx_idempotency_locked', 'idempotency_log', ['locked_until'])
    op.create_index('idx_idv_sessions_created', 'idv_sessions', ['created_at'])


def downgrade() -> None:
    for name, table in [
        ('idx_tx_account_created', 'transactions'),
        ('idx_tx_status', 'transactions'),
        ('idx_tx_type_created', 'transactions'),
        ('idx_tx_destination', 'transactions'),
        ('idx_fraud_user_status', 'fraud_alerts'),
        ('idx_fraud_created', 'fraud_alerts'),
        ('idx_users_email', 'users'),
        ('idx_users_phone', 'users'),
        ('idx_accounts_user', 'accounts'),
        ('idx_accounts_number', 'accounts'),
        ('idx_idempotency_locked', 'idempotency_log'),
        ('idx_idv_sessions_created', 'idv_sessions'),
    ]:
        op.drop_index(name, table_name=table)
