// src/middleware.test.ts — Vitest tests for src/middleware.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "./middleware";
import { issueSession, SESSION_COOKIE_NAME } from "./lib/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const SECRET = "test-secret-must-be-32-chars-or-more-long";

// UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ── Env lifecycle ─────────────────────────────────────────────────────────────

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env["AEGIS_SESSION_SECRET"];
  process.env["AEGIS_SESSION_SECRET"] = SECRET;
});

afterEach(() => {
  if (savedSecret === undefined) {
    delete process.env["AEGIS_SESSION_SECRET"];
  } else {
    process.env["AEGIS_SESSION_SECRET"] = savedSecret;
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeReq(
  pathname: string,
  init?: {
    headers?: Record<string, string>;
    cookieValue?: string;
  },
): NextRequest {
  const headers = new Headers(init?.headers);
  if (init?.cookieValue) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${init.cookieValue}`);
  }
  return new NextRequest(new URL(pathname, "http://localhost"), { headers });
}

/** Tamper the cookie by flipping the first character of the HMAC signature. */
function tamperCookie(cookie: string): string {
  const dot = cookie.lastIndexOf(".");
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const flippedFirst = sig[0] === "0" ? "1" : "0";
  return `${payload}.${flippedFirst}${sig.slice(1)}`;
}

// ── Tests: request-id propagation ─────────────────────────────────────────────

describe("middleware — request-id", () => {
  it("echoes a valid incoming x-request-id on the response (API path, pass-through)", async () => {
    const validCookie = issueSession("operator", SECRET);
    const req = makeReq("/api/chat/send", {
      headers: { "x-request-id": "abc12345" },
      cookieValue: validCookie,
    });
    const res = await middleware(req);
    expect(res.headers.get("x-request-id")).toBe("abc12345");
  });

  it("echoes a valid incoming x-request-id on the response (API path, unauthenticated 401)", async () => {
    const req = makeReq("/api/chat/send", {
      headers: { "x-request-id": "my-valid-id-1234" },
    });
    const res = await middleware(req);
    expect(res.headers.get("x-request-id")).toBe("my-valid-id-1234");
  });

  it("generates a fresh UUID when x-request-id is absent", async () => {
    const req = makeReq("/api/chat/send");
    const res = await middleware(req);
    const rid = res.headers.get("x-request-id");
    expect(rid).not.toBeNull();
    expect(UUID_RE.test(rid!)).toBe(true);
  });

  it("regenerates when incoming x-request-id is too short (< 8 chars)", async () => {
    const req = makeReq("/api/chat/send", {
      headers: { "x-request-id": "short" }, // 5 chars — below minimum
    });
    const res = await middleware(req);
    const rid = res.headers.get("x-request-id");
    expect(rid).not.toBe("short");
    expect(UUID_RE.test(rid!)).toBe(true);
  });

  it("regenerates when incoming x-request-id contains injection character '<'", async () => {
    const req = makeReq("/api/chat/send", {
      headers: { "x-request-id": "x<script>y" },
    });
    const res = await middleware(req);
    const rid = res.headers.get("x-request-id");
    expect(rid).not.toBe("x<script>y");
    expect(UUID_RE.test(rid!)).toBe(true);
  });

  it("regenerates when incoming x-request-id is too long (> 64 chars)", async () => {
    const longId = "a".repeat(65);
    const req = makeReq("/api/chat/send", {
      headers: { "x-request-id": longId },
    });
    const res = await middleware(req);
    const rid = res.headers.get("x-request-id");
    expect(rid).not.toBe(longId);
    expect(UUID_RE.test(rid!)).toBe(true);
  });
});

// ── Tests: valid session passes through ───────────────────────────────────────

describe("middleware — valid session passes through", () => {
  it("passes through /dashboard/chat/hello with valid cookie, sets x-request-id", async () => {
    const validCookie = issueSession("operator", SECRET);
    const req = makeReq("/dashboard/chat/hello", { cookieValue: validCookie });
    const res = await middleware(req);
    // Must NOT be 401 or redirect (3xx)
    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("x-request-id")).not.toBeNull();
    expect(UUID_RE.test(res.headers.get("x-request-id")!)).toBe(true);
  });

  it("passes through /api/chat/send with valid cookie", async () => {
    const validCookie = issueSession("operator", SECRET);
    const req = makeReq("/api/chat/send", { cookieValue: validCookie });
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("x-request-id")).not.toBeNull();
  });

  it("passes through /api/auth/me with valid cookie", async () => {
    const validCookie = issueSession("operator", SECRET);
    const req = makeReq("/api/auth/me", { cookieValue: validCookie });
    const res = await middleware(req);
    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("x-request-id")).not.toBeNull();
  });
});

// ── Tests: invalid/missing session — API path → 401 ──────────────────────────

describe("middleware — invalid/missing session on API path returns 401", () => {
  it("/api/chat/send with no cookie returns 401 JSON envelope", async () => {
    const req = makeReq("/api/chat/send");
    const res = await middleware(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("x-request-id")).not.toBeNull();

    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      message: string;
      request_id: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
    expect(body.message).toBe("Session required");
    expect(typeof body.request_id).toBe("string");
    expect(body.request_id.length).toBeGreaterThan(0);
  });

  it("/api/auth/me with no cookie returns 401 JSON envelope with x-request-id", async () => {
    const req = makeReq("/api/auth/me");
    const res = await middleware(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("x-request-id")).not.toBeNull();

    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("/api/auth/me with tampered cookie returns 401 envelope", async () => {
    const goodCookie = issueSession("operator", SECRET);
    const badCookie = tamperCookie(goodCookie);
    const req = makeReq("/api/auth/me", { cookieValue: badCookie });
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("/api/approvals/list with tampered cookie returns 401 envelope", async () => {
    const goodCookie = issueSession("operator", SECRET);
    const badCookie = tamperCookie(goodCookie);
    const req = makeReq("/api/approvals/list", { cookieValue: badCookie });
    const res = await middleware(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);

    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("/api/auth/me with expired cookie (ttlSeconds=-60) returns 401", async () => {
    const expiredCookie = issueSession("operator", SECRET, -60);
    const req = makeReq("/api/auth/me", { cookieValue: expiredCookie });
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("/api/chat/foo with AEGIS_SESSION_SECRET unset returns 401 envelope", async () => {
    // Issue a valid cookie first (while SECRET is set), then unset the env
    const goodCookie = issueSession("operator", SECRET);
    delete process.env["AEGIS_SESSION_SECRET"];

    const req = makeReq("/api/chat/foo", { cookieValue: goodCookie });
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);

    // Restore so afterEach doesn't double-delete
    process.env["AEGIS_SESSION_SECRET"] = SECRET;
  });

  it("/api/sessions/list with malformed cookie (no dot) returns 401 without throwing", async () => {
    const req = makeReq("/api/sessions/list", { cookieValue: "nodothere" });
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("/api/sessions/list with malformed cookie (multiple dots, empty segment) returns 401 without throwing", async () => {
    // Three segments where one is empty: "part1..part3"
    const req = makeReq("/api/sessions/list", { cookieValue: "part1..part3" });
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("/api/approvals/list with empty cookie value returns 401 without throwing", async () => {
    // Simulate a cookie header where the value is empty
    const req = makeReq("/api/approvals/list", { cookieValue: "" });
    const res = await middleware(req);
    // cookieValue="" means no cookie is set via the helper (guard in makeReq)
    // so this is equivalent to the no-cookie scenario
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});

// ── Tests: invalid session — page path → redirect ────────────────────────────

describe("middleware — invalid/missing session on page path redirects to /login", () => {
  it("/dashboard/chat/x with no cookie redirects to /login?next=/dashboard/chat/x", async () => {
    const req = makeReq("/dashboard/chat/x");
    const res = await middleware(req);
    // NextResponse.redirect defaults to 307
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location).toContain("/login");
    expect(location).toContain("next=%2Fdashboard%2Fchat%2Fx");
    expect(res.headers.get("x-request-id")).not.toBeNull();
  });

  it("/dashboard/approvals/xyz with tampered cookie redirects preserving next param", async () => {
    const goodCookie = issueSession("operator", SECRET);
    const badCookie = tamperCookie(goodCookie);
    const req = makeReq("/dashboard/approvals/xyz", {
      cookieValue: badCookie,
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location).toContain("/login");
    expect(location).toContain("next=");
    expect(location).toContain("%2Fdashboard%2Fapprovals%2Fxyz");
    expect(res.headers.get("x-request-id")).not.toBeNull();
  });

  it("/dashboard/chat with expired cookie (ttlSeconds=-60) redirects to /login", async () => {
    const expiredCookie = issueSession("operator", SECRET, -60);
    const req = makeReq("/dashboard/chat/inbox", { cookieValue: expiredCookie });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location).toContain("/login");
    expect(location).toContain("next=%2Fdashboard%2Fchat%2Finbox");
    expect(res.headers.get("x-request-id")).not.toBeNull();
  });

  it("/dashboard/chat with malformed cookie (no dot) redirects without throwing", async () => {
    const req = makeReq("/dashboard/chat/inbox", { cookieValue: "nodothere" });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location).toContain("/login");
    expect(res.headers.get("x-request-id")).not.toBeNull();
  });
});

// ── Tests: matcher config ─────────────────────────────────────────────────────

describe("middleware — config.matcher", () => {
  it("contains exactly the 6 required paths", () => {
    const expected = new Set([
      "/dashboard/chat/:path*",
      "/dashboard/approvals/:path*",
      "/api/chat/:path*",
      "/api/approvals/:path*",
      "/api/sessions/:path*",
      "/api/auth/me",
    ]);
    expect(config.matcher).toHaveLength(6);
    for (const entry of config.matcher) {
      expect(expected.has(entry)).toBe(true);
    }
  });

  it("does NOT include /api/webhook/openclaw (webhook bypasses the session gate)", () => {
    const hasWebhook = config.matcher.some((m: string) =>
      m.includes("/api/webhook/openclaw"),
    );
    expect(hasWebhook).toBe(false);
  });
});
