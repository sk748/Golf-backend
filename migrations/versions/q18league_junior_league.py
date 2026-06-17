"""junior league — inter-club match-play league domain

Adds the league, league_teams, league_fixtures, and league_pairings tables
plus their Postgres enums (league_status, fixture_status, pairing_format,
pairing_result). Purely additive; no data seeded.

Revision ID: q18league
Revises: p17handicapprov
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'q18league'
down_revision = 'p17handicapprov'
branch_labels = None
depends_on = None


league_status = sa.Enum(
    "draft", "active", "completed", "archived",
    name="league_status",
)
fixture_status = sa.Enum(
    "scheduled", "in_progress", "completed", "cancelled",
    name="fixture_status",
)
pairing_format = sa.Enum(
    "singles", "foursomes", "fourball",
    name="pairing_format",
)
pairing_result = sa.Enum(
    "home_win", "away_win", "halved", "pending",
    name="pairing_result",
)

ENUMS = (league_status, fixture_status, pairing_format, pairing_result)


def _enum(name, *values):
    """Reference an enum created above without re-issuing CREATE TYPE."""
    return postgresql.ENUM(*values, name=name, create_type=False)


def upgrade():
    bind = op.get_bind()
    for enum in ENUMS:
        enum.create(bind, checkfirst=True)

    op.create_table(
        "leagues",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            _enum("league_status", "draft", "active", "completed", "archived"),
            nullable=False,
        ),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("points_win", sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column("points_halve", sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column("points_loss", sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "league_teams",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("league_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("short_name", sa.String(length=100), nullable=True),
        sa.Column("is_home_club", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["league_id"], ["leagues.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "league_fixtures",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("league_id", sa.Integer(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("home_team_id", sa.Integer(), nullable=False),
        sa.Column("away_team_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            _enum("fixture_status", "scheduled", "in_progress", "completed", "cancelled"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["league_id"], ["leagues.id"]),
        sa.ForeignKeyConstraint(["home_team_id"], ["league_teams.id"]),
        sa.ForeignKeyConstraint(["away_team_id"], ["league_teams.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "league_pairings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("pairing_order", sa.Integer(), nullable=True),
        sa.Column(
            "format",
            _enum("pairing_format", "singles", "foursomes", "fourball"),
            nullable=False,
        ),
        sa.Column("home_junior_id", sa.Integer(), nullable=True),
        sa.Column("home_partner_junior_id", sa.Integer(), nullable=True),
        sa.Column("home_label", sa.String(length=255), nullable=True),
        sa.Column("away_label", sa.String(length=255), nullable=True),
        sa.Column("away_partner_label", sa.String(length=255), nullable=True),
        sa.Column(
            "result",
            _enum("pairing_result", "home_win", "away_win", "halved", "pending"),
            nullable=False,
        ),
        sa.Column("margin", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["league_fixtures.id"]),
        sa.ForeignKeyConstraint(["home_junior_id"], ["junior_profiles.id"]),
        sa.ForeignKeyConstraint(["home_partner_junior_id"], ["junior_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("league_pairings")
    op.drop_table("league_fixtures")
    op.drop_table("league_teams")
    op.drop_table("leagues")
    bind = op.get_bind()
    for enum in reversed(ENUMS):
        enum.drop(bind, checkfirst=True)
