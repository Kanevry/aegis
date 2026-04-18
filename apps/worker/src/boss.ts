// apps/worker/src/boss.ts — pg-boss singleton + connection config

import PgBoss from 'pg-boss';

/**
 * Creates a PgBoss instance using DATABASE_URL from the environment.
 * Throws a clear error if DATABASE_URL is missing — this is a hard
 * boot-time requirement for the worker process.
 */
export function createBoss(): PgBoss {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error(
      '[worker] DATABASE_URL is required but not set. ' +
        'Set it to your Postgres connection string (e.g. postgresql://user:pass@host:5432/db).',
    );
  }

  const schema = process.env['PGBOSS_SCHEMA'] ?? 'pgboss';

  return new PgBoss({ connectionString, schema });
}

/**
 * Starts a PgBoss instance. pg-boss auto-runs schema migrations on start.
 * Queue creation should happen after this resolves.
 */
export async function startBoss(boss: PgBoss): Promise<void> {
  await boss.start();
}
