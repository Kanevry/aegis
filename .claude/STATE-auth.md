---
schema-version: 1
session-type: feature
session-id: auth-api-foundation-2026-04-18
branch: main
issues: [58, 59, 62, 63, 64]
started_at: 2026-04-18T14:00:00+0200
status: completed
current-wave: 5
total-waves: 5
session-start-ref: a1be548dc6e73adba8d885bb61079c62320cca34
completed_at: 2026-04-18T14:45:00+0200
final-commit: b50aa17
---

## Scope

Auth + API foundation (Phase 2 prerequisite).

- **#58** (critical) `/api/auth` passphrase login → HMAC-signed httpOnly cookie (7d)
- **#59** (critical) `middleware.ts` — cookie gate on chat/approvals/api + webhook HMAC bypass + request-id
- **#62** API response envelope `{ ok, data, error, issues, request_id }`
- **#63** request-id + trace-id propagation (middleware → Sentry → OpenClaw → pg-boss)
- **#64** body-size (1 MB) + per-field input-length caps

## File Surface (disjoint from parallel sessions)

- `src/app/api/auth/**` (new)
- `src/middleware.ts` (new)
- `src/lib/api/**` (new)
- `src/lib/http/**` (new, if needed for request-id util)

## Coexistence Rules

- Parallel sessions hold uncommitted: `packages/sandbox/**`, `src/app/api/sandbox/**`, `src/app/dashboard/sandbox/**`, `src/components/dashboard/sandbox-page-client.tsx`, `src/app/dashboard/layout.tsx`, `package.json`, `pnpm-lock.yaml`, `packages/hardening/**`, `docs/**`, `README.md`, `eslint.config.mjs`, `scripts/**`.
- **Do NOT touch any of the above.**
- Local `main` is behind `origin/main` by 1 commit (cf1d021 docker/openclaw) — deferred rebase due to `package.json` collision with parallel uncommitted work. Rebase window: when parallel session commits or at push-time.
- Commits use `git add <explicit paths>` only — never `-A` or `.`.
- Focused quality gates (scoped to my file surface) during Wave 5; full-repo gate deferred until parallel sessions push.

## Wave Plan (handed off to session-plan)

Decomposition in progress — see session-plan output.

## Wave History

### Wave 1 — Discovery (inline coordinator, 14:00)

Audited file surface. **Major finding:** A prior uncommitted session scaffolded ~80% of the scope as untracked files:
- `packages/types/src/api.ts` — envelope types ✅
- `packages/types/src/index.ts` — exports api module ✅
- `packages/openclaw-client/src/client.ts` — `forwardHeaders` callback with allowlist `[x-aegis-request-id, sentry-trace, baggage]` ✅
- `src/lib/api.ts` — apiOk/apiError/throwIfError helpers ✅
- `src/lib/auth.ts` — scrypt passphrase + HMAC session (verifyPassphrase/hashPassphrase/issueSession/verifySession, SESSION_COOKIE_NAME) ✅
- `src/lib/request-context.ts` — AsyncLocalStorage with `{ requestId, userId?, traceParent?, baggage? }` ✅
- `src/app/login/page.tsx` — login UI ✅
- `src/app/api/auth/login/route.ts` + logout + me ✅
- `scripts/auth-hash.ts` — CLI hash generator ✅

**Deviation from issue spec (#58):** Uses Node stdlib `scryptSync` instead of `bcrypt` to avoid `package.json` edit (held by parallel sandbox session). scrypt is OWASP-recommended for new apps; constant-time via `timingSafeEqual`. Hash format: `scrypt$N=16384,r=8,p=1$<salt_hex>$<key_hex>`.

**Verdict:** Adopt the scaffolding — quality is high, matches design. Skip redundant W2/W3 agents.

### Wave 2 — Impl-Core (SKIPPED, scaffolding adopted)

All primitives satisfied by W1 adoption. No agents dispatched.

### Wave 3 — residual Impl-Core + parallel primitives tests (14:15)

Dispatched 3 parallel agents:
- **code-implementer** → `src/middleware.ts` + `next.config.ts` body-size limit. Agent delivered an Edge-runtime-compatible implementation using WebCrypto (`crypto.subtle.verify`) instead of the Node-runtime directive originally spec'd — superior outcome (no Node runtime needed, faster cold-start). Also added x-request-id header-injection defence (`/^[a-zA-Z0-9-]{8,64}$/` validation).
- **test-writer** → `src/lib/auth.test.ts` (24 tests, all passing) — scrypt roundtrip, HMAC session tamper, null/undefined/expired/wrong-secret paths.
- **test-writer** → `src/lib/api.test.ts` (21 tests) + `src/lib/request-context.test.ts` (9 tests) — envelope helpers, AsyncLocalStorage, throwIfError props.

### Wave 4 — Quality (14:30)

Dispatched 3 parallel agents:
- **test-writer** → `src/middleware.test.ts` (16 tests) — request-id propagation, cookie gate (API 401 vs page redirect), matcher config assertion, webhook exclusion check.
- **test-writer** → `src/app/api/auth/{login,logout,me}/route.test.ts` (8+2+4 = 14 tests) — full route coverage including 503 on missing env, Sentry tag assertion on 401. Also introduced `vitest.config.ts` at repo root to enable `@/` alias resolution for route tests.
- **test-writer** → `packages/openclaw-client/src/client.test.ts` (17 tests) — forwardHeaders allowlist, mergeHeaders precedence, resolveApproval body shape, listModels response shapes.

**Focused gate:** `pnpm typecheck` → 0 errors ✅. `pnpm lint` → 6 errors in `scripts/docker-openclaw-*.mjs` (inherited from commit cf1d021, out-of-scope for this session — parallel session's code). 1 unused-eslint-disable warning in `src/app/login/page.tsx` (parallel session's file). Tests: 430/430 green.

### Wave 5 — Finalization (14:45)

- Committed 6 files (47 new tests, 1106 insertions) as `b50aa17 test(auth-api): unit + integration tests for auth routes, middleware, openclaw forwardHeaders`.
- Push: `ac7c72f..b50aa17 main -> main` ✅
- Posted coverage comments on all 5 issues (#58, #59, #62, #63, #64).
- State reconciled: commits `e7d5483` + `8c122d4` (authored by parallel session "Kanevry") swept my agents' mid-wave output into their commits; my net-new contribution is the residual 6 files.

## Deviations

- [2026-04-18T14:00] Using `.claude/STATE-auth.md` instead of `.claude/STATE.md` to preserve the completed 13:30 session's record from being overwritten. Same `.claude/` platform dir as that session; distinct filename.
- [2026-04-18T14:00] Local `main` intentionally held at `a1be548` until parallel sandbox session commits — avoids rebase conflict on `package.json`.
- [2026-04-18T14:05] **Scaffold adoption**: Prior uncommitted session produced production-quality scaffolding matching my W2 scope exactly. Adopted in place; dispatched only residual (middleware, body-cap, tests) for W3+W4 instead of re-implementing.
- [2026-04-18T14:25] **Non-collaborative parallel session**: `.orchestrator/metrics/sessions.jsonl` shows commits `e7d5483`+`8c122d4` landed on main during my wave execution, swept my agents' output (middleware.ts, next.config.ts, auth.test.ts, api.test.ts, request-context.test.ts) into the parallel session's commits. Local HEAD fast-forwarded to ac7c72f. Not a rebase conflict — parallel session's `git add` appears to have included my agents' in-progress files from the shared working tree.
- [2026-04-18T14:30] **bcrypt → scrypt deviation**: Issue #58 spec said "bcrypt compare". Adopted scaffolding uses `node:crypto` scryptSync instead, avoiding a `package.json` edit that's held by parallel sandbox session. scrypt is OWASP-recommended and constant-time via `timingSafeEqual`.
- [2026-04-18T14:35] **Edge-runtime deviation**: Middleware agent chose WebCrypto `crypto.subtle.verify` over `runtime = 'nodejs'` directive; superior for Edge perf. Documented in middleware source.
- [2026-04-18T14:40] Full-repo `pnpm lint` carries 6 pre-existing errors in `scripts/docker-openclaw-*.mjs` (from commit cf1d021) + 1 warning in `src/app/login/page.tsx` (from e7d5483). Not my files; not fixed. Recorded for follow-up triage.
- [2026-04-18T14:45] Issues #58, #63, #64 still OPEN on GitHub despite `closes` triggers in commit messages — GitHub parser appears to pick only the first issue ref per trigger phrase, or rebase moved the triggers. Posted manual coverage comments on each.
