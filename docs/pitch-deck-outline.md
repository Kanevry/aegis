---
title: "Ægis — Observable Agentic Hardening"
date: 2026-04-18
presenter: "{{PRESENTER_NAME}}"
event: Codex Community Hackathon Vienna 2026
total_runtime: "3:00"
demo_url: "{{VERCEL_URL}}"
repo: "https://github.com/Kanevry/aegis"
---

# Ægis — Pitch Deck Outline (3-Minute)

---

## Slide 1 — Problem (0:00–0:30)

**Headline:** Every LLM agent shipping to production is one prompt away from a breach.

**Talking points:**
- Five attack classes hit every agentic system: path traversal, PII exfil, hallucinated refs, prompt injection, secret leakage.
- Today every team ships their own ad-hoc middleware — if they ship anything at all.
- When an attack fires, ops teams see nothing. No grouping. No trace. Data is already out before anyone opens a terminal.
- Quote the pattern: "you add logging after the first incident, not before."

**Visual:** split screen — raw prompt on left, silent success on right (no alerting, no blocking).

---

## Slide 2 — Approach: 5-Layer Defense (0:30–1:15)

**Headline:** `@aegis/hardening` — composable middleware, five focused layers, one number.

**Talking points:**
- B1 Path traversal · B2 PII exposure · B3 Hallucinated refs · B4 Prompt injection + secret exfil · B5 Secret redaction.
- Each layer is deterministic, independently toggleable via `AEGIS_LAYER_B*` env flags, and fully tested.
- Output is a single `HardeningResult`: `safetyScore` (0–1), `blockedLayers`, `redactedPrompt`. Drop-in at the API boundary.
- 215 tests, ≥80% coverage — this is not a demo stub; it runs in the API handler right now.

**Visual:** `createHardening()` call → B1 → B2 → B3 → B4 → B5 → `HardeningResult` flow diagram.

---

## Slide 3 — Demo Moment (1:15–2:00)

**Headline:** One click. Five layers. Real Sentry issue.

**Live steps (rehearse to 45s):**
1. Open dashboard → Testbed tab.
2. Select `path-traversal-001` ("../../etc/passwd") or `secret-exfil-001` — click "Launch Attack."
3. Flow visualization: B1 lights red, remaining layers green. Safety score shown.
4. Click "View in Sentry" — issue appears, fingerprint `['aegis-block', B1, path-traversal-001]`, Seer analysis already running.
5. Switch to Compare view — same prompt without Ægis returns an LLM answer. With Ægis: hard-blocked at B1.

**Talking point:** "This is what observability looks like for security — not a log line, a Sentry issue with AI-powered root-cause analysis."

**Fallback (if live demo fails):** switch `AEGIS_DEMO_MODE=true` — scripted replay shows identical flow.

---

## Slide 4 — Novel Sentry Angle (2:00–2:30)

**Headline:** Safety-as-Error — no SIEM needed.

**Talking points:**
- Every safety violation is a `Sentry.captureException(AegisBlockedException)` with fingerprint `['aegis-block', layer, pattern_id]`.
- Sentry groups attacks by pattern the same way it groups crashes. Seer sees the group, not noise — and proposes a fix automatically.
- Every hardening decision lives on a `gen_ai.invoke_agent` span (via `vercelAIIntegration()`) with `aegis.safety_score`, `aegis.blocked_layers`, `aegis.outcome` — cost/latency/attack overlay for free in Sentry Discover.
- Replay captures the full browser session on every block — complete audit trail, zero extra tooling.

**Visual:** Sentry issue list — fingerprinted groups by layer + pattern_id, Seer insight card visible.

---

## Slide 5 — Roadmap (2:30–3:00)

**Headline:** Phase 1 ships today. The loop closes next.

**Talking points:**
- **Phase 1 — Shield (live today):** 5-layer hardening, live dashboard, Sentry full-stack, 10 canonical attacks in testbed.
- **Phase 2 — Seer-Loop:** Sentry issue webhook feeds an agent that inspects Git history and MRs, then auto-creates a GitLab issue with a suggested layer patch. Humans approve.
- **Phase 3 — Auto-Remediation:** closed loop — attack detected → patch generated → tested by Ægis itself → MR opened. The middleware that guards agents also guards its own changes.
- **Open-source:** `@aegis/hardening` and `@aegis/types` published to npm post-hackathon under the `@aegis` scope.

**Call to action:** "Star the repo, fire an attack, watch Seer work. The link is on screen."

**Footer:** {{VERCEL_URL}} · https://github.com/Kanevry/aegis
