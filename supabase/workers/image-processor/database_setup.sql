-- Execute this file within your Supabase SQL Editor Dashboard.

-- 1. Extend the generations table to safely serialize required executor schema constraints
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS request_payload jsonb;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS provider_model text;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS timing_metrics jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS billing_metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_ledger_reset_at timestamptz;

-- Track Stripe Checkout top-ups so replayed webhook events cannot add credits
-- more than once. Credit packs are independent from BYOK/license entitlements.
CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  stripe_event_id text PRIMARY KEY,
  stripe_session_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  product_key text NOT NULL,
  purchase_kind text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.apply_stripe_credit_topup(
  p_event_id text,
  p_session_id text,
  p_user_id uuid,
  p_product_key text,
  p_credits integer
)
RETURNS TABLE (
  applied boolean,
  credit_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows integer := 0;
  next_credit_balance numeric;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'credits must be a positive integer';
  END IF;

  IF p_product_key NOT IN ('credit_pack_100', 'credit_pack_500') THEN
    RAISE EXCEPTION 'unsupported credit pack product_key: %', p_product_key;
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found for user_id: %', p_user_id;
  END IF;

  INSERT INTO public.stripe_processed_events (
    stripe_event_id,
    stripe_session_id,
    user_id,
    product_key,
    purchase_kind,
    credits
  )
  VALUES (
    p_event_id,
    p_session_id,
    p_user_id,
    p_product_key,
    'TOPUP_PURCHASE',
    p_credits
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  IF inserted_rows = 0 THEN
    SELECT p.credit_balance::numeric
    INTO next_credit_balance
    FROM public.profiles p
    WHERE p.id = p_user_id;

    applied := false;
    credit_balance := next_credit_balance;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.profiles p
  SET credit_balance = COALESCE(p.credit_balance, 0) + p_credits
  WHERE p.id = p_user_id
  RETURNING p.credit_balance::numeric INTO next_credit_balance;

  applied := true;
  credit_balance := next_credit_balance;
  RETURN NEXT;
END;
$$;

-- Reset the visible hosted-usage ledger when a user's balance is topped up.
-- Generation deductions move the balance downward and will not reset the ledger.
CREATE OR REPLACE FUNCTION public.mark_credit_ledger_reload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.credit_ledger_reset_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_credit_ledger_reload_marker ON public.profiles;

CREATE TRIGGER profiles_credit_ledger_reload_marker
BEFORE UPDATE OF credit_balance ON public.profiles
FOR EACH ROW
WHEN (COALESCE(NEW.credit_balance, 0) > COALESCE(OLD.credit_balance, 0))
EXECUTE FUNCTION public.mark_credit_ledger_reload();

-- 2. Extend the status tracking enum to prevent redundant parallel job execution safely
ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'PROCESSING';

-- 3. Construct the atomic database lock RPC
CREATE OR REPLACE FUNCTION claim_next_generation_job()
RETURNS TABLE (
  id uuid,
  provider_model text,
  request_payload jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.generations
  SET status = 'PROCESSING'
  WHERE generations.id = (
    SELECT g.id 
    FROM public.generations g 
    WHERE g.status = 'PENDING' AND g.request_payload IS NOT NULL
    ORDER BY g.created_at ASC 
    LIMIT 1 
    FOR UPDATE SKIP LOCKED
  )
  RETURNING generations.id, generations.provider_model, generations.request_payload;
END;
$$;

-- 4. Enable required networking and scheduler extensions for Edge logic
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 5. Extend the status enum to formally support strict R2 asset expiration cycles
ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'EXPIRED';

-- 6. Construct the automated Edge Function invocation scheduler for autonomous cleanup
-- Idempotent check: Drop existing scheduler if present to prevent duplicate job collision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'r2_expiry_edge_cleanup_cron'
  ) THEN
    PERFORM cron.unschedule('r2_expiry_edge_cleanup_cron');
  END IF;
END
$$;

SELECT 
  cron.schedule(
    'r2_expiry_edge_cleanup_cron', 
    '*/15 * * * *', 
    $$
    SELECT net.http_post(
      url:='https://wtgkeytabshxtspjoegb.supabase.co/functions/v1/cleanup-expired-generations',
      headers:='{"Authorization": "Bearer 1b4d3f6c7a886d4f4b429c3d7f7d4f2e1a912c5d4a2d9e5d", "Content-Type": "application/json"}'::jsonb,
      body:='{}'::jsonb
    );
    $$
  );
