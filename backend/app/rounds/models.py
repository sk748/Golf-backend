from enum import Enum

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, ForeignKey,
    Integer, Numeric, String, UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class RoundType(str, Enum):
    casual = "casual"
    tournament = "tournament"
    competition = "competition"


class RoundStatus(str, Enum):
    # Player-entered rounds start pending and only feed the handicap engine
    # once a coach/admin/committee member verifies them; staff-entered rounds
    # are verified immediately (build-phase-2 decisions 1-2).
    pending = "pending"
    verified = "verified"


class Round(TimestampMixin, db.Model):
    __tablename__ = "rounds"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    tee_set_id = Column(Integer, ForeignKey("tee_sets.id"), nullable=False)
    date_played = Column(Date, nullable=False)
    round_type = Column(SQLEnum(RoundType, values_callable=enum_values, name="round_type"), nullable=False)
    competition_name = Column(String(255), nullable=True)
    gross_score = Column(Integer, nullable=False)
    adjusted_gross_score = Column(Integer, nullable=True)
    score_differential = Column(Numeric(4, 1), nullable=True)
    pcc_adjustment = Column(Numeric(3, 1), nullable=True)
    handicap_before = Column(Numeric(4, 1), nullable=True)
    handicap_after = Column(Numeric(4, 1), nullable=True)
    # Verification + counting (build-phase-2): only verified AND counting
    # rounds feed the handicap-index recompute.
    status = Column(
        SQLEnum(RoundStatus, values_callable=enum_values, name="round_status"),
        nullable=False,
        default=RoundStatus.verified,
    )
    counts_toward_handicap = Column(Boolean, nullable=False, default=True)
    entered_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    verified_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    verified_date = Column(Date, nullable=True)

    user = relationship("User", foreign_keys=[user_id], backref="rounds")
    course = relationship("Course", backref="rounds")
    tee_set = relationship("TeeSet", backref="rounds")


class HoleScore(TimestampMixin, db.Model):
    __tablename__ = "hole_scores"

    id = Column(Integer, primary_key=True)
    round_id = Column(Integer, ForeignKey("rounds.id"), nullable=False)
    hole_number = Column(Integer, nullable=False)
    strokes = Column(Integer, nullable=False)
    putts = Column(Integer, nullable=True)
    fairway_hit = Column(Boolean, nullable=True)
    gir = Column(Boolean, nullable=True)

    round = relationship("Round", backref="hole_scores")

    __table_args__ = (
        UniqueConstraint("round_id", "hole_number", name="uq_hole_scores_round_hole"),
        CheckConstraint("hole_number BETWEEN 1 AND 18", name="ck_hole_scores_hole_number"),
        CheckConstraint("strokes > 0", name="ck_hole_scores_strokes"),
    )
