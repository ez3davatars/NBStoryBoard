# Identity-Drift Audit — Reference-Conditioned Image Generation

Branch: `fix/identity-drift-audit` (checkpoint `993fd24` captures the recent uncommitted work,
including the CORS / error-response / transport changes).

Symptom under investigation: *"a previously accurate scan now generates a random character."*

This report is evidence-based. Each finding lists severity, status, file/function, evidence,
failure mechanism, whether it can produce a random identity, the proposed minimal correction,
and the regression test that locks it.

---

## 0. Method & scope

Traced the full path: reference scan → preprocessing → request assembly → transport →
Supabase Edge Function → worker/provider → response parsing → DB/storage → UI display.

Inspected first-party domains via four parallel deep audits:
1. Edge Function + worker provider path (`supabase/functions/generate-image`, `supabase/workers/image-processor`).
2. Client preprocessing (`GeminiService._resolveImageData`, `imageWorker`, `sourceImageSizing`).
3. Client transport/envelope (`GeminiService._executeHostedRequest`) + installed `@supabase/functions-js`.
4. Scan capture + reference selection + concurrency/late-overwrite (`SceneCanvas`, `AppContext`, stores).

### Excluded paths (and why)
- `node_modules/**`, `out/**`, `dist`/`build` — generated/vendored. (`@supabase/functions-js` dist was
  read read-only to confirm `invoke()` return shape.)
- `Depth-Anything-V2/**`, `scripts/checkpoints/*.pth`, `public/mediapipe/**`, `public/audio/**`,
  `src/renderer/assets/**`, `build/**`, `resources/**` — large binary / model assets, not runtime logic.
- `supabase/.temp/**`, `tmp/**`, `*.diff` — scratch / CLI state, not runtime logic.
- Veo / video, wardrobe/prop overlay, depth/spatial subsystems — not on the still-image identity path
  for the reported symptom (noted but not load-bearing here).

---

## 1. CONFIRMED — Empty / corrupt / missing reference can reach the provider (invariant #3, #4)

- **Severity:** Critical · **Status:** Confirmed
- **Where:**
  - `src/renderer/services/GeminiService.ts` `_resolveImageData` (582-725) — swallows canvas errors
    (720-722) and has no non-empty guard on the returned `data`.
  - `GeminiService.generateImage` reference loop (1455-1528) — uploads / inlines whatever
    `_resolveImageData` returns without verifying the bytes are non-empty.
  - `src/renderer/components/SceneCanvas.tsx` loose path (2755-2763) — when no identity URL resolves,
    falls back to `member.previewUrl || member.url`, which may be `undefined`, then proceeds to generate.
- **Evidence:** `_resolveImageData` returns `{ mimeType, data }` with no floor on `data.length`;
  `inlineImageDataToBlob` (375-383) will `atob('')` into a **0-byte, valid-typed Blob**. The hosted
  upload comment (1467-1471) itself warns that an unoptimized/empty payload yields *"complete identity
  hallucinations."* The loose path only `console.warn`s on a missing face anchor (2742-2744).
- **Failure mechanism → random identity:** A reference that resolves to empty/blank bytes (or a staged
  actor whose cast image URL is missing) is sent with **no usable identity pixels**. The model then
  invents a face → "random character." This is the clearest deterministic mechanism that matches the
  symptom and is **not** gated by any hard check before billing/provider invocation.
- **Correction (applied):**
  - New pure module `src/renderer/utils/identityReferenceIntegrity.ts` with
    `isPlausibleReferenceImageData` / `assertReferenceImageData` / `EmptyReferenceImageError`.
  - `_resolveImageData` throws on empty resolved data.
  - `generateImage` asserts each resolved reference (hosted + BYOK) before upload/inline — fail closed
    with a clear, CORS/UI-visible error instead of hallucinating.
  - `SceneCanvas` loose path fails closed when an actor is staged (`token.castId`) but no identity
    reference is attached, mirroring the existing replace-mode guard (2651-2663).
- **Regression test:** `src/renderer/utils/__tests__/identityReferenceIntegrity.test.ts`.

## 2. PROBABLE — Reference-analysis sanitization strips "biometric scan" wording (recent change)

- **Severity:** Medium · **Status:** Probable (contributor, not deterministic)
- **Where:** `src/renderer/utils/stagingPromptProtection.ts` `sanitizeReferenceAnalysisForPrompt`
  (42-70), applied to all reference `analysis` / `biometricProfile` text via
  `createPromptSafeReferenceSlots` in `promptHelpers.ts` and `SceneCanvas`.
- **Evidence:** Patterns (43-48) delete the literal phrases *"biometric scan"*,
  *"high-resolution biometric scan"*, and medium words (`rendered`, `photographic`, `cinematic`, …)
  from the identity description that goes into the prompt. This is **new** in the checkpoint and is the
  change most thematically aligned with *"a previously accurate **scan** now…"*.
- **Failure mechanism → random identity:** Weakens the *textual* identity grounding. The identity
  **image is still attached**, so on its own this should not fully randomize a face — but combined with
  Finding 1 (no/blank image) or a weak anchor it reduces identity lock.
- **Correction:** **None applied.** It has legitimate purpose (prevents medium/style contamination),
  is covered by tests, and per the operating rules prompt wording is not changed without direct
  evidence it diverges harmfully from last-known-good. **Recommend a manual A/B** (same scan, with vs
  without the "biometric scan" descriptor) to quantify impact before any change.

## 3. PROBABLE (latent) — No request-id association guard on applied results (invariant #11, #12, #13)

- **Severity:** High · **Status:** Probable (latent; not the primary cause for serialized staging)
- **Where:** `SceneCanvas.applyStagingResult` (~3007-3041) and
  `src/renderer/stores/useRecentGenerationsStore.ts` `addRecentGeneration` (225-231).
- **Evidence:** Results are applied to `latestGeneratedOutputImage` / recent store with **no check that
  the completing request is still the active one**. Staging-vs-staging is serialized by the new
  `stagingGenerationInFlightRef`, but region-edit / refine / image-to-image / late hosted background-job
  promotions run under separate guards and can apply concurrently or late.
- **Failure mechanism → random identity (as perceived):** A slow/late response from an older or
  different request overwrites the current result → the user sees an image that does not belong to the
  current scan ("random character").
- **Correction:** **None applied** (touches many call sites; would be a broad change requiring runtime
  verification — out of scope for a minimal, safe fix). **Recommended follow-up:** thread a monotonic
  request token and skip applying superseded results.

## 4. POSSIBLE (pre-existing) — Heuristic anchor binning can demote a face scan

- **Severity:** Medium · **Status:** Possible
- **Where:** `AppContext.getActorIdentityReferenceSetsForScene` (~2724-2744).
- **Evidence:** `primaryFaceAnchor` is chosen by string-matching slot `name`/`analysis`/`target` for
  "wardrobe"/"angle"/"profile". A scan whose name/analysis contains those words is binned out of the
  primary face anchor, weakening identity.
- **Correction:** None (pre-existing, unchanged by checkpoint). Documented for follow-up.

---

## Ruled out (with evidence)

| Area | Verdict | Evidence |
|---|---|---|
| **EXIF / orientation** | RULED OUT | No webcam capture in the repo; references are uploaded files immediately re-encoded through `<canvas>.toDataURL` (`CastingForge.tsx:2680-2685`, `_resolveImageData:704-718`) → upright, no EXIF. The missing-orientation code is real but cannot affect these upright re-encodes. |
| **Transport / envelope (invariant #7)** | RULED OUT | `functions.invoke('generate-image', { body: edgeRequestBody })` passes an **object**, not stringified JSON. `@supabase/functions-js` 2.101.1 returns `{ data, error, response }`; non-2xx throws `FunctionsHttpError` (handled by `readHostedFunctionError`); success consumes the body once and the client only re-reads `status`. Round-trips correctly for 200/202/error. |
| **Edge field allowlist (invariant #6)** | RULED OUT | `validateGenerateImageRequestBody` returns `{ ...payload, model, requestBody }` — spreads the full payload; nested provider fields/parts are preserved. |
| **Edge reference resolution** | RULED OUT | `materializeHostedReferences` deep-clones and replaces every `hosted_reference_path` part **in place, in order**, same mimeType; a failed download **throws** (no silent drop, no text-only fallback). |
| **Model substitution (invariant #5)** | RULED OUT as *recent* cause | `normalizeImageGenerationModel` always returns `gemini-3.1-flash-image-preview`; `constants/generationModels.ts` unchanged by the checkpoint. Pinned for many commits; never falls back to a text model. |
| **Storage key collision (invariant #17)** | RULED OUT | Reference keys `${uid}/${crypto.randomUUID()}/ref_${i}`; result keys `generations/${jobId}` (UUID PK). Unique per call. |
| **Idempotency reuse (invariant #15)** | RULED OUT in practice | `idempotencyKey = "batch_" + Date.now() + "_" + random` is unique per call; not reused across scans. (Server-side: same key + different fingerprint can return the prior image — only reachable on deliberate key reuse.) |
| **OPTIONS triggers provider/billing (invariant #10)** | RULED OUT | Edge handles `OPTIONS` first with a 204 preflight before auth/JSON/validation/provider. |
| **Reference ordering / drop (invariant #2)** | LOW RISK | `finalizeStagingReferences` reorders to BG → anchor → identity → overlay-last and dedupes by URL with a 14 cap; identity URLs are **preserved**, not dropped. Strict-path identity prominence is materially unchanged; overlay-last is safer. Deliberate and test-locked; not reverted. |

---

## Preserved (correct, not modified)

CORS preflight (204) + `jsonResponse` helpers, request-body validation, `functions.invoke` transport,
the staging in-flight guard (`stagingGenerationInFlightRef`), and `type="button"` on the generate
button. These are correct and aligned with invariants #6, #7, #9, #10.

---

## 5. CONFIRMED — `INVALID_REQUIRED_CREDITS` on post-generation analysis calls

- **Severity:** High · **Status:** Confirmed & fixed
- **Symptom:** Primary generation succeeds and displays, then secondary calls
  (`analyzeImage`, `_validatePoseCoherenceAndRetry`, `_validateStyleCategoryAndRetry`,
  `_validateHeadshotWardrobeContinuityAndRetry`) return `HTTP 400
  { "code": "INVALID_REQUIRED_CREDITS", "error": "requiredCredits must be a positive integer." }`.
- **Exact invalid value:** `requiredCredits: 0`.
- **Cause:** Quality-gate validators call `analyzeImage` through `withQualityGateWaitWindow`, which sets
  `hostedQualityGateBilling: 'included'` + `expectedResponseType: 'text'`. Client
  `buildHostedBillingMetadata` then computes `requiredCredits: 0` (included gate) and
  `_executeHostedRequest` forwards `0`. The Edge Function only allowed `0` when it *also* recognized
  an included quality gate — a decision **coupled to the client-supplied `hostedQualityGateBilling`
  flag**. Any Edge build (or path) that didn't see/accept that flag fell into the `allowZero=false`
  branch and rejected `0` as "must be a positive integer." (The committed source added the
  `allowZero`/included path in `af95d0b`; a deployed Edge predating that rejects every analysis `0`.)
- **Fix (server-authoritative operation/billing contract):**
  `supabase/functions/generate-image/index.ts` now derives an explicit `operation`
  (`'generate' | 'analyze'`) from the **server-side** `expectedResponseType` (`deriveHostedOperation`),
  not from a client label. Analysis (`text`/`json`) is treated as **included → 0 credits** unless the
  caller explicitly opts into `hostedQualityGateBilling: 'paid'` — decoupled from the `'included'`
  flag, so a legitimate analysis call can never be rejected with `INVALID_REQUIRED_CREDITS`. Image
  generation still requires the **server-calculated positive** amount (client `0` is rejected).
- **Security (no free-analysis relabeling / no public zero-credit proxy):** analysis operations must
  use a whitelisted vision-text model (`ANALYSIS_OPERATION_MODELS` = `gemini-2.5-flash[-lite]`),
  enforced server-side (`INVALID_ANALYSIS_MODEL`); they remain authenticated and carry an
  `executionFingerprint`. Server-derived credits stay the billing source of truth; the client value is
  only cross-checked (`CREDIT_COST_MISMATCH`).
- **Client diagnostics (task #8):** `describeAnalysisFailure` (in `utils/hostedGenerationErrors.ts`)
  emits one concise `{ operation, model, code, status }` line with no raw images/base64/prompts/tokens;
  the four validators now log "validation unavailable … (not reported as passed)" and preserve the
  successful generated image rather than implying it passed validation.
- **Tests:** `src/renderer/utils/__tests__/hostedAnalysisOperationContract.test.ts`.
- **Edge Function changed → requires redeployment.** (Logic-only; no DB migration.)

> Known limitation / follow-up: analysis is bound to the authenticated user + execution fingerprint
> but not to a signed, server-issued generation ID. A relabeled call still cannot obtain a free image
> (whitelisted text model + text response path), but strict generation-ID binding for analysis is a
> recommended hardening if standalone authenticated vision usage must be eliminated.

---

## Cannot be verified without a provider call

Whether the model now renders a *wrong* face for a **present, non-empty** scan (provider-level identity
consistency) cannot be confirmed by type-checks/unit tests. Findings 2 and 4 require a manual A/B with a
real scan. The fixes here close the **deterministic pipeline-integrity** gaps (no/blank/empty reference
can no longer silently reach the provider); they do not, by themselves, prove visual identity quality.
