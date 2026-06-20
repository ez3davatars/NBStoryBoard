import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getHostedUsageCredits,
  getHostedUsageLabel,
  type HostedUsageRow
} from '../hostedUsageLabels';

const row = (billing_metadata: HostedUsageRow['billing_metadata'], provider_model = 'gemini-2.5-flash'): HostedUsageRow => ({
  id: 'row-1',
  status: 'COMPLETED',
  provider_model,
  billing_metadata
});

const edgeSource = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
const sceneSource = () => readFileSync('src/renderer/components/SceneCanvas.tsx', 'utf8');

describe('getHostedUsageLabel', () => {
  it('shows "Reference DNA Analysis" for the paid manual analysis category and keeps 1 credit', () => {
    const dna = row({ usageCategory: 'reference_dna_analysis', requiredCredits: 1, generationType: 'standard', resolutionTier: '1k' });
    expect(getHostedUsageLabel(dna)).toBe('Reference DNA Analysis');
    expect(getHostedUsageCredits(dna)).toBe(1);
  });

  it('keeps "standard - 1K/2K/4K" for normal image generation rows', () => {
    expect(getHostedUsageLabel(row({ generationType: 'standard', resolutionTier: '1k', requiredCredits: 1 }))).toBe('standard - 1K');
    expect(getHostedUsageLabel(row({ generationType: 'standard', resolutionTier: '2k', requiredCredits: 2 }))).toBe('standard - 2K');
    expect(getHostedUsageLabel(row({ generationType: 'standard', resolutionTier: '4k', requiredCredits: 6 }))).toBe('standard - 4K');
  });

  it('does not display included quality checks as paid Reference DNA analyses', () => {
    // Included post-generation validators carry no usageCategory and 0 credits.
    const includedGate = row({ generationType: 'standard', resolutionTier: '1k', requiredCredits: 0 });
    expect(getHostedUsageLabel(includedGate)).not.toBe('Reference DNA Analysis');
    expect(getHostedUsageLabel(includedGate)).toBe('standard - 1K');
    expect(getHostedUsageCredits(includedGate)).toBe(0);
  });

  it('retains the legacy fallback for rows without usageCategory', () => {
    expect(getHostedUsageLabel(row({ generationType: 'standard', resolutionTier: '2k' }))).toBe('standard - 2K');
    expect(getHostedUsageLabel(row(null))).toBe('image generation');
  });

  it('does not relabel rows with an unknown usageCategory value', () => {
    const unknown = row({ usageCategory: 'something_else', generationType: 'standard', resolutionTier: '1k' });
    expect(getHostedUsageLabel(unknown)).toBe('standard - 1K');
  });
});

describe('billing totals + credit reads are unaffected by the label change', () => {
  it('sums credits from requiredCredits regardless of usageCategory', () => {
    const rows = [
      row({ usageCategory: 'reference_dna_analysis', requiredCredits: 1 }),
      row({ generationType: 'standard', resolutionTier: '2k', requiredCredits: 2 }),
      row({ generationType: 'standard', resolutionTier: '1k', requiredCredits: 0 })
    ];
    const total = rows.reduce((sum, r) => sum + getHostedUsageCredits(r), 0);
    expect(total).toBe(3);
  });
});

describe('server-side category validation + persistence (edge function)', () => {
  it('only approves reference_dna_analysis for a paid text analysis on an approved model', () => {
    const source = edgeSource();
    expect(source).toContain("requestedUsageCategory === 'reference_dna_analysis' &&");
    expect(source).toContain("operation === 'analyze' &&");
    expect(source).toContain("expectedResponseType === 'text' &&");
    expect(source).toContain("qualityGateBilling === 'paid' &&");
    expect(source).toContain('ANALYSIS_OPERATION_MODELS.has(providerModel)');
  });

  it('persists the server-approved category in billing_metadata and does not trust a client display string', () => {
    const source = edgeSource();
    // usageCategory is part of the returned creditMetadata that is written to billing_metadata.
    expect(source).toContain('creditPricingVersion: CREDIT_PRICING_VERSION,\n    usageCategory');
    expect(source).toContain('billing_metadata: creditMetadata');
    // Only the typed literal is ever stored.
    expect(source).toContain("type HostedUsageCategory = 'reference_dna_analysis'");
  });

  it('does not change pricing or deductions (server-derived requiredCredits, mismatch guard intact)', () => {
    const source = edgeSource();
    expect(source).toContain('p_cost: creditMetadata.requiredCredits');
    expect(source).toContain("'CREDIT_COST_MISMATCH'");
  });
});

describe('client only tags the manual Reference DNA AUTO-ANALYZE path', () => {
  it('sends usageCategory only from the manual handler, alongside paid text analysis', () => {
    const source = sceneSource();
    const handlerIndex = source.indexOf('const handleManualAnalyze');
    const handlerBody = source.slice(handlerIndex, handlerIndex + 1400);
    expect(handlerBody).toContain("usageCategory: 'reference_dna_analysis'");
    expect(handlerBody).toContain("hostedQualityGateBilling: 'paid'");
    expect(handlerBody).toContain("expectedResponseType: 'text'");
    // The category must not be attached to the automatic quality-gate validators.
    expect(source).not.toContain("withQualityGateWaitWindow(options), expectedResponseType: 'text', usageCategory");
  });
});
