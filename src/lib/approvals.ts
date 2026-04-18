import type { SupabaseClient } from "@supabase/supabase-js";
import type { Approval, ApprovalDecision, ApprovalDecidedBy } from "@aegis/types";
import { createServiceRoleClient } from "./supabase";
import { enqueue, QUEUES } from "./pgboss-client";

async function scheduleExpire(id: string, delaySeconds = 900): Promise<void> {
  try {
    await enqueue(QUEUES.APPROVAL_EXPIRE, { id }, { startAfter: delaySeconds });
  } catch (err) {
    // pg-boss down → approval still persists; log and continue (best-effort schedule)
    console.warn('[approvals] failed to schedule approval.expire', err);
  }
}

// Inline type for CreateApprovalInput so we don't widen @aegis/types for internal params
export type CreateApprovalInput = {
  openclaw_approval_id: string;
  session_id: string | null;
  tool: string;
  args: Record<string, unknown>;
  system_run_plan: unknown;
};

export type MarkDecidedInput = {
  id: string;
  decision: ApprovalDecision;
  decided_by: ApprovalDecidedBy;
  reason?: string;
};

// Minimal shape of HardeningResult we actually read — inline to avoid importing @aegis/hardening here
export type HardeningResultInput = {
  safetyScore: number;
  blockedLayers: string[];
  allowed: boolean;
};

export async function createApproval(
  input: CreateApprovalInput,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<Approval> {
  const { data, error } = await client
    .from("approvals")
    .insert({
      id: input.openclaw_approval_id,
      session_id: input.session_id,
      tool: input.tool,
      args: input.args,
      system_run_plan: input.system_run_plan ?? null,
      status: "pending",
    })
    .select()
    .single<Approval>();

  if (error) throw new Error(`createApproval failed: ${error.message}`);
  if (!data) throw new Error("createApproval returned no data");

  await scheduleExpire(data.id);
  return data;
}

export async function getApproval(
  id: string,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<Approval | null> {
  const { data, error } = await client
    .from("approvals")
    .select("*")
    .eq("id", id)
    .single<Approval>();

  // PGRST116 = "exactly one row" violation (0 rows returned) — treat as not found
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`getApproval failed: ${error.message}`);
  }

  return data;
}

export async function listPending(
  userId: string,
  filters: { tool?: string; since?: Date; limit?: number } = {},
  client: SupabaseClient = createServiceRoleClient(),
): Promise<Approval[]> {
  // Use PostgREST embedded resource syntax for inner join with sessions.
  // !inner ensures only approvals that have a matching session row are returned.
  let query = client
    .from("approvals")
    .select("*, sessions!inner(user_id)")
    .eq("status", "pending")
    .eq("sessions.user_id", userId);

  if (filters.tool) {
    query = query.eq("tool", filters.tool);
  }
  if (filters.since) {
    query = query.gte("created_at", filters.since.toISOString());
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query.returns<Approval[]>();

  if (error) throw new Error(`listPending failed: ${error.message}`);
  return data ?? [];
}

export async function markDecided(
  input: MarkDecidedInput,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<Approval> {
  const newStatus = input.decision.startsWith("allow") ? "approved" : "denied";

  const { data, error } = await client
    .from("approvals")
    .update({
      status: newStatus,
      decision_scope: input.decision,
      decided_by: input.decided_by,
      reason: input.reason ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", "pending")
    .select()
    .single<Approval>();

  if (error) throw new Error(`markDecided failed: ${error.message}`);
  if (!data) throw new Error("markDecided returned no data — approval may already be decided");

  return data;
}

export async function expireIfPending(
  id: string,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<"expired" | "already_decided"> {
  const { data, error } = await client
    .from("approvals")
    .update({ status: "expired" })
    .eq("id", id)
    .eq("status", "pending")
    .select("status")
    .returns<{ status: string }[]>();

  if (error) throw new Error(`expireIfPending failed: ${error.message}`);

  // If at least one row was updated, the approval is now expired
  if (data && data.length > 0) return "expired";
  return "already_decided";
}

export async function logAegisDecisionForApproval(
  approvalId: string,
  result: HardeningResultInput,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<void> {
  if (result.blockedLayers.length === 0) return;

  const rows = result.blockedLayers.map((layer) => ({
    approval_id: approvalId,
    layer,
    outcome: result.allowed ? "warn" : "blocked",
    safety_score: result.safetyScore,
    details: {},
  }));

  const { error } = await client.from("aegis_decisions").insert(rows);

  if (error) throw new Error(`logAegisDecisionForApproval failed: ${error.message}`);
}
