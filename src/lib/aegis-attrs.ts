// src/lib/aegis-attrs.ts — Sentry span attribute catalog for Aegis approval + job spans

export const AEGIS_APPROVAL_ATTRS = {
  ID: 'aegis.approval.id',
  TOOL: 'aegis.approval.tool',
  STATUS: 'aegis.approval.status',         // pending | approved | denied | expired
  DECISION: 'aegis.approval.decision',     // allow-once | allow-always | deny-once | deny-always
  DECIDED_BY: 'aegis.approval.decided_by', // ui | discord | cli | auto
  SAFETY_SCORE: 'aegis.approval.safety_score',
  BLOCKED_LAYERS: 'aegis.approval.blocked_layers',
} as const;

export const AEGIS_JOB_ATTRS = {
  QUEUE: 'aegis.job.queue',           // approval.expire | sentry.enrich | notification.dispatch | session.cleanup
  APPROVAL_ID: 'aegis.job.approval_id',
  CHANNEL: 'aegis.job.channel',       // notification only
  TEMPLATE: 'aegis.job.template',     // notification only
  RESULT: 'aegis.job.result',         // done | noop | retry | dead_letter
} as const;

export type ApprovalDeny = 'deny-once' | 'deny-always';

/**
 * Stable fingerprint for Seer grouping of approval-deny exceptions.
 * Pattern: ['aegis-approval-deny', tool, reason_category]
 * @param tool OpenClaw tool name (e.g. 'exec', 'code-exec').
 * @param reasonCategory Bucketed reason — e.g. 'pii', 'injection', 'user-deny'. Defaults to 'user-deny'.
 */
export function approvalDenyFingerprint(tool: string, reasonCategory: string = 'user-deny'): readonly [string, string, string] {
  return ['aegis-approval-deny', tool, reasonCategory] as const;
}

/**
 * Stable fingerprint for block-by-hardening exceptions tied to an approval.
 * Pattern: ['aegis-block', layer, approval_id]
 */
export function approvalBlockFingerprint(layer: string, approvalId: string): readonly [string, string, string] {
  return ['aegis-block', layer, approvalId] as const;
}

export type AegisApprovalAttr = typeof AEGIS_APPROVAL_ATTRS[keyof typeof AEGIS_APPROVAL_ATTRS];
export type AegisJobAttr = typeof AEGIS_JOB_ATTRS[keyof typeof AEGIS_JOB_ATTRS];
