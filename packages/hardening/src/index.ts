// ── @aegis/hardening — composable 5-layer defense facade ─────────────
// B1: Path-traversal guard
// B2: PII / personal-info refusal
// B3: Grounding-refs self-validation
// B4: Injection detection (prompt + SQL + base64)
// B5: Secret redaction
//
// Usage:
//   const hardening = createHardening({ flags: { B1: true, B5: true } })
//   const result = hardening.run({ prompt, paths, refs, taskText })

export { validateSinglePath, validatePaths } from "./paths";
export type { PathValidation } from "./paths";

export { detectPersonalInfoQuery, recommendedPiiOutcome } from "./pii";
export type { PiiDetectionResult, PiiCategory } from "./pii";

export {
  validateGroundingRefs,
  initialVisitedSet,
  trackVisited,
  extractPathsFromText,
} from "./refs";
export type { RefsValidationResult } from "./refs";

export { scanForInjection, validateEmailDomain, isUnsupportedFeature } from "./security";
export type { InjectionResult, DomainValidation } from "./security";

export { redactSecrets } from "./redaction";
export type { RedactionResult } from "./redaction";

// ── Facade types ────────────────────────────────────────────────────

export interface HardeningInput {
  /** The prompt or task text to analyze. */
  prompt: string;
  /** Optional file paths referenced in the prompt (for B1 validation). */
  paths?: string[];
  /** Optional grounding refs to validate (for B3 validation). */
  refs?: string[];
  /** Task text for seeding the visited set (for B3 validation). */
  taskText?: string;
}

export interface HardeningResult {
  /** 0..1 — 1 = fully safe, 0 = hard blocked. Penalized per blocked layer. */
  safetyScore: number;
  /** Layer IDs that blocked: ['B1','B2',…] */
  blockedLayers: string[];
  /** Whether PII was detected in B2. */
  piiDetected: boolean;
  /** Whether injection/destructive SQL was detected in B4. */
  injectionDetected: boolean;
  /** Number of destructive SQL patterns detected in B4. */
  destructiveCount: number;
  /** Short-circuit: false means the prompt must not be forwarded downstream. */
  allowed: boolean;
  /** Post-B5 prompt with secrets redacted — use this for downstream LLM calls. */
  redactedPrompt: string;
  /** Human-readable explanation of why the request was blocked (if any). */
  reason?: string;
}

type LayerFlag = "B1" | "B2" | "B3" | "B4" | "B5";

interface HardeningOptions {
  /**
   * Per-layer feature flags. If not provided, falls back to env vars:
   * AEGIS_LAYER_B1_PATHS, AEGIS_LAYER_B2_PII, AEGIS_LAYER_B3_REFS,
   * AEGIS_LAYER_B4_SECURITY, AEGIS_LAYER_B5_REDACTION
   *
   * Master switch: AEGIS_HARDENING_ENABLED (default: true). When false,
   * createHardening returns allowed=true, safetyScore=1, blockedLayers=[].
   *
   * Default when neither opts nor env var is set: all layers enabled.
   */
  flags?: Partial<Record<LayerFlag, boolean>>;
}

// ── Env-var helpers ─────────────────────────────────────────────────

function envFlag(name: string): boolean {
  // Works in Node.js, Next.js, and edge runtimes that expose process.env.
  if (typeof process !== "undefined" && process.env) {
    const v = process.env[name];
    if (v === "false" || v === "0") return false;
    if (v === "true" || v === "1") return true;
  }
  return true; // default: enabled
}

function resolveFlag(
  layer: LayerFlag,
  opts: HardeningOptions | undefined
): boolean {
  if (opts?.flags && layer in opts.flags) {
    return opts.flags[layer] ?? true;
  }
  const envMap: Record<LayerFlag, string> = {
    B1: "AEGIS_LAYER_B1_PATHS",
    B2: "AEGIS_LAYER_B2_PII",
    B3: "AEGIS_LAYER_B3_REFS",
    B4: "AEGIS_LAYER_B4_SECURITY",
    B5: "AEGIS_LAYER_B5_REDACTION",
  };
  return envFlag(envMap[layer]);
}

// ── Destructive pattern counter (subset of INJECTION_PATTERNS) ───────

const DESTRUCTIVE_RE: readonly RegExp[] = [
  /\bdrop\s+table\b/gi,
  /\bdrop\s+database\b/gi,
  /\bdelete\s+from\b/gi,
  /\btruncate\s+table\b/gi,
];

function countDestructivePatterns(text: string): number {
  return DESTRUCTIVE_RE.reduce((count, re) => {
    const hits = text.match(re);
    return count + (hits ? hits.length : 0);
  }, 0);
}

// ── Factory ─────────────────────────────────────────────────────────

import { validatePaths } from "./paths";
import { detectPersonalInfoQuery } from "./pii";
import {
  validateGroundingRefs,
  initialVisitedSet,
} from "./refs";
import { scanForInjection } from "./security";
import { redactSecrets } from "./redaction";

/**
 * Creates a composable hardening pipeline with 5 layers (B1–B5).
 *
 * @example
 * ```ts
 * const hardening = createHardening()
 * const result = hardening.run({ prompt: userInput, paths: ['/workspace/file.ts'] })
 * if (!result.allowed) throw new Error(result.reason)
 * const safePrompt = result.redactedPrompt
 * ```
 */
export function createHardening(opts?: HardeningOptions): {
  run: (input: HardeningInput) => HardeningResult;
} {
  return {
    run(input: HardeningInput): HardeningResult {
      // ── Master switch: AEGIS_HARDENING_ENABLED ───────────────────
      // When false, skip all layers and allow the prompt through unchanged.
      if (!envFlag("AEGIS_HARDENING_ENABLED")) {
        return {
          safetyScore: 1,
          blockedLayers: [],
          piiDetected: false,
          injectionDetected: false,
          destructiveCount: 0,
          allowed: true,
          redactedPrompt: input.prompt,
        };
      }

      const blockedLayers: string[] = [];
      let safetyScore = 1.0;
      let piiDetected = false;
      let injectionDetected = false;
      let destructiveCount = 0;
      let reason: string | undefined;

      // ── B1: Path-traversal guard ─────────────────────────────────
      if (resolveFlag("B1", opts) && input.paths && input.paths.length > 0) {
        const pathResult = validatePaths(input.paths);
        if (!pathResult.ok) {
          blockedLayers.push("B1");
          safetyScore -= 0.4;
          reason = pathResult.error;
          return {
            safetyScore: Math.max(0, safetyScore),
            blockedLayers,
            piiDetected: false,
            injectionDetected: false,
            destructiveCount: 0,
            allowed: false,
            redactedPrompt: input.prompt,
            reason,
          };
        }
      }

      // ── B2: PII detection ────────────────────────────────────────
      if (resolveFlag("B2", opts)) {
        const piiResult = detectPersonalInfoQuery(input.prompt);
        if (piiResult.detected) {
          piiDetected = true;
          blockedLayers.push("B2");
          safetyScore -= 0.3;
          reason = `PII detected (${piiResult.category}): "${piiResult.match}"`;
          return {
            safetyScore: Math.max(0, safetyScore),
            blockedLayers,
            piiDetected: true,
            injectionDetected: false,
            destructiveCount: 0,
            allowed: false,
            redactedPrompt: input.prompt,
            reason,
          };
        }
      }

      // ── B3: Refs validation ──────────────────────────────────────
      if (resolveFlag("B3", opts) && input.refs && input.refs.length > 0) {
        const visited = initialVisitedSet(input.taskText ?? input.prompt);
        const refsResult = validateGroundingRefs(input.refs, visited);
        if (!refsResult.ok) {
          blockedLayers.push("B3");
          safetyScore -= 0.1;
          // B3 is a soft block — log the issue but allow through with penalty
          reason = refsResult.error;
          // Not a hard block — continue pipeline
        }
      }

      // ── B4: Injection / security scan ────────────────────────────
      if (resolveFlag("B4", opts)) {
        const injectionResult = scanForInjection(input.prompt);
        destructiveCount = countDestructivePatterns(input.prompt);

        if (injectionResult.detected) {
          injectionDetected = true;
          blockedLayers.push("B4");

          if (injectionResult.severity === "high" || destructiveCount > 0) {
            safetyScore -= 0.5;
            reason = `Injection detected (${injectionResult.severity}): ${injectionResult.patterns.slice(0, 3).join(", ")}`;
            return {
              safetyScore: Math.max(0, safetyScore),
              blockedLayers,
              piiDetected,
              injectionDetected: true,
              destructiveCount,
              allowed: false,
              redactedPrompt: input.prompt,
              reason,
            };
          } else {
            // Low severity — penalize score but allow through
            safetyScore -= 0.2;
            reason = `Injection pattern detected (low severity): ${injectionResult.patterns[0]}`;
          }
        }
      }

      // ── B5: Secret redaction ─────────────────────────────────────
      let redactedPrompt = input.prompt;
      if (resolveFlag("B5", opts)) {
        const redactionResult = redactSecrets(input.prompt);
        redactedPrompt = redactionResult.text;
        if (redactionResult.hits.length > 0) {
          blockedLayers.push("B5");
          safetyScore -= 0.15 * redactionResult.hits.length;
        }
      }

      const finalScore = Math.max(0, Math.min(1, safetyScore));
      const hardBlocked = blockedLayers.some((l) => ["B1", "B2"].includes(l));
      const allowed =
        finalScore > 0 &&
        !hardBlocked &&
        !(injectionDetected && finalScore <= 0.5);

      return {
        safetyScore: finalScore,
        blockedLayers,
        piiDetected,
        injectionDetected,
        destructiveCount,
        allowed,
        redactedPrompt,
        reason,
      };
    },
  };
}
