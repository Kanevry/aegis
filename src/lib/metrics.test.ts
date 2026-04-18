import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { HardeningResult } from '@aegis/hardening';

vi.mock('./supabase', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { recordDecision, getMetricsSnapshot } from './metrics';
import { createServiceRoleClient } from './supabase';

// ── Helper: chainable Supabase mock ──────────────────────────────────────────

function makeSupabaseMock() {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;

  chain.from = vi.fn(() => chain);
  chain.insert = vi.fn(async () => ({ data: null, error: null }));
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(async () => ({ data: [], error: null }));

  return chain;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<HardeningResult> = {}): HardeningResult {
  return {
    safetyScore: 0.85,
    blockedLayers: [],
    piiDetected: false,
    injectionDetected: false,
    destructiveCount: 0,
    allowed: true,
    redactedPrompt: 'hello world',
    ...overrides,
  };
}

const BLOCKED_RESULT = makeResult({
  allowed: false,
  blockedLayers: ['B4'],
  injectionDetected: true,
  safetyScore: 0.3,
  reason: 'Injection detected',
});

const OPTS_OPENAI = { provider: 'openai' as const };
const OPTS_ANTHROPIC = { provider: 'anthropic' as const, patternId: 'pat-001' };

// ── recordDecision — happy path: allowed ──────────────────────────────────────

describe('recordDecision — allowed (ok)', () => {
  let mock: ReturnType<typeof makeSupabaseMock>;

  beforeEach(() => {
    mock = makeSupabaseMock();
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);
  });

  it('inserts one row with layer=B5 when result.allowed=true', async () => {
    await recordDecision(makeResult(), OPTS_OPENAI);

    expect(mock.from).toHaveBeenCalledWith('aegis_decisions');
    const payload = (mock.insert.mock.calls[0] as [Record<string, unknown>])[0];
    expect(payload.layer).toBe('B5');
    expect(payload.outcome).toBe('ok');
  });

  it('inserts safety_score from result', async () => {
    await recordDecision(makeResult({ safetyScore: 0.95 }), OPTS_OPENAI);

    const payload = (mock.insert.mock.calls[0] as [Record<string, unknown>])[0];
    expect(payload.safety_score).toBe(0.95);
  });

  it('populates all details fields', async () => {
    const result = makeResult({
      piiDetected: true,
      injectionDetected: false,
      destructiveCount: 0,
      reason: undefined,
    });
    await recordDecision(result, OPTS_ANTHROPIC);

    const payload = (mock.insert.mock.calls[0] as [Record<string, unknown>])[0];
    expect(payload.approval_id).toBeNull();
    expect(payload.message_id).toBeNull();
    expect(payload.details).toEqual({
      blocked_layers: [],
      pii_detected: true,
      injection_detected: false,
      destructive_count: 0,
      reason: null,
      pattern_id: 'pat-001',
      provider: 'anthropic',
    });
  });

  it('sets pattern_id=null when patternId is not provided', async () => {
    await recordDecision(makeResult(), OPTS_OPENAI);

    const payload = (mock.insert.mock.calls[0] as [Record<string, unknown>])[0];
    const details = payload.details as Record<string, unknown>;
    expect(details.pattern_id).toBeNull();
    expect(details.provider).toBe('openai');
  });
});

// ── recordDecision — blocked path ─────────────────────────────────────────────

describe('recordDecision — blocked', () => {
  let mock: ReturnType<typeof makeSupabaseMock>;

  beforeEach(() => {
    mock = makeSupabaseMock();
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);
  });

  it('inserts row with layer=blockedLayers[0] and outcome=blocked', async () => {
    await recordDecision(BLOCKED_RESULT, OPTS_OPENAI);

    const payload = (mock.insert.mock.calls[0] as [Record<string, unknown>])[0];
    expect(payload.layer).toBe('B4');
    expect(payload.outcome).toBe('blocked');
  });

  it('falls back to B5 when blockedLayers is empty but allowed=false', async () => {
    const result = makeResult({ allowed: false, blockedLayers: [] });
    await recordDecision(result, OPTS_OPENAI);

    const payload = (mock.insert.mock.calls[0] as [Record<string, unknown>])[0];
    expect(payload.layer).toBe('B5');
    expect(payload.outcome).toBe('blocked');
  });

  it('includes reason in details when present', async () => {
    await recordDecision(BLOCKED_RESULT, OPTS_OPENAI);

    const payload = (mock.insert.mock.calls[0] as [Record<string, unknown>])[0];
    const details = payload.details as Record<string, unknown>;
    expect(details.reason).toBe('Injection detected');
    expect(details.injection_detected).toBe(true);
  });
});

// ── recordDecision — env missing ──────────────────────────────────────────────

describe('recordDecision — env missing', () => {
  it('swallows error and does not throw when createServiceRoleClient throws', async () => {
    vi.mocked(createServiceRoleClient).mockImplementationOnce(() => {
      throw new Error('Supabase service-role env missing');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(recordDecision(makeResult(), OPTS_OPENAI)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[metrics] recordDecision failed',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});

// ── recordDecision — insert error ─────────────────────────────────────────────

describe('recordDecision — insert error', () => {
  it('swallows insert error and logs warning without throwing', async () => {
    const mock = makeSupabaseMock();
    mock.insert = vi.fn(async () => ({ data: null, error: { message: 'insert failed' } }));
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(recordDecision(makeResult(), OPTS_OPENAI)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[metrics] recordDecision failed',
      expect.objectContaining({ message: 'insert failed' }),
    );

    warnSpy.mockRestore();
  });
});

// ── getMetricsSnapshot — sample rows ─────────────────────────────────────────

describe('getMetricsSnapshot — with sample rows', () => {
  function makeRows() {
    return [
      { layer: 'B1', outcome: 'blocked', safety_score: 0.6, created_at: '2026-04-18T12:00:00.000Z' },
      { layer: 'B1', outcome: 'blocked', safety_score: 0.5, created_at: '2026-04-18T11:30:00.000Z' },
      { layer: 'B4', outcome: 'blocked', safety_score: 0.2, created_at: '2026-04-18T11:00:00.000Z' },
      { layer: 'B5', outcome: 'ok',      safety_score: 0.9, created_at: '2026-04-18T10:30:00.000Z' },
      { layer: 'B5', outcome: 'ok',      safety_score: null, created_at: '2026-04-18T10:00:00.000Z' },
    ];
  }

  beforeEach(() => {
    const mock = makeSupabaseMock();
    mock.limit = vi.fn(async () => ({ data: makeRows(), error: null }));
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);
  });

  it('returns correct firedCount and blockedCount', async () => {
    const snap = await getMetricsSnapshot();
    expect(snap.firedCount).toBe(5);
    expect(snap.blockedCount).toBe(3);
  });

  it('returns avgSafetyScore rounded to 2 decimals (excluding nulls)', async () => {
    // Rows with non-null scores: 0.6, 0.5, 0.2, 0.9 → sum=2.2, avg=0.55
    const snap = await getMetricsSnapshot();
    expect(snap.avgSafetyScore).toBe(0.55);
  });

  it('returns mostBlockedLayer=B1 (highest count among blocked)', async () => {
    // B1: 2, B4: 1 → B1 wins
    const snap = await getMetricsSnapshot();
    expect(snap.mostBlockedLayer).toBe('B1');
  });

  it('returns correct layerBreakdown (blocked counts only)', async () => {
    const snap = await getMetricsSnapshot();
    expect(snap.layerBreakdown).toEqual({ B1: 2, B2: 0, B3: 0, B4: 1, B5: 0 });
  });

  it('returns lastUpdatedAt equal to the latest created_at row', async () => {
    const snap = await getMetricsSnapshot();
    expect(snap.lastUpdatedAt).toBe('2026-04-18T12:00:00.000Z');
  });

  it('returns source=db', async () => {
    const snap = await getMetricsSnapshot();
    expect(snap.source).toBe('db');
  });

  it('tie-break: lowest B-number wins when two layers have equal blocked count', async () => {
    const rows = [
      { layer: 'B2', outcome: 'blocked', safety_score: 0.5, created_at: '2026-04-18T12:00:00.000Z' },
      { layer: 'B4', outcome: 'blocked', safety_score: 0.5, created_at: '2026-04-18T11:00:00.000Z' },
    ];
    const mock = makeSupabaseMock();
    mock.limit = vi.fn(async () => ({ data: rows, error: null }));
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);

    const snap = await getMetricsSnapshot();
    expect(snap.mostBlockedLayer).toBe('B2');
  });
});

// ── getMetricsSnapshot — empty table ─────────────────────────────────────────

describe('getMetricsSnapshot — empty table', () => {
  beforeEach(() => {
    const mock = makeSupabaseMock();
    mock.limit = vi.fn(async () => ({ data: [], error: null }));
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);
  });

  it('returns zeros and null fields', async () => {
    const snap = await getMetricsSnapshot();
    expect(snap.firedCount).toBe(0);
    expect(snap.blockedCount).toBe(0);
    expect(snap.avgSafetyScore).toBeNull();
    expect(snap.mostBlockedLayer).toBeNull();
  });

  it('returns all layer keys present with 0', async () => {
    const snap = await getMetricsSnapshot();
    expect(snap.layerBreakdown).toEqual({ B1: 0, B2: 0, B3: 0, B4: 0, B5: 0 });
  });

  it('returns source=db (not unavailable)', async () => {
    const snap = await getMetricsSnapshot();
    expect(snap.source).toBe('db');
  });

  it('returns lastUpdatedAt as a valid ISO string (fallback to now())', async () => {
    const before = new Date().toISOString();
    const snap = await getMetricsSnapshot();
    const after = new Date().toISOString();
    expect(snap.lastUpdatedAt >= before).toBe(true);
    expect(snap.lastUpdatedAt <= after).toBe(true);
  });
});

// ── getMetricsSnapshot — env missing ─────────────────────────────────────────

describe('getMetricsSnapshot — env missing', () => {
  it('returns zeros with source=unavailable and valid ISO lastUpdatedAt', async () => {
    vi.mocked(createServiceRoleClient).mockImplementationOnce(() => {
      throw new Error('Supabase service-role env missing');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const before = new Date().toISOString();
    const snap = await getMetricsSnapshot();
    const after = new Date().toISOString();

    expect(snap.source).toBe('unavailable');
    expect(snap.firedCount).toBe(0);
    expect(snap.blockedCount).toBe(0);
    expect(snap.avgSafetyScore).toBeNull();
    expect(snap.mostBlockedLayer).toBeNull();
    expect(snap.layerBreakdown).toEqual({ B1: 0, B2: 0, B3: 0, B4: 0, B5: 0 });
    expect(snap.lastUpdatedAt >= before).toBe(true);
    expect(snap.lastUpdatedAt <= after).toBe(true);

    warnSpy.mockRestore();
  });

  it('returns source=unavailable on Supabase query error', async () => {
    const mock = makeSupabaseMock();
    mock.limit = vi.fn(async () => ({ data: null, error: { message: 'connection refused' } }));
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const snap = await getMetricsSnapshot();
    expect(snap.source).toBe('unavailable');

    warnSpy.mockRestore();
  });
});
