// The single Brevo client used everywhere lifecycle events or transactional
// email are needed — auth (OTP/reset), lifecycle events, payment
// confirmations, subscription expiry notices.
//
// This directly retires the current system's 4-way duplicated Brevo helper
// code (discovery report Section 10.1) and the dual-path situation (direct
// Base44-to-Brevo vs. via the synthedge-lifecycle Worker) — Migration Master
// Plan Volume 1 Goal G6, Volume 3 Section 4.2/5.1.
//
// Includes one automatic retry with backoff on transient (5xx/network)
// failures (Volume 3, Section 5.1) — everything else fails soft, matching
// current behavior: a Brevo hiccup must never block signup, trade-saving, or
// any core product action.

export interface BrevoContactUpsert {
  email: string;
  attributes?: Record<string, string | number | boolean | null>;
  listIds?: number[];
}

export interface BrevoEvent {
  event: string;         // e.g. "USER_CREATED", "TRIAL_STARTED", "TRADE_CREATED"
  email: string;
  properties?: Record<string, unknown>;
  eventId?: string;       // for dedup, e.g. FIRST_REPLAY_COMPLETED
}

export interface BrevoTransactionalEmail {
  sender?: {
    email: string;
    name?: string;
  };

  to: {
    email: string;
    name?: string;
  }[];

  templateId?: number;
  subject?: string;
  htmlContent?: string;
  params?: Record<string, unknown>;
}

const BREVO_API_BASE = 'https://api.brevo.com/v3';

async function brevoFetch(
  apiKey: string,
  path: string,
  init: RequestInit,
  retriesLeft = 1
): Promise<Response> {
  const response = await fetch(`${BREVO_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }).catch((err) => {
    if (retriesLeft > 0) return null;
    throw err;
  });

  if (!response || (response.status >= 500 && retriesLeft > 0)) {
    await new Promise((r) => setTimeout(r, 500));
    return brevoFetch(apiKey, path, init, retriesLeft - 1);
  }
  if (!response) throw new Error('Brevo request failed after retry');
  return response;
}

export async function upsertBrevoContact(apiKey: string, contact: BrevoContactUpsert): Promise<void> {
  try {
    await brevoFetch(apiKey, '/contacts', {
      method: 'POST',
      body: JSON.stringify({
        email: contact.email,
        attributes: contact.attributes,
        listIds: contact.listIds,
        updateEnabled: true,
      }),
    });
  } catch (err) {
    // Fail soft, matching current behavior — a Brevo hiccup must never block a core action.
    console.error('[brevo] upsertContact failed', { email: contact.email, err: String(err) });
  }
}

export async function trackBrevoEvent(apiKey: string, evt: BrevoEvent): Promise<void> {
  try {
    await brevoFetch(apiKey, '/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: evt.event,
        identifiers: { email_id: evt.email },
        event_properties: evt.properties,
        ...(evt.eventId ? { event_id: evt.eventId } : {}),
      }),
    });
  } catch (err) {
    console.error('[brevo] trackEvent failed', { event: evt.event, email: evt.email, err: String(err) });
  }
}

/** Combined upsert + event, mirroring the current syncBrevoContactAndEvent helper. */
export async function syncBrevoContactAndEvent(
  apiKey: string,
  contact: BrevoContactUpsert,
  evt: BrevoEvent
): Promise<void> {
  await upsertBrevoContact(apiKey, contact);
  await trackBrevoEvent(apiKey, evt);
}

/**
 * Transactional email (OTP codes, password reset links). Distinct from
 * trackBrevoEvent: this actually sends an email via Brevo's transactional
 * endpoint rather than firing a marketing-automation trigger event.
 * Migration Master Plan Volume 2, Phase 2, Section 2.5 — confirm Brevo
 * template support before relying on this for production OTP delivery.
 */
export async function sendTransactionalEmail(
  apiKey: string,
  email: BrevoTransactionalEmail
): Promise<boolean> {
  try {
    const res = await brevoFetch(apiKey, "/smtp/email", {
      method: "POST",
      body: JSON.stringify(email),
    });

    const responseBody = await res.text();

    console.log("[BREVO STATUS]", res.status);
    console.log("[BREVO RESPONSE]", responseBody);

    return res.ok;
  } catch (err) {
    console.error("[brevo] sendTransactionalEmail failed", err);
    return false;
  }
}