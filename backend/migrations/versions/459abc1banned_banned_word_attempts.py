"""banned word attempts

Logs blocked banned-word attempts for the messaging filter (block/warn/log
model, 2026-06-16). Stores only the matched term + who/where/when (never the
rejected body); created_at drives the rolling-window repeat-escalation count.

Revision ID: 459abc1banned
Revises: 458277fd31e2
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '459abc1banned'
down_revision = '458277fd31e2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "banned_word_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("matched_word", sa.String(length=80), nullable=False),
        sa.Column("context", sa.String(length=20), nullable=False, server_default="message"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_banned_word_attempts_user_id", "banned_word_attempts", ["user_id"]
    )


def downgrade():
    op.drop_index("ix_banned_word_attempts_user_id", table_name="banned_word_attempts")
    op.drop_table("banned_word_attempts")
