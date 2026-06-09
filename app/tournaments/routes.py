"""Tournaments domain routes — Phase 1 (core).

CRUD for tournaments and divisions, plus the entry registration + RSVP
lifecycle. Scoring/leaderboard (Phase 2), bracket (Phase 3), external results
(Phase 4) and series (Phase 5) are added later.
"""

from datetime import date

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.database.database import db
from app.juniors.models import JuniorProfile
from app.tournaments.controllers import (
    tournament_schema, tournaments_schema,
    division_schema, divisions_schema,
    entry_schema, entries_schema,
    list_tournaments, get_tournament, create_tournament, update_tournament, delete_tournament,
    list_divisions, get_division, create_division, update_division, delete_division,
    list_entries, get_entry, create_entry, update_entry, delete_entry, set_entry_status,
)
from app.tournaments.models import TournamentEntryStatus
from app.utils.decorators import require_roles, require_auth, admin_only, get_current_user, has_role

tournaments_bp = Blueprint("tournaments_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


def _status_value(obj):
    return obj.status.value if hasattr(obj.status, "value") else str(obj.status)


# ── Tournaments ───────────────────────────────────────────────────────────────

@tournaments_bp.route("/tournaments", methods=["GET"])
@require_auth
def get_tournaments():
    items = list_tournaments(
        status=request.args.get("status"),
        format=request.args.get("format"),
        series_id=request.args.get("series_id"),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
    )
    return _data(tournaments_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournaments", methods=["POST"])
@require_roles("admin", "coach")
def post_tournament():
    try:
        t = create_tournament(request.get_json() or {})
        return _data(tournament_schema.dump(t), 201)
    except IntegrityError:
        return _err("CONFLICT", "Tournament conflicts with existing data", 409)


@tournaments_bp.route("/tournaments/<int:tournament_id>", methods=["GET"])
@require_auth
def get_tournament_route(tournament_id):
    t = get_tournament(tournament_id)
    if t is None:
        return _not_found("Tournament")
    return _data(tournament_schema.dump(t))


@tournaments_bp.route("/tournaments/<int:tournament_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_tournament(tournament_id):
    t = get_tournament(tournament_id)
    if t is None:
        return _not_found("Tournament")
    try:
        return _data(tournament_schema.dump(update_tournament(t, request.get_json() or {})))
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)


@tournaments_bp.route("/tournaments/<int:tournament_id>", methods=["DELETE"])
@admin_only
def delete_tournament_route(tournament_id):
    t = get_tournament(tournament_id)
    if t is None:
        return _not_found("Tournament")
    delete_tournament(t)
    return "", 204


# ── Divisions ─────────────────────────────────────────────────────────────────

@tournaments_bp.route("/tournament-divisions", methods=["GET"])
@require_auth
def get_divisions():
    items = list_divisions(tournament_id=request.args.get("tournament_id"))
    return _data(divisions_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournament-divisions", methods=["POST"])
@require_roles("admin", "coach")
def post_division():
    try:
        d = create_division(request.get_json() or {})
        return _data(division_schema.dump(d), 201)
    except IntegrityError:
        return _err("CONFLICT", "Division conflicts with existing data", 409)


@tournaments_bp.route("/tournament-divisions/<int:division_id>", methods=["GET"])
@require_auth
def get_division_route(division_id):
    d = get_division(division_id)
    if d is None:
        return _not_found("Division")
    return _data(division_schema.dump(d))


@tournaments_bp.route("/tournament-divisions/<int:division_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_division(division_id):
    d = get_division(division_id)
    if d is None:
        return _not_found("Division")
    return _data(division_schema.dump(update_division(d, request.get_json() or {})))


@tournaments_bp.route("/tournament-divisions/<int:division_id>", methods=["DELETE"])
@admin_only
def delete_division_route(division_id):
    d = get_division(division_id)
    if d is None:
        return _not_found("Division")
    delete_division(d)
    return "", 204


# ── Entries (registration + player-RSVP → parent-approval) ──────────────────────

def _entry_in_scope(caller, junior):
    """True if the caller may act on / see an entry for this junior."""
    if has_role(caller, "admin", "committee"):
        return True
    if has_role(caller, "coach"):
        return str(junior.coach_id) == str(caller.id)
    if has_role(caller, "parent"):
        return str(junior.parent_id) == str(caller.id)
    if has_role(caller, "player"):
        return str(junior.user_id) == str(caller.id)
    return False


@tournaments_bp.route("/tournament-entries", methods=["GET"])
@require_auth
def get_entries():
    caller = get_current_user()
    kwargs = dict(
        tournament_id=request.args.get("tournament_id"),
        junior_id=request.args.get("junior_id"),
        division_id=request.args.get("division_id"),
        status=request.args.get("status"),
    )
    # Scope the list to what this role may see.
    if has_role(caller, "parent"):
        kwargs["parent_id"] = caller.id
    elif has_role(caller, "player"):
        kwargs["player_user_id"] = caller.id
    elif has_role(caller, "coach"):
        kwargs["coach_id"] = caller.id
    # admin / committee: no extra scope (see all)
    items = list_entries(**kwargs)
    return _data(entries_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournament-entries", methods=["POST"])
@require_roles("admin", "coach", "parent", "player")
def post_entry():
    caller = get_current_user()
    data = request.get_json() or {}
    junior_id = data.get("junior_id")
    tournament_id = data.get("tournament_id")
    junior = db.session.get(JuniorProfile, junior_id) if junior_id else None
    tournament = get_tournament(tournament_id) if tournament_id else None
    if junior is None or tournament is None:
        return _err("VALIDATION_ERROR", "tournament_id and a valid junior_id are required", 400)

    # Scope: who may enter whom.
    if not _entry_in_scope(caller, junior):
        return _err("FORBIDDEN", "You can only register juniors in your own scope", 403)

    # Registration must be open (spec §9).
    if _status_value(tournament) != "registration_open":
        return _err("CONFLICT", "Registration is not open for this tournament", 409)

    # A player expressing interest starts at `interested` (awaiting a parent's
    # approval); everyone else registers directly.
    data["status"] = (
        TournamentEntryStatus.interested.value
        if has_role(caller, "player")
        else TournamentEntryStatus.registered.value
    )
    data["registered_by"] = caller.id
    data.setdefault("registered_at", date.today().isoformat())
    # NOTE: per-tournament eligibility (age/level/handicap, spec §9) is NOT
    # enforced in v1 by decision — fields exist; the frontend filters. Add the
    # 400-on-ineligible gate here when eligibility enforcement is turned on.
    try:
        e = create_entry(data)
        return _data(entry_schema.dump(e), 201)
    except IntegrityError:
        db.session.rollback()
        return _err("CONFLICT", "This junior is already entered in this tournament", 409)


@tournaments_bp.route("/tournament-entries/<int:entry_id>", methods=["GET"])
@require_auth
def get_entry_route(entry_id):
    e = get_entry(entry_id)
    if e is None:
        return _not_found("Entry")
    caller = get_current_user()
    if not _entry_in_scope(caller, e.junior):
        return _err("FORBIDDEN", "You cannot view this entry", 403)
    return _data(entry_schema.dump(e))


@tournaments_bp.route("/tournament-entries/<int:entry_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_entry(entry_id):
    e = get_entry(entry_id)
    if e is None:
        return _not_found("Entry")
    data = request.get_json() or {}
    allowed = {"division_id", "status"}
    bad = set(data) - allowed
    if bad:
        return _err("VALIDATION_ERROR", f"Unsupported fields: {', '.join(sorted(bad))}", 400)
    if "status" in data and data["status"] not in [s.value for s in TournamentEntryStatus]:
        return _err("VALIDATION_ERROR", "Invalid entry status", 400)
    return _data(entry_schema.dump(update_entry(e, data)))


@tournaments_bp.route("/tournament-entries/<int:entry_id>/approve", methods=["PUT"])
@require_roles("admin", "parent")
def approve_entry(entry_id):
    e = get_entry(entry_id)
    if e is None:
        return _not_found("Entry")
    caller = get_current_user()
    if has_role(caller, "parent") and str(e.junior.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only approve their own child's RSVP", 403)
    if _status_value(e) != TournamentEntryStatus.interested.value:
        return _err("CONFLICT", "Only an interested (RSVP) entry can be approved", 409)
    return _data(entry_schema.dump(set_entry_status(e, TournamentEntryStatus.registered.value)))


@tournaments_bp.route("/tournament-entries/<int:entry_id>/decline", methods=["PUT"])
@require_roles("admin", "parent")
def decline_entry(entry_id):
    e = get_entry(entry_id)
    if e is None:
        return _not_found("Entry")
    caller = get_current_user()
    if has_role(caller, "parent") and str(e.junior.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only decline their own child's RSVP", 403)
    if _status_value(e) != TournamentEntryStatus.interested.value:
        return _err("CONFLICT", "Only an interested (RSVP) entry can be declined", 409)
    return _data(entry_schema.dump(set_entry_status(e, TournamentEntryStatus.declined.value)))


@tournaments_bp.route("/tournament-entries/<int:entry_id>/withdraw", methods=["PUT"])
@require_roles("admin", "coach", "parent")
def withdraw_entry(entry_id):
    e = get_entry(entry_id)
    if e is None:
        return _not_found("Entry")
    caller = get_current_user()
    if has_role(caller, "parent") and str(e.junior.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only withdraw their own child's entry", 403)
    if has_role(caller, "coach") and str(e.junior.coach_id) != str(caller.id):
        return _err("FORBIDDEN", "Coaches can only withdraw their own juniors' entries", 403)
    return _data(entry_schema.dump(set_entry_status(e, TournamentEntryStatus.withdrawn.value)))


@tournaments_bp.route("/tournament-entries/<int:entry_id>", methods=["DELETE"])
@admin_only
def delete_entry_route(entry_id):
    e = get_entry(entry_id)
    if e is None:
        return _not_found("Entry")
    delete_entry(e)
    return "", 204
