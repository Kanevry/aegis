// src/app/api/auth/logout/route.test.ts — Vitest tests for POST /api/auth/logout

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Alias shim — forward @/ import to real implementation ─────────────────────

vi.mock("@/lib/auth", async () => {
  const real = await import("../../../../lib/auth");
  return real;
});

// ── Cookie mock ───────────────────────────────────────────────────────────────

const mockDelete = vi.fn();
const mockCookieStore = { delete: mockDelete };
const mockCookies = vi.fn().mockResolvedValue(mockCookieStore);

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue(mockCookieStore);
  });

  it("[clears cookie] POST → 204 status, cookies.delete called once with aegis_session", async () => {
    const { POST } = await import("./route.js");
    const res = await POST();

    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith("aegis_session");
  });

  it("[empty body] 204 response has no body content", async () => {
    const { POST } = await import("./route.js");
    const res = await POST();

    expect(res.status).toBe(204);
    const text = await res.text();
    expect(text).toBe("");
  });

  it("[idempotent] calling logout twice still returns 204 both times with delete called each time", async () => {
    const { POST } = await import("./route.js");

    const res1 = await POST();
    expect(res1.status).toBe(204);

    const res2 = await POST();
    expect(res2.status).toBe(204);

    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete).toHaveBeenNthCalledWith(1, "aegis_session");
    expect(mockDelete).toHaveBeenNthCalledWith(2, "aegis_session");
  });
});
