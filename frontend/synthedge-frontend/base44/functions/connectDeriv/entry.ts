import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

// AES-GCM encryption of the Deriv API token at rest (BROKER_ENC_KEY env).
// The plaintext token is never persisted to the database.
async function aesKey() {
  const raw = Deno.env.get("BROKER_ENC_KEY");
  if (!raw) throw new Error("BROKER_ENC_KEY not set. Add it in dashboard Settings -> Environment Variables.");
  const bin = atob(raw);
  if (bin.length < 16) throw new Error("BROKER_ENC_KEY too short (need >=16 base64-decoded bytes).");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptToken(plain) {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// Validate the token by authorizing against Deriv's account WebSocket.
function derivAuthorize(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089&l=EN");
    let settled = false;
    const to = setTimeout(() => { if (!settled) { settled = true; ws.close(); reject(new Error("Deriv auth timeout")); } }, 15000);
    ws.onopen = () => ws.send(JSON.stringify({ authorize: token }));
    ws.onmessage = (e) => {
      if (settled) return;
      const m = JSON.parse(e.data);
      if (m.error) { settled = true; clearTimeout(to); ws.close(); reject(new Error(m.error.message)); return; }
      if (m.authorize) { settled = true; clearTimeout(to); ws.close(); resolve(m.authorize); }
    };
    ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject(new Error("Deriv WebSocket error")); } };
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (!body.api_token) return Response.json({ error: "Missing api_token" }, { status: 400 });

    let authInfo;
    try { authInfo = await derivAuthorize(body.api_token); }
    catch (e) { return Response.json({ error: "Deriv authentication failed: " + e.message }, { status: 400 }); }

    let encrypted;
    try { encrypted = await encryptToken(body.api_token); }
    catch (e) { return Response.json({ error: e.message }, { status: 503 }); }

    const isVirtual = authInfo.is_virtual === 1 || authInfo.is_virtual === true;
    const accountId = authInfo.loginid || authInfo.account_id;
    const accountType = isVirtual ? "demo" : "live";
    const now = new Date().toISOString();

    const existing = await base44.asServiceRole.entities.BrokerConnection.filter({
      created_by_id: user.id, broker: "deriv", account_id: accountId
    });
    if (existing.length) {
      await base44.asServiceRole.entities.BrokerConnection.update(existing[0].id, {
        status: "connected", encrypted_token: encrypted, connected_at: now,
        last_error: null, account_type: accountType
      });
      return Response.json({ ok: true, connection_id: existing[0].id, account_id: accountId, account_type: accountType });
    }
    const conn = await base44.asServiceRole.entities.BrokerConnection.create({
      created_by_id: user.id, broker: "deriv", account_id: accountId,
      account_type: accountType, status: "connected", connected_at: now,
      encrypted_token: encrypted, display_name: accountId
    });
    return Response.json({ ok: true, connection_id: conn.id, account_id: accountId, account_type: accountType });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});