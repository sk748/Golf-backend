---
description: Restart the Karen Golf backend (Postgres + Flask) consistently and verify it's serving.
argument-hint: (none) | status
---

Restart the backend the same reliable way every time via the project script.

- Restart: `bash .claude/scripts/restart-servers.sh`
- Check only (no changes): `bash .claude/scripts/restart-servers.sh status`

Argument given: **$ARGUMENTS**

The script starts Postgres if needed, kills any stale Flask, starts a fresh one
**fully detached** (so it survives the tool shell), and blocks until `/swagger/`
returns 200. Run it in the foreground — do NOT wrap it in `run_in_background` or
launch `main.py` yourself.

Report the script's `----- restart -----` block: Postgres up/down, Flask PID(s)
(two PIDs is normal — the debug reloader spawns a child), and whether the API
returned 200. On failure, surface the last log lines the script printed; if it
says the venv is missing, point to the full bootstrap in `.claude/docs/RUNNING.md` §2.
