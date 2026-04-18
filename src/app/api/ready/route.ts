// src/app/api/ready/route.ts — GET /api/ready (readiness)
// Returns 200 when all configured (non-skipped) dependencies are reachable,
// 503 otherwise.

export const runtime = "nodejs";

const CACHE_HEADERS = { "Cache-Control": "no-store" } as const;
const TIMEOUT_MS = 5_000;

// ── Check shapes ──────────────────────────────────────────────────────────────

interface CheckOk {
  ok: true;
  latency_ms: number;
}

interface CheckSkipped {
  ok: false;
  skipped: true;
  reason: string;
}

interface CheckFailed {
  ok: false;
  skipped?: false;
  reason: string;
  latency_ms?: number;
}

type CheckResult = CheckOk | CheckSkipped | CheckFailed;

// ── Dependency checks ─────────────────────────────────────────────────────────

async function checkSupabase(): Promise<CheckResult> {
  const url =
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ??
    process.env["SUPABASE_URL"];

  if (!url) {
    return { ok: false, skipped: true, reason: "SUPABASE_URL not configured" };
  }

  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const target = `${url.replace(/\/$/, "")}/rest/v1/`;
  const start = Date.now();

  try {
    const headers: HeadersInit = anonKey ? { apikey: anonKey } : {};
    const res = await fetch(target, {
      method: anonKey ? "GET" : "HEAD",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latency_ms = Date.now() - start;

    // Any HTTP response (even 4xx) means the endpoint is reachable.
    if (res.ok || res.status < 500) {
      return { ok: true, latency_ms };
    }
    return { ok: false, latency_ms, reason: `HTTP ${res.status}` };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const reason =
      err instanceof Error ? err.message : "unknown error";
    return { ok: false, latency_ms, reason };
  }
}

async function checkOpenclaw(): Promise<CheckResult> {
  const base =
    process.env["OPENCLAW_BASE_URL"] ?? "http://localhost:8787";
  const target = `${base.replace(/\/$/, "")}/v1/models`;
  const start = Date.now();

  try {
    const res = await fetch(target, {
      method: "HEAD",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latency_ms = Date.now() - start;

    // Any HTTP response means the process is up.
    if (res.ok || res.status < 500) {
      return { ok: true, latency_ms };
    }
    return { ok: false, latency_ms, reason: `HTTP ${res.status}` };
  } catch (err) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : "unknown error";
    const reason =
      msg.toLowerCase().includes("econnrefused") ||
      msg.toLowerCase().includes("enotfound") ||
      msg.toLowerCase().includes("failed to fetch")
        ? "dns/econnrefused"
        : msg;
    return { ok: false, latency_ms, reason };
  }
}

async function checkPgboss(): Promise<CheckResult> {
  // pg-boss query helper is not yet available on this route boundary.
  // Skip rather than fail — do not add a new pg-boss dependency here.
  return {
    ok: false,
    skipped: true,
    reason: "pgboss helper not implemented",
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const [supabase, openclaw, pgboss] = await Promise.all([
    checkSupabase(),
    checkOpenclaw(),
    checkPgboss(),
  ]);

  const checks = { supabase, openclaw, pgboss };

  // Overall ok: all non-skipped checks must pass.
  const overallOk = Object.values(checks).every(
    (c) => c.ok || ("skipped" in c && c.skipped === true),
  );

  return new Response(
    JSON.stringify({ ok: overallOk, checks }),
    {
      status: overallOk ? 200 : 503,
      headers: { "content-type": "application/json", ...CACHE_HEADERS },
    },
  );
}
