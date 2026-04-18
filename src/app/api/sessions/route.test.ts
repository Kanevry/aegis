// src/app/api/sessions/route.test.ts — Vitest tests for GET + POST /api/sessions

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Auth mock ─────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", async () => {
  const real = await import("../../../lib/auth");
  return real;
});

vi.mock("@/lib/api", async () => {
  const real = await import("../../../lib/api");
  return real;
});

// ── Sessions service mock ─────────────────────────────────────────────────────

const mockCreateSession = vi.fn();
const mockListSessions = vi.fn();

vi.mock("@/lib/sessions", () => ({
  createSession: mockCreateSession,
  listSessions: mockListSessions,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSec: 0 }),
}));

// ── Cookie mock ───────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockCookieStore = { get: mockGet };
const mockCookies = vi.fn().mockResolvedValue(mockCookieStore);

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

// ── Types mock ────────────────────────────────────────────────────────────────

vi.mock("@aegis/types", async () => {
  const real = await import("../../../../packages/types/src/index");
  return real;
});

// ── Env + constants ───────────────────────────────────────────────────────────

import { issueSession } from "../../../lib/auth";

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const VALID_TOKEN = issueSession("operator", SECRET);
const routeModulePromise = import("./route.js");

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env["AEGIS_SESSION_SECRET"];
  process.env["AEGIS_SESSION_SECRET"] = SECRET;
  process.env["SKIP_ENV_VALIDATION"] = "true";

  vi.clearAllMocks();
  mockCookies.mockResolvedValue(mockCookieStore);
});

afterEach(() => {
  if (savedSecret === undefined) {
    delete process.env["AEGIS_SESSION_SECRET"];
  } else {
    process.env["AEGIS_SESSION_SECRET"] = savedSecret;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetReq(url = "http://localhost/api/sessions"): Request {
  return new Request(url, { method: "GET" });
}

function makePostReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/sessions", () => {
  it("[happy] authenticated → 200 with sessions list", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    const fakeSessions = [
      { id: "s1", user_id: "operator", title: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    ];
    mockListSessions.mockResolvedValue(fakeSessions);

    const { GET } = await routeModulePromise;
    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("[401] missing cookie → 401 unauthorized", async () => {
    mockGet.mockReturnValue(undefined);

    const { GET } = await routeModulePromise;
    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[query params] passes limit from query string", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    mockListSessions.mockResolvedValue([]);

    const { GET } = await routeModulePromise;
    await GET(makeGetReq("http://localhost/api/sessions?limit=5"));

    expect(mockListSessions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });

  it("[service error] DB throws → 500 internal", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    mockListSessions.mockRejectedValue(new Error("db down"));

    const { GET } = await routeModulePromise;
    const res = await GET(makeGetReq());

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal");
  });
});

describe("POST /api/sessions", () => {
  it("[happy] authenticated with empty body → 201 with session id", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    const fakeSession = {
      id: "new-uuid",
      user_id: "operator",
      title: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    mockCreateSession.mockResolvedValue(fakeSession);

    const { POST } = await routeModulePromise;
    const res = await POST(makePostReq({}));

    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean; data: { id: string; title: unknown } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("new-uuid");
    expect(body.data.title).toBeNull();
  });

  it("[401] missing cookie → 401 unauthorized", async () => {
    mockGet.mockReturnValue(undefined);

    const { POST } = await routeModulePromise;
    const res = await POST(makePostReq({}));

    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[400] invalid body (non-JSON) → 400 invalid_body", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });

    const { POST } = await routeModulePromise;
    const badReq = new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json!!",
    });
    const res = await POST(badReq);

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("[service error] createSession throws → 500 internal", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    mockCreateSession.mockRejectedValue(new Error("db down"));

    const { POST } = await routeModulePromise;
    const res = await POST(makePostReq({}));

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal");
  });
});
