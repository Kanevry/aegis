// apps/worker/src/queues.ts — Queue name constants for pg-boss

export const QUEUES = {
  APPROVAL_EXPIRE: 'approval.expire',
  SENTRY_ENRICH: 'sentry.enrich',
  NOTIFICATION_DISPATCH: 'notification.dispatch',
  SESSION_CLEANUP: 'session.cleanup',
  RATE_LIMIT_CLEANUP: 'rate-limit.cleanup',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
