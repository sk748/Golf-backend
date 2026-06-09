# Claude Code setup for the Karen Golf frontend

This directory holds the project's Claude Code workflow configuration. The
**agents, command, hooks, and skill are committed** and travel with the repo.
The live `settings.json` is **git-ignored** (Claude Code local state), so after
a fresh clone or a rebuilt environment you must restore it from the template.

## Restore after a fresh clone

```bash
cp .claude/settings.example.json .claude/settings.json
chmod +x .claude/hooks/*.sh          # exec bits aren't always preserved
```

Then **restart the Claude Code session** (or run `/hooks`) so the hooks load.
Verify with `/hooks` — you should see the PreToolUse and PostToolUse entries
below. The `run-build` hook needs Node tooling (`npx`, `tsc`) on PATH:
`npm ci` first.

## What's here

| Path | Type | Purpose |
|------|------|---------|
| `agents/api-contract-auditor.md` | Agent (opus, read-only) | Audits a diff/files against the fixed backend contract and the role-based-access rules. Run before any commit touching auth, the api client, role guards, or a new data screen. |
| `agents/build-runner.md` | Agent (sonnet) | Runs tsc + lint + vite build and reports results without flooding the main chat. |
| `commands/new-page.md` | Command `/new-page` | Plan-first → role-guarded → real-data → audit-after workflow for a new page. |
| `hooks/protect-locked-files.sh` | PreToolUse hook | Blocks edits to `CLAUDE.md`, `src/lib/api.ts`, `src/types/api.ts` (locked contract artifacts). |
| `hooks/guard-mock-data.sh` | PreToolUse hook | Blocks hardcoded mock arrays and direct `fetch`/hardcoded backend URLs in `src/` (everything must go through the api client). |
| `hooks/run-build.sh` | PostToolUse hook | Type-checks after edits to `src/*.ts(x)` and reports failures back. |
| `skills/frontend-design/SKILL.md` | Skill | Distinctive, production-grade UI (see Karen-specific direction in `CLAUDE.md`). |
| `settings.example.json` | Template | Source for the git-ignored `settings.json` (wires the hooks above). |

## How this maps to the way you want to work

- **It asks you questions** — `WORKING_AGREEMENT.md` lists what to pause on
  (notably per-role page/UX), and `/new-page` forces a Plan-Mode proposal you
  approve before any code is written.
- **It uses subagents** — `api-contract-auditor` (review) and `build-runner`
  (checks) keep heavy output out of the main thread; `/new-page` invokes them
  automatically after implementation.
- **`CLAUDE.md` stays the source of truth** — a hook physically blocks edits to
  it, so the plan can't drift silently.

## Why settings.json is git-ignored

`.gitignore` should exclude `.claude/settings.json` and
`.claude/settings.local.json` as Claude Code local state. The hook *wiring*
therefore lives in the tracked `settings.example.json`; copy it to
`settings.json` to activate. If the team later wants the hooks on automatically
for everyone, un-ignore and commit `settings.json` directly.

## Local dev docs & restarting the servers

Development docs live under `.claude/docs/`:
- `docs/RUNNING.md` — environment runbook (Postgres + Flask, ports, CORS).
- `docs/WORKING_AGREEMENT.md` — how this project wants Claude to work.
- `docs/PROGRESS.md` — running progress log.

Restart the backend consistently (Postgres + Flask, idempotent, verifies `/swagger/` = 200):
- `bash .claude/scripts/restart-servers.sh`  (or `… status` to just check, changes nothing)
- or the `/restart-servers` slash command.
