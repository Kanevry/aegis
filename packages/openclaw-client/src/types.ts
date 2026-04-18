/** Canonical OpenClaw exec-approval envelope types (per OpenClaw API spec). */

export type ApprovalDecision =
  | "allow-once"
  | "allow-always"
  | "deny-once"
  | "deny-always";

export interface SystemRunPlan {
  /** Canonical OpenClaw plan describing the requested execution. Shape evolves with OpenClaw spec. */
  tool: string;
  args: Record<string, unknown>;
  description?: string;
  estimated_cost?: { tokens?: number; usd?: number };
  // Open-ended; allow extra fields without losing type safety on the known ones.
  [key: string]: unknown;
}

export interface ExecApprovalRequested {
  type: "exec.approval.requested";
  approval_id: string;
  session_id: string;
  tool: string;
  args: Record<string, unknown>;
  system_run_plan: SystemRunPlan;
  requested_at: string;
}

export interface ExecApprovalResolved {
  type: "exec.approval.resolved";
  approval_id: string;
  decision: ApprovalDecision;
  rejection_message?: string;
  resolved_at: string;
}

export interface ExecRunning {
  type: "exec.running";
  approval_id: string;
  started_at: string;
}

export interface ExecFinished {
  type: "exec.finished";
  approval_id: string;
  result: unknown;
  finished_at: string;
}

export interface ExecDenied {
  type: "exec.denied";
  approval_id: string;
  reason: string;
  denied_at: string;
}

export type OpenclawEvent =
  | ExecApprovalRequested
  | ExecApprovalResolved
  | ExecRunning
  | ExecFinished
  | ExecDenied;
