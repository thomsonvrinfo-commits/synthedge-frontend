/**
 * SynthEdge Lifecycle Event Bridge
 *
 * Frontend lifecycle events
 *        |
 *        ↓
 * Cloudflare Lifecycle Worker
 *        |
 *        ↓
 * Brevo
 *
 * Frontend never talks to Brevo directly.
 * No API keys exposed.
 * Fire-and-forget only — never blocks or throws into the caller.
 *
 * Usage (email is optional — resolved automatically from the current
 * session if omitted, which is how every call site in this app uses it):
 *
 *   trackLifecycleEvent("TRADE_CREATED");
 *   trackLifecycleEvent("REPLAY_COMPLETED", { strategy: "Supply Demand" });
 *   trackLifecycleEvent("TRADE_CREATED", {}, "explicit@email.com"); // still supported
 */

import { me } from "@/api/auth";
import { queryClientInstance } from "@/lib/query-client";

const LIFECYCLE_WORKER_URL =
  "https://synthedge-lifecycle.thomsonvr-info.workers.dev";

/**
 * Resolve the current user's email without forcing every call site to
 * plumb it through manually. Prefers the cached React Query value (no
 * network hit on the hot path of saving a trade); falls back to
 * me() from src/api/auth.ts if nothing is cached yet.
 */
async function resolveEmail() {
  const cached = queryClientInstance.getQueryData(["currentUser"]);
  if (cached?.email) return cached.email;

  try {
    const currentUser = await me();
    return currentUser?.email || null;
  } catch (error) {
    console.error("Lifecycle event: could not resolve current user email", error?.message || error);
    return null;
  }
}

export function trackLifecycleEvent(event, properties = {}, email = null) {
  if (!event) {
    console.error("Lifecycle event missing name");
    return;
  }

  (async () => {
    const resolvedEmail = email || (await resolveEmail());

    if (!resolvedEmail) {
      console.warn(`Lifecycle event ${event} skipped: no email available`);
      return;
    }

    try {
      const response = await fetch(`${LIFECYCLE_WORKER_URL}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          email: resolvedEmail,
          properties,
        }),
      });

      if (!response.ok) {
        console.error("Lifecycle worker rejected event:", event, await response.text());
      }
    } catch (error) {
      console.error(`Lifecycle event ${event} failed:`, error?.message || error);
    }
  })();
}
