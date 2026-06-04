from enum import Enum

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship, validates

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class TournamentStatus(str, Enum):
    registration = "registration"
    round_robin = "round_robin"
    knockout = "knockout"
    complete = "complete"


class MatchResult(str, Enum):
    team_a_win = "team_a_win"
    team_b_win = "team_b_win"
    tie = "tie"


class MatchStage(str, Enum):
    round_robin = "round_robin"
    round_of_16 = "round_of_16"
    quarter = "quarter"
    semi = "semi"
    final = "final"


class StartingTee(str, Enum):
    hole_1 = "hole_1"
    hole_10 = "hole_10"


class MatchTeePlayed(str, Enum):
    white = "white"
    yellow = "yellow"
    blue = "blue"
    red = "red"


class PenaltyType(str, Enum):
    late_cancel = "late_cancel"
    declined_invite = "declined_invite"


class Tournament(TimestampMixin, db.Model):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    year = Column(Integer, nullable=False)
    format = Column(String(100), nullable=False)
    handicap_allowance = Column(Numeric(3, 2), nullable=False)
    max_stroke_diff = Column(Integer, nullable=False)
    min_games = Column(Integer, nullable=False)
    max_games = Column(Integer, nullable=False)
    qualify_top_n = Column(Integer, nullable=False)
    points_win = Column(Integer, nullable=False)
    points_tie = Column(Integer, nullable=False)
    points_loss = Column(Integer, nullable=False)
    penalty_late_cancel = Column(Integer, nullable=False)
    penalty_declined = Column(Integer, nullable=False)
    round_robin_start = Column(Date, nullable=True)
    round_robin_end = Column(Date, nullable=True)
    status = Column(
        SQLEnum(TournamentStatus, values_callable=enum_values, name="tournament_status"),
        nullable=False,
    )


class Team(TimestampMixin, db.Model):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    name = Column(String(255), nullable=False)
    player_1_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    player_1_handicap = Column(Numeric(4, 1), nullable=False)
    player_2_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    player_2_handicap = Column(Numeric(4, 1), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    tournament = relationship("Tournament", backref="teams")
    player_1 = relationship("User", foreign_keys=[player_1_id])
    player_2 = relationship("User", foreign_keys=[player_2_id])

    __table_args__ = (
        UniqueConstraint("tournament_id", "name", name="uq_teams_tournament_name"),
        CheckConstraint("player_1_id <> player_2_id", name="ck_teams_distinct_players"),
    )


class Match(TimestampMixin, db.Model):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    match_date = Column(Date, nullable=True)
    tee_played = Column(
        SQLEnum(MatchTeePlayed, values_callable=enum_values, name="match_tee_played"),
        nullable=False,
    )
    starting_tee = Column(
        SQLEnum(StartingTee, values_callable=enum_values, name="match_starting_tee"),
        nullable=False,
    )
    team_a_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team_b_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    result = Column(
        SQLEnum(MatchResult, values_callable=enum_values, name="match_result"),
        nullable=True,
    )
    winner_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    score_description = Column(String(100), nullable=True)
    stage = Column(
        SQLEnum(MatchStage, values_callable=enum_values, name="match_stage"),
        nullable=False,
    )

    tournament = relationship("Tournament", backref="matches")
    team_a = relationship("Team", foreign_keys=[team_a_id])
    team_b = relationship("Team", foreign_keys=[team_b_id])
    winner = relationship("Team", foreign_keys=[winner_id])

    __table_args__ = (
        CheckConstraint("team_a_id <> team_b_id", name="ck_matches_distinct_teams"),
        CheckConstraint(
            "(result = 'tie' AND winner_id IS NULL) OR (result IS NULL) OR (result <> 'tie' AND winner_id IS NOT NULL)",
            name="ck_matches_winner_for_result",
        ),
    )

    @validates("winner_id")
    def validate_winner_id(self, key, winner_id):
        if winner_id is not None and self.team_a_id is not None and self.team_b_id is not None:
            if winner_id not in (self.team_a_id, self.team_b_id):
                raise ValueError("winner_id must equal team_a_id or team_b_id")
        return winner_id


class Penalty(TimestampMixin, db.Model):
    __tablename__ = "penalties"

    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    penalty_type = Column(
        SQLEnum(PenaltyType, values_callable=enum_values, name="penalty_type"),
        nullable=False,
    )
    points_deducted = Column(Integer, nullable=False, default=-3)
    notes = Column(Text, nullable=True)

    match = relationship("Match", backref="penalties")
    team = relationship("Team", backref="penalties")
