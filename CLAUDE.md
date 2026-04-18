# CLAUDE.md — Ægis

Guidance for Claude Code and Codex CLI working on this repository.

## Quick Facts

- **Project:** Ægis — Observable Agentic Hardening Middleware
- **Stack:** Next.js 16 · React 19 · Tailwind 4 · shadcn/ui · OpenAI GPT-4/5 via Vercel AI SDK · Anthropic Claude (A/B) · `@sentry/nextjs` v8
- **Package Manager:** pnpm (workspace)
- **Event:** Codex Community Hackathon Vienna — 2026-04-18
- **Build Window:** 11:00–17:00 CEST (6h), Submission Lock 17:30

## Mission

Ship a production-grade prototype in 6 hours that maximises the Sentry observability angle. Every LLM call emits a `gen_ai.*` span; every hardening block emits a `Sentry.captureException` with a stable fingerprint. Seer analyses each attack pattern like a production bug.

## Agent Rules

### 1. Verify Before Claiming Done

```bash
pnpm typecheck    # 0 errors mandatory
pnpm lint         # 0 errors mandatory
pnpm test         # all tests passing
```

Evidence before assertions.

### 2. Hackathon Mode

Time is the hardest constraint. Ship > polish. A working demo trumps perfect architecture. But: **no shortcuts on Sentry integration** — that is the differentiator.

### 3. Complete Implementations

No `TODO`, `FIXME`, or `HACK` without a linked issue. No commented-out code.

### 4. Clean Public Posture

This repo is public. Do not reference private infrastructure, internal project names, or personal credentials in committed files. Secrets live in `.env.local` (gitignored) — never echo or log them.

## Commands

```bash
pnpm dev              # Next.js dev (turbopack)
pnpm build            # Production build
pnpm typecheck        # tsgo --noEmit
pnpm lint             # ESLint 9
pnpm format           # Prettier
pnpm test             # Vitest
```

## Architecture

### Monorepo (pnpm workspace)

```
apps/
  (root is the Next.js app during hackathon; no apps/web move yet)
packages/
  hardening/          — @aegis/hardening (5-layer defense)
  types/              — @aegis/types (shared types + Zod schemas)
src/
  app/                — Next.js App Router pages + API routes
  instrumentation.ts  — Sentry server init (vercelAIIntegration)
  instrumentation-client.ts — Sentry browser init (Replay)
  sanitizers.ts       — shared input sanitizers
```

### 5-Layer Defense

| Layer | Concern | Module |
|-------|---------|--------|
| B1 | Path traversal | `paths.ts` |
| B2 | PII exposure | `pii.ts` |
| B3 | Hallucinated refs | `refs.ts` |
| B4 | Prompt injection | `security.ts` |
| B5 | Secret exfil | `redaction.ts` |

Composable via `createHardening({ flags })` — returns `{ allowed, safetyScore, blockedLayers, redactedPrompt, … }`.

## Conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, …). English only.
- **Branches:** `feat/<track>/<short>`, e.g. `feat/backend/attack-library`.
- **Files:** kebab-case for modules, PascalCase for React components.
- **Testing:** Co-locate `*.test.ts` next to source. Mock OpenAI/Anthropic at SDK boundary.
- **Errors:** Never expose raw error messages to clients. Sentry captures server-side.
- **Secrets:** `.env.local` only. Never commit.

## Sentry Rules (Sponsor-Critical)

- Every LLM call wrapped via `vercelAIIntegration()` auto-instrumentation → `gen_ai.*` spans.
- Add `aegis.safety_score`, `aegis.blocked_layers`, `aegis.outcome` as span attributes.
- On block: `Sentry.captureException(new AegisBlockedException(event), { fingerprint: ['aegis-block', layer, pattern_id] })`.
- `beforeSend` hook redacts PII and secrets before shipping.

## Team (4 people, hackathon day)

| Role | Responsibility |
|------|----------------|
| **Backend + Hardening** | `/api/agent/run`, wiring hardening into the API, 10-attack library seed |
| **Frontend + UI** | Dashboard, Testbed, shadcn components, Flow-Visualisation, Comparison mode |
| **Sentry + DevOps** | Custom AegisSentryIntegration, fingerprinting, `beforeSend` redaction, Vercel deploy |
| **Eval + Video + Pitch** | Pass/Fail matrix, demo video, submission text, live pitch |

Split driven by the two jury-relevant tracks: **Agentic Coding** (we build with Codex CLI) and **Building Evals** (attack library + safety score matrix).

## Wave Plan (H1–H6)

| Slot | Wave | Acceptance |
|------|------|------------|
| H1 11:00–12:00 | Hardening wiring + `/api/agent/run` + first Sentry span | `pnpm typecheck` clean, 1 attack fires end-to-end |
| H2 12:00–13:00 | `vercelAIIntegration` + custom `aegis.*` attributes + fingerprint | Sentry issue appears on block |
| H3 13:00–14:00 | Testbed UI + 10 attack prompts + live event log | 1-click attack flow |
| H4 14:00–15:00 | Dashboard + Flow viz + Comparison mode | Pass/Fail matrix renders |
| H5 15:00–16:00 | Polish + PDF/eval export + Phase-2 preview mock | Submission text + screenshots |
| H6 16:00–17:00 | Vercel deploy + demo video + pitch prep | Live URL returns 200, video ≤ 90s |

**16:00 Circuit-Breaker:** flip `AEGIS_DEMO_MODE=true` → scripted mocks if anything breaks.

## License

MIT.
