// Rejection-message flow utility (refs #51)
// Pure functions — no IO, no Sentry, no logging.

import { scanForInjection } from "@aegis/hardening";
import type { ReasonCategory, RejectionOutput } from "@aegis/types";

export type { ReasonCategory, RejectionOutput };

// ── Input / Output shapes ────────────────────────────────────────────

export interface RejectionInput {
  approval: { id: string; tool: string; reason?: string | null; status: string };
  decision: "deny-once" | "deny-always";
  /** Optional free-text explanation from the user who denied the request. */
  rejectionMessage?: string;
}

// ── Reason-category mapping ──────────────────────────────────────────

/**
 * Maps a free-text reason string to a canonical `ReasonCategory` via
 * case-insensitive substring matching.
 */
export function mapReasonCategory(reason?: string | null): ReasonCategory {
  if (!reason) return "user-deny";

  const lower = reason.toLowerCase();

  if (
    lower.includes("pii") ||
    lower.includes("social") ||
    lower.includes("ssn") ||
    lower.includes("email") ||
    lower.includes("phone")
  ) {
    return "pii";
  }

  if (
    lower.includes("inject") ||
    lower.includes("override") ||
    lower.includes("jailbreak")
  ) {
    return "injection";
  }

  if (
    lower.includes("traversal") ||
    lower.includes("path") ||
    lower.includes("..")
  ) {
    return "path-traversal";
  }

  if (
    lower.includes("secret") ||
    lower.includes("api key") ||
    lower.includes("token") ||
    lower.includes("credential")
  ) {
    return "secret";
  }

  if (lower.includes("expir")) {
    return "expired";
  }

  return "user-deny";
}

// ── Per-category labels and followup hints ───────────────────────────

const CATEGORY_LABEL: Record<ReasonCategory, string> = {
  pii: "sensitive data exposure (PII)",
  injection: "prompt injection attempt",
  "path-traversal": "path traversal attempt",
  secret: "secret or credential exposure",
  "user-deny": "user denial",
  expired: "approval timeout",
};

const CATEGORY_FOLLOWUP: Record<ReasonCategory, string> = {
  pii:
    "Try rephrasing without including personal information like SSN, email, or phone.",
  injection:
    "Remove any instruction-override phrases and resubmit with a straightforward request.",
  "path-traversal":
    "Use absolute paths within the allowed workspace; avoid '..' sequences.",
  secret:
    "Do not include API keys, tokens, or credentials in requests — use environment variables instead.",
  "user-deny":
    "Review the request and resubmit, or contact the approver for guidance.",
  expired:
    "The approval window has elapsed. Re-initiate the approval flow to retry.",
};

// ── Sanitization helpers ─────────────────────────────────────────────

const HTML_TAG_RE = /<[^>]+>/g;
const BACKTICK_RE = /`/g;
// Markdown link injection: [label](javascript: ...) or [label](data: ...)
const MD_LINK_INJECTION_RE = /\[[^\]]*\]\s*\(\s*(?:javascript|data|vbscript):[^)]*\)/gi;

/**
 * Sanitizes a user-supplied rejection message:
 * 1. Strips HTML tags.
 * 2. Removes backticks.
 * 3. Neutralizes Markdown link-injection patterns (javascript:/data: URLs).
 * 4. Truncates to 200 chars.
 * 5. Returns `null` if the sanitized text triggers injection scan.
 */
function sanitizeRejectionMessage(raw: string): string | null {
  let text = raw
    .replace(HTML_TAG_RE, "")
    .replace(BACKTICK_RE, "")
    .replace(MD_LINK_INJECTION_RE, "[link removed]");

  // Truncate to 200 chars
  if (text.length > 200) {
    text = text.slice(0, 200);
  }

  // Omit entirely if it contains injection patterns
  const injectionResult = scanForInjection(text);
  if (injectionResult.detected) {
    return null;
  }

  return text;
}

// ── Core builder ─────────────────────────────────────────────────────

/**
 * Builds a structured rejection message suitable for streaming back to the
 * user or embedding in LLM context. Pure function — no IO.
 */
export function buildRejectionMessage(input: RejectionInput): RejectionOutput {
  const { approval, decision, rejectionMessage } = input;

  const reasonCategory = mapReasonCategory(approval.reason);

  // escalation: hard when deny-always or the approval already shows a repeated
  // denial pattern (status === 'denied' on a new deny → already decided once).
  const escalation: "soft" | "hard" =
    decision === "deny-always" || approval.status === "denied" ? "hard" : "soft";

  const label = CATEGORY_LABEL[reasonCategory];

  let summary = `Request denied: detected ${label}.`;

  // Embed sanitized user note if provided and clean
  if (rejectionMessage !== undefined && rejectionMessage !== "") {
    const sanitized = sanitizeRejectionMessage(rejectionMessage);
    if (sanitized !== null && sanitized.trim().length > 0) {
      summary += ` Note: ${sanitized.trim()}`;
    }
  }

  // Enforce 280-char cap on summary
  if (summary.length > 280) {
    summary = summary.slice(0, 277) + "...";
  }

  const suggestedFollowup = CATEGORY_FOLLOWUP[reasonCategory];

  return {
    summary,
    reasonCategory,
    suggestedFollowup,
    escalation,
  };
}
