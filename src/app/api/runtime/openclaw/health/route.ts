import { type NextRequest, NextResponse } from "next/server";
import {
  authorizeOpenclawRuntimeRequest,
  buildRuntimeHealthPayload,
  ensureOpenclawRuntimeBridgeStarted,
} from "@/lib/openclaw-runtime";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauthorized = authorizeOpenclawRuntimeRequest(req);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    await ensureOpenclawRuntimeBridgeStarted();
  } catch {
    // Health stays 200 so the stack can come up while the gateway is still booting.
  }

  return NextResponse.json(buildRuntimeHealthPayload());
}
