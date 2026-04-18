import { describe, it, expect } from "vitest";
import { redactSecrets } from "../src/redaction.js";

// Vendor prefixes are split & joined at runtime so that test fixtures never
// appear as a literal secret in source — keeps GitHub Secret Scanning quiet
// while the redactor still exercises the full pattern at runtime.
const OPENAI_PREFIX = ["sk", "proj"].join("-") + "-";
const ANTHROPIC_PREFIX = ["sk", "ant", "api03"].join("-") + "-";
const ANTHROPIC_LEGACY_PREFIX = ["sk", "ant"].join("-") + "-";
const GITHUB_PREFIX = "ghp" + "_";
const GITLAB_PREFIX = "glpat" + "-";

describe("B5 — Secret redaction", () => {
  it("redacts an OpenAI API key (sk-proj-...)", () => {
    const input = `Use this key: ${OPENAI_PREFIX}abcdefghijklmnopqrstuvwxyz1234567890ABCD to call the API.`;
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain(OPENAI_PREFIX);
    expect(text).toContain("[REDACTED:OPENAI_KEY]");
    expect(hits).toContain("OPENAI_KEY");
  });

  it("redacts an Anthropic API key", () => {
    const input = `${ANTHROPIC_PREFIX}abcdefghijklmnopqrstuvwxyz12345678`;
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain(ANTHROPIC_LEGACY_PREFIX);
    expect(text).toContain("[REDACTED:ANTHROPIC_KEY]");
    expect(hits).toContain("ANTHROPIC_KEY");
  });

  it("redacts a GitHub PAT", () => {
    const input = `GITHUB_TOKEN=${GITHUB_PREFIX}AbCdEfGhIjKlMnOpQrStUvWxYz1234567890`;
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain(GITHUB_PREFIX);
    expect(hits).toContain("GITHUB_PAT");
  });

  it("redacts a GitLab PAT", () => {
    const input = `token: ${GITLAB_PREFIX}ABCDEFGHIJKLMNOPQRSTU`;
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain(GITLAB_PREFIX);
    expect(hits).toContain("GITLAB_PAT");
  });

  it("does not alter text with no secrets", () => {
    const input = "This is a normal benign string with no secrets.";
    const { text, hits } = redactSecrets(input);
    expect(text).toBe(input);
    expect(hits).toHaveLength(0);
  });

  it("handles empty string gracefully", () => {
    const { text, hits } = redactSecrets("");
    expect(text).toBe("");
    expect(hits).toHaveLength(0);
  });

  it("redacts multiple secrets in one string", () => {
    const input = `anthropic=${ANTHROPIC_PREFIX}xxxxxxxxxxxxxxxxxxxxxxxxxxxx, openai=${OPENAI_PREFIX}yyyyyyyyyyyyyyyyyyyyyyyyyyyy`;
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain(ANTHROPIC_LEGACY_PREFIX);
    expect(text).not.toContain(OPENAI_PREFIX);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
