import type { Env } from "@synthedge/shared";
import { d1First, d1Run, nowIso, ulid } from "@synthedge/shared";
import { activatePremium } from "@synthedge/shared";
import {
  buildInitiationHash,
  isPaidStatus,
  verifyInboundHash,
  PAYNOW_INITIATE_URL,
} from "./paynowCrypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function getAmount(plan: "monthly" | "annual"): number {
  return plan === "annual" ? 99 : 10;
}

function getBillingCycle(plan: "monthly" | "annual"): "monthly" | "yearly" {
  return plan === "annual" ? "yearly" : "monthly";
}

interface PaymentRecordRow {
  id: string;
  created_by_id: string;
  amount: number;
  method: string;
  status: string;
  billing_cycle: string;
}

async function initiate(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as
    | { plan?: string; paymentRecordId?: string }
    | null;

  if (!body?.plan || !["monthly", "annual"].includes(body.plan)) {
    return json({ success: false, error: "Invalid plan." }, 400);
  }

  if (!body.paymentRecordId) {
    return json({ success: false, error: "paymentRecordId is required." }, 400);
  }

  const record = await d1First<PaymentRecordRow>(
    env.DB,
    `SELECT id, created_by_id, amount, method, status, billing_cycle
     FROM payment_records
     WHERE id = ?`,
    body.paymentRecordId
  );

  if (!record) {
    return json({ success: false, error: "Payment record not found." }, 404);
  }

  if (record.status !== "pending") {
    return json({ success: false, error: "Payment record is not pending." }, 409);
  }

  if (record.method !== "paynow") {
    return json({ success: false, error: "Payment record method is not Paynow." }, 400);
  }

  const plan = body.plan as "monthly" | "annual";
  const amount = getAmount(plan);
  const billingCycle = getBillingCycle(plan);

  if (Number(record.amount) !== amount) {
    return json({ success: false, error: "Payment amount does not match plan." }, 400);
  }

  const reference = `SE_${record.created_by_id}_${Date.now()}`;

  const fields: Record<string, string> = {
    id: env.PAYNOW_INTEGRATION_ID ?? "",
    reference,
    amount: amount.toFixed(2),
    additionalinfo: `SynthEdge ${billingCycle} subscription`,
    returnurl: `${env.PAYNOW_RETURN_URL}?reference=${encodeURIComponent(reference)}`,
    resulturl: env.PAYNOW_RESULT_URL ?? "",
    status: "Message",
  };

  const hash = await buildInitiationHash(fields, env.PAYNOW_INTEGRATION_KEY ?? "");

  const form = new URLSearchParams({ ...fields, hash });

  const paynowResponse = await fetch(PAYNOW_INITIATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await paynowResponse.text();

  if (!paynowResponse.ok) {
    return json({ success: false, error: "Paynow initiation request failed." }, 502);
  }

  const paynow: Record<string, string> = {};
  new URLSearchParams(text).forEach((value, key) => {
    paynow[key] = value;
  });

  if (String(paynow.status || "").toLowerCase() !== "ok" || !paynow.browserurl) {
    return json(
      { success: false, error: paynow.status || "Paynow rejected the transaction.", paynow },
      400
    );
  }

  // FIX: only the transaction_reference update remains here. No
  // payment_audit_log insert — 'initiated' was never a valid value under
  // the production CHECK constraint (created, webhook_received,
  // poll_attempted, activated, rejected). transaction_reference being
  // populated is itself sufficient evidence initiation succeeded.
  await d1Run(
    env.DB,
    `UPDATE payment_records
     SET transaction_reference = ?,
         updated_date = ?
     WHERE id = ?`,
    reference,
    nowIso(),
    record.id
  );

  return json({
    success: true,
    browserurl: paynow.browserurl,
    pollurl: paynow.pollurl || null,
    reference,
    paymentRecordId: record.id,
  });
}

interface ResultPaymentRow {
  id: string;
  created_by_id: string;
  amount: number;
  billing_cycle: string;
  status: string;
}

async function result(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  const parsed = new URLSearchParams(text);

  const entries: [string, string][] = [];
  parsed.forEach((value, key) => entries.push([key, value]));

  const valid = await verifyInboundHash(entries, env.PAYNOW_INTEGRATION_KEY ?? "");
  if (!valid) {
    return new Response("Invalid hash", { status: 400 });
  }

  const reference = parsed.get("reference") || "";
  const status = parsed.get("status") || "";
  const paynowAmount = parsed.get("amount") || "";

  if (!reference) {
    return new Response("Missing reference", { status: 400 });
  }

  const record = await d1First<ResultPaymentRow>(
    env.DB,
    `SELECT id, created_by_id, amount, billing_cycle, status
     FROM payment_records
     WHERE transaction_reference = ?`,
    reference
  );

  if (!record) {
    return new Response("Payment record not found", { status: 404 });
  }

  // Idempotency: a duplicate callback for an already-approved payment is a
  // no-op — no DB writes, no second activation.
  if (record.status === "approved") {
    return new Response("OK");
  }

  const now = nowIso();

  // FIX: every genuinely-new callback that passes hash verification gets
  // exactly one 'webhook_received' audit row — a schema-valid event value —
  // with the real Paynow status/amount in `detail` instead of the previous
  // code's bug of inserting the raw status string ('cancelled'/'failed'/
  // 'pending') directly as `event`, which ALSO violated the same CHECK
  // constraint as the original reported bug, just not yet hit in production.
  await d1Run(
    env.DB,
    `INSERT INTO payment_audit_log
     (id, payment_record_id, event, actor, detail, created_date)
     VALUES (?, ?, 'webhook_received', 'webhook', ?, ?)`,
    ulid(),
    record.id,
    JSON.stringify({ paynowStatus: status, amount: paynowAmount }),
    now
  );

  if (isPaidStatus(status)) {
    // FIX: explicit amount check, independent of hash verification, before
    // activating anything.
    if (paynowAmount && Number(paynowAmount) !== Number(record.amount)) {
      await d1Run(
        env.DB,
        `INSERT INTO payment_audit_log
         (id, payment_record_id, event, actor, detail, created_date)
         VALUES (?, ?, 'rejected', 'webhook', ?, ?)`,
        ulid(),
        record.id,
        JSON.stringify({
          reason: "amount_mismatch",
          expected: record.amount,
          received: paynowAmount,
        }),
        now
      );
      return new Response("Amount mismatch", { status: 400 });
    }

    const billingCycle = record.billing_cycle === "annual" ? "yearly" : "monthly";

    await activatePremium(env, record.created_by_id, "user", {
      billingCycle,
      paymentMethod: "paynow",
      periodDays: billingCycle === "yearly" ? 365 : 30,
      paymentRecordId: record.id,
      actor: "webhook",
    });

    return new Response("OK");
  }

  const normalizedStatus = status.toLowerCase();
  let dbStatus: "pending" | "cancelled" | "failed" = "pending";

  if (normalizedStatus.includes("cancel")) {
    dbStatus = "cancelled";
  } else if (
    normalizedStatus.includes("fail") ||
    normalizedStatus.includes("declin") ||
    normalizedStatus.includes("error")
  ) {
    dbStatus = "failed";
  }

  await d1Run(
    env.DB,
    `UPDATE payment_records
     SET status = ?, updated_date = ?
     WHERE id = ? AND status = 'pending'`,
    dbStatus,
    now,
    record.id
  );

  return new Response("OK");
}

async function poll(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference");

  if (!reference) {
    return json({ ok: false, error: "reference is required." }, 400);
  }

  const record = await d1First<{ id: string; status: string; transaction_reference: string }>(
    env.DB,
    `SELECT id, status, transaction_reference
     FROM payment_records
     WHERE transaction_reference = ?`,
    reference
  );

  if (!record) {
    return json({ ok: false, error: "Payment record not found." }, 404);
  }

  return json({
    ok: true,
    status: record.status,
    activated: record.status === "approved",
    reference: record.transaction_reference,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const url = new URL(request.url);

      if (url.pathname === "/result" && request.method === "POST") {
        return result(request, env);
      }

      if (url.pathname === "/poll" && request.method === "GET") {
        return poll(request, env);
      }

      if (url.pathname === "/" && request.method === "POST") {
        const rawBody = await request.clone().text();
        let body: { action?: string } | null = null;
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = null;
        }

        if (body?.action === "initiate") {
          return initiate(request, env);
        }
      }

      if (url.pathname === "/health") {
        return json({ ok: true, service: "paynow" });
      }

      return json({ success: false, error: "Not found" }, 404);
    } catch (error) {
      console.error("[paynow]", error);
      return json({ success: false, error: "Internal server error" }, 500);
    }
  },
};
