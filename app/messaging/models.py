"""
Messaging domain (social phase).

Conversations are either DMs (exactly two members, who-may-message-whom is
enforced by the role matrix in controllers.can_dm) or groups. Each coach's
roster auto-creates two groups — "players" and "parents" — whose membership
syncs lazily with the coach's current junior assignments
(junior_profiles.coach_id).

A sender may EDIT or DELETE their own message. Both are audited, not erased:
an edit keeps the first body in `original_body` and stamps `edited_at`; a
delete stamps `deleted_at` and shows everyone a tombstone while the real body
is retained for admins. An admin can additionally hide a message (moderation).
"""
from enum import Enum

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class ConversationType(str, Enum):
    dm = "dm"
    group = "group"


class RosterKind(str, Enum):
    players = "players"
    parents = "parents"


class MessageStatus(str, Enum):
    visible = "visible"
    held = "held"      # tripped the banned-word filter; only sender + admin see it
    hidden = "hidden"  # moderated away by an admin; only admin sees it (body retained)


class FlagStatus(str, Enum):
    open = "open"
    resolved = "resolved"


class Conversation(TimestampMixin, db.Model):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True)
    type = Column(
        SQLEnum(ConversationType, values_callable=enum_values, name="conversation_type"),
        nullable=False,
    )
    name = Column(String(120), nullable=True)  # groups only; DMs derive a name per viewer
    # Auto roster groups only: which coach's roster and which side of it.
    roster_kind = Column(
        SQLEnum(RosterKind, values_callable=enum_values, name="roster_kind"),
        nullable=True,
    )
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    coach = relationship("User", foreign_keys=[coach_id])
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        UniqueConstraint("coach_id", "roster_kind", name="uq_conversations_coach_roster"),
    )


class ConversationMember(TimestampMixin, db.Model):
    __tablename__ = "conversation_members"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    last_read_at = Column(DateTime(timezone=True), nullable=True)

    conversation = relationship("Conversation", backref="members")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_members_conv_user"),
    )


class Message(TimestampMixin, db.Model):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    sender_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(
        SQLEnum(MessageStatus, values_callable=enum_values, name="message_status"),
        nullable=False,
        default=MessageStatus.visible,
    )
    held_reason = Column(String(255), nullable=True)
    moderated_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    moderated_at = Column(DateTime(timezone=True), nullable=True)
    # Edit/delete audit trail (sender-driven). original_body holds the FIRST
    # body once an edit happens; edited_at/deleted_at mark the events. A deleted
    # message keeps its body in the row — only the serializer tombstones it for
    # non-admins.
    original_body = Column(Text, nullable=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    conversation = relationship("Conversation", backref="messages")
    sender = relationship("User", foreign_keys=[sender_id])
    moderator = relationship("User", foreign_keys=[moderated_by])


class BannedWordAttempt(TimestampMixin, db.Model):
    """A blocked banned-word attempt (block/warn/log model, 2026-06-16).

    The offending message is rejected and never stored as content — only the
    matched term + who/where/when are kept, enough to escalate repeat offenders
    to admins without retaining what the user tried to say. `created_at`
    (TimestampMixin) drives the rolling-window repeat count.
    """
    __tablename__ = "banned_word_attempts"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    matched_word = Column(String(80), nullable=False)
    context = Column(String(20), nullable=False, default="message")  # message | edit

    user = relationship("User")


class MessageFlag(TimestampMixin, db.Model):
    __tablename__ = "message_flags"

    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False, index=True)
    flagged_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    reason = Column(String(255), nullable=True)
    status = Column(
        SQLEnum(FlagStatus, values_callable=enum_values, name="flag_status"),
        nullable=False,
        default=FlagStatus.open,
    )
    resolved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    message = relationship("Message", backref="flags")
    flagger = relationship("User", foreign_keys=[flagged_by])
    resolver = relationship("User", foreign_keys=[resolved_by])
