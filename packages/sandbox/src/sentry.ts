import {
  SANDBOX_EGRESS_FINGERPRINT,
  type SandboxEgressFingerprint,
  type SandboxSpanAttributes,
} from './contract';
import type { SandboxExecResult, SandboxOptions } from './types';

/**
 * Thrown by the sandbox runtime when guest egress is blocked by the host
 * allowlist. The attached fingerprint is stable across runs so Sentry/Seer
 * groups recurring exfil attempts by (host × reason).
 */
export class AegisSandboxEgressBlocked extends Error {
  readonly host: string;
  readonly reason: string;
  readonly fingerprint: SandboxEgressFingerprint;

  constructor(host: string, reason: string, message?: string) {
    super(message ?? `Sandbox egress blocked: ${host} (${reason})`);
    this.name = 'AegisSandboxEgressBlocked';
    this.host = host;
    this.reason = reason;
    this.fingerprint = SANDBOX_EGRESS_FINGERPRINT(host, reason);
  }
}

// ---------------------------------------------------------------------------
// Lazy Sentry loader
// ---------------------------------------------------------------------------

/**
 * Minimal Sentry surface we require. Typed locally so the package stays
 * edge-safe and compiles without @sentry/nextjs installed.
 */
type SentryLike = {
  startSpan: <T>(
    opts: { name: string; op?: string; attributes?: Record<string, unknown> },
    fn: (span: {
      setAttribute: (k: string, v: unknown) => void;
      setStatus?: (s: { code: number }) => void;
    }) => T,
  ) => T;
  captureException: (
    err: unknown,
    hint?: { fingerprint?: readonly string[]; tags?: Record<string, string> },
  ) => void;
};

let cachedSentry: SentryLike | null | undefined;

/**
 * Attempts a dynamic import of @sentry/nextjs and returns the module, or
 * `null` when the package is not installed. Caches the result so subsequent
 * calls pay no async overhead. Never throws — graceful absence is the contract.
 */
async function loadSentry(): Promise<SentryLike | null> {
  if (cachedSentry !== undefined) return cachedSentry;
  try {
    const mod = (await import(
      /* webpackIgnore: true */ '@sentry/nextjs'
    )) as unknown as SentryLike;
    cachedSentry = mod;
    return mod;
  } catch {
    cachedSentry = null;
    return null;
  }
}

/**
 * Test-only reset hook — exported so Wave 3 tests can clear the module-level
 * Sentry cache between test cases.
 */
export function __resetSentryCacheForTests(): void {
  cachedSentry = undefined;
}

// ---------------------------------------------------------------------------
// withSandboxSpan
// ---------------------------------------------------------------------------

/**
 * Context consumed by `withSandboxSpan`. Derives from `SandboxOptions.sentry`
 * plus runtime labels known at the call site.
 */
export interface WithSandboxSpanContext {
  /**
   * Honoured from SandboxOptions.sentry?.enabled — false-y disables all
   * Sentry calls entirely, preserving zero-overhead path when opted out.
   */
  enabled: boolean;
  /**
   * Backend label written to the `aegis.sandbox.vm_backend` span attribute.
   * Should match whatever the sandbox was initialised with.
   */
  vmBackend: SandboxSpanAttributes['aegis.sandbox.vm_backend'];
  /**
   * Free-form scenario tag (e.g. "demo:attack-5", "exec") written to
   * `aegis.sandbox.scenario`. Helps filter spans in Sentry Explore.
   */
  scenario: string;
}

/**
 * Wraps a sandbox exec call in a Sentry span and reports egress blocks.
 *
 * Behaviour:
 * - Starts span `aegis.sandbox.exec` (op: `sandbox.exec`) with all
 *   attributes defined by the SandboxSpanAttributesSchema contract.
 * - For every EgressBlock in the result, fires
 *   `Sentry.captureException(AegisSandboxEgressBlocked)` with fingerprint
 *   `['aegis-sandbox-egress', host, reason]` and tags `{ layer: 'B6', attacker_host }`.
 * - When `ctx.enabled` is false OR Sentry is not loadable, runs `fn` directly
 *   with zero side effects — the fallback path is fully transparent.
 *
 * @param ctx  - Span context (enabled flag, backend label, scenario tag).
 * @param fn   - Async factory that executes the sandbox command and returns a result.
 */
export async function withSandboxSpan(
  ctx: WithSandboxSpanContext,
  fn: () => Promise<SandboxExecResult>,
): Promise<SandboxExecResult> {
  if (!ctx.enabled) return fn();

  const sentry = await loadSentry();
  if (!sentry) return fn();

  return sentry.startSpan(
    { name: 'aegis.sandbox.exec', op: 'sandbox.exec' },
    async (span) => {
      const result = await fn();

      // Build the full attribute set from the contract schema.
      const attrs: SandboxSpanAttributes = {
        'aegis.sandbox.vm_backend': result.available ? ctx.vmBackend : 'fallback',
        'aegis.sandbox.scenario': ctx.scenario,
        'aegis.sandbox.cold_start_ms': result.coldStartMs,
        'aegis.sandbox.exit_code': result.exitCode,
        'aegis.sandbox.egress_attempts': result.egressBlocks.length,
        'aegis.sandbox.egress_blocks': result.egressBlocks.length,
        'aegis.sandbox.secrets_injected': result.secretsInjected,
        'aegis.sandbox.available': result.available,
        'aegis.sandbox.outcome':
          !result.available
            ? 'error'
            : result.egressBlocks.length > 0
              ? 'blocked'
              : result.exitCode === 0
                ? 'ok'
                : 'error',
      };

      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined) span.setAttribute(k, v as never);
      }

      // Capture every egress block as a Sentry exception with a stable
      // fingerprint so Seer groups repeated exfil attempts by (host × reason).
      for (const block of result.egressBlocks) {
        const err = new AegisSandboxEgressBlocked(block.host, block.reason);
        sentry.captureException(err, {
          fingerprint: err.fingerprint,
          tags: { layer: 'B6', attacker_host: block.host },
        });
      }

      return result;
    },
  );
}

// Re-export SandboxOptions type so callers that import only from sentry.ts
// don't need a second import. Internal use only — the public surface is index.ts.
export type { SandboxOptions };
