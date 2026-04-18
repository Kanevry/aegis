import { describe, it, expect } from "vitest";
import { detectPersonalInfoQuery } from "../src/pii.js";

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
