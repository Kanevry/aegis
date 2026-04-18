import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies an OpenClaw webhook signature using constant-time comparison.
 *
 * Expected header format: "sha256=<hex>" (GitHub-style). Accepts a bare hex string as well.
 *
 * Returns false on:
 *   - missing/empty header
 *   - invalid hex
 *   - signature length mismatch
 *   - signature mismatch
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  // Hex-decode safely; bail on invalid hex.
  if (!/^[0-9a-f]+$/i.test(provided)) return false;

  const providedBuf = Buffer.from(provided, "hex");
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}
