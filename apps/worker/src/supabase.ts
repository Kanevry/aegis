// apps/worker/src/supabase.ts — Service-role Supabase client for worker use

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client authenticated with the service role key.
 * Throws a clear error if required env vars are missing.
 *
 * Session persistence and token auto-refresh are disabled — this client
 * is used server-side in the worker process only.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  if (!url) {
    throw new Error(
      '[worker] NEXT_PUBLIC_SUPABASE_URL is required but not set.',
    );
  }

  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!serviceRoleKey) {
    throw new Error(
      '[worker] SUPABASE_SERVICE_ROLE_KEY is required but not set.',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
