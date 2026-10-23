"""alternative data ingestion

Revision ID: 010_alt_data
Revises: 009_credit_assessments
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "010_alt_data"
down_revision = "009_credit_assessments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "alt_data_consents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("purpose", sa.String(64), nullable=False,
                  server_default="credit_assessment"),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_alt_data_consents_user", "alt_data_consents", ["user_id"])

    op.create_table(
        "alt_data_signals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("signal_type", sa.String(32), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(18, 2), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("trust", sa.Numeric(3, 2), nullable=False, server_default="0.5"),
        sa.Column("raw", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_alt_data_signals_user", "alt_data_signals",
                    ["user_id", "occurred_at"])


def downgrade() -> None:
    op.drop_index("idx_alt_data_signals_user", table_name="alt_data_signals")
    op.drop_table("alt_data_signals")
    op.drop_index("idx_alt_data_consents_user", table_name="alt_data_consents")
    op.drop_table("alt_data_consents")
