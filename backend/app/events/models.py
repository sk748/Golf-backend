"""
Events + RSVP — a general-purpose calendar-events domain, distinct from
coaching Sessions (booking/eligibility) and Tournaments (scoring lifecycle).

An Event is created by staff (admin/coach/committee) and targeted at an
audience (everyone / a level band / a coach's roster / a single junior).
Invitees can optionally RSVP (going / not_going); events may be flagged
mandatory. Audience resolution mirrors the announcements `_audience_user_ids`
resolver — see app/events/controllers.py:resolve_event_user_ids.
"""
from enum import Enum

from sqlalchemy import (
    Boolean, Column, Date, ForeignKey, Integer, String, Text, Time,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class EventAudience(str, Enum):
    everyone = "everyone"
    band = "band"
    coach_group = "coach_group"
    individual = "individual"


class EventStatus(str, Enum):
    scheduled = "scheduled"
    cancelled = "cancelled"


class RSVPStatus(str, Enum):
    going = "going"
    not_going = "not_going"


class Event(TimestampMixin, db.Model):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)  # creator
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    audience = Column(
        SQLEnum(EventAudience, values_callable=enum_values, name="event_audience"),
        nullable=False,
    )
    band_id = Column(Integer, ForeignKey("level_bands.id"), nullable=True)      # audience='band'
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=True)        # audience='coach_group'
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=True)  # audience='individual'
    rsvp_required = Column(Boolean, nullable=False, default=False)
    mandatory = Column(Boolean, nullable=False, default=False)
    status = Column(
        SQLEnum(EventStatus, values_callable=enum_values, name="event_status"),
        nullable=False,
        default=EventStatus.scheduled,
    )

    owner = relationship("User", foreign_keys=[owner_id])
    band = relationship("LevelBand")
    coach = relationship("User", foreign_keys=[coach_id])
    junior = relationship("JuniorProfile", foreign_keys=[junior_id])


class EventRSVP(TimestampMixin, db.Model):
    __tablename__ = "event_rsvps"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    status = Column(
        SQLEnum(RSVPStatus, values_callable=enum_values, name="event_rsvp_status"),
        nullable=False,
    )

    event = relationship("Event", backref="rsvps")
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_rsvps_event_user"),
    )
