import { z } from 'zod';
import type { HardeningResult } from '@aegis/hardening';

export const BASE_AEGIS_SPAN_ATTRIBUTE_KEYS = [
  'aegis.safety_score',
  'aegis.blocked_layers',
  'aegis.outcome',
  'aegis.pii_detected',
  'aegis.injection_detected',
  'aegis.destructive_count',
] as const;

export const BaseAegisSpanAttributesSchema = z.object({
  'aegis.safety_score': z.number(),
  'aegis.blocked_layers': z.string(),
  'aegis.outcome': z.enum(['allowed', 'blocked']),
  'aegis.pii_detected': z.boolean(),
  'aegis.injection_detected': z.boolean(),
  'aegis.destructive_count': z.number().int().nonnegative(),
});

export type BaseAegisSpanAttributes = z.infer<typeof BaseAegisSpanAttributesSchema>;

export function buildBaseAegisSpanAttributes(
  result: HardeningResult,
): BaseAegisSpanAttributes {
  return {
    'aegis.safety_score': result.safetyScore,
    'aegis.blocked_layers': result.blockedLayers.join(','),
    'aegis.outcome': result.allowed ? 'allowed' : 'blocked',
    'aegis.pii_detected': result.piiDetected,
    'aegis.injection_detected': result.injectionDetected,
    'aegis.destructive_count': result.destructiveCount,
  };
}
