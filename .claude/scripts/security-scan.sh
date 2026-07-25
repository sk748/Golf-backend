#!/usr/bin/env bash
# CodeMender security scan for Karen Golf (KCC JDPP).
#
# Wraps the `cm` CLI with this repo's conventions: preflight checks that fail
# loudly instead of half-running, a clean-tree guard so any applied patch stays
# revertible, and the cheap model by default. Never auto-applies fixes.
#
#   bash .claude/scripts/security-scan.sh preflight   # free, no API calls
#   bash .claude/scripts/security-scan.sh scan        # scan backend + frontend src
#   bash .claude/scripts/security-scan.sh scan backend/app/auth
#   bash .claude/scripts/security-scan.sh diff        # only files changed vs main
#   bash .claude/scripts/security-scan.sh report      # findings from last session
#   bash .claude/scripts/security-scan.sh clean       # drop local cache/reports

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GCLOUD_BIN="$HOME/google-cloud-sdk/bin"
[ -d "$GCLOUD_BIN" ] && export PATH="$GCLOUD_BIN:$PATH"

# gemini-3.5-flash is the cheap/fast tier. Override with CM_MODEL for a deeper
# pass on a release candidate.
MODEL="${CM_MODEL:-gemini-3.5-flash}"
MODE="${1:-preflight}"
TARGET="${2:-}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

preflight() {
  local fail=0
  say "----- codemender preflight -----"

  if command -v cm >/dev/null 2>&1; then
    ok "cm CLI            $(cm --version 2>&1 | head -1)"
  else
    bad "cm CLI            not on PATH — see DEPLOY.md or reinstall from Artifact Registry"; fail=1
  fi

  if command -v gcloud >/dev/null 2>&1; then
    ok "gcloud            $(gcloud version 2>/dev/null | head -1)"
  else
    bad "gcloud            not on PATH — run ~/google-cloud-sdk/install.sh"; fail=1
  fi

  local adc="$HOME/.config/gcloud/application_default_credentials.json"
  if [ -f "$adc" ]; then
    ok "ADC credentials   present"
  else
    bad "ADC credentials   missing — run: gcloud auth application-default login"; fail=1
  fi

  local proj
  proj="$(gcloud config get-value project 2>/dev/null)"
  if [ -n "$proj" ] && [ "$proj" != "(unset)" ]; then
    ok "GCP project       $proj"
  else
    bad "GCP project       unset — run: gcloud config set project <ID>"; fail=1
  fi

  if [ -f "$HOME/.codemender/config.yaml" ]; then
    ok "config.yaml       ~/.codemender/config.yaml"
  else
    bad "config.yaml       missing — run: cm init (from $REPO)"; fail=1
  fi

  # Clean-tree guard: CodeMender edits files in place. An already-dirty tree
  # makes it impossible to tell its changes from yours, or to revert cleanly.
  if [ -n "$(git -C "$REPO" status --porcelain 2>/dev/null)" ]; then
    warn "git tree          DIRTY — commit or stash before applying any fix"
  else
    ok "git tree          clean ($(git -C "$REPO" rev-parse --short HEAD 2>/dev/null))"
  fi

  printf '  model             %s\n' "$MODEL"
  [ "$fail" -eq 0 ] && say "preflight OK" || say "preflight FAILED — fix the ✗ items above"
  return "$fail"
}

require_ready() {
  preflight >/dev/null 2>&1 || { preflight; exit 1; }
}

case "$MODE" in
  preflight)
    preflight
    ;;

  scan)
    require_ready
    # Scope to source dirs — scanning the repo root drags in docs, migrations
    # and node_modules, which costs tokens and yields noise.
    if [ -n "$TARGET" ]; then
      PATHS=("$TARGET")
    else
      PATHS=("backend/app" "frontend/src")
    fi
    for p in "${PATHS[@]}"; do
      say "----- cm find: $p -----"
      ( cd "$REPO" && cm find "$p" --model "$MODEL" )
    done
    say "Review findings, then triage one with: cm verify <finding-id>"
    ;;

  diff)
    require_ready
    BASE="${TARGET:-main}"
    mapfile -t CHANGED < <(git -C "$REPO" diff --name-only "$BASE"...HEAD \
      | grep -E '\.(py|ts|tsx)$' | grep -vE '(^|/)tests?/' || true)
    if [ "${#CHANGED[@]}" -eq 0 ]; then
      say "No source files changed vs $BASE — nothing to scan."; exit 0
    fi
    say "----- cm find: ${#CHANGED[@]} file(s) changed vs $BASE -----"
    printf '  %s\n' "${CHANGED[@]}"
    for f in "${CHANGED[@]}"; do
      ( cd "$REPO" && cm find "$f" --model "$MODEL" )
    done
    ;;

  report)
    require_ready
    ( cd "$REPO" && cm report "${@:2}" )
    ;;

  clean)
    ( cd "$REPO" && cm clean )
    ;;

  *)
    echo "usage: $0 {preflight|scan [path]|diff [base]|report|clean}" >&2
    exit 2
    ;;
esac
