import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

// Daily reconciliation: pull the last 24h of trades for every active connection
// and insert any rows the 5-minute sync missed. Dedup is handled by the sync
// functions (broker + account_id + broker_trade_id).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isAuthed = await base44.auth.isAuthenticated();
    if (isAuthed) {
      const u = await base44.auth.me();
      if (u?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const secret = Deno.env.get("CRON_SECRET");
      if (secret && body.cron_secret !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [r1, r2] = await Promise.all([
      base44.asServiceRole.functions.invoke("derivSync", { _internal: true, force_hours: 24 })
        .then(r => (r && r.data !== undefined ? r.data : r))
        .catch(e => ({ error: e?.response?.data?.error || e.message })),
      base44.asServiceRole.functions.invoke("mt5Sync", { _internal: true, force_hours: 24 })
        .then(r => (r && r.data !== undefined ? r.data : r))
        .catch(e => ({ error: e?.response?.data?.error || e.message })),
    ]);
    return Response.json({ ok: true, deriv: r1, mt5: r2 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});