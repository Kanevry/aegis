import { Pool, type QueryResultRow } from "pg";
import { loadEnv } from "@aegis/types";

let pool: Pool | null = null;

function getConnectionString(): string {
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for Postgres access");
  }
  return env.DATABASE_URL;
}

export function getPool(): Pool {
  if (pool) return pool;

  pool = new Pool({
    connectionString: getConnectionString(),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  pool.on("error", (err: Error) => {
    console.error("[postgres] pool error", err);
  });

  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export function asIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}
