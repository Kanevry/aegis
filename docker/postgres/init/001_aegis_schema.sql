create extension if not exists pgcrypto;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text,
  openclaw_session_id text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content jsonb not null,
  tool_calls jsonb,
  created_at timestamptz default now()
);

create table if not exists approvals (
  id text primary key,
  session_id uuid references sessions(id) on delete cascade,
  tool text not null,
  args jsonb not null,
  system_run_plan jsonb,
  status text not null default 'pending' check (status in ('pending','approved','denied','expired')),
  decided_by text check (decided_by in ('ui','discord','cli','auto')),
  decided_at timestamptz,
  decision_scope text check (decision_scope in ('allow-once','allow-always','deny-once','deny-always')),
  reason text,
  sentry_issue_url text,
  created_at timestamptz default now()
);

create table if not exists aegis_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_id text references approvals(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  layer text not null check (layer in ('B1','B2','B3','B4','B5')),
  outcome text not null,
  safety_score numeric,
  details jsonb,
  created_at timestamptz default now()
);

create table if not exists sentry_context (
  id uuid primary key default gen_random_uuid(),
  approval_id text references approvals(id) on delete cascade unique,
  similar_denials jsonb,
  seer_suggestion text,
  fetched_at timestamptz default now()
);

create table if not exists openclaw_events (
  event_id text not null,
  event_type text not null check (event_type in (
    'exec.approval.requested',
    'exec.approval.resolved',
    'exec.running',
    'exec.finished',
    'exec.denied'
  )),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  primary key (event_id, event_type)
);

create index if not exists idx_messages_session on messages(session_id, created_at);
create index if not exists idx_approvals_status on approvals(status, created_at);
create index if not exists idx_approvals_session on approvals(session_id);
create index if not exists idx_aegis_decisions_approval on aegis_decisions(approval_id);
create index if not exists idx_aegis_decisions_message on aegis_decisions(message_id);
create index if not exists idx_openclaw_events_received on openclaw_events(received_at desc);
create index if not exists idx_openclaw_events_processed on openclaw_events(processed_at) where processed_at is null;
