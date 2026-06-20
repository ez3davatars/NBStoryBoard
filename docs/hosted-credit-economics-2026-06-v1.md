# Hosted Credit Economics — `hosted-credit-economics-2026-06-v1`

Net USD value of one **paid** customer credit after payment fees and operating reserves. This drives
`HOSTED_CREDIT_USD_VALUE_NANO_USD`, which converts the metered Google customer price (provider list cost
× 2) into wallet microcredits. **Source of truth:** `src/renderer/services/hostedCreditEconomics.ts`
(pure, BigInt nano-USD, no floating point). **This is not tax or accounting advice.**

## Assumptions (basis points; edit in one place)

| Reserve | bps | Note |
|---|---|---|
| Stripe card processing | 290 | 2.9% |
| Stripe Billing (subscriptions only) | 70 | 0.7% |
| Stripe Tax Basic **service fee** reserve | 50 | 0.5% — service fee only, NOT collected sales tax |
| Refund reserve | 200 | 2.0% internal planning |
| Dispute/fraud reserve | 50 | 0.5% internal planning |
| Storage/infrastructure reserve | 200 | 2.0% internal planning |
| Support/monitoring/admin/ops reserve | 1000 | 10.0% internal planning |
| International card reserve | 0 | default; see §International |
| Currency-conversion reserve | 0 | default |
| Alternative-payment-method reserve | 0 | default |

- **One-time total reserve = 1790 bps**; **subscription total reserve = 1860 bps** (adds Stripe Billing).
- **Fixed transaction cost = 300,000,000 nano-USD** ($0.30 per successful transaction).
- The refund/dispute/infrastructure/support percentages are **launch assumptions**, not provider rates.

## Formula

```
netPackageRevenueNanoUsd = floor(grossPriceNanoUsd × (10000 − reserveBps) / 10000) − fixedTransactionCost
netCreditValueNanoUsd    = floor(netPackageRevenueNanoUsd / paidCredits)        // promo credits excluded
```

## Proposed-price net value per credit

| Product | Gross | Reserve | Net revenue | Paid credits | **Net / credit (nano-USD)** |
|---|---|---|---|---|---|
| 100 Credit Pack | $12.99 | 17.9% + $0.30 | $10.36479 | 100 | **103,647,900** |
| 500 Credit Pack | $54.99 | 17.9% + $0.30 | $44.84679 | 500 | **89,693,580** |
| Starter (mo) | $59.00 | 18.6% + $0.30 | $47.726 | 600 | **79,543,333** (floor) |
| Pro (mo) | $119.00 | 18.6% + $0.30 | $96.566 | 1,200 | **80,471,666** (floor) |

**Proposed minimum `TARGET_NEW_PRICING_CREDIT_VALUE_NANO_USD = 79,543,333`.**

## Current/legacy-price net value per credit (same reserves)

| Product | Gross | Net / credit (nano-USD) |
|---|---|---|
| 100 Pack | $10.00 | 79,100,000 |
| 500 Pack | $45.00 | 73,290,000 |
| Starter | $49.00 | 65,976,666 (floor) |
| Pro | $99.00 | 66,905,000 |

**Legacy minimum `SAFE_LEGACY_POOLED_CREDIT_VALUE_NANO_USD = 65,976,666`.**

## Selected safe runtime value (pooled wallet)

The wallet currently uses a **pooled paid balance** with no purchase-lot accounting, so credits bought at
old prices are indistinguishable from new ones. **Do not** set `HOSTED_CREDIT_USD_VALUE_NANO_USD =
79543333` until at least one of: (1) no legacy-priced credits remain outstanding; (2) all legacy
subscriptions migrated to new prices; (3) purchase-lot accounting tracks each lot's net value; (4) a
deliberate business decision accepts reduced margin on legacy credits.

**Until then the safe pooled value is `65,976,666` (or keep metered billing disabled).**
`selectSafePooledCreditValue({ legacyExposureRemains })` enforces this — it returns the legacy-safe value
while legacy exposure remains and never silently selects the higher value.

## Google markup contract (unchanged — overhead applied ONCE)

`HOSTED_GOOGLE_COST_MARKUP_BPS = 10000` ⇒ `customerPrice = providerListCost × 2`. The overhead reserves
are represented **only** in the per-credit USD value above; they are **not** re-applied to each Google
request (that would double-count). Wallet charge =
`ceilDiv(customerPriceNanoUsd × 1,000,000 / netCreditValueNanoUsd)` (ceiling → never below the net 2×).

| Google cost | Customer (×2) | @ proposed 79,543,333 | @ legacy 65,976,666 |
|---|---|---|---|
| $0.002 | $0.004 | 50,288 µcr (0.050288) | 60,628 µcr (0.060628) |
| $0.10 | $0.20 | 2,514,353 µcr (2.514353) | 3,031,375 µcr (3.031375) |

## Sales/income tax treatment

Sales tax/VAT/GST are **pass-through**: charged on top at checkout where legally required, **not** counted
as revenue, and **not** counted as an operating expense here. Only the Stripe Tax **service-fee** reserve
(50 bps) is in the package economics. For tax-inclusive jurisdictions, derive economics from the **ex-tax**
amount. Corporate/personal income tax is **excluded** from the per-credit runtime calc and **requires
jurisdiction-specific advice from an accountant**.

## International / currency-conversion (deployment consideration)

The baseline is **domestic USD card processing**. International cards, non-USD settlement, Stripe currency
conversion, and alternative payment methods carry different fees and are **not** guaranteed by the current
reserve. Configurable fields `INTERNATIONAL_CARD_RESERVE_BPS`, `CURRENCY_CONVERSION_RESERVE_BPS`,
`ALTERNATIVE_PAYMENT_METHOD_RESERVE_BPS` default to **0** and must only be raised from product-owner data
(they are additive to the totals). Do not silently add a guessed international fee.

## Quarterly recalibration (no auto-changes)

Recompute from trailing actuals, then require explicit review + a versioned pricing change (do not react to
one unusual month):

```
refundReserveBps         = refundedGrossRevenue / grossRevenue
disputeReserveBps        = disputeLossesAndFees / grossRevenue
infrastructureReserveBps = attributableInfrastructureSpend / grossRevenue
supportOperationsReserveBps = attributableSupportAndOperationsSpend / grossRevenue
```

Bump the version (`hosted-credit-economics-2026-06-v1` → `-v2`) on any change.

## Feature flags / production safety

`HOSTED_METERED_BILLING_ENABLED=false` and `HOSTED_GOOGLE_COST_MARKUP_BPS=10000` remain. The runtime credit
value is **fail-closed**: missing/malformed/zero/negative `HOSTED_CREDIT_USD_VALUE_NANO_USD` disables
metered charging (no silent default). No DB migration is required to document or calculate these economics.
