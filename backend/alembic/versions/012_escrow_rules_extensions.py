"""escrow rule extensions: per-deal fee, deadline, milestone rules

Revision ID: 012_escrow_rules_ext
Revises: 011_escrow_va
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "012_escrow_rules_ext"
down_revision = "011_escrow_va"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("escrow_approval_configs",
                  sa.Column("fee_percentage", sa.Numeric(5, 2), nullable=True))
    op.add_column("escrow_approval_configs",
                  sa.Column("approval_deadline", sa.DateTime(timezone=True), nullable=True))
    op.add_column("escrow_approval_configs",
                  sa.Column("milestone_rules", postgresql.JSONB, server_default="{}"))


def downgrade() -> None:
    op.drop_column("escrow_approval_configs", "milestone_rules")
    op.drop_column("escrow_approval_configs", "approval_deadline")
    op.drop_column("escrow_approval_configs", "fee_percentage")
