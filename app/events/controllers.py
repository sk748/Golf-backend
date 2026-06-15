"""
Events + RSVP controllers: schemas, audience resolution, and CRUD helpers.

`resolve_event_user_ids` mirrors the announcements `_audience_user_ids`
resolver (everyone / a band's players + parents / a coach's roster / a single
junior + parent). The owner is always able to see their own event.
"""
from app.auth.models import User
from app.database.database import db
from app.events.models import Event, EventRSVP
from app.juniors.models import JuniorProfile
from app.utils.schemas import SimpleModelSchema

event_schema = SimpleModelSchema(Event)
events_schema = SimpleModelSchema(Event, many=True)
rsvp_schema = SimpleModelSchema(EventRSVP)
rsvps_schema = SimpleModelSchema(EventRSVP, many=True)


# ── Audience resolution ─────────────────────────────────────────────────────

def resolve_event_user_ids(event):
    """Resolve an event's audience to the set of recipient user ids.

    Mirrors announcements `_audience_user_ids`:
      - everyone     → all ACTIVE users
      - band         → every JuniorProfile in the band: its user_id + parent_id
      - coach_group  → the coach + every junior on their roster (user_id+parent)
      - individual   → the target junior: its user_id + parent_id

    The owner is handled separately (always able to see their own event)."""
    audience = getattr(event.audience, "value", event.audience)

    if audience == "everyone":
        return {u.id for u in User.query.filter_by(is_active=True).all()}

    if audience == "band":
        ids = set()
        for j in JuniorProfile.query.filter_by(band_id=event.band_id).all():
            ids.add(j.user_id)
            if j.parent_id:
                ids.add(j.parent_id)
        return ids

    if audience == "coach_group":
        ids = {event.coach_id} if event.coach_id else set()
        for j in JuniorProfile.query.filter_by(coach_id=event.coach_id).all():
            ids.add(j.user_id)
            if j.parent_id:
                ids.add(j.parent_id)
        return ids

    if audience == "individual":
        ids = set()
        j = db.session.get(JuniorProfile, event.junior_id) if event.junior_id else None
        if j is not None:
            ids.add(j.user_id)
            if j.parent_id:
                ids.add(j.parent_id)
        return ids

    return set()


# ── Queries ─────────────────────────────────────────────────────────────────

def get_event(event_id: int):
    return db.session.get(Event, event_id)


def list_events(date_from=None, date_to=None):
    q = Event.query
    if date_from:
        q = q.filter(Event.date >= date_from)
    if date_to:
        q = q.filter(Event.date <= date_to)
    return q.order_by(Event.date, Event.start_time).all()


def get_rsvp(event_id, user_id):
    return EventRSVP.query.filter_by(event_id=event_id, user_id=user_id).first()


def going_count(event_id: int) -> int:
    return EventRSVP.query.filter_by(event_id=event_id, status="going").count()


def list_rsvps(event_id: int):
    return EventRSVP.query.filter_by(event_id=event_id).order_by(EventRSVP.created_at).all()


# ── Mutations ───────────────────────────────────────────────────────────────

def create_event(data: dict):
    e = event_schema.load(data)
    db.session.add(e)
    db.session.commit()
    return e


def update_event(e, fields: dict):
    for k, v in fields.items():
        setattr(e, k, v)
    db.session.commit()
    return e


def delete_event(e):
    db.session.delete(e)
    db.session.commit()


def upsert_rsvp(event_id, user_id, status):
    r = get_rsvp(event_id, user_id)
    if r is None:
        r = EventRSVP(event_id=event_id, user_id=user_id, status=status)
        db.session.add(r)
    else:
        r.status = status
    db.session.commit()
    return r
