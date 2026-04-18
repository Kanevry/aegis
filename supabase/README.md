# Aegis Supabase

Phase 2 Postgres persistence layer.

## Local dev

```bash
# Install Supabase CLI: https://supabase.com/docs/guides/cli
supabase start              # spins up local Postgres + Studio at :54322 / :54323
supabase db reset           # applies migrations + seed
```

## Migrations

- `0001_phase2_schema.sql` — tables (sessions, messages, approvals, aegis_decisions, sentry_context)
- `0002_phase2_indexes_rls.sql` — indexes + Row-Level Security policies

## Generate types

```bash
supabase gen types typescript --local > packages/types/src/database.types.ts
```

The committed `database.types.ts` is a hand-written stub until Supabase CLI is wired into CI.
