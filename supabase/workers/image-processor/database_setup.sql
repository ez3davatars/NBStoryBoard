-- Execute this file within your Supabase SQL Editor Dashboard.

-- 1. Extend the generations table to safely serialize required executor schema constraints
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS request_payload jsonb;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS provider_model text;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS timing_metrics jsonb DEFAULT '{}'::jsonb;

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
