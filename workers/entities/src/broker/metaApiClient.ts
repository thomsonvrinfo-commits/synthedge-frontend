// MetaAPI (metaapi.cloud) REST client for MT5 account provisioning and
// trade history — ported from base44/functions/connectMt5/entry.ts,
// mt5Sync/entry.ts, and disconnectBroker/entry.ts.
//
// IMPORTANT — cannot be live-tested from this environment: this sandbox's
// network egress allowlist does not include api.metaapi.cloud (confirmed:
// a direct request returns 403 from the egress proxy). As with
// derivClient.ts, this is exposed behind a MetaApiClient interface so the
// sync/mapping business logic can be fully unit-tested with a fake, while
// this real implementation needs a smoke test against a real MetaAPI
// account once deployed.
//
// Credentials (login/password/investor password) are forwarded to MetaAPI
// and never persisted — only the returned MetaAPI account id is stored in
// broker_connections.metaapi_account_id.

export interface MetaApiAccountInfo {
  currency: string;
  server?: string;
}

export interface MetaApiDeal {
  positionId?: string;
  id?: string;
  entryType?: string; // 'DEAL_ENTRY_IN' | 'DEAL_ENTRY_OUT' | 'DEAL_ENTRY_INOUT' | ...
  type?: string; // e.g. 'DEAL_TYPE_BUY'
  time?: string;
  profit?: number;
  commission?: number;
  swap?: number;
  symbol?: string;
  volume?: number;
  price?: number;
}

export interface MetaApiClient {
  provisionAccount(input: { login: string; password: string; server: string }): Promise<{ id: string }>;
  getAccountInfo(accountId: string): Promise<MetaApiAccountInfo>;
  /** Fetches all history deals in [from, to], paginating internally (mirrors mt5Sync's 30-page cap). */
  getHistoryDeals(accountId: string, from: Date, to: Date): Promise<MetaApiDeal[]>;
  deleteAccount(accountId: string): Promise<void>;
}

const METAAPI_BASE_URL = "https://api.metaapi.cloud";
const MAX_PAGES = 30;
const PAGE_SIZE = 1000;

async function metaApiRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(METAAPI_BASE_URL + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (json && typeof json === "object" && ("message" in json || "error" in json)
        ? (json as { message?: string; error?: string }).message ?? (json as { error?: string }).error
        : null) ?? `MetaAPI ${res.status}`;
    throw new Error(message);
  }
  return json;
}

export function createMetaApiClient(token: string): MetaApiClient {
  return {
    async provisionAccount({ login, password, server }) {
      const created = (await metaApiRequest(token, "POST", "/provisioning/account", {
        login,
        password,
        server,
        application: "SynthEdge",
        type: "cloud",
        version: "5",
      })) as { id: string };
      return { id: created.id };
    },

    async getAccountInfo(accountId) {
      try {
        const info = (await metaApiRequest(token, "GET", `/account/${accountId}/account-information`)) as {
          currency?: string;
          server?: string;
        };
        return { currency: info.currency ?? "USD", server: info.server };
      } catch {
        // Account info isn't always immediately available right after
        // provisioning (deployment can take a few seconds) — this mirrors
        // the legacy code's tolerant `try { } catch (_) {}`.
        return { currency: "USD" };
      }
    },

    async getHistoryDeals(accountId, from, to) {
      let deals: MetaApiDeal[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const url =
          `/account/${accountId}/history-deals` +
          `?from=${encodeURIComponent(from.toISOString())}` +
          `&to=${encodeURIComponent(to.toISOString())}` +
          `&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
        let batch: MetaApiDeal[];
        try {
          const r = (await metaApiRequest(token, "GET", url)) as MetaApiDeal[] | { trades?: MetaApiDeal[] };
          batch = Array.isArray(r) ? r : r.trades ?? [];
        } catch {
          break;
        }
        if (!batch.length) break;
        deals = deals.concat(batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return deals;
    },

    async deleteAccount(accountId) {
      try {
        await metaApiRequest(token, "DELETE", `/provisioning/account/${accountId}`);
      } catch {
        // Best-effort — mirrors legacy disconnectBroker's swallowed catch.
        // The local broker_connections row is what actually gates access;
        // a failed remote delete just leaves an orphaned MetaAPI account.
      }
    },
  };
}
