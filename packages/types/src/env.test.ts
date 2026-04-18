import { describe, it, expect } from "vitest";
import { loadEnv, isDemoMode, isLayerEnabled } from "./env";

// ── Shared valid baseline ─────────────────────────────────────────────────────
const VALID_ENV = {
  OPENAI_API_KEY: "sk-proj-x".padEnd(25, "x"),
  NEXT_PUBLIC_SENTRY_DSN: "https://key@o0.ingest.sentry.io/0",
} as const;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("loadEnv", () => {
  it("throws when OPENAI_API_KEY and NEXT_PUBLIC_SENTRY_DSN are missing", () => {
    expect(() => loadEnv({})).toThrow(/Invalid Ægis env/);
  });

  it("throws when OPENAI_API_KEY is too short / wrong prefix", () => {
    expect(() =>
      loadEnv({
        OPENAI_API_KEY: "short",
        NEXT_PUBLIC_SENTRY_DSN: "https://key@o0.ingest.sentry.io/0",
      })
    ).toThrow(/Invalid Ægis env/);
  });

  it("throws when NEXT_PUBLIC_SENTRY_DSN is not a valid URL", () => {
    expect(() =>
      loadEnv({
        NEXT_PUBLIC_SENTRY_DSN: "not-a-url",
        OPENAI_API_KEY: "sk-proj-validkey1234567890",
      })
    ).toThrow(/Invalid Ægis env/);
  });

  it("parses a valid env and applies all defaults", () => {
    const env = loadEnv({ ...VALID_ENV });

    expect(env.OPENAI_API_KEY).toBe(VALID_ENV.OPENAI_API_KEY);
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe(VALID_ENV.NEXT_PUBLIC_SENTRY_DSN);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.AEGIS_HARDENING_ENABLED).toBe(true);
    expect(env.AEGIS_LAYER_B1_PATHS).toBe(true);
    expect(env.AEGIS_LAYER_B2_PII).toBe(true);
    expect(env.AEGIS_LAYER_B3_REFS).toBe(true);
    expect(env.AEGIS_LAYER_B4_SECURITY).toBe(true);
    expect(env.AEGIS_LAYER_B5_REDACTION).toBe(true);
    expect(env.AEGIS_DEMO_MODE).toBe(false);
    expect(env.NEXT_PUBLIC_SENTRY_ENABLED).toBe(true);
    expect(env.AEGIS_SENTRY_FEEDBACK_WIDGET).toBe(true);
    expect(env.SKIP_ENV_VALIDATION).toBe(false);
  });

  it("isDemoMode returns true when AEGIS_DEMO_MODE=true", () => {
    const env = loadEnv({ ...VALID_ENV, AEGIS_DEMO_MODE: "true" });
    expect(isDemoMode(env)).toBe(true);
  });

  it("isLayerEnabled returns false for B4 when AEGIS_LAYER_B4_SECURITY=false", () => {
    const env = loadEnv({ ...VALID_ENV, AEGIS_LAYER_B4_SECURITY: "false" });
    expect(isLayerEnabled(env, "B4")).toBe(false);
  });

  it("isLayerEnabled returns false for B1 when AEGIS_HARDENING_ENABLED=false (master switch)", () => {
    const env = loadEnv({ ...VALID_ENV, AEGIS_HARDENING_ENABLED: "false" });
    expect(isLayerEnabled(env, "B1")).toBe(false);
  });
});
