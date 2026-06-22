from flask import Blueprint, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from app.rounds.controllers import (
    round_schema, rounds_schema, hole_score_schema, hole_scores_schema,
    list_rounds, get_round, create_round, update_round, delete_round,
    get_handicap_history,
    list_hole_scores, get_hole_score, create_hole_score, update_hole_score, delete_hole_score,
    sync_score, verify_round,
)
from app.utils.decorators import require_roles, require_auth, admin_only, get_current_user, has_role

rounds_bp = Blueprint("rounds_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


# ── Score sync ────────────────────────────────────────────────────────────────

@rounds_bp.route("/scores/sync", methods=["POST"])
@require_roles("admin", "player", "coach")
def scores_sync():
    """Submit a round. Player-entered rounds start PENDING (a coach/admin/
    committee member verifies before they count); staff-entered rounds are
    verified immediately. Staff may submit on another player's behalf via
    user_id; players only ever submit their own."""
    from app.auth.models import User
    from app.database.database import db

    caller = get_current_user()
    data = request.get_json() or {}

    target_email = caller.email
    target_user_id = data.get("user_id")
    if target_user_id and str(target_user_id) != str(caller.id):
        if not has_role(caller, "admin", "coach"):
            return _err("FORBIDDEN", "Players can only submit their own rounds", 403)
        target = db.session.get(User, str(target_user_id))
        if target is None:
            return _err("NOT_FOUND", "Player not found", 404)
        target_email = target.email

    initial_status = "pending" if has_role(caller, "player") else "verified"
    result, err = sync_score(
        target_email, data, entered_by=caller.id, initial_status=initial_status
    )
    if err:
        if "not found" in err.lower():
            return _err("NOT_FOUND", err, 404)
        return _err("VALIDATION_ERROR", err, 400)
    return jsonify(result), 201


@rounds_bp.route("/rounds/<int:round_id>/verify", methods=["POST"])
@require_roles("admin", "coach", "committee")
def verify_round_route(round_id):
    """Verify a pending player-entered round; if it counts toward handicap the
    player's index recomputes. Idempotent on already-verified rounds."""
    r = get_round(round_id)
    if r is None:
        return _not_found("Round")
    caller = get_current_user()
    r, new_index = verify_round(r, caller.id)
    payload = round_schema.dump(r)
    payload["new_handicap_index"] = new_index
    return _data(payload)


# ── Rounds CRUD ───────────────────────────────────────────────────────────────

@rounds_bp.route("/rounds", methods=["GET"])
@require_auth
def get_rounds():
    caller = get_current_user()
    user_id = request.args.get("user_id")
    # players can only see their own rounds
    if has_role(caller, "player"):
        user_id = caller.id
    items = list_rounds(
        user_id=user_id,
        course_id=request.args.get("course_id"),
        round_type=request.args.get("round_type"),
        status=request.args.get("status"),
    )
    return _data(rounds_schema.dump(items), count=len(items))


@rounds_bp.route("/rounds", methods=["POST"])
@require_roles("admin", "player", "coach")
def post_round():
    r = create_round(request.get_json() or {})
    return _data(round_schema.dump(r), 201)


@rounds_bp.route("/rounds/<int:round_id>", methods=["GET"])
@require_auth
def get_round_route(round_id):
    r = get_round(round_id)
    if r is None:
        return _not_found("Round")
    caller = get_current_user()
    if has_role(caller, "player") and str(r.user_id) != str(caller.id):
        return _err("FORBIDDEN", "Players can only view their own rounds", 403)
    return _data(round_schema.dump(r))


@rounds_bp.route("/rounds/<int:round_id>", methods=["PUT"])
@admin_only
def put_round(round_id):
    r = get_round(round_id)
    if r is None:
        return _not_found("Round")
    return _data(round_schema.dump(update_round(r, request.get_json() or {})))


@rounds_bp.route("/rounds/<int:round_id>", methods=["DELETE"])
@admin_only
def delete_round_route(round_id):
    r = get_round(round_id)
    if r is None:
        return _not_found("Round")
    delete_round(r)
    return "", 204


@rounds_bp.route("/users/<user_id>/handicap-history", methods=["GET"])
@require_auth
def handicap_history(user_id):
    caller = get_current_user()
    # players can only view their own history; coaches/admin can view any
    if has_role(caller, "player") and str(caller.id) != str(user_id):
        return _err("FORBIDDEN", "Players can only view their own handicap history", 403)
    items = get_handicap_history(user_id)
    return _data(rounds_schema.dump(items), count=len(items))


# ── Hole Scores CRUD ──────────────────────────────────────────────────────────

@rounds_bp.route("/hole-scores", methods=["GET"])
@require_auth
def get_hole_scores():
    items = list_hole_scores(round_id=request.args.get("round_id"))
    return _data(hole_scores_schema.dump(items), count=len(items))


@rounds_bp.route("/hole-scores", methods=["POST"])
@require_roles("admin", "player", "coach")
def post_hole_score():
    hs = create_hole_score(request.get_json() or {})
    return _data(hole_score_schema.dump(hs), 201)


@rounds_bp.route("/hole-scores/<int:hole_score_id>", methods=["GET"])
@require_auth
def get_hole_score_route(hole_score_id):
    hs = get_hole_score(hole_score_id)
    if hs is None:
        return _not_found("Hole score")
    return _data(hole_score_schema.dump(hs))


@rounds_bp.route("/hole-scores/<int:hole_score_id>", methods=["PUT"])
@require_roles("admin", "player", "coach")
def put_hole_score(hole_score_id):
    hs = get_hole_score(hole_score_id)
    if hs is None:
        return _not_found("Hole score")
    return _data(hole_score_schema.dump(update_hole_score(hs, request.get_json() or {})))


@rounds_bp.route("/hole-scores/<int:hole_score_id>", methods=["DELETE"])
@admin_only
def delete_hole_score_route(hole_score_id):
    hs = get_hole_score(hole_score_id)
    if hs is None:
        return _not_found("Hole score")
    delete_hole_score(hs)
    return "", 204
