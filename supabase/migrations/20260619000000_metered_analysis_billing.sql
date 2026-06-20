-- Metered hosted-analysis billing (gemini-standard-2026-06).
--
-- Adds the two-phase reserve->settle RPC for usage-metered analysis: start_generation already debits a
-- conservative reservation; settle_generation reduces the charge to the actual metered amount and
-- refunds the unused reservation, idempotently per provider response. Balances are `numeric`, so
-- microcredit-precision (fractional credit) charges are stored without a column type change.
--
-- NOTE: run `supabase db push` (or apply in the SQL editor) and the migration/RPC tests BEFORE
-- deploying the updated generate-image function. The edge reserves a bounded max per metered call and
-- relies on settle_generation to refund down to actual; deploying the edge without this migration would
-- leave each metered call charged at its (bounded) reservation until reconciled.

-- 1. Ledger columns for per-call metered settlement and idempotency.
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS provider_response_id text;
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS settlement_status text;

-- Idempotency: a given provider response can settle at most once.
CREATE UNIQUE INDEX IF NOT EXISTS generations_provider_response_settle_idx
  ON public.generations (provider_response_id)
  WHERE provider_response_id IS NOT NULL;

-- Fractional / microcredit precision: the metered settlement charges a sub-credit (numeric) amount and
-- refunds numeric remainders, so the per-generation charge and the wallet balance MUST be numeric. The
-- baseline created these as integer, which would round every fractional settlement to a whole credit.
-- The DEFAULT and the non-negative CHECK constraints are preserved by the type change.
-- generations.cost is referenced by two support views, so drop them, change the type, then recreate them
-- verbatim (columns, predicate, security_invoker, owner, and grants preserved).
DROP VIEW IF EXISTS public.failed_generations_support_view;
DROP VIEW IF EXISTS public.pending_generations_support_view;
-- credit_balance is referenced by a BEFORE UPDATE OF trigger; drop it, change the type, recreate it verbatim.
DROP TRIGGER IF EXISTS profiles_credit_ledger_reload_marker ON public.profiles;

ALTER TABLE public.generations ALTER COLUMN cost TYPE numeric USING cost::numeric;
ALTER TABLE public.profiles ALTER COLUMN credit_balance TYPE numeric USING credit_balance::numeric;

CREATE TRIGGER profiles_credit_ledger_reload_marker
  BEFORE UPDATE OF credit_balance ON public.profiles
  FOR EACH ROW WHEN ((COALESCE(new.credit_balance, 0) > COALESCE(old.credit_balance, 0)))
  EXECUTE FUNCTION public.mark_credit_ledger_reload();

CREATE VIEW public.failed_generations_support_view WITH (security_invoker='on') AS
 SELECT id, user_id, generation_type, is_byok, cost, failure_code, error_message, provider, provider_model, created_at, failed_at
   FROM public.generations g
  WHERE (status = 'FAILED'::public.generation_status);
ALTER VIEW public.failed_generations_support_view OWNER TO postgres;
GRANT ALL ON TABLE public.failed_generations_support_view TO anon;
GRANT ALL ON TABLE public.failed_generations_support_view TO authenticated;
GRANT ALL ON TABLE public.failed_generations_support_view TO service_role;

CREATE VIEW public.pending_generations_support_view WITH (security_invoker='on') AS
 SELECT id, user_id, generation_type, is_byok, cost, provider, provider_model, created_at, started_at
   FROM public.generations g
  WHERE (status = 'PENDING'::public.generation_status);
ALTER VIEW public.pending_generations_support_view OWNER TO postgres;
GRANT ALL ON TABLE public.pending_generations_support_view TO anon;
GRANT ALL ON TABLE public.pending_generations_support_view TO authenticated;
GRANT ALL ON TABLE public.pending_generations_support_view TO service_role;

-- 2. settle_generation: reduce the reserved cost to the actual metered amount and refund the unused
--    reservation. Idempotent on (generation, provider_response_id). Never produces a negative refund.
CREATE OR REPLACE FUNCTION public.settle_generation(
  p_generation_id uuid,
  p_actual_cost numeric,
  p_provider_response_id text
)
RETURNS public.generations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_job public.generations%ROWTYPE;
  updated_job public.generations%ROWTYPE;
  refund numeric := 0;
BEGIN
  IF p_actual_cost IS NULL OR p_actual_cost < 0 THEN
    RAISE EXCEPTION 'actual cost must be zero or greater';
  END IF;

  SELECT g.* INTO target_job
  FROM public.generations g
  WHERE g.id = p_generation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation not found: %', p_generation_id;
  END IF;

  -- Idempotent replay: a settled job cannot settle again (prevents double charging / double refunding).
  IF target_job.settlement_status = 'SETTLED'
     AND target_job.provider_response_id IS NOT DISTINCT FROM p_provider_response_id THEN
    RETURN target_job;
  END IF;

  -- Over-reservation guard: if the actual metered cost exceeds the reservation, DO NOT silently cap it
  -- as a normal settlement (that would hide a genuine undercharge). Flag RECONCILE_PENDING, keep the
  -- already-debited reservation as the charge (so the wallet is never driven negative and the confirmed
  -- provider usage is preserved), and emit a financial alert for manual reconciliation.
  IF p_actual_cost > COALESCE(target_job.cost, 0) THEN
    UPDATE public.generations g
    SET settlement_status = 'RECONCILE_PENDING',
        provider_response_id = COALESCE(p_provider_response_id, g.provider_response_id)
    WHERE g.id = p_generation_id
    RETURNING * INTO updated_job;

    RAISE WARNING 'settle_generation: actual cost % exceeds reservation % for generation % (RECONCILE_PENDING)',
      p_actual_cost, COALESCE(target_job.cost, 0), p_generation_id;

    RETURN updated_job;
  END IF;

  refund := COALESCE(target_job.cost, 0) - p_actual_cost;

  UPDATE public.generations g
  SET cost = p_actual_cost,
      provider_response_id = COALESCE(p_provider_response_id, g.provider_response_id),
      settlement_status = 'SETTLED'
  WHERE g.id = p_generation_id
  RETURNING * INTO updated_job;

  IF refund > 0 AND NOT COALESCE(target_job.is_byok, false) THEN
    UPDATE public.profiles p
    SET credit_balance = COALESCE(p.credit_balance, 0) + refund
    WHERE p.id = target_job.user_id;
  END IF;

  RETURN updated_job;
END;
$$;

-- 3. release_reservation: full release of an unused reservation (e.g. provider failure with no billable
--    usage). Refunds the entire reserved cost and zeroes it. Idempotent via settlement_status.
CREATE OR REPLACE FUNCTION public.release_reservation(
  p_generation_id uuid
)
RETURNS public.generations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_job public.generations%ROWTYPE;
  updated_job public.generations%ROWTYPE;
BEGIN
  SELECT g.* INTO target_job
  FROM public.generations g
  WHERE g.id = p_generation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation not found: %', p_generation_id;
  END IF;

  IF target_job.settlement_status = 'RELEASED' THEN
    RETURN target_job;
  END IF;

  IF NOT COALESCE(target_job.is_byok, false) AND COALESCE(target_job.cost, 0) > 0 THEN
    UPDATE public.profiles p
    SET credit_balance = COALESCE(p.credit_balance, 0) + COALESCE(target_job.cost, 0)
    WHERE p.id = target_job.user_id;
  END IF;

  UPDATE public.generations g
  SET cost = 0, settlement_status = 'RELEASED'
  WHERE g.id = p_generation_id
  RETURNING * INTO updated_job;

  RETURN updated_job;
END;
$$;

-- Privileged billing RPCs are SECURITY DEFINER and perform no per-row ownership check (the trusted edge
-- validates ownership and calls them with the service role). They must be callable ONLY by the service
-- role — matching start_generation — so an authenticated/anonymous client cannot settle or release any
-- generation directly. Without these the functions default to PUBLIC EXECUTE (a privilege-escalation gap).
-- Revoke from PUBLIC and from the anon/authenticated client roles explicitly: Supabase default
-- privileges grant EXECUTE on public functions to authenticated/anon, so REVOKE FROM PUBLIC alone is
-- insufficient. Only the service role (used by the trusted edge) may execute the billing RPCs.
REVOKE ALL ON FUNCTION public.settle_generation(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_generation(uuid, numeric, text) TO service_role;
REVOKE ALL ON FUNCTION public.release_reservation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_reservation(uuid) TO service_role;

-- 4. Paid vs promotional credit accounting.
-- Strict rule: metered hosted Google operations debit PAID credits only (`profiles.credit_balance`).
-- Promotional/free credits live in a separate column and may fund non-provider product features only.
-- start_generation / settle_generation / release_reservation above operate exclusively on credit_balance,
-- so metered Google calls already never draw down promotional credits. The reservation refund therefore
-- always returns to the paid (credit_balance) source. Generation rows are tagged in billing_metadata with
-- "fundingSource":"paid" so usage history can show the source without exposing payment details.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS promotional_credit_balance numeric DEFAULT 0;

-- 5. Administrative reconciliation report: surfaces rows needing financial review. Read-only; never
-- mutates historical customer charges (adjustments require an explicit, separate policy/process).
CREATE OR REPLACE VIEW public.hosted_metered_reconciliation AS
SELECT
  g.id AS generation_id,
  g.user_id,
  g.created_at,
  g.cost AS charged_credits,
  g.settlement_status,
  g.provider_response_id,
  g.billing_metadata->>'operation'        AS operation,
  g.billing_metadata->>'analysisKind'     AS analysis_kind,
  g.billing_metadata->>'billingUnit'      AS billing_unit,
  g.billing_metadata->>'providerModel'    AS provider_model,
  g.billing_metadata->>'providerServiceTier' AS provider_service_tier,
  g.billing_metadata->>'pricingVersion'   AS pricing_version,
  g.billing_metadata->>'pricingSource'    AS pricing_source,
  g.billing_metadata->>'providerListCostNanoUsd'    AS provider_list_cost_nano_usd,
  g.billing_metadata->>'providerInvoicedCostNanoUsd' AS provider_invoiced_cost_nano_usd,
  g.billing_metadata->>'customerPriceNanoUsd'        AS customer_price_nano_usd,
  CASE
    WHEN g.settlement_status = 'RECONCILE_PENDING' THEN 'reconcile_pending'
    WHEN g.billing_metadata->>'creditMicroUnitsCharged' IS NULL AND g.billing_metadata ? 'billingUnit' THEN 'missing_credit_value_or_usage'
    WHEN (g.billing_metadata->>'providerModel') IS NULL AND g.billing_metadata ? 'billingUnit' THEN 'unknown_model_or_tier'
    ELSE 'ok'
  END AS reconciliation_flag
FROM public.generations g
WHERE g.billing_metadata ? 'billingUnit';
