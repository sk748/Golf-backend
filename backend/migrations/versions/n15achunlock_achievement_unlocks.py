"""achievement unlocks (player catalog-achievement celebrations)

Records the first time a player earns each frontend-catalog achievement. The
predicates live on the frontend (derived from stats), so the app reports the
keys it has earned and we store one row per (junior, key) with an unlocked_at.
This anchors the "most recent" glow and the server-side moment to congratulate
the player + notify their parent.

Adds:
  - achievement_unlocks table (unique on junior_id + achievement_key)

Revision ID: n15achunlock
Revises: m14handicap
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa


revision = "n15achunlock"
down_revision = "m14handicap"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "achievement_unlocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("junior_id", sa.Integer(), nullable=False),
        sa.Column("achievement_key", sa.String(length=80), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["junior_id"], ["junior_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "junior_id", "achievement_key", name="uq_achievement_unlock"
        ),
    )
    op.create_index(
        "ix_achievement_unlocks_junior_id",
        "achievement_unlocks",
        ["junior_id"],
    )


def downgrade():
    op.drop_index(
        "ix_achievement_unlocks_junior_id", table_name="achievement_unlocks"
    )
    op.drop_table("achievement_unlocks")
