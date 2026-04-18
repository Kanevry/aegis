---
session: main-2026-04-18-1253
session_type: feature
focus: Phase 1 Close-out
started_at: 2026-04-18T12:53:00+0200
completed_at: 2026-04-18T13:20:00+0200
issues_worked: [9, 11, 12, 14, 18]
---

# Phase 1 Close-out — Human Handover

This document is written for a teammate who was not in this session. Zero assumed context. Read it top to bottom before touching anything.

---

## What Agents Completed

### Issue #14 — Vitest coverage ≥80% (SHIPPED)

- 184 new test cases added across 5 hardening modules.
- 13 integration tests for `createHardening()` added to `packages/hardening/src/index.test.ts`.
- **Coverage achieved: 97.46% lines** (target ≥80%). Module breakdown: paths 100%, pii 100%, redaction 100%, refs 100%, security 97.38%, index 93.97%.
- Full monorepo tests: 304/304 passing, 456ms runtime (target <10s).
- `@vitest/coverage-v8` added to `packages/hardening/package.json`; `test:coverage` script added.
- `eslint.config.mjs` updated to ignore `**/coverage/**` (generated artifacts).

### Issue #12 — Submission description + pitch deck (READY FOR USER)

- `docs/submission-description.md` trimmed from 293 to 217 words; contains `{{VERCEL_URL}}` and `{{VIDEO_URL}}` placeholders; preserves Safety-as-Error framing.
- `docs/pitch-deck-outline.md` created — 5 slides with talking points and timing totaling 3:00.
- `README.md` updated with GitHub repo link and `## Hackathon Submission` section.

### Issue #9 — Vercel deploy docs (RUNBOOK READY FOR USER)

- `docs/deploy.md` — 263-line step-by-step runbook covering Vercel project setup, env-var checklists (REQUIRED encrypted/public and OPTIONAL flags), source-map upload verification, post-deploy smoke actions, and rollback paths A/B/C.
- `scripts/verify-deploy.sh` — 4-check smoke tool (liveness, landing content, API POST, Sentry tunnel).

### Issue #18 — E2E smoke-test checklist (CHECKLIST READY FOR USER)

- `docs/e2e-smoke-checklist.md` — 236-line printable checklist: 6-item pre-flight, all 10 attack IDs with expected layer blocks and Sentry fingerprints, compare mode, PDF export, feedback widget, 3x pitch rehearsal timing, 16:30 circuit-breaker decision.

### Issue #11 — Demo video

100% human execution — no agent can authenticate, screen-record, or upload. See Block B below for the complete script.

---

## Human Action Items (execute in this order)

The four blocks below are self-contained. You do not need to read any other document to execute a block — the relevant file paths and commands are included inline.

---

### Block A — Vercel Deploy (Issue #9) — DO FIRST (everything else depends on this)

**Time estimate: 15 minutes**

This block gets the app live. Without a live URL, you cannot fill in the submission form or record a convincing demo.

**Steps:**

1. Open a terminal in the project root (`/Users/bernhardgoetzendorfer/Projects/aegis`).

2. Link the project to Vercel:
   ```bash
   pnpm dlx vercel link
   ```
   Follow the prompts. Select the existing Vercel team/account. Name the project `aegis` if prompted.

3. Open `docs/deploy.md` section 3 — it contains two tables: REQUIRED env vars (encrypted) and OPTIONAL flags. Add every var listed there through the Vercel dashboard at https://vercel.com → your project → Settings → Environment Variables. Do not skip any REQUIRED entry.

   Key vars at minimum:
   - `OPENAI_API_KEY` — your OpenAI key
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `SENTRY_DSN` — from your Sentry project settings
   - `SENTRY_AUTH_TOKEN` — needed for source-map upload
   - `NEXT_PUBLIC_SENTRY_DSN` — same DSN, public variant

4. Push to trigger a build:
   ```bash
   git push
   ```
   Watch the Vercel dashboard — the build should complete in under 3 minutes.

5. When the dashboard shows "Ready", open the production URL in a browser. Confirm the landing page loads in under 3 seconds.

6. Smoke-test the API:
   ```bash
   curl -X POST https://<your-vercel-url>/api/agent/run \
     -H "content-type: application/json" \
     -d '{"prompt":"hello","provider":"openai"}'
   ```
   Expect a JSON response (not an HTML error page).

7. Open your Sentry project → Performance → verify a `gen_ai.*` span appeared for the request above.

8. Run the automated smoke script:
   ```bash
   chmod +x scripts/verify-deploy.sh
   bash scripts/verify-deploy.sh https://<your-vercel-url>
   ```
   Expect: `4/4 checks passed`.

9. Copy the production URL. Then replace the placeholder in both files:
   - `README.md` — search for `{{VERCEL_URL}}` (around line 5).
   - `docs/submission-description.md` — search for `{{VERCEL_URL}}`.

   Use your editor or:
   ```bash
   VERCEL_URL="https://your-real-url.vercel.app"
   sed -i '' "s|{{VERCEL_URL}}|$VERCEL_URL|g" README.md docs/submission-description.md
   ```

---

### Block B — Demo Video Recording (Issue #11) — HUMAN-ONLY

**Time estimate: 30 minutes (including 2–3 takes)**

No agent can do this. You need a screen recorder, a live browser session, and a microphone.

**Tool choice:**
- Loom (browser extension) — fastest setup.
- OBS — more control over quality. Export: 1080p MP4, under 30 MB.

**Script (≤90 seconds total):**

| Timestamp | Action |
|-----------|--------|
| 0:00–0:15 | Open testbed at `https://<your-vercel-url>/dashboard/testbed`. Say: "Every LLM safety violation should be a first-class ops signal." |
| 0:15–0:45 | Select attack `path-traversal-001` from the dropdown. Fire it. Show the B1 layer highlight in the result panel. Click the Sentry issue link. Show Seer analysis on the Sentry issue page. |
| 0:45–1:15 | Back to testbed. Select `secret-exfil-001`. Fire it. Show the B4/B5 layer blocks. Switch to the Compare tab. Fire "Ignore previous instructions". Show the 4-panel side-by-side result. |
| 1:15–1:30 | Close with: "Safety-as-Error. Seer gets it for free." |

**After recording:**
- Export at 1080p, under 30 MB.
- Upload to YouTube (unlisted) or as a GitHub release asset.
- Copy the video URL.
- Replace `{{VIDEO_URL}}` in both files:
  ```bash
  VIDEO_URL="https://your-real-video-url"
  sed -i '' "s|{{VIDEO_URL}}|$VIDEO_URL|g" README.md docs/submission-description.md
  ```

**Attack IDs reference** (in case the testbed dropdown differs): `path-traversal-001`, `secret-exfil-001`. Full list is in `docs/pitch-deck-outline.md` slide 3.

---

### Block C — E2E Smoke Test + Pitch Rehearsal (Issue #18) — TARGET: 16:00 CEST

**Time estimate: 45 minutes**

Run this after Block A (deploy) and Block B (video). It is your pre-submission quality gate.

**Steps:**

1. Open `docs/e2e-smoke-checklist.md` in a second window — keep it visible throughout.

2. Run the 6-item pre-flight checklist (section 1 of that doc). If any item fails, go directly to the Circuit Breaker section of that doc before proceeding.

3. Run the full 10-attack E2E walkthrough (section 2). Target runtime: 6 minutes. Each attack has an expected layer block and Sentry fingerprint listed in the checklist — verify both.

4. Run `docs/pitch-deck-outline.md` as your script. Do 3 full rehearsals. Time each run. None should exceed 95 seconds. If you are consistently over, trim the demo moment (slide 3).

5. Record one rehearsal as a backup:
   - Save to `docs/assets/backup-demo.mp4` (create the `docs/assets/` directory if it does not exist).
   - This is insurance in case your primary video upload disappears before submission.

6. **16:30 CEST decision point:** Choose LIVE or MOCK. Do not toggle after this point.
   - LIVE: confirm `AEGIS_DEMO_MODE` is NOT set (or is `false`) in Vercel env vars.
   - MOCK: set `AEGIS_DEMO_MODE=true` in Vercel env vars and redeploy (`git push`). This enables scripted responses if any live API is broken.

---

### Block D — Submission + Release Tag (Issue #12) — TARGET: 17:00 CEST (hard lock: 17:30)

**Time estimate: 15 minutes**

This is the final act. Do not rush — a submission with broken links fails the jury check.

**Steps:**

1. Open `docs/submission-description.md`. Confirm that both `{{VERCEL_URL}}` and `{{VIDEO_URL}}` are replaced with real URLs (not placeholders). Read the full text once.

2. Go to the hackathon submission portal (https://codex-hackathons.com/) and fill in the form:
   - **Title:** `Ægis — Observable Agentic Hardening Middleware`
   - **Description:** paste the full contents of `docs/submission-description.md`
   - **Live demo:** your Vercel production URL
   - **GitHub:** `https://github.com/Kanevry/aegis`
   - **Video:** your YouTube or GitHub release asset URL

3. Submit the form. Screenshot the confirmation page.

4. Create the GitHub release tag:
   ```bash
   git tag v0.1.0-hackathon
   git push --tags
   gh release create v0.1.0-hackathon \
     --title "Ægis Phase 1 — Codex Vienna" \
     --notes-file docs/submission-description.md
   ```

5. Confirm the release appears at `https://github.com/Kanevry/aegis/releases`.

**Submission lock: 17:30 CEST. After that, no portal changes are accepted.**

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Session start | 2026-04-18T12:53:00+0200 |
| Rebase resolution time | ~4 min (pre-session — cleaned up broken rebase from prior session) |
| Waves executed | 5: Discovery (2 agents) → Impl-Core (5) → Impl-Polish (3) → Quality (1 + inline) → Finalization (this) |
| Total agents dispatched | 12 |
| Test coverage | 97.46% lines |
| Tests passing | 304/304 |
| Typecheck errors | 0 |
| Lint errors | 0 |
| Files changed (this session scope) | ~13 (tests, docs, scripts, config) |

---

## Session Context Notes

- A parallel session was active on `main` throughout this session covering Phase 2 work: Zod 4 migration, env keys, Supabase schema, and housekeeping. There was no scope collision — all changes are in separate file trees.
- The previous session left a broken rebase. It was resolved at this session's start (conflicts in `package.json` and `testbed/page.tsx`; PDF export feature was ported into `TestbedPageClient`).
- Issues #9, #11, #12, and #18 have all preparatory deliverables complete. Final execution — authentication, screen recording, and live form submission — is human-only by nature.
- Issue #14 is complete. Once the coordinator commits this session, the issue can be marked `status:done`.
