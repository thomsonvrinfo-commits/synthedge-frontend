// The shared authorization middleware replacing Base44's declarative Row-Level
// Security. This is THE most security-critical file in the entire migration
// (Migration Master Plan Volume 1, Risk R2; Volume 2, Phase 2, Section 2.11).
//
// Base44's RLS had no D1-native equivalent, so every access decision that used
// to be automatic is made explicit here — one function, imported everywhere,
// instead of duplicated per-Worker (the exact anti-pattern the discovery report
// found in the current Base44 Brevo integration, which this migration
// deliberately does not repeat).
//
// Discovery report Section 5.2 identified exactly 3 access patterns across all
// 9 Base44 entities. This file implements all 3.

import type { AccessPattern, AuthedRequest, EntityPolicy, Role } from './types';

export type Verb = 'create' | 'read' | 'update' | 'delete';

export interface AuthorizeParams {
  policy: EntityPolicy;
  verb: Verb;
  actor: AuthedRequest;
  /** The row being acted on. Not needed for `create`. */
  row?: { created_by_id: string } | null;
}

export interface AuthorizeResult {
  allowed: boolean;
  reason?: string;
}

/**
 * The declarative policy table for all 9 entities, mirroring discovery report
 * Section 5.2 exactly. `users` is deliberately absent: a user's own row is
 * governed by "is this JWT's sub equal to this row's id", which is a simpler
 * check handled directly in the auth Worker, not through this generic table
 * (Migration Master Plan Volume 2, Phase 3, Section 3.2).
 */
export type EntityName =
  | 'trades'
  | 'replay_sessions'
  | 'trading_rules'
  | 'trader_profiles'
  | 'broker_connections'
  | 'broker_trades'
  | 'payment_records'
  | 'user_subscriptions';

export const ENTITY_POLICIES: Record<EntityName, EntityPolicy> = {
  trades: { table: 'trades', pattern: 'owner_or_admin' },
  replay_sessions: { table: 'replay_sessions', pattern: 'owner_or_admin' },
  trading_rules: { table: 'trading_rules', pattern: 'owner_or_admin' },
  trader_profiles: { table: 'trader_profiles', pattern: 'owner_or_admin' },
  broker_connections: { table: 'broker_connections', pattern: 'owner_only' },
  broker_trades: { table: 'broker_trades', pattern: 'owner_only' },
  payment_records: {
    table: 'payment_records',
    pattern: 'admin_gated',
    createRole: 'owner',
    updateRole: 'admin',
    deleteRole: 'admin',
  },
  user_subscriptions: {
    table: 'user_subscriptions',
    pattern: 'admin_gated',
    createRole: 'admin',
    updateRole: 'admin',
    deleteRole: 'admin',
  },
};

/** Safe lookup for dynamic entity names (e.g. parsed from a URL path segment). */
export function getEntityPolicy(name: string): EntityPolicy | null {
  return Object.prototype.hasOwnProperty.call(ENTITY_POLICIES, name)
    ? ENTITY_POLICIES[name as EntityName]
    : null;
}

/**
 * Core authorization decision. Pure function, no I/O — the caller is
 * responsible for fetching `row` from D1 first (for update/delete/read) and
 * for actually executing the query afterward. Keeping this pure makes it
 * trivially unit-testable, which matters given what's riding on it being
 * correct (Migration Master Plan Volume 6, Phase 13, Section 13.9).
 */
export function authorize({ policy, verb, actor, row }: AuthorizeParams): AuthorizeResult {
  const isOwner = !!row && row.created_by_id === actor.userId;
  const isAdmin = actor.role === 'admin';

  switch (policy.pattern) {
    case 'owner_only': {
      // No admin override, for any verb — broker credentials and broker trade
      // history are never visible to anyone but their owner, full stop.
      if (verb === 'create') return { allowed: true }; // caller must set created_by_id = actor.userId
      if (!row) return { allowed: false, reason: 'not_found' };
      return isOwner ? { allowed: true } : { allowed: false, reason: 'not_owner' };
    }

    case 'owner_or_admin': {
      if (verb === 'create') return { allowed: true }; // create is always owner-scoped
      if (!row) return { allowed: false, reason: 'not_found' };
      if (isOwner || isAdmin) return { allowed: true };
      return { allowed: false, reason: 'not_owner_or_admin' };
    }

    case 'admin_gated': {
      const roleRequirement =
        verb === 'create' ? policy.createRole ?? 'owner'
        : verb === 'update' ? policy.updateRole ?? 'admin'
        : verb === 'delete' ? policy.deleteRole ?? 'admin'
        : 'owner_or_admin'; // read

      if (roleRequirement === 'admin') {
        return isAdmin ? { allowed: true } : { allowed: false, reason: 'admin_required' };
      }
      if (roleRequirement === 'owner') {
        if (verb === 'create') return { allowed: true };
        return isOwner ? { allowed: true } : { allowed: false, reason: 'not_owner' };
      }
      // owner_or_admin
      if (!row) return { allowed: false, reason: 'not_found' };
      return isOwner || isAdmin ? { allowed: true } : { allowed: false, reason: 'not_owner_or_admin' };
    }
  }
}

/**
 * Named, logged escape hatch for trusted service-to-service callers (cron
 * jobs, webhooks) that must act across all users' data — the equivalent of
 * Base44's `asServiceRole`. Deliberately a distinct, explicit function rather
 * than a flag on `authorize()`, so every use of it is greppable and every use
 * should be logged by the caller (Volume 1 Security Standard 2).
 */
export function authorizeAsServiceRole(callerDescription: string): AuthorizeResult {
  return { allowed: true, reason: `service_role:${callerDescription}` };
}

/**
 * Field-level write protection, generalizing the `updateTraderProfile`
 * SAFE_FIELDS pattern identified in the discovery report as the correct model
 * to follow for any entity with sensitive fields a user must never write
 * directly (Migration Master Plan Volume 3, Section 4.13; Volume 2, Security
 * Standard 3). Returns the filtered body plus the list of rejected field
 * names, so callers can log rejected-write attempts as a security signal
 * (Volume 5, Section 12.7 promotes this to an actual alert).
 */
export function filterToSafeFields<T extends Record<string, unknown>>(
  body: T,
  safeFields: readonly string[]
): { safe: Partial<T>; rejected: string[] } {
  const safe: Partial<T> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if ((safeFields as string[]).includes(key)) {
      (safe as Record<string, unknown>)[key] = value;
    } else {
      rejected.push(key);
    }
  }
  return { safe, rejected };
}

export const TRADER_PROFILE_SAFE_FIELDS = [
  'display_name',
  'goals',
  'custom_strategies',
  'custom_fields',
  'dashboard_widgets',
  'account_size',
  'risk_per_trade',
  'max_daily_trades',
  'preferred_sessions',
  'preferred_indices',
  'timezone',
] as const;
