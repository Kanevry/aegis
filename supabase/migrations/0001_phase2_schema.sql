-- Aegis Phase 2 schema — sessions, messages, approvals, aegis_decisions, sentry_context

create extension if not exists pgcrypto;

-- sessions — chat sessions; id is our own uuid, openclaw_session_id links to gateway
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                       -- from signed cookie claim
  title text,
  openclaw_session_id text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- messages — per-session chat history (role = user|assistant|system|tool)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content jsonb not null,                      -- AI SDK message parts
  tool_calls jsonb,                            -- populated when role='assistant' has tool calls
  created_at timestamptz default now()
);

-- approvals — openclaw exec-approval state; id = openclaw approval id for correlation
create table if not exists approvals (
  id text primary key,                         -- openclaw approval_id (== runId in events)
  session_id uuid references sessions(id) on delete cascade,
  tool text not null,
  args jsonb not null,
  system_run_plan jsonb,                       -- openclaw canonical SystemRunPlan
  status text not null default 'pending' check (status in ('pending','approved','denied','expired')),
  decided_by text check (decided_by in ('ui','discord','cli','auto')),
  decided_at timestamptz,
  decision_scope text check (decision_scope in ('allow-once','allow-always','deny-once','deny-always')),
  reason text,
  sentry_issue_url text,
  created_at timestamptz default now()
);

-- aegis_decisions — per-layer hardening outcome for each approval (and chat prompt)
create table if not exists aegis_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_id text references approvals(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  layer text not null check (layer in ('B1','B2','B3','B4','B5')),
  outcome text not null,                       -- 'ok'|'blocked'|'redacted'|'warn'
  safety_score numeric,
  details jsonb,
  created_at timestamptz default now()
);

-- sentry_context — Seer-context cache per approval (similar denials, suggestion text)
create table if not exists sentry_context (
  id uuid primary key default gen_random_uuid(),
  approval_id text references approvals(id) on delete cascade unique,
  similar_denials jsonb,                       -- array of {tool, args, decided_at, reason}
  seer_suggestion text,
  fetched_at timestamptz default now()
);
