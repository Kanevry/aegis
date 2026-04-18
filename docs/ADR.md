---
epic: "#32"
issue: "#85"
status: accepted
title: "ADR: Phase 2 architecture direction"
---

# ADR

## Context

Phase 1 proved the core thesis: hardening decisions become much more actionable when every blocked attack looks like a normal production error in Sentry. Phase 2 extends that into a broader operator workflow with chat, approvals, OpenClaw integration, persistence, and more structured response envelopes.

The architecture has to stay public, demoable, and easy to operate without leaking internal infrastructure details. It also has to preserve the original Aegis differentiator: stable safety fingerprints and high-signal observability.

## Decision

We will evolve Aegis as a Phase 2 operator console with four primary pillars:

1. Chat-first UI and API around `POST /api/chat/stream`
2. Approval queue and OpenClaw bridge for risky tool execution
3. Stable Sentry taxonomy for chat, approvals, and hardening decisions
4. Postgres plus `pg-boss` for persistence, retries, and TTL-based workflows

## Why this direction

- It preserves the Phase 1 hardening core instead of replacing it
- It adds operator review before risky execution
- It gives Seer richer incident context through stable event classes
- It keeps the system modular enough for local Docker demos and future production deployment

## Consequences

Positive:

- Aegis stays differentiated as "safety-as-error" infrastructure
- Approval denials and hardening blocks can be grouped predictably
- Local demo environments can mirror future production flows closely

Tradeoffs:

- More moving pieces means more environment and queue coordination
- OpenClaw integration introduces a second runtime boundary to secure
- The single-operator auth model is still an operator gate, not multi-tenant auth

## Main design rules

- Keep B1-B5 in front of prompts, approval reasons, and tool arguments
- Standardize Phase 2 responses around `{ ok, data, error, issues, request_id }`
- Use stable Sentry fingerprints, never raw user text, for grouping
- Prefer webhook and queue contracts that can be replayed safely in local environments
- Keep docs public and free of private hostnames, internal service names, or live secrets

## Issue map

- Chat: [#40](https://github.com/Kanevry/aegis/issues/40), [#41](https://github.com/Kanevry/aegis/issues/41), [#43](https://github.com/Kanevry/aegis/issues/43)
- Approvals: [#44](https://github.com/Kanevry/aegis/issues/44) to [#49](https://github.com/Kanevry/aegis/issues/49)
- Observability: [#52](https://github.com/Kanevry/aegis/issues/52) to [#57](https://github.com/Kanevry/aegis/issues/57)
- Security and platform: [#58](https://github.com/Kanevry/aegis/issues/58) to [#65](https://github.com/Kanevry/aegis/issues/65)

## Related docs

- [`architecture.md`](./architecture.md)
- [`OPENCLAW_SETUP.md`](./OPENCLAW_SETUP.md)
- [`PHASE-2-SEER-VISION.md`](./PHASE-2-SEER-VISION.md)
