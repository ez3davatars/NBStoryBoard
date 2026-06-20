-- Fix ambiguous `batch_id` reference in admin_record_affiliate_manual_payout.
--
-- The function declares RETURNS TABLE(... "batch_id" uuid ...), so the bare `batch_id` (and `status`)
-- in the "all items paid?" EXISTS subquery was ambiguous between the OUT column and the payout_items
-- column. Alias public.payout_items AS pi and qualify those columns. The full function definition is
-- copied verbatim from tmp/supabase-baseline/remote-public-schema.sql with NO other behavioral change:
-- same name/arguments, RETURNS TABLE, LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public, and
-- default (VOLATILE) volatility. CREATE OR REPLACE preserves the existing owner and grants.

CREATE OR REPLACE FUNCTION "public"."admin_record_affiliate_manual_payout"("p_payout_item_id" "uuid", "p_payment_method" "text", "p_payment_destination" "text", "p_payment_reference" "text", "p_paid_at" timestamp with time zone DEFAULT "now"(), "p_notes" "text" DEFAULT NULL::"text") RETURNS TABLE("payout_item_id" "uuid", "batch_id" "uuid", "batch_status" "text", "batch_paid_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin_id uuid;
  v_item record;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_destination text := trim(coalesce(p_payment_destination, ''));
  v_reference text := trim(coalesce(p_payment_reference, ''));
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_batch_status text;
  v_batch_paid_at timestamptz;
BEGIN
  IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
    RAISE EXCEPTION 'Access denied: admin only.';
  END IF;

  v_admin_id := auth.uid();

  IF p_payout_item_id IS NULL THEN
    RAISE EXCEPTION 'Payout item is required.';
  END IF;

  IF v_method NOT IN ('paypal', 'ach', 'wise', 'stripe_manual', 'zelle', 'bank_transfer', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  IF v_destination = '' THEN
    RAISE EXCEPTION 'Payment destination is required.';
  END IF;

  IF v_reference = '' THEN
    RAISE EXCEPTION 'Payment reference is required.';
  END IF;

  SELECT
    pi.id,
    pi.batch_id,
    pi.status,
    pi.amount_cents,
    pb.status AS parent_status
  INTO v_item
  FROM public.payout_items pi
  JOIN public.payout_batches pb ON pb.id = pi.batch_id
  WHERE pi.id = p_payout_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout item not found.';
  END IF;

  IF v_item.parent_status <> 'approved' THEN
    RAISE EXCEPTION 'Payout batch must be approved before recording manual payment.';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending payout items can be recorded as paid.';
  END IF;

  IF coalesce(v_item.amount_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero.';
  END IF;

  UPDATE public.payout_items
  SET
    status = 'paid',
    payment_provider = 'manual',
    payment_method = v_method,
    payment_destination = v_destination,
    payment_reference = v_reference,
    paid_by = v_admin_id,
    paid_at = v_paid_at,
    paid_notes = v_notes
  WHERE id = p_payout_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payout_items AS pi
    WHERE pi.batch_id = v_item.batch_id
      AND pi.status <> 'paid'
  ) THEN
    SELECT max(pi.paid_at)
    INTO v_batch_paid_at
    FROM public.payout_items pi
    WHERE pi.batch_id = v_item.batch_id;

    UPDATE public.payout_batches
    SET
      status = 'paid',
      paid_at = v_batch_paid_at
    WHERE id = v_item.batch_id;
  END IF;

  SELECT status, paid_at
  INTO v_batch_status, v_batch_paid_at
  FROM public.payout_batches
  WHERE id = v_item.batch_id;

  RETURN QUERY SELECT p_payout_item_id, v_item.batch_id, v_batch_status, v_batch_paid_at;
END;
$$;
