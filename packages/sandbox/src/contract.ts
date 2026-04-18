import { z } from 'zod';

/**
 * Versioned Zod contract for aegis.sandbox.* Sentry span attributes.
 * Mirrors the pattern from #75 (aegis.approval.*) to prevent attribute drift.
 */
export const SandboxSpanAttributesSchema = z.object({
  'aegis.sandbox.vm_backend': z.enum(['qemu', 'krun', 'fallback']),
  'aegis.sandbox.scenario': z.string(),
  'aegis.sandbox.cold_start_ms': z.number().nonnegative().optional(),
  'aegis.sandbox.exit_code': z.number().int(),
  'aegis.sandbox.egress_attempts': z.number().int().nonnegative(),
  'aegis.sandbox.egress_blocks': z.number().int().nonnegative(),
  'aegis.sandbox.secrets_injected': z.number().int().nonnegative(),
  'aegis.sandbox.available': z.boolean(),
  'aegis.sandbox.outcome': z.enum(['ok', 'blocked', 'error']),
});

export type SandboxSpanAttributes = z.infer<typeof SandboxSpanAttributesSchema>;

/**
 * Stable Sentry fingerprint for sandbox egress-block events.
 * Returns a tuple Sentry's grouping uses verbatim. Stable across runs ⇒ Seer
 * groups recurring exfil attempts by (host × reason).
 */
export const SANDBOX_EGRESS_FINGERPRINT = (host: string, reason: string) =>
  ['aegis-sandbox-egress', host, reason] as const;

export type SandboxEgressFingerprint = ReturnType<typeof SANDBOX_EGRESS_FINGERPRINT>;
