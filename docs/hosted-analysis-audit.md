# Hosted Analysis Contract Audit

Every first-party hosted analyzer/extractor now maps to exactly one `HostedAnalysisKind`, and a single
policy registry (`src/renderer/services/hostedAnalysisPolicy.ts`, mirrored in the Edge function) is the
source of truth for billing, credits, response type, and the usage-history label. The Edge function is
the billing authority and re-derives everything from the kind.

- **Paid manual analyzers** → `hostedQualityGateBilling: 'paid'`, **1 credit**, server-validated usage label.
- **Automatic gates / generation-support analyses** → `'included'`, **0 credits**, no usage label.
- **BYOK analysis** → never reserves hosted credits (direct provider call).

Wrappers (`GeminiService.runHostedImageAnalysis`, `GeminiService.runHostedMultiFrameAnalysis`) require a
typed `analysisKind`; a contract test forbids any production component/hook from calling
`analyzeImage`/`analyzeMultiFrame(Json)` directly.

## Inventory

| UI action | Source (file:fn) | Purpose | Manual/Auto | Hosted/BYOK | Response | Model | analysisKind | Credits | Usage label | Prior failure | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Reference DNA "Auto-Analyze" | SceneCanvas `handleManualAnalyze` (RefInspectorModal) | reference-slot DNA | Manual | both | text | gemini-2.5-flash | `reference_dna` | 1 | Reference DNA Analysis | — (already paid) | ✅ migrated to wrapper |
| Actor Intelligence "Auto Analyze" | ActorIntelligencePanel `onClick` | token pose/expression/lighting | Manual | both | text | gemini-2.5-flash | `actor_intelligence` | 1 | Actor Intelligence Analysis | CREDIT_COST_MISMATCH | ✅ |
| "Re-Extract Scene Only" | useAdvancedRender `analyzeBackgroundDNA` (button) | scene/background DNA | Manual | both | json | gemini-2.5-flash | `scene_reextract` | 1 | Scene Re-Extraction | CREDIT_COST_MISMATCH | ✅ |
| Auto background DNA | useAdvancedRender `analyzeBackgroundDNA` (useEffect / render pipeline) | scene/background DNA | Auto | both | json | gemini-2.5-flash | `scene_dna_gate` | 0 | — | CREDIT_COST_MISMATCH | ✅ included |
| "Analyze Missing" token profiles | useAdvancedRender `ensureTokenProfiles` (button) | per-token whitelist profile | Manual* | both | json | gemini-2.5-flash | `token_profile_gate` | 0 | — | CREDIT_COST_MISMATCH | ✅ included (multi-token generation support — kept free to avoid surprise per-token charges) |
| Auto token profiles | useAdvancedRender `ensureTokenProfiles` (render pipeline) | per-token whitelist profile | Auto | both | json | gemini-2.5-flash | `token_profile_gate` | 0 | — | CREDIT_COST_MISMATCH | ✅ included |
| Auto-Style character style | GeminiService `analyzeCharacterStyle` | character aesthetic/era | Auto | both | json | gemini-2.5-flash | `character_style_gate` | 0 | — | CREDIT_COST_MISMATCH | ✅ included |
| Auto-Style scene intent | GeminiService `analyzeSceneIntent` | scene-intent parse | Auto | both | json | gemini-2.5-flash | `scene_intent_gate` | 0 | — | CREDIT_COST_MISMATCH | ✅ included |
| Shot integrity gate | ShotsPanel `validateShotIntegrity` | source-vs-generated continuity | Auto | both | json | gemini-2.5-flash | `shot_integrity_gate` | 0 | — | CREDIT_COST_MISMATCH (silently degraded) | ✅ included |
| Production Actor "AUTO-ANALYZE IDENTITY" | CreateProductionActorWorkflow `handleAnalysis` | identity/style/wardrobe + rules | Manual | both | json | gemini-2.5-flash | `production_actor_identity` | 1 | Production Actor Identity | CREDIT_COST_MISMATCH | ✅ |
| Veo "Enhance with AI" | VeoPromptBuilderPanel `handleEnhance` → `generateVeoFivePartDraft` | concept → 5-part Veo draft | Manual | both | text (json parsed client-side) | gemini-2.5-flash | `veo_prompt_enhance` | 1 | Veo Prompt Enhance | CREDIT_COST_MISMATCH (Pick type excluded billing) | ✅ (widened `HostedTextGenerationOptions`) |
| Pose / Style / Wardrobe quality gates | GeminiService `_validate*AndRetry` | post-generation validators | Auto | hosted | text | gemini-2.5-flash | `pose_/style_/wardrobe_*_gate` | 0 | — | — (already included) | ✅ tagged with kind |
| "Smart Analyze" | useVeoSmartAnalyze `runSmartAnalyze` (VeoGenerator) | two-frame scene bibles | Manual | **BYOK only** | json | gemini-2.5-flash | — | n/a (no hosted credits) | — | n/a (never hosted) | Retained direct call (allowlisted) |

\* The manual "Analyze Missing" button pre-warms the same per-token analysis that runs (free) during
generation; it is kept **included** so a multi-token click can't produce surprise per-token charges.

## Edge authority & rejections (stable codes)

`readHostedCreditMetadata` derives `operation` from `expectedResponseType` and resolves the policy from
`analysisKind`. It rejects: unknown kind (`INVALID_ANALYSIS_KIND`), response-type mismatch
(`ANALYSIS_KIND_RESPONSE_MISMATCH`), an analysisKind on an image generation (`ANALYSIS_KIND_ON_GENERATE`),
a non-whitelisted analysis model (`INVALID_ANALYSIS_MODEL`), and client/server credit disagreement
(`CREDIT_COST_MISMATCH`). `usageCategory` is taken **only** from the validated policy — a client display
string is never trusted. A request with no `analysisKind` falls back to the legacy flag-based billing so
unmigrated/legacy calls keep working (analyze included unless explicitly paid).

## Retained direct `analyzeImage`/`analyzeMultiFrameJson` calls

- `GeminiService.ts` — the wrappers and the internal quality-gate validators (allowlisted).
- `useVeoSmartAnalyze.ts` — BYOK-only "Smart Analyze" (never hosted; allowlisted, documented).

## Duplicate prevention

`type="button"` added to the migrated analyzer buttons; each has a `disabled`-while-running guard; the
Reference DNA manual handler also uses a synchronous in-flight `useRef` guard; Actor Intelligence keeps
its `AbortController` + hard timeout.

## Deployment

- **Edge Function changed → redeploy required.** Logic-only (policy registry + analysisKind validation +
  policy-derived `usageCategory`).
- **No database migration.** `usageCategory` is a key inside the existing `billing_metadata` JSONB column.
