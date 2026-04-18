// src/lib/openclaw-resolver.test.ts — Vitest tests for openclaw-resolver

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockResolveApproval, mockCaptureException, mockCreateClient } = vi.hoisted(() => ({
  mockResolveApproval: vi.fn(),
  mockCaptureException: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@aegis/openclaw-client', () => ({
  createOpenclawClient: mockCreateClient,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
}));

// ── Env helpers ───────────────────────────────────────────────────────────────

const BASE_ENV = {
  SKIP_ENV_VALIDATION: 'true',
  OPENCLAW_BASE_URL: 'http://localhost:8787',
  OPENCLAW_AGENT_ID: 'openclaw/default',
} as const;

function setEnv(overrides: Record<string, string | undefined> = {}) {
  Object.assign(process.env, { ...BASE_ENV, ...overrides });
}

function clearToken() {
  delete process.env['OPENCLAW_API_TOKEN'];
}

// ── Test lifecycle ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module cache to clear the singleton client + re-import fresh
});

afterEach(() => {
  clearToken();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function freshResolver() {
  // Each test needs a fresh module instance (singleton client cache must be reset)
  const mod = await import('./openclaw-resolver');
  mod._resetClientCache();
  return mod;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveApproval', () => {
  it('NotConfigured — throws OpenclawNotConfiguredError when OPENCLAW_API_TOKEN is absent', async () => {
    setEnv(); // no token
    clearToken();

    const { resolveApproval, OpenclawNotConfiguredError } = await freshResolver();

    await expect(
      resolveApproval({ approvalId: 'apr-1', decision: 'allow-once' }),
    ).rejects.toBeInstanceOf(OpenclawNotConfiguredError);

    // No Sentry capture for this case
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('success first try — resolves without throwing', async () => {
    setEnv({ OPENCLAW_API_TOKEN: 'token-abc' });

    mockResolveApproval.mockResolvedValueOnce({ ok: true });
    mockCreateClient.mockReturnValue({ resolveApproval: mockResolveApproval });

    const { resolveApproval } = await freshResolver();

    await expect(
      resolveApproval({ approvalId: 'apr-2', decision: 'deny-once' }),
    ).resolves.toBeUndefined();

    expect(mockResolveApproval).toHaveBeenCalledTimes(1);
    expect(mockResolveApproval).toHaveBeenCalledWith({
      approvalId: 'apr-2',
      decision: 'deny-once',
      rejectionMessage: undefined,
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('success after 2 retries — resolves on 3rd attempt after two 500 errors', async () => {
    setEnv({ OPENCLAW_API_TOKEN: 'token-abc' });

    // Simulate 5xx via error message with status code
    const transientErr = new Error('openclaw resolveApproval failed: 503 Service Unavailable');
    mockResolveApproval
      .mockRejectedValueOnce(transientErr)
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce({ ok: true });

    mockCreateClient.mockReturnValue({ resolveApproval: mockResolveApproval });

    const { resolveApproval } = await freshResolver();

    // Shorten delays to avoid slow tests
    vi.useFakeTimers();
    const promise = resolveApproval({ approvalId: 'apr-3', decision: 'allow-always' });
    // Advance past all retry delays, then let the promise settle
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    // Drain any remaining microtasks
    await Promise.resolve();

    await expect(promise).resolves.toBeUndefined();
    expect(mockResolveApproval).toHaveBeenCalledTimes(3);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('transient failure — throws OpenclawTransientError after 3 failed attempts and captures Sentry', async () => {
    setEnv({ OPENCLAW_API_TOKEN: 'token-abc' });

    const transientErr = new Error('openclaw resolveApproval failed: 503 Service Unavailable');
    mockResolveApproval.mockRejectedValue(transientErr);
    mockCreateClient.mockReturnValue({ resolveApproval: mockResolveApproval });

    const { resolveApproval, OpenclawTransientError } = await freshResolver();

    vi.useFakeTimers();
    const promise = resolveApproval({ approvalId: 'apr-4', decision: 'deny-always' });
    // Catch early so the rejection is handled before we advance timers
    const rejection = promise.catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const err = await rejection;
    expect(err).toBeInstanceOf(OpenclawTransientError);
    expect(mockResolveApproval).toHaveBeenCalledTimes(3);
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'OpenclawTransientError' }),
      expect.objectContaining({ tags: { 'aegis.openclaw.surface': 'resolveApproval' } }),
    );
  });

  it('permanent 4xx — throws OpenclawPermanentError immediately with no retry', async () => {
    setEnv({ OPENCLAW_API_TOKEN: 'token-abc' });

    const permErr = new Error('openclaw resolveApproval failed: 422 Unprocessable Entity');
    mockResolveApproval.mockRejectedValue(permErr);
    mockCreateClient.mockReturnValue({ resolveApproval: mockResolveApproval });

    const { resolveApproval, OpenclawPermanentError } = await freshResolver();

    await expect(
      resolveApproval({ approvalId: 'apr-5', decision: 'deny-once' }),
    ).rejects.toBeInstanceOf(OpenclawPermanentError);

    // Only 1 attempt — no retry on 4xx
    expect(mockResolveApproval).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'OpenclawPermanentError' }),
      expect.objectContaining({ tags: { 'aegis.openclaw.surface': 'resolveApproval' } }),
    );
  });

  it('headers forwarded — passes rejectionMessage through to resolveApproval', async () => {
    setEnv({ OPENCLAW_API_TOKEN: 'token-abc' });

    mockResolveApproval.mockResolvedValueOnce({ ok: true });
    mockCreateClient.mockReturnValue({ resolveApproval: mockResolveApproval });

    const { resolveApproval } = await freshResolver();

    await resolveApproval({
      approvalId: 'apr-6',
      decision: 'deny-once',
      rejectionMessage: 'User explicitly denied',
    });

    expect(mockResolveApproval).toHaveBeenCalledWith({
      approvalId: 'apr-6',
      decision: 'deny-once',
      rejectionMessage: 'User explicitly denied',
    });
  });
});
