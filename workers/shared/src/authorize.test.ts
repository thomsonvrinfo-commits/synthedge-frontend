import { describe, it, expect } from 'vitest';
import { authorize, ENTITY_POLICIES, filterToSafeFields, TRADER_PROFILE_SAFE_FIELDS } from './authorize';
import type { AuthedRequest } from './types';

const owner: AuthedRequest = { userId: 'user_A', role: 'user' };
const otherUser: AuthedRequest = { userId: 'user_B', role: 'user' };
const admin: AuthedRequest = { userId: 'admin_1', role: 'admin' };
const ownedRow = { created_by_id: 'user_A' };

describe('authorize() — owner_only pattern (broker_connections, broker_trades)', () => {
  const policy = ENTITY_POLICIES.broker_connections;

  it('POSITIVE: owner can read their own row', () => {
    expect(authorize({ policy, verb: 'read', actor: owner, row: ownedRow }).allowed).toBe(true);
  });

  it('NEGATIVE: a different user cannot read the row', () => {
    const result = authorize({ policy, verb: 'read', actor: otherUser, row: ownedRow });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('not_owner');
  });

  it('NEGATIVE: admin does NOT get an override for owner_only entities (broker creds are private, full stop)', () => {
    const result = authorize({ policy, verb: 'read', actor: admin, row: ownedRow });
    expect(result.allowed).toBe(false);
  });

  it('POSITIVE: owner can create (create is always allowed, caller scopes created_by_id)', () => {
    expect(authorize({ policy, verb: 'create', actor: owner }).allowed).toBe(true);
  });

  it('NEGATIVE: owner cannot update/delete someone else\'s connection (explicit IDOR check)', () => {
    expect(authorize({ policy, verb: 'update', actor: otherUser, row: ownedRow }).allowed).toBe(false);
    expect(authorize({ policy, verb: 'delete', actor: otherUser, row: ownedRow }).allowed).toBe(false);
  });
});

describe('authorize() — owner_or_admin pattern (trades, replay_sessions, trading_rules, trader_profiles)', () => {
  const policy = ENTITY_POLICIES.trades;

  it('POSITIVE: owner can read/update/delete their own trade', () => {
    expect(authorize({ policy, verb: 'read', actor: owner, row: ownedRow }).allowed).toBe(true);
    expect(authorize({ policy, verb: 'update', actor: owner, row: ownedRow }).allowed).toBe(true);
    expect(authorize({ policy, verb: 'delete', actor: owner, row: ownedRow }).allowed).toBe(true);
  });

  it('POSITIVE: admin can read/update/delete any user\'s trade', () => {
    expect(authorize({ policy, verb: 'read', actor: admin, row: ownedRow }).allowed).toBe(true);
    expect(authorize({ policy, verb: 'update', actor: admin, row: ownedRow }).allowed).toBe(true);
    expect(authorize({ policy, verb: 'delete', actor: admin, row: ownedRow }).allowed).toBe(true);
  });

  it('NEGATIVE: a different non-admin user cannot read/update/delete', () => {
    expect(authorize({ policy, verb: 'read', actor: otherUser, row: ownedRow }).allowed).toBe(false);
    expect(authorize({ policy, verb: 'update', actor: otherUser, row: ownedRow }).allowed).toBe(false);
    expect(authorize({ policy, verb: 'delete', actor: otherUser, row: ownedRow }).allowed).toBe(false);
  });

  it('NEGATIVE: read/update/delete against a nonexistent row is denied, not silently allowed', () => {
    expect(authorize({ policy, verb: 'read', actor: owner, row: null }).allowed).toBe(false);
  });
});

describe('authorize() — admin_gated pattern: payment_records (create=owner, update/delete=admin)', () => {
  const policy = ENTITY_POLICIES.payment_records;

  it('POSITIVE: owner can create their own payment record', () => {
    expect(authorize({ policy, verb: 'create', actor: owner }).allowed).toBe(true);
  });

  it('POSITIVE: owner can read their own payment record', () => {
    expect(authorize({ policy, verb: 'read', actor: owner, row: ownedRow }).allowed).toBe(true);
  });

  it('NEGATIVE: owner CANNOT update or delete their own payment record — admin only', () => {
    expect(authorize({ policy, verb: 'update', actor: owner, row: ownedRow }).allowed).toBe(false);
    expect(authorize({ policy, verb: 'delete', actor: owner, row: ownedRow }).allowed).toBe(false);
  });

  it('POSITIVE: admin can update/delete', () => {
    expect(authorize({ policy, verb: 'update', actor: admin, row: ownedRow }).allowed).toBe(true);
    expect(authorize({ policy, verb: 'delete', actor: admin, row: ownedRow }).allowed).toBe(true);
  });
});

describe('authorize() — admin_gated pattern: user_subscriptions (create/update/delete=admin, read=owner-or-admin)', () => {
  const policy = ENTITY_POLICIES.user_subscriptions;

  it('NEGATIVE: a regular user cannot create/update/delete their own subscription row directly', () => {
    expect(authorize({ policy, verb: 'create', actor: owner }).allowed).toBe(false);
    expect(authorize({ policy, verb: 'update', actor: owner, row: ownedRow }).allowed).toBe(false);
    expect(authorize({ policy, verb: 'delete', actor: owner, row: ownedRow }).allowed).toBe(false);
  });

  it('POSITIVE: owner can still read their own subscription status', () => {
    expect(authorize({ policy, verb: 'read', actor: owner, row: ownedRow }).allowed).toBe(true);
  });

  it('POSITIVE: admin can create/update/delete', () => {
    expect(authorize({ policy, verb: 'create', actor: admin }).allowed).toBe(true);
    expect(authorize({ policy, verb: 'update', actor: admin, row: ownedRow }).allowed).toBe(true);
  });
});

describe('filterToSafeFields() — the updateTraderProfile pattern generalized', () => {
  it('POSITIVE: allowlisted fields pass through', () => {
    const { safe, rejected } = filterToSafeFields(
      { display_name: 'Tawanda', account_size: 5000 },
      TRADER_PROFILE_SAFE_FIELDS
    );
    expect(safe).toEqual({ display_name: 'Tawanda', account_size: 5000 });
    expect(rejected).toEqual([]);
  });

  it('CRITICAL NEGATIVE: subscription_plan and trial_end_date are silently dropped, never applied', () => {
    const { safe, rejected } = filterToSafeFields(
      { display_name: 'Tawanda', subscription_plan: 'pro', trial_end_date: '2099-01-01' },
      TRADER_PROFILE_SAFE_FIELDS
    );
    expect(safe).toEqual({ display_name: 'Tawanda' });
    expect('subscription_plan' in safe).toBe(false);
    expect('trial_end_date' in safe).toBe(false);
    expect(rejected).toEqual(['subscription_plan', 'trial_end_date']);
  });
});
