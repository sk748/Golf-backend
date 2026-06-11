"""
Junior Tournaments domain — models.

Fresh module for the Junior Development Programme's competitions (internal events
with full lifecycle, plus a lightweight external-result log). Replaces the retired
"Rumble 2.0" module. Backend owns all competition scoring math (net, Stableford,
positions, brackets) — see app/tournaments/scoring.py and the Tournaments spec §9.

Reuses existing tables: users, junior_profiles, courses, tee_sets, holes, rounds.
"""

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


# ── Enums (single source — Tournaments spec §4) ────────────────────────────────

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


class EntryStatus(str, Enum):
    # interested/declined extend the spec's lifecycle for the player-RSVP →
    # parent-approval flow: a player expresses interest (interested), a parent
    # approves (→ registered) or declines. Parent/admin/coach register directly.
    interested = "interested"
    registered = "registered"
    confirmed = "confirmed"
    withdrawn = "withdrawn"
    declined = "declined"


class ScoreStatus(str, Enum):
    pending = "pending"
    submitted = "submitted"
    verified = "verified"


class MatchStatus(str, Enum):
    scheduled = "scheduled"
    completed = "completed"


class DivisionBasis(str, Enum):
    age = "age"
    gender = "gender"
    level = "level"
    handicap = "handicap"
    custom = "custom"


class ExternalEventType(str, Enum):
    faldo_series = "faldo_series"
    us_kids = "us_kids"
    jgf = "jgf"
    karen_open = "karen_open"
    other = "other"


class CompetitionType(str, Enum):
    """Competition taxonomy for the Junior Development Plan's per-band
    competition requirements (L1-13comp-req tracking). An internal Tournament
    may be tagged with one of these (e.g. the Karen Junior Challenge); external
    results map their ExternalEventType onto this taxonomy in code (see
    controllers.EXTERNAL_EVENT_TO_COMPETITION). Nullable / extensible."""
    karen_junior_challenge = "karen_junior_challenge"
    faldo_series = "faldo_series"
    us_kids = "us_kids"
    jgf = "jgf"
    karen_strokeplay = "karen_strokeplay"
    main_league = "main_league"
    other = "other"


# ── 5.1 tournaments ────────────────────────────────────────────────────────────

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
    series_id = Column(Integer, ForeignKey("series.id"), nullable=True)
    max_entrants = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    # Competition-requirement tracking (L1-13comp-req): tags an internal event
    # against the Junior Development Plan taxonomy (e.g. karen_junior_challenge).
    # Nullable = untagged / not a tracked competition.
    competition_type = Column(
        SQLEnum(CompetitionType, values_callable=enum_values, name="competition_type"),
        nullable=True,
    )

    # Eligibility (all nullable = no restriction)
    age_min = Column(Integer, nullable=True)
    age_max = Column(Integer, nullable=True)
    level_min = Column(Integer, nullable=True)
    level_max = Column(Integer, nullable=True)
    handicap_min = Column(Numeric(4, 1), nullable=True)
    handicap_max = Column(Numeric(4, 1), nullable=True)
    handicap_required = Column(Boolean, nullable=False, default=False)

    course = relationship("Course")
    tee_set = relationship("TeeSet")
    series = relationship("Series", backref="tournaments")

    __table_args__ = (
        CheckConstraint("holes IN (9, 18)", name="ck_tournaments_holes"),
    )


# ── 5.2 tournament_divisions ───────────────────────────────────────────────────

class TournamentDivision(TimestampMixin, db.Model):
    __tablename__ = "tournament_divisions"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    name = Column(String(255), nullable=False)
    basis = Column(
        SQLEnum(DivisionBasis, values_callable=enum_values, name="division_basis"),
        nullable=False,
    )
    tee_set_id = Column(Integer, ForeignKey("tee_sets.id"), nullable=True)

    # Auto-assign criteria (nullable)
    age_min = Column(Integer, nullable=True)
    age_max = Column(Integer, nullable=True)
    gender = Column(String(10), nullable=True)  # male / female
    level_min = Column(Integer, nullable=True)
    level_max = Column(Integer, nullable=True)
    handicap_min = Column(Numeric(4, 1), nullable=True)
    handicap_max = Column(Numeric(4, 1), nullable=True)

    tournament = relationship("Tournament", backref="divisions")
    tee_set = relationship("TeeSet")


# ── 5.3 tournament_entries ─────────────────────────────────────────────────────

class TournamentEntry(TimestampMixin, db.Model):
    __tablename__ = "tournament_entries"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    division_id = Column(Integer, ForeignKey("tournament_divisions.id"), nullable=True)
    registered_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    status = Column(
        SQLEnum(EntryStatus, values_callable=enum_values, name="entry_status"),
        nullable=False,
        default=EntryStatus.registered,
    )
    registered_at = Column(Date, nullable=False)

    tournament = relationship("Tournament", backref="entries")
    junior = relationship("JuniorProfile")
    division = relationship("TournamentDivision", backref="entries")
    registrar = relationship("User")

    __table_args__ = (
        UniqueConstraint("tournament_id", "junior_id", name="uq_entries_tournament_junior"),
    )


# ── 5.4 tournament_scores ──────────────────────────────────────────────────────

class TournamentScore(TimestampMixin, db.Model):
    __tablename__ = "tournament_scores"

    id = Column(Integer, primary_key=True)
    entry_id = Column(Integer, ForeignKey("tournament_entries.id"), nullable=False)
    holes_played = Column(Integer, nullable=False)
    gross_score = Column(Integer, nullable=False)
    net_score = Column(Integer, nullable=True)
    stableford_points = Column(Integer, nullable=True)
    position = Column(Integer, nullable=True)
    status = Column(
        SQLEnum(ScoreStatus, values_callable=enum_values, name="score_status"),
        nullable=False,
        default=ScoreStatus.submitted,
    )
    round_id = Column(Integer, ForeignKey("rounds.id"), nullable=True)

    entry = relationship("TournamentEntry", backref="score")
    round = relationship("Round")
    hole_scores = relationship(
        "TournamentHoleScore", backref="tournament_score",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("entry_id", name="uq_scores_entry"),
    )


# ── 5.5 tournament_hole_scores ─────────────────────────────────────────────────

class TournamentHoleScore(TimestampMixin, db.Model):
    __tablename__ = "tournament_hole_scores"

    id = Column(Integer, primary_key=True)
    tournament_score_id = Column(Integer, ForeignKey("tournament_scores.id"), nullable=False)
    hole_number = Column(Integer, nullable=False)
    strokes = Column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("tournament_score_id", "hole_number", name="uq_thole_score_hole"),
        CheckConstraint("hole_number BETWEEN 1 AND 18", name="ck_thole_hole_number"),
        CheckConstraint("strokes > 0", name="ck_thole_strokes"),
    )


# ── 5.6 tournament_matches ─────────────────────────────────────────────────────

class TournamentMatch(TimestampMixin, db.Model):
    __tablename__ = "tournament_matches"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    round_number = Column(Integer, nullable=False)
    bracket_position = Column(Integer, nullable=False)
    player_a_entry_id = Column(Integer, ForeignKey("tournament_entries.id"), nullable=True)
    player_b_entry_id = Column(Integer, ForeignKey("tournament_entries.id"), nullable=True)
    winner_entry_id = Column(Integer, ForeignKey("tournament_entries.id"), nullable=True)
    result_text = Column(String(50), nullable=True)
    scheduled_date = Column(Date, nullable=True)
    status = Column(
        SQLEnum(MatchStatus, values_callable=enum_values, name="match_status"),
        nullable=False,
        default=MatchStatus.scheduled,
    )

    tournament = relationship("Tournament", backref="matches")
    player_a = relationship("TournamentEntry", foreign_keys=[player_a_entry_id])
    player_b = relationship("TournamentEntry", foreign_keys=[player_b_entry_id])
    winner = relationship("TournamentEntry", foreign_keys=[winner_entry_id])


# ── 5.7 external_results ───────────────────────────────────────────────────────

class ExternalResult(TimestampMixin, db.Model):
    __tablename__ = "external_results"

    id = Column(Integer, primary_key=True)
    junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=False)
    event_name = Column(String(255), nullable=False)
    event_type = Column(
        SQLEnum(ExternalEventType, values_callable=enum_values, name="external_event_type"),
        nullable=False,
    )
    date = Column(Date, nullable=False)
    holes = Column(Integer, nullable=True)
    gross_score = Column(Integer, nullable=True)
    position = Column(Integer, nullable=True)
    field_size = Column(Integer, nullable=True)
    counts_toward_handicap = Column(Boolean, nullable=False, default=False)
    round_id = Column(Integer, ForeignKey("rounds.id"), nullable=True)
    logged_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    notes = Column(Text, nullable=True)
    # Build-phase-2 decision 11: parents log results for their own child but a
    # staff member verifies before the result feeds the junior's stats.
    verified = Column(Boolean, nullable=False, default=False)
    verified_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    junior = relationship("JuniorProfile")
    round = relationship("Round")
    logger = relationship("User", foreign_keys=[logged_by])


# ── 5.8 series (optional / fast-follow) ────────────────────────────────────────

class Series(TimestampMixin, db.Model):
    __tablename__ = "series"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    year = Column(Integer, nullable=False)
    points_scheme = Column(Text, nullable=True)  # JSON: position -> points
    status = Column(String(50), nullable=True)
