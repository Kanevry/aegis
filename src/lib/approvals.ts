import type { Approval, ApprovalDecision, ApprovalDecidedBy, ApprovalStatus } from "@aegis/types";
import { enqueue, QUEUES } from "./pgboss-client";
import { asIsoString, query, queryOne } from "./postgres";

async function scheduleExpire(id: string, delaySeconds = 900): Promise<void> {
  try {
    await enqueue(QUEUES.APPROVAL_EXPIRE, { id }, { startAfter: delaySeconds });
  } catch (err) {
    console.warn("[approvals] failed to schedule approval.expire", err);
  }
}

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

export type HardeningResultInput = {
  safetyScore: number;
  blockedLayers: string[];
  allowed: boolean;
};

type ApprovalRow = {
  id: string;
  session_id: string | null;
  tool: string;
  args: Record<string, unknown>;
  system_run_plan: unknown | null;
  status: ApprovalStatus;
  decided_by: ApprovalDecidedBy | null;
  decided_at: Date | string | null;
  decision_scope: ApprovalDecision | null;
  reason: string | null;
  sentry_issue_url: string | null;
  created_at: Date | string;
};

function mapApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    session_id: row.session_id,
    tool: row.tool,
    args: row.args,
    system_run_plan: row.system_run_plan,
    status: row.status,
    decided_by: row.decided_by,
    decided_at: row.decided_at ? asIsoString(row.decided_at) : null,
    decision_scope: row.decision_scope,
    reason: row.reason,
    sentry_issue_url: row.sentry_issue_url,
    created_at: asIsoString(row.created_at),
  };
}

export async function createApproval(
  input: CreateApprovalInput,
  _client?: unknown,
): Promise<Approval> {
  const row = await queryOne<ApprovalRow>(
    `
      insert into approvals (
        id,
        session_id,
        tool,
        args,
        system_run_plan,
        status
      )
      values ($1, $2, $3, $4::jsonb, $5::jsonb, 'pending')
      returning *
    `,
    [
      input.openclaw_approval_id,
      input.session_id,
      input.tool,
      JSON.stringify(input.args),
      JSON.stringify(input.system_run_plan ?? null),
    ],
  );

  if (!row) throw new Error("createApproval returned no data");

  await scheduleExpire(row.id);
  return mapApproval(row);
}

export async function getApproval(id: string, _client?: unknown): Promise<Approval | null> {
  const row = await queryOne<ApprovalRow>(
    `
      select *
      from approvals
      where id = $1
    `,
    [id],
  );

  return row ? mapApproval(row) : null;
}

export async function listPending(
  userId: string,
  filters: { tool?: string; since?: Date; limit?: number } = {},
  _client?: unknown,
): Promise<Approval[]> {
  const params: unknown[] = [userId];
  const where = ["s.user_id = $1", "a.status = 'pending'"];

  if (filters.tool) {
    params.push(filters.tool);
    where.push(`a.tool = $${params.length}`);
  }

  if (filters.since) {
    params.push(filters.since.toISOString());
    where.push(`a.created_at >= $${params.length}`);
  }

  const limit = filters.limit ?? 20;
  params.push(limit);

  const rows = await query<ApprovalRow>(
    `
      select a.*
      from approvals a
      inner join sessions s on s.id = a.session_id
      where ${where.join(" and ")}
      order by a.created_at desc
      limit $${params.length}
    `,
    params,
  );

  return rows.map(mapApproval);
}

export async function listApprovals(
  userId: string,
  filters: { status?: ApprovalStatus | "all"; tool?: string; limit?: number } = {},
): Promise<Approval[]> {
  const params: unknown[] = [userId];
  const where = ["s.user_id = $1"];

  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }

  if (filters.tool) {
    params.push(filters.tool);
    where.push(`a.tool = $${params.length}`);
  }

  params.push(filters.limit ?? 20);

  const rows = await query<ApprovalRow>(
    `
      select a.*
      from approvals a
      inner join sessions s on s.id = a.session_id
      where ${where.join(" and ")}
      order by a.created_at desc
      limit $${params.length}
    `,
    params,
  );

  return rows.map(mapApproval);
}

export async function markDecided(
  input: MarkDecidedInput,
  _client?: unknown,
): Promise<Approval> {
  const newStatus = input.decision.startsWith("allow") ? "approved" : "denied";

  const row = await queryOne<ApprovalRow>(
    `
      update approvals
      set
        status = $2,
        decision_scope = $3,
        decided_by = $4,
        reason = $5,
        decided_at = now()
      where id = $1
        and status = 'pending'
      returning *
    `,
    [input.id, newStatus, input.decision, input.decided_by, input.reason ?? null],
  );

  if (!row) {
    throw new Error("markDecided returned no data — approval may already be decided");
  }

  return mapApproval(row);
}

export async function expireIfPending(
  id: string,
  _client?: unknown,
): Promise<"expired" | "already_decided"> {
  const row = await queryOne<{ status: string }>(
    `
      update approvals
      set status = 'expired'
      where id = $1
        and status = 'pending'
      returning status
    `,
    [id],
  );

  return row ? "expired" : "already_decided";
}

export async function logAegisDecisionForApproval(
  approvalId: string,
  result: HardeningResultInput,
  _client?: unknown,
): Promise<void> {
  if (result.blockedLayers.length === 0) return;

  const params: unknown[] = [];
  const values: string[] = [];

  for (const layer of result.blockedLayers) {
    params.push(
      approvalId,
      layer,
      result.allowed ? "warn" : "blocked",
      result.safetyScore,
      JSON.stringify({}),
    );
    const offset = params.length - 4;
    values.push(
      `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb)`,
    );
  }

  await query(
    `
      insert into aegis_decisions (
        approval_id,
        layer,
        outcome,
        safety_score,
        details
      )
      values ${values.join(", ")}
    `,
    params,
  );
}
