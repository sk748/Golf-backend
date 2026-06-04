from flask import Blueprint, jsonify, request

from app.admin.controllers import (
    get_platform_stats, list_all_users,
    toggle_user_active, change_user_role,
)
from app.auth.controllers import user_schema, users_schema
from app.utils.decorators import admin_only

admin_bp = Blueprint("admin_bp", __name__, url_prefix="/api/admin")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


# All admin routes are protected by @admin_only

@admin_bp.route("/stats", methods=["GET"])
@admin_only
def platform_stats():
    return _data(get_platform_stats())


@admin_bp.route("/users", methods=["GET"])
@admin_only
def admin_list_users():
    is_active = request.args.get("is_active")
    if is_active is not None:
        is_active = is_active.lower() in ("true", "1")
    users = list_all_users(role=request.args.get("role"), is_active=is_active)
    return _data(users_schema.dump(users), count=len(users))


@admin_bp.route("/users/<user_id>/activate", methods=["POST"])
@admin_only
def activate_user(user_id):
    user, err = toggle_user_active(user_id, True)
    if err:
        return _err("NOT_FOUND", err, 404)
    return _data(user_schema.dump(user))


@admin_bp.route("/users/<user_id>/deactivate", methods=["POST"])
@admin_only
def deactivate_user(user_id):
    user, err = toggle_user_active(user_id, False)
    if err:
        return _err("NOT_FOUND", err, 404)
    return _data(user_schema.dump(user))


@admin_bp.route("/users/<user_id>/role", methods=["PUT"])
@admin_only
def update_user_role(user_id):
    data = request.get_json() or {}
    new_role = data.get("role")
    if not new_role:
        return _err("VALIDATION_ERROR", "role is required", 400)
    user, err = change_user_role(user_id, new_role)
    if err:
        status = 404 if "not found" in err.lower() else 400
        return _err("ERROR", err, status)
    return _data(user_schema.dump(user))
