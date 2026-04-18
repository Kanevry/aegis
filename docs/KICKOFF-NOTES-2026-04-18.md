---
epic: "#32"
issue: "#85"
status: archived
title: "Kickoff notes for the 2026-04-18 build"
---

# Kickoff Notes

## Build constraints

- Codex Community Hackathon Vienna
- 6-hour build window
- Public repo and demo posture from the start
- Sentry observability is sponsor-critical and not optional polish

## Original goals

- ship a production-grade prototype, not a slide deck
- make every LLM call visible in Sentry
- fingerprint blocked attacks so Seer can group them automatically
- show a live testbed where unsafe prompts are rejected with clear evidence

## What Phase 1 needed to prove

- hardening can be composable instead of ad hoc
- observability can stay stable across repeated attack patterns
- provider choice can stay orthogonal to the safety layer
- the product story is stronger when safety events look like normal engineering incidents

## What we learned

- stable `patternId` values matter because they influence grouping and analysis quality
- docs drift quickly when seeded attacks and UI copy evolve in parallel
- a local Docker story is important once approvals and external gateways enter the design
- public documentation has to avoid private infra assumptions from day one

## What changed for Phase 2

Phase 2 expands the scope from one hardened route into a broader operator surface:

- streaming chat
- approval workflows
- OpenClaw bridge contracts
- persistence and queueing
- richer Sentry taxonomy

The architectural direction from this kickoff is now captured in:

- [`ADR.md`](./ADR.md)
- [`architecture.md`](./architecture.md)
- [`PHASE-2-SEER-VISION.md`](./PHASE-2-SEER-VISION.md)
