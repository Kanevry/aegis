// src/lib/rate-limit.ts
// Leaky-bucket rate limiter backed by Postgres (see migration 0004).
//
// Design decision: fails open on DB errors.
// Rationale: a dead rate-limiter MUST NOT block all traffic. On failure we
// allow the request through and capture the error in Sentry so the on-call
// engineer can investigate. One Sentry event per failure, not per request.
//
// Client choice: Supabase service-role client via supabase.rpc() — this is
// the canonical server-side client for this project (src/lib/supabase.ts).
// The atomic upsert runs inside the rate_limit_upsert Postgres function
// (defined in 0004_rate_limit_buckets.sql) to guarantee a single round-trip.

import * as Sentry from "@sentry/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type RateLimitInput = {
  /** Namespaced key, e.g. `login:ip:1.2.3.4` or `chat:user:<id>` */
  key: string;
  /** Maximum requests allowed in the window */
  max: number;
  /** Window length in seconds, e.g. 60 */
  windowSec: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

// ---------------------------------------------------------------------------
// Singleton client — lazy-initialised once per process.
// Route handlers call rateLimit() on every request; we must not open a new
// connection per call.
// ---------------------------------------------------------------------------

let _client: SupabaseClient | null = null;
let _missingEnvWarned = false;

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isBypassed(): boolean {
  return (
    isTruthy(process.env["AEGIS_DEMO_MODE"]) ||
    isTruthy(process.env["AEGIS_RATE_LIMIT_BYPASS"])
  );
}

function getClient(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !key) {
    if (!_missingEnvWarned) {
      _missingEnvWarned = true;
      // One warn on module load only — avoids spam in dev without Postgres.
      console.warn(
        "[rate-limit] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY " +
          "is unset. Rate limiting is disabled (fail-open, no Sentry capture).",
      );
    }
    return null;
  }

  // Inline client construction so rate-limit.ts has no dep on src/lib/supabase.ts
  // (cleaner boundary; no @aegis/types required).
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}

// ---------------------------------------------------------------------------
// RPC result shape returned by rate_limit_upsert(p_bucket_key, p_window_sec)
// ---------------------------------------------------------------------------

type UpsertRow = {
  count: number;
  window_start: string; // ISO 8601 from Supabase
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Leaky-bucket rate limiter backed by Postgres (see migration 0004).
 * Fails open on DB errors — rate limiting must never take down the app.
 *
 * @example
 * const result = await rateLimit({ key: `chat:user:${userId}`, max: 60, windowSec: 60 });
 * if (!result.ok) return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } });
 */
export async function rateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const { key, max, windowSec } = input;

  // Demo bypass — when AEGIS_DEMO_MODE or AEGIS_RATE_LIMIT_BYPASS is truthy,
  // short-circuit to always-allow without touching Postgres. The 429 path
  // and telemetry wiring stay in the routes; only the threshold is lifted.
  // Intentional: hackathon demos hammer endpoints faster than any prod limit.
  if (isBypassed()) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  const client = getClient();

  // No Postgres available (dev without env vars) — fail open silently.
  if (!client) {
    return { ok: true, remaining: max };
  }

  try {
    const { data, error } = await client.rpc("rate_limit_upsert", {
      p_bucket_key: key,
      p_window_sec: windowSec,
    });

    if (error) {
      throw new Error(error.message);
    }

    // supabase.rpc returns an array for set-returning functions.
    const rows = data as UpsertRow[] | null;
    if (!rows || rows.length === 0) {
      throw new Error("rate_limit_upsert returned no rows");
    }

    const row = rows[0] satisfies UpsertRow;
    const currentCount = row.count;

    if (currentCount <= max) {
      return { ok: true, remaining: max - currentCount };
    }

    // Over limit — compute seconds until the window resets.
    const windowStartMs = new Date(row.window_start).getTime();
    const windowEndMs = windowStartMs + windowSec * 1000;
    const nowMs = Date.now();
    const rawRetry = Math.ceil((windowEndMs - nowMs) / 1000);
    const retryAfterSec = Math.max(1, Math.min(rawRetry, windowSec));

    return { ok: false, retryAfterSec };
  } catch (err) {
    // Fail open: allow the request, capture one Sentry event per failure.
    // This is intentional — a broken rate-limiter must not block all traffic.
    Sentry.captureException(err, {
      tags: { "aegis.ratelimit.failed_open": "true" },
    });
    return { ok: true, remaining: 0 };
  }
}
