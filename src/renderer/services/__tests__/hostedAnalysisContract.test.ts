import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOSTED_ANALYSIS_POLICIES,
  HOSTED_USAGE_CATEGORY_LABELS,
  getHostedAnalysisPolicy,
  isHostedAnalysisKind,
  type HostedAnalysisKind
} from '../hostedAnalysisPolicy';

const read = (path: string) => readFileSync(path, 'utf8');
const edgeSource = () => read('supabase/functions/generate-image/index.ts');
const serviceSource = () => read('src/renderer/services/GeminiService.ts');

const PAID_KINDS: HostedAnalysisKind[] = [
  'reference_dna', 'actor_intelligence', 'scene_reextract', 'production_actor_identity', 'veo_prompt_enhance'
];
const INCLUDED_KINDS: HostedAnalysisKind[] = [
  'scene_dna_gate', 'token_profile_gate', 'character_style_gate', 'scene_intent_gate',
  'shot_integrity_gate', 'pose_quality_gate', 'style_quality_gate', 'wardrobe_continuity_gate'
];

describe('hosted analysis policy registry', () => {
  it('meters every manual analyzer (billed by usage, not a fixed credit) with a usage label + bounds', () => {
    for (const kind of PAID_KINDS) {
      const policy = getHostedAnalysisPolicy(kind);
      expect(policy.billing).toBe('metered');
      expect(policy.aggregateUnderParent).toBe(false);
      expect(policy.usageCategory).toBeTruthy();
      expect(policy.usageLabel).toBeTruthy();
      expect(policy.bounds?.maxOutputTokens).toBeGreaterThan(0);
      expect(policy.bounds?.maxBillableMicrocredits).toBeGreaterThan(0);
    }
  });

  it('meters every automatic gate and aggregates it under the parent generation (no standalone label)', () => {
    for (const kind of INCLUDED_KINDS) {
      const policy = getHostedAnalysisPolicy(kind);
      expect(policy.billing).toBe('metered');
      expect(policy.aggregateUnderParent).toBe(true);
      expect(policy.usageCategory).toBeUndefined();
      expect(policy.usageLabel).toBeUndefined();
      expect(policy.bounds?.maxBillableMicrocredits).toBeGreaterThan(0);
    }
  });

  it('no analyzer remains a fixed included/zero-credit provider call', () => {
    for (const policy of Object.values(HOSTED_ANALYSIS_POLICIES)) {
      expect(policy.billing).toBe('metered');
    }
  });

  it('preserves text vs json response types per workflow', () => {
    expect(getHostedAnalysisPolicy('reference_dna').responseType).toBe('text');
    expect(getHostedAnalysisPolicy('actor_intelligence').responseType).toBe('text');
    expect(getHostedAnalysisPolicy('scene_reextract').responseType).toBe('json');
    expect(getHostedAnalysisPolicy('production_actor_identity').responseType).toBe('json');
    expect(getHostedAnalysisPolicy('shot_integrity_gate').responseType).toBe('json');
  });

  it('exposes usage labels for paid analyzers', () => {
    expect(HOSTED_USAGE_CATEGORY_LABELS.reference_dna_analysis).toBe('Reference DNA Analysis');
    expect(HOSTED_USAGE_CATEGORY_LABELS.actor_intelligence_analysis).toBe('Actor Intelligence Analysis');
    expect(HOSTED_USAGE_CATEGORY_LABELS.scene_reextract_analysis).toBe('Scene Re-Extraction');
  });

  it('rejects unknown analysis kinds', () => {
    expect(isHostedAnalysisKind('reference_dna')).toBe(true);
    expect(isHostedAnalysisKind('totally_made_up')).toBe(false);
    expect(isHostedAnalysisKind(undefined)).toBe(false);
  });
});

describe('client/edge policy registries stay aligned', () => {
  it('mirrors every kind + billing + credits + responseType in the edge function', () => {
    const source = edgeSource();
    for (const [kind, policy] of Object.entries(HOSTED_ANALYSIS_POLICIES)) {
      expect(source).toContain(`${kind}: { billing: '${policy.billing}', credits: ${policy.credits}, responseType: '${policy.responseType}'`);
    }
  });

  it('mirrors the approved analysis model whitelist', () => {
    const source = edgeSource();
    expect(source).toContain("'gemini-2.5-flash'");
    expect(source).toContain("'gemini-2.5-flash-lite'");
  });
});

describe('edge function validates analysisKind authoritatively', () => {
  const source = edgeSource;
  it('rejects unknown kind, response-type mismatch, kind-on-generate, and bad model', () => {
    const s = source();
    expect(s).toContain("'INVALID_ANALYSIS_KIND'");
    expect(s).toContain("'ANALYSIS_KIND_RESPONSE_MISMATCH'");
    expect(s).toContain("'ANALYSIS_KIND_ON_GENERATE'");
    expect(s).toContain("'INVALID_ANALYSIS_MODEL'");
  });
  it('reserves a bounded max for metered kinds and derives usageCategory from the policy', () => {
    const s = source();
    expect(s).toContain('const isMeteredAnalysis = analysisPolicy?.billing === \'metered\'');
    expect(s).toContain('meteredReservationCredits(analysisPolicy!)');
    expect(s).toContain('const usageCategory: string | undefined = analysisPolicy?.usageCategory;');
    expect(s).toContain("'CREDIT_COST_MISMATCH'");
  });
});

describe('every user-triggered analyzer goes through a wrapper with an explicit analysisKind', () => {
  it('migrates each call site to the centralized wrappers', () => {
    const svc = serviceSource();
    // GeminiService internal analyzers carry their kind.
    expect(svc).toContain("analysisKind: 'character_style_gate'");
    expect(svc).toContain("analysisKind: 'scene_intent_gate'");
    expect(svc).toContain("analysisKind: 'veo_prompt_enhance'");

    expect(read('src/renderer/components/panels/ActorIntelligencePanel.tsx')).toContain("analysisKind: 'actor_intelligence'");
    expect(read('src/renderer/components/shots/ShotsPanel.tsx')).toContain("analysisKind: 'shot_integrity_gate'");
    expect(read('src/renderer/components/workflows/CreateProductionActorWorkflow.tsx')).toContain("analysisKind: 'production_actor_identity'");

    const adv = read('src/renderer/hooks/useAdvancedRender.ts');
    expect(adv).toContain("analysisKind: 'token_profile_gate'");
    expect(adv).toContain("analysisKind: HostedAnalysisKind = 'scene_dna_gate'"); // auto default included
    // The manual "Re-Extract Scene Only" button binds the paid kind.
    expect(read('src/renderer/components/SceneCanvas.tsx')).toContain("analyzeBackgroundDNA('scene_reextract')");
  });

  it('puts type="button" on the migrated analyzer buttons', () => {
    expect(read('src/renderer/components/panels/RefInspectorModal.tsx')).toContain('type="button"');
    expect(read('src/renderer/components/panels/ActorIntelligencePanel.tsx')).toContain('type="button"');
    expect(read('src/renderer/components/panels/AdvancedRenderPanel.tsx')).toContain('type="button"');
    expect(read('src/renderer/components/workflows/CreateProductionActorWorkflow.tsx')).toContain('type="button"');
    expect(read('src/renderer/components/veo/VeoPromptBuilderPanel.tsx')).toContain('type="button"');
  });
});

// Enforcement: no production component/hook may call analyzeImage/analyzeMultiFrame(Json) directly.
// Only the centralized wrappers + internal quality-gate validators (GeminiService.ts) and the
// documented BYOK-only Smart Analyze path are allowed.
describe('no unclassified direct analyzer calls in production code', () => {
  const ALLOWLIST = new Set<string>([
    'src/renderer/services/GeminiService.ts',
    'src/renderer/hooks/useVeoSmartAnalyze.ts' // BYOK-only Smart Analyze (never hosted) — documented
  ]);
  const DIRECT_CALL = /\.(analyzeImage|analyzeMultiFrame|analyzeMultiFrameJson)\s*\(/;

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        out.push(...walk(full));
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  };

  it('finds zero direct analyzer calls outside the allowlist', () => {
    const offenders = walk('src/renderer')
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !ALLOWLIST.has(f))
      .filter((f) => DIRECT_CALL.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
