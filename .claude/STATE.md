---
schema-version: 1
session-type: housekeeping
session-id: housekeeping-merge-sweep-2026-04-18-1604
branch: main
issues: [106, 107, 108]
issues-created: [110, 111]
started_at: 2026-04-18T16:04:00+0200
completed_at: 2026-04-18T16:30:00+0200
status: completed
current-wave: 1
total-waves: 1
session-start-ref: 36a71667b8d8a8b5b90a97f6b7a2b3c4d5e6f7a0
---

## Summary

Consolidated the working-tree debt from today's three parallel
sessions (infra-docker-ratelimit, dashboard-metrics-live,
housekeeping-parallel-safe) into 10 atomic commits on main.
Surfaced + corrected one architectural mis-merge (auth bypass
duplicate-flag) via revert + explicit follow-up issue.

## Commits shipped (10 total)

| SHA | Subject | Notes |
|-----|---------|-------|
| `138a785` | feat(dashboard): live metrics endpoint + 5s poller | From parallel dashboard-metrics session; never committed there |
| `10ac60c` | fix(auth): remove AEGIS_DEMO_DISABLE_AUTH bypass | **Reverted** by `d4dfbdd` — duplicate-flag realization |
| `acf997a` | refactor(env): drop NEXT_PUBLIC_ prefix on feedback-widget flag | Server-only var shouldn't leak to browser bundle |
| `8afd005` | refactor(ui): consolidate to dark-only theme | Drops dead light-mode classes; -310 / +174 lines |
| `608b48e` | refactor(openclaw): switch runtime bridge to backend mode | Fixes #108 typecheck error on `headers: { origin }` |
| `1887df2` | chore(housekeeping): archive parallel-session state + tidy residue | `.gitignore`, `.semgrep.yml`, `next-env.d.ts`, supabase ports, video-script |
| `dedeeab` | chore(lint): allow console output in CLI scripts | `scripts/**/*.mjs` override — 9 errors resolved |
| `3a3feeb` | fix(docker): remove dead AEGIS_DEMO_DISABLE_AUTH env var | **Reverted** by `ce7a4a1` — paired with `10ac60c` revert |
| `ad5b17e` | fix(metrics): coerce Supabase numeric + allow ISO offset in schema | Polish on the dashboard-metrics deliverable |
| `569c324` | fix(ci): drop redundant pnpm version block from action-setup | Fixes a bad `2f2b608` that regressed `10.0.0` → `10` |

Plus 2 revert commits (`d4dfbdd`, `ce7a4a1`) to preserve the demo
auth bypass (see #110 for the proper migration path).

## VCS changes

- **Created**: #110 (AEGIS_DEMO_DISABLE_AUTH → AEGIS_DEMO_MODE migration), #111 (pg types + 75 test regressions)
- **Closed**: #108 (superseded by #111 for the unresolved parts; headers fix + CI setup fix shipped)
- **Commented**: #106 (deploy.yml — still valid), #107 (Semgrep dangerouslySetInnerHTML — still valid)

## Branch cleanup

Deleted 11 local branches: 10 `worktree-agent-*` orphans + 1 `tmp-housekeeping-close`.

## CI state post-push

- ✅ **Secret Scan**: passing
- ✅ **pnpm setup**: fixed (was failing on every push due to bad `2f2b608`)
- ❌ **Typecheck**: 2 pre-existing errors on `src/lib/postgres.ts` (missing `@types/pg`) — tracked in #111
- ❌ **Test**: 75 pre-existing failures from `42003dc` demo-stack commit — tracked in #111
- ❌ **Semgrep SAST**: 2 `dangerouslySetInnerHTML` findings — tracked in #107
- ❌ **deploy.yml**: unparseable (`secrets.*` in `if:`) — tracked in #106

Net: my push did not introduce any new CI failures. It resolved the pnpm setup regression that was masking all downstream failures.

## Deviations

- [16:15] User clarified "login aus den approvals rausgearbeitet - bewusst" after my commits `10ac60c` + `3a3feeb` had removed the demo-auth bypass. Reverted both as `d4dfbdd` + `ce7a4a1` and filed #110 for the proper single-flag migration instead of shipping a silent behavior change.
- [16:20] Rebase onto new origin (`42003dc` + `017724e`) hit two conflicts (`docker/dashboard/layout.tsx` Sentry link; `docker-compose.yml` Postgres vs Supabase env shape). Resolved by taking origin's newer shape in both cases.
- [16:25] Discovered commit `2f2b608` was broken: message claimed "removed redundant pnpm version" but actually regressed `10.0.0` → `10`, re-triggering `ERR_PNPM_BAD_PM_VERSION`. Fixed via `569c324` by actually removing the `with: version:` block.

## Learnings to emit

- **parallel-session-uncommitted-debt-cleanup-pattern**: When 3+ parallel sessions run on shared working tree and not all commit, a follow-up housekeeping session that groups the uncommitted diff into atomic commits (by intent, not by session) is the cleanest recovery path. Key: read every diff before staging, categorize into logical commits, then verify typecheck+lint+test before each push.
- **commit-message-vs-diff-divergence-is-a-bug**: A commit whose message claims one thing and whose diff does another is a latent regression waiting to bite. Detection: when CI starts failing after a "chore" commit, check the actual diff, not the subject line.
- **revert-not-refactor-when-intent-is-contested**: When a parallel session silently reverts your committed change (working-tree drift overwrites your commit), that's a signal of contested intent. Revert your commit and file an issue for the proper refactor — do not fight the drift.
