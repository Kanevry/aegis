import { z } from "zod";

export const approvalStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalDecisionSchema = z.enum(["allow-once", "allow-always", "deny-once", "deny-always"]);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const approvalDecidedBySchema = z.enum(["ui", "discord", "cli", "auto"]);
export type ApprovalDecidedBy = z.infer<typeof approvalDecidedBySchema>;

export const approvalSchema = z.object({
  id: z.string(),
  session_id: z.string().uuid().nullable(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  system_run_plan: z.unknown().nullable(),
  status: approvalStatusSchema,
  decided_by: approvalDecidedBySchema.nullable(),
  decided_at: z.string().nullable(),
  decision_scope: approvalDecisionSchema.nullable(),
  reason: z.string().nullable(),
  sentry_issue_url: z.string().url().nullable(),
  created_at: z.string(),
});
export type Approval = z.infer<typeof approvalSchema>;
