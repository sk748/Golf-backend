"""announcement edit marker (Sam 2026-06-11)

Announcements become editable by their author/admin via PUT /api/announcements/:id.
Adds announcements.edited_at (nullable) so the feed can show an 'edited' marker.

Revision ID: j11annedit
Revises: i10featured
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa


revision = "j11annedit"
down_revision = "i10featured"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "announcements",
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("announcements", "edited_at")
