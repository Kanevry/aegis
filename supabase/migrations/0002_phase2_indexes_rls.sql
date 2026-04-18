-- Indexes
create index if not exists idx_messages_session on messages(session_id, created_at);
create index if not exists idx_approvals_status on approvals(status, created_at);
create index if not exists idx_approvals_session on approvals(session_id);
create index if not exists idx_aegis_decisions_approval on aegis_decisions(approval_id);
create index if not exists idx_aegis_decisions_message on aegis_decisions(message_id);

-- RLS — enable on all tables; policies: users see only their own session rows
alter table sessions enable row level security;
alter table messages enable row level security;
alter table approvals enable row level security;
alter table aegis_decisions enable row level security;
alter table sentry_context enable row level security;

-- Policy: sessions — users see only their own (user_id matches JWT claim 'sub')
create policy "users see own sessions" on sessions
  for all
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');

-- Policy: messages — users see messages of sessions they own
create policy "users see own messages" on messages
  for all
  using (session_id in (select id from sessions where user_id = auth.jwt() ->> 'sub'))
  with check (session_id in (select id from sessions where user_id = auth.jwt() ->> 'sub'));

-- Policy: approvals — users see approvals of sessions they own
create policy "users see own approvals" on approvals
  for all
  using (session_id in (select id from sessions where user_id = auth.jwt() ->> 'sub'))
  with check (session_id in (select id from sessions where user_id = auth.jwt() ->> 'sub'));

-- Policy: aegis_decisions — users see decisions linked to their approvals/messages
create policy "users see own decisions" on aegis_decisions
  for all
  using (
    approval_id in (select id from approvals where session_id in (select id from sessions where user_id = auth.jwt() ->> 'sub'))
    or message_id in (select id from messages where session_id in (select id from sessions where user_id = auth.jwt() ->> 'sub'))
  );

-- Policy: sentry_context — users see context linked to their approvals
create policy "users see own sentry_context" on sentry_context
  for all
  using (approval_id in (select id from approvals where session_id in (select id from sessions where user_id = auth.jwt() ->> 'sub')));

-- Service role bypass: server-side code uses SERVICE_ROLE_KEY which bypasses RLS by default
