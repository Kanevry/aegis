// pg-boss is declared as a dep of apps/worker, not the root package.
// The coordinator must add `pg-boss` to root package.json for this module to
// resolve at runtime. Typecheck uses a local interface so it passes without
// the root dep being present.
//
// mirror of apps/worker/src/queues.ts — keep in sync
export const QUEUES = {
  APPROVAL_EXPIRE: 'approval.expire',
  SENTRY_ENRICH: 'sentry.enrich',
  NOTIFICATION_DISPATCH: 'notification.dispatch',
  SESSION_CLEANUP: 'session.cleanup',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Minimal PgBoss surface used by this module — mirrors pg-boss@10 types.
interface BossInstance {
  on(event: 'error', handler: () => void): void;
  start(): Promise<void>;
  send(name: string, data: object): Promise<string | null>;
  sendAfter(name: string, data: object, options: object, seconds: number): Promise<string | null>;
}

interface BossConstructor {
  new (opts: { connectionString: string; schema?: string }): BossInstance;
}

let cached: Promise<BossInstance> | null = null;

export function getBoss(): Promise<BossInstance> {
  if (cached) return cached;
  cached = (async () => {
    const { loadEnv } = await import('@aegis/types');
    const env = loadEnv();
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL required for pg-boss enqueue');
    const PgBoss = (require('pg-boss') as { default: BossConstructor }).default ?? (require('pg-boss') as BossConstructor);
    const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: env.PGBOSS_SCHEMA });
    boss.on('error', () => {
      // Forward pg-boss process errors to Sentry. Imported lazily to avoid a
      // hard dependency in environments where @sentry/nextjs is absent.
      void import('@sentry/nextjs')
        .then(({ captureException }) => captureException(new Error('pg-boss process error')))
        .catch(() => {});
    });
    await boss.start();
    return boss;
  })();
  return cached;
}

export async function enqueue<T extends object>(
  queue: string,
  data: T,
  opts: { startAfter?: number } = {},
): Promise<string | null> {
  const boss = await getBoss();
  if (opts.startAfter && opts.startAfter > 0) {
    return boss.sendAfter(queue, data, {}, opts.startAfter);
  }
  return boss.send(queue, data);
}
