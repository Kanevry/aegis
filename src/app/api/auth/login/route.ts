// src/app/api/auth/login/route.ts — POST /api/auth/login
// Node runtime required: node:crypto is not available on Edge runtime.

export const runtime = "nodejs";

// TODO #60 rate-limit

import { cookies } from "next/headers";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { loadEnv } from "@aegis/types";
import {
  DEMO_USER_ID,
  SESSION_COOKIE_NAME,
  isDemoAuthDisabled,
  issueSession,
  verifyPassphrase,
} from "@/lib/auth";
import { apiOk, apiError } from "@/lib/api";

const BodySchema = z.object({
  passphrase: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  if (isDemoAuthDisabled()) {
    return apiOk({ userId: DEMO_USER_ID, authDisabled: true });
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

  const cookieValue = issueSession(DEMO_USER_ID, secret);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const requestProto = (() => {
    try {
      return new URL(req.url).protocol;
    } catch {
      return null;
    }
  })();
  const shouldUseSecureCookie =
    forwardedProto === "https" || requestProto === "https:";

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: shouldUseSecureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });

  return apiOk({ userId: DEMO_USER_ID });
}
