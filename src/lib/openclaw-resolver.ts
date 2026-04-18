// src/lib/openclaw-resolver.ts — Fire-and-forget OpenClaw approval resolver
// Wraps createOpenclawClient with retry, typed errors, and Sentry capture on final failure.

import * as Sentry from '@sentry/nextjs';
import { loadEnv } from '@aegis/types';
import { createOpenclawClient } from '@aegis/openclaw-client';
import type { OpenclawClient, ResolveApprovalInput } from '@aegis/openclaw-client';

// ── Typed errors ──────────────────────────────────────────────────────────────

export class OpenclawNotConfiguredError extends Error {
  constructor() {
    super('OpenClaw is not configured: OPENCLAW_API_TOKEN is missing');
    this.name = 'OpenclawNotConfiguredError';
  }
}

export class OpenclawTransientError extends Error {
  constructor(
    public readonly status: number,
    public readonly attempts: number,
  ) {
    super(`OpenClaw transient error after ${attempts} attempts (last status: ${status})`);
    this.name = 'OpenclawTransientError';
  }
}

export class OpenclawPermanentError extends Error {
  constructor(public readonly status: number) {
    super(`OpenClaw permanent error: ${status}`);
    this.name = 'OpenclawPermanentError';
  }
}

// ── Client cache (per-process singleton) ─────────────────────────────────────

let _cachedClient: OpenclawClient | null = null;

function getClient(): OpenclawClient {
  if (_cachedClient) return _cachedClient;

  const env = loadEnv();

  if (!env.OPENCLAW_API_TOKEN) {
    throw new OpenclawNotConfiguredError();
  }

  _cachedClient = createOpenclawClient({
    baseURL: env.OPENCLAW_BASE_URL,
    apiToken: env.OPENCLAW_API_TOKEN,
    defaultAgentId: env.OPENCLAW_AGENT_ID,
  });

  return _cachedClient;
}

/** Reset the cached client — intended only for tests. */
export function _resetClientCache(): void {
  _cachedClient = null;
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [200, 600, 1800] as const;
const MAX_ATTEMPTS = 3;

function isTransient(err: unknown): boolean {
  // Network errors (no status) are transient.
  if (err instanceof OpenclawPermanentError) return false;
  if (err instanceof OpenclawNotConfiguredError) return false;
  return true;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function resolveApproval(input: ResolveApprovalInput): Promise<void> {
  let client: OpenclawClient;

  try {
    client = getClient();
  } catch (err) {
    // OpenclawNotConfiguredError — re-throw immediately, no retry, no Sentry
    throw err;
  }

  let lastErr: unknown = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await client.resolveApproval(input);
      return; // success
    } catch (err) {
      lastErr = err;

      // Extract HTTP status if available from error message
      const statusMatch =
        err instanceof Error ? /(\d{3})/.exec(err.message) : null;
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      lastStatus = status;

      // 4xx → permanent failure, no retry
      if (status >= 400 && status < 500) {
        const permErr = new OpenclawPermanentError(status);
        Sentry.captureException(permErr, {
          tags: { 'aegis.openclaw.surface': 'resolveApproval' },
        });
        throw permErr;
      }

      // On last attempt, don't sleep
      if (attempt < MAX_ATTEMPTS - 1 && isTransient(err)) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  // All retries exhausted — transient failure
  const finalErr = new OpenclawTransientError(lastStatus, MAX_ATTEMPTS);
  Sentry.captureException(finalErr, {
    tags: { 'aegis.openclaw.surface': 'resolveApproval' },
    extra: { cause: lastErr instanceof Error ? lastErr.message : String(lastErr) },
  });
  throw finalErr;
}
