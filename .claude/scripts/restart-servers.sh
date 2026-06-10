#!/usr/bin/env bash
# Restart the Karen Golf backend (Postgres + Flask) the same way every time.
#
# Robust + idempotent:
#  - starts Postgres if it isn't accepting connections
#  - kills whatever currently holds PORT (any entrypoint: main.py, run_server.py, …)
#  - starts ONE long-lived Flask process with the auto-reloader OFF and fully
#    detached. (The forking debug-reloader gets reaped by the bg-task supervisor,
#    which silently drops the server mid-session — reloader off avoids that.)
#  - blocks until /swagger answers 200.
#
# Which checkout's backend to run is set by KAREN_APP_DIR (defaults to the repo
# this script lives in). Point it elsewhere to serve a different branch, e.g.:
#   KAREN_APP_DIR=/workspaces/Golf-backend/.claude/worktrees/frontend-phase0 \
#     bash .claude/scripts/restart-servers.sh
#
# Usage: .claude/scripts/restart-servers.sh [status]
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_APP_DIR="$REPO/.claude/worktrees/frontend-phase0"
[ -d "$DEFAULT_APP_DIR" ] || DEFAULT_APP_DIR="$REPO"   # fallback if the worktree is gone
APP_DIR="${KAREN_APP_DIR:-$DEFAULT_APP_DIR}"
PORT=5000
LOG=/tmp/karen_server.log
# The venv lives in the MAIN checkout. When this script runs from a worktree
# copy (.claude/worktrees/<name>/…), REPO resolves to the worktree, which has
# no venv — fall back to the main repo three levels up.
PY="$REPO/venv/bin/python"
[ -x "$PY" ] || PY="$(cd "$REPO/../../.." 2>/dev/null && pwd)/venv/bin/python"
FLASK="$(dirname "$PY")/flask"

port_up(){ [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/swagger/" 2>/dev/null)" = 200 ]; }
port_pids(){
  { ss -ltnpH 2>/dev/null | grep ":$PORT " || sudo ss -ltnpH 2>/dev/null | grep ":$PORT "; } \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}
status(){
  pg_isready -q 2>/dev/null && echo "Postgres : up" || echo "Postgres : DOWN"
  local p; p="$(port_pids | tr '\n' ' ')"; echo "Flask    : ${p:-(none)}  (serving :$PORT)"
  port_up && echo "API      : 200  http://localhost:$PORT/swagger/" || echo "API      : not responding"
}

[ "${1:-}" = status ] && { status; port_up; exit $?; }

pg_isready -q 2>/dev/null || sudo service postgresql start >/dev/null 2>&1

pids="$(port_pids)"
[ -n "$pids" ] && { echo "Stopping :$PORT -> $(echo "$pids" | tr '\n' ' ')"; echo "$pids" | xargs -r kill -9 2>/dev/null; sleep 1; }

cd "$APP_DIR" || { echo "ERROR: KAREN_APP_DIR not found: $APP_DIR"; exit 1; }

# Apply pending migrations before serving — dev's only schema path since
# db.create_all() was retired (pre-staging parity with flask db upgrade).
echo "Applying migrations (flask db upgrade)…"
"$FLASK" --app main db upgrade 2>&1 | tail -n 2

echo "Starting backend from: $APP_DIR (reloader off)"
setsid nohup "$PY" -c "from main import app; app.run(host='0.0.0.0', port=$PORT, debug=False, use_reloader=False, threaded=True)" >"$LOG" 2>&1 &
disown 2>/dev/null || true
for _ in $(seq 1 40); do port_up && break; sleep 0.5; done
echo "----- restart -----"; status
port_up || { echo "--- last log lines ---"; tail -n 15 "$LOG"; exit 1; }
