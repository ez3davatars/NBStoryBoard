// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../deno-edge.d.ts" />

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
  productKey?: unknown;
  priceId?: unknown;
  price_id?: unknown;
  stripe_price_id?: unknown;
  mode?: unknown;
  purchaseKind?: unknown;
  purchase_kind?: unknown;
  return_url?: unknown;
};

type CheckoutProductConfig = {
  stripePriceId: string | null;
  mode: "payment" | "subscription";
  purchaseKind?: "TOPUP_PURCHASE" | "BYOK_LICENSE" | "HOSTED_SUBSCRIPTION" | "SUPPORT_RENEWAL";
  productKey: string;
  credits?: number;
};

const getEnv = (...keys: string[]): string | null => {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return null;
};

const PRICE_MAP: Record<BillingProductKey, CheckoutProductConfig> = {
  credit_pack_100: {
    stripePriceId: getEnv("STRIPE_PRICE_CREDIT_PACK_100"),
    mode: "payment",
    purchaseKind: "TOPUP_PURCHASE",
    productKey: "credit_pack_100",
    credits: 100,
  },
  credit_pack_500: {
    stripePriceId: getEnv("STRIPE_PRICE_CREDIT_PACK_500"),
    mode: "payment",
    purchaseKind: "TOPUP_PURCHASE",
    productKey: "credit_pack_500",
    credits: 500,
  },
  // Future pack placeholder:
  // credit_pack_1000: {
  //   stripePriceId: getEnv("STRIPE_PRICE_CREDIT_PACK_1000"),
  //   mode: "payment",
  //   purchaseKind: "TOPUP_PURCHASE",
  //   productKey: "credit_pack_1000",
  //   credits: 1000,
  // },
  indie_desktop_byok: {
    stripePriceId: getEnv("STRIPE_PRICE_INDIE_DESKTOP_BYOK"),
    mode: "payment",
    productKey: "indie_desktop_byok",
  },
  agency_desktop_byok: {
    stripePriceId: getEnv("STRIPE_PRICE_AGENCY_DESKTOP_BYOK"),
    mode: "payment",
    productKey: "agency_desktop_byok",
  },
};

const PRODUCT_DIRECT_URL_ENV: Partial<Record<BillingProductKey, string[]>> = {
  indie_desktop_byok: ["CHECKOUT_URL_INDIE_DESKTOP_BYOK"],
  agency_desktop_byok: ["CHECKOUT_URL_AGENCY_DESKTOP_BYOK"],
};

class HttpError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeProductKey = (value: unknown): BillingProductKey => {
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_PRODUCT_KEY", "product_key is required.");
  }

  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === "credit_pack_1000") {
    throw new HttpError(400, "UNKNOWN_PRODUCT", "Unknown or inactive credit pack.");
  }

  const normalized = normalizedValue as BillingProductKey;
  if (Object.prototype.hasOwnProperty.call(PRICE_MAP, normalized)) return normalized;

  throw new HttpError(400, "UNKNOWN_PRODUCT", "Unknown or inactive credit pack.");
};

const normalizeStripePriceId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("price_")) return null;
  return trimmed;
};

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
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

const isCreditPackProductKey = (productKey: BillingProductKey): boolean =>
  productKey === "credit_pack_100" ||
  productKey === "credit_pack_500";

const getBearerToken = (req: Request): string | null => {
  const authHeader =
    req.headers.get("authorization") ??
    req.headers.get("Authorization");
  return authHeader?.replace(/^Bearer\s+/i, "").trim() || null;
};

const createCheckoutMetadata = (
  config: CheckoutProductConfig,
  userId: string | null,
  userEmail: string | null,
  requestPurchaseKind?: unknown
): Record<string, string> => {
  const metadata: Record<string, string> = {
    product_key: config.productKey,
  };

  if (config.productKey === "legacy_price_checkout") {
    metadata.source = "legacy_price_id";
    if (typeof requestPurchaseKind === "string" && requestPurchaseKind.trim()) {
      metadata.purchase_kind = requestPurchaseKind.trim();
    }
    return metadata;
  }

  if (config.purchaseKind === "TOPUP_PURCHASE" && typeof config.credits === "number") {
    metadata.purchase_kind = "TOPUP_PURCHASE";
    metadata.credits = String(config.credits);
    metadata.user_id = userId ?? "";
    metadata.email = userEmail ?? "";
    return metadata;
  }

  metadata.entitlement_policy = "hosted_and_byok_independent";
  if (userId) metadata.user_id = userId;
  if (userEmail) metadata.email = userEmail;
  return metadata;
};

const appendMetadata = (
  params: URLSearchParams,
  metadata: Record<string, string>,
  mode: CheckoutProductConfig["mode"]
) => {
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, value);
    if (mode === "subscription") {
      params.set(`subscription_data[metadata][${key}]`, value);
    } else {
      params.set(`payment_intent_data[metadata][${key}]`, value);
    }
  }
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

    const body = (await req.json().catch(() => ({}))) as CheckoutRequest;
    const rawProductKey = body.product_key ?? body.productKey;
    const legacyPriceId = normalizeStripePriceId(
      body.priceId ?? body.price_id ?? body.stripe_price_id
    );

    let productConfig: CheckoutProductConfig | null = null;
    let productKey: BillingProductKey | null = null;

    if (rawProductKey) {
      productKey = normalizeProductKey(rawProductKey);
      productConfig = PRICE_MAP[productKey];
    } else if (legacyPriceId) {
      productConfig = {
        stripePriceId: legacyPriceId,
        mode: body.mode === "subscription" ? "subscription" : "payment",
        productKey: "legacy_price_checkout",
      };
    } else {
      throw new HttpError(
        400,
        "INVALID_CHECKOUT_REQUEST",
        "product_key or price_id is required."
      );
    }

    const isCreditPack = productKey ? isCreditPackProductKey(productKey) : false;

    const directUrlEnv = productKey ? PRODUCT_DIRECT_URL_ENV[productKey] : null;
    const directUrl = directUrlEnv ? getEnv(...directUrlEnv) : null;
    if (directUrl) {
      return jsonResponse({ url: directUrl, checkout_url: directUrl });
    }

    const token = getBearerToken(req);
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (isCreditPack) {
      if (!token) {
        return jsonResponse({
          error: "Auth session missing!",
          code: "AUTH_REQUIRED"
        }, 401);
      }

      const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });

      const { data: userData, error: userError } =
        await supabaseAuthClient.auth.getUser(token);

      if (userError || !userData?.user) {
        console.error("[Checkout] Invalid auth token", {
          error: userError?.message,
          hasToken: Boolean(token),
          tokenPrefix: token?.slice(0, 12),
        });

        return jsonResponse({
          error: "Invalid or expired session. Please sign in again.",
          code: "INVALID_SESSION"
        }, 401);
      }

      userId = userData.user.id;
      userEmail = userData.user.email ?? null;
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey || !productConfig.stripePriceId) {
      throw new HttpError(
        500,
        "CHECKOUT_NOT_CONFIGURED",
        `Checkout is not configured for ${productKey ?? productConfig.productKey}. Add STRIPE_SECRET_KEY plus the Stripe price secret for this product.`
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

    const metadata = createCheckoutMetadata(
      productConfig,
      userId,
      userEmail,
      body.purchaseKind ?? body.purchase_kind
    );
    const params = new URLSearchParams();
    params.set("mode", productConfig.mode);
    params.set("allow_promotion_codes", "true");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    if (userId) {
      params.set("client_reference_id", userId);
    }
    params.set("line_items[0][price]", productConfig.stripePriceId);
    params.set("line_items[0][quantity]", "1");
    appendMetadata(params, metadata, productConfig.mode);

    // Checkout creates a one-time payment session. Credit packs are identified
    // only by server-owned metadata and must not grant BYOK or download access.

    if (userEmail) {
      params.set("customer_email", userEmail);
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
      const stripeBody = parseJsonObject(stripeText);
      const stripeError =
        stripeBody?.error && typeof stripeBody.error === "object" && !Array.isArray(stripeBody.error)
          ? stripeBody.error as Record<string, unknown>
          : null;
      const stripeCode = typeof stripeError?.code === "string" ? stripeError.code : undefined;
      const stripeMessage = typeof stripeError?.message === "string" ? stripeError.message : undefined;
      const stripeParam = typeof stripeError?.param === "string" ? stripeError.param : undefined;
      const stripeType = typeof stripeError?.type === "string" ? stripeError.type : undefined;

      console.error("[Checkout] Stripe checkout failed", {
        productKey: productKey ?? productConfig.productKey,
        status: stripeResponse.status,
        stripeCode,
        stripeMessage,
        stripeParam,
        stripeType,
        mode: productConfig.mode,
      });

      throw new HttpError(
        stripeResponse.status,
        "STRIPE_CHECKOUT_FAILED",
        stripeMessage || stripeText || "Stripe Checkout session creation failed.",
        {
          stripeCode,
          stripeMessage,
          stripeParam,
          stripeType,
          productKey: productKey ?? productConfig.productKey,
          mode: productConfig.mode,
        }
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
    const details = error instanceof HttpError ? error.details : {};
    return jsonResponse({ error: message, code, ...details }, status);
  }
});
