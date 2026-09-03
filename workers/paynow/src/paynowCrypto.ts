export const PAYNOW_INITIATE_URL = "https://www.paynow.co.zw/interface/initiatetransaction";

export const PAYNOW_PAID_STATUSES = new Set([
  "paid",
  "awaiting delivery",
  "delivered",
]);

async function sha512(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-512", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function buildInitiationHashInput(
  fields: Record<string, string>,
  integrationKey: string
): string {
  const fieldOrder = [
    "id",
    "reference",
    "amount",
    "additionalinfo",
    "returnurl",
    "resulturl",
    "status",
  ];

  return (
    fieldOrder.map((field) => String(fields[field] ?? "")).join("") +
    integrationKey.trim()
  );
}

export async function buildInitiationHash(
  fields: Record<string, string>,
  integrationKey: string
): Promise<string> {
  return sha512(buildInitiationHashInput(fields, integrationKey));
}

export async function verifyInboundHash(
  entries: [string, string][],
  integrationKey: string
): Promise<boolean> {
  const hashEntry = entries.find(([key]) => key.toLowerCase() === "hash");
  if (!hashEntry?.[1]) return false;

  let concat = "";
  for (const [key, value] of entries) {
    if (key.toLowerCase() !== "hash") {
      concat += value;
    }
  }
  concat += integrationKey.trim();

  const expectedHash = await sha512(concat);
  return expectedHash === hashEntry[1].toUpperCase();
}

export function isPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return PAYNOW_PAID_STATUSES.has(status.toLowerCase());
}
