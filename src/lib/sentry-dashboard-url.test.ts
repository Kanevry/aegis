import { describe, expect, it } from "vitest";
import { getSentryDashboardUrl } from "./sentry-dashboard-url";

type EnvLike = Record<string, string | undefined>;

describe("getSentryDashboardUrl", () => {
  it("builds the project dashboard URL when org and project are configured", () => {
    expect(
      getSentryDashboardUrl({
        SENTRY_ORG: "acme",
        SENTRY_PROJECT: "aegis",
      } as EnvLike)
    ).toBe("https://sentry.io/organizations/acme/projects/aegis/");
  });

  it("falls back to the organization page when only org is configured", () => {
    expect(
      getSentryDashboardUrl({
        SENTRY_ORG: "acme",
      } as EnvLike)
    ).toBe("https://sentry.io/organizations/acme/");
  });

  it("ignores placeholder org values", () => {
    expect(
      getSentryDashboardUrl({
        SENTRY_ORG: "your-org-slug",
        SENTRY_PROJECT: "aegis",
      } as EnvLike)
    ).toBe("https://sentry.io/organizations/");
  });
});
