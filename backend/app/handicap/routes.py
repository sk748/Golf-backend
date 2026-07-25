from flask import Blueprint, jsonify, request

from app.audit import service as audit_service
from app.auth.models import User
from app.database.database import db
from app.handicap.controllers import (
    journey_schema,
    get_or_create_journey,
    update_journey,
    compute_progress,
    set_manual_handicap,
)
from app.juniors.controllers import get_junior
from app.juniors.models import JuniorProfile
from app.utils.decorators import (
    require_roles, require_auth, get_current_user, has_role, junior_in_scope,
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
    if not junior_in_scope(caller, junior):
        if has_role(caller, "parent"):
            return _err("FORBIDDEN", "Parents can only view their own children", 403)
        if has_role(caller, "player"):
            return _err("FORBIDDEN", "You can only view your own handicap journey", 403)
        if has_role(caller, "coach"):
            return _err("FORBIDDEN", "Coaches can only view their own juniors", 403)
        return _err("FORBIDDEN", "You do not have permission to view this", 403)
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
        if junior.coach_id is None or str(junior.coach_id) != str(caller.id):
            return _err("FORBIDDEN", "Coaches can only manage their own juniors", 403)
    journey = get_or_create_journey(junior_id)
    journey, problem = update_journey(journey, request.get_json() or {})
    if problem:
        return _err("VALIDATION_ERROR", problem, 400)
    return _data(_dump_with_progress(journey, junior))


def _handicap_payload(user):
    return {
        "id": user.id,
        "handicap_index": float(user.handicap_index) if user.handicap_index is not None else None,
        "handicap_source": user.handicap_source,
        "handicap_set_by": user.handicap_set_by,
        "handicap_set_at": user.handicap_set_at.isoformat() if user.handicap_set_at else None,
    }


@handicap_bp.route("/users/<user_id>/handicap", methods=["PUT"])
@require_roles("admin", "coach", "committee")
def put_user_handicap(user_id):
    """Manually set (or clear) a user's handicap index. Only admin/coach/committee;
    a coach is further scoped to juniors assigned to them. Audited."""
    user = db.session.get(User, user_id)
    if user is None:
        return _not_found("User")
    caller = get_current_user()

    # Coach scoping: a coach may only set the handicap for a junior assigned to
    # them. Admin and committee may set for anyone.
    if has_role(caller, "coach") and not has_role(caller, "admin", "committee"):
        jp = JuniorProfile.query.filter_by(user_id=user.id).first()
        if jp is None or jp.coach_id is None or str(jp.coach_id) != str(caller.id):
            return _err("FORBIDDEN", "Coaches can only set handicaps for their own juniors", 403)

    body = request.get_json() or {}
    if "handicap_index" not in body:
        return _err("VALIDATION_ERROR", "handicap_index is required (number, or null to clear)", 400)

    updated, problem = set_manual_handicap(user, body["handicap_index"], str(caller.id))
    if problem:
        return _err("VALIDATION_ERROR", problem, 400)

    audit_service.record(
        "handicap.manual_set",
        actor=caller,
        target_type="user",
        target_id=user.id,
        target_label=f"{user.first_name} {user.last_name}".strip() or user.email,
        metadata={"handicap_index": _handicap_payload(updated)["handicap_index"]},
    )
    return _data(_handicap_payload(updated))
