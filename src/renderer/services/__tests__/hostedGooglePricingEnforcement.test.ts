import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HOSTED_GOOGLE_CALCULATORS_IMPLEMENTED,
  UnknownProviderPricingError,
  applyMarkupNanoUsd,
  assertCalculatorRegistered,
  computeImageGenerationCustomerPriceNanoUsd,
  computeImageGenerationListCostNanoUsd
} from '../hostedMeteredPricing';
import { estimateMaxReservation, summarizeSettledCharges } from '../hostedSpendEstimate';

const edge = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
const migration = () => readFileSync('supabase/migrations/20260619000000_metered_analysis_billing.sql', 'utf8');

const GA = 'gemini-3.1-flash-image';
const IMG = (resolution: '0.5k' | '1k' | '2k' | '4k', extra: { inputTokenCount?: number; textThinkingOutputTokenCount?: number } = {}) =>
  computeImageGenerationListCostNanoUsd({ model: GA, resolution, inputTokenCount: extra.inputTokenCount ?? 0, textThinkingOutputTokenCount: extra.textThinkingOutputTokenCount });

describe('GA image model migration', () => {
  it('no production hosted path uses the deprecated preview model; the GA model is used', () => {
    const constants = readFileSync('src/renderer/constants/generationModels.ts', 'utf8');
    expect(constants).toContain("NANO_BANANA_2_IMAGE_MODEL = 'gemini-3.1-flash-image' as const");
    for (const src of [edge(), readFileSync('src/renderer/services/GeminiService.ts', 'utf8')]) {
      // GA present
      expect(src).toContain('gemini-3.1-flash-image');
    }
    // the edge normalizes/prices ONLY the GA model (preview appears only in the legacy-normalize set / comments)
    expect(edge()).toContain("const NANO_BANANA_2_IMAGE_MODEL = 'gemini-3.1-flash-image'");
    expect(edge()).toContain("'gemini-3.1-flash-image': {"); // pricing registry keyed by GA
    expect(edge()).not.toContain("'gemini-3.1-flash-image-preview': {"); // no preview pricing entry
  });
});

describe('hosted image generation is metered at list cost × 2 (gemini-3.1-flash-image GA)', () => {
  it('image-output list cost per resolution matches the exact published amounts', () => {
    expect(IMG('0.5k')).toBe(44_820_000n);
    expect(IMG('1k')).toBe(67_200_000n);
    expect(IMG('2k')).toBe(100_800_000n);
    expect(IMG('4k')).toBe(151_200_000n);
  });

  it('customer image-output amount equals exactly 2× each list cost', () => {
    expect(applyMarkupNanoUsd(44_820_000n)).toBe(89_640_000n);
    expect(applyMarkupNanoUsd(67_200_000n)).toBe(134_400_000n);
    expect(applyMarkupNanoUsd(100_800_000n)).toBe(201_600_000n);
    expect(applyMarkupNanoUsd(151_200_000n)).toBe(302_400_000n);
  });

  it('includes input + text/thinking output, summed BEFORE the ×2 multiplier', () => {
    // 1K image 67_200_000 + 200 input @500 (100_000) + 50 thinking @3000 (150_000) = 67_450_000 list
    const list = IMG('1k', { inputTokenCount: 200, textThinkingOutputTokenCount: 50 });
    expect(list).toBe(67_450_000n);
    expect(computeImageGenerationCustomerPriceNanoUsd({ model: GA, resolution: '1k', inputTokenCount: 200, textThinkingOutputTokenCount: 50 })).toBe(134_900_000n);
  });

  it('fails closed for unknown resolution / tier / preview model', () => {
    expect(() => computeImageGenerationListCostNanoUsd({ model: GA, resolution: '8k' as never, inputTokenCount: 0 })).toThrow(UnknownProviderPricingError);
    expect(() => computeImageGenerationListCostNanoUsd({ model: GA, tier: 'batch' as never, resolution: '1k', inputTokenCount: 0 })).toThrow(UnknownProviderPricingError);
    expect(() => computeImageGenerationListCostNanoUsd({ model: 'gemini-3.1-flash-image-preview', resolution: '1k', inputTokenCount: 0 })).toThrow(UnknownProviderPricingError);
  });

  it('no flat $0.0387 / 38_700_000 image rate remains anywhere', () => {
    for (const src of [readFileSync('src/renderer/services/hostedMeteredPricing.ts', 'utf8'), edge(), readFileSync('supabase/workers/image-processor/index.ts', 'utf8')]) {
      expect(src).not.toContain('38700000');
      expect(src).not.toContain('38_700_000');
    }
  });

  it('registers the image_output calculator (token + image registered; video/grounding fail closed)', () => {
    expect(HOSTED_GOOGLE_CALCULATORS_IMPLEMENTED.image_output).toBe(true);
    expect(() => assertCalculatorRegistered('image_output')).not.toThrow();
    expect(() => assertCalculatorRegistered('video_seconds')).toThrow();
    expect(() => assertCalculatorRegistered('grounding_request')).toThrow();
  });

  it('edge + worker image pricing registries are identical (GA, exact token counts)', () => {
    const reg = "'gemini-3.1-flash-image': {\n    standard: { inputTokenNanoUsd: 500, textOutputTokenNanoUsd: 3000, imageOutputTokenNanoUsd: 60000, imageOutputTokensByResolution: { '1k': 1120, '2k': 1680, '4k': 2520 } }";
    expect(edge()).toContain("inputTokenNanoUsd: 500, textOutputTokenNanoUsd: 3000, imageOutputTokenNanoUsd: 60000, imageOutputTokensByResolution: { '1k': 1120, '2k': 1680, '4k': 2520 }");
    expect(readFileSync('supabase/workers/image-processor/index.ts', 'utf8')).toContain("inputTokenNanoUsd: 500, textOutputTokenNanoUsd: 3000, imageOutputTokenNanoUsd: 60000, imageOutputTokensByResolution: { '1k': 1120, '2k': 1680, '4k': 2520 }");
    expect(reg).toContain('1120'); // sanity
  });

  it('grounding is fail-closed for hosted image requests; metered charge is behind a feature flag', () => {
    const s = edge();
    expect(s).toContain('requestUsesGoogleGrounding');
    expect(s).toContain("'GROUNDING_NOT_PRICED'");
    expect(s).toContain('HOSTED_METERED_BILLING_ENABLED');
    expect(s).toContain("Deno.env.get('HOSTED_METERED_BILLING_ENABLED')");
  });

  it('the edge computes the image settlement with the GA pricing version', () => {
    const s = edge();
    expect(s).toContain('const buildImageMeteredSettlement = ');
    expect(s).toContain('const settlement = buildImageMeteredSettlement({');
    expect(s).toContain("billingUnit: 'image_output'");
    expect(s).toContain("'gemini-3.1-flash-image-standard-2026-06'");
  });
});

describe('server-authoritative spend controls', () => {
  it('exposes stable spend-limit error codes + per-request + daily caps, checked before provider call', () => {
    const s = edge();
    expect(s).toContain("'HOSTED_GOOGLE_DISABLED'");
    expect(s).toContain("'REQUEST_COST_LIMIT'");
    expect(s).toContain("'USER_DAILY_SPEND_LIMIT'");
    expect(s).toContain("'ANALYSIS_DAILY_SPEND_LIMIT'");
    expect(s).toContain("Deno.env.get('HOSTED_GOOGLE_KILL_SWITCH')");
    expect(s).toContain('sumHostedSpendSince');
    // checked before start_generation / provider invocation
    const capIdx = s.indexOf("'REQUEST_COST_LIMIT'");
    const startIdx = s.indexOf("supabaseService.rpc('start_generation'");
    expect(capIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeLessThan(startIdx);
  });
});

describe('paid-vs-promo accounting + reconciliation (migration)', () => {
  it('adds a separate promotional balance and tags funding source paid', () => {
    expect(migration()).toContain('ADD COLUMN IF NOT EXISTS promotional_credit_balance numeric');
    expect(edge()).toContain("fundingSource: 'paid'");
  });
  it('adds an administrative reconciliation report view (read-only)', () => {
    const m = migration();
    expect(m).toContain('CREATE OR REPLACE VIEW public.hosted_metered_reconciliation');
    expect(m).toContain('reconciliation_flag');
    expect(m).toContain("'reconcile_pending'");
    expect(m).toContain('provider_invoiced_cost_nano_usd');
  });
});

describe('customer-visible estimate + settled summary helpers', () => {
  const CREDIT_VALUE_NANO = 10_000_000n;
  it('estimates a max reservation covering generation + automatic analyses + retries', () => {
    const est = estimateMaxReservation({
      generationReservationCredits: 1,
      automaticAnalysisKinds: ['pose_quality_gate', 'style_quality_gate', 'wardrobe_continuity_gate'],
      maxRetries: 1,
      model: 'gemini-2.5-flash',
      maxInputTokensPerAnalysis: 2000,
      creditValueNanoUsd: CREDIT_VALUE_NANO
    });
    expect(est.generationCredits).toBe(1);
    expect(est.retryCredits).toBe(1);
    expect(est.automaticAnalysisCredits).toBeGreaterThan(0);
    expect(est.maxTotalReservationCredits).toBeCloseTo(2 + est.automaticAnalysisCredits, 9);
  });

  it('aggregates settled automatic checks under the parent and computes released amount', () => {
    const summary = summarizeSettledCharges({
      reservedCredits: 3,
      lineItems: [
        { label: 'Image Generation', providerModel: 'gemini-3.1-flash-image-preview', customerCredits: 1, kind: 'generation' },
        { label: 'Pose Quality Check', analysisKind: 'pose_quality_gate', providerModel: 'gemini-2.5-flash', customerCredits: 0.05, kind: 'analysis' },
        { label: 'Style Quality Check', analysisKind: 'style_quality_gate', providerModel: 'gemini-2.5-flash', customerCredits: 0.05, kind: 'analysis' }
      ]
    });
    expect(summary.generationCredits).toBe(1);
    expect(summary.aggregatedAnalysisCredits).toBeCloseTo(0.1, 9);
    expect(summary.totalSettledCredits).toBeCloseTo(1.1, 9);
    expect(summary.releasedCredits).toBeCloseTo(1.9, 9);
  });

  it('does not leak prompts/images in line items (only label/kind/model/credits)', () => {
    const summary = summarizeSettledCharges({ reservedCredits: 1, lineItems: [{ label: 'Reference DNA Analysis', analysisKind: 'reference_dna', providerModel: 'gemini-2.5-flash', customerCredits: 0.02, kind: 'analysis' }] });
    expect(JSON.stringify(summary)).not.toMatch(/base64|data:image|prompt|Bearer|apikey/i);
  });
});
