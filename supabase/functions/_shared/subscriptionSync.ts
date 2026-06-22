// Pure, dependency-light subscription-sync mapping for the Stripe webhook.
//
// Maps a verified Stripe event to a normalized subscription row record, or null
// when the event must NOT write a subscription row (fail closed). Side-effect
// free (no env, no network, no DB, no logging) so it is importable by the Deno
// edge function AND unit-testable from vitest — the same pattern as
// launchPricing.ts / stripeModeGuard.ts.
//
// Identity (user_id) and product (product_key) come ONLY from Stripe metadata
// that the backend set during checkout (subscription_data[metadata]). They are
// never trusted from a browser at webhook time. Credits are intentionally out of
// scope here — they remain owned by the invoice-driven RPC path.

import { getLaunchProduct } from "./launchPricing.ts";

export type StripeMetadata = Record<string, string | null> | null;

export type StripeSyncEvent = {
  id?: string;
  type?: string;
  data?: { object?: unknown };
};

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "unpaid" | "trialing";

export type SubscriptionSyncRecord = {
  stripeSubscriptionId: string;
  userId: string;
  productKey: string;
  productName: string;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
};

// Display fallback derived from the server-approved product key, so the website
// can render the plan name even when the products catalog is empty.
export const SUBSCRIPTION_PLAN_DISPLAY_NAME: Record<string, string> = {
  subscription_starter: "Starter",
  subscription_pro: "Pro",
};

export const subscriptionPlanDisplayName = (productKey: string): string =>
  SUBSCRIPTION_PLAN_DISPLAY_NAME[productKey] ?? "Subscription";

const readMetadataValue = (metadata: StripeMetadata, key: string): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export const toIsoFromUnix = (value: unknown): string | null => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
};

// Coerce a Stripe subscription status to the DB check-constraint domain. Unknown
// or transitional states (incomplete / incomplete_expired / paused) map to the
// non-active "unpaid" so they never count as an active subscription.
export const normalizeSubscriptionStatus = (raw: unknown): SubscriptionStatus => {
  switch (raw) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "canceled": return "canceled";
    case "unpaid": return "unpaid";
    default: return "unpaid";
  }
};

export const isHostedSubscriptionProduct = (productKey: string | null): boolean => {
  const product = productKey ? getLaunchProduct(productKey) : null;
  return Boolean(product && !product.isByok && product.purchaseType === "subscription");
};

/**
 * Pure mapper. Returns a sync record, or null when the event must not write a
 * subscription row (unknown/un-mapped product, missing identity, missing
 * billing period, or an unrelated event type) — i.e. fail closed.
 */
export const mapStripeEventToSubscriptionSync = (
  event: StripeSyncEvent
): SubscriptionSyncRecord | null => {
  const type = event.type ?? "";
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = event.data?.object as any;
  if (!obj || typeof obj !== "object") return null;

  // ---- customer.subscription.* (object = Subscription) ----
  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    const md = (obj.metadata ?? null) as StripeMetadata;
    const productKey = readMetadataValue(md, "product_key");
    if (!isHostedSubscriptionProduct(productKey)) return null;
    const userId = readMetadataValue(md, "user_id");
    if (!userId) return null;
    const stripeSubscriptionId = typeof obj.id === "string" ? obj.id : null;
    if (!stripeSubscriptionId) return null;

    const periodStart = toIsoFromUnix(obj.current_period_start);
    const periodEnd = toIsoFromUnix(obj.current_period_end);
    if (!periodStart || !periodEnd) return null;

    const isDeleted = type === "customer.subscription.deleted";
    const status: SubscriptionStatus = isDeleted
      ? "canceled"
      : normalizeSubscriptionStatus(obj.status);

    return {
      stripeSubscriptionId,
      userId,
      productKey: productKey!,
      productName: subscriptionPlanDisplayName(productKey!),
      stripeCustomerId: typeof obj.customer === "string" ? obj.customer : null,
      stripePriceId: obj.items?.data?.[0]?.price?.id ?? null,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
      canceledAt: isDeleted
        ? (toIsoFromUnix(obj.canceled_at) ?? new Date().toISOString())
        : toIsoFromUnix(obj.canceled_at),
    };
  }

  // ---- invoice.* (object = Invoice) ----
  if (
    type === "invoice.paid" ||
    type === "invoice.payment_succeeded" ||
    type === "invoice.payment_failed"
  ) {
    const stripeSubscriptionId = typeof obj.subscription === "string" ? obj.subscription : null;
    if (!stripeSubscriptionId) return null;

    const md = (obj.subscription_details?.metadata ??
      obj.lines?.data?.[0]?.metadata ??
      obj.metadata ??
      null) as StripeMetadata;
    const productKey = readMetadataValue(md, "product_key");
    if (!isHostedSubscriptionProduct(productKey)) return null;
    const userId = readMetadataValue(md, "user_id");
    if (!userId) return null;

    const line = obj.lines?.data?.[0];
    const periodStart = toIsoFromUnix(line?.period?.start);
    const periodEnd = toIsoFromUnix(line?.period?.end);
    if (!periodStart || !periodEnd) return null;

    const status: SubscriptionStatus = type === "invoice.payment_failed" ? "past_due" : "active";

    return {
      stripeSubscriptionId,
      userId,
      productKey: productKey!,
      productName: subscriptionPlanDisplayName(productKey!),
      stripeCustomerId: typeof obj.customer === "string" ? obj.customer : null,
      stripePriceId: line?.price?.id ?? null,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    };
  }

  return null;
};
