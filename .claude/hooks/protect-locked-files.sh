#!/usr/bin/env bash
# PreToolUse guard — block edits to locked planning/contract artifacts.
# Enforces the CLAUDE.md rule:
#   "Never modify CLAUDE.md, src/lib/api.ts, or src/types/api.ts without
#    explicit instruction."
# Returns exit 2 to block the tool call before it runs. Requires `jq`.
set -uo pipefail

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0

case "$path" in
  CLAUDE.md|*/CLAUDE.md|*/src/lib/api.ts|*/src/types/api.ts)
    echo "BLOCKED: '$path' is a locked contract/planning artifact." >&2
    echo "Editing it requires explicit human instruction. If this change is" >&2
    echo "intended, the human should apply it directly or temporarily disable" >&2
    echo "this hook in .claude/settings.json." >&2
    exit 2
    ;;
esac

exit 0
