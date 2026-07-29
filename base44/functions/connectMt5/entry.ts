import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

// MetaAPI REST helper. Credentials (login/server/investor password) are forwarded
// here and never persisted — only the returned MetaAPI account reference is stored.
async function metaApi(token, method, path, body) {
  const res = await fetch("https://api.metaapi.cloud" + path, {
    method,
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((json && (json.message || json.error)) || ("MetaAPI " + res.status));
  return json;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (!body.login || !body.password || !body.server)
      return Response.json({ error: "Missing login, password, or server" }, { status: 400 });
    const token = Deno.env.get("METAAPI_TOKEN");
    if (!token) return Response.json({ error: "METAAPI_TOKEN not set. Add it in dashboard Settings -> Environment Variables." }, { status: 503 });

    const created = await metaApi(token, "POST", "/provisioning/account", {
      login: String(body.login), password: body.password, server: body.server,
      application: "SynthEdge", type: "cloud", version: "5"
    });
    const accountId = created.id;

    let currency = "USD", isDemo = false;
    try {
      const info = await metaApi(token, "GET", "/account/" + accountId + "/account-information");
      currency = info.currency || "USD";
      isDemo = ((info.server || "") + (body.server || "")).toLowerCase().includes("demo");
    } catch (_) {}
    const accountType = isDemo ? "demo" : "live";
    const now = new Date().toISOString();

    const existing = await base44.asServiceRole.entities.BrokerConnection.filter({
      created_by_id: user.id, broker: "mt5_exness", account_id: String(body.login)
    });
    if (existing.length) {
      await base44.asServiceRole.entities.BrokerConnection.update(existing[0].id, {
        status: "connected", metaapi_account_id: accountId, connected_at: now,
        last_error: null, account_type: accountType, server: body.server
      });
      return Response.json({ ok: true, connection_id: existing[0].id });
    }
    const conn = await base44.asServiceRole.entities.BrokerConnection.create({
      created_by_id: user.id, broker: "mt5_exness", account_id: String(body.login),
      account_type: accountType, status: "connected", connected_at: now,
      metaapi_account_id: accountId, display_name: body.login + " (" + body.server + ")", server: body.server
    });
    return Response.json({ ok: true, connection_id: conn.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});