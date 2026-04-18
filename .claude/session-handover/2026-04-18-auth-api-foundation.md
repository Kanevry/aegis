---
date: 2026-04-18
session: auth-api-foundation
session_type: deep
status: completed
issues: [58, 59, 62, 63, 64]
parallel-sessions: [codex phase-1-closeout, codex phase-3-sandbox]
---

# Auth + API Foundation — Session Handover

## Scope delivered (5/5 issues)

- **#58 — Passphrase auth route + login page** (commits `e7d5483`, `a92923b`)
  - `src/lib/auth.ts` — `hashPassphrase`, `verifyPassphrase`, `issueSession`, `verifySession`, `SESSION_COOKIE_NAME`. Uses `node:crypto.scrypt` (N=16384, r=8, p=1) + `timingSafeEqual` — **NO bcryptjs** (see deviation below).
  - `src/app/api/auth/login/route.ts`, `logout/route.ts`, `me/route.ts` — POST login, POST logout (204), GET me. Envelope responses. Sentry `aegis.auth.failed_login` capture with no PII.
  - `src/app/login/page.tsx` — shadcn card, shake-on-401, next-param redirect, sonner toast.
  - `scripts/auth-hash.ts` — CLI: `node --experimental-strip-types scripts/auth-hash.ts "passphrase"` or `pnpm exec tsx`.
  - Rate-limit hook NOT wired (belongs to #60, out of session scope) — placeholder `// TODO #60` in login route.

- **#59 — Edge middleware cookie-gate** (commit `8c122d4`)
  - `src/middleware.ts` — Edge-compatible WebCrypto HMAC verify mirroring the auth-lib cookie format exactly.
  - Matcher: `/dashboard/chat`, `/dashboard/approvals`, `/api/chat`, `/api/approvals`, `/api/sessions`, `/api/auth/me`.
  - Bypass list: `/api/webhook/openclaw`, `/api/auth/login|logout`, `/login`, `/`, `/dashboard` (landing), `/dashboard/testbed`, `/api/agent/run`, `/api/testbed/fire`, `/api/health`, `/api/ready`.
  - API paths → 401 envelope with `request_id`. Page paths → 307 redirect to `/login?next=<path>`.
  - `x-request-id` regex-guarded (`^[a-zA-Z0-9-]{8,64}$`), generated via `crypto.randomUUID()` if missing/invalid.

- **#62 — API response envelope** (commit `e7d5483`)
  - `packages/types/src/api.ts` — `ApiResponse<T>` discriminated union, `API_ERROR_CODES` array + type, re-exported from `@aegis/types`.
  - `src/lib/api.ts` — `apiOk<T>(data, init?)`, `apiError({status, error, message?, issues?, headers?})`, `throwIfError<T>(res)`.
  - Reads `request_id` via `getRequestId()` from request-context (#63), fallback `"unknown"`.

- **#63 — Request-id + trace-id propagation** (commit `e7d5483`)
  - `src/lib/request-context.ts` — AsyncLocalStorage store, `runWithRequestContext(ctx, fn)`, `getRequestId()`, `getRequestContext()`.
  - `packages/openclaw-client/src/client.ts` — new optional `forwardHeaders?: () => Record<string, string>` callback. Allow-list: `x-aegis-request-id`, `sentry-trace`, `baggage`. Existing header values preserved (no clobber). 19 tests including security allow-list + no-clobber assertions.

- **#64 — Body-size cap** (commit `8c122d4`)
  - `next.config.ts` — `experimental.serverActions.bodySizeLimit: '1mb'`.
  - Per-field caps enforced via Zod schemas on new routes (e.g., login passphrase `z.string().min(8).max(200)`).
  - Per-route custom body-size gates deferred (app-router gateway is per-request stream-read; any future chat/approvals route that accepts large payloads should add its own `await req.text()` length guard).

## Test coverage added

- `src/lib/auth.test.ts` — 24 tests (hash+verify round-trip, tamper, expire, wrong secret, malformed cookie)
- `src/lib/api.test.ts` — 21 tests (envelope shapes, request-id injection, issues surfacing, throwIfError)
- `src/lib/request-context.test.ts` — 8 tests (isolation, concurrent async boundaries)
- `src/middleware.test.ts` — 24 tests (cookie paths, matcher, x-request-id regex, env fallback)
- `src/app/api/auth/login/route.test.ts` — 8 tests
- `src/app/api/auth/logout/route.test.ts` — 3 tests
- `src/app/api/auth/me/route.test.ts` — 6 tests
- `packages/openclaw-client/src/client.test.ts` — 19 tests (forwardHeaders allow-list, no-clobber, error resilience)

**113 new tests.** Full repo: 433 tests across 21 files, all green. `tsgo --noEmit` clean. Lint clean on all session-touched files (6 pre-existing errors in Codex's `scripts/*.mjs` — out of scope).

## Deviations

- **#58 swap bcryptjs → node:crypto.scrypt** — driven by parallel Codex session holding `package.json` + `pnpm-lock.yaml` uncommitted (adding `@aegis/sandbox` workspace dep). Adding a bcryptjs dep via `git add package.json` would have clobbered their uncommitted lines. scrypt satisfies all acceptance criteria (constant-time compare, parametrized cost, salt randomness). If the team later wants bcryptjs, the swap is a drop-in: replace `hashPassphrase` / `verifyPassphrase` internals, keep the external string format the same.
- **Isolation: none** (overriding `auto`) — uses the proven parallel-coexistence recipe (learning confidence 0.6). Each commit: targeted `git add <specific files>`, `git commit`, `git fetch origin main && git rebase --autostash origin/main && git push`. Zero collisions across 4 commits while Codex session was actively editing the working tree.
- **W4 scope overlap with parallel Codex** — at 13:40:49 Codex committed `b50aa17` with auth + middleware + client tests (same spec). My W4 agents landed their additions on top (middleware tests 16→24, client tests 17→19). Functionally complementary, no conflicts.

## Parallel-session events during this session

Codex/other pushed 2 commits into my session window:
- `ac7c72f` — Phase-3 sandbox PoC (`packages/sandbox`, `src/app/api/sandbox`, `src/app/dashboard/sandbox`)
- `b50aa17` — auth-api test scaffold (written independently; my agents layered additions)

Both were absorbed cleanly via `git rebase --autostash` at commit time.

## Outstanding / follow-ups

- **#60 rate-limit** — referenced as `// TODO #60` in `src/app/api/auth/login/route.ts`. Login is currently unthrottled.
- **#66 sidebar nav fix** — still open, needed before `/dashboard/chat` demo works end-to-end.
- **Docker local stack** — not exercised this session (pure Next.js code). `docker/` + `scripts/docker-openclaw-*.mjs` are ready when approval flow lands.
- **E2E Playwright** — `#76` still open; our middleware redirect path is a natural first scenario.
- **Production verification** — login flow only typecheck-verified; no deployed smoke-test. Needs Vercel env vars `AEGIS_SESSION_SECRET` (32+ hex chars) + `AEGIS_SESSION_PASSPHRASE_HASH` (scrypt format from `scripts/auth-hash.ts`).

## Commits

```
a92923b fix(login): tighten router.push cast — use Parameters<typeof> instead of any
8c122d4 feat(api): edge middleware cookie-gate + body-limit + unit tests (closes #59 #64)
e7d5483 feat(api): request-id context, response envelope, passphrase auth (closes #62 #63 partial #58)
```

Plus 2 parallel-Codex commits absorbed during session:
```
b50aa17 test(auth-api): unit + integration tests for auth routes, middleware, openclaw forwardHeaders
ac7c72f feat(sandbox): B6 microVM execution layer PoC (Gondolin)
```
