import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

// Decrypt helper (BROKER_ENC_KEY env) — only the scheduled sync needs the token.
async function aesKey() {
  const raw = Deno.env.get("BROKER_ENC_KEY");
  if (!raw) throw new Error("BROKER_ENC_KEY not set");
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptToken(b64) {
  const key = await aesKey();
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const iv = arr.slice(0, 12);
  const ct = arr.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(dec);
}

// Send an authorized Deriv WS request and resolve the matching response.
function derivReq(token, reqObj) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089&l=EN");
    let settled = false, authed = false;
    const to = setTimeout(() => { if (!settled) { settled = true; ws.close(); reject(new Error("Deriv timeout")); } }, 30000);
    const key = Object.keys(reqObj)[0];
    ws.onopen = () => ws.send(JSON.stringify({ authorize: token }));
    ws.onmessage = (e) => {
      if (settled) return;
      const m = JSON.parse(e.data);
      if (m.error) { settled = true; clearTimeout(to); ws.close(); reject(new Error(m.error.message)); return; }
      if (!authed && m.authorize) { authed = true; ws.send(JSON.stringify(reqObj)); return; }
      if (m[key] !== undefined) { settled = true; clearTimeout(to); ws.close(); resolve(m); }
    };
    ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject(new Error("Deriv WebSocket error")); } };
  });
}

async function syncOne(base44, conn, forceHours) {
  try {
    const token = await decryptToken(conn.encrypted_token);
    const nowSec = Math.floor(Date.now() / 1000);
    const since = forceHours
      ? nowSec - forceHours * 3600
      : (conn.last_synced_at ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) : nowSec - 30 * 86400);
    const resp = await derivReq(token, {
      profit_table: 1, date_type: "sell_time", sort: "ASC",
      start_date: since, end_date: nowSec, limit: 1000
    });
    const txns = resp?.profit_table?.transactions || [];
    if (!txns.length) {
      await base44.asServiceRole.entities.BrokerConnection.update(conn.id, {
        last_synced_at: new Date().toISOString(), status: "connected", last_error: null
      });
      return { synced: 0 };
    }
    // Dedup by broker + account_id + broker_trade_id (unique constraint enforced in code).
    const existing = await base44.asServiceRole.entities.BrokerTrade.filter({
      created_by_id: conn.created_by_id, broker: "deriv", account_id: conn.account_id
    }, "-created_date", 5000);
    const existingIds = new Set(existing.map(t => t.broker_trade_id));
    const newTrades = [];
    for (const t of txns) {
      const id = String(t.contract_id ?? t.transaction_id);
      if (existingIds.has(id)) continue;
      const openedAt = t.purchase_time ? new Date(t.purchase_time * 1000).toISOString() : null;
      const closedAt = t.sell_time ? new Date(t.sell_time * 1000).toISOString() : null;
      const pnl = Number(t.profit ?? 0);
      const duration = (t.purchase_time && t.sell_time) ? (t.sell_time - t.purchase_time) : null;
      const result = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
      const side = t.contract_type === "PUT" ? "sell" : "buy";
      newTrades.push({
        created_by_id: conn.created_by_id,
        broker: "deriv", account_id: conn.account_id, account_type: conn.account_type,
        broker_trade_id: id, symbol: t.underlying || t.shortcode || "UNKNOWN", side,
        volume: 1,
        entry_price: Number(t.entry_spot ?? t.purchase ?? 0),
        exit_price: Number(t.exit_tick ?? t.sell_price ?? 0),
        opened_at: openedAt, closed_at: closedAt,
        currency: t.currency || "USD", pnl, fees: 0, swap: 0,
        duration_seconds: duration, result, raw_payload: t
      });
    }
    if (newTrades.length) await base44.asServiceRole.entities.BrokerTrade.bulkCreate(newTrades);
    await base44.asServiceRole.entities.BrokerConnection.update(conn.id, {
      last_synced_at: new Date().toISOString(), status: "connected", last_error: null
    });
    return { synced: newTrades.length };
  } catch (e) {
    await base44.asServiceRole.entities.BrokerConnection.update(conn.id, {
      status: "error", last_error: e.message
    });
    return { synced: 0, error: e.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isAuthed = await base44.auth.isAuthenticated();
    if (body._internal) {
      // invoked by reconcileTrades (service role) — trusted
    } else if (isAuthed) {
      const u = await base44.auth.me();
      if (u?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const secret = Deno.env.get("CRON_SECRET");
      if (secret && body.cron_secret !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const conns = await base44.asServiceRole.entities.BrokerConnection.filter({ broker: "deriv", status: "connected" });
    let total = 0, errors = 0;
    for (const c of conns) {
      const r = await syncOne(base44, c, body.force_hours);
      total += r.synced || 0;
      if (r.error) errors++;
    }
    return Response.json({ ok: true, processed: conns.length, synced: total, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});