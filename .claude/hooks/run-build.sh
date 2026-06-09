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

# Find the project that owns this file: walk up from the edited file's dir to the
# nearest ancestor with a local tsc (node_modules/.bin/tsc). The frontend lives in
# a git worktree, not in CLAUDE_PROJECT_DIR, so we must locate the toolchain by the
# file's own path rather than assuming the project root.
dir=$(dirname "$path")
root=""
while [ "$dir" != "/" ] && [ -n "$dir" ]; do
  if [ -x "$dir/node_modules/.bin/tsc" ]; then
    root="$dir"
    break
  fi
  dir=$(dirname "$dir")
done

# No local TypeScript toolchain found — nothing to check, skip rather than block.
[ -z "$root" ] && exit 0

cd "$root" 2>/dev/null || exit 0

out=$("$root/node_modules/.bin/tsc" -b --noEmit 2>&1)
status=$?

if [ "$status" -ne 0 ]; then
  echo "Type check failing after editing '$path'. Fix before continuing:" >&2
  printf '%s\n' "$out" | tail -n 40 >&2
  exit 2
fi

exit 0
