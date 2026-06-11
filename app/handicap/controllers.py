"""Handicap-journey controllers.

Coaching-progress view of a junior's path toward a FIRST handicap (Junior
Development Plan, L4-5 "Attaining Handicap"). The coach develops a plan to get
scorecards signed; the targets are 9-hole 60-65 and 18-hole 120-130 strokes.

IMPORTANT: this does NOT recompute WHS / handicap index. The backend's WHS
engine owns handicap_index. Here a "signed scorecard" maps to a VERIFIED Round
(RoundStatus.verified), and we report coaching progress only.
"""

from datetime import datetime, timezone

from app.database.database import db
from app.handicap.models import HandicapJourney, HandicapJourneyStatus
from app.rounds.models import Round, HoleScore
from app.utils.schemas import SimpleModelSchema

journey_schema = SimpleModelSchema(HandicapJourney)
journeys_schema = SimpleModelSchema(HandicapJourney, many=True)

# Junior Development Plan L4-5 targets (strokes), encoded as constants. A round
# "meets target" when its gross falls within the band for its hole count.
NINE_HOLE_TARGET_MIN = 60
NINE_HOLE_TARGET_MAX = 65
EIGHTEEN_HOLE_TARGET_MIN = 120
EIGHTEEN_HOLE_TARGET_MAX = 130

# Default number of signed cards a coach wants before a junior is "ready".
DEFAULT_TARGET_SIGNED_CARDS = 5

_VALID_STATUSES = {s.value for s in HandicapJourneyStatus}


def utc_now():
    return datetime.now(timezone.utc)


# ── Journey CRUD ────────────────────────────────────────────────────────────

def get_journey(junior_id: int):
    """Return the persisted journey for a junior, or None."""
    return HandicapJourney.query.filter_by(junior_id=junior_id).first()


def get_or_create_journey(junior_id: int):
    """Return the junior's journey, lazily creating a default not_started row
    if none exists. The GET endpoint persists this default so the coach has a
    row to edit (see routes)."""
    j = get_journey(junior_id)
    if j is None:
        j = HandicapJourney(
            junior_id=junior_id,
            status=HandicapJourneyStatus.not_started,
            target_signed_cards=DEFAULT_TARGET_SIGNED_CARDS,
        )
        db.session.add(j)
        db.session.commit()
    return j


def update_journey(j, data: dict):
    """Apply a partial update. Stamps started_at when first moving to
    in_progress and attained_at when first moving to attained. Returns
    (journey, error_string). Validates the status enum (400 on bad value)."""
    if "status" in data and data["status"] is not None:
        new_status = data["status"]
        if new_status not in _VALID_STATUSES:
            allowed = ", ".join(sorted(_VALID_STATUSES))
            return None, f"status must be one of: {allowed}"
        # stamp lifecycle timestamps on first transition
        if new_status == HandicapJourneyStatus.in_progress.value and j.started_at is None:
            j.started_at = utc_now()
        if new_status == HandicapJourneyStatus.attained.value and j.attained_at is None:
            j.attained_at = utc_now()
        j.status = new_status

    if "target_signed_cards" in data and data["target_signed_cards"] is not None:
        try:
            target = int(data["target_signed_cards"])
        except (TypeError, ValueError):
            return None, "target_signed_cards must be an integer"
        if target < 1:
            return None, "target_signed_cards must be at least 1"
        j.target_signed_cards = target

    if "coach_notes" in data:
        j.coach_notes = data["coach_notes"]

    db.session.commit()
    return j, None


# ── Progress computation (read-only over verified rounds) ────────────────────

def _hole_count(round_obj) -> int:
    """How many holes a round covers. Prefer the actual per-hole rows
    (authoritative); fall back to gross-score magnitude when a round was
    submitted as a total only (no HoleScore rows)."""
    n = HoleScore.query.filter_by(round_id=round_obj.id).count()
    if n in (9, 18):
        return n
    if n > 0:
        # partial entry — treat <=9 holes as a 9-hole card, else 18
        return 9 if n <= 9 else 18
    # No per-hole rows: infer from gross. Typical 9-hole golf is ~35-75
    # strokes; 18-hole is roughly double. Use 90 as the split.
    gross = round_obj.gross_score or 0
    return 9 if gross < 90 else 18


def compute_progress(user_id: str, target_signed_cards: int):
    """Compute the coaching-progress block for a junior from their VERIFIED
    rounds (the signed-scorecard equivalent).

    `user_id` is the junior's linked user account id (Round.user_id); a signed
    card maps to a verified round. `target_signed_cards` comes from the journey.

    Returns a plain dict; recomputes NO WHS figures.
    """
    verified = (
        Round.query.filter_by(user_id=user_id, status="verified")
        .order_by(Round.date_played)
        .all()
    )

    signed_cards = len(verified)

    nine_scores = []
    eighteen_scores = []
    nine_meeting = 0
    eighteen_meeting = 0
    for r in verified:
        gross = r.gross_score
        if gross is None:
            continue
        if _hole_count(r) == 9:
            nine_scores.append(gross)
            # Lower is better in golf: the plan's 60-65 / 120-130 band is the
            # EXIT criterion, so "meeting" = scoring at or below the max
            # (a junior who beats the band has surpassed the goal, not missed it).
            if gross <= NINE_HOLE_TARGET_MAX:
                nine_meeting += 1
        else:
            eighteen_scores.append(gross)
            if gross <= EIGHTEEN_HOLE_TARGET_MAX:
                eighteen_meeting += 1

    def _avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    avg_9 = _avg(nine_scores)
    avg_18 = _avg(eighteen_scores)

    cards_remaining = max(0, target_signed_cards - signed_cards)
    has_target_cards = signed_cards >= target_signed_cards

    # On target = average at or below the plan's max (lower is better). Only
    # judged for a hole length they've actually played. The MIN is kept in the
    # `targets` echo for display ("expected band"), not as a readiness floor.
    nine_on_target = avg_9 is not None and avg_9 <= NINE_HOLE_TARGET_MAX
    eighteen_on_target = avg_18 is not None and avg_18 <= EIGHTEEN_HOLE_TARGET_MAX
    meets_targets = nine_on_target or eighteen_on_target

    # Derived readiness: enough signed cards in AND scoring is within a plan
    # target band. A coaching signal — never a handicap calculation.
    ready_for_handicap = has_target_cards and meets_targets

    return {
        "signed_cards": signed_cards,
        "target_signed_cards": target_signed_cards,
        "cards_remaining": cards_remaining,
        "has_target_cards": has_target_cards,
        "avg_9_hole": avg_9,
        "avg_18_hole": avg_18,
        "nine_hole_rounds": len(nine_scores),
        "eighteen_hole_rounds": len(eighteen_scores),
        "nine_hole_meeting_target": nine_meeting,
        "eighteen_hole_meeting_target": eighteen_meeting,
        "nine_on_target": nine_on_target,
        "eighteen_on_target": eighteen_on_target,
        "meets_targets": meets_targets,
        "ready_for_handicap": ready_for_handicap,
        "targets": {
            "nine_hole": {
                "min": NINE_HOLE_TARGET_MIN,
                "max": NINE_HOLE_TARGET_MAX,
            },
            "eighteen_hole": {
                "min": EIGHTEEN_HOLE_TARGET_MIN,
                "max": EIGHTEEN_HOLE_TARGET_MAX,
            },
        },
    }
