---
target: codex-hackathons.com submission form
event: Codex Vienna 2026-04-18
word_count: ~200
---

# Ægis — Submission Description

Ægis is the first agent-hardening middleware that emits every safety violation as a Sentry exception — Seer analyzes it per attack-pattern like a production bug. Built at Codex Vienna 2026-04-18, it wraps any OpenAI agent with five defense layers (path traversal, PII detection, grounding-ref validation, prompt injection, secret redaction). Every LLM call emits a `gen_ai.invoke_agent` span via `openAIIntegration()` with `aegis.safety_score` and `aegis.blocked_layers` attributes. When a layer blocks a prompt, the event fans out in under 3 seconds to Telegram, Discord, Slack, and Sentry simultaneously. During the demo, a single blocked attack produces a phone notification, a Sentry issue, and an event bus entry — at the same time.

The novel angle is **Safety-as-Error**: instead of a separate SIEM, Ægis maps each attack to a `captureException` call with a deterministic fingerprint (`['aegis-block', layer, pattern_id]`). Sentry groups attacks the same way it groups production crashes, and Seer's analysis runs automatically — no custom tooling required. No open-source project combines per-layer safety scoring, Seer fingerprinting, and multi-channel event fan-out in a single drop-in middleware as of April 2026.

**To evaluate:** open the live dashboard at https://aegis-codex.vercel.app (live ~17:00 CEST), pick any of the 10 adversarial attacks (prompt injection, path traversal, base64 exfiltration, PII leak, hallucinated refs), and click "Launch Attack." The flow diagram shows which layer fires; the Sentry panel shows the span with safety score; the fan-out panel confirms Telegram/Discord/Slack delivery. The Sentry project is linked from the dashboard — judges can inspect raw traces and Seer analysis without logging in.
