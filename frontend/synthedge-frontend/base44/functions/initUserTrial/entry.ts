/**
 * initUserTrial — Called after a new user registers to start their 7-day trial.
 * Sets trialStartDate, trialEndDate, plan=FREE, subscriptionStatus=TRIAL on User entity.
 * Safe to call multiple times (idempotent — skips if trial already initialized).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';


const LIFECYCLE_WORKER_URL =
  "https://synthedge-lifecycle.thomsonvr-info.workers.dev";


/**
 * Send lifecycle events to Cloudflare Worker.
 *
 * Base44 → Cloudflare Worker → Brevo
 *
 * We intentionally never throw here.
 * Marketing automation failure must never block signup.
 */
async function sendLifecycleEvent(
  event: string,
  email: string,
  properties = {}
) {

  try {

    console.log("Sending lifecycle event", {
      event,
      email,
      properties
    });


    const response = await fetch(
      `${LIFECYCLE_WORKER_URL}/event`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          event,
          email,
          properties,
        }),
      }
    );


    const responseText = await response.text();


    console.log("Lifecycle worker response", {
      event,
      status: response.status,
      response: responseText
    });


    if (!response.ok) {

      console.error(
        "Lifecycle worker failed",
        responseText
      );

    }


  } catch (error) {

    console.error(
      "Lifecycle worker error",
      error instanceof Error
        ? error.message
        : String(error)
    );

  }

}



const TRIAL_DAYS = 7;



Deno.serve(async (req) => {


  try {

    console.log("INIT USER TRIAL STARTED");


    const base44 = createClientFromRequest(req);


    const user = await base44.auth.me();


    if (!user) {

      return Response.json(
        {
          error: "Unauthorized"
        },
        {
          status:401
        }
      );

    }



    console.log("initUserTrial started", {
      userId:user.id,
      email:user.email
    });



    // Find User entity record

    const users =
      await base44.entities.User.filter({
        id:user.id
      });


    const userRecord = users[0];



    // Prevent duplicate trials

    if (userRecord?.trialStartDate) {


      console.log(
        "Trial already initialized",
        user.id
      );


      return Response.json({

        ok:true,

        message:
          "Trial already initialized",

        status:
          userRecord.subscriptionStatus

      });


    }



    const now = new Date();


    const trialEnd = new Date(now);


    trialEnd.setDate(
      trialEnd.getDate() + TRIAL_DAYS
    );



    await base44.entities.User.update(

      userRecord
        ? userRecord.id
        : user.id,

      {

        plan:"FREE",

        subscriptionStatus:"TRIAL",

        trialStartDate:
          now.toISOString(),

        trialEndDate:
          trialEnd.toISOString(),

      }

    );



    console.log(
      "Trial initialized successfully",
      {
        userId:user.id,
        trialEnd:trialEnd.toISOString()
      }
    );



    /**
     * Lifecycle events
     *
     * Fires only once because of idempotency guard.
     */

    if(user.email){


      await sendLifecycleEvent(

        "USER_CREATED",

        user.email,

        {

          user_id:user.id,

          signup_date:
            now.toISOString(),

          plan:"FREE",

          trial_end_date:
            trialEnd.toISOString()

        }

      );



      await sendLifecycleEvent(

        "TRIAL_STARTED",

        user.email,

        {

          trial_start_date:
            now.toISOString(),

          trial_end_date:
            trialEnd.toISOString(),

          plan:"FREE"

        }

      );



    }
    else {


      console.error(
        "No email found for user",
        {
          userId:user.id
        }
      );


    }



    return Response.json({

      ok:true,

      trialStartDate:
        now.toISOString(),

      trialEndDate:
        trialEnd.toISOString()

    });



  }
  catch(error){


    console.error(
      "initUserTrial failed",
      error
    );


    return Response.json(

      {

        error:
          error instanceof Error
            ? error.message
            : String(error)

      },

      {
        status:500
      }

    );


  }


});