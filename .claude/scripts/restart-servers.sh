#!/usr/bin/env bash
# Restart the Karen Golf dev stack the same way every time:
#   backend  (Postgres + Flask  :5000)
#   frontend (Vite              :5173)
#   tunnel   (Cloudflare quick tunnel -> the frontend, public https URL)
#
# Robust + idempotent. Each piece:
#  - backend : starts Postgres if needed, kills whatever holds :5000, applies
#    migrations, starts ONE long-lived Flask with the auto-reloader OFF and
#    fully detached, blocks until /swagger answers 200. (The forking debug
#    reloader gets reaped by the bg-task supervisor, which silently drops the
#    server mid-session — reloader off avoids that.)
#  - frontend: kills whatever holds :5173, starts `vite --host` detached,
#    blocks until it answers 200.
#  - tunnel  : installs cloudflared if missing, kills any stale tunnel, starts a
#    quick tunnel to the frontend port detached, prints the public URL.
#
# Everything is launched fully detached (setsid) so it survives the tool shell.
#
# Which checkout to run is set by KAREN_APP_DIR (defaults to the frontend-phase0
# worktree, falling back to the repo this script lives in):
#   KAREN_APP_DIR=/path/to/checkout bash .claude/scripts/restart-servers.sh
#
# Usage:
#   restart-servers.sh [all|back|front|tunnel|status|stop]
#     all     (default) restart backend + frontend + tunnel
#     back              restart backend only
#     front             restart frontend only
#     tunnel            restart the Cloudflare tunnel only
#     status            report state of all three (no changes)
#     stop              stop frontend + tunnel (leaves backend + Postgres up)
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_APP_DIR="$REPO/.claude/worktrees/frontend-phase0"
[ -d "$DEFAULT_APP_DIR" ] || DEFAULT_APP_DIR="$REPO"   # fallback if the worktree is gone
APP_DIR="${KAREN_APP_DIR:-$DEFAULT_APP_DIR}"           # backend runs here
FRONT_DIR="${KAREN_FRONT_DIR:-$DEFAULT_APP_DIR}"       # frontend (package.json) lives here

PORT=5000          # backend
FRONT_PORT=5173    # vite
LOG=/tmp/karen_server.log
FRONT_LOG=/tmp/vite-dev.log
TUN_LOG=/tmp/cloudflared.log

# The venv lives in the MAIN checkout. When this script runs from a worktree
# copy (.claude/worktrees/<name>/…), REPO resolves to the worktree, which has
# no venv — fall back to the main repo three levels up.
PY="$REPO/venv/bin/python"
[ -x "$PY" ] || PY="$(cd "$REPO/../../.." 2>/dev/null && pwd)/venv/bin/python"
FLASK="$(dirname "$PY")/flask"

# ---- helpers ---------------------------------------------------------------
http_ok(){ [ "$(curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" = 200 ]; }
back_up(){ http_ok "http://localhost:$PORT/swagger/"; }
front_up(){ http_ok "http://localhost:$FRONT_PORT/"; }
port_pids(){
  { ss -ltnpH 2>/dev/null | grep ":$1 " || sudo ss -ltnpH 2>/dev/null | grep ":$1 "; } \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}
kill_port(){
  local p; p="$(port_pids "$1")"
  [ -n "$p" ] && { echo "Stopping :$1 -> $(echo "$p" | tr '\n' ' ')"; echo "$p" | xargs -r kill -9 2>/dev/null; sleep 1; }
}
tunnel_url(){ grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUN_LOG" 2>/dev/null | tail -1; }
tunnel_pids(){ pgrep -f 'cloudflared tunnel' 2>/dev/null; }

# ---- backend ---------------------------------------------------------------
start_backend(){
  pg_isready -q 2>/dev/null || sudo service postgresql start >/dev/null 2>&1
  kill_port "$PORT"
  cd "$APP_DIR" || { echo "ERROR: KAREN_APP_DIR not found: $APP_DIR"; return 1; }
  # Apply pending migrations before serving — dev's only schema path since
  # db.create_all() was retired (pre-staging parity with flask db upgrade).
  echo "Applying migrations (flask db upgrade)…"
  "$FLASK" --app main db upgrade 2>&1 | tail -n 2
  echo "Starting backend from: $APP_DIR (reloader off)"
  setsid nohup "$PY" -c "from main import app; app.run(host='0.0.0.0', port=$PORT, debug=False, use_reloader=False, threaded=True)" >"$LOG" 2>&1 &
  disown 2>/dev/null || true
  for _ in $(seq 1 40); do back_up && break; sleep 0.5; done
}

# ---- frontend --------------------------------------------------------------
start_frontend(){
  kill_port "$FRONT_PORT"
  cd "$FRONT_DIR" || { echo "ERROR: KAREN_FRONT_DIR not found: $FRONT_DIR"; return 1; }
  [ -d node_modules ] || { echo "Installing frontend deps (npm install)…"; npm install >>"$FRONT_LOG" 2>&1; }
  echo "Starting frontend from: $FRONT_DIR"
  setsid nohup npm run dev -- --host >"$FRONT_LOG" 2>&1 &
  disown 2>/dev/null || true
  for _ in $(seq 1 60); do front_up && break; sleep 0.5; done
}

# ---- cloudflare tunnel -----------------------------------------------------
ensure_cloudflared(){
  command -v cloudflared >/dev/null 2>&1 && return 0
  local arch url dest
  arch="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
  url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}"
  echo "Installing cloudflared ($arch)…"
  curl -fsSL "$url" -o /tmp/cloudflared && chmod +x /tmp/cloudflared || { echo "ERROR: cloudflared download failed"; return 1; }
  dest=/usr/local/bin/cloudflared
  sudo mv /tmp/cloudflared "$dest" 2>/dev/null || { mkdir -p "$HOME/.local/bin"; dest="$HOME/.local/bin/cloudflared"; mv /tmp/cloudflared "$dest"; }
  command -v cloudflared >/dev/null 2>&1
}
start_tunnel(){
  ensure_cloudflared || return 1
  local p; p="$(tunnel_pids)"
  [ -n "$p" ] && { echo "Stopping cloudflared -> $(echo "$p" | tr '\n' ' ')"; echo "$p" | xargs -r kill -9 2>/dev/null; sleep 1; }
  : >"$TUN_LOG"
  echo "Starting Cloudflare tunnel -> http://localhost:$FRONT_PORT"
  setsid nohup cloudflared tunnel --url "http://localhost:$FRONT_PORT" --no-autoupdate >"$TUN_LOG" 2>&1 &
  disown 2>/dev/null || true
  local url=""
  for _ in $(seq 1 40); do url="$(tunnel_url)"; [ -n "$url" ] && break; sleep 0.5; done
}

# ---- status ----------------------------------------------------------------
status(){
  pg_isready -q 2>/dev/null && echo "Postgres : up" || echo "Postgres : DOWN"
  local bp fp; bp="$(port_pids "$PORT" | tr '\n' ' ')"; fp="$(port_pids "$FRONT_PORT" | tr '\n' ' ')"
  echo "Flask    : ${bp:-(none)}  (serving :$PORT)"
  back_up  && echo "API      : 200  http://localhost:$PORT/swagger/" || echo "API      : not responding"
  echo "Vite     : ${fp:-(none)}  (serving :$FRONT_PORT)"
  front_up && echo "Frontend : 200  http://localhost:$FRONT_PORT/" || echo "Frontend : not responding"
  local tp tu; tp="$(tunnel_pids | tr '\n' ' ')"; tu="$(tunnel_url)"
  echo "Tunnel   : ${tp:-(none)}"
  echo "Public   : ${tu:-(none)}"
}

# ---- dispatch --------------------------------------------------------------
cmd="${1:-all}"
case "$cmd" in
  status) status; back_up && front_up; exit $? ;;
  stop)
    kill_port "$FRONT_PORT"
    p="$(tunnel_pids)"; [ -n "$p" ] && { echo "Stopping cloudflared -> $(echo "$p" | tr '\n' ' ')"; echo "$p" | xargs -r kill -9 2>/dev/null; }
    echo "----- stopped frontend + tunnel -----"; status; exit 0 ;;
  back)   start_backend ;;
  front)  start_frontend ;;
  tunnel) start_tunnel ;;
  all)    start_backend; start_frontend; start_tunnel ;;
  *) echo "Usage: restart-servers.sh [all|back|front|tunnel|status|stop]"; exit 2 ;;
esac

echo "----- restart -----"; status
# Fail loudly if a piece we were asked to start isn't answering.
case "$cmd" in
  all)    back_up && front_up || { echo "--- backend log ---"; tail -n 12 "$LOG"; echo "--- frontend log ---"; tail -n 12 "$FRONT_LOG"; exit 1; } ;;
  back)   back_up  || { echo "--- last log lines ---"; tail -n 15 "$LOG"; exit 1; } ;;
  front)  front_up || { echo "--- last log lines ---"; tail -n 15 "$FRONT_LOG"; exit 1; } ;;
  tunnel) [ -n "$(tunnel_url)" ] || { echo "--- last log lines ---"; tail -n 15 "$TUN_LOG"; exit 1; } ;;
esac
exit 0
