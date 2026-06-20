// Single source of truth for every first-party hosted analysis/extraction purpose.
//
// Each analyzer in the app maps to exactly one HostedAnalysisKind, and the policy registry below
// determines its billing (paid vs included), credit cost, response type (text vs json), and — for
// paid manual analyzers — the persisted usage category and Hosted Usage display label.
//
// This module is PURE (no imports) so it can be mirrored verbatim in the Supabase Edge function;
// a contract test asserts the two registries stay aligned. The Edge function re-derives billing
// from the kind and is the billing authority — the client values here are a preflight/cross-check.

export type HostedAnalysisKind =
  // Paid, user-triggered standalone analyzers (currently 1 credit each):
  | 'reference_dna'
  | 'actor_intelligence'
  | 'scene_reextract'
  | 'production_actor_identity'
  | 'veo_prompt_enhance'
  // Included, automatic generation-support analyses + internal quality gates (0 credits):
  | 'scene_dna_gate'
  | 'token_profile_gate'
  | 'character_style_gate'
  | 'scene_intent_gate'
  | 'shot_integrity_gate'
  | 'pose_quality_gate'
  | 'style_quality_gate'
  | 'wardrobe_continuity_gate';

export type HostedAnalysisResponseType = 'text' | 'json';
// 'metered' = billed by actual Google usage × 1.5 markup (see hostedMeteredPricing.ts).
// 'paid'/'included' are retained for the legacy fixed-price fallback contract only.
export type HostedAnalysisBilling = 'paid' | 'included' | 'metered';

/** Bounds that make a metered call's worst-case cost finite (and the reservation safe). */
export type HostedAnalysisBounds = {
  maxOutputTokens: number;
  /** Thinking-token budget; 0 disables thinking for analysis. */
  thinkingBudget: number;
  maxImages: number;
  maxAttempts: number;
  /** Hard reservation/charge cap for one logical call, in microcredits (1e6 = 1 credit). */
  maxBillableMicrocredits: number;
};

export type HostedAnalysisPolicy = {
  billing: HostedAnalysisBilling;
  credits: number;
  responseType: HostedAnalysisResponseType;
  /** Persisted in billing_metadata and mapped to a label for paid/metered manual analyzers. */
  usageCategory?: string;
  usageLabel?: string;
  /** Manual analyzers are billed individually; automatic gates aggregate under the parent generation. */
  aggregateUnderParent?: boolean;
  bounds?: HostedAnalysisBounds;
};

// Default bounds for a small text analysis and a structured json analysis. Conservative caps.
const TEXT_BOUNDS: HostedAnalysisBounds = { maxOutputTokens: 256, thinkingBudget: 0, maxImages: 1, maxAttempts: 1, maxBillableMicrocredits: 200_000 };
const JSON_BOUNDS: HostedAnalysisBounds = { maxOutputTokens: 768, thinkingBudget: 0, maxImages: 2, maxAttempts: 1, maxBillableMicrocredits: 500_000 };

// Every hosted provider-backed analyzer is metered (billed by actual Google usage × 1.5). Manual
// analyzers are billed individually with a usage label; automatic gates aggregate under the parent
// generation. `credits` is unused for metered billing (kept 0) — the charge is computed from usage.
export const HOSTED_ANALYSIS_POLICIES: Record<HostedAnalysisKind, HostedAnalysisPolicy> = {
  reference_dna: {
    billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: false, bounds: TEXT_BOUNDS,
    usageCategory: 'reference_dna_analysis', usageLabel: 'Reference DNA Analysis'
  },
  actor_intelligence: {
    billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: false, bounds: TEXT_BOUNDS,
    usageCategory: 'actor_intelligence_analysis', usageLabel: 'Actor Intelligence Analysis'
  },
  scene_reextract: {
    billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: false, bounds: JSON_BOUNDS,
    usageCategory: 'scene_reextract_analysis', usageLabel: 'Scene Re-Extraction'
  },
  production_actor_identity: {
    billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: false, bounds: JSON_BOUNDS,
    usageCategory: 'production_actor_identity_analysis', usageLabel: 'Production Actor Identity'
  },
  veo_prompt_enhance: {
    // Concept -> 5-part Veo draft. JSON is parsed client-side from a text response, so the hosted
    // call (and the server operation) is text.
    billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: false, bounds: JSON_BOUNDS,
    usageCategory: 'veo_prompt_enhance_analysis', usageLabel: 'Veo Prompt Enhance'
  },
  // Automatic generation-support / quality-gate analyses — metered but aggregated under the parent
  // generation transaction so they never appear as surprise standalone charges.
  scene_dna_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  token_profile_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  character_style_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  scene_intent_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  shot_integrity_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: { ...JSON_BOUNDS, maxImages: 2 } },
  pose_quality_gate: { billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: true, bounds: TEXT_BOUNDS },
  style_quality_gate: { billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: true, bounds: TEXT_BOUNDS },
  wardrobe_continuity_gate: { billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: true, bounds: TEXT_BOUNDS }
};

// Whitelisted vision-text models for hosted analysis. Kept in sync with the Edge function.
export const APPROVED_ANALYSIS_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const;

export const isHostedAnalysisKind = (value: unknown): value is HostedAnalysisKind =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(HOSTED_ANALYSIS_POLICIES, value);

export const getHostedAnalysisPolicy = (kind: HostedAnalysisKind): HostedAnalysisPolicy =>
  HOSTED_ANALYSIS_POLICIES[kind];

// Usage-history labels for paid manual analyzers, derived from the policy registry.
export const HOSTED_USAGE_CATEGORY_LABELS: Record<string, string> = Object.values(HOSTED_ANALYSIS_POLICIES)
  .reduce<Record<string, string>>((acc, policy) => {
    if (policy.usageCategory && policy.usageLabel) acc[policy.usageCategory] = policy.usageLabel;
    return acc;
  }, {});
