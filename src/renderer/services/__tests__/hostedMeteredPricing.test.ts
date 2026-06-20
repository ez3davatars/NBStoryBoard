import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HOSTED_GOOGLE_COST_MARKUP_BPS,
  HOSTED_GOOGLE_GROSS_MARGIN_BPS,
  HOSTED_GOOGLE_PRICING_VERSION,
  HOSTED_GOOGLE_TOKEN_PRICING,
  MICROCREDITS_PER_CREDIT,
  METERED_PROMO_CREDIT_POLICY,
  InvalidProviderUsageError,
  UnknownProviderPricingError,
  UnknownServiceTierError,
  UnregisteredCalculatorError,
  applyMarkupNanoUsd,
  assertCalculatorRegistered,
  computeCustomerPriceNanoUsd,
  computeProviderListCostNanoUsd,
  computeReservationMicrocredits,
  customerPriceToMicrocredits,
  normalizeProviderUsage,
  normalizeServiceTier,
  settleProviderCall,
  type ProviderUsage
} from '../hostedMeteredPricing';

const usage = (u: Partial<ProviderUsage>): ProviderUsage => ({
  promptTokenCount: 0, cachedContentTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0, ...u
});

describe('provider list cost calculation', () => {
  it('7. Gemini 2.5 Flash Standard: uncached input + output', () => {
    // 1000 uncached @300 + 500 output @2500 = 300_000 + 1_250_000 = 1_550_000
    expect(computeProviderListCostNanoUsd('gemini-2.5-flash', usage({ promptTokenCount: 1000, candidatesTokenCount: 500 }))).toBe(1_550_000n);
  });
  it('8. Gemini 2.5 Flash-Lite Standard: uncached input + output', () => {
    // 1000 @100 + 500 @400 = 100_000 + 200_000 = 300_000
    expect(computeProviderListCostNanoUsd('gemini-2.5-flash-lite', usage({ promptTokenCount: 1000, candidatesTokenCount: 500 }))).toBe(300_000n);
  });
  it('cached input uses the discounted rate; candidate + thinking both billed as output', () => {
    expect(computeProviderListCostNanoUsd('gemini-2.5-flash', usage({ promptTokenCount: 1000, cachedContentTokenCount: 400 }))).toBe(192_000n);
    expect(computeProviderListCostNanoUsd('gemini-2.5-flash', usage({ candidatesTokenCount: 300, thoughtsTokenCount: 200 }))).toBe(1_250_000n);
  });
});

describe('markup is 2× (100% markup / 50% margin)', () => {
  it('1. provider cost 2,000,000 → markup 2,000,000, customer price 4,000,000', () => {
    const cost = 2_000_000n;
    const price = applyMarkupNanoUsd(cost);
    expect(price).toBe(4_000_000n);
    const profit = price - cost;
    expect(profit).toBe(2_000_000n); // markup === provider cost
  });

  it('2. provider cost $0.10 → customer price $0.20', () => {
    // $0.10 = 100_000_000 nano-USD ; $0.20 = 200_000_000
    expect(applyMarkupNanoUsd(100_000_000n)).toBe(200_000_000n);
  });

  it('3/4. profit === provider cost and customer price === provider cost × 2', () => {
    for (const cost of [1n, 7n, 999n, 1_550_000n, 12_345_678n]) {
      const price = applyMarkupNanoUsd(cost);
      const profit = price - cost;
      expect(price).toBe(cost * 2n);
      expect(profit).toBe(cost);
    }
  });

  it('5. HOSTED_GOOGLE_COST_MARKUP_BPS === 10000 and gross margin === 5000 bps', () => {
    expect(HOSTED_GOOGLE_COST_MARKUP_BPS).toBe(10000);
    expect(HOSTED_GOOGLE_GROSS_MARGIN_BPS).toBe(5000);
  });

  it('composes cost + markup via computeCustomerPriceNanoUsd', () => {
    const price = computeCustomerPriceNanoUsd('gemini-2.5-flash', usage({ promptTokenCount: 1000, candidatesTokenCount: 500 }));
    expect(price).toBe(3_100_000n); // 1_550_000 × 2
  });
});

describe('6. no legacy 1.5× / 5000-markup rule remains', () => {
  const moduleSrc = () => readFileSync('src/renderer/services/hostedMeteredPricing.ts', 'utf8');
  const edgeSrc = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
  it('pricing module and edge contain no 1.5× / profit×3 / 5000-default markup', () => {
    for (const src of [moduleSrc(), edgeSrc()]) {
      expect(src).not.toContain('× 1.5');
      expect(src).not.toContain('x 1.5');
      expect(src).not.toContain('cost × 1.5');
      expect(src).not.toContain('profit * 3');
      expect(src).not.toContain("?? '5000'"); // old env default for the markup
      expect(src).not.toContain('COST_MARKUP_BPS = 5000'); // markup constant is no longer 5000
    }
  });
});

describe('fail-closed validation (no client trust, no zero fallback)', () => {
  it('20. rejects non-integer/negative usage fields (client-supplied counts cannot poison cost)', () => {
    expect(() => normalizeProviderUsage({ promptTokenCount: -5 })).toThrow(InvalidProviderUsageError);
    expect(() => normalizeProviderUsage({ candidatesTokenCount: 1.5 })).toThrow(InvalidProviderUsageError);
  });
  it('10. unknown model fails closed', () => {
    expect(() => computeProviderListCostNanoUsd('gpt-x', usage({ promptTokenCount: 100 }))).toThrow(UnknownProviderPricingError);
  });
  it('9. unknown / non-standard service tier fails closed (no silent Standard pricing)', () => {
    expect(normalizeServiceTier(undefined)).toBe('standard');
    expect(normalizeServiceTier('STANDARD')).toBe('standard');
    expect(() => normalizeServiceTier('batch')).toThrow(UnknownServiceTierError);
    expect(() => normalizeServiceTier('flex')).toThrow(UnknownServiceTierError);
    expect(() => normalizeServiceTier('priority')).toThrow(UnknownServiceTierError);
    // an unpriced model+tier combination fails closed at cost time
    expect(() => computeProviderListCostNanoUsd('gemini-2.5-flash', usage({ promptTokenCount: 10 }), 'batch' as never)).toThrow(UnknownProviderPricingError);
  });
});

describe('microcredit conversion (never below exact 2× price)', () => {
  const CREDIT_VALUE_NANO = 10_000_000n; // example: 1 credit = $0.01 (config-driven in production)
  it('19. ceil so the charge is never below the exact 2× customer price', () => {
    // list 270_000 → price 540_000 → at $0.01/credit → 0.054 credits = 54_000 microcredits
    const price = applyMarkupNanoUsd(270_000n);
    expect(price).toBe(540_000n);
    expect(customerPriceToMicrocredits(price, CREDIT_VALUE_NANO)).toBe(54_000n);
    // a sub-microcredit price still charges at least 1 microcredit (never undercharges to 0)
    expect(customerPriceToMicrocredits(1n, CREDIT_VALUE_NANO)).toBe(1n);
  });
});

describe('settlement + reservation', () => {
  const CREDIT_VALUE_NANO = 10_000_000n;
  it('settleProviderCall returns list cost, ×2 price, tier, pricingSource, reconciliation status', () => {
    const s = settleProviderCall({ model: 'gemini-2.5-flash', usage: usage({ promptTokenCount: 1000, candidatesTokenCount: 500 }), creditValueNanoUsd: CREDIT_VALUE_NANO });
    expect(s.providerListCostNanoUsd).toBe(1_550_000n);
    expect(s.customerPriceNanoUsd).toBe(3_100_000n);
    expect(s.markupBasisPoints).toBe(10000);
    expect(s.grossMarginBasisPoints).toBe(5000);
    expect(s.providerServiceTier).toBe('standard');
    expect(s.pricingSource).toBe('published_rate');
    expect(s.reconciliationStatus).toBe('pending');
    expect(s.providerInvoicedCostNanoUsd).toBeNull();
  });
  it('11(pure). reservation >= any real settlement within the same bounds', () => {
    const bounds = { maxOutputTokens: 512, thinkingBudget: 0, maxImages: 1, maxAttempts: 2, maxBillableMicroUsd: 1_000_000 };
    const reservation = computeReservationMicrocredits({ model: 'gemini-2.5-flash', bounds, maxInputTokens: 4000, creditValueNanoUsd: CREDIT_VALUE_NANO });
    const actual = settleProviderCall({ model: 'gemini-2.5-flash', usage: usage({ promptTokenCount: 3000, candidatesTokenCount: 400 }), creditValueNanoUsd: CREDIT_VALUE_NANO }).creditMicroUnits;
    expect(reservation).toBeGreaterThanOrEqual(actual);
  });
});

describe('16. every hosted Google billing unit has a calculator or fails closed', () => {
  it('token + image metering registered; video/grounding fail closed until implemented', () => {
    expect(() => assertCalculatorRegistered('token')).not.toThrow();
    expect(() => assertCalculatorRegistered('image_output')).not.toThrow();
    expect(() => assertCalculatorRegistered('video_seconds')).toThrow(UnregisteredCalculatorError);
    expect(() => assertCalculatorRegistered('grounding_request')).toThrow(UnregisteredCalculatorError);
  });
});

describe('18. promotional credits cannot fund metered Google operations (strict default)', () => {
  it('promo policy is restrict', () => {
    expect(METERED_PROMO_CREDIT_POLICY).toBe('restrict');
  });
});

describe('25. client/edge pricing registries stay aligned', () => {
  const edge = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
  it('mirrors version, markup, model+tier rates, and microcredit base', () => {
    const s = edge();
    expect(s).toContain(`'${HOSTED_GOOGLE_PRICING_VERSION}'`);
    expect(s).toContain('10000'); // markup default / bps
    for (const [model, tiers] of Object.entries(HOSTED_GOOGLE_TOKEN_PRICING)) {
      const r = tiers.standard!;
      expect(s).toContain(`'${model}': { standard: { uncachedInput: ${r.uncachedInput}, cachedInput: ${r.cachedInput}, output: ${r.output} } }`);
    }
    expect(s).toContain('1000000n');
    expect(MICROCREDITS_PER_CREDIT).toBe(1_000_000n);
  });
});
