"""group-session publishing (build-phase-2 decision 4)

A coach publishes a session open for booking with a capacity and eligibility
requirements (max attendance, level/age bounds, focus title, free-text
requirements); students/parents book onto it via booking_requests.session_id
(already present) and a coach/admin approves with one sign-off.

Adds to sessions:
  - title (focus, e.g. "Short game + putting")
  - open_for_booking (bool, backfilled false — existing sessions stay private)
  - max_attendance, level_min/max, age_min/max (nullable = unrestricted)
  - requirements (text)

Revision ID: d5groupsession
Revises: c4roundverify
Create Date: 2026-06-10

"""
from alembic import op
import sqlalchemy as sa


revision = "d5groupsession"
down_revision = "c4roundverify"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sessions", sa.Column("title", sa.String(length=255), nullable=True))
    op.add_column(
        "sessions",
        sa.Column(
            "open_for_booking",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("sessions", "open_for_booking", server_default=None)
    op.add_column("sessions", sa.Column("max_attendance", sa.Integer(), nullable=True))
    op.add_column("sessions", sa.Column("level_min", sa.Integer(), nullable=True))
    op.add_column("sessions", sa.Column("level_max", sa.Integer(), nullable=True))
    op.add_column("sessions", sa.Column("age_min", sa.Integer(), nullable=True))
    op.add_column("sessions", sa.Column("age_max", sa.Integer(), nullable=True))
    op.add_column("sessions", sa.Column("requirements", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("sessions", "requirements")
    op.drop_column("sessions", "age_max")
    op.drop_column("sessions", "age_min")
    op.drop_column("sessions", "level_max")
    op.drop_column("sessions", "level_min")
    op.drop_column("sessions", "max_attendance")
    op.drop_column("sessions", "open_for_booking")
    op.drop_column("sessions", "title")
