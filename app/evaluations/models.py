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


class EvaluationAssessment(str, Enum):
    below_expectation = "below_expectation"
    meeting_expectation = "meeting_expectation"
    exceeding_expectation = "exceeding_expectation"


class EvaluationRecommendation(str, Enum):
    continue_level = "continue_level"
    move_next_level = "move_next_level"


class Evaluation(TimestampMixin, db.Model):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    coach_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    report_month = Column(Date, nullable=False)
    current_level = Column(Integer, nullable=False)
    attendance_count = Column(Integer, nullable=False)
    attendance_total = Column(Integer, nullable=True)
    assessment = Column(
        SQLEnum(EvaluationAssessment, values_callable=enum_values, name="evaluation_assessment"),
        nullable=False,
    )
    recommendation = Column(
        SQLEnum(EvaluationRecommendation, values_callable=enum_values, name="evaluation_recommendation"),
        nullable=False,
    )
    special_remarks = Column(Text, nullable=True)
    putting_assessment = Column(Text, nullable=True)
    chipping_assessment = Column(Text, nullable=True)
    full_swing_assessment = Column(Text, nullable=True)
    avg_score_9 = Column(Numeric(4, 1), nullable=True)
    avg_score_18 = Column(Numeric(4, 1), nullable=True)
    competitions_played = Column(Integer, nullable=True)
    best_gross_score = Column(Integer, nullable=True)
    coach_signed = Column(Boolean, nullable=False, default=False)
    coach_signed_date = Column(Date, nullable=True)
    committee_signed = Column(Boolean, nullable=False, default=False)
    committee_signed_date = Column(Date, nullable=True)
    committee_signed_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    junior = relationship("JuniorProfile", backref="evaluations")
    coach = relationship("User", foreign_keys=[coach_id], backref="coach_evaluations")
    committee_signer = relationship("User", foreign_keys=[committee_signed_by])

    __table_args__ = (
        UniqueConstraint("junior_id", "report_month", name="uq_evaluations_junior_report_month"),
        CheckConstraint("current_level BETWEEN 1 AND 9", name="ck_evaluations_current_level"),
        CheckConstraint(
            "committee_signed = false OR coach_signed = true",
            name="ck_evaluations_signoff_order",
        ),
    )
