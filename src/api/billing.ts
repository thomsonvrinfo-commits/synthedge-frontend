/**
 * src/api/billing.ts
 *
 * Replaces `base44.functions.invoke("pollPaynow", ...)`. Note that
 * `initiatePaynow` is NOT included here — `PaynowCheckout.jsx`'s
 * `handlePaynow()` already calls a separate, already-deployed Cloudflare
 * Worker directly via `fetch("https://synthedge-paynow.thomsonvr-info.workers.dev/", ...)`,
 * bypassing Base44 entirely. That call is untouched by this migration — it
 * isn't a Base44 dependency and isn't part of the new unified backend either,
 * so there's nothing to swap there.
 *
 * base44 call                                          → this module
 * -------------------------------------------------------  ---------------------
 * functions.invoke("pollPaynow", { reference })            pollPaynow(reference)
 *
 * BACKEND CONTRACT ASSUMED:
 *   GET /billing/paynow/poll?reference=  -> { ok: true, activated?: boolean }
 */
import { apiClient } from "@/api/client";

export interface PollPaynowResponse {
  ok: boolean;
  activated?: boolean;
  [key: string]: unknown;
}

export async function pollPaynow(reference: string): Promise<PollPaynowResponse> {
  return apiClient.get<PollPaynowResponse>("/billing/paynow/poll", { query: { reference } });
}
