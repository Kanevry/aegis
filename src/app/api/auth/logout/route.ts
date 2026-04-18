// src/app/api/auth/logout/route.ts — POST /api/auth/logout

export const runtime = "nodejs";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return new Response(null, { status: 204 });
}
