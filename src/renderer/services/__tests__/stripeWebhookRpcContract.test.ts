import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WEBHOOK = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');

describe('webhook matches the DEPLOYED apply_stripe_credit_topup contract', () => {
  it('invokes the RPC with exactly the deployed 4 argument names', () => {
    expect(WEBHOOK).toContain('p_user_id: grant.userId');
    expect(WEBHOOK).toContain('p_credits: grant.credits');
    expect(WEBHOOK).toContain('p_stripe_event_id: grant.idempotencyKey');
    expect(WEBHOOK).toContain('p_event_type: grant.eventType');
  });
  it('does NOT pass the old/removed p_session_id or p_product_key arguments', () => {
    expect(WEBHOOK).not.toContain('p_session_id');
    expect(WEBHOOK).not.toContain('p_product_key');
    expect(WEBHOOK).not.toContain('p_event_id:'); // old 5-arg name
  });
  it('destructures only { error } from the void RPC (never parses its data row)', () => {
    expect(WEBHOOK).toMatch(/const \{ error \} = await supabase\.rpc\("apply_stripe_credit_topup"/);
    expect(WEBHOOK).not.toMatch(/\.applied\b/);
    expect(WEBHOOK).not.toMatch(/Array\.isArray\(data\)/); // old "row = data[0]" parsing is gone
  });
  it('reads profiles.credit_balance AFTER the RPC to report the resulting balance', () => {
    expect(WEBHOOK).toMatch(/from\("profiles"\)[\s\S]*select\("credit_balance"\)[\s\S]*eq\("id", grant\.userId\)/);
  });
});

describe('task 5 — the unsafe direct balance update is gone / fail closed', () => {
  it('no direct read-then-update of credit_balance exists', () => {
    expect(WEBHOOK).not.toMatch(/\.update\(\{\s*credit_balance/);
    expect(WEBHOOK).not.toContain('applyCreditTopUpDirectly');
    expect(WEBHOOK).not.toContain('nextBalance');
  });
  it('a missing/mismatched RPC fails closed with a 500 and does not modify credit_balance', () => {
    expect(WEBHOOK).toContain('STRIPE_TOPUP_RPC_CONTRACT_MISMATCH');
    expect(WEBHOOK).toContain('isRpcContractMismatch');
    // contract mismatch throws a 500 WebhookError; there is no direct-update fallback branch.
    expect(WEBHOOK).toMatch(/new WebhookError\(\s*500,\s*"STRIPE_TOPUP_RPC_CONTRACT_MISMATCH"/);
    expect(WEBHOOK).not.toContain('falling back to direct credit update');
  });
});

describe('task 6 — safe error normalization (no [object Object], no secrets)', () => {
  it('extracts message/code/details/hint from raw PostgREST errors', () => {
    expect(WEBHOOK).toMatch(/message:[\s\S]*code:[\s\S]*details:[\s\S]*hint:/);
    expect(WEBHOOK).toContain('extractRpcError');
    expect(WEBHOOK).toContain('STRIPE_TOPUP_RPC_FAILED');
  });
  it('never logs Stripe/webhook/Supabase secrets or full Checkout Session objects', () => {
    expect(WEBHOOK).not.toMatch(/console\.[a-z]+\([^)]*webhookSecret/);
    expect(WEBHOOK).not.toMatch(/console\.[a-z]+\([^)]*serviceRoleKey/);
    expect(WEBHOOK).not.toMatch(/console\.[a-z]+\([^)]*rawBody/);
    expect(WEBHOOK).not.toMatch(/console\.[a-z]+\([^)]*\bsession\b/);
    expect(WEBHOOK).not.toMatch(/console\.[a-z]+\([^)]*\bevent\b\)/);
  });
});

describe('idempotency keying', () => {
  it('packs dedupe on the Stripe event id; subscriptions dedupe on the invoice id', () => {
    expect(WEBHOOK).toContain('idempotencyKey: event.id');
    expect(WEBHOOK).toContain('idempotencyKey: invoice.id');
  });
  it('the credit grant flows through a single RPC helper (no second crediting path)', () => {
    expect(WEBHOOK.match(/supabase\.rpc\("apply_stripe_credit_topup"/g)?.length).toBe(1);
  });
});
