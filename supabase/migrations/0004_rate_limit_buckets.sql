-- 0004_rate_limit_buckets.sql
-- Leaky-bucket rate limiter storage for #60.
-- Used by src/lib/rate-limit.ts. Cleanup handled by apps/worker hourly cron.

create table if not exists public.rate_limit_buckets (
  bucket_key   text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket_key, window_start)
);

create index if not exists idx_rate_limit_buckets_cleanup
  on public.rate_limit_buckets (window_start);

comment on table public.rate_limit_buckets is
  'Leaky-bucket counter for per-key request rates. Keys: login:ip:<ip>, chat:user:<id>, approval:user:<id>, sessions:user:<id>. Rows expire via apps/worker rate-limit.cleanup hourly cron.';

-- rate_limit_buckets is server-side only; no user-facing RLS needed.
-- Deny all public; service_role bypasses RLS by default in Supabase.
alter table public.rate_limit_buckets enable row level security;
-- (no policies = no public access; matches pattern in 0003 for openclaw_events)

-- Atomic upsert function called by src/lib/rate-limit.ts via supabase.rpc().
-- Returns (count, window_start) after incrementing the bucket for the current window.
-- window_sec: window length in seconds (e.g. 60 for per-minute limiting).
create or replace function public.rate_limit_upsert(
  p_bucket_key text,
  p_window_sec  integer
)
returns table(count integer, window_start timestamptz)
language sql
security definer
set search_path = public
as $$
  insert into public.rate_limit_buckets (bucket_key, window_start, count)
  values (
    p_bucket_key,
    to_timestamp(floor(extract(epoch from now()) / p_window_sec)::bigint * p_window_sec),
    1
  )
  on conflict (bucket_key, window_start)
  do update set count = public.rate_limit_buckets.count + 1
  returning
    public.rate_limit_buckets.count,
    public.rate_limit_buckets.window_start;
$$;

comment on function public.rate_limit_upsert(text, integer) is
  'Atomically increments the leaky-bucket counter for (bucket_key, current_window). Called by src/lib/rate-limit.ts. security definer so service-role RLS bypass is not required by the caller.';
