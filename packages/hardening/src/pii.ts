// PII / personal-info refusal layer (B2)
// Pure functions — no external dependencies.
//
// Scope: detect task instructions that ask the agent to look up or reveal
// personal information about real people (third parties).
//
// Design principle: high precision, low false-positive. Patterns only match
// when the intent is clearly "reveal personal info about a person".

// ── Types ────────────────────────────────────────────────────────────

export type PiiCategory =
  | "family_relation_query"
  | "personal_contact_query"
  | "home_address_query"
  | "relationship_query"
  | "email_address";

export interface PiiDetectionResult {
  detected: boolean;
  /** Matched category — empty when not detected. */
  category: PiiCategory | "";
  /** Human-readable matched phrase (first hit only). */
  match: string;
}

// ── Patterns ─────────────────────────────────────────────────────────

/**
 * Family-relation + contact-info queries.
 * Matches: "what is my wife's email", "was ist die email meiner frau".
 */
const FAMILY_RELATION_PATTERNS: readonly RegExp[] = [
  // English: "X's email/phone/address" where X is a relation
  /\b(?:wife|husband|spouse|partner|girlfriend|boyfriend|mother|father|mom|dad|sister|brother|daughter|son|child|kids)['']?s?\s+(?:email|phone|mobile|cell|address|number|whereabouts|contact)\b/i,
  // English: "email of my wife"
  /\b(?:email|phone|mobile|cell|address|number)\s+of\s+(?:my|your|his|her|their)\s+(?:wife|husband|spouse|partner|girlfriend|boyfriend|mother|father|mom|dad|sister|brother|daughter|son|child|kids)\b/i,
  // German: "email/telefon/adresse (meiner|deiner|...) (frau|mann|...)"
  /\b(?:email|e-?mail|mail|telefon|telefonnummer|handy|handynummer|mobilnummer|adresse|anschrift|nummer|kontakt)\s+(?:von\s+)?(?:deiner|meiner|seiner|ihrer|deinem|meinem|seinem|ihrem|der|des)\s+(?:frau|mann|partnerin|partner|freundin|freund|mutter|vater|schwester|bruder|tochter|sohn|kindes|kindern|kind)\b/i,
  // German: "was ist die mail deiner frau"
  /\bwas\s+ist\s+(?:die\s+|der\s+|das\s+)?(?:email|e-?mail|mail|telefon|telefonnummer|handy|handynummer|adresse|anschrift|nummer)\s+(?:von\s+)?(?:deiner|meiner|seiner|ihrer)\s+(?:frau|mann|partnerin|partner|freundin|freund|mutter|vater|schwester|bruder|tochter|sohn|kind)\b/i,
];

/**
 * Explicit personal/private contact-info queries.
 */
const PERSONAL_CONTACT_PATTERNS: readonly RegExp[] = [
  /\b(?:personal|private)\s+(?:email|phone|mobile|cell|address|number|contact)\s+(?:of|for)\b/i,
  /\b(?:personal|private)\s+(?:email|phone|mobile|cell|address|number|contact)\s+(?:von|für)\b/i,
  /\b(?:private|persönliche)\s+(?:email|e-?mail|mail|telefon|telefonnummer|handy|handynummer|adresse|anschrift|nummer)\s+(?:von|für)\b/i,
];

/**
 * Home / physical-location queries.
 */
const HOME_ADDRESS_PATTERNS: readonly RegExp[] = [
  /\bhome\s+address\s+of\b/i,
  /\bwhere\s+does\s+[a-z]+(?:\s+[a-z]+)?\s+live\b/i,
  /\b(?:home|personal|private)\s+address\s+(?:of|for)\b/i,
  /\bwo\s+wohnt\s+[a-zäöüß]+/i,
  /\b(?:privatadresse|wohnadresse|heimatadresse)\s+(?:von|für)\b/i,
];

/**
 * Relationship-status queries.
 */
const RELATIONSHIP_PATTERNS: readonly RegExp[] = [
  /\bwho\s+is\s+[a-z]+(?:\s+[a-z]+)?\s+(?:married\s+to|dating|in\s+a\s+relationship\s+with)\b/i,
  /\bmit\s+wem\s+ist\s+[a-zäöüß]+(?:\s+[a-zäöüß]+)?\s+verheiratet\b/i,
  /\bwer\s+ist\s+[a-zäöüß]+(?:\s+[a-zäöüß]+)?['']?s?\s+(?:frau|mann|partner|partnerin)\b/i,
];

/**
 * Bare email-address pattern — detects PII embedded in prompts/content.
 */
const EMAIL_ADDRESS_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

// ── Detection ────────────────────────────────────────────────────────

function firstMatch(
  text: string,
  patterns: readonly RegExp[]
): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Scans text for personal-info-query patterns. Returns the first matching
 * category. Order of precedence: family > home > personal > relationship > email.
 */
export function detectPersonalInfoQuery(text: string): PiiDetectionResult {
  if (!text) {
    return { detected: false, category: "", match: "" };
  }

  const family = firstMatch(text, FAMILY_RELATION_PATTERNS);
  if (family) {
    return { detected: true, category: "family_relation_query", match: family };
  }

  const home = firstMatch(text, HOME_ADDRESS_PATTERNS);
  if (home) {
    return { detected: true, category: "home_address_query", match: home };
  }

  const personal = firstMatch(text, PERSONAL_CONTACT_PATTERNS);
  if (personal) {
    return { detected: true, category: "personal_contact_query", match: personal };
  }

  const relationship = firstMatch(text, RELATIONSHIP_PATTERNS);
  if (relationship) {
    return { detected: true, category: "relationship_query", match: relationship };
  }

  const emailMatch = text.match(EMAIL_ADDRESS_RE);
  if (emailMatch) {
    return { detected: true, category: "email_address", match: emailMatch[0] };
  }

  return { detected: false, category: "", match: "" };
}

/**
 * Returns the recommended outcome for a detected PII query.
 */
export function recommendedPiiOutcome(
  detection: PiiDetectionResult
): "OUTCOME_NONE_UNSUPPORTED" | "OUTCOME_OK" {
  return detection.detected ? "OUTCOME_NONE_UNSUPPORTED" : "OUTCOME_OK";
}
