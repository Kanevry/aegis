# Setup Troubleshooting

Common wiring problems, with diagnostic curls and resolutions. See `README.md` for the happy-path setup.

---

## Sentry shows no events even though the app runs

**Symptom:** you fire a request (blocked or allowed), no 4xx/5xx in the terminal, but the Sentry UI stays empty — "Remain Calm / You need at least one project to use this view," or the project exists but Issues is empty.

**Root cause (most common):** your `SENTRY_AUTH_TOKEN` belongs to a different organisation than your `SENTRY_DSN` points to. Events ingest successfully into org A, but you are logged into org B's UI.

### Diagnose

```bash
# 1. Which org does your current auth token actually belong to?
curl -sS https://sentry.io/api/0/organizations/ \
  -H "authorization: Bearer $SENTRY_AUTH_TOKEN" \
  | jq -r '.[] | "\(.slug)\t\(.name)\t\(.id)"'
# → expect one row. The slug is your token's org.

# 2. Which org does your DSN actually ingest into?
# The DSN's "o<digits>" subdomain is the org-id.
echo "$SENTRY_DSN" | sed -E 's#https://[^@]+@o([0-9]+)\..*#org-id in DSN: \1#'

# 3. Cross-check: the numeric id from step 1 MUST match step 2.
```

If they differ, your DSN belongs to a different (possibly older) Sentry account or org. Either:
- get a DSN from the org your token owns (see README "Provision a Sentry project"), or
- get a token in the org the DSN lives in.

### Verify the DSN itself is live

Send a raw event directly to the DSN endpoint — no app, no SDK:

```bash
DSN="$SENTRY_DSN"
HOST=$(echo "$DSN" | sed -E 's#https://[^@]+@([^/]+)/.*#\1#')
KEY=$(echo  "$DSN" | sed -E 's#https://([^@]+)@.*#\1#')
PID=$(echo  "$DSN" | sed -E 's#.*/([0-9]+)$#\1#')
EID=$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')

curl -sS "https://$HOST/api/$PID/store/" \
  -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=$KEY, sentry_client=aegis-curl/1.0" \
  -H "content-type: application/json" \
  -d "{\"event_id\":\"$EID\",\"platform\":\"javascript\",\"level\":\"info\",\"message\":\"aegis-dsn-probe\"}"
# Expected: HTTP 200 with {"id":"<event_id>"}
# If 401/403: DSN public key revoked or project deleted.
# If 429: rate-limited — check your Sentry plan.
```

A successful probe that still doesn't show up in the UI confirms the org mismatch — check step 3 above.

### Did you restart the dev server?

Next.js reads `.env.local` **only at server boot**. After editing any env variable:

```bash
# Ctrl-C, then
pnpm dev
```

Code changes hot-reload; env changes do not.

---

## Anthropic requests fail silently (empty body, HTTP 200)

**Symptom:** `/api/agent/run?provider=anthropic` returns 200 in ~200 ms with an empty response; `/api/compare` shows `anthropic-off: error`, reason `"Provider invocation failed unexpectedly"`.

**Root cause:** invalid `ANTHROPIC_API_KEY`, or a model id that the key's plan can't access.

### Diagnose

```bash
curl -sS https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":20,"messages":[{"role":"user","content":"Reply with exactly: OK"}]}'
# HTTP 200 + "OK" → key works.
# HTTP 401 {"error":{"type":"authentication_error", ...}} → key revoked/rotated/malformed.
# HTTP 404 on model id → update the model alias (see below).
```

### Model ids used by Ægis

| File | Env/Usage | Model |
|---|---|---|
| `src/app/api/agent/run/route.ts` | `provider=anthropic` | `claude-haiku-4-5-20251001` |
| `src/lib/compare-service.ts` | A/B variants | `claude-haiku-4-5-20251001` |
| `src/app/api/agent/run/route.ts` | `provider=openai` (default) | `gpt-4o-mini` |

If Anthropic deprecates Haiku 4.5, update both files and the README Stack line together.

---

## Typecheck fails with `Cannot find module '@aegis/openclaw-client'`

**Root cause:** a parallel session has uncommitted changes in `apps/worker` or `src/app/api/webhook/openclaw/*` that depend on the workspace package before it's been published to the local pnpm store.

**Fix:**

```bash
pnpm install         # re-links workspace packages
pnpm typecheck
```

If the error persists, check `pnpm -r ls @aegis/openclaw-client` — it must show up as a linked workspace dep.

---

## `pnpm lint` shows `no-console` errors in files you didn't touch

Out-of-scope noise. The `scripts/*.mjs` and some route files carry pre-existing `console.log` statements introduced by parallel sessions. Fixing them is a separate housekeeping item — don't bundle it into an unrelated PR.

To confirm your change isn't the cause:

```bash
pnpm lint 2>&1 | grep -E "^/Users" | sort -u
# Only lines pointing inside your changed files are yours to fix.
```

---

## `pnpm build` fails with Sentry source-map upload error

**Root cause:** `SENTRY_AUTH_TOKEN` missing, revoked, or scoped to the wrong org.

**Fix:** regenerate a user auth token at https://sentry.io/settings/account/api/auth-tokens/ with scopes `project:releases` and `org:read` for the org that owns your DSN. Put it in `.env.local` as `SENTRY_AUTH_TOKEN`, restart.

If you do not need source-maps in dev, set `SENTRY_AUTH_TOKEN=` (empty) — the sentry webpack plugin skips upload when absent.

---

## None of the above — where to look next

1. Server logs in the terminal running `pnpm dev`. Search for `[Ægis]` prefix and any stack trace.
2. Browser console + network tab on `http://localhost:3000/dashboard/*` — Sentry Replay surfaces XHR failures.
3. Sentry's Stats page — if events land but are dropped, rate-limit or quota messages appear there.
4. Open an issue at https://github.com/Kanevry/aegis/issues with the failing curl, your provider, and the masked DSN (`o<id>.ingest...` is enough).
