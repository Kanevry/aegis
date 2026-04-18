// src/app/api/auth/me/route.ts — GET /api/auth/me

export const runtime = "nodejs";

import { cookies } from "next/headers";
import { DEMO_USER_ID, SESSION_COOKIE_NAME, isDemoAuthDisabled, verifySession } from "@/lib/auth";
import { apiOk, apiError } from "@/lib/api";

export async function GET() {
  if (isDemoAuthDisabled()) {
    return apiOk({
      userId: DEMO_USER_ID,
      expiresAt: null,
    });
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const claim = verifySession(cookieValue);
  if (!claim.valid) {
    return apiError({ status: 401, error: "unauthorized" });
  }

  return apiOk({
    userId: claim.userId,
    expiresAt: claim.expiresAt.toISOString(),
  });
}
