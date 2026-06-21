// Pure, dependency-free Stripe test/live mode guard. The checkout function MUST fail closed when the
// configured Stripe key, the selected Price, or the created Checkout Session do not match the server's
// declared STRIPE_EXPECTED_MODE. All logic here is side-effect-free (no env, no network, no logging) so it
// is importable by the Deno edge function AND unit-testable from vitest. NEVER pass a full secret key into
// a value that is logged or returned — only the derived mode string ('test' | 'live' | 'invalid') escapes.

export const STRIPE_MODE_GUARD_VERSION = 'stripe-mode-guard-2026-06-v1';

export type StripeMode = 'test' | 'live';
export type DerivedKeyMode = StripeMode | 'invalid';

/** Minimal shape of the fields we verify on a retrieved Stripe Price. */
export type StripePriceShape = {
  livemode?: boolean;
  type?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string | null } | null;
};

export type GuardResult = { ok: true } | { ok: false; code: string; message: string };

/**
 * Derive the actual mode of a Stripe secret/restricted key from its prefix ONLY. Never inspects, logs, or
 * returns the key body. sk_test_/rk_test_ => test, sk_live_/rk_live_ => live, anything else => invalid.
 */
export const deriveStripeKeyMode = (secretKey: string | null | undefined): DerivedKeyMode => {
  if (typeof secretKey !== 'string') return 'invalid';
  if (secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_')) return 'test';
  if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) return 'live';
  return 'invalid';
};

/** Parse STRIPE_EXPECTED_MODE. Only the exact strings 'test' or 'live' are valid; everything else => null. */
export const parseExpectedMode = (raw: string | null | undefined): StripeMode | null => {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'test' || v === 'live' ? v : null;
};

/** Whether the expected mode corresponds to Stripe livemode=true. */
export const expectedLivemode = (mode: StripeMode): boolean => mode === 'live';

/** Server-derived expected Stripe Price type from the checkout mode. */
export const expectedPriceType = (mode: 'payment' | 'subscription'): 'one_time' | 'recurring' =>
  mode === 'subscription' ? 'recurring' : 'one_time';

// ===== Approved unit-amount registry (USD cents). Source of truth for the post-retrieval amount guard. =====
// Launch (rollout enabled) vs prelaunch (rollout disabled). Products without an approved amount (BYOK,
// client-supplied legacy prices) return null and SKIP the amount check (mode + type are still enforced).
export const APPROVED_UNIT_AMOUNT_CENTS_LAUNCH: Readonly<Record<string, number>> = {
  credit_pack_100: 1299,        // $12.99
  credit_pack_500: 5499,        // $54.99
  subscription_starter: 5900,   // $59.00 / mo
  subscription_pro: 11900       // $119.00 / mo
};
export const APPROVED_UNIT_AMOUNT_CENTS_PRELAUNCH: Readonly<Record<string, number>> = {
  credit_pack_100: 1000,        // $10.00
  credit_pack_500: 4500         // $45.00
};

export const resolveApprovedUnitAmountCents = (
  productKey: string | null | undefined,
  rolloutEnabled: boolean
): number | null => {
  if (!productKey) return null;
  const table = rolloutEnabled ? APPROVED_UNIT_AMOUNT_CENTS_LAUNCH : APPROVED_UNIT_AMOUNT_CENTS_PRELAUNCH;
  return Object.prototype.hasOwnProperty.call(table, productKey) ? table[productKey] : null;
};

/**
 * Verify the configured key mode matches the expected mode. Returns the GuardResult plus the derived key
 * mode (the mode string is safe to surface; the key itself is never included). An invalid key prefix can
 * never equal a valid expected mode, so it fails closed as a mismatch.
 */
export const checkKeyMode = (params: {
  expectedMode: StripeMode;
  secretKey: string | null | undefined;
}): GuardResult & { keyMode: DerivedKeyMode } => {
  const keyMode = deriveStripeKeyMode(params.secretKey);
  if (keyMode !== params.expectedMode) {
    return {
      ok: false,
      code: 'STRIPE_KEY_MODE_MISMATCH',
      message:
        keyMode === 'invalid'
          ? 'Configured Stripe key is not a recognized test or live key.'
          : `Stripe key mode (${keyMode}) does not match STRIPE_EXPECTED_MODE (${params.expectedMode}).`,
      keyMode
    };
  }
  return { ok: true, keyMode };
};

/**
 * Verify a retrieved Stripe Price against the expected mode, the expected type, the required monthly
 * interval for subscriptions, and (when known) the approved unit amount. Checks run in a fixed order:
 * mode → type → interval → amount. Stable codes: STRIPE_PRICE_MODE_MISMATCH / _TYPE_MISMATCH / _AMOUNT_MISMATCH.
 */
export const checkPrice = (params: {
  price: StripePriceShape;
  expectedMode: StripeMode;
  expectedType: 'one_time' | 'recurring';
  approvedUnitAmountCents: number | null;
}): GuardResult => {
  const { price, expectedMode, expectedType, approvedUnitAmountCents } = params;

  if ((price.livemode === true) !== expectedLivemode(expectedMode)) {
    return {
      ok: false,
      code: 'STRIPE_PRICE_MODE_MISMATCH',
      message: `Selected price livemode does not match STRIPE_EXPECTED_MODE (${expectedMode}).`
    };
  }

  if (price.type !== expectedType) {
    return {
      ok: false,
      code: 'STRIPE_PRICE_TYPE_MISMATCH',
      message: `Selected price type "${price.type}" is not the required "${expectedType}".`
    };
  }

  if (expectedType === 'recurring' && (price.recurring?.interval ?? null) !== 'month') {
    return {
      ok: false,
      code: 'STRIPE_PRICE_TYPE_MISMATCH',
      message: `Subscription price interval "${price.recurring?.interval ?? 'none'}" is not the required "month".`
    };
  }

  if (approvedUnitAmountCents !== null && price.unit_amount !== approvedUnitAmountCents) {
    return {
      ok: false,
      code: 'STRIPE_PRICE_AMOUNT_MISMATCH',
      message: `Selected price unit amount does not match the approved registry amount (${approvedUnitAmountCents}).`
    };
  }

  return { ok: true };
};

/** Verify the created Checkout Session's livemode matches the expected mode. */
export const checkSessionMode = (params: {
  sessionLivemode: boolean;
  expectedMode: StripeMode;
}): GuardResult => {
  if (params.sessionLivemode !== expectedLivemode(params.expectedMode)) {
    return {
      ok: false,
      code: 'STRIPE_SESSION_MODE_MISMATCH',
      message: `Created Checkout Session livemode does not match STRIPE_EXPECTED_MODE (${params.expectedMode}).`
    };
  }
  return { ok: true };
};
