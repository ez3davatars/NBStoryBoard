import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BYOK_PRODUCT_KEYS,
  FIXED_TRANSACTION_COST_NANO_USD,
  HOSTED_PRICING_ROLLOUT_ENABLED,
  LEGACY_HOSTED_CREDIT_PRODUCTS,
  ONE_TIME_TOTAL_RESERVE_BPS,
  PROPOSED_HOSTED_CREDIT_PRODUCTS,
  SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD,
  SUBSCRIPTION_TOTAL_RESERVE_BPS,
  TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD,
  calculateHostedGoogleCustomerPrice,
  calculateNetCreditValueNanoUsd,
  convertCustomerPriceToMicrocredits,
  parseHostedCreditValueNanoUsd,
  selectMinimumNetCreditValue,
  selectSafePooledCreditValue,
  type HostedCreditProductEconomics
} from '../hostedCreditEconomics';

const byKey = (products: readonly HostedCreditProductEconomics[], key: string, status: string) =>
  products.find((p) => p.productKey === key && p.status === status)!;
const valueOf = (products: readonly HostedCreditProductEconomics[], key: string, status: string) =>
  calculateNetCreditValueNanoUsd(byKey(products, key, status));

describe('reserve assumptions', () => {
  it('1. one-time reserve is 1790 bps', () => expect(ONE_TIME_TOTAL_RESERVE_BPS).toBe(1790));
  it('2. subscription reserve is 1860 bps', () => expect(SUBSCRIPTION_TOTAL_RESERVE_BPS).toBe(1860));
  it('3. fixed transaction cost is 300,000,000 nano-USD', () => expect(FIXED_TRANSACTION_COST_NANO_USD).toBe(300_000_000n));
});

describe('proposed-price economics', () => {
  it('4. proposed 100-pack = 103,647,900 nano/credit', () => expect(valueOf(PROPOSED_HOSTED_CREDIT_PRODUCTS, 'credit_pack_100', 'proposed')).toBe(103_647_900n));
  it('5. proposed 500-pack = 89,693,580', () => expect(valueOf(PROPOSED_HOSTED_CREDIT_PRODUCTS, 'credit_pack_500', 'proposed')).toBe(89_693_580n));
  it('6. proposed Starter floors to 79,543,333', () => expect(valueOf(PROPOSED_HOSTED_CREDIT_PRODUCTS, 'subscription_starter', 'proposed')).toBe(79_543_333n));
  it('7. proposed Pro floors to 80,471,666', () => expect(valueOf(PROPOSED_HOSTED_CREDIT_PRODUCTS, 'subscription_pro', 'proposed')).toBe(80_471_666n));
  it('8. proposed minimum is 79,543,333', () => {
    expect(selectMinimumNetCreditValue(PROPOSED_HOSTED_CREDIT_PRODUCTS)).toBe(79_543_333n);
    expect(TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD).toBe(79_543_333n);
  });
});

describe('current/legacy-price economics', () => {
  it('9. current 100-pack = 79,100,000', () => expect(valueOf(LEGACY_HOSTED_CREDIT_PRODUCTS, 'credit_pack_100', 'legacy')).toBe(79_100_000n));
  it('10. current 500-pack = 73,290,000', () => expect(valueOf(LEGACY_HOSTED_CREDIT_PRODUCTS, 'credit_pack_500', 'legacy')).toBe(73_290_000n));
  it('11. current Starter floors to 65,976,666', () => expect(valueOf(LEGACY_HOSTED_CREDIT_PRODUCTS, 'subscription_starter', 'legacy')).toBe(65_976_666n));
  it('12. current Pro = 66,905,000', () => expect(valueOf(LEGACY_HOSTED_CREDIT_PRODUCTS, 'subscription_pro', 'legacy')).toBe(66_905_000n));
  it('13. legacy minimum is 65,976,666', () => {
    expect(selectMinimumNetCreditValue(LEGACY_HOSTED_CREDIT_PRODUCTS)).toBe(65_976_666n);
    expect(SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD).toBe(65_976_666n);
  });
});

describe('pooled-wallet credit-value selection (legacy safety)', () => {
  it('14. a pooled wallet with legacy exposure selects the legacy minimum', () => {
    const s = selectSafePooledCreditValue({ legacyExposureRemains: true });
    expect(s.selectedNanoUsd).toBe(65_976_666n);
    expect(s.basis).toBe('legacy_safe_pooled');
  });
  it('15. only a wallet with no legacy exposure selects 79,543,333', () => {
    const s = selectSafePooledCreditValue({ legacyExposureRemains: false });
    expect(s.selectedNanoUsd).toBe(79_543_333n);
    expect(s.basis).toBe('proposed_minimum');
  });
});

describe('Google markup contract + microcredit conversion', () => {
  it('16/19. Google cost $0.002 -> $0.004; $0.10 -> $0.20 (×2, no extra overhead)', () => {
    expect(calculateHostedGoogleCustomerPrice(2_000_000n)).toBe(4_000_000n);
    expect(calculateHostedGoogleCustomerPrice(100_000_000n)).toBe(200_000_000n);
  });
  it('17. proposed-value conversion of $0.004 = 50,288 microcredits', () => {
    expect(convertCustomerPriceToMicrocredits(4_000_000n, TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD)).toBe(50_288n);
  });
  it('18. legacy-safe conversion of $0.004 = 60,628 microcredits', () => {
    expect(convertCustomerPriceToMicrocredits(4_000_000n, SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD)).toBe(60_628n);
  });
  it('20. proposed-value conversion of $0.20 = 2,514,353 microcredits', () => {
    expect(convertCustomerPriceToMicrocredits(200_000_000n, TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD)).toBe(2_514_353n);
  });
  it('21. legacy-safe conversion of $0.20 = 3,031,375 microcredits', () => {
    expect(convertCustomerPriceToMicrocredits(200_000_000n, SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD)).toBe(3_031_375n);
  });
  it('22. ceiling conversion never charges below the required 2× net amount', () => {
    // exact-division case stays exact; any remainder rounds up (never down).
    expect(convertCustomerPriceToMicrocredits(79_543_333n, TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD)).toBe(1_000_000n); // exactly 1 credit
    expect(convertCustomerPriceToMicrocredits(79_543_334n, TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD)).toBe(1_000_001n); // 1 nano over -> rounds up
    expect(convertCustomerPriceToMicrocredits(1n, TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD)).toBe(1n); // tiny charge -> >= 1 microcredit
  });
});

describe('tax + product exclusions + no double overhead', () => {
  it('23/24. sales tax is excluded from package revenue, but the Stripe Tax SERVICE reserve (50bps) is included', () => {
    // The reserve total includes only the 50bps Stripe Tax service reserve, never collected sales tax.
    // 290+50+200+50+200+1000 = 1790 ; remove the 50bps service reserve => 1740 (proof it is the only tax component).
    expect(ONE_TIME_TOTAL_RESERVE_BPS - 50).toBe(1740);
    const src = readFileSync('src/renderer/services/hostedCreditEconomics.ts', 'utf8');
    expect(src).toContain('STRIPE_TAX_SERVICE_BPS = 50');
    // Revenue is derived purely from gross ex-tax price × reserve − fixed cost; no sales-tax term exists.
    expect(src).not.toMatch(/salesTax|collectedTax|vatCollected/i);
  });
  it('25. BYOK products are excluded from every credit-value registry', () => {
    const keys = [...PROPOSED_HOSTED_CREDIT_PRODUCTS, ...LEGACY_HOSTED_CREDIT_PRODUCTS].map((p) => p.productKey);
    for (const byok of BYOK_PRODUCT_KEYS) expect(keys).not.toContain(byok);
  });
  it('26. promotional credits are excluded from the paid-credit value (divides by paidCredits only)', () => {
    const withPromo: HostedCreditProductEconomics = { ...PROPOSED_HOSTED_CREDIT_PRODUCTS[0], promotionalCredits: 50n };
    // value must equal the same product valued on paidCredits alone, regardless of promo credits.
    expect(calculateNetCreditValueNanoUsd(withPromo)).toBe(103_647_900n);
  });
  it('27. the overhead reserve is NOT applied a second time to the Google cost', () => {
    // customer price is exactly ×2 of list cost — no 17.9%/18.6% reserve multiplier on the provider call.
    expect(calculateHostedGoogleCustomerPrice(123_456_789n)).toBe(246_913_578n);
  });
});

describe('rollout safety + fail-closed runtime', () => {
  it('28. the economics module invents no Stripe price IDs (price IDs are env-supplied)', () => {
    const src = readFileSync('src/renderer/services/hostedCreditEconomics.ts', 'utf8');
    expect(src).not.toMatch(/price_[A-Za-z0-9]{6,}/); // no Stripe price_xxx literals
  });
  it('29. runtime credit-value config is fail-closed (missing/malformed/zero/negative => null)', () => {
    expect(parseHostedCreditValueNanoUsd(undefined)).toBeNull();
    expect(parseHostedCreditValueNanoUsd('')).toBeNull();
    expect(parseHostedCreditValueNanoUsd('not-a-number')).toBeNull();
    expect(parseHostedCreditValueNanoUsd('0')).toBeNull();
    expect(parseHostedCreditValueNanoUsd('-5')).toBeNull();
    expect(parseHostedCreditValueNanoUsd('79543333')).toBe(79_543_333n);
    // edge mirrors this fail-closed behavior (no silent default).
    const edge = readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
    expect(edge).toContain("Deno.env.get('HOSTED_CREDIT_USD_VALUE_NANO_USD')");
    expect(edge).not.toContain('HOSTED_CREDIT_USD_VALUE_NANO_USD ?? ');
  });
  it('30. metered billing stays disabled by default and the pricing rollout is gated off', () => {
    expect(HOSTED_PRICING_ROLLOUT_ENABLED).toBe(false);
    const edge = readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
    // flag defaults to false (only env "true" enables it); no hardcoded enable.
    expect(edge).toContain("(Deno.env.get('HOSTED_METERED_BILLING_ENABLED') ?? '').toLowerCase() === 'true'");
    expect(edge).not.toContain('HOSTED_METERED_BILLING_ENABLED = true');
    // the frontend has no mechanism to enable metered billing (server-env only).
    const grepClient = readFileSync('src/renderer/services/hostedCreditEconomics.ts', 'utf8');
    expect(grepClient).not.toContain('HOSTED_METERED_BILLING_ENABLED');
  });
});
