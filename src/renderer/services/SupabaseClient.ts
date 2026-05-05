import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import type { BillingProductKey } from '../utils/billingProducts';

// Env variables exposed by Vite will be available here
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize only if URL and key are provided to prevent strict mode crashes if BYOK
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type CheckoutSessionFailureReason =
  | 'AUTH_REQUIRED'
  | 'REQUEST_FAILED'
  | 'MISSING_URL'
  | 'CONFIG_ERROR';

export class CheckoutSessionError extends Error {
  status?: number;
  responseBody?: unknown;
  productKey: BillingProductKey;
  hasAccessToken: boolean;
  reason: CheckoutSessionFailureReason;

  constructor(
    message: string,
    options: {
      productKey: BillingProductKey;
      hasAccessToken: boolean;
      reason: CheckoutSessionFailureReason;
      status?: number;
      responseBody?: unknown;
    }
  ) {
    super(message);
    this.name = 'CheckoutSessionError';
    this.productKey = options.productKey;
    this.hasAccessToken = options.hasAccessToken;
    this.reason = options.reason;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

type CreateCheckoutSessionOptions = {
  accessToken?: string | null;
  requireAuth?: boolean;
};

const parseCheckoutResponseBody = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const getCheckoutUrlFromResponseBody = (responseBody: unknown): string | null => {
  if (!responseBody || typeof responseBody !== 'object') return null;
  const body = responseBody as {
    url?: unknown;
    checkout_url?: unknown;
    checkoutUrl?: unknown;
    session_url?: unknown;
  };

  const checkoutUrl = body.url || body.checkout_url || body.checkoutUrl || body.session_url;
  return typeof checkoutUrl === 'string' && checkoutUrl.trim() ? checkoutUrl : null;
};

export const SupabaseAuth = {
  getAccessToken: async (): Promise<string | null> => {
    if (!supabase) return null;

    const resolve = await supabase.auth.getSession();
    if (resolve?.error) {
      throw new Error(`Auth Error: ${resolve.error.message}`);
    }

    return resolve?.data?.session?.access_token ?? null;
  },

  getValidJwt: async (): Promise<string> => {
    if (!supabase) throw new Error("Supabase is not configured. Check environment variables.");
    
    const resolve = await supabase.auth.getSession();
    const session = resolve?.data?.session;
    const error = resolve?.error;
    
    if (error) {
      throw new Error(`Auth Error: ${error.message}`);
    }
    
    if (!session?.access_token) {
      throw new Error("Authentication required for hosted generation.");
    }
    
    return session.access_token;
  },
  
  signIn: async (email?: string, password?: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    if (!email || !password) throw new Error("Email and password required.");
    
    return await supabase.auth.signInWithPassword({ 
        email, 
        password 
    });
  },
  
  signOut: async () => {
    if (!supabase) return;
    return await supabase.auth.signOut();
  },

  getSession: async () => {
    if (!supabase) return { data: { session: null }, error: null };
    return await supabase.auth.getSession();
  },

  onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
    if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
    return supabase.auth.onAuthStateChange(callback);
  },

  fetchHostedCredits: async (userId: string): Promise<number | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('credit_balance')
      .eq('id', userId)
      .single();
    if (error) {
      console.error("Failed to fetch hosted credits", error);
      return null;
    }
    const balance = Number(data?.credit_balance ?? null);
    return Number.isFinite(balance) ? balance : null;
  },

  createCheckoutSession: async (
    productKey: BillingProductKey,
    options: CreateCheckoutSessionOptions = {}
  ): Promise<string> => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new CheckoutSessionError("Supabase is not configured. Check environment variables.", {
        productKey,
        hasAccessToken: Boolean(options.accessToken),
        reason: 'CONFIG_ERROR'
      });
    }

    const accessToken =
      options.accessToken !== undefined
        ? options.accessToken
        : await SupabaseAuth.getAccessToken();
    const hasAccessToken = Boolean(accessToken);
    const requireAuth = options.requireAuth ?? true;

    if (requireAuth && !accessToken) {
      throw new CheckoutSessionError("Authentication required for checkout.", {
        productKey,
        hasAccessToken,
        reason: 'AUTH_REQUIRED',
        status: 401
      });
    }

    const endpoint = `${supabaseUrl}/functions/v1/create-checkout-session`;

    const payload = {
      productKey,
      client: 'desktop',
      return_url: window.location.href.startsWith('http') ? window.location.href : undefined
    };

    console.log("[Checkout] createCheckoutSession", {
      productKey,
      hasAccessToken: Boolean(accessToken),
      tokenPrefix: accessToken?.slice(0, 12),
    });
    console.log("[Checkout] headers", {
      hasAuthorizationHeader: Boolean(accessToken),
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: accessToken
        ? {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        : {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Accept: 'application/json'
          },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    const responseBody = parseCheckoutResponseBody(text);

    if (!response.ok) {
      throw new CheckoutSessionError(`Checkout session failed (${response.status})`, {
        productKey,
        hasAccessToken,
        reason: response.status === 401 ? 'AUTH_REQUIRED' : 'REQUEST_FAILED',
        status: response.status,
        responseBody
      });
    }

    const checkoutUrl = getCheckoutUrlFromResponseBody(responseBody);
    if (!checkoutUrl) {
      throw new CheckoutSessionError("Checkout session did not return a URL.", {
        productKey,
        hasAccessToken,
        reason: 'MISSING_URL',
        responseBody
      });
    }

    return checkoutUrl;
  },

  createBillingPortalSession: async (): Promise<string> => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured. Check environment variables.");
    }

    const token = await SupabaseAuth.getValidJwt();
    const endpoint = `${supabaseUrl}/functions/v1/create-billing-portal-session`;

    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ client: 'desktop' })
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Billing portal session failed (${response.status}): ${text || response.statusText}`);
    }

    const data = JSON.parse(text) as {
      url?: string;
    };

    const portalUrl = data.url;
    if (!portalUrl) {
      throw new Error("Billing portal session did not return a URL.");
    }

    return portalUrl;
  }
};
