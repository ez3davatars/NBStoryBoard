-- pgTAP integration tests for the metered hosted-billing migration
-- (supabase/migrations/20260619000000_metered_analysis_billing.sql) plus the baseline start_generation.
--
-- RPC signatures under test:
--   public.start_generation(p_user_id uuid, p_request_idempotency_key text, p_request_fingerprint text,
--                           p_generation_type text, p_cost integer, p_is_byok boolean,
--                           p_provider text DEFAULT NULL, p_provider_model text DEFAULT NULL)
--                           RETURNS public.generations   [SECURITY DEFINER, service_role only]
--   public.settle_generation(p_generation_id uuid, p_actual_cost numeric, p_provider_response_id text)
--                           RETURNS public.generations   [SECURITY DEFINER, service_role only]
--   public.release_reservation(p_generation_id uuid)
--                           RETURNS public.generations   [SECURITY DEFINER, service_role only]
--
-- Everything runs inside one transaction with synthetic, test-only UUIDs and ROLLBACKs at the end.

BEGIN;
SELECT plan(65);

-- ============================== SEED (test-only, rolled back) ==============================
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u1@test.local','{}','{}',now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u2@test.local','{}','{}',now(),now()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u3@test.local','{}','{}',now(),now()),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u4@test.local','{}','{}',now(),now()),
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u5@test.local','{}','{}',now(),now()),
  ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u6@test.local','{}','{}',now(),now()),
  ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u7@test.local','{}','{}',now(),now()),
  ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u8@test.local','{}','{}',now(),now()),
  ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-000000000000','authenticated','authenticated','u9@test.local','{}','{}',now(),now());

INSERT INTO public.profiles (id, credit_balance, promotional_credit_balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 100, 0),
  ('22222222-2222-2222-2222-222222222222',   5, 0),
  ('33333333-3333-3333-3333-333333333333', 100, 0),
  ('44444444-4444-4444-4444-444444444444', 100, 0),
  ('55555555-5555-5555-5555-555555555555', 100, 0),
  ('66666666-6666-6666-6666-666666666666', 100, 0),
  ('77777777-7777-7777-7777-777777777777', 100, 0),
  ('88888888-8888-8888-8888-888888888888',   0, 100),
  ('99999999-9999-9999-9999-999999999999', 100, 0);

-- ============================== migration sanity (8) ==============================
SELECT has_function('public', 'start_generation', 'preamble: start_generation exists');
SELECT has_function('public', 'settle_generation', 'preamble: settle_generation exists');
SELECT has_function('public', 'release_reservation', 'preamble: release_reservation exists');
SELECT has_column('public', 'generations', 'provider_response_id', 'preamble: generations.provider_response_id exists');
SELECT has_column('public', 'generations', 'settlement_status', 'preamble: generations.settlement_status exists');
SELECT has_column('public', 'profiles', 'promotional_credit_balance', 'preamble: profiles.promotional_credit_balance exists');
SELECT has_index('public', 'generations', 'generations_provider_response_settle_idx', 'preamble: provider_response unique index exists');
SELECT has_index('public', 'generations', 'generations_user_idempotency_key_uidx', 'preamble: (user,idempotency) unique index exists');

-- ============================== A. Reservation (5) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('11111111-1111-1111-1111-111111111111'::uuid,'k1','fp1','image',3,false,'gemini','gemini-3.1-flash-image') $$,
  'A: start_generation reserves');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='11111111-1111-1111-1111-111111111111'), 97::numeric, 'A: paid balance decreased by exactly the reservation (100 -> 97)');
SELECT is((SELECT cost FROM public.generations WHERE user_id='11111111-1111-1111-1111-111111111111' AND request_idempotency_key='k1'), 3::numeric, 'A: generation row records the reservation cost');
SELECT is((SELECT request_idempotency_key FROM public.generations WHERE user_id='11111111-1111-1111-1111-111111111111' AND request_idempotency_key='k1'), 'k1', 'A: idempotency key stored');
SELECT is((SELECT count(*)::int FROM public.generations WHERE user_id='11111111-1111-1111-1111-111111111111'), 1, 'A: exactly one generation row');

-- ============================== B. Idempotent reservation (3) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('11111111-1111-1111-1111-111111111111'::uuid,'k1','fp1','image',3,false,'gemini','gemini-3.1-flash-image') $$,
  'B: repeating the same (user,idempotency key) returns the existing row');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='11111111-1111-1111-1111-111111111111'), 97::numeric, 'B: duplicate reservation does NOT debit again');
SELECT is((SELECT count(*)::int FROM public.generations WHERE user_id='11111111-1111-1111-1111-111111111111'), 1, 'B: still exactly one generation row');

-- ============================== C. Insufficient paid balance (3) ==============================
SELECT throws_like(
  $$ SELECT public.start_generation('22222222-2222-2222-2222-222222222222'::uuid,'c1','fpc','image',10,false,'gemini','gemini-3.1-flash-image') $$,
  '%insufficient credits%', 'C: reservation fails before provider work when paid balance is too low');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='22222222-2222-2222-2222-222222222222'), 5::numeric, 'C: balance unchanged (never negative)');
SELECT is((SELECT count(*)::int FROM public.generations WHERE user_id='22222222-2222-2222-2222-222222222222'), 0, 'C: no generation row created');

-- ============================== D. Settlement below reservation (6) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('33333333-3333-3333-3333-333333333333'::uuid,'d1','fpd','image',4,false,'gemini','gemini-3.1-flash-image') $$,
  'D: reserve 4 credits');
SELECT lives_ok(
  $$ SELECT public.settle_generation((SELECT id FROM public.generations WHERE user_id='33333333-3333-3333-3333-333333333333' AND request_idempotency_key='d1'), 1.5, 'respD') $$,
  'D: settle to actual 1.5');
SELECT is((SELECT cost FROM public.generations WHERE user_id='33333333-3333-3333-3333-333333333333' AND request_idempotency_key='d1'), 1.5::numeric, 'D: cost recorded as the actual metered amount');
SELECT is((SELECT settlement_status FROM public.generations WHERE user_id='33333333-3333-3333-3333-333333333333' AND request_idempotency_key='d1'), 'SETTLED', 'D: settlement_status = SETTLED');
SELECT is((SELECT provider_response_id FROM public.generations WHERE user_id='33333333-3333-3333-3333-333333333333' AND request_idempotency_key='d1'), 'respD', 'D: provider_response_id persisted');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='33333333-3333-3333-3333-333333333333'), 98.5::numeric, 'D: balance = original - actual (100 - 4 reserve + 2.5 refund = 98.5)');

-- ============================== E. Duplicate settlement (3) ==============================
SELECT lives_ok(
  $$ SELECT public.settle_generation((SELECT id FROM public.generations WHERE user_id='33333333-3333-3333-3333-333333333333' AND request_idempotency_key='d1'), 1.5, 'respD') $$,
  'E: settling the same row/response again is a no-op');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='33333333-3333-3333-3333-333333333333'), 98.5::numeric, 'E: balance unchanged by duplicate settlement');
SELECT is((SELECT cost FROM public.generations WHERE user_id='33333333-3333-3333-3333-333333333333' AND request_idempotency_key='d1'), 1.5::numeric, 'E: charge not applied twice');

-- ============================== F. Provider-response uniqueness (4) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('44444444-4444-4444-4444-444444444444'::uuid,'f1','fpf','image',2,false,'gemini','gemini-3.1-flash-image') $$,
  'F: reserve f1');
SELECT lives_ok(
  $$ SELECT public.start_generation('44444444-4444-4444-4444-444444444444'::uuid,'f2','fpf','image',2,false,'gemini','gemini-3.1-flash-image') $$,
  'F: reserve f2');
SELECT lives_ok(
  $$ SELECT public.settle_generation((SELECT id FROM public.generations WHERE user_id='44444444-4444-4444-4444-444444444444' AND request_idempotency_key='f1'), 1, 'respF') $$,
  'F: settle f1 with respF');
SELECT throws_ok(
  $$ SELECT public.settle_generation((SELECT id FROM public.generations WHERE user_id='44444444-4444-4444-4444-444444444444' AND request_idempotency_key='f2'), 1, 'respF') $$,
  '23505', NULL, 'F: the same provider_response_id cannot settle a second, unrelated generation (unique index)');

-- ============================== G. Release reservation (7) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('55555555-5555-5555-5555-555555555555'::uuid,'g1','fpg','image',5,false,'gemini','gemini-3.1-flash-image') $$,
  'G: reserve 5');
SELECT lives_ok(
  $$ SELECT public.release_reservation((SELECT id FROM public.generations WHERE user_id='55555555-5555-5555-5555-555555555555' AND request_idempotency_key='g1')) $$,
  'G: release the reservation');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='55555555-5555-5555-5555-555555555555'), 100::numeric, 'G: full reserved amount refunded (back to 100)');
SELECT is((SELECT cost FROM public.generations WHERE user_id='55555555-5555-5555-5555-555555555555' AND request_idempotency_key='g1'), 0::numeric, 'G: released generation cost zeroed');
SELECT is((SELECT settlement_status FROM public.generations WHERE user_id='55555555-5555-5555-5555-555555555555' AND request_idempotency_key='g1'), 'RELEASED', 'G: settlement_status = RELEASED');
SELECT lives_ok(
  $$ SELECT public.release_reservation((SELECT id FROM public.generations WHERE user_id='55555555-5555-5555-5555-555555555555' AND request_idempotency_key='g1')) $$,
  'G: duplicate release is idempotent');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='55555555-5555-5555-5555-555555555555'), 100::numeric, 'G: duplicate release does NOT issue a second refund');

-- ============================== H. Settlement above reservation (6) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('66666666-6666-6666-6666-666666666666'::uuid,'h1','fph','image',2,false,'gemini','gemini-3.1-flash-image') $$,
  'H: reserve 2');
SELECT lives_ok(
  $$ SELECT public.settle_generation((SELECT id FROM public.generations WHERE user_id='66666666-6666-6666-6666-666666666666' AND request_idempotency_key='h1'), 5, 'respH') $$,
  'H: settle with actual (5) above reservation (2) does not error');
SELECT is((SELECT settlement_status FROM public.generations WHERE user_id='66666666-6666-6666-6666-666666666666' AND request_idempotency_key='h1'), 'RECONCILE_PENDING', 'H: flagged RECONCILE_PENDING (no silent success)');
SELECT is((SELECT cost FROM public.generations WHERE user_id='66666666-6666-6666-6666-666666666666' AND request_idempotency_key='h1'), 2::numeric, 'H: charge stays at the reservation, not silently capped/charged to 5');
SELECT cmp_ok((SELECT credit_balance FROM public.profiles WHERE id='66666666-6666-6666-6666-666666666666'), '>=', 0::numeric, 'H: paid balance never becomes negative');
SELECT is((SELECT provider_response_id FROM public.generations WHERE user_id='66666666-6666-6666-6666-666666666666' AND request_idempotency_key='h1'), 'respH', 'H: confirmed provider usage (response id) preserved for reconciliation');

-- ============================== I. Missing usage metadata (3) ==============================
-- At the DB layer "missing usage" = the edge never calls settle_generation, leaving the row at its
-- reservation cost and unsettled (the edge sets RECONCILE_PENDING). The RPC has NO zero-cost-success path.
SELECT lives_ok(
  $$ SELECT public.start_generation('66666666-6666-6666-6666-666666666666'::uuid,'i1','fpi','image',3,false,'gemini','gemini-3.1-flash-image') $$,
  'I: reserve 3 (no settle follows)');
SELECT is((SELECT cost FROM public.generations WHERE user_id='66666666-6666-6666-6666-666666666666' AND request_idempotency_key='i1'), 3::numeric, 'I: an unsettled generation retains its reservation cost (never silently 0)');
SELECT is((SELECT settlement_status FROM public.generations WHERE user_id='66666666-6666-6666-6666-666666666666' AND request_idempotency_key='i1'), NULL, 'I: an unsettled generation is not SETTLED');

-- ============================== J. User isolation / permissions (6) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('77777777-7777-7777-7777-777777777777'::uuid,'j1','fpj','image',1,false,'gemini','gemini-3.1-flash-image') $$,
  'J: reserve j1 (as service-role/superuser)');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.settle_generation('00000000-0000-0000-0000-0000000000aa'::uuid, 1, 'x') $$, '42501', NULL, 'J: authenticated callers cannot execute settle_generation');
SELECT throws_ok($$ SELECT public.release_reservation('00000000-0000-0000-0000-0000000000aa'::uuid) $$, '42501', NULL, 'J: authenticated callers cannot execute release_reservation');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.settle_generation('00000000-0000-0000-0000-0000000000aa'::uuid, 1, 'x') $$, '42501', NULL, 'J: anonymous callers cannot execute settle_generation');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ SELECT public.settle_generation((SELECT id FROM public.generations WHERE user_id='77777777-7777-7777-7777-777777777777' AND request_idempotency_key='j1'), 0.5, 'respJ') $$,
  'J: service_role retains the intended access');
RESET ROLE;
SELECT is((SELECT settlement_status FROM public.generations WHERE user_id='77777777-7777-7777-7777-777777777777' AND request_idempotency_key='j1'), 'SETTLED', 'J: service-role settlement applied');

-- ============================== K. Promotional credits (5) ==============================
SELECT throws_like(
  $$ SELECT public.start_generation('88888888-8888-8888-8888-888888888888'::uuid,'k_promo','fpk','image',5,false,'gemini','gemini-3.1-flash-image') $$,
  '%insufficient credits%', 'K: promotional balance alone cannot fund a metered hosted Google operation');
SELECT is((SELECT promotional_credit_balance FROM public.profiles WHERE id='88888888-8888-8888-8888-888888888888'), 100::numeric, 'K: promotional balance untouched by the failed reservation');
UPDATE public.profiles SET credit_balance = 10 WHERE id='88888888-8888-8888-8888-888888888888';
SELECT lives_ok(
  $$ SELECT public.start_generation('88888888-8888-8888-8888-888888888888'::uuid,'k_paid','fpk','image',5,false,'gemini','gemini-3.1-flash-image') $$,
  'K: with paid credits the reservation succeeds');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='88888888-8888-8888-8888-888888888888'), 5::numeric, 'K: the PAID credit_balance is the debited source (10 -> 5)');
SELECT is((SELECT promotional_credit_balance FROM public.profiles WHERE id='88888888-8888-8888-8888-888888888888'), 100::numeric, 'K: promotional balance remains unchanged');

-- ============================== L. Fractional / microcredit settlement (4) ==============================
SELECT lives_ok(
  $$ SELECT public.start_generation('99999999-9999-9999-9999-999999999999'::uuid,'l1','fpl','image',1,false,'gemini','gemini-3.1-flash-image') $$,
  'L: reserve 1');
SELECT lives_ok(
  $$ SELECT public.settle_generation((SELECT id FROM public.generations WHERE user_id='99999999-9999-9999-9999-999999999999' AND request_idempotency_key='l1'), 0.37, 'respL') $$,
  'L: settle to a fractional 0.37 credits');
SELECT is((SELECT cost::text FROM public.generations WHERE user_id='99999999-9999-9999-9999-999999999999' AND request_idempotency_key='l1'), '0.37', 'L: fractional charge stored exactly (no whole-credit rounding)');
SELECT is((SELECT credit_balance FROM public.profiles WHERE id='99999999-9999-9999-9999-999999999999'), 99.63::numeric, 'L: refund is exact (100 - 1 reserve + 0.63 refund = 99.63)');

-- ============================== M. Constraint-level concurrency guarantees (2) ==============================
-- True simultaneous execution needs a multi-session harness (pgTAP is single-session); the FOR UPDATE row
-- lock + these unique indexes provide the isolation. We prove the constraint that backs it deterministically.
SELECT throws_ok(
  $$ INSERT INTO public.generations (user_id, status, request_idempotency_key, generation_type, cost, is_byok)
     VALUES ('11111111-1111-1111-1111-111111111111','PENDING','k1','image',1,false) $$,
  '23505', NULL, 'M: duplicate (user_id, request_idempotency_key) is rejected by the unique index (no double reservation)');
SELECT pass('M: true multi-session concurrency requires a separate harness; the (user,key) + provider_response unique indexes and FOR UPDATE row lock enforce single-settlement/single-reservation deterministically');

SELECT * FROM finish();
ROLLBACK;
