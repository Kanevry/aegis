// src/app/api/auth/me/route.test.ts — Vitest tests for GET /api/auth/me

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueSession } from "../../../../lib/auth";

// ── Alias shims — forward @/ imports to real implementations ──────────────────

vi.mock("@/lib/auth", async () => {
  const real = await import("../../../../lib/auth");
  return real;
});

vi.mock("@/lib/api", async () => {
  const real = await import("../../../../lib/api");
  return real;
});

// ── Cookie mock ───────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockCookieStore = { get: mockGet };
const mockCookies = vi.fn().mockResolvedValue(mockCookieStore);

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

// ── Env lifecycle ─────────────────────────────────────────────────────────────

const SECRET = "test-secret-at-least-thirty-two-characters-long";

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env["AEGIS_SESSION_SECRET"];
  process.env["AEGIS_SESSION_SECRET"] = SECRET;

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("[valid cookie] valid session → 200, body has userId operator and expiresAt as ISO 8601 string", async () => {
    const token = issueSession("operator", SECRET);
    mockGet.mockReturnValue({ value: token });

    const { GET } = await import("./route.js");
    const res = await GET();

    expect(res.status).toBe(200);

    const body = await res.json() as {
      ok: boolean;
      data: { userId: string; expiresAt: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.userId).toBe("operator");
    // expiresAt must round-trip through ISO 8601
    expect(typeof body.data.expiresAt).toBe("string");
    expect(new Date(body.data.expiresAt).toISOString()).toBe(body.data.expiresAt);
  });

  it("[no cookie] missing cookie value → 401 unauthorized", async () => {
    mockGet.mockReturnValue(undefined);

    const { GET } = await import("./route.js");
    const res = await GET();

    expect(res.status).toBe(401);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[expired cookie] session issued with negative TTL → 401 unauthorized", async () => {
    const token = issueSession("operator", SECRET, -10);
    mockGet.mockReturnValue({ value: token });

    const { GET } = await import("./route.js");
    const res = await GET();

    expect(res.status).toBe(401);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[tampered cookie] flipping a signature hex char → 401 unauthorized", async () => {
    const token = issueSession("operator", SECRET);
    const dot = token.lastIndexOf(".");
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const flippedChar = sig[0] === "0" ? "1" : "0";
    const tampered = `${payload}.${flippedChar}${sig.slice(1)}`;
    mockGet.mockReturnValue({ value: tampered });

    const { GET } = await import("./route.js");
    const res = await GET();

    expect(res.status).toBe(401);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[tampered payload] altering the payload portion → 401 unauthorized", async () => {
    const token = issueSession("operator", SECRET);
    const dot = token.lastIndexOf(".");
    const sig = token.slice(dot + 1);
    const payload = token.slice(0, dot);
    const altChar = payload[0] === "a" ? "b" : "a";
    const tampered = `${altChar}${payload.slice(1)}.${sig}`;
    mockGet.mockReturnValue({ value: tampered });

    const { GET } = await import("./route.js");
    const res = await GET();

    expect(res.status).toBe(401);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("[wrong secret] session signed with different secret → 401 unauthorized", async () => {
    const wrongSecretToken = issueSession("operator", "completely-different-secret-value-here-xx");
    mockGet.mockReturnValue({ value: wrongSecretToken });

    const { GET } = await import("./route.js");
    const res = await GET();

    expect(res.status).toBe(401);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });
});
