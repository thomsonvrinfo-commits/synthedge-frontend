/**
 * pollPaynow — Called by frontend on return from Paynow checkout.
 * Fetches the Paynow poll URL, verifies hash, and activates subscription if paid.
 * This is a fallback for when the webhook callback does not fire.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

async function sha512(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-512", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function parsePaynowBody(text) {
  const entries = [...new URLSearchParams(text).entries()];
  return { entries, params: Object.fromEntries(entries) };
}

async function verifyHash(entries, integrationKey) {
  const hashEntry = entries.find(([key]) => key.toLowerCase() === "hash");
  if (!hashEntry?.[1]) return false;
  const receivedHash = hashEntry[1].toUpperCase();
  let concat = "";
  for (const [key, value] of entries) {
    if (key.toLowerCase() !== "hash") concat += value;
  }
  concat += integrationKey.trim();
  const expectedHash = await sha512(concat);
  return expectedHash === receivedHash;
}

function isPaidStatus(status) {
  return ["paid", "awaiting delivery", "delivered"].includes(status?.toLowerCase() ?? "");
}

function extractUserId(reference, notes) {
  const refMatch = reference?.match(/^SE_(.+)_\d+$/);
  if (refMatch?.[1]) return refMatch[1];
  const notesMatch = notes?.match(/userId:([^|\s]+)/);
  if (notesMatch?.[1]) return notesMatch[1].trim();
  return null;
}

function computeExpiry(billingCycle, from = new Date()) {
  const d = new Date(from);
  if (billingCycle === "annual") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setDate(d.getDate() + 30);
  }
  return d;
}

async function activateSubscription(base44, opts) {
  const { userId, billingCycle, reference } = opts;
  const now = new Date();
  const expiresAt = computeExpiry(billingCycle, now).toISOString();
  const nowIso = now.toISOString();

  const subData = {
    plan: "pro",
    status: "active",
    billing_cycle: billingCycle === "annual" ? "yearly" : "monthly",
    started_at: nowIso,
    expires_at: expiresAt,
    payment_method: "paynow",
  };

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

  console.log("pollPaynow: subscription activated", { userId, reference, expiresAt });
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

    const integrationKey = Deno.env.get("PAYNOW_INTEGRATION_KEY")?.trim();
    if (!integrationKey) {
      return Response.json({ error: "Not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const { reference } = body;

    if (!reference) {
      return Response.json({ error: "Missing reference" }, { status: 400 });
    }

    // Fetch PaymentRecord
    const records = await base44.asServiceRole.entities.PaymentRecord.filter({
      transaction_reference: reference,
    });

    if (!records.length) {
      return Response.json({ error: "PaymentRecord not found" }, { status: 404 });
    }

    const record = records[0];

    // Verify the authenticated user owns this payment record (prevent IDOR)
    if (record.created_by_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Already activated — return success immediately
    if (record.status === "approved") {
      console.log("pollPaynow: already approved", { reference });
      return Response.json({ status: "already_active" });
    }

    if (!record.poll_url) {
      console.error("pollPaynow: no poll_url on record", { reference });
      return Response.json({ error: "No poll URL available" }, { status: 400 });
    }
// Fetch Paynow status via Cloudflare Worker (Base44 IPs are blocked by Paynow directly)
    const workerPollRes = await fetch("https://synthedge-paynow.thomsonvr-info.workers.dev/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poll_url: record.poll_url }),
    });

    const workerPollData = await workerPollRes.json();

    if (!workerPollData.success) {
      console.error("pollPaynow: Worker poll failed", { reference, error: workerPollData.error });
      return Response.json({ error: "Poll failed" }, { status: 503 });
    }

    const pollText = workerPollData.raw;
    const { entries, params } = parsePaynowBody(pollText);

    console.log("pollPaynow: Paynow response", {
      reference,
      status: params.status,
      paynowreference: params.paynowreference ?? null,
      fieldCount: entries.length,
    });

    const hashValid = await verifyHash(entries, integrationKey);
    if (!hashValid) {
      console.error("pollPaynow: hash verification failed", { reference });
      return Response.json({ error: "Hash verification failed" }, { status: 400 });
    }

    const paid = isPaidStatus(params.status ?? "");

    if (!paid) {
      return Response.json({ status: "not_paid", paynowStatus: params.status });
    }

    const userId = extractUserId(reference, record.notes);
    if (!userId) {
      return Response.json({ error: "Could not extract userId" }, { status: 500 });
    }

    await activateSubscription(base44, {
      userId,
      billingCycle: record.billing_cycle,
      reference,
    });

    await base44.asServiceRole.entities.PaymentRecord.update(record.id, {
      status: "approved",
      reviewed_at: new Date().toISOString(),
      notes: `${record.notes || ""} | confirmed via poll paynowref:${params.paynowreference || reference} status:${params.status}`,
    });

    return Response.json({ status: "activated" });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("pollPaynow error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
});