# Docker Integration Stack

This directory provides a local Docker setup for the Aegis + OpenClaw approval flow.

The stack is designed around one explicit assumption:

- The Aegis application is already feature-complete and exposes the approval APIs documented in [`interfaces/aegis-openclaw-contract.md`](./interfaces/aegis-openclaw-contract.md).

Under that assumption, the Docker assets here give you:

- an Aegis web container built from this repository,
- an OpenClaw gateway container with host-exec approval defaults,
- a shared local contract for how OpenClaw mirrors approval requests into Aegis.

## Layout

- `Dockerfile.aegis`: builds the Aegis Next.js web app from the repo root.
- `Dockerfile.openclaw`: builds a dedicated OpenClaw gateway image and seeds approval defaults.
- `docker-compose.yml`: local two-service stack.
- `openclaw/openclaw.json5`: seed OpenClaw config for the containerized gateway.
- `openclaw/exec-approvals.json`: seed approval policy for host-exec requests.
- `openclaw/entrypoint.sh`: bootstraps OpenClaw and verifies the expected Aegis endpoint.
- `openclaw-auth-seed/`: optional read-only auth bundle for external model login seeds.
- `interfaces/aegis-openclaw-contract.md`: the expected runtime contract Aegis must implement.

## Quick Start

1. Copy the env template:

```bash
cp docker/.env.example docker/.env
```

2. Build the images:

```bash
docker build -f docker/Dockerfile.aegis .
docker build -f docker/Dockerfile.openclaw docker
```

3. Start the stack:

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build
```

4. Open the surfaces:

- Aegis web UI: `http://localhost:3000`
- OpenClaw gateway: `http://localhost:18789`

## What This Stack Assumes

The OpenClaw image assumes a finished Aegis runtime provides:

- a health endpoint for bridge preflight,
- an approval-ingress endpoint for mirrored OpenClaw requests,
- a decision endpoint used by the Aegis UI/backend,
- a web UI that lists pending approval requests.

This directory does not attempt to implement those APIs inside OpenClaw.
It packages the container wiring and the contract that a finished Aegis runtime is expected to satisfy.

## Aegis Build Profiles

The Aegis Dockerfile supports two build profiles:

- `dev` (default): installs the app and starts the Next.js web interface in dev mode if no production build output exists.
- `production`: runs `next build --webpack` during the image build and starts with `next start`.

Examples:

```bash
docker build -f docker/Dockerfile.aegis --build-arg AEGIS_BUILD_PROFILE=dev .
docker build -f docker/Dockerfile.aegis --build-arg AEGIS_BUILD_PROFILE=production .
```

The default is intentionally `dev` so the Docker setup remains locally buildable even when the current repo state is not yet production-build-clean.

## OpenClaw Defaults

The seeded OpenClaw config is intentionally strict:

- `gateway.bind: "lan"` so the port is reachable from Docker bridge networking,
- `gateway.auth.mode: "token"` for a real shared-secret control plane,
- `tools.exec.security: "allowlist"` and `tools.exec.ask: "on-miss"`,
- `tools.exec.strictInlineEval: true`,
- seeded `exec-approvals.json` with `askFallback: "deny"`,
- default model wiring via `OPENCLAW_MODEL_REF` (defaults to `openai-codex/gpt-5.4`).

## Codex Provider Seeding

The stack supports an external OpenAI Codex auth seed in the same style used by
`socrates-methodical`.

- Host seed directory: `docker/openclaw-auth-seed/`
- Container mount: `/opt/openclaw-auth-seed` (read-only)
- Runtime target: `/var/lib/openclaw/state/agents/<OPENCLAW_AGENT_ID>/agent/`

If `auth-profiles.json` or `auth.json` exists in the seed directory, the
entrypoint copies them into the writable OpenClaw agent state before the
gateway starts.

This lets you provision Codex OAuth outside the container and keep the
read-only config/approval paths separate from mutable model-auth state.

Generate the seed bundle from the repository root with:

```bash
pnpm openclaw:export-codex-auth
```

That command reads `~/.pi/agent/auth.json` by default and writes the resulting
`auth-profiles.json` + `auth.json` into `docker/openclaw-auth-seed/`.

## Filesystem Hardening

The OpenClaw container is prepared so the critical policy files are immutable at runtime:

- `/etc/openclaw/openclaw.json5`: root-owned and read-only
- `/home/openclaw/.openclaw/exec-approvals.json`: root-owned and read-only
- `/home/openclaw/.openclaw`: read-only directory, so the gateway cannot replace the approvals file in place
- `/var/lib/openclaw/state`: the only writable persistent path, mounted as a named Docker volume

The container also runs as an unprivileged `openclaw` user and Compose enables:

- `read_only: true` for the container root filesystem
- `cap_drop: [ALL]`
- `security_opt: ["no-new-privileges:true"]`
- `tmpfs: /tmp`

This means OpenClaw can keep runtime state, but it cannot autonomously rewrite the seeded approval policy or the seeded gateway config without rebuilding the image.

## Notes

- The Aegis contract uses a shared bearer token for local development. Replace it before any real deployment.
- The OpenClaw image is built from the published `openclaw` package so the Docker build is self-contained.
- If you later replace the package install with a local OpenClaw fork or plugin build, the Compose wiring can stay the same.
