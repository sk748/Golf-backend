"""
Messaging domain logic (social phase, locked decisions 2026-06-11).

- DM matrix (can_dm): admin/coach may message anyone; committee everyone but
  players; parents staff only; a player may INITIATE only to their own
  assigned coach or any admin (staff may always initiate to a player).
- Roster groups (ensure_roster_groups): each coach gets two auto groups —
  "players" (coach + assigned juniors' player users) and "parents" (coach +
  those juniors' parent users) — synced lazily with current assignments.
- Oversight: a parent has read-only visibility into every conversation any of
  their children is a member of; admin can read everything. Posting stays
  member-only.
"""
from datetime import datetime

from sqlalchemy import and_, or_, true
from sqlalchemy.orm import aliased

from app.auth.models import User, UserRole
from app.database.database import db
from app.juniors.models import JuniorApprovalStatus, JuniorProfile
from app.messaging.models import (
    Conversation, ConversationMember, ConversationType,
    FlagStatus, Message, MessageFlag, MessageStatus, RosterKind,
)

STAFF_ROLES = ("admin", "coach", "committee")

# initiator role -> roles they may open a DM with (player handled specially)
DM_TARGETS = {
    "admin": {"admin", "coach", "committee", "parent", "player"},
    "coach": {"admin", "coach", "committee", "parent", "player"},
    "committee": {"admin", "coach", "committee", "parent"},
    "parent": {"admin", "coach", "committee"},
}


# ── Small user helpers ────────────────────────────────────────────────────────

def full_name(user):
    return f"{user.first_name} {user.last_name}".strip() or user.email


def role_value(user):
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def is_staff(user):
    return role_value(user) in STAFF_ROLES


def children_of(parent_user):
    return JuniorProfile.query.filter_by(parent_id=parent_user.id).all()


def player_profile(player_user):
    return JuniorProfile.query.filter_by(user_id=player_user.id).first()


# ── DM matrix ─────────────────────────────────────────────────────────────────

def can_dm(initiator, target):
    """May `initiator` open a DM with `target`? Returns (bool, reason)."""
    i_role, t_role = role_value(initiator), role_value(target)
    if i_role == "player":
        if t_role == "admin":
            return True, None
        if t_role == "coach":
            profile = player_profile(initiator)
            if profile is not None and str(profile.coach_id) == str(target.id):
                return True, None
        return False, "Players can only message their own assigned coach or an admin"
    if t_role in DM_TARGETS.get(i_role, set()):
        return True, None
    return False, f"A {i_role} cannot start a direct message with a {t_role}"


def find_dm(user_a_id, user_b_id):
    """The unique DM between two users, or None."""
    a = aliased(ConversationMember)
    b = aliased(ConversationMember)
    return (
        Conversation.query
        .filter(Conversation.type == ConversationType.dm)
        .join(a, a.conversation_id == Conversation.id)
        .filter(a.user_id == user_a_id)
        .join(b, b.conversation_id == Conversation.id)
        .filter(b.user_id == user_b_id)
        .first()
    )


def create_dm(user_a, user_b):
    conv = Conversation(type=ConversationType.dm, created_by=user_a.id)
    db.session.add(conv)
    db.session.flush()
    db.session.add(ConversationMember(conversation_id=conv.id, user_id=user_a.id))
    db.session.add(ConversationMember(conversation_id=conv.id, user_id=user_b.id))
    db.session.commit()
    return conv


# ── Roster groups ─────────────────────────────────────────────────────────────

def ensure_roster_groups(coach):
    """Find-or-create the coach's two roster groups and sync their membership
    with the coach's CURRENT junior assignments (lazy sync). Only active
    juniors (signup chain complete) join the chats."""
    if coach is None:
        return []
    juniors = JuniorProfile.query.filter_by(
        coach_id=coach.id, approval_status=JuniorApprovalStatus.active
    ).all()
    out = []
    for kind, label in ((RosterKind.players, "Players"), (RosterKind.parents, "Parents")):
        conv = Conversation.query.filter_by(coach_id=coach.id, roster_kind=kind).first()
        if conv is None:
            conv = Conversation(
                type=ConversationType.group,
                name=f"{full_name(coach)} — {label}",
                roster_kind=kind,
                coach_id=coach.id,
                created_by=coach.id,
            )
            db.session.add(conv)
            db.session.flush()
        if kind == RosterKind.players:
            desired = {j.user_id for j in juniors if j.user_id}
        else:
            desired = {j.parent_id for j in juniors if j.parent_id}
        desired.add(coach.id)
        current = {
            m.user_id: m
            for m in ConversationMember.query.filter_by(conversation_id=conv.id).all()
        }
        for user_id in desired - set(current):
            db.session.add(ConversationMember(conversation_id=conv.id, user_id=user_id))
        for user_id in set(current) - desired:
            db.session.delete(current[user_id])
        out.append(conv)
    db.session.commit()
    return out


def ensure_roster_groups_for_viewer(user):
    """Lazily materialize the roster groups relevant to this viewer before
    listing their conversations."""
    role = role_value(user)
    if role == "coach":
        ensure_roster_groups(user)
    elif role == "player":
        profile = player_profile(user)
        if profile is not None and profile.coach_id:
            ensure_roster_groups(db.session.get(User, profile.coach_id))
    elif role == "parent":
        coach_ids = {j.coach_id for j in children_of(user) if j.coach_id}
        for coach_id in coach_ids:
            ensure_roster_groups(db.session.get(User, coach_id))


# ── Read access / visibility ──────────────────────────────────────────────────

def get_conversation(conversation_id):
    return db.session.get(Conversation, conversation_id)


def get_membership(conversation_id, user_id):
    return ConversationMember.query.filter_by(
        conversation_id=conversation_id, user_id=user_id
    ).first()


def can_read_conversation(user, conv):
    """Member, parent-of-a-member (oversight), or admin."""
    if role_value(user) == "admin":
        return True
    if get_membership(conv.id, user.id) is not None:
        return True
    if role_value(user) == "parent":
        child_user_ids = [j.user_id for j in children_of(user)]
        if child_user_ids:
            return (
                ConversationMember.query
                .filter(
                    ConversationMember.conversation_id == conv.id,
                    ConversationMember.user_id.in_(child_user_ids),
                )
                .first()
                is not None
            )
    return False


def visibility_clause(viewer):
    """SQL filter for which message rows this viewer may see.
    visible -> everyone; held -> its sender + admin; hidden -> admin only."""
    if role_value(viewer) == "admin":
        return true()  # admin sees everything (held + hidden stay marked via status)
    return or_(
        Message.status == MessageStatus.visible,
        and_(Message.status == MessageStatus.held, Message.sender_id == viewer.id),
    )


def messages_for_viewer(conv, viewer, since=None, cap=200):
    q = Message.query.filter(
        Message.conversation_id == conv.id, visibility_clause(viewer)
    )
    if since is not None:
        return q.filter(Message.created_at > since).order_by(
            Message.created_at.asc(), Message.id.asc()
        ).all()
    rows = q.order_by(Message.created_at.desc(), Message.id.desc()).limit(cap).all()
    rows.reverse()
    return rows


def unread_count(conversation_id, user_id, last_read_at):
    q = Message.query.filter(
        Message.conversation_id == conversation_id,
        Message.status == MessageStatus.visible,
        Message.sender_id != user_id,
    )
    if last_read_at is not None:
        q = q.filter(Message.created_at > last_read_at)
    return q.count()


def recent_unread_messages(user_id, cap=10):
    """Latest unread visible messages across a user's memberships, newest
    first — feeds the notification bell's message list and the live toast."""
    rows = (
        db.session.query(Message)
        .join(
            ConversationMember,
            ConversationMember.conversation_id == Message.conversation_id,
        )
        .filter(
            ConversationMember.user_id == user_id,
            Message.sender_id != user_id,
            Message.status == MessageStatus.visible,
            Message.deleted_at.is_(None),
            or_(
                ConversationMember.last_read_at.is_(None),
                Message.created_at > ConversationMember.last_read_at,
            ),
        )
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(cap)
        .all()
    )
    out = []
    for m in rows:
        conv = db.session.get(Conversation, m.conversation_id)
        member_users = (
            db.session.query(User)
            .join(ConversationMember, ConversationMember.user_id == User.id)
            .filter(ConversationMember.conversation_id == m.conversation_id)
            .all()
        )
        viewer = db.session.get(User, user_id)
        preview = (m.body[:80] + "…") if len(m.body) > 80 else m.body
        out.append({
            "message_id": m.id,
            "conversation_id": m.conversation_id,
            "conversation_name": conversation_display_name(conv, member_users, viewer),
            "sender_name": full_name(m.sender),
            "preview": preview,
            "created_at": _iso(m.created_at),
        })
    return out


def total_unread_messages(user_id):
    """Total unread visible messages across all of a user's memberships
    (the bell-feed counter)."""
    return (
        db.session.query(Message.id)
        .join(
            ConversationMember,
            ConversationMember.conversation_id == Message.conversation_id,
        )
        .filter(
            ConversationMember.user_id == user_id,
            Message.sender_id != user_id,
            Message.status == MessageStatus.visible,
            or_(
                ConversationMember.last_read_at.is_(None),
                Message.created_at > ConversationMember.last_read_at,
            ),
        )
        .count()
    )


# ── Serialization ─────────────────────────────────────────────────────────────

def _iso(dt):
    return dt.isoformat() if isinstance(dt, datetime) else dt


TOMBSTONE = "This message was deleted"


def featured_badge_for(user):
    """The award a player chose to show off in chat, or None. Two sources:
    a staff-granted badge -> {source:'badge', id, name, description}; an
    auto-unlocked achievement -> {source:'achievement', key} (the frontend
    resolves the key to a title/icon/description from its catalog). Only
    players have a junior profile, so only they surface an award."""
    if role_value(user) != "player":
        return None
    profile = JuniorProfile.query.filter_by(user_id=user.id).first()
    if profile is None:
        return None
    if profile.featured_badge_id is not None and profile.featured_badge is not None:
        badge = profile.featured_badge
        return {
            "source": "badge",
            "id": badge.id,
            "name": badge.name,
            "description": badge.description,
        }
    if profile.featured_achievement_key:
        return {"source": "achievement", "key": profile.featured_achievement_key}
    return None


def serialize_message(msg, viewer, sender=None):
    sender = sender or msg.sender
    is_admin = role_value(viewer) == "admin"
    deleted = msg.deleted_at is not None
    # Non-admins see a tombstone for deleted messages; admins keep the body
    # (and edited messages always retain their original for admins).
    if deleted and not is_admin:
        body = TOMBSTONE
    else:
        body = msg.body
    out = {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender": {
            "user_id": sender.id,
            "full_name": full_name(sender),
            "role": role_value(sender),
            "featured_badge": featured_badge_for(sender),
        },
        "body": body,
        "status": msg.status.value if hasattr(msg.status, "value") else msg.status,
        "edited": msg.edited_at is not None,
        "edited_at": _iso(msg.edited_at),
        "deleted": deleted,
        "created_at": _iso(msg.created_at),
        "own": str(msg.sender_id) == str(viewer.id),
    }
    # Admins get the full history so nothing is ever truly scrubbed.
    if is_admin and (msg.edited_at is not None or deleted):
        out["original_body"] = msg.original_body if msg.original_body is not None else msg.body
    return out


def serialize_flag(flag):
    return {
        "id": flag.id,
        "message_id": flag.message_id,
        "flagged_by": {
            "user_id": flag.flagger.id,
            "full_name": full_name(flag.flagger),
        },
        "reason": flag.reason,
        "status": flag.status.value if hasattr(flag.status, "value") else flag.status,
        "created_at": _iso(flag.created_at),
    }


def conversation_display_name(conv, member_users, viewer):
    """Group -> its name. DM -> the OTHER party's name for a member viewer;
    a joined label for oversight/admin viewers who aren't in it."""
    conv_type = conv.type.value if hasattr(conv.type, "value") else conv.type
    if conv_type == "group":
        return conv.name
    others = [u for u in member_users if str(u.id) != str(viewer.id)]
    if len(others) == len(member_users):  # viewer is not a member (oversight/admin)
        return " & ".join(full_name(u) for u in member_users)
    return full_name(others[0]) if others else full_name(viewer)


def serialize_conversation(conv, viewer, oversight=False):
    """One conversation-list item + its sort key (last activity).
    Returns (item_dict, activity_datetime)."""
    member_users = (
        db.session.query(User)
        .join(ConversationMember, ConversationMember.user_id == User.id)
        .filter(ConversationMember.conversation_id == conv.id)
        .all()
    )
    last = (
        Message.query
        .filter(Message.conversation_id == conv.id, visibility_clause(viewer))
        .order_by(Message.created_at.desc(), Message.id.desc())
        .first()
    )
    membership = None if oversight else get_membership(conv.id, viewer.id)
    # Oversight viewers have no membership row, hence no read tracking: 0.
    unread = (
        unread_count(conv.id, viewer.id, membership.last_read_at)
        if membership is not None
        else 0
    )
    item = {
        "id": conv.id,
        "type": conv.type.value if hasattr(conv.type, "value") else conv.type,
        "roster_kind": (
            conv.roster_kind.value
            if hasattr(conv.roster_kind, "value")
            else conv.roster_kind
        ),
        "name": conversation_display_name(conv, member_users, viewer),
        "members": [
            {"user_id": u.id, "full_name": full_name(u), "role": role_value(u)}
            for u in member_users
        ],
        "last_message": (
            {
                "id": last.id,
                "body": (last.body[:120] + "…") if len(last.body) > 120 else last.body,
                "sender_name": full_name(last.sender),
                "created_at": _iso(last.created_at),
            }
            if last is not None
            else None
        ),
        "unread_count": unread,
        "oversight": oversight,
    }
    activity = last.created_at if last is not None else conv.created_at
    return item, activity


def conversations_for_user(user):
    """The user's conversation list: own memberships, plus (for parents) every
    conversation a child belongs to flagged oversight, deduped, sorted by last
    activity desc."""
    ensure_roster_groups_for_viewer(user)

    rows = []
    seen = set()
    own = (
        Conversation.query
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .filter(ConversationMember.user_id == user.id)
        .all()
    )
    for conv in own:
        rows.append(serialize_conversation(conv, user, oversight=False))
        seen.add(conv.id)

    if role_value(user) == "parent":
        child_user_ids = [j.user_id for j in children_of(user)]
        if child_user_ids:
            child_convs = (
                Conversation.query
                .join(
                    ConversationMember,
                    ConversationMember.conversation_id == Conversation.id,
                )
                .filter(ConversationMember.user_id.in_(child_user_ids))
                .distinct()
                .all()
            )
            for conv in child_convs:
                if conv.id not in seen:
                    rows.append(serialize_conversation(conv, user, oversight=True))
                    seen.add(conv.id)

    rows.sort(key=lambda pair: pair[1], reverse=True)
    return [item for item, _activity in rows]


# ── Posting ───────────────────────────────────────────────────────────────────

def staff_message_exists(conversation_id, exclude_message_id=None):
    """Has any staff member (admin/coach/committee) already posted in this
    conversation? Used for the first-contact parent notification."""
    q = (
        Message.query
        .join(User, User.id == Message.sender_id)
        .filter(
            Message.conversation_id == conversation_id,
            User.role.in_([UserRole.admin, UserRole.coach, UserRole.committee]),
        )
    )
    if exclude_message_id is not None:
        q = q.filter(Message.id != exclude_message_id)
    return q.first() is not None


def dm_other_member(conv, user):
    """The other party's User in a DM, or None."""
    member = (
        ConversationMember.query
        .filter(
            ConversationMember.conversation_id == conv.id,
            ConversationMember.user_id != user.id,
        )
        .first()
    )
    return db.session.get(User, member.user_id) if member is not None else None


def active_admins():
    return User.query.filter_by(role=UserRole.admin, is_active=True).all()


def open_flag_queue():
    """Moderation queue: every message that is held and/or has an open flag,
    newest first, with sender + conversation context and its open flags."""
    open_flags = MessageFlag.query.filter_by(status=FlagStatus.open).all()
    flagged_ids = {f.message_id for f in open_flags}
    q = Message.query.filter(Message.status == MessageStatus.held)
    if flagged_ids:
        q = Message.query.filter(
            or_(Message.status == MessageStatus.held, Message.id.in_(flagged_ids))
        )
    messages = q.order_by(Message.created_at.desc(), Message.id.desc()).all()

    items = []
    for msg in messages:
        conv = msg.conversation
        member_users = (
            db.session.query(User)
            .join(ConversationMember, ConversationMember.user_id == User.id)
            .filter(ConversationMember.conversation_id == conv.id)
            .all()
        )
        conv_type = conv.type.value if hasattr(conv.type, "value") else conv.type
        conv_name = (
            conv.name
            if conv_type == "group"
            else " & ".join(full_name(u) for u in member_users)
        )
        items.append({
            "message": {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "body": msg.body,
                "status": msg.status.value if hasattr(msg.status, "value") else msg.status,
                "held_reason": msg.held_reason,
                "created_at": _iso(msg.created_at),
            },
            "sender": {
                "user_id": msg.sender.id,
                "full_name": full_name(msg.sender),
                "role": role_value(msg.sender),
            },
            "conversation": {"id": conv.id, "type": conv_type, "name": conv_name},
            "flags": [serialize_flag(f) for f in open_flags if f.message_id == msg.id],
        })
    return items
