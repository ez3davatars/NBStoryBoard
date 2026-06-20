// Single source of truth for hosted-credit economics: the net USD value of one PAID customer credit
// after payment fees, refunds, disputes, infrastructure, and support/operating reserves.
//
// These reserves are BUSINESS-PLANNING assumptions, not claims about provider rates, and not tax/
// accounting advice. All currency math uses BigInt nano-USD with explicit integer (floor/ceil)
// rounding — never JavaScript floating point. Version: hosted-credit-economics-2026-06-v1.
//
// The Google markup contract is unchanged (customer price = provider list cost × 2). The overhead
// reserves are represented ONCE, here, in the per-credit USD value — they are NOT re-applied to each
// Google request (that would double-count the same expenses). See docs/hosted-credit-economics-*.

import {
  applyMarkupNanoUsd,
  customerPriceToMicrocredits,
  HOSTED_GOOGLE_COST_MARKUP_BPS
} from './hostedMeteredPricing';

export const HOSTED_CREDIT_ECONOMICS_VERSION = 'hosted-credit-economics-2026-06-v1';

// ===== Reserve assumptions (basis points). One source of truth — update here only. =====
export const PAYMENT_PROCESSING_BPS = 290;       // Stripe card processing 2.9%
export const STRIPE_BILLING_BPS = 70;            // Stripe Billing 0.7% (subscriptions only)
export const STRIPE_TAX_SERVICE_BPS = 50;        // Stripe Tax Basic service fee reserve 0.5%
export const REFUND_RESERVE_BPS = 200;           // Internal refund reserve 2.0%
export const DISPUTE_RESERVE_BPS = 50;           // Internal dispute/fraud reserve 0.5%
export const INFRASTRUCTURE_RESERVE_BPS = 200;   // Internal storage/infrastructure reserve 2.0%
export const SUPPORT_OPERATIONS_RESERVE_BPS = 1000; // Internal support/monitoring/admin/ops 10.0%

// International / FX / alternative-payment planning reserves. Default 0 until product-owner data
// supports another value. The domestic-USD baseline does NOT guarantee the same margin for these.
export const INTERNATIONAL_CARD_RESERVE_BPS = 0;
export const CURRENCY_CONVERSION_RESERVE_BPS = 0;
export const ALTERNATIVE_PAYMENT_METHOD_RESERVE_BPS = 0;

// Derived totals (computed from the single source above).
export const ONE_TIME_TOTAL_RESERVE_BPS =
  PAYMENT_PROCESSING_BPS + STRIPE_TAX_SERVICE_BPS + REFUND_RESERVE_BPS + DISPUTE_RESERVE_BPS +
  INFRASTRUCTURE_RESERVE_BPS + SUPPORT_OPERATIONS_RESERVE_BPS +
  INTERNATIONAL_CARD_RESERVE_BPS + CURRENCY_CONVERSION_RESERVE_BPS + ALTERNATIVE_PAYMENT_METHOD_RESERVE_BPS; // 1790
export const SUBSCRIPTION_TOTAL_RESERVE_BPS = ONE_TIME_TOTAL_RESERVE_BPS + STRIPE_BILLING_BPS;               // 1860

export const FIXED_TRANSACTION_COST_NANO_USD = 300_000_000n; // $0.30 per successful transaction

// Pricing-rollout master flag: the proposed retail prices are PLANNING values only. They must not drive
// checkout until matching Stripe price IDs exist (env-supplied). Keep false.
export const HOSTED_PRICING_ROLLOUT_ENABLED = false;

// BYOK products grant NO hosted credits and are excluded from every hosted-credit value calculation.
export const BYOK_PRODUCT_KEYS = [
  'indie_desktop_byok',
  'agency_commercial_byok',
  'indie_updates_support_renewal',
  'agency_updates_priority_support_renewal'
] as const;

export type HostedCreditProductEconomics = {
  productKey: string;
  kind: 'one_time' | 'subscription';
  grossPriceNanoUsd: bigint;
  paidCredits: bigint;
  promotionalCredits: bigint;
  reserveBasisPoints: bigint;
  fixedTransactionCostNanoUsd: bigint;
  status: 'legacy' | 'proposed';
};

/**
 * Net revenue (nano-USD) retained from one package sale after percentage reserves and the fixed
 * per-transaction cost. floor(gross × (10000 - reserveBps) / 10000) - fixedTransactionCost.
 * Sales tax/VAT/GST are NOT included (pass-through; only the Stripe Tax SERVICE reserve is in reserveBps).
 */
export const calculateNetPackageRevenueNanoUsd = (p: HostedCreditProductEconomics): bigint => {
  if (p.reserveBasisPoints < 0n || p.reserveBasisPoints >= 10000n) {
    throw new Error('reserveBasisPoints must be in [0, 10000)');
  }
  const afterReserve = (p.grossPriceNanoUsd * (10000n - p.reserveBasisPoints)) / 10000n; // BigInt floor
  return afterReserve - p.fixedTransactionCostNanoUsd;
};

/** Net USD value (nano-USD) of one PAID credit: floor(netRevenue / paidCredits). Promo credits excluded. */
export const calculateNetCreditValueNanoUsd = (p: HostedCreditProductEconomics): bigint => {
  if (p.paidCredits <= 0n) throw new Error('paidCredits must be > 0 to value a credit');
  return calculateNetPackageRevenueNanoUsd(p) / p.paidCredits; // BigInt floor; promotionalCredits ignored
};

/** The conservative (minimum) net credit value across a set of products. */
export const selectMinimumNetCreditValue = (products: readonly HostedCreditProductEconomics[]): bigint => {
  if (products.length === 0) throw new Error('no products to evaluate');
  return products.map(calculateNetCreditValueNanoUsd).reduce((min, v) => (v < min ? v : min));
};

// ===== Google markup contract (unchanged; overhead is NOT re-applied here) =====
export const calculateHostedGoogleCustomerPrice = (providerListCostNanoUsd: bigint): bigint =>
  applyMarkupNanoUsd(providerListCostNanoUsd, HOSTED_GOOGLE_COST_MARKUP_BPS); // ×2 at 10000 bps

export const convertCustomerPriceToMicrocredits = (
  customerPriceNanoUsd: bigint,
  netCreditValueNanoUsd: bigint
): bigint => customerPriceToMicrocredits(customerPriceNanoUsd, netCreditValueNanoUsd); // ceilDiv × 1e6

// ===== Product registries (BYOK excluded). Proposed = planning; legacy = current live prices. =====
const mk = (
  productKey: string,
  kind: 'one_time' | 'subscription',
  grossNano: bigint,
  paidCredits: bigint,
  status: 'legacy' | 'proposed',
  promotionalCredits = 0n
): HostedCreditProductEconomics => ({
  productKey,
  kind,
  grossPriceNanoUsd: grossNano,
  paidCredits,
  promotionalCredits,
  reserveBasisPoints: BigInt(kind === 'subscription' ? SUBSCRIPTION_TOTAL_RESERVE_BPS : ONE_TIME_TOTAL_RESERVE_BPS),
  fixedTransactionCostNanoUsd: FIXED_TRANSACTION_COST_NANO_USD,
  status
});

export const PROPOSED_HOSTED_CREDIT_PRODUCTS: readonly HostedCreditProductEconomics[] = [
  mk('credit_pack_100', 'one_time', 12_990_000_000n, 100n, 'proposed'),   // $12.99
  mk('credit_pack_500', 'one_time', 54_990_000_000n, 500n, 'proposed'),   // $54.99
  mk('subscription_starter', 'subscription', 59_000_000_000n, 600n, 'proposed'),   // $59/mo
  mk('subscription_pro', 'subscription', 119_000_000_000n, 1_200n, 'proposed')     // $119/mo
];

export const LEGACY_HOSTED_CREDIT_PRODUCTS: readonly HostedCreditProductEconomics[] = [
  mk('credit_pack_100', 'one_time', 10_000_000_000n, 100n, 'legacy'),     // $10.00
  mk('credit_pack_500', 'one_time', 45_000_000_000n, 500n, 'legacy'),     // $45.00
  mk('subscription_starter', 'subscription', 49_000_000_000n, 600n, 'legacy'),     // $49/mo
  mk('subscription_pro', 'subscription', 99_000_000_000n, 1_200n, 'legacy')        // $99/mo
];

// Derived minimums (the conservative per-credit value for each price generation).
export const TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD = selectMinimumNetCreditValue(PROPOSED_HOSTED_CREDIT_PRODUCTS); // 79_543_333
export const SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD = selectMinimumNetCreditValue(LEGACY_HOSTED_CREDIT_PRODUCTS);   // 65_976_666

export type CreditValueSelection = {
  selectedNanoUsd: bigint;
  basis: 'legacy_safe_pooled' | 'proposed_minimum';
  reason: string;
};

/**
 * Selects the pooled-wallet credit value. While ANY legacy-priced exposure remains (outstanding legacy
 * credits / grandfathered subscriptions / no purchase-lot accounting), the lower legacy-safe value must
 * be used so legacy credits are never over-valued. The higher proposed value is selected only when there
 * is no legacy exposure. Never silently selects the higher value.
 */
export const selectSafePooledCreditValue = (params: { legacyExposureRemains: boolean }): CreditValueSelection => {
  if (params.legacyExposureRemains) {
    return {
      selectedNanoUsd: SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD,
      basis: 'legacy_safe_pooled',
      reason: 'Pooled wallet still has legacy-priced credit exposure; using the legacy-safe minimum avoids over-valuing legacy credits.'
    };
  }
  return {
    selectedNanoUsd: TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD,
    basis: 'proposed_minimum',
    reason: 'No legacy exposure remains (or purchase-lot accounting tracks per-lot value); the proposed-price minimum applies.'
  };
};

export const explainCreditValueSelection = (params: { legacyExposureRemains: boolean }): string => {
  const s = selectSafePooledCreditValue(params);
  return `${s.basis}=${s.selectedNanoUsd.toString()} nano-USD/credit — ${s.reason}`;
};

/**
 * Fail-closed parser for the runtime HOSTED_CREDIT_USD_VALUE_NANO_USD config. Returns null for missing,
 * malformed, zero, or negative values (mirrors the edge function's readCreditValueNanoUsd). The runtime
 * MUST never silently hardcode a default — an absent/invalid value disables metered charging.
 */
export const parseHostedCreditValueNanoUsd = (raw: string | null | undefined): bigint | null => {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  try {
    const v = BigInt(raw.trim());
    return v > 0n ? v : null;
  } catch {
    return null;
  }
};
