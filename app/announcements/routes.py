"""
Announcement endpoints (social phase, decisions 6+7, 2026-06-11).

GET /api/public/announcements is deliberately UNAUTHENTICATED — it powers the
public landing page and exposes only published external announcements with a
minimal field set.
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import and_, func, or_

from app.announcements.models import (
    Announcement, AnnouncementAudience, AnnouncementStatus,
)
from app.auth.models import User
from app.database.database import db
from app.juniors.models import JuniorProfile, LevelBand
from app.utils.decorators import (
    admin_only, get_current_user, has_role, is_admin, require_auth, require_roles,
)
from app.utils.mixins import utc_now
from app.utils.schemas import SimpleModelSchema

announcements_bp = Blueprint("announcements_bp", __name__, url_prefix="/api")

announcement_schema = SimpleModelSchema(Announcement)

VALID_ROLES = {"admin", "coach", "committee", "parent", "player"}


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


def _dump(a):
    out = announcement_schema.dump(a)
    out["author_name"] = (
        f"{a.author.first_name} {a.author.last_name}".strip() if a.author else None
    )
    return out


def _roles_contains(role):
    """SQL condition: the csv `roles` column contains this role name."""
    return func.concat(",", Announcement.roles, ",").like(f"%,{role},%")


def _audience_user_ids(a):
    """Resolve a published INTERNAL announcement's audience to the set of
    recipient user ids for in-app notifications. This is the inverse of the
    role-scoped feed in list_announcements (everyone / roles / a band's players
    + their parents / a coach's group). External announcements are landing-page
    only and never fan out here."""
    audience = getattr(a.audience, "value", a.audience)

    if audience == "everyone":
        return {u.id for u in User.query.all()}

    if audience == "roles":
        names = {r.strip().lower() for r in (a.roles or "").split(",") if r.strip()}
        if not names:
            return set()
        return {
            u.id
            for u in User.query.all()
            if (getattr(u.role, "value", str(u.role))) in names
        }

    if audience == "band":
        ids = set()
        for j in JuniorProfile.query.filter_by(band_id=a.band_id).all():
            ids.add(j.user_id)
            if j.parent_id:
                ids.add(j.parent_id)
        return ids

    if audience == "coach_group":
        ids = {a.coach_id} if a.coach_id else set()
        for j in JuniorProfile.query.filter_by(coach_id=a.coach_id).all():
            ids.add(j.user_id)
            if j.parent_id:
                ids.add(j.parent_id)
        return ids

    return set()


def _fanout_announcement(a, author_id):
    """Raise one in-app notification per targeted user (excluding the author)
    for a freshly published internal announcement, and commit them."""
    from app.notifications.service import notify

    recipients = _audience_user_ids(a) - {author_id}
    for uid in recipients:
        notify(uid, "announcement", {"announcement_id": a.id, "title": a.title})
    if recipients:
        db.session.commit()


def _validate_content_and_targeting(data):
    """Shared validation for create + edit. Returns
    (title, body, audience, roles_csv, band_id, coach_id, error_response)."""
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or len(title) > 200:
        return (None,) * 6 + (_err("VALIDATION_ERROR", "title is required (max 200 characters)", 400),)
    if not body:
        return (None,) * 6 + (_err("VALIDATION_ERROR", "body is required", 400),)

    audience = data.get("audience") or "everyone"
    if audience not in {a.value for a in AnnouncementAudience}:
        return (None,) * 6 + (_err(
            "VALIDATION_ERROR",
            "audience must be one of: everyone, roles, band, coach_group",
            400,
        ),)

    roles_csv = None
    band_id = None
    coach_id = None
    if audience == "roles":
        raw = data.get("roles")
        names = [r.strip().lower() for r in (raw.split(",") if isinstance(raw, str) else (raw or [])) if str(r).strip()]
        bad = [r for r in names if r not in VALID_ROLES]
        if not names or bad:
            return (None,) * 6 + (_err(
                "VALIDATION_ERROR",
                "roles must be a non-empty list/csv of valid role names "
                "(admin, coach, committee, parent, player)",
                400,
            ),)
        roles_csv = ",".join(sorted(set(names)))
    elif audience == "band":
        band_id = data.get("band_id")
        if band_id is None or db.session.get(LevelBand, band_id) is None:
            return (None,) * 6 + (_err("VALIDATION_ERROR", "band_id must reference an existing level band", 400),)
    elif audience == "coach_group":
        coach_id = data.get("coach_id")
        coach = db.session.get(User, str(coach_id or ""))
        if coach is None or not has_role(coach, "coach"):
            return (None,) * 6 + (_err("VALIDATION_ERROR", "coach_id must reference an existing coach", 400),)

    return title, body, audience, roles_csv, band_id, coach_id, None


@announcements_bp.route("/announcements", methods=["POST"])
@require_roles("admin", "committee")
def post_announcement():
    """Create an announcement. Internal -> published immediately. External:
    admin -> published directly; committee -> draft (admin publishes later)."""
    user = get_current_user()
    data = request.get_json() or {}

    title, body, audience, roles_csv, band_id, coach_id, err = _validate_content_and_targeting(data)
    if err:
        return err

    is_external = bool(data.get("is_external", False))
    # Internal: live immediately. External: committee drafts, admin publishes.
    published = (not is_external) or is_admin(user)

    a = Announcement(
        title=title,
        body=body,
        author_id=user.id,
        audience=AnnouncementAudience(audience),
        roles=roles_csv,
        band_id=band_id,
        coach_id=coach_id,
        is_external=is_external,
        status=AnnouncementStatus.published if published else AnnouncementStatus.draft,
        published_by=user.id if published else None,
        published_at=utc_now() if published else None,
    )
    db.session.add(a)
    db.session.commit()
    # A published internal announcement pings every targeted user's bell.
    # External announcements are landing-page only and never ping the bell; the
    # only drafts are committee-authored external ones, so publish_announcement
    # (which only ever publishes external drafts) deliberately doesn't fan out.
    if published and not is_external:
        _fanout_announcement(a, user.id)
    return _data(_dump(a), 201)


@announcements_bp.route("/announcements", methods=["GET"])
@require_auth
def list_announcements():
    """Role-scoped feed, newest first, cap 50. Admin/committee see everything
    (including drafts); other roles see published internal announcements that
    target them (everyone / their role / their (child's) band / their
    (child's) coach's group)."""
    user = get_current_user()
    role = user.role.value if hasattr(user.role, "value") else str(user.role)

    if role in ("admin", "committee"):
        q = Announcement.query
    else:
        conds = [Announcement.audience == AnnouncementAudience.everyone]
        conds.append(and_(
            Announcement.audience == AnnouncementAudience.roles,
            _roles_contains(role),
        ))
        band_ids, coach_ids = [], []
        if role == "coach":
            coach_ids = [user.id]
        elif role == "player":
            profile = JuniorProfile.query.filter_by(user_id=user.id).first()
            if profile is not None:
                band_ids = [profile.band_id]
                if profile.coach_id:
                    coach_ids = [profile.coach_id]
        elif role == "parent":
            children = JuniorProfile.query.filter_by(parent_id=user.id).all()
            band_ids = list({j.band_id for j in children if j.band_id})
            coach_ids = list({j.coach_id for j in children if j.coach_id})
        if band_ids:
            conds.append(and_(
                Announcement.audience == AnnouncementAudience.band,
                Announcement.band_id.in_(band_ids),
            ))
        if coach_ids:
            conds.append(and_(
                Announcement.audience == AnnouncementAudience.coach_group,
                Announcement.coach_id.in_(coach_ids),
            ))
        q = Announcement.query.filter(
            Announcement.status == AnnouncementStatus.published,
            Announcement.is_external.is_(False),
            or_(*conds),
        )

    items = q.order_by(Announcement.created_at.desc(), Announcement.id.desc()).limit(50).all()
    return _data([_dump(a) for a in items], count=len(items))


@announcements_bp.route("/announcements/<int:announcement_id>", methods=["PUT"])
@require_roles("admin", "committee")
def edit_announcement(announcement_id):
    """Author or admin edits an announcement's content/targeting. Stamps
    edited_at (the feed shows an 'edited' marker). Status/publish state is
    unchanged here — publishing stays its own admin action; a committee member
    can keep refining their own draft before an admin publishes it."""
    user = get_current_user()
    a = db.session.get(Announcement, announcement_id)
    if a is None:
        return _not_found("Announcement")
    if not is_admin(user) and str(a.author_id) != str(user.id):
        return _err("FORBIDDEN", "Only the author or an admin can edit an announcement", 403)

    data = request.get_json() or {}
    title, body, audience, roles_csv, band_id, coach_id, err = _validate_content_and_targeting(data)
    if err:
        return err

    a.title = title
    a.body = body
    a.audience = AnnouncementAudience(audience)
    a.roles = roles_csv
    a.band_id = band_id
    a.coach_id = coach_id
    a.is_external = bool(data.get("is_external", a.is_external))
    a.edited_at = utc_now()
    db.session.commit()
    return _data(_dump(a))


@announcements_bp.route("/announcements/<int:announcement_id>/publish", methods=["PUT"])
@admin_only
def publish_announcement(announcement_id):
    """Admin publishes a (committee-drafted external) announcement."""
    user = get_current_user()
    a = db.session.get(Announcement, announcement_id)
    if a is None:
        return _not_found("Announcement")
    status = a.status.value if hasattr(a.status, "value") else a.status
    if status != "draft":
        return _err("CONFLICT", "Only draft announcements can be published", 409)
    a.status = AnnouncementStatus.published
    a.published_by = user.id
    a.published_at = utc_now()
    db.session.commit()
    return _data(_dump(a))


@announcements_bp.route("/announcements/<int:announcement_id>", methods=["DELETE"])
@require_auth
def delete_announcement(announcement_id):
    """Author or admin removes an announcement."""
    user = get_current_user()
    a = db.session.get(Announcement, announcement_id)
    if a is None:
        return _not_found("Announcement")
    if not is_admin(user) and str(a.author_id) != str(user.id):
        return _err("FORBIDDEN", "Only the author or an admin can delete an announcement", 403)
    db.session.delete(a)
    db.session.commit()
    return "", 204


@announcements_bp.route("/public/announcements", methods=["GET"])
def public_announcements():
    """PUBLIC (no auth): published external announcements for the landing
    page. Minimal fields only."""
    items = (
        Announcement.query
        .filter(
            Announcement.is_external.is_(True),
            Announcement.status == AnnouncementStatus.published,
        )
        .order_by(Announcement.published_at.desc(), Announcement.id.desc())
        .limit(20)
        .all()
    )
    return _data(
        [
            {
                "id": a.id,
                "title": a.title,
                "body": a.body,
                "published_at": a.published_at.isoformat() if a.published_at else None,
            }
            for a in items
        ],
        count=len(items),
    )
