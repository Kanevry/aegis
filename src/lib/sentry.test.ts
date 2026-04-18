import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redactSecrets } from '@aegis/hardening';

// ── Mock @sentry/nextjs before importing the module under test ────────────────
// vi.mock is hoisted, so mock functions must be declared with vi.hoisted().
const { mockStartSpan, mockCaptureException } = vi.hoisted(() => ({
  mockStartSpan: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  startSpan: mockStartSpan,
  captureException: mockCaptureException,
}));

// Import AFTER the mock is registered.
import { AegisBlockedException, withHardeningSpan, captureAegisBlock } from './sentry';
import type { HardeningResult } from '@aegis/hardening';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<HardeningResult> = {}): HardeningResult {
  return {
    safetyScore: 0.6,
    blockedLayers: ['B1'],
    piiDetected: false,
    injectionDetected: false,
    destructiveCount: 0,
    allowed: false,
    redactedPrompt: 'redacted',
    reason: 'path traversal detected',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AegisBlockedException', () => {
  it('has name === "AegisBlockedException"', () => {
    const exc = new AegisBlockedException(makeResult());
    expect(exc.name).toBe('AegisBlockedException');
  });

  it('carries safetyScore from result', () => {
    const exc = new AegisBlockedException(makeResult({ safetyScore: 0.2 }));
    expect(exc.safetyScore).toBe(0.2);
  });

  it('carries blockedLayers from result', () => {
    const exc = new AegisBlockedException(makeResult({ blockedLayers: ['B1', 'B4'] }));
    expect(exc.blockedLayers).toEqual(['B1', 'B4']);
  });

  it('includes reason in the message', () => {
    const exc = new AegisBlockedException(makeResult({ reason: 'path traversal detected' }));
    expect(exc.message).toContain('path traversal detected');
  });

  it('falls back to "hardening violation" when reason is undefined', () => {
    const exc = new AegisBlockedException(makeResult({ reason: undefined }));
    expect(exc.message).toContain('hardening violation');
  });

  it('is an instance of Error', () => {
    expect(new AegisBlockedException(makeResult())).toBeInstanceOf(Error);
  });
});

describe('withHardeningSpan', () => {
  beforeEach(() => {
    mockStartSpan.mockReset();
    // Simulate Sentry.startSpan calling fn and returning its result.
    mockStartSpan.mockImplementation((_spanCtx: unknown, fn: () => unknown) => fn());
  });

  it('calls Sentry.startSpan with op "gen_ai.invoke_agent"', async () => {
    const result = makeResult({ allowed: true });
    await withHardeningSpan('aegis.run', result, async () => 'ok');
    const [spanCtx] = mockStartSpan.mock.calls[0] as [{ op: string; name: string; attributes: Record<string, unknown> }];
    expect(spanCtx.op).toBe('gen_ai.invoke_agent');
  });

  it('passes the correct name to the span', async () => {
    const result = makeResult({ allowed: true });
    await withHardeningSpan('aegis.run', result, async () => 'ok');
    const [spanCtx] = mockStartSpan.mock.calls[0] as [{ name: string }];
    expect(spanCtx.name).toBe('aegis.run');
  });

  it('sets aegis.safety_score attribute', async () => {
    const result = makeResult({ safetyScore: 0.75, allowed: true });
    await withHardeningSpan('aegis.run', result, async () => 'ok');
    const [spanCtx] = mockStartSpan.mock.calls[0] as [{ attributes: Record<string, unknown> }];
    expect(spanCtx.attributes['aegis.safety_score']).toBe(0.75);
  });

  it('sets aegis.blocked_layers as comma-joined string', async () => {
    const result = makeResult({ blockedLayers: ['B1', 'B4'], allowed: false });
    await withHardeningSpan('aegis.run', result, async () => 'blocked');
    const [spanCtx] = mockStartSpan.mock.calls[0] as [{ attributes: Record<string, unknown> }];
    expect(spanCtx.attributes['aegis.blocked_layers']).toBe('B1,B4');
  });

  it('sets aegis.outcome to "blocked" when !allowed', async () => {
    const result = makeResult({ allowed: false });
    await withHardeningSpan('aegis.run', result, async () => 'blocked');
    const [spanCtx] = mockStartSpan.mock.calls[0] as [{ attributes: Record<string, unknown> }];
    expect(spanCtx.attributes['aegis.outcome']).toBe('blocked');
  });

  it('sets aegis.outcome to "allowed" when allowed', async () => {
    const result = makeResult({ allowed: true });
    await withHardeningSpan('aegis.run', result, async () => 'ok');
    const [spanCtx] = mockStartSpan.mock.calls[0] as [{ attributes: Record<string, unknown> }];
    expect(spanCtx.attributes['aegis.outcome']).toBe('allowed');
  });

  it('merges extraAttrs into span attributes', async () => {
    const result = makeResult({ allowed: true });
    await withHardeningSpan('aegis.run', result, async () => 'ok', { 'gen_ai.system': 'openai' });
    const [spanCtx] = mockStartSpan.mock.calls[0] as [{ attributes: Record<string, unknown> }];
    expect(spanCtx.attributes['gen_ai.system']).toBe('openai');
  });

  it('returns the value from the wrapped fn', async () => {
    const result = makeResult({ allowed: true });
    const value = await withHardeningSpan('aegis.run', result, async () => 42);
    expect(value).toBe(42);
  });
});

describe('captureAegisBlock', () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
  });

  it('calls Sentry.captureException with an AegisBlockedException', () => {
    captureAegisBlock(makeResult());
    const [exc] = mockCaptureException.mock.calls[0] as [unknown];
    expect(exc).toBeInstanceOf(AegisBlockedException);
  });

  it('uses fingerprint ["aegis-block", "B1"] when no patternId', () => {
    captureAegisBlock(makeResult({ blockedLayers: ['B1'] }));
    const [, opts] = mockCaptureException.mock.calls[0] as [unknown, { fingerprint: string[] }];
    expect(opts.fingerprint).toEqual(['aegis-block', 'B1']);
  });

  it('uses fingerprint ["aegis-block", "B1", "path-traversal-001"] when patternId is provided', () => {
    captureAegisBlock(makeResult({ blockedLayers: ['B1'] }), 'path-traversal-001');
    const [, opts] = mockCaptureException.mock.calls[0] as [unknown, { fingerprint: string[] }];
    expect(opts.fingerprint).toEqual(['aegis-block', 'B1', 'path-traversal-001']);
  });

  it('trims patternId before adding it to the fingerprint', () => {
    captureAegisBlock(makeResult({ blockedLayers: ['B1'] }), '  path-traversal-001  ');
    const [, opts] = mockCaptureException.mock.calls[0] as [unknown, { fingerprint: string[] }];
    expect(opts.fingerprint).toEqual(['aegis-block', 'B1', 'path-traversal-001']);
  });

  it('omits blank patternId values from the fingerprint', () => {
    captureAegisBlock(makeResult({ blockedLayers: ['B1'] }), '   ');
    const [, opts] = mockCaptureException.mock.calls[0] as [unknown, { fingerprint: string[] }];
    expect(opts.fingerprint).toEqual(['aegis-block', 'B1']);
  });

  it('sets aegis.layer tag to primary blocked layer', () => {
    captureAegisBlock(makeResult({ blockedLayers: ['B4'] }));
    const [, opts] = mockCaptureException.mock.calls[0] as [unknown, { tags: Record<string, string> }];
    expect(opts.tags['aegis.layer']).toBe('B4');
  });

  it('falls back to "unknown" layer when blockedLayers is empty', () => {
    captureAegisBlock(makeResult({ blockedLayers: [] }));
    const [, opts] = mockCaptureException.mock.calls[0] as [unknown, { fingerprint: string[]; tags: Record<string, string> }];
    expect(opts.fingerprint[1]).toBe('unknown');
    expect(opts.tags['aegis.layer']).toBe('unknown');
  });

  it('attaches safetyScore, blockedLayers and reason as extra context', () => {
    const result = makeResult({ safetyScore: 0.3, blockedLayers: ['B1'], reason: 'test reason' });
    captureAegisBlock(result);
    const [, opts] = mockCaptureException.mock.calls[0] as [unknown, { extra: Record<string, unknown> }];
    expect(opts.extra['safetyScore']).toBe(0.3);
    expect(opts.extra['blockedLayers']).toEqual(['B1']);
    expect(opts.extra['reason']).toBe('test reason');
  });
});

describe('redactSecrets integration sanity', () => {
  // Split prefix so GitHub Secret Scanning does not flag this test file.
  const OPENAI_PREFIX = ['sk', 'proj'].join('-') + '-';

  it('redacts an OpenAI key from a message string', () => {
    const msg = `Found API key ${OPENAI_PREFIX}abc1234567890abcdefghijklmnopqrstuv`;
    const { text } = redactSecrets(msg);
    expect(text).not.toContain(OPENAI_PREFIX);
    expect(text).toContain('[REDACTED:OPENAI_KEY]');
  });
});
