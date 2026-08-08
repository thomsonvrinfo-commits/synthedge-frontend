// SynthEdge — R2 upload helpers (Milestone 3: screenshot persistence).
//
// Design: D1 stores only a URL string (trades.screenshot_before, etc.) —
// never blob data, matching the "only metadata belongs in D1" requirement.
// The actual bytes live in R2 under a per-user, content-addressed key
// (uploads/{userId}/{ulid}.{ext}); the URL a client stores is just
// `${workerOrigin}/uploads/{key}`.
//
// The read path (GET /uploads/:key) is deliberately UNAUTHENTICATED: an
// <img src="..."> tag cannot attach an Authorization header, so ownership
// can't be enforced on read the way it is on every other resource in this
// codebase. Privacy instead comes from key un-guessability (a ULID has ~128
// bits of entropy) — the same model most SaaS attachment CDNs use. This is a
// deliberate, documented tradeoff, not an oversight; if per-user screenshot
// privacy against a targeted attacker (not just casual discovery) becomes a
// requirement later, the fix is signed, expiring URLs, not auth headers.

export const ALLOWED_UPLOAD_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export function extensionForMimeType(mimeType: string): string | null {
  return ALLOWED_UPLOAD_MIME_TYPES[mimeType] ?? null;
}

/** Builds the R2 object key for a newly uploaded file. Always user-namespaced. */
export function buildUploadKey(userId: string, id: string, mimeType: string): string {
  const ext = extensionForMimeType(mimeType) ?? "bin";
  return `${userId}/${id}.${ext}`;
}

/** Builds the absolute URL a client stores/renders for a given R2 key. */
export function buildUploadUrl(workerOrigin: string, key: string): string {
  return `${workerOrigin.replace(/\/+$/, "")}/uploads/${key}`;
}

/**
 * Extracts the R2 key from a URL, but ONLY if it actually points at this
 * Worker's own /uploads/ route — used before attempting cleanup (delete on
 * trade-delete/screenshot-replace) so we never try to R2.delete() an
 * arbitrary external URL a client could otherwise set on a screenshot field
 * via a crafted request body.
 */
export function extractOwnUploadKey(url: string | null | undefined, workerOrigin: string): string | null {
  if (!url) return null;
  const prefix = `${workerOrigin.replace(/\/+$/, "")}/uploads/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key.length > 0 ? key : null;
}
