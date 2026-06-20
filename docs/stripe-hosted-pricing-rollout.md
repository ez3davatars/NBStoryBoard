# Stripe Hosted-Pricing Rollout Plan

Operational plan for moving hosted credit packs/subscriptions to the proposed prices. **No live Stripe
products/prices are created, edited, archived, or activated by this work.** Net per-credit economics are
in `docs/hosted-credit-economics-2026-06-v1.md`. **Do not invent Stripe price IDs.**

## Where Stripe prices/IDs/grants live (audit)

| Concern | Location | Notes |
|---|---|---|
| Checkout price IDs | `supabase/functions/create-checkout-session/index.ts` → `PRICE_MAP` | **All env-driven** (`getEnv("STRIPE_PRICE_CREDIT_PACK_100")`, `STRIPE_PRICE_CREDIT_PACK_500`, `STRIPE_PRICE_INDIE_DESKTOP_BYOK`, `STRIPE_PRICE_AGENCY_DESKTOP_BYOK`). **No price IDs are committed.** |
| Credit grants per pack | same file (`credits: 100`, `credits: 500`) + webhook | Pack→credit mapping. **Must stay 100 / 500.** |
| Webhook credit top-up | `supabase/functions/stripe-webhook` → `apply_stripe_credit_topup` RPC (`credit_pack_100`/`credit_pack_500`, integer credits) | Idempotent on Stripe event id. **Grants unchanged.** |
| Product keys | `src/renderer/utils/billingProducts.ts` | `credit_pack_100/500`, `indie_desktop_byok`, `agency_desktop_byok`. |
| Subscriptions (Starter/Pro) | **Not in `PRICE_MAP`** | Starter/Pro are not wired into checkout in this repo today — they must be added with their own env price IDs before any subscription rollout. |
| Frontend displayed prices | **None hardcoded** (grep found no `$12.99/$54.99/$59/$119/...` literals) | Prices come from Stripe Checkout; no static frontend price to drift. |
| Admin pricing display | none found referencing these amounts | — |

## Proposed replacement amounts

| Product | Current → Proposed | Paid credits (unchanged) | Promo |
|---|---|---|---|
| 100 Credit Pack | $10.00 → **$12.99** | 100 | 0 |
| 500 Credit Pack | $45.00 → **$54.99** | 500 | 0 |
| Starter (mo) | $49.00 → **$59.00** | 600 | 0 |
| Pro (mo) | $99.00 → **$119.00** | 1,200 | 0 |

BYOK products (`indie_desktop_byok`, `agency_commercial_byok`, `indie_updates_support_renewal`,
`agency_updates_priority_support_renewal`) — **price & behavior unchanged; excluded from credit value.**

## New Stripe price IDs to be supplied MANUALLY (by an operator, in Stripe)

Create new `price_…` objects in Stripe for the proposed amounts, then set these env values (names are
proposals — keep the existing env-var names if you prefer, but point them at the NEW price IDs only after
deciding grandfathering):

| New env var | For | Supply value |
|---|---|---|
| `STRIPE_PRICE_CREDIT_PACK_100_V2` | 100 pack $12.99 | `price_…` (manual) |
| `STRIPE_PRICE_CREDIT_PACK_500_V2` | 500 pack $54.99 | `price_…` (manual) |
| `STRIPE_PRICE_SUBSCRIPTION_STARTER_V2` | Starter $59 | `price_…` (manual) |
| `STRIPE_PRICE_SUBSCRIPTION_PRO_V2` | Pro $119 | `price_…` (manual) |

## Files/config requiring the new IDs

- `supabase/functions/create-checkout-session/index.ts` `PRICE_MAP` — add the new env lookups (and add
  Starter/Pro entries with their credit grants) **only when the new price IDs exist**.
- Function secrets (Supabase) — set the new `STRIPE_PRICE_*_V2` env vars. **Not done here.**
- No frontend change needed for amounts (no static prices). If an admin/marketing display is later added,
  it must read the active Stripe price, never a hardcoded literal.

## Do-not-mismatch rule

`HOSTED_PRICING_ROLLOUT_ENABLED = false` (in `hostedCreditEconomics.ts`) — the proposed amounts are
**planning values only**. Do not show a proposed price to a user while checkout still opens an old Stripe
price. Keep code/displays on the current price until matching new price IDs exist, or gate the new pricing
behind this disabled flag.

## Grandfathering decision (product-owner choice — see §9 of the brief)

- **A. Grandfather indefinitely** — old subscribers keep old price+credits; runtime stays on the legacy-safe
  credit value (65,976,666).
- **B. Migrate on renewal** — notice + price change on a renewal date; legacy-safe value until old balances
  consumed.
- **C. Preserve price, reduce future grants** — separate approval required; not implemented.
- **D. Purchase-lot accounting** — track each lot's source/net value, debit lots transactionally; larger
  migration, reported separately (see below).

## Webhook verification steps (post-rollout)

1. Confirm `apply_stripe_credit_topup` still grants 100/500 for the new pack price IDs (mapping is by
   product_key, not price).
2. Replay-protection intact (`stripe_processed_events` unique on event id).
3. New subscription price IDs grant the correct monthly credits via the subscription webhook path.
4. Verify a test-mode checkout for each new price grants the expected credits and records the correct
   amount.

## Rollback procedure

1. Point the `STRIPE_PRICE_*` env vars back at the previous price IDs (or remove the `_V2` lookups from
   `PRICE_MAP`).
2. Leave `HOSTED_PRICING_ROLLOUT_ENABLED = false` / keep metered billing disabled.
3. No DB rollback needed (no schema change). Already-granted credits are unaffected.
4. If new prices were briefly live, archive the new Stripe prices in the dashboard (manual).

## Future migration (report only — do NOT implement without approval)

**Purchase-lot accounting** (policy D) would add a credit-lots table tracking each grant's source price and
net per-credit value, and change the debit RPCs to consume lots transactionally. This enables exact
package-level economics and lets the runtime safely use 79,543,333. It is a **separate, larger DB
migration** requiring explicit product approval; it is not part of this task.
