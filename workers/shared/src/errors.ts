// Preserves the existing, already-good error-response convention found across
// the current Base44 functions: { error: string }, with an appropriate status
// code — so frontend error-handling call sites need no changes (Migration
// Master Plan Volume 2, Engineering Standards, Section 8).

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonOk(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
