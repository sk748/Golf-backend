#!/usr/bin/env python
"""
Demo seed script for the Karen Golf backend.

Purpose
-------
Populate the DEV database (config.DevelopmentConfig, db `karen_db`) with a
coherent, realistic dataset so the dev frontend "looks alive" for demos.

What it does
------------
1. Wipes existing DEMO + domain data in FK-safe order (children before parents)
   so the script is idempotent — re-running gives the same clean result with no
   duplicate-key errors and no orphan FKs. It NEVER drops tables and it NEVER
   touches the seeded reference data (courses / tees / holes / level_bands /
   level_benchmarks / badges) — those are queried, not recreated.
2. Recreates the five standard demo logins (admin/coach/committee/parent/player
   @kcc.test, password "password123") using the app's own password hasher.
3. Builds ~3 coaches, ~8 parents, ~14 juniors across all four bands, with
   verified WHS rounds (via the real scoring path), signed evaluations,
   attendance, sessions, tournaments + entries + scores, badges, announcements,
   a message thread, and a couple of achievement unlocks.

How to run
----------
From the backend root (this worktree), under the app context. The script
imports `app` from main.py and opens its own app context — just run it with the
project's Python interpreter and the dev DATABASE_URI in the environment:

    cd /workspaces/Golf-backend/.claude/worktrees/frontend-phase0
    python scripts/seed_demo.py

The dev DB defaults to postgresql://postgres:username@localhost/karen_db
(config.DevelopmentConfig). Override with DATABASE_URI if needed.

Reference data (courses/tees/holes/level_bands/badges) MUST already exist in
the dev DB (seeded via `flask db upgrade` + the /api/seed reference seeder). If
it is missing the script aborts with a clear message rather than inventing it.

Exit code 0 on success, non-zero on failure (the whole run is one transaction
committed once at the very end).
"""

import os
import sys
import json
import random
from datetime import date, datetime, timezone, time, timedelta

from sqlalchemy import text as _sql_text

# ── App + DB ────────────────────────────────────────────────────────────────
from main import app
from app.database.database import db

# ── Models ──────────────────────────────────────────────────────────────────
from app.auth.models import User, UserRole, MembershipType
from app.courses.models import Course, TeeSet, Hole
from app.juniors.models import (
    JuniorProfile, LevelBand, Badge, JuniorBadge, AchievementUnlock,
    JuniorGender, JuniorExperience, JuniorAvailability,
    JuniorApprovalStatus, JuniorParticipantType,
)
from app.rounds.models import Round, HoleScore, RoundType, RoundStatus
from app.evaluations.models import (
    Evaluation, EvaluationAssessment, EvaluationRecommendation,
)
from app.attendance.models import Attendance, AttendanceStatus
from app.sessions.models import (
    Session, Class, ClassEnrollment, BookingRequest,
    SessionType, SessionStatus, ClassEnrollmentStatus, BookingRequestStatus,
)
from app.tournaments.models import (
    Tournament, TournamentDivision, TournamentEntry, TournamentScore,
    TournamentHoleScore, TournamentMatch, ExternalResult, Series,
    TournamentFormat, ScoringBasis, TournamentStatus, EntryStatus,
    ScoreStatus, DivisionBasis, ExternalEventType, CompetitionType,
)
from app.messaging.models import (
    Conversation, ConversationMember, Message, MessageFlag, BannedWordAttempt,
    ConversationType, MessageStatus,
)
from app.announcements.models import (
    Announcement, AnnouncementAudience, AnnouncementStatus,
)
from app.notifications.models import Notification
from app.events.models import (
    Event, EventRSVP, EventAudience, EventStatus, RSVPStatus,
)

# The WHS scoring path — gives us real score_differential + recomputed index.
from app.rounds.controllers import sync_score
from app.tournaments.scoring import (
    course_handicap_for, compute_net_score, compute_stableford,
)

# Reference date for the whole dataset. Anchored to the REAL current date so a
# fresh demo always has events/sessions/rounds in the current + upcoming week
# (the calendar opens on the current week). Override with SEED_TODAY=YYYY-MM-DD.
_today_override = os.environ.get("SEED_TODAY")
TODAY = date.fromisoformat(_today_override) if _today_override else date.today()
random.seed(42)  # deterministic-ish demo data run to run


def utcnow():
    return datetime.now(timezone.utc)


def month_first(d: date) -> date:
    """First-of-month for a date (the app's monthly convention)."""
    return d.replace(day=1)


def months_back(n: int) -> date:
    """First-of-month n months before TODAY."""
    y, m = TODAY.year, TODAY.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


# ─────────────────────────────────────────────────────────────────────────────
# 1. WIPE — delete demo/domain data in FK-safe order (children → parents).
#    Reference tables (courses, tee_sets, holes, level_bands, level_benchmarks,
#    badges) are intentionally NOT deleted.
# ─────────────────────────────────────────────────────────────────────────────

def wipe():
    """Delete all domain rows so the insert below starts clean. Order matters:
    we delete the deepest children first so no FK is ever orphaned. We delete
    EVERYTHING in these domain tables (this is a demo DB), which also clears any
    rows left by the reference seeder's example tournaments."""
    # Leaf-most first.
    db.session.query(TournamentHoleScore).delete(synchronize_session=False)
    db.session.query(TournamentScore).delete(synchronize_session=False)
    db.session.query(TournamentMatch).delete(synchronize_session=False)
    db.session.query(TournamentEntry).delete(synchronize_session=False)
    db.session.query(TournamentDivision).delete(synchronize_session=False)
    db.session.query(ExternalResult).delete(synchronize_session=False)
    db.session.query(Tournament).delete(synchronize_session=False)
    db.session.query(Series).delete(synchronize_session=False)

    db.session.query(HoleScore).delete(synchronize_session=False)
    db.session.query(Round).delete(synchronize_session=False)

    db.session.query(Evaluation).delete(synchronize_session=False)
    db.session.query(Attendance).delete(synchronize_session=False)
    db.session.query(BookingRequest).delete(synchronize_session=False)
    db.session.query(ClassEnrollment).delete(synchronize_session=False)
    db.session.query(Session).delete(synchronize_session=False)
    db.session.query(Class).delete(synchronize_session=False)

    db.session.query(AchievementUnlock).delete(synchronize_session=False)
    db.session.query(JuniorBadge).delete(synchronize_session=False)
    # handicap_journeys → junior_profiles (raw delete avoids an extra import).
    db.session.execute(_sql_text("DELETE FROM handicap_journeys"))

    # Calendar events (events.junior_id → junior_profiles, so clear before them).
    db.session.query(EventRSVP).delete(synchronize_session=False)
    db.session.query(Event).delete(synchronize_session=False)

    # Messaging / social
    db.session.query(BannedWordAttempt).delete(synchronize_session=False)
    db.session.query(MessageFlag).delete(synchronize_session=False)
    db.session.query(Message).delete(synchronize_session=False)
    db.session.query(ConversationMember).delete(synchronize_session=False)
    db.session.query(Conversation).delete(synchronize_session=False)
    db.session.query(Announcement).delete(synchronize_session=False)
    db.session.query(Notification).delete(synchronize_session=False)

    # junior_profiles reference featured_badge_id (badges, kept) and users.
    db.session.query(JuniorProfile).delete(synchronize_session=False)

    # audit_log → users (raw delete; clearing the demo audit trail is fine).
    db.session.execute(_sql_text("DELETE FROM audit_log"))

    # Users last (everything above FK-references users).
    db.session.query(User).delete(synchronize_session=False)

    db.session.flush()


# ─────────────────────────────────────────────────────────────────────────────
# Reference-data lookups (must already exist — we never recreate them).
# ─────────────────────────────────────────────────────────────────────────────

def load_reference():
    course = Course.query.filter_by(name="Karen Country Club").first()
    if course is None:
        raise SystemExit(
            "Reference data missing: no 'Karen Country Club' course. "
            "Seed reference data first (flask db upgrade + POST /api/seed)."
        )
    tees = {
        (t.name.value if hasattr(t.name, "value") else t.name,
         t.gender.value if hasattr(t.gender, "value") else t.gender): t
        for t in TeeSet.query.filter_by(course_id=course.id).all()
    }
    if not tees:
        raise SystemExit("Reference data missing: no tee sets for the course.")

    holes = Hole.query.filter_by(course_id=course.id).order_by(Hole.hole_number).all()
    if len(holes) < 18:
        raise SystemExit("Reference data missing: course does not have 18 holes.")

    bands = LevelBand.query.order_by(LevelBand.min_level).all()
    if not bands:
        raise SystemExit("Reference data missing: no level bands seeded.")

    badges = Badge.query.all()
    if not badges:
        raise SystemExit(
            "Reference data missing: no recognition badges. "
            "Apply migration o16seedbadges (flask db upgrade)."
        )

    return course, tees, holes, bands, badges


def band_for_level(bands, level):
    for b in bands:
        if b.min_level <= level <= b.max_level:
            return b
    return bands[0]


# ─────────────────────────────────────────────────────────────────────────────
# 2. USERS — standard logins + staff + parents + junior player users.
# ─────────────────────────────────────────────────────────────────────────────

DEMO_PASSWORD = "password123"


def mk_user(email, first, last, role, membership_type,
            phone=None, membership_number=None, handicap_index=None):
    u = User(
        email=email.strip().lower(),
        password_hash=User.generate_password_hash(DEMO_PASSWORD),
        first_name=first,
        last_name=last,
        role=role,
        membership_type=membership_type,
        phone=phone,
        membership_number=membership_number,
        handicap_index=handicap_index,
        is_active=True,
    )
    db.session.add(u)
    return u


def seed_users():
    """Returns a dict of structured user handles."""
    out = {"coaches": [], "parents": []}

    # ── Standard front-door logins (must keep working) ──────────────────────
    out["admin"] = mk_user("admin@kcc.test", "Asha", "Mwangi",
                           UserRole.admin, MembershipType.full, phone="+254700000001")
    demo_coach = mk_user("coach@kcc.test", "Brian", "Otieno",
                         UserRole.coach, MembershipType.full, phone="+254700000002")
    out["committee"] = mk_user("committee@kcc.test", "Carol", "Njoroge",
                               UserRole.committee, MembershipType.full, phone="+254700000003")
    demo_parent = mk_user("parent@kcc.test", "David", "Kamau",
                          UserRole.parent, MembershipType.full,
                          phone="+254700000004", membership_number="KCC-1001")
    out["committee2"] = None
    out["coaches"].append(demo_coach)
    out["parents"].append(demo_parent)

    # ── Extra coaches (~3 total) ────────────────────────────────────────────
    out["coaches"].append(
        mk_user("eunice.wanjiru@kcc.test", "Eunice", "Wanjiru",
                UserRole.coach, MembershipType.full, phone="+254711000001"))
    out["coaches"].append(
        mk_user("felix.maina@kcc.test", "Felix", "Maina",
                UserRole.coach, MembershipType.full, phone="+254711000002"))

    # ── Extra parents (~8 total incl. the demo parent) ──────────────────────
    extra_parents = [
        ("grace.achieng@kcc.test", "Grace", "Achieng", "KCC-1002"),
        ("henry.mutua@kcc.test", "Henry", "Mutua", "KCC-1003"),
        ("irene.kiprop@kcc.test", "Irene", "Kiprop", "KCC-1004"),
        ("james.omondi@kcc.test", "James", "Omondi", "KCC-1005"),
        ("kevin.barasa@kcc.test", "Kevin", "Barasa", "KCC-1006"),
        ("lucy.wambui@kcc.test", "Lucy", "Wambui", "KCC-1007"),
        ("moses.cheruiyot@kcc.test", "Moses", "Cheruiyot", "KCC-1008"),
    ]
    for i, (email, fn, ln, num) in enumerate(extra_parents):
        out["parents"].append(
            mk_user(email, fn, ln, UserRole.parent, MembershipType.full,
                    phone=f"+2547120000{i:02d}", membership_number=num))

    # The standalone demo "player@kcc.test" — a junior with their own login.
    out["demo_player"] = mk_user(
        "player@kcc.test", "Pauline", "Kamau",
        UserRole.player, MembershipType.junior, phone="+254700000005")

    db.session.flush()  # assign ids
    return out


# ─────────────────────────────────────────────────────────────────────────────
# 3. JUNIORS — ~14 across all bands/levels 1-9, varied DOB/gender/type.
# ─────────────────────────────────────────────────────────────────────────────

# (first, last, level, gender, participant_type, has_handicap, age_years)
JUNIOR_SPECS = [
    # idx 0 is wired to player@kcc.test (the demo "front door"): a rich mid-level
    # junior with a handicap, rounds, evaluations, a badge and achievements, so
    # logging in as the demo player shows the full experience.
    ("Pauline", "Kamau", 7, "female", "registered_junior", True, 15),   # demo player (player@kcc.test)
    # L1-3 Beginners
    ("Tim",     "Achieng", 2, "male", "club_beginner", False, 8),
    ("Zoe",     "Mutua", 1, "female", "karen_academy", False, 7),
    ("Leo",     "Kiprop", 3, "male", "registered_junior", False, 10),
    # L4-5 Attaining handicap
    ("Mark",    "Omondi", 4, "male", "registered_junior", True, 12),
    ("Nina",    "Barasa", 5, "female", "registered_junior", True, 13),
    ("Oscar",   "Wambui", 4, "male", "club_beginner", True, 11),
    # L6-8 Intermediate & advanced
    ("Peter",   "Cheruiyot", 6, "male", "registered_junior", True, 14),
    ("Quinn",   "Njoroge", 7, "female", "registered_junior", True, 15),
    ("Ravi",    "Otieno", 8, "male", "registered_junior", True, 16),
    ("Sara",    "Wanjiru", 6, "female", "karen_academy", True, 14),
    # L9+ Enhanced / Elite
    ("Tendai",  "Maina", 9, "male", "registered_junior", True, 17),
    ("Uma",     "Achieng", 9, "female", "registered_junior", True, 16),
    ("Victor",  "Mwangi", 9, "male", "registered_junior", True, 17),
]

EXPERIENCE_BY_LEVEL = {
    1: "beginner", 2: "beginner", 3: "lt_1yr",
    4: "1_3yr", 5: "1_3yr",
    6: "4_6yr", 7: "4_6yr", 8: "4_6yr",
    9: "7_10yr",
}


def dob_for_age(age_years):
    # Birthday earlier in the year so the age is stable on TODAY.
    return date(TODAY.year - age_years, 3, 15)


def seed_juniors(users, bands):
    """Create a player User + JuniorProfile per spec. Returns list of profiles.
    Each junior gets a parent (round-robin) and a coach (round-robin)."""
    coaches = users["coaches"]
    parents = users["parents"]
    juniors = []

    for idx, (fn, ln, level, gender, ptype, has_hcp, age) in enumerate(JUNIOR_SPECS):
        band = band_for_level(bands, level)

        # Reuse the standard demo player user for the first junior so
        # player@kcc.test logs into a junior with real data.
        if idx == 0:
            user = users["demo_player"]
        else:
            email = f"{fn.lower()}.{ln.lower()}{idx}@kcc.test"
            user = mk_user(email, fn, ln, UserRole.player,
                           MembershipType.junior, phone=f"+2547130000{idx:02d}")
            db.session.flush()

        parent = parents[idx % len(parents)]
        coach = coaches[idx % len(coaches)]

        # Starting handicap index for mid/upper juniors (refined by real rounds
        # later via sync_score). None for beginners (no handicap yet).
        start_hi = None
        if has_hcp:
            # rough by level: lower level = higher index
            start_hi = {4: 30.0, 5: 26.0, 6: 20.0, 7: 17.0,
                        8: 13.0, 9: 9.0}.get(level, 25.0)
            user.handicap_index = start_hi  # users carry the WHS index

        prof = JuniorProfile(
            user_id=user.id,
            parent_id=parent.id,
            coach_id=coach.id,
            date_of_birth=dob_for_age(age),
            gender=JuniorGender(gender),
            current_level=level,
            band_id=band.id,
            curriculum=band.band_label,
            has_handicap=has_hcp,
            handicap_index=start_hi,
            played_us_kids=(level >= 6 and idx % 2 == 0),
            us_kids_best_score=(82 + idx % 6) if (level >= 6 and idx % 2 == 0) else None,
            experience=JuniorExperience(EXPERIENCE_BY_LEVEL[level]),
            availability=JuniorAvailability(
                "twice_weekly" if level >= 6 else "weekends_only"),
            medical_conditions=None,
            golf_goals=("Make the Karen junior team" if level >= 6
                        else "Learn the basics and have fun"),
            tournament_ready=(level >= 4),
            approval_status=JuniorApprovalStatus.active,
            participant_type=JuniorParticipantType(ptype),
        )
        db.session.add(prof)
        juniors.append(prof)

    db.session.flush()
    return juniors


# ─────────────────────────────────────────────────────────────────────────────
# 4. ROUNDS — verified WHS rounds via the real scoring path (sync_score).
#    sync_score computes score_differential and recomputes handicap_index, so
#    the indices on screen are genuinely WHS-derived.
# ─────────────────────────────────────────────────────────────────────────────

def gross_for_level(level, rng):
    """A plausible 18-hole gross for a junior of this level (par 72)."""
    base = {4: 118, 5: 108, 6: 98, 7: 92, 8: 87, 9: 82}.get(level, 110)
    return base + rng.randint(-4, 6)


def seed_rounds(users, juniors, tees):
    """For each mid/upper junior, submit several verified 18-hole rounds through
    sync_score so differentials + indices are real. Returns count of rounds."""
    admin = users["admin"]
    men_white = tees.get(("white", "men"))
    women_red = tees.get(("red", "women"))
    count = 0

    for prof in juniors:
        if not prof.has_handicap:
            continue
        # Tee by gender (any of the four is valid; we pick a sensible default).
        tee = women_red if prof.gender == JuniorGender.female else men_white
        if tee is None:
            tee = next(iter(tees.values()))

        n_rounds = 6 if prof.current_level >= 6 else 4
        rng = random.Random(1000 + prof.id)
        email = prof.user.email

        for i in range(n_rounds):
            played = TODAY - timedelta(days=14 * (n_rounds - i) + rng.randint(0, 5))
            gross = gross_for_level(prof.current_level, rng)
            # Staff-entered, verified, counting → feeds the handicap engine.
            result, err = sync_score(
                email=email,
                data={
                    "tee_set_id": tee.id,
                    "gross_score": gross,
                    "holes_played": 18,
                    "date_played": played.isoformat(),
                    "counts_toward_handicap": True,
                    "pcc": 0,
                },
                entered_by=admin.id,
                initial_status="verified",
            )
            if err:
                raise SystemExit(f"sync_score failed for {email}: {err}")
            count += 1

        # Mirror the recomputed WHS index back onto the junior profile so the
        # juniors view matches the player's WHS index.
        prof.handicap_index = prof.user.handicap_index

    db.session.flush()
    return count


# ─────────────────────────────────────────────────────────────────────────────
# 5. EVALUATIONS — signed monthly evals, band-appropriate fields, 2-3 months.
# ─────────────────────────────────────────────────────────────────────────────

def seed_evaluations(users, juniors, bands):
    committee = users["committee"]
    count = 0
    # Evaluate a handful of juniors (one per band-ish) for the last 3 months.
    sample = juniors[1:9]  # skip the demo player (kept light), span bands
    months = [months_back(2), months_back(1), months_back(0)]

    for prof in sample:
        coach = prof.assigned_coach
        band = band_for_level(bands, prof.current_level)
        tmpl = band.report_template.value if hasattr(band.report_template, "value") \
            else band.report_template

        for mi, m in enumerate(months):
            ev = Evaluation(
                junior_id=prof.id,
                coach_id=coach.id,
                report_month=m,                      # first-of-month
                current_level=prof.current_level,
                attendance_count=6 + mi,
                attendance_total=8,
                assessment=EvaluationAssessment.meeting_expectation
                    if mi < 2 else EvaluationAssessment.exceeding_expectation,
                recommendation=EvaluationRecommendation.continue_level,
                special_remarks="Steady progress; great attitude on the range.",
            )

            # Band-specific fields (one flat row; fill the right ones).
            if tmpl == "skills":             # L1-3
                ev.putting_assessment = "Reads short putts well; pace improving."
                ev.chipping_assessment = "Solid contact around the green."
                ev.full_swing_assessment = "Tempo developing; good fundamentals."
            elif tmpl == "practice_scores":  # L4-5
                ev.avg_score_9 = 58.0 - mi
                ev.avg_score_18 = 118.0 - 2 * mi
            else:                            # competition (L6-8, L9+)
                ev.competitions_played = 2 + mi
                ev.best_gross_score = gross_for_level(prof.current_level,
                                                      random.Random(prof.id)) - mi

            # Sign-off: coach signs all; committee counter-signs older months.
            ev.coach_signed = True
            ev.coach_signed_date = m + timedelta(days=20)
            if mi < 2:  # the two older months are counter-signed
                ev.committee_signed = True
                ev.committee_signed_date = m + timedelta(days=25)
                ev.committee_signed_by = committee.id

            db.session.add(ev)
            count += 1

    db.session.flush()
    return count


# ─────────────────────────────────────────────────────────────────────────────
# 6. SESSIONS / CLASSES / ATTENDANCE / BOOKING REQUESTS
# ─────────────────────────────────────────────────────────────────────────────

def seed_sessions_and_attendance(users, juniors, bands):
    coaches = users["coaches"]
    info = {"classes": 0, "sessions": 0, "enrollments": 0,
            "attendance": 0, "bookings": 0}

    # One class per coach (band-tagged), enroll a few juniors each.
    classes = []
    for ci, coach in enumerate(coaches):
        band = bands[ci % len(bands)]
        klass = Class(
            name=f"{band.band_label} Clinic ({coach.first_name})",
            coach_id=coach.id,
            band_id=band.id,
            age_group="8-16",
            schedule="Sat 09:00-10:30",
            max_students=6,
            is_active=True,
        )
        db.session.add(klass)
        classes.append(klass)
    db.session.flush()
    info["classes"] = len(classes)

    # Enroll juniors into their coach's class.
    coach_to_class = {c.coach_id: c for c in classes}
    for prof in juniors:
        klass = coach_to_class.get(prof.coach_id)
        if klass is None:
            continue
        db.session.add(ClassEnrollment(
            class_id=klass.id,
            junior_id=prof.id,
            enrolled_date=months_back(2),
            status=ClassEnrollmentStatus.active,
        ))
        info["enrollments"] += 1
    db.session.flush()

    # A few sessions per class: two completed (past) + one scheduled (future),
    # plus one open-for-booking group session.
    sessions_by_class = {}
    for klass in classes:
        s_list = []
        # two completed past sessions
        for wk in (3, 1):
            s = Session(
                class_id=klass.id,
                coach_id=klass.coach_id,
                session_type=SessionType.group,
                date=TODAY - timedelta(days=7 * wk),
                start_time=time(9, 0),
                end_time=time(10, 30),
                notes="Short game and putting drills.",
                status=SessionStatus.completed,
                title="Short game + putting",
            )
            db.session.add(s)
            s_list.append(s)
            info["sessions"] += 1
        # one upcoming scheduled session, open for booking
        s_open = Session(
            class_id=klass.id,
            coach_id=klass.coach_id,
            session_type=SessionType.group,
            date=TODAY + timedelta(days=5),
            start_time=time(9, 0),
            end_time=time(10, 30),
            notes="Open clinic — bring a putter.",
            status=SessionStatus.scheduled,
            title="Open clinic: full swing",
            open_for_booking=True,
            max_attendance=6,
            level_min=klass.band.min_level,
            level_max=klass.band.max_level,
            requirements="Bring a putter and water.",
        )
        db.session.add(s_open)
        s_list.append(s_open)
        info["sessions"] += 1
        sessions_by_class[klass.id] = s_list
    db.session.flush()

    # Attendance against the two completed sessions for each enrolled junior.
    enrollments = ClassEnrollment.query.all()
    enrolled_by_class = {}
    for e in enrollments:
        enrolled_by_class.setdefault(e.class_id, []).append(e.junior_id)

    for klass in classes:
        completed = [s for s in sessions_by_class[klass.id]
                     if s.status == SessionStatus.completed]
        for s in completed:
            for ji, junior_id in enumerate(enrolled_by_class.get(klass.id, [])):
                # mostly present, a couple excused/absent for realism
                status = AttendanceStatus.present
                if ji % 5 == 4:
                    status = AttendanceStatus.excused
                elif ji % 7 == 6:
                    status = AttendanceStatus.absent
                db.session.add(Attendance(
                    session_id=s.id,
                    junior_id=junior_id,
                    status=status,
                ))
                info["attendance"] += 1
    db.session.flush()

    # A couple of parent booking requests (one pending, one approved).
    demo_parent = users["parents"][0]
    # find a junior belonging to the demo parent
    parent_juniors = [j for j in juniors if j.parent_id == demo_parent.id]
    if parent_juniors:
        j = parent_juniors[0]
        coach = j.assigned_coach
        db.session.add(BookingRequest(
            parent_id=demo_parent.id,
            junior_id=j.id,
            coach_id=coach.id,
            preferred_date=TODAY + timedelta(days=7),
            preferred_time=time(15, 0),
            status=BookingRequestStatus.pending,
            admin_notes=None,
        ))
        info["bookings"] += 1
        # one approved booking linked to an open session
        open_sess = next((s for s in Session.query
                          .filter_by(coach_id=coach.id, open_for_booking=True).all()), None)
        db.session.add(BookingRequest(
            parent_id=demo_parent.id,
            junior_id=j.id,
            coach_id=coach.id,
            preferred_date=TODAY + timedelta(days=5),
            preferred_time=time(9, 0),
            status=BookingRequestStatus.approved,
            session_id=open_sess.id if open_sess else None,
            admin_notes="Confirmed for the open clinic.",
        ))
        info["bookings"] += 1
    db.session.flush()
    return info


# ─────────────────────────────────────────────────────────────────────────────
# 7. TOURNAMENTS — one completed internal stroke-play (with leaderboard) and
#    one in registration_open. Plus a couple external results.
# ─────────────────────────────────────────────────────────────────────────────

def seed_tournaments(users, juniors, course, tees, holes):
    admin = users["admin"]
    info = {"tournaments": 0, "entries": 0, "scores": 0, "hole_scores": 0,
            "divisions": 0, "external_results": 0}

    men_white = tees.get(("white", "men")) or next(iter(tees.values()))
    holes_meta = {h.hole_number: {"par": h.par, "stroke_index": h.stroke_index}
                  for h in holes}
    par_total = sum(h.par for h in holes)  # 72

    # ── Completed internal STROKE PLAY (gross) — full leaderboard ───────────
    completed = Tournament(
        name="Karen Junior Strokeplay - May",
        format=TournamentFormat.stroke_play,
        scoring_basis=ScoringBasis.gross,
        course_id=course.id,
        tee_set_id=men_white.id,
        holes=18,
        start_date=months_back(1),       # first of last month
        end_date=months_back(1),
        counts_toward_handicap=False,
        status=TournamentStatus.completed,
        competition_type=CompetitionType.karen_strokeplay,
        level_min=4, level_max=9,
        description="Monthly 18-hole stroke play for Levels 4-9.",
    )
    db.session.add(completed)
    db.session.flush()
    info["tournaments"] += 1

    # Entrants: all mid/upper juniors with a handicap.
    entrants = [j for j in juniors if j.has_handicap]
    rng = random.Random(7)
    # build (entry, gross) then assign positions by gross asc.
    scored = []
    for j in entrants:
        entry = TournamentEntry(
            tournament_id=completed.id,
            junior_id=j.id,
            registered_by=admin.id,
            status=EntryStatus.confirmed,
            registered_at=months_back(1),
        )
        db.session.add(entry)
        db.session.flush()
        info["entries"] += 1

        gross = gross_for_level(j.current_level, rng)
        ch = course_handicap_for(
            j.handicap_index or 30, men_white.slope_rating,
            float(men_white.course_rating), course.par, holes=18)
        net = compute_net_score(gross, ch)

        score = TournamentScore(
            entry_id=entry.id,
            holes_played=18,
            gross_score=gross,
            net_score=net,
            stableford_points=None,   # stroke play → gross/net only
            status=ScoreStatus.verified,
        )
        db.session.add(score)
        db.session.flush()
        info["scores"] += 1

        # Per-hole strokes that sum to gross (distribute around par).
        remaining = gross
        per_hole = {}
        hnums = [h.hole_number for h in holes]
        for k, h in enumerate(holes):
            holes_left = len(holes) - k
            # aim near par, keep it positive, reconcile last hole to total
            if holes_left == 1:
                strokes = max(1, remaining)
            else:
                target = round(remaining / holes_left)
                strokes = max(1, min(target + rng.randint(-1, 1), remaining - (holes_left - 1)))
            per_hole[h.hole_number] = strokes
            remaining -= strokes
        for hole_number, strokes in per_hole.items():
            db.session.add(TournamentHoleScore(
                tournament_score_id=score.id,
                hole_number=hole_number,
                strokes=strokes,
            ))
            info["hole_scores"] += 1

        scored.append((score, gross))

    # Assign positions by gross ascending (lower is better for stroke play).
    for pos, (score, gross) in enumerate(sorted(scored, key=lambda t: t[1]), start=1):
        score.position = pos
    db.session.flush()

    # ── Registration-open STABLEFORD (net) — upcoming, no scores yet ────────
    upcoming = Tournament(
        name="Karen Junior Challenge - June",
        format=TournamentFormat.stableford,
        scoring_basis=ScoringBasis.net,
        course_id=course.id,
        tee_set_id=men_white.id,
        holes=18,
        start_date=month_first(TODAY) + timedelta(days=20),
        counts_toward_handicap=True,
        status=TournamentStatus.registration_open,
        competition_type=CompetitionType.karen_junior_challenge,
        level_min=6, level_max=9,
        description="Mandatory monthly Stableford for Levels 6-9; counts toward handicap.",
    )
    db.session.add(upcoming)
    db.session.flush()
    info["tournaments"] += 1

    # A division by gender to make the detail view non-empty.
    db.session.add(TournamentDivision(
        tournament_id=upcoming.id, name="Boys", basis=DivisionBasis.gender,
        gender="male"))
    db.session.add(TournamentDivision(
        tournament_id=upcoming.id, name="Girls", basis=DivisionBasis.gender,
        gender="female"))
    info["divisions"] += 2
    db.session.flush()

    # Register the L6-9 juniors (eligible) for the upcoming event.
    for j in [x for x in juniors if x.current_level >= 6][:6]:
        db.session.add(TournamentEntry(
            tournament_id=upcoming.id,
            junior_id=j.id,
            registered_by=admin.id,
            status=EntryStatus.registered,
            registered_at=TODAY,
        ))
        info["entries"] += 1
    db.session.flush()

    # ── A couple of external results (verified) feeding junior stats ────────
    elite = [j for j in juniors if j.current_level >= 8][:2]
    for k, j in enumerate(elite):
        db.session.add(ExternalResult(
            junior_id=j.id,
            event_name="Faldo Series Kenya" if k == 0 else "US Kids Nairobi Tour",
            event_type=ExternalEventType.faldo_series if k == 0 else ExternalEventType.us_kids,
            date=months_back(2) + timedelta(days=12),
            holes=18,
            gross_score=80 + k * 3,
            position=4 + k,
            field_size=40,
            counts_toward_handicap=False,
            logged_by=admin.id,
            notes="Logged from event results sheet.",
            verified=True,
            verified_by=admin.id,
        ))
        info["external_results"] += 1
    db.session.flush()
    return info


# ─────────────────────────────────────────────────────────────────────────────
# 8. BADGES — award some of the 7 seeded recognition badges.
# ─────────────────────────────────────────────────────────────────────────────

def seed_badges(users, juniors, badges):
    admin = users["admin"]
    count = 0
    # Award the first 3 catalog badges to a spread of juniors.
    awards = [
        (juniors[4], badges[0]),   # Most Improved
        (juniors[7], badges[1]),   # Sportsmanship
        (juniors[8], badges[2 % len(badges)]),
        (juniors[11], badges[3 % len(badges)]),
        (juniors[0], badges[4 % len(badges)]),  # demo player
    ]
    seen = set()
    for prof, badge in awards:
        key = (prof.id, badge.id)
        if key in seen:
            continue
        seen.add(key)
        db.session.add(JuniorBadge(
            junior_id=prof.id,
            badge_id=badge.id,
            awarded_date=months_back(1) + timedelta(days=5),
            awarded_by=admin.id,
        ))
        count += 1
    # Feature a badge on the demo player's profile.
    juniors[0].featured_badge_id = badges[4 % len(badges)].id
    db.session.flush()
    return count


# ─────────────────────────────────────────────────────────────────────────────
# 9. ACHIEVEMENT UNLOCKS — modest, for the wall / parent view.
# ─────────────────────────────────────────────────────────────────────────────

def seed_achievements(juniors):
    count = 0
    unlocks = [
        (juniors[0], "first-round"),
        (juniors[0], "ten-sessions"),
        (juniors[7], "sub-95"),
        (juniors[11], "sub-84"),
    ]
    for prof, key in unlocks:
        db.session.add(AchievementUnlock(
            junior_id=prof.id,
            achievement_key=key,
            unlocked_at=utcnow() - timedelta(days=10),
        ))
        count += 1
    db.session.flush()
    return count


# ─────────────────────────────────────────────────────────────────────────────
# 10. ANNOUNCEMENTS + a small message thread.
# ─────────────────────────────────────────────────────────────────────────────

def seed_social(users):
    admin = users["admin"]
    committee = users["committee"]
    coach = users["coaches"][0]
    parent = users["parents"][0]
    info = {"announcements": 0, "conversations": 0, "messages": 0}

    # Internal announcement (everyone), goes live immediately.
    db.session.add(Announcement(
        title="Range closed for maintenance Friday AM",
        body="The driving range will be closed Friday 7-11am for re-turfing. "
             "Saturday clinics run as normal.",
        author_id=admin.id,
        audience=AnnouncementAudience.everyone,
        is_external=False,
        status=AnnouncementStatus.published,
        published_by=admin.id,
        published_at=utcnow() - timedelta(days=2),
    ))
    info["announcements"] += 1

    # Internal announcement targeted at coaches (roles csv).
    db.session.add(Announcement(
        title="June evaluations due by the 28th",
        body="Please complete and sign all June monthly evaluations before "
             "the committee review on the 30th.",
        author_id=committee.id,
        audience=AnnouncementAudience.roles,
        roles="coach",
        is_external=False,
        status=AnnouncementStatus.published,
        published_by=committee.id,
        published_at=utcnow() - timedelta(days=1),
    ))
    info["announcements"] += 1

    # External / published announcement (public landing page).
    db.session.add(Announcement(
        title="Karen Junior Challenge tees off this month",
        body="Our flagship junior Stableford returns this June. Spectators "
             "welcome — come cheer on the next generation of Kenyan golf.",
        author_id=admin.id,
        audience=AnnouncementAudience.everyone,
        is_external=True,
        status=AnnouncementStatus.published,
        published_by=admin.id,
        published_at=utcnow() - timedelta(days=3),
    ))
    info["announcements"] += 1

    # A small DM thread: parent <-> coach (allowed by the role matrix).
    # NOTE: Conversation.created_by is a FK to users.id (the creator), NOT an
    # audit string — these social models use TimestampMixin (no created_by audit
    # column), so we must pass a real user id here.
    conv = Conversation(type=ConversationType.dm, created_by=parent.id)
    db.session.add(conv)
    db.session.flush()
    db.session.add(ConversationMember(conversation_id=conv.id, user_id=parent.id))
    db.session.add(ConversationMember(conversation_id=conv.id, user_id=coach.id))
    info["conversations"] += 1

    thread = [
        (parent.id, "Hi Coach, will Saturday's clinic still run if it rains?"),
        (coach.id, "Hi! Yes — we move to the covered bays. See you at 9."),
        (parent.id, "Perfect, thank you. Pauline is really enjoying it."),
    ]
    base = utcnow() - timedelta(hours=6)
    for k, (sender_id, body) in enumerate(thread):
        m = Message(
            conversation_id=conv.id,
            sender_id=sender_id,
            body=body,
            status=MessageStatus.visible,
        )
        # nudge created_at so the thread is ordered
        m.created_at = base + timedelta(minutes=5 * k)
        db.session.add(m)
        info["messages"] += 1

    db.session.flush()
    return info


# ─────────────────────────────────────────────────────────────────────────────
# Series / order of merit — points accumulate across completed legs
# ─────────────────────────────────────────────────────────────────────────────

def seed_series(users, juniors, course, tees):
    """A season-long order of merit: a Series with a points scheme + several
    COMPLETED leg tournaments whose finishing positions accumulate into the
    standings (see controllers.series_standings). The existing registration-open
    June Challenge is linked as an upcoming (not-yet-counting) leg."""
    admin = users["admin"]
    info = {"series": 0, "legs": 0, "entries": 0, "scores": 0}

    men_white = tees.get(("white", "men")) or next(iter(tees.values()))
    par_total = course.par

    # Points by finishing position (string keys — series_standings json-loads it).
    points_scheme = {
        "1": 100, "2": 80, "3": 65, "4": 55, "5": 50,
        "6": 45, "7": 42, "8": 40, "9": 38, "10": 36,
    }
    series = Series(
        name="Karen Junior Order of Merit 2026",
        year=TODAY.year,
        points_scheme=json.dumps(points_scheme),
        status="active",
    )
    db.session.add(series)
    db.session.flush()
    info["series"] += 1

    # Tournament-ready juniors with a handicap are the order-of-merit field.
    field = [j for j in juniors if j.has_handicap]

    # Three completed legs over the last three months; vary the finishing order
    # per leg so the cumulative standings differ from any single event.
    legs = [
        ("Order of Merit — Leg 1 (Mar)", months_back(3)),
        ("Order of Merit — Leg 2 (Apr)", months_back(2)),
        ("Order of Merit — Leg 3 (May)", months_back(1)),
    ]
    for leg_idx, (name, when) in enumerate(legs):
        t = Tournament(
            name=name,
            format=TournamentFormat.stroke_play,
            scoring_basis=ScoringBasis.gross,
            course_id=course.id,
            tee_set_id=men_white.id,
            holes=18,
            start_date=when,
            end_date=when,
            counts_toward_handicap=False,
            status=TournamentStatus.completed,
            competition_type=CompetitionType.karen_strokeplay,
            series_id=series.id,
            level_min=4, level_max=9,
            description=f"Counting leg of the {series.name}.",
        )
        db.session.add(t)
        db.session.flush()
        info["legs"] += 1

        rng = random.Random(100 + leg_idx)
        order = field[:]
        rng.shuffle(order)  # this leg's finishing order
        for pos, j in enumerate(order, start=1):
            entry = TournamentEntry(
                tournament_id=t.id,
                junior_id=j.id,
                registered_by=admin.id,
                status=EntryStatus.confirmed,
                registered_at=when,
            )
            db.session.add(entry)
            db.session.flush()
            info["entries"] += 1

            gross = gross_for_level(j.current_level, rng)
            ch = course_handicap_for(
                j.handicap_index or 30, men_white.slope_rating,
                float(men_white.course_rating), par_total, holes=18)
            db.session.add(TournamentScore(
                entry_id=entry.id,
                holes_played=18,
                gross_score=gross,
                net_score=compute_net_score(gross, ch),
                position=pos,
                status=ScoreStatus.verified,
            ))
            info["scores"] += 1

    # Link the existing registration-open June Challenge as an upcoming leg so
    # the series detail shows what's still to come (it has no positions yet, so
    # it doesn't affect standings).
    upcoming = Tournament.query.filter_by(
        name="Karen Junior Challenge - June").first()
    if upcoming is not None and upcoming.series_id is None:
        upcoming.series_id = series.id

    db.session.flush()
    return info


# ─────────────────────────────────────────────────────────────────────────────
# Calendar events + RSVPs (unified calendar feature)
# ─────────────────────────────────────────────────────────────────────────────

def seed_events(users, juniors, bands):
    """Calendar events across all four audiences (everyone / band / coach_group
    / individual), some mandatory / RSVP-required, spread across the demo week so
    the unified calendar and weekly view are populated. Adds a past event and a
    cancelled one for variety."""
    admin = users["admin"]
    committee = users["committee"]
    coach = users["coaches"][0]
    info = {"events": 0, "rsvps": 0}

    def add_event(**kw):
        e = Event(**kw)
        db.session.add(e)
        info["events"] += 1
        return e

    def rsvp(event, user_id, status):
        db.session.add(EventRSVP(event_id=event.id, user_id=user_id, status=status))
        info["rsvps"] += 1

    beginner_band = band_for_level(bands, 2)   # L1–3
    advanced_band = band_for_level(bands, 7)   # L6–8
    coach_juniors = [j for j in juniors if str(j.coach_id) == str(coach.id)]

    # Days anchored to the demo week (TODAY = Thu 2026-06-11).
    days_to_sat = (5 - TODAY.weekday()) % 7 or 7

    # 1) EVERYONE — Club Open Day, upcoming Saturday, RSVP required.
    open_day = add_event(
        owner_id=admin.id, title="Club Open Day",
        description="Family open day at Karen — games, a BBQ and a junior "
                    "exhibition match. All members welcome.",
        location="Karen Country Club", date=TODAY + timedelta(days=days_to_sat),
        start_time=time(10, 0), end_time=time(15, 0),
        audience=EventAudience.everyone, rsvp_required=True,
        status=EventStatus.scheduled)
    db.session.flush()
    rsvp(open_day, users["demo_player"].id, RSVPStatus.going)
    rsvp(open_day, users["parents"][0].id, RSVPStatus.going)
    if len(users["coaches"]) > 1:
        rsvp(open_day, users["coaches"][1].id, RSVPStatus.not_going)

    # 2) BAND — beginners skills clinic this week (L1–3).
    if beginner_band is not None:
        add_event(
            owner_id=coach.id, title="Beginners Skills Clinic",
            description="Putting and chipping fundamentals for our L1–3 group.",
            location="Practice green", date=TODAY + timedelta(days=2),
            start_time=time(16, 0), end_time=time(17, 30),
            audience=EventAudience.band, band_id=beginner_band.id,
            status=EventStatus.scheduled)

    # 3) COACH_GROUP — mandatory squad briefing for the coach's roster.
    squad = add_event(
        owner_id=coach.id, title="Squad Briefing — Karen Junior Challenge",
        description="Mandatory pre-tournament briefing for my juniors. "
                    "Bring your scorecards.",
        location="Clubhouse lounge", date=TODAY + timedelta(days=1),
        start_time=time(15, 30), end_time=time(16, 30),
        audience=EventAudience.coach_group, coach_id=coach.id,
        rsvp_required=True, mandatory=True, status=EventStatus.scheduled)
    db.session.flush()
    for j in coach_juniors[:4]:
        rsvp(squad, j.user_id, RSVPStatus.going)

    # 4) INDIVIDUAL — a one-to-one lesson for a single junior.
    if coach_juniors:
        j = coach_juniors[0]
        add_event(
            owner_id=coach.id, title="1:1 Lesson — short game",
            description="Focused session on bunker play and wedge distances.",
            location="Short-game area", date=TODAY + timedelta(days=3),
            start_time=time(9, 0), end_time=time(10, 0),
            audience=EventAudience.individual, junior_id=j.id,
            status=EventStatus.scheduled)

    # 5) Committee event — everyone, later next week.
    add_event(
        owner_id=committee.id, title="Parents' Evening — Programme Update",
        description="Termly update on the junior development programme. "
                    "Q&A with the coaching team.",
        location="Clubhouse", date=TODAY + timedelta(days=days_to_sat + 4),
        start_time=time(18, 0), end_time=time(19, 30),
        audience=EventAudience.everyone, rsvp_required=True,
        status=EventStatus.scheduled)

    # 6) Past EVERYONE event (calendar history).
    add_event(
        owner_id=admin.id, title="Monthly Medal",
        description="Club monthly medal — juniors welcome off the red tees.",
        location="Karen Country Club", date=TODAY - timedelta(days=10),
        start_time=time(8, 0), end_time=time(13, 0),
        audience=EventAudience.everyone, status=EventStatus.scheduled)

    # 7) Cancelled event (shows the cancelled state).
    add_event(
        owner_id=admin.id, title="Range Twilight Session (cancelled)",
        description="Cancelled due to the range re-turfing.",
        location="Driving range", date=TODAY + timedelta(days=4),
        start_time=time(17, 30), end_time=time(19, 0),
        audience=EventAudience.everyone, status=EventStatus.cancelled)

    db.session.flush()
    return info


# ─────────────────────────────────────────────────────────────────────────────
# Notifications (the bell) — a small, realistic set on the demo logins
# ─────────────────────────────────────────────────────────────────────────────

def seed_notifications(users, juniors):
    """Seed a few notifications (real emitted types) so the bell isn't empty on
    the demo logins. Types mirror what the app emits in production."""
    n = 0

    def add(user_id, ntype, payload, read=False, ago_hours=2):
        note = Notification(user_id=user_id, type=ntype, payload=payload, read=read)
        note.created_at = utcnow() - timedelta(hours=ago_hours)
        db.session.add(note)
        nonlocal n
        n += 1

    admin = users["admin"]
    coach = users["coaches"][0]
    parent = users["parents"][0]
    player = users["demo_player"]

    # Admin: a repeat banned-word offender (moderation escalation) + a public RSVP-y announcement.
    add(admin.id, "banned_word_repeat",
        {"user_name": "A Member", "count": 3, "window_hours": 24}, ago_hours=1)
    add(admin.id, "announcement",
        {"title": "Karen Junior Challenge tees off this month"}, read=True, ago_hours=30)

    # Coach: a flagged message to review.
    add(coach.id, "message_flagged",
        {"flagged_by_name": "David Kamau", "reason": "Please review"}, ago_hours=3)

    # Parent: first-contact (a coach messaged their child) + tournament open.
    add(parent.id, "first_contact",
        {"staff_name": "Brian Otieno", "child_name": "Pauline Kamau"}, ago_hours=5)
    add(parent.id, "tournament_open",
        {"title": "Karen Junior Challenge"}, ago_hours=20)

    # Player: an achievement unlock.
    add(player.id, "achievement",
        {"title": "First Birdie"}, ago_hours=8)

    db.session.flush()
    return n


# ─────────────────────────────────────────────────────────────────────────────
# Orchestration
# ─────────────────────────────────────────────────────────────────────────────

def run():
    course, tees, holes, bands, badges = load_reference()

    print("Wiping existing demo/domain data...")
    wipe()

    print("Seeding users...")
    users = seed_users()

    print("Seeding juniors...")
    juniors = seed_juniors(users, bands)

    print("Seeding rounds (via WHS scoring path)...")
    n_rounds = seed_rounds(users, juniors, tees)

    print("Seeding evaluations...")
    n_evals = seed_evaluations(users, juniors, bands)

    print("Seeding sessions / classes / attendance...")
    sess_info = seed_sessions_and_attendance(users, juniors, bands)

    print("Seeding tournaments...")
    tourn_info = seed_tournaments(users, juniors, course, tees, holes)

    print("Seeding series / order of merit...")
    series_info = seed_series(users, juniors, course, tees)

    print("Seeding badges...")
    n_badges = seed_badges(users, juniors, badges)

    print("Seeding achievement unlocks...")
    n_ach = seed_achievements(juniors)

    print("Seeding announcements + messages...")
    social_info = seed_social(users)

    print("Seeding calendar events + RSVPs...")
    events_info = seed_events(users, juniors, bands)

    print("Seeding notifications...")
    n_notifs = seed_notifications(users, juniors)

    # Single commit at the very end (whole run is one transaction).
    db.session.commit()

    # ── Summary ─────────────────────────────────────────────────────────────
    coaches = len(users["coaches"])
    parents = len(users["parents"])
    total_users = User.query.count()
    print("\n" + "=" * 56)
    print("DEMO SEED COMPLETE")
    print("=" * 56)
    print(f"  Users (total):        {total_users}")
    print(f"    coaches:            {coaches}")
    print(f"    parents:            {parents}")
    print(f"  Juniors:              {len(juniors)}")
    print(f"  Rounds (verified):    {n_rounds}")
    print(f"  Evaluations:          {n_evals}")
    print(f"  Classes:              {sess_info['classes']}")
    print(f"  Sessions:             {sess_info['sessions']}")
    print(f"  Class enrollments:    {sess_info['enrollments']}")
    print(f"  Attendance rows:      {sess_info['attendance']}")
    print(f"  Booking requests:     {sess_info['bookings']}")
    print(f"  Tournaments:          {tourn_info['tournaments']}")
    print(f"    entries:            {tourn_info['entries']}")
    print(f"    scores:             {tourn_info['scores']}")
    print(f"    hole scores:        {tourn_info['hole_scores']}")
    print(f"    divisions:          {tourn_info['divisions']}")
    print(f"  External results:     {tourn_info['external_results']}")
    print(f"  Series:               {series_info['series']}")
    print(f"    counting legs:      {series_info['legs']}")
    print(f"    leg entries:        {series_info['entries']}")
    print(f"  Badges awarded:       {n_badges}")
    print(f"  Achievement unlocks:  {n_ach}")
    print(f"  Announcements:        {social_info['announcements']}")
    print(f"  Conversations:        {social_info['conversations']}")
    print(f"  Messages:             {social_info['messages']}")
    print(f"  Calendar events:      {events_info['events']}")
    print(f"  Event RSVPs:          {events_info['rsvps']}")
    print(f"  Notifications:        {n_notifs}")
    print("=" * 56)
    print("Logins (password: password123):")
    print("  admin@kcc.test / coach@kcc.test / committee@kcc.test")
    print("  parent@kcc.test / player@kcc.test")
    print("=" * 56)


def main():
    with app.app_context():
        try:
            run()
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            import traceback
            traceback.print_exc()
            print(f"\nSEED FAILED: {exc}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
