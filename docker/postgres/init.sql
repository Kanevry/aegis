-- Aegis postgres init script
-- Executed once on first container start (after data dir is empty).

-- Main DB is created by POSTGRES_DB env var. Add extensions to it.
\c aegis;
create extension if not exists pgcrypto;

-- pg-boss uses its own schema inside the aegis DB (see PGBOSS_SCHEMA env).
-- No separate database needed — pg-boss creates its schema lazily on first connect.
