// src/app/api/sessions/[id]/route.test.ts — Vitest tests for GET + DELETE /api/sessions/[id]

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Auth mock ─────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", async () => {
  const real = await import("../../../../lib/auth");
  return real;
});

vi.mock("@/lib/api", async () => {
  const real = await import("../../../../lib/api");
  return real;
});

// ── Sessions service mock ─────────────────────────────────────────────────────

const mockGetSession = vi.fn();

vi.mock("@/lib/sessions", () => ({
  getSession: mockGetSession,
}));

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockChain = {
  from: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
};
Object.keys(mockChain).forEach((k) => {
  if (k !== "from") (mockChain as Record<string, ReturnType<typeof vi.fn>>)[k].mockReturnValue(mockChain);
});
mockChain.from.mockReturnValue(mockChain);

vi.mock("@/lib/supabase", () => ({
  createServiceRoleClient: vi.fn(() => mockChain),
}));

// ── Cookie mock ───────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockCookieStore = { get: mockGet };
const mockCookies = vi.fn().mockResolvedValue(mockCookieStore);

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

// ── Env + constants ───────────────────────────────────────────────────────────

import { issueSession } from "../../../../lib/auth";

const SECRET = "test-secret-at-least-thirty-two-characters-long";
const VALID_TOKEN = issueSession("operator", SECRET);

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env["AEGIS_SESSION_SECRET"];
  process.env["AEGIS_SESSION_SECRET"] = SECRET;
  process.env["SKIP_ENV_VALIDATION"] = "true";

  vi.clearAllMocks();
  mockCookies.mockResolvedValue(mockCookieStore);
  Object.keys(mockChain).forEach((k) => {
    (mockChain as Record<string, ReturnType<typeof vi.fn>>)[k].mockReturnValue(mockChain);
  });
  mockChain.from.mockReturnValue(mockChain);
});

afterEach(() => {
  if (savedSecret === undefined) {
    delete process.env["AEGIS_SESSION_SECRET"];
  } else {
    process.env["AEGIS_SESSION_SECRET"] = savedSecret;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRouteParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(method: string, id: string): Request {
  return new Request(`http://localhost/api/sessions/${id}`, { method });
}

// ── GET /api/sessions/[id] ────────────────────────────────────────────────────

describe("GET /api/sessions/[id]", () => {
  it("[happy] session found → 200 with session + messages", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    const fakeSession = {
      id: "sess-1",
      user_id: "operator",
      title: "Test",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      messages: [
        { id: "msg-1", session_id: "sess-1", role: "user", content: "hi", created_at: "2026-01-01T00:00:01Z" },
      ],
    };
    mockGetSession.mockResolvedValue(fakeSession);

    const { GET } = await import("./route.js");
    const res = await GET(makeReq("GET", "sess-1"), makeRouteParams("sess-1"));

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: typeof fakeSession };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe("sess-1");
    expect(body.data.messages).toHaveLength(1);
  });

  it("[404] session not found → 404 not_found", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    mockGetSession.mockResolvedValue(null);

    const { GET } = await import("./route.js");
    const res = await GET(makeReq("GET", "no-such"), makeRouteParams("no-such"));

    expect(res.status).toBe(404);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not_found");
  });

  it("[401] missing auth → 401 unauthorized", async () => {
    mockGet.mockReturnValue(undefined);

    const { GET } = await import("./route.js");
    const res = await GET(makeReq("GET", "sess-1"), makeRouteParams("sess-1"));

    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[500] service throws → 500 internal", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    mockGetSession.mockRejectedValue(new Error("db down"));

    const { GET } = await import("./route.js");
    const res = await GET(makeReq("GET", "sess-1"), makeRouteParams("sess-1"));

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal");
  });
});

// ── DELETE /api/sessions/[id] ─────────────────────────────────────────────────

describe("DELETE /api/sessions/[id]", () => {
  it("[happy] session deleted → 200 with deleted id", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    // First call: select to verify existence → returns row
    mockChain.single.mockResolvedValue({ data: { id: "sess-1" }, error: null });
    // Second call: delete → no error
    mockChain.eq.mockImplementation(() => {
      return { ...mockChain, then: undefined };
    });
    // Override final delete eq to resolve empty error
    let eqCallCount = 0;
    mockChain.eq.mockImplementation(() => {
      eqCallCount++;
      // After single is called (1st eq for select .eq("id",x)), the second eq is for delete
      return mockChain;
    });
    // single is used in existence check
    mockChain.single.mockResolvedValueOnce({ data: { id: "sess-1" }, error: null });
    // delete chain: from → delete → eq → resolves
    mockChain.delete.mockReturnValue(mockChain);
    // The delete eq resolves to no error
    const deleteResult = { data: null, error: null };
    // We need the second chain after delete+eq to resolve
    // After existence single resolves, the route calls .delete().eq() which should resolve
    // We'll use a counter approach with mockImplementation on the whole chain
    let fromCallCount = 0;
    mockChain.from.mockImplementation(() => {
      fromCallCount++;
      return mockChain;
    });
    // Reset and set up properly
    mockChain.single.mockReset();
    mockChain.single.mockResolvedValue({ data: { id: "sess-1" }, error: null });
    // delete().eq("id", id) → resolves to deleteResult
    // We mock the terminal: mockChain itself when awaited after delete+eq
    // The route does: await client.from("sessions").delete().eq("id", id)
    // Since mockChain.eq returns mockChain, and mockChain is not a thenable by default,
    // we need to make it resolve. Let's make eq return a resolved promise on 2nd call.
    eqCallCount = 0;
    mockChain.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount === 1) return mockChain; // first eq for select
      // second eq for delete → returns a promise
      return Promise.resolve(deleteResult);
    });

    const { DELETE } = await import("./route.js");
    const res = await DELETE(makeReq("DELETE", "sess-1"), makeRouteParams("sess-1"));

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: { deleted: string } };
    expect(body.ok).toBe(true);
    expect(body.data.deleted).toBe("sess-1");
  });

  it("[404] session not found on lookup → 404", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    mockChain.single.mockResolvedValue({ data: null, error: { message: "not found", code: "PGRST116" } });

    const { DELETE } = await import("./route.js");
    const res = await DELETE(makeReq("DELETE", "no-such"), makeRouteParams("no-such"));

    expect(res.status).toBe(404);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not_found");
  });

  it("[401] missing auth → 401 unauthorized", async () => {
    mockGet.mockReturnValue(undefined);

    const { DELETE } = await import("./route.js");
    const res = await DELETE(makeReq("DELETE", "sess-1"), makeRouteParams("sess-1"));

    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[500] delete DB error → 500 internal", async () => {
    mockGet.mockReturnValue({ value: VALID_TOKEN });
    mockChain.single.mockResolvedValue({ data: { id: "sess-1" }, error: null });
    // delete().eq() → resolves to error
    let eqCallCount = 0;
    mockChain.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount === 1) return mockChain;
      return Promise.resolve({ data: null, error: { message: "delete failed" } });
    });

    const { DELETE } = await import("./route.js");
    const res = await DELETE(makeReq("DELETE", "sess-1"), makeRouteParams("sess-1"));

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal");
  });
});
