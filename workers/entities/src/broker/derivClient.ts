// Deriv WebSocket API client.
//
// Ported from base44/functions/connectDeriv/entry.ts (derivAuthorize) and
// derivSync/entry.ts (derivReq) — same protocol, same request shapes.
//
// IMPORTANT — cannot be live-tested from this environment: this sandbox's
// network egress allowlist does not include ws.derivws.com (confirmed: a
// direct request returns 403 from the egress proxy). The DerivClient
// interface below exists specifically so the sync/mapping business logic
// (dedup, field mapping, D1 writes) can be fully unit-tested with a fake
// implementation, while this real implementation's actual wire behavior
// needs a smoke test against a real Deriv demo account once deployed.
//
// Cloudflare Workers connect to external WebSocket servers via the
// documented `fetch()` + `Upgrade: websocket` pattern (not the `WebSocket`
// constructor) — see https://developers.cloudflare.com/workers/examples/websockets/.

export interface DerivAuthorizeResult {
  loginid: string;
  is_virtual: boolean;
}

export interface DerivTransaction {
  contract_id?: number | string;
  transaction_id?: number | string;
  purchase_time?: number;
  sell_time?: number;
  profit?: number;
  contract_type?: string;
  underlying?: string;
  shortcode?: string;
  entry_spot?: number;
  purchase?: number;
  exit_tick?: number;
  sell_price?: number;
  currency?: string;
}

export interface DerivClient {
  /** Authorizes the given API token and returns basic account info. Throws on invalid token / timeout. */
  authorize(token: string): Promise<DerivAuthorizeResult>;
  /** Fetches closed-position transactions (profit_table) between the given unix-second bounds. */
  fetchProfitTable(token: string, sinceSec: number, untilSec: number): Promise<DerivTransaction[]>;
}

const DERIV_WS_URL = "https://ws.derivws.com/websockets/v3?app_id=1089&l=EN";
const REQUEST_TIMEOUT_MS = 20000;

interface DerivMessage {
  error?: { message: string };
  authorize?: DerivAuthorizeResult;
  profit_table?: { transactions: DerivTransaction[] };
  [key: string]: unknown;
}

/** One request/response round trip over a single short-lived Deriv WS connection: authorize, then send one more request, then close. */
function derivRoundTrip(token: string, request: Record<string, unknown> | null): Promise<DerivMessage> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Deriv request timed out")));
    }, REQUEST_TIMEOUT_MS);

    fetch(DERIV_WS_URL, { headers: { Upgrade: "websocket" } })
      .then((resp) => {
        const ws = resp.webSocket;
        if (!ws) {
          finish(() => reject(new Error("Deriv WebSocket upgrade failed")));
          return;
        }
        ws.accept();

        let authed = false;
        ws.addEventListener("message", (event: MessageEvent) => {
          if (settled) return;
          let msg: DerivMessage;
          try {
            msg = JSON.parse(typeof event.data === "string" ? event.data : "");
          } catch {
            return;
          }
          if (msg.error) {
            finish(() => {
              ws.close();
              reject(new Error(msg.error!.message));
            });
            return;
          }
          if (!authed && msg.authorize) {
            authed = true;
            if (!request) {
              finish(() => {
                ws.close();
                resolve(msg);
              });
              return;
            }
            ws.send(JSON.stringify(request));
            return;
          }
          if (authed && request) {
            const key = Object.keys(request)[0];
            if (key && msg[key] !== undefined) {
              finish(() => {
                ws.close();
                resolve(msg);
              });
            }
          }
        });
        ws.addEventListener("close", () => {
          finish(() => reject(new Error("Deriv WebSocket closed before responding")));
        });
        ws.addEventListener("error", () => {
          finish(() => reject(new Error("Deriv WebSocket error")));
        });
        ws.send(JSON.stringify({ authorize: token }));
      })
      .catch((err) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))));
  });
}

export const liveDerivClient: DerivClient = {
  async authorize(token) {
    const msg = await derivRoundTrip(token, null);
    if (!msg.authorize) throw new Error("Deriv authorize response missing 'authorize'");
    return {
      loginid: msg.authorize.loginid,
      is_virtual: Boolean(msg.authorize.is_virtual),
    };
  },

  async fetchProfitTable(token, sinceSec, untilSec) {
    const msg = await derivRoundTrip(token, {
      profit_table: 1,
      date_type: "sell_time",
      sort: "ASC",
      start_date: sinceSec,
      end_date: untilSec,
      limit: 1000,
    });
    return msg.profit_table?.transactions ?? [];
  },
};
