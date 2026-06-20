import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getLaunchProduct, getPaidCreditGrant } from "../_shared/launchPricing.ts";

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

type CreditTopUp = {
  eventId: string;
  sessionId: string;
  userId: string;
  productKey: CreditPackProductKey;
  credits: number;
};

type CreditPackProductKey = "credit_pack_100" | "credit_pack_500";

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

const readCreditTopUp = (event: StripeEvent): CreditTopUp | null => {
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
    eventId: event.id,
    sessionId: session.id,
    userId,
    productKey,
    credits,
  };
};

const rpcFunctionNotFound = (message: string): boolean =>
  /function .*apply_stripe_credit_topup|could not find the function|schema cache/i.test(message);

const applyCreditTopUpWithRpc = async (
  supabase: SupabaseClientAny,
  topUp: CreditTopUp
): Promise<{ applied: boolean; balance: number | null }> => {
  const { data, error } = await supabase.rpc("apply_stripe_credit_topup", {
    p_event_id: topUp.eventId,
    p_session_id: topUp.sessionId,
    p_user_id: topUp.userId,
    p_product_key: topUp.productKey,
    p_credits: topUp.credits,
  });

  if (error) {
    if (rpcFunctionNotFound(error.message)) {
      throw error;
    }
    throw new Error(`apply_stripe_credit_topup RPC failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const applied = Boolean((row as { applied?: unknown } | null)?.applied);
  const balanceValue = Number((row as { credit_balance?: unknown } | null)?.credit_balance);

  return {
    applied,
    balance: Number.isFinite(balanceValue) ? balanceValue : null,
  };
};

const applyCreditTopUpDirectly = async (
  supabase: SupabaseClientAny,
  topUp: CreditTopUp
): Promise<{ applied: boolean; balance: number | null }> => {
  const { data: profileData, error: readError } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", topUp.userId)
    .single();

  if (readError) {
    throw new Error(`Could not read profile credit balance: ${readError.message}`);
  }

  const currentBalance = Number((profileData as { credit_balance?: unknown } | null)?.credit_balance ?? 0);
  if (!Number.isFinite(currentBalance)) {
    throw new Error("Profile credit_balance is not numeric.");
  }

  const nextBalance = currentBalance + topUp.credits;
  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({ credit_balance: nextBalance })
    .eq("id", topUp.userId)
    .select("credit_balance")
    .single();

  if (updateError) {
    throw new Error(`Could not update profile credit balance: ${updateError.message}`);
  }

  const updatedBalance = Number((updatedProfile as { credit_balance?: unknown } | null)?.credit_balance);
  return {
    applied: true,
    balance: Number.isFinite(updatedBalance) ? updatedBalance : nextBalance,
  };
};

const applyCreditTopUp = async (
  supabase: SupabaseClientAny,
  topUp: CreditTopUp
): Promise<{ applied: boolean; balance: number | null }> => {
  try {
    return await applyCreditTopUpWithRpc(supabase, topUp);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!rpcFunctionNotFound(message)) throw error;
    console.warn("apply_stripe_credit_topup RPC not found; falling back to direct credit update.");
    return applyCreditTopUpDirectly(supabase, topUp);
  }
};

type SubscriptionGrant = {
  eventId: string;
  invoiceId: string;
  userId: string;
  productKey: string;
  credits: number;
};

// Reads a subscription credit grant from a paid invoice event. Grant amount + product validity come from
// the SERVER-OWNED launch registry, never the Stripe amount/metadata credits. Only eligible (create/cycle)
// successfully-paid subscription invoices grant credits.
const readSubscriptionGrant = (event: StripeEvent): SubscriptionGrant | null => {
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
  if (!event.id) throw new Error("Missing Stripe event id.");
  if (!invoice.id) throw new Error("Missing Stripe invoice id.");

  return { eventId: event.id, invoiceId: invoice.id, userId, productKey: productKey!, credits };
};

// Grants subscription credits idempotently. The (stripe_event_id PK, stripe_session_id UNIQUE) constraints
// on stripe_processed_events make duplicate event/invoice deliveries no-ops: we claim the row first and
// only credit on a fresh insert. A duplicate (23505) is treated as already-processed.
const applySubscriptionCreditGrant = async (
  supabase: SupabaseClientAny,
  grant: SubscriptionGrant
): Promise<{ applied: boolean; balance: number | null }> => {
  const claim = await supabase
    .from("stripe_processed_events")
    .insert({
      stripe_event_id: grant.eventId,
      stripe_session_id: grant.invoiceId,
      user_id: grant.userId,
      product_key: grant.productKey,
      purchase_kind: "HOSTED_SUBSCRIPTION",
      credits: grant.credits,
    })
    .select("stripe_event_id");

  if (claim.error) {
    if ((claim.error as { code?: string }).code === "23505") {
      return { applied: false, balance: null }; // duplicate event/invoice -> already granted
    }
    throw new Error(`Could not record subscription credit event: ${claim.error.message}`);
  }

  const credited = await applyCreditTopUpDirectly(supabase, {
    eventId: grant.eventId,
    sessionId: grant.invoiceId,
    userId: grant.userId,
    productKey: grant.productKey as CreditPackProductKey,
    credits: grant.credits,
  });
  return { applied: true, balance: credited.balance };
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

    // Failed/voided/refunded/unrelated events grant nothing.
    if (!isCheckout && !isSubscriptionInvoice) {
      return jsonResponse({ received: true, ignored: true });
    }

    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service credentials are not configured.");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (isSubscriptionInvoice) {
      const grant = readSubscriptionGrant(event);
      if (!grant) {
        return jsonResponse({ received: true, ignored: true, reason: "not_eligible_subscription_invoice" });
      }
      const subResult = await applySubscriptionCreditGrant(supabase, grant);
      return jsonResponse({
        received: true,
        applied: subResult.applied,
        product_key: grant.productKey,
        credits: grant.credits,
        credit_balance: subResult.balance,
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

    const result = await applyCreditTopUp(supabase, topUp);

    return jsonResponse({
      received: true,
      applied: result.applied,
      product_key: topUp.productKey,
      credits: topUp.credits,
      credit_balance: result.balance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Stripe webhook error:", message);
    return jsonResponse({ error: message }, 400);
  }
});
