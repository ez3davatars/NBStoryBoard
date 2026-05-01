import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BillingProductKey =
  | "credit_pack_100"
  | "credit_pack_500"
  | "indie_desktop_byok"
  | "agency_desktop_byok";

type CheckoutRequest = {
  product_key?: unknown;
  return_url?: unknown;
};

const PRODUCT_PRICE_ENV: Record<BillingProductKey, string[]> = {
  credit_pack_100: ["STRIPE_PRICE_CREDIT_PACK_100", "STRIPE_PRICE_ID_CREDIT_PACK_100"],
  credit_pack_500: ["STRIPE_PRICE_CREDIT_PACK_500", "STRIPE_PRICE_ID_CREDIT_PACK_500"],
  indie_desktop_byok: ["STRIPE_PRICE_INDIE_DESKTOP_BYOK", "STRIPE_PRICE_ID_INDIE_DESKTOP_BYOK"],
  agency_desktop_byok: ["STRIPE_PRICE_AGENCY_DESKTOP_BYOK", "STRIPE_PRICE_ID_AGENCY_DESKTOP_BYOK"],
};

const PRODUCT_DIRECT_URL_ENV: Record<BillingProductKey, string[]> = {
  credit_pack_100: ["CHECKOUT_URL_CREDIT_PACK_100"],
  credit_pack_500: ["CHECKOUT_URL_CREDIT_PACK_500"],
  indie_desktop_byok: ["CHECKOUT_URL_INDIE_DESKTOP_BYOK"],
  agency_desktop_byok: ["CHECKOUT_URL_AGENCY_DESKTOP_BYOK"],
};

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getEnv = (...keys: string[]): string | null => {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return null;
};

const normalizeProductKey = (value: unknown): BillingProductKey => {
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_PRODUCT_KEY", "product_key is required.");
  }

  const normalized = value.trim().toLowerCase() as BillingProductKey;
  if (
    normalized === "credit_pack_100" ||
    normalized === "credit_pack_500" ||
    normalized === "indie_desktop_byok" ||
    normalized === "agency_desktop_byok"
  ) {
    return normalized;
  }

  throw new HttpError(400, "INVALID_PRODUCT_KEY", `Unsupported product_key: ${value}`);
};

const normalizeUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new HttpError(500, "SUPABASE_NOT_CONFIGURED", "Supabase function secrets are missing.");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required.");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new HttpError(401, "AUTH_REQUIRED", userError?.message ?? "Authentication is required.");
    }

    const body = (await req.json().catch(() => ({}))) as CheckoutRequest;
    const productKey = normalizeProductKey(body.product_key);

    const directUrl = getEnv(...PRODUCT_DIRECT_URL_ENV[productKey]);
    if (directUrl) {
      return jsonResponse({ url: directUrl, checkout_url: directUrl });
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    const priceId = getEnv(...PRODUCT_PRICE_ENV[productKey]);
    if (!stripeSecretKey || !priceId) {
      throw new HttpError(
        500,
        "CHECKOUT_NOT_CONFIGURED",
        `Checkout is not configured for ${productKey}. Add either ${PRODUCT_DIRECT_URL_ENV[productKey][0]} or STRIPE_SECRET_KEY plus ${PRODUCT_PRICE_ENV[productKey][0]} as Supabase function secrets.`
      );
    }

    const requestedReturnUrl = normalizeUrl(body.return_url);
    const successUrl =
      requestedReturnUrl ??
      getEnv("CHECKOUT_SUCCESS_URL", "APP_CHECKOUT_SUCCESS_URL");
    const cancelUrl =
      requestedReturnUrl ??
      getEnv("CHECKOUT_CANCEL_URL", "APP_CHECKOUT_CANCEL_URL") ??
      successUrl;

    if (!successUrl || !cancelUrl) {
      throw new HttpError(
        500,
        "CHECKOUT_RETURN_URL_NOT_CONFIGURED",
        "Checkout success/cancel URLs are not configured. Set CHECKOUT_SUCCESS_URL and CHECKOUT_CANCEL_URL."
      );
    }

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("client_reference_id", userData.user.id);
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("metadata[user_id]", userData.user.id);
    params.set("metadata[product_key]", productKey);
    params.set("metadata[entitlement_policy]", "hosted_and_byok_independent");

    // Checkout creates a payment session only. BYOK licenses and Hosted credits
    // are complementary entitlements; do not cancel, prorate, revoke, or mutate
    // Stripe subscriptions from this flow.

    if (userData.user.email) {
      params.set("customer_email", userData.user.email);
    }

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const stripeText = await stripeResponse.text();
    if (!stripeResponse.ok) {
      throw new HttpError(
        stripeResponse.status,
        "STRIPE_CHECKOUT_FAILED",
        stripeText || "Stripe Checkout session creation failed."
      );
    }

    const stripeSession = JSON.parse(stripeText) as { url?: string; id?: string };
    if (!stripeSession.url) {
      throw new HttpError(502, "STRIPE_CHECKOUT_MISSING_URL", "Stripe did not return a checkout URL.");
    }

    return jsonResponse({
      url: stripeSession.url,
      checkout_url: stripeSession.url,
      session_id: stripeSession.id,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : "CHECKOUT_SESSION_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message, code }, status);
  }
});
