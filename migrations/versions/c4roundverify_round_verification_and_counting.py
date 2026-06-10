"""round verification + per-round counting (build-phase-2 decisions 1-3)

Player-entered rounds now start 'pending' and only feed the handicap engine
once a coach/admin/committee member verifies them; every round carries a
counts_toward_handicap flag (practice-only rounds store a differential but are
excluded from the index recompute).

Adds to rounds:
  - status (round_status enum: pending|verified), backfilled 'verified'
  - counts_toward_handicap (bool, backfilled true)
  - entered_by / verified_by (users FKs, nullable)
  - verified_date (date, nullable)

Revision ID: c4roundverify
Revises: b2f1rsvpcoach
Create Date: 2026-06-10

"""
from alembic import op
import sqlalchemy as sa


revision = "c4roundverify"
down_revision = "b2f1rsvpcoach"
branch_labels = None
depends_on = None


round_status = sa.Enum("pending", "verified", name="round_status")


def upgrade():
    round_status.create(op.get_bind(), checkfirst=True)

    # Existing rounds predate verification — they already fed the index, so
    # backfill them verified + counting via server_default, then drop the
    # defaults (the app sets both explicitly).
    op.add_column(
        "rounds",
        sa.Column("status", round_status, nullable=False, server_default="verified"),
    )
    op.add_column(
        "rounds",
        sa.Column(
            "counts_toward_handicap",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("rounds", "status", server_default=None)
    op.alter_column("rounds", "counts_toward_handicap", server_default=None)

    op.add_column("rounds", sa.Column("entered_by", sa.String(length=36), nullable=True))
    op.add_column("rounds", sa.Column("verified_by", sa.String(length=36), nullable=True))
    op.add_column("rounds", sa.Column("verified_date", sa.Date(), nullable=True))
    op.create_foreign_key(
        "fk_rounds_entered_by_users", "rounds", "users", ["entered_by"], ["id"]
    )
    op.create_foreign_key(
        "fk_rounds_verified_by_users", "rounds", "users", ["verified_by"], ["id"]
    )


def downgrade():
    op.drop_constraint("fk_rounds_verified_by_users", "rounds", type_="foreignkey")
    op.drop_constraint("fk_rounds_entered_by_users", "rounds", type_="foreignkey")
    op.drop_column("rounds", "verified_date")
    op.drop_column("rounds", "verified_by")
    op.drop_column("rounds", "entered_by")
    op.drop_column("rounds", "counts_toward_handicap")
    op.drop_column("rounds", "status")
    round_status.drop(op.get_bind(), checkfirst=True)
