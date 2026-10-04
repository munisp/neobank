"""Platform expansion: developer ecosystem, settlement, mortgages, NGX, stablecoins

Revision ID: 007_platform_expansion
Revises: 006_segments_appstore

Adds the third-party developer platform (vetted apps for the segment app
store), server-side tenant themes, segment analytics events, a settlement
layer on top of the reconciliation engine, mortgages with payment plans,
NGX stock investing, and custodial stablecoin wallets.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '007_platform_expansion'
down_revision = '006_segments_appstore'
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
NOW = sa.func.now()


def _ts():
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=NOW),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=NOW),
    ]


def upgrade() -> None:
    op.create_table(
        'developers',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('company_name', sa.String(255), nullable=False),
        sa.Column('website', sa.String(255), nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='pending'),
        *_ts(),
    )

    op.create_table(
        'developer_apps',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('developer_id', UUID, sa.ForeignKey('developers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('tagline', sa.String(255), nullable=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('icon', sa.String(64), nullable=True),
        sa.Column('callback_url', sa.String(512), nullable=True),
        sa.Column('scopes', postgresql.JSONB, nullable=True),
        sa.Column('target_segments', postgresql.JSONB, nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('review_notes', sa.Text, nullable=True),
        sa.Column('api_key_hash', sa.String(128), nullable=True),
        sa.Column('api_key_prefix', sa.String(16), nullable=True),
        sa.Column('published_segment_app_id', UUID,
                  sa.ForeignKey('segment_apps.id', ondelete='SET NULL'), nullable=True),
        *_ts(),
    )

    op.create_table(
        'developer_webhooks',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('app_id', UUID, sa.ForeignKey('developer_apps.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event', sa.String(64), nullable=False),
        sa.Column('url', sa.String(512), nullable=False),
        sa.Column('secret', sa.String(128), nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    op.create_table(
        'tenant_themes',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('tenant_key', sa.String(64), nullable=False, unique=True),
        sa.Column('seed_color', sa.String(7), nullable=False),
        sa.Column('radius', sa.String(16), nullable=False, server_default='default'),
        sa.Column('motion_bias', sa.String(16), nullable=False, server_default='standard'),
        sa.Column('voice', sa.String(32), nullable=False, server_default='neutral'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    op.create_table(
        'segment_events',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('segment_key', sa.String(64), nullable=False),
        sa.Column('app_key', sa.String(64), nullable=True),
        sa.Column('event', sa.String(32), nullable=False),
        *_ts(),
    )
    op.create_index('idx_segment_events_seg_event', 'segment_events', ['segment_key', 'event'])
    op.create_index('idx_segment_events_user', 'segment_events', ['user_id'])

    op.create_table(
        'settlement_batches',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('reference', sa.String(64), nullable=False, unique=True),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='open'),
        sa.Column('total_debits', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('total_credits', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('net_position', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('entry_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('settled_at', sa.DateTime(timezone=True), nullable=True),
        *_ts(),
    )

    op.create_table(
        'settlement_entries',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('batch_id', UUID, sa.ForeignKey('settlement_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('account_id', UUID, sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('direction', sa.String(8), nullable=False),
        sa.Column('amount', sa.Numeric(18, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='NGN'),
        sa.Column('reference', sa.String(128), nullable=True),
        sa.Column('reconciled', sa.Boolean, nullable=False, server_default=sa.false()),
        *_ts(),
    )
    op.create_index('idx_settlement_entries_batch', 'settlement_entries', ['batch_id'])

    op.create_table(
        'mortgage_products',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('annual_rate_pct', sa.Numeric(5, 2), nullable=False),
        sa.Column('max_tenor_years', sa.Integer, nullable=False, server_default='20'),
        sa.Column('min_deposit_pct', sa.Numeric(5, 2), nullable=False, server_default='20'),
        sa.Column('max_amount', sa.Numeric(18, 2), nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    op.create_table(
        'mortgage_applications',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('product_id', UUID, sa.ForeignKey('mortgage_products.id'), nullable=False),
        sa.Column('property_value', sa.Numeric(18, 2), nullable=False),
        sa.Column('deposit_amount', sa.Numeric(18, 2), nullable=False),
        sa.Column('principal', sa.Numeric(18, 2), nullable=False),
        sa.Column('annual_rate_pct', sa.Numeric(5, 2), nullable=False),
        sa.Column('tenor_months', sa.Integer, nullable=False),
        sa.Column('monthly_payment', sa.Numeric(18, 2), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('property_address', sa.Text, nullable=True),
        *_ts(),
    )
    op.create_index('idx_mortgage_apps_user', 'mortgage_applications', ['user_id'])

    op.create_table(
        'mortgage_schedule',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('application_id', UUID, sa.ForeignKey('mortgage_applications.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sequence', sa.Integer, nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('amount', sa.Numeric(18, 2), nullable=False),
        sa.Column('principal_part', sa.Numeric(18, 2), nullable=False),
        sa.Column('interest_part', sa.Numeric(18, 2), nullable=False),
        sa.Column('balance_after', sa.Numeric(18, 2), nullable=False),
        sa.Column('status', sa.String(16), nullable=False, server_default='due'),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('application_id', 'sequence', name='uq_mortgage_schedule_seq'),
        *_ts(),
    )
    op.create_index('idx_mortgage_schedule_app', 'mortgage_schedule', ['application_id'])

    op.create_table(
        'ngx_securities',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('symbol', sa.String(16), nullable=False, unique=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('sector', sa.String(64), nullable=True),
        sa.Column('last_price', sa.Numeric(14, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='NGN'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    op.create_table(
        'ngx_orders',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('security_id', UUID, sa.ForeignKey('ngx_securities.id'), nullable=False),
        sa.Column('side', sa.String(4), nullable=False),
        sa.Column('quantity', sa.Integer, nullable=False),
        sa.Column('price', sa.Numeric(14, 2), nullable=False),
        sa.Column('gross_amount', sa.Numeric(18, 2), nullable=False),
        sa.Column('fee', sa.Numeric(18, 2), nullable=False, server_default='0'),
        sa.Column('status', sa.String(16), nullable=False, server_default='executed'),
        *_ts(),
    )
    op.create_index('idx_ngx_orders_user', 'ngx_orders', ['user_id'])

    op.create_table(
        'ngx_holdings',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('security_id', UUID, sa.ForeignKey('ngx_securities.id'), nullable=False),
        sa.Column('quantity', sa.Integer, nullable=False, server_default='0'),
        sa.Column('avg_cost', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.UniqueConstraint('user_id', 'security_id', name='uq_ngx_holding'),
        *_ts(),
    )

    op.create_table(
        'stablecoin_wallets',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('user_id', UUID, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset', sa.String(8), nullable=False),
        sa.Column('balance', sa.Numeric(28, 8), nullable=False, server_default='0'),
        sa.Column('address', sa.String(128), nullable=True),
        sa.UniqueConstraint('user_id', 'asset', name='uq_stablecoin_wallet'),
        *_ts(),
    )
    op.create_index('idx_stablecoin_wallets_user', 'stablecoin_wallets', ['user_id'])

    op.create_table(
        'stablecoin_transfers',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('wallet_id', UUID, sa.ForeignKey('stablecoin_wallets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(16), nullable=False),
        sa.Column('asset', sa.String(8), nullable=False),
        sa.Column('amount', sa.Numeric(28, 8), nullable=False),
        sa.Column('ngn_amount', sa.Numeric(18, 2), nullable=True),
        sa.Column('rate', sa.Numeric(18, 4), nullable=True),
        sa.Column('counterparty', sa.String(128), nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='completed'),
        sa.Column('tx_hash', sa.String(128), nullable=True),
        *_ts(),
    )
    op.create_index('idx_stablecoin_transfers_wallet', 'stablecoin_transfers', ['wallet_id'])


def downgrade() -> None:
    op.drop_index('idx_stablecoin_transfers_wallet', table_name='stablecoin_transfers')
    op.drop_table('stablecoin_transfers')
    op.drop_index('idx_stablecoin_wallets_user', table_name='stablecoin_wallets')
    op.drop_table('stablecoin_wallets')
    op.drop_table('ngx_holdings')
    op.drop_index('idx_ngx_orders_user', table_name='ngx_orders')
    op.drop_table('ngx_orders')
    op.drop_table('ngx_securities')
    op.drop_index('idx_mortgage_schedule_app', table_name='mortgage_schedule')
    op.drop_table('mortgage_schedule')
    op.drop_index('idx_mortgage_apps_user', table_name='mortgage_applications')
    op.drop_table('mortgage_applications')
    op.drop_table('mortgage_products')
    op.drop_index('idx_settlement_entries_batch', table_name='settlement_entries')
    op.drop_table('settlement_entries')
    op.drop_table('settlement_batches')
    op.drop_index('idx_segment_events_user', table_name='segment_events')
    op.drop_index('idx_segment_events_seg_event', table_name='segment_events')
    op.drop_table('segment_events')
    op.drop_table('tenant_themes')
    op.drop_table('developer_webhooks')
    op.drop_table('developer_apps')
    op.drop_table('developers')
