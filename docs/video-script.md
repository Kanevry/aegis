# Ægis Video Script

## Recommendation

The repo currently points in two directions:

- The submission video issue targets **<= 90 seconds**.
- The live pitch issue targets **~3 minutes**.

The safest plan is:

1. Record a **90-second submission cut** first.
2. If time allows, expand it into a **2-minute extended cut** using the same footage.

This document includes both.

---

## Recording Notes

- Do not use the `Overview` page as a hero shot yet; it still reads like placeholder telemetry.
- Use the strongest product surfaces: `Testbed`, `Flow`, `Compare`, `Eval`, and a separate Sentry browser tab.
- Do not rely on the Sentry link in the dashboard header during recording; open Sentry in its own tab ahead of time.
- Use one clear attack for the main story:
  - `path-traversal-001` for the cleanest block story
  - `prompt-injection-001` for the compare view
- Keep zoom level large enough that blocked layers and status badges are readable in a screen recording.
- Add captions, because the submission should work without audio.

---

## 90-Second Submission Cut

### 0:00-0:12 — Hook

**Voiceover**

"Most AI demos show what an agent can do. Ægis shows what an agent refuses to do, and makes every unsafe action visible in Sentry."

**Show**

- Home page or README hero
- Quick punch-in on the line "Observable agentic hardening"
- Fast cut to the dashboard sidebar

**Caption**

"Observable agentic hardening"

### 0:12-0:25 — Development Journey

**Voiceover**

"We built Ægis during the Codex Vienna hackathon in a six-hour sprint. First we wired the five-layer hardening middleware into `/api/agent/run`, then added Sentry spans and stable exception fingerprints."

**Show**

- GitHub issues list filtered to closed Phase 1 work
- Briefly highlight issues `#1`, `#7`, `#8`, `#5`, `#6`
- Optional quick flash of recent git log if it looks clean on screen

**Caption**

"6-hour build: hardening -> Sentry -> live dashboard"

### 0:25-0:45 — Live Testbed

**Voiceover**

"Here we fire a real attack through the testbed. Ægis evaluates the prompt, blocks the unsafe request before it reaches the model, and returns the safety score and blocked layer."

**Show**

- `Dashboard -> Testbed`
- Select `Read passwd through traversal`
- Click the fire button
- Hold just long enough for the event log row to appear
- Make sure the blocked status and B1 layer are visible

**Caption**

"Unsafe prompt blocked before model execution"

### 0:45-0:58 — Flow View

**Voiceover**

"The flow view makes the decision legible. You can see exactly where the request was stopped in the defense pipeline."

**Show**

- Switch to `Flow`
- Use the same attack
- Hold on the highlighted blocked layer
- Keep the prompt text visible below the stage cards

**Caption**

"Five-layer defense, visible step by step"

### 0:58-1:15 — Compare View

**Voiceover**

"We can also compare providers and hardening modes side by side. With hardening on, the unsafe prompt is blocked. With hardening off, the model would proceed."

**Show**

- Switch to `Compare`
- Pick `System prompt override`
- Re-run compare
- Pause on the four variant cards
- Make sure one blocked and one allowed outcome are readable

**Caption**

"Same attack, across providers and hardening modes"

### 1:15-1:25 — Eval Matrix

**Voiceover**

"The eval matrix turns the demo into a repeatable benchmark across the seeded attack library."

**Show**

- Switch to `Eval`
- Scroll just enough to show multiple rows and pass/fail badges

**Caption**

"Repeatable evals across canonical attacks"

### 1:25-1:30 — Sentry Punchline

**Voiceover**

"That is the core idea: Safety-as-Error. Unsafe agent behavior becomes a normal engineering incident, grouped and analyzable in Sentry."

**Show**

- Cut to the prepared Sentry tab
- Show the issue or trace view with the grouped block

**Caption**

"Safety-as-Error"

---

## 2-Minute Extended Cut

### 0:00-0:15 — Problem

**Voiceover**

"Most AI demos focus on capability. Ægis focuses on refusal: what an agent should not do, and how to make those decisions observable in real time."

**Show**

- README hero or home page
- Short push-in on the product one-liner

**Caption**

"What if unsafe agent behavior looked like a debuggable incident?"

### 0:15-0:35 — Development Journey

**Voiceover**

"This was built at the Codex Vienna hackathon in a six-hour window. The project started with a narrow Phase 1 goal: wire hardening into a live agent route, add Sentry instrumentation, and prove that blocked attacks can be grouped like production bugs."

**Show**

- GitHub issue board
- Highlight Phase 1 epic `#23`
- Briefly show closed issues `#1`, `#5`, `#6`, `#7`, `#8`, `#10`

**Caption**

"Phase 1: ship the shield"

### 0:35-0:45 — Roadmap Continuity

**Voiceover**

"The development story does not stop at the demo. Phase 2 is already mapped out: chat, approvals, OpenClaw integration, and richer Sentry workflows."

**Show**

- Show open epic `#32`
- Scroll just enough to reveal chat, approval, and observability slices

**Caption**

"Phase 2: operator-facing agent oversight"

### 0:45-1:05 — Testbed Demo

**Voiceover**

"Now the product. In the testbed, we choose a seeded adversarial prompt and run it through the live hardening middleware."

**Show**

- `Dashboard -> Testbed`
- Fire `path-traversal-001`
- Let the event row land

**Caption**

"Seeded attack -> live hardening decision"

### 1:05-1:20 — Flow View

**Voiceover**

"The flow page shows where that decision happened. Instead of a black box refusal, the pipeline tells us which layer fired and why."

**Show**

- `Dashboard -> Flow`
- Keep B1 highlight visible

**Caption**

"The refusal is explainable"

### 1:20-1:40 — Compare View

**Voiceover**

"Then we compare the same attack across OpenAI and Anthropic, with hardening on and off. This makes the safety layer visible as an independent system, not just a model quirk."

**Show**

- `Dashboard -> Compare`
- Pick `prompt-injection-001`
- Re-run compare
- Pause on all four cards

**Caption**

"Safety layer independent from model choice"

### 1:40-1:52 — Eval Matrix

**Voiceover**

"The eval matrix turns that into a reusable benchmark across the canonical attack set."

**Show**

- `Dashboard -> Eval`
- Show multiple green pass badges and the hardening on/off columns

**Caption**

"Demo -> benchmark"

### 1:52-2:00 — Sentry Close

**Voiceover**

"Ægis turns safety events into engineering events. That is Safety-as-Error: blocked agent behavior, grouped and investigated in Sentry like any other production issue."

**Show**

- Sentry issue tab
- If possible, briefly show the grouped issue title and repeated occurrences

**Caption**

"Safety-as-Error"

---

## Best Shot List

If time is tight, record these in order:

1. Home page or README hero
2. GitHub issues list with closed Phase 1 work
3. GitHub issue `#32` Phase 2 epic
4. Dashboard `Testbed` firing `path-traversal-001`
5. Dashboard `Flow`
6. Dashboard `Compare` with `prompt-injection-001`
7. Dashboard `Eval`
8. Sentry issue or trace tab

---

## Editing Notes

- Use quick cuts rather than mouse-heavy narration.
- Leave 1-2 seconds of stillness after each major interaction so captions remain readable.
- If the live system feels risky, record each section as a separate clip and stitch them together.
- For a clean finish, end on the Sentry tab, not the dashboard.
