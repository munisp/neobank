"""credit assessments

Revision ID: 009_credit_assessments
Revises: 008_kyc_triggers_liveness
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "009_credit_assessments"
down_revision = "008_kyc_triggers_liveness"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product", sa.String(32), nullable=False, server_default="loan"),
        sa.Column("requested_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("credit_score", sa.Numeric(5, 1), nullable=False),
        sa.Column("grade", sa.String(2), nullable=False),
        sa.Column("decision", sa.String(24), nullable=False),
        sa.Column("probability_of_default", sa.Numeric(6, 4), nullable=True),
        sa.Column("authenticity_score", sa.Numeric(4, 3), nullable=True),
        sa.Column("authenticity_grade", sa.String(16), nullable=True),
        sa.Column("model_version", sa.String(64), nullable=True),
        sa.Column("max_limit", sa.Numeric(18, 2), nullable=True),
        sa.Column("suggested_rate_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("reasons", postgresql.JSONB, server_default="[]"),
        sa.Column("context", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_credit_assessments_user", "credit_assessments", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_credit_assessments_user", table_name="credit_assessments")
    op.drop_table("credit_assessments")
