import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/supabase';
import { createApproval, markDecided } from '@/lib/approvals';
import { enqueue, QUEUES } from '@/lib/pgboss-client';
import type { OpenclawEventPayload } from './schema';

type DedupeResult = 'inserted' | 'duplicate';

async function insertEventIfNew(event: OpenclawEventPayload): Promise<DedupeResult> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('openclaw_events').insert({
    event_id: event.event_id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (!error) return 'inserted';
  // Postgres unique_violation
  if ((error as { code?: string }).code === '23505') return 'duplicate';
  throw error;
}

export async function dispatchEvent(event: OpenclawEventPayload): Promise<{ deduped: boolean }> {
  const dedupe = await insertEventIfNew(event);
  if (dedupe === 'duplicate') {
    Sentry.addBreadcrumb({
      category: 'aegis.webhook',
      level: 'info',
      message: 'deduped',
      data: { event_id: event.event_id, type: event.type },
    });
    return { deduped: true };
  }

  switch (event.type) {
    case 'exec.approval.requested':
      await handleApprovalRequested(event);
      break;
    case 'exec.approval.resolved':
      await handleApprovalResolved(event);
      break;
    case 'exec.running':
      await handleExecRunning(event);
      break;
    case 'exec.finished':
      await handleExecFinished(event);
      break;
    case 'exec.denied':
      await handleExecDenied(event);
      break;
  }
  return { deduped: false };
}

async function handleApprovalRequested(
  event: Extract<OpenclawEventPayload, { type: 'exec.approval.requested' }>,
): Promise<void> {
  await createApproval({
    openclaw_approval_id: event.approval_id,
    session_id: event.session_id ?? null,
    tool: event.tool,
    args: event.args,
    system_run_plan: event.system_run_plan ?? null,
  });
  // Schedule TTL expire (15 min = 900 s), Sentry enrichment, and Discord notification
  await Promise.all([
    enqueue(QUEUES.APPROVAL_EXPIRE, { id: event.approval_id }, { startAfter: 900 }),
    enqueue(QUEUES.SENTRY_ENRICH, { approval_id: event.approval_id }),
    enqueue(QUEUES.NOTIFICATION_DISPATCH, {
      channel: 'discord' as const,
      template: 'approval_requested' as const,
      payload: { approval_id: event.approval_id, tool: event.tool },
    }),
  ]);
}

async function handleApprovalResolved(
  event: Extract<OpenclawEventPayload, { type: 'exec.approval.resolved' }>,
): Promise<void> {
  await markDecided({
    id: event.approval_id,
    decision: event.decision,
    decided_by: event.decided_by ?? 'ui',
    reason: event.rejection_message,
  });
  await enqueue(QUEUES.NOTIFICATION_DISPATCH, {
    channel: 'discord' as const,
    template: 'approval_resolved' as const,
    payload: { approval_id: event.approval_id, decision: event.decision },
  });
  if (event.decision.startsWith('deny')) {
    Sentry.captureException(new Error(`Aegis approval denied: ${event.approval_id}`), {
      fingerprint: ['aegis-approval-deny', event.decision],
      tags: {
        'aegis.approval.decision': event.decision,
        'aegis.approval.id': event.approval_id,
      },
    });
  }
}

async function handleExecRunning(
  event: Extract<OpenclawEventPayload, { type: 'exec.running' }>,
): Promise<void> {
  Sentry.addBreadcrumb({
    category: 'aegis.exec',
    level: 'info',
    message: 'exec.running',
    data: { run_id: event.run_id, tool: event.tool },
  });
}

async function handleExecFinished(
  event: Extract<OpenclawEventPayload, { type: 'exec.finished' }>,
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from('aegis_decisions').insert({
    approval_id: event.run_id,
    layer: 'B5', // CHECK constraint allows B1..B5; sandbox outcome stored in details.sub_layer
    outcome: event.exit_code === 0 ? 'ok' : 'blocked',
    safety_score: null,
    details: {
      sub_layer: 'B6',
      exit_code: event.exit_code,
      duration_ms: event.duration_ms ?? null,
      output: event.output ?? null,
    },
  });
}

async function handleExecDenied(
  event: Extract<OpenclawEventPayload, { type: 'exec.denied' }>,
): Promise<void> {
  Sentry.addBreadcrumb({
    category: 'aegis.exec',
    level: 'warning',
    message: 'exec.denied',
    data: { run_id: event.run_id, reason: event.reason },
  });
  const supabase = createServiceRoleClient();
  await supabase.from('aegis_decisions').insert({
    approval_id: event.run_id,
    layer: 'B5', // CHECK constraint allows B1..B5; sandbox outcome stored in details.sub_layer
    outcome: 'blocked',
    safety_score: null,
    details: {
      sub_layer: 'B6',
      reason: event.reason,
    },
  });
}
