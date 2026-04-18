-- openclaw_events — webhook event log for OpenClaw → Aegis integration

create table if not exists openclaw_events (
  event_id    text        not null,
  event_type  text        not null check (event_type in (
                'exec.approval.requested',
                'exec.approval.resolved',
                'exec.running',
                'exec.finished',
                'exec.denied'
              )),
  payload     jsonb       not null,                -- full raw webhook payload for audit/replay
  received_at timestamptz not null default now(),
  processed_at timestamptz null,                   -- set by Wave 3 dispatcher after jobs enqueued
  primary key (event_id, event_type)
);

comment on table openclaw_events is 'Webhook event log — OpenClaw → Aegis. Dedup key (event_id, event_type). Written by /api/webhook/openclaw route.';

-- Indexes
create index if not exists idx_openclaw_events_received
  on openclaw_events(received_at desc);

create index if not exists idx_openclaw_events_processed
  on openclaw_events(processed_at) where processed_at is null;

-- openclaw_events is a system table; only service-role may write or read.
alter table openclaw_events enable row level security;
-- No policies created — service-role key bypasses RLS by default (matches pattern in 0002)
