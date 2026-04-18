import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  authorizeOpenclawRuntimeRequest,
  ensureOpenclawRuntimeBridgeStarted,
  expirePendingRuntimeApprovals,
  listRuntimeApprovals,
  runtimeApprovalRequestSchema,
  upsertRuntimeApprovalRequest,
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
    // Listing mirrored approvals should still work from local store during reconnects.
  }

  await expirePendingRuntimeApprovals();
  const status = req.nextUrl.searchParams.get("status");
  const items = await listRuntimeApprovals(
    status === "pending" || status === "approved" || status === "denied" || status === "expired"
      ? { status }
      : undefined,
  );

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const unauthorized = authorizeOpenclawRuntimeRequest(req);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    await ensureOpenclawRuntimeBridgeStarted();
  } catch {
    // Manual mirrors are still accepted even if the live gateway bridge is reconnecting.
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = runtimeApprovalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const record = await Sentry.startSpan(
    {
      op: "aegis.openclaw.approval.request",
      name: "mirror runtime approval request",
      attributes: {
        "aegis.approval_id": parsed.data.approvalId,
        "aegis.session_key": parsed.data.sessionKey ?? "",
        "aegis.agent_id": parsed.data.agentId ?? "",
        "aegis.host": parsed.data.host ?? "",
        "aegis.node_id": parsed.data.nodeId ?? "",
        "aegis.outcome": "accepted",
      },
    },
    async () => upsertRuntimeApprovalRequest(parsed.data),
  );

  return NextResponse.json({
    status: "accepted",
    approvalId: record.approvalId,
    uiUrl: record.uiUrl,
  });
}
