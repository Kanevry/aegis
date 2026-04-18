---
date: 2026-04-18
session: setup-docs-2026-04-18-1415
session-type: housekeeping
status: completed
issues: []
parallel-session: true (main — 4+ concurrent sessions across the day)
---

## Scope

Documentation housekeeping after an ad-hoc setup repair earlier in the conversation:

- `ANTHROPIC_API_KEY` was invalid (401 `invalid x-api-key`) — rotated
- Default Anthropic model migrated from `claude-3-5-sonnet-latest` to `claude-haiku-4-5-20251001`
- The Sentry UI was empty because the `SENTRY_AUTH_TOKEN` belonged to org `goetzendorfer` while the DSN pointed to a different org (`bernhard-goetzendorfer-eu`) — created a fresh `goetzendorfer/aegis` project via REST and swapped DSN + `SENTRY_ORG` + `SENTRY_PROJECT` together

This session wrote docs + code changes + learnings to make the fix reproducible.

## Delivered

- `README.md` — replaced minimal Quickstart with full **Setup** section: prerequisites, env-var table, Sentry project provisioning via REST, DSN org check, dev-server-restart note, secret rotation rules. Stack line updated to `gpt-4o-mini` + `claude-haiku-4-5-20251001` + `vercelAIIntegration()`.
- `.env.example` — aligned to the actual `.env.local` schema: added Gemini, OpenRouter, AI_Gateway, Upstash, rate-limits, Brave / SerpApi / Notion, Vercel token; legacy `ENABLE_*` flags kept as aliases; `SECURITY:` comments on every secret.
- `docs/setup-troubleshooting.md` — new file: "Sentry shows no events" / DSN org-mismatch debug walkthrough, Anthropic key diagnosis, typecheck module-not-found, lint noise isolation, source-map upload errors.
- `docs/architecture.md` — added Model ids table and the rule "when a vendor rotates a model alias, update both route files + README together."
- `src/app/api/agent/run/route.ts` — Anthropic model id → `claude-haiku-4-5-20251001`.
- `src/lib/compare-service.ts` — Anthropic model id → `claude-haiku-4-5-20251001` (both `model:` + `label:` strings, 2 locations via replace_all).
- `.orchestrator/metrics/learnings.jsonl` — appended two learnings:
  - `sentry-dsn-org-mismatch` (recurring-issue, confidence 0.8)
  - `parallel-session-stash-overwrites-readme` (fragile-file, confidence 0.7)

## Quality gates

- `pnpm typecheck` — 0 errors ✓
- `pnpm lint` — 8 pre-existing errors out of scope (from parallel sessions, `no-console` in `scripts/*.mjs` and one worker file). Documented in troubleshooting doc; not fixed here.
- Full test run skipped: uncommitted apps/worker tests and webhook routes from parallel sessions would taint results. Typecheck is the load-bearing gate for this session's scope.
- Sentry DSN probe via direct `/api/<pid>/store/` curl: HTTP 200, `event_id` accepted — proved ingestion works on the new project before docs were written.
- Anthropic Haiku 4.5 probe via direct `/v1/messages` curl: HTTP 200, returned `"OK"` — proved key + model id before code changes.

## Parallel-session collision notes

- Mid-session, README.md developed merge-conflict markers from an external `git stash pop` (another session's tooling). Current workspace `grep` saw `<<<<<<< Updated upstream` / `>>>>>>> Stashed changes`, but a subsequent `Read` showed markers gone and my Setup section reverted to the older Quickstart. Re-applied the Setup section via a second surgical `Edit` — verified with `grep -c "^## Setup"`.
- `git status` briefly showed all my files STAGED even though I never ran `git add` — confirmed by the `.claude/STATE-phase2-closure.md` untracked file that wasn't there at session start. Another session's `git stash` operation was ongoing in parallel.
- Mitigation that worked: after each `Edit`, verify content with a sentinel `grep -c "<unique-string>"` before moving on. Every Edit this session used a unique string, so I could detect silent revert.

## Not committed, not in scope

- `.claude/STATE-approval.md`, `.claude/STATE-auth.md`, `.claude/STATE-prev-1349.md`, `.claude/STATE-phase2-closure.md`, `.claude/session-handover/2026-04-18-phase2-fundament.md` — all belong to parallel sessions.
- `apps/worker/src/handlers/*.test.ts`, `src/app/api/webhook/openclaw/*.test.ts`, `src/lib/approvals.test.ts`, `apps/worker/vitest.config.ts` — parallel session work, not mine.
- Pre-existing `no-console` lint errors in scripts and worker files — out of scope.

## Resume points

- If the live demo fails Sentry-side, walk through `docs/setup-troubleshooting.md` section 1 — it covers the exact org-mismatch path this session hit.
- Next Anthropic model alias rotation: update both route files + `docs/architecture.md` Model ids table + the `README.md` Stack line together.
- `.env.example` now documents every key in `.env.local`. If new env vars are added, mirror them into `.env.example` with placeholder + `SECURITY:` note where applicable.
- Consider adding a pre-commit hook / CI check that fails when `.env.local` is accidentally staged — the current protection is only `.gitignore`, which an explicit `git add -f` can bypass.
