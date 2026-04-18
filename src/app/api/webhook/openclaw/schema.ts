import { z } from 'zod';

const approvalDecisionSchema = z.enum(['allow-once', 'allow-always', 'deny-once', 'deny-always']);

const systemRunPlanSchema = z
  .object({
    tool: z.string(),
    args: z.record(z.string(), z.unknown()),
    description: z.string().optional(),
    estimated_cost: z.number().optional(),
  })
  .passthrough();

export const openclawEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('exec.approval.requested'),
    event_id: z.string(),
    approval_id: z.string(),
    session_id: z.string().nullable().optional(),
    tool: z.string(),
    args: z.record(z.string(), z.unknown()),
    system_run_plan: systemRunPlanSchema.optional(),
    created_at: z.string().optional(),
  }),
  z.object({
    type: z.literal('exec.approval.resolved'),
    event_id: z.string(),
    approval_id: z.string(),
    decision: approvalDecisionSchema,
    decided_by: z.enum(['ui', 'discord', 'cli', 'auto']).optional(),
    decided_at: z.string().optional(),
    rejection_message: z.string().optional(),
  }),
  z.object({
    type: z.literal('exec.running'),
    event_id: z.string(),
    run_id: z.string(),
    tool: z.string(),
    started_at: z.string().optional(),
  }),
  z.object({
    type: z.literal('exec.finished'),
    event_id: z.string(),
    run_id: z.string(),
    exit_code: z.number(),
    duration_ms: z.number().optional(),
    output: z.string().optional(),
  }),
  z.object({
    type: z.literal('exec.denied'),
    event_id: z.string(),
    run_id: z.string(),
    reason: z.string(),
  }),
]);

export type OpenclawEventPayload = z.infer<typeof openclawEventSchema>;
