"""Tournaments domain controllers — Phase 1 (core).

Data access + business rules for tournaments, divisions and entries. Scoring,
brackets and external results arrive in later phases.
"""

from datetime import date

from app.database.database import db
from app.juniors.models import JuniorProfile
from app.tournaments.models import (
    Tournament, TournamentDivision, TournamentEntry,
    TournamentStatus, TournamentEntryStatus,
)
from app.utils.schemas import SimpleModelSchema

tournament_schema = SimpleModelSchema(Tournament)
tournaments_schema = SimpleModelSchema(Tournament, many=True)
division_schema = SimpleModelSchema(TournamentDivision)
divisions_schema = SimpleModelSchema(TournamentDivision, many=True)
entry_schema = SimpleModelSchema(TournamentEntry)
entries_schema = SimpleModelSchema(TournamentEntry, many=True)


# ── Tournaments ─────────────────────────────────────────────────────────────────

def list_tournaments(status=None, format=None, series_id=None, date_from=None, date_to=None):
    q = Tournament.query
    if status:
        q = q.filter_by(status=status)
    if format:
        q = q.filter_by(format=format)
    if series_id:
        q = q.filter_by(series_id=series_id)
    if date_from:
        q = q.filter(Tournament.start_date >= date_from)
    if date_to:
        q = q.filter(Tournament.start_date <= date_to)
    return q.order_by(Tournament.start_date.desc()).all()


def get_tournament(tournament_id):
    return db.session.get(Tournament, tournament_id)


def create_tournament(data):
    data = dict(data)
    data.setdefault("status", TournamentStatus.draft.value)
    t = tournament_schema.load(data)
    db.session.add(t)
    db.session.commit()
    return t


# Allowed status transitions (spec §9). cancelled reachable from any live state;
# completed/cancelled are terminal.
_STATUS_TRANSITIONS = {
    "draft": {"registration_open", "cancelled"},
    "registration_open": {"registration_closed", "in_progress", "cancelled"},
    "registration_closed": {"registration_open", "in_progress", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}


def update_tournament(t, data):
    data = dict(data)
    if "status" in data:
        current = t.status.value if hasattr(t.status, "value") else str(t.status)
        new = data["status"]
        if new != current and new not in _STATUS_TRANSITIONS.get(current, set()):
            raise ValueError(f"Invalid status transition: {current} -> {new}")
    for k, v in data.items():
        setattr(t, k, v)
    db.session.commit()
    return t


def delete_tournament(t):
    db.session.delete(t)
    db.session.commit()


# ── Divisions ─────────────────────────────────────────────────────────────────

def list_divisions(tournament_id=None):
    q = TournamentDivision.query
    if tournament_id:
        q = q.filter_by(tournament_id=tournament_id)
    return q.all()


def get_division(division_id):
    return db.session.get(TournamentDivision, division_id)


def create_division(data):
    d = division_schema.load(data)
    db.session.add(d)
    db.session.commit()
    return d


def update_division(d, data):
    for k, v in data.items():
        setattr(d, k, v)
    db.session.commit()
    return d


def delete_division(d):
    db.session.delete(d)
    db.session.commit()


# ── Entries (registration + RSVP lifecycle) ─────────────────────────────────────

def list_entries(tournament_id=None, junior_id=None, division_id=None, status=None,
                 parent_id=None, player_user_id=None, coach_id=None):
    q = TournamentEntry.query
    if tournament_id:
        q = q.filter_by(tournament_id=tournament_id)
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    if division_id:
        q = q.filter_by(division_id=division_id)
    if status:
        q = q.filter_by(status=status)
    # Role scoping via the junior relationship.
    if parent_id or player_user_id or coach_id:
        q = q.join(JuniorProfile, TournamentEntry.junior_id == JuniorProfile.id)
        if parent_id:
            q = q.filter(JuniorProfile.parent_id == parent_id)
        if player_user_id:
            q = q.filter(JuniorProfile.user_id == player_user_id)
        if coach_id:
            q = q.filter(JuniorProfile.coach_id == coach_id)
    return q.order_by(TournamentEntry.registered_at.desc()).all()


def get_entry(entry_id):
    return db.session.get(TournamentEntry, entry_id)


def create_entry(data):
    data = dict(data)
    data.setdefault("registered_at", date.today().isoformat())
    e = entry_schema.load(data)
    db.session.add(e)
    db.session.commit()
    return e


def set_entry_status(e, new_status):
    e.status = new_status
    db.session.commit()
    return e


def update_entry(e, data):
    for k, v in data.items():
        setattr(e, k, v)
    db.session.commit()
    return e


def delete_entry(e):
    db.session.delete(e)
    db.session.commit()
