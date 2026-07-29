import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

async function metaApi(token, method, path) {
  const res = await fetch("https://api.metaapi.cloud" + path, {
    method, headers: { "Authorization": "Bearer " + token }
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((json && (json.message || json.error)) || ("MetaAPI " + res.status));
  return json;
}

// Pair entry/exit deals by positionId into one BrokerTrade row.
async function syncOne(base44, conn, forceHours) {
  try {
    const token = Deno.env.get("METAAPI_TOKEN");
    if (!token) throw new Error("METAAPI_TOKEN not set");
    const now = new Date();
    const since = forceHours
      ? new Date(now.getTime() - forceHours * 3600 * 1000)
      : (conn.last_synced_at ? new Date(conn.last_synced_at) : new Date(now.getTime() - 24 * 3600 * 1000));

    let deals = [];
    let page = 0;
    while (page < 30) {
      const url = "/account/" + conn.metaapi_account_id + "/history-trades?from=" +
        encodeURIComponent(since.toISOString()) + "&to=" + encodeURIComponent(now.toISOString()) +
        "&limit=1000&offset=" + (page * 1000);
      let r;
      try { r = await metaApi(token, "GET", url); } catch (_) { break; }
      const batch = (r && (r.trades || r)) || [];
      if (!Array.isArray(batch) || !batch.length) break;
      deals = deals.concat(batch);
      if (batch.length < 1000) break;
      page++;
    }

    const byPos = {};
    for (const d of deals) {
      const pid = d.positionId || d.id;
      if (!pid) continue;
      (byPos[pid] = byPos[pid] || []).push(d);
    }
    const existing = await base44.asServiceRole.entities.BrokerTrade.filter({
      created_by_id: conn.created_by_id, broker: "mt5_exness", account_id: conn.account_id
    }, "-created_date", 5000);
    const existingIds = new Set(existing.map(t => t.broker_trade_id));
    const newTrades = [];
    for (const [pid, ds] of Object.entries(byPos)) {
      if (existingIds.has(pid)) continue;
      const inDeal = ds.find(x => x.entryType === "DEAL_ENTRY_IN" || x.entryType === "ENTRY_IN");
      const outDeal = ds.find(x => x.entryType === "DEAL_ENTRY_OUT" || x.entryType === "DEAL_ENTRY_INOUT" || x.entryType === "ENTRY_OUT");
      const any = inDeal || outDeal || ds[0];
      const typeStr = (inDeal?.type || any?.type || "").toUpperCase();
      const side = typeStr.includes("SELL") ? "sell" : "buy";
      const openedAt = inDeal?.time ? new Date(inDeal.time).toISOString() : (any?.time ? new Date(any.time).toISOString() : null);
      const closedAt = outDeal?.time ? new Date(outDeal.time).toISOString() : null;
      const pnl = Number(outDeal?.profit ?? inDeal?.profit ?? ds.reduce((s, x) => s + Number(x.profit || 0), 0));
      const fees = Number(ds.reduce((s, x) => s + Number(x.commission || 0), 0));
      const swap = Number(ds.reduce((s, x) => s + Number(x.swap || 0), 0));
      const result = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
      const duration = (inDeal?.time && outDeal?.time) ? Math.floor((new Date(outDeal.time) - new Date(inDeal.time)) / 1000) : null;
      newTrades.push({
        created_by_id: conn.created_by_id, broker: "mt5_exness", account_id: conn.account_id,
        account_type: conn.account_type, broker_trade_id: pid,
        symbol: any?.symbol || "UNKNOWN", side,
        volume: Number(inDeal?.volume ?? any?.volume ?? 0),
        entry_price: Number(inDeal?.price ?? 0), exit_price: Number(outDeal?.price ?? 0),
        opened_at: openedAt, closed_at: closedAt,
        currency: any?.currency || "USD", pnl, fees, swap,
        duration_seconds: duration, result, raw_payload: ds
      });
    }
    if (newTrades.length) await base44.asServiceRole.entities.BrokerTrade.bulkCreate(newTrades);
    await base44.asServiceRole.entities.BrokerConnection.update(conn.id, {
      last_synced_at: now.toISOString(), status: "connected", last_error: null
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
    const conns = await base44.asServiceRole.entities.BrokerConnection.filter({ broker: "mt5_exness", status: "connected" });
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