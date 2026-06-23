---
description: Restart the Karen Golf dev stack (Postgres + Flask backend, Vite frontend, Cloudflare tunnel) consistently and verify each is serving.
argument-hint: (none = all) | back | front | tunnel | status | stop
---

Restart the dev stack the same reliable way every time via the project script.

- Restart everything: `bash .claude/scripts/restart-servers.sh` (default = `all`)
- Backend only: `bash .claude/scripts/restart-servers.sh back`
- Frontend only: `bash .claude/scripts/restart-servers.sh front`
- Cloudflare tunnel only: `bash .claude/scripts/restart-servers.sh tunnel`
- Check only (no changes): `bash .claude/scripts/restart-servers.sh status`
- Stop frontend + tunnel (leave backend up): `bash .claude/scripts/restart-servers.sh stop`

Argument given: **$ARGUMENTS** — map free-text to a subcommand:
"both / front and back / everything / all" → `all`; "backend / api / flask" → `back`;
"frontend / vite / ui" → `front`; "tunnel / cloudflare / public link" → `tunnel`.

What the script does (all pieces fully detached so they survive the tool shell):
- **backend** — starts Postgres if needed, kills stale Flask on :5000, applies
  migrations (`flask db upgrade`), starts ONE Flask with the reloader OFF, blocks
  until `/swagger/` returns 200.
- **frontend** — kills stale Vite on :5173, runs `npm install` if `node_modules`
  is missing, starts `vite --host`, blocks until :5173 returns 200.
- **tunnel** — installs `cloudflared` if missing, kills any stale tunnel, starts a
  Cloudflare quick tunnel to the frontend (:5173 — Vite proxies `/api`, so one URL
  exposes the whole app), and captures the public `https://*.trycloudflare.com` URL.

Run it in the **foreground** — do NOT wrap it in `run_in_background` or launch
`main.py` / `vite` / `cloudflared` yourself.

Report the script's `----- restart -----` block: Postgres up/down, Flask PID and
API 200, Vite PID and Frontend 200, Tunnel PID and the **Public URL**. After a
tunnel start, `curl` the public URL once to confirm it returns 200 end-to-end.
On failure, surface the last log lines the script printed (`/tmp/karen_server.log`,
`/tmp/vite-dev.log`, `/tmp/cloudflared.log`); if it says the venv is missing,
point to the full bootstrap in `.claude/docs/RUNNING.md` §2.

Notes on the tunnel: the quick tunnel URL is **ephemeral** (random, changes each
restart, no auth) and exposes the local dev app publicly — fine for sharing a
preview, not for anything permanent or sensitive.
