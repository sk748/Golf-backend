# Working Agreement

## Autonomy level
Work autonomously through the planned phases in `CLAUDE.md`. Don't ask permission for routine implementation work. Show me a summary at the end of each phase, not before. The one standing exception: **per-role page/UX decisions** — pause and show me the plan for a role's dashboard before building it out (see "Pause and ask first").

## Auto-proceed without asking
- Creating, editing, deleting files inside this repo
- Running the dev server, type checker, linter, formatter, and `vite build`
- Installing dependencies already listed in `package.json` (`npm ci`)
- Refactoring, renaming, restructuring within `src/`
- Writing or updating documentation and `PROGRESS.md`
- Committing to feature branches (never `main` directly)
- Implementing items from the current phase's task list in `CLAUDE.md`
- Reading any file in the repo to audit it

## Pause and ask first
- **The design/UX of a role's page or dashboard** — show the layout + which queries/widgets before building
- Adding a new npm dependency not already discussed
- Anything that assumes an API endpoint, field, or response shape **not documented in `CLAUDE.md`** (the backend contract is fixed and owned by someone else — confirm before building against an assumed shape)
- Touching `src/lib/api.ts`, `src/types/api.ts`, the auth flow, or the role guards once they're stable
- Changing how tokens are stored or how 401 is handled
- Deleting files outside the working directory
- Anything that costs money

## Hard stop — surface immediately, do NOT proceed
- Any file matching known IOC patterns (`router_init.js` or `setup.mjs` at a `node_modules/*` package root; a `gh-token-monitor` process or file)
- Outbound references in any installed package to unknown remote hosts / suspicious domains
- Needing to bypass `ignore-scripts` or modify `.npmrc` security settings
- Anything requiring credential rotation
- Force-pushing or rewriting git history
- Modifying files outside this repo (`~/.ssh`, `~/.aws`, `~/.config`, etc.)
- Running `curl`/`wget` piped to a shell, or executing downloaded scripts
- Printing the contents of any secrets/tokens (paths only)
- Committing a `.env` or any real secret

## Working style
- Plan the phase, then execute. Don't narrate every file edit.
- Always work on feature branches, never directly on `main`.
- Commit logical units with clear messages.
- Build every screen with real API data or a real empty state — **never mock data**.
- All server data flows through TanStack Query; all requests through `src/lib/api.ts`.
- At the end of each phase: a short summary of what changed, what's next, and any decisions I should know about.
- If you're unsure whether something is "auto-proceed" or "ask first," ask. One extra question beats one bad decision.
- Cite specific file paths (and line numbers in findings) so I can verify.
