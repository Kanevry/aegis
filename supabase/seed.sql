insert into sessions (id, user_id, title) values
  ('00000000-0000-0000-0000-000000000001', 'dev-user-1', 'Hello Aegis')
on conflict (id) do nothing;

insert into messages (session_id, role, content) values
  ('00000000-0000-0000-0000-000000000001', 'user', '[{"type":"text","text":"Hello"}]'::jsonb)
on conflict do nothing;
