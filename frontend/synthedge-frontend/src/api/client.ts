/**
 * src/api/client.ts
 *
 * Central API client for SynthEdge authentication and entity requests.
 */

const AUTH_API_URL =
  (import.meta.env?.VITE_AUTH_API_URL as string | undefined) ||
  "https://auth.synthedgeapp.co.zw";

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
      // Never let a listener error break the request path.
    }
  });
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

const REFRESH_PATH = "/auth/refresh";

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Refreshes the access token using the HttpOnly se_refresh cookie.
 *
 * The refresh token itself never enters localStorage.
 * Only the newly issued short-lived access token is stored there.
 *
 * Concurrent callers share the same refresh request.
 */
async function performRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(buildUrl(REFRESH_PATH), {
          method: "POST",
          credentials: "include",
        });

        const text = await res.text();
        const data = text ? safeJsonParse(text) : null;

        if (!res.ok) {
          return null;
        }

        const token =
          (data as { accessToken?: string } | null)?.accessToken ?? null;

        if (!token) {
          return null;
        }

        setAuthToken(token);

        return token;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

/**
 * Explicitly restores the current authentication session.
 *
 * This is used during application startup so AuthContext does not have to
 * wait for an expired access token to produce a 401 before refreshing.
 *
 * If there is already a valid access token, we leave it alone.
 * If there is no token, or the stored token is expired, we use the
 * HttpOnly refresh cookie to obtain a fresh access token.
 */
export async function restoreAuthSession(): Promise<string | null> {
  const token = getAuthToken();

  if (!token) {
    return performRefresh();
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return performRefresh();
    }

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    ) as {
      exp?: number;
    };

    const now = Math.floor(Date.now() / 1000);

    if (typeof payload.exp === "number" && payload.exp <= now) {
      return performRefresh();
    }

    return token;
  } catch {
    return performRefresh();
  }
}

// ─── Core request ───────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Set false to skip attaching the Authorization header. */
  auth?: boolean;
  signal?: AbortSignal;
  /** Internal: prevents refresh loops on retry. */
  _isRetry?: boolean;
}

function buildUrl(
  path: string,
  query?: RequestOptions["query"]
): string {
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

async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    query,
    auth = true,
    signal,
    _isRetry = false,
  } = options;

  const headers: Record<string, string> = {};

  const isFormData =
    typeof FormData !== "undefined" &&
    body instanceof FormData;

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getAuthToken();

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : isFormData
          ? (body as FormData)
          : JSON.stringify(body),
    signal,
    credentials: "include",
  });

  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    /*
     * Existing mid-session protection:
     *
     * If an authenticated request receives 401, refresh the access token
     * once and retry the original request.
     */
    if (
      res.status === 401 &&
      auth &&
      !_isRetry &&
      path !== REFRESH_PATH &&
      path !== "/auth/login"
    ) {
      const newToken = await performRefresh();

      if (newToken) {
        return request<T>(path, {
          ...options,
          _isRetry: true,
        });
      }
    }

    if (res.status === 401) {
      notifyUnauthorized();
    }

    throw new ApiError({
      status: res.status,
      code: (data as { code?: string } | null)?.code,
      message:
        (data as { error?: string; message?: string } | null)?.error ||
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
  get: <T>(
    path: string,
    options?: Omit<RequestOptions, "method" | "body">
  ) =>
    request<T>(path, {
      ...options,
      method: "GET",
    }),

  post: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">
  ) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body,
    }),

  patch: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">
  ) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body,
    }),

  put: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">
  ) =>
    request<T>(path, {
      ...options,
      method: "PUT",
      body,
    }),

  delete: <T>(
    path: string,
    options?: Omit<RequestOptions, "method" | "body">
  ) =>
    request<T>(path, {
      ...options,
      method: "DELETE",
    }),
};

export {
  AUTH_API_URL,
  ENTITY_API_URL,
};