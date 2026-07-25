---
description: Pre-deploy security review of the Karen Golf codebase — fast in-repo review first, then the CodeMender agent (billable) for a deep pass.
argument-hint: (none = preflight) | scan | diff | report | full
---

Run the security review the same way every time, in two layers. Layer 1 is free
and immediate; layer 2 costs Vertex AI tokens and needs network + auth.

Argument given: **$ARGUMENTS**

## Layer 1 — in-repo review (always run this first, free)

Before spending anything on CodeMender, review the pending changes yourself
against this project's actual risk surface:

- **Role scoping** — every route that returns junior, round, session, evaluation
  or attendance data must scope to the caller's role. A parent must never reach
  another family's child. Check `backend/app/*/controllers.py` and the guards in
  `backend/app/utils/decorators.py`.
- **Auth** — JWT identity is the user's *email*; there is no refresh endpoint.
  Check `backend/app/auth/controllers.py` for self-update paths that let a user
  change their own `role`.
- **Evaluation sign-off** — committee counter-sign must be impossible while
  `coach_signed` is false, enforced server-side, not just disabled in the UI.
- **Registration** — public registration creates `player`/`parent` only.
- **Secrets** — nothing real in `.env.production.example`, `docker-compose.yml`,
  `Caddyfile`, or `DEPLOY.md`; the live `.env` stays gitignored.
- **Production config** — debug off, swagger off, rate limits enforced, CORS
  pinned to `FRONTEND_URL` (`backend/config.py` → `ProductionConfig`).

The built-in `/security-review` skill covers the generic classes (injection,
XSS, SSRF, deserialization). Run it too — it's free.

## Layer 2 — CodeMender agent (billable)

Only after layer 1, and only on a **clean git tree** so any applied patch is
revertible.

- Preflight, no API calls: `bash .claude/scripts/security-scan.sh preflight`
- Scan source dirs: `bash .claude/scripts/security-scan.sh scan`
- Scan one area: `bash .claude/scripts/security-scan.sh scan backend/app/auth`
- Only what changed vs main: `bash .claude/scripts/security-scan.sh diff`
- Findings from last session: `bash .claude/scripts/security-scan.sh report`

Map free text: "check / preflight / am I set up" → `preflight`; "scan / full /
everything" → `scan`; "what changed / before deploy / this branch" → `diff`.

`diff` is the right default before a deploy — it scans only the files this
branch touched, which is cheaper and higher signal than a whole-repo sweep.

### Rules for the agent pass

- **Never pass `-y` or `--auto-apply`.** `cm` edits files and runs shell
  commands; the confirmation prompts are the safety mechanism. Same for
  `--unrestricted`, which drops the filesystem sandbox — don't use it.
- **`cm find` is a classifier and produces false positives.** Triage with
  `cm verify <finding-id>` before believing a finding, and never open a fix PR
  straight off a raw `find` result.
- **Report findings, don't silently patch.** Summarise severity, file, and the
  concrete failure path. Let Sam decide what gets fixed.
- **Model cost:** defaults to `gemini-3.5-flash` (cheap tier). For a release
  candidate, override with `CM_MODEL=gemini-3-flash-preview` for a deeper pass.

### Client-data caveat

CodeMender transmits source snippets to Google Cloud for analysis — including
this repo's auth and role-scoping code, which is Karen Country Club's. It's
covered by Google's Pre-GA terms. If a data-handling agreement with the club is
in play, that governs, not convenience.

## When to run this

- Before any deploy of an update or patch (`diff` mode).
- At the end of a phase, before the phase is called done (`scan` mode).
- After any change to auth, `RequireRole`, the API client, or a new data screen
  — alongside the `api-contract-auditor` subagent, which covers contract and
  role-access rules that CodeMender knows nothing about.
