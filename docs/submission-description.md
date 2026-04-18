---
target: codex-hackathons.com submission form
event: Codex Vienna 2026-04-18
word_count: ~200
---

# Ægis — Submission Description

**GitHub repo:** https://github.com/Kanevry/aegis
**Live demo:** https://aegis-codex.vercel.app
**Demo video:** {{VIDEO_URL}}
**Built:** Codex Vienna · 2026-04-18 · 11:00–17:00 CEST

---

Ægis is the first agent-hardening middleware that treats every safety violation as a Sentry exception — Seer analyzes it per attack-pattern exactly like a production bug. Built at Codex Vienna 2026-04-18, it wraps any OpenAI agent with five deterministic defense layers:

| Layer | Concern |
|-------|---------|
| B1 | Path traversal |
| B2 | PII exposure |
| B3 | Hallucinated refs |
| B4 | Prompt injection + secret exfil detection |
| B5 | Secret redaction |

Every LLM call emits a `gen_ai.invoke_agent` span via `vercelAIIntegration()` with `aegis.safety_score`, `aegis.blocked_layers`, and `aegis.outcome` as custom attributes. When a layer blocks a prompt, `Sentry.captureException(AegisBlockedException)` fires with fingerprint `['aegis-block', layer, pattern_id]` — grouping attacks the way Sentry groups crashes, so Seer's analysis runs with no custom tooling.

The novel angle is **Safety-as-Error**: instead of a separate SIEM, each of the 10 canonical attacks in the testbed maps to a deterministic fingerprint. Judges can open the live dashboard, fire any attack (e.g. `path-traversal-001` or `secret-exfil-001`), and watch the Flow visualization, Sentry issue, and span attributes appear in real time — no login required.
