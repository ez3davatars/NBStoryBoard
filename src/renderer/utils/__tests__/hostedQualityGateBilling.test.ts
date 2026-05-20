import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('hosted quality gate billing defaults', () => {
  it('runs hosted quality gates by default and marks validation as included billing', () => {
    const serviceSource = readFileSync('src/renderer/services/GeminiService.ts', 'utf8');

    expect(serviceSource).toContain("type HostedQualityGateBilling = 'skip' | 'included' | 'paid'");
    expect(serviceSource).toContain("options.hostedQualityGateBilling === 'skip'");
    expect(serviceSource).toContain("hostedQualityGateBilling: options.hostedQualityGateBilling ?? 'included'");
    expect(serviceSource).toContain("options.billingMode === 'hosted' && options.hostedQualityGateBilling !== 'skip'");
    expect(serviceSource).toContain("options.hostedQualityGateBilling === 'included'");
    expect(serviceSource).toContain("requiredCredits = isIncludedHostedQualityGateBilling(options)");
  });

  it('keeps one retry max and rejects obvious hosted failures after retry budget is exhausted', () => {
    const serviceSource = readFileSync('src/renderer/services/GeminiService.ts', 'utf8');

    expect(serviceSource).toContain('class HostedQualityGateRejectionError extends Error');
    expect(serviceSource).toContain('Hosted quality gate rejected generated image');
    expect(serviceSource).toContain('validate: true');
    expect(serviceSource).toContain('retry: false');
    expect(serviceSource).toContain('_hostedQualityGateRetryAttempt');
    expect(serviceSource).toContain('hasUsedHostedQualityGateRetry(options)');
    expect(serviceSource).toContain('incrementHostedQualityGateRetry(options)');
    expect(serviceSource).toContain('validation.requiresRetry');
    expect(serviceSource).toContain('body-axis or head-angle mismatch');
    expect(serviceSource).toContain('style-family or sheet-style mismatch');
  });

  it('allows included hosted text/json quality gates to use zero additional credits in the edge function', () => {
    const edgeSource = readFileSync('supabase/functions/generate-image/index.ts', 'utf8');

    expect(edgeSource).toContain("type HostedQualityGateBilling = 'skip' | 'included' | 'paid'");
    expect(edgeSource).toContain('hostedQualityGateBilling?: unknown');
    expect(edgeSource).toContain('isIncludedHostedQualityGateBilling(options, expectedResponseType)');
    expect(edgeSource).toContain('const includedQualityGate = isIncludedHostedQualityGateBilling(options, expectedResponseType)');
    expect(edgeSource).toContain('? 0');
    expect(edgeSource).toContain('requiredCredits must be a non-negative integer.');
    expect(edgeSource).toContain('readHostedCreditMetadata(requestBody, expectedResponseType)');
  });
});
