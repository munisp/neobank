"""escrow persistence + virtual accounts

Revision ID: 011_escrow_va
Revises: 010_alt_data
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "011_escrow_va"
down_revision = "010_alt_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "escrow_parties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("escrow_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("role", sa.String(24), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("account_id", sa.String(64), nullable=True),
        sa.Column("contribution_percentage", sa.Numeric(5, 2), server_default="0"),
        sa.Column("distribution_percentage", sa.Numeric(5, 2), server_default="0"),
        sa.Column("contributed_amount", sa.Numeric(18, 2), server_default="0"),
        sa.Column("approval_weight", sa.Numeric(5, 2), server_default="1"),
        sa.Column("approved", sa.String(8), server_default="false"),
        sa.Column("party_metadata", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_escrow_parties_escrow", "escrow_parties", ["escrow_id"])

    op.create_table(
        "escrow_approval_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("escrow_id", sa.String(64), nullable=False, unique=True),
        sa.Column("approval_type", sa.String(24), nullable=False, server_default="all"),
        sa.Column("required_approvals", sa.Integer, server_default="1"),
        sa.Column("required_percentage", sa.Numeric(5, 2), server_default="100"),
        sa.Column("require_agent_approval", sa.String(8), server_default="false"),
        sa.Column("auto_release_after_inspection", sa.String(8), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "escrow_ledger_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("escrow_id", sa.String(64), nullable=False),
        sa.Column("party_id", sa.String(64), nullable=False),
        sa.Column("entry_type", sa.String(16), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("reference", sa.String(64), nullable=True),
        sa.Column("entry_metadata", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_escrow_ledger_escrow", "escrow_ledger_entries", ["escrow_id"])

    op.create_table(
        "virtual_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_number", sa.String(10), nullable=False, unique=True),
        sa.Column("account_name", sa.String(128), nullable=False),
        sa.Column("label", sa.String(64), nullable=True),
        sa.Column("purpose", sa.String(24), nullable=False, server_default="collections"),
        sa.Column("linked_account_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("escrow_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("va_metadata", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_virtual_accounts_user", "virtual_accounts", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_virtual_accounts_user", table_name="virtual_accounts")
    op.drop_table("virtual_accounts")
    op.drop_index("idx_escrow_ledger_escrow", table_name="escrow_ledger_entries")
    op.drop_table("escrow_ledger_entries")
    op.drop_table("escrow_approval_configs")
    op.drop_index("idx_escrow_parties_escrow", table_name="escrow_parties")
    op.drop_table("escrow_parties")
