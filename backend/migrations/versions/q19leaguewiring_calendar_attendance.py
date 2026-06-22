"""junior league wiring — calendar event link + attendance source

F2 of the Junior League build. Wires fixtures into the existing calendar/RSVP
and coaching-attendance systems:
  - league_fixtures.event_id  → the auto-managed calendar Event mirroring a fixture
    (so fixtures show in /calendar and supporters can RSVP via the events domain).
  - attendance.session_id      made NULLABLE, and a new attendance.league_fixture_id
    added, so a selected player's participation in a completed fixture records
    coaching attendance WITHOUT a coaching Session. Exactly one source is required
    (check constraint), and a fixture+junior pair is unique.

Purely additive except for relaxing attendance.session_id to nullable.

Revision ID: q19leaguewiring
Revises: q18league
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa


revision = 'q19leaguewiring'
down_revision = 'q18league'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "league_fixtures",
        sa.Column("event_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_league_fixtures_event", "league_fixtures", "events",
        ["event_id"], ["id"],
    )

    op.alter_column("attendance", "session_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "attendance",
        sa.Column("league_fixture_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_attendance_league_fixture", "attendance", "league_fixtures",
        ["league_fixture_id"], ["id"],
    )
    op.create_unique_constraint(
        "uq_attendance_fixture_junior", "attendance",
        ["league_fixture_id", "junior_id"],
    )
    # Exactly one source: a coaching session XOR a league fixture.
    op.create_check_constraint(
        "ck_attendance_source", "attendance",
        "(session_id IS NOT NULL) <> (league_fixture_id IS NOT NULL)",
    )


def downgrade():
    op.drop_constraint("ck_attendance_source", "attendance", type_="check")
    op.drop_constraint("uq_attendance_fixture_junior", "attendance", type_="unique")
    op.drop_constraint("fk_attendance_league_fixture", "attendance", type_="foreignkey")
    op.drop_column("attendance", "league_fixture_id")
    op.alter_column("attendance", "session_id", existing_type=sa.Integer(), nullable=False)

    op.drop_constraint("fk_league_fixtures_event", "league_fixtures", type_="foreignkey")
    op.drop_column("league_fixtures", "event_id")
