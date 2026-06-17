import csv
import io
import re
import secrets
from datetime import date, datetime, timedelta

from app.database.database import db
from app.juniors.models import (
    AchievementUnlock, Badge, JuniorBadge, JuniorParticipantType,
    JuniorProfile, LevelBand, LevelBenchmark,
)
from app.utils.mixins import utc_now
from app.utils.schemas import SimpleModelSchema

junior_schema = SimpleModelSchema(JuniorProfile)
juniors_schema = SimpleModelSchema(JuniorProfile, many=True)
level_band_schema = SimpleModelSchema(LevelBand)
level_bands_schema = SimpleModelSchema(LevelBand, many=True)
level_benchmark_schema = SimpleModelSchema(LevelBenchmark)
level_benchmarks_schema = SimpleModelSchema(LevelBenchmark, many=True)
badge_schema = SimpleModelSchema(Badge)
badges_schema = SimpleModelSchema(Badge, many=True)
junior_badge_schema = SimpleModelSchema(JuniorBadge)
junior_badges_schema = SimpleModelSchema(JuniorBadge, many=True)


def _resolve_band(data: dict):
    current_level = data.get("current_level")
    if current_level is None:
        return data
    band = LevelBand.query.filter(
        LevelBand.min_level <= current_level,
        LevelBand.max_level >= current_level,
    ).first()
    if band is None:
        raise ValueError("No level band exists for current_level")
    data["band_id"] = band.id
    return data


# ── Junior Profiles ────────────────────────────────────────────────────────

def list_juniors(parent_id=None, band_id=None, current_level=None,
                 age_min=None, age_max=None, coach_id=None,
                 approval_status=None, participant_type=None):
    q = JuniorProfile.query
    if parent_id:
        q = q.filter_by(parent_id=parent_id)
    if coach_id:
        q = q.filter_by(coach_id=coach_id)
    if approval_status:
        q = q.filter_by(approval_status=approval_status)
    if participant_type:
        q = q.filter_by(participant_type=participant_type)
    if band_id:
        q = q.filter_by(band_id=band_id)
    if current_level:
        q = q.filter_by(current_level=current_level)
    if age_min is not None or age_max is not None:
        today = datetime.utcnow().date()
        if age_min is not None:
            q = q.filter(JuniorProfile.date_of_birth <= today.replace(year=today.year - age_min))
        if age_max is not None:
            earliest = today.replace(year=today.year - age_max - 1) + timedelta(days=1)
            q = q.filter(JuniorProfile.date_of_birth >= earliest)
    return q.all()


def get_junior(junior_id: int):
    return db.session.get(JuniorProfile, junior_id)


_VALID_PARTICIPANT_TYPES = {pt.value for pt in JuniorParticipantType}


def _validate_participant_type(data: dict):
    """Validate participant_type if present; default to registered_junior when absent."""
    pt = data.get("participant_type")
    if pt is None:
        data["participant_type"] = JuniorParticipantType.registered_junior.value
        return data
    if pt not in _VALID_PARTICIPANT_TYPES:
        raise ValueError(
            f"participant_type must be one of: {', '.join(sorted(_VALID_PARTICIPANT_TYPES))}"
        )
    return data


def create_junior(data: dict):
    data = _resolve_band(dict(data))
    data = _validate_participant_type(data)
    junior = junior_schema.load(data)
    db.session.add(junior)
    db.session.commit()
    return junior


def update_junior(junior, data: dict):
    data = _resolve_band(dict(data))
    # Handicap is owned by the User and written ONLY via PUT /api/users/<id>/handicap
    # (which stamps provenance and mirrors onto this profile). Strip it here so the
    # generic profile edit can't silently diverge the two stores or skip provenance.
    data.pop("handicap_index", None)
    data.pop("has_handicap", None)
    if "participant_type" in data:
        pt = data["participant_type"]
        if pt not in _VALID_PARTICIPANT_TYPES:
            raise ValueError(
                f"participant_type must be one of: {', '.join(sorted(_VALID_PARTICIPANT_TYPES))}"
            )
    for k, v in data.items():
        setattr(junior, k, v)
    db.session.commit()
    return junior


def delete_junior(junior):
    db.session.delete(junior)
    db.session.commit()


def promote_junior(junior, evaluation):
    """Advance a junior one level, traceable to a fully counter-signed
    evaluation that recommends it (build-phase-2 decision 6).
    Returns (junior, error_string)."""
    if evaluation is None or evaluation.junior_id != junior.id:
        return None, "Evaluation not found for this golfer"
    rec = getattr(evaluation.recommendation, "value", evaluation.recommendation)
    if rec != "move_next_level":
        return None, "That evaluation does not recommend a level move"
    if not (evaluation.coach_signed and evaluation.committee_signed):
        return None, "Promotion needs a coach-signed AND committee-signed evaluation"
    if junior.current_level >= 9:
        return None, "Already at the top level"
    # An evaluation promotes from the level it was written at — this both
    # blocks re-using one evaluation for multiple promotions and rejects a
    # stale evaluation written before the junior last moved.
    if evaluation.current_level != junior.current_level:
        return None, (
            "That evaluation was written at level "
            f"{evaluation.current_level}; the golfer is now at level "
            f"{junior.current_level}"
        )
    update_junior(junior, {"current_level": junior.current_level + 1})
    return junior, None


def assign_coach(junior, coach_id):
    """Assign (or, with coach_id=None, unassign) a coach to a junior.

    Raises ValueError if coach_id is given but doesn't resolve to a user with
    the coach role — the column is a plain users FK, so we enforce the role here.
    """
    from app.auth.models import User

    if coach_id is None:
        junior.coach_id = None
    else:
        coach = db.session.get(User, coach_id)
        role = coach.role.value if (coach and hasattr(coach.role, "value")) else None
        if coach is None or role != "coach":
            raise ValueError("coach_id must reference a user with the coach role")
        junior.coach_id = coach_id
    db.session.commit()
    return junior


def get_junior_progress(junior_id: int):
    from app.evaluations.models import Evaluation
    from app.attendance.models import Attendance

    junior = db.session.get(JuniorProfile, junior_id)
    if junior is None:
        return None, "Junior not found"

    evaluations = Evaluation.query.filter_by(junior_id=junior_id).order_by(Evaluation.report_month).all()
    attendance_rows = Attendance.query.filter_by(junior_id=junior_id).all()

    benchmarks = []
    if junior.current_level in (6, 7, 8):
        bm = LevelBenchmark.query.filter_by(level_number=junior.current_level).first()
        if bm:
            benchmarks = [{
                "level_number": bm.level_number,
                "full_swing_target": bm.full_swing_target,
                "around_green_target": bm.around_green_target,
                "putting_target": bm.putting_target,
                "nine_hole_target": bm.nine_hole_target,
            }]

    return {
        "junior_id": junior.id,
        "current_level": junior.current_level,
        "level_changes": [
            {"report_month": e.report_month.isoformat(), "current_level": e.current_level}
            for e in evaluations
        ],
        "evaluations": [
            {
                "report_month": e.report_month.isoformat(),
                "current_level": e.current_level,
                "assessment": e.assessment.value,
                "recommendation": e.recommendation.value,
                "avg_score_9": float(e.avg_score_9) if e.avg_score_9 is not None else None,
                "avg_score_18": float(e.avg_score_18) if e.avg_score_18 is not None else None,
                "best_gross_score": e.best_gross_score,
            }
            for e in evaluations
        ],
        "attendance": {
            "present": sum(1 for a in attendance_rows if a.status.value == "present"),
            "absent": sum(1 for a in attendance_rows if a.status.value == "absent"),
            "excused": sum(1 for a in attendance_rows if a.status.value == "excused"),
            "total": len(attendance_rows),
        },
        "benchmarks": benchmarks,
        # Earned recognitions, so parents/staff viewing a junior see them too
        # (the player's own wall derives the catalog set client-side). Catalog
        # achievement titles/icons are resolved on the frontend from the key.
        "achievements": [
            {"key": u.achievement_key, "unlocked_at": u.unlocked_at.isoformat() if u.unlocked_at else None}
            for u in sorted(
                AchievementUnlock.query.filter_by(junior_id=junior_id).all(),
                key=lambda u: (u.unlocked_at or datetime.min, u.id),
            )
        ],
        "badges": [
            {
                "badge_id": jb.badge_id,
                "name": jb.badge.name if jb.badge else None,
                "description": jb.badge.description if jb.badge else None,
                "awarded_date": jb.awarded_date.isoformat() if jb.awarded_date else None,
            }
            for jb in JuniorBadge.query.filter_by(junior_id=junior_id).all()
        ],
    }, None


def get_monthly_report(junior_id: int, month: str):
    from app.evaluations.models import Evaluation
    from app.attendance.models import Attendance
    from app.sessions.models import Session

    junior = db.session.get(JuniorProfile, junior_id)
    if junior is None:
        return None, "Junior not found"

    evaluation = Evaluation.query.filter_by(junior_id=junior_id, report_month=month).first()
    attendance_rows = (
        Attendance.query.join(Session)
        .filter(Attendance.junior_id == junior_id, Session.date >= month)
        .all()
    )
    return {
        "profile": junior_schema.dump(junior),
        "evaluation": SimpleModelSchema(Evaluation).dump(evaluation) if evaluation else None,
        "attendance": {
            "present": sum(1 for a in attendance_rows if a.status.value == "present"),
            "absent": sum(1 for a in attendance_rows if a.status.value == "absent"),
            "excused": sum(1 for a in attendance_rows if a.status.value == "excused"),
            "total": len(attendance_rows),
        },
    }, None


# ── Level Bands ──────────────────────────────────────────────────────────────

def list_level_bands():
    return LevelBand.query.all()


def get_level_band(band_id: int):
    return db.session.get(LevelBand, band_id)


def create_level_band(data: dict):
    band = level_band_schema.load(data)
    db.session.add(band)
    db.session.commit()
    return band


def update_level_band(band, data: dict):
    for k, v in data.items():
        setattr(band, k, v)
    db.session.commit()
    return band


def delete_level_band(band):
    db.session.delete(band)
    db.session.commit()


# ── Level Benchmarks ──────────────────────────────────────────────────────────

def list_level_benchmarks(level_number=None):
    q = LevelBenchmark.query
    if level_number:
        q = q.filter_by(level_number=level_number)
    return q.all()


def get_level_benchmark(benchmark_id: int):
    return db.session.get(LevelBenchmark, benchmark_id)


def create_level_benchmark(data: dict):
    bm = level_benchmark_schema.load(data)
    db.session.add(bm)
    db.session.commit()
    return bm


def update_level_benchmark(bm, data: dict):
    for k, v in data.items():
        setattr(bm, k, v)
    db.session.commit()
    return bm


def delete_level_benchmark(bm):
    db.session.delete(bm)
    db.session.commit()


# ── Badges ────────────────────────────────────────────────────────────────────

def list_badges():
    return Badge.query.all()


def get_badge(badge_id: int):
    return db.session.get(Badge, badge_id)


def create_badge(data: dict):
    b = badge_schema.load(data)
    db.session.add(b)
    db.session.commit()
    return b


def update_badge(b, data: dict):
    for k, v in data.items():
        setattr(b, k, v)
    db.session.commit()
    return b


def delete_badge(b):
    db.session.delete(b)
    db.session.commit()


# ── Junior Badges ─────────────────────────────────────────────────────────────

def list_junior_badges(junior_id=None, coach_id=None):
    q = JuniorBadge.query
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    if coach_id is not None:
        # Coach roster scoping: only badges of juniors assigned to this coach.
        q = q.join(JuniorProfile, JuniorBadge.junior_id == JuniorProfile.id).filter(
            JuniorProfile.coach_id == coach_id
        )
    return q.all()


def award_badge(data: dict):
    jb = junior_badge_schema.load(data)
    db.session.add(jb)
    db.session.commit()
    return jb


def revoke_badge(junior_id: int, badge_id: int):
    jb = db.session.get(JuniorBadge, (junior_id, badge_id))
    if jb:
        db.session.delete(jb)
        db.session.commit()
    return jb


def sync_achievements(junior, items):
    """Record any catalog achievements the player has newly earned.

    `items` is a list of {key, title} the frontend evaluated as EARNED. We store
    one row per (junior, key) the first time we see it. The FIRST sync for a
    junior is treated as a silent baseline — a player who already qualified for a
    dozen achievements before this feature shipped shouldn't get a dozen confetti
    pops at once — so it records without congratulating. After that, each
    genuinely-new unlock pings the player (a self "achievement" notification) and
    their parent.

    Returns (newly_keys, unlocked) where `unlocked` is the full
    [{key, unlocked_at}] list ordered oldest→newest (drives the "most recent"
    glow)."""
    from app.notifications.service import notify

    existing = {
        u.achievement_key: u
        for u in AchievementUnlock.query.filter_by(junior_id=junior.id).all()
    }
    baseline = len(existing) == 0

    now = utc_now()
    title_by_key = {}
    newly = []
    for it in items or []:
        key = (str(it.get("key") or "")).strip()
        if not key or key in existing:
            continue
        title_by_key[key] = str(it.get("title") or key)
        row = AchievementUnlock(
            junior_id=junior.id, achievement_key=key, unlocked_at=now
        )
        db.session.add(row)
        existing[key] = row
        newly.append(key)

    celebrate = newly if not baseline else []
    if celebrate:
        # Always non-empty on the PARENT's copy: the frontend uses child_name's
        # presence to tell a parent notification from a player's own, so a blank
        # first name (possible for imported juniors) must still set a label.
        child_name = (
            (junior.user.first_name or "").strip() if junior.user else ""
        ) or "Your child"
        for key in celebrate:
            payload = {"achievement_key": key, "title": title_by_key[key]}
            notify(junior.user_id, "achievement", payload)
            if junior.parent_id:
                notify(
                    junior.parent_id,
                    "achievement",
                    {**payload, "child_name": child_name},
                )

    db.session.commit()

    rows = (
        AchievementUnlock.query.filter_by(junior_id=junior.id)
        .order_by(AchievementUnlock.unlocked_at, AchievementUnlock.id)
        .all()
    )
    unlocked = [
        {
            "key": r.achievement_key,
            "unlocked_at": r.unlocked_at.isoformat() if r.unlocked_at else None,
        }
        for r in rows
    ]
    return celebrate, unlocked


def list_achievement_unlocks(junior):
    """[{key, unlocked_at}] for a junior, oldest→newest."""
    rows = (
        AchievementUnlock.query.filter_by(junior_id=junior.id)
        .order_by(AchievementUnlock.unlocked_at, AchievementUnlock.id)
        .all()
    )
    return [
        {
            "key": r.achievement_key,
            "unlocked_at": r.unlocked_at.isoformat() if r.unlocked_at else None,
        }
        for r in rows
    ]


def set_featured_badge(junior, badge_id):
    """Feature a staff-granted badge (clears any featured achievement).
    badge_id=None clears the featured award. The badge must be one held."""
    if badge_id is None:
        junior.featured_badge_id = None
        junior.featured_achievement_key = None
        db.session.commit()
        return junior, None
    held = db.session.get(JuniorBadge, (junior.id, badge_id))
    if held is None:
        return None, "That badge has not been awarded to this junior"
    junior.featured_badge_id = badge_id
    junior.featured_achievement_key = None
    db.session.commit()
    return junior, None


def set_featured_achievement(junior, key):
    """Feature an auto-unlocked achievement (clears any featured badge). The
    achievement catalog lives in the frontend, so we trust the key for this
    cosmetic choice (key=None clears)."""
    junior.featured_achievement_key = key or None
    if key:
        junior.featured_badge_id = None
    db.session.commit()
    return junior, None


# ── Bulk intake import (CSV → preview → commit) ──────────────────────────────
#
# Staff upload the "Junior Development Names V3" roster CSV to onboard many
# juniors at once. Two endpoints share the parsing/validation in this section:
#   POST /api/juniors/import/preview  → parse + validate, NO writes
#   POST /api/juniors/import/commit   → re-parse the SAME csv + create rows
#
# The commit re-parses from scratch (never trusts client-sent parsed data) and
# wraps each row in its own savepoint so one bad row can't abort the batch.

# Header aliases: the real spreadsheet headers (left of →) map to canonical keys
# we use internally. Matching is case-insensitive and ignores surrounding
# whitespace; the first header whose normalized text contains one of these
# substrings wins, so minor wording drift in the export still resolves.
_HEADER_ALIASES = {
    "junior_first_name": ["junior's first name", "first name"],
    "junior_last_name": ["junior's surname", "surname", "last name"],
    "junior_phone": ["junior's phone"],
    "junior_email": ["junior's email"],
    "parent_name": ["parent's name", "parent name"],
    "parent_email": ["parent's email", "parent email", "email address"],
    "parent_phone": ["parent's phone", "parent phone"],
    "membership_number": ["membership number", "membership no", "membership"],
    "curriculum": ["curriculum"],
    "handicap_index": ["handicap index"],
    "played_us_kids": ["played us kids", "us kids?"],
    "us_kids_best_score": ["best us kids", "us kids score"],
    "experience": ["how long", "playing golf"],
    "availability": ["time dedication", "availability", "dedicate"],
    "medical_flag": ["medical condition"],
    "medical_details": ["details"],
    "golf_goals": ["golf goals", "goals"],
    "gender": ["gender", "sex"],
    "current_level": ["current level", "level"],
}

# NOTE on "Email Address": in the V3 spreadsheet the leading "Email Address"
# column is the responder (parent) email, so it is aliased to parent_email. An
# explicit "Parent's Email" header, if present, takes precedence because it is
# scanned first below.
_PARENT_EMAIL_PRIORITY = ["parent's email", "parent email", "email address"]

# experience free-text → JuniorExperience enum value. Keyed on substrings of the
# spreadsheet's "how long playing golf" answers; first match wins.
_EXPERIENCE_MAP = [
    ("beginner", "beginner"),
    ("less than", "lt_1yr"),
    ("under 1", "lt_1yr"),
    ("< 1", "lt_1yr"),
    ("1-3", "1_3yr"), ("1 - 3", "1_3yr"), ("1 to 3", "1_3yr"),
    ("4-6", "4_6yr"), ("4 - 6", "4_6yr"), ("4 to 6", "4_6yr"),
    ("7-10", "7_10yr"), ("7 - 10", "7_10yr"), ("7 to 10", "7_10yr"),
    ("more than 7", "7_10yr"),
]

# availability free-text → JuniorAvailability enum value.
_AVAILABILITY_MAP = [
    ("more than twice", "more_than_twice"),
    ("twice", "twice_weekly"),
    ("weekend", "weekends_only"),
    ("saturday", "weekends_only"),
    ("holiday", "holidays_only"),
]

_TRUE_WORDS = {"yes", "y", "true", "1"}
_FALSE_WORDS = {"no", "n", "false", "0", ""}

# Default level when the spreadsheet omits a level: intake is overwhelmingly
# beginners, and band resolution for level 1 already exists in the seed data.
_DEFAULT_LEVEL = 1

# Synthesized placeholder email for kids without their own address:
#   import+<slug>-<row>@karenjuniors.local
# Deterministic per row so re-running preview/commit on the SAME csv produces
# the SAME address; the .local TLD is non-routable so these never collide with
# real mail. The junior/parent sets a real email + password later via reset.
_SYNTH_EMAIL_DOMAIN = "karenjuniors.local"


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "junior"


def _synth_email(parent_key: str, name: str, row_number: int) -> str:
    base = _slugify(parent_key or name)
    return f"import+{base}-{row_number}@{_SYNTH_EMAIL_DOMAIN}"


def _norm(s):
    return (s or "").strip().lower()


def _build_header_index(fieldnames):
    """Map each canonical key → the actual CSV header that satisfies it.

    Returns {canonical_key: actual_header}. parent_email is resolved with an
    explicit priority order so "Parent's Email" beats the generic "Email
    Address" responder column when both exist.
    """
    headers = [h for h in (fieldnames or []) if h is not None]
    norm_headers = {h: _norm(h) for h in headers}
    index = {}

    # parent_email: honor priority order first
    for pref in _PARENT_EMAIL_PRIORITY:
        match = next((h for h in headers if norm_headers[h] == pref or pref in norm_headers[h]), None)
        if match:
            index["parent_email"] = match
            break

    for key, aliases in _HEADER_ALIASES.items():
        if key in index:
            continue
        for alias in aliases:
            match = next((h for h in headers if alias in norm_headers[h]), None)
            if match:
                index[key] = match
                break
    return index


def _cell(row, header_index, key):
    header = header_index.get(key)
    if header is None:
        return ""
    return (row.get(header) or "").strip()


def _parse_bool(text):
    """Return True/False/None from a free-text yes/no cell."""
    t = _norm(text)
    if t in _TRUE_WORDS:
        return True
    if t in _FALSE_WORDS:
        return False
    return None


def _map_experience(text):
    t = _norm(text)
    if not t:
        return "beginner"  # default for blank intake answers
    for needle, value in _EXPERIENCE_MAP:
        if needle in t:
            return value
    return None  # present but unrecognized → caller flags an error


def _map_availability(text):
    t = _norm(text)
    if not t:
        return "weekends_only"  # default for blank intake answers
    for needle, value in _AVAILABILITY_MAP:
        if needle in t:
            return value
    return None  # present but unrecognized → caller flags an error


def _map_gender(text):
    t = _norm(text)
    if t in ("male", "m", "boy"):
        return "male"
    if t in ("female", "f", "girl"):
        return "female"
    return None  # blank/unknown → default applied + warning by caller


def _resolve_import_parent(membership_number, parent_email):
    """Find the parent User by membership number first, then by email.
    Returns (User|None, matched_by|None)."""
    from app.auth.models import User, UserRole

    if membership_number:
        parent = User.query.filter_by(
            membership_number=membership_number, role=UserRole.parent
        ).first()
        if parent:
            return parent, "membership_number"
    if parent_email:
        parent = User.query.filter_by(email=parent_email, role=UserRole.parent).first()
        if parent:
            return parent, "email"
        # An account with that email exists but isn't a parent — still useful to
        # report, but we do not link a non-parent as the parent.
    return None, None


def _read_csv(text):
    """Parse CSV text into (header_index, [row_dicts]). Raises ValueError on
    empty/headerless input."""
    if not text or not text.strip():
        raise ValueError("CSV is empty")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")
    rows = list(reader)
    header_index = _build_header_index(reader.fieldnames)
    return header_index, rows


def _parse_import_row(row, header_index, row_number):
    """Validate + map one CSV row to junior intake fields.

    Returns a dict: {row_number, parsed, parent_match, status, messages}.
    No database writes. status is one of ok / warning / error.
    """
    from app.auth.models import User

    messages = []
    status = "ok"

    def warn(msg):
        nonlocal status
        messages.append(msg)
        if status == "ok":
            status = "warning"

    def fail(msg):
        nonlocal status
        messages.append(msg)
        status = "error"

    first_name = _cell(row, header_index, "junior_first_name")
    last_name = _cell(row, header_index, "junior_last_name")
    junior_email = _norm(_cell(row, header_index, "junior_email"))
    parent_email = _norm(_cell(row, header_index, "parent_email"))
    parent_name = _cell(row, header_index, "parent_name")
    membership_number = _cell(row, header_index, "membership_number")

    if not first_name:
        fail("Junior's first name is required")

    # Date of birth — the spreadsheet uses age groups, not an exact DOB, so a
    # true DOB column is rarely present. We require an explicit date_of_birth
    # cell to create the profile (DOB is NOT NULL); absent → error with guidance.
    dob_cell = ""
    for h, v in row.items():
        if h and ("date of birth" in _norm(h) or _norm(h) == "dob"):
            dob_cell = (v or "").strip()
            break
    dob = None
    if dob_cell:
        try:
            dob = date.fromisoformat(dob_cell)
        except ValueError:
            fail(f"date_of_birth '{dob_cell}' is not ISO YYYY-MM-DD")
    else:
        fail("date_of_birth (ISO YYYY-MM-DD) is required — the age-group column is not a DOB")

    # Gender — often absent on the intake sheet; default male + warn (matches
    # the existing _create_junior_profile fallback behavior).
    gender = _map_gender(_cell(row, header_index, "gender"))
    if gender is None:
        gender = "male"
        warn("gender missing/unrecognized — defaulted to male")

    # Experience
    exp_raw = _cell(row, header_index, "experience")
    experience = _map_experience(exp_raw)
    if experience is None:
        fail(f"experience '{exp_raw}' did not match a known option")
        experience = "beginner"

    # Availability
    avail_raw = _cell(row, header_index, "availability")
    availability = _map_availability(avail_raw)
    if availability is None:
        fail(f"availability '{avail_raw}' did not match a known option")
        availability = "weekends_only"

    # Current level — default to beginner (1) when absent.
    level_cell = _cell(row, header_index, "current_level")
    current_level = _DEFAULT_LEVEL
    if level_cell:
        try:
            current_level = int(float(level_cell))
        except ValueError:
            warn(f"current_level '{level_cell}' unreadable — defaulted to {_DEFAULT_LEVEL}")
            current_level = _DEFAULT_LEVEL
    if not (1 <= current_level <= 9):
        warn(f"current_level {current_level} out of range 1-9 — defaulted to {_DEFAULT_LEVEL}")
        current_level = _DEFAULT_LEVEL

    # Handicap
    hcp_cell = _cell(row, header_index, "handicap_index")
    handicap_index = None
    has_handicap = False
    if hcp_cell:
        try:
            handicap_index = float(hcp_cell)
            has_handicap = True
        except ValueError:
            warn(f"handicap_index '{hcp_cell}' unreadable — imported without a handicap")

    played_us_kids = _parse_bool(_cell(row, header_index, "played_us_kids"))
    us_best_cell = _cell(row, header_index, "us_kids_best_score")
    us_kids_best_score = None
    if us_best_cell:
        try:
            us_kids_best_score = int(float(us_best_cell))
        except ValueError:
            warn(f"best US Kids score '{us_best_cell}' unreadable — skipped")

    medical_flag = _parse_bool(_cell(row, header_index, "medical_flag"))
    medical_details = _cell(row, header_index, "medical_details")
    medical_conditions = medical_details or (None if medical_flag is not True else "(condition noted, no details given)")

    # Email: synthesize a deterministic placeholder if the junior has none.
    synthesized_email = False
    if junior_email:
        email = junior_email
    else:
        email = _synth_email(membership_number or parent_email, f"{first_name}-{last_name}", row_number)
        synthesized_email = True
        warn(f"no junior email — synthesized placeholder {email} (reset later)")

    # Parent resolution
    parent, matched_by = _resolve_import_parent(membership_number, parent_email)
    parent_match = None
    if parent:
        parent_match = {
            "user_id": parent.id,
            "name": f"{parent.first_name} {parent.last_name}".strip(),
            "matched_by": matched_by,
        }
    else:
        if membership_number or parent_email:
            warn("no matching parent account found — junior imported unlinked")
        else:
            warn("no parent membership number or email given — junior imported unlinked")

    # Duplicate detection (no write): an existing User with this email, or an
    # existing junior whose linked player email matches.
    if email:
        existing = User.query.filter_by(email=email).first()
        if existing is not None:
            fail(f"a user with email {email} already exists — would be skipped as duplicate")

    parsed = {
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "synthesized_email": synthesized_email,
        "phone": _cell(row, header_index, "junior_phone") or None,
        "date_of_birth": dob.isoformat() if dob else None,
        "gender": gender,
        "current_level": current_level,
        "experience": experience,
        "availability": availability,
        "curriculum": _cell(row, header_index, "curriculum") or None,
        "has_handicap": has_handicap,
        "handicap_index": handicap_index,
        "played_us_kids": played_us_kids,
        "us_kids_best_score": us_kids_best_score,
        "medical_conditions": medical_conditions,
        "golf_goals": _cell(row, header_index, "golf_goals") or None,
        "participant_type": JuniorParticipantType.registered_junior.value,
        "parent_name": parent_name or None,
        "parent_email": parent_email or None,
        "membership_number": membership_number or None,
    }

    return {
        "row_number": row_number,
        "parsed": parsed,
        "parent_match": parent_match,
        "status": status,
        "messages": messages,
    }


def preview_import(csv_text):
    """Parse + validate the whole CSV. Returns {rows: [...], summary: {...}}."""
    header_index, rows = _read_csv(csv_text)
    results = []
    for i, row in enumerate(rows, start=1):
        # skip fully blank lines
        if not any((v or "").strip() for v in row.values()):
            continue
        results.append(_parse_import_row(row, header_index, i))

    summary = {
        "ok": sum(1 for r in results if r["status"] == "ok"),
        "warning": sum(1 for r in results if r["status"] == "warning"),
        "error": sum(1 for r in results if r["status"] == "error"),
        "total": len(results),
    }
    return {"rows": results, "summary": summary}


def _create_imported_junior(parsed, parent_match):
    """Create a player User + JuniorProfile from a parsed import row inside the
    CURRENT transaction (the caller wraps this in a savepoint). Returns the
    JuniorProfile. Reuses the same field construction as signup.

    Imported juniors land at approval_status 'pending_staff' (staff still
    activate, matching create_child_account), participant_type
    registered_junior, linked to the resolved parent when one was found.
    """
    from app.auth.models import User, UserRole, MembershipType

    band = LevelBand.query.filter(
        LevelBand.min_level <= parsed["current_level"],
        LevelBand.max_level >= parsed["current_level"],
    ).first()
    if band is None:
        raise ValueError(f"No level band exists for current_level {parsed['current_level']}")

    # Random temp password — the junior/parent resets it later (we never expose
    # it). 32 hex chars comfortably clears the 8-char minimum.
    temp_password = secrets.token_hex(16)

    user = User(
        email=parsed["email"],
        password_hash=User.generate_password_hash(temp_password),
        first_name=parsed["first_name"],
        last_name=parsed["last_name"] or "",
        role=UserRole.player,
        membership_type=MembershipType.junior,
        phone=parsed.get("phone"),
    )
    db.session.add(user)
    db.session.flush()  # assign user.id without ending the savepoint

    profile = JuniorProfile(
        user_id=user.id,
        parent_id=parent_match["user_id"] if parent_match else None,
        date_of_birth=date.fromisoformat(parsed["date_of_birth"]),
        gender=parsed["gender"],
        current_level=parsed["current_level"],
        band_id=band.id,
        curriculum=parsed.get("curriculum"),
        has_handicap=bool(parsed.get("has_handicap")),
        handicap_index=parsed.get("handicap_index"),
        played_us_kids=parsed.get("played_us_kids"),
        us_kids_best_score=parsed.get("us_kids_best_score"),
        experience=parsed["experience"],
        availability=parsed["availability"],
        medical_conditions=parsed.get("medical_conditions"),
        golf_goals=parsed.get("golf_goals"),
        approval_status="pending_staff",
        participant_type=parsed.get("participant_type", JuniorParticipantType.registered_junior.value),
    )
    db.session.add(profile)
    db.session.flush()
    return profile


def commit_import(csv_text):
    """Re-parse the SAME csv from scratch (never trust client-sent parsed data)
    and create each importable row. Rows with status 'error' are skipped. Each
    row is created inside its own savepoint so one failure can't abort the
    batch. Returns {created, skipped, errors: [{row_number, message}]}."""
    from app.auth.models import User

    header_index, rows = _read_csv(csv_text)
    created = 0
    skipped = 0
    errors = []

    for i, row in enumerate(rows, start=1):
        if not any((v or "").strip() for v in row.values()):
            continue

        result = _parse_import_row(row, header_index, i)
        if result["status"] == "error":
            skipped += 1
            errors.append({"row_number": i, "message": "; ".join(result["messages"]) or "validation error"})
            continue

        parsed = result["parsed"]

        # Idempotency: re-check duplicates at commit time (the DB may have
        # changed since preview, or an earlier row in THIS batch may have
        # created the same synthesized email). Skip rather than error.
        if User.query.filter_by(email=parsed["email"]).first() is not None:
            skipped += 1
            errors.append({"row_number": i, "message": f"skipped — user {parsed['email']} already exists"})
            continue

        try:
            with db.session.begin_nested():  # savepoint — isolates this row
                _create_imported_junior(parsed, result["parent_match"])
            created += 1
        except Exception as exc:  # noqa: BLE001 — one bad row must not abort the batch
            db.session.rollback()
            skipped += 1
            errors.append({"row_number": i, "message": f"failed to create: {exc}"})

    db.session.commit()
    return {"created": created, "skipped": skipped, "errors": errors}
