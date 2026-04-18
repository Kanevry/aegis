import { describe, it, expect } from "vitest";
import { detectPersonalInfoQuery, recommendedPiiOutcome } from "../src/pii.js";
import type { PiiDetectionResult } from "../src/pii.js";

describe("B2 — PII detection", () => {
  it("detects a bare email address", () => {
    const result = detectPersonalInfoQuery(
      "Please contact john.doe@example.com for more info."
    );
    expect(result.detected).toBe(true);
    expect(result.category).toBe("email_address");
    expect(result.match).toBe("john.doe@example.com");
  });

  it("detects a family relation query (English)", () => {
    const result = detectPersonalInfoQuery("What is my wife's email address?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });

  it("detects a home address query", () => {
    const result = detectPersonalInfoQuery("What is the home address of John Smith?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("home_address_query");
  });

  it("detects a personal contact query", () => {
    const result = detectPersonalInfoQuery(
      "Find the personal email of Alice"
    );
    expect(result.detected).toBe(true);
    expect(result.category).toBe("personal_contact_query");
  });

  it("does NOT flag a plain workspace email path", () => {
    const result = detectPersonalInfoQuery(
      "Read the file at /workspace/emails/inbox/message.txt"
    );
    // Should not trigger — no actual email address or relation query
    expect(result.detected).toBe(false);
  });

  it("returns no detection for benign prompt", () => {
    const result = detectPersonalInfoQuery(
      "Read the sales report and summarize the Q1 figures."
    );
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
  });
});

// ── Category precedence ───────────────────────────────────────────────────────

describe("B2 — category precedence (family > home > personal > relationship > email)", () => {
  it("returns family_relation_query over email_address when wife's email is embedded", () => {
    // Contains both a family-relation pattern and an email keyword — family wins.
    const result = detectPersonalInfoQuery("my wife's email address please");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });

  it("returns family_relation_query over home_address_query when 'address of my mother' is requested", () => {
    // FAMILY_RELATION_PATTERNS[1] matches 'address of my mother' before HOME_ADDRESS_PATTERNS fires.
    const result = detectPersonalInfoQuery("What is the address of my mother?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });
});

// ── German family-relation patterns ──────────────────────────────────────────

describe("B2 — German family-relation patterns", () => {
  it("detects 'email meiner frau' (German possessive + relation)", () => {
    const result = detectPersonalInfoQuery("Kannst du mir die email meiner frau geben?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });

  it("detects 'was ist die mail deiner mutter'", () => {
    const result = detectPersonalInfoQuery("was ist die mail deiner mutter?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });

  it("detects 'telefonnummer der schwester'", () => {
    const result = detectPersonalInfoQuery("Schick mir die telefonnummer der schwester");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });

  it("detects 'handy meiner freundin'", () => {
    const result = detectPersonalInfoQuery("Ich brauche das handy meiner freundin");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });
});

// ── German home-address patterns ──────────────────────────────────────────────

describe("B2 — German home-address patterns", () => {
  it("detects 'wo wohnt Max Schmidt'", () => {
    const result = detectPersonalInfoQuery("wo wohnt Max Schmidt?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("home_address_query");
  });

  it("detects 'privatadresse von Anna'", () => {
    const result = detectPersonalInfoQuery("Gib mir die privatadresse von Anna");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("home_address_query");
  });

  it("detects 'wohnadresse für Hans'", () => {
    const result = detectPersonalInfoQuery("Suche die wohnadresse für Hans");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("home_address_query");
  });
});

// ── German relationship patterns ──────────────────────────────────────────────

describe("B2 — German relationship patterns", () => {
  it("detects 'mit wem ist Anna verheiratet'", () => {
    const result = detectPersonalInfoQuery("mit wem ist Anna verheiratet?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("relationship_query");
  });

  it("detects 'wer ist sein Partner'", () => {
    const result = detectPersonalInfoQuery("wer ist sein Partner");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("relationship_query");
  });
});

// ── English relationship patterns ─────────────────────────────────────────────

describe("B2 — English relationship patterns", () => {
  it("detects 'who is John dating'", () => {
    const result = detectPersonalInfoQuery("who is John dating right now?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("relationship_query");
  });

  it("detects 'who is Mary in a relationship with'", () => {
    const result = detectPersonalInfoQuery("who is Mary in a relationship with?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("relationship_query");
  });

  it("does NOT detect 'is Mary married to' — no 'who is' prefix required by pattern", () => {
    // The pattern requires 'who is X married to'; this phrase lacks the prefix.
    const result = detectPersonalInfoQuery("is Mary married to someone famous?");
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
  });
});

// ── Email edge cases ──────────────────────────────────────────────────────────

describe("B2 — email address edge cases", () => {
  it("detects a multi-dot domain email (john@co.uk.example.com)", () => {
    const result = detectPersonalInfoQuery("send it to john@co.uk.example.com");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("email_address");
    expect(result.match).toBe("john@co.uk.example.com");
  });

  it("detects a plus-addressed email (user+tag@example.com)", () => {
    const result = detectPersonalInfoQuery("forward to user+tag@example.com");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("email_address");
    expect(result.match).toBe("user+tag@example.com");
  });

  it("detects an email with underscore in local part (john_doe@ex.com)", () => {
    const result = detectPersonalInfoQuery("reach john_doe@ex.com for details");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("email_address");
    expect(result.match).toBe("john_doe@ex.com");
  });
});

// ── recommendedPiiOutcome ─────────────────────────────────────────────────────

describe("B2 — recommendedPiiOutcome", () => {
  it("returns OUTCOME_NONE_UNSUPPORTED for a detected family_relation_query", () => {
    const detection: PiiDetectionResult = {
      detected: true,
      category: "family_relation_query",
      match: "wife's email",
    };
    expect(recommendedPiiOutcome(detection)).toBe("OUTCOME_NONE_UNSUPPORTED");
  });

  it("returns OUTCOME_NONE_UNSUPPORTED for a detected home_address_query", () => {
    const detection: PiiDetectionResult = {
      detected: true,
      category: "home_address_query",
      match: "home address of",
    };
    expect(recommendedPiiOutcome(detection)).toBe("OUTCOME_NONE_UNSUPPORTED");
  });

  it("returns OUTCOME_NONE_UNSUPPORTED for a detected personal_contact_query", () => {
    const detection: PiiDetectionResult = {
      detected: true,
      category: "personal_contact_query",
      match: "personal email of",
    };
    expect(recommendedPiiOutcome(detection)).toBe("OUTCOME_NONE_UNSUPPORTED");
  });

  it("returns OUTCOME_NONE_UNSUPPORTED for a detected relationship_query", () => {
    const detection: PiiDetectionResult = {
      detected: true,
      category: "relationship_query",
      match: "who is John dating",
    };
    expect(recommendedPiiOutcome(detection)).toBe("OUTCOME_NONE_UNSUPPORTED");
  });

  it("returns OUTCOME_NONE_UNSUPPORTED for a detected email_address", () => {
    const detection: PiiDetectionResult = {
      detected: true,
      category: "email_address",
      match: "user@example.com",
    };
    expect(recommendedPiiOutcome(detection)).toBe("OUTCOME_NONE_UNSUPPORTED");
  });

  it("returns OUTCOME_OK when nothing was detected", () => {
    const detection: PiiDetectionResult = {
      detected: false,
      category: "",
      match: "",
    };
    expect(recommendedPiiOutcome(detection)).toBe("OUTCOME_OK");
  });
});

// ── Empty / whitespace input ──────────────────────────────────────────────────

describe("B2 — empty and whitespace inputs", () => {
  it("returns no detection for empty string", () => {
    const result = detectPersonalInfoQuery("");
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
    expect(result.match).toBe("");
  });

  it("returns no detection for whitespace-only string", () => {
    const result = detectPersonalInfoQuery("   ");
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
    expect(result.match).toBe("");
  });

  it("returns no detection for tab/newline-only string", () => {
    const result = detectPersonalInfoQuery("\n\t");
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
    expect(result.match).toBe("");
  });
});

// ── Case sensitivity ──────────────────────────────────────────────────────────

describe("B2 — case insensitivity (all patterns use /i flag)", () => {
  it("detects WIFE'S EMAIL in all-caps input", () => {
    const result = detectPersonalInfoQuery("What is My WIFE'S EMAIL?");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("family_relation_query");
  });

  it("detects HOME ADDRESS OF in upper-case input", () => {
    const result = detectPersonalInfoQuery("HOME ADDRESS OF john");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("home_address_query");
  });

  it("detects email address regardless of case of surrounding text", () => {
    const result = detectPersonalInfoQuery("CONTACT: User@Example.COM for info");
    expect(result.detected).toBe(true);
    expect(result.category).toBe("email_address");
  });
});

// ── False-positive guard ──────────────────────────────────────────────────────

describe("B2 — false-positive guards (should NOT detect)", () => {
  it("does NOT detect 'my wife is a developer' — no contact-info word follows relation", () => {
    const result = detectPersonalInfoQuery("my wife is a developer");
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
  });

  it("does NOT detect 'family relationships are important' — no personal query intent", () => {
    const result = detectPersonalInfoQuery("family relationships are important at work");
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
  });

  it("does NOT detect 'my husband works remotely' — no contact-info word after relation", () => {
    const result = detectPersonalInfoQuery("my husband works remotely and travels often");
    expect(result.detected).toBe(false);
    expect(result.category).toBe("");
  });
});
