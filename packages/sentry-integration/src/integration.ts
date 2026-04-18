/**
 * @aegis/sentry-integration — AegisSentryIntegration
 *
 * A Sentry v8 Integration object that:
 *  - Adds aegis.summary and aegis.layer tags on blocked events
 *  - Freezes aegis-prefixed fingerprints so downstream integrations cannot mutate them
 *  - Injects environment / release defaults from options or the Sentry client
 *  - Injects event.contexts.aegis with hardening metadata on every event
 *
 * The package is pure: it never reads process.env directly. Callers resolve
 * env vars and pass resolved booleans via AegisSentryIntegrationOptions.
 *
 * Types are defined locally (mirroring @sentry/core v8) so the package
 * compiles without a direct @sentry/core peer import, keeping the root
 * tsconfig clean and this package edge-safe.
 */

// ---------------------------------------------------------------------------
// Local type mirrors for @sentry/core v8
// These match the public contracts of Integration, Event, EventHint, Client.
// ---------------------------------------------------------------------------

/** Minimal Sentry Primitive (tag value). */
type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Minimal Sentry Contexts entry. */
type ContextValue = Record<string, unknown> | undefined;

/** Minimal Sentry Event surface we operate on. */
interface SentryEvent {
  tags?: Record<string, Primitive>;
  fingerprint?: string[];
  environment?: string;
  release?: string;
  contexts?: Record<string, ContextValue>;
  [key: string]: unknown;
}

/** Minimal Sentry EventHint. */
type SentryEventHint = Record<string, unknown>;

/** Minimal Sentry Client surface we need. */
interface SentryClient {
  getOptions(): { environment?: string; release?: string };
}

/** Sentry v8 Integration interface (subset we implement). */
interface SentryIntegration {
  name: string;
  setupOnce?(): void;
  processEvent?(
    event: SentryEvent,
    hint: SentryEventHint,
    client: SentryClient,
  ): SentryEvent | null;
}

// ---------------------------------------------------------------------------
// Package version
// ---------------------------------------------------------------------------

/** Version kept in sync with package.json. */
export const AEGIS_INTEGRATION_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options for `aegisSentryIntegration`.
 * All fields are optional — defaults fall back to the Sentry client options or
 * sensible values (false / 'development').
 */
export interface AegisSentryIntegrationOptions {
  /**
   * Pass the resolved value of `AEGIS_HARDENING_ENABLED`.
   * Do NOT read process.env here — keep the package pure and edge-safe.
   */
  hardeningEnabled?: boolean;
  /**
   * Pass the resolved value of `AEGIS_DEMO_MODE`.
   * Do NOT read process.env here — keep the package pure and edge-safe.
   */
  demoMode?: boolean;
  /** Override the release tag (else inherits from Sentry client options). */
  release?: string;
  /** Override the environment (else inherits from Sentry client options). */
  environment?: string;
}

/**
 * Factory that returns a Sentry v8 Integration object named 'AegisSentry'.
 *
 * Register it via `Sentry.init({ integrations: [aegisSentryIntegration(opts)] })`.
 *
 * The returned object satisfies the Sentry v8 `Integration` interface and can
 * be cast to it at the call site where `@sentry/nextjs` is available.
 */
export function aegisSentryIntegration(
  opts: AegisSentryIntegrationOptions = {},
): SentryIntegration {
  return {
    name: 'AegisSentry',

    setupOnce(): void {
      // No-op: all logic lives in processEvent so it runs per-client.
    },

    processEvent(event: SentryEvent, _hint: SentryEventHint, client: SentryClient): SentryEvent {
      const clientOpts = client.getOptions();

      // ------------------------------------------------------------------
      // 1. Augment tags for blocked events
      // ------------------------------------------------------------------
      if (event.tags?.['aegis.outcome'] === 'blocked') {
        const blockedLayersRaw = event.tags['aegis.blocked_layers'];
        const reasonRaw = event.tags['aegis.reason'];

        const blockedLayers: string[] =
          typeof blockedLayersRaw === 'string' && blockedLayersRaw.length > 0
            ? blockedLayersRaw.split(',')
            : [];

        const reason =
          typeof reasonRaw === 'string' && reasonRaw.length > 0
            ? reasonRaw
            : undefined;

        const summary = `${blockedLayers.join('+')}:${reason ?? 'no-reason'}`.slice(0, 200);
        event.tags = { ...event.tags, 'aegis.summary': summary };

        // Promote primary blocked layer to aegis.layer if absent
        if (!event.tags['aegis.layer'] && blockedLayers.length > 0) {
          event.tags['aegis.layer'] = blockedLayers[0];
        }
      }

      // ------------------------------------------------------------------
      // 2. Freeze aegis-prefixed fingerprints
      // ------------------------------------------------------------------
      if (
        Array.isArray(event.fingerprint) &&
        typeof event.fingerprint[0] === 'string' &&
        (event.fingerprint[0] as string).startsWith('aegis-')
      ) {
        event.fingerprint = [...event.fingerprint];
      }

      // ------------------------------------------------------------------
      // 3. Inject environment + release defaults
      // ------------------------------------------------------------------
      if (event.environment === undefined) {
        event.environment =
          opts.environment ?? clientOpts.environment ?? 'development';
      }
      if (event.release === undefined && (opts.release ?? clientOpts.release) !== undefined) {
        event.release = opts.release ?? clientOpts.release;
      }

      // ------------------------------------------------------------------
      // 4. Inject event.contexts.aegis
      // ------------------------------------------------------------------
      event.contexts = {
        ...event.contexts,
        aegis: {
          hardening_enabled: opts.hardeningEnabled ?? false,
          demo_mode: opts.demoMode ?? false,
          version: AEGIS_INTEGRATION_VERSION,
        },
      };

      // ------------------------------------------------------------------
      // 5. Always return the event — never drop
      // ------------------------------------------------------------------
      return event;
    },
  };
}
