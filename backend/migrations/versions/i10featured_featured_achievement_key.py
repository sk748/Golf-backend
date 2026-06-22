"""featured achievement key — unify the show-off award (Sam 2026-06-11)

A junior can show off ONE award in chat from either of two sources: a
staff-granted Badge (junior_profiles.featured_badge_id, added in h9social2) or
an auto-unlocked Achievement from the frontend catalog. This adds the second:
junior_profiles.featured_achievement_key (nullable string key). At most one of
the two is set; the controller clears the other when one is chosen.

Revision ID: i10featured
Revises: h9social2
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa


revision = "i10featured"
down_revision = "h9social2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "junior_profiles",
        sa.Column("featured_achievement_key", sa.String(length=80), nullable=True),
    )


def downgrade():
    op.drop_column("junior_profiles", "featured_achievement_key")
