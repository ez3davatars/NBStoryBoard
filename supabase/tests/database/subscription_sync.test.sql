-- pgTAP tests for server-authoritative subscription synchronization
-- (public.subscriptions) used by the stripe-webhook.
--
-- Covers: the nullable-product_id migration, idempotent upsert on the unique
-- stripe_subscription_id (no duplicate rows on replay), the status check
-- domain, and RLS isolation (one user can never read or modify another user's
-- subscription). Everything runs in one transaction with synthetic UUIDs and
-- ROLLBACK at the end.

BEGIN;
SELECT plan(15);

-- ============================== schema / migration (4) ==============================
SELECT has_table('public', 'subscriptions', 'schema: public.subscriptions exists');
SELECT col_is_null(
  'public', 'subscriptions', 'product_id',
  'migration: subscriptions.product_id is nullable (registry-owned identity)');
SELECT col_is_unique(
  'public', 'subscriptions', 'stripe_subscription_id',
  'schema: stripe_subscription_id is unique (idempotent upsert key)');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscriptions'::regclass),
  'schema: row level security is enabled on subscriptions');

-- ============================== SEED (test-only, rolled back) ==============================
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sub_a@test.local','{}','{}',now(),now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sub_b@test.local','{}','{}',now(),now());

-- ============================== upsert / idempotency (4) ==============================
-- Insert with NULL product_id proves the webhook can persist a launch subscription
-- whose identity lives in metadata.product_key, with an empty products catalog.
SELECT lives_ok(
  $$ INSERT INTO public.subscriptions
       (user_id, product_id, stripe_subscription_id, stripe_customer_id, status,
        current_period_start, current_period_end, metadata)
     VALUES
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 'sub_starter_A', 'cus_A', 'active',
        now(), now() + interval '30 days',
        '{"product_key":"subscription_starter","product_name":"Starter"}'::jsonb) $$,
  'upsert: inserting an active subscription with NULL product_id succeeds');

-- Replaying the same Stripe subscription id must update in place, never duplicate.
SELECT lives_ok(
  $$ INSERT INTO public.subscriptions
       (user_id, product_id, stripe_subscription_id, stripe_customer_id, status,
        current_period_start, current_period_end, metadata)
     VALUES
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 'sub_starter_A', 'cus_A', 'active',
        now(), now() + interval '30 days',
        '{"product_key":"subscription_starter","product_name":"Starter"}'::jsonb)
     ON CONFLICT (stripe_subscription_id)
     DO UPDATE SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
                   updated_at = now() $$,
  'idempotency: replaying the same stripe_subscription_id upserts without error');

SELECT is(
  (SELECT count(*)::int FROM public.subscriptions WHERE stripe_subscription_id = 'sub_starter_A'),
  1, 'idempotency: exactly one row after replay (no duplicate subscription)');

-- A different user's subscription is a separate row.
INSERT INTO public.subscriptions
  (user_id, product_id, stripe_subscription_id, stripe_customer_id, status,
   current_period_start, current_period_end, metadata)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL, 'sub_pro_B', 'cus_B', 'active',
   now(), now() + interval '30 days',
   '{"product_key":"subscription_pro","product_name":"Pro"}'::jsonb);
SELECT is((SELECT count(*)::int FROM public.subscriptions), 2,
  'seed: two distinct subscriptions exist (one per user)');

-- ============================== status domain (1) ==============================
SELECT throws_ok(
  $$ INSERT INTO public.subscriptions
       (user_id, product_id, stripe_subscription_id, status, current_period_start, current_period_end)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 'sub_bad', 'not_a_status', now(), now()) $$,
  '23514', NULL, 'status: an out-of-domain status is rejected by the check constraint');

-- ============================== RLS isolation (5) ==============================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', true);
SELECT is((SELECT count(*)::int FROM public.subscriptions), 1,
  'RLS: user A sees exactly one subscription (their own)');
SELECT is((SELECT stripe_subscription_id FROM public.subscriptions), 'sub_starter_A',
  'RLS: the row user A sees is their own subscription');
-- User A cannot modify user B's subscription: the UPDATE runs but RLS filters it
-- to zero rows (no UPDATE policy for authenticated on other users' rows).
SELECT lives_ok(
  $$ UPDATE public.subscriptions SET status = 'canceled' WHERE stripe_subscription_id = 'sub_pro_B' $$,
  'RLS: user A''s attempt to update user B''s subscription runs without error');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}', true);
SELECT is((SELECT count(*)::int FROM public.subscriptions), 1,
  'RLS: user B sees exactly one subscription (their own)');
SELECT is((SELECT stripe_subscription_id FROM public.subscriptions), 'sub_pro_B',
  'RLS: the row user B sees is their own subscription');
RESET ROLE;

-- As table owner (RLS bypassed), confirm A's blocked UPDATE never touched B's row.
SELECT is(
  (SELECT status FROM public.subscriptions WHERE stripe_subscription_id = 'sub_pro_B'),
  'active', 'RLS: user B''s subscription was not modified by user A');

SELECT finish();
ROLLBACK;
