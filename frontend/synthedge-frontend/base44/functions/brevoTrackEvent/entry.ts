/**
 * brevoTrackEvent — the ONLY Brevo-related function the frontend is
 * allowed to call directly. It never receives or exposes BREVO_API_KEY;
 * it just authenticates the caller, enriches the payload server-side
 * (trade counts, "is this the user's first replay" etc.), and delegates
 * to the shared brevoService.
 *
 * Frontend usage:
 *   base44.functions.invoke("brevoTrackEvent", { event: "TRADE_CREATED" })
 *   base44.functions.invoke("brevoTrackEvent", { event: "REPLAY_COMPLETED" })
 *
 * The frontend never needs to pass email, user id, or counts — those are
 * derived here from the authenticated session and the entities tables,
 * which keeps the enrichment logic in one place instead of copy-pasted
 * into every component that fires an event.
 *
 * Supported `event` values from the frontend today:
 *  - TRADE_CREATED        fired right after a Trade is saved
 *  - REPLAY_COMPLETED     fired right after a ReplaySession is marked
 *                          completed; this function decides whether it's
 *                          the user's FIRST completed replay and, if so,
 *                          forwards it to Brevo as FIRST_REPLAY_COMPLETED
 *                          (subsequent replays are recorded in Brevo
 *                          contact attributes but do not re-fire the
 *                          activation event).
 *
 * New events can be added by extending the switch below — the frontend
 * call site never has to change its shape.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

/**
 * --- Brevo integration helpers ---
 * NOTE: Base44 functions can't import across function directories (each
 * function is bundled in isolation), so this block is intentionally
 * duplicated in every function that talks to Brevo (initUserTrial,
 * paynowWebhook, checkSubscriptionExpiry, brevoTrackEvent) rather than
 * imported from a shared module. If you change the Brevo logic, update
 * it in all four places.
 *
 * Fault tolerant by design: every helper catches its own errors and
 * resolves to { ok:false, ... } instead of throwing, so a Brevo outage
 * never breaks signup, replay, trading, or billing.
 */
const BREVO_API_BASE = "https://api.brevo.com/v3";

function getBrevoApiKey() {
  const key = Deno.env.get("BREVO_API_KEY");
  if (!key) {
    console.error("brevo: BREVO_API_KEY not configured — skipping Brevo call");
  }
  return key;
}

async function brevoFetch(path, options = {}) {
  const apiKey = getBrevoApiKey();
  if (!apiKey) return { ok: false, skipped: true, reason: "no_api_key" };

  try {
    const res = await fetch(`${BREVO_API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
        ...(options.headers || {}),
      },
    });

    const raw = await res.text();
    let body = null;
    if (raw) {
      try { body = JSON.parse(raw); } catch { body = raw; }
    }

    if (!res.ok) {
      console.error("brevo: API error", { path, status: res.status, body });
      return { ok: false, status: res.status, body };
    }
    return { ok: true, status: res.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("brevo: request failed", { path, error: message });
    return { ok: false, error: message };
  }
}

async function upsertBrevoContact(email, attributes = {}, listIds) {
  if (!email) {
    console.error("brevo.upsertContact: missing email — skipping");
    return { ok: false, reason: "missing_email" };
  }
  const payload = { email, attributes, updateEnabled: true };
  if (listIds?.length) payload.listIds = listIds;
  return brevoFetch("/contacts", { method: "POST", body: JSON.stringify(payload) });
}

async function trackBrevoEvent(eventName, email, properties = {}, opts = {}) {
  if (!eventName || !email) {
    console.error("brevo.trackUserEvent: missing eventName or email — skipping", { eventName, email });
    return { ok: false, reason: "missing_required_field" };
  }
  const payload = {
    event_name: eventName,
    identifiers: { email_id: email },
    event_properties: properties,
  };
  if (opts.eventId) payload.event_id = opts.eventId;
  if (opts.contactAttributes) payload.contact_properties = opts.contactAttributes;

  const result = await brevoFetch("/events", { method: "POST", body: JSON.stringify(payload) });
  console.log("brevo.trackUserEvent", { eventName, email, ok: result.ok });
  return result;
}

async function syncBrevoContactAndEvent(eventName, email, opts = {}) {
  const { contactAttributes = {}, eventProperties = {}, listIds, eventId } = opts;
  const contactResult = await upsertBrevoContact(email, contactAttributes, listIds);
  const eventResult = await trackBrevoEvent(eventName, email, eventProperties, { eventId, contactAttributes });
  return { contactResult, eventResult };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { event, properties = {} } = body;

    if (!event) {
      return Response.json({ error: "Missing 'event'" }, { status: 400 });
    }

    const email = user.email;
    if (!email) {
      // Shouldn't happen for an authenticated user, but never break the
      // caller's flow over a missing email — just skip the Brevo sync.
      console.error("brevoTrackEvent: authenticated user has no email", { userId: user.id });
      return Response.json({ ok: true, skipped: true, reason: "no_email" });
    }

    let result;

    switch (event) {
      case "TRADE_CREATED": {
        const trades = await base44.entities.Trade.filter({ created_by_id: user.id });
        const tradeCount = trades.length;

        result = await syncBrevoContactAndEvent("TRADE_CREATED", email, {
          contactAttributes: { LAST_TRADE_DATE: new Date().toISOString(), TRADE_COUNT: tradeCount },
          eventProperties: {
            trade_count: tradeCount,
            date: new Date().toISOString(),
            ...properties,
          },
        });
        break;
      }

      case "REPLAY_COMPLETED": {
        const completedSessions = await base44.entities.ReplaySession.filter({
          created_by_id: user.id,
          status: "completed",
        });
        const replayCount = completedSessions.length;
        const isFirst = replayCount <= 1; // this replay was just marked completed by the caller

        if (isFirst) {
          result = await syncBrevoContactAndEvent("FIRST_REPLAY_COMPLETED", email, {
            contactAttributes: { FIRST_REPLAY_DATE: new Date().toISOString() },
            eventProperties: {
              replay_date: new Date().toISOString(),
              replay_count: replayCount,
              ...properties,
            },
            eventId: `FIRST_REPLAY_COMPLETED:${user.id}`,
          });
        } else {
          // Not the first — just keep the contact's replay count fresh,
          // no activation event re-fired.
          result = await trackBrevoEvent("REPLAY_COMPLETED", email, {
            replay_count: replayCount,
            ...properties,
          });
        }
        break;
      }

      default: {
        // Future-proof: unknown-but-well-formed events still get relayed
        // as a generic Brevo event rather than rejected, so new event
        // names can be wired up from the frontend without a backend
        // deploy every time.
        result = await trackBrevoEvent(event, email, properties);
      }
    }

    return Response.json({ ok: true, event, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("brevoTrackEvent error:", message);
    // Never surface this as a hard failure to the caller — the calling
    // page already saved the trade/session; a Brevo hiccup shouldn't
    // show the user an error toast.
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
});
