// Shared types across all SynthEdge Workers.
// Mirrors Migration Master Plan Volume 2, Phase 2 (auth) and Phase 3 (schema).

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  BUCKET?: R2Bucket;

  // Auth
  JWT_SECRET: string;              // HS256 signing secret for access tokens
  REFRESH_TOKEN_TTL_DAYS?: string; // default 30
  ACCESS_TOKEN_TTL_MIN?: string;   // default 15

  // Broker
  BROKER_ENC_KEY?: string;         // base64, 32 bytes, AES-GCM
  METAAPI_TOKEN?: string;

  // AI Trading Coach
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;           // default: gpt-4o-mini (see ai/llm/openai.ts)

  // Paynow
  PAYNOW_INTEGRATION_ID?: string;
  PAYNOW_INTEGRATION_KEY?: string;
  PAYNOW_RESULT_URL?: string;
  PAYNOW_RETURN_URL?: string;

  // Brevo
  BREVO_API_KEY?: string;

  // New-user signup notification (owner alert) — falls back to a hardcoded
  // default in newUserNotification.ts if unset, so this works without any
  // extra production configuration.
  OWNER_NOTIFICATION_EMAIL?: string;

  // Google OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;

  // Scheduled-job HTTP trigger gate (only needed if crons call over HTTP rather than binding directly)
  CRON_SECRET?: string;

  // Frontend origin, for CORS / redirects
  APP_BASE_URL: string;
}

export type Role = 'user' | 'admin';

export interface AccessTokenPayload {
  sub: string;      // user id
  role: Role;
  iat: number;
  exp: number;
}

export interface AuthedRequest {
  userId: string;
  role: Role;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  full_name: string | null;
  role: Role;
  plan: string;
  subscription_status: string;
  trial_start_date: string | null;
  trial_end_date: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  payment_provider: string | null;
  paynow_reference: string | null;
  last_payment_date: string | null;
  next_billing_date: string | null;
  created_date: string;
  updated_date: string;
}

// The 3 access patterns identified in the discovery report (Section 5.2) and
// formalized in Migration Master Plan Volume 2, Phase 2, Section 2.11.
export type AccessPattern = 'owner_only' | 'owner_or_admin' | 'admin_gated';

export interface EntityPolicy {
  table: string;
  pattern: AccessPattern;
  // Only used by 'admin_gated': overrides the default per-verb behavior.
  createRole?: 'owner' | 'admin';
  updateRole?: 'owner' | 'admin' | 'owner_or_admin';
  deleteRole?: 'owner' | 'admin' | 'owner_or_admin';
}
