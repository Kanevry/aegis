// src/lib/auth.test.ts — Vitest tests for auth.ts primitives
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  hashPassphrase,
  issueSession,
  verifyPassphrase,
  verifySession,
} from "./auth";
import { createHmac } from "node:crypto";

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret-must-be-32-chars-long-ok";

/** Build a valid cookie signed with TEST_SECRET but allow swapping parts. */
function buildCookie(
  payloadBase64: string,
  secret: string = TEST_SECRET,
): string {
  const sig = createHmac("sha256", secret).update(payloadBase64).digest("hex");
  return `${payloadBase64}.${sig}`;
}

/** base64url-encode a JSON object. */
function b64urlJson(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

// ── Constant ───────────────────────────────────────────────────────────────────

describe("SESSION_COOKIE_NAME", () => {
  it('equals "aegis_session"', () => {
    expect(SESSION_COOKIE_NAME).toBe("aegis_session");
  });
});

// ── hashPassphrase + verifyPassphrase ─────────────────────────────────────────

describe("hashPassphrase + verifyPassphrase", () => {
  it("[roundtrip] correct passphrase verifies against its own hash", () => {
    const hash = hashPassphrase("correct-horse-battery-staple");
    expect(verifyPassphrase("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("[wrong] wrong passphrase returns false", () => {
    const hash = hashPassphrase("right");
    expect(verifyPassphrase("wrong", hash)).toBe(false);
  });

  it("[malformed format] non-hash string returns false", () => {
    expect(verifyPassphrase("x", "not-a-hash")).toBe(false);
  });

  it("[missing parts] truncated hash with empty key returns false", () => {
    // Three segments, last is empty — parts.length === 4 but storedKeyHex is ""
    expect(verifyPassphrase("x", "scrypt$N=16384,r=8,p=1$")).toBe(false);
  });

  it("[wrong algo prefix] bcrypt prefix returns false", () => {
    expect(verifyPassphrase("x", "bcrypt$N=16384,r=8,p=1$aa$bb")).toBe(false);
  });

  it("[invalid hex in salt] non-hex salt returns false", () => {
    // Buffer.from("zz", "hex") silently returns empty Buffer, derivedKey.length !== storedKey.length
    expect(verifyPassphrase("x", "scrypt$N=16384,r=8,p=1$zz$bb")).toBe(false);
  });

  it("[hash format] hashPassphrase returns correctly formatted string", () => {
    const hash = hashPassphrase("anything");
    expect(hash).toMatch(
      /^scrypt\$N=16384,r=8,p=1\$[0-9a-f]{32}\$[0-9a-f]{128}$/,
    );
  });

  it("[random salt] two hashes of same passphrase differ", () => {
    const h1 = hashPassphrase("same");
    const h2 = hashPassphrase("same");
    expect(h1).not.toBe(h2);
  });
});

// ── issueSession + verifySession ──────────────────────────────────────────────

describe("issueSession + verifySession", () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env["AEGIS_SESSION_SECRET"];
    process.env["AEGIS_SESSION_SECRET"] = TEST_SECRET;
  });

  afterEach(() => {
    if (savedSecret === undefined) {
      delete process.env["AEGIS_SESSION_SECRET"];
    } else {
      process.env["AEGIS_SESSION_SECRET"] = savedSecret;
    }
  });

  // ── Happy paths ──────────────────────────────────────────────────────────────

  it("[roundtrip] valid cookie decodes to correct userId and ~7-day expiry", () => {
    const cookie = issueSession("operator", TEST_SECRET);
    const result = verifySession(cookie);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.userId).toBe("operator");

    const nowMs = Date.now();
    const sevenDaysMs = 7 * 86400 * 1000;
    // expiresAt should be within ±5 seconds of now + 7 days
    expect(result.expiresAt.getTime()).toBeGreaterThan(nowMs + sevenDaysMs - 5000);
    expect(result.expiresAt.getTime()).toBeLessThan(nowMs + sevenDaysMs + 5000);
  });

  it("[custom ttl] 1-hour ttl yields expiresAt ~1h ahead", () => {
    const cookie = issueSession("op", TEST_SECRET, 3600);
    const result = verifySession(cookie);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const nowMs = Date.now();
    expect(result.expiresAt.getTime()).toBeGreaterThan(nowMs + 3595 * 1000);
    expect(result.expiresAt.getTime()).toBeLessThan(nowMs + 3605 * 1000);
  });

  // ── Null / falsy inputs ──────────────────────────────────────────────────────

  it("[null cookie] returns { valid: false }", () => {
    expect(verifySession(null)).toEqual({ valid: false });
  });

  it("[undefined cookie] returns { valid: false }", () => {
    expect(verifySession(undefined)).toEqual({ valid: false });
  });

  it("[empty string] returns { valid: false }", () => {
    expect(verifySession("")).toEqual({ valid: false });
  });

  it("[non-string] returns { valid: false }", () => {
    expect(verifySession(123 as unknown as string)).toEqual({ valid: false });
  });

  it("[no dot] cookie without separator returns { valid: false }", () => {
    expect(verifySession("noDotHere")).toEqual({ valid: false });
  });

  // ── Environment-level failures ───────────────────────────────────────────────

  it("[missing env secret] returns { valid: false } when env var absent", () => {
    const cookie = issueSession("op", TEST_SECRET);
    delete process.env["AEGIS_SESSION_SECRET"];
    expect(verifySession(cookie)).toEqual({ valid: false });
  });

  // ── Signature manipulation ───────────────────────────────────────────────────

  it("[tampered signature] flipping a hex char returns { valid: false }", () => {
    const cookie = issueSession("op", TEST_SECRET);
    const dot = cookie.lastIndexOf(".");
    const payload = cookie.slice(0, dot);
    const sig = cookie.slice(dot + 1);
    // Flip first char: '0'→'1', anything else→'0'
    const flipped = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
    expect(verifySession(`${payload}.${flipped}`)).toEqual({ valid: false });
  });

  it("[tampered payload] altering payload returns { valid: false }", () => {
    const cookie = issueSession("op", TEST_SECRET);
    const dot = cookie.lastIndexOf(".");
    const sig = cookie.slice(dot + 1);
    // Replace first base64url char to produce a different (still same-length) payload
    const payload = cookie.slice(0, dot);
    const altChar = payload[0] === "a" ? "b" : "a";
    const tampered = altChar + payload.slice(1);
    expect(verifySession(`${tampered}.${sig}`)).toEqual({ valid: false });
  });

  it("[wrong secret] signing with secret A, verifying with secret B returns { valid: false }", () => {
    const secretB = "completely-different-secret-value-here-xx";
    const cookie = issueSession("op", "secret-A-value-that-is-long-enough-here");
    // env is set to TEST_SECRET (not secret A), so HMAC won't match
    process.env["AEGIS_SESSION_SECRET"] = secretB;
    expect(verifySession(cookie)).toEqual({ valid: false });
  });

  // ── Expiry ───────────────────────────────────────────────────────────────────

  it("[expired session] negative ttl returns { valid: false }", () => {
    const cookie = issueSession("op", TEST_SECRET, -10);
    expect(verifySession(cookie)).toEqual({ valid: false });
  });

  // ── Payload-level failures ───────────────────────────────────────────────────

  it("[invalid JSON in payload] non-base64url-JSON payload returns { valid: false }", () => {
    // "not-valid-json" is not valid JSON, so JSON.parse will throw
    const payloadBase64 = Buffer.from("not-valid-json").toString("base64url");
    const cookie = buildCookie(payloadBase64);
    expect(verifySession(cookie)).toEqual({ valid: false });
  });

  it("[missing userId] payload without userId field returns { valid: false }", () => {
    const now = Math.floor(Date.now() / 1000);
    const payloadBase64 = b64urlJson({ iat: now, exp: now + 3600 });
    const cookie = buildCookie(payloadBase64);
    expect(verifySession(cookie)).toEqual({ valid: false });
  });

  it("[multiple dots — lastIndexOf] payload with embedded dot uses last dot as separator", () => {
    // Construct a cookie "part1.part2.sig" where sig is computed over "part1.part2"
    const now = Math.floor(Date.now() / 1000);
    // "junk" here is a second dot-separated segment before the real sig
    const realPayload = b64urlJson({ userId: "op", iat: now, exp: now + 3600 });
    const combined = `${realPayload}.junk`;
    // sig is over "realPayload.junk" (lastIndexOf behaviour)
    const cookie = buildCookie(combined);
    // verifySession will split at last dot: payloadBase64="realPayload.junk", sig=correctSig
    // HMAC will match but JSON.parse(base64url.decode("realPayload.junk")) will fail
    const result = verifySession(cookie);
    expect(result.valid).toBe(false);
  });
});
