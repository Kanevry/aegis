---
epic: "#32"
issue: "#85"
status: draft
title: "Phase 2 Seer vision"
---

# Phase 2 Seer Vision

Phase 2 turns Aegis from a blocking demo into an operator loop. The goal is not just to detect unsafe agent behavior, but to preserve enough structured context that Seer and human operators can reason about it quickly.

## Vision

When a prompt, tool call, or approval decision goes wrong, the resulting issue should already contain the clues needed to answer three questions:

1. What happened?
2. Why did Aegis decide the way it did?
3. What should the operator or maintainer do next?

## Core flow

1. A chat turn or tool request enters the Aegis runtime.
2. B1-B5 evaluate prompt text, references, and tool arguments.
3. Aegis emits `aegis.*` span attributes and, on block or denial, a stable fingerprinted exception.
4. Seer groups recurring patterns and gives the team recurring diagnostics instead of one-off noise.
5. The operator can compare traces, approval history, and prior denials in a single workflow.

## What "Seer-ready" means

A Phase 2 event is Seer-ready when it includes:

- a stable fingerprint
- a request id or correlation id
- a safety score
- the blocked layers or approval decision
- enough non-secret metadata to compare repeated events across time

Examples:

- `['aegis-block', layer, pattern_id]`
- `['aegis-approval-deny', tool, reason_category]`

## Product goals

- A blocked attack should read like a triageable software incident, not a vague moderation event
- Approval denials should be explainable both to operators and to the upstream agent
- Replay, traces, and queue state should tell one coherent story
- The same taxonomy should work in local demos and hosted deployments

## Near-term slices

- chat route and persisted history: [#40](https://github.com/Kanevry/aegis/issues/40), [#41](https://github.com/Kanevry/aegis/issues/41), [#43](https://github.com/Kanevry/aegis/issues/43)
- approval queue and decisioning: [#44](https://github.com/Kanevry/aegis/issues/44) to [#49](https://github.com/Kanevry/aegis/issues/49)
- structured Sentry integration: [#52](https://github.com/Kanevry/aegis/issues/52) to [#57](https://github.com/Kanevry/aegis/issues/57)
- auth, request ids, and envelopes: [#58](https://github.com/Kanevry/aegis/issues/58) to [#64](https://github.com/Kanevry/aegis/issues/64)

## Longer-term outcome

If Phase 2 works, Aegis becomes a reliable approval and observability layer in front of agentic execution. That makes Phase 3 plausible: controlled remediation loops where the system can propose or execute safe follow-ups under explicit policy and approval gates.
