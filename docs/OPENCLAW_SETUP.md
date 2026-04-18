---
epic: "#32"
issue: "#86"
scope: "OpenClaw setup and operations runbook"
---

# OpenClaw Setup

This runbook explains how to run OpenClaw next to Aegis in the current repository layout. It is written for the local Docker stack shipped in [`docker/`](../docker), with notes for operators who prefer a hand-managed `config.yaml`.

## 1. Prerequisites

- Docker 20+ with Compose support
- Node.js 24+ if you also want to run Aegis outside Docker
- A long random value for `AEGIS_SHARED_TOKEN`
- A long random value for `OPENCLAW_GATEWAY_TOKEN`
- OpenAI and optional Anthropic API keys if you want real model calls
- Optional Sentry DSN and auth token if you want observability parity with the demo
- Optional Discord bot token or webhook if you want approval notifications outside the Aegis UI

The current local bridge uses two different secrets:

- `AEGIS_SHARED_TOKEN`: shared bearer token for OpenClaw -> Aegis bridge requests
- `OPENCLAW_GATEWAY_TOKEN`: gateway control-plane token for OpenClaw itself

If a future Aegis runtime talks back to OpenClaw through its API client, set `OPENCLAW_API_TOKEN` to the same value as `OPENCLAW_GATEWAY_TOKEN`.

## 2. Install the local stack

The repo already ships a local two-service Docker stack:

- [`docker/docker-compose.yml`](../docker/docker-compose.yml)
- [`docker/Dockerfile.aegis`](../docker/Dockerfile.aegis)
- [`docker/Dockerfile.openclaw`](../docker/Dockerfile.openclaw)
- [`docker/openclaw/openclaw.json5`](../docker/openclaw/openclaw.json5)

Copy the Docker env template:

```bash
cp docker/.env.example docker/.env
```

Fill in at least:

```bash
AEGIS_SHARED_TOKEN=replace-with-a-long-random-string
OPENCLAW_GATEWAY_TOKEN=replace-with-a-long-random-string
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SENTRY_DSN=https://...
SENTRY_AUTH_TOKEN=sntrys_...
```

Build and start:

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build
```

Surfaces:

- Aegis UI: `http://localhost:3000`
- OpenClaw gateway: `http://localhost:18789`

## 3. Configure OpenClaw

### Current repo default

The repo currently seeds OpenClaw with [`docker/openclaw/openclaw.json5`](../docker/openclaw/openclaw.json5). That file is the authoritative example for the local Docker image and enables:

- token auth on the gateway
- coding profile tools
- allowlist exec security
- approval-on-miss behavior
- strict inline evaluation rules

The matching approval policy lives in [`docker/openclaw/exec-approvals.json`](../docker/openclaw/exec-approvals.json).

### Sample `config.yaml`

If you operate OpenClaw outside the shipped Docker image and want a human-editable YAML config, use a shape like this and map the values back to the JSON5 seed above:

```yaml
gateway:
  mode: local
  bind: lan
  port: 18789
  auth:
    mode: token
    token: ${OPENCLAW_GATEWAY_TOKEN}
  reload:
    mode: off

agent:
  model: openai/gpt-5

session:
  dmScope: per-channel-peer

tools:
  profile: coding
  exec:
    enabled: true
    security: allowlist
    ask: on-miss
    strictInlineEval: true
    approvals:
      mode: webhook
      targets:
        - type: webhook
          url: http://aegis-web:3000/api/runtime/openclaw/approval-requests
          headers:
            Authorization: Bearer ${AEGIS_SHARED_TOKEN}
        - type: discord
          webhook_url: ${DISCORD_WEBHOOK_URL}
          channel_name: aegis-approvals
  elevated:
    enabled: false

providers:
  openai:
    api_key: ${OPENAI_API_KEY}
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
```

### Bridge endpoints in this repo

The current Docker contract expects these Aegis endpoints:

- `GET /api/runtime/openclaw/health`
- `POST /api/runtime/openclaw/approval-requests`
- `GET /api/runtime/openclaw/approval-requests?status=pending`
- `POST /api/runtime/openclaw/approval-requests/{approvalId}/decisions`

See [`docker/interfaces/aegis-openclaw-contract.md`](../docker/interfaces/aegis-openclaw-contract.md) for the canonical request and response bodies.

## 4. Verify the setup

### Manual checks

Gateway models:

```bash
curl -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" http://localhost:18789/v1/models
```

Aegis bridge health:

```bash
curl -H "Authorization: Bearer ${AEGIS_SHARED_TOKEN}" http://localhost:3000/api/runtime/openclaw/health
```

If your local Aegis build later exposes a consolidated `/api/ready`, you can also check that endpoint for an `openclaw` health section. The current repo contract uses `/api/runtime/openclaw/health` as the required preflight target.

### Smoke script

Run:

```bash
bash scripts/openclaw-smoke.sh
```

The script checks:

- OpenClaw gateway reachability
- authenticated `/v1/models`
- Aegis bridge health endpoint
- optional `/api/ready` if present

## 5. Operation

Standing orders and safe defaults:

- Keep `tools.exec.security` on `allowlist`
- Keep `askFallback` on `deny`
- Prefer Discord or webhook targets for visibility, not silent auto-allow
- Treat `OPENCLAW_GATEWAY_TOKEN` and `AEGIS_SHARED_TOKEN` as operator secrets

Common commands:

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env logs -f openclaw-gateway
docker compose -f docker/docker-compose.yml --env-file docker/.env logs -f aegis-web
docker compose -f docker/docker-compose.yml --env-file docker/.env restart openclaw-gateway
```

If you run a standalone OpenClaw install that supports live reload, use:

```bash
openclaw gateway reload
```

## 6. Troubleshooting

Discord not receiving:

- verify the bot or webhook has permission to post in the target channel
- verify the channel id or webhook URL matches the environment
- check OpenClaw logs for delivery errors and rate limits

Bridge returns `401`:

- `AEGIS_SHARED_TOKEN` does not match between Aegis and OpenClaw
- if you call the OpenClaw API directly, `OPENCLAW_API_TOKEN` and `OPENCLAW_GATEWAY_TOKEN` must also match

Approvals appear to hang:

- confirm Aegis actually implements the contract endpoints from the Docker interface doc
- if you add Phase 2 persistence, ensure the `pg-boss` worker is running before expecting TTL or async approval jobs

Provider rate-limited:

- downgrade to a lower-cost model temporarily
- check provider quotas and retry behavior
- confirm the gateway is not replaying failed requests too aggressively

Smoke script fails on `/api/ready`:

- that endpoint is optional in the current repo state
- the required bridge health check is `/api/runtime/openclaw/health`

## 7. Related docs

- [`docker/README.md`](../docker/README.md)
- [`docker/interfaces/aegis-openclaw-contract.md`](../docker/interfaces/aegis-openclaw-contract.md)
- [`architecture.md`](./architecture.md)
