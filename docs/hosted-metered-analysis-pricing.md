# Hosted Metered Analysis Pricing

Implements usage-metered billing for hosted Gemini analysis with a **100% markup over Google's published
provider list cost** ⇒ customer price = list cost × 2 (profit = list cost; resulting gross margin = 50%).

```
providerListCost  $0.002
profit            $0.002   (= provider list cost)
customerPrice     $0.004   (= provider list cost × 2)
```

`HOSTED_GOOGLE_COST_MARKUP_BPS = 10000`; the generic formula `ceilDiv(listCost × (10000 + 10000) / 10000)`
equals `listCost × 2` exactly. **"List" cost ≠ invoiced cost** — see §3 (published-rate vs invoice).

> Scope note. This change lands the **deterministic financial core** (server-owned pricing registry,
> BigInt cost/markup math, microcredit conversion, metered policy + per-kind bounds, edge-side cost
> computation from real `usageMetadata`, and the settlement SQL/RPC) with full unit tests. Parts that
> require a live Supabase database or new UI — executing the two-phase reserve/settle in the request
> flow, parent-generation aggregation UI, pre-flight estimates, expandable usage history, promo-credit
> lots, spend-cap enforcement, the kill switch, and reconciliation alerting — are specified here with
> their interfaces and marked **ROADMAP**. Nothing is deployed.

## 1. Audit of current credit economics

| Aspect | Finding (source) |
|---|---|
| Wallet balance type | `profiles.credit_balance` is **`numeric`** (`database_setup.sql`) — fractional balances are already supported; no balance-type migration needed. |
| Generation cost type | `generations.cost` is **`numeric`** (fractional-capable). |
| Credit packages | `credit_pack_100` (100 credits), `credit_pack_500` (500 credits); `credits integer CHECK (credits > 0)` (`stripe_processed_events`). |
| Package USD prices | **Not in the repo** — Stripe price IDs are env vars (`STRIPE_PRICE_CREDIT_PACK_100/500`). USD-per-credit must come from configured package economics, not code. |
| Promotional / free credits | No separate promo source/type exists today — all credits live in one `credit_balance`. A promo lot model is **ROADMAP** (§9). |
| Current generation pricing | `calculateRequiredGenerationCredits` → 1 / 2 / 6 credits for 1K/2K/4K (`billingProducts.ts`). Unchanged by this work. |
| Reservation / finalization | `start_generation` debits the full `p_cost` up front (reserve = full cost); `fail_generation` refunds if PENDING/PROCESSING & not BYOK; `complete_generation` only flips status. **No settle phase today.** |
| Refund / rollback | `fail_generation` full refund on failure. |
| Usage history | `App.tsx` reads `billing_metadata.{requiredCredits,generationType,resolutionTier,usageCategory}`; label via `getHostedUsageLabel`. |

### Conclusions
- **A single whole credit is far too coarse** for sub-cent analysis. Example: a small Flash-Lite text
  analysis (≈1k input + 200 output tokens) costs ≈ `1000×100 + 200×400 = 180,000 nano-USD = $0.00018`
  provider, `$0.00027` customer. Rounding that up to 1 whole credit would overcharge by orders of
  magnitude. **We therefore meter in microcredits** (`1,000,000 microcredits = 1 displayed credit`),
  charging `ceil` at the microcredit grain — never rounding each call up to a whole credit.
- Because `credit_balance` is already `numeric`, microcredits are represented as a `numeric` balance
  (credits with up to 6 decimal places) — **Option A (credit micro-units)** from the brief, migrated
  safely without changing the column type.
- **USD-per-credit is a server config** (`HOSTED_CREDIT_USD_VALUE_NANO_USD`), set to the *minimum
  realized paid USD value per credit* across packages (use the cheapest per-credit pack price). It is
  **never** hardcoded as a business fact and never client-supplied. The conversion math is tested with
  example values; the production value is configured from real package prices.

## 2. Server-owned provider pricing registry (implemented), keyed by model + service tier

`src/renderer/services/hostedMeteredPricing.ts` (client, for estimates + tests) and a **mirrored** copy
inside `supabase/functions/generate-image/index.ts` (server authority); an alignment test asserts they
match. Pricing version: **`gemini-standard-2026-06`**. Markup: **`HOSTED_GOOGLE_COST_MARKUP_BPS = 10000`**
(env-overridable, validated as a non-negative integer). Resulting gross margin: **5000 bps (50%)**.

Published rates (nano-USD per token), keyed `model → tier`. **Only `standard` tier is priced**; an
explicit non-Standard tier (Batch/Flex/Priority/preview/unknown) **fails closed** — Standard prices are
never silently applied. A synchronous `generateContent` call with no `serviceTier` is treated as Standard.

| Model | tier | uncached input | cached input | output / thinking |
|---|---|---|---|---|
| `gemini-2.5-flash` | standard | 300 | 30 | 2500 |
| `gemini-2.5-flash-lite` | standard | 100 | 10 | 400 |

Provider rates, markup, and tier are server-only; never client-controlled. Persisted per call:
`providerModel`, `providerModelVersion`, `providerServiceTier`, `pricingVersion`.

## 3. Cost formula (implemented, BigInt) — published list cost vs invoiced cost

```
uncachedInput            = max(0, promptTokenCount - cachedContentTokenCount)
providerListCostNanoUsd  = uncachedInput*uncachedRate                 // PUBLISHED list rate, not invoice
                         + cachedContentTokenCount*cachedRate
                         + (candidatesTokenCount + thoughtsTokenCount)*outputRate
customerPriceNanoUsd     = ceil(providerListCostNanoUsd * (10000 + 10000) / 10000)   // = listCost × 2
```

`providerListCostNanoUsd` is computed from Google's **published** model+tier rates and the usage Google
reported — it is **not** the invoiced amount (free quota, promo Google credits, negotiated/volume pricing,
grounding free allowance, and invoice adjustments are not reflected). The ledger therefore carries
`pricingSource: 'published_rate'`, `reconciliationStatus: 'pending'`, and `providerInvoicedCostNanoUsd:
null` until invoice reconciliation is implemented. **Customer pricing uses the published list rate.**

All arithmetic is `BigInt`. Unknown model/tier, invalid/missing usage **fail closed** (throw), never a
zero-cost or Standard-default fallback. Token counts, rates, tier, cost, markup, pricing version, and
price are server-derived only — client values are ignored.

## 4–10. Reserve/settle, metering, UX, idempotency, ledger, promos, safety

See the brief; status per area:

- **Metered policy + bounds (implemented):** `HostedAnalysisPolicy.billing` gains `'metered'`; every
  provider-backed analysisKind is metered, each with `maxOutputTokens`, `thinkingBudget` (0 = disabled),
  `maxImages`, `maxAttempts`, and `maxBillableMicroUsd`. Included/zero-credit provider calls no longer
  exist. (client + edge, aligned by test.)
- **Reservation bound (implemented, pure):** `computeReservationMicrocredits(policy, creditValue)` returns
  a conservative max ≥ any real settlement (bounded by `maxOutputTokens`+`maxImages`+`maxAttempts`).
- **Edge cost computation (implemented):** the edge captures `usageMetadata` + `responseId` +
  `modelVersion` from the provider response, validates, computes provider cost + customer price +
  microcredits, and persists ledger metadata into `billing_metadata`. Fails closed on missing usage /
  unknown model.
- **Settlement RPC (authored SQL, must be run before deploy):**
  `supabase/migrations/20260619000000_metered_analysis_billing.sql` adds `settle_generation` (set actual
  cost, refund unused reservation), `release_reservation` (full refund on no-billable failure), the
  `provider_response_id`/`settlement_status` columns, and the idempotency index. **Over-reservation
  safety:** if actual cost ever exceeds the reservation, `settle_generation` does **not** silently cap it
  — it flags `settlement_status = 'RECONCILE_PENDING'`, keeps the already-debited (bounded) reservation as
  the charge (wallet never goes negative; confirmed usage preserved), and `RAISE WARNING` for manual
  reconciliation. **Cannot run migration/RPC tests here (no local Supabase) — deployment blocker.**
- **Idempotency (implemented at the DB layer):** `settle_generation` is idempotent on
  `settlement_status='SETTLED'` + `provider_response_id`; a unique index on `provider_response_id`
  prevents two rows claiming the same response; OPTIONS never reserves; the unique
  `(user_id, request_idempotency_key)` index prevents duplicate jobs. Charge tuple:
  `userId + executionFingerprint + providerResponseId + analysisKind + attemptNumber`.
- **Kill switch (implemented):** `HOSTED_ANALYSIS_KILL_SWITCH=true` makes the edge refuse metered
  analysis (`503 HOSTED_ANALYSIS_DISABLED`).
- **Billing-unit calculators (token implemented; others fail closed):** `assertCalculatorRegistered`
  throws `UnregisteredCalculatorError` for `image_output` / `video_seconds` / `grounding_request` until
  each has a server-owned calculator. See `docs/hosted-google-pricing-audit.md`.
- **UX estimate + parent-generation aggregation + expandable history + multi-token confirmation:**
  NOT IMPLEMENTED (deployment blocker — automatic checks are now billable; the UI must not show
  unexplained deductions). Estimate primitives exist in `hostedMeteredPricing.ts`.

## §9 Credit value + promotional credits
- **`HOSTED_CREDIT_USD_VALUE_NANO_USD`** must be set to the **minimum realized paid USD value per credit**
  across purchasable packages: for each pack compute `packPriceUsd / creditsGranted`, take the lowest, and
  express it in nano-USD (`× 1e9`). Example *(illustrative — replace with the real Stripe pack prices,
  which live in env, not the repo)*: a 500-credit pack at $5.00 ⇒ $0.01/credit ⇒ `10000000` nano-USD; if a
  100-credit pack is $1.20 ⇒ $0.012/credit, the **min** is still $0.01. **Do not deploy with a guessed
  value.** Until set, the edge persists the ledger and leaves the row `RECONCILE_PENDING` rather than
  charging a guessed amount.
- **Promotional credits — strict default `restrict`** (`METERED_PROMO_CREDIT_POLICY`): paid-credit balance
  may fund metered Google operations; promotional/free balance may **not**. Enforcing this needs per-lot
  wallet accounting (separate promo balance), which does not exist yet — **deployment blocker**. We do not
  claim 100% markup while provider cost could be paid entirely with promotional (non-revenue) credits.

## Deployment readiness — NOT production-ready
Implemented + unit-tested: 2× markup, model+tier registry (fail-closed), published-vs-invoice ledger,
BigInt math, microcredits, metered policy + bounds, edge settlement computation + persistence, kill
switch, settlement/over-reservation SQL. **Outstanding blockers (must clear before deploy):**
1. Local/live Supabase migration + RPC tests (start→settle, release, insufficient balance, duplicate
   settlement) — not runnable here.
2. Real `HOSTED_CREDIT_USD_VALUE_NANO_USD` from actual package prices.
3. Per-lot promo-credit accounting to enforce the strict promo rule.
4. UI: pre-flight estimated maximum, settled charge, parent-generation aggregation of automatic checks,
   usage-history details.
5. Per-user spend cap + daily automatic-analysis cap enforcement (DB-backed).
6. Automatic reconciliation vs. the real Google invoice (`providerInvoicedCostNanoUsd`).
7. Image generation + any future image/video/grounding paths are not yet metered at 2× — see the audit.

## Unresolved financial / reconciliation risks
1. `providerListCostNanoUsd` is the published rate, not the invoiced cost; true margin depends on Google
   free quota / promo / negotiated / grounding-allowance / adjustments until reconciliation lands.
2. Promotional credits could currently fund metered calls (no lot separation) — strict rule not enforced.
3. Live two-phase reserve/settle + parent aggregation unverified against a real database.
