// src/app/api/sessions/[id]/route.ts — GET /api/sessions/[id] + DELETE /api/sessions/[id]

export const runtime = "nodejs";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { apiOk, apiError } from "@/lib/api";
import { getSession } from "@/lib/sessions";
import { createServiceRoleClient } from "@/lib/supabase";

type RouteParams = { params: Promise<{ id: string }> };

// ── GET /api/sessions/[id] — get session with messages ────────────────────────

export async function GET(_req: Request, { params }: RouteParams) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claim = verifySession(cookieValue);

  if (!claim.valid) {
    return apiError({ status: 401, error: "unauthorized" });
  }

  const { id } = await params;

  try {
    const session = await getSession(id);

    if (!session) {
      return apiError({ status: 404, error: "not_found", message: "Session not found" });
    }

    return apiOk(session);
  } catch {
    return apiError({ status: 500, error: "internal" });
  }
}

// ── DELETE /api/sessions/[id] — delete session ────────────────────────────────

export async function DELETE(_req: Request, { params }: RouteParams) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claim = verifySession(cookieValue);

  if (!claim.valid) {
    return apiError({ status: 401, error: "unauthorized" });
  }

  const { id } = await params;

  const client = createServiceRoleClient();

  // Verify the session exists before deleting
  const { data: existing, error: fetchError } = await client
    .from("sessions")
    .select("id")
    .eq("id", id)
    .single<{ id: string }>();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return apiError({ status: 404, error: "not_found", message: "Session not found" });
    }
    return apiError({ status: 500, error: "internal" });
  }

  if (!existing) {
    return apiError({ status: 404, error: "not_found", message: "Session not found" });
  }

  const { error: deleteError } = await client.from("sessions").delete().eq("id", id);

  if (deleteError) {
    return apiError({ status: 500, error: "internal" });
  }

  return apiOk({ deleted: id });
}
