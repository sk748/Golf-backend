"""Tournaments domain — fresh build per docs/Karen_Tournaments_Backend_Spec.md.

Phase 1 (core): tournaments, divisions, entries. The legacy "Rumble 2.0"
match-play module that previously lived here has been retired (spec §3).

Scores/hole-scores (Phase 2), match-play bracket (Phase 3), external results
(Phase 4) and series (Phase 5) are added in later phases.
"""

from enum import Enum

from sqlalchemy import (
    CheckConstraint, Column, Date, ForeignKey, Integer, Numeric, String, Text, Boolean,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


# ── Enums (single source — spec §4) ─────────────────────────────────────────────

class TournamentFormat(str, Enum):
    stroke_play = "stroke_play"
    stableford = "stableford"
    match_play = "match_play"


class ScoringBasis(str, Enum):
    gross = "gross"
    net = "net"
    both = "both"


class TournamentStatus(str, Enum):
    draft = "draft"
    registration_open = "registration_open"
    registration_closed = "registration_closed"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class DivisionBasis(str, Enum):
    age = "age"
    gender = "gender"
    level = "level"
    handicap = "handicap"
    custom = "custom"


class TournamentEntryStatus(str, Enum):
    # Spec §4 has registered/confirmed/withdrawn. We extend it for the
    # player-RSVP → parent-approval flow (Sam's design): a junior (player) can
    # express interest themselves, which a parent then approves (-> registered)
    # or declines. Parent/admin registering directly lands straight on registered.
    interested = "interested"        # player-initiated RSVP, awaiting parent approval
    registered = "registered"        # registered (parent/admin) or parent-approved RSVP
    confirmed = "confirmed"          # admin/coach confirmed (e.g. eligible for bracket)
    withdrawn = "withdrawn"
    declined = "declined"            # parent declined the player's RSVP


# ── Tables ──────────────────────────────────────────────────────────────────────

class Tournament(TimestampMixin, db.Model):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    format = Column(
        SQLEnum(TournamentFormat, values_callable=enum_values, name="tournament_format"),
        nullable=False,
    )
    scoring_basis = Column(
        SQLEnum(ScoringBasis, values_callable=enum_values, name="tournament_scoring_basis"),
        nullable=False,
        default=ScoringBasis.gross,
    )
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    tee_set_id = Column(Integer, ForeignKey("tee_sets.id"), nullable=True)
    holes = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    counts_toward_handicap = Column(Boolean, nullable=False, default=False)
    status = Column(
        SQLEnum(TournamentStatus, values_callable=enum_values, name="tournament_status"),
        nullable=False,
        default=TournamentStatus.draft,
    )
    # series grouping (§5.8) — plain nullable int for now; FK added with the
    # series table in Phase 5.
    series_id = Column(Integer, nullable=True)
    max_entrants = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)

    # Eligibility — all nullable means "no restriction" (spec §5.1 / §9).
    age_min = Column(Integer, nullable=True)
    age_max = Column(Integer, nullable=True)
    level_min = Column(Integer, nullable=True)
    level_max = Column(Integer, nullable=True)
    handicap_min = Column(Numeric(4, 1), nullable=True)
    handicap_max = Column(Numeric(4, 1), nullable=True)
    handicap_required = Column(Boolean, nullable=False, default=False)

    course = relationship("Course")
    tee_set = relationship("TeeSet")

    __table_args__ = (
        CheckConstraint("holes IN (9, 18)", name="ck_tournaments_holes"),
    )


class TournamentDivision(TimestampMixin, db.Model):
    __tablename__ = "tournament_divisions"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    name = Column(String(255), nullable=False)
    basis = Column(
        SQLEnum(DivisionBasis, values_callable=enum_values, name="tournament_division_basis"),
        nullable=False,
    )
    tee_set_id = Column(Integer, ForeignKey("tee_sets.id"), nullable=True)

    # Auto-assign criteria (nullable).
    age_min = Column(Integer, nullable=True)
    age_max = Column(Integer, nullable=True)
    gender = Column(String(10), nullable=True)
    level_min = Column(Integer, nullable=True)
    level_max = Column(Integer, nullable=True)
    handicap_min = Column(Numeric(4, 1), nullable=True)
    handicap_max = Column(Numeric(4, 1), nullable=True)

    tournament = relationship("Tournament", backref="divisions")
    tee_set = relationship("TeeSet")


class TournamentEntry(TimestampMixin, db.Model):
    __tablename__ = "tournament_entries"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    division_id = Column(Integer, ForeignKey("tournament_divisions.id"), nullable=True)
    registered_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    status = Column(
        SQLEnum(TournamentEntryStatus, values_callable=enum_values, name="tournament_entry_status"),
        nullable=False,
        default=TournamentEntryStatus.registered,
    )
    registered_at = Column(Date, nullable=False)

    tournament = relationship("Tournament", backref="entries")
    junior = relationship("JuniorProfile", backref="tournament_entries")
    division = relationship("TournamentDivision", backref="entries")
    registrar = relationship("User", foreign_keys=[registered_by])

    __table_args__ = (
        UniqueConstraint("tournament_id", "junior_id", name="uq_tournament_entries_tournament_junior"),
    )
