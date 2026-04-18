import { describe, it, expect } from "vitest";
import { redactSecrets } from "../src/redaction.js";

describe("B5 — Secret redaction", () => {
  it("redacts an OpenAI API key (sk-proj-...)", () => {
    const input =
      "Use this key: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCD to call the API.";
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain("sk-proj-");
    expect(text).toContain("[REDACTED:OPENAI_KEY]");
    expect(hits).toContain("OPENAI_KEY");
  });

  it("redacts an Anthropic API key", () => {
    const input = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz12345678";
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain("sk-ant-");
    expect(text).toContain("[REDACTED:ANTHROPIC_KEY]");
    expect(hits).toContain("ANTHROPIC_KEY");
  });

  it("redacts a GitHub PAT", () => {
    const input = "GITHUB_TOKEN=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890";
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain("ghp_");
    expect(hits).toContain("GITHUB_PAT");
  });

  it("redacts a GitLab PAT", () => {
    const input = "token: glpat-ABCDEFGHIJKLMNOPQRSTU";
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain("glpat-");
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
    const input =
      "anthropic=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx, openai=sk-proj-yyyyyyyyyyyyyyyyyyyyyyyyyyyy";
    const { text, hits } = redactSecrets(input);
    expect(text).not.toMatch(/sk-ant-|sk-proj-/);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
