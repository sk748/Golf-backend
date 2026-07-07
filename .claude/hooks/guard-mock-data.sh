#!/usr/bin/env bash
# PreToolUse guard — reject hardcoded mock data and direct-fetch bypasses before
# they land. Enforces two CLAUDE.md rules:
#   "No mock data." and "All requests via src/lib/api.ts."
#
# Heuristic and deliberately narrow. It fires when, inside src/, the new text:
#   (a) calls fetch()/axios directly, or hardcodes the backend origin, OR
#   (b) declares an obvious mock array (const mock... / const fake... / dummy...).
# The api client itself (src/lib/api.ts) is exempt from the fetch check.
# Tune the patterns if you hit a false positive. Requires `jq`.
set -uo pipefail

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in */src/*) ;; *) exit 0 ;; esac

payload=$(printf '%s' "$input" | jq -r '
  [ .tool_input.content?,
    .tool_input.new_string?,
    (.tool_input.edits[]?.new_string) ]
  | map(select(. != null)) | join("\n")
')
[ -z "$payload" ] && exit 0

# (a) direct fetch / axios / hardcoded backend origin — except in the api client.
case "$path" in
  */src/lib/api.ts) ;;  # the one place allowed to call fetch
  *)
    if printf '%s' "$payload" | grep -E -i \
         -e '\bfetch\s*\(' \
         -e '\baxios\b' \
         -e 'https?://localhost:5000' \
         >/dev/null 2>&1; then
      echo "BLOCKED: direct network call or hardcoded backend URL in '$path'." >&2
      echo "Route all requests through src/lib/api.ts with relative /api paths." >&2
      echo "(False positive? adjust .claude/hooks/guard-mock-data.sh.)" >&2
      exit 2
    fi
    ;;
esac

# (b) obvious mock/fake/dummy data declarations.
if printf '%s' "$payload" | grep -E -i \
     -e 'const[[:space:]]+(mock|fake|dummy|sample)[A-Za-z0-9_]*[[:space:]]*=[[:space:]]*\[' \
     >/dev/null 2>&1; then
  echo "BLOCKED: looks like hardcoded mock data in '$path'." >&2
  echo "Use real API data via TanStack Query, or build a real empty state." >&2
  echo "(False positive? adjust .claude/hooks/guard-mock-data.sh.)" >&2
  exit 2
fi

exit 0
