import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HardeningResult } from '@aegis/hardening';
import {
  BASE_AEGIS_SPAN_ATTRIBUTE_KEYS,
  BaseAegisSpanAttributesSchema,
} from './sentry-contract';

const { mockStartSpan, mockCaptureException, capturedSpans, capturedExceptions } = vi.hoisted(
  () => ({
    mockStartSpan: vi.fn(),
    mockCaptureException: vi.fn(),
    capturedSpans: [] as Array<{
      name: string;
      op: string;
      attributes: Record<string, unknown>;
    }>,
    capturedExceptions: [] as Array<{
      error: unknown;
      options: Record<string, unknown> | undefined;
    }>,
  }),
);

vi.mock('@sentry/nextjs', () => ({
  startSpan: mockStartSpan,
  captureException: mockCaptureException,
}));

import { captureAegisBlock, withHardeningSpan } from './sentry';

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

function sortEntries(attributes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)));
}

function expectedKeys(extraKeys: string[] = []) {
  return [...BASE_AEGIS_SPAN_ATTRIBUTE_KEYS, ...extraKeys].sort();
}

describe('Aegis Sentry contract', () => {
  beforeEach(() => {
    capturedSpans.length = 0;
    capturedExceptions.length = 0;
    mockStartSpan.mockReset();
    mockCaptureException.mockReset();
    mockStartSpan.mockImplementation(
      (
        spanContext: { name: string; op: string; attributes: Record<string, unknown> },
        fn: () => unknown,
      ) => {
        capturedSpans.push(spanContext);
        return fn();
      },
    );
    mockCaptureException.mockImplementation(
      (error: unknown, options: Record<string, unknown> | undefined) => {
        capturedExceptions.push({ error, options });
      },
    );
  });

  it('keeps the allowed run-span attribute contract stable', async () => {
    await withHardeningSpan(
      'aegis.run',
      makeResult({ allowed: true, blockedLayers: [], safetyScore: 0.92 }),
      async () => 'ok',
      {
        'gen_ai.request.model': 'gpt-4o-mini',
        'gen_ai.system': 'openai',
      },
    );

    const span = capturedSpans[0];
    expect(span.name).toBe('aegis.run');
    expect(BaseAegisSpanAttributesSchema.parse(span.attributes)).toBeTruthy();
    expect(Object.keys(span.attributes).sort()).toEqual(
      expectedKeys(['gen_ai.request.model', 'gen_ai.system']),
    );
    expect(sortEntries(span.attributes)).toMatchInlineSnapshot(`
      {
        "aegis.blocked_layers": "",
        "aegis.destructive_count": 0,
        "aegis.injection_detected": false,
        "aegis.outcome": "allowed",
        "aegis.pii_detected": false,
        "aegis.safety_score": 0.92,
        "gen_ai.request.model": "gpt-4o-mini",
        "gen_ai.system": "openai",
      }
    `);
  });

  it('keeps the compare-span attribute contract stable', async () => {
    await withHardeningSpan(
      'aegis.compare',
      makeResult({ blockedLayers: ['B1', 'B4'] }),
      async () => 'blocked',
      {
        'aegis.comparison.variant': 'openai-hardened',
        'gen_ai.system': 'openai',
      },
    );

    const span = capturedSpans[0];
    expect(span.name).toBe('aegis.compare');
    expect(BaseAegisSpanAttributesSchema.parse(span.attributes)).toBeTruthy();
    expect(Object.keys(span.attributes).sort()).toEqual(
      expectedKeys(['aegis.comparison.variant', 'gen_ai.system']),
    );
    expect(sortEntries(span.attributes)).toMatchInlineSnapshot(`
      {
        "aegis.blocked_layers": "B1,B4",
        "aegis.comparison.variant": "openai-hardened",
        "aegis.destructive_count": 0,
        "aegis.injection_detected": false,
        "aegis.outcome": "blocked",
        "aegis.pii_detected": false,
        "aegis.safety_score": 0.6,
        "gen_ai.system": "openai",
      }
    `);
  });

  it('keeps the block-capture contract stable', () => {
    captureAegisBlock(makeResult({ blockedLayers: ['B4'], safetyScore: 0.24 }), 'prompt-injection-001');

    expect(capturedExceptions).toHaveLength(1);
    expect(capturedExceptions[0]?.options).toMatchInlineSnapshot(`
      {
        "extra": {
          "blockedLayers": [
            "B4",
          ],
          "reason": "path traversal detected",
          "safetyScore": 0.24,
        },
        "fingerprint": [
          "aegis-block",
          "B4",
          "prompt-injection-001",
        ],
        "tags": {
          "aegis.layer": "B4",
          "aegis.outcome": "blocked",
        },
      }
    `);
  });
});
