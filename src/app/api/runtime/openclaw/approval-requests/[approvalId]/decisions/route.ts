import { type NextRequest, NextResponse } from "next/server";
import {
  authorizeOpenclawRuntimeRequest,
  ensureOpenclawRuntimeBridgeStarted,
  expireRuntimeApprovalIfNeeded,
  getRuntimeApproval,
  resolveRuntimeApprovalRequest,
  runtimeDecisionRequestSchema,
} from "@/lib/openclaw-runtime";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ approvalId: string }> },
) {
  const unauthorized = authorizeOpenclawRuntimeRequest(req);
  if (unauthorized) {
    return unauthorized;
  }

  await ensureOpenclawRuntimeBridgeStarted();

  const { approvalId } = await context.params;
  await expireRuntimeApprovalIfNeeded(approvalId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = runtimeDecisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await getRuntimeApproval(approvalId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.status === "expired") {
    return NextResponse.json({ error: "approval_expired" }, { status: 409 });
  }

  try {
    const resolved = await resolveRuntimeApprovalRequest({
      approvalId,
      decision: parsed.data.decision,
      resolvedBy: parsed.data.resolvedBy,
      source: parsed.data.source,
    });

    return NextResponse.json({
      status: "resolved",
      approvalId: resolved.approvalId,
      decision: resolved.decision,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "openclaw_resolution_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
