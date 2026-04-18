# Ægis — Vercel Deploy Runbook

Operational guide for the 16:00–17:00 CEST deploy window.
Execute top-to-bottom. Each section has an explicit acceptance test.

---

## 1. Prerequisites

Confirm every item before starting.

**Tooling**

```bash
# Vercel CLI (ad-hoc via pnpm dlx — no global install needed)
pnpm dlx vercel --version
# Expected: 40.x or higher

# GitHub CLI (for release tagging)
gh --version

# Node and pnpm versions
node --version   # 20.x
pnpm --version   # 9.x
```

**Accounts and access**

- Vercel account with write access to the `Kanevry` scope (or personal account that will own the project).
- Sentry account with a project named `aegis` already created.
  - Settings → Auth Tokens → Create token with scopes: `project:releases`, `project:write`, `org:read`.
  - Copy the token — you will need it as `SENTRY_AUTH_TOKEN`.
- GitHub repo `Kanevry/aegis` accessible and `main` branch up to date.

---

## 2. Initial Vercel Project Setup

Run once. Skip if the project is already linked (`.vercel/` directory exists).

```bash
# 1. Link the local directory to a new Vercel project
cd /path/to/aegis
pnpm dlx vercel link
```

Answer the prompts as follows:

| Prompt | Answer |
|--------|--------|
| Set up and deploy? | `Y` |
| Which scope? | Your Vercel account / team |
| Link to existing project? | `N` (create new) |
| Project name | `aegis` (or `aegis-codex`) |
| In which directory is your code located? | `./` |

Framework is **auto-detected** as Next.js. Accept all auto-detected settings:

| Setting | Value |
|---------|-------|
| Framework preset | Next.js |
| Build command | `pnpm build` |
| Output directory | `.next` (auto, `output: 'standalone'` in `next.config.ts`) |
| Root directory | `./` |
| Install command | `pnpm install` |

After linking, `.vercel/project.json` is created. Commit this file — it contains only the project ID, no secrets.

---

## 3. Environment Variable Checklist

Set these in **Vercel Dashboard → Project → Settings → Environment Variables** before the first deploy.

### Required — Encrypted (server-only)

| Variable | Example Value | Scopes |
|----------|---------------|--------|
| `OPENAI_API_KEY` | `sk-proj-...` | Production, Preview |
| `SENTRY_AUTH_TOKEN` | `sntryu_...` | Production, Preview |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Production, Preview (enables A/B mode) |

### Required — Public / Plain text

| Variable | Example Value | Scopes |
|----------|---------------|--------|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://<key>@o<id>.ingest.sentry.io/<project-id>` | All |
| `SENTRY_DSN` | same value as above | All |
| `SENTRY_ORG` | `your-org-slug` | All |
| `SENTRY_PROJECT` | `aegis` | All |
| `NEXT_PUBLIC_APP_URL` | `https://aegis-codex.vercel.app` | Production |

### Optional — Feature flags (defaults shown)

| Variable | Default | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_SENTRY_ENABLED` | `true` | Master Sentry toggle |
| `AEGIS_SENTRY_FEEDBACK_WIDGET` | `true` | Dashboard feedback form |
| `AEGIS_HARDENING_ENABLED` | `true` | Master hardening switch |
| `AEGIS_LAYER_B1_PATHS` | `true` | Layer B1 path traversal |
| `AEGIS_LAYER_B2_PII` | `true` | Layer B2 PII detection |
| `AEGIS_LAYER_B3_REFS` | `true` | Layer B3 hallucinated refs |
| `AEGIS_LAYER_B4_SECURITY` | `true` | Layer B4 prompt injection / secret exfil |
| `AEGIS_LAYER_B5_REDACTION` | `true` | Layer B5 output redaction |
| `AEGIS_DEMO_MODE` | `false` | Circuit breaker — flip to `true` only if live breaks |
| `SKIP_ENV_VALIDATION` | `false` | Never `true` in production |

> All layer flags default to `true` when unset. You only need to explicitly set them if you want to disable a specific layer during the demo.

---

## 4. Source-Map Upload Verification

`next.config.ts` gates source-map upload behind `process.env.VERCEL || process.env.GITHUB_ACTIONS`.
Vercel sets `VERCEL=1` automatically on every build — no manual action required.

The `@sentry/nextjs` Webpack plugin will:
1. Generate source maps during `pnpm build`.
2. Upload them to Sentry under a new release (named after the git commit SHA).
3. Delete the maps from the `.next` output bundle (so minified code is not shipped to users).

**Verify after first deploy:**

1. Sentry Dashboard → **Project** `aegis` → **Releases**.
2. A new release entry should appear within ~30s of the build completing.
3. Click the release → **Artifacts** tab → confirm `.js.map` files are listed.
4. Deliberate smoke throw: fire the `prompt-injection-001` attack in the Testbed.
   - A B4 block fires → `Sentry.captureException` is called → Sentry issue appears.
   - Click the issue → stack trace must show **TypeScript file names and line numbers**, not minified `bundle.js:1:99999`.

If the stack trace is minified, source maps were not uploaded. Re-check `SENTRY_AUTH_TOKEN` and `SENTRY_ORG`/`SENTRY_PROJECT` values in Vercel env.

---

## 5. First-Deploy Flow

```bash
# Push the current state of main to trigger a Vercel build
git push origin main
```

1. Open **Vercel Dashboard → Deployments** and watch the build log.
   - Target: build completes in **under 3 minutes** (cold cache) or under 90s (warm cache).
   - Watch for TypeScript errors — the build runs `next build` which type-checks by default.

2. When status shows **"Ready"**, copy the deployment URL (e.g. `https://aegis-abc123.vercel.app`).

3. **Smoke test — landing page:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://aegis-abc123.vercel.app
   # Expected: 200
   ```

4. **Smoke test — API route:**
   ```bash
   curl -s -X POST https://aegis-abc123.vercel.app/api/agent/run \
     -H "content-type: application/json" \
     -d '{"prompt":"hello","provider":"openai"}'
   # Expected: HTTP 200, streaming text response begins immediately
   ```

5. **Smoke test — Sentry tunnel route (must not 502/503):**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://aegis-abc123.vercel.app/monitoring
   # Expected: 200, 404, or 405 — any of these is fine
   # NOT OK: 502 or 503 (means the tunnel route is broken)
   ```

6. Open **Sentry Dashboard → Performance** — a `gen_ai.*` span should appear for the `/api/agent/run` call above.

Run `scripts/verify-deploy.sh <URL>` to automate checks 3–5 (see §8 below).

---

## 6. Production Alias (Custom Domain)

If a custom alias was pre-configured:

```bash
# Assign a fixed alias so the URL is stable for the submission
pnpm dlx vercel alias set https://aegis-abc123.vercel.app aegis-codex.vercel.app
```

Update `NEXT_PUBLIC_APP_URL` in Vercel env to the aliased URL and trigger a redeploy:

```bash
pnpm dlx vercel env add NEXT_PUBLIC_APP_URL production
# Enter: https://aegis-codex.vercel.app
pnpm dlx vercel --prod
```

---

## 7. Post-Deploy Actions

Execute in order after the live URL is confirmed green.

```bash
# 1. Tag the release
git tag v0.1.0-hackathon
git push origin v0.1.0-hackathon

# 2. Create GitHub release
gh release create v0.1.0-hackathon \
  --title "Ægis Phase 1 — Codex Vienna 2026-04-18" \
  --notes-file docs/submission-description.md

# 3. Replace URL placeholders in docs (if any remain)
grep -r '{{VERCEL_URL}}' docs/ README.md 2>/dev/null && \
  echo "WARNING: placeholders still present — replace manually"
```

Update `README.md` live-demo link with the real Vercel URL before submission lock at 17:30.

---

## 8. Automated Verification Script

```bash
# Make executable once after pull
chmod +x scripts/verify-deploy.sh

# Run against production URL
./scripts/verify-deploy.sh https://aegis-codex.vercel.app
```

See `scripts/verify-deploy.sh` for full details. Exit code 0 = all checks pass.

---

## 9. Rollback Procedure

Use if the live URL is broken at 16:30 and cannot be fixed in 5 minutes.

**Option A — Vercel-native rollback (preferred, ~30s)**
1. Vercel Dashboard → **Deployments**.
2. Find the last green deployment (green "Ready" badge).
3. Click **...** (three dots) → **Promote to Production**.
4. Verify the live URL is serving the old version within 30s.

**Option B — Circuit breaker (if code bug, ~2 min)**
1. In Vercel Dashboard → **Settings → Environment Variables**, set `AEGIS_DEMO_MODE` to `true`.
2. Click **Redeploy** on the current deployment (no build needed for env-only changes).
3. Verify: fire any attack in the Testbed → scripted mock response must appear instantly.
4. Proceed with demo using scripted mocks.

**Option C — Emergency local fallback (last resort)**
1. `pnpm dev` on the presenter laptop (port 3000).
2. Connect laptop to conference wifi and note the LAN IP: `ipconfig getifaddr en0`.
3. Demo from phone or second device via `http://<laptop-ip>:3000`.
4. Announce to audience: "showing local build for reliability."

**Decision point: 16:30 CEST** — commit to live OR mock. No more switching after that point.

---

## 10. Acceptance Criteria (Issue #9)

- [ ] Live URL reachable in under 3 seconds (verified by `scripts/verify-deploy.sh`).
- [ ] `POST /api/agent/run` returns HTTP 200 and a Sentry span tagged `environment=production` appears in Sentry Performance.
- [ ] Source maps uploaded: Sentry issue for a B4 block shows TypeScript file names, not minified code.
- [ ] GitHub release `v0.1.0-hackathon` created with submission notes.
- [ ] `README.md` live-demo link contains the real Vercel URL.
