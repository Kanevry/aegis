// route.test.ts — unit tests for POST /api/webhook/openclaw

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── Hoisted mock fns ──────────────────────────────────────────────────────────

const { mockVerify, mockDispatch, mockStartSpan, mockCaptureException, mockCaptureMessage, mockWithScope } =
  vi.hoisted(() => ({
    mockVerify: vi.fn(),
    mockDispatch: vi.fn(),
    mockStartSpan: vi.fn(),
    mockCaptureException: vi.fn(),
    mockCaptureMessage: vi.fn(),
    mockWithScope: vi.fn(),
  }));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@aegis/openclaw-client', () => ({
  verifyWebhookSignature: mockVerify,
}));

vi.mock('./dispatchers', () => ({
  dispatchEvent: mockDispatch,
}));

vi.mock('@sentry/nextjs', () => ({
  startSpan: mockStartSpan,
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  withScope: mockWithScope,
}));

// ── Request factory ───────────────────────────────────────────────────────────

function buildReq(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://x/api/webhook/openclaw', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// Valid event payloads for each type
const PAYLOADS = {
  'exec.approval.requested': {
    type: 'exec.approval.requested',
    event_id: 'evt-req-1',
    approval_id: 'apr-1',
    tool: 'bash',
    args: { cmd: 'ls' },
  },
  'exec.approval.resolved': {
    type: 'exec.approval.resolved',
    event_id: 'evt-res-1',
    approval_id: 'apr-1',
    decision: 'allow-once',
  },
  'exec.running': {
    type: 'exec.running',
    event_id: 'evt-run-1',
    run_id: 'run-1',
    tool: 'bash',
  },
  'exec.finished': {
    type: 'exec.finished',
    event_id: 'evt-fin-1',
    run_id: 'run-1',
    exit_code: 0,
  },
  'exec.denied': {
    type: 'exec.denied',
    event_id: 'evt-den-1',
    run_id: 'run-1',
    reason: 'policy',
  },
} as const;

// ── Env lifecycle ─────────────────────────────────────────────────────────────

const VALID_SECRET = 'super-secret-at-least-32-characters-long';
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {
    OPENCLAW_WEBHOOK_SECRET: process.env['OPENCLAW_WEBHOOK_SECRET'],
    SKIP_ENV_VALIDATION: process.env['SKIP_ENV_VALIDATION'],
  };

  process.env['SKIP_ENV_VALIDATION'] = 'true';
  process.env['OPENCLAW_WEBHOOK_SECRET'] = VALID_SECRET;

  vi.clearAllMocks();

  // Default startSpan: run the callback with a mock span
  mockStartSpan.mockImplementation(
    (_opts: unknown, fn: (span: { setAttribute: ReturnType<typeof vi.fn> }) => unknown) =>
      fn({ setAttribute: vi.fn() }),
  );

  // Default dispatchEvent: returns not deduped
  mockDispatch.mockResolvedValue({ deduped: false });

  // Default verify: returns true
  mockVerify.mockReturnValue(true);

  // Default withScope: run callback
  mockWithScope.mockImplementation((fn: (scope: { setTag: ReturnType<typeof vi.fn> }) => unknown) =>
    fn({ setTag: vi.fn() }),
  );
});

afterEach(() => {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/webhook/openclaw', () => {
  describe('503 — webhook not configured', () => {
    it('returns 503 with webhook_not_configured when OPENCLAW_WEBHOOK_SECRET is absent', async () => {
      delete process.env['OPENCLAW_WEBHOOK_SECRET'];

      const { POST } = await import('./route.js');
      const res = await POST(buildReq('{}'));

      expect(res.status).toBe(503);
      const body = await res.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('webhook_not_configured');
    });
  });

  describe('401 — invalid signature', () => {
    it('returns 401 with invalid_signature when verifyWebhookSignature returns false', async () => {
      mockVerify.mockReturnValue(false);

      const { POST } = await import('./route.js');
      const res = await POST(
        buildReq('{}', { 'x-openclaw-signature': 'sha256=badhex' }),
      );

      expect(res.status).toBe(401);
      const body = await res.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_signature');
    });

    it('returns 401 when signature header is missing and verifyWebhookSignature returns false', async () => {
      mockVerify.mockReturnValue(false);

      const { POST } = await import('./route.js');
      const res = await POST(buildReq('{}'));

      expect(res.status).toBe(401);
      const body = await res.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_signature');
    });

    it('calls captureMessage when signature is invalid', async () => {
      mockVerify.mockReturnValue(false);

      const { POST } = await import('./route.js');
      await POST(buildReq('{}', { 'x-openclaw-signature': 'sha256=badhex' }));

      expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'OpenClaw webhook invalid signature',
        'warning',
      );
    });
  });

  describe('400 — invalid payload', () => {
    it('returns 400 with invalid_payload when body is not valid JSON', async () => {
      const { POST } = await import('./route.js');
      const res = await POST(buildReq('not-json'));

      expect(res.status).toBe(400);
      const body = await res.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_payload');
    });

    it('returns 400 with invalid_payload when JSON has unknown event type', async () => {
      const { POST } = await import('./route.js');
      const res = await POST(buildReq(JSON.stringify({ type: 'exec.teleported', event_id: 'x' })));

      expect(res.status).toBe(400);
      const body = await res.json() as { ok: boolean; error: string; issues: unknown };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('invalid_payload');
      expect(body.issues).toBeDefined();
    });
  });

  describe('200 — happy path', () => {
    it('returns 200 with ok, event_id, type, deduped=false for valid exec.approval.requested', async () => {
      const payload = PAYLOADS['exec.approval.requested'];
      const { POST } = await import('./route.js');
      const res = await POST(buildReq(JSON.stringify(payload)));

      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean; event_id: string; type: string; deduped: boolean };
      expect(body.ok).toBe(true);
      expect(body.event_id).toBe('evt-req-1');
      expect(body.type).toBe('exec.approval.requested');
      expect(body.deduped).toBe(false);
    });

    it('calls dispatchEvent exactly once with the parsed event', async () => {
      const payload = PAYLOADS['exec.approval.requested'];
      const { POST } = await import('./route.js');
      await POST(buildReq(JSON.stringify(payload)));

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      const [calledWith] = mockDispatch.mock.calls[0] as [typeof payload];
      expect(calledWith.type).toBe('exec.approval.requested');
      expect(calledWith.event_id).toBe('evt-req-1');
    });

    it('returns deduped=true when dispatchEvent returns {deduped: true}', async () => {
      mockDispatch.mockResolvedValue({ deduped: true });

      const payload = PAYLOADS['exec.approval.requested'];
      const { POST } = await import('./route.js');
      const res = await POST(buildReq(JSON.stringify(payload)));

      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean; deduped: boolean };
      expect(body.ok).toBe(true);
      expect(body.deduped).toBe(true);
    });

    it('echoes back the event_id in the 200 response', async () => {
      const payload = PAYLOADS['exec.running'];
      const { POST } = await import('./route.js');
      const res = await POST(buildReq(JSON.stringify(payload)));

      expect(res.status).toBe(200);
      const body = await res.json() as { event_id: string };
      expect(body.event_id).toBe('evt-run-1');
    });
  });

  describe('200 — all 5 event types route through successfully', () => {
    const eventTypes = [
      'exec.approval.requested',
      'exec.approval.resolved',
      'exec.running',
      'exec.finished',
      'exec.denied',
    ] as const;

    for (const type of eventTypes) {
      it(`returns 200 for ${type}`, async () => {
        const payload = PAYLOADS[type];
        const { POST } = await import('./route.js');
        const res = await POST(buildReq(JSON.stringify(payload)));

        expect(res.status).toBe(200);
        const body = await res.json() as { ok: boolean; type: string };
        expect(body.ok).toBe(true);
        expect(body.type).toBe(type);
      });
    }
  });

  describe('500 — dispatch throws', () => {
    it('returns 500 with dispatch_failed when dispatchEvent throws', async () => {
      mockDispatch.mockRejectedValue(new Error('db connection failed'));

      const payload = PAYLOADS['exec.approval.requested'];
      const { POST } = await import('./route.js');
      const res = await POST(buildReq(JSON.stringify(payload)));

      expect(res.status).toBe(500);
      const body = await res.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('dispatch_failed');
    });

    it('calls Sentry.captureException when dispatchEvent throws', async () => {
      const thrown = new Error('db connection failed');
      mockDispatch.mockRejectedValue(thrown);

      const payload = PAYLOADS['exec.approval.requested'];
      const { POST } = await import('./route.js');
      await POST(buildReq(JSON.stringify(payload)));

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [err] = mockCaptureException.mock.calls[0] as [Error];
      expect(err).toBe(thrown);
    });
  });

  describe('Sentry instrumentation', () => {
    it('calls Sentry.startSpan with op=aegis.webhook.openclaw and name=event.type', async () => {
      const payload = PAYLOADS['exec.approval.requested'];
      const { POST } = await import('./route.js');
      await POST(buildReq(JSON.stringify(payload)));

      expect(mockStartSpan).toHaveBeenCalledTimes(1);
      const [spanOpts] = mockStartSpan.mock.calls[0] as [{ op: string; name: string }];
      expect(spanOpts.op).toBe('aegis.webhook.openclaw');
      expect(spanOpts.name).toBe('exec.approval.requested');
    });
  });

  describe('HMAC raw body', () => {
    it('passes the raw request body string to verifyWebhookSignature before JSON parsing', async () => {
      const rawBody = JSON.stringify(PAYLOADS['exec.running']);
      const { POST } = await import('./route.js');
      await POST(
        buildReq(rawBody, { 'x-openclaw-signature': 'sha256=abc123' }),
      );

      expect(mockVerify).toHaveBeenCalledTimes(1);
      const [passedRaw] = mockVerify.mock.calls[0] as [string, string, string];
      expect(passedRaw).toBe(rawBody);
    });
  });
});
