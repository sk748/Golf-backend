"""external-result verification (build-phase-2 decision 11)

Parents may log external results for their own child; a staff member verifies
before the result feeds the junior's competitions-played / best-gross stats.
Staff-logged results are verified at creation.

Adds to external_results:
  - verified (bool, backfilled TRUE — every existing row was staff-logged)
  - verified_by (users FK, nullable)

Revision ID: e6extverify
Revises: d5groupsession
Create Date: 2026-06-10

"""
from alembic import op
import sqlalchemy as sa


revision = "e6extverify"
down_revision = "d5groupsession"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "external_results",
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.alter_column("external_results", "verified", server_default=None)
    op.add_column(
        "external_results",
        sa.Column("verified_by", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_external_results_verified_by_users",
        "external_results", "users",
        ["verified_by"], ["id"],
    )


def downgrade():
    op.drop_constraint(
        "fk_external_results_verified_by_users", "external_results", type_="foreignkey"
    )
    op.drop_column("external_results", "verified_by")
    op.drop_column("external_results", "verified")
