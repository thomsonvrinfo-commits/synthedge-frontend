// Rate limiting, brute-force protection, security headers, and basic CSRF
// defense for cookie-authenticated endpoints. All of this is NEW relative to
// the current Base44 system (the discovery report found none of it present) —
// Migration Master Plan Volume 2, Phase 2, Section 2.10.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * Fixed-window rate limiter backed by KV. Not perfectly precise (a fixed
 * window can allow up to 2x the limit at window boundaries) but simple,
 * cheap, and more than sufficient for login/OTP/reset endpoints — precision
 * beyond this is not worth the added complexity for this use case.
 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const current = await kv.get(windowKey);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= maxAttempts) {
    return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
  }

  await kv.put(windowKey, String(count + 1), { expirationTtl: windowSeconds + 5 });
  return { allowed: true, remaining: maxAttempts - count - 1 };
}

/**
 * Brute-force lockout: tracks consecutive failed attempts per identifier
 * (e.g. email or IP) and locks out for an escalating period. Distinct from
 * rateLimit() above — this specifically tracks FAILURES, not raw request
 * volume, and is reset on a successful attempt.
 */
export async function checkBruteForceLock(kv: KVNamespace, identifier: string): Promise<RateLimitResult> {
  const key = `bruteforce:${identifier}`;
  const raw = await kv.get(key);
  if (!raw) return { allowed: true, remaining: 5 };

  const { failures, lockedUntil } = JSON.parse(raw) as { failures: number; lockedUntil: number | null };
  if (lockedUntil && Date.now() < lockedUntil) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((lockedUntil - Date.now()) / 1000) };
  }
  return { allowed: true, remaining: Math.max(0, 5 - failures) };
}

export async function recordFailedAttempt(kv: KVNamespace, identifier: string): Promise<void> {
  const key = `bruteforce:${identifier}`;
  const raw = await kv.get(key);
  const current = raw ? (JSON.parse(raw) as { failures: number; lockedUntil: number | null }) : { failures: 0, lockedUntil: null };
  const failures = current.failures + 1;

  // Escalating lockout: 5 failures -> 5min, 10 -> 30min, 15+ -> 2hr. Temporary,
  // never permanent, so a legitimate user is never permanently locked out.
  let lockedUntil: number | null = null;
  if (failures >= 15) lockedUntil = Date.now() + 2 * 60 * 60 * 1000;
  else if (failures >= 10) lockedUntil = Date.now() + 30 * 60 * 1000;
  else if (failures >= 5) lockedUntil = Date.now() + 5 * 60 * 1000;

  await kv.put(key, JSON.stringify({ failures, lockedUntil }), { expirationTtl: 24 * 60 * 60 });
}

export async function clearFailedAttempts(kv: KVNamespace, identifier: string): Promise<void> {
  await kv.delete(`bruteforce:${identifier}`);
}

export function securityHeaders(): HeadersInit {
  return {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) {
    headers.set(key, value as string);
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Basic CSRF defense for cookie-authenticated endpoints (refresh, logout):
 * the refresh-token cookie is SameSite=Strict, which is already a strong
 * primary defense, but this Origin check is a cheap, explicit belt-and-braces
 * addition for exactly the endpoints that trust a cookie over a bearer token.
 */
export function isSameOriginRequest(request: Request, appBaseUrl: string): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients (e.g. server-to-server) won't send Origin
  try {
    return new URL(origin).origin === new URL(appBaseUrl).origin;
  } catch {
    return false;
  }
}

export function buildRefreshCookie(token: string, maxAgeSeconds: number, isProd: boolean): string {
  const secure = isProd ? '; Secure' : '';
  return `se_refresh=${token}; HttpOnly${secure}; SameSite=Strict; Path=/auth; Max-Age=${maxAgeSeconds}`;
}

export function clearRefreshCookie(isProd: boolean): string {
  const secure = isProd ? '; Secure' : '';
  return `se_refresh=; HttpOnly${secure}; SameSite=Strict; Path=/auth; Max-Age=0`;
}

export function readRefreshCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)se_refresh=([^;]+)/);
  return match ? decodeURIComponent(match[1] as string) : null;
}
