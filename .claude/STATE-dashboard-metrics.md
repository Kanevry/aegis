---
schema-version: 1
session-type: feature
session-id: dashboard-metrics-live-2026-04-18-1545
branch: main
issues: []
started_at: 2026-04-18T15:45:00+0200
status: completed
current-wave: 5
total-waves: 5
finished_at: 2026-04-18T15:57:00+0200
session-start-ref: 664403d21886665cda1102596145433d90aa6de9
parallel-sessions:
  - infra-docker-ratelimit (STATE.md)
  - housekeeping-parallel-safe (STATE-housekeeping-parallel-safe.md)
---

## Current Wave

Wave 1 — Discovery (3 parallel, read-only)
- D1: data-model inventory — `aegis_decisions` writers/readers, canonical row shape, per-layer vs per-request
- D2: `/api/agent/run` instrumentation — `HardeningResult` shape, `captureAegisBlock`, `withHardeningSpan` attrs
- D3: dashboard client patterns — existing SWR/polling, shadcn Card usage across sibling pages, empty-state idioms

## Wave History

- Wave 1 (Discovery, 3 parallel Explore agents): complete 15:52
- Wave 2 (Impl-Core, 2 parallel code-implementer agents): complete 15:47 — `src/lib/metrics.ts` (22 tests) + `src/app/api/metrics/route.ts` + `schema.ts` (7 tests)
- Wave 3 (Impl-UI+Wire, 2 parallel agents: ui-developer + code-implementer): complete 15:51 — dashboard rewritten as client poller (5s), `/api/agent/run` surgical 2-line `recordDecision` insertion
- Wave 3 fix: `MetricsResponseSchema` extracted to `schema.ts` because Next.js 16 app-router forbids arbitrary named exports from route files
- Wave 4 (Quality, code-reviewer + live smoke): code-reviewer reports NO BLOCKING issues, 3 IMPROVE items — 1 actioned (defense-in-depth try/catch around `recordDecision` in route.ts with `Sentry.captureException`). Full suite 877/877 green. Live smoke against dev server confirmed `/api/metrics` returns 200 JSON, `/api/agent/run` blocks attack correctly. DB `aegis_decisions` table not present in current Supabase instance → `source: 'unavailable'`. Dashboard sub-copy updated to reveal true state.

## Follow-ups (for the user)

1. **Apply migration 0001 to the active Supabase instance**: `supabase db push` (remote) OR `supabase start` (local). Once `aegis_decisions` exists, the dashboard immediately shows live values on next poll (≤5s).
2. The infra-docker-ratelimit parallel session is bringing up raw Postgres via docker-compose; that does NOT feed Supabase. This session's metrics pipeline requires Supabase specifically (same client everything else in the repo uses). No changes needed once DB schema is in place.
  - D1 found `aegis_decisions` writers diverge cardinality (per-layer vs per-request); no readers exist; no aggregation helpers; service-role client is correct; RLS bypassed
  - D2 confirmed `HardeningResult` shape; insertion point is pre-stream (await); fire-and-forget unsafe due to Next.js handler termination; existing canonical insert in `dispatchers.ts`
  - D3 confirmed no SWR/React Query (plain fetch + setInterval, 15s in Approvals); no formatting utils; shadcn Card skeleton to keep; Skeleton component exists; no Playwright (Vitest only)

## Deviations

- **Cardinality**: `/api/agent/run` writes 1 row per request (layer=primary blocked for blocked, layer='B5' for ok). Diverges from existing per-layer convention in `logAegisDecisionForApproval` because no approval_id/message_id exists for anonymous testbed fires. Details payload carries full `blocked_layers[]` array for future per-layer aggregation if needed.
- **No in-memory fallback**: env missing → snapshot returns `source: 'unavailable'` with zeros. Dashboard shows `—`. No silent double-store.
- **Polling 5s**: deliberately faster than Approvals' 15s for demo responsiveness.

## Scope

**Allowed paths (write):**
- `src/lib/metrics.ts` + `src/lib/metrics.test.ts` (new)
- `src/app/api/metrics/route.ts` + `src/app/api/metrics/route.test.ts` (new)
- `src/app/dashboard/page.tsx` (modify — rewrite as client component)
- `src/app/api/agent/run/route.ts` (modify — surgical: single-call recordDecision insertion)
- `tests/e2e/dashboard-metrics.spec.ts` (new, if Playwright present)
- `.claude/STATE-dashboard-metrics.md` (this file)

**Blocked paths (owned by parallel sessions):**
- `docker-compose*`, `Dockerfile*` (infra-docker session #36)
- `supabase/migrations/**` (both parallel sessions; no new migration this session)
- `src/lib/rate-limit.ts`, `src/lib/pgboss-client.ts` (infra-docker #60)
- `.claude/STATE.md`, `.claude/STATE-housekeeping-parallel-safe.md` (other sessions)
- `.github/workflows/**` (housekeeping session)
- `docs/video-script.md` (possibly in-flight)

## Guardrails

- Respect parallel ownership — guard copied from STATE-housekeeping-parallel-safe.md conventions
- No git stash. No destructive git ops. No migration creation.
- `src/app/api/agent/run/route.ts` edit MUST be minimal (surgical re-apply if parallel session lands Sentry changes there first)
- `aegis_decisions` is read-only for the metrics endpoint; writes go through the existing `recordDecision` helper we add in `metrics.ts` (not new SQL).
