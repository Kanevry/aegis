/**
 * @aegis/types — Zod env schema + loaders
 *
 * Defines and validates all environment variables used by Ægis.
 *
 * SKIP_ENV_VALIDATION=true bypasses parse-time validation — useful in CI
 * environments or local dev where real API keys are not available. When set,
 * loadEnv() returns a best-effort object populated from process.env with
 * schema defaults applied where values are absent.
 */

import { z } from "zod";

// ── Bool coercion helper ──────────────────────────────────────────────────────
// Accepts string 'true'/'false' (env vars arrive as strings) as well as native
// booleans (for programmatic callers passing objects directly).
const coercedBool = (defaultVal: boolean) =>
  z
    .preprocess(
      (v) => (v === "false" ? false : v === "true" ? true : v),
      z.boolean()
    )
    .default(defaultVal);

// ── Schema ────────────────────────────────────────────────────────────────────

export const AegisEnvSchema = z.object({
  // ── Escape hatch (skip at your own risk) ─────────────────────────────────
  /** When true, all other validations are skipped. Use only in dev/CI. */
  SKIP_ENV_VALIDATION: coercedBool(false),

  // ── Node ──────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  NEXT_PUBLIC_APP_URL: z.url().optional(),

  // ── OpenAI (required) ─────────────────────────────────────────────────────
  OPENAI_API_KEY: z
    .string()
    .min(20, "OPENAI_API_KEY must be at least 20 characters")
    .refine((v) => v.startsWith("sk-"), {
      message: "OPENAI_API_KEY must start with 'sk-'",
    }),

  // ── Anthropic (optional) ──────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z
    .string()
    .min(20, "ANTHROPIC_API_KEY must be at least 20 characters")
    .refine((v) => v.startsWith("sk-ant-"), {
      message: "ANTHROPIC_API_KEY must start with 'sk-ant-'",
    })
    .optional(),

  // ── Sentry ────────────────────────────────────────────────────────────────
  NEXT_PUBLIC_SENTRY_DSN: z.url("NEXT_PUBLIC_SENTRY_DSN must be a valid URL"),
  SENTRY_DSN: z.url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  NEXT_PUBLIC_SENTRY_ENABLED: coercedBool(true),
  AEGIS_SENTRY_FEEDBACK_WIDGET: coercedBool(true),

  // ── Ægis hardening master switch ──────────────────────────────────────────
  AEGIS_HARDENING_ENABLED: coercedBool(true),

  // ── Per-layer flags ───────────────────────────────────────────────────────
  AEGIS_LAYER_B1_PATHS: coercedBool(true),
  AEGIS_LAYER_B2_PII: coercedBool(true),
  AEGIS_LAYER_B3_REFS: coercedBool(true),
  AEGIS_LAYER_B4_SECURITY: coercedBool(true),
  AEGIS_LAYER_B5_REDACTION: coercedBool(true),

  // ── Circuit breaker ───────────────────────────────────────────────────────
  /** Flip to true at 16:00 if the demo breaks — returns scripted mock results. */
  AEGIS_DEMO_MODE: coercedBool(false),

  // ── OpenClaw Gateway (Phase 2) ────────────────────────────────────────────
  OPENCLAW_BASE_URL: z.url().default("http://localhost:8787"),
  OPENCLAW_API_TOKEN: z.string().min(1, "OPENCLAW_API_TOKEN required in production").optional(),
  OPENCLAW_WEBHOOK_SECRET: z.string().min(32, "OPENCLAW_WEBHOOK_SECRET must be ≥32 chars").optional(),
  OPENCLAW_AGENT_ID: z.string().default("openclaw/default"),

  // ── Supabase (Phase 2) ────────────────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.url().optional(),

  // ── pg-boss (Phase 2) ─────────────────────────────────────────────────────
  PGBOSS_SCHEMA: z.string().default("pgboss"),

  // ── Aegis Session Auth (Phase 2) ──────────────────────────────────────────
  AEGIS_SESSION_SECRET: z.string().min(32, "AEGIS_SESSION_SECRET must be ≥32 chars (hex)").optional(),
  AEGIS_SESSION_PASSPHRASE_HASH: z.string().optional(),

  // ── Discord Fan-out (Phase 2) ─────────────────────────────────────────────
  DISCORD_WEBHOOK_URL: z.url().optional(),
  DISCORD_DEEP_LINK_BASE: z.url().default("https://aegis-codex.vercel.app/dashboard/approvals"),
});

export type AegisEnv = z.infer<typeof AegisEnvSchema>;

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Parses and validates environment variables.
 *
 * Throws an actionable `Error` (not a raw ZodError) when required keys are
 * missing or malformed, so the server fails fast with a readable stack trace.
 *
 * Set `SKIP_ENV_VALIDATION=true` to bypass validation in dev/CI environments
 * where real secrets are not available.
 */
export function loadEnv(
  source: Record<string, string | undefined> = process.env
): AegisEnv {
  // Fast-path: if SKIP_ENV_VALIDATION is set, return defaults merged with raw env
  const skipRaw = source["SKIP_ENV_VALIDATION"];
  if (skipRaw === "true" || skipRaw === "1") {
    // Return a permissive object — required fields get placeholder-safe defaults.
    const permissive = {
      SKIP_ENV_VALIDATION: true,
      NODE_ENV: source["NODE_ENV"] ?? "development",
      PORT: source["PORT"] ? Number(source["PORT"]) : 3000,
      NEXT_PUBLIC_APP_URL: source["NEXT_PUBLIC_APP_URL"],
      OPENAI_API_KEY: source["OPENAI_API_KEY"] ?? "sk-skip-validation-placeholder",
      ANTHROPIC_API_KEY: source["ANTHROPIC_API_KEY"],
      NEXT_PUBLIC_SENTRY_DSN:
        source["NEXT_PUBLIC_SENTRY_DSN"] ??
        "https://placeholder@o0.ingest.sentry.io/0",
      SENTRY_DSN: source["SENTRY_DSN"],
      SENTRY_AUTH_TOKEN: source["SENTRY_AUTH_TOKEN"],
      SENTRY_ORG: source["SENTRY_ORG"],
      SENTRY_PROJECT: source["SENTRY_PROJECT"],
      NEXT_PUBLIC_SENTRY_ENABLED: source["NEXT_PUBLIC_SENTRY_ENABLED"] !== "false",
      AEGIS_SENTRY_FEEDBACK_WIDGET:
        source["AEGIS_SENTRY_FEEDBACK_WIDGET"] !== "false",
      AEGIS_HARDENING_ENABLED: source["AEGIS_HARDENING_ENABLED"] !== "false",
      AEGIS_LAYER_B1_PATHS: source["AEGIS_LAYER_B1_PATHS"] !== "false",
      AEGIS_LAYER_B2_PII: source["AEGIS_LAYER_B2_PII"] !== "false",
      AEGIS_LAYER_B3_REFS: source["AEGIS_LAYER_B3_REFS"] !== "false",
      AEGIS_LAYER_B4_SECURITY: source["AEGIS_LAYER_B4_SECURITY"] !== "false",
      AEGIS_LAYER_B5_REDACTION: source["AEGIS_LAYER_B5_REDACTION"] !== "false",
      AEGIS_DEMO_MODE: source["AEGIS_DEMO_MODE"] === "true",
      OPENCLAW_BASE_URL: source["OPENCLAW_BASE_URL"] ?? "http://localhost:8787",
      OPENCLAW_API_TOKEN: source["OPENCLAW_API_TOKEN"],
      OPENCLAW_WEBHOOK_SECRET: source["OPENCLAW_WEBHOOK_SECRET"],
      OPENCLAW_AGENT_ID: source["OPENCLAW_AGENT_ID"] ?? "openclaw/default",
      NEXT_PUBLIC_SUPABASE_URL: source["NEXT_PUBLIC_SUPABASE_URL"],
      NEXT_PUBLIC_SUPABASE_ANON_KEY: source["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      SUPABASE_SERVICE_ROLE_KEY: source["SUPABASE_SERVICE_ROLE_KEY"],
      DATABASE_URL: source["DATABASE_URL"],
      PGBOSS_SCHEMA: source["PGBOSS_SCHEMA"] ?? "pgboss",
      AEGIS_SESSION_SECRET: source["AEGIS_SESSION_SECRET"],
      AEGIS_SESSION_PASSPHRASE_HASH: source["AEGIS_SESSION_PASSPHRASE_HASH"],
      DISCORD_WEBHOOK_URL: source["DISCORD_WEBHOOK_URL"],
      DISCORD_DEEP_LINK_BASE: source["DISCORD_DEEP_LINK_BASE"] ?? "https://aegis-codex.vercel.app/dashboard/approvals",
    } as AegisEnv;
    return permissive;
  }

  try {
    return AegisEnvSchema.parse(source);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid Ægis env: ${issues}`);
    }
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LAYER_KEY_MAP: Record<"B1" | "B2" | "B3" | "B4" | "B5", keyof AegisEnv> = {
  B1: "AEGIS_LAYER_B1_PATHS",
  B2: "AEGIS_LAYER_B2_PII",
  B3: "AEGIS_LAYER_B3_REFS",
  B4: "AEGIS_LAYER_B4_SECURITY",
  B5: "AEGIS_LAYER_B5_REDACTION",
};

/**
 * Returns true only when BOTH the master switch and the per-layer flag are
 * enabled. A disabled master switch (`AEGIS_HARDENING_ENABLED=false`) turns
 * off all layers regardless of individual flag values.
 */
export function isLayerEnabled(
  env: AegisEnv,
  layer: "B1" | "B2" | "B3" | "B4" | "B5"
): boolean {
  if (!env.AEGIS_HARDENING_ENABLED) return false;
  return env[LAYER_KEY_MAP[layer]] as boolean;
}

/** Returns true when AEGIS_DEMO_MODE is active. */
export function isDemoMode(env: AegisEnv): boolean {
  return env.AEGIS_DEMO_MODE;
}
