// MetaAPI (metaapi.cloud) REST client for MT5 account provisioning and
// trade history.
//
// Uses MetaApi's current Provisioning API and Client REST API.
// Authentication is performed with the "auth-token" header.
//
// Provisioning API:
//   POST   /users/current/accounts
//   GET    /users/current/accounts/:accountId
//   DELETE /users/current/accounts/:accountId
//
// Client API:
//   GET /users/current/accounts/:accountId/account-information
//   GET /users/current/accounts/:accountId/history-deals/time/:startTime/:endTime
//
// MetaApi client REST endpoints are region-specific.
//
// This file also safely handles non-JSON HTTP responses so intermediary
// errors such as plain-text "error code: 526" do not become misleading
// JSON.parse("Unexpected token") failures.
//
// IMPORTANT:
// - METAAPI_TOKEN is never logged or returned.
// - Existing MetaApiClient method signatures are preserved.
// - No other project files are required to change for this implementation.

export interface MetaApiAccountInfo {
  currency: string;
  server?: string;
}

export interface MetaApiDeal {
  positionId?: string;
  id?: string;
  entryType?: string;
  type?: string;
  time?: string;
  profit?: number;
  commission?: number;
  swap?: number;
  symbol?: string;
  volume?: number;
  price?: number;
}

export interface MetaApiClient {
  provisionAccount(input: {
    login: string;
    password: string;
    server: string;
  }): Promise<{ id: string }>;

  getAccountInfo(accountId: string): Promise<MetaApiAccountInfo>;

  getHistoryDeals(
    accountId: string,
    from: Date,
    to: Date
  ): Promise<MetaApiDeal[]>;

  deleteAccount(accountId: string): Promise<void>;
}

const PROVISIONING_BASE_URL =
  "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

const DEFAULT_REGION = "new-york";

const MAX_PROVISIONING_RETRIES = 2;

function clientBaseUrl(region: string): string {
  return `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
}

interface ParsedResponse {
  status: number;
  ok: boolean;
  raw: string;
  json: unknown | null;
}

interface MetaApiErrorBody {
  message?: string;
  error?: string;
  details?: unknown;
}

async function parseResponse(res: Response): Promise<ParsedResponse> {
  const raw = await res.text();

  let json: unknown | null = null;

  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }

  return {
    status: res.status,
    ok: res.ok,
    raw,
    json,
  };
}

function describeError(parsed: ParsedResponse): string {
  if (parsed.json && typeof parsed.json === "object") {
    const body = parsed.json as MetaApiErrorBody;

    if (body.message) {
      return `HTTP ${parsed.status} — ${body.message}`;
    }

    if (body.error) {
      return `HTTP ${parsed.status} — ${body.error}`;
    }
  }

  const snippet = parsed.raw.trim()
    ? parsed.raw.trim().slice(0, 500)
    : "(empty response body)";

  return `HTTP ${parsed.status} — ${snippet}`;
}

function getRetryDelayMs(res: Response, parsed: ParsedResponse): number {
  const retryAfter = res.headers.get("Retry-After");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 5000);
    }

    const retryDate = Date.parse(retryAfter);

    if (Number.isFinite(retryDate)) {
      return Math.min(
        Math.max(0, retryDate - Date.now()),
        5000
      );
    }
  }

  if (parsed.json && typeof parsed.json === "object") {
    const body = parsed.json as { message?: string };

    const match = body.message?.match(/retry(?: again)? in\s+(\d+)\s+seconds?/i);

    if (match) {
      return Math.min(Number(match[1]) * 1000, 5000);
    }
  }

  return 1000;
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function metaApiRequest(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<unknown> {
  let res: Response;

  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: {
        "auth-token": token,
        Accept: "application/json",
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(
      `MetaApi request failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const parsed = await parseResponse(res);

  if (!parsed.ok) {
    throw new Error(
      `MetaApi request failed: ${describeError(parsed)}`
    );
  }

  return parsed.json;
}

function createTransactionId(input: {
  login: string;
  server: string;
}): string {
  const material = `${input.login}:${input.server}`;

  let hash = 0x811c9dc5;

  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const seed = Math.abs(hash).toString(16).padStart(8, "0");

  return (
    `${seed}${seed}${seed}${seed}`.slice(0, 32)
  );
}

export function createMetaApiClient(token: string): MetaApiClient {
  const regionCache = new Map<string, string>();

  async function resolveRegion(accountId: string): Promise<string> {
    const cached = regionCache.get(accountId);

    if (cached) {
      return cached;
    }

    const account = (await metaApiRequest(
      PROVISIONING_BASE_URL,
      token,
      "GET",
      `/users/current/accounts/${encodeURIComponent(accountId)}`
    )) as { region?: string } | null;

    const region = account?.region;

    if (!region) {
      throw new Error(
        "MetaApi account region is unavailable; cannot determine the correct Client API endpoint"
      );
    }

    regionCache.set(accountId, region);

    return region;
  }

  return {
    async provisionAccount({ login, password, server }) {
      const transactionId = createTransactionId({
        login,
        server,
      });

      const requestBody = {
        login,
        password,
        server,
        name: login,
        platform: "mt5",
        manualTrades: true,
        magic: 0,
      };

      for (
        let attempt = 0;
        attempt <= MAX_PROVISIONING_RETRIES;
        attempt += 1
      ) {
        let res: Response;

        try {
          res = await fetch(
            `${PROVISIONING_BASE_URL}/users/current/accounts`,
            {
              method: "POST",
              headers: {
                "auth-token": token,
                "transaction-id": transactionId,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(requestBody),
            }
          );
        } catch (error) {
          throw new Error(
            `MetaApi request failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        const parsed = await parseResponse(res);

        if (res.status === 202) {
          if (attempt >= MAX_PROVISIONING_RETRIES) {
            throw new Error(
              "MetaApi account creation is still processing. Please try connecting again shortly."
            );
          }

          const delayMs = getRetryDelayMs(res, parsed);

          await wait(delayMs);

          continue;
        }

        if (!parsed.ok) {
          throw new Error(
            `MetaApi request failed: ${describeError(parsed)}`
          );
        }

        const created = parsed.json as {
          id?: string;
        } | null;

        if (!created?.id) {
          throw new Error(
            "MetaApi request failed: account creation response did not include an account id"
          );
        }

        return {
          id: created.id,
        };
      }

      throw new Error(
        "MetaApi account creation did not complete"
      );
    },

    async getAccountInfo(accountId) {
      const region = await resolveRegion(accountId);

      const info = (await metaApiRequest(
        clientBaseUrl(region),
        token,
        "GET",
        `/users/current/accounts/${encodeURIComponent(
          accountId
        )}/account-information`
      )) as {
        currency?: string;
        server?: string;
      } | null;

      return {
        currency: info?.currency ?? "USD",
        server: info?.server,
      };
    },

    async getHistoryDeals(accountId, from, to) {
      const region = await resolveRegion(accountId);

      const startTime = encodeURIComponent(
        from.toISOString()
      );

      const endTime = encodeURIComponent(
        to.toISOString()
      );

      const path =
        `/users/current/accounts/${encodeURIComponent(
          accountId
        )}/history-deals/time/${startTime}/${endTime}`;

      const deals = await metaApiRequest(
        clientBaseUrl(region),
        token,
        "GET",
        path
      );

      return Array.isArray(deals)
        ? (deals as MetaApiDeal[])
        : [];
    },

    async deleteAccount(accountId) {
      await metaApiRequest(
        PROVISIONING_BASE_URL,
        token,
        "DELETE",
        `/users/current/accounts/${encodeURIComponent(
          accountId
        )}`
      );

      regionCache.delete(accountId);
    },
  };
}
```0
