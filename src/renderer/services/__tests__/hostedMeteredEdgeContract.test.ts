import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edge = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
const migration = () => readFileSync('supabase/migrations/20260619000000_metered_analysis_billing.sql', 'utf8');
const service = () => readFileSync('src/renderer/services/GeminiService.ts', 'utf8');

describe('edge meters from real provider usage, model + service tier (fail closed, no client trust)', () => {
  it('20. meters from the provider response usageMetadata + serviceTier, not the client request', () => {
    const s = edge();
    expect(s).toContain('usageMetadata?: Record<string, unknown> | null');
    expect(s).toContain('const usage = normalizeProviderUsage(usageMeta)');
    expect(s).toContain('const serviceTier = normalizeServiceTier(usageMeta?.serviceTier)');
    expect(s).toContain('buildMeteredSettlement({');
    expect(s).toContain("'MISSING_USAGE_METADATA'");
    expect(s).toContain("'INVALID_USAGE_METADATA'");
  });

  it('9/10. unknown model OR non-standard service tier fails closed', () => {
    const s = edge();
    expect(s).toContain("'UNKNOWN_PROVIDER_PRICING'");
    expect(s).toContain("'UNKNOWN_SERVICE_TIER'");
    expect(s).toContain("if (normalized === 'standard') return 'standard';");
    expect(s).toContain('HOSTED_GOOGLE_TOKEN_PRICING[model]?.[tier]');
  });

  it('uses BigInt currency math and a 2× markup (no float, no 1.5×)', () => {
    const s = edge();
    expect(s).toContain('const computeProviderListCostNanoUsd = (model: string, tier: HostedServiceTier, usage: ProviderUsage): bigint =>');
    expect(s).toContain('ceilDivBigInt(providerListCostNanoUsd * BigInt(10000 + markupBps), 10000n)');
    expect(s).toContain('const HOSTED_GOOGLE_GROSS_MARGIN_BPS = 5000');
    expect(s).not.toContain('× 1.5');
  });

  it('validates the markup env config (non-negative integer, default 10000)', () => {
    const s = edge();
    expect(s).toContain("Deno.env.get('HOSTED_GOOGLE_COST_MARKUP_BPS')");
    expect(s).toContain('if (!Number.isInteger(parsed) || parsed < 0)');
    expect(s).toContain('return 10000;');
  });
});

describe('edge persists published-rate ledger + settles', () => {
  it('writes list cost / invoiced(null) / pricingSource / tier / margin into billing_metadata', () => {
    const s = edge();
    for (const field of [
      'providerListCostNanoUsd', 'providerInvoicedCostNanoUsd', 'pricingSource', 'reconciliationStatus',
      'providerServiceTier', 'markupBasisPoints', 'grossMarginBasisPoints', 'customerPriceNanoUsd',
      'creditMicroUnitsCharged', 'pricingVersion', 'providerResponseId', 'parentGenerationId',
      'executionFingerprint', 'settlementStatus'
    ]) {
      expect(s).toContain(field);
    }
    expect(s).toContain("billingMode: 'metered'");
    expect(s).toContain("pricingSource: 'published_rate'");
  });

  it('reserves a bounded max, then settles to actual via settle_generation; RECONCILE_PENDING when unsettleable', () => {
    const s = edge();
    expect(s).toContain('const meteredReservationCredits = (policy: HostedAnalysisPolicy): number =>');
    expect(s).toContain("supabaseService.rpc('settle_generation'");
    expect(s).toContain('p_provider_response_id: settlement.providerResponseId');
    expect(s).toContain('RECONCILE_PENDING');
  });

  it('exposes an administrative hosted-Google kill switch (fail closed)', () => {
    const s = edge();
    expect(s).toContain("Deno.env.get('HOSTED_GOOGLE_KILL_SWITCH')");
    expect(s).toContain("'HOSTED_GOOGLE_DISABLED'");
  });
});

describe('settlement migration (reserve -> settle -> release, idempotent, over-reservation safe)', () => {
  it('11. an over-reservation settlement is flagged RECONCILE_PENDING, never silently undercharged', () => {
    const m = migration();
    expect(m).toContain('IF p_actual_cost > COALESCE(target_job.cost, 0) THEN');
    expect(m).toContain("settlement_status = 'RECONCILE_PENDING'");
    expect(m).toContain('RAISE WARNING');
    // it must NOT silently cap the actual to the reservation and mark it SETTLED.
    expect(m).not.toContain('p_actual_cost := COALESCE(target_job.cost, 0);');
  });

  it('12. duplicate settlement is prevented (idempotent on settled status + provider_response_id index)', () => {
    const m = migration();
    expect(m).toContain("IF target_job.settlement_status = 'SETTLED'");
    expect(m).toContain('generations_provider_response_settle_idx');
    expect(m).toContain('provider_response_id IS NOT DISTINCT FROM p_provider_response_id');
  });

  it('adds settle_generation + release_reservation + ledger columns', () => {
    const m = migration();
    expect(m).toContain('CREATE OR REPLACE FUNCTION public.settle_generation(');
    expect(m).toContain('CREATE OR REPLACE FUNCTION public.release_reservation(');
    expect(m).toContain('ADD COLUMN IF NOT EXISTS provider_response_id text');
    expect(m).toContain('ADD COLUMN IF NOT EXISTS settlement_status text');
  });
});

describe('13. missing usageMetadata enters reconciliation rather than zero billing', () => {
  it('throws MISSING_USAGE_METADATA (failure refunds reservation) instead of charging 0', () => {
    const s = edge();
    expect(s).toContain("throw new GenerationExecutionError(502, 'MISSING_USAGE_METADATA'");
    // null credit value / metered-billing-disabled => RECONCILE_PENDING, never a silent zero settlement.
    expect(s).toContain("(HOSTED_METERED_BILLING_ENABLED && settlement.creditMicroUnitsCharged !== null) ? 'SETTLED' : 'RECONCILE_PENDING'");
  });
});

describe('14. BYOK analysis stays outside the hosted wallet', () => {
  it('analyzeImage BYOK path calls Google directly (no edge, no hosted credits)', () => {
    const s = service();
    expect(s).toContain('if (!apiKey && options.billingMode !== \'hosted\') throw new Error("No API Key provided.");');
    expect(s).toContain('https://generativelanguage.googleapis.com/v1beta/models/');
  });
});
