from flask import Blueprint, jsonify, request

from app.database.database import db
from app.notifications.models import Notification
from app.utils.decorators import get_current_user, require_auth
from app.utils.schemas import SimpleModelSchema

notifications_bp = Blueprint("notifications_bp", __name__, url_prefix="/api")

notification_schema = SimpleModelSchema(Notification)


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


@notifications_bp.route("/notifications", methods=["GET"])
@require_auth
def get_notifications():
    """Bell feed: own notifications newest first (cap 50) + unread counters
    (notifications and messages) for the badge."""
    user = get_current_user()
    items = (
        Notification.query
        .filter_by(user_id=user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(50)
        .all()
    )
    unread_notifications = Notification.query.filter_by(
        user_id=user.id, read=False
    ).count()
    from app.messaging.controllers import total_unread_messages
    return _data({
        "items": [notification_schema.dump(n) for n in items],
        "unread_notifications": unread_notifications,
        "unread_messages": total_unread_messages(user.id),
    })


@notifications_bp.route("/notifications/read", methods=["PUT"])
@require_auth
def mark_notifications_read():
    """Mark notifications read: {ids: [...]} for specific rows, empty body for
    all of the caller's unread notifications."""
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    ids = data.get("ids")
    if ids is not None and not isinstance(ids, list):
        return _err("VALIDATION_ERROR", "ids must be a list of notification ids", 400)
    q = Notification.query.filter_by(user_id=user.id, read=False)
    if ids:
        q = q.filter(Notification.id.in_(ids))
    updated = q.update({"read": True}, synchronize_session=False)
    db.session.commit()
    return _data({"updated": updated})
