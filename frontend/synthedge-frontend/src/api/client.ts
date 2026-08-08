/**
 * src/api/client.ts
 *
 * Thin fetch wrapper for the new Cloudflare Workers / D1 REST backend that is
 * being built in parallel. This is the ONLY module that should know how a
 * request reaches the network — every other api/*.ts module (auth.ts,
 * profile.ts, and later trades.ts / replaySessions.ts / etc.) should call
 * `apiClient.get/post/patch/put/delete` instead of using `fetch` directly.
 *
 * BACKEND CONTRACT (as assumed here — confirm with the backend team, adjust
 * this file only if the real contract differs, nothing else should need to
 * change):
 *   - Base URL comes from VITE_API_BASE_URL (e.g. "https://api.synthedge.app").
 *     Falls back to "/api" so a same-origin dev proxy also works.
 *   - Auth: JWT bearer token in `Authorization: Bearer <token>`.
 *   - All request/response bodies are JSON.
 *   - Errors are JSON: { error: string, code?: string, ...extra }.
 *
 * Token storage: a NEW localStorage key (`synthedge_access_token`) is used,
 * deliberately different from Base44's own `base44_access_token` /
 * `base44_token` keys, so the two auth systems never collide while both
 * exist side by side during the migration. Pages that still authenticate via
 * Base44 (Login/Register/ForgotPassword/ResetPassword — not yet migrated)
 * will NOT populate this key. See Phase 1 migration notes for details.
 */

const AUTH_API_URL =
  (import.meta.env?.VITE_AUTH_API_URL as string | undefined) ||
  "https://synthedge-auth.thomsonvr-info.workers.dev";

const ENTITY_API_URL =
  (import.meta.env?.VITE_ENTITY_API_URL as string | undefined) ||
  "https://synthedge-entities-production.thomsonvr-info.workers.dev";

const TOKEN_STORAGE_KEY = "synthedge_access_token";

export interface ApiErrorShape {
  status: number;
  code?: string;
  message: string;
  data?: unknown;
}

export class ApiError extends Error implements ApiErrorShape {
  status: number;
  code?: string;
  data?: unknown;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = shape.status;
    this.code = shape.code;
    this.data = shape.data;
  }
}

// ─── Token storage ──────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// ─── 401 handling ───────────────────────────────────────────────────────────
// Lets AuthContext (or anything else) react to a session being invalidated
// mid-app (e.g. expired token on a background refetch) without every caller
// having to check for it manually.

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized() {
  unauthorizedListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // never let a listener error break the request path
    }
  });
}

// ─── Core request ───────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Set false to skip attaching the Authorization header (public endpoints). */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {

  const base =
    path.startsWith("/auth") ||
    path.startsWith("/users")
      ? AUTH_API_URL
      : ENTITY_API_URL;

  const url = new URL(
    path.startsWith("http") ? path : `${base}${path}`,
    typeof window !== "undefined"
      ? window.location.origin
      : undefined
  );
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, auth = true, signal } = options;

  const headers: Record<string, string> = {};
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    signal,
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    if (res.status === 401) notifyUnauthorized();
    throw new ApiError({
      status: res.status,
      code: (data as { code?: string } | null)?.code,
      message: (data as { error?: string; message?: string } | null)?.error ||
        (data as { error?: string; message?: string } | null)?.message ||
        `Request failed with status ${res.status}`,
      data,
    });
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

export {
  AUTH_API_URL,
  ENTITY_API_URL
};
