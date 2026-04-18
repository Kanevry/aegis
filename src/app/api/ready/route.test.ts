// src/app/api/ready/route.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// fetch is globally available in Node 18+; we replace it with a mock.
const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mockFetch.mockReset();
});

// Helper: produce a minimal Response-like object accepted by the route.
function makeResponse(status: number): Response {
  return new Response(null, { status });
}

describe("GET /api/ready", () => {
  describe("all deps green", () => {
    it("returns 200 with ok: true when openclaw responds 2xx", async () => {
      // supabase: not configured → skipped
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      // openclaw responds OK
      mockFetch.mockResolvedValueOnce(makeResponse(200));

      // Dynamic import so env stubs are in place before module-level code runs.
      const { GET } = await import("./route");
      const res = await GET();
      const body = await res.json() as {
        ok: boolean;
        checks: { openclaw: { ok: boolean }; supabase: { ok: boolean; skipped?: boolean } };
      };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.checks.openclaw.ok).toBe(true);
      expect(body.checks.supabase.ok).toBe(false);
      expect(body.checks.supabase.skipped).toBe(true);
    });
  });

  describe("openclaw down", () => {
    it("returns 503 with openclaw.ok: false when fetch throws ECONNREFUSED", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1:8787"));

      const { GET } = await import("./route");
      const res = await GET();
      const body = await res.json() as {
        ok: boolean;
        checks: { openclaw: { ok: boolean; reason: string } };
      };

      expect(res.status).toBe(503);
      expect(body.ok).toBe(false);
      expect(body.checks.openclaw.ok).toBe(false);
      expect(body.checks.openclaw.reason).toBe("dns/econnrefused");
    });
  });

  describe("supabase not configured", () => {
    it("skips supabase but overall ok is still true when openclaw is up", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      mockFetch.mockResolvedValueOnce(makeResponse(200));

      const { GET } = await import("./route");
      const res = await GET();
      const body = await res.json() as {
        ok: boolean;
        checks: {
          supabase: { ok: boolean; skipped: boolean; reason: string };
          openclaw: { ok: boolean };
        };
      };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.checks.supabase.ok).toBe(false);
      expect(body.checks.supabase.skipped).toBe(true);
      expect(body.checks.supabase.reason).toMatch(/not configured/i);
    });
  });

  describe("pgboss", () => {
    it("always skips pgboss check", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      mockFetch.mockResolvedValueOnce(makeResponse(200));

      const { GET } = await import("./route");
      const res = await GET();
      const body = await res.json() as {
        checks: { pgboss: { ok: boolean; skipped: boolean } };
      };

      expect(body.checks.pgboss.ok).toBe(false);
      expect(body.checks.pgboss.skipped).toBe(true);
    });
  });

  describe("supabase configured and reachable", () => {
    it("returns ok: true when supabase responds with 4xx (endpoint up, auth error expected)", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
      // supabase fetch → 400 (no apikey header), openclaw → 200
      mockFetch
        .mockResolvedValueOnce(makeResponse(400))  // supabase
        .mockResolvedValueOnce(makeResponse(200));  // openclaw

      const { GET } = await import("./route");
      const res = await GET();
      const body = await res.json() as {
        ok: boolean;
        checks: { supabase: { ok: boolean } };
      };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.checks.supabase.ok).toBe(true);
    });
  });

  describe("cache headers", () => {
    it("sets Cache-Control: no-store", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      mockFetch.mockResolvedValueOnce(makeResponse(200));

      const { GET } = await import("./route");
      const res = await GET();
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });
});
