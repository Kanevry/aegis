// src/app/api/health/route.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("npm_package_version", "1.2.3");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns HTTP 200", async () => {
    const res = GET();
    expect(res.status).toBe(200);
  });

  it("returns ok: true", async () => {
    const res = GET();
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("includes version from npm_package_version", async () => {
    const res = GET();
    const body = await res.json() as { version: string };
    expect(body.version).toBe("1.2.3");
  });

  it("falls back to '0.1.0' when npm_package_version is unset", async () => {
    vi.unstubAllEnvs();
    delete process.env["npm_package_version"];
    const res = GET();
    const body = await res.json() as { version: string };
    expect(body.version).toBe("0.1.0");
  });

  it("includes uptime_s as a non-negative number", async () => {
    const res = GET();
    const body = await res.json() as { uptime_s: number };
    expect(typeof body.uptime_s).toBe("number");
    expect(body.uptime_s).toBeGreaterThanOrEqual(0);
  });

  it("sets Cache-Control: no-store", () => {
    const res = GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
