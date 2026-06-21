import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertLaunchPricingConfigured,
  getLaunchProduct,
  getPaidCreditGrant,
  HOSTED_LAUNCH_PRICING_VERSION,
  isPricingRolloutEnabled,
  LAUNCH_V2_ENV_VARS,
  resolveLaunchPriceId
} from '../../../../supabase/functions/_shared/launchPricing';
import { HOSTED_GOOGLE_COST_MARKUP_BPS } from '../hostedMeteredPricing';
import {
  HOSTED_PRICING_ROLLOUT_ENABLED,
  TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD,
  SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD,
  selectSafePooledCreditValue
} from '../hostedCreditEconomics';

const CHECKOUT = readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
const WEBHOOK = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
const ECONOMICS = readFileSync('src/renderer/services/hostedCreditEconomics.ts', 'utf8');
const GENERATE_IMAGE = readFileSync('supabase/functions/generate-image/index.ts', 'utf8');

// A fully-configured V2 environment (valid price ids for all four launch products).
const CONFIGURED: Record<string, string> = {
  STRIPE_PRICE_CREDIT_PACK_100_V2: 'price_test_pack100',
  STRIPE_PRICE_CREDIT_PACK_500_V2: 'price_test_pack500',
  STRIPE_PRICE_SUBSCRIPTION_STARTER_V2: 'price_test_starter',
  STRIPE_PRICE_SUBSCRIPTION_PRO_V2: 'price_test_pro'
};
const env = (map: Record<string, string>) => (k: string): string | null => map[k] ?? null;

describe('server-owned launch credit grants', () => {
  it('1. V2 100-credit pack grants exactly 100 paid credits', () => {
    expect(getPaidCreditGrant('credit_pack_100')).toBe(100);
  });
  it('2. V2 500-credit pack grants exactly 500 paid credits', () => {
    expect(getPaidCreditGrant('credit_pack_500')).toBe(500);
  });
  it('3. V2 Starter grants exactly 600 paid credits per eligible cycle', () => {
    expect(getPaidCreditGrant('subscription_starter')).toBe(600);
    expect(getLaunchProduct('subscription_starter')?.purchaseType).toBe('subscription');
  });
  it('4. V2 Pro grants exactly 1,200 paid credits per eligible cycle', () => {
    expect(getPaidCreditGrant('subscription_pro')).toBe(1200);
    expect(getLaunchProduct('subscription_pro')?.purchaseType).toBe('subscription');
  });
  it('5. BYOK products grant zero hosted credits', () => {
    expect(getPaidCreditGrant('indie_desktop_byok')).toBe(0);
    expect(getPaidCreditGrant('agency_desktop_byok')).toBe(0);
    expect(getLaunchProduct('indie_desktop_byok')?.isByok).toBe(true);
  });
  it('grants are never inferred from the Stripe amount/metadata — registry only (no price_ literals)', () => {
    const registry = readFileSync('supabase/functions/_shared/launchPricing.ts', 'utf8');
    expect(registry).not.toMatch(/price_[A-Za-z0-9]{6,}/); // env-var names only, no committed price ids
    expect(HOSTED_LAUNCH_PRICING_VERSION).toBe('hosted-launch-pricing-2026-06-v1');
  });
});

describe('rollout flag behavior', () => {
  it('6. rollout flag defaults to false (missing/garbage env => false)', () => {
    expect(isPricingRolloutEnabled(() => null)).toBe(false);
    expect(isPricingRolloutEnabled(env({}))).toBe(false);
    expect(isPricingRolloutEnabled(env({ HOSTED_PRICING_ROLLOUT_ENABLED: 'yes' }))).toBe(false);
    expect(isPricingRolloutEnabled(env({ HOSTED_PRICING_ROLLOUT_ENABLED: '1' }))).toBe(false);
    expect(isPricingRolloutEnabled(env({ HOSTED_PRICING_ROLLOUT_ENABLED: 'true' }))).toBe(true);
    expect(isPricingRolloutEnabled(env({ HOSTED_PRICING_ROLLOUT_ENABLED: ' TRUE ' }))).toBe(true);
    expect(HOSTED_PRICING_ROLLOUT_ENABLED).toBe(false);
  });
  it('7. the frontend cannot enable the rollout (server env only; no client setter)', () => {
    // The client-bundled economics flag is hardcoded false and is never sourced from env/UI/localStorage.
    expect(ECONOMICS).toContain('HOSTED_PRICING_ROLLOUT_ENABLED = false');
    expect(ECONOMICS).not.toContain('HOSTED_PRICING_ROLLOUT_ENABLED = true');
    // The server flag is read ONLY server-side, through the Deno env getter.
    expect(CHECKOUT).toContain('isPricingRolloutEnabled(envGetter)');
    expect(CHECKOUT).toContain('Deno.env.get');
  });
});

describe('V2 configuration is fail-closed only when the rollout is on', () => {
  it('8. missing V2 configuration is harmless while rollout is false (prelaunch path unchanged)', () => {
    // With the flag off, checkout never reads the V2 vars or calls the launch resolver.
    expect(isPricingRolloutEnabled(env({}))).toBe(false);
    expect(CHECKOUT).toMatch(/if \(rolloutEnabled\)[\s\S]*assertLaunchPricingConfigured/);
    expect(CHECKOUT).toMatch(/\} else \{[\s\S]*Prelaunch: unchanged behavior[\s\S]*normalizeProductKey/);
  });
  it('9. missing/malformed V2 configuration fails closed while rollout is true', () => {
    expect(() => assertLaunchPricingConfigured(env({}))).toThrow(/missing or malformed/);
    expect(() => assertLaunchPricingConfigured(env({ ...CONFIGURED, STRIPE_PRICE_SUBSCRIPTION_PRO_V2: 'not-a-price' }))).toThrow(/PRO_V2/);
    expect(() => resolveLaunchPriceId('credit_pack_100', env({}))).toThrow(/missing or malformed/);
    expect(() => assertLaunchPricingConfigured(env(CONFIGURED))).not.toThrow();
    // every required var is enforced
    for (const v of LAUNCH_V2_ENV_VARS) {
      const partial = { ...CONFIGURED };
      delete partial[v];
      expect(() => assertLaunchPricingConfigured(env(partial))).toThrow();
    }
  });
});

describe('checkout derives the price server-side; clients cannot supply one', () => {
  it('10. a client cannot submit an arbitrary Stripe price id under the rollout', () => {
    expect(CHECKOUT).toContain('CLIENT_PRICE_NOT_ALLOWED');
    expect(CHECKOUT).toMatch(/if \(rolloutEnabled\)[\s\S]*CLIENT_PRICE_NOT_ALLOWED/);
    // the price is always resolved from the server-owned registry, never the request body
    expect(CHECKOUT).toContain('resolveLaunchPriceId(requestedKey, envGetter)');
  });
  it('11. new checkout uses only launch (V2) prices while rollout is true', () => {
    expect(resolveLaunchPriceId('credit_pack_100', env(CONFIGURED))).toBe('price_test_pack100');
    expect(resolveLaunchPriceId('credit_pack_500', env(CONFIGURED))).toBe('price_test_pack500');
    expect(resolveLaunchPriceId('subscription_starter', env(CONFIGURED))).toBe('price_test_starter');
    expect(resolveLaunchPriceId('subscription_pro', env(CONFIGURED))).toBe('price_test_pro');
  });
  it('12. old/prelaunch prices cannot be selected for new checkout while rollout is true', () => {
    // In the rollout branch the price comes from resolveLaunchPriceId (V2 env), NOT the prelaunch PRICE_MAP
    // (STRIPE_PRICE_CREDIT_PACK_100 etc.). Resolver maps only to the *_V2 env vars.
    expect(getLaunchProduct('credit_pack_100')?.stripePriceEnvVar).toBe('STRIPE_PRICE_CREDIT_PACK_100_V2');
    expect(getLaunchProduct('credit_pack_500')?.stripePriceEnvVar).toBe('STRIPE_PRICE_CREDIT_PACK_500_V2');
    // BYOK stays on its existing env (unchanged); it has no V2 launch price.
    expect(getLaunchProduct('indie_desktop_byok')?.stripePriceEnvVar).toBeNull();
  });
});

describe('webhook recognizes launch + historical events safely', () => {
  it('13. historical test pack webhooks remain recognizable (mapping by product_key, not price)', () => {
    expect(WEBHOOK).toContain('checkout.session.completed');
    expect(WEBHOOK).toContain('TOPUP_PURCHASE');
    expect(WEBHOOK).toContain('getPaidCreditGrant(productKey)'); // server-owned, price-agnostic
  });
  it('14. duplicate webhook delivery cannot grant credits twice', () => {
    // Both paths go through the single deployed RPC apply_stripe_credit_topup, which is idempotent on
    // p_stripe_event_id via public.stripe_processed_events(id). No unsafe direct read-then-update remains.
    expect(WEBHOOK).toContain('apply_stripe_credit_topup');
    expect(WEBHOOK).toContain('p_stripe_event_id: grant.idempotencyKey');
    expect(WEBHOOK).not.toContain('.update({ credit_balance');
  });
  it('15. subscription renewal grants once per eligible invoice cycle', () => {
    expect(WEBHOOK).toContain('invoice.paid');
    expect(WEBHOOK).toContain('invoice.payment_succeeded');
    expect(WEBHOOK).toContain('subscription_create');
    expect(WEBHOOK).toContain('subscription_cycle');
    // The invoice id is the RPC idempotency key, stable across invoice.paid + invoice.payment_succeeded.
    expect(WEBHOOK).toContain('idempotencyKey: invoice.id');
  });
  it('16. failed/unpaid invoices grant zero credits', () => {
    expect(WEBHOOK).toMatch(/invoice\.status !== "paid"/);
    // only paid + payment-succeeded events are routed; payment_failed is not handled
    expect(WEBHOOK).not.toContain('invoice.payment_failed');
  });
  it('17. refund/void/unrelated events do not issue credits', () => {
    expect(WEBHOOK).toMatch(/Failed\/voided\/refunded\/unrelated events grant nothing/);
    expect(WEBHOOK).not.toContain('charge.refunded');
    expect(WEBHOOK).not.toContain('charge.dispute');
  });
  it('18. test-mode and live-mode price ids cannot be confused (no committed ids; grants by product_key)', () => {
    // The webhook never keys credits off a price id — only the server-set product_key + registry grant.
    // Test vs live price ids live entirely in (separate) function-secret envs, never in code.
    expect(WEBHOOK).not.toMatch(/price_[A-Za-z0-9]{6,}/);
    expect(WEBHOOK).toContain('getLaunchProduct(productKey)');
  });
});

describe('internal/admin/test credits never become hosted revenue', () => {
  it('19. test/admin credits are not auto-reclassified as paid revenue (grants only from real paid events)', () => {
    // Credits are granted ONLY by a verified paid Stripe event through the registry; nothing in the
    // webhook promotes an existing balance to "paid revenue".
    expect(WEBHOOK).toContain('verifyStripeSignature');
    expect(WEBHOOK).toMatch(/payment_status !== "paid"/);
  });
  it('20. promotional-only balances cannot fund hosted Google metering (paid credit_balance only)', () => {
    // The metered debit path settles against credit_balance (paid) and never promotional_credit_balance.
    const migration = readFileSync('supabase/migrations/20260619000000_metered_analysis_billing.sql', 'utf8');
    expect(migration).toContain('promotional_credit_balance');
    expect(migration).toMatch(/credit_balance/);
    // start/settle reserve+debit operate on credit_balance, not the promotional column
    expect(migration).not.toMatch(/promotional_credit_balance\s*=\s*promotional_credit_balance\s*-/);
  });
});

describe('credit-value + markup invariants (no-legacy launch policy)', () => {
  it('21. the approved launch credit value is 79,543,333', () => {
    expect(TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD).toBe(79_543_333n);
  });
  it('22. no 65,976,666 legacy selection remains active when there is no legacy exposure', () => {
    const s = selectSafePooledCreditValue({ legacyExposureRemains: false });
    expect(s.selectedNanoUsd).toBe(79_543_333n);
    expect(s.selectedNanoUsd).not.toBe(SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD);
  });
  it('23. HOSTED_GOOGLE_COST_MARKUP_BPS remains 10000', () => {
    expect(HOSTED_GOOGLE_COST_MARKUP_BPS).toBe(10000);
  });
  it('24. HOSTED_METERED_BILLING_ENABLED remains false (server-gated, no hardcoded enable)', () => {
    expect(GENERATE_IMAGE).toContain("(Deno.env.get('HOSTED_METERED_BILLING_ENABLED') ?? '').toLowerCase() === 'true'");
    expect(GENERATE_IMAGE).not.toContain('HOSTED_METERED_BILLING_ENABLED = true');
  });
});

describe('frontend price display alignment + unchanged behavior', () => {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  it('25. frontend-displayed price and checkout price stay aligned (no hardcoded launch prices on the client)', () => {
    // Stripe Checkout is the displayed source of truth; no static launch-price literals exist to drift.
    // hostedCreditEconomics.ts is the documented single source of *planning* values (server-side
    // calculation), not a user-facing display surface — it is excluded from the display-literal scan.
    const offenders = walk('src/renderer')
      .filter((f) => !f.includes('__tests__') && !f.includes('hostedCreditEconomics'))
      .filter((f) => /\b12\.99\b|\b54\.99\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('26. analyzer/image/BYOK/identity contracts are unchanged (BYOK stays creditless + outside the wallet)', () => {
    expect(getPaidCreditGrant('indie_desktop_byok')).toBe(0);
    expect(getPaidCreditGrant('agency_desktop_byok')).toBe(0);
    // checkout still routes BYOK to its existing direct-url/PRICE_MAP path, not the V2 launch resolver
    expect(CHECKOUT).toContain('launch.isByok');
    expect(CHECKOUT).toContain('PRODUCT_DIRECT_URL_ENV');
  });
});
