// Minimal, dependency-free HS256 JWT implementation using Web Crypto.
// Deliberately hand-rolled rather than pulling in a library: Workers' Web Crypto
// API already supports everything needed (HMAC-SHA256), and keeping this small
// and auditable matters more than saving a few lines for a security-critical path.
//
// Migration Master Plan reference: Volume 2, Phase 2, Section 2.2 (JWT architecture).

import type { AccessTokenPayload, Role } from './types';

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    utf8Encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AccessTokenPayload = { ...payload, iat: now, exp: now + ttlSeconds };

  const headerB64 = base64UrlEncode(utf8Encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(utf8Encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, utf8Encode(signingInput));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));

  return `${signingInput}.${sigB64}`;
}

export interface VerifyResult {
  valid: boolean;
  payload?: AccessTokenPayload;
  reason?: 'malformed' | 'bad_signature' | 'expired';
}

export async function verifyAccessToken(token: string, secret: string): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const headerB64 = parts[0] as string;
  const payloadB64 = parts[1] as string;
  const sigB64 = parts[2] as string;

  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await hmacKey(secret);
  const sigBytes = base64UrlDecode(sigB64);

  const validSig = await crypto.subtle.verify('HMAC', key, sigBytes, utf8Encode(signingInput));
  if (!validSig) return { valid: false, reason: 'bad_signature' };

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return { valid: false, reason: 'expired' };

  return { valid: true, payload };
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/** Generates a cryptographically random opaque token (used for refresh tokens, OTP, reset tokens). */
export function randomOpaqueToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncode(bytes);
}

/** SHA-256 hash of a string, hex-encoded. Used to store refresh/reset/OTP tokens without keeping the raw value. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8Encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function roleFromToken(payload: AccessTokenPayload): Role {
  return payload.role;
}
