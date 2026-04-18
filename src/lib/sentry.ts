// src/lib/sentry.ts — Ægis Sentry primitives
// Three exports used across the Next.js app:
//   AegisBlockedException — stable exception class for Sentry grouping
//   withHardeningSpan     — wraps an async fn in a gen_ai.* span with aegis.* attributes
//   captureAegisBlock     — fires captureException with a stable fingerprint on block

import * as Sentry from '@sentry/nextjs';
import type { HardeningResult } from '@aegis/hardening';

/**
 * Thrown (and captured) whenever Ægis hardening rejects a request.
 * The stable `name` ensures Sentry's issue-grouping treats all blocks as
 * instances of the same problem type rather than one-off Error objects.
 */
export class AegisBlockedException extends Error {
  readonly safetyScore: number;
  readonly blockedLayers: string[];

  constructor(result: HardeningResult) {
    super(`Ægis blocked request: ${result.reason ?? 'hardening violation'}`);
    this.name = 'AegisBlockedException';
    this.safetyScore = result.safetyScore;
    this.blockedLayers = result.blockedLayers;
  }
}

/**
 * Wraps `fn` in a Sentry span carrying all Ægis hardening attributes.
 * The span op is `gen_ai.invoke_agent` so it appears in the AI SDK trace tree.
 *
 * @param name       - Span name (e.g. `'aegis.run'`)
 * @param result     - Hardening result to attach as span attributes
 * @param fn         - Async function to execute inside the span
 * @param extraAttrs - Optional additional span attributes (e.g. `gen_ai.system`)
 */
export function withHardeningSpan<T>(
  name: string,
  result: HardeningResult,
  fn: () => Promise<T>,
  extraAttrs: Record<string, string | number | boolean> = {},
): Promise<T> {
  return Sentry.startSpan(
    {
      op: 'gen_ai.invoke_agent',
      name,
      attributes: {
        'aegis.safety_score': result.safetyScore,
        'aegis.blocked_layers': result.blockedLayers.join(','),
        'aegis.outcome': result.allowed ? 'allowed' : 'blocked',
        'aegis.pii_detected': result.piiDetected,
        'aegis.injection_detected': result.injectionDetected,
        'aegis.destructive_count': result.destructiveCount,
        ...extraAttrs,
      },
    },
    fn,
  );
}

/**
 * Captures a hardening block as a Sentry exception with a stable fingerprint.
 * The fingerprint is `['aegis-block', layer]` or `['aegis-block', layer, patternId]`
 * so Sentry groups all blocks of the same layer (and optionally pattern) together.
 *
 * @param result    - Hardening result describing why the request was blocked
 * @param patternId - Optional attack-pattern ID for deeper grouping (e.g. `'path-traversal-001'`)
 */
export function captureAegisBlock(result: HardeningResult, patternId?: string): void {
  const primaryLayer = result.blockedLayers[0] ?? 'unknown';
  const fingerprint = patternId
    ? ['aegis-block', primaryLayer, patternId]
    : ['aegis-block', primaryLayer];

  Sentry.captureException(new AegisBlockedException(result), {
    fingerprint,
    tags: {
      'aegis.outcome': 'blocked',
      'aegis.layer': primaryLayer,
    },
    extra: {
      safetyScore: result.safetyScore,
      blockedLayers: result.blockedLayers,
      reason: result.reason,
    },
  });
}
