// src/lib/auth.ts — Ægis passphrase auth + HMAC-signed session primitives
// No third-party crypto dependencies — uses Node stdlib only.

import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

export const SESSION_COOKIE_NAME = "aegis_session" as const;
export const DEMO_USER_ID = "operator" as const;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 64;

export function isDemoAuthDisabled(): boolean {
  return process.env["AEGIS_DEMO_DISABLE_AUTH"] === "true";
}

// ── Hash format: scrypt$N=16384,r=8,p=1$<salt_hex>$<key_hex> ─────────────────

/**
 * Verifies a plaintext passphrase against a stored scrypt hash string.
 * Hash format: `scrypt$N=16384,r=8,p=1$<salt_hex>$<key_hex>`
 * Uses `timingSafeEqual` to prevent timing attacks.
 */
export function verifyPassphrase(plain: string, hashString: string): boolean {
  const parts = hashString.split("$");
  // parts[0] = "scrypt", parts[1] = "N=16384,r=8,p=1", parts[2] = salt_hex, parts[3] = key_hex
  if (parts.length !== 4 || parts[0] !== "scrypt") {
    return false;
  }

  const saltHex = parts[2];
  const storedKeyHex = parts[3];

  if (!saltHex || !storedKeyHex) {
    return false;
  }

  let salt: Buffer;
  let storedKey: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    storedKey = Buffer.from(storedKeyHex, "hex");
  } catch {
    return false;
  }

  let derivedKey: Buffer;
  try {
    derivedKey = scryptSync(plain, salt, KEY_LEN, SCRYPT_PARAMS);
  } catch {
    return false;
  }

  if (derivedKey.length !== storedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedKey);
}

/**
 * Generates a scrypt hash string for a given passphrase.
 * Returns: `scrypt$N=16384,r=8,p=1$<salt_hex>$<key_hex>`
 */
export function hashPassphrase(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt$N=16384,r=8,p=1$${salt.toString("hex")}$${key.toString("hex")}`;
}

// ── Session payload ───────────────────────────────────────────────────────────

interface SessionPayload {
  userId: string;
  iat: number;
  exp: number;
}

/**
 * Issues a signed session cookie value.
 * Format: `<base64url(JSON(payload))>.<hmacSha256Hex>`
 * Dot-separated to avoid base64 character collisions.
 */
export function issueSession(
  userId: string,
  secret: string,
  ttlSeconds = 7 * 86400,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    userId,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("hex");

  return `${payloadBase64}.${sig}`;
}

/**
 * Verifies a session cookie value.
 * Returns the decoded claim on success, or `{ valid: false }` on any failure.
 * Uses `timingSafeEqual` for HMAC comparison.
 */
export function verifySession(
  cookie: string | null | undefined,
):
  | { valid: true; userId: string; expiresAt: Date }
  | { valid: false } {
  if (isDemoAuthDisabled()) {
    return {
      valid: true,
      userId: DEMO_USER_ID,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
    };
  }

  if (!cookie || typeof cookie !== "string") {
    return { valid: false };
  }

  const dotIndex = cookie.lastIndexOf(".");
  if (dotIndex === -1) {
    return { valid: false };
  }

  const payloadBase64 = cookie.slice(0, dotIndex);
  const providedSig = cookie.slice(dotIndex + 1);

  // Read secret at call-time so it doesn't need to be loaded at module init
  const secret = process.env["AEGIS_SESSION_SECRET"];
  if (!secret) {
    return { valid: false };
  }

  const expectedSig = createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("hex");

  // Constant-time comparison — both buffers must be same length for timingSafeEqual
  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    // Lengths differ → use dummy compare to avoid timing leak, then return false
    timingSafeEqual(expectedBuf, expectedBuf);
    return { valid: false };
  }

  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false };
  }

  let payload: SessionPayload;
  try {
    const json = Buffer.from(payloadBase64, "base64url").toString("utf8");
    payload = JSON.parse(json) as SessionPayload;
  } catch {
    return { valid: false };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) {
    return { valid: false };
  }

  if (!payload.userId || typeof payload.userId !== "string") {
    return { valid: false };
  }

  return {
    valid: true,
    userId: payload.userId,
    expiresAt: new Date(payload.exp * 1000),
  };
}
