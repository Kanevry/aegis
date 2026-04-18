// apps/worker/src/handlers/session-cleanup.ts — full implementation

import type { Job } from 'pg-boss';
import * as Sentry from '@sentry/node';
import { createServiceRoleClient } from '../supabase';

export type SessionCleanupJob = Record<string, never>;

export async function handleSessionCleanup(_jobs: Job<SessionCleanupJob>[]): Promise<void> {
  const supabase = createServiceRoleClient();
  await Sentry.startSpan(
    {
      op: 'aegis.job',
      name: 'session.cleanup',
      attributes: { 'aegis.job.queue': 'session.cleanup' },
    },
    async () => {
      console.warn('[job] session.cleanup start');
      try {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { error, count } = await supabase
          .from('sessions')
          .delete({ count: 'exact' })
          .lt('created_at', cutoff);
        if (error) throw error;
        console.warn('[job] session.cleanup done', { deleted: count ?? 0, cutoff });
      } catch (err) {
        Sentry.captureException(err, { tags: { 'aegis.job.queue': 'session.cleanup' } });
        throw err;
      }
    },
  );
}
