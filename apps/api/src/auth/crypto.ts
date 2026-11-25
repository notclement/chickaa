import { createHash, randomBytes, randomInt } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * Argon2id, OWASP minimum profile (19 MiB, t=2, p=1). hash-wasm is WebAssembly,
 * so the server bundle needs no native modules.
 */
const ARGON = { memorySize: 19_456, iterations: 2, parallelism: 1, hashLength: 32 } as const;

export function hashSecret(secret: string): Promise<string> {
  return argon2id({ ...ARGON, password: secret, salt: randomBytes(16), outputType: 'encoded' });
}

export async function verifySecret(secret: string, encoded: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: secret, hash: encoded });
  } catch {
    return false;
  }
}

/** Pre-computed hash used to keep timing equal when a username doesn't exist. */
let dummyHash: Promise<string> | undefined;
export async function burnVerifyTime(secret: string): Promise<void> {
  dummyHash ??= hashSecret('not-a-real-password');
  await verifySecret(secret, await dummyHash);
}

/** URL-safe random token (session cookies, invite links). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are high-entropy, so a fast hash is enough for storage + lookup. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// No 0/O/1/I/L to avoid misreading when typing it back in.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** 16 chars ≈ 79 bits. Returned formatted XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCode(): { display: string; normalized: string } {
  let raw = '';
  for (let i = 0; i < 16; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return { display: raw.match(/.{4}/g)!.join('-'), normalized: raw };
}
