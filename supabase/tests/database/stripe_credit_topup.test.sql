-- pgTAP integration tests for the DEPLOYED apply_stripe_credit_topup RPC (baseline schema), which the
-- stripe-webhook function calls for both credit-pack top-ups and subscription invoice grants.
--
-- Deployed contract under test (from the remote baseline):
--   public.apply_stripe_credit_topup(p_user_id uuid, p_credits integer, p_stripe_event_id text,
--                                    p_event_type text DEFAULT NULL) RETURNS void
--     [SECURITY DEFINER, service_role only; idempotent on p_stripe_event_id via
--      public.stripe_processed_events(id)]
--
-- Everything runs in one transaction with synthetic, test-only UUIDs and ROLLBACK at the end.

BEGIN;
SELECT plan(17);

-- ============================== contract sanity (2) ==============================
SELECT has_function(
  'public', 'apply_stripe_credit_topup', ARRAY['uuid','integer','text','text'],
  'contract: apply_stripe_credit_topup(uuid,integer,text,text) exists');
SELECT function_returns(
  'public', 'apply_stripe_credit_topup', ARRAY['uuid','integer','text','text'], 'void',
  'contract: apply_stripe_credit_topup returns void');

-- ============================== SEED (test-only, rolled back) ==============================
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000000','authenticated','authenticated','topup_a@test.local','{}','{}',now(),now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','00000000-0000-0000-0000-000000000000','authenticated','authenticated','topup_b@test.local','{}','{}',now(),now());

INSERT INTO public.profiles (id, credit_balance, promotional_credit_balance) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0, 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0, 0);

-- ============================== B. Grant happy path (4) ==============================
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0::numeric,
  'B: starting balance is 0');
SELECT lives_ok(
  $$ SELECT public.apply_stripe_credit_topup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 100, 'evt_topup_1', 'checkout.session.completed') $$,
  'B: valid checkout.session.completed grants 100 credits');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 100::numeric,
  'B: ending balance is 100');
SELECT is((SELECT count(*)::int FROM public.stripe_processed_events WHERE id='evt_topup_1'), 1,
  'B: the Stripe event id was recorded exactly once');

-- ============================== C. Idempotent replay (3) ==============================
SELECT lives_ok(
  $$ SELECT public.apply_stripe_credit_topup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 100, 'evt_topup_1', 'checkout.session.completed') $$,
  'C: replaying the same event does not error (HTTP 200 equivalent)');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 100::numeric,
  'C: balance unchanged after duplicate replay (no double credit)');
SELECT is((SELECT count(*)::int FROM public.stripe_processed_events WHERE id='evt_topup_1'), 1,
  'C: still exactly one recorded event after replay');

-- ============================== D. Fail-closed guards (4) ==============================
-- Unknown/nonexistent user (valid uuid, no profile) raises and leaves the real balance untouched.
SELECT throws_ok(
  $$ SELECT public.apply_stripe_credit_topup('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 100, 'evt_bad_user', 'checkout.session.completed') $$,
  'P0001', NULL, 'D: unknown user raises (profile not found)');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 100::numeric,
  'D: a failed grant does not change any existing balance');
SELECT throws_ok(
  $$ SELECT public.apply_stripe_credit_topup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 0, 'evt_zero', 'checkout.session.completed') $$,
  'P0001', NULL, 'D: non-positive credits raises');
SELECT throws_ok(
  $$ SELECT public.apply_stripe_credit_topup(NULL::uuid, 100, 'evt_null_user', 'checkout.session.completed') $$,
  'P0001', NULL, 'D: null user raises');

-- ============================== E. Privilege enforcement (4) ==============================
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ SELECT public.apply_stripe_credit_topup('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 50, 'evt_topup_svc', 'checkout.session.completed') $$,
  'E: service_role can invoke the RPC');
RESET ROLE;
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 50::numeric,
  'E: service_role grant applied (0 -> 50)');

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.apply_stripe_credit_topup('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 50, 'evt_perm_auth', 'checkout.session.completed') $$,
  '42501', NULL, 'E: authenticated cannot invoke the privileged RPC directly');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.apply_stripe_credit_topup('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 50, 'evt_perm_anon', 'checkout.session.completed') $$,
  '42501', NULL, 'E: anon cannot invoke the privileged RPC directly');
RESET ROLE;

SELECT finish();
ROLLBACK;
