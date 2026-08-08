// AES-GCM encryption for broker credentials at rest (Deriv API tokens).
// Ported directly from base44/functions/connectDeriv/entry.ts and
// derivSync/entry.ts — same algorithm, same env var name (BROKER_ENC_KEY),
// same wire format (iv || ciphertext, base64), so a key generated for the
// old system would decrypt tokens encrypted by this one and vice versa.
//
// The plaintext token is NEVER persisted — only this module ever sees it,
// and only for the duration of a single request.

async function importKey(env: { BROKER_ENC_KEY?: string }): Promise<CryptoKey> {
  const raw = env.BROKER_ENC_KEY;
  if (!raw) {
    throw new Error("BROKER_ENC_KEY not set. Run: wrangler secret put BROKER_ENC_KEY");
  }
  const bin = atob(raw);
  if (bin.length < 16) {
    throw new Error("BROKER_ENC_KEY too short (need >=16 base64-decoded bytes, recommend 32).");
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(env: { BROKER_ENC_KEY?: string }, plain: string): Promise<string> {
  const key = await importKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  let binary = "";
  for (const byte of combined) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function decryptToken(env: { BROKER_ENC_KEY?: string }, encoded: string): Promise<string> {
  const key = await importKey(env);
  const bin = atob(encoded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}
