# Hosted Google Provider Cost Audit

Inventory of every first-party Google provider call, the billing unit, and whether it is covered by the
metered `customerPrice = providerListCost × 2` rule. **The 2× rule is implemented for hosted token-metered
analysis only. Hosted image generation is NOT yet metered (it uses legacy fixed credit pricing), and
image/video/grounding calculators are not implemented (they fail closed).** Do not claim all Google
charges use 2× pricing.

## Inventory

| # | Operation | Source (file:fn) | Model | Tier | Billing unit | Hosted/BYOK | Current customer charge | Provider cost calculator | Auto-settle? | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Gemini text/JSON analysis (all 13 analysisKinds) | `supabase/functions/generate-image/index.ts` → `executeSynchronousTextAnalysis` | gemini-2.5-flash[-lite] | standard | token | hosted | **metered: listCost × 2** | `computeProviderListCostNanoUsd` (token) ✓ | yes (`settle_generation`) | **Metered ✓** |
| 2 | Gemini image generation (sync) | `generate-image/index.ts` → `executeSynchronousImageGeneration` | **gemini-3.1-flash-image (GA)** | standard | token + **image output** | hosted | **metered cost computed (`buildImageMeteredSettlement` = listCost × 2) + persisted**; live metered charge gated by `HOSTED_METERED_BILLING_ENABLED` (default OFF → legacy reservation stands, `RECONCILE_PENDING`) | `computeImageGenerationListCostNanoUsd` (image_output) ✓ | flag-gated | **Calculator + ledger ✓; live metered charge behind feature flag pending local DB tests + credit value + UI** |
| 3 | Gemini image generation (worker fallback) | `supabase/workers/image-processor/index.ts` | **gemini-3.1-flash-image (GA)** via `job.provider_model` | standard | token + image output | hosted | **metered cost computed + persisted (`computeWorkerImageSettlement`, registry identical to edge — alignment-tested)**; legacy reservation stands until flag on | mirror of edge | flag-gated | **Parity with edge ✓** |
| 4 | Gemini analysis + image gen (BYOK) | `src/renderer/services/GeminiService.ts` (≈L1477,1861,1920,2091,2259,2550,2692,2895,3050) | various | n/a | token / image | **BYOK** | **$0 hosted** (user pays Google directly) | n/a | n/a | **Out of hosted wallet ✓** |
| 5 | Veo video generation | not a hosted edge path today (`veo_prompt_enhance` is hosted *text* analysis = #1) | veo-* | — | video seconds | n/a (no hosted Veo call found) | — | none (video_seconds calculator not implemented) | — | **Not present / fail closed if added** |
| 6 | Grounding / Google Search / URL context tool | enabled inside #2 request bodies (`googleSearch`/`urlContext`) | — | — | grounding request | hosted | **FAIL CLOSED** — a grounded hosted image request is rejected (`GROUNDING_NOT_PRICED`) | none (grounding_request calculator not implemented) | n/a | **Fail closed (chosen interim policy)** |

## Billing-unit calculators (§6)

`assertCalculatorRegistered(billingUnit)` (in `hostedMeteredPricing.ts`) gates each unit:

| Billing unit | Calculator | Status |
|---|---|---|
| `token` | `computeProviderListCostNanoUsd` (uncached/cached input + candidate+thinking output, by model+tier) | **Implemented** |
| `image_output` | `computeImageGenerationListCostNanoUsd` — gemini-3.1-flash-image GA: input 500 + text/thinking 3000 + image-output-by-resolution (1K 67.2M / 2K 100.8M / 4K 151.2M nano-USD) | **Implemented** (edge + worker, aligned; live charge behind `HOSTED_METERED_BILLING_ENABLED`) |
| `video_seconds` | — | **Fails closed** — needed if hosted Veo is added |
| `grounding_request` | — | **Fails closed** — needed for #6 |

`providerListCostNanoUsd = sum(all applicable Google-priced components)`, then
`customerPriceNanoUsd = providerListCostNanoUsd × 2`. Today only the token component is summed; image,
video, and grounding components are unpriced and therefore those operations either remain on legacy fixed
pricing (#2/#3) or fail closed (#5/#6).

## Grounding policy (chosen: fail closed for now)

Gemini 3.1 Flash Image can use Google Web/Image Search + URL-context grounding. Published Standard rate:
**5,000 prompts/month free (shared across Gemini 3), then $14 per 1,000 search queries**, and **one
request can issue multiple queries**. We do **not** assume free quota, one-query-per-request, or trust a
client query count. Until a grounding billing policy is implemented (Policy A: price each server-observed
billed query at $0.014 list × 2; or Policy B: hold as `RECONCILE_PENDING` and settle from invoice data),
**grounded hosted image requests fail closed** (`GROUNDING_NOT_PRICED`, `requestUsesGoogleGrounding`).
This is a behavior change for the rare grounded text-to-image hosted case (grounding is off when identity
references are attached). Chosen policy to document/implement next: **A (published-rate × 2)**.

## Honest coverage statement

- **Covered by 2× metering:** hosted Gemini text/JSON analysis (#1) — all 13 analysisKinds.
- **NOT covered (gaps to close before claiming universal 2×):** hosted image generation (#2/#3, still
  fixed-price), grounding/search fees (#6), and any future hosted Veo (#5). Each requires a server-owned
  calculator for its billing unit; until then they must keep their current explicit pricing or fail closed
  — never silently $0 and never token-priced.
- **BYOK (#4):** correctly outside the hosted wallet.
