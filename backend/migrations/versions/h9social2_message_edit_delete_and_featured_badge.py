"""message edit/delete audit trail + featured badge (social phase, round 2)

Two product changes requested 2026-06-11:
  - Messages become editable/deletable by their sender, but auditable rather
    than erased: messages gains original_body (first version, kept once an edit
    happens), edited_at, and deleted_at (soft delete -> tombstone for everyone,
    body retained for admins).
  - Players can show off one earned badge in chat: junior_profiles gains
    featured_badge_id (FK badges.id, nullable).

All new columns are nullable, so no backfill is required.

Revision ID: h9social2
Revises: g8social
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa


revision = "h9social2"
down_revision = "g8social"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("original_body", sa.Text(), nullable=True))
    op.add_column("messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("messages", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column(
        "junior_profiles",
        sa.Column("featured_badge_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_junior_profiles_featured_badge",
        "junior_profiles",
        "badges",
        ["featured_badge_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint(
        "fk_junior_profiles_featured_badge", "junior_profiles", type_="foreignkey"
    )
    op.drop_column("junior_profiles", "featured_badge_id")

    op.drop_column("messages", "deleted_at")
    op.drop_column("messages", "edited_at")
    op.drop_column("messages", "original_body")
