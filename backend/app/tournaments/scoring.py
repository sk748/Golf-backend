"""
Tournaments scoring engine — the authoritative competition math.

Per the Tournaments spec §9, the backend (not the frontend) owns net scores,
Stableford points, eligibility, positions, and bracket seeding so results are
identical for everyone. WHS course-handicap maths is reused from app/whs.

These are deliberately pure functions (primitives in, primitives out) so the
logic is unit-testable without a database.
"""

import math
from datetime import date

from app.whs.controllers import calculate_course_handicap


# ── Age / course handicap ──────────────────────────────────────────────────────

def compute_age(dob: date, on_date: date) -> int:
    """Age in whole years on `on_date`."""
    return on_date.year - dob.year - ((on_date.month, on_date.day) < (dob.month, dob.day))


def course_handicap_for(handicap_index, slope_rating, course_rating, par, holes=18) -> int:
    """
    Course handicap for a junior on a given tee. 18-hole via the WHS engine;
    9-hole CH = round(18-hole CH / 2) per spec §9.
    """
    ch18 = calculate_course_handicap(
        float(handicap_index), int(slope_rating), float(course_rating), int(par)
    )
    if int(holes) == 9:
        return round(ch18 / 2)
    return ch18


# ── Stroke allocation / net / Stableford ───────────────────────────────────────

def strokes_received_on_hole(course_handicap: int, stroke_index: int) -> int:
    """
    Strokes a player receives on one hole:
        floor(CH/18) + (1 if SI <= CH mod 18 else 0)
    Works for CH > 18 (multiple strokes per hole). Negative CH (plus handicaps)
    yields negative strokes (player gives shots back).
    """
    ch = int(course_handicap)
    base = ch // 18
    remainder = ch % 18  # Python modulo keeps sign aligned with divisor (18 > 0)
    extra = 1 if stroke_index <= remainder else 0
    return base + extra


def stableford_points_for_hole(par: int, strokes: int, strokes_received: int) -> int:
    """points = max(0, 2 + par − net_strokes), net_strokes = strokes − strokes_received."""
    net_strokes = strokes - strokes_received
    return max(0, 2 + par - net_strokes)


def compute_net_score(gross_score: int, course_handicap: int) -> int:
    """Net = gross − course handicap (spec §9)."""
    return int(gross_score) - int(course_handicap)


def compute_stableford(hole_strokes: dict, holes_meta: dict, course_handicap: int) -> int:
    """
    Total Stableford points across the played holes.
    `hole_strokes`: {hole_number: strokes}
    `holes_meta`:   {hole_number: {"par": p, "stroke_index": si}}
    """
    total = 0
    for hole_number, strokes in hole_strokes.items():
        meta = holes_meta.get(hole_number)
        if meta is None:
            continue
        sr = strokes_received_on_hole(course_handicap, meta["stroke_index"])
        total += stableford_points_for_hole(meta["par"], strokes, sr)
    return total


# ── Eligibility (spec §9) ──────────────────────────────────────────────────────

def check_eligibility(tournament, junior, on_date: date):
    """
    Validate a junior against a tournament's eligibility rules.
    Returns (ok: bool, reason: str|None). Any rule whose bounds are null is skipped.
    """
    # Age at start_date
    if tournament.age_min is not None or tournament.age_max is not None:
        age = compute_age(junior.date_of_birth, on_date)
        if tournament.age_min is not None and age < tournament.age_min:
            return False, f"Junior age {age} is below the minimum {tournament.age_min}"
        if tournament.age_max is not None and age > tournament.age_max:
            return False, f"Junior age {age} is above the maximum {tournament.age_max}"

    # Level band
    lvl = junior.current_level
    if tournament.level_min is not None and lvl < tournament.level_min:
        return False, f"Junior level {lvl} is below the minimum {tournament.level_min}"
    if tournament.level_max is not None and lvl > tournament.level_max:
        return False, f"Junior level {lvl} is above the maximum {tournament.level_max}"

    # Handicap
    hi = junior.handicap_index
    if tournament.handicap_required and hi is None:
        return False, "A handicap index is required for this tournament"
    if hi is not None:
        hi = float(hi)
        if tournament.handicap_min is not None and hi < float(tournament.handicap_min):
            return False, f"Handicap {hi} is below the minimum {float(tournament.handicap_min)}"
        if tournament.handicap_max is not None and hi > float(tournament.handicap_max):
            return False, f"Handicap {hi} is above the maximum {float(tournament.handicap_max)}"

    return True, None


# ── Leaderboard ranking ────────────────────────────────────────────────────────

def rank_rows(rows: list, basis: str):
    """
    Assign ranks to score rows for one division. `basis` is the tournament
    scoring_basis. Lower gross/net is better; higher Stableford is better. Ties
    share a rank and are marked with a trailing 'T' in `position`.
    `rows` is a list of dicts each having gross/net/stableford_points keys.
    Returns the same rows, sorted, with `rank` and `position` set.
    """
    def sort_key(r):
        if basis == "stableford":
            return -(r.get("stableford_points") or 0)
        if basis == "net":
            return r.get("net") if r.get("net") is not None else math.inf
        if basis == "both":
            return r.get("net") if r.get("net") is not None else math.inf
        return r.get("gross") if r.get("gross") is not None else math.inf

    ordered = sorted(rows, key=sort_key)
    rank = 0
    prev_key = object()
    counts = {}
    keys = [sort_key(r) for r in ordered]
    for k in keys:
        counts[k] = counts.get(k, 0) + 1
    for i, r in enumerate(ordered):
        k = keys[i]
        if k != prev_key:
            rank = i + 1
            prev_key = k
        tied = counts[k] > 1
        r["rank"] = rank
        r["position"] = f"T{rank}" if tied else str(rank)
    return ordered


# ── Match play: bracket seeding + match strokes ────────────────────────────────

def _next_power_of_two(n: int) -> int:
    if n <= 1:
        return 1
    return 1 << (n - 1).bit_length()


def seeding_order(pot: int) -> list:
    """
    Standard single-elimination seed slot order for a bracket of size `pot`
    (a power of two). Returns a list of seed numbers (1..pot) whose adjacent
    pairs are the round-1 matchups: (1 vs pot), (… ) etc.
    """
    seeds = [1]
    while len(seeds) < pot:
        size = len(seeds) * 2 + 1
        new = []
        for s in seeds:
            new.append(s)
            new.append(size - s)
        seeds = new
    return seeds


def build_round1_matches(entry_ids_in_seed_order: list):
    """
    Build round-1 (player_a_entry_id, player_b_entry_id) pairs for a single-
    elimination bracket. `entry_ids_in_seed_order` is best-seed first. Slots past
    the field size are byes (None). Returns a list of (a, b) tuples ordered by
    bracket position; a None opponent means a bye (a advances automatically).
    """
    n = len(entry_ids_in_seed_order)
    pot = _next_power_of_two(n)
    order = seeding_order(pot)
    # seed number -> entry id (or None for a bye slot)
    seed_to_entry = {}
    for seed in range(1, pot + 1):
        seed_to_entry[seed] = entry_ids_in_seed_order[seed - 1] if seed <= n else None

    matches = []
    for i in range(0, pot, 2):
        a = seed_to_entry[order[i]]
        b = seed_to_entry[order[i + 1]]
        matches.append((a, b))
    return matches


def match_stroke_allocation(ch_a: int, ch_b: int, holes_meta: dict):
    """
    Strokes given in a single match. The lower-handicap player gives strokes;
    the higher-handicap player receives `abs(ch_a - ch_b)` strokes, allocated by
    stroke index. Returns a dict with the difference, receiving side ('a'/'b'/None),
    and per-hole allocation.
    """
    diff = abs(int(ch_a) - int(ch_b))
    if ch_a == ch_b:
        receiving = None
    elif ch_a > ch_b:
        receiving = "a"
    else:
        receiving = "b"

    holes = []
    for hole_number in sorted(holes_meta.keys()):
        si = holes_meta[hole_number]["stroke_index"]
        holes.append({
            "hole": hole_number,
            "stroke_index": si,
            "strokes": strokes_received_on_hole(diff, si) if receiving else 0,
        })
    return {"strokes": diff, "receiving": receiving, "holes": holes}
