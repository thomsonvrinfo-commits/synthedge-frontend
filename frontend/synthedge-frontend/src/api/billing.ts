/**
 * Paynow polling client.
 *
 * Paynow polling is handled by the existing Paynow Worker.
 * The Entities Worker is responsible for subscription/payment records.
 */

const PAYNOW_WORKER_URL =
  "https://synthedge-paynow.thomsonvr-info.workers.dev";

export interface PollPaynowResponse {
  success: boolean;
  status?: string | null;
  paynowreference?: string | null;
  raw?: string;
  error?: string;
}

export async function pollPaynow(
  pollUrl: string
): Promise<PollPaynowResponse> {
  const response = await fetch(`${PAYNOW_WORKER_URL}/poll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      poll_url: pollUrl,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error || "Unable to check Paynow payment status."
    );
  }

  return payload;
}
