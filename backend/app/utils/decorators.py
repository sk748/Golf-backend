"""
Permission decorators for the Karen Golf Management Platform.

Usage
-----
  @require_roles("admin", "coach")          # allow those roles; 403 otherwise
  @require_auth                             # any authenticated user; 401 otherwise
  @admin_only                               # shortcut for admin-only routes

Inside a route you can also call:
  user = get_current_user()                 # returns User or None (if unauthenticated)
  require_ownership(user, obj.owner_id)     # raises 403 if user is not admin and ids differ
"""

import functools
import logging

from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity


# ── Core helpers ──────────────────────────────────────────────────────────────

def get_current_user():
    """Return the User for the active JWT, or None if there is no valid token."""
    try:
        verify_jwt_in_request(optional=True)
        email = get_jwt_identity()
        if not email:
            return None
        from app.auth.controllers import get_user_by_email
        return get_user_by_email(email)
    except Exception:
        return None


def _unauthorized(message="Authentication required"):
    return jsonify({"error": {"code": "UNAUTHORIZED", "message": message}}), 401


def _forbidden(message="You do not have permission to perform this action"):
    return jsonify({"error": {"code": "FORBIDDEN", "message": message}}), 403


# ── Decorators ────────────────────────────────────────────────────────────────

def require_roles(*roles):
    """
    Require the caller to be authenticated and have one of the given roles.
    Returns 401 when there is no valid JWT.
    Returns 403 when the user's role is not in the allowed list.
    """
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            try:
                verify_jwt_in_request()
            except Exception:
                return _unauthorized()

            from app.auth.controllers import get_user_by_email
            user = get_user_by_email(get_jwt_identity())

            if user is None or not user.is_active:
                return _unauthorized("Account inactive or not found")

            if roles:
                role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
                if role_val not in roles:
                    allowed = ", ".join(roles)
                    return _forbidden(f"Required role(s): {allowed}. Your role: {role_val}")

            return f(*args, **kwargs)
        return wrapper
    return decorator


def require_auth(f):
    """Require any valid authenticated user (any role)."""
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception:
            return _unauthorized()

        from app.auth.controllers import get_user_by_email
        user = get_user_by_email(get_jwt_identity())
        if user is None or not user.is_active:
            return _unauthorized("Account inactive or not found")

        return f(*args, **kwargs)
    return wrapper


def admin_only(f):
    """Shortcut: only admin role is allowed."""
    return require_roles("admin")(f)


# ── Ownership / scoping helpers ───────────────────────────────────────────────

def require_ownership(user, owner_id, allow_roles=("admin",)):
    """
    Raise (return) a 403 response if the user is neither an admin nor the owner.
    Usage inside a route:
        err = require_ownership(user, junior.parent_id, allow_roles=("admin",))
        if err: return err
    """
    if user is None:
        return _unauthorized()
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val in allow_roles:
        return None
    if str(user.id) != str(owner_id):
        return _forbidden("You can only access your own resources")
    return None


def is_admin(user):
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role_val == "admin"


def has_role(user, *roles):
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role_val in roles


def coach_owns_junior(caller, junior):
    """Coach roster scoping (CLAUDE.md: "a coach sees the juniors assigned to
    them"). True when the caller is the coach this junior is assigned to.

    Sam's directive 2026-06-16: a coach sees ONLY their own students, no
    exceptions — so coach-facing junior/evaluation/attendance routes gate on
    this server-side, not just the frontend `useCoachJuniors` filter (which is
    UX only). Admin/committee are NOT coaches and are checked separately.
    """
    if junior is None:
        return False
    return str(getattr(junior, "coach_id", None)) == str(caller.id)
