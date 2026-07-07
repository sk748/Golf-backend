"""membership-number signup chain (build-phase-2 decisions 5+7)

The club membership number is the common code linking a junior signup to the
parent member. Self-registering juniors supply the parent's number and start
pending_parent; the parent's approval moves them to pending_staff;
admin/committee activate. Parent-created child accounts skip straight to
pending_staff (consent implicit); staff intake creates active juniors.

Adds:
  - users.membership_number (unique when present)
  - junior_profiles.approval_status (junior_approval_status enum,
    backfilled 'active' — every existing junior predates the chain)

Revision ID: f7signupchain
Revises: e6extverify
Create Date: 2026-06-10

"""
from alembic import op
import sqlalchemy as sa


revision = "f7signupchain"
down_revision = "e6extverify"
branch_labels = None
depends_on = None


approval_status = sa.Enum(
    "pending_parent", "pending_staff", "active", name="junior_approval_status"
)


def upgrade():
    op.add_column(
        "users", sa.Column("membership_number", sa.String(length=50), nullable=True)
    )
    op.create_unique_constraint(
        "uq_users_membership_number", "users", ["membership_number"]
    )

    approval_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "junior_profiles",
        sa.Column(
            "approval_status",
            approval_status,
            nullable=False,
            server_default="active",
        ),
    )
    op.alter_column("junior_profiles", "approval_status", server_default=None)


def downgrade():
    op.drop_column("junior_profiles", "approval_status")
    approval_status.drop(op.get_bind(), checkfirst=True)
    op.drop_constraint("uq_users_membership_number", "users", type_="unique")
    op.drop_column("users", "membership_number")
