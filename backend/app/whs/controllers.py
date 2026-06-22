"""
WHS 2024 Mathematical Engine — Karen Country Club
Implements Section 5 of the WHS Rules of Handicapping.
Server-side calculations used by the aggregate endpoints (Section 11 of spec).
"""

import math
from typing import List


def calculate_course_handicap(
    handicap_index: float,
    slope_rating: int,
    course_rating: float,
    par: int,
) -> int:
    """CH = (Index × (Slope / 113)) + (CR − Par)"""
    ch = (handicap_index * (slope_rating / 113)) + (course_rating - par)
    return round(ch)


def _get_expected_score_value(handicap_index: float, holes_remaining: int) -> float:
    """WHS 2024 Expected Score Scaling for incomplete rounds (9–17 holes)."""
    neutral_cr = 72
    ratio = holes_remaining / 18
    return ratio * (neutral_cr + (handicap_index * 1.04))


def calculate_score_differential(
    actual_gross_score: int,
    holes_played: int,
    handicap_index: float,
    course_rating: float,
    slope_rating: int,
    pcc: float = 0,
) -> float:
    """
    18-hole Score Differential for any valid round (9+ holes).
    Differential = (113 / Slope) × (AdjustedGross − CourseRating − PCC)
    For 9–17 hole rounds the missing holes are filled with Expected Score.
    """
    total_adjusted = float(actual_gross_score)
    if 9 <= holes_played < 18:
        missing = 18 - holes_played
        total_adjusted += _get_expected_score_value(handicap_index, missing)
    differential = (113 / slope_rating) * (total_adjusted - course_rating - pcc)
    return round(differential * 10) / 10


def calculate_handicap_index(differentials: List[float]) -> float:
    """
    Best-N-of-20 rule per WHS 2024.
    Uses the lowest N differentials from the most recent 20 rounds.
    Returns 0.0 when no differentials are available.
    """
    if not differentials:
        return 0.0

    sorted_diffs = sorted(differentials)
    count = len(sorted_diffs)

    if count >= 20:
        num_to_use = 8
    elif count >= 15:
        num_to_use = 5
    elif count >= 10:
        num_to_use = 3
    elif count >= 6:
        num_to_use = 2
    else:
        num_to_use = 1

    best = sorted_diffs[:num_to_use]
    avg = sum(best) / len(best)
    return math.floor(avg * 10) / 10
