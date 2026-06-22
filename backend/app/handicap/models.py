from enum import Enum

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, Text, UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class HandicapJourneyStatus(str, Enum):
    # Coaching-progress lifecycle for a junior working toward a FIRST handicap
    # (Junior Development Plan, L4-5 "Attaining Handicap"). This is NOT a WHS
    # state — the WHS engine still owns handicap_index. It tracks the coach's
    # plan to get scorecards signed.
    not_started = "not_started"        # no journey planned yet
    in_progress = "in_progress"        # coach has a plan; cards being gathered
    cards_submitted = "cards_submitted"  # the target number of signed cards is in
    attained = "attained"              # the junior now holds a handicap


class HandicapJourney(TimestampMixin, db.Model):
    __tablename__ = "handicap_journeys"

    id = Column(Integer, primary_key=True)
    # One journey per junior (a junior attains a first handicap once).
    junior_id = Column(
        Integer, ForeignKey("junior_profiles.id"), nullable=False, unique=True
    )
    status = Column(
        SQLEnum(
            HandicapJourneyStatus,
            values_callable=enum_values,
            name="handicap_journey_status",
        ),
        nullable=False,
        default=HandicapJourneyStatus.not_started,
    )
    # How many signed (verified) scorecards the coach wants the junior to put in
    # before they're considered ready. Default 5 — a common practical target for
    # a first handicap under the Junior Development Plan; the coach can override
    # per junior via PUT.
    target_signed_cards = Column(Integer, nullable=False, default=5)
    coach_notes = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    attained_at = Column(DateTime(timezone=True), nullable=True)

    junior = relationship("JuniorProfile", backref="handicap_journey")

    __table_args__ = (
        UniqueConstraint("junior_id", name="uq_handicap_journeys_junior"),
    )
