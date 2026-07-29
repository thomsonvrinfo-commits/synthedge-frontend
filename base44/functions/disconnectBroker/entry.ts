import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

// Callable: verifies the caller owns the connection, revokes the stored
// credential (Deriv token cleared / MetaAPI account deleted), and marks
// status "disconnected". Synced trades are retained.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (!body.connection_id) return Response.json({ error: "Missing connection_id" }, { status: 400 });

    const conn = await base44.asServiceRole.entities.BrokerConnection.get(body.connection_id);
    if (!conn) return Response.json({ error: "Not found" }, { status: 404 });
    if (conn.created_by_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

    if (conn.broker === "mt5_exness" && conn.metaapi_account_id) {
      const token = Deno.env.get("METAAPI_TOKEN");
      if (token) {
        try {
          await fetch("https://api.metaapi.cloud/provisioning/account/" + conn.metaapi_account_id, {
            method: "DELETE", headers: { "Authorization": "Bearer " + token }
          });
        } catch (_) {}
      }
    }
    await base44.asServiceRole.entities.BrokerConnection.update(conn.id, {
      status: "disconnected", encrypted_token: null, metaapi_account_id: null, last_error: null
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});