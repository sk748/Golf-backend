"""
WHS module has no database models — all computation is stateless.
Input/output shapes are documented here as reference for the routes layer.

POST /api/whs/score-differential
  in : { actual_gross_score: int, holes_played: int, handicap_index: float,
          course_rating: float, slope_rating: int, pcc?: float }
  out: { differential: float }

POST /api/whs/handicap-index
  in : { differentials: [float, ...] }   # up to 20 most-recent differentials
  out: { handicap_index: float }

POST /api/whs/course-handicap
  in : { handicap_index: float, slope_rating: int, course_rating: float, par: int }
  out: { course_handicap: int }
"""

SCORE_DIFFERENTIAL_REQUIRED = {"actual_gross_score", "holes_played", "handicap_index", "course_rating", "slope_rating"}
HANDICAP_INDEX_REQUIRED = {"differentials"}
COURSE_HANDICAP_REQUIRED = {"handicap_index", "slope_rating", "course_rating", "par"}


def validate_fields(data: dict, required: set) -> list:
    """Returns a list of missing field names."""
    return [f for f in required if f not in data or data[f] is None]
