// src/app/api/auth/login/route.test.ts — Vitest tests for POST /api/auth/login

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Alias shims — forward @/ imports to real implementations ──────────────────
// Vitest has no root alias config; these mocks satisfy the route's @/ imports
// while running the real logic.

vi.mock("@/lib/auth", async () => {
  const real = await import("../../../../lib/auth");
  return real;
});

vi.mock("@/lib/api", async () => {
  const real = await import("../../../../lib/api");
  return real;
});

// ── External mocks ────────────────────────────────────────────────────────────

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
}));

const mockSet = vi.fn();
const mockCookieStore = { set: mockSet };
const mockCookies = vi.fn().mockResolvedValue(mockCookieStore);

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

// ── Test constants ────────────────────────────────────────────────────────────

import { hashPassphrase } from "../../../../lib/auth";

const TEST_PASSPHRASE = "correct-horse-battery-staple-42";
const SECRET = "test-secret-at-least-thirty-two-characters-long";

// Pre-compute once at module load — scrypt is expensive
const HASH = hashPassphrase(TEST_PASSPHRASE);

// ── Request factory ───────────────────────────────────────────────────────────

function makePostReq(body: unknown, rawBody?: string): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

// ── Env lifecycle ─────────────────────────────────────────────────────────────

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {
    AEGIS_SESSION_PASSPHRASE_HASH: process.env["AEGIS_SESSION_PASSPHRASE_HASH"],
    AEGIS_SESSION_SECRET: process.env["AEGIS_SESSION_SECRET"],
    SKIP_ENV_VALIDATION: process.env["SKIP_ENV_VALIDATION"],
  };

  process.env["AEGIS_SESSION_PASSPHRASE_HASH"] = HASH;
  process.env["AEGIS_SESSION_SECRET"] = SECRET;
  process.env["SKIP_ENV_VALIDATION"] = "true";

  vi.clearAllMocks();
  mockCookies.mockResolvedValue(mockCookieStore);
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

describe("POST /api/auth/login", () => {
  it("[success] valid passphrase → 200, userId operator, cookie set with httpOnly secure sameSite lax", async () => {
    const { POST } = await import("./route.js");
    const res = await POST(makePostReq({ passphrase: TEST_PASSPHRASE }));

    expect(res.status).toBe(200);

    const body = await res.json() as {
      ok: boolean;
      data: { userId: string };
      request_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.data.userId).toBe("operator");
    expect(typeof body.request_id).toBe("string");

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [cookieName, , opts] = mockSet.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(cookieName).toBe("aegis_session");
    expect(opts["httpOnly"]).toBe(true);
    expect(opts["secure"]).toBe(true);
    expect(opts["sameSite"]).toBe("lax");
    expect(opts["path"]).toBe("/");
    expect(opts["maxAge"]).toBe(604800);
  });

  it("[wrong passphrase] wrong password → 401 unauthorized, Sentry.captureException called once with failed_login tag", async () => {
    const { POST } = await import("./route.js");
    const res = await POST(makePostReq({ passphrase: "wrong-passphrase-long-enough" }));

    expect(res.status).toBe(401);

    const body = await res.json() as {
      ok: boolean;
      error: string;
      message: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
    expect(body.message).toBe("Invalid passphrase");

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [err, captureOpts] = mockCaptureException.mock.calls[0] as [Error, { tags: Record<string, string> }];
    expect(err.message).toBe("aegis.auth.failed_login");
    expect(captureOpts.tags["aegis.auth"]).toBe("failed_login");
  });

  it("[invalid body — missing field] empty object → 400 invalid_body", async () => {
    const { POST } = await import("./route.js");
    const res = await POST(makePostReq({}));

    expect(res.status).toBe(400);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("[invalid body — too short] passphrase shorter than 8 chars → 400 invalid_body with Zod issues", async () => {
    const { POST } = await import("./route.js");
    const res = await POST(makePostReq({ passphrase: "short" }));

    expect(res.status).toBe(400);

    const body = await res.json() as {
      ok: boolean;
      error: string;
      issues: unknown[];
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("[invalid body — too long] 201-char passphrase → 400 invalid_body", async () => {
    const { POST } = await import("./route.js");
    const res = await POST(makePostReq({ passphrase: "x".repeat(201) }));

    expect(res.status).toBe(400);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("[no passphrase echoed] wrong passphrase value does not appear in 401 response body", async () => {
    const { POST } = await import("./route.js");
    const wrongPass = "wrong-passphrase-long-enough";
    const res = await POST(makePostReq({ passphrase: wrongPass }));
    const text = await res.text();
    expect(text).not.toContain(wrongPass);
  });

  it("[missing passphrase hash env] AEGIS_SESSION_PASSPHRASE_HASH absent → 503 internal, Sentry called", async () => {
    delete process.env["AEGIS_SESSION_PASSPHRASE_HASH"];

    const { POST } = await import("./route.js");
    const res = await POST(makePostReq({ passphrase: TEST_PASSPHRASE }));

    expect(res.status).toBe(503);

    const body = await res.json() as { ok: boolean; error: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal");
    expect(body.message).toBe("Auth not configured");

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("[missing session secret env] AEGIS_SESSION_SECRET absent after valid passphrase → 503 internal, Sentry called", async () => {
    delete process.env["AEGIS_SESSION_SECRET"];

    const { POST } = await import("./route.js");
    const res = await POST(makePostReq({ passphrase: TEST_PASSPHRASE }));

    expect(res.status).toBe(503);

    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("internal");

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
