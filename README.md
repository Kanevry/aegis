# 🛡 Ægis — Observable Agentic Hardening

**Five-layer defense middleware for OpenAI agents. Every violation becomes a Sentry exception. Seer analyzes it like a production bug.**

**Live demo:** https://aegis-codex.vercel.app _(live 2026-04-18 ~17:00 CEST — placeholder until H6 deploy)_

Built during the [Codex Community Hackathon Vienna 2026-04-18](https://codex-hackathons.com/hackathons/codex-vienna-2026-04-18) in a 6-hour window.

---

## What it does

- **Users** fire adversarial prompts — prompt injection, path traversal, secret exfiltration, PII leaks, hallucinated references — against a live OpenAI agent through a Defense-in-Depth flow dashboard.
- **Sentry** sees every LLM call as a traced span (`gen_ai.invoke_agent`) with `aegis.safety_score`, `aegis.blocked_layers`, and token/cost attributes. Blocked attacks surface as Sentry exceptions with fingerprinted issue groups — Seer analyzes them automatically.
- **Why it matters:** every other agent demo shows what AI _can_ do. Ægis shows — observably, with Sentry-native spans — what an agent _refuses_ to do, and fans the evidence out to your entire ops pipeline in under 3 seconds.

---

## The 5 Layers (`@aegis/hardening`)

| Layer | Module | Purpose |
|-------|--------|---------|
| B1 — Paths | `paths.ts` | Blocks path-traversal attempts (`../`, absolute paths outside scope) |
| B2 — PII | `pii.ts` | Detects and refuses prompts leaking personal data (email, phone, IBAN, SSN) |
| B3 — Refs | `refs.ts` | Validates grounding references; rejects hallucinated citations before they reach the model |
| B4 — Injection | `security.ts` | Catches prompt injection, destructive-action commands, and exploration spirals |
| B5 — Redaction | `redaction.ts` | Redacts vendor secrets and API keys before the prompt leaves the process boundary |

Each layer is independently toggleable via `AEGIS_LAYER_B*` environment flags. The public API is `createHardening()` from `@aegis/hardening`.

---

## Sentry Integration

Ægis is built on `@sentry/nextjs` v8 with the `openAIIntegration()` and a custom `AegisSentryIntegration` class.

- **Auto-instrumented OpenAI spans** — every `gpt-4o` / `gpt-5` completion emits a `gen_ai.invoke_agent` span with input/output token counts, cost, model, and stop reason. No manual wrapping needed for the base call.
- **`aegis.*` custom attributes** — `aegis.safety_score` (0–1), `aegis.blocked_layers` (comma-separated layer IDs), `aegis.pii_detected`, `aegis.injection_detected` are set on every span so you can query them in Sentry Discover.
- **`captureException` with fingerprint → Seer** — when any layer blocks a prompt, `AegisBlockedException` is captured with `fingerprint: ['aegis-block', layer, pattern_id]`. Sentry groups attacks by pattern. Seer receives the issue, analyzes the attack vector, and proposes a fix — exactly as it would for a production bug.

---

## Quickstart

```bash
pnpm install

# Fill in secrets
cp .env.example .env.local
# Required:
#   OPENAI_API_KEY=sk-...
#   NEXT_PUBLIC_SENTRY_DSN=https://...@o0.ingest.sentry.io/...
#   SENTRY_AUTH_TOKEN=sntrys_...

pnpm dev
# App running at http://localhost:3000
```

Optional event fan-out to Telegram/Discord/Slack — see `.env.example` for `AEGIS_NOTIFICATION_*` keys.

---

## Architecture

```
User prompt
    │
    ▼
/api/agent/run (Next.js Route Handler)
    │
    ├──► @aegis/hardening  ─────────────────────────────────────────────────►
    │    B1 Paths → B2 PII → B3 Refs → B4 Injection → B5 Redaction          │
    │    │                                                                   │
    │    ├─ safety_score: 0.0–1.0                                           │
    │    └─ outcome: OK | BLOCKED (layer + pattern_id)                      │
    │                                                                        │
    ├──► Sentry span (gen_ai.invoke_agent)                                  │
    │    ├─ attributes: aegis.safety_score, aegis.blocked_layers, tokens    │
    │    └─ if BLOCKED: captureException(AegisBlockedException)             │
    │         └─► Seer analyzes per attack-pattern fingerprint              │
    │                                                                        │
    └──► OpenAI API  (only if outcome == OK)  ◄──────────────────────────────
         └─ response streamed back to dashboard

On block (optional notification fan-out):
    Sentry.captureException(fingerprint)
        └─► Webhook → Telegram / Discord / Slack  (if configured)
```

---

## Phase Roadmap

| Phase | Name | Status |
|-------|------|--------|
| **Phase 1 — Shield** | 5-layer hardening + live dashboard + Sentry full-stack + event fan-out | **Live today** |
| **Phase 2 — Seer-Loop** | Sentry issue webhook → agent inspects Git history + MRs → auto-creates GitLab issue | Documented (`docs/phase-2-seer-loop-vision.md`) |
| **Phase 3 — Auto-Remediation** | Agent picks issue → branches → patches → opens MR, guarded by Ægis itself | Designed (ADR §1) |

---

## Team & Event

Built at **Codex Community Hackathon Vienna — 2026-04-18** in a 6-hour build window (11:00–17:00 CEST). Submission lock 17:30. Top-10 pitches 18:30.

The hardening core (`@aegis/hardening`) is ported from a first-place hackathon entry, adapted for Node.js / Next.js and extended with full Sentry observability.

---

## Stack

Next.js 16 · React 19 · Tailwind CSS 4 · shadcn/ui (Lyra) · OpenAI GPT-4o/GPT-5 via Vercel AI SDK · Anthropic Claude (A/B testing) · `@sentry/nextjs` v8 with `openAIIntegration()` · pnpm workspace monorepo · Vercel deploy

---

## Contributing and security

- Architecture overview: [`docs/architecture.md`](docs/architecture.md)
- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Code of Conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

## License

MIT — see [LICENSE](LICENSE). Post-hackathon, each `packages/*` will be published as an independent npm package under the `@aegis` scope.

---

## Links

- Hackathon: https://codex-hackathons.com/hackathons/codex-vienna-2026-04-18
- Sentry AI Agent Monitoring: https://blog.sentry.io/sentrys-updated-agent-monitoring/
