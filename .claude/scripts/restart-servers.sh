#!/usr/bin/env bash
# Restart the Karen Golf dev stack the same way every time:
#   backend  (Postgres + Flask  :5055)
#   frontend (Vite              :5173)
#   tunnel   (Cloudflare quick tunnel -> the frontend, public https URL)
#
# Robust + idempotent. Each piece:
#  - backend : starts Postgres if needed, kills whatever holds the backend port,
#    applies migrations, starts ONE long-lived Flask with the auto-reloader OFF
#    and fully detached, blocks until /swagger answers 200. (The forking debug
#    reloader gets reaped by the bg-task supervisor, which silently drops the
#    server mid-session — reloader off avoids that.)
#  - frontend: kills whatever holds :5173, starts `vite --host` detached,
#    blocks until it answers 200.
#  - tunnel  : installs cloudflared if missing, kills any stale tunnel, starts a
#    quick tunnel to the frontend port detached, prints the public URL.
#
# Runs on macOS and Linux. Platform differences handled: process detach
# (setsid is Linux-only), listener lookup (lsof vs ss), Postgres service
# manager, and the cloudflared download (OS + arch).
#
# Layout: this is a monorepo — backend/ (Flask) and frontend/ (Vite) — so the
# two halves start from different directories. Override with KAREN_APP_DIR /
# KAREN_FRONT_DIR if you're running a worktree.
#
# The backend port is read from frontend/vite.config.ts so the proxy target and
# the server can never drift apart. On macOS it must NOT be 5000 — that's the
# AirPlay Receiver (ControlCenter).
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
OS="$(uname -s)"
ARCH="$(uname -m)"

APP_DIR="${KAREN_APP_DIR:-$REPO/backend}"    # Flask lives here (main.py)
FRONT_DIR="${KAREN_FRONT_DIR:-$REPO/frontend}" # Vite lives here (package.json)

# Backend port comes from the vite proxy target — single source of truth.
PORT="$(grep -oE 'target:[[:space:]]*.http://localhost:[0-9]+' "$FRONT_DIR/vite.config.ts" 2>/dev/null \
        | grep -oE '[0-9]+$' | head -1)"
PORT="${PORT:-5055}"
FRONT_PORT=5173

LOG=/tmp/karen_server.log
FRONT_LOG=/tmp/vite-dev.log
TUN_LOG=/tmp/cloudflared.log

# venv lives in the backend checkout; fall back to a repo-root venv.
PY=""
for c in "$APP_DIR/venv/bin/python" "$REPO/venv/bin/python" "$APP_DIR/.venv/bin/python"; do
  [ -x "$c" ] && { PY="$c"; break; }
done
FLASK="${PY:+$(dirname "$PY")/flask}"

# ---- helpers ---------------------------------------------------------------
http_ok(){ [ "$(curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" = 200 ]; }
back_up(){ http_ok "http://localhost:$PORT/swagger/"; }
front_up(){ http_ok "http://localhost:$FRONT_PORT/"; }

# Listener PIDs on a port. macOS has no `ss`; Linux images often have no `lsof`.
port_pids(){
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | sort -u
  else
    { ss -ltnpH 2>/dev/null | grep ":$1 " || true; } \
      | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
  fi
}

# Never kill a system process. On macOS :5000 is ControlCenter (AirPlay
# Receiver) — killing it is both futile (launchd respawns it) and rude.
kill_port(){
  local p pid comm
  p="$(port_pids "$1")"
  [ -z "$p" ] && return 0
  for pid in $p; do
    comm="$(ps -p "$pid" -o comm= 2>/dev/null)"
    case "$comm" in
      *ControlCenter*|*launchd*|*systemd*)
        echo "REFUSING to kill system process on :$1 -> $comm (pid $pid)"
        echo "  If this is macOS AirPlay on :5000, the backend should use another port."
        return 1 ;;
    esac
    echo "Stopping :$1 -> $pid ($comm)"
    kill -9 "$pid" 2>/dev/null
  done
  sleep 1
}

# setsid is Linux-only; nohup + disown detaches fine on macOS.
spawn(){  # spawn <logfile> <cmd...>
  local log="$1"; shift
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup "$@" >"$log" 2>&1 &
  else
    nohup "$@" >"$log" 2>&1 &
  fi
  disown 2>/dev/null || true
}

start_postgres(){
  pg_isready -q 2>/dev/null && return 0
  echo "Starting Postgres…"
  if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    local svc
    svc="$(brew services list 2>/dev/null | awk '/^postgresql/{print $1; exit}')"
    [ -n "$svc" ] && brew services start "$svc" >/dev/null 2>&1
  else
    sudo service postgresql start >/dev/null 2>&1 \
      || sudo systemctl start postgresql >/dev/null 2>&1
  fi
  for _ in $(seq 1 20); do pg_isready -q 2>/dev/null && return 0; sleep 0.5; done
  return 1
}

tunnel_url(){ grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUN_LOG" 2>/dev/null | tail -1; }
tunnel_pids(){ pgrep -f 'cloudflared tunnel' 2>/dev/null; }

# ---- backend ---------------------------------------------------------------
start_backend(){
  start_postgres || echo "WARNING: Postgres not responding — backend may fail to start"
  kill_port "$PORT" || return 1
  [ -n "$PY" ] || { echo "ERROR: no venv python found under $APP_DIR/venv — see .claude/docs/RUNNING.md §2"; return 1; }
  cd "$APP_DIR" || { echo "ERROR: KAREN_APP_DIR not found: $APP_DIR"; return 1; }
  echo "Applying migrations (flask db upgrade)…"
  "$FLASK" --app main db upgrade 2>&1 | tail -n 2
  echo "Starting backend from: $APP_DIR on :$PORT (reloader off)"
  spawn "$LOG" "$PY" -c "from main import app; app.run(host='0.0.0.0', port=$PORT, debug=False, use_reloader=False, threaded=True)"
  for _ in $(seq 1 40); do back_up && break; sleep 0.5; done
}

# ---- frontend --------------------------------------------------------------
start_frontend(){
  kill_port "$FRONT_PORT" || return 1
  cd "$FRONT_DIR" || { echo "ERROR: KAREN_FRONT_DIR not found: $FRONT_DIR"; return 1; }
  [ -d node_modules ] || { echo "Installing frontend deps (npm install)…"; npm install >>"$FRONT_LOG" 2>&1; }
  echo "Starting frontend from: $FRONT_DIR"
  spawn "$FRONT_LOG" npm run dev -- --host
  for _ in $(seq 1 60); do front_up && break; sleep 0.5; done
}

# ---- cloudflare tunnel -----------------------------------------------------
ensure_cloudflared(){
  # Presence on PATH is not enough — a wrong-platform binary (e.g. a Linux ELF
  # left by an earlier run on a Mac) satisfies `command -v` but dies with
  # "cannot execute binary file". Verify it actually runs, and evict it if not.
  if command -v cloudflared >/dev/null 2>&1; then
    cloudflared --version >/dev/null 2>&1 && return 0
    local stale; stale="$(command -v cloudflared)"
    echo "Removing unusable cloudflared at $stale (wrong platform?)"
    rm -f "$stale" 2>/dev/null || sudo rm -f "$stale" 2>/dev/null
    hash -r 2>/dev/null || true
  fi
  if [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      echo "Installing cloudflared (brew)…"
      brew install cloudflared >/dev/null 2>&1 && command -v cloudflared >/dev/null 2>&1 && return 0
    fi
    local a; case "$ARCH" in arm64) a=arm64 ;; *) a=amd64 ;; esac
    echo "Installing cloudflared (darwin-$a)…"
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-$a.tgz" \
      -o /tmp/cf.tgz && tar -xzf /tmp/cf.tgz -C /tmp || { echo "ERROR: cloudflared download failed"; return 1; }
    chmod +x /tmp/cloudflared
    mkdir -p "$HOME/.local/bin" && mv /tmp/cloudflared "$HOME/.local/bin/cloudflared"
    export PATH="$HOME/.local/bin:$PATH"
  else
    local a; case "$ARCH" in aarch64|arm64) a=arm64 ;; *) a=amd64 ;; esac
    echo "Installing cloudflared (linux-$a)…"
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$a" \
      -o /tmp/cloudflared && chmod +x /tmp/cloudflared || { echo "ERROR: cloudflared download failed"; return 1; }
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null || {
      mkdir -p "$HOME/.local/bin"; mv /tmp/cloudflared "$HOME/.local/bin/cloudflared"
      export PATH="$HOME/.local/bin:$PATH"; }
  fi
  command -v cloudflared >/dev/null 2>&1
}

start_tunnel(){
  ensure_cloudflared || return 1
  local p; p="$(tunnel_pids)"
  [ -n "$p" ] && { echo "Stopping cloudflared -> $(echo "$p" | tr '\n' ' ')"; echo "$p" | xargs kill -9 2>/dev/null; sleep 1; }
  : >"$TUN_LOG"
  echo "Starting Cloudflare tunnel -> http://localhost:$FRONT_PORT"
  # --protocol http2 (TCP 443) instead of the default QUIC (UDP 7844). Many
  # networks — including this one — block outbound UDP 7844, which makes the
  # tunnel flap: curl gets lucky between reconnects, but a browser loading
  # dozens of module requests lands on dead connections and renders a blank
  # page. HTTP/2 costs a little throughput and is far more reliable.
  spawn "$TUN_LOG" cloudflared tunnel --url "http://localhost:$FRONT_PORT" \
    --protocol "${CLOUDFLARED_PROTOCOL:-http2}" --no-autoupdate
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
    p="$(tunnel_pids)"; [ -n "$p" ] && { echo "Stopping cloudflared -> $(echo "$p" | tr '\n' ' ')"; echo "$p" | xargs kill -9 2>/dev/null; }
    echo "----- stopped frontend + tunnel -----"; status; exit 0 ;;
  back)   start_backend ;;
  front)  start_frontend ;;
  tunnel) start_tunnel ;;
  all)    start_backend; start_frontend; start_tunnel ;;
  *) echo "Usage: restart-servers.sh [all|back|front|tunnel|status|stop]"; exit 2 ;;
esac

echo "----- restart -----"; status
case "$cmd" in
  all)    back_up && front_up || { echo "--- backend log ---"; tail -n 12 "$LOG"; echo "--- frontend log ---"; tail -n 12 "$FRONT_LOG"; exit 1; } ;;
  back)   back_up  || { echo "--- last log lines ---"; tail -n 15 "$LOG"; exit 1; } ;;
  front)  front_up || { echo "--- last log lines ---"; tail -n 15 "$FRONT_LOG"; exit 1; } ;;
  tunnel) [ -n "$(tunnel_url)" ] || { echo "--- last log lines ---"; tail -n 15 "$TUN_LOG"; exit 1; } ;;
esac
exit 0
