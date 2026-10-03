"""Auth schema consolidation

Revision ID: 002_auth_schema_consolidation
Revises: 001_initial_schema

Aligns the 001 schema with the canonical models in `database/models.py`:
- users: phone -> phone_number, adds profile/security/status columns
- accounts: adds account_name, limits, tigerbeetle column
- transactions: type -> transaction_type, destination + fraud columns
- creates authentication_attempts, refresh_tokens, kyc_records,
  fraud_alerts, api_keys, idempotency_log
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '002_auth_schema_consolidation'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---------------------------------------------------------------
    op.alter_column('users', 'phone', new_column_name='phone_number')
    op.add_column('users', sa.Column('address', sa.Text, nullable=True))
    op.add_column('users', sa.Column('roles', postgresql.JSONB, nullable=False, server_default='[]'))
    op.add_column('users', sa.Column('status', sa.String(30), nullable=False,
                                     server_default='pending_verification'))
    op.add_column('users', sa.Column('email_verified', sa.Boolean, nullable=False,
                                     server_default=sa.text('false')))
    op.add_column('users', sa.Column('phone_verified', sa.Boolean, nullable=False,
                                     server_default=sa.text('false')))
    op.add_column('users', sa.Column('kyc_completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('failed_login_attempts', sa.Integer, nullable=False,
                                     server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_login', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('mfa_enabled', sa.Boolean, nullable=False,
                                     server_default=sa.text('false')))
    # kyc_level: integer tier -> string level
    op.alter_column('users', 'kyc_level', type_=sa.String(20),
                    postgresql_using="CASE kyc_level WHEN 0 THEN 'basic' WHEN 1 THEN 'intermediate' ELSE 'full' END",
                    server_default='basic')

    # --- accounts --------------------------------------------------------------
    op.add_column('accounts', sa.Column('account_name', sa.String(255), nullable=True))
    op.execute("UPDATE accounts SET account_name = account_type || ' account' WHERE account_name IS NULL")
    op.alter_column('accounts', 'account_name', nullable=False)
    op.add_column('accounts', sa.Column('daily_limit', sa.Numeric(15, 2), nullable=False,
                                        server_default='1000000'))
    op.add_column('accounts', sa.Column('monthly_limit', sa.Numeric(15, 2), nullable=False,
                                        server_default='10000000'))
    op.add_column('accounts', sa.Column('tigerbeetle_account_id', sa.String(50), nullable=True))
    op.create_unique_constraint('uq_accounts_tigerbeetle_account_id', 'accounts',
                                ['tigerbeetle_account_id'])

    # --- transactions ------------------------------------------------------------
    op.alter_column('transactions', 'type', new_column_name='transaction_type')
    op.add_column('transactions', sa.Column('destination_account_id', postgresql.UUID(as_uuid=True),
                                            sa.ForeignKey('accounts.id'), nullable=True))
    op.add_column('transactions', sa.Column('destination_account_number', sa.String(20), nullable=True))
    op.add_column('transactions', sa.Column('destination_bank_code', sa.String(10), nullable=True))
    op.add_column('transactions', sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('transactions', sa.Column('fraud_score', sa.Numeric(5, 4), nullable=True))
    op.add_column('transactions', sa.Column('fraud_checked', sa.Boolean, nullable=False,
                                            server_default=sa.text('false')))
    op.add_column('transactions', sa.Column('fraud_flagged', sa.Boolean, nullable=False,
                                            server_default=sa.text('false')))
    op.add_column('transactions', sa.Column('tigerbeetle_transfer_id', sa.String(50), nullable=True))
    op.add_column('transactions', sa.Column('external_reference', sa.String(100), nullable=True))

    # --- new tables ----------------------------------------------------------------
    op.create_table(
        'authentication_attempts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('email', sa.String(255), nullable=False, index=True),
        sa.Column('success', sa.Boolean, nullable=False),
        sa.Column('failure_reason', sa.String(255), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('attempted_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('metadata', postgresql.JSONB, nullable=True),
    )

    op.create_table(
        'refresh_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('token_jti', sa.String(64), nullable=False, index=True),
        sa.Column('token_hash', sa.String(64), unique=True, nullable=False),
        sa.Column('is_revoked', sa.Boolean, nullable=False, server_default=sa.text('false')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=False,
                  server_default=sa.func.now()),
    )

    op.create_table(
        'kyc_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'),
                  nullable=False, index=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='not_started'),
        sa.Column('verification_level', sa.String(20), nullable=False, server_default='basic'),
        sa.Column('documents_submitted', postgresql.JSONB, nullable=True),
        sa.Column('verification_data', postgresql.JSONB, nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewer_notes', sa.Text, nullable=True),
        sa.Column('rejection_reason', sa.Text, nullable=True),
        sa.Column('external_kyc_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=False,
                  server_default=sa.func.now()),
    )

    op.create_table(
        'fraud_alerts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('transaction_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('transactions.id'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'),
                  nullable=False, index=True),
        sa.Column('alert_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('fraud_score', sa.Numeric(5, 4), nullable=False),
        sa.Column('detection_rules', postgresql.JSONB, nullable=True),
        sa.Column('ml_model_output', postgresql.JSONB, nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolution_notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=False,
                  server_default=sa.func.now()),
    )

    op.create_table(
        'api_keys',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('key_hash', sa.String(255), unique=True, nullable=False),
        sa.Column('permissions', postgresql.JSONB, nullable=True),
        sa.Column('rate_limit', sa.Integer, nullable=False, server_default='1000'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.text('true')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=False,
                  server_default=sa.func.now()),
    )

    op.create_table(
        'idempotency_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('key', sa.String(128), unique=True, nullable=False, index=True),
        sa.Column('endpoint', sa.String(255), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='in_progress'),
        sa.Column('response_status', sa.Integer, nullable=True),
        sa.Column('response_body', postgresql.JSONB, nullable=True),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('idempotency_log')
    op.drop_table('api_keys')
    op.drop_table('fraud_alerts')
    op.drop_table('kyc_records')
    op.drop_table('refresh_tokens')
    op.drop_table('authentication_attempts')

    op.drop_column('transactions', 'external_reference')
    op.drop_column('transactions', 'tigerbeetle_transfer_id')
    op.drop_column('transactions', 'fraud_flagged')
    op.drop_column('transactions', 'fraud_checked')
    op.drop_column('transactions', 'fraud_score')
    op.drop_column('transactions', 'processed_at')
    op.drop_column('transactions', 'destination_bank_code')
    op.drop_column('transactions', 'destination_account_number')
    op.drop_column('transactions', 'destination_account_id')
    op.alter_column('transactions', 'transaction_type', new_column_name='type')

    op.drop_constraint('uq_accounts_tigerbeetle_account_id', 'accounts')
    op.drop_column('accounts', 'tigerbeetle_account_id')
    op.drop_column('accounts', 'monthly_limit')
    op.drop_column('accounts', 'daily_limit')
    op.drop_column('accounts', 'account_name')

    op.alter_column('users', 'kyc_level', type_=sa.Integer,
                    postgresql_using="CASE kyc_level WHEN 'basic' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END")
    op.drop_column('users', 'mfa_enabled')
    op.drop_column('users', 'password_changed_at')
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'last_login')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_attempts')
    op.drop_column('users', 'kyc_completed_at')
    op.drop_column('users', 'phone_verified')
    op.drop_column('users', 'email_verified')
    op.drop_column('users', 'status')
    op.drop_column('users', 'roles')
    op.drop_column('users', 'address')
    op.alter_column('users', 'phone_number', new_column_name='phone')
