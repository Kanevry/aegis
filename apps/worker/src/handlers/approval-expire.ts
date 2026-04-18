// apps/worker/src/handlers/approval-expire.ts — P1 scaffold; P3 wires approvals-lib

import type { Job } from 'pg-boss';
import * as Sentry from '@sentry/node';

export type ApprovalExpireJob = { id: string };

export async function handleApprovalExpire(jobs: Job<ApprovalExpireJob>[]): Promise<void> {
  for (const job of jobs) {
    const { id } = job.data;
    await Sentry.startSpan(
      {
        op: 'aegis.job',
        name: 'approval.expire',
        attributes: {
          'aegis.job.queue': 'approval.expire',
          'aegis.job.approval_id': id,
        },
      },
      async () => {
        console.warn('[job] approval.expire start', { approval_id: id });
        try {
          // expire-if-pending (inline: worker cannot import src/lib/approvals)
          const { createServiceRoleClient } = await import('../supabase');
          const supabase = createServiceRoleClient();
          const { data, error } = await supabase
            .from('approvals')
            .update({ status: 'expired' })
            .eq('id', id)
            .eq('status', 'pending')
            .select('id');
          if (error) throw error;
          const expired = Array.isArray(data) && data.length > 0;
          console.warn(expired ? '[job] approval.expire: marked expired' : '[job] approval.expire: already_decided (no-op)', { approval_id: id });
          if (expired) {
            // PoC: per-invocation boss; production should reuse the module-level instance
            const { default: PgBoss } = await import('pg-boss');
            const tempBoss = new PgBoss({ connectionString: process.env['DATABASE_URL']!, schema: process.env['PGBOSS_SCHEMA'] ?? 'pgboss' });
            await tempBoss.start();
            await tempBoss.send('notification.dispatch', {
              channel: 'discord',
              template: 'expired',
              payload: { approval_id: id },
            });
            await tempBoss.stop({ graceful: true, timeout: 5000 });
          }
          console.warn('[job] approval.expire done', { approval_id: id });
        } catch (err) {
          Sentry.captureException(err, { tags: { 'aegis.job.queue': 'approval.expire' } });
          throw err; // re-throw so pg-boss retries
        }
      },
    );
  }
}
