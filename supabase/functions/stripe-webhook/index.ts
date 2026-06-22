import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getLaunchProduct, getPaidCreditGrant } from "../_shared/launchPricing.ts";
import {
  mapStripeEventToSubscriptionSync,
  type SubscriptionSyncRecord,
} from "../_shared/subscriptionSync.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientAny = ReturnType<typeof createClient<any, "public", any>>;

type StripeMetadata = Record<string, string | null> | null;

type StripeCheckoutSession = {
  id?: string;
  object?: string;
  mode?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
  metadata?: StripeMetadata;
};

type StripeInvoice = {
  id?: string;
  object?: string;
  status?: string | null;
  billing_reason?: string | null;
  subscription?: string | null;
  metadata?: StripeMetadata;
  subscription_details?: { metadata?: StripeMetadata } | null;
  lines?: { data?: Array<{ metadata?: StripeMetadata; price?: { id?: string | null } | null }> } | null;
};

type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: StripeCheckoutSession & StripeInvoice;
  };
};

type CreditPackProductKey = "credit_pack_100" | "credit_pack_500";

// A credit grant ready for the deployed apply_stripe_credit_topup RPC. `idempotencyKey` becomes the RPC's
// p_stripe_event_id (the dedupe key in public.stripe_processed_events). For packs it is the Stripe event id;
// for subscription invoices it is the invoice id (stable across invoice.paid + invoice.payment_succeeded,
// and in a different id namespace than checkout event ids, so the two paths never collide).
type CreditGrant = {
  idempotencyKey: string;
  eventType: string;
  userId: string;
  productKey: string;
  credits: number;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const getEnv = (...keys: string[]): string | null => {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return null;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (hex: string): Uint8Array | null => {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
};

const timingSafeHexEqual = (leftHex: string, rightHex: string): boolean => {
  const left = hexToBytes(leftHex);
  const right = hexToBytes(rightHex);
  if (!left || !right || left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
};

const parseStripeSignatureHeader = (header: string): { timestamp: number; signatures: string[] } => {
  const parts = header.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const timestamp = Number(timestampPart?.slice(2));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header.");
  }

  return { timestamp, signatures };
};

const verifyStripeSignature = async (
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
) => {
  if (!signatureHeader) {
    throw new Error("Missing Stripe signature header.");
  }

  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  const toleranceSeconds = Number(getEnv("STRIPE_WEBHOOK_TOLERANCE_SECONDS") ?? "300");
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestamp - timestamp) > toleranceSeconds) {
    throw new Error("Stripe signature timestamp is outside the allowed tolerance.");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = encoder.encode(`${timestamp}.${rawBody}`);
  const expectedSignature = toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, signedPayload)));
  const matches = signatures.some((signature) => timingSafeHexEqual(expectedSignature, signature));

  if (!matches) {
    throw new Error("Stripe signature verification failed.");
  }
};

const readMetadataValue = (
  metadata: Record<string, string | null> | null | undefined,
  key: string
): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const isCreditPackProductKey = (value: string | null): value is CreditPackProductKey =>
  value === "credit_pack_100" || value === "credit_pack_500";

// ===== Safe error normalization =====
// PostgREST / supabase-js errors are plain objects; throwing them raw stringifies to "[object Object]".
// This extractor keeps only the non-secret diagnostic fields. NEVER place a Stripe secret/signing secret,
// a Supabase token, or a full Checkout Session object into one of these.
type SafeError = { message: string; code: string | null; details: string | null; hint: string | null };

const extractRpcError = (error: unknown): SafeError => {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return {
      message: typeof e.message === "string" ? e.message : String(error),
      code: typeof e.code === "string" ? e.code : null,
      details: typeof e.details === "string" ? e.details : null,
      hint: typeof e.hint === "string" ? e.hint : null,
    };
  }
  return { message: String(error), code: null, details: null, hint: null };
};

// The RPC (or its expected argument signature) is absent from the schema cache.
const isRpcContractMismatch = (error: SafeError): boolean =>
  error.code === "PGRST202" ||
  /could not find the function|schema cache|function public\.apply_stripe_credit_topup.*does not exist|no function matches the given name/i.test(
    error.message
  );

// A logged, status-bearing webhook error. logCode identifies the failure class without leaking secrets.
class WebhookError extends Error {
  status: number;
  logCode: string;
  safe: SafeError | null;
  constructor(status: number, logCode: string, message: string, safe: SafeError | null = null) {
    super(message);
    this.name = "WebhookError";
    this.status = status;
    this.logCode = logCode;
    this.safe = safe;
  }
}

const readCreditTopUp = (event: StripeEvent): CreditGrant | null => {
  const session = event.data?.object;
  if (!session || session.object !== "checkout.session") return null;

  const purchaseKind = readMetadataValue(session.metadata, "purchase_kind");
  if (purchaseKind !== "TOPUP_PURCHASE") return null;

  const productKey = readMetadataValue(session.metadata, "product_key");
  if (!isCreditPackProductKey(productKey)) {
    throw new Error(`Unsupported TOPUP_PURCHASE product_key: ${productKey ?? "missing"}`);
  }

  const expectedCredits = getPaidCreditGrant(productKey); // server-owned grant from the launch registry
  const credits = Number(readMetadataValue(session.metadata, "credits"));
  if (!Number.isInteger(credits) || credits !== expectedCredits) {
    throw new Error(`Invalid TOPUP_PURCHASE credits metadata for ${productKey}.`);
  }

  const userId = readMetadataValue(session.metadata, "user_id") ?? session.client_reference_id;
  if (!userId) {
    throw new Error("Missing TOPUP_PURCHASE user_id metadata.");
  }

  if (!event.id) {
    throw new Error("Missing Stripe event id.");
  }
  if (!session.id) {
    throw new Error("Missing Stripe checkout session id.");
  }

  return {
    idempotencyKey: event.id, // packs dedupe on the Stripe event id
    eventType: event.type ?? "checkout.session.completed",
    userId,
    productKey,
    credits,
  };
};

// Reads a subscription credit grant from a paid invoice event. Grant amount + product validity come from
// the SERVER-OWNED launch registry, never the Stripe amount/metadata credits. Only eligible (create/cycle)
// successfully-paid subscription invoices grant credits. Dedupe is on the invoice id, so invoice.paid and
// invoice.payment_succeeded for the same invoice grant exactly once.
const readSubscriptionGrant = (event: StripeEvent): CreditGrant | null => {
  const invoice = event.data?.object;
  if (!invoice || invoice.object !== "invoice") return null;
  if (invoice.status !== "paid") return null;
  if (invoice.billing_reason !== "subscription_create" && invoice.billing_reason !== "subscription_cycle") return null;

  // Server-set metadata lives on the subscription; Stripe surfaces it on the invoice.
  const md = invoice.subscription_details?.metadata ?? invoice.lines?.data?.[0]?.metadata ?? invoice.metadata;
  const purchaseKind = readMetadataValue(md, "purchase_kind");
  if (purchaseKind !== "HOSTED_SUBSCRIPTION") return null;

  const productKey = readMetadataValue(md, "product_key");
  const product = productKey ? getLaunchProduct(productKey) : null;
  if (!product || product.isByok || product.purchaseType !== "subscription") {
    throw new Error(`Unsupported subscription product_key: ${productKey ?? "missing"}`);
  }
  const credits = getPaidCreditGrant(productKey!); // 600 / 1200 from the registry

  const userId = readMetadataValue(md, "user_id");
  if (!userId) throw new Error("Missing subscription user_id metadata.");
  if (!invoice.id) throw new Error("Missing Stripe invoice id.");

  return {
    idempotencyKey: invoice.id, // subscriptions dedupe on the invoice id (stable across both invoice events)
    eventType: event.type ?? "invoice.paid",
    userId,
    productKey: productKey!,
    credits,
  };
};

/**
 * Grants credits through the single deployed, idempotent RPC:
 *   apply_stripe_credit_topup(p_user_id uuid, p_credits integer, p_stripe_event_id text, p_event_type text)
 *   RETURNS void  — idempotent on p_stripe_event_id via public.stripe_processed_events(id).
 *
 * Because the RPC returns void, the resulting balance is read afterwards (informational only — a failed
 * balance read does NOT undo a succeeded grant). A missing/mismatched RPC fails closed: it returns a
 * descriptive 500 and NEVER touches credit_balance directly.
 */
const grantCreditsViaRpc = async (
  supabase: SupabaseClientAny,
  grant: CreditGrant
): Promise<number | null> => {
  const { error } = await supabase.rpc("apply_stripe_credit_topup", {
    p_user_id: grant.userId,
    p_credits: grant.credits,
    p_stripe_event_id: grant.idempotencyKey,
    p_event_type: grant.eventType,
  });

  if (error) {
    const safe = extractRpcError(error);
    if (isRpcContractMismatch(safe)) {
      throw new WebhookError(
        500,
        "STRIPE_TOPUP_RPC_CONTRACT_MISMATCH",
        "apply_stripe_credit_topup is missing or its signature does not match; refusing to modify credit_balance.",
        safe
      );
    }
    throw new WebhookError(500, "STRIPE_TOPUP_RPC_FAILED", "apply_stripe_credit_topup RPC failed.", safe);
  }

  // RPC succeeded => fulfillment success (idempotent). Read the resulting balance for the response only.
  const { data, error: readError } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", grant.userId)
    .single();
  if (readError) return null; // grant already applied; balance is informational
  const balance = Number((data as { credit_balance?: unknown } | null)?.credit_balance);
  return Number.isFinite(balance) ? balance : null;
};

// ════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION ROW SYNC (public.subscriptions)
//
// The pure event→record mapping lives in _shared/subscriptionSync.ts (importable
// + unit-testable). This file owns only the DB write. Credits are NOT touched
// here — they remain owned by the invoice-driven RPC path so a subscription
// event never double-grants.
// ════════════════════════════════════════════════════════════════════════════

// Upserts the subscription row by its unique stripe_subscription_id (idempotent,
// no duplicate rows on replay). Never reactivates a canceled subscription from a
// stale invoice event. product_id is best-effort (nullable): launch identity
// lives in metadata.product_key, so an empty products catalog never blocks sync.
const applySubscriptionSync = async (
  supabase: SupabaseClientAny,
  rec: SubscriptionSyncRecord
): Promise<void> => {
  const { data: existing, error: readError } = await supabase
    .from("subscriptions")
    .select("id, status, product_id, canceled_at")
    .eq("stripe_subscription_id", rec.stripeSubscriptionId)
    .maybeSingle();

  if (readError) {
    throw new WebhookError(
      500,
      "SUBSCRIPTION_SYNC_READ_FAILED",
      "Failed to read existing subscription row.",
      extractRpcError(readError)
    );
  }

  const existingRow = existing as
    | { id?: string; status?: string; product_id?: string | null; canceled_at?: string | null }
    | null;

  // Defensive: a replayed/stale invoice event must not resurrect a cancellation.
  let status = rec.status;
  let canceledAt = rec.canceledAt;
  if (existingRow?.status === "canceled" && rec.status === "active") {
    status = "canceled";
    canceledAt = existingRow.canceled_at ?? rec.canceledAt;
  }

  const row: Record<string, unknown> = {
    user_id: rec.userId,
    product_id: existingRow?.product_id ?? null,
    stripe_subscription_id: rec.stripeSubscriptionId,
    stripe_customer_id: rec.stripeCustomerId,
    status,
    current_period_start: rec.currentPeriodStart,
    current_period_end: rec.currentPeriodEnd,
    cancel_at_period_end: rec.cancelAtPeriodEnd,
    canceled_at: canceledAt,
    metadata: {
      product_key: rec.productKey,
      product_name: rec.productName,
      stripe_price_id: rec.stripePriceId,
    },
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });

  if (error) {
    throw new WebhookError(
      500,
      "SUBSCRIPTION_SYNC_FAILED",
      "Failed to upsert subscription row.",
      extractRpcError(error)
    );
  }
};

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    }

    await verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), webhookSecret);

    const event = JSON.parse(rawBody) as StripeEvent;
    const isCheckout =
      event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
    const isSubscriptionInvoice =
      event.type === "invoice.paid" || event.type === "invoice.payment_succeeded";
    const isPaymentFailed = event.type === "invoice.payment_failed";
    const isSubscriptionLifecycle =
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted";

    // Unrelated events grant nothing and sync nothing.
    if (!isCheckout && !isSubscriptionInvoice && !isPaymentFailed && !isSubscriptionLifecycle) {
      return jsonResponse({ received: true, ignored: true });
    }

    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service credentials are not configured.");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Subscription lifecycle events sync the row only (no credits). Cancellation
    // (customer.subscription.deleted) marks the row canceled and grants nothing.
    if (isSubscriptionLifecycle) {
      const rec = mapStripeEventToSubscriptionSync(event);
      if (!rec) {
        return jsonResponse({ received: true, ignored: true, reason: "not_eligible_subscription_event" });
      }
      await applySubscriptionSync(supabase, rec);
      return jsonResponse({
        received: true,
        subscription_synced: true,
        product_key: rec.productKey,
        status: rec.status,
      });
    }

    // Failed payment: record a non-active status. Never grants credits.
    if (isPaymentFailed) {
      const rec = mapStripeEventToSubscriptionSync(event);
      if (rec) await applySubscriptionSync(supabase, rec);
      return jsonResponse({
        received: true,
        subscription_synced: Boolean(rec),
        credits: 0,
        status: rec?.status ?? null,
      });
    }

    if (isSubscriptionInvoice) {
      // Credits first (the money path; idempotent on invoice id), then subscription
      // row sync (idempotent on stripe_subscription_id). Both safe to retry.
      const grant = readSubscriptionGrant(event);
      let balance: number | null = null;
      if (grant) balance = await grantCreditsViaRpc(supabase, grant);

      const rec = mapStripeEventToSubscriptionSync(event);
      if (rec) await applySubscriptionSync(supabase, rec);

      if (!grant) {
        return jsonResponse({
          received: true,
          subscription_synced: Boolean(rec),
          ignored: true,
          reason: "not_eligible_subscription_invoice",
          status: rec?.status ?? null,
        });
      }
      return jsonResponse({
        received: true,
        fulfilled: true,
        subscription_synced: Boolean(rec),
        product_key: grant.productKey,
        credits: grant.credits,
        credit_balance: balance,
        status: rec?.status ?? null,
      });
    }

    const session = event.data?.object;
    if (event.type === "checkout.session.completed" && session?.payment_status !== "paid") {
      return jsonResponse({ received: true, ignored: true, reason: "payment_not_paid" });
    }

    const topUp = readCreditTopUp(event);
    if (!topUp) {
      return jsonResponse({ received: true, ignored: true, reason: "not_topup_purchase" });
    }

    const balance = await grantCreditsViaRpc(supabase, topUp);

    return jsonResponse({
      received: true,
      fulfilled: true,
      product_key: topUp.productKey,
      credits: topUp.credits,
      credit_balance: balance,
    });
  } catch (error) {
    if (error instanceof WebhookError) {
      // Safe, structured log — never secrets or full Stripe objects.
      console.error(`[stripe-webhook] ${error.logCode}`, {
        message: error.safe?.message ?? error.message,
        code: error.safe?.code ?? null,
        details: error.safe?.details ?? null,
        hint: error.safe?.hint ?? null,
      });
      return jsonResponse(
        {
          error: error.message,
          code: error.logCode,
          rpc_code: error.safe?.code ?? null,
          rpc_details: error.safe?.details ?? null,
          rpc_hint: error.safe?.hint ?? null,
        },
        error.status
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[stripe-webhook] STRIPE_WEBHOOK_REJECTED", { message });
    return jsonResponse({ error: message, code: "STRIPE_WEBHOOK_REJECTED" }, 400);
  }
});
