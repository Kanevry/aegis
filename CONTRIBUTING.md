# Contributing to Aegis

Thanks for helping improve Aegis. We want the repository to stay welcoming, reviewable, and safe to run, whether you are tightening a hardening rule, refining the UI, or extending the observability story.

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before contributing.

## Start here

- Read the project overview and local setup steps in [README.md](./README.md).
- Use `pnpm` for all workspace commands.
- Keep `.env.local` local. Never commit credentials, tokens, Sentry DSNs, or provider secrets.

## Branch naming

Use the branch naming convention from the repo guidelines:

- `feat/<track>/<short>`
- `fix/<track>/<short>`
- `chore/<track>/<short>`

Examples:

- `feat/backend/openclaw-webhook`
- `fix/frontend/sidebar-badges`
- `chore/devops/gh-templates`

## Commit conventions

Commits should use Conventional Commit prefixes:

- `feat:`
- `fix:`
- `docs:`
- `test:`
- `chore:`

Commitlint automation is tracked in [#82](https://github.com/Kanevry/aegis/issues/82), but contributors should already follow the convention manually so history stays readable.

## Development workflow

1. Sync your branch from the latest default branch state.
2. Make the smallest coherent change that closes an issue or a clear slice of one.
3. Add or update tests when behavior changes.
4. Run the local quality checks before you open a PR.

Required checks:

```bash
pnpm typecheck
pnpm lint
pnpm test --run
```

If your change touches runtime behavior, also smoke-test the app locally with `pnpm dev`.

## Pull requests

- Open focused PRs with a clear summary and testing evidence.
- Use the repository PR template at [`.github/pull_request_template.md`](./.github/pull_request_template.md).
- Link the issue with `Closes #...` whenever the PR fully resolves it.
- Include screenshots, traces, or Sentry links when they make review faster.
- Update public docs when changing APIs, setup steps, or architecture.

## Filing issues

Please use the issue forms in [`.github/ISSUE_TEMPLATE`](./.github/ISSUE_TEMPLATE/):

- Bug reports for defects and regressions
- Feature requests for product changes
- Chore issues for repo health, tooling, and maintenance

Questions, support requests, and early ideas belong in GitHub Discussions when available instead of blank issues.

## Security-first contributions

- Validate untrusted input at the route boundary.
- Preserve safe error messages to clients and detailed error capture on the server.
- Keep Sentry fingerprints and `aegis.*` span attributes stable unless there is a deliberate migration plan.
- If you discover a vulnerability, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.
