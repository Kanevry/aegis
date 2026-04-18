/**
 * scripts/auth-hash.ts — Generate a scrypt passphrase hash for Ægis auth.
 *
 * Usage:
 *   pnpm exec tsx scripts/auth-hash.ts '<passphrase>'
 *   node --experimental-strip-types scripts/auth-hash.ts '<passphrase>'
 *
 * Output: the hash string to set as AEGIS_SESSION_PASSPHRASE_HASH in .env.local
 * Format: scrypt$N=16384,r=8,p=1$<salt_hex>$<key_hex>
 */

import { scryptSync, randomBytes } from "node:crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 64;

function hashPassphrase(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt$N=16384,r=8,p=1$${salt.toString("hex")}$${key.toString("hex")}`;
}

const plaintext = process.argv[2];

if (!plaintext) {
  process.stderr.write(
    "Usage: pnpm exec tsx scripts/auth-hash.ts '<passphrase>'\n" +
    "   or: node --experimental-strip-types scripts/auth-hash.ts '<passphrase>'\n",
  );
  process.exit(1);
}

if (plaintext.length < 8) {
  process.stderr.write("Error: passphrase must be at least 8 characters.\n");
  process.exit(1);
}

const hash = hashPassphrase(plaintext);
process.stdout.write(hash + "\n");
