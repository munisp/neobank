"""Segments, segment apps, and user segment memberships (segmentation engine)

Revision ID: 006_segments_appstore
Revises: 005_notifications_budgets

Backs the segmentation engine / in-app "app store": the platform can
define market segments (students, SMEs, gig workers, ...), attach app
tiles to each segment, and enroll users manually or via rule matching.
The PWA "For You" store and the web admin segment manager read/write
these tables.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '006_segments_appstore'
down_revision = '005_notifications_budgets'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'segments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('key', sa.String(64), nullable=False, unique=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('icon', sa.String(64), nullable=True),
        sa.Column('criteria', postgresql.JSONB, nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'segment_apps',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('segment_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('segments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('key', sa.String(64), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('tagline', sa.String(255), nullable=True),
        sa.Column('route', sa.String(255), nullable=False),
        sa.Column('icon', sa.String(64), nullable=True),
        sa.Column('is_enabled', sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('segment_id', 'key', name='uq_segment_app_key'),
    )

    op.create_table(
        'user_segments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('segment_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('segments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source', sa.String(32), nullable=False, server_default='manual'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'segment_id', name='uq_user_segment'),
    )
    op.create_index('idx_user_segments_user', 'user_segments', ['user_id'])
    op.create_index('idx_user_segments_segment', 'user_segments', ['segment_id'])


def downgrade() -> None:
    op.drop_index('idx_user_segments_segment', table_name='user_segments')
    op.drop_index('idx_user_segments_user', table_name='user_segments')
    op.drop_table('user_segments')
    op.drop_table('segment_apps')
    op.drop_table('segments')
