import * as Sentry from '@sentry/nextjs';
import { createApproval, markDecided } from '@/lib/approvals';
import { enqueue, QUEUES } from '@/lib/pgboss-client';
import { query } from '@/lib/postgres';
import type { OpenclawEventPayload } from './schema';

type DedupeResult = 'inserted' | 'duplicate';

async function insertEventIfNew(event: OpenclawEventPayload): Promise<DedupeResult> {
  const rows = await query<{ event_id: string }>(
    `
      insert into openclaw_events (
        event_id,
        event_type,
        payload
      )
      values ($1, $2, $3::jsonb)
      on conflict (event_id, event_type) do nothing
      returning event_id
    `,
    [event.event_id, event.type, JSON.stringify(event)],
  );

  return rows.length > 0 ? 'inserted' : 'duplicate';
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
  // createApproval already schedules approval.expire (15 min TTL); enqueue the
  // remaining side-effects here.
  await Promise.all([
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
  await query(
    `
      insert into aegis_decisions (
        approval_id,
        layer,
        outcome,
        safety_score,
        details
      )
      values ($1, 'B5', $2, null, $3::jsonb)
    `,
    [
      event.run_id,
      event.exit_code === 0 ? 'ok' : 'blocked',
      JSON.stringify({
        sub_layer: 'B6',
        exit_code: event.exit_code,
        duration_ms: event.duration_ms ?? null,
        output: event.output ?? null,
      }),
    ],
  );
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
  await query(
    `
      insert into aegis_decisions (
        approval_id,
        layer,
        outcome,
        safety_score,
        details
      )
      values ($1, 'B5', 'blocked', null, $2::jsonb)
    `,
    [
      event.run_id,
      JSON.stringify({
        sub_layer: 'B6',
        reason: event.reason,
      }),
    ],
  );
}
