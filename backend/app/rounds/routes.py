from flask import Blueprint, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from app.rounds.controllers import (
    round_schema, rounds_schema, hole_score_schema, hole_scores_schema,
    list_rounds, get_round, update_round, delete_round,
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


def _can_access_round(caller, r):
    """Round-level scoping (security audit C-1): admin/committee club-wide,
    the round's owner always, and — when the owner is a junior — that junior's
    assigned coach or linked parent."""
    if has_role(caller, "admin", "committee"):
        return True
    if str(r.user_id) == str(caller.id):
        return True
    from app.juniors.models import JuniorProfile
    junior = JuniorProfile.query.filter_by(user_id=r.user_id).first()
    if junior is None:
        return False
    if has_role(caller, "coach"):
        return str(junior.coach_id) == str(caller.id)
    if has_role(caller, "parent"):
        return str(junior.parent_id) == str(caller.id)
    return False


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
    user_ids = None
    # players can only see their own rounds; parents only their own children's
    if has_role(caller, "player"):
        user_id = caller.id
    elif has_role(caller, "parent"):
        from app.juniors.models import JuniorProfile
        child_ids = [
            j.user_id for j in JuniorProfile.query.filter_by(parent_id=caller.id).all()
        ]
        if user_id:
            if str(user_id) not in {str(c) for c in child_ids}:
                return _err("FORBIDDEN", "Parents can only view their own children's rounds", 403)
        else:
            user_ids = child_ids
    items = list_rounds(
        user_id=user_id,
        user_ids=user_ids,
        course_id=request.args.get("course_id"),
        round_type=request.args.get("round_type"),
        status=request.args.get("status"),
    )
    return _data(rounds_schema.dump(items), count=len(items))


@rounds_bp.route("/rounds", methods=["POST"])
@require_roles("admin", "player", "coach")
def post_round():
    """Create a round through the same path as /scores/sync (security audit
    C-2/MA-1): owner and entered_by stamped from the JWT, WHS fields computed
    server-side, player-entered rounds start pending. user_id in the body is
    honoured only for admin/coach on-behalf entry; engine-output fields in the
    body are ignored."""
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
    return _data(round_schema.dump(get_round(result["scorecard"]["id"])), 201)


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
    # players can only view their own history; parents only their own
    # children's; coaches/admin/committee can view any
    if has_role(caller, "player") and str(caller.id) != str(user_id):
        return _err("FORBIDDEN", "Players can only view their own handicap history", 403)
    if has_role(caller, "parent"):
        from app.juniors.models import JuniorProfile
        junior = JuniorProfile.query.filter_by(user_id=str(user_id)).first()
        if junior is None or str(junior.parent_id) != str(caller.id):
            return _err(
                "FORBIDDEN", "Parents can only view their own children's handicap history", 403
            )
    items = get_handicap_history(user_id)
    return _data(rounds_schema.dump(items), count=len(items))


# ── Hole Scores CRUD ──────────────────────────────────────────────────────────

@rounds_bp.route("/hole-scores", methods=["GET"])
@require_auth
def get_hole_scores():
    caller = get_current_user()
    round_id = request.args.get("round_id")
    if not has_role(caller, "admin", "committee"):
        if not round_id or not str(round_id).isdigit():
            return _err("VALIDATION_ERROR", "round_id is required", 400)
        r = get_round(int(round_id))
        if r is None:
            return _not_found("Round")
        if not _can_access_round(caller, r):
            return _err("FORBIDDEN", "You do not have access to this round", 403)
    items = list_hole_scores(round_id=round_id)
    return _data(hole_scores_schema.dump(items), count=len(items))


@rounds_bp.route("/hole-scores", methods=["POST"])
@require_roles("admin", "player", "coach")
def post_hole_score():
    caller = get_current_user()
    data = request.get_json() or {}
    round_id = data.get("round_id")
    if round_id is None:
        return _err("VALIDATION_ERROR", "round_id is required", 400)
    r = get_round(int(round_id)) if str(round_id).isdigit() else None
    if r is None:
        return _not_found("Round")
    if not _can_access_round(caller, r):
        return _err("FORBIDDEN", "You can only add hole scores to your own rounds", 403)
    hs = create_hole_score(data)
    return _data(hole_score_schema.dump(hs), 201)


@rounds_bp.route("/hole-scores/<int:hole_score_id>", methods=["GET"])
@require_auth
def get_hole_score_route(hole_score_id):
    hs = get_hole_score(hole_score_id)
    if hs is None:
        return _not_found("Hole score")
    caller = get_current_user()
    if not _can_access_round(caller, hs.round):
        return _err("FORBIDDEN", "You do not have access to this round", 403)
    return _data(hole_score_schema.dump(hs))


@rounds_bp.route("/hole-scores/<int:hole_score_id>", methods=["PUT"])
@require_roles("admin", "player", "coach")
def put_hole_score(hole_score_id):
    hs = get_hole_score(hole_score_id)
    if hs is None:
        return _not_found("Hole score")
    caller = get_current_user()
    if not _can_access_round(caller, hs.round):
        return _err("FORBIDDEN", "You can only edit hole scores on your own rounds", 403)
    data = request.get_json() or {}
    new_round_id = data.get("round_id")
    if new_round_id is not None and str(new_round_id) != str(hs.round_id):
        target = get_round(int(new_round_id)) if str(new_round_id).isdigit() else None
        if target is None:
            return _not_found("Round")
        if not _can_access_round(caller, target):
            return _err("FORBIDDEN", "You can only move hole scores onto your own rounds", 403)
    return _data(hole_score_schema.dump(update_hole_score(hs, data)))


@rounds_bp.route("/hole-scores/<int:hole_score_id>", methods=["DELETE"])
@admin_only
def delete_hole_score_route(hole_score_id):
    hs = get_hole_score(hole_score_id)
    if hs is None:
        return _not_found("Hole score")
    delete_hole_score(hs)
    return "", 204
