---
schema-version: 1
session-type: feature
session-id: phase2-closure-2026-04-18-1425
branch: main
issues: [40, 43, 46, 47, 51, 52, 53, 54]
started_at: 2026-04-18T14:25:00+0200
status: active
current-wave: 1
total-waves: 5
session-start-ref: 8641105adf6edb470fddd422a8535a37f66ea537
parallel-sessions:
  - id: approval-intake-2026-04-18-1353
    status: active
    wave: 4/5
    surface:
      - src/lib/{approvals,supabase,aegis-attrs,pgboss-client}.ts
      - src/app/api/webhook/openclaw/{route,schema,span-attrs,dispatchers}.ts
      - apps/worker/**
      - packages/types/src/approvals.ts
      - supabase/migrations/0003_*
  - id: unknown-codex-or-other
    status: unknown
    surface:
      - README.md
      - src/app/api/agent/run/route.ts
      - src/lib/compare-service.ts
bootstrap-gate: bypassed-per-coexistence-policy
note: |
  Bootstrap.lock missing — bypassed because parallel sessions on main also
  bypass it (etablierte Coexistence-Policy). User explicitly directed work
  to proceed. Origin/main is 4 commits ahead (gitleaks/semgrep/docs/env-fix);
  rebase deferred until dirty-tree clears.
---

## Current Wave

Wave 1 — Inline Discovery + Spec Writing

## Scope (Sub-Projekt A — OpenClaw-Chat-Backbone, disjoint files only)

| Issue | Title | Files (NEW only) |
|---|---|---|
| #40 | `/api/chat/stream` AI SDK v6 + B1-B5 + OpenClaw passthrough | src/app/api/chat/stream/route.ts, src/lib/chat-pipeline.ts, packages/types/src/chat.ts |
| #43 | Session management CRUD + auto-title + 7d retention | src/app/api/sessions/{route.ts, [id]/route.ts}, src/lib/sessions.ts, packages/types/src/sessions.ts |
| #46 | POST /api/approvals/[id]/decide auth-gated decide endpoint | src/app/api/approvals/[id]/decide/route.ts (imports from src/lib/approvals.ts read-only) |
| #47 | OpenClaw resolve-approval wiring + retry policy | src/lib/openclaw-resolver.ts |
| #51 | Rejection-message flow — structured reason for agent | src/lib/rejection-message.ts, packages/types/src/rejection.ts |
| #52 | @aegis/sentry-integration package — real AegisSentryIntegration | packages/sentry-integration/** |
| #53 | aegis.approval.* span attributes catalog (deferred — parallel owns aegis-attrs.ts) | DEFERRED |
| #54 | captureException fingerprint helper for approval-deny | src/lib/sentry-fingerprints.ts |

## Wave Plan

| Wave | Focus | Agents | Files |
|---|---|---|---|
| W1 | Inline coordinator: rebase prep, spec doc, scope manifest | 0 | docs/superpowers/specs/* |
| W2 | Sub-Projekt A backend core (4 parallel) | 4 | chat/stream, sessions, decide, rejection |
| W3 | Sub-Projekt A polish + Sentry foundations (3 parallel) | 3 | openclaw-resolver, sentry-integration, fingerprint |
| W4 | Quality (typecheck, tests, lint) | 2 | tests for new endpoints |
| W5 | Finalization: commit each atomic, push, issue handover comments for B/C/D | 0 | issue updates |

## Deferrals (handover to follow-up sessions via issue comments)

- Sub-Projekt B (UI): #41, #42, #48, #49, #66, #50
- Sub-Projekt C (Sentry rest): #53, #55, #56, #57
- Sub-Projekt D (Tier+Loop capstone): #67, #68, #69, #70 + 3 NEW issues to seed
- All deferrals get GitHub issue comments documenting: dependencies satisfied, what's pending, next step

## Wave History

(none yet — Wave 1 in progress)

## Deviations

(none yet)
