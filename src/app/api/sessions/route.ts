// src/app/api/sessions/route.ts — GET /api/sessions + POST /api/sessions

export const runtime = "nodejs";

import * as Sentry from "@sentry/nextjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { apiOk, apiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createSession, listSessions } from "@/lib/sessions";
import { CreateSessionBodySchema, ListSessionsQuerySchema } from "@aegis/types";

// ── GET /api/sessions — list sessions ─────────────────────────────────────────

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claim = verifySession(cookieValue);

  if (!claim.valid) {
    return apiError({ status: 401, error: "unauthorized" });
  }

  // Parse query params
  const url = new URL(req.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());

  let query: z.infer<typeof ListSessionsQuerySchema>;
  try {
    query = ListSessionsQuerySchema.parse(rawQuery);
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return apiError({ status: 400, error: "invalid_query", issues });
  }

  try {
    const sessions = await listSessions({
      userId: query.userId ?? claim.userId,
      limit: query.limit,
    });
    return apiOk(sessions);
  } catch {
    return apiError({ status: 500, error: "internal" });
  }
}

// ── POST /api/sessions — create session ───────────────────────────────────────

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claim = verifySession(cookieValue);

  if (!claim.valid) {
    return apiError({ status: 401, error: "unauthorized" });
  }

  const userId = claim.userId;
  // 2000 session creations per 60s (demo-loose; AEGIS_DEMO_MODE bypasses)
  const rl = await rateLimit({ key: `sessions:user:${userId}`, max: 2000, windowSec: 60 });
  if (!rl.ok) {
    Sentry.captureException(new Error("rate-limited"), {
      tags: { "aegis.ratelimited": "true" },
      fingerprint: ["aegis-ratelimited", "sessions"],
    });
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many session creations.",
      headers: { "retry-after": String(rl.retryAfterSec) },
    });
  }

  let body: z.infer<typeof CreateSessionBodySchema>;
  try {
    const raw: unknown = await req.json();
    body = CreateSessionBodySchema.parse(raw);
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return apiError({ status: 400, error: "invalid_body", issues });
  }

  try {
    const session = await createSession({ userId: body.userId ?? claim.userId });
    return apiOk(
      { id: session.id, createdAt: session.created_at, title: session.title },
      { status: 201 },
    );
  } catch {
    return apiError({ status: 500, error: "internal" });
  }
}
