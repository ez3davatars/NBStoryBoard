# Prelaunch Launch-Readiness Audit (read-only)

Run **before** enabling `HOSTED_PRICING_ROLLOUT_ENABLED` in any live environment. Every query below is
**read-only** (`SELECT` only). **Nothing here deletes, updates, or reclassifies data.** The launch policy
assumes **no paying customers** (all existing Stripe prices/balances are prelaunch/test). These queries
*verify* that assumption. If any of them reveal a legitimate paid customer, **stop and escalate** — do not
treat the data as test data.

> Schema notes: `profiles.promotional_credit_balance` exists only after the (currently undeployed) metered
> migration `20260619000000_metered_analysis_billing.sql`. Where a query references it, it is marked
> *(post-metered-migration only)* — skip it if the column is absent. Admin status lives on
> `auth.users.raw_app_meta_data->>'is_admin'`.

## 1. Active Stripe customer subscriptions

```sql
-- Any non-terminal subscription is a potential live customer obligation.
SELECT s.id, s.user_id, s.stripe_subscription_id, s.stripe_customer_id, s.status,
       s.current_period_start, s.current_period_end, s.cancel_at_period_end
FROM public.subscriptions s
WHERE s.status IN ('active', 'trialing', 'past_due', 'unpaid')
ORDER BY s.created_at;
-- Expected at launch: 0 rows.
```

## 2. Profiles with a positive PAID credit balance

```sql
SELECT p.id, p.credit_balance, p.account_status, p.created_at
FROM public.profiles p
WHERE p.credit_balance > 0
ORDER BY p.credit_balance DESC;
-- Each row must be explainable as test/admin/promotional issuance (see §6), not a real purchase.
```

## 3. Profiles with a positive PROMOTIONAL balance  *(post-metered-migration only)*

```sql
SELECT p.id, p.promotional_credit_balance, p.created_at
FROM public.profiles p
WHERE p.promotional_credit_balance > 0
ORDER BY p.promotional_credit_balance DESC;
-- Promotional credits are non-revenue and must never fund metered hosted Google calls (enforced in SQL).
```

## 4. Purchases / grants linked to Stripe price IDs (old or new)

```sql
-- Every Stripe event the webhook has processed (the deployed table is (id, event_type, created_at) — it
-- records the idempotency key, not product_key/credits; the credit amount lives in credit_transactions §5).
SELECT spe.event_type, COUNT(*) AS events, MIN(spe.created_at) AS first_seen, MAX(spe.created_at) AS last_seen
FROM public.stripe_processed_events spe
GROUP BY spe.event_type
ORDER BY events DESC;
-- Expected at launch: only test events. Correlate event ids with Stripe (test vs live) before trusting.
```

## 5. Successful payment / credit-issuance records

```sql
-- The ledger of credit movements. 'topup'/purchase kinds that are NOT test issuance imply a real payment.
SELECT ct.user_id, ct.kind, COUNT(*) AS txns, SUM(ct.amount) AS net_amount,
       MIN(ct.created_at) AS first_txn, MAX(ct.created_at) AS last_txn
FROM public.credit_transactions ct
GROUP BY ct.user_id, ct.kind
ORDER BY net_amount DESC;
```

## 6. Internal / admin / test accounts

```sql
-- Admin accounts (app_metadata.is_admin = true). Credits held here are administrative, not revenue.
SELECT u.id, u.email, (u.raw_app_meta_data ->> 'is_admin') AS is_admin, p.credit_balance
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE (u.raw_app_meta_data ->> 'is_admin') = 'true'
   OR u.email ILIKE '%@'||COALESCE(current_setting('app.internal_email_domain', true), 'example.com')
ORDER BY p.credit_balance DESC;
-- Adjust the internal-domain filter to your real team domain(s) before relying on it.
```

## 7. Stored Stripe customer identifiers (test vs live cannot be told apart by prefix)

```sql
SELECT DISTINCT s.stripe_customer_id, s.status
FROM public.subscriptions s
WHERE s.stripe_customer_id IS NOT NULL;
-- NOTE: `cus_…` ids look identical in test and live mode. You CANNOT classify mode from the id alone —
-- correlate against the Stripe dashboard (test vs live) before treating any id as live.
```

## Manual prelaunch decision process (record the outcome)

1. **Confirm no legitimate customer subscription exists** — §1 returns 0 rows (or every row is a known
   test subscription confirmed in the Stripe **test** dashboard).
2. **Confirm no legitimate customer-paid balance exists** — every §2 row is explained by §4/§5/§6 as test,
   admin, or promotional issuance, not a real charge.
3. **Classify internal/admin/test credits** — tag §6 balances as test/admin/promotional. They are **not**
   revenue-backed paid credits.
4. **Ensure test/promotional credits cannot fund metered hosted Google calls** — metered settlement debits
   `credit_balance` only after `HOSTED_METERED_BILLING_ENABLED=true`; promotional balance is a separate
   column and is never debited. Metered billing stays **disabled** at launch, so no hosted Google spend is
   funded by anything yet.
5. **Record approval** — capture who verified §1–§4 and when, *before* setting any `STRIPE_PRICE_*_V2`
   value or enabling `HOSTED_PRICING_ROLLOUT_ENABLED`.

## Fail-the-check rule

If §1–§5 reveal a **legitimate paid customer** (a real charge, an active paid subscription, or a balance
that maps to a real payment), **the launch-readiness check FAILS.** Do not enable the rollout and do not
reclassify the data as test. Escalate to the product owner: a real customer means grandfathering /
purchase-lot accounting is back in scope (out of scope for the no-legacy launch task).
