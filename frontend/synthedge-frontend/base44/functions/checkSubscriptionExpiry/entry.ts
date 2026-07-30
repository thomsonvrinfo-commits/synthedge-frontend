/**
 * checkSubscriptionExpiry — Daily automated job
 * Marks subscriptions as EXPIRED when subscriptionEndDate has passed.
 * Also expires trials past their trialEndDate.
 * Must be triggered by a scheduled automation (daily).
 * Admin-only: verifies caller is admin (for manual triggers).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
  try {
    const base44 = createClientFromRequest(req);

    // Parse body for cron_secret (passed by the scheduled automation via function_args)
    const body = await req.json().catch(() => ({}));
    const cronSecret = Deno.env.get("CRON_SECRET");

    const isAuthed = await base44.auth.isAuthenticated();
    if (isAuthed) {
      // Manual trigger — require admin
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
      }
    } else {
      // Unauthenticated — must be the platform scheduler with the correct cron secret
      if (!cronSecret || body.cron_secret !== cronSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let expiredCount = 0;
    let trialExpiredCount = 0;

    // 1. Expire active UserSubscriptions past expires_at
    const activeSubs = await base44.asServiceRole.entities.UserSubscription.filter({
      status: "active",
    });

    for (const sub of activeSubs) {
      if (sub.expires_at && new Date(sub.expires_at) < now) {
        await base44.asServiceRole.entities.UserSubscription.update(sub.id, {
          status: "expired",
        });
        // Also update User entity
        const users = await base44.asServiceRole.entities.User.filter({
          id: sub.created_by_id,
        });
        if (users.length > 0 && users[0].subscriptionStatus === "ACTIVE") {
          await base44.asServiceRole.entities.User.update(users[0].id, {
            subscriptionStatus: "EXPIRED",
          });
        }
        expiredCount++;
      }
    }

    // 2. Expire TRIAL users past trialEndDate, and warn ones about to expire
    const trialUsers = await base44.asServiceRole.entities.User.filter({
      subscriptionStatus: "TRIAL",
    });

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    let trialEndingCount = 0;

    for (const u of trialUsers) {
      if (!u.trialEndDate) continue;
      const endsAt = new Date(u.trialEndDate);
      const msRemaining = endsAt.getTime() - now.getTime();

      if (msRemaining < 0) {
        // Already past trialEndDate — expire it.
        await base44.asServiceRole.entities.User.update(u.id, {
          subscriptionStatus: "EXPIRED",
        });
        trialExpiredCount++;

        if (u.email) {
          await trackBrevoEvent("TRIAL_EXPIRED", u.email, {
            subscription_status: "EXPIRED",
            trial_end_date: u.trialEndDate,
          }, { eventId: `TRIAL_EXPIRED:${u.id}` });
        }
      } else if (msRemaining <= ONE_DAY_MS) {
        // Ends within the next 24h and hasn't expired yet — this window
        // only overlaps a given user on one daily run, so a plain daily
        // cron naturally fires this once per user without needing an
        // extra "already notified" field on the User entity.
        trialEndingCount++;

        if (u.email) {
          await trackBrevoEvent("TRIAL_ENDING", u.email, {
            subscription_status: "TRIAL",
            trial_end_date: u.trialEndDate,
          }, { eventId: `TRIAL_ENDING:${u.id}` });
        }
      }
    }

    return Response.json({
      ok: true,
      expiredSubscriptions: expiredCount,
      expiredTrials: trialExpiredCount,
      trialsEnding: trialEndingCount,
      checkedAt: nowIso,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
