# 🛡 Ægis — Observable Agentic Hardening

**Five-layer defense middleware for OpenAI agents. Every violation becomes a Sentry exception. Seer analyzes it like a production bug.**

**Live demo:** https://aegis-codex.vercel.app
**Repo:** https://github.com/Kanevry/aegis

Built during the [Codex Community Hackathon Vienna 2026-04-18](https://codex-hackathons.com/hackathons/codex-vienna-2026-04-18) in a 6-hour window.

---

## Hackathon Submission

- **Live demo:** https://aegis-codex.vercel.app
- **Demo video:** {{VIDEO_URL}}
- **Submission description:** [`docs/submission-description.md`](docs/submission-description.md)

Open the live demo → click Testbed → fire any attack. Observe Flow visualization + Sentry issue link in real time.

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

## Setup

### 30-second version

```bash
pnpm install
cp .env.example .env.local   # fill in required keys (see below)
pnpm dev                     # http://localhost:3000
```

### Prerequisites

- Node.js ≥ 20 (tested on 22)
- pnpm ≥ 9 (`npm i -g pnpm`)
- A Sentry account (free tier is enough)
- OpenAI API key (primary provider)
- Anthropic API key (optional — only the compare view and B-side eval need it)

### Required environment variables

Copy `.env.example` → `.env.local` and fill the keys below. Never commit `.env.local` — it is in `.gitignore`.

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes | Primary LLM provider (`gpt-4o-mini` default) |
| `ANTHROPIC_API_KEY` | for compare | Optional Claude-based A/B variants (`claude-haiku-4-5-20251001`) |
| `NEXT_PUBLIC_SENTRY_DSN` | yes | Client + server DSN — must match the org you are logged into (see **DSN org check**) |
| `SENTRY_DSN` | yes | Same value as `NEXT_PUBLIC_SENTRY_DSN` |
| `SENTRY_AUTH_TOKEN` | for source-maps | Only for build-time source-map upload; dev works without |
| `SENTRY_ORG` | yes | Org slug (must match DSN org) |
| `SENTRY_PROJECT` | yes | Project slug (must match DSN project) |
| `NEXT_PUBLIC_SENTRY_ENABLED` | yes | `true` to enable Sentry in dev |
| `AEGIS_LAYER_B1_PATHS` … `B5_REDACTION` | optional | `true`/`false` per layer; all default `true` |

See `.env.example` for the full list (Gemini, OpenRouter, Supabase, pg-boss, OpenClaw gateway, Discord fan-out, Upstash).

Anthropic support is optional and is only used for Claude-based A/B testing and provider comparison views; the default agent flow runs on OpenAI.

### Provision a Sentry project (first time)

The DSN must point to a project **in the same org** your `SENTRY_AUTH_TOKEN` can access. Mismatched DSN and token is the #1 reason the Sentry UI stays empty — see [`docs/setup-troubleshooting.md`](docs/setup-troubleshooting.md).

Create a user token at https://sentry.io/settings/account/api/auth-tokens/, then:

```bash
export SENTRY_TOKEN=sntryu_...

# 1. Confirm which org your token belongs to
curl -sS https://sentry.io/api/0/organizations/ \
  -H "authorization: Bearer $SENTRY_TOKEN" \
  | jq -r '.[] | "\(.slug)\t\(.name)"'

# 2. Create the project (replace <org> and <team>)
curl -sS -X POST "https://sentry.io/api/0/teams/<org>/<team>/projects/" \
  -H "authorization: Bearer $SENTRY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"aegis","slug":"aegis","platform":"javascript-nextjs"}'

# 3. Fetch the public DSN
curl -sS "https://sentry.io/api/0/projects/<org>/aegis/keys/" \
  -H "authorization: Bearer $SENTRY_TOKEN" \
  | jq -r '.[0].dsn.public'
```

Copy that DSN into **both** `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN`, set `SENTRY_ORG=<org>` and `SENTRY_PROJECT=aegis`.

### DSN org check (verify wiring before running)

```bash
DSN="<paste your DSN here>"
HOST=$(echo "$DSN" | sed -E 's#https://[^@]+@([^/]+)/.*#\1#')
KEY=$(echo  "$DSN" | sed -E 's#https://([^@]+)@.*#\1#')
PID=$(echo  "$DSN" | sed -E 's#.*/([0-9]+)$#\1#')
EID=$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')

curl -sS "https://$HOST/api/$PID/store/" \
  -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=$KEY, sentry_client=aegis-curl/1.0" \
  -H "content-type: application/json" \
  -d "{\"event_id\":\"$EID\",\"platform\":\"javascript\",\"level\":\"info\",\"message\":\"aegis-dsn-probe\"}"
# HTTP 200 + {"id":"..."} → Sentry accepted the event. Refresh the Issues page.
```

If the event is accepted but never appears in your UI, the DSN belongs to a different org than the one you are viewing.

### Dev-server restart required after `.env*` changes

Next.js reads `.env.local` **only at server boot**. Code hot-reloads; env does not. After editing `.env.local`:

```bash
# Ctrl-C, then
pnpm dev
```

### Secret rotation

Never paste a raw secret into an issue, PR, or public channel. If a key was exposed, rotate it first, then update `.env.local`. Post-rotation the old key is dead — no code change needed unless the id alias differs.

### Optional: Discord fan-out + Phase-2 services

Set `DISCORD_WEBHOOK_URL` in `.env.local` to mirror blocked attacks into a Discord channel. See `.env.example` for the full OpenClaw / Supabase / pg-boss configuration if you want Phase-2 features.

### Local dev with Docker Compose

Full Phase-2 stack in one command (Next.js web + pg-boss worker + OpenClaw gateway + Postgres):

```bash
cd docker
docker compose up --build
```

Services and ports:

| Service              | Port   | Purpose                                   |
|----------------------|--------|-------------------------------------------|
| `aegis-web`          | 3000   | Next.js app                               |
| `aegis-worker`       | —      | pg-boss consumer (approvals, cleanup)     |
| `openclaw-gateway`   | 18789  | Runtime approval bridge                   |
| `postgres`           | 5432   | Shared DB (Supabase + pg-boss + rate-limit) |

Supabase migrations live under `supabase/migrations/` and apply through the Supabase CLI — pg-boss creates its own `pgboss` schema on first connect. Copy `docker/.env.example` → `docker/.env` and fill in `OPENCLAW_GATEWAY_TOKEN`, `AEGIS_SHARED_TOKEN`, and model keys before running.

### Rate limiting (demo-loose by default)

Sensitive endpoints (`/api/auth/login`, `/api/chat/stream`, `/api/approvals/*/decide`, `/api/sessions`) are guarded by a Postgres-backed leaky-bucket limiter in `src/lib/rate-limit.ts`. Demo-day defaults are intentionally high (500/3000/6000/2000 per 60s) and `AEGIS_DEMO_MODE=true` or `AEGIS_RATE_LIMIT_BYPASS=true` short-circuits the DB call entirely while keeping Sentry `aegis.ratelimited` telemetry wired. Hourly cleanup runs as a pg-boss cron in `aegis-worker` (`rate-limit.cleanup`).

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

Next.js 16 · React 19 · Tailwind CSS 4 · shadcn/ui (Lyra) · OpenAI `gpt-4o-mini` via Vercel AI SDK · Anthropic `claude-haiku-4-5-20251001` (A/B testing) · `@sentry/nextjs` v8 with `vercelAIIntegration()` · pnpm workspace monorepo · Vercel deploy

---

## Contributing and security

- Architecture overview: [`docs/architecture.md`](docs/architecture.md)
- OpenClaw setup: [`docs/OPENCLAW_SETUP.md`](docs/OPENCLAW_SETUP.md)
- ADR: [`docs/ADR.md`](docs/ADR.md)
- Phase 2 Seer vision: [`docs/PHASE-2-SEER-VISION.md`](docs/PHASE-2-SEER-VISION.md)
- Kickoff notes: [`docs/KICKOFF-NOTES-2026-04-18.md`](docs/KICKOFF-NOTES-2026-04-18.md)
- Submission copy: [`docs/SUBMISSION.md`](docs/SUBMISSION.md)
- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Code of Conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

## License

MIT — see [LICENSE](LICENSE). Post-hackathon, each `packages/*` will be published as an independent npm package under the `@aegis` scope.

---

## Links

- Hackathon: https://codex-hackathons.com/hackathons/codex-vienna-2026-04-18
- Sentry AI Agent Monitoring: https://blog.sentry.io/sentrys-updated-agent-monitoring/
