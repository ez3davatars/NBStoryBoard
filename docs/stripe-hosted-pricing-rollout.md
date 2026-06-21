# Stripe Hosted-Pricing Rollout Plan

Operational plan for moving hosted credit packs/subscriptions to the **launch** prices. **No live Stripe
products/prices are created, edited, archived, or activated by this work, and metered Google billing stays
disabled.** Net per-credit economics are in `docs/hosted-credit-economics-2026-06-v1.md`. The prelaunch
data audit is in `docs/prelaunch-launch-readiness-audit.md`. **Do not invent Stripe price IDs.**

## Launch policy: no existing paying customers

There are **no paying customers, no live subscriptions, and no legitimate customer-paid balances**. Existing
Stripe prices are prelaunch/test; existing balances are test/admin/promotional. Therefore: **no
grandfathering, no subscription migration, no purchase-lot accounting, and no legacy-safe pooled value
(65,976,666) at launch.** This must be **verified** with the prelaunch audit before the rollout is enabled;
if a real customer is found, the launch-readiness check fails (see that doc).

## What is now wired (this change)

| Concern | Location | Behavior |
|---|---|---|
| Server-owned launch registry | `supabase/functions/_shared/launchPricing.ts` | Typed registry: product key → V2 env var, purchase type, **paid-credit grant**, BYOK flag, availability, rollout version `hosted-launch-pricing-2026-06-v1`. Pure (env injected); unit-tested. |
| Rollout flag | `HOSTED_PRICING_ROLLOUT_ENABLED` (server env) | Default **false**; only the literal `"true"` enables it. Read server-side only — the frontend cannot set it. |
| Checkout | `create-checkout-session/index.ts` | Flag **off** → prelaunch behavior unchanged. Flag **on** → all four V2 ids required (fail closed), price **derived from the product key** (never a client-supplied price id → `CLIENT_PRICE_NOT_ALLOWED`), subscriptions supported. BYOK unchanged. |
| Webhook | `stripe-webhook/index.ts` | Both paths call the **deployed** RPC `apply_stripe_credit_topup(p_user_id, p_credits, p_stripe_event_id, p_event_type) RETURNS void` (idempotent on `p_stripe_event_id` via `stripe_processed_events(id)`). Packs derive 100/500 by **product_key** and dedupe on the **event id**; subscriptions (`invoice.paid`/`invoice.payment_succeeded`, `billing_reason` create/cycle) grant 600/1200 and dedupe on the **invoice id**. No unsafe direct balance update. Failed/refund/unrelated → 0. |
| Credit grants | launch registry only | Never inferred from Stripe amount, display text, browser metadata, nickname, or requiredCredits. |

## Launch products & server-owned grants

| Product key | Type | V2 env var | Paid credits | Promo | BYOK |
|---|---|---|---|---|---|
| `credit_pack_100` | one_time | `STRIPE_PRICE_CREDIT_PACK_100_V2` | 100 | 0 | no |
| `credit_pack_500` | one_time | `STRIPE_PRICE_CREDIT_PACK_500_V2` | 500 | 0 | no |
| `subscription_starter` | subscription | `STRIPE_PRICE_SUBSCRIPTION_STARTER_V2` | 600 / eligible cycle | 0 | no |
| `subscription_pro` | subscription | `STRIPE_PRICE_SUBSCRIPTION_PRO_V2` | 1,200 / eligible cycle | 0 | no |
| `indie_desktop_byok` | one_time | — (existing env) | **0** | 0 | **yes** |
| `agency_desktop_byok` | one_time | — (existing env) | **0** | 0 | **yes** |

Launch retail amounts: **$12.99 / $54.99 / $59.00 mo / $119.00 mo**. BYOK products
(`indie_desktop_byok`, `agency_commercial_byok`, `indie_updates_support_renewal`,
`agency_updates_priority_support_renewal`) — **price & behavior unchanged; grant no hosted credits.**

## Prelaunch / historical price IDs (retained, not offered)

Old `STRIPE_PRICE_CREDIT_PACK_100` / `_500` env vars and any client-`price_id` path stay readable **only**
for: recognizing historical test webhook events, inspecting old test transactions, local fixtures, and
staging rollback. When `HOSTED_PRICING_ROLLOUT_ENABLED=true` they are **not** selectable for new checkout
(client price ids are rejected; the resolver maps only to the `*_V2` env vars). **No Stripe object is
deleted by code.**

## New Stripe price IDs to be supplied MANUALLY (operator, in Stripe)

Create the `price_…` objects in Stripe (test mode first, then live), then set these function-secret envs.
**Values are supplied manually — none are invented or committed here.**

| Env var | For | Test value | Live value |
|---|---|---|---|
| `STRIPE_PRICE_CREDIT_PACK_100_V2` | 100 pack $12.99 | `price_…` (test) | `price_…` (live) |
| `STRIPE_PRICE_CREDIT_PACK_500_V2` | 500 pack $54.99 | `price_…` (test) | `price_…` (live) |
| `STRIPE_PRICE_SUBSCRIPTION_STARTER_V2` | Starter $59/mo | `price_…` (test) | `price_…` (live) |
| `STRIPE_PRICE_SUBSCRIPTION_PRO_V2` | Pro $119/mo | `price_…` (test) | `price_…` (live) |

Test-mode and live-mode ids live in **separate environments**; the code never hardcodes a price id and
keys credits off `product_key`, so the two modes cannot be confused in code.

## Credit-value configuration (after audit confirms no legacy exposure)

```
HOSTED_CREDIT_USD_VALUE_NANO_USD=79543333    # approved launch minimum (no legacy exposure)
HOSTED_GOOGLE_COST_MARKUP_BPS=10000          # customer price = provider list cost × 2 (unchanged)
HOSTED_METERED_BILLING_ENABLED=false         # stays OFF until settlement UI + staging tests pass
```

The runtime credit value is **fail-closed**: missing/malformed/zero/negative
`HOSTED_CREDIT_USD_VALUE_NANO_USD` disables metered charging (no silent default). **Do not set production
secrets in this task.** The overhead reserves are baked into `79,543,333` **once**; they are not re-applied
to each Google call.

## Staged rollout

### A. Stripe **test** mode

1. Create the four new **test-mode** prices.
2. Configure the four `STRIPE_PRICE_*_V2` **test** ids as function secrets.
3. Keep `HOSTED_PRICING_ROLLOUT_ENABLED=false`.
4. Run checkout + webhook tests directly against the V2 registry (product-key → V2 id; subscription invoice
   grants).
5. Enable `HOSTED_PRICING_ROLLOUT_ENABLED=true` **in staging only**.
6. Verify, for each product: displayed amount = Stripe Checkout amount = payment event = credit grant.

### B. Stripe **live** mode

1. Create the four **live** launch prices.
2. Configure the four `STRIPE_PRICE_*_V2` **live** ids.
3. Run the prelaunch audit (`docs/prelaunch-launch-readiness-audit.md`) — confirm **no** legitimate
   customers / active subscriptions.
4. Confirm **no** legitimate old paid balances.
5. Confirm new checkout sessions use **only** the launch prices (V2).
6. **Manually** archive/deactivate old prices for new purchases in the Stripe dashboard.
7. Preserve historical records (do not delete Stripe objects or DB rows).
8. Keep `HOSTED_METERED_BILLING_ENABLED=false` until the hosted settlement UI and staging settlement tests
   pass.

## Rollback

1. Set `HOSTED_PRICING_ROLLOUT_ENABLED=false` (checkout reverts to prelaunch behavior immediately).
2. **Do not delete** Stripe prices.
3. If old prelaunch pricing must not reopen, stop new checkout sessions rather than reverting to old prices.
4. Preserve completed transactions and granted credits (no DB rollback — no schema change in this task).
5. Investigate any webhook/mapping failure before re-enabling.

## Webhook verification (post-rollout)

1. `apply_stripe_credit_topup` (4-arg `void` RPC) grants 100/500 for the new pack price ids (mapping is by product_key; the deployed RPC takes no price/session/product argument).
2. Replay protection intact (`stripe_processed_events.id` primary key; the RPC inserts `ON CONFLICT DO NOTHING` and credits only on a fresh insert).
3. Subscription `invoice.paid`/`invoice.payment_succeeded` (create/cycle) grant 600/1200 once per invoice.
4. Failed/unpaid/refunded/unrelated events grant **0**.
5. A test-mode checkout for each price grants the expected credits and records the correct amount.

## Not in scope (no existing customers)

Purchase-lot accounting and customer grandfathering/subscription migration are **out of scope** — there are
no legacy customers to protect. If the prelaunch audit unexpectedly finds a real paid customer, halt and
escalate; those features come back into scope and require a separate, approved DB migration.
