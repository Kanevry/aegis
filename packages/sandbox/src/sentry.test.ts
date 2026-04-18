import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// @sentry/nextjs mock — hoisted at the top so the lazy loader sees it
// ---------------------------------------------------------------------------

const mockSetAttribute = vi.fn();
const mockStartSpan = vi.fn(
  async (
    _opts: { name: string; op?: string },
    cb: (span: { setAttribute: typeof mockSetAttribute }) => Promise<unknown>,
  ) => cb({ setAttribute: mockSetAttribute }),
);
const mockCaptureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  startSpan: mockStartSpan,
  captureException: mockCaptureException,
}));

// ---------------------------------------------------------------------------
// Subject imports — after the mock declaration so the dynamic import is patched
// ---------------------------------------------------------------------------

import {
  AegisSandboxEgressBlocked,
  withSandboxSpan,
  __resetSentryCacheForTests,
} from './sentry';
import type { WithSandboxSpanContext } from './sentry';
import type { SandboxExecResult } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<SandboxExecResult> = {}): SandboxExecResult {
  return {
    available: true,
    exitCode: 0,
    stdout: 'hello',
    stderr: '',
    egressBlocks: [],
    secretsInjected: 0,
    coldStartMs: 12,
    ...overrides,
  };
}

const BASE_CTX: WithSandboxSpanContext = {
  enabled: true,
  vmBackend: 'qemu',
  scenario: 'test-scenario',
};

// ---------------------------------------------------------------------------
// AegisSandboxEgressBlocked
// ---------------------------------------------------------------------------

describe('AegisSandboxEgressBlocked', () => {
  it('name is AegisSandboxEgressBlocked', () => {
    const err = new AegisSandboxEgressBlocked('evil.com', 'not-in-allowedHosts');
    expect(err.name).toBe('AegisSandboxEgressBlocked');
  });

  it('is an instance of Error', () => {
    const err = new AegisSandboxEgressBlocked('evil.com', 'not-in-allowedHosts');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores host verbatim', () => {
    const err = new AegisSandboxEgressBlocked('data.exfil.io', 'not-in-allowedHosts');
    expect(err.host).toBe('data.exfil.io');
  });

  it('stores reason verbatim', () => {
    const err = new AegisSandboxEgressBlocked('evil.com', 'rate-limit-exceeded');
    expect(err.reason).toBe('rate-limit-exceeded');
  });

  it('fingerprint matches [aegis-sandbox-egress, host, reason]', () => {
    const err = new AegisSandboxEgressBlocked('evil.com', 'not-in-allowedHosts');
    expect(err.fingerprint).toEqual(['aegis-sandbox-egress', 'evil.com', 'not-in-allowedHosts']);
  });

  it('default message contains both host and reason', () => {
    const err = new AegisSandboxEgressBlocked('evil.com', 'not-in-allowedHosts');
    expect(err.message).toContain('evil.com');
    expect(err.message).toContain('not-in-allowedHosts');
  });

  it('custom message overrides the default', () => {
    const err = new AegisSandboxEgressBlocked('evil.com', 'not-in-allowedHosts', 'custom msg');
    expect(err.message).toBe('custom msg');
  });
});

// ---------------------------------------------------------------------------
// withSandboxSpan — disabled path
// ---------------------------------------------------------------------------

describe('withSandboxSpan — disabled', () => {
  beforeEach(() => {
    __resetSentryCacheForTests();
    vi.clearAllMocks();
  });

  it('calls fn() and returns its result when ctx.enabled is false', async () => {
    const expected = makeResult({ stdout: 'direct-result' });
    const fn = vi.fn(async () => expected);
    const result = await withSandboxSpan({ ...BASE_CTX, enabled: false }, fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe(expected);
  });

  it('result is deep-equal to what fn returned', async () => {
    const expected = makeResult({
      exitCode: 0,
      stdout: 'some output',
      egressBlocks: [],
      secretsInjected: 3,
      coldStartMs: 42,
    });
    const result = await withSandboxSpan({ ...BASE_CTX, enabled: false }, async () => expected);
    expect(result).toEqual(expected);
  });

  it('does not call Sentry.startSpan when disabled', async () => {
    await withSandboxSpan({ ...BASE_CTX, enabled: false }, async () => makeResult());
    expect(mockStartSpan).not.toHaveBeenCalled();
  });

  it('does not call Sentry.captureException when disabled', async () => {
    const result = makeResult({
      egressBlocks: [{ host: 'evil.com', method: 'GET', timestamp: '2026-01-01T00:00:00Z', reason: 'blocked' }],
    });
    await withSandboxSpan({ ...BASE_CTX, enabled: false }, async () => result);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// withSandboxSpan — Sentry available
// ---------------------------------------------------------------------------

describe('withSandboxSpan — Sentry available', () => {
  beforeEach(() => {
    __resetSentryCacheForTests();
    vi.clearAllMocks();
  });

  it('calls Sentry.startSpan with name aegis.sandbox.exec', async () => {
    await withSandboxSpan(BASE_CTX, async () => makeResult());
    expect(mockStartSpan).toHaveBeenCalledOnce();
    const opts = mockStartSpan.mock.calls[0]?.[0] as { name: string; op?: string };
    expect(opts.name).toBe('aegis.sandbox.exec');
  });

  it('calls Sentry.startSpan with op sandbox.exec', async () => {
    await withSandboxSpan(BASE_CTX, async () => makeResult());
    const opts = mockStartSpan.mock.calls[0]?.[0] as { name: string; op?: string };
    expect(opts.op).toBe('sandbox.exec');
  });

  it('sets all 9 SandboxSpanAttributes on the span', async () => {
    const result = makeResult({
      available: true,
      exitCode: 0,
      stdout: 'ok',
      egressBlocks: [],
      secretsInjected: 2,
      coldStartMs: 55,
    });
    await withSandboxSpan(BASE_CTX, async () => result);

    const calls = mockSetAttribute.mock.calls as [string, unknown][];
    const attrs = Object.fromEntries(calls);

    expect(attrs['aegis.sandbox.vm_backend']).toBe('qemu');
    expect(attrs['aegis.sandbox.scenario']).toBe('test-scenario');
    expect(attrs['aegis.sandbox.cold_start_ms']).toBe(55);
    expect(attrs['aegis.sandbox.exit_code']).toBe(0);
    expect(attrs['aegis.sandbox.egress_attempts']).toBe(0);
    expect(attrs['aegis.sandbox.egress_blocks']).toBe(0);
    expect(attrs['aegis.sandbox.secrets_injected']).toBe(2);
    expect(attrs['aegis.sandbox.available']).toBe(true);
    expect(attrs['aegis.sandbox.outcome']).toBe('ok');
  });

  it('vm_backend reflects ctx.vmBackend when result.available is true', async () => {
    const result = makeResult({ available: true });
    await withSandboxSpan({ ...BASE_CTX, vmBackend: 'krun' }, async () => result);
    const calls = mockSetAttribute.mock.calls as [string, unknown][];
    const attrs = Object.fromEntries(calls);
    expect(attrs['aegis.sandbox.vm_backend']).toBe('krun');
  });

  it('vm_backend flips to fallback when result.available is false', async () => {
    const result = makeResult({ available: false, exitCode: -1 });
    await withSandboxSpan({ ...BASE_CTX, vmBackend: 'qemu' }, async () => result);
    const calls = mockSetAttribute.mock.calls as [string, unknown][];
    const attrs = Object.fromEntries(calls);
    expect(attrs['aegis.sandbox.vm_backend']).toBe('fallback');
  });

  it('outcome is ok when exit_code is 0 and no egress blocks', async () => {
    const result = makeResult({ available: true, exitCode: 0, egressBlocks: [] });
    await withSandboxSpan(BASE_CTX, async () => result);
    const calls = mockSetAttribute.mock.calls as [string, unknown][];
    const attrs = Object.fromEntries(calls);
    expect(attrs['aegis.sandbox.outcome']).toBe('ok');
  });

  it('outcome is blocked when there is at least one egress block', async () => {
    const result = makeResult({
      available: true,
      exitCode: 0,
      egressBlocks: [{ host: 'evil.com', method: 'POST', timestamp: '2026-01-01T00:00:00Z', reason: 'not-in-allowedHosts' }],
    });
    await withSandboxSpan(BASE_CTX, async () => result);
    const calls = mockSetAttribute.mock.calls as [string, unknown][];
    const attrs = Object.fromEntries(calls);
    expect(attrs['aegis.sandbox.outcome']).toBe('blocked');
  });

  it('outcome is error when available is false', async () => {
    const result = makeResult({ available: false, exitCode: -1 });
    await withSandboxSpan(BASE_CTX, async () => result);
    const calls = mockSetAttribute.mock.calls as [string, unknown][];
    const attrs = Object.fromEntries(calls);
    expect(attrs['aegis.sandbox.outcome']).toBe('error');
  });

  it('outcome is error when exit_code is non-zero and no egress blocks', async () => {
    const result = makeResult({ available: true, exitCode: 1, egressBlocks: [] });
    await withSandboxSpan(BASE_CTX, async () => result);
    const calls = mockSetAttribute.mock.calls as [string, unknown][];
    const attrs = Object.fromEntries(calls);
    expect(attrs['aegis.sandbox.outcome']).toBe('error');
  });

  it('captureException called exactly twice when result has 2 egress blocks', async () => {
    const result = makeResult({
      available: true,
      exitCode: 0,
      egressBlocks: [
        { host: 'evil-1.com', method: 'GET', timestamp: '2026-01-01T00:00:00Z', reason: 'not-in-allowedHosts' },
        { host: 'evil-2.com', method: 'POST', timestamp: '2026-01-01T00:00:01Z', reason: 'rate-limit-exceeded' },
      ],
    });
    await withSandboxSpan(BASE_CTX, async () => result);
    expect(mockCaptureException).toHaveBeenCalledTimes(2);
  });

  it('first captureException call uses correct fingerprint and tags', async () => {
    const result = makeResult({
      available: true,
      exitCode: 0,
      egressBlocks: [
        { host: 'evil-1.com', method: 'GET', timestamp: '2026-01-01T00:00:00Z', reason: 'not-in-allowedHosts' },
        { host: 'evil-2.com', method: 'POST', timestamp: '2026-01-01T00:00:01Z', reason: 'rate-limit-exceeded' },
      ],
    });
    await withSandboxSpan(BASE_CTX, async () => result);

    const [_err1, hint1] = mockCaptureException.mock.calls[0] as [
      AegisSandboxEgressBlocked,
      { fingerprint: readonly string[]; tags: Record<string, string> },
    ];
    expect(hint1.fingerprint).toEqual(['aegis-sandbox-egress', 'evil-1.com', 'not-in-allowedHosts']);
    expect(hint1.tags).toEqual({ layer: 'B6', attacker_host: 'evil-1.com' });
  });

  it('second captureException call uses correct fingerprint and tags', async () => {
    const result = makeResult({
      available: true,
      exitCode: 0,
      egressBlocks: [
        { host: 'evil-1.com', method: 'GET', timestamp: '2026-01-01T00:00:00Z', reason: 'not-in-allowedHosts' },
        { host: 'evil-2.com', method: 'POST', timestamp: '2026-01-01T00:00:01Z', reason: 'rate-limit-exceeded' },
      ],
    });
    await withSandboxSpan(BASE_CTX, async () => result);

    const [_err2, hint2] = mockCaptureException.mock.calls[1] as [
      AegisSandboxEgressBlocked,
      { fingerprint: readonly string[]; tags: Record<string, string> },
    ];
    expect(hint2.fingerprint).toEqual(['aegis-sandbox-egress', 'evil-2.com', 'rate-limit-exceeded']);
    expect(hint2.tags).toEqual({ layer: 'B6', attacker_host: 'evil-2.com' });
  });

  it('each captureException receives an AegisSandboxEgressBlocked instance', async () => {
    const result = makeResult({
      available: true,
      exitCode: 0,
      egressBlocks: [
        { host: 'evil-1.com', method: 'GET', timestamp: '2026-01-01T00:00:00Z', reason: 'not-in-allowedHosts' },
        { host: 'evil-2.com', method: 'POST', timestamp: '2026-01-01T00:00:01Z', reason: 'rate-limit-exceeded' },
      ],
    });
    await withSandboxSpan(BASE_CTX, async () => result);

    const err1 = mockCaptureException.mock.calls[0]?.[0] as unknown;
    const err2 = mockCaptureException.mock.calls[1]?.[0] as unknown;
    expect(err1).toBeInstanceOf(AegisSandboxEgressBlocked);
    expect(err2).toBeInstanceOf(AegisSandboxEgressBlocked);
  });

  it('captureException not called when result has zero egress blocks', async () => {
    const result = makeResult({ available: true, exitCode: 0, egressBlocks: [] });
    await withSandboxSpan(BASE_CTX, async () => result);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns the result from fn unchanged', async () => {
    const expected = makeResult({ stdout: 'span-result', secretsInjected: 7 });
    const result = await withSandboxSpan(BASE_CTX, async () => expected);
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// __resetSentryCacheForTests
// ---------------------------------------------------------------------------

describe('__resetSentryCacheForTests', () => {
  beforeEach(() => {
    __resetSentryCacheForTests();
    vi.clearAllMocks();
  });

  it('after reset the next withSandboxSpan call re-attempts the dynamic import', async () => {
    // First call — loads (and caches) Sentry
    await withSandboxSpan(BASE_CTX, async () => makeResult());
    const callsAfterFirst = mockStartSpan.mock.calls.length;

    // Reset the cache — clears the module-level cachedSentry
    __resetSentryCacheForTests();
    vi.clearAllMocks();

    // Second call — must re-attempt the import and reach startSpan again
    await withSandboxSpan(BASE_CTX, async () => makeResult());
    expect(mockStartSpan.mock.calls.length).toBe(callsAfterFirst);
  });

  it('cache is cleared so repeated calls without reset reuse the cached module', async () => {
    // Warm the cache
    await withSandboxSpan(BASE_CTX, async () => makeResult());
    vi.clearAllMocks();

    // Without reset, second call reuses cached Sentry — startSpan still invoked
    await withSandboxSpan(BASE_CTX, async () => makeResult());
    expect(mockStartSpan).toHaveBeenCalledOnce();
  });
});
