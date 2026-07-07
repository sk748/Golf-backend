"""handicap provenance columns

Adds manual-override provenance to users.handicap_index so admin/coach/committee
can input a handicap by hand (e.g. JGF / external events where the WHS calculator
lacks course data) and the source is auditable:
  - handicap_source  : 'computed' (WHS engine) | 'manual' (staff-entered) | NULL
  - handicap_set_by  : user id of the staff member who last set it manually
  - handicap_set_at  : when it was last set

Purely additive (three nullable columns on users).

Revision ID: p17handicapprov
Revises: 459abc1banned
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'p17handicapprov'
down_revision = '459abc1banned'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("handicap_source", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("handicap_set_by", sa.String(length=36), nullable=True))
    op.add_column("users", sa.Column("handicap_set_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "handicap_set_at")
    op.drop_column("users", "handicap_set_by")
    op.drop_column("users", "handicap_source")
