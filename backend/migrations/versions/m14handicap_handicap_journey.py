"""handicap-journey tracking (Junior Development Plan, L4-5 "Attaining Handicap")

A per-junior coaching-progress view of the path toward a FIRST handicap: the
coach develops a plan to get scorecards signed (targeting 9-hole 60-65 and
18-hole 120-130 strokes). This is NOT a WHS calculation — the WHS engine still
owns handicap_index. A "signed scorecard" maps to a VERIFIED round.

Adds:
  - handicap_journey_status enum (HandicapJourneyStatus)
  - handicap_journeys table (one row per junior; junior_id UNIQUE)

Revision ID: m14handicap
Revises: l13compreq
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "m14handicap"
down_revision = "l13compreq"
branch_labels = None
depends_on = None


handicap_journey_status = postgresql.ENUM(
    "not_started",
    "in_progress",
    "cards_submitted",
    "attained",
    name="handicap_journey_status",
)


def upgrade():
    handicap_journey_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "handicap_journeys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("junior_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            # create_type=False: we created the enum above; stop create_table
            # from emitting a second CREATE TYPE (DuplicateObject otherwise).
            postgresql.ENUM(
                "not_started", "in_progress", "cards_submitted", "attained",
                name="handicap_journey_status", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("target_signed_cards", sa.Integer(), nullable=False),
        sa.Column("coach_notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attained_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["junior_id"], ["junior_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("junior_id", name="uq_handicap_journeys_junior"),
    )


def downgrade():
    op.drop_table("handicap_journeys")
    handicap_journey_status.drop(op.get_bind(), checkfirst=True)
