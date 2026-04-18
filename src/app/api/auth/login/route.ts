// src/app/api/auth/login/route.ts — POST /api/auth/login
// Node runtime required: node:crypto is not available on Edge runtime.

export const runtime = "nodejs";

import { cookies } from "next/headers";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { loadEnv } from "@aegis/types";
import { verifyPassphrase, issueSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { apiOk, apiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  passphrase: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  // Rate-limit: 500 requests per 60s per IP (#60) — demo-loose; bypassed
  // entirely when AEGIS_DEMO_MODE=true. Wiring stays on for telemetry.
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  const rl = await rateLimit({ key: `login:ip:${ip}`, max: 500, windowSec: 60 });
  if (!rl.ok) {
    Sentry.captureException(new Error("rate-limited"), {
      tags: { "aegis.ratelimited": "true" },
      fingerprint: ["aegis-ratelimited", "login"],
    });
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many login attempts. Retry later.",
      headers: { "retry-after": String(rl.retryAfterSec) },
    });
  }

  // Parse + validate body
  let body: z.infer<typeof BodySchema>;
  try {
    const raw: unknown = await req.json();
    body = BodySchema.parse(raw);
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return apiError({ status: 400, error: "invalid_body", issues });
  }

  const env = loadEnv();

  const passphraseHash = env.AEGIS_SESSION_PASSPHRASE_HASH;
  if (!passphraseHash) {
    // Operator hasn't configured auth — fail closed
    Sentry.captureException(new Error("aegis.auth.passphrase_hash_not_configured"));
    return apiError({ status: 503, error: "internal", message: "Auth not configured" });
  }

  const valid = verifyPassphrase(body.passphrase, passphraseHash);
  if (!valid) {
    Sentry.captureException(new Error("aegis.auth.failed_login"), {
      tags: { "aegis.auth": "failed_login" },
    });
    return apiError({ status: 401, error: "unauthorized", message: "Invalid passphrase" });
  }

  const secret = env.AEGIS_SESSION_SECRET;
  if (!secret) {
    Sentry.captureException(new Error("aegis.auth.session_secret_not_configured"));
    return apiError({ status: 503, error: "internal", message: "Auth not configured" });
  }

  const cookieValue = issueSession("operator", secret);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });

  return apiOk({ userId: "operator" });
}
