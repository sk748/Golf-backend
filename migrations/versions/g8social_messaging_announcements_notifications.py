"""social phase — messaging, announcements, notifications (decisions 2026-06-11)

The social-features phase adds three domains in one pass:

  - Messaging: role-matrix DMs + groups (each coach's roster auto-creates a
    "players" and a "parents" group chat, unique per (coach_id, roster_kind)).
    Messages are immutable; moderation is a status change (visible/held/hidden
    — 'held' = tripped the banned-word filter, 'hidden' = admin moderated,
    body retained). message_flags is the admin review queue (open/resolved).
  - Announcements: internal targeted announcements (everyone / roles csv /
    level band / coach group) live immediately; external ones power the
    public landing page via a committee-draft -> admin-publish flow.
  - Notifications: the in-app bell feed (first_contact, message_held,
    message_flagged, ...) with JSON payloads and per-row read state.

Revision ID: g8social
Revises: f7signupchain
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "g8social"
down_revision = "f7signupchain"
branch_labels = None
depends_on = None


conversation_type = sa.Enum("dm", "group", name="conversation_type")
roster_kind = sa.Enum("players", "parents", name="roster_kind")
message_status = sa.Enum("visible", "held", "hidden", name="message_status")
flag_status = sa.Enum("open", "resolved", name="flag_status")
announcement_audience = sa.Enum(
    "everyone", "roles", "band", "coach_group", name="announcement_audience"
)
announcement_status = sa.Enum("draft", "published", name="announcement_status")

ENUMS = (
    conversation_type, roster_kind, message_status,
    flag_status, announcement_audience, announcement_status,
)


def _enum(name, *values):
    """Reference an enum created above without re-issuing CREATE TYPE."""
    return postgresql.ENUM(*values, name=name, create_type=False)


def upgrade():
    bind = op.get_bind()
    for enum in ENUMS:
        enum.create(bind, checkfirst=True)

    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("type", _enum("conversation_type", "dm", "group"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("roster_kind", _enum("roster_kind", "players", "parents"), nullable=True),
        sa.Column("coach_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("coach_id", "roster_kind", name="uq_conversations_coach_roster"),
    )

    op.create_table(
        "conversation_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conversation_members_conv_user"),
    )
    op.create_index(
        "ix_conversation_members_user_id", "conversation_members", ["user_id"]
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("sender_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            _enum("message_status", "visible", "held", "hidden"),
            nullable=False,
        ),
        sa.Column("held_reason", sa.String(length=255), nullable=True),
        sa.Column("moderated_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])

    op.create_table(
        "message_flags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("messages.id"), nullable=False),
        sa.Column("flagged_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("status", _enum("flag_status", "open", "resolved"), nullable=False),
        sa.Column("resolved_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_message_flags_message_id", "message_flags", ["message_id"])

    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "audience",
            _enum("announcement_audience", "everyone", "roles", "band", "coach_group"),
            nullable=False,
        ),
        sa.Column("roles", sa.String(length=100), nullable=True),
        sa.Column("band_id", sa.Integer(), sa.ForeignKey("level_bands.id"), nullable=True),
        sa.Column("coach_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_external", sa.Boolean(), nullable=False),
        sa.Column(
            "status",
            _enum("announcement_status", "draft", "published"),
            nullable=False,
        ),
        sa.Column("published_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade():
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
    op.drop_table("announcements")
    op.drop_index("ix_message_flags_message_id", table_name="message_flags")
    op.drop_table("message_flags")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversation_members_user_id", table_name="conversation_members")
    op.drop_table("conversation_members")
    op.drop_table("conversations")

    bind = op.get_bind()
    for enum in ENUMS:
        enum.drop(bind, checkfirst=True)
