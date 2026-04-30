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

export const SupabaseAuth = {
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

  createCheckoutSession: async (productKey: BillingProductKey): Promise<string> => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured. Check environment variables.");
    }

    const token = await SupabaseAuth.getValidJwt();
    const endpoint = `${supabaseUrl}/functions/v1/create-checkout-session`;

    const payload = {
      product_key: productKey,
      client: 'desktop',
      return_url: window.location.href.startsWith('http') ? window.location.href : undefined
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Checkout session failed (${response.status}): ${text || response.statusText}`);
    }

    const data = JSON.parse(text) as {
      url?: string;
      checkout_url?: string;
      checkoutUrl?: string;
      session_url?: string;
    };

    const checkoutUrl = data.url || data.checkout_url || data.checkoutUrl || data.session_url;
    if (!checkoutUrl) {
      throw new Error("Checkout session did not return a URL.");
    }

    return checkoutUrl;
  }
};
