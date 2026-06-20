// Server-owned provider pricing for usage-metered hosted Google calls.
//
// Business rule: customer price = provider list cost × 2 (a 100% markup => 50% gross margin).
//   providerListCost  $0.002
//   profit            $0.002   (= provider list cost)
//   customerPrice     $0.004   (= provider list cost × 2)
//
// All currency math uses BigInt nano-USD (1e-9 USD); never floating point. Provider rates, the markup,
// and the service tier are server-only and never client-supplied.
//
// "List" cost = computed from Google's PUBLISHED model+tier rates and the usage Google reported for the
// request. It is NOT the invoiced amount (free quota, promo credits, negotiated/volume pricing, grounding
// free allowance, and invoice adjustments are not reflected). Until invoice reconciliation exists,
// customer pricing uses the published list rate (pricingSource: 'published_rate').
//
// This module is the client mirror (pre-flight estimates + tests). The same constants and formula are
// duplicated in supabase/functions/generate-image/index.ts (the billing authority); a test asserts they
// stay aligned.

export const HOSTED_GOOGLE_PRICING_VERSION = 'gemini-standard-2026-06';

/** 10000 bps => price = cost × (10000 + 10000) / 10000 = cost × 2 (100% markup). */
export const HOSTED_GOOGLE_COST_MARKUP_BPS = 10000;

/** Resulting gross margin = profit / price = cost / (2·cost) = 50% = 5000 bps. */
export const HOSTED_GOOGLE_GROSS_MARGIN_BPS = 5000;

/** 1 displayed credit = 1,000,000 microcredits (Option A: credit micro-units). */
export const MICROCREDITS_PER_CREDIT = 1_000_000n;

// Only Standard tier is priced today. Batch/Flex/Priority/preview must fail closed until added.
export type HostedServiceTier = 'standard';

export type ProviderTokenRates = {
  /** nano-USD per uncached input token */
  uncachedInput: number;
  /** nano-USD per cached input token */
  cachedInput: number;
  /** nano-USD per output (and thinking) token */
  output: number;
};

// Published Gemini token pricing, nano-USD per token, keyed by model then service tier.
export const HOSTED_GOOGLE_TOKEN_PRICING: Record<string, Partial<Record<HostedServiceTier, ProviderTokenRates>>> = {
  'gemini-2.5-flash': { standard: { uncachedInput: 300, cachedInput: 30, output: 2500 } },
  'gemini-2.5-flash-lite': { standard: { uncachedInput: 100, cachedInput: 10, output: 400 } }
};

export type ProviderUsage = {
  promptTokenCount: number;
  cachedContentTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
};

export class UnknownProviderPricingError extends Error {
  constructor(public readonly model: string, public readonly tier: string) {
    super(`No server pricing for provider "${model}" at service tier "${tier}" (pricing version ${HOSTED_GOOGLE_PRICING_VERSION}).`);
    this.name = 'UnknownProviderPricingError';
  }
}

export class UnknownServiceTierError extends Error {
  constructor(public readonly tier: unknown) {
    super(`Unsupported Google service tier "${String(tier)}"; only Standard tier is priced.`);
    this.name = 'UnknownServiceTierError';
  }
}

export class InvalidProviderUsageError extends Error {
  constructor(public readonly field: string, public readonly value: unknown) {
    super(`Invalid provider usage field "${field}": ${String(value)} (expected a non-negative integer).`);
    this.name = 'InvalidProviderUsageError';
  }
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Maps the provider response serviceTier to a priced tier, failing closed for unsupported tiers.
 * Synchronous generateContent has no explicit serviceTier and is billed at Standard; an explicit
 * non-standard tier (batch/flex/priority/preview/unknown) throws rather than silently using Standard.
 */
export const normalizeServiceTier = (raw: unknown): HostedServiceTier => {
  if (raw === undefined || raw === null || raw === '') return 'standard';
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'standard') return 'standard';
  throw new UnknownServiceTierError(raw);
};

/** Validates and normalizes raw Gemini usageMetadata into a ProviderUsage (fails closed). */
export const normalizeProviderUsage = (raw: {
  promptTokenCount?: unknown;
  cachedContentTokenCount?: unknown;
  candidatesTokenCount?: unknown;
  thoughtsTokenCount?: unknown;
}): ProviderUsage => {
  const out = {} as ProviderUsage;
  const fields: Array<keyof ProviderUsage> = ['promptTokenCount', 'cachedContentTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount'];
  for (const name of fields) {
    const value = raw[name] ?? 0;
    if (!isNonNegativeInteger(value)) throw new InvalidProviderUsageError(name, value);
    out[name] = value;
  }
  return out;
};

/** ceil(numerator / denominator) for non-negative BigInts. */
export const ceilDivBigInt = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) throw new Error('ceilDivBigInt: denominator must be positive');
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
};

export const getProviderTokenRates = (model: string, tier: HostedServiceTier): ProviderTokenRates => {
  const rates = HOSTED_GOOGLE_TOKEN_PRICING[model]?.[tier];
  if (!rates) throw new UnknownProviderPricingError(model, tier);
  return rates;
};

/** Published provider list cost (nano-USD) from validated usage at the given model+tier. Fails closed. */
export const computeProviderListCostNanoUsd = (
  model: string,
  usage: ProviderUsage,
  tier: HostedServiceTier = 'standard'
): bigint => {
  const rates = getProviderTokenRates(model, tier);
  const uncachedInput = Math.max(0, usage.promptTokenCount - usage.cachedContentTokenCount);
  const outputTokens = usage.candidatesTokenCount + usage.thoughtsTokenCount;
  return (
    BigInt(uncachedInput) * BigInt(rates.uncachedInput) +
    BigInt(usage.cachedContentTokenCount) * BigInt(rates.cachedInput) +
    BigInt(outputTokens) * BigInt(rates.output)
  );
};

/** Applies the markup: price = ceil(listCost × (10000 + markupBps) / 10000). At 10000 bps this is ×2. */
export const applyMarkupNanoUsd = (
  providerListCostNanoUsd: bigint,
  markupBps: number = HOSTED_GOOGLE_COST_MARKUP_BPS
): bigint => ceilDivBigInt(providerListCostNanoUsd * BigInt(10000 + markupBps), 10000n);

export const computeCustomerPriceNanoUsd = (
  model: string,
  usage: ProviderUsage,
  tier: HostedServiceTier = 'standard',
  markupBps: number = HOSTED_GOOGLE_COST_MARKUP_BPS
): bigint => applyMarkupNanoUsd(computeProviderListCostNanoUsd(model, usage, tier), markupBps);

/**
 * Converts a customer price (nano-USD) into microcredits at the configured USD value per credit.
 * `creditValueNanoUsd` is the minimum realized paid USD value per credit (server config), in nano-USD.
 * microcredits = ceil(priceNanoUsd × 1,000,000 / creditValueNanoUsd) — ceil so we never undercharge.
 */
export const customerPriceToMicrocredits = (
  customerPriceNanoUsd: bigint,
  creditValueNanoUsd: bigint
): bigint => {
  if (creditValueNanoUsd <= 0n) throw new Error('creditValueNanoUsd must be positive');
  return ceilDivBigInt(customerPriceNanoUsd * MICROCREDITS_PER_CREDIT, creditValueNanoUsd);
};

export type PricingSource = 'published_rate' | 'invoice_reconciled';
export type ReconciliationStatus = 'pending' | 'reconciled';

/** Full server-side settlement of one provider call. */
export type MeteredSettlement = {
  pricingVersion: string;
  pricingSource: PricingSource;
  reconciliationStatus: ReconciliationStatus;
  providerModel: string;
  providerServiceTier: HostedServiceTier;
  markupBasisPoints: number;
  grossMarginBasisPoints: number;
  providerListCostNanoUsd: bigint;
  /** Reconciled invoiced cost; null until invoice reconciliation is implemented. */
  providerInvoicedCostNanoUsd: bigint | null;
  customerPriceNanoUsd: bigint;
  creditMicroUnits: bigint;
};

export const settleProviderCall = (params: {
  model: string;
  usage: ProviderUsage;
  tier?: HostedServiceTier;
  creditValueNanoUsd: bigint;
  markupBps?: number;
}): MeteredSettlement => {
  const tier = params.tier ?? 'standard';
  const markupBps = params.markupBps ?? HOSTED_GOOGLE_COST_MARKUP_BPS;
  const providerListCostNanoUsd = computeProviderListCostNanoUsd(params.model, params.usage, tier);
  const customerPriceNanoUsd = applyMarkupNanoUsd(providerListCostNanoUsd, markupBps);
  return {
    pricingVersion: HOSTED_GOOGLE_PRICING_VERSION,
    pricingSource: 'published_rate',
    reconciliationStatus: 'pending',
    providerModel: params.model,
    providerServiceTier: tier,
    markupBasisPoints: markupBps,
    grossMarginBasisPoints: HOSTED_GOOGLE_GROSS_MARGIN_BPS,
    providerListCostNanoUsd,
    providerInvoicedCostNanoUsd: null,
    customerPriceNanoUsd,
    creditMicroUnits: customerPriceToMicrocredits(customerPriceNanoUsd, params.creditValueNanoUsd)
  };
};

/** Per-kind bounds used to compute a conservative reservation that is always >= settlement. */
export type MeteredBounds = {
  maxOutputTokens: number;
  thinkingBudget: number;
  maxImages: number;
  maxAttempts: number;
  maxBillableMicroUsd: number;
};

/**
 * Conservative reservation (microcredits) for a metered call: worst-case bounded usage (max input
 * estimate + maxOutputTokens + thinkingBudget, all uncached/output-priced) × maxAttempts. Always >=
 * any real settlement for the same model+tier+bounds.
 */
export const computeReservationMicrocredits = (params: {
  model: string;
  tier?: HostedServiceTier;
  bounds: MeteredBounds;
  maxInputTokens: number;
  creditValueNanoUsd: bigint;
  markupBps?: number;
}): bigint => {
  const { bounds } = params;
  const worstCaseUsage: ProviderUsage = {
    promptTokenCount: Math.max(0, params.maxInputTokens),
    cachedContentTokenCount: 0, // uncached is the most expensive input
    candidatesTokenCount: Math.max(0, bounds.maxOutputTokens),
    thoughtsTokenCount: Math.max(0, bounds.thinkingBudget)
  };
  const perAttempt = applyMarkupNanoUsd(
    computeProviderListCostNanoUsd(params.model, worstCaseUsage, params.tier ?? 'standard'),
    params.markupBps ?? HOSTED_GOOGLE_COST_MARKUP_BPS
  );
  const attempts = BigInt(Math.max(1, bounds.maxAttempts));
  return customerPriceToMicrocredits(perAttempt * attempts, params.creditValueNanoUsd);
};

// ===== Image generation pricing — gemini-3.1-flash-image (GA), Standard tier =====
// Published Standard rates: input $0.50/1M (500 nano/token); text/thinking output $3.00/1M (3000
// nano/token); image output $60/1M (60000 nano/token). Image-output token counts by resolution drive the
// fixed per-image output cost. Server-owned + versioned; unknown model/tier/resolution fails closed.
export const HOSTED_GOOGLE_IMAGE_PRICING_VERSION = 'gemini-3.1-flash-image-standard-2026-06';

export type ImageResolutionTier = '0.5k' | '1k' | '2k' | '4k';

export type ImageGenerationRates = {
  /** nano-USD per input (text/image) token */
  inputTokenNanoUsd: number;
  /** nano-USD per text/thinking output token */
  textOutputTokenNanoUsd: number;
  /** nano-USD per image-output token */
  imageOutputTokenNanoUsd: number;
  /** image-output token count per generated image, by output resolution */
  imageOutputTokensByResolution: Record<ImageResolutionTier, number>;
};

export const HOSTED_GOOGLE_IMAGE_PRICING: Record<string, Partial<Record<HostedServiceTier, ImageGenerationRates>>> = {
  'gemini-3.1-flash-image': {
    standard: {
      inputTokenNanoUsd: 500,
      textOutputTokenNanoUsd: 3000,
      imageOutputTokenNanoUsd: 60000,
      // 0.5K=747, 1K=1120, 2K=1680, 4K=2520 tokens ⇒ ×60000 = 44_820_000 / 67_200_000 / 100_800_000 / 151_200_000
      imageOutputTokensByResolution: { '0.5k': 747, '1k': 1120, '2k': 1680, '4k': 2520 }
    }
  }
};

export const getImageGenerationRates = (model: string, tier: HostedServiceTier): ImageGenerationRates => {
  const rates = HOSTED_GOOGLE_IMAGE_PRICING[model]?.[tier];
  if (!rates) throw new UnknownProviderPricingError(model, tier);
  return rates;
};

/** Fixed image-output list cost (nano-USD) for one generated image at a resolution. Fails closed. */
export const imageOutputListCostNanoUsd = (model: string, tier: HostedServiceTier, resolution: ImageResolutionTier): bigint => {
  const rates = getImageGenerationRates(model, tier);
  const tokens = rates.imageOutputTokensByResolution[resolution];
  if (tokens === undefined) throw new UnknownProviderPricingError(model, `${tier}/${resolution}`);
  return BigInt(tokens) * BigInt(rates.imageOutputTokenNanoUsd);
};

/**
 * Published image-generation list cost (nano-USD). Sums ALL provider components before any markup:
 *   input tokens × inputRate + (text/thinking output tokens) × textOutputRate
 *   + image-output (fixed by resolution) + separately-billable grounding list cost.
 */
export const computeImageGenerationListCostNanoUsd = (params: {
  model: string;
  tier?: HostedServiceTier;
  resolution: ImageResolutionTier;
  inputTokenCount: number;
  textThinkingOutputTokenCount?: number;
  groundingListCostNanoUsd?: bigint;
}): bigint => {
  const tier = params.tier ?? 'standard';
  const rates = getImageGenerationRates(params.model, tier);
  if (!isNonNegativeInteger(params.inputTokenCount)) throw new InvalidProviderUsageError('inputTokenCount', params.inputTokenCount);
  const textThinking = params.textThinkingOutputTokenCount ?? 0;
  if (!isNonNegativeInteger(textThinking)) throw new InvalidProviderUsageError('textThinkingOutputTokenCount', textThinking);

  const inputCost = BigInt(Math.max(0, params.inputTokenCount)) * BigInt(rates.inputTokenNanoUsd);
  const textOutputCost = BigInt(Math.max(0, textThinking)) * BigInt(rates.textOutputTokenNanoUsd);
  const imageOutputCost = imageOutputListCostNanoUsd(params.model, tier, params.resolution);
  const groundingCost = params.groundingListCostNanoUsd ?? 0n;
  return inputCost + textOutputCost + imageOutputCost + groundingCost;
};

export const computeImageGenerationCustomerPriceNanoUsd = (params: {
  model: string;
  tier?: HostedServiceTier;
  resolution: ImageResolutionTier;
  inputTokenCount: number;
  textThinkingOutputTokenCount?: number;
  groundingListCostNanoUsd?: bigint;
  markupBps?: number;
}): bigint => applyMarkupNanoUsd(computeImageGenerationListCostNanoUsd(params), params.markupBps);

// ===== Billing-unit calculators =====
// Hosted Google operations are not all token-metered. Each billing unit needs its own server-owned
// calculator; an operation with no registered calculator must FAIL CLOSED (never default to $0 or to
// token pricing). Token metering is implemented above; image/video/grounding are not yet implemented.
export type HostedBillingUnit = 'token' | 'image_output' | 'video_seconds' | 'grounding_request';

export class UnregisteredCalculatorError extends Error {
  constructor(public readonly billingUnit: string) {
    super(`No registered server-owned cost calculator for billing unit "${billingUnit}". Failing closed.`);
    this.name = 'UnregisteredCalculatorError';
  }
}

export const HOSTED_GOOGLE_CALCULATORS_IMPLEMENTED: Record<HostedBillingUnit, boolean> = {
  token: true,
  image_output: true, // computeImageGenerationListCostNanoUsd (rates flagged for verification)
  video_seconds: false,
  grounding_request: false
};

export const assertCalculatorRegistered = (billingUnit: HostedBillingUnit): void => {
  if (!HOSTED_GOOGLE_CALCULATORS_IMPLEMENTED[billingUnit]) {
    throw new UnregisteredCalculatorError(billingUnit);
  }
};

// Strict default: only paid-credit balance may fund metered Google operations. Promotional/free credits
// do not satisfy the profit requirement (they would let provider cost be paid with non-revenue credits),
// so they are ineligible to fund metered hosted analysis until per-lot wallet accounting is implemented.
export const METERED_PROMO_CREDIT_POLICY: 'restrict' | 'marketing_expense' = 'restrict';
