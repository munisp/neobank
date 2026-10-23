"""trust fabric: audit chain, positive pay, billing

Revision ID: 013_trust_fabric
Revises: 012_escrow_rules_ext
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "013_trust_fabric"
down_revision = "012_escrow_rules_ext"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_chain_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("domain", sa.String(32), nullable=False, server_default="platform"),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("aggregate_id", sa.String(64), nullable=True),
        sa.Column("payload", postgresql.JSONB, server_default="{}"),
        sa.Column("prev_hash", sa.String(64), nullable=False),
        sa.Column("entry_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_audit_chain_domain_seq", "audit_chain_entries",
                    ["domain", "sequence"], unique=True)

    op.create_table(
        "registered_payees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payee_account", sa.String(32), nullable=False),
        sa.Column("payee_name", sa.String(128), nullable=False),
        sa.Column("bank_code", sa.String(16), nullable=True),
        sa.Column("max_single_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("daily_limit", sa.Numeric(18, 2), nullable=True),
        sa.Column("category", sa.String(32), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "payee_account", name="uq_payee_user_account"),
    )
    op.create_index("idx_registered_payees_user", "registered_payees", ["user_id"])

    op.create_table(
        "payment_exceptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transfer_reference", sa.String(64), nullable=False, unique=True),
        sa.Column("payee_account", sa.String(32), nullable=False),
        sa.Column("payee_name", sa.String(128), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="NGN"),
        sa.Column("reason", sa.String(64), nullable=False),
        sa.Column("risk_score", sa.Numeric(5, 4), nullable=True),
        sa.Column("recommendation", sa.String(16), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="open"),
        sa.Column("decided_by", sa.String(64), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_payment_exceptions_user_status", "payment_exceptions",
                    ["user_id", "status"])

    op.create_table(
        "fee_schedule_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("schedule", sa.String(32), nullable=False, server_default="default"),
        sa.Column("metric", sa.String(48), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="NGN"),
        sa.Column("tiers", postgresql.JSONB, server_default="[]"),
        sa.Column("monthly_minimum", sa.Numeric(18, 2), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("schedule", "metric", name="uq_fee_schedule_metric"),
    )

    op.create_table(
        "billing_statements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("lines", postgresql.JSONB, server_default="[]"),
        sa.Column("total", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="NGN"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(16), nullable=False, server_default="finalized"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_billing_statements_user_period", "billing_statements",
                    ["user_id", "period"])

    # signed uploads for alt-data statement CSVs (tamper evidence)
    op.add_column("alt_data_signals",
                  sa.Column("source_sha256", sa.String(64), nullable=True))
    op.add_column("alt_data_signals",
                  sa.Column("source_signature", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("alt_data_signals", "source_signature")
    op.drop_column("alt_data_signals", "source_sha256")
    op.drop_table("billing_statements")
    op.drop_table("fee_schedule_items")
    op.drop_table("payment_exceptions")
    op.drop_table("registered_payees")
    op.drop_table("audit_chain_entries")
