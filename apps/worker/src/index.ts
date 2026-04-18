// apps/worker/src/index.ts — pg-boss worker boot entrypoint

import * as Sentry from '@sentry/node';
import { createBoss, startBoss } from './boss';
import { QUEUES } from './queues';
import { handleApprovalExpire } from './handlers/approval-expire';
import { handleSentryEnrich } from './handlers/sentry-enrich';
import { handleNotificationDispatch } from './handlers/notification-dispatch';
import { handleSessionCleanup } from './handlers/session-cleanup';
import { handleRateLimitCleanup } from './handlers/rate-limit-cleanup';

async function main() {
  if (process.env['SENTRY_DSN']) {
    Sentry.init({ dsn: process.env['SENTRY_DSN'], tracesSampleRate: 0.1 });
  }

  const boss = createBoss();

  boss.on('error', (err) => {
    Sentry.captureException(err);
  });

  await startBoss(boss);

  // Register queue stubs — Wave 3 fills in the work handlers
  await boss.createQueue(QUEUES.APPROVAL_EXPIRE);
  await boss.createQueue(QUEUES.SENTRY_ENRICH);
  await boss.createQueue(QUEUES.NOTIFICATION_DISPATCH);
  await boss.createQueue(QUEUES.SESSION_CLEANUP);
  await boss.createQueue(QUEUES.RATE_LIMIT_CLEANUP);

  // Register job handlers
  await boss.work(QUEUES.APPROVAL_EXPIRE, handleApprovalExpire);
  await boss.work(QUEUES.SENTRY_ENRICH, handleSentryEnrich);
  await boss.work(QUEUES.NOTIFICATION_DISPATCH, { batchSize: 5 }, handleNotificationDispatch);
  await boss.work(QUEUES.SESSION_CLEANUP, handleSessionCleanup);
  await boss.work(QUEUES.RATE_LIMIT_CLEANUP, handleRateLimitCleanup);

  // Nightly cleanup cron (03:00 UTC)
  await boss.schedule(QUEUES.SESSION_CLEANUP, '0 3 * * *');
  await boss.schedule(QUEUES.RATE_LIMIT_CLEANUP, '0 * * * *'); // hourly

  console.warn('[worker] pg-boss running, 5 queues registered');

  const shutdown = async (signal: string) => {
    console.warn(`[worker] ${signal} received, stopping`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    await Sentry.close(2000);
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void main().catch((err) => {
  console.error('[worker] fatal', err);
  Sentry.captureException(err);
  process.exit(1);
});
