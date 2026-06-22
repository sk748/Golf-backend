"""Pure unit tests for the authoritative tournament scoring math (no DB)."""

from datetime import date
from types import SimpleNamespace

from app.tournaments import scoring


# ── Course handicap ─────────────────────────────────────────────────────────────

def test_course_handicap_baseline():
    # index 18 on a slope-113, CR==par course => CH == index
    assert scoring.course_handicap_for(18, 113, 72, 72, holes=18) == 18


def test_course_handicap_nine_is_half():
    assert scoring.course_handicap_for(18, 113, 72, 72, holes=9) == 9


# ── Strokes received per hole ───────────────────────────────────────────────────

def test_strokes_received_basic():
    assert scoring.strokes_received_on_hole(10, 5) == 1     # SI 5 <= 10
    assert scoring.strokes_received_on_hole(10, 11) == 0    # SI 11 > 10


def test_strokes_received_over_18():
    # CH 20 => 1 stroke everywhere, +1 more on the 2 hardest holes
    assert scoring.strokes_received_on_hole(20, 2) == 2
    assert scoring.strokes_received_on_hole(20, 3) == 1


def test_strokes_received_zero():
    assert scoring.strokes_received_on_hole(0, 1) == 0


# ── Stableford ──────────────────────────────────────────────────────────────────

def test_stableford_par_is_two_points():
    # par 4, net par => 2 points
    assert scoring.stableford_points_for_hole(4, 5, 1) == 2   # net 4 on par 4
    assert scoring.stableford_points_for_hole(4, 4, 0) == 2


def test_stableford_floors_at_zero():
    assert scoring.stableford_points_for_hole(3, 7, 0) == 0   # net +4 => 0, not negative


def test_compute_stableford_total():
    holes_meta = {1: {"par": 4, "stroke_index": 1}, 2: {"par": 3, "stroke_index": 18}}
    # CH 1 => stroke only on hole 1 (SI 1)
    # hole 1: par4 strokes5 sr1 net4 -> 2 ; hole 2: par3 strokes3 sr0 net3 -> 2
    total = scoring.compute_stableford({1: 5, 2: 3}, holes_meta, 1)
    assert total == 4


# ── Net ─────────────────────────────────────────────────────────────────────────

def test_compute_net():
    assert scoring.compute_net_score(90, 18) == 72


# ── Age ─────────────────────────────────────────────────────────────────────────

def test_compute_age_on_birthday():
    assert scoring.compute_age(date(2014, 6, 1), date(2026, 6, 1)) == 12


def test_compute_age_day_before_birthday():
    assert scoring.compute_age(date(2014, 6, 2), date(2026, 6, 1)) == 11


# ── Eligibility ─────────────────────────────────────────────────────────────────

def _tournament(**kw):
    base = dict(age_min=None, age_max=None, level_min=None, level_max=None,
                handicap_min=None, handicap_max=None, handicap_required=False,
                start_date=date(2026, 6, 1))
    base.update(kw)
    return SimpleNamespace(**base)


def _junior(**kw):
    base = dict(date_of_birth=date(2014, 1, 1), current_level=7, handicap_index=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_eligibility_passes_when_unrestricted():
    ok, reason = scoring.check_eligibility(_tournament(), _junior(), date(2026, 6, 1))
    assert ok and reason is None


def test_eligibility_level_too_low():
    ok, reason = scoring.check_eligibility(_tournament(level_min=6), _junior(current_level=4), date(2026, 6, 1))
    assert not ok and "level" in reason.lower()


def test_eligibility_age_window():
    t = _tournament(age_min=5, age_max=12)
    young = _junior(date_of_birth=date(2014, 1, 1))  # age 12
    old = _junior(date_of_birth=date(2010, 1, 1))    # age 16
    assert scoring.check_eligibility(t, young, date(2026, 6, 1))[0] is True
    assert scoring.check_eligibility(t, old, date(2026, 6, 1))[0] is False


def test_eligibility_handicap_required():
    ok, reason = scoring.check_eligibility(_tournament(handicap_required=True), _junior(handicap_index=None), date(2026, 6, 1))
    assert not ok and "handicap" in reason.lower()


def test_eligibility_handicap_range():
    t = _tournament(handicap_max=15)
    assert scoring.check_eligibility(t, _junior(handicap_index=10), date(2026, 6, 1))[0] is True
    assert scoring.check_eligibility(t, _junior(handicap_index=20), date(2026, 6, 1))[0] is False


# ── Bracket seeding ─────────────────────────────────────────────────────────────

def test_seeding_order_four():
    assert scoring.seeding_order(4) == [1, 4, 2, 3]


def test_round1_with_bye():
    # 3 entries -> 4-slot bracket -> top seed gets a bye
    matches = scoring.build_round1_matches(["A", "B", "C"])
    assert matches == [("A", None), ("B", "C")]


def test_round1_power_of_two():
    matches = scoring.build_round1_matches(["A", "B", "C", "D"])
    # seed order [1,4,2,3] => (A,D),(B,C)
    assert matches == [("A", "D"), ("B", "C")]


# ── Leaderboard ranking ─────────────────────────────────────────────────────────

def test_rank_rows_gross_with_ties():
    rows = [
        {"entry_id": 1, "gross": 75},
        {"entry_id": 2, "gross": 70},
        {"entry_id": 3, "gross": 72},
        {"entry_id": 4, "gross": 72},
    ]
    ranked = scoring.rank_rows(rows, "gross")
    by_entry = {r["entry_id"]: r for r in ranked}
    assert by_entry[2]["rank"] == 1 and by_entry[2]["position"] == "1"
    assert by_entry[3]["position"] == "T2" and by_entry[4]["position"] == "T2"
    assert by_entry[1]["rank"] == 4


def test_rank_rows_stableford_high_wins():
    rows = [{"entry_id": 1, "stableford_points": 30}, {"entry_id": 2, "stableford_points": 36}]
    ranked = scoring.rank_rows(rows, "stableford")
    assert ranked[0]["entry_id"] == 2 and ranked[0]["rank"] == 1


# ── Match stroke allocation ─────────────────────────────────────────────────────

def test_match_stroke_allocation():
    holes_meta = {i: {"par": 4, "stroke_index": i} for i in range(1, 19)}
    alloc = scoring.match_stroke_allocation(7, 15, holes_meta)
    assert alloc["strokes"] == 8
    assert alloc["receiving"] == "b"  # higher handicap receives
    # holes with SI 1..8 each get a stroke
    strokes_holes = [h["hole"] for h in alloc["holes"] if h["strokes"] == 1]
    assert sorted(strokes_holes) == list(range(1, 9))
