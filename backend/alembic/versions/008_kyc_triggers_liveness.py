"""kyc trigger events + idv biometrics columns

Revision ID: 008_kyc_triggers_liveness
Revises: 007_platform_expansion
Create Date: 2026-10-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "008_kyc_triggers_liveness"
down_revision = "007_platform_expansion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("idv_sessions", sa.Column("selfie_image_b64", sa.Text(), nullable=True))
    op.add_column("idv_sessions", sa.Column("biometrics_result", postgresql.JSONB(), nullable=True))

    op.create_table(
        "kyc_trigger_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger_key", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("current_level", sa.String(20), nullable=False),
        sa.Column("required_level", sa.String(20), nullable=False),
        sa.Column("context", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("satisfied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_kyc_trigger_user", "kyc_trigger_events", ["user_id"])
    op.create_index("idx_kyc_trigger_status", "kyc_trigger_events", ["status"])


def downgrade() -> None:
    op.drop_index("idx_kyc_trigger_status", table_name="kyc_trigger_events")
    op.drop_index("idx_kyc_trigger_user", table_name="kyc_trigger_events")
    op.drop_table("kyc_trigger_events")
    op.drop_column("idv_sessions", "biometrics_result")
    op.drop_column("idv_sessions", "selfie_image_b64")
