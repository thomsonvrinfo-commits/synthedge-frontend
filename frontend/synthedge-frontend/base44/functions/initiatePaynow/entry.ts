/**
 * initiatePaynow — Calls Cloudflare Worker server-side, saves pollurl, returns browserurl.
 *
 * Flow:
 * 1. Authenticate user
 * 2. Build signed Paynow fields
 * 3. Create pending PaymentRecord
 * 4. Call Cloudflare Worker → get browserurl + pollurl from Paynow
 * 5. Save pollurl to PaymentRecord as service role
 * 6. Return browserurl to frontend
 *
 * Initiation hash:
 * SHA512(id + reference + amount + additionalinfo + returnurl + resulturl + status + integrationKey)
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOUDFLARE_WORKER_URL = "https://synthedge-paynow.thomsonvr-info.workers.dev/";
const PAYNOW_STATUS_MESSAGE = "Message";
const PAYNOW_INIT_HASH_FIELD_ORDER = [
  "id", "reference", "amount", "additionalinfo", "returnurl", "resulturl", "status",
];

// ─── Crypto ───────────────────────────────────────────────────────────────────

async function sha512(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-512", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function buildInitiationHashInput(fields, integrationKey) {
  return PAYNOW_INIT_HASH_FIELD_ORDER.map((f) => String(fields[f] ?? "")).join("") + integrationKey.trim();
}

async function buildInitiationHash(fields, integrationKey) {
  return sha512(buildInitiationHashInput(fields, integrationKey));
}

// ─── Test Vector ──────────────────────────────────────────────────────────────

const PAYNOW_TEST_VECTOR = {
  fields: {
    id: "1201",
    reference: "TEST REF",
    amount: "99.99",
    additionalinfo: "A test ticket transaction",
    returnurl: "http://www.google.com/search?q=returnurl",
    resulturl: "http://www.google.com/search?q=resulturl",
    status: PAYNOW_STATUS_MESSAGE,
  },
  key: "3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977",
  expectedHash: "2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689",
};

let verifiedTestVector = false;
async function verifyPaynowTestVector() {
  if (verifiedTestVector) return;
  const actualHash = await buildInitiationHash(PAYNOW_TEST_VECTOR.fields, PAYNOW_TEST_VECTOR.key);
  if (actualHash !== PAYNOW_TEST_VECTOR.expectedHash) {
    throw new Error("Paynow hash self-test failed");
  }
  verifiedTestVector = true;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

const PLANS = {
  monthly: { amount: 10.0,  label: "SynthEdge Disciplined Trader - Monthly", billing_cycle: "monthly" },
  annual:  { amount: 99.0,  label: "SynthEdge Disciplined Trader - Annual",  billing_cycle: "annual"  },
};

// ─── Entry Point ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    await verifyPaynowTestVector();

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const integrationId  = Deno.env.get("PAYNOW_INTEGRATION_ID")?.trim();
    const integrationKey = Deno.env.get("PAYNOW_INTEGRATION_KEY")?.trim();
    const resultUrl      = Deno.env.get("PAYNOW_RESULT_URL")?.trim();
    const baseReturnUrl  = Deno.env.get("PAYNOW_RETURN_URL")?.trim();

    if (!integrationId || !integrationKey || !resultUrl || !baseReturnUrl) {
      return Response.json(
        { error: "Payment system not configured. Please contact support." },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const planKey = body.plan === "annual" ? "annual" : "monthly";
    const plan = PLANS[planKey];

    const reference = `SE_${user.id}_${Date.now()}`;
    const amount = plan.amount.toFixed(2);
    const returnUrl = `${baseReturnUrl}?status=success&reference=${reference}`;

    const hashFields = {
      id: integrationId,
      reference,
      amount,
      additionalinfo: plan.label,
      returnurl: returnUrl,
      resulturl: resultUrl,
      status: PAYNOW_STATUS_MESSAGE,
    };

    const hash = await buildInitiationHash(hashFields, integrationKey);
    const fields = { ...hashFields, hash };

    // Create pending PaymentRecord before calling Paynow
    const record = await base44.asServiceRole.entities.PaymentRecord.create({
      amount: plan.amount,
      currency: "USD",
      method: "paynow",
      transaction_reference: reference,
      status: "pending",
      plan: "pro",
      billing_cycle: plan.billing_cycle,
      notes: `plan:${planKey}|user:${user.email}|userId:${user.id}`,
      created_by_id: user.id,
    });

    // Call Cloudflare Worker server-side
    const workerRes = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });

    if (!workerRes.ok) {
      console.error("Cloudflare Worker error", { status: workerRes.status });
      return Response.json(
        { error: "Payment service unavailable. Please try again shortly." },
        { status: 503 },
      );
    }

    const workerData = await workerRes.json();

    console.log("Paynow initiation ready", {
      reference,
      amount,
      planKey,
      resultUrl,
      returnUrl,
      paynowStatus: workerData.status,
      hasBrowserUrl: !!workerData.browserurl,
      hasPollUrl: !!workerData.pollurl,
      hashPrefix: hash.slice(0, 12),
    });

    if (workerData?.status !== "Ok" || !workerData?.browserurl) {
      console.error("Paynow rejected initiation", { reference, raw: workerData.raw });
      return Response.json(
        { error: "Could not start Paynow checkout. Please try again." },
        { status: 502 },
      );
    }

    // Save pollurl as service role — bypasses RLS safely
    if (workerData.pollurl) {
      await base44.asServiceRole.entities.PaymentRecord.update(record.id, {
        poll_url: workerData.pollurl,
      });
      console.log("Paynow pollurl saved", { reference });
    } else {
      console.warn("Paynow did not return a pollurl", { reference });
    }

    return Response.json({
      browserurl: workerData.browserurl,
      reference,
      status: workerData.status,
    });

  } catch (error) {
    console.error("initiatePaynow error:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "Unable to initiate payment. Please try again." },
      { status: 500 },
    );
  }
});