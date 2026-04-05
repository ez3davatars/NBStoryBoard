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
