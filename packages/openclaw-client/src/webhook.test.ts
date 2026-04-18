import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "./webhook";

const SECRET = "test-secret-32-chars-minimum-len-ok";
const BODY = JSON.stringify({ type: "exec.approval.requested", approval_id: "abc" });

const validSig = createHmac("sha256", SECRET).update(BODY).digest("hex");

describe("verifyWebhookSignature", () => {
  it("accepts valid bare hex signature", () => {
    expect(verifyWebhookSignature(BODY, validSig, SECRET)).toBe(true);
  });

  it("accepts valid sha256= prefixed signature", () => {
    expect(verifyWebhookSignature(BODY, `sha256=${validSig}`, SECRET)).toBe(true);
  });

  it("rejects wrong signature", () => {
    const wrong = createHmac("sha256", "wrong-secret").update(BODY).digest("hex");
    expect(verifyWebhookSignature(BODY, wrong, SECRET)).toBe(false);
  });

  it("rejects empty header", () => {
    expect(verifyWebhookSignature(BODY, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it("rejects empty secret", () => {
    expect(verifyWebhookSignature(BODY, validSig, "")).toBe(false);
  });

  it("rejects invalid hex", () => {
    expect(verifyWebhookSignature(BODY, "not-hex-zzz", SECRET)).toBe(false);
  });

  it("rejects mismatched length", () => {
    expect(verifyWebhookSignature(BODY, "abcd", SECRET)).toBe(false);
  });

  it("verifies Buffer body input", () => {
    expect(verifyWebhookSignature(Buffer.from(BODY), validSig, SECRET)).toBe(true);
  });

  it("body tampering invalidates signature", () => {
    const tampered = BODY.replace("abc", "xyz");
    expect(verifyWebhookSignature(tampered, validSig, SECRET)).toBe(false);
  });
});
