from flask import Blueprint, jsonify, request

from app.handicap.controllers import (
    journey_schema,
    get_or_create_journey,
    update_journey,
    compute_progress,
)
from app.juniors.controllers import get_junior
from app.utils.decorators import (
    require_roles, require_auth, get_current_user, has_role,
)

handicap_bp = Blueprint("handicap_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


def _scope_error(caller, junior):
    """Replicate the parent/player ownership scoping used across juniors:
    admin/coach/committee see any junior; a parent sees only their own child;
    a player sees only themselves. Returns an error response or None."""
    if has_role(caller, "admin", "coach", "committee"):
        return None
    if has_role(caller, "parent"):
        if str(junior.parent_id) != str(caller.id):
            return _err("FORBIDDEN", "Parents can only view their own children", 403)
        return None
    if has_role(caller, "player"):
        if str(junior.user_id) != str(caller.id):
            return _err("FORBIDDEN", "You can only view your own handicap journey", 403)
        return None
    return _err("FORBIDDEN", "You do not have permission to view this", 403)


def _dump_with_progress(journey, junior):
    out = journey_schema.dump(journey)
    out["progress"] = compute_progress(
        user_id=junior.user_id,
        target_signed_cards=journey.target_signed_cards,
    )
    return out


@handicap_bp.route("/juniors/<int:junior_id>/handicap-journey", methods=["GET"])
@require_auth
def get_handicap_journey(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    caller = get_current_user()
    err = _scope_error(caller, junior)
    if err:
        return err
    # Lazily persist a default not_started journey so the coach has a row to
    # edit; the computed progress block is layered on top.
    journey = get_or_create_journey(junior_id)
    return _data(_dump_with_progress(journey, junior))


@handicap_bp.route("/juniors/<int:junior_id>/handicap-journey", methods=["PUT"])
@require_roles("admin", "coach")
def put_handicap_journey(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    # The coach owns the plan; a coach may only edit a junior assigned to them.
    caller = get_current_user()
    if has_role(caller, "coach") and not has_role(caller, "admin"):
        if junior.coach_id is not None and str(junior.coach_id) != str(caller.id):
            return _err("FORBIDDEN", "Coaches can only manage their own juniors", 403)
    journey = get_or_create_journey(junior_id)
    journey, problem = update_journey(journey, request.get_json() or {})
    if problem:
        return _err("VALIDATION_ERROR", problem, 400)
    return _data(_dump_with_progress(journey, junior))
