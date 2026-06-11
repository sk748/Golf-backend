"""
Internal helper other domains call to raise an in-app notification.

`notify` only ADDS the row to the session — the caller's commit (the one that
persists the primary action) persists the notification atomically with it.
Pass commit=True for standalone use.
"""
from app.database.database import db
from app.notifications.models import Notification


def notify(user_id, type_, payload=None, commit=False):
    """Queue an in-app notification for `user_id`. Returns the row."""
    n = Notification(user_id=user_id, type=type_, payload=payload)
    db.session.add(n)
    if commit:
        db.session.commit()
    return n
