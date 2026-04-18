// src/app/api/approvals/route.test.ts — Vitest tests for GET /api/approvals

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockListPending, mockCookiesGet, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockListPending: vi.fn(),
  mockCookiesGet: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/approvals', () => ({
  listPending: mockListPending,
}));

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

vi.mock('@/lib/auth', async () => {
  const real = await import('../../../lib/auth');
  return real;
});

vi.mock('@/lib/api', async () => {
  const real = await import('../../../lib/api');
  return real;
});

vi.mock('@/lib/request-context', () => ({
  getRequestId: () => 'test-request-id',
}));

const mockCookieStore = { get: mockCookiesGet };
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

vi.mock('@aegis/types', async () => {
  const real = await import('../../../../packages/types/src/index');
  return real;
});

// ── Env + constants ───────────────────────────────────────────────────────────

import { issueSession } from '../../../lib/auth';

const SESSION_SECRET = 'test-secret-must-be-at-least-32-chars-long';
const VALID_TOKEN = issueSession('operator', SESSION_SECRET);

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env['AEGIS_SESSION_SECRET'];
  process.env['AEGIS_SESSION_SECRET'] = SESSION_SECRET;
  process.env['SKIP_ENV_VALIDATION'] = 'true';

  vi.clearAllMocks();
});

afterEach(() => {
  if (savedSecret === undefined) {
    delete process.env['AEGIS_SESSION_SECRET'];
  } else {
    process.env['AEGIS_SESSION_SECRET'] = savedSecret;
  }
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PENDING_APPROVAL = {
  id: 'apr-smoke-1',
  session_id: 'sess-1',
  tool: 'exec',
  args: { cmd: 'ls' },
  system_run_plan: null,
  status: 'pending' as const,
  decided_by: null,
  decided_at: null,
  decision_scope: null,
  reason: null,
  sentry_issue_url: null,
  created_at: '2026-04-18T11:00:00.000Z',
};

function makeGetReq(url = 'http://localhost/api/approvals'): Request {
  return new Request(url, { method: 'GET' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/approvals', () => {
  it('[401] missing session cookie returns 401 unauthorized', async () => {
    mockCookiesGet.mockReturnValue(undefined);

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthorized');
  });

  it('[401] invalid/tampered session cookie returns 401 unauthorized', async () => {
    mockCookiesGet.mockReturnValue({ value: 'invalid.token.tampered' });

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthorized');
  });

  it('[200] authenticated with valid session returns ok envelope with data array', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });
    mockListPending.mockResolvedValue([PENDING_APPROVAL]);

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('[200] data array contains the pending approval from listPending', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });
    mockListPending.mockResolvedValue([PENDING_APPROVAL]);

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq());

    const body = await res.json() as { ok: boolean; data: Array<{ id: string; status: string }> };
    expect(body.data[0].id).toBe('apr-smoke-1');
    expect(body.data[0].status).toBe('pending');
  });

  it('[200] empty pending list returns ok envelope with empty array', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });
    mockListPending.mockResolvedValue([]);

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('[400] invalid limit query param (non-numeric) returns 400 invalid_query', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq('http://localhost/api/approvals?limit=notanumber'));

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_query');
  });

  it('[400] limit below minimum (0) returns 400 invalid_query', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq('http://localhost/api/approvals?limit=0'));

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_query');
  });

  it('[400] limit above maximum (101) returns 400 invalid_query', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq('http://localhost/api/approvals?limit=101'));

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_query');
  });

  it('[400] invalid status enum value returns 400 invalid_query', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq('http://localhost/api/approvals?status=unknown_status'));

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_query');
  });

  it('[query forwarding] passes userId from session token to listPending', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });
    mockListPending.mockResolvedValue([]);

    const { GET } = await import('./route.js');
    await GET(makeGetReq());

    expect(mockListPending).toHaveBeenCalledWith(
      'operator',
      expect.any(Object),
    );
  });

  it('[query forwarding] passes limit=5 from query string to listPending', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });
    mockListPending.mockResolvedValue([]);

    const { GET } = await import('./route.js');
    await GET(makeGetReq('http://localhost/api/approvals?limit=5'));

    expect(mockListPending).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('[500] listPending throws → 500 internal error', async () => {
    mockCookiesGet.mockReturnValue({ value: VALID_TOKEN });
    mockListPending.mockRejectedValue(new Error('db connection refused'));

    const { GET } = await import('./route.js');
    const res = await GET(makeGetReq());

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('internal');
  });
});
