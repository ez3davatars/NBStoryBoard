import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APPROVED_UNIT_AMOUNT_CENTS_LAUNCH,
  APPROVED_UNIT_AMOUNT_CENTS_PRELAUNCH,
  checkKeyMode,
  checkPrice,
  checkSessionMode,
  deriveStripeKeyMode,
  expectedPriceType,
  parseExpectedMode,
  resolveApprovedUnitAmountCents,
  type StripePriceShape
} from '../../../../supabase/functions/_shared/stripeModeGuard';

const EDGE = readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
const RESET = readFileSync('src/renderer/utils/resetVolatileWorkspaceState.ts', 'utf8');
const MAIN = readFileSync('src/renderer/main.tsx', 'utf8');
const APP = readFileSync('src/renderer/App.tsx', 'utf8');

const price = (p: Partial<StripePriceShape>): StripePriceShape => ({
  livemode: false,
  type: 'one_time',
  unit_amount: 1299,
  recurring: null,
  ...p
});

describe('key/mode derivation + expected-mode parsing (fail closed)', () => {
  it('derives mode from sk_/rk_ prefixes only; anything else is invalid', () => {
    expect(deriveStripeKeyMode('sk_test_abc')).toBe('test');
    expect(deriveStripeKeyMode('rk_test_abc')).toBe('test');
    expect(deriveStripeKeyMode('sk_live_abc')).toBe('live');
    expect(deriveStripeKeyMode('rk_live_abc')).toBe('live');
    expect(deriveStripeKeyMode('pk_test_abc')).toBe('invalid');
    expect(deriveStripeKeyMode('garbage')).toBe('invalid');
    expect(deriveStripeKeyMode('')).toBe('invalid');
    expect(deriveStripeKeyMode(null)).toBe('invalid');
    expect(deriveStripeKeyMode(undefined)).toBe('invalid');
  });
  it('STRIPE_EXPECTED_MODE accepts only exact test/live; missing or invalid => null', () => {
    expect(parseExpectedMode('test')).toBe('test');
    expect(parseExpectedMode(' LIVE ')).toBe('live');
    expect(parseExpectedMode('')).toBeNull();
    expect(parseExpectedMode(undefined)).toBeNull();
    expect(parseExpectedMode('prod')).toBeNull();
    expect(parseExpectedMode('testing')).toBeNull();
  });
});

describe('task 8 — required mode-guard proofs', () => {
  it('1. sk_test key + expected test succeeds', () => {
    const r = checkKeyMode({ expectedMode: 'test', secretKey: 'sk_test_123' });
    expect(r.ok).toBe(true);
    expect(r.keyMode).toBe('test');
  });
  it('2. sk_live key + expected test fails (before any Stripe API call) with STRIPE_KEY_MODE_MISMATCH', () => {
    const r = checkKeyMode({ expectedMode: 'test', secretKey: 'sk_live_123' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('STRIPE_KEY_MODE_MISMATCH');
    // The key-mode check runs BEFORE the price retrieval and BEFORE the checkout-session creation.
    const keyIdx = EDGE.indexOf('checkKeyMode({ expectedMode');
    const priceIdx = EDGE.indexOf('api.stripe.com/v1/prices/');
    const sessionIdx = EDGE.indexOf('api.stripe.com/v1/checkout/sessions');
    expect(keyIdx).toBeGreaterThan(-1);
    expect(keyIdx).toBeLessThan(priceIdx);
    expect(keyIdx).toBeLessThan(sessionIdx);
    // An invalid (non-test/live) key also fails closed as a mismatch.
    expect(checkKeyMode({ expectedMode: 'test', secretKey: 'pk_test_1' }).code).toBe('STRIPE_KEY_MODE_MISMATCH');
  });
  it('3. a test key cannot select a live Price', () => {
    const r = checkPrice({ price: price({ livemode: true }), expectedMode: 'test', expectedType: 'one_time', approvedUnitAmountCents: 1299 });
    expect(r).toMatchObject({ ok: false, code: 'STRIPE_PRICE_MODE_MISMATCH' });
  });
  it('4. a live key cannot select a test Price', () => {
    const r = checkPrice({ price: price({ livemode: false }), expectedMode: 'live', expectedType: 'one_time', approvedUnitAmountCents: null });
    expect(r).toMatchObject({ ok: false, code: 'STRIPE_PRICE_MODE_MISMATCH' });
  });
  it('5. one-time packs reject recurring Prices', () => {
    const r = checkPrice({ price: price({ type: 'recurring', recurring: { interval: 'month' } }), expectedMode: 'test', expectedType: 'one_time', approvedUnitAmountCents: 1299 });
    expect(r).toMatchObject({ ok: false, code: 'STRIPE_PRICE_TYPE_MISMATCH' });
  });
  it('6. subscriptions reject one-time Prices', () => {
    const r = checkPrice({ price: price({ type: 'one_time' }), expectedMode: 'test', expectedType: 'recurring', approvedUnitAmountCents: 5900 });
    expect(r).toMatchObject({ ok: false, code: 'STRIPE_PRICE_TYPE_MISMATCH' });
  });
  it('7. a live session is never returned when expected mode is test', () => {
    const r = checkSessionMode({ sessionLivemode: true, expectedMode: 'test' });
    expect(r).toMatchObject({ ok: false, code: 'STRIPE_SESSION_MODE_MISMATCH' });
    // On mismatch the edge expires the session and throws — it does NOT fall through to returning the url.
    expect(EDGE).toMatch(/if \(!sessionCheck\.ok\)[\s\S]*\/expire[\s\S]*throw new HttpError\(500, sessionCheck\.code/);
    // The url is only assembled into responseBody AFTER the session check passes.
    expect(EDGE.indexOf('if (!sessionCheck.ok)')).toBeLessThan(EDGE.indexOf('url: stripeSession.url'));
  });
  it('8. no fallback Stripe secret variable exists (exactly one key source)', () => {
    expect(EDGE).toContain('getEnv("STRIPE_SECRET_KEY")');
    expect(EDGE).not.toContain('STRIPE_LIVE_SECRET_KEY');
    expect(EDGE).not.toContain('STRIPE_TEST_SECRET_KEY');
    expect(EDGE).not.toMatch(/STRIPE_SECRET_KEY_(LIVE|TEST|PROD)/);
    // The key is read exactly once, from STRIPE_SECRET_KEY only.
    expect(EDGE.match(/getEnv\("STRIPE_SECRET_KEY"\)/g)?.length).toBe(1);
    // No embedded/hardcoded secret keys.
    expect(EDGE).not.toMatch(/sk_(live|test)_[A-Za-z0-9]/);
    expect(EDGE).not.toMatch(/rk_(live|test)_[A-Za-z0-9]/);
  });
});

describe('the secret key is never logged or returned', () => {
  it('no console.* statement and no response field carries the secret key', () => {
    expect(EDGE).not.toMatch(/console\.[a-z]+\([^)]*stripeSecretKey/);
    // stripeSecretKey appears only in Authorization headers (Bearer) + the configured-check; never in a
    // jsonResponse/responseBody assignment. The dev-debug surface uses priceId + derived mode only.
    expect(EDGE).not.toMatch(/responseBody\.[A-Za-z]+\s*=\s*stripeSecretKey/);
    expect(EDGE).toContain('responseBody.stripeMode = keyModeResult.keyMode');
    expect(EDGE).toContain('responseBody.priceId = productConfig.stripePriceId');
  });
});

describe('expected price type + approved amount registry', () => {
  it('expectedPriceType maps payment=>one_time, subscription=>recurring', () => {
    expect(expectedPriceType('payment')).toBe('one_time');
    expect(expectedPriceType('subscription')).toBe('recurring');
  });
  it('subscription recurring interval must be month', () => {
    const wrong = checkPrice({ price: price({ type: 'recurring', recurring: { interval: 'year' } }), expectedMode: 'test', expectedType: 'recurring', approvedUnitAmountCents: 5900 });
    expect(wrong).toMatchObject({ ok: false, code: 'STRIPE_PRICE_TYPE_MISMATCH' });
    const ok = checkPrice({ price: price({ livemode: false, type: 'recurring', recurring: { interval: 'month' }, unit_amount: 5900 }), expectedMode: 'test', expectedType: 'recurring', approvedUnitAmountCents: 5900 });
    expect(ok.ok).toBe(true);
  });
  it('unit amount must match the approved registry (cents)', () => {
    const bad = checkPrice({ price: price({ unit_amount: 999 }), expectedMode: 'test', expectedType: 'one_time', approvedUnitAmountCents: 1299 });
    expect(bad).toMatchObject({ ok: false, code: 'STRIPE_PRICE_AMOUNT_MISMATCH' });
    const good = checkPrice({ price: price({ unit_amount: 1299 }), expectedMode: 'test', expectedType: 'one_time', approvedUnitAmountCents: 1299 });
    expect(good.ok).toBe(true);
  });
  it('approved amounts resolve by rollout generation; BYOK/unknown => null (amount check skipped)', () => {
    expect(resolveApprovedUnitAmountCents('credit_pack_100', true)).toBe(1299);
    expect(resolveApprovedUnitAmountCents('credit_pack_100', false)).toBe(1000);
    expect(resolveApprovedUnitAmountCents('subscription_pro', true)).toBe(11900);
    expect(resolveApprovedUnitAmountCents('indie_desktop_byok', true)).toBeNull();
    expect(resolveApprovedUnitAmountCents('legacy_price_checkout', false)).toBeNull();
    expect(resolveApprovedUnitAmountCents(null, true)).toBeNull();
    expect(APPROVED_UNIT_AMOUNT_CENTS_LAUNCH.credit_pack_500).toBe(5499);
    expect(APPROVED_UNIT_AMOUNT_CENTS_PRELAUNCH.credit_pack_500).toBe(4500);
  });
});

describe('edge wiring: expected-mode + dev-debug gating', () => {
  it('STRIPE_EXPECTED_MODE missing/invalid fails closed', () => {
    expect(EDGE).toContain('parseExpectedMode(getEnv("STRIPE_EXPECTED_MODE"))');
    expect(EDGE).toContain('STRIPE_EXPECTED_MODE_INVALID');
  });
  it('dev debug fields are gated to test mode + explicit dev/debug env', () => {
    expect(EDGE).toMatch(/expectedMode === "test" &&[\s\S]*STRIPE_CHECKOUT_DEBUG/);
    expect(EDGE).toContain('functionBuildId');
  });
});

describe('task 9 — staging storage token-dump logging removed', () => {
  it('the [STAGING STORAGE AUDIT] dump and its helpers no longer exist', () => {
    expect(RESET).not.toContain('STAGING STORAGE AUDIT');
    expect(RESET).not.toContain('dumpBrowserStorage');
    expect(RESET).not.toContain('debugDumpVolatileStorageKeys');
  });
  it('no caller references the removed dump helper', () => {
    expect(MAIN).not.toContain('dumpBrowserStorage');
    expect(APP).not.toContain('dumpBrowserStorage');
  });
});
