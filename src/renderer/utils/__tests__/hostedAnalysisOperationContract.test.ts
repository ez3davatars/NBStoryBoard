import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeAnalysisFailure } from '../hostedGenerationErrors';

const edgeSource = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
const serviceSource = () => readFileSync('src/renderer/services/GeminiService.ts', 'utf8');

describe('hosted operation + billing contract (edge function)', () => {
  it('derives the operation server-side from the response type, not a client label', () => {
    const source = edgeSource();
    expect(source).toContain("type HostedOperation = 'generate' | 'analyze'");
    expect(source).toContain('const deriveHostedOperation = (expectedResponseType: ExpectedResponseType): HostedOperation =>');
    expect(source).toContain("expectedResponseType === 'text' || expectedResponseType === 'json' ? 'analyze' : 'generate'");
  });

  it('treats post-generation analysis as zero-credit included billing without trusting a client flag', () => {
    const source = edgeSource();
    // analyze (not explicitly paid) is included => 0 credits, derived from the server operation type.
    expect(source).toContain("operation === 'analyze' && qualityGateBilling !== 'paid'");
    expect(source).toContain('const treatAsIncludedAnalysis =');
    expect(source).toContain('const backendCalculatedRequiredCredits = treatAsIncludedAnalysis');
    expect(source).toContain('? 0');
    // The zero is allowed (analyzeImage no longer returns INVALID_REQUIRED_CREDITS for analysis).
    expect(source).toContain('normalizeClientRequiredCredits(\n    body.requiredCredits ??');
    expect(source).toContain('requiredCredits must be a non-negative integer.');
  });

  it('normal image generation requires a positive server-derived credit amount and rejects 0', () => {
    const source = edgeSource();
    expect(source).toContain('const calculateBackendRequiredCredits = (_generationType: GenerationType, resolutionTier: ResolutionTier): number =>');
    // generate path keeps allowZero=false => 0/negative/fractional is rejected as a positive integer error.
    expect(source).toContain('requiredCredits must be a positive integer.');
    expect(source).toContain("if (!Number.isInteger(numeric) || numeric < minimum)");
  });

  it('whitelists analysis models so a generation cannot be relabeled as free analysis', () => {
    const source = edgeSource();
    expect(source).toContain('const ANALYSIS_OPERATION_MODELS = new Set<string>(');
    expect(source).toContain("'gemini-2.5-flash'");
    expect(source).toContain("operation === 'analyze' && !ANALYSIS_OPERATION_MODELS.has(providerModel)");
    expect(source).toContain("'INVALID_ANALYSIS_MODEL'");
  });

  it('keeps server-derived credits as billing truth (client value only cross-checked)', () => {
    const source = edgeSource();
    expect(source).toContain('readHostedCreditMetadata(requestBody, expectedResponseType, providerModel)');
    expect(source).toContain("'CREDIT_COST_MISMATCH'");
    expect(source).toContain('requiredCredits: backendCalculatedRequiredCredits');
  });

  it('requires authentication and an execution fingerprint before any analysis/generation runs', () => {
    const source = edgeSource();
    const authIndex = source.indexOf("req.headers.get('Authorization')");
    const creditIndex = source.indexOf('readHostedCreditMetadata(requestBody');
    expect(authIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeLessThan(creditIndex);
    expect(source).toContain("'UNAUTHORIZED'");
    expect(source).toContain("'MISSING_EXECUTION_FINGERPRINT'");
  });

  it('returns descriptive 400 codes for malformed requests', () => {
    const source = edgeSource();
    expect(source).toContain("'INVALID_JSON'");
    expect(source).toContain("'INVALID_ANALYSIS_MODEL'");
    expect(source).toContain("'MISSING_MODEL'");
  });
});

describe('hosted analysis client contract (GeminiService)', () => {
  it('runs pose/style/wardrobe validation as included text analysis and ties each call to a fingerprint', () => {
    const source = serviceSource();
    // Each validator analyzes via the quality-gate (included) billing window and a text response type.
    expect(source).toContain("{ ...withQualityGateWaitWindow(options), expectedResponseType: 'text' }");
    expect(source).toContain("hostedQualityGateBilling: options.hostedQualityGateBilling ?? 'included'");
    // Every hosted call (including analysis) carries an executionFingerprint, associating it to a request.
    expect(source).toContain('executionFingerprint');
    expect(source).toContain('const useModel = HOSTED_ANALYSIS_MODEL;');
  });

  it('logs analysis failures as unavailable with a concise diagnostic (no raw payloads)', () => {
    const source = serviceSource();
    expect(source).toContain('describeAnalysisFailure(error, HOSTED_ANALYSIS_MODEL)');
    expect(source).toContain('Pose validation unavailable');
    expect(source).toContain('Style validation unavailable');
    expect(source).toContain('Wardrobe validation unavailable');
    // Must not log the raw error/image/prompt anymore.
    expect(source).not.toContain("Validation skipped after quality-gate error.', error)");
  });

  it('keeps the biometric/reference integrity guard intact', () => {
    const source = serviceSource();
    expect(source).toContain('assertReferenceImageData({ index: imgIndex, label: ref.label, data: inline.data })');
  });
});

describe('describeAnalysisFailure (privacy-safe diagnostic)', () => {
  it('extracts the error code from a hosted error message', () => {
    const error = new Error('Hosted Generation Error [INVALID_REQUIRED_CREDITS]: requiredCredits must be a positive integer.');
    expect(describeAnalysisFailure(error, 'gemini-2.5-flash')).toEqual({
      operation: 'analyze',
      model: 'gemini-2.5-flash',
      code: 'INVALID_REQUIRED_CREDITS',
      status: null
    });
  });

  it('extracts an HTTP status when the label is HTTP_<status>', () => {
    const error = new Error('Hosted Generation Error [HTTP_500]: upstream failure');
    const diag = describeAnalysisFailure(error, 'gemini-2.5-flash');
    expect(diag.code).toBe('HTTP_ERROR');
    expect(diag.status).toBe(500);
  });

  it('falls back to UNKNOWN and never includes raw payloads', () => {
    const diag = describeAnalysisFailure(new Error('boom'), 'gemini-2.5-flash');
    expect(diag).toEqual({ operation: 'analyze', model: 'gemini-2.5-flash', code: 'UNKNOWN', status: null });
    expect(JSON.stringify(diag)).not.toMatch(/base64|data:image|Bearer|apikey/i);
  });
});
