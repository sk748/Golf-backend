from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.auth.controllers import (
    user_schema, users_schema,
    register_user, login_user,
    update_user_profile, list_users, get_user_by_id,
    create_user, update_user, delete_user,
)
from app.utils.decorators import require_roles, require_auth, admin_only, get_current_user, require_ownership
from app.utils.limiter import limiter
from app.audit.service import record


def _user_label(user):
    return f"{user.first_name} {user.last_name}".strip() or user.email


def _role_value(user):
    return user.role.value if hasattr(user.role, "value") else user.role

user_v1 = Blueprint("user_v1", __name__, url_prefix="/api")


def _ok(data, status=200):
    return jsonify(data), status


def _err(message, status=400):
    return jsonify({"error": message}), status


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _build_auth_response(user):
    token = user.generate_auth_token()
    return _ok({"token": token, "user": user_schema.dump(user)})


# ── Public auth endpoints ─────────────────────────────────────────────────────

@user_v1.route("/auth/register", methods=["POST"])
@limiter.limit("10 per hour; 3 per minute")
def register():
    data = request.get_json() or {}
    user, err = register_user(data)
    if err:
        status = 409 if "already" in err else 400
        return _err(err, status)
    return _build_auth_response(user)


@user_v1.route("/auth/login", methods=["POST"])
@limiter.limit("20 per hour; 5 per minute")
def login():
    data = request.get_json() or {}
    user, err = login_user(data.get("email", ""), data.get("password", ""))
    if err:
        status = 401 if "credentials" in err.lower() or "inactive" in err.lower() else 400
        return _err(err, status)
    return _build_auth_response(user)


@user_v1.route("/auth/me", methods=["GET"])
@require_auth
def get_me():
    user = get_current_user()
    return _ok(user_schema.dump(user))


@user_v1.route("/auth/profile", methods=["PUT"])
@require_auth
def update_profile():
    user = get_current_user()
    data = request.get_json() or {}
    return _ok(user_schema.dump(update_user_profile(user, data)))


# ── User CRUD (admin manages; users can read/update self) ─────────────────────

@user_v1.route("/users", methods=["GET"])
@require_roles("admin", "coach", "committee")
def list_users_route():
    users = list_users(
        search=request.args.get("search"),
        role=request.args.get("role"),
        membership_type=request.args.get("membership_type"),
    )
    return _data(users_schema.dump(users), count=len(users))


@user_v1.route("/users", methods=["POST"])
@admin_only
def create_user_route():
    data = request.get_json() or {}
    try:
        user = create_user(data)
        record(
            "user.created",
            actor=get_current_user(),
            target_type="user",
            target_id=user.id,
            target_label=_user_label(user),
            metadata={"role": _role_value(user)},
        )
        return _data(user_schema.dump(user), 201)
    except IntegrityError:
        return jsonify({"error": {"code": "CONFLICT", "message": "User already exists"}}), 409


@user_v1.route("/users/<user_id>", methods=["GET"])
@require_auth
def get_user_route(user_id):
    caller = get_current_user()
    # admin sees any user; others only themselves
    err = require_ownership(caller, user_id, allow_roles=("admin", "coach", "committee"))
    if err:
        return err
    user = get_user_by_id(user_id)
    if user is None:
        return jsonify({"error": {"code": "NOT_FOUND", "message": "User not found"}}), 404
    return _data(user_schema.dump(user))


@user_v1.route("/users/<user_id>", methods=["PUT"])
@require_auth
def update_user_route(user_id):
    caller = get_current_user()
    err = require_ownership(caller, user_id, allow_roles=("admin",))
    if err:
        return err
    user = get_user_by_id(user_id)
    if user is None:
        return jsonify({"error": {"code": "NOT_FOUND", "message": "User not found"}}), 404
    data = request.get_json() or {}
    is_admin_caller = caller and (caller.role.value if hasattr(caller.role, "value") else caller.role) == "admin"
    try:
        return _data(user_schema.dump(update_user(user, data, allow_privileged=is_admin_caller)))
    except ValueError as exc:
        return jsonify({"error": {"code": "VALIDATION_ERROR", "message": str(exc)}}), 400
    except IntegrityError:
        return jsonify({"error": {"code": "CONFLICT", "message": "Update conflicts with existing data"}}), 409


@user_v1.route("/users/<user_id>", methods=["DELETE"])
@admin_only
def delete_user_route(user_id):
    user = get_user_by_id(user_id)
    if user is None:
        return jsonify({"error": {"code": "NOT_FOUND", "message": "User not found"}}), 404
    delete_user(user)
    return "", 204
