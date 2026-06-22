"""junior participant type (registered_junior / club_beginner / karen_academy)

Models the three participant groups from the Junior Development Plan.
No billing/charging logic — type tracking only.

Revision ID: k12participant
Revises: j11annedit
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa


revision = "k12participant"
down_revision = "j11annedit"
branch_labels = None
depends_on = None


participant_type = sa.Enum(
    "registered_junior", "club_beginner", "karen_academy",
    name="junior_participant_type",
)


def upgrade():
    participant_type.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "junior_profiles",
        sa.Column(
            "participant_type",
            participant_type,
            nullable=False,
            server_default="registered_junior",
        ),
    )
    op.alter_column("junior_profiles", "participant_type", server_default=None)


def downgrade():
    op.drop_column("junior_profiles", "participant_type")
    participant_type.drop(op.get_bind(), checkfirst=True)
