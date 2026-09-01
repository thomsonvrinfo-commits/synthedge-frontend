import type { Env } from "@synthedge/shared";
import {
  d1First,
  d1Run,
  nowIso,
  ulid,
  activatePremium,
} from "@synthedge/shared";

import {
  PAYNOW_INITIATE_URL,
  buildInitiationHash,
  verifyInboundHash,
  isPaidStatus,
  extractUserId,
} from "./paynowCrypto";

interface PaynowEnv extends Env {
  PAYNOW_INTEGRATION_ID: string;
  PAYNOW_INTEGRATION_KEY: string;
  APP_BASE_URL: string;
  PAYNOW_RETURN_URL: string;
  PAYNOW_RESULT_URL: string;
}

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

function getAmount(plan: string): number {
  return plan === "annual" ? 99 : 10;
}

function getBillingCycle(
  plan: string,
): "monthly" | "yearly" {
  return plan === "annual" ? "yearly" : "monthly";
}

function getPeriodDays(plan: string): number {
  return plan === "annual" ? 365 : 30;
}

async function initiate(
  request: Request,
  env: PaynowEnv,
): Promise<Response> {
  const body = await request.json<{
    plan?: string;
    paymentRecordId?: string;
  }>().catch(() => null);

  if (!body?.plan || !["monthly", "annual"].includes(body.plan)) {
    return json({ success: false, error: "Invalid plan." }, 400);
  }

  if (!body.paymentRecordId) {
    return json(
      { success: false, error: "paymentRecordId is required." },
      400,
    );
  }

  const record = await d1First<{
    id: string;
    created_by_id: string;
    amount: number;
    method: string;
    status: string;
    billing_cycle: string | null;
  }>(
    env.DB,
    `SELECT id, created_by_id, amount, method, status, billing_cycle
     FROM payment_records
     WHERE id = ?`,
    body.paymentRecordId,
  );

  if (!record) {
    return json(
      { success: false, error: "Payment record not found." },
      404,
    );
  }

  if (record.status !== "pending") {
    return json(
      { success: false, error: "Payment record is not pending." },
      409,
    );
  }

  if (record.method !== "paynow") {
    return json(
      { success: false, error: "Payment record method is not Paynow." },
      400,
    );
  }

  const amount = getAmount(body.plan);
  const billingCycle = getBillingCycle(body.plan);

  if (Number(record.amount) !== amount) {
    return json(
      { success: false, error: "Payment amount does not match plan." },
      400,
    );
  }

  const reference = `SE_${record.created_by_id}_${Date.now()}`;

  const fields: Record<string, string> = {
    id: env.PAYNOW_INTEGRATION_ID,
    reference,
    amount: amount.toFixed(2),
    additionalinfo: `SynthEdge ${billingCycle} subscription`,
    returnurl: `${env.PAYNOW_RETURN_URL}?status=success&reference=${encodeURIComponent(reference)}`,
    resulturl: env.PAYNOW_RESULT_URL,
    status: "Message",
  };

  const hash = await buildInitiationHash(
    fields,
    env.PAYNOW_INTEGRATION_KEY,
  );

  const form = new URLSearchParams({
    ...fields,
    hash,
  });

  const paynowResponse = await fetch(PAYNOW_INITIATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await paynowResponse.text();

  if (!paynowResponse.ok) {
    return json(
      {
        success: false,
        error: "Paynow initiation request failed.",
      },
      502,
    );
  }

const paynow: Record<string, string> = {};
  new URLSearchParams(text).forEach((value, key) => {
    paynow[key] = value;
  });

  if (
    String(paynow.status || "").toLowerCase() !== "ok" ||
    !paynow.browserurl
  ) {
    return json(
      {
        success: false,
        error: paynow.status || "Paynow rejected the transaction.",
        paynow,
      },
      400,
    );
  }

  await d1Run(
    env.DB,
    `UPDATE payment_records
     SET transaction_reference = ?,
         updated_date = ?
     WHERE id = ?`,
    reference,
    nowIso(),
    record.id,
  );

  await d1Run(
    env.DB,
    `INSERT INTO payment_audit_log
     (id, payment_record_id, event, actor, detail, created_date)
     VALUES (?, ?, 'initiated', 'system', ?, ?)`,
    ulid(),
    record.id,
    JSON.stringify({
      reference,
      plan: body.plan,
      amount,
    }),
    nowIso(),
  );

  return json({
    success: true,
    browserurl: paynow.browserurl,
    pollurl: paynow.pollurl || null,
    reference,
    paymentRecordId: record.id,
  });
}

async function result(
  request: Request,
  env: PaynowEnv,
): Promise<Response> {
  const text = await request.text();

  const parsed = new URLSearchParams(text);
  const entries: [string, string][] = [];
  parsed.forEach((value, key) => {
    entries.push([key, value]);
  });

  const valid = await verifyInboundHash(
    entries,
    env.PAYNOW_INTEGRATION_KEY,
  );

  if (!valid) {
    return new Response("Invalid hash", { status: 400 });
  }

  const reference = parsed.get("reference") || "";
  const status = parsed.get("status") || "";
  const paynowAmount = parsed.get("amount") || "";

  if (!reference) {
    return new Response("Missing reference", { status: 400 });
  }

  const record = await d1First<{
    id: string;
    created_by_id: string;
    amount: number;
    billing_cycle: string | null;
    status: string;
  }>(
    env.DB,
    `SELECT id, created_by_id, amount, billing_cycle, status
     FROM payment_records
     WHERE transaction_reference = ?`,
    reference,
  );

  if (!record) {
    return new Response("Payment record not found", {
      status: 404,
    });
  }

  if (record.status === "approved") {
    return new Response("OK");
  }

  const now = nowIso();

  if (isPaidStatus(status)) {
    const billingCycle =
      record.billing_cycle === "annual"
        ? "yearly"
        : "monthly";

    await activatePremium(
      env,
      record.created_by_id,
      "user",
      {
        billingCycle,
        paymentMethod: "paynow",
        periodDays:
          billingCycle === "yearly" ? 365 : 30,
        paymentRecordId: record.id,
        actor: "webhook",
      },
    );

    return new Response("OK");
  }

  const normalizedStatus = status.toLowerCase();

  let dbStatus = "pending";

  if (
    normalizedStatus.includes("cancel") ||
    normalizedStatus.includes("cancelled")
  ) {
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
    record.id,
  );

  await d1Run(
    env.DB,
    `INSERT INTO payment_audit_log
     (id, payment_record_id, event, actor, detail, created_date)
     VALUES (?, ?, ?, 'webhook', ?, ?)`,
    ulid(),
    record.id,
    dbStatus,
    JSON.stringify({
      paynowStatus: status,
      amount: paynowAmount,
    }),
    now,
  );

  return new Response("OK");
}

async function poll(
  request: Request,
  env: PaynowEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference");

  if (!reference) {
    return json(
      { ok: false, error: "reference is required." },
      400,
    );
  }

  const record = await d1First<{
    id: string;
    status: string;
    transaction_reference: string | null;
  }>(
    env.DB,
    `SELECT id, status, transaction_reference
     FROM payment_records
     WHERE transaction_reference = ?`,
    reference,
  );

  if (!record) {
    return json(
      { ok: false, error: "Payment record not found." },
      404,
    );
  }

  return json({
    ok: true,
    status: record.status,
    activated: record.status === "approved",
    reference: record.transaction_reference,
  });
}

export default {
  async fetch(
    request: Request,
    env: PaynowEnv,
  ): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      const url = new URL(request.url);

      if (
        url.pathname === "/result" &&
        request.method === "POST"
      ) {
        return result(request, env);
      }

      if (
        url.pathname === "/poll" &&
        request.method === "GET"
      ) {
        return poll(request, env);
      }

      if (
        url.pathname === "/" &&
        request.method === "POST"
      ) {
        const rawBody = await request.clone().text();

let body: { action?: string } | null = null;

try {
  body = JSON.parse(rawBody);
} catch {
  body = null;
}

console.log("[paynow route]", {
  pathname: url.pathname,
  method: request.method,
  contentType: request.headers.get("content-type"),
  rawBody,
  body,
});

if (body?.action === "initiate") {
  return initiate(request, env);
}
      }

      if (url.pathname === "/health") {
        return json({
          ok: true,
          service: "paynow",
        });
      }

      return json(
        { success: false, error: "Not found" },
        404,
      );
    } catch (error) {
      console.error("[paynow]", error);

      return json(
        {
          success: false,
          error: "Internal server error",
        },
        500,
      );
    }
  },
};









