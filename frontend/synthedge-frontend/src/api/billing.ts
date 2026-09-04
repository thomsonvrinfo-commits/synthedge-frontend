/**
 * Paynow polling client.
 *
 * Paynow polling is handled by the existing Paynow Worker.
 * The Entities Worker is responsible for subscription/payment records.
 */

const PAYNOW_WORKER_URL =
  "https://synthedge-paynow.thomsonvr-info.workers.dev";

export interface PollPaynowResponse {
  ok: boolean;
  status?: string;
  activated?: boolean;
  reference?: string;
  error?: string;
}

export async function pollPaynow(
  reference: string
): Promise<PollPaynowResponse> {
  const response = await fetch(
    `${PAYNOW_WORKER_URL}/poll?reference=${encodeURIComponent(reference)}`,
    { method: "GET" }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error || "Unable to check Paynow payment status."
    );
  }

  return payload;
}