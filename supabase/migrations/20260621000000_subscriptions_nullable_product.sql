-- Subscription sync: make subscriptions.product_id nullable.
--
-- WHY THIS MIGRATION IS NECESSARY
-- The launch hosted-subscription identity is owned by the server-side launch
-- pricing registry (supabase/functions/_shared/launchPricing.ts) via the
-- canonical product_key (subscription_starter / subscription_pro), NOT by the
-- public.products catalog. The stripe-webhook resolves a subscription's plan
-- from Stripe metadata (product_key) that this backend set during checkout.
--
-- Previously public.subscriptions.product_id was NOT NULL with an FK to
-- public.products. That coupled subscription creation to a catalog row that is
-- intentionally decoupled from the registry and may be empty at launch, so the
-- webhook could not persist a subscription at all (and the Account Dashboard
-- showed "Active Subscriptions: 0" after a successful Starter/Pro purchase).
--
-- This is the minimal fix: allow product_id to be NULL. The FK is preserved (a
-- NULL value does not violate it), so a product_id is still populated best-effort
-- when a matching catalog row exists. The canonical product_key is stored in
-- subscriptions.metadata. No data is rewritten; no historical migration is edited.

ALTER TABLE public.subscriptions
  ALTER COLUMN product_id DROP NOT NULL;

COMMENT ON COLUMN public.subscriptions.product_id IS
  'Optional FK to public.products. Nullable: launch hosted-subscription identity is owned by the server launch-pricing registry via metadata.product_key, not the products catalog.';
