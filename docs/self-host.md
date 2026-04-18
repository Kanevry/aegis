# Self-Host Quickstart

Run the full Ægis stack on any Linux VPS with Docker — Next.js web, pg-boss worker,
OpenClaw gateway, and Postgres, behind a reverse proxy with TLS.

This guide is **provider-agnostic**. It works on Hetzner, Hetzner Cloud, DigitalOcean,
Fly.io, AWS Lightsail, OVH, a Raspberry Pi at home — anything that runs Docker and
exposes a public IP.

> **When to use this** instead of Vercel: you want Phase-2 features (OpenClaw, Postgres,
> pg-boss approvals) end-to-end, or you need to run `@aegis/sandbox` (gondolin requires
> KVM/QEMU and does not run on Vercel).

---

## Prerequisites

**On the VPS**

| Item | Minimum | Notes |
|------|---------|-------|
| OS | Linux x86_64 | Ubuntu 22.04+ or Debian 12+ tested |
| RAM | 2 GB | 4 GB+ recommended (build needs ~1.5 GB peak) |
| Disk | 10 GB free | Postgres volume + Docker images |
| Docker | 24+ | with Compose v2 (`docker compose`, not `docker-compose`) |
| Reverse proxy | any | Caddy is the easiest (auto-TLS); nginx + certbot also works |
| Open ports | 80, 443 | for the reverse proxy only — app ports stay internal |

**Locally (before first deploy)**

| Item | Why |
|------|-----|
| Node.js ≥ 24 + pnpm ≥ 10 | run `pnpm typecheck && pnpm test --run` before pushing |
| `rsync` | upload the repo to the server |
| OpenAI key | `sk-proj-…` (and optionally Anthropic `sk-ant-…`) |
| Sentry project | DSN + auth token (see [`docs/setup-troubleshooting.md`](setup-troubleshooting.md)) |
| Codex CLI session (optional) | only if you want OpenClaw to use Codex models — see step 1.3 |

**A domain you control** with the ability to add an A-record (e.g. `aegis.your-domain.com`).

---

## Step 1 — Prepare locally

### 1.1 Run the quality gates

```bash
pnpm install
pnpm typecheck       # 0 errors
pnpm lint            # 0 errors
pnpm test --run      # all passing
```

Evidence before deploy. If any of these fail, fix locally first — don't deploy a broken
build to find out.

### 1.2 Generate secrets

Each value below must be unique and high-entropy. Run once and stash the output safely.

```bash
# Three independent 32-byte hex secrets
openssl rand -hex 32   # → AEGIS_SHARED_TOKEN
openssl rand -hex 32   # → OPENCLAW_GATEWAY_TOKEN
openssl rand -hex 32   # → AEGIS_SESSION_SECRET

# Postgres password (any reasonable length)
openssl rand -hex 16   # → POSTGRES_PASSWORD

# Operator passphrase hash (bcrypt 12 rounds, original never stored)
pnpm tsx scripts/auth-hash.ts "your-operator-passphrase"
# → AEGIS_SESSION_PASSPHRASE_HASH (single-line hash output)
```

### 1.3 Optional — export Codex auth for OpenClaw

Skip this step if you don't need Codex-backed models inside OpenClaw (the gateway
falls back gracefully).

```bash
# Requires Codex CLI logged in locally; reads ~/.pi/agent/auth.json
pnpm openclaw:export-codex-auth
```

This writes `docker/openclaw-auth-seed/{auth.json,auth-profiles.json}` — those files
are uploaded with the repo and mounted **read-only** into the gateway container.

---

## Step 2 — Provision the VPS

### 2.1 Install Docker

```bash
ssh you@your-vps
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER       # log out + back in afterwards
docker compose version              # confirm v2.x
```

### 2.2 Pick a non-conflicting port

The web app listens on container port `3000` and is mapped to a host port. If you have
nothing else running, `3000` is fine. Otherwise pick a free port (e.g. `18800`):

```bash
ss -tlnp | grep -E ':(3000|18800)\b'   # should print nothing
```

You will use this port in two places: the Compose port mapping and the reverse-proxy
upstream. Below we use `18800` as the example.

### 2.3 Choose a deployment directory

```bash
mkdir -p ~/aegis
```

---

## Step 3 — Upload the repo

From your **local machine**:

```bash
rsync -avz \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' \
  ./ you@your-vps:~/aegis/
```

> The `--exclude '.env*'` is intentional — env files are uploaded separately in the
> next step so secrets never sit in the rsync source tree on disk.

---

## Step 4 — Configure the environment

On the **VPS**:

```bash
cd ~/aegis
cp docker/.env.example docker/.env
nano docker/.env       # or your editor of choice
```

Set every value below. Defaults from `.env.example` that are unsafe in production are
called out in the **Action** column.

### Required — model + observability

| Variable | Action |
|----------|--------|
| `OPENAI_API_KEY` | your `sk-proj-…` key |
| `ANTHROPIC_API_KEY` | optional — only used by `/compare` |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN from your Sentry project |
| `SENTRY_DSN` | **same value** as `NEXT_PUBLIC_SENTRY_DSN` (worker uses this name) |
| `SENTRY_AUTH_TOKEN` | only needed if you want source-map upload at build time |

### Required — production hardening

| Variable | Action | Why |
|----------|--------|-----|
| `AEGIS_BUILD_PROFILE` | **`production`** | Default is `dev` and starts `next dev`. Production profile runs `next build` + `next start`. |
| `AEGIS_DEMO_DISABLE_AUTH` | **`false`** | Default in the example is `true` to make the local demo single-click. Turn it off in production. |
| `AEGIS_DEMO_MODE` | `false` | Circuit breaker only — leave off in production. |
| `SKIP_ENV_VALIDATION` | `false` | Keep Zod env validation on. |
| `NEXT_PUBLIC_APP_URL` | `https://aegis.your-domain.com` | Used for absolute URLs (Sentry, redirects). |
| `AEGIS_SHARED_TOKEN` | from step 1.2 | Bearer between web and gateway. |
| `OPENCLAW_GATEWAY_TOKEN` | from step 1.2 | Auth for the OpenClaw control plane. |
| `AEGIS_SESSION_SECRET` | from step 1.2 | HMAC for httpOnly session cookies. |
| `AEGIS_SESSION_PASSPHRASE_HASH` | from step 1.2 | bcrypt(12) hash; the passphrase itself is never stored. |
| `POSTGRES_PASSWORD` | from step 1.2 | Replaces the `aegis/aegis/aegis` dev default. |

### Reverse-proxy port mapping

If you picked a non-default host port (e.g. `18800`), edit `docker/docker-compose.yml`
to map it:

```yaml
  aegis-web:
    ...
    ports:
      - "127.0.0.1:18800:3000"   # bind to localhost only — proxy will reach it
```

> Binding to `127.0.0.1` is important: the reverse proxy on the same host can reach it,
> but the port is **not exposed publicly**. TLS termination happens at the proxy.

For Postgres, restrict the same way (or remove the host mapping entirely if nothing
outside Docker needs it):

```yaml
  postgres:
    ports:
      - "127.0.0.1:54329:5432"
```

### Supabase (optional)

The stack uses a **plain Postgres container** by default — `docker/postgres/init/`
bootstraps the schema on first start. The Supabase env vars
(`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`) are **only required** if you
want Supabase Auth/Storage at runtime. Leave them empty for the standard self-host
flow — no behaviour depends on them in the Docker stack.

If you're already running self-hosted Supabase elsewhere, point `DATABASE_URL` at it
and skip the bundled `postgres` service (`docker compose up aegis-web aegis-worker
openclaw-gateway`).

---

## Step 5 — Reverse proxy + TLS

The example below uses **Caddy**, which handles Let's Encrypt automatically. If you
already run nginx + certbot or Traefik, the upstream block is the only thing you need.

### Caddy

Add to your `Caddyfile`:

```caddy
aegis.your-domain.com {
  reverse_proxy localhost:18800
}
```

Then reload Caddy. **Important:** if Caddy runs in Docker with a bind-mounted
Caddyfile, `caddy reload` may silently miss the change due to inode tracking — restart
the container instead:

```bash
docker compose -f /path/to/caddy/docker-compose.yml restart caddy
```

If Caddy runs natively:

```bash
sudo systemctl reload caddy
```

### nginx (alternative)

```nginx
server {
  listen 443 ssl http2;
  server_name aegis.your-domain.com;

  ssl_certificate     /etc/letsencrypt/live/aegis.your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/aegis.your-domain.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:18800;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";    # keep-alive for SSE streaming
  }
}
```

### DNS

Add an A-record for `aegis.your-domain.com` pointing to the VPS public IP. Wait for
propagation (typically < 60 s, occasionally minutes).

---

## Step 6 — Bring up the stack

```bash
cd ~/aegis
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

First build takes ~5 minutes (cold cache). Subsequent rebuilds are much faster.

Watch logs while it warms up:

```bash
docker compose -f docker/docker-compose.yml logs -f aegis-web
```

You should see Next.js boot and then `▲ Next.js 16.x.x ready on 0.0.0.0:3000`.

---

## Step 7 — Verify

```bash
# 7.1 Liveness — must return 200
curl -s -o /dev/null -w "%{http_code}\n" https://aegis.your-domain.com/api/health

# 7.2 Readiness — checks DB + worker
curl -s https://aegis.your-domain.com/api/ready | jq

# 7.3 OpenClaw bridge preflight
curl -s -H "Authorization: Bearer $AEGIS_SHARED_TOKEN" \
  https://aegis.your-domain.com/api/runtime/openclaw/health | jq

# 7.4 Fire one canonical attack — should return a refusal envelope
curl -s -X POST https://aegis.your-domain.com/api/testbed/fire \
  -H "content-type: application/json" \
  -d '{"id":"prompt-injection-001"}' | jq

# 7.5 Sentry — open the project; the attack above must appear within ~3 s
#     fingerprint: aegis-block / B4 / prompt-injection-001
```

If 7.4 succeeds but no Sentry issue appears, your DSN belongs to a different org than
your auth token. See [`docs/setup-troubleshooting.md`](setup-troubleshooting.md) for
a one-liner DSN/org probe.

---

## Day-2 operations

### Update the deployed version

```bash
# locally
pnpm typecheck && pnpm lint && pnpm test --run
rsync -avz --exclude node_modules --exclude .next --exclude .git --exclude '.env*' \
  ./ you@your-vps:~/aegis/

# on the server
cd ~/aegis
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

The `up -d --build` is idempotent — it rebuilds only changed layers and recreates only
changed services.

### View logs

```bash
docker compose -f docker/docker-compose.yml logs --tail 100 -f aegis-web
docker compose -f docker/docker-compose.yml logs --tail 100 -f openclaw-gateway
docker compose -f docker/docker-compose.yml logs --tail 100 -f aegis-worker
```

### Backup the database

```bash
docker compose -f docker/docker-compose.yml exec postgres \
  pg_dump -U aegis aegis | gzip > ~/aegis-$(date +%F).sql.gz
```

### Tear-down — remove everything

```bash
cd ~/aegis
docker compose -f docker/docker-compose.yml down -v   # -v also drops the postgres volume
cd ~ && rm -rf ~/aegis

# In your reverse-proxy config: remove the aegis vhost block + reload/restart.
# In your DNS: remove the A-record.
```

After these three commands the VPS is back to its prior state — no Ægis artefacts
remain.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `aegis-web` runs `next dev`, slow + warns about prod | `AEGIS_BUILD_PROFILE` left on `dev` | Set to `production` in `docker/.env`, then `up -d --build` |
| `502 Bad Gateway` from the proxy | Container bound to `127.0.0.1:18800` but proxy targets a different port | Match the port in compose ↔ proxy config |
| `connect ECONNREFUSED postgres:5432` in worker logs | Postgres healthcheck not yet green | Worker has `depends_on: service_healthy` — give it ~10 s on cold start |
| Login always rejected | `AEGIS_SESSION_PASSPHRASE_HASH` empty or for a different passphrase | Re-run `pnpm tsx scripts/auth-hash.ts <pass>` and paste the full output |
| OpenClaw container crash-loops on first start | Missing/invalid auth seed under `docker/openclaw-auth-seed/` | Either run `pnpm openclaw:export-codex-auth` (step 1.3), or accept the no-Codex fallback by leaving the seed dir empty |
| Sentry stays empty after a fired attack | DSN belongs to a different org than `SENTRY_AUTH_TOKEN` | See [`docs/setup-troubleshooting.md`](setup-troubleshooting.md) — DSN/org probe one-liner |
| TLS cert never issues | Port 80 blocked or DNS not propagated | `dig aegis.your-domain.com` and `curl -v http://aegis.your-domain.com` from a third host |

---

## What this stack costs to run

Order-of-magnitude figures for a single-VPS deployment with the default Compose:

| Resource | Idle | Under demo load (10 attacks/min) |
|----------|------|----------------------------------|
| RAM | ~600 MB | ~900 MB |
| CPU | < 5% of 1 vCPU | ~30% of 1 vCPU |
| Disk growth | ~5 MB / day | ~50 MB / day (mostly Postgres + logs) |
| Outbound traffic | negligible | a few KB per LLM call (plus model API costs) |

A 2 vCPU / 4 GB VPS is comfortable headroom. The model APIs (OpenAI, Anthropic) are
the dominant variable cost.

---

## See also

- [`docker/README.md`](../docker/README.md) — Compose internals, build profiles, OpenClaw container hardening
- [`docs/deploy.md`](deploy.md) — alternative: Vercel deploy (Phase 1 only, no Postgres)
- [`docs/architecture.md`](architecture.md) — full sequence diagrams + topology
- [`docs/setup-troubleshooting.md`](setup-troubleshooting.md) — Sentry DSN/token diagnostics
- [`SECURITY.md`](../SECURITY.md) — trust boundaries and reporting policy
