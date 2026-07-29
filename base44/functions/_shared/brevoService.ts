/**
 * initUserTrial — Called after a new user registers to start their 7-day trial.
 * Sets trialStartDate, trialEndDate, plan=FREE, subscriptionStatus=TRIAL on the User entity.
 * Safe to call multiple times (idempotent — skips if trial already initialized).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { syncContactAndEvent } from '../_shared/brevoService.ts';

const TRIAL_DAYS = 7;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Find the User entity record for this user
    const users = await base44.entities.User.filter({ id: user.id });
    const userRecord = users[0];

    // Idempotent: skip if trial already set
    if (userRecord?.trialStartDate) {
      return Response.json({ ok: true, message: "Trial already initialized", status: userRecord.subscriptionStatus });
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    await base44.entities.User.update(userRecord ? userRecord.id : user.id, {
      plan: "FREE",
      subscriptionStatus: "TRIAL",
      trialStartDate: now.toISOString(),
      trialEndDate: trialEnd.toISOString(),
    });

    // Lifecycle sync to Brevo — this function only runs once per user
    // (guarded by the idempotency check above), so this is exactly the
    // "new user" moment: fire both USER_CREATED and TRIAL_STARTED here
    // rather than adding a second hook elsewhere for the same event.
    // Never let a Brevo hiccup fail signup — errors are swallowed and
    // logged inside brevoService itself.
    if (user.email) {
      await syncContactAndEvent("USER_CREATED", user.email, {
        contactAttributes: {
          FIRSTNAME: user.full_name?.split(" ")?.[0] || "",
          FULL_NAME: user.full_name || "",
          SIGNUP_DATE: now.toISOString(),
          PLAN: "FREE",
        },
        eventProperties: {
          user_id: user.id,
          signup_date: now.toISOString(),
          plan: "FREE",
          trial_end_date: trialEnd.toISOString(),
        },
        eventId: `USER_CREATED:${user.id}`,
      });

      await syncContactAndEvent("TRIAL_STARTED", user.email, {
        contactAttributes: {
          TRIAL_START_DATE: now.toISOString(),
          TRIAL_END_DATE: trialEnd.toISOString(),
        },
        eventProperties: {
          trial_start_date: now.toISOString(),
          trial_end_date: trialEnd.toISOString(),
          plan: "FREE",
        },
        eventId: `TRIAL_STARTED:${user.id}`,
      });
    } else {
      console.error("initUserTrial: user has no email — skipped Brevo sync", { userId: user.id });
    }

    return Response.json({
      ok: true,
      trialStartDate: now.toISOString(),
      trialEndDate: trialEnd.toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
