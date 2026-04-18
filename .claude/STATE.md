---
schema-version: 1
session-type: housekeeping
session-id: setup-docs-2026-04-18-1415
branch: main
issues: []
started_at: 2026-04-18T14:15:00+0200
completed_at: 2026-04-18T14:35:00+0200
status: completed
current-wave: 1
total-waves: 1
session-start-ref: 8641105
---

## Current Wave

Wave 1 — Documentation housekeeping.

Scope: document the ad-hoc setup repair from earlier this conversation (Anthropic key rotation, Haiku 4.5 migration, new Sentry project `goetzendorfer/aegis`, DSN org-mismatch root cause). Goal: reproducible public-repo setup, learning extraction.

## Wave History

- Wave 1 (active): README Setup expansion, `.env.example` refresh, `docs/setup-troubleshooting.md` new, `docs/architecture.md` model-ID note, learning extraction.

## Uncommitted code changes from this session

- `src/app/api/agent/run/route.ts` — model id → `claude-haiku-4-5-20251001`
- `src/lib/compare-service.ts` — model id → `claude-haiku-4-5-20251001` (2× replace_all)
- `.env.local` — key rotation (gitignored, never committed)

## Risks

- Parallel-session collisions on `main` — fetch+rebase before push.
- Pre-existing `pnpm lint` errors (8, no-console) from other sessions — out of scope, document in handover only.
