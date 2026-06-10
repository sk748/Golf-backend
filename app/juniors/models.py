from enum import Enum

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class ReportTemplate(str, Enum):
    skills = "skills"
    practice_scores = "practice_scores"
    competition = "competition"


class JuniorGender(str, Enum):
    male = "male"
    female = "female"


class JuniorExperience(str, Enum):
    beginner = "beginner"
    lt_1yr = "lt_1yr"
    one_3yr = "1_3yr"
    four_6yr = "4_6yr"
    seven_10yr = "7_10yr"


class JuniorAvailability(str, Enum):
    twice_weekly = "twice_weekly"
    weekends_only = "weekends_only"
    more_than_twice = "more_than_twice"
    holidays_only = "holidays_only"


class JuniorApprovalStatus(str, Enum):
    # Signup chain (build-phase-2 decisions 5+7): a junior self-registering
    # with the parent's membership number starts pending_parent; the parent's
    # approval (or a parent creating the account themselves — consent
    # implicit) moves it to pending_staff; admin/committee approval activates.
    pending_parent = "pending_parent"
    pending_staff = "pending_staff"
    active = "active"


class LevelBand(TimestampMixin, db.Model):
    __tablename__ = "level_bands"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    band_label = Column(String(100), nullable=False)
    min_level = Column(Integer, nullable=False)
    max_level = Column(Integer, nullable=False)
    min_sessions = Column(Integer, nullable=False)
    report_template = Column(
        SQLEnum(ReportTemplate, values_callable=enum_values, name="level_band_report_template"),
        nullable=False,
    )
    description = Column(Text, nullable=False)

    __table_args__ = (
        UniqueConstraint("min_level", "max_level", name="uq_level_bands_range"),
        CheckConstraint("min_level >= 1 AND max_level >= min_level", name="ck_level_bands_range"),
    )


class LevelBenchmark(TimestampMixin, db.Model):
    __tablename__ = "level_benchmarks"

    id = Column(Integer, primary_key=True)
    level_number = Column(Integer, nullable=False, unique=True)
    full_swing_target = Column(Integer, nullable=False)
    around_green_target = Column(Integer, nullable=False)
    putting_target = Column(Integer, nullable=False)
    nine_hole_target = Column(Integer, nullable=False)


class JuniorProfile(TimestampMixin, db.Model):
    __tablename__ = "junior_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, unique=True)
    parent_id = Column(String(36), ForeignKey("users.id"), nullable=True)  # nullable — set later if parent registers
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=True)   # nullable — admin assigns; unassigned until then
    date_of_birth = Column(Date, nullable=False)
    gender = Column(SQLEnum(JuniorGender, values_callable=enum_values, name="junior_gender"), nullable=False)
    current_level = Column(Integer, nullable=False)
    band_id = Column(Integer, ForeignKey("level_bands.id"), nullable=False)
    curriculum = Column(String(255), nullable=True)
    has_handicap = Column(Boolean, nullable=False, default=False)
    handicap_index = Column(Numeric(4, 1), nullable=True)
    played_us_kids = Column(Boolean, nullable=True)
    us_kids_best_score = Column(Integer, nullable=True)
    experience = Column(
        SQLEnum(JuniorExperience, values_callable=enum_values, name="junior_experience"),
        nullable=False,
    )
    availability = Column(
        SQLEnum(JuniorAvailability, values_callable=enum_values, name="junior_availability"),
        nullable=False,
    )
    medical_conditions = Column(Text, nullable=True)
    golf_goals = Column(Text, nullable=True)
    tournament_ready = Column(Boolean, nullable=False, default=False)
    approval_status = Column(
        SQLEnum(JuniorApprovalStatus, values_callable=enum_values, name="junior_approval_status"),
        nullable=False,
        default=JuniorApprovalStatus.active,  # staff intake activates directly
    )

    user = relationship("User", foreign_keys=[user_id], backref="junior_profile")
    parent = relationship("User", foreign_keys=[parent_id], backref="children")
    assigned_coach = relationship("User", foreign_keys=[coach_id], backref="assigned_juniors")
    band = relationship("LevelBand", backref="juniors")

    __table_args__ = (
        CheckConstraint("current_level BETWEEN 1 AND 9", name="ck_juniors_current_level"),
    )


class Badge(TimestampMixin, db.Model):
    __tablename__ = "badges"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    level_required = Column(Integer, nullable=True)


class JuniorBadge(TimestampMixin, db.Model):
    __tablename__ = "junior_badges"

    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), primary_key=True)
    badge_id = Column(Integer, ForeignKey("badges.id"), primary_key=True)
    awarded_date = Column(Date, nullable=False)
    awarded_by = Column(String(36), ForeignKey("users.id"), nullable=False)

    junior = relationship("JuniorProfile", backref="junior_badges")
    badge = relationship("Badge", backref="junior_badges")
    awarder = relationship("User")
