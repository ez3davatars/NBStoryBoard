// Server-owned launch-pricing registry (hosted-launch-pricing-2026-06-v1).
//
// Single source of truth for which Stripe price each launch product uses and how many PAID credits it
// grants. Credit grants come from THIS registry — never from the Stripe amount, display text, browser
// metadata, price nickname, or requiredCredits. Pure + dependency-free (env access is injected) so it is
// importable by the Deno edge functions AND unit-testable from vitest.

export const HOSTED_LAUNCH_PRICING_VERSION = 'hosted-launch-pricing-2026-06-v1';

export type LaunchPurchaseType = 'one_time' | 'subscription';

export type LaunchProduct = {
  productKey: string;
  /** env var holding the V2 launch Stripe price id (null for BYOK — not part of the V2 rollout). */
  stripePriceEnvVar: string | null;
  purchaseType: LaunchPurchaseType;
  paidCredits: number;
  promotionalCredits: number;
  isByok: boolean;
  availableForNewCheckout: boolean;
};

export const LAUNCH_PRODUCT_REGISTRY: Record<string, LaunchProduct> = {
  credit_pack_100: { productKey: 'credit_pack_100', stripePriceEnvVar: 'STRIPE_PRICE_CREDIT_PACK_100_V2', purchaseType: 'one_time', paidCredits: 100, promotionalCredits: 0, isByok: false, availableForNewCheckout: true },
  credit_pack_500: { productKey: 'credit_pack_500', stripePriceEnvVar: 'STRIPE_PRICE_CREDIT_PACK_500_V2', purchaseType: 'one_time', paidCredits: 500, promotionalCredits: 0, isByok: false, availableForNewCheckout: true },
  subscription_starter: { productKey: 'subscription_starter', stripePriceEnvVar: 'STRIPE_PRICE_SUBSCRIPTION_STARTER_V2', purchaseType: 'subscription', paidCredits: 600, promotionalCredits: 0, isByok: false, availableForNewCheckout: true },
  subscription_pro: { productKey: 'subscription_pro', stripePriceEnvVar: 'STRIPE_PRICE_SUBSCRIPTION_PRO_V2', purchaseType: 'subscription', paidCredits: 1200, promotionalCredits: 0, isByok: false, availableForNewCheckout: true },
  // BYOK products grant ZERO hosted credits and are NOT part of the V2 launch-price rollout.
  indie_desktop_byok: { productKey: 'indie_desktop_byok', stripePriceEnvVar: null, purchaseType: 'one_time', paidCredits: 0, promotionalCredits: 0, isByok: true, availableForNewCheckout: true },
  agency_desktop_byok: { productKey: 'agency_desktop_byok', stripePriceEnvVar: null, purchaseType: 'one_time', paidCredits: 0, promotionalCredits: 0, isByok: true, availableForNewCheckout: true }
};

/** The four launch price env vars that MUST all be configured before the rollout can be enabled. */
export const LAUNCH_V2_ENV_VARS = [
  'STRIPE_PRICE_CREDIT_PACK_100_V2',
  'STRIPE_PRICE_CREDIT_PACK_500_V2',
  'STRIPE_PRICE_SUBSCRIPTION_STARTER_V2',
  'STRIPE_PRICE_SUBSCRIPTION_PRO_V2'
] as const;

export type EnvGetter = (key: string) => string | null;

/** Server-side rollout flag. Defaults to false; only the literal env string "true" enables it. */
export const isPricingRolloutEnabled = (getEnv: EnvGetter): boolean =>
  (getEnv('HOSTED_PRICING_ROLLOUT_ENABLED') ?? '').trim().toLowerCase() === 'true';

export const getLaunchProduct = (productKey: string): LaunchProduct | null =>
  Object.prototype.hasOwnProperty.call(LAUNCH_PRODUCT_REGISTRY, productKey)
    ? LAUNCH_PRODUCT_REGISTRY[productKey]
    : null;

/** Server-owned PAID credit grant for a product key. BYOK => 0. Throws on unknown key. */
export const getPaidCreditGrant = (productKey: string): number => {
  const product = getLaunchProduct(productKey);
  if (!product) throw new Error(`Unknown launch product key: ${productKey}`);
  return product.isByok ? 0 : product.paidCredits;
};

const isValidStripePriceId = (value: string | null): value is string =>
  typeof value === 'string' && value.startsWith('price_') && value.length > 'price_'.length;

/**
 * Resolves the approved launch Stripe price id for a product server-side. Fails closed when the rollout
 * is enabled and the V2 id is missing/malformed. Never derived from a client-supplied price id.
 */
export const resolveLaunchPriceId = (productKey: string, getEnv: EnvGetter): string => {
  const product = getLaunchProduct(productKey);
  if (!product || !product.stripePriceEnvVar) {
    throw new Error(`No launch price configured for product key: ${productKey}`);
  }
  const raw = getEnv(product.stripePriceEnvVar);
  if (!isValidStripePriceId(raw)) {
    throw new Error(`Launch price ${product.stripePriceEnvVar} is missing or malformed for ${productKey}.`);
  }
  return raw;
};

/** When the rollout is enabled, ALL four V2 launch price ids must be configured + valid (fail closed). */
export const assertLaunchPricingConfigured = (getEnv: EnvGetter): void => {
  for (const envVar of LAUNCH_V2_ENV_VARS) {
    if (!isValidStripePriceId(getEnv(envVar))) {
      throw new Error(`Launch pricing rollout is enabled but ${envVar} is missing or malformed.`);
    }
  }
};

/** Is this product key a hosted (non-BYOK) launch product offered for new checkout? */
export const isHostedLaunchProduct = (productKey: string): boolean => {
  const product = getLaunchProduct(productKey);
  return Boolean(product && !product.isByok && product.availableForNewCheckout);
};
