/**
 * src/api/subscription.js
 *
 * Milestone 2: talks to the new centralized /subscription routes in the
 * entities Worker. Replaces useSubscription.js's prior approach of deriving
 * plan/trial state from TraderProfile fields and writing subscription_plan
 * back directly on expiry (that direct write is no longer accepted by the
 * backend either — see workers/entities/src/handlers/profile.ts).
 *
 * BACKEND CONTRACT:
 *   GET  /subscription                -> { ok, subscription: SubscriptionState }
 *   POST /subscription/trial/activate -> { ok, subscription }  (idempotent)
 *   POST /subscription/cancel         -> { ok, subscription }
 *   GET  /subscription/payment-records   -> PaymentRecord[]
 *   POST /subscription/payment-records   { amount, method, billingCycle? } -> PaymentRecord
 */
import { apiClient } from "@/api/client";

export async function getSubscription() {
  const res = await apiClient.get("/subscription");
  return res.subscription;
}

export async function activateTrial() {
  const res = await apiClient.post("/subscription/trial/activate");
  return res.subscription;
}

export async function cancelSubscription() {
  const res = await apiClient.post("/subscription/cancel");
  return res.subscription;
}

export async function listPaymentRecords() {
  return apiClient.get("/subscription/payment-records");
}

export async function createPaymentRecord({ amount, method, billingCycle, transactionReference, notes }) {
  return apiClient.post("/subscription/payment-records", {
    amount,
    method,
    billingCycle,
    transactionReference,
    notes,
  });
}
