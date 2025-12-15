"""Initial schema migration for NeoBank platform

Revision ID: 001_initial_schema
Revises: 
Create Date: 2024-12-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('phone', sa.String(20), unique=True, nullable=True, index=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('first_name', sa.String(100), nullable=True),
        sa.Column('last_name', sa.String(100), nullable=True),
        sa.Column('date_of_birth', sa.Date, nullable=True),
        sa.Column('country', sa.String(3), nullable=True),
        sa.Column('kyc_status', sa.String(20), default='pending'),
        sa.Column('kyc_level', sa.Integer, default=0),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('is_verified', sa.Boolean, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Accounts table
    op.create_table(
        'accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('account_number', sa.String(20), unique=True, nullable=False, index=True),
        sa.Column('account_type', sa.String(20), nullable=False),
        sa.Column('currency', sa.String(3), default='NGN'),
        sa.Column('balance', sa.Numeric(20, 4), default=0),
        sa.Column('available_balance', sa.Numeric(20, 4), default=0),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('is_primary', sa.Boolean, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Transactions table
    op.create_table(
        'transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('reference', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('accounts.id'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('amount', sa.Numeric(20, 4), nullable=False),
        sa.Column('currency', sa.String(3), default='NGN'),
        sa.Column('balance_before', sa.Numeric(20, 4)),
        sa.Column('balance_after', sa.Numeric(20, 4)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('description', sa.Text),
        sa.Column('metadata', postgresql.JSONB),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # KYC Documents table
    op.create_table(
        'kyc_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('document_type', sa.String(50), nullable=False),
        sa.Column('document_number', sa.String(100)),
        sa.Column('country', sa.String(3)),
        sa.Column('file_url', sa.String(500)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('verification_result', postgresql.JSONB),
        sa.Column('verified_at', sa.DateTime(timezone=True)),
        sa.Column('expires_at', sa.Date),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Cards table
    op.create_table(
        'cards',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('card_type', sa.String(20), nullable=False),
        sa.Column('card_network', sa.String(20), default='visa'),
        sa.Column('last_four', sa.String(4)),
        sa.Column('expiry_month', sa.Integer),
        sa.Column('expiry_year', sa.Integer),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('is_virtual', sa.Boolean, default=True),
        sa.Column('daily_limit', sa.Numeric(20, 4)),
        sa.Column('monthly_limit', sa.Numeric(20, 4)),
        sa.Column('atm_enabled', sa.Boolean, default=True),
        sa.Column('online_enabled', sa.Boolean, default=True),
        sa.Column('international_enabled', sa.Boolean, default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Loans table
    op.create_table(
        'loans',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('loan_type', sa.String(30), nullable=False),
        sa.Column('principal', sa.Numeric(20, 4), nullable=False),
        sa.Column('interest_rate', sa.Numeric(5, 2), nullable=False),
        sa.Column('term_months', sa.Integer, nullable=False),
        sa.Column('monthly_payment', sa.Numeric(20, 4)),
        sa.Column('total_amount', sa.Numeric(20, 4)),
        sa.Column('outstanding_balance', sa.Numeric(20, 4)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('disbursed_at', sa.DateTime(timezone=True)),
        sa.Column('due_date', sa.Date),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Savings Vaults table
    op.create_table(
        'savings_vaults',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('vault_type', sa.String(30), nullable=False),
        sa.Column('currency', sa.String(3), default='NGN'),
        sa.Column('balance', sa.Numeric(20, 4), default=0),
        sa.Column('target_amount', sa.Numeric(20, 4)),
        sa.Column('interest_rate', sa.Numeric(5, 2)),
        sa.Column('accrued_interest', sa.Numeric(20, 4), default=0),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('maturity_date', sa.Date),
        sa.Column('auto_save_enabled', sa.Boolean, default=False),
        sa.Column('auto_save_amount', sa.Numeric(20, 4)),
        sa.Column('auto_save_frequency', sa.String(20)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Investments/Portfolios table
    op.create_table(
        'investment_portfolios',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('currency', sa.String(3), default='NGN'),
        sa.Column('cash_balance', sa.Numeric(20, 4), default=0),
        sa.Column('buying_power', sa.Numeric(20, 4), default=0),
        sa.Column('total_value', sa.Numeric(20, 4), default=0),
        sa.Column('total_cost', sa.Numeric(20, 4), default=0),
        sa.Column('total_gain', sa.Numeric(20, 4), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Investment Holdings table
    op.create_table(
        'investment_holdings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('portfolio_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('investment_portfolios.id'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('name', sa.String(200)),
        sa.Column('asset_type', sa.String(20), nullable=False),
        sa.Column('exchange', sa.String(20)),
        sa.Column('quantity', sa.Numeric(20, 8), nullable=False),
        sa.Column('avg_cost_basis', sa.Numeric(20, 4)),
        sa.Column('total_cost', sa.Numeric(20, 4)),
        sa.Column('current_price', sa.Numeric(20, 4)),
        sa.Column('market_value', sa.Numeric(20, 4)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Investment Orders table
    op.create_table(
        'investment_orders',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('portfolio_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('investment_portfolios.id'), nullable=False),
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('asset_type', sa.String(20), nullable=False),
        sa.Column('exchange', sa.String(20)),
        sa.Column('side', sa.String(10), nullable=False),
        sa.Column('order_type', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('quantity', sa.Numeric(20, 8), nullable=False),
        sa.Column('filled_quantity', sa.Numeric(20, 8), default=0),
        sa.Column('limit_price', sa.Numeric(20, 4)),
        sa.Column('avg_fill_price', sa.Numeric(20, 4)),
        sa.Column('total_amount', sa.Numeric(20, 4)),
        sa.Column('commission', sa.Numeric(20, 4)),
        sa.Column('executed_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Escrow table
    op.create_table(
        'escrows',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('reference', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('escrow_type', sa.String(30), nullable=False),
        sa.Column('buyer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('seller_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('amount', sa.Numeric(20, 4), nullable=False),
        sa.Column('currency', sa.String(3), default='NGN'),
        sa.Column('fee', sa.Numeric(20, 4)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('title', sa.String(200)),
        sa.Column('description', sa.Text),
        sa.Column('terms', postgresql.JSONB),
        sa.Column('milestones', postgresql.JSONB),
        sa.Column('funded_at', sa.DateTime(timezone=True)),
        sa.Column('released_at', sa.DateTime(timezone=True)),
        sa.Column('expires_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Insurance Policies table
    op.create_table(
        'insurance_policies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('policy_number', sa.String(50), unique=True, nullable=False),
        sa.Column('policy_type', sa.String(30), nullable=False),
        sa.Column('provider', sa.String(100)),
        sa.Column('coverage_amount', sa.Numeric(20, 4)),
        sa.Column('premium', sa.Numeric(20, 4)),
        sa.Column('premium_frequency', sa.String(20)),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('start_date', sa.Date),
        sa.Column('end_date', sa.Date),
        sa.Column('coverage_details', postgresql.JSONB),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # BNPL (Buy Now Pay Later) table
    op.create_table(
        'bnpl_orders',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('merchant_id', sa.String(100)),
        sa.Column('merchant_name', sa.String(200)),
        sa.Column('order_reference', sa.String(50), unique=True),
        sa.Column('total_amount', sa.Numeric(20, 4), nullable=False),
        sa.Column('down_payment', sa.Numeric(20, 4)),
        sa.Column('installment_amount', sa.Numeric(20, 4)),
        sa.Column('num_installments', sa.Integer),
        sa.Column('paid_installments', sa.Integer, default=0),
        sa.Column('outstanding_balance', sa.Numeric(20, 4)),
        sa.Column('interest_rate', sa.Numeric(5, 2)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('next_payment_date', sa.Date),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Bill Payments table
    op.create_table(
        'bill_payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('accounts.id')),
        sa.Column('biller_code', sa.String(50), nullable=False),
        sa.Column('biller_name', sa.String(200)),
        sa.Column('category', sa.String(50)),
        sa.Column('customer_id', sa.String(100)),
        sa.Column('amount', sa.Numeric(20, 4), nullable=False),
        sa.Column('fee', sa.Numeric(20, 4)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('reference', sa.String(50), unique=True),
        sa.Column('provider_reference', sa.String(100)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Rewards table
    op.create_table(
        'rewards',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('points_balance', sa.Integer, default=0),
        sa.Column('lifetime_points', sa.Integer, default=0),
        sa.Column('tier', sa.String(20), default='bronze'),
        sa.Column('cashback_balance', sa.Numeric(20, 4), default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # Audit Trail table
    op.create_table(
        'audit_trail',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('event_type', sa.String(50), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), index=True),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True)),
        sa.Column('resource_type', sa.String(50)),
        sa.Column('resource_id', sa.String(100)),
        sa.Column('action', sa.String(50)),
        sa.Column('details', postgresql.JSONB),
        sa.Column('ip_address', sa.String(45)),
        sa.Column('user_agent', sa.String(500)),
        sa.Column('previous_hash', sa.String(64)),
        sa.Column('event_hash', sa.String(64)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )

    # Create indexes for common queries
    op.create_index('ix_transactions_user_created', 'transactions', ['user_id', 'created_at'])
    op.create_index('ix_audit_trail_user_created', 'audit_trail', ['user_id', 'created_at'])
    op.create_index('ix_escrows_buyer_seller', 'escrows', ['buyer_id', 'seller_id'])


def downgrade() -> None:
    op.drop_index('ix_escrows_buyer_seller')
    op.drop_index('ix_audit_trail_user_created')
    op.drop_index('ix_transactions_user_created')
    op.drop_table('audit_trail')
    op.drop_table('rewards')
    op.drop_table('bill_payments')
    op.drop_table('bnpl_orders')
    op.drop_table('insurance_policies')
    op.drop_table('escrows')
    op.drop_table('investment_orders')
    op.drop_table('investment_holdings')
    op.drop_table('investment_portfolios')
    op.drop_table('savings_vaults')
    op.drop_table('loans')
    op.drop_table('cards')
    op.drop_table('kyc_documents')
    op.drop_table('transactions')
    op.drop_table('accounts')
    op.drop_table('users')
