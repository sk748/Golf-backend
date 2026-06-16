"""
Banned-word filter for the messaging domain (safety decision 5, 2026-06-11;
comprehensive list + block/warn/log model, 2026-06-16).

A message whose body matches any banned word is BLOCKED (rejected, not stored
or delivered), the sender is warned, and the attempt is logged for admin review;
repeated attempts escalate (see controllers.record_banned_attempt).

The list is data-driven: `banned_words_en.txt` (LDNOOBW, MIT) plus
`banned_words_local.txt` (Swahili / Sheng). Both are plain term-per-line files —
'#' comments and blank lines ignored — so an admin/owner can edit them without
touching code (an in-app admin-editable table is a later phase). Matching is
case-insensitive on word boundaries, so "class" or "Scunthorpe" never trip it.
"""
import os
import re

_HERE = os.path.dirname(__file__)
_LIST_FILES = ("banned_words_en.txt", "banned_words_local.txt")


def _load_words():
    words = set()
    for name in _LIST_FILES:
        path = os.path.join(_HERE, name)
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    term = line.strip()
                    if term and not term.startswith("#"):
                        words.add(term.lower())
        except FileNotFoundError:
            continue
    return frozenset(words)


BANNED_WORDS = _load_words()

# Sort longest-first so a multi-word phrase ("two girls one cup") is preferred
# over a contained single word when both could match at the same position.
_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in sorted(BANNED_WORDS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def check_banned(body):
    """Return the first banned word matched in `body` (lowercased), or None."""
    if not body or not BANNED_WORDS:
        return None
    match = _PATTERN.search(body)
    return match.group(1).lower() if match else None
