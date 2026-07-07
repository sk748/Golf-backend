from enum import Enum

from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import backref, relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class AttendanceStatus(str, Enum):
    present = "present"
    absent = "absent"
    excused = "excused"


class Attendance(TimestampMixin, db.Model):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True)
    # Exactly one source: a coaching Session OR a Junior League fixture (see the
    # ck_attendance_source check). session_id is nullable so league participation
    # can record attendance without a coaching session.
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    league_fixture_id = Column(Integer, ForeignKey("league_fixtures.id"), nullable=True)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    status = Column(
        SQLEnum(AttendanceStatus, values_callable=enum_values, name="attendance_status"),
        nullable=False,
    )

    session = relationship("Session", backref="attendance")
    # Cascade so deleting a fixture removes its auto league-attendance (these rows
    # have session_id NULL, so this never touches coaching-session attendance).
    league_fixture = relationship(
        "LeagueFixture",
        backref=backref("attendance", cascade="all, delete-orphan"),
    )
    junior = relationship("JuniorProfile", backref="attendance")

    __table_args__ = (
        UniqueConstraint("session_id", "junior_id", name="uq_attendance_session_junior"),
        UniqueConstraint("league_fixture_id", "junior_id", name="uq_attendance_fixture_junior"),
        CheckConstraint(
            "(session_id IS NOT NULL) <> (league_fixture_id IS NOT NULL)",
            name="ck_attendance_source",
        ),
    )
