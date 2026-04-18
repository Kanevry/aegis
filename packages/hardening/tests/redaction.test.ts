import { describe, it, expect } from "vitest";
import { redactSecrets } from "../src/redaction.js";

// Vendor prefixes are split & joined at runtime so that test fixtures never
// appear as a literal secret in source — keeps GitHub Secret Scanning quiet
// while the redactor still exercises the full pattern at runtime.
const OPENAI_PREFIX = ["sk", "proj"].join("-") + "-";
const ANTHROPIC_PREFIX = ["sk", "ant", "api03"].join("-") + "-";
const ANTHROPIC_LEGACY_PREFIX = ["sk", "ant"].join("-") + "-";
const GITHUB_PREFIX = "ghp" + "_";
const GITHUB_PAT2_PREFIX = "github" + "_pat_";
const GITLAB_PREFIX = "glpat" + "-";
const SLACK_XOXB = "xoxb" + "-";
const SLACK_XOXA = "xoxa" + "-";
const SLACK_XOXP = "xoxp" + "-";
const SLACK_XOXR = "xoxr" + "-";
const SLACK_XOXS = "xoxs" + "-";
const NPM_PREFIX = "npm" + "_";
const AWS_ACCESS_PREFIX = "AKIA";

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

  // ── PEM block redaction ──────────────────────────────────────────────

  it("redacts an RSA PRIVATE KEY PEM block", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIBOQIBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const { text, hits } = redactSecrets(pem);
    expect(text).toBe("[REDACTED:PEM]");
    expect(hits).toContain("PEM");
  });

  it("redacts an EC PRIVATE KEY PEM block", () => {
    const pem = [
      "-----BEGIN EC PRIVATE KEY-----",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "-----END EC PRIVATE KEY-----",
    ].join("\n");
    const { text, hits } = redactSecrets(pem);
    expect(text).toBe("[REDACTED:PEM]");
    expect(hits).toContain("PEM");
  });

  it("redacts an OpenSSH PRIVATE KEY PEM block", () => {
    const pem = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "-----END OPENSSH PRIVATE KEY-----",
    ].join("\n");
    const { text, hits } = redactSecrets(pem);
    expect(text).toBe("[REDACTED:PEM]");
    expect(hits).toContain("PEM");
  });

  it("redacts a DSA PRIVATE KEY PEM block", () => {
    const pem = [
      "-----BEGIN DSA PRIVATE KEY-----",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "-----END DSA PRIVATE KEY-----",
    ].join("\n");
    const { text, hits } = redactSecrets(pem);
    expect(text).toBe("[REDACTED:PEM]");
    expect(hits).toContain("PEM");
  });

  it("does not redact a PEM with missing END footer", () => {
    const notPem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ].join("\n");
    const { text, hits } = redactSecrets(notPem);
    expect(text).toBe(notPem);
    expect(hits).not.toContain("PEM");
  });

  it("does not redact a PEM with missing BEGIN header", () => {
    const notPem = [
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const { text, hits } = redactSecrets(notPem);
    expect(text).toBe(notPem);
    expect(hits).not.toContain("PEM");
  });

  it("does not redact a bare PEM header with no body or footer", () => {
    const notPem = "-----BEGIN RSA PRIVATE KEY-----";
    const { text, hits } = redactSecrets(notPem);
    expect(text).toBe(notPem);
    expect(hits).not.toContain("PEM");
  });

  // ── AWS access key ───────────────────────────────────────────────────

  it("redacts a valid AWS access key (AKIA + 16 uppercase alphanum chars)", () => {
    const key = AWS_ACCESS_PREFIX + "0000000000000000";
    const { text, hits } = redactSecrets(key);
    expect(text).toBe("[REDACTED:AWS_ACCESS_KEY]");
    expect(hits).toContain("AWS_ACCESS_KEY");
  });

  it("does not redact an AWS-like key with only 15 trailing chars", () => {
    const key = AWS_ACCESS_PREFIX + "000000000000000";
    const { text, hits } = redactSecrets(key);
    expect(text).toBe(key);
    expect(hits).not.toContain("AWS_ACCESS_KEY");
  });

  it("does not redact a lowercase akia-prefixed string", () => {
    const key = "akia" + "0000000000000000";
    const { text, hits } = redactSecrets(key);
    expect(text).toBe(key);
    expect(hits).not.toContain("AWS_ACCESS_KEY");
  });

  // ── AWS secret key ───────────────────────────────────────────────────

  it("redacts an AWS secret key with = separator and no quotes", () => {
    const line = "aws_secret_access_key=" + "A".repeat(40);
    const { text, hits } = redactSecrets(line);
    expect(text).not.toContain("A".repeat(40));
    expect(hits).toContain("AWS_SECRET");
  });

  it("redacts an AWS secret key with : separator", () => {
    const line = "aws_secret_access_key: " + "A".repeat(40);
    const { text, hits } = redactSecrets(line);
    expect(text).not.toContain("A".repeat(40));
    expect(hits).toContain("AWS_SECRET");
  });

  it("redacts an AWS secret key wrapped in single quotes", () => {
    const line = "aws_secret_access_key='" + "A".repeat(40) + "'";
    const { text, hits } = redactSecrets(line);
    expect(text).not.toContain("A".repeat(40));
    expect(hits).toContain("AWS_SECRET");
  });

  it("redacts an AWS secret key wrapped in double quotes", () => {
    const line = 'aws_secret_access_key="' + "A".repeat(40) + '"';
    const { text, hits } = redactSecrets(line);
    expect(text).not.toContain("A".repeat(40));
    expect(hits).toContain("AWS_SECRET");
  });

  // ── JWT pattern ───────────────────────────────────────────────────────

  it("redacts a valid 3-segment JWT", () => {
    const header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const payload = "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFBQUFBQUFBQUEifQ";
    const sig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const jwt = `${header}.${payload}.${sig}`;
    const { text, hits } = redactSecrets(jwt);
    expect(text).toBe("[REDACTED:JWT]");
    expect(hits).toContain("JWT");
  });

  it("does not redact a 2-segment eyJ... string (no valid JWT)", () => {
    const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const part2 = "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFBQUFBQUFBQUEifQ";
    const twoSeg = `${part1}.${part2}`;
    const { text, hits } = redactSecrets(twoSeg);
    expect(text).toBe(twoSeg);
    expect(hits).not.toContain("JWT");
  });

  // ── Slack token variants ──────────────────────────────────────────────

  it("redacts a Slack xoxb- bot token", () => {
    const token = SLACK_XOXB + "AAAAAAAAAA";
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:SLACK_TOKEN]");
    expect(hits).toContain("SLACK_TOKEN");
  });

  it("redacts a Slack xoxa- token", () => {
    const token = SLACK_XOXA + "AAAAAAAAAA";
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:SLACK_TOKEN]");
    expect(hits).toContain("SLACK_TOKEN");
  });

  it("redacts a Slack xoxp- token", () => {
    const token = SLACK_XOXP + "AAAAAAAAAA";
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:SLACK_TOKEN]");
    expect(hits).toContain("SLACK_TOKEN");
  });

  it("redacts a Slack xoxr- token", () => {
    const token = SLACK_XOXR + "AAAAAAAAAA";
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:SLACK_TOKEN]");
    expect(hits).toContain("SLACK_TOKEN");
  });

  it("redacts a Slack xoxs- token", () => {
    const token = SLACK_XOXS + "AAAAAAAAAA";
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:SLACK_TOKEN]");
    expect(hits).toContain("SLACK_TOKEN");
  });

  it("does not redact a Slack-like token with a 9-char suffix (too short)", () => {
    // xox[baprs]- prefix followed by only 9 chars — below the 10-char minimum
    const token = SLACK_XOXB + "AAAAAAAAA";
    const { text, hits } = redactSecrets(token);
    expect(text).toBe(token);
    expect(hits).not.toContain("SLACK_TOKEN");
  });

  // ── NPM token ─────────────────────────────────────────────────────────

  it("redacts a valid NPM token (npm_ + 30 chars)", () => {
    const token = NPM_PREFIX + "A".repeat(30);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:NPM_TOKEN]");
    expect(hits).toContain("NPM_TOKEN");
  });

  it("redacts a long NPM token (npm_ + 100 chars)", () => {
    const token = NPM_PREFIX + "A".repeat(100);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:NPM_TOKEN]");
    expect(hits).toContain("NPM_TOKEN");
  });

  it("does not redact a short npm_-prefixed token with 29 chars (below minimum)", () => {
    const token = NPM_PREFIX + "A".repeat(29);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe(token);
    expect(hits).not.toContain("NPM_TOKEN");
  });

  // ── GitHub PAT variants ───────────────────────────────────────────────

  it("redacts a github_pat_ fine-grained GitHub PAT", () => {
    const token = GITHUB_PAT2_PREFIX + "A".repeat(30);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:GITHUB_PAT]");
    expect(hits).toContain("GITHUB_PAT");
  });

  // ── GitLab PAT boundary ───────────────────────────────────────────────

  it("redacts a GitLab PAT with exactly 20 trailing chars (minimum)", () => {
    const token = GITLAB_PREFIX + "A".repeat(20);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe("[REDACTED:GITLAB_PAT]");
    expect(hits).toContain("GITLAB_PAT");
  });

  it("does not redact a GitLab PAT with only 19 trailing chars (too short)", () => {
    const token = GITLAB_PREFIX + "A".repeat(19);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe(token);
    expect(hits).not.toContain("GITLAB_PAT");
  });

  // ── OpenAI legacy sk- variant ────────────────────────────────────────

  it("redacts a legacy OpenAI key (sk- + 40 alphanum chars)", () => {
    // NOTE: must not start with "sk-proj-" or "sk-ant-" to avoid matching those patterns first
    const key = "sk-" + "A".repeat(40);
    const { text, hits } = redactSecrets(key);
    expect(text).toBe("[REDACTED:OPENAI_KEY]");
    expect(hits).toContain("OPENAI_KEY");
  });

  it("does not redact a short sk- prefixed string with fewer than 40 chars", () => {
    const key = "sk-" + "A".repeat(5);
    const { text, hits } = redactSecrets(key);
    expect(text).toBe(key);
    expect(hits).not.toContain("OPENAI_KEY");
  });

  // ── Anthropic legacy sk-ant- variant ─────────────────────────────────

  it("redacts an Anthropic legacy key (sk-ant- + 20 chars)", () => {
    const key = ANTHROPIC_LEGACY_PREFIX + "A".repeat(20);
    const { text, hits } = redactSecrets(key);
    expect(text).toContain("[REDACTED:ANTHROPIC_KEY]");
    expect(hits).toContain("ANTHROPIC_KEY");
  });

  // ── Duplicate secret ─────────────────────────────────────────────────

  it("replaces all occurrences of a duplicate secret and reports one unique hit kind", () => {
    const token = GITHUB_PREFIX + "A".repeat(30);
    const input = `first=${token} second=${token}`;
    const { text, hits } = redactSecrets(input);
    expect(text).toBe("first=[REDACTED:GITHUB_PAT] second=[REDACTED:GITHUB_PAT]");
    expect(hits.filter((h) => h === "GITHUB_PAT")).toHaveLength(1);
  });

  // ── Overlapping / mixed patterns ──────────────────────────────────────

  it("redacts two different secret types in one line and reports both hits", () => {
    const ghToken = GITHUB_PREFIX + "A".repeat(30);
    const npmToken = NPM_PREFIX + "B".repeat(30);
    const input = `gh=${ghToken} npm=${npmToken}`;
    const { text, hits } = redactSecrets(input);
    expect(text).toContain("[REDACTED:GITHUB_PAT]");
    expect(text).toContain("[REDACTED:NPM_TOKEN]");
    expect(hits).toContain("GITHUB_PAT");
    expect(hits).toContain("NPM_TOKEN");
  });

  it("redacts three different secret types in one line and reports all three hits", () => {
    const openaiKey = OPENAI_PREFIX + "A".repeat(30);
    const ghToken = GITHUB_PREFIX + "B".repeat(30);
    const awsKey = AWS_ACCESS_PREFIX + "0".repeat(16);
    const input = `openai=${openaiKey} gh=${ghToken} aws=${awsKey}`;
    const { text, hits } = redactSecrets(input);
    expect(text).toContain("[REDACTED:OPENAI_KEY]");
    expect(text).toContain("[REDACTED:GITHUB_PAT]");
    expect(text).toContain("[REDACTED:AWS_ACCESS_KEY]");
    expect(hits).toContain("OPENAI_KEY");
    expect(hits).toContain("GITHUB_PAT");
    expect(hits).toContain("AWS_ACCESS_KEY");
  });

  // ── Case sensitivity ─────────────────────────────────────────────────

  it("does not redact uppercase GHP_ (wrong case — patterns are fixed-case)", () => {
    const token = "GHP_" + "A".repeat(30);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe(token);
    expect(hits).not.toContain("GITHUB_PAT");
  });

  it("does not redact uppercase SK-ANT-... (wrong case)", () => {
    const key = "SK-ANT-" + "A".repeat(20);
    const { text, hits } = redactSecrets(key);
    expect(text).toBe(key);
    expect(hits).not.toContain("ANTHROPIC_KEY");
  });

  it("does not redact uppercase XOXB- Slack token (wrong case)", () => {
    const token = "XOXB-" + "A".repeat(10);
    const { text, hits } = redactSecrets(token);
    expect(text).toBe(token);
    expect(hits).not.toContain("SLACK_TOKEN");
  });

  // ── Whitespace around secrets ─────────────────────────────────────────

  it("redacts a secret preceded by 'key: ' and preserves surrounding text", () => {
    const key = OPENAI_PREFIX + "A".repeat(30);
    const input = `key: ${key}`;
    const { text, hits } = redactSecrets(input);
    expect(text).toBe("key: [REDACTED:OPENAI_KEY]");
    expect(hits).toContain("OPENAI_KEY");
  });

  it("redacts a secret preceded by 'key=' and preserves surrounding text", () => {
    const key = OPENAI_PREFIX + "A".repeat(30);
    const input = `key=${key}`;
    const { text, hits } = redactSecrets(input);
    expect(text).toBe("key=[REDACTED:OPENAI_KEY]");
    expect(hits).toContain("OPENAI_KEY");
  });

  // ── Multi-line input ──────────────────────────────────────────────────

  it("redacts secrets that appear across multiple lines", () => {
    const key1 = OPENAI_PREFIX + "A".repeat(30);
    const key2 = GITHUB_PREFIX + "B".repeat(30);
    const input = `line 1: no secret\nline 2: ${key1}\r\nline 3: ${key2}\nline 4: clean`;
    const { text, hits } = redactSecrets(input);
    expect(text).toContain("[REDACTED:OPENAI_KEY]");
    expect(text).toContain("[REDACTED:GITHUB_PAT]");
    expect(text).toContain("line 1: no secret");
    expect(text).toContain("line 4: clean");
    expect(hits).toContain("OPENAI_KEY");
    expect(hits).toContain("GITHUB_PAT");
  });
});
