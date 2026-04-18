# Security Policy

This project was built in a 6-hour window as a hackathon entry. It is shared under MIT for the community to learn from and build on.

## Reporting

If you find a security issue, please **open a private security advisory on GitHub** rather than a public issue. For the fastest response, include:

- Affected component (hardening layer, API route, or middleware)
- Reproduction steps
- Proposed severity (Low / Medium / High / Critical)

We aim to acknowledge within 48h and respond with a plan within one week.

## Scope

In scope:
- The `@aegis/hardening` package (paths, PII, refs, injection, redaction)
- The `/api/agent/run` server action
- Sentry instrumentation (span attributes, fingerprinting, `beforeSend` redaction)

Out of scope:
- Upstream provider security (OpenAI, Anthropic, Sentry SaaS)
- Deployment environment (Vercel, any self-hosted mirrors)
- Third-party dependencies — please report upstream

## Standards

The middleware defends against the OWASP LLM Top 10 categories it was designed for:

| Layer | OWASP LLM |
|-------|-----------|
| B1 Paths | LLM06 Sensitive Information Disclosure |
| B2 PII | LLM06 Sensitive Information Disclosure |
| B3 Refs | LLM09 Overreliance |
| B4 Injection | LLM01 Prompt Injection |
| B5 Redaction | LLM02 Insecure Output Handling |

Contributions that extend the layer set to other LLM-Top-10 categories are welcome.
