// src/app/api/sessions/route.ts — GET /api/sessions + POST /api/sessions

export const runtime = "nodejs";

import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { apiOk, apiError } from "@/lib/api";
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
