"""seed starter recognition badges

The badge catalog ships empty; this seeds a starter set of staff-awardable
recognition badges (distinct from the auto-unlocked stat achievements). Idempotent
— only inserts a name that isn't already present, so it's safe to run against a
catalog an admin has already added to. Downgrade removes only the seeded names.

Revision ID: o16seedbadges
Revises: n15achunlock
Create Date: 2026-06-11

"""
from datetime import datetime

import sqlalchemy as sa
from alembic import op


revision = "o16seedbadges"
down_revision = "n15achunlock"
branch_labels = None
depends_on = None


# (name, description, level_required)
STARTER_BADGES = [
    ("Most Improved", "Biggest leap in skill and scores over the term.", None),
    ("Sportsmanship", "Exemplary conduct, honesty, and respect on the course.", None),
    ("Coach's Player of the Month", "The coach's standout junior this month.", None),
    ("Practice Hero", "Outstanding attendance and commitment to training.", None),
    ("Etiquette Star", "Model course etiquette and care for the game.", None),
    ("Team Spirit", "Encourages and supports fellow juniors.", None),
    ("Comeback Award", "Bounced back from a tough stretch with great attitude.", None),
]


def _badges_table():
    return sa.table(
        "badges",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("level_required", sa.Integer),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )


def upgrade():
    bind = op.get_bind()
    badges = _badges_table()
    existing = {
        row[0]
        for row in bind.execute(sa.text("SELECT name FROM badges")).fetchall()
    }
    now = datetime.utcnow()
    rows = [
        {
            "name": name,
            "description": desc,
            "level_required": lvl,
            "created_at": now,
            "updated_at": now,
        }
        for (name, desc, lvl) in STARTER_BADGES
        if name not in existing
    ]
    if rows:
        op.bulk_insert(badges, rows)


def downgrade():
    bind = op.get_bind()
    names = [name for (name, _d, _l) in STARTER_BADGES]
    bind.execute(
        sa.text("DELETE FROM badges WHERE name = ANY(:names)"),
        {"names": names},
    )
