"""coach assignment (junior_profiles.coach_id) + RSVP entry statuses

Captures the two post-baseline schema changes that were applied to dev via
create_all but never recorded as a revision:
  1. junior_profiles.coach_id  — admin -> coach junior assignment
  2. entry_status enum gains 'interested' and 'declined' — the player-RSVP ->
     parent-approval lifecycle

Revision ID: b2f1rsvpcoach
Revises: a1d100audit
Create Date: 2026-06-09

"""
from alembic import op
import sqlalchemy as sa


revision = "b2f1rsvpcoach"
down_revision = "a1d100audit"
branch_labels = None
depends_on = None


def upgrade():
    # 1. coach_id on junior_profiles (nullable — juniors are unassigned until
    #    an admin assigns them; FK -> users.id, matching parent_id's type).
    op.add_column(
        "junior_profiles",
        sa.Column("coach_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_junior_profiles_coach_id_users",
        "junior_profiles", "users",
        ["coach_id"], ["id"],
    )

    # 2. Extend the entry_status enum. ALTER TYPE ... ADD VALUE must run outside
    #    a transaction block, so use Alembic's autocommit block (PG 12+ also
    #    needs IF NOT EXISTS for idempotency).
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE entry_status ADD VALUE IF NOT EXISTS 'interested'")
        op.execute("ALTER TYPE entry_status ADD VALUE IF NOT EXISTS 'declined'")


def downgrade():
    op.drop_constraint("fk_junior_profiles_coach_id_users", "junior_profiles", type_="foreignkey")
    op.drop_column("junior_profiles", "coach_id")

    # Postgres can't drop enum values in place — recreate the type without the
    # two added values. Fails if any row still uses 'interested'/'declined'
    # (migrate those rows first). No server_default on the column to preserve.
    op.execute("ALTER TYPE entry_status RENAME TO entry_status_old")
    op.execute("CREATE TYPE entry_status AS ENUM ('registered', 'confirmed', 'withdrawn')")
    op.execute(
        "ALTER TABLE tournament_entries ALTER COLUMN status "
        "TYPE entry_status USING status::text::entry_status"
    )
    op.execute("DROP TYPE entry_status_old")
