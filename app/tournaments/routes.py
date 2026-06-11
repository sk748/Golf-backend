"""
Junior Tournaments domain — routes.

Blueprint owns: /api/tournaments, /api/tournament-divisions, /api/tournament-entries,
/api/tournament-scores, /api/tournament-matches, /api/external-results, /api/series,
plus computed actions and /api/juniors/<id>/competitions. Roles per spec §7.
"""

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.database.database import db
from app.utils.decorators import (
    require_roles, require_auth, admin_only, get_current_user, has_role,
)
from app.tournaments import controllers as c
from app.audit.service import record

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


def _from_tuple(err):
    code, message, status = err
    return _err(code, message, status)


# ── Parent / player scoping helpers ────────────────────────────────────────────

def _junior_in_scope(caller, junior):
    """True if caller may act on / view this junior. Admin/coach/committee: all.
    Parent: own child. Player: self."""
    if junior is None:
        return False
    if has_role(caller, "admin", "coach", "committee"):
        return True
    if has_role(caller, "parent"):
        return str(junior.parent_id) == str(caller.id)
    if has_role(caller, "player"):
        return str(junior.user_id) == str(caller.id)
    return False


def _get_junior(junior_id):
    from app.juniors.models import JuniorProfile
    return db.session.get(JuniorProfile, junior_id)


# ══════════════════════════════════════════════════════════════════════════════
# Tournaments
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/tournaments", methods=["GET"])
@require_auth
def get_tournaments():
    items = c.list_tournaments(
        status=request.args.get("status"),
        format=request.args.get("format"),
        series_id=request.args.get("series_id"),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
    )
    return _data(c.tournaments_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournaments", methods=["POST"])
@require_roles("admin", "coach")
def post_tournament():
    try:
        t = c.create_tournament(request.get_json() or {})
    except ValueError as ex:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(ex), 400)
    except IntegrityError:
        db.session.rollback()
        return _err("CONFLICT", "Tournament conflicts with existing data", 409)
    record("tournament.created", actor=get_current_user(), target_type="tournament",
           target_id=t.id, target_label=t.name)
    return _data(c.tournament_schema.dump(t), 201)


@tournaments_bp.route("/tournaments/<int:tid>", methods=["GET"])
@require_auth
def get_tournament_route(tid):
    t = c.get_tournament(tid)
    if t is None:
        return _not_found("Tournament")
    return _data(c.tournament_schema.dump(t))


@tournaments_bp.route("/tournaments/<int:tid>", methods=["PUT"])
@require_roles("admin", "coach")
def put_tournament(tid):
    t = c.get_tournament(tid)
    if t is None:
        return _not_found("Tournament")
    try:
        updated = c.update_tournament(t, request.get_json() or {})
    except ValueError as ex:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(ex), 400)
    return _data(c.tournament_schema.dump(updated))


@tournaments_bp.route("/tournaments/<int:tid>", methods=["DELETE"])
@require_roles("admin", "coach")
def delete_tournament_route(tid):
    t = c.get_tournament(tid)
    if t is None:
        return _not_found("Tournament")
    c.delete_tournament(t)
    return "", 204


@tournaments_bp.route("/tournaments/<int:tid>/scores", methods=["POST"])
@require_roles("admin", "coach")
def post_tournament_score(tid):
    result, err = c.submit_score(tid, request.get_json() or {})
    if err:
        return _from_tuple(err)
    return jsonify({"data": result}), 201


@tournaments_bp.route("/tournaments/<int:tid>/leaderboard", methods=["GET"])
@require_auth
def get_leaderboard(tid):
    result, err = c.leaderboard(tid)
    if err:
        return _from_tuple(err)
    return _data(result)


@tournaments_bp.route("/tournaments/<int:tid>/generate-bracket", methods=["POST"])
@require_roles("admin", "coach")
def post_generate_bracket(tid):
    seed_mode = request.args.get("seed", "handicap")
    result, err = c.generate_bracket(tid, seed_mode=seed_mode)
    if err:
        return _from_tuple(err)
    return _data(result, 201)


@tournaments_bp.route("/tournaments/<int:tid>/bracket", methods=["GET"])
@require_auth
def get_bracket_route(tid):
    result, err = c.get_bracket(tid)
    if err:
        return _from_tuple(err)
    return _data(result)


# ══════════════════════════════════════════════════════════════════════════════
# Divisions
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/tournament-divisions", methods=["GET"])
@require_auth
def get_divisions():
    items = c.list_divisions(tournament_id=request.args.get("tournament_id"))
    return _data(c.divisions_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournament-divisions", methods=["POST"])
@require_roles("admin", "coach")
def post_division():
    d = c.create_division(request.get_json() or {})
    return _data(c.division_schema.dump(d), 201)


@tournaments_bp.route("/tournament-divisions/<int:did>", methods=["GET"])
@require_auth
def get_division_route(did):
    d = c.get_division(did)
    if d is None:
        return _not_found("Division")
    return _data(c.division_schema.dump(d))


@tournaments_bp.route("/tournament-divisions/<int:did>", methods=["PUT"])
@require_roles("admin", "coach")
def put_division(did):
    d = c.get_division(did)
    if d is None:
        return _not_found("Division")
    return _data(c.division_schema.dump(c.update_division(d, request.get_json() or {})))


@tournaments_bp.route("/tournament-divisions/<int:did>", methods=["DELETE"])
@require_roles("admin", "coach")
def delete_division_route(did):
    d = c.get_division(did)
    if d is None:
        return _not_found("Division")
    c.delete_division(d)
    return "", 204


# ══════════════════════════════════════════════════════════════════════════════
# Entries (registration)
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/tournament-entries", methods=["GET"])
@require_auth
def get_entries():
    caller = get_current_user()
    items = c.list_entries(
        tournament_id=request.args.get("tournament_id"),
        junior_id=request.args.get("junior_id"),
        division_id=request.args.get("division_id"),
        status=request.args.get("status"),
    )
    # parents/players only see entries for juniors in their scope
    if has_role(caller, "parent", "player"):
        items = [e for e in items if _junior_in_scope(caller, e.junior)]
    return _data(c.entries_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournament-entries", methods=["POST"])
@require_roles("admin", "coach", "parent", "player")
def post_entry():
    caller = get_current_user()
    data = request.get_json() or {}
    # Parents register their own child directly; players express interest in
    # themselves (→ interested, pending a parent's approval).
    if has_role(caller, "parent", "player"):
        junior = _get_junior(data.get("junior_id"))
        if not _junior_in_scope(caller, junior):
            who = "their own child" if has_role(caller, "parent") else "themselves"
            return _err("FORBIDDEN", f"You can only register {who}", 403)
    if has_role(caller, "player"):
        data["status"] = "interested"
    entry, err = c.create_entry(data, registered_by=caller.id)
    if err:
        return _from_tuple(err)
    return _data(c.entry_schema.dump(entry), 201)


@tournaments_bp.route("/tournament-entries/<int:eid>", methods=["GET"])
@require_auth
def get_entry_route(eid):
    caller = get_current_user()
    e = c.get_entry(eid)
    if e is None:
        return _not_found("Entry")
    if has_role(caller, "parent", "player") and not _junior_in_scope(caller, e.junior):
        return _err("FORBIDDEN", "Out of scope", 403)
    return _data(c.entry_schema.dump(e))


@tournaments_bp.route("/tournament-entries/<int:eid>", methods=["PUT"])
@require_roles("admin", "coach", "parent")
def put_entry(eid):
    caller = get_current_user()
    e = c.get_entry(eid)
    if e is None:
        return _not_found("Entry")
    if has_role(caller, "parent") and not _junior_in_scope(caller, e.junior):
        return _err("FORBIDDEN", "Parents can only manage their own child's entry", 403)
    return _data(c.entry_schema.dump(c.update_entry(e, request.get_json() or {})))


@tournaments_bp.route("/tournament-entries/<int:eid>", methods=["DELETE"])
@require_roles("admin", "coach", "parent", "player")
def delete_entry_route(eid):
    caller = get_current_user()
    e = c.get_entry(eid)
    if e is None:
        return _not_found("Entry")
    if has_role(caller, "parent") and not _junior_in_scope(caller, e.junior):
        return _err("FORBIDDEN", "Parents can only withdraw their own child's entry", 403)
    # A player may cancel their OWN RSVP, but only while it's still interested
    # (i.e. a parent hasn't approved/declined it yet).
    if has_role(caller, "player"):
        if not _junior_in_scope(caller, e.junior):
            return _err("FORBIDDEN", "Players can only cancel their own RSVP", 403)
        if (getattr(e.status, "value", e.status)) != "interested":
            return _err("CONFLICT", "You can only cancel an RSVP a parent hasn't acted on yet", 409)
    c.delete_entry(e)
    return "", 204


@tournaments_bp.route("/tournament-entries/<int:eid>/approve", methods=["PUT"])
@require_roles("admin", "parent")
def approve_entry(eid):
    """Parent (or admin) approves a player's RSVP: interested → registered."""
    caller = get_current_user()
    e = c.get_entry(eid)
    if e is None:
        return _not_found("Entry")
    if has_role(caller, "parent") and not _junior_in_scope(caller, e.junior):
        return _err("FORBIDDEN", "Parents can only approve their own child's RSVP", 403)
    if (getattr(e.status, "value", e.status)) != "interested":
        return _err("CONFLICT", "Only an interested (RSVP) entry can be approved", 409)
    return _data(c.entry_schema.dump(c.update_entry(e, {"status": "registered"})))


@tournaments_bp.route("/tournament-entries/<int:eid>/decline", methods=["PUT"])
@require_roles("admin", "parent")
def decline_entry(eid):
    """Parent (or admin) declines a player's RSVP: interested → declined."""
    caller = get_current_user()
    e = c.get_entry(eid)
    if e is None:
        return _not_found("Entry")
    if has_role(caller, "parent") and not _junior_in_scope(caller, e.junior):
        return _err("FORBIDDEN", "Parents can only decline their own child's RSVP", 403)
    if (getattr(e.status, "value", e.status)) != "interested":
        return _err("CONFLICT", "Only an interested (RSVP) entry can be declined", 409)
    return _data(c.entry_schema.dump(c.update_entry(e, {"status": "declined"})))


# ══════════════════════════════════════════════════════════════════════════════
# Scores (read / verify; creation is via /tournaments/:id/scores)
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/tournament-scores", methods=["GET"])
@require_auth
def get_scores():
    items = c.list_scores(
        tournament_id=request.args.get("tournament_id"),
        entry_id=request.args.get("entry_id"),
    )
    return _data(c.scores_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournament-scores/<int:sid>", methods=["GET"])
@require_auth
def get_score_route(sid):
    sc = c.get_score(sid)
    if sc is None:
        return _not_found("Score")
    return _data(c.score_schema.dump(sc))


@tournaments_bp.route("/tournament-scores/<int:sid>", methods=["PUT"])
@require_roles("admin", "coach")
def put_score(sid):
    sc = c.get_score(sid)
    if sc is None:
        return _not_found("Score")
    return _data(c.score_schema.dump(c.update_score(sc, request.get_json() or {})))


@tournaments_bp.route("/tournament-scores/<int:sid>", methods=["DELETE"])
@admin_only
def delete_score_route(sid):
    sc = c.get_score(sid)
    if sc is None:
        return _not_found("Score")
    c.delete_score(sc)
    return "", 204


# ══════════════════════════════════════════════════════════════════════════════
# Matches (match play)
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/tournament-matches", methods=["GET"])
@require_auth
def get_matches():
    items = c.list_matches(
        tournament_id=request.args.get("tournament_id"),
        round_number=request.args.get("round_number"),
        status=request.args.get("status"),
    )
    return _data(c.matches_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournament-matches/<int:mid>", methods=["GET"])
@require_auth
def get_match_route(mid):
    result, err = c.match_detail(mid)
    if err:
        return _from_tuple(err)
    return _data(result)


@tournaments_bp.route("/tournament-matches/<int:mid>", methods=["PUT"])
@require_roles("admin", "coach")
def put_match(mid):
    m = c.get_match(mid)
    if m is None:
        return _not_found("Match")
    result, err = c.update_match(m, request.get_json() or {})
    if err:
        return _from_tuple(err)
    return _data(c.match_schema.dump(result))


# ══════════════════════════════════════════════════════════════════════════════
# External results
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/external-results", methods=["GET"])
@require_auth
def get_external_results():
    caller = get_current_user()
    items = c.list_external_results(
        junior_id=request.args.get("junior_id"),
        event_type=request.args.get("event_type"),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
    )
    if has_role(caller, "parent", "player"):
        items = [r for r in items if _junior_in_scope(caller, r.junior)]
    return _data(c.externals_schema.dump(items), count=len(items))


@tournaments_bp.route("/external-results", methods=["POST"])
@require_roles("admin", "coach", "parent")
def post_external_result():
    caller = get_current_user()
    data = request.get_json() or {}
    is_parent = has_role(caller, "parent")
    if is_parent:
        junior = _get_junior(data.get("junior_id"))
        if not _junior_in_scope(caller, junior):
            return _err("FORBIDDEN", "Parents can only log results for their own child", 403)
    # Staff-logged results are verified at creation; parent-logged ones wait
    # for staff verification (decision 11).
    r = c.create_external_result(data, logged_by=caller.id, verified=not is_parent)
    return _data(c.external_schema.dump(r), 201)


@tournaments_bp.route("/external-results/<int:rid>/verify", methods=["PUT"])
@require_roles("admin", "coach")
def verify_external_result_route(rid):
    r = c.get_external_result(rid)
    if r is None:
        return _not_found("External result")
    caller = get_current_user()
    return _data(c.external_schema.dump(c.verify_external_result(r, caller.id)))


@tournaments_bp.route("/external-results/<int:rid>", methods=["GET"])
@require_auth
def get_external_result_route(rid):
    caller = get_current_user()
    r = c.get_external_result(rid)
    if r is None:
        return _not_found("External result")
    if has_role(caller, "parent", "player") and not _junior_in_scope(caller, r.junior):
        return _err("FORBIDDEN", "Out of scope", 403)
    return _data(c.external_schema.dump(r))


@tournaments_bp.route("/external-results/<int:rid>", methods=["PUT"])
@require_roles("admin", "coach")
def put_external_result(rid):
    r = c.get_external_result(rid)
    if r is None:
        return _not_found("External result")
    return _data(c.external_schema.dump(c.update_external_result(r, request.get_json() or {})))


@tournaments_bp.route("/external-results/<int:rid>", methods=["DELETE"])
@require_roles("admin", "coach")
def delete_external_result_route(rid):
    r = c.get_external_result(rid)
    if r is None:
        return _not_found("External result")
    c.delete_external_result(r)
    return "", 204


# ══════════════════════════════════════════════════════════════════════════════
# Series + standings
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/series", methods=["GET"])
@require_auth
def get_series_list():
    items = c.list_series(year=request.args.get("year"))
    return _data(c.series_list_schema.dump(items), count=len(items))


@tournaments_bp.route("/series", methods=["POST"])
@admin_only
def post_series():
    s = c.create_series(request.get_json() or {})
    return _data(c.series_schema.dump(s), 201)


@tournaments_bp.route("/series/<int:sid>", methods=["GET"])
@require_auth
def get_series_route(sid):
    s = c.get_series(sid)
    if s is None:
        return _not_found("Series")
    return _data(c.series_schema.dump(s))


@tournaments_bp.route("/series/<int:sid>", methods=["PUT"])
@admin_only
def put_series(sid):
    s = c.get_series(sid)
    if s is None:
        return _not_found("Series")
    return _data(c.series_schema.dump(c.update_series(s, request.get_json() or {})))


@tournaments_bp.route("/series/<int:sid>", methods=["DELETE"])
@admin_only
def delete_series_route(sid):
    s = c.get_series(sid)
    if s is None:
        return _not_found("Series")
    c.delete_series(s)
    return "", 204


@tournaments_bp.route("/series/<int:sid>/standings", methods=["GET"])
@require_auth
def get_series_standings(sid):
    result, err = c.series_standings(sid)
    if err:
        return _from_tuple(err)
    return _data(result)


# ══════════════════════════════════════════════════════════════════════════════
# Combined junior competition history (feeds monthly evaluation stats)
# ══════════════════════════════════════════════════════════════════════════════

@tournaments_bp.route("/juniors/<int:junior_id>/competitions", methods=["GET"])
@require_auth
def get_junior_competitions(junior_id):
    caller = get_current_user()
    junior = _get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    if not _junior_in_scope(caller, junior):
        return _err("FORBIDDEN", "Out of scope", 403)
    result = c.junior_competitions(
        junior_id,
        date_from=request.args.get("from"),
        date_to=request.args.get("to"),
    )
    return _data(result)


@tournaments_bp.route("/juniors/<int:junior_id>/competition-requirements", methods=["GET"])
@require_auth
def get_junior_competition_requirements(junior_id):
    """Per-junior competition compliance against the Junior Development Plan's
    per-band requirements for a season (?season=YYYY, default current year).
    Scoped like other junior-reading endpoints: admin/coach/committee always;
    parent own child only; player self only."""
    caller = get_current_user()
    junior = _get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    if not _junior_in_scope(caller, junior):
        return _err("FORBIDDEN", "Out of scope", 403)
    result, err = c.competition_requirements(
        junior_id, season=request.args.get("season")
    )
    if err:
        return _from_tuple(err)
    return _data(result)
