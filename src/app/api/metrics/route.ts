// src/app/api/metrics/route.ts — GET /api/metrics
// Returns a live MetricsSnapshot; never cached.

import * as Sentry from '@sentry/nextjs';
import { getMetricsSnapshot } from '@/lib/metrics';
import { MetricsResponseSchema } from './schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    return await Sentry.startSpan(
      { name: 'aegis.metrics', op: 'http.server' },
      async (span) => {
        const snapshot = await getMetricsSnapshot();

        span?.setAttributes({
          'aegis.metrics.source': snapshot.source,
          'aegis.metrics.fired_count': snapshot.firedCount,
          'aegis.metrics.blocked_count': snapshot.blockedCount,
        });

        // Validate shape before sending — throws ZodError if contract is broken.
        const validated = MetricsResponseSchema.parse(snapshot);

        return Response.json(validated, {
          status: 200,
          headers: { 'cache-control': 'no-store' },
        });
      },
    );
  } catch (err) {
    Sentry.captureException(err);
    return Response.json({ error: 'metrics_unavailable' }, { status: 500 });
  }
}
