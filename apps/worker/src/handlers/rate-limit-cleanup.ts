// apps/worker/src/handlers/rate-limit-cleanup.ts — full implementation

import type { Job } from 'pg-boss';
import * as Sentry from '@sentry/node';
import { createServiceRoleClient } from '../supabase';

export type RateLimitCleanupJob = Record<string, never>;

export async function handleRateLimitCleanup(_jobs: Job<RateLimitCleanupJob>[]): Promise<void> {
  const supabase = createServiceRoleClient();
  await Sentry.startSpan(
    {
      op: 'aegis.job',
      name: 'rate-limit.cleanup',
      attributes: { 'aegis.job.queue': 'rate-limit.cleanup' },
    },
    async () => {
      console.warn('[job] rate-limit.cleanup start');
      try {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { error, count } = await supabase
          .from('rate_limit_buckets')
          .delete({ count: 'exact' })
          .lt('window_start', cutoff);
        if (error) throw error;
        console.warn('[job] rate-limit.cleanup done', { deleted: count ?? 0, cutoff });
      } catch (err) {
        Sentry.captureException(err, { tags: { 'aegis.job.queue': 'rate-limit.cleanup' } });
        throw err;
      }
    },
  );
}
