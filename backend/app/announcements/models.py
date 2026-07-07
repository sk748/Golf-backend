"""
Announcements (social phase, decisions 6+7, 2026-06-11).

Internal announcements (admin + committee create) go live immediately and are
targeted: everyone | specific roles (csv) | a level band | a coach's group.
External announcements feed the public landing page: committee-created start
as drafts, admin-created (or admin-published) go straight to published.
"""
from enum import Enum

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, String, Text,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class AnnouncementAudience(str, Enum):
    everyone = "everyone"
    roles = "roles"
    band = "band"
    coach_group = "coach_group"


class AnnouncementStatus(str, Enum):
    draft = "draft"
    published = "published"


class Announcement(TimestampMixin, db.Model):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    author_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    audience = Column(
        SQLEnum(AnnouncementAudience, values_callable=enum_values, name="announcement_audience"),
        nullable=False,
    )
    roles = Column(String(100), nullable=True)   # csv of role names, audience='roles'
    band_id = Column(Integer, ForeignKey("level_bands.id"), nullable=True)   # audience='band'
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=True)     # audience='coach_group'
    is_external = Column(Boolean, nullable=False, default=False)
    status = Column(
        SQLEnum(AnnouncementStatus, values_callable=enum_values, name="announcement_status"),
        nullable=False,
    )
    published_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)  # set when author/admin edits

    author = relationship("User", foreign_keys=[author_id])
    publisher = relationship("User", foreign_keys=[published_by])
    band = relationship("LevelBand")
    coach = relationship("User", foreign_keys=[coach_id])
