"""competition-requirement tracking (Junior Development Plan)

The Junior Development Plan mandates specific competitions per band (e.g. Karen
Junior Challenge mandatory for L6-8; Faldo Series mandatory for L9+). To compute
per-junior compliance we tag internal events with a competition taxonomy.

Adds:
  - competition_type enum (CompetitionType)
  - tournaments.competition_type (nullable; no backfill — untagged events are
    simply not tracked competitions)

External results keep their existing external_event_type column; their values
are mapped onto this taxonomy in code (controllers.EXTERNAL_EVENT_TO_COMPETITION),
so external_results is intentionally NOT migrated here.

Revision ID: l13compreq
Revises: k12participant
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa


revision = "l13compreq"
down_revision = "k12participant"
branch_labels = None
depends_on = None


competition_type = sa.Enum(
    "karen_junior_challenge",
    "faldo_series",
    "us_kids",
    "jgf",
    "karen_strokeplay",
    "main_league",
    "other",
    name="competition_type",
)


def upgrade():
    competition_type.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "tournaments",
        sa.Column("competition_type", competition_type, nullable=True),
    )


def downgrade():
    op.drop_column("tournaments", "competition_type")
    competition_type.drop(op.get_bind(), checkfirst=True)
