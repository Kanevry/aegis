---
epic: "#32"
issue: "#85"
status: published
title: "Public submission copy"
---

# Submission

Ægis is the first agent-hardening middleware that emits every safety violation as a Sentry exception so Seer can analyze it like a production bug. Built at Codex Vienna on 2026-04-18, it wraps an OpenAI or Anthropic agent with five defense layers: path traversal, PII detection, grounding-reference validation, prompt injection detection, and secret redaction.

Every LLM call emits a `gen_ai.invoke_agent` span with `aegis.safety_score` and `aegis.blocked_layers` attributes. When a layer blocks a prompt, Aegis emits a deterministic fingerprint such as `['aegis-block', layer, pattern_id]`, which lets Sentry group repeated attack classes automatically.

The key idea is safety-as-error. Instead of creating a separate security console, Aegis makes unsafe agent behavior visible in the same operational tooling teams already use for production debugging. During the demo, a single blocked attack can produce a dashboard state change, a Sentry issue, and an operator-visible event stream within seconds.

To evaluate the system, open the dashboard, pick one of the seeded attack patterns, and trigger it through the live testbed. The UI shows the blocked layer, the safety score, and the resulting observability events so the whole flow remains auditable.

This file is the public-facing Phase 2-aligned successor to [`submission-description.md`](./submission-description.md).
