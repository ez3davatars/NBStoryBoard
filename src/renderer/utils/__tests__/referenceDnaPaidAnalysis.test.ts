import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHostedBillingMetadata, normalizeAnalyzeOptions } from '../../services/GeminiService';

const sceneSource = () => readFileSync('src/renderer/components/SceneCanvas.tsx', 'utf8');
const serviceSource = () => readFileSync('src/renderer/services/GeminiService.ts', 'utf8');
const edgeSource = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');

describe('normalizeAnalyzeOptions preserves the billing signal', () => {
  it('keeps an explicit paid billing intent and defaults to a text response', () => {
    const normalized = normalizeAnalyzeOptions({ hostedQualityGateBilling: 'paid' });
    expect(normalized.hostedQualityGateBilling).toBe('paid');
    expect(normalized.expectedResponseType).toBe('text');
  });

  it('keeps the included billing intent for automatic quality gates', () => {
    const normalized = normalizeAnalyzeOptions({ hostedQualityGateBilling: 'included', expectedResponseType: 'json' });
    expect(normalized.hostedQualityGateBilling).toBe('included');
    expect(normalized.expectedResponseType).toBe('json');
  });

  it('defaults to text analysis when nothing is specified', () => {
    const normalized = normalizeAnalyzeOptions({});
    expect(normalized.expectedResponseType).toBe('text');
    expect(normalized.hostedQualityGateBilling).toBeUndefined();
  });
});

describe('client billing metadata (buildHostedBillingMetadata)', () => {
  it('manual paid analysis costs 1 credit', () => {
    const meta = buildHostedBillingMetadata({}, { expectedResponseType: 'text', hostedQualityGateBilling: 'paid' });
    expect(meta.requiredCredits).toBe(1);
  });

  it('included post-generation quality-gate analysis costs 0 credits', () => {
    const meta = buildHostedBillingMetadata({}, { expectedResponseType: 'text', hostedQualityGateBilling: 'included' });
    expect(meta.requiredCredits).toBe(0);
  });

  it('normal image generation keeps its positive image-generation price', () => {
    expect(buildHostedBillingMetadata({}, { imageSize: '1K' }).requiredCredits).toBe(1);
    expect(buildHostedBillingMetadata({}, { imageSize: '2K' }).requiredCredits).toBe(2);
    expect(buildHostedBillingMetadata({}, { imageSize: '4K' }).requiredCredits).toBe(6);
  });
});

describe('Reference DNA AUTO-ANALYZE sends paid analysis', () => {
  it('handleManualAnalyze marks the analysis as paid text analysis', () => {
    const source = sceneSource();
    const handlerIndex = source.indexOf('const handleManualAnalyze');
    expect(handlerIndex).toBeGreaterThan(-1);
    const handlerBody = source.slice(handlerIndex, handlerIndex + 1400);
    expect(handlerBody).toContain('GeminiService.analyzeImage(refAnalysisPrompt');
    expect(handlerBody).toContain("expectedResponseType: 'text'");
    expect(handlerBody).toContain("hostedQualityGateBilling: 'paid'");
  });

  it('analyzeImage threads options through normalizeAnalyzeOptions', () => {
    const source = serviceSource();
    expect(source).toContain('export const normalizeAnalyzeOptions');
    expect(source).toContain('GeminiService._executeHostedRequest(useModel, requestBody, normalizeAnalyzeOptions(options))');
  });
});

describe('edge function billing for paid vs included analysis vs generation', () => {
  it('bills paid analysis as a positive amount and included analysis as zero', () => {
    const source = edgeSource();
    // paid => treatAsIncludedAnalysis is false => calculateBackendRequiredCredits (positive).
    expect(source).toContain("operation === 'analyze' && qualityGateBilling !== 'paid'");
    expect(source).toContain('const backendCalculatedRequiredCredits = treatAsIncludedAnalysis');
    expect(source).toContain('calculateBackendRequiredCredits(generationType, resolutionTier)');
    expect(source).toContain('? 0');
  });

  it('returns text (not an image) for a text analysis response type', () => {
    const source = edgeSource();
    expect(source).toContain("const shouldExecuteSynchronousText = expectedResponseType === 'text' || expectedResponseType === 'json'");
    expect(source).toContain('executeSynchronousTextAnalysis');
  });

  it('cannot relabel an image generation as free analysis (model whitelist + server-derived operation)', () => {
    const source = edgeSource();
    expect(source).toContain('const ANALYSIS_OPERATION_MODELS = new Set<string>(');
    expect(source).toContain("operation === 'analyze' && !ANALYSIS_OPERATION_MODELS.has(providerModel)");
    expect(source).toContain("'INVALID_ANALYSIS_MODEL'");
    expect(source).toContain("expectedResponseType === 'text' || expectedResponseType === 'json' ? 'analyze' : 'generate'");
  });

  it('still rejects mismatched client/server credit metadata', () => {
    const source = edgeSource();
    expect(source).toContain("'CREDIT_COST_MISMATCH'");
    expect(source).toContain('clientRequiredCredits !== null && clientRequiredCredits !== backendCalculatedRequiredCredits');
  });
});
