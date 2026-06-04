from enum import Enum

from sqlalchemy import (
    Boolean, Column, Date, ForeignKey, Integer, String,
    Text, Time, UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class SessionType(str, Enum):
    group = "group"
    one_on_one = "one_on_one"
    evaluation = "evaluation"
    tournament_prep = "tournament_prep"


class SessionStatus(str, Enum):
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"


class ClassEnrollmentStatus(str, Enum):
    active = "active"
    dropped = "dropped"


class BookingRequestStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    declined = "declined"


class Class(TimestampMixin, db.Model):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    band_id = Column(Integer, ForeignKey("level_bands.id"), nullable=True)
    age_group = Column(String(50), nullable=True)
    schedule = Column(String(255), nullable=False)
    max_students = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    coach = relationship("User", backref="classes")
    band = relationship("LevelBand", backref="classes")


class ClassEnrollment(TimestampMixin, db.Model):
    __tablename__ = "class_enrollments"

    id = Column(Integer, primary_key=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    enrolled_date = Column(Date, nullable=False)
    status = Column(
        SQLEnum(ClassEnrollmentStatus, values_callable=enum_values, name="class_enrollment_status"),
        nullable=False,
    )

    klass = relationship("Class", backref="enrollments")
    junior = relationship("JuniorProfile", backref="class_enrollments")

    __table_args__ = (
        UniqueConstraint("class_id", "junior_id", name="uq_class_enrollments_class_junior"),
    )


class Session(TimestampMixin, db.Model):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=True)
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    session_type = Column(
        SQLEnum(SessionType, values_callable=enum_values, name="session_type"),
        nullable=False,
    )
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(
        SQLEnum(SessionStatus, values_callable=enum_values, name="session_status"),
        nullable=False,
    )

    klass = relationship("Class", backref="sessions")
    coach = relationship("User", backref="sessions")


class BookingRequest(TimestampMixin, db.Model):
    __tablename__ = "booking_requests"

    id = Column(Integer, primary_key=True)
    parent_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    preferred_date = Column(Date, nullable=False)
    preferred_time = Column(Time, nullable=False)
    status = Column(
        SQLEnum(BookingRequestStatus, values_callable=enum_values, name="booking_request_status"),
        nullable=False,
    )
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    admin_notes = Column(Text, nullable=True)

    parent = relationship("User", foreign_keys=[parent_id], backref="booking_requests")
    junior = relationship("JuniorProfile", backref="booking_requests")
    coach = relationship("User", foreign_keys=[coach_id])
    session = relationship("Session", backref="booking_request")
