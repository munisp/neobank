"""Notifications, push subscriptions, budgets, budget settings

Revision ID: 005_notifications_budgets
Revises: 004_performance_indexes

Closes the persistence gap: the PWA notification centre and budgeting
screens previously had no backing tables (data loss on every restart).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '005_notifications_budgets'
down_revision = '004_performance_indexes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('body', sa.Text, nullable=True),
        sa.Column('type', sa.String(50), nullable=False, server_default='info'),
        sa.Column('data', postgresql.JSONB, nullable=True),
        sa.Column('is_read', sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_notifications_user_read', 'notifications', ['user_id', 'is_read'])
    op.create_index('idx_notifications_user_created', 'notifications', ['user_id', 'created_at'])

    op.create_table(
        'push_subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('endpoint', sa.Text, nullable=False, unique=True),
        sa.Column('keys', postgresql.JSONB, nullable=False),
        sa.Column('user_agent', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'budgets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(64), nullable=False),
        sa.Column('limit_amount', sa.Numeric(18, 2), nullable=False),
        sa.Column('alert_threshold', sa.Integer, nullable=False, server_default='80'),
        sa.Column('period', sa.String(20), nullable=False, server_default='monthly'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'category', 'period', name='uq_budget_user_category_period'),
    )

    op.create_table(
        'budget_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('monthly_income', sa.Numeric(18, 2), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='NGN'),
        sa.Column('alerts_enabled', sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column('rollover_enabled', sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('budget_settings')
    op.drop_table('budgets')
    op.drop_table('push_subscriptions')
    op.drop_table('notifications')
