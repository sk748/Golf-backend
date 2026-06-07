#!/usr/bin/env bash
# PostToolUse hook — type-check after edits to source, so type errors can't pass
# silently. Enforces a clean tsc as a baseline deliverable.
#
# Runs AFTER the edit is on disk (PostToolUse cannot undo a write), but exit 2
# reports failures back to Claude and prompts a fix. Type check only — lint and
# full vite build are left to the build-runner subagent to keep this fast.
# Requires Node tooling on PATH.
set -uo pipefail

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0

# Only react to TypeScript/React source changes.
case "$path" in
  */src/*.ts|*/src/*.tsx) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
command -v npx >/dev/null 2>&1 || { echo "npx not found; skipping type check." >&2; exit 0; }

out=$(npx tsc -b --noEmit 2>&1)
status=$?

if [ "$status" -ne 0 ]; then
  echo "Type check failing after editing '$path'. Fix before continuing:" >&2
  printf '%s\n' "$out" | tail -n 40 >&2
  exit 2
fi

exit 0
