import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/sentry/dashboard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to the configured Sentry project dashboard", () => {
    vi.stubEnv("SENTRY_ORG", "acme");
    vi.stubEnv("SENTRY_PROJECT", "aegis");

    const res = GET();

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://sentry.io/organizations/acme/projects/aegis/"
    );
  });

  it("falls back to the Sentry organizations page when org is still a placeholder", () => {
    vi.stubEnv("SENTRY_ORG", "your-org-slug");
    vi.stubEnv("SENTRY_PROJECT", "aegis");

    const res = GET();

    expect(res.headers.get("location")).toBe(
      "https://sentry.io/organizations/"
    );
  });
});
