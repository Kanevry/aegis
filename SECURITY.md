# Security Policy

Aegis is a public repository. This policy explains how to report vulnerabilities, what is in scope, and the current security boundaries for the project and any published `@aegis/*` packages.

## Supported versions

| Version   | Supported |
| --------- | --------- |
| `0.1.x`   | Yes       |
| `< 0.1.0` | No        |

Pre-release branches and experimental hackathon snapshots may receive best-effort fixes only.

## Reporting a vulnerability

Please **open a private GitHub security advisory** instead of filing a public issue.

Include:

- affected package, route, or deployment surface
- clear reproduction steps or proof of concept
- impact assessment and prerequisites
- any logs, traces, or screenshots that help us confirm the issue

Response targets:

- acknowledgement within 24 hours
- triage decision within 7 calendar days
- coordinated remediation timeline after triage, depending on severity

If GitHub Advisories are unavailable for some reason, contact the maintainers privately through the repository owner before disclosing details elsewhere.

## Scope

In scope:

- code in this repository
- published `@aegis/*` packages derived from this repository
- Next.js API routes, middleware, and hardening layers
- Sentry instrumentation, masking, fingerprints, and `beforeSend` redaction
- default deployment manifests and sample configs shipped in the repo

Out of scope:

- user-operated OpenClaw deployments, Discord bots, or webhook infrastructure
- upstream provider vulnerabilities in OpenAI, Anthropic, Sentry, Supabase, Vercel, or GitHub
- local developer machines, browsers, or secrets managers outside this repo
- social engineering, denial-of-wallet, or prompt quality complaints without a concrete security impact

## Secrets handling policy

- Secrets belong in `.env.local`, platform secret stores, or the deployment environment. They must never be committed to the repo.
- Access to production or demo secrets should be limited to the smallest maintainer set required to operate the project.
- Any exposed credential should be rotated immediately, documented in the incident thread, and removed from logs or screenshots where possible.
- Gitleaks runs on every pull request and push through [`.github/workflows/secret-scan.yml`](./.github/workflows/secret-scan.yml) with the repo-specific rules in [`.gitleaks.toml`](./.gitleaks.toml). Findings fail CI and upload a report artifact for triage.
- Demo credentials should be short-lived and rotated after public demos, releases, or suspected exposure.

## Scanner remediation flow

### Secret scan findings

- Revoke or rotate the credential first if the finding corresponds to a real secret.
- Remove the secret from the current tree and any affected history before merging.
- Re-run the secret scan locally or via CI and keep the artifact for the incident thread when useful.
- If a finding is a false positive, narrow the allowlist in [`.gitleaks.toml`](./.gitleaks.toml) to the smallest possible path or pattern and explain the exception in the PR.

### SAST findings

- Semgrep runs on every pull request and on pushes to `main` through [`.github/workflows/semgrep.yml`](./.github/workflows/semgrep.yml).
- Community rulesets cover TypeScript, Node.js, secrets, and the OWASP Top 10. Repo-specific checks live in [`.semgrep.yml`](./.semgrep.yml), and the scan uploads SARIF into the GitHub Security tab.
- Treat new `ERROR` findings as merge blockers. Fix the code, or add a narrowly scoped suppression with a justification when the pattern is intentional and safe.
- Keep [`.semgrepignore`](./.semgrepignore) limited to generated artifacts and machine output. Do not use it to hide live application findings.
- Published releases should include a CycloneDX SBOM artifact so downstream users can inspect shipped dependencies. Repository automation for this is tracked in [#81](https://github.com/Kanevry/aegis/issues/81).

## Security boundaries

- The single-user passphrase flow planned for Phase 2 is an operator gate, not multi-tenant authentication. It protects access to a demo/operator console but is not a substitute for per-user identity and authorization.
- The OpenClaw token is operator-level access. Anyone holding it can act on behalf of the integration and should be treated as privileged.
- Hardening layers reduce risk; they do not guarantee perfect prevention of prompt injection, data leakage, or unsafe tool use.
- Safe client responses matter. Internal stack traces, raw provider errors, and unredacted secrets should stay server-side.

## Disclosure and remediation

- We prefer coordinated disclosure and will work with reporters on a reasonable publication timeline.
- Critical issues may trigger immediate mitigation before a full patch is ready.
- We will credit reporters who want attribution once the issue is resolved.

## Relevant standards

The middleware currently maps to the OWASP LLM Top 10 concerns it was built to address:

| Layer        | OWASP LLM                              |
| ------------ | -------------------------------------- |
| B1 Paths     | LLM06 Sensitive Information Disclosure |
| B2 PII       | LLM06 Sensitive Information Disclosure |
| B3 Refs      | LLM09 Overreliance                     |
| B4 Injection | LLM01 Prompt Injection                 |
| B5 Redaction | LLM02 Insecure Output Handling         |

Contributions that extend coverage to additional threat classes are welcome. See also [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow.
