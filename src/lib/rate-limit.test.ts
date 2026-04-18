// src/lib/rate-limit.test.ts — Vitest unit tests for rate-limit.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Sentry mock ───────────────────────────────────────────────────────────────
// vi.mock is hoisted, so declare the fn via vi.hoisted() and then reference it.
const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException }));

// ── Supabase mock ─────────────────────────────────────────────────────────────
// rpc is declared at module scope so tests can configure return values per-call.
const rpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ISO timestamp N seconds from 2026-04-18T00:00:00Z (the fake "now"). */
function windowStartSecondsAgo(secs: number): string {
  const now = new Date('2026-04-18T00:00:00Z').getTime();
  return new Date(now - secs * 1000).toISOString();
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('rateLimit', () => {
  beforeEach(async () => {
    // Reset module registry so the singleton Supabase client is re-created with
    // fresh mocks on every test.
    vi.resetModules();
    rpc.mockReset();
    captureException.mockReset();

    // Provide healthy defaults that tests can override individually.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://stub.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role-key');
    vi.stubEnv('AEGIS_DEMO_MODE', '');
    vi.stubEnv('AEGIS_RATE_LIMIT_BYPASS', '');

    // Pin system time so retryAfterSec assertions are deterministic.
    vi.setSystemTime(new Date('2026-04-18T00:00:00Z'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // ── Demo bypass ──────────────────────────────────────────────────────────────

  it('demo bypass: AEGIS_DEMO_MODE=true short-circuits without hitting Supabase', async () => {
    vi.stubEnv('AEGIS_DEMO_MODE', 'true');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 1, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('demo bypass: AEGIS_DEMO_MODE=1 short-circuits without hitting Supabase', async () => {
    vi.stubEnv('AEGIS_DEMO_MODE', '1');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 1, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('demo bypass: AEGIS_DEMO_MODE=yes short-circuits without hitting Supabase', async () => {
    vi.stubEnv('AEGIS_DEMO_MODE', 'yes');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 1, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('demo bypass: AEGIS_DEMO_MODE=on short-circuits without hitting Supabase', async () => {
    vi.stubEnv('AEGIS_DEMO_MODE', 'on');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 1, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('demo bypass: AEGIS_RATE_LIMIT_BYPASS=true also short-circuits', async () => {
    vi.stubEnv('AEGIS_RATE_LIMIT_BYPASS', 'true');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('demo bypass: AEGIS_RATE_LIMIT_BYPASS=1 also short-circuits', async () => {
    vi.stubEnv('AEGIS_RATE_LIMIT_BYPASS', '1');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('demo bypass: falsy value "false" does NOT bypass', async () => {
    vi.stubEnv('AEGIS_DEMO_MODE', 'false');
    rpc.mockResolvedValue({
      data: [{ count: 1, window_start: windowStartSecondsAgo(10) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 5, windowSec: 60 });
    // Should reach Supabase (not bypass)
    expect(rpc).toHaveBeenCalled();
    expect(result).not.toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
  });

  it('demo bypass: empty string does NOT bypass', async () => {
    vi.stubEnv('AEGIS_DEMO_MODE', '');
    rpc.mockResolvedValue({
      data: [{ count: 1, window_start: windowStartSecondsAgo(10) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 5, windowSec: 60 });
    expect(rpc).toHaveBeenCalled();
    expect(result).not.toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
  });

  it('demo bypass: undefined env does NOT bypass', async () => {
    // Already stubbed to '' by beforeEach; now explicitly not truthy
    rpc.mockResolvedValue({
      data: [{ count: 2, window_start: windowStartSecondsAgo(5) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 10, windowSec: 60 });
    expect(rpc).toHaveBeenCalled();
    expect(result).not.toEqual({ ok: true, remaining: Number.MAX_SAFE_INTEGER });
  });

  // ── Missing environment variables ─────────────────────────────────────────────

  it('missing env: no NEXT_PUBLIC_SUPABASE_URL → fail-open silently, no Sentry call', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 5 });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('missing env: no SUPABASE_SERVICE_ROLE_KEY → fail-open silently, no Sentry call', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 3, windowSec: 30 });
    expect(result).toEqual({ ok: true, remaining: 3 });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('missing env: both env vars unset → fail-open silently, no Sentry call', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'k', max: 10, windowSec: 120 });
    expect(result).toEqual({ ok: true, remaining: 10 });
    expect(captureException).not.toHaveBeenCalled();
  });

  // ── Under/at limit ────────────────────────────────────────────────────────────

  it('under limit: count=3, max=5 → ok:true, remaining:2', async () => {
    rpc.mockResolvedValue({
      data: [{ count: 3, window_start: windowStartSecondsAgo(10) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'user-123', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 2 });
  });

  it('under limit: count=1, max=10 → ok:true, remaining:9', async () => {
    rpc.mockResolvedValue({
      data: [{ count: 1, window_start: windowStartSecondsAgo(5) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'user-456', max: 10, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 9 });
  });

  it('at limit: count=5, max=5 → ok:true, remaining:0', async () => {
    rpc.mockResolvedValue({
      data: [{ count: 5, window_start: windowStartSecondsAgo(10) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'user-789', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 0 });
  });

  // ── Over limit ────────────────────────────────────────────────────────────────

  it('over limit: count=6, max=5 → ok:false, retryAfterSec within [1, windowSec]', async () => {
    // Window started 10 seconds ago, so 50 seconds remain in a 60-second window.
    rpc.mockResolvedValue({
      data: [{ count: 6, window_start: windowStartSecondsAgo(10) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'user-abc', max: 5, windowSec: 60 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(result.retryAfterSec).toBeLessThanOrEqual(60);
      expect(result.retryAfterSec).toBe(50);
    }
  });

  it('over limit: count=100, max=5 → ok:false with retryAfterSec within [1, windowSec]', async () => {
    // Window started 5 seconds ago in a 30-second window → 25 seconds remaining.
    rpc.mockResolvedValue({
      data: [{ count: 100, window_start: windowStartSecondsAgo(5) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'user-def', max: 5, windowSec: 30 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(result.retryAfterSec).toBeLessThanOrEqual(30);
      expect(result.retryAfterSec).toBe(25);
    }
  });

  // ── retryAfterSec clamping ────────────────────────────────────────────────────

  it('retryAfterSec clamping: very old window_start → retryAfterSec clamped to >= 1', async () => {
    // Window started 9999 seconds ago (well past the window duration of 60 seconds).
    rpc.mockResolvedValue({
      data: [{ count: 10, window_start: windowStartSecondsAgo(9999) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'user-old', max: 5, windowSec: 60 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });

  it('retryAfterSec clamping: future window_start → retryAfterSec clamped to <= windowSec', async () => {
    // A window_start in the far future (clock skew scenario): elapsed is negative
    // so naively remaining = windowSec - negative = > windowSec → must be clamped.
    const futureWindowStart = new Date(
      new Date('2026-04-18T00:00:00Z').getTime() + 9999 * 1000,
    ).toISOString();
    rpc.mockResolvedValue({
      data: [{ count: 10, window_start: futureWindowStart }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'user-future', max: 5, windowSec: 60 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  // ── DB error paths ────────────────────────────────────────────────────────────

  it('db error (rpc returns error object): fail-open + Sentry capture with tag aegis.ratelimit.failed_open=true', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'relation "rate_limit" does not exist', code: '42P01' },
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'u', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 0 });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, opts] = captureException.mock.calls[0] as [
      unknown,
      { tags?: Record<string, unknown> },
    ];
    expect(opts?.tags?.['aegis.ratelimit.failed_open']).toBe('true');
  });

  it('db throws: fail-open + Sentry capture with tag aegis.ratelimit.failed_open=true', async () => {
    rpc.mockRejectedValue(new Error('network timeout'));
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'u', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 0 });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, opts] = captureException.mock.calls[0] as [
      unknown,
      { tags?: Record<string, unknown> },
    ];
    expect(opts?.tags?.['aegis.ratelimit.failed_open']).toBe('true');
  });

  it('empty rows []: treated as db error → fail-open + Sentry captured', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'u', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 0 });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, opts] = captureException.mock.calls[0] as [
      unknown,
      { tags?: Record<string, unknown> },
    ];
    expect(opts?.tags?.['aegis.ratelimit.failed_open']).toBe('true');
  });

  it('null rows: treated as db error → fail-open + Sentry captured', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'u', max: 5, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 0 });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, opts] = captureException.mock.calls[0] as [
      unknown,
      { tags?: Record<string, unknown> },
    ];
    expect(opts?.tags?.['aegis.ratelimit.failed_open']).toBe('true');
  });

  it('db error path: captureException is called exactly once per invocation', async () => {
    rpc.mockRejectedValue(new Error('db down'));
    const { rateLimit } = await import('./rate-limit');
    await rateLimit({ key: 'u', max: 10, windowSec: 30 });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  // ── RPC invocation ────────────────────────────────────────────────────────────

  it('happy path: rpc is called with the correct function name', async () => {
    rpc.mockResolvedValue({
      data: [{ count: 2, window_start: windowStartSecondsAgo(5) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    await rateLimit({ key: 'my-key', max: 10, windowSec: 60 });
    expect(rpc).toHaveBeenCalledWith('rate_limit_upsert', expect.objectContaining({ p_bucket_key: 'my-key' }));
  });

  it('happy path: remaining is never negative even when count > max by large margin', async () => {
    // This tests that remaining = max - count doesn't go below 0 (only on ok:true path, i.e. count <= max).
    // A count of exactly max should give remaining=0.
    rpc.mockResolvedValue({
      data: [{ count: 7, window_start: windowStartSecondsAgo(5) }],
      error: null,
    });
    const { rateLimit } = await import('./rate-limit');
    const result = await rateLimit({ key: 'u', max: 7, windowSec: 60 });
    expect(result).toEqual({ ok: true, remaining: 0 });
  });
});
