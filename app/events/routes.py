"""
Events + RSVP endpoints (general-purpose calendar events).

Blueprint events_bp, url_prefix="/api". Response envelope mirrors
/api/sessions exactly: { "data": ... } / { "data": [...], "count": n }.

Visibility: a caller sees an event if they own it OR they are in the resolved
audience; admin and committee additionally see ALL events (oversight). Each
serialized event carries computed fields my_rsvp / is_owner / going_count plus
optional display names.
"""
from flask import Blueprint, jsonify, request

from app.auth.models import User
from app.database.database import db
from app.events.controllers import (
    event_schema,
    resolve_event_user_ids, get_event, list_events,
    create_event, update_event, delete_event,
    get_rsvp, going_count, list_rsvps, upsert_rsvp,
)
from app.events.models import Event, EventAudience, EventStatus, RSVPStatus
from app.juniors.models import JuniorProfile, LevelBand
from app.utils.decorators import (
    get_current_user, has_role, is_admin, require_auth, require_roles,
)

events_bp = Blueprint("events_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


# ── Serialization ────────────────────────────────────────────────────────────

def _dump(e, caller, audience_ids=None):
    """Serialize an event + computed fields for `caller`.

    `audience_ids` may be passed to reuse a resolved set (caller-aware RSVP)."""
    out = event_schema.dump(e)
    rsvp = get_rsvp(e.id, caller.id)
    out["my_rsvp"] = (getattr(rsvp.status, "value", rsvp.status) if rsvp else None)
    out["is_owner"] = str(e.owner_id) == str(caller.id)
    out["going_count"] = going_count(e.id)
    # Optional display names (best-effort; never the security boundary).
    out["owner_name"] = (
        f"{e.owner.first_name} {e.owner.last_name}".strip() if e.owner else None
    )
    out["band_name"] = e.band.name if e.band else None
    out["coach_name"] = (
        f"{e.coach.first_name} {e.coach.last_name}".strip() if e.coach else None
    )
    if e.junior is not None and e.junior.user is not None:
        ju = e.junior.user
        out["junior_name"] = f"{ju.first_name} {ju.last_name}".strip()
    else:
        out["junior_name"] = None
    return out


def _is_visible(e, caller):
    if str(e.owner_id) == str(caller.id):
        return True
    if has_role(caller, "admin", "committee"):
        return True
    return caller.id in resolve_event_user_ids(e)


# ── Validation ────────────────────────────────────────────────────────────────

def _validate_targeting(data, caller):
    """Validate audience + targeting fields against the caller's role.

    Returns (audience, band_id, coach_id, junior_id, error_response).
    Role rules:
      - admin & committee: any audience.
      - coach: only coach_group (own roster) or individual (own junior).
    """
    audience = data.get("audience")
    if audience not in {a.value for a in EventAudience}:
        return (None,) * 4 + (_err(
            "VALIDATION_ERROR",
            "audience must be one of: everyone, band, coach_group, individual",
            400,
        ),)

    band_id = None
    coach_id = None
    junior_id = None
    coach_caller = has_role(caller, "coach") and not is_admin(caller)

    if audience == "everyone":
        if coach_caller:
            return (None,) * 4 + (_err(
                "FORBIDDEN", "Coaches cannot create club-wide events", 403),)
    elif audience == "band":
        if coach_caller:
            return (None,) * 4 + (_err(
                "FORBIDDEN", "Coaches cannot create band-wide events", 403),)
        band_id = data.get("band_id")
        if band_id is None or db.session.get(LevelBand, band_id) is None:
            return (None,) * 4 + (_err(
                "VALIDATION_ERROR",
                "band_id must reference an existing level band", 400),)
    elif audience == "coach_group":
        coach_id = data.get("coach_id")
        coach = db.session.get(User, str(coach_id or ""))
        if coach is None or not has_role(coach, "coach"):
            return (None,) * 4 + (_err(
                "VALIDATION_ERROR",
                "coach_id must reference an existing coach", 400),)
        if coach_caller and str(coach_id) != str(caller.id):
            return (None,) * 4 + (_err(
                "FORBIDDEN",
                "Coaches can only create events for their own roster", 403),)
    elif audience == "individual":
        junior_id = data.get("junior_id")
        junior = db.session.get(JuniorProfile, junior_id) if junior_id else None
        if junior is None:
            return (None,) * 4 + (_err(
                "VALIDATION_ERROR",
                "junior_id must reference an existing junior", 400),)
        if coach_caller and str(junior.coach_id or "") != str(caller.id):
            return (None,) * 4 + (_err(
                "FORBIDDEN",
                "Coaches can only create events for their own juniors", 403),)

    return audience, band_id, coach_id, junior_id, None


# ── Routes ─────────────────────────────────────────────────────────────────

@events_bp.route("/events", methods=["POST"])
@require_roles("admin", "coach", "committee")
def post_event():
    caller = get_current_user()
    data = request.get_json() or {}

    title = (data.get("title") or "").strip()
    if not title or len(title) > 255:
        return _err("VALIDATION_ERROR", "title is required (max 255 characters)", 400)
    if not data.get("date"):
        return _err("VALIDATION_ERROR", "date is required (YYYY-MM-DD)", 400)

    audience, band_id, coach_id, junior_id, err = _validate_targeting(data, caller)
    if err:
        return err

    try:
        e = create_event({
            "owner_id": caller.id,
            "title": title,
            "description": data.get("description"),
            "location": data.get("location"),
            "date": data.get("date"),
            "start_time": data.get("start_time"),
            "end_time": data.get("end_time"),
            "audience": audience,
            "band_id": band_id,
            "coach_id": coach_id,
            "junior_id": junior_id,
            "rsvp_required": bool(data.get("rsvp_required", False)),
            "mandatory": bool(data.get("mandatory", False)),
            "status": EventStatus.scheduled.value,
        })
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)

    # Best-effort fanout: notify each resolved invitee (excluding the owner).
    try:
        from app.notifications.service import notify
        recipients = resolve_event_user_ids(e) - {caller.id}
        for uid in recipients:
            notify(uid, "event.created",
                   {"event_id": e.id, "title": e.title,
                    "date": e.date.isoformat() if e.date else None})
        if recipients:
            db.session.commit()
    except Exception:
        db.session.rollback()

    return _data(_dump(e, caller), 201)


@events_bp.route("/events", methods=["GET"])
@require_auth
def get_events():
    caller = get_current_user()
    items = list_events(
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
    )
    visible = [e for e in items if _is_visible(e, caller)]
    return _data([_dump(e, caller) for e in visible], count=len(visible))


@events_bp.route("/events/<int:event_id>", methods=["GET"])
@require_auth
def get_event_route(event_id):
    e = get_event(event_id)
    if e is None:
        return _not_found("Event")
    caller = get_current_user()
    if not _is_visible(e, caller):
        return _err("FORBIDDEN", "You do not have access to this event", 403)
    return _data(_dump(e, caller))


@events_bp.route("/events/<int:event_id>", methods=["PUT"])
@require_auth
def put_event(event_id):
    e = get_event(event_id)
    if e is None:
        return _not_found("Event")
    caller = get_current_user()
    # Owner or admin only (committee may not edit others' events).
    if not is_admin(caller) and str(e.owner_id) != str(caller.id):
        return _err("FORBIDDEN", "Only the owner or an admin can edit this event", 403)

    data = request.get_json() or {}
    fields = {}
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title or len(title) > 255:
            return _err("VALIDATION_ERROR", "title is required (max 255 characters)", 400)
        fields["title"] = title
    for key in ("description", "location", "date", "start_time", "end_time"):
        if key in data:
            fields[key] = data[key]
    if not fields.get("date", "skip") and "date" in data:
        return _err("VALIDATION_ERROR", "date cannot be empty", 400)
    if "rsvp_required" in data:
        fields["rsvp_required"] = bool(data["rsvp_required"])
    if "mandatory" in data:
        fields["mandatory"] = bool(data["mandatory"])
    if "status" in data:
        if data["status"] not in {s.value for s in EventStatus}:
            return _err("VALIDATION_ERROR", "status must be scheduled or cancelled", 400)
        fields["status"] = data["status"]

    # Audience is editable only by an admin.
    if any(k in data for k in ("audience", "band_id", "coach_id", "junior_id")):
        if not is_admin(caller):
            return _err("FORBIDDEN", "Only an admin can change an event's audience", 403)
        merged = {
            "audience": data.get("audience", getattr(e.audience, "value", e.audience)),
            "band_id": data.get("band_id", e.band_id),
            "coach_id": data.get("coach_id", e.coach_id),
            "junior_id": data.get("junior_id", e.junior_id),
        }
        audience, band_id, coach_id, junior_id, err = _validate_targeting(merged, caller)
        if err:
            return err
        fields["audience"] = audience
        fields["band_id"] = band_id
        fields["coach_id"] = coach_id
        fields["junior_id"] = junior_id

    try:
        update_event(e, fields)
    except ValueError as exc:
        db.session.rollback()
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(_dump(e, caller))


@events_bp.route("/events/<int:event_id>", methods=["DELETE"])
@require_auth
def delete_event_route(event_id):
    e = get_event(event_id)
    if e is None:
        return _not_found("Event")
    caller = get_current_user()
    if not is_admin(caller) and str(e.owner_id) != str(caller.id):
        return _err("FORBIDDEN", "Only the owner or an admin can delete this event", 403)
    delete_event(e)
    return "", 204


@events_bp.route("/events/<int:event_id>/rsvp", methods=["POST"])
@require_auth
def rsvp_event(event_id):
    e = get_event(event_id)
    if e is None:
        return _not_found("Event")
    caller = get_current_user()
    data = request.get_json() or {}
    status = data.get("status")
    if status not in {s.value for s in RSVPStatus}:
        return _err("VALIDATION_ERROR", "status must be 'going' or 'not_going'", 400)

    # Caller must be a resolved invitee (or the owner). Mandatory events still
    # accept not_going — it's stored and flagged to the owner, not blocked.
    if str(e.owner_id) != str(caller.id) and caller.id not in resolve_event_user_ids(e):
        return _err("FORBIDDEN", "This event is not addressed to you", 403)

    upsert_rsvp(e.id, caller.id, status)
    return _data(_dump(e, caller))


@events_bp.route("/events/<int:event_id>/rsvps", methods=["GET"])
@require_auth
def get_event_rsvps(event_id):
    e = get_event(event_id)
    if e is None:
        return _not_found("Event")
    caller = get_current_user()
    # Owner or admin/committee only.
    if not (str(e.owner_id) == str(caller.id) or has_role(caller, "admin", "committee")):
        return _err("FORBIDDEN", "Only the owner or staff can view RSVPs", 403)

    rows = list_rsvps(e.id)
    out = []
    for r in rows:
        u = r.user
        out.append({
            "user_id": r.user_id,
            "name": (f"{u.first_name} {u.last_name}".strip() if u else None),
            "role": (getattr(u.role, "value", str(u.role)) if u else None),
            "status": getattr(r.status, "value", r.status),
            "responded_at": r.updated_at.isoformat() if r.updated_at else None,
        })
    return _data(out, count=len(out))
