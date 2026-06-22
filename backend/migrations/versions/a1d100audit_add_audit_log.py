"""add audit_log table

Revision ID: a1d100audit
Revises: 94e5c8f92486
Create Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa


revision = "a1d100audit"
down_revision = "94e5c8f92486"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("actor_name", sa.String(length=150), nullable=False),
        sa.Column("actor_role", sa.String(length=20), nullable=True),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=True),
        sa.Column("target_id", sa.String(length=64), nullable=True),
        sa.Column("target_label", sa.String(length=200), nullable=True),
        sa.Column("description", sa.String(length=400), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_action", "audit_log", ["action"], unique=False)


def downgrade():
    op.drop_index("ix_audit_log_action", table_name="audit_log")
    op.drop_table("audit_log")
