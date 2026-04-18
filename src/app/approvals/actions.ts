"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  resolveRuntimeApprovalRequest,
  runtimeApprovalDecisionSchema,
} from "@/lib/openclaw-runtime";

export async function resolveApprovalAction(formData: FormData) {
  const approvalId = String(formData.get("approvalId") ?? "");
  const decision = runtimeApprovalDecisionSchema.parse(formData.get("decision"));

  await resolveRuntimeApprovalRequest({
    approvalId,
    decision,
    resolvedBy: "operator@aegis.local",
    source: "aegis-web-ui",
  });

  revalidatePath("/approvals");
  revalidatePath(`/approvals/${approvalId}`);
  redirect(`/approvals/${encodeURIComponent(approvalId)}?resolved=${encodeURIComponent(decision)}`);
}
