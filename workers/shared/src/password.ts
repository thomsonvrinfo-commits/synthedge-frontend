// Password hashing using PBKDF2-SHA256 via native Web Crypto.
// Chosen over Argon2 specifically because it requires no WASM/native dependency
// and is guaranteed to work in the Workers runtime without extra bundling risk.
// Migration Master Plan reference: Volume 2, Phase 2, Section 2.4.

const ITERATIONS = 210_000; // OWASP 2023 minimum recommendation for PBKDF2-SHA256
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;

function toBase64(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

function fromBase64(b64: string): Uint8Array {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS
  );
}

/** Returns a self-contained hash string: pbkdf2$<iterations>$<saltB64>$<hashB64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const derived = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1] as string, 10);
  const salt = fromBase64(parts[2] as string);
  const expectedHash = fromBase64(parts[3] as string);

  const derived = new Uint8Array(await deriveBits(password, salt, iterations));

  // Constant-time comparison
  if (derived.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= (derived[i] as number) ^ (expectedHash[i] as number);
  return diff === 0;
}
