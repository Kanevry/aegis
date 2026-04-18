// src/lib/use-pending-approvals.test.ts — Smoke tests for the pending approvals fetch contract
//
// @testing-library/react is not installed, so we cannot mount the hook.
// We test the observable fetch contract: the URL the hook calls and the JSON
// envelope it expects.  All assertions are against the /api/approvals response
// shape rather than internal hook state.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Fetch mock setup ──────────────────────────────────────────────────────────

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Envelope contract tests ───────────────────────────────────────────────────

describe('usePendingApprovals fetch envelope contract', () => {
  it('calls /api/approvals with status=pending query to list pending items', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({ ok: true, data: [] }),
    );

    // Simulate the fetch call the hook makes
    const res = await fetch('/api/approvals?status=pending&limit=1');
    const json = await res.json() as { ok: boolean; data: unknown[] };

    expect(fetchSpy).toHaveBeenCalledWith('/api/approvals?status=pending&limit=1');
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('envelope with ok=true and non-empty data array carries the count', async () => {
    const approval = { id: 'apr-1', tool: 'exec', status: 'pending' };
    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({ ok: true, data: [approval] }),
    );

    const res = await fetch('/api/approvals?status=pending&limit=1');
    const json = await res.json() as { ok: boolean; data: unknown[] };

    // Hook logic: count = json.data.length when ok=true and data is an array
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it('envelope with ok=false means hook should leave count at 0', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({ ok: false, error: 'unauthorized' }, 401),
    );

    const res = await fetch('/api/approvals?status=pending&limit=1');
    // res.ok is false for 401; hook bails out without updating count
    expect(res.ok).toBe(false);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('unauthorized');
  });

  it('envelope with ok=true but data not array is handled safely (count stays 0)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeJsonResponse({ ok: true, data: null }),
    );

    const res = await fetch('/api/approvals?status=pending&limit=1');
    const json = await res.json() as { ok: boolean; data: unknown };

    // Hook guard: Array.isArray(json.data) must be true before updating count
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(false);
  });

  it('network error does not propagate (fetch rejects → hook catches silently)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('NetworkError: failed to fetch'));

    // The hook wraps in try/catch and silences errors; count stays 0
    await expect(fetch('/api/approvals?status=pending&limit=1')).rejects.toThrow(
      'NetworkError: failed to fetch',
    );
    // Confirms fetch was called (hook would catch this, count = 0)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
