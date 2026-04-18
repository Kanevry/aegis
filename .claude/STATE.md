---
schema-version: 1
session-type: housekeeping
session-id: housekeeping-merge-sweep-2026-04-18-1604
branch: main
issues: []
started_at: 2026-04-18T16:04:00+0200
status: active
current-wave: 1
total-waves: 1
session-start-ref: 36a71667b8d8a8b5b90a97f6b7a2b3c4d5e6f7a0
---

## Session Scope

User directive: "alles auf main mergen damit wir alles sauber und vollständig abgebildet haben".

Inherited working-tree state from 3 parallel sessions on 2026-04-18:
- 37 modified files + 5 untracked (metrics/ + test files + 2 STATE files)
- 10 `worktree-agent-*` orphan branches + 1 `tmp-housekeeping-close`
- Baseline typecheck ✅ green, tests ✅ 877/877 green, lint ❌ 8 no-console errors

## Commit plan (atomic groups)

1. feat(dashboard): live metrics endpoint + 5s poller
2. fix(auth): remove AEGIS_DEMO_DISABLE_AUTH bypass
3. refactor(env): drop NEXT_PUBLIC_ prefix on feedback-widget flag
4. refactor(ui): dark-only theme cleanup
5. refactor(openclaw): backend-mode gateway bridge
6. chore(housekeeping): misc working-tree residue (semgrep, gitignore, next-env, supabase ports, video-script)
7. fix(lint): no-console cleanup in scripts (if surfaced)

## Post-commit

- Push to origin/main
- Delete 11 stale local branches
- Triage CI issues #106 #107 #108 against new HEAD
- Close session
