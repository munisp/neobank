"""IDV sessions and webhook logs (self-hosted OpenKYC replacement)

Revision ID: 003_idv_sessions
Revises: 002_auth_schema_consolidation
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '003_idv_sessions'
down_revision = '002_auth_schema_consolidation'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'idv_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='NOT_STARTED'),
        sa.Column('vendor_id', sa.String(64), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('session_url', sa.Text, nullable=True),
        sa.Column('front_image_b64', sa.Text, nullable=True),
        sa.Column('back_image_b64', sa.Text, nullable=True),
        sa.Column('result', postgresql.JSONB, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_idv_session_status', 'idv_sessions', ['status'])
    op.create_index('idx_idv_session_user', 'idv_sessions', ['user_id'])

    op.create_table(
        'idv_webhook_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('idv_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event', sa.String(64), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('response_status', sa.Integer, nullable=True),
        sa.Column('error', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_idv_webhook_session', 'idv_webhook_logs', ['session_id'])


def downgrade() -> None:
    op.drop_table('idv_webhook_logs')
    op.drop_table('idv_sessions')
