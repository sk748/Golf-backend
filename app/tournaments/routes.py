from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.tournaments.controllers import (
    tournament_schema, tournaments_schema,
    team_schema, teams_schema,
    match_schema, matches_schema,
    penalty_schema, penalties_schema,
    list_tournaments, get_tournament, create_tournament, update_tournament, delete_tournament,
    list_teams, get_team, create_team, update_team, delete_team,
    list_matches, get_match, create_match, update_match, delete_match,
    list_penalties, get_penalty, create_penalty, update_penalty, delete_penalty,
    get_leaderboard, get_head_to_head, get_stroke_calc,
)
from app.utils.decorators import require_roles, require_auth, admin_only

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


# ── Tournaments ───────────────────────────────────────────────────────────────

@tournaments_bp.route("/tournaments", methods=["GET"])
@require_auth
def get_tournaments():
    items = list_tournaments(year=request.args.get("year"), status=request.args.get("status"))
    return _data(tournaments_schema.dump(items), count=len(items))


@tournaments_bp.route("/tournaments", methods=["POST"])
@admin_only
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
@admin_only
def put_tournament(tournament_id):
    t = get_tournament(tournament_id)
    if t is None:
        return _not_found("Tournament")
    return _data(tournament_schema.dump(update_tournament(t, request.get_json() or {})))


@tournaments_bp.route("/tournaments/<int:tournament_id>", methods=["DELETE"])
@admin_only
def delete_tournament_route(tournament_id):
    t = get_tournament(tournament_id)
    if t is None:
        return _not_found("Tournament")
    delete_tournament(t)
    return "", 204


@tournaments_bp.route("/tournaments/<int:tournament_id>/leaderboard", methods=["GET"])
@require_auth
def leaderboard(tournament_id):
    rows, err = get_leaderboard(tournament_id)
    if err:
        return _not_found("Tournament")
    return _data(rows, count=len(rows))


@tournaments_bp.route("/tournaments/<int:tournament_id>/head-to-head", methods=["GET"])
@require_auth
def head_to_head(tournament_id):
    team_a = request.args.get("team_a", type=int)
    team_b = request.args.get("team_b", type=int)
    if not team_a or not team_b:
        return _err("VALIDATION_ERROR", "team_a and team_b are required", 400)
    return _data(get_head_to_head(tournament_id, team_a, team_b))


# ── Teams ─────────────────────────────────────────────────────────────────────

@tournaments_bp.route("/teams", methods=["GET"])
@require_auth
def get_teams():
    items = list_teams(
        tournament_id=request.args.get("tournament_id"),
        search=request.args.get("search"),
    )
    return _data(teams_schema.dump(items), count=len(items))


@tournaments_bp.route("/teams", methods=["POST"])
@require_roles("admin", "coach")
def post_team():
    try:
        team = create_team(request.get_json() or {})
        return _data(team_schema.dump(team), 201)
    except (ValueError, IntegrityError) as exc:
        return _err("CONFLICT", str(exc), 409)


@tournaments_bp.route("/teams/<int:team_id>", methods=["GET"])
@require_auth
def get_team_route(team_id):
    team = get_team(team_id)
    if team is None:
        return _not_found("Team")
    return _data(team_schema.dump(team))


@tournaments_bp.route("/teams/<int:team_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_team(team_id):
    team = get_team(team_id)
    if team is None:
        return _not_found("Team")
    return _data(team_schema.dump(update_team(team, request.get_json() or {})))


@tournaments_bp.route("/teams/<int:team_id>", methods=["DELETE"])
@admin_only
def delete_team_route(team_id):
    team = get_team(team_id)
    if team is None:
        return _not_found("Team")
    delete_team(team)
    return "", 204


# ── Matches ───────────────────────────────────────────────────────────────────

@tournaments_bp.route("/matches", methods=["GET"])
@require_auth
def get_matches():
    items = list_matches(
        tournament_id=request.args.get("tournament_id"),
        stage=request.args.get("stage"),
        result=request.args.get("result"),
        team_id=request.args.get("team_id"),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
    )
    return _data(matches_schema.dump(items), count=len(items))


@tournaments_bp.route("/matches", methods=["POST"])
@require_roles("admin", "coach")
def post_match():
    data = request.get_json() or {}
    try:
        m = create_match(data)
        return _data(match_schema.dump(m), 201)
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)
    except IntegrityError:
        return _err("CONFLICT", "Match conflicts with existing data", 409)


@tournaments_bp.route("/matches/<int:match_id>", methods=["GET"])
@require_auth
def get_match_route(match_id):
    m = get_match(match_id)
    if m is None:
        return _not_found("Match")
    return _data(match_schema.dump(m))


@tournaments_bp.route("/matches/<int:match_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_match(match_id):
    m = get_match(match_id)
    if m is None:
        return _not_found("Match")
    data = request.get_json() or {}
    try:
        return _data(match_schema.dump(update_match(m, data)))
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)


@tournaments_bp.route("/matches/<int:match_id>", methods=["DELETE"])
@admin_only
def delete_match_route(match_id):
    m = get_match(match_id)
    if m is None:
        return _not_found("Match")
    delete_match(m)
    return "", 204


@tournaments_bp.route("/matches/<int:match_id>/stroke-calc", methods=["GET"])
@require_auth
def stroke_calc(match_id):
    result, err = get_stroke_calc(match_id)
    if err:
        return _not_found("Match")
    return _data(result)


# ── Penalties ─────────────────────────────────────────────────────────────────

@tournaments_bp.route("/penalties", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_penalties():
    items = list_penalties(
        team_id=request.args.get("team_id"),
        match_id=request.args.get("match_id"),
        penalty_type=request.args.get("penalty_type"),
    )
    return _data(penalties_schema.dump(items), count=len(items))


@tournaments_bp.route("/penalties", methods=["POST"])
@admin_only
def post_penalty():
    data = request.get_json() or {}
    try:
        p = create_penalty(data)
        return _data(penalty_schema.dump(p), 201)
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)
    except IntegrityError:
        return _err("CONFLICT", "Penalty conflicts with existing data", 409)


@tournaments_bp.route("/penalties/<int:penalty_id>", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_penalty_route(penalty_id):
    p = get_penalty(penalty_id)
    if p is None:
        return _not_found("Penalty")
    return _data(penalty_schema.dump(p))


@tournaments_bp.route("/penalties/<int:penalty_id>", methods=["PUT"])
@admin_only
def put_penalty(penalty_id):
    p = get_penalty(penalty_id)
    if p is None:
        return _not_found("Penalty")
    return _data(penalty_schema.dump(update_penalty(p, request.get_json() or {})))


@tournaments_bp.route("/penalties/<int:penalty_id>", methods=["DELETE"])
@admin_only
def delete_penalty_route(penalty_id):
    p = get_penalty(penalty_id)
    if p is None:
        return _not_found("Penalty")
    delete_penalty(p)
    return "", 204
