/**
 * paynowWebhook — Receives Paynow status-update callbacks (server-to-server POST).
 *
 * On successful payment:
 * 1. Verify hash (Paynow spec — field order preserved)
 * 2. PaymentRecord: pending → approved
 * 3. UserSubscription: active
 * 4. TraderProfile: subscription_plan → pro (frontend access gate)
 *
 * Returns HTTP 503 on transient failures so Paynow retries (up to 10 times).
 * Returns HTTP 200 on success and idempotent duplicates.
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

// ─── Crypto ───────────────────────────────────────────────────────────────────

async function sha512(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-512", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function parsePaynowFormBody(text) {
  const entries = [...new URLSearchParams(text).entries()];
  return { entries, params: Object.fromEntries(entries) };
}

async function verifyInboundHash(entries, integrationKey) {
  const hashEntry = entries.find(([key]) => key.toLowerCase() === "hash");
  if (!hashEntry?.[1]) {
    return { valid: false, receivedPrefix: "", expectedPrefix: "" };
  }
  const receivedHash = hashEntry[1].toUpperCase();
  let concat = "";
  for (const [key, value] of entries) {
    if (key.toLowerCase() !== "hash") {
      concat += value;
    }
  }
  concat += integrationKey.trim();
  const expectedHash = await sha512(concat);
  return {
    valid: expectedHash === receivedHash,
    receivedPrefix: receivedHash.slice(0, 12),
    expectedPrefix: expectedHash.slice(0, 12),
  };
}

function extractUserId(reference, notes) {
  const refMatch = reference?.match(/^SE_(.+)_\d+$/);
  if (refMatch?.[1]) return refMatch[1];
  const notesMatch = notes?.match(/userId:([^|\s]+)/);
  if (notesMatch?.[1]) return notesMatch[1].trim();
  return null;
}

function isPaidStatus(status) {
  if (!status) return false;
  return ["paid", "awaiting delivery", "delivered"].includes(status.toLowerCase());
}

function computeSubscriptionExpiry(billingCycle, from = new Date()) {
  const expiresAt = new Date(from);
  if (billingCycle === "annual") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 30);
  }
  return expiresAt;
}

// ─── Subscription Activation ──────────────────────────────────────────────────

async function activatePaidSubscription(base44, opts) {
  const { userId, billingCycle, paynowReference, merchantReference, paynowStatus } = opts;
  const now = new Date();
  const expiresAt = computeSubscriptionExpiry(billingCycle, now);
  const expiresIso = expiresAt.toISOString();
  const nowIso = now.toISOString();
  const isAnnual = billingCycle === "annual";

  const subData = {
    plan: "pro",
    status: "active",
    billing_cycle: isAnnual ? "yearly" : "monthly",
    started_at: nowIso,
    expires_at: expiresIso,
    payment_method: "paynow",
  };

  // Upsert UserSubscription
  const userSubs = await base44.asServiceRole.entities.UserSubscription.filter({
    created_by_id: userId,
  });
  if (userSubs.length > 0) {
    await base44.asServiceRole.entities.UserSubscription.update(userSubs[0].id, subData);
  } else {
    await base44.asServiceRole.entities.UserSubscription.create({
      ...subData,
      created_by_id: userId,
    });
  }

  // Upsert TraderProfile.subscription_plan → "pro" (frontend access gate)
  const profiles = await base44.asServiceRole.entities.TraderProfile.filter(
    { created_by_id: userId },
    "-created_date",
    1,
  );
  if (profiles.length > 0) {
    await base44.asServiceRole.entities.TraderProfile.update(profiles[0].id, {
      subscription_plan: "pro",
    });
  } else {
    await base44.asServiceRole.entities.TraderProfile.create({
      subscription_plan: "pro",
      created_by_id: userId,
    });
  }

  console.log("Payment activated", {
    userId,
    merchantReference,
    paynowReference,
    paynowStatus,
    expiresAt: expiresIso,
  });

  // Lifecycle sync to Brevo. This webhook has no user session (it's a
  // server-to-server callback from Paynow), so the user's email is looked
  // up via service role rather than trusted from the request.
  try {
    const users = await base44.asServiceRole.entities.User.filter({ id: userId });
    const email = users[0]?.email;
    if (email) {
      await syncBrevoContactAndEvent("SUBSCRIPTION_STARTED", email, {
        contactAttributes: {
          PLAN: "pro",
          SUBSCRIPTION_STATUS: "active",
          BILLING_CYCLE: subData.billing_cycle,
        },
        eventProperties: {
          plan: "pro",
          billing_cycle: subData.billing_cycle,
          started_at: nowIso,
          expires_at: expiresIso,
          payment_method: "paynow",
        },
        // Not eventId-guarded on purpose: a renewal is a legitimate
        // repeat SUBSCRIPTION_STARTED, unlike the once-ever signup events.
      });
    } else {
      console.error("paynowWebhook: could not resolve email for Brevo sync", { userId });
    }
  } catch (error) {
    // Never let a Brevo failure affect payment activation, which has
    // already succeeded by this point.
    const message = error instanceof Error ? error.message : String(error);
    console.error("paynowWebhook: Brevo sync failed", { userId, error: message });
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const OK = new Response("OK", { status: 200 });

function serviceUnavailable(reason) {
  console.error("Paynow webhook retryable:", reason);
  return new Response("Service Unavailable", { status: 503 });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const integrationKey = Deno.env.get("PAYNOW_INTEGRATION_KEY")?.trim();
    if (!integrationKey) {
      return serviceUnavailable("PAYNOW_INTEGRATION_KEY not configured");
    }

    // ===== DEBUG START =====
console.log("===== REQUEST HEADERS =====");
console.log(Object.fromEntries(req.headers.entries()));

const text = await req.text();

console.log("===== RAW BODY =====");
console.log(text);

console.log("===== BODY LENGTH =====");
console.log(text.length);

const paramsTest = new URLSearchParams(text);

console.log("===== URLSEARCHPARAMS ENTRIES =====");
console.log([...paramsTest.entries()]);

const { entries, params } = parsePaynowFormBody(text);

console.log("===== PARSED PARAMS =====");
console.log(params);

const { reference, status, paynowreference } = params;
// ===== DEBUG END =====

    console.log("Paynow webhook received", {
      reference,
      status,
      paynowreference: paynowreference ?? null,
      fieldCount: entries.length,
    });

    if (!reference) {
      console.error("Paynow webhook rejected: missing reference");
      return OK;
    }

    const hashResult = await verifyInboundHash(entries, integrationKey);
    if (!hashResult.valid) {
      console.error("Paynow webhook hash verification failed", {
        reference,
        receivedPrefix: hashResult.receivedPrefix,
        expectedPrefix: hashResult.expectedPrefix,
      });
      return OK;
    }

    const base44 = createClientFromRequest(req);

    const records = await base44.asServiceRole.entities.PaymentRecord.filter({
      transaction_reference: reference,
    });

    if (!records.length) {
      return serviceUnavailable(`PaymentRecord not found for reference ${reference}`);
    }

    const record = records[0];

    // Idempotency: already approved — re-run activation in case prior attempt failed mid-sync
    if (record.status === "approved") {
      if (isPaidStatus(status)) {
        const existingUserId = extractUserId(reference, record.notes);
        if (existingUserId) {
          await activatePaidSubscription(base44, {
            userId: existingUserId,
            billingCycle: record.billing_cycle,
            paynowReference: paynowreference || "",
            merchantReference: reference,
            paynowStatus: status ?? "",
          });
        }
      }
      console.log("Paynow webhook idempotent skip", { reference });
      return OK;
    }

    const userId = extractUserId(reference, record.notes);
    if (!userId) {
      console.error("Paynow webhook rejected: could not extract userId", {
        reference,
        notes: record.notes,
      });
      return OK;
    }

    const paid = isPaidStatus(status);
    const nowIso = new Date().toISOString();

    if (paid) {
      await activatePaidSubscription(base44, {
        userId,
        billingCycle: record.billing_cycle,
        paynowReference: paynowreference || "",
        merchantReference: reference,
        paynowStatus: status ?? "",
      });

      await base44.asServiceRole.entities.PaymentRecord.update(record.id, {
        status: "approved",
        reviewed_at: nowIso,
        notes: `${record.notes || ""} | confirmed paynowref:${paynowreference || reference} status:${status}`,
      });
    } else {
      await base44.asServiceRole.entities.PaymentRecord.update(record.id, {
        status: "rejected",
        reviewed_at: nowIso,
        notes: `${record.notes || ""} | Paynow status: ${status}`,
      });
      console.log("Paynow payment not completed", { reference, status });
    }

    return OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Paynow webhook error:", message);
    return serviceUnavailable(message);
  }
});
