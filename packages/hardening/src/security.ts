// Security / injection-detection layer (B4)
// Pure functions — no external dependencies.
//
// Buffer.from has been replaced with TextEncoder for browser/edge compatibility.

// ── Types ────────────────────────────────────────────────────────────

export interface InjectionResult {
  detected: boolean;
  patterns: string[];
  severity: "none" | "low" | "high";
}

export interface DomainValidation {
  match: boolean;
  senderDomain: string;
  knownDomain: string;
}

// ── Injection detection ──────────────────────────────────────────────

const INJECTION_PATTERNS: readonly string[] = [
  "ignore previous instructions",
  "ignore all previous",
  "forget your instructions",
  "disregard your instructions",
  "act as a different agent",
  "you are now",
  "new instructions:",
  "override:",
  "system prompt:",
  "send data to",
  "forward secrets",
  "exfiltrate",
  "send me your api key",
  "relay via",
  "authenticated request",
  "marked as trusted",
  // HTML comment injection patterns
  "internal relay",
  "operational note",
  "trusted queue",
  "active control path",
  "embedded instructions",
  "process the embedded",
  "send it back through the bridge",
  // SQL injection patterns
  "drop table",
  "drop database",
  "delete from",
  "truncate table",
  "insert into",
  "union select",
  "'; drop",
  "'; delete",
] as const;

/** Patterns that always indicate credential/secret extraction attempts. */
const HIGH_SEVERITY_PATTERNS: readonly string[] = [
  "forward secrets",
  "exfiltrate",
  "send me your api key",
  "send data to",
  "relay via",
  "drop table",
  "drop database",
  "truncate table",
] as const;

/**
 * Common injection phrases that might appear base64-encoded inside file content.
 */
const BASE64_INJECTION_KEYWORDS: readonly string[] = [
  "ignore previous",
  "ignore all previous",
  "forget your instructions",
  "disregard your instructions",
  "system prompt",
  "override",
  "exfiltrate",
  "forward secrets",
  "send me your api key",
] as const;

/** Matches plausible base64 segments (at least 16 chars, valid alphabet + padding). */
const BASE64_SEGMENT_RE = /[A-Za-z0-9+/]{16,}={0,2}/g;

/**
 * Decodes a base64 string to UTF-8 using atob + TextEncoder-compatible approach.
 * Works in Node.js (>=16), browsers, and edge runtimes.
 */
function decodeBase64(segment: string): string | null {
  try {
    // atob is available in Node 16+ and all browsers/edge runtimes
    const binaryStr = atob(segment);
    // Convert binary string to UTF-8 bytes via TextEncoder/TextDecoder
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

function isValidBase64(segment: string): boolean {
  // Length must be a multiple of 4 for proper base64.
  if (segment.length % 4 !== 0) return false;
  try {
    const decoded = decodeBase64(segment);
    if (decoded === null) return false;
    // Accept if the decoded string is mostly printable ASCII.
    const printable = /^[\x20-\x7E\t\n\r]+$/.test(decoded);
    return printable;
  } catch {
    return false;
  }
}

function checkBase64Injections(text: string): string[] {
  const matches: string[] = [];
  const segments = text.match(BASE64_SEGMENT_RE);
  if (!segments) return matches;

  for (const segment of segments) {
    if (!isValidBase64(segment)) continue;
    const decoded = decodeBase64(segment);
    if (decoded === null) continue;
    const lower = decoded.toLowerCase();
    for (const keyword of BASE64_INJECTION_KEYWORDS) {
      if (lower.includes(keyword)) {
        matches.push(`base64-encoded: "${keyword}"`);
      }
    }
  }

  return matches;
}

/**
 * Scans text for prompt injection patterns.
 *
 * High severity: multiple pattern matches OR any explicit credential/secret
 * extraction attempt OR destructive SQL pattern.
 * Low severity: single ambiguous pattern match.
 */
export function scanForInjection(text: string): InjectionResult {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (lower.includes(pattern)) {
      matched.push(pattern);
    }
  }

  // Check for base64-encoded injection phrases.
  const base64Hits = checkBase64Injections(text);
  matched.push(...base64Hits);

  if (matched.length === 0) {
    return { detected: false, patterns: [], severity: "none" };
  }

  // Determine severity.
  const hasHighSeverityPattern = matched.some((m) =>
    HIGH_SEVERITY_PATTERNS.some((h) => m.includes(h))
  );
  const isHigh = hasHighSeverityPattern || matched.length > 1;

  return {
    detected: true,
    patterns: matched,
    severity: isHigh ? "high" : "low",
  };
}

// ── Email domain validation ──────────────────────────────────────────

function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return "";
  return email.slice(atIndex + 1).toLowerCase().trim();
}

/**
 * Validates that the sender's email domain matches the known contact's
 * email domain. Catches phishing attempts where the domain is subtly different.
 */
export function validateEmailDomain(
  senderEmail: string,
  knownContactEmail: string
): DomainValidation {
  const senderDomain = extractDomain(senderEmail);
  const knownDomain = extractDomain(knownContactEmail);

  return {
    match: senderDomain === knownDomain,
    senderDomain,
    knownDomain,
  };
}

// ── Unsupported feature detection ────────────────────────────────────

const UNSUPPORTED_PATTERNS: readonly RegExp[] = [
  /\bsync(?:ing|ed|s)?\s+(?:to|with)\s+\w/i,
  /\bsalesforce\b/i,
  /\bhubspot\b/i,
  /\bcrm\b/i,
  /\bpublish(?:ing|ed|es)?\s+to\s+(?:https?:\/\/|url|endpoint)/i,
  /\bsend\s+(?:an?\s+)?https?\s+request/i,
  /\bhttp\s+(?:get|post|put|patch|delete)\s+request/i,
  /\bmake\s+(?:an?\s+)?api\s+call/i,
  /\bcall\s+(?:the\s+)?(?:external\s+)?api\b/i,
  /\bsend\s+(?:an?\s+)?email\b(?!.*\boutbox\b)/i,
  /\bwebhook\b/i,
  /\bexternal\s+(?:service|endpoint|api)\b/i,
  /\bpush\s+(?:to|data\s+to)\s+(?:https?:\/\/|remote|cloud)/i,
] as const;

/**
 * Returns `true` if the task text requests a capability that is not
 * supported in the runtime (file-based system). These should be answered
 * with `OUTCOME_NONE_UNSUPPORTED`.
 */
export function isUnsupportedFeature(taskText: string): boolean {
  return UNSUPPORTED_PATTERNS.some((re) => re.test(taskText));
}
