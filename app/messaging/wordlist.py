"""
Banned-word filter for the messaging domain (safety decision 5, 2026-06-11).

A message whose body matches any banned word is saved with status 'held'
(visible only to its sender, marked) and auto-flagged for admin review. The
list is a code constant for this phase — an admin-editable table is a later
phase. Matching is case-insensitive on word boundaries, so "Scunthorpe" or
"class" never trip it.
"""
import re

BANNED_WORDS = frozenset({
    # profanity
    "fuck", "fucking", "fucked", "fucker", "motherfucker",
    "shit", "shitty", "bullshit",
    "bitch", "bitches",
    "bastard",
    "asshole", "arsehole",
    "dick", "dickhead",
    "prick",
    "pussy",
    "cunt",
    "twat",
    "wanker",
    "cock", "cocksucker",
    "whore", "slut",
    "douchebag", "jackass",
    "piss",
    # slurs / hate speech
    "nigger", "nigga",
    "faggot", "fag",
    "retard", "retarded",
    "spastic",
    "kike", "chink", "spic", "wetback",
    "tranny", "dyke",
})

_PATTERN = re.compile(
    r"\b(" + "|".join(sorted(re.escape(w) for w in BANNED_WORDS)) + r")\b",
    re.IGNORECASE,
)


def check_banned(body):
    """Return the first banned word matched in `body` (lowercased), or None."""
    if not body:
        return None
    match = _PATTERN.search(body)
    return match.group(1).lower() if match else None
