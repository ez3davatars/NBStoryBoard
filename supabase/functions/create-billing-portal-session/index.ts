import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const CUSTOMER_ID_KEYS = new Set([
  "customer",
  "customer_id",
  "stripe_customer",
  "stripe_customer_id",
  "stripe_customerid",
  "stripecustomerid",
]);

const normalizeKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const asStripeCustomerId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^cus_[A-Za-z0-9]+$/.test(trimmed) ? trimmed : null;
};

const findStripeCustomerId = (value: unknown, depth = 0): string | null => {
  if (value === null || value === undefined || depth > 6) return null;

  const directCustomerId = asStripeCustomerId(value);
  if (directCustomerId) return directCustomerId;

  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findStripeCustomerId(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeKey(key);
    if (CUSTOMER_ID_KEYS.has(normalizedKey)) {
      const customerId = asStripeCustomerId(child);
      if (customerId) return customerId;
    }

    const found = findStripeCustomerId(child, depth + 1);
    if (found) return found;
  }

  return null;
};

const findProfileStripeCustomerId = (profile: unknown): string | null => {
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) return null;

  const row = profile as Record<string, unknown>;
  for (const key of CUSTOMER_ID_KEYS) {
    const customerId = asStripeCustomerId(row[key]);
    if (customerId) return customerId;
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
    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new HttpError(500, "SUPABASE_NOT_CONFIGURED", "Supabase function secrets are missing.");
    }
    if (!stripeSecretKey) {
      throw new HttpError(500, "STRIPE_NOT_CONFIGURED", "STRIPE_SECRET_KEY is not configured.");
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

    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
    const profileClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabase;

    let stripeCustomerId = findStripeCustomerId(userData.user.app_metadata);

    if (!stripeCustomerId) {
      const { data: profileData, error: profileError } = await profileClient
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        throw new HttpError(500, "PROFILE_LOOKUP_FAILED", profileError.message);
      }

      stripeCustomerId = findProfileStripeCustomerId(profileData);
    }

    if (!stripeCustomerId) {
      throw new HttpError(
        409,
        "STRIPE_CUSTOMER_NOT_FOUND",
        "No Stripe customer was found for this account. Sign in with the account that owns the Hosted subscription."
      );
    }

    const returnUrl = getEnv("STRIPE_CUSTOMER_PORTAL_RETURN_URL");

    if (!returnUrl) {
      throw new HttpError(
        500,
        "PORTAL_RETURN_URL_NOT_CONFIGURED",
        "Billing portal return URL is not configured. Set STRIPE_CUSTOMER_PORTAL_RETURN_URL."
      );
    }
    if (!isHttpUrl(returnUrl)) {
      throw new HttpError(
        500,
        "PORTAL_RETURN_URL_INVALID",
        "STRIPE_CUSTOMER_PORTAL_RETURN_URL must be an absolute http(s) URL."
      );
    }

    const params = new URLSearchParams();
    params.set("customer", stripeCustomerId);
    params.set("return_url", returnUrl);

    // This creates a customer-managed portal session only. It does not change,
    // cancel, prorate, or revoke Hosted subscriptions, Hosted credits, or BYOK licenses.
    const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
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
        "STRIPE_PORTAL_FAILED",
        stripeText || "Stripe Billing Portal session creation failed."
      );
    }

    const portalSession = JSON.parse(stripeText) as { url?: string; id?: string };
    if (!portalSession.url) {
      throw new HttpError(502, "STRIPE_PORTAL_MISSING_URL", "Stripe did not return a billing portal URL.");
    }

    return jsonResponse({ url: portalSession.url });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : "BILLING_PORTAL_SESSION_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message, code }, status);
  }
});
