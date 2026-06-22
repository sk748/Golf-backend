from enum import Enum

from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

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
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    status = Column(
        SQLEnum(AttendanceStatus, values_callable=enum_values, name="attendance_status"),
        nullable=False,
    )

    session = relationship("Session", backref="attendance")
    junior = relationship("JuniorProfile", backref="attendance")

    __table_args__ = (
        UniqueConstraint("session_id", "junior_id", name="uq_attendance_session_junior"),
    )
