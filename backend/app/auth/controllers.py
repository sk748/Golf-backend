from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.auth.models import User, UserRole, MembershipType
from app.database.database import db
from app.utils.schemas import SimpleModelSchema


class UserSchema(SimpleModelSchema):
    def _dump_one(self, item):
        result = super()._dump_one(item)
        result["full_name"] = f"{item.first_name} {item.last_name}".strip()
        result["current_hcp_index"] = float(item.handicap_index) if item.handicap_index is not None else None
        return result


user_schema = UserSchema(User, dump_exclude=("password_hash",))
users_schema = UserSchema(User, many=True, dump_exclude=("password_hash",))

# Roles that the public /register endpoint is allowed to create.
# Admin/coach/committee accounts must be created by an admin via POST /api/users.
_PUBLIC_REGISTRATION_ROLES = {UserRole.player, UserRole.parent}

# Minimum password length
_MIN_PASSWORD_LENGTH = 8


def _validate_password(password: str):
    if len(password) < _MIN_PASSWORD_LENGTH:
        return f"Password must be at least {_MIN_PASSWORD_LENGTH} characters"
    return None


def register_user(data: dict):
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return None, "email and password are required"

    pw_err = _validate_password(password)
    if pw_err:
        return None, pw_err

    full_name = data.get("full_name", "")
    parts = full_name.strip().split(" ", 1) if full_name else []
    first_name = data.get("first_name") or (parts[0] if parts else "")
    last_name = data.get("last_name") or (parts[1] if len(parts) > 1 else "")

    if not first_name:
        return None, "first_name (or full_name) is required"

    # Map legacy/frontend role names but restrict to public-safe roles only.
    # Callers cannot self-promote to admin/coach/committee via this endpoint.
    role_map = {"STUDENT": UserRole.player, "PLAYER": UserRole.player, "PARENT": UserRole.parent}
    raw_role = (data.get("role") or "player")
    if isinstance(raw_role, str):
        user_role = role_map.get(raw_role.upper(), UserRole.player)
    else:
        user_role = UserRole.player

    if user_role not in _PUBLIC_REGISTRATION_ROLES:
        user_role = UserRole.player

    membership_type = MembershipType.junior if user_role == UserRole.player else MembershipType.full

    if User.query.filter_by(email=email).first():
        return None, "Email already registered"

    # Signup chain (build-phase-2 decisions 5+7): the club membership number is
    # the common code. A self-registering player MUST supply their parent's
    # membership number — it links the junior to the parent, who then approves
    # the signup before staff activate it. Parents may record their own number
    # at registration so their children can link to them later.
    parent = None
    parent_number = (data.get("parent_membership_number") or "").strip()
    if user_role == UserRole.player:
        if not parent_number:
            return None, "parent_membership_number is required — ask your parent for their club membership number"
        parent = User.query.filter_by(
            membership_number=parent_number, role=UserRole.parent
        ).first()
        if parent is None:
            return None, "No parent account found with that membership number"

    own_number = (data.get("membership_number") or "").strip() or None
    if own_number and User.query.filter_by(membership_number=own_number).first():
        return None, "That membership number is already registered"

    user = User(
        email=email,
        password_hash=User.generate_password_hash(password),
        first_name=first_name,
        last_name=last_name or "",
        role=user_role,
        membership_type=membership_type,
        phone=data.get("phone"),
        cdh_number=data.get("kcc_id") or data.get("cdh_number"),
        membership_number=own_number if user_role == UserRole.parent else None,
    )
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return None, "Email already registered"

    # Auto-create a JuniorProfile when a player registers with date_of_birth.
    # Self-registered juniors are linked to the parent and wait for the
    # parent's approval (then staff approval) before becoming active.
    if user_role == UserRole.player and data.get("date_of_birth"):
        _create_junior_profile(
            user, data,
            parent_id=parent.id if parent else None,
            approval_status="pending_parent",
        )

    return user, None


def _create_junior_profile(user, data: dict, parent_id=None, approval_status="active"):
    """
    Creates a minimal JuniorProfile for a registering junior golfer.
    band_id is auto-resolved from current_level=1 (beginner default).
    Self-registrations pass the resolved parent + 'pending_parent'.
    """
    from app.juniors.models import (
        JuniorProfile, JuniorParticipantType, LevelBand,
        JuniorExperience, JuniorAvailability,
    )
    from datetime import date

    # Resolve the level band for level 1
    band = LevelBand.query.filter(LevelBand.min_level <= 1, LevelBand.max_level >= 1).first()
    if band is None:
        return  # seed data not yet loaded — skip silently

    raw_gender = (data.get("gender") or "male").lower()
    gender = raw_gender if raw_gender in ("male", "female") else "male"

    raw_exp = (data.get("experience") or "beginner").lower()
    valid_exp = {e.value for e in JuniorExperience}
    experience = raw_exp if raw_exp in valid_exp else "beginner"

    raw_avail = (data.get("availability") or "weekends_only").lower()
    valid_avail = {a.value for a in JuniorAvailability}
    availability = raw_avail if raw_avail in valid_avail else "weekends_only"

    valid_pt = {pt.value for pt in JuniorParticipantType}
    raw_pt = (data.get("participant_type") or JuniorParticipantType.registered_junior.value)
    participant_type = raw_pt if raw_pt in valid_pt else JuniorParticipantType.registered_junior.value

    try:
        dob = date.fromisoformat(data["date_of_birth"])
    except (ValueError, KeyError):
        return  # invalid date — skip silently

    profile = JuniorProfile(
        user_id=user.id,
        parent_id=parent_id,
        date_of_birth=dob,
        gender=gender,
        current_level=1,
        band_id=band.id,
        experience=experience,
        availability=availability,
        approval_status=approval_status,
        participant_type=participant_type,
    )
    db.session.add(profile)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()  # don't fail the whole registration if profile creation fails


def create_child_account(parent, data: dict):
    """A parent creates their child's player account + junior profile
    (build-phase-2 decision 5). Parent consent is implicit, so the junior
    starts at pending_staff (admin/committee activate). Returns (user, err)."""
    from app.juniors.models import JuniorParticipantType

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return None, "email and password are required"
    pw_err = _validate_password(password)
    if pw_err:
        return None, pw_err
    first_name = (data.get("first_name") or "").strip()
    if not first_name:
        return None, "first_name is required"
    if not data.get("date_of_birth"):
        return None, "date_of_birth is required"
    if User.query.filter_by(email=email).first():
        return None, "Email already registered"

    # Validate participant_type when provided (parents may pass it; defaults to
    # registered_junior when absent — _create_junior_profile handles the default).
    if "participant_type" in data:
        valid_pt = {pt.value for pt in JuniorParticipantType}
        if data["participant_type"] not in valid_pt:
            return None, (
                f"participant_type must be one of: {', '.join(sorted(valid_pt))}"
            )

    user = User(
        email=email,
        password_hash=User.generate_password_hash(password),
        first_name=first_name,
        last_name=(data.get("last_name") or "").strip(),
        role=UserRole.player,
        membership_type=MembershipType.junior,
        phone=data.get("phone"),
    )
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return None, "Email already registered"

    _create_junior_profile(
        user, data, parent_id=parent.id, approval_status="pending_staff"
    )
    return user, None


def login_user(email: str, password: str):
    """
    Check is_active BEFORE verifying password so a deactivated account's
    password cannot be confirmed by observing which error message is returned.
    """
    email = (email or "").strip().lower()
    if not email or not password:
        return None, "email and password are required"

    user = User.query.filter_by(email=email).first()
    if user is None:
        return None, "Invalid credentials"

    # Check active status before password — prevents confirming a valid password
    # via the distinct "Account is inactive" error message.
    if not user.is_active:
        return None, "Invalid credentials"

    if not user.verify_password_hash(password):
        return None, "Invalid credentials"

    return user, None


def get_user_by_email(email: str):
    return User.query.filter_by(email=email).first()


def get_user_by_id(user_id: str):
    return db.session.get(User, user_id)


def list_users(search=None, role=None, membership_type=None):
    query = User.query
    if role:
        query = query.filter(User.role == role)
    if membership_type:
        query = query.filter(User.membership_type == membership_type)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(User.email.ilike(pattern), User.first_name.ilike(pattern), User.last_name.ilike(pattern))
        )
    return query.all()


def create_user(data: dict):
    """Admin-only path — can set any role. Validates password if provided."""
    data = dict(data)
    if "password" in data:
        pw_err = _validate_password(data["password"])
        if pw_err:
            raise ValueError(pw_err)
        data["password_hash"] = User.generate_password_hash(data.pop("password"))
    user = user_schema.load(data, session=db.session)
    db.session.add(user)
    db.session.commit()
    return user


def update_user(user, data: dict, allow_privileged: bool = False):
    """
    Update a user record.

    allow_privileged=True  → admin path; may change role, is_active, email.
    allow_privileged=False → self-update path; privileged fields are silently ignored.
    """
    data = dict(data)

    # Always re-hash if a plain-text password is supplied
    if "password" in data:
        pw_err = _validate_password(data["password"])
        if pw_err:
            raise ValueError(pw_err)
        data["password_hash"] = User.generate_password_hash(data.pop("password"))

    # Strip fields that are permanently immutable regardless of caller
    for field in ("id", "password_hash", "created_at"):
        data.pop(field, None)

    # Strip privileged fields unless caller is admin
    if not allow_privileged:
        for field in ("role", "is_active", "email", "cdh_number"):
            data.pop(field, None)

    for key, value in data.items():
        setattr(user, key, value)

    db.session.commit()
    return user


def update_user_profile(user, data: dict):
    """Self-service profile update — only cosmetic fields allowed."""
    allowed = {"first_name", "last_name", "full_name", "phone"}
    for key in list(data.keys()):
        if key not in allowed:
            data.pop(key)

    if "full_name" in data:
        parts = data.pop("full_name").strip().split(" ", 1)
        user.first_name = parts[0]
        user.last_name = parts[1] if len(parts) > 1 else ""
    if "first_name" in data:
        user.first_name = data["first_name"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    if "phone" in data:
        user.phone = data["phone"]

    db.session.commit()
    return user


def change_password(user, data: dict):
    """Self-service password change: verify the current password, then set the
    new one (same minimum length as registration). Returns (user, error_string).

    NOTE: an incorrect current password is reported as a 400 by the route, NOT a
    401 — a 401 would trip the client's global "session expired → logout" handler
    and bounce the user to /login mid-change.
    """
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    if not current or not new:
        return None, "Current and new password are required"
    if not user.verify_password_hash(current):
        return None, "Current password is incorrect"
    pw_err = _validate_password(new)
    if pw_err:
        return None, pw_err
    if new == current:
        return None, "New password must be different from your current password"
    user.password_hash = User.generate_password_hash(new)
    db.session.commit()
    return user, None


def delete_user(user):
    db.session.delete(user)
    db.session.commit()
