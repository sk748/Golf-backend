"""
Junior League — inter-club match-play league domain.

A League contains multiple LeagueTeams. Fixtures pit two teams against each
other in a set of match-play Pairings. Each Pairing has a home junior (our
player, FK to junior_profiles) and an away label (free text — opposing club's
player, not in our DB). Points are configurable per League (default 1/0.5/0).
Season standings are computed from pairing results; no denormalised totals are
stored in the fixture or team rows.
"""
from enum import Enum

from sqlalchemy import (
    Boolean, Column, Date, ForeignKey, Integer, Numeric, String, Text,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


def enum_values(enum_class):
    return [item.value for item in enum_class]


class LeagueStatus(str, Enum):
    draft = "draft"
    active = "active"
    completed = "completed"
    archived = "archived"


class FixtureStatus(str, Enum):
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class PairingFormat(str, Enum):
    singles = "singles"
    foursomes = "foursomes"
    fourball = "fourball"


class PairingResult(str, Enum):
    home_win = "home_win"
    away_win = "away_win"
    halved = "halved"
    pending = "pending"


class League(TimestampMixin, db.Model):
    __tablename__ = "leagues"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    year = Column(Integer, nullable=True)
    status = Column(
        SQLEnum(LeagueStatus, values_callable=enum_values, name="league_status"),
        nullable=False,
        default=LeagueStatus.draft,
    )
    is_current = Column(Boolean, nullable=False, default=False)
    points_win = Column(Numeric(4, 2), nullable=False, default=1.0)
    points_halve = Column(Numeric(4, 2), nullable=False, default=0.5)
    points_loss = Column(Numeric(4, 2), nullable=False, default=0.0)
    description = Column(Text, nullable=True)

    teams = relationship("LeagueTeam", back_populates="league",
                         cascade="all, delete-orphan")
    fixtures = relationship("LeagueFixture", back_populates="league",
                            cascade="all, delete-orphan")


class LeagueTeam(TimestampMixin, db.Model):
    __tablename__ = "league_teams"

    id = Column(Integer, primary_key=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    name = Column(String(255), nullable=False)
    short_name = Column(String(100), nullable=True)
    is_home_club = Column(Boolean, nullable=False, default=False)

    league = relationship("League", back_populates="teams")
    home_fixtures = relationship(
        "LeagueFixture",
        foreign_keys="[LeagueFixture.home_team_id]",
        back_populates="home_team",
    )
    away_fixtures = relationship(
        "LeagueFixture",
        foreign_keys="[LeagueFixture.away_team_id]",
        back_populates="away_team",
    )


class LeagueFixture(TimestampMixin, db.Model):
    __tablename__ = "league_fixtures"

    id = Column(Integer, primary_key=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    round_number = Column(Integer, nullable=True)
    date = Column(Date, nullable=True)
    location = Column(String(255), nullable=True)
    home_team_id = Column(Integer, ForeignKey("league_teams.id"), nullable=False)
    away_team_id = Column(Integer, ForeignKey("league_teams.id"), nullable=False)
    status = Column(
        SQLEnum(FixtureStatus, values_callable=enum_values, name="fixture_status"),
        nullable=False,
        default=FixtureStatus.scheduled,
    )
    # The calendar Event mirroring this fixture (auto-managed) — lets fixtures
    # appear in /calendar and supporters RSVP via the events domain.
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)

    league = relationship("League", back_populates="fixtures")
    home_team = relationship(
        "LeagueTeam",
        foreign_keys=[home_team_id],
        back_populates="home_fixtures",
    )
    away_team = relationship(
        "LeagueTeam",
        foreign_keys=[away_team_id],
        back_populates="away_fixtures",
    )
    pairings = relationship(
        "LeaguePairing",
        back_populates="fixture",
        cascade="all, delete-orphan",
        order_by="LeaguePairing.pairing_order",
    )


class LeaguePairing(TimestampMixin, db.Model):
    __tablename__ = "league_pairings"

    id = Column(Integer, primary_key=True)
    fixture_id = Column(Integer, ForeignKey("league_fixtures.id"), nullable=False)
    pairing_order = Column(Integer, nullable=True)
    format = Column(
        SQLEnum(PairingFormat, values_callable=enum_values, name="pairing_format"),
        nullable=False,
        default=PairingFormat.singles,
    )
    # Home side — our junior(s); FK into junior_profiles; nullable (TBD)
    home_junior_id = Column(Integer, ForeignKey("junior_profiles.id"), nullable=True)
    home_partner_junior_id = Column(Integer, ForeignKey("junior_profiles.id"),
                                    nullable=True)
    home_label = Column(String(255), nullable=True)   # display fallback
    # Away side — opposing club players stored as free text
    away_label = Column(String(255), nullable=True)
    away_partner_label = Column(String(255), nullable=True)
    result = Column(
        SQLEnum(PairingResult, values_callable=enum_values, name="pairing_result"),
        nullable=False,
        default=PairingResult.pending,
    )
    margin = Column(String(50), nullable=True)   # e.g. "3&2", "2 up"

    fixture = relationship("LeagueFixture", back_populates="pairings")
    home_junior = relationship(
        "JuniorProfile",
        foreign_keys=[home_junior_id],
        backref="league_pairings_home",
    )
    home_partner_junior = relationship(
        "JuniorProfile",
        foreign_keys=[home_partner_junior_id],
        backref="league_pairings_home_partner",
    )
