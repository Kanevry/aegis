import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "@aegis/types";

// Anon client: respects RLS — safe for request-scoped reads using user JWT.
export function createAnonClient(): SupabaseClient {
  const e = loadEnv();
  const url = e.NEXT_PUBLIC_SUPABASE_URL;
  const key = e.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase anon env missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Service-role client: bypasses RLS. Use from route handlers and workers only. NEVER ship to the browser.
export function createServiceRoleClient(): SupabaseClient {
  const e = loadEnv();
  const url = e.NEXT_PUBLIC_SUPABASE_URL;
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role env missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
