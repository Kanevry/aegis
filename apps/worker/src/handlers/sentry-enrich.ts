// apps/worker/src/handlers/sentry-enrich.ts — full implementation

import type { Job } from 'pg-boss';
import * as Sentry from '@sentry/node';
import { createServiceRoleClient } from '../supabase';

export type SentryEnrichJob = { approval_id: string };

export async function handleSentryEnrich(jobs: Job<SentryEnrichJob>[]): Promise<void> {
  const supabase = createServiceRoleClient();
  for (const job of jobs) {
    const { approval_id } = job.data;
    await Sentry.startSpan(
      {
        op: 'aegis.job',
        name: 'sentry.enrich',
        attributes: {
          'aegis.job.queue': 'sentry.enrich',
          'aegis.job.approval_id': approval_id,
        },
      },
      async () => {
        console.warn('[job] sentry.enrich start', { approval_id });
        try {
          // Minimal enrichment: record a placeholder sentry_context row if absent.
          // Real Seer-context fetch is a downstream issue (#57). For now this ensures the FK exists.
          const { error } = await supabase
            .from('sentry_context')
            .upsert(
              {
                approval_id,
                similar_denials: [],
                seer_suggestion: null,
                fetched_at: new Date().toISOString(),
              },
              { onConflict: 'approval_id' },
            );
          if (error) throw error;
          console.warn('[job] sentry.enrich done', { approval_id });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { 'aegis.job.queue': 'sentry.enrich', approval_id },
          });
          throw err;
        }
      },
    );
  }
}
