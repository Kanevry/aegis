// src/app/api/sandbox/demo/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any dynamic import of route
// ---------------------------------------------------------------------------

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockExec = vi.fn();
const mockCreateSandbox = vi.fn(() => ({ exec: mockExec, close: mockClose }));

vi.mock('@aegis/sandbox', () => ({
  createSandbox: mockCreateSandbox,
}));

vi.mock('@sentry/nextjs', () => ({
  startSpan: vi.fn((_opts: unknown, fn: (span: unknown) => unknown) =>
    fn({
      spanContext: () => ({ traceId: 'mock-trace-id-1234' }),
      setAttributes: vi.fn(),
    }),
  ),
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/sandbox/demo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callRoute(body: unknown) {
  // Dynamic import so mocks are registered first
  const { POST } = await import('./route.js');
  // Next.js NextRequest wraps the standard Request
  const { NextRequest } = await import('next/server');
  return POST(new NextRequest(makeRequest(body)));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/sandbox/demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid body', async () => {
    const { POST } = await import('./route.js');
    const { NextRequest } = await import('next/server');
    const res = await POST(new NextRequest(makeRequest({ scenario: 'invalid-scenario' })));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_body');
  });

  it('returns 400 when body is missing scenario', async () => {
    const { POST } = await import('./route.js');
    const { NextRequest } = await import('next/server');
    const res = await POST(new NextRequest(makeRequest({})));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_body');
  });

  describe('attack-5-secret-exfil — real sandbox path', () => {
    it('returns blocked response with egressBlocks when sandbox is available', async () => {
      mockExec.mockResolvedValue({
        available: true,
        exitCode: 1,
        stdout: 'EXFIL_BLOCKED',
        stderr: '',
        egressBlocks: [
          {
            host: 'attacker.example.com',
            method: 'GET',
            timestamp: '2026-04-18T12:00:00.000Z',
            reason: 'host_not_in_allowlist',
          },
        ],
        secretsInjected: 1,
        coldStartMs: 120,
        fallbackReason: undefined,
      });

      const res = await callRoute({ scenario: 'attack-5-secret-exfil' });
      expect(res.status).toBe(200);

      const json = await res.json() as {
        available: boolean;
        mocked: boolean;
        scenario: string;
        result: { exitCode: number; stdout: string; stderr: string };
        egressBlocks: Array<{ host: string; method: string; timestamp: string; reason: string }>;
        span: { traceId: string | null; attributes: Record<string, unknown> };
        sentryIssueUrl: string | null;
        fallbackReason: string | null;
      };

      expect(json.available).toBe(true);
      expect(json.mocked).toBe(false);
      expect(json.scenario).toBe('attack-5-secret-exfil');
      expect(json.result.exitCode).toBe(1);
      expect(json.result.stdout).toBe('EXFIL_BLOCKED');
      expect(json.egressBlocks).toHaveLength(1);
      expect(json.egressBlocks[0]?.host).toBe('attacker.example.com');
      expect(json.span.traceId).toBe('mock-trace-id-1234');
      expect(json.span.attributes['aegis.sandbox.scenario']).toBe('attack-5-secret-exfil');
      expect(json.span.attributes['aegis.sandbox.egress_blocks']).toBe(1);
      expect(json.span.attributes['aegis.sandbox.outcome']).toBe('blocked');
      expect(json.sentryIssueUrl).toBeNull();
      expect(json.fallbackReason).toBeNull();
    });
  });

  describe('attack-5-secret-exfil — mocked sandbox path (unavailable)', () => {
    it('returns mocked=true with synthetic egress block when sandbox unavailable', async () => {
      mockExec.mockResolvedValue({
        available: false,
        exitCode: 1,
        stdout: 'EXFIL_BLOCKED',
        stderr: '',
        egressBlocks: [],
        secretsInjected: 0,
        coldStartMs: 0,
        fallbackReason: 'qemu_not_found',
      });

      const res = await callRoute({ scenario: 'attack-5-secret-exfil' });
      expect(res.status).toBe(200);

      const json = await res.json() as {
        available: boolean;
        mocked: boolean;
        scenario: string;
        egressBlocks: Array<{ host: string }>;
        fallbackReason: string | null;
      };

      expect(json.available).toBe(false);
      expect(json.mocked).toBe(true);
      expect(json.scenario).toBe('attack-5-secret-exfil');
      // Mock always injects a synthetic attacker.example.com block for attack-5
      expect(json.egressBlocks).toHaveLength(1);
      expect(json.egressBlocks[0]?.host).toBe('attacker.example.com');
      expect(json.fallbackReason).toBe('qemu_not_found');
    });
  });

  describe('benign-github-fetch — real sandbox path', () => {
    it('returns ok result with empty egressBlocks', async () => {
      mockExec.mockResolvedValue({
        available: true,
        exitCode: 0,
        stdout: '{"login":"octocat"}',
        stderr: '',
        egressBlocks: [],
        secretsInjected: 1,
        coldStartMs: 95,
        fallbackReason: undefined,
      });

      const res = await callRoute({ scenario: 'benign-github-fetch' });
      expect(res.status).toBe(200);

      const json = await res.json() as {
        available: boolean;
        mocked: boolean;
        scenario: string;
        result: { exitCode: number; stdout: string };
        egressBlocks: unknown[];
        span: { attributes: Record<string, unknown> };
      };

      expect(json.available).toBe(true);
      expect(json.mocked).toBe(false);
      expect(json.scenario).toBe('benign-github-fetch');
      expect(json.result.exitCode).toBe(0);
      expect(json.result.stdout).toBe('{"login":"octocat"}');
      expect(json.egressBlocks).toHaveLength(0);
      expect(json.span.attributes['aegis.sandbox.outcome']).toBe('ok');
    });
  });

  describe('custom command override', () => {
    it('passes command override to sandbox.exec', async () => {
      mockExec.mockResolvedValue({
        available: true,
        exitCode: 0,
        stdout: 'custom-output',
        stderr: '',
        egressBlocks: [],
        secretsInjected: 0,
        coldStartMs: 50,
        fallbackReason: undefined,
      });

      await callRoute({ scenario: 'benign-github-fetch', command: 'echo custom-output' });

      expect(mockExec).toHaveBeenCalledWith('echo custom-output');
    });
  });

  describe('unexpected error handling', () => {
    it('returns mocked=true with fallbackReason=unexpected_error when exec throws', async () => {
      mockExec.mockRejectedValue(new Error('boom'));

      const res = await callRoute({ scenario: 'attack-5-secret-exfil' });
      expect(res.status).toBe(200);

      const json = await res.json() as {
        mocked: boolean;
        fallbackReason: string | null;
      };

      expect(json.mocked).toBe(true);
      expect(json.fallbackReason).toBe('unexpected_error');
    });

    it('always calls sandbox.close() even when exec throws', async () => {
      mockExec.mockRejectedValue(new Error('boom'));
      await callRoute({ scenario: 'benign-github-fetch' });
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
