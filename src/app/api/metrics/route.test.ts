// src/app/api/metrics/route.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetMetricsSnapshot, mockStartSpan, mockCaptureException } = vi.hoisted(() => ({
  mockGetMetricsSnapshot: vi.fn(),
  mockStartSpan: vi.fn((_opts: unknown, fn: (span: { setAttributes: ReturnType<typeof vi.fn> }) => unknown) =>
    fn({ setAttributes: vi.fn() }),
  ),
  mockCaptureException: vi.fn(),
}));

vi.mock('@/lib/metrics', () => ({
  getMetricsSnapshot: mockGetMetricsSnapshot,
}));

vi.mock('@sentry/nextjs', () => ({
  startSpan: mockStartSpan,
  captureException: mockCaptureException,
}));

import { GET } from './route';
import { MetricsResponseSchema } from './schema';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<{
  firedCount: number;
  blockedCount: number;
  avgSafetyScore: number | null;
  mostBlockedLayer: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | null;
  layerBreakdown: Record<'B1' | 'B2' | 'B3' | 'B4' | 'B5', number>;
  lastUpdatedAt: string;
  source: 'db' | 'unavailable';
}> = {}) {
  return {
    firedCount: 42,
    blockedCount: 7,
    avgSafetyScore: 0.85,
    mostBlockedLayer: 'B4' as const,
    layerBreakdown: { B1: 1, B2: 2, B3: 0, B4: 3, B5: 1 },
    lastUpdatedAt: new Date().toISOString(),
    source: 'db' as const,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/metrics', () => {
  beforeEach(() => {
    mockGetMetricsSnapshot.mockReset();
    mockStartSpan.mockReset();
    mockCaptureException.mockReset();

    // Default: startSpan executes the callback with a mock span
    mockStartSpan.mockImplementation(
      (_opts: unknown, fn: (span: { setAttributes: ReturnType<typeof vi.fn> }) => unknown) =>
        fn({ setAttributes: vi.fn() }),
    );
  });

  it('returns 200 with a schema-valid body on the happy path', async () => {
    mockGetMetricsSnapshot.mockResolvedValue(makeSnapshot());

    const res = await GET();

    expect(res.status).toBe(200);

    const body = await res.json() as unknown;
    // Must not throw — snapshot matches MetricsResponseSchema
    expect(() => MetricsResponseSchema.parse(body)).not.toThrow();
  });

  it('sets cache-control: no-store on success', async () => {
    mockGetMetricsSnapshot.mockResolvedValue(makeSnapshot());

    const res = await GET();

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 200 and reflects source: unavailable without hiding it', async () => {
    const snapshot = makeSnapshot({ source: 'unavailable' });
    mockGetMetricsSnapshot.mockResolvedValue(snapshot);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json() as { source: string };
    expect(body.source).toBe('unavailable');
  });

  it('returns 200 when avgSafetyScore is null', async () => {
    mockGetMetricsSnapshot.mockResolvedValue(
      makeSnapshot({ avgSafetyScore: null, firedCount: 0, blockedCount: 0 }),
    );

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json() as { avgSafetyScore: unknown };
    expect(body.avgSafetyScore).toBeNull();
  });

  it('returns 500 with { error: "metrics_unavailable" } when getMetricsSnapshot throws', async () => {
    const cause = new Error('pg connection refused');
    mockGetMetricsSnapshot.mockRejectedValue(cause);

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('metrics_unavailable');
    // Must not leak the inner message
    expect(JSON.stringify(body)).not.toContain('pg connection refused');
  });

  it('calls Sentry.captureException when getMetricsSnapshot throws', async () => {
    const cause = new Error('db error');
    mockGetMetricsSnapshot.mockRejectedValue(cause);

    await GET();

    expect(mockCaptureException).toHaveBeenCalledWith(cause);
  });

  it('does not call Sentry.captureException on success', async () => {
    mockGetMetricsSnapshot.mockResolvedValue(makeSnapshot());

    await GET();

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
