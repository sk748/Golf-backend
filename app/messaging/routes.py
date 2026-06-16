"""
Messaging endpoints (social phase, locked decisions 2026-06-11).

Messages are IMMUTABLE — no user edit/delete routes exist by design. Admin
moderation can hide a message (status change, body retained) or release a
held one; every moderation action is audit-logged.
"""
from datetime import datetime

from flask import Blueprint, jsonify, request

from app.audit.service import record
from app.database.database import db
from app.auth.models import User
from app.messaging.controllers import (
    active_admins, can_dm, can_read_conversation, conversations_for_user,
    create_dm, dm_other_member, find_dm, full_name, get_conversation,
    get_membership, is_staff, messages_for_viewer, open_flag_queue,
    player_profile, record_banned_attempt, role_value, serialize_conversation,
    serialize_flag, serialize_message, staff_message_exists,
)
from app.messaging.models import (
    Conversation, ConversationMember, ConversationType,
    FlagStatus, Message, MessageFlag, MessageStatus,
)
from app.messaging.wordlist import check_banned
from app.notifications.service import notify
from app.utils.decorators import admin_only, get_current_user, has_role, require_auth
from app.utils.mixins import utc_now

messaging_bp = Blueprint("messaging_bp", __name__, url_prefix="/api")

MAX_BODY_LENGTH = 2000


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


# ── Conversations ─────────────────────────────────────────────────────────────

@messaging_bp.route("/conversations", methods=["GET"])
@require_auth
def list_conversations():
    """The caller's conversation list (roster groups are lazily ensured and
    synced first). Parents additionally see every conversation any of their
    children belongs to, flagged oversight (read-only)."""
    user = get_current_user()
    items = conversations_for_user(user)
    return _data(items, count=len(items))


@messaging_bp.route("/messaging/contacts", methods=["GET"])
@require_auth
def list_contacts():
    """Who the caller may open a DM with, per the matrix — players and parents
    have no access to club-wide user lists, so target discovery happens here.
    Players get their own coach + admins only; parents get staff only."""
    user = get_current_user()
    role = role_value(user)
    query = User.query.filter(User.is_active.is_(True), User.id != user.id)
    if role in ("admin", "coach"):
        users = query.all()
    elif role == "committee":
        users = [u for u in query.all() if role_value(u) != "player"]
    elif role == "parent":
        users = [u for u in query.all() if role_value(u) in ("admin", "coach", "committee")]
    else:  # player: own assigned coach + admins
        profile = player_profile(user)
        coach_id = str(profile.coach_id) if profile is not None and profile.coach_id else None
        users = [
            u for u in query.all()
            if role_value(u) == "admin" or (coach_id is not None and str(u.id) == coach_id)
        ]
    items = [
        {"user_id": str(u.id), "full_name": full_name(u), "role": role_value(u)}
        for u in users
    ]
    items.sort(key=lambda c: (c["role"], c["full_name"]))
    return _data(items, count=len(items))


@messaging_bp.route("/conversations", methods=["POST"])
@require_auth
def post_conversation():
    """{type:'dm', user_id} finds-or-creates the unique DM (matrix enforced).
    {type:'group', name, member_ids[]} — admin/coach only, creator included."""
    user = get_current_user()
    data = request.get_json() or {}
    conv_type = data.get("type")

    if conv_type == "dm":
        target = db.session.get(User, str(data.get("user_id") or ""))
        if target is None or not target.is_active:
            return _not_found("User")
        if str(target.id) == str(user.id):
            return _err("VALIDATION_ERROR", "You cannot start a conversation with yourself", 400)
        allowed, reason = can_dm(user, target)
        if not allowed:
            return _err("FORBIDDEN", reason, 403)
        existing = find_dm(user.id, target.id)
        if existing is not None:
            item, _activity = serialize_conversation(existing, user)
            return _data(item, 200)
        conv = create_dm(user, target)
        item, _activity = serialize_conversation(conv, user)
        return _data(item, 201)

    if conv_type == "group":
        if not has_role(user, "admin", "coach"):
            return _err("FORBIDDEN", "Only staff (admin/coach) can create group chats", 403)
        name = (data.get("name") or "").strip()
        if not name or len(name) > 120:
            return _err("VALIDATION_ERROR", "name is required (max 120 characters)", 400)
        member_ids = data.get("member_ids") or []
        if not isinstance(member_ids, list):
            return _err("VALIDATION_ERROR", "member_ids must be a list of user ids", 400)
        member_ids = {str(m) for m in member_ids}
        member_ids.add(str(user.id))  # creator auto-included
        users = User.query.filter(User.id.in_(member_ids)).all()
        if len(users) != len(member_ids):
            missing = member_ids - {u.id for u in users}
            return _err("VALIDATION_ERROR", f"Unknown user id(s): {', '.join(sorted(missing))}", 400)
        conv = Conversation(type=ConversationType.group, name=name, created_by=user.id)
        db.session.add(conv)
        db.session.flush()
        for uid in member_ids:
            db.session.add(ConversationMember(conversation_id=conv.id, user_id=uid))
        db.session.commit()
        item, _activity = serialize_conversation(conv, user)
        return _data(item, 201)

    return _err("VALIDATION_ERROR", "type must be 'dm' or 'group'", 400)


@messaging_bp.route("/admin/conversations", methods=["GET"])
@admin_only
def admin_list_conversations():
    """Admin: every conversation on the platform (decision 2 — admin can read
    all). Paged with ?limit=&offset= (default 50/0)."""
    admin = get_current_user()
    try:
        limit = max(1, min(int(request.args.get("limit", 50)), 200))
        offset = max(0, int(request.args.get("offset", 0)))
    except ValueError:
        return _err("VALIDATION_ERROR", "limit and offset must be integers", 400)
    total = Conversation.query.count()
    convs = (
        Conversation.query
        .order_by(Conversation.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    rows = [
        serialize_conversation(
            conv, admin, oversight=get_membership(conv.id, admin.id) is None
        )
        for conv in convs
    ]
    rows.sort(key=lambda pair: pair[1], reverse=True)
    return _data([item for item, _a in rows], count=total)


# ── Messages ──────────────────────────────────────────────────────────────────

@messaging_bp.route("/conversations/<int:conversation_id>/messages", methods=["GET"])
@require_auth
def get_messages(conversation_id):
    """Read a conversation: members, a parent of a member (oversight), or
    admin. Ascending; latest 200 when no ?since=<iso8601>. Held messages show
    only to their sender + admin; hidden only to admin (status field marks
    them)."""
    user = get_current_user()
    conv = get_conversation(conversation_id)
    if conv is None:
        return _not_found("Conversation")
    if not can_read_conversation(user, conv):
        return _err("FORBIDDEN", "You do not have access to this conversation", 403)
    since = None
    since_arg = request.args.get("since")
    if since_arg:
        try:
            since = datetime.fromisoformat(since_arg)
        except ValueError:
            return _err("VALIDATION_ERROR", "since must be an ISO-8601 timestamp", 400)
    rows = messages_for_viewer(conv, user, since=since)
    return _data([serialize_message(m, user) for m in rows], count=len(rows))


@messaging_bp.route("/conversations/<int:conversation_id>/messages", methods=["POST"])
@require_auth
def post_message(conversation_id):
    """Post a message. ACTUAL members only — oversight parents and non-member
    admins cannot post (decision 2). Body required, max 2000 chars, text only.
    Banned words hold the message for review; the first staff message in a DM
    with a player notifies the player's parent."""
    user = get_current_user()
    conv = get_conversation(conversation_id)
    if conv is None:
        return _not_found("Conversation")
    membership = get_membership(conv.id, user.id)
    if membership is None:
        return _err("FORBIDDEN", "Only members of this conversation can post in it", 403)

    data = request.get_json() or {}
    body = data.get("body")
    if not isinstance(body, str) or not body.strip():
        return _err("VALIDATION_ERROR", "body is required", 400)
    body = body.strip()
    if len(body) > MAX_BODY_LENGTH:
        return _err("VALIDATION_ERROR", f"body must be at most {MAX_BODY_LENGTH} characters", 400)

    # Banned-word filter: block, warn, log (safety decision, 2026-06-16). The
    # message is rejected outright — never stored or delivered — the sender is
    # warned, and the attempt is logged; repeats escalate to admins.
    matched = check_banned(body)
    if matched:
        record_banned_attempt(user, matched, conversation_id=conv.id, context="message")
        db.session.commit()
        return _err(
            "BANNED_WORD",
            "Your message contains language that isn't allowed here. "
            "Please remove it and try again.",
            422,
        )

    msg = Message(
        conversation_id=conv.id,
        sender_id=user.id,
        body=body,
        status=MessageStatus.visible,
    )
    db.session.add(msg)
    db.session.flush()

    # First contact (decision 5): first staff message in a DM with a player
    # notifies that player's parent.
    conv_type = conv.type.value if hasattr(conv.type, "value") else conv.type
    if conv_type == "dm" and is_staff(user):
        other = dm_other_member(conv, user)
        if other is not None and role_value(other) == "player":
            if not staff_message_exists(conv.id, exclude_message_id=msg.id):
                profile = player_profile(other)
                if profile is not None and profile.parent_id:
                    notify(profile.parent_id, "first_contact", {
                        "conversation_id": conv.id,
                        "staff_name": full_name(user),
                        "child_name": full_name(other),
                    })

    membership.last_read_at = utc_now()  # your own message is read
    db.session.commit()
    return _data(serialize_message(msg, user, sender=user), 201)


@messaging_bp.route(
    "/conversations/<int:conversation_id>/messages/<int:message_id>", methods=["PUT"]
)
@require_auth
def edit_message(conversation_id, message_id):
    """A sender edits their OWN message. The first body is preserved in
    original_body (admins always see it); everyone sees an 'edited' marker. The
    banned-word filter re-runs — you can't edit a blocked word back in. Held,
    hidden, or already-deleted messages can't be edited."""
    user = get_current_user()
    msg = db.session.get(Message, message_id)
    if msg is None or msg.conversation_id != conversation_id:
        return _not_found("Message")
    if str(msg.sender_id) != str(user.id):
        return _err("FORBIDDEN", "You can only edit your own messages", 403)
    if msg.deleted_at is not None:
        return _err("CONFLICT", "A deleted message cannot be edited", 409)
    if msg.status != MessageStatus.visible:
        return _err("CONFLICT", "This message cannot be edited", 409)

    data = request.get_json() or {}
    body = data.get("body")
    if not isinstance(body, str) or not body.strip():
        return _err("VALIDATION_ERROR", "body is required", 400)
    body = body.strip()
    if len(body) > MAX_BODY_LENGTH:
        return _err("VALIDATION_ERROR", f"body must be at most {MAX_BODY_LENGTH} characters", 400)
    matched = check_banned(body)
    if matched:
        record_banned_attempt(user, matched, conversation_id=conversation_id, context="edit")
        db.session.commit()
        return _err(
            "BANNED_WORD",
            "Your edit contains language that isn't allowed here. "
            "Please remove it and try again.",
            422,
        )

    if msg.original_body is None:
        msg.original_body = msg.body  # keep the very first version for the record
    msg.body = body
    msg.edited_at = utc_now()
    db.session.commit()
    return _data(serialize_message(msg, user, sender=msg.sender))


@messaging_bp.route(
    "/conversations/<int:conversation_id>/messages/<int:message_id>", methods=["DELETE"]
)
@require_auth
def delete_message(conversation_id, message_id):
    """A sender soft-deletes their OWN message: everyone then sees a 'message
    deleted' tombstone, but the body is retained for admins (nothing is truly
    scrubbed). Idempotent."""
    user = get_current_user()
    msg = db.session.get(Message, message_id)
    if msg is None or msg.conversation_id != conversation_id:
        return _not_found("Message")
    if str(msg.sender_id) != str(user.id):
        return _err("FORBIDDEN", "You can only delete your own messages", 403)
    if msg.deleted_at is None:
        msg.deleted_at = utc_now()
        db.session.commit()
    return _data(serialize_message(msg, user, sender=msg.sender))


@messaging_bp.route("/conversations/<int:conversation_id>/read", methods=["PUT"])
@require_auth
def mark_conversation_read(conversation_id):
    user = get_current_user()
    conv = get_conversation(conversation_id)
    if conv is None:
        return _not_found("Conversation")
    membership = get_membership(conv.id, user.id)
    if membership is None:
        return _err("FORBIDDEN", "Only members of this conversation can mark it read", 403)
    membership.last_read_at = utc_now()
    db.session.commit()
    return _data({
        "conversation_id": conv.id,
        "last_read_at": membership.last_read_at.isoformat(),
    })


# ── Flags ─────────────────────────────────────────────────────────────────────

@messaging_bp.route("/messages/<int:message_id>/flag", methods=["POST"])
@require_auth
def flag_message(message_id):
    """Any participant or oversight viewer (parent-of-member / admin) may flag
    a message for review; admins are notified."""
    user = get_current_user()
    msg = db.session.get(Message, message_id)
    if msg is None:
        return _not_found("Message")
    if not can_read_conversation(user, msg.conversation):
        return _err("FORBIDDEN", "You do not have access to this conversation", 403)
    data = request.get_json(silent=True) or {}
    flag = MessageFlag(
        message_id=msg.id,
        flagged_by=user.id,
        reason=(data.get("reason") or None),
    )
    db.session.add(flag)
    for admin in active_admins():
        notify(admin.id, "message_flagged", {
            "message_id": msg.id,
            "conversation_id": msg.conversation_id,
            "flagged_by_name": full_name(user),
            "reason": flag.reason,
        })
    db.session.commit()
    return _data(serialize_flag(flag), 201)


# ── Admin moderation ──────────────────────────────────────────────────────────

@messaging_bp.route("/moderation/queue", methods=["GET"])
@admin_only
def moderation_queue():
    """Open flags + held messages, with message/sender/conversation context."""
    items = open_flag_queue()
    return _data(items, count=len(items))


@messaging_bp.route("/messages/<int:message_id>/hide", methods=["PUT"])
@admin_only
def hide_message(message_id):
    """Hide a message (status change — the original body is retained)."""
    admin = get_current_user()
    msg = db.session.get(Message, message_id)
    if msg is None:
        return _not_found("Message")
    status = msg.status.value if hasattr(msg.status, "value") else msg.status
    if status != "hidden":
        msg.status = MessageStatus.hidden
        msg.moderated_by = admin.id
        msg.moderated_at = utc_now()
        db.session.commit()
        record(
            "message.hidden",
            actor=admin,
            target_type="message",
            target_id=msg.id,
            target_label=f"message #{msg.id}",
            description=(
                f"{full_name(admin)} hid message #{msg.id} by "
                f"{full_name(msg.sender)} in conversation #{msg.conversation_id}."
            ),
        )
    return _data(serialize_message(msg, admin))


@messaging_bp.route("/messages/<int:message_id>/release", methods=["PUT"])
@admin_only
def release_message(message_id):
    """Release a held message back to visible (held -> visible only)."""
    admin = get_current_user()
    msg = db.session.get(Message, message_id)
    if msg is None:
        return _not_found("Message")
    status = msg.status.value if hasattr(msg.status, "value") else msg.status
    if status != "held":
        return _err("CONFLICT", "Only held messages can be released", 409)
    msg.status = MessageStatus.visible
    msg.moderated_by = admin.id
    msg.moderated_at = utc_now()
    db.session.commit()
    record(
        "message.released",
        actor=admin,
        target_type="message",
        target_id=msg.id,
        target_label=f"message #{msg.id}",
        description=(
            f"{full_name(admin)} released held message #{msg.id} by "
            f"{full_name(msg.sender)} back to visible."
        ),
    )
    return _data(serialize_message(msg, admin))


@messaging_bp.route("/flags/<int:flag_id>/resolve", methods=["PUT"])
@admin_only
def resolve_flag(flag_id):
    admin = get_current_user()
    flag = db.session.get(MessageFlag, flag_id)
    if flag is None:
        return _not_found("Flag")
    status = flag.status.value if hasattr(flag.status, "value") else flag.status
    if status != "resolved":
        flag.status = FlagStatus.resolved
        flag.resolved_by = admin.id
        flag.resolved_at = utc_now()
        db.session.commit()
        record(
            "flag.resolved",
            actor=admin,
            target_type="message_flag",
            target_id=flag.id,
            target_label=f"flag #{flag.id} on message #{flag.message_id}",
            description=(
                f"{full_name(admin)} resolved flag #{flag.id} "
                f"on message #{flag.message_id}."
            ),
        )
    return _data(serialize_flag(flag))
