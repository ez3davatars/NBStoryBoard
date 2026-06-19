import { describe, expect, it } from 'vitest';
import type { ExtractedStyle } from '../../services/GeminiService';
import {
  buildSubmittedStagingRequestSnapshot,
  deriveExplicitStyleOverride,
  finalizeStagingReferences,
  protectStagingPromptStyle,
  sanitizeReferenceAnalysisForPrompt,
  STAGING_DEFAULT_MEDIUM_CONTRACT
} from '../stagingPromptProtection';

describe('staging prompt protection', () => {
  it('prepends the affirmative photographic default contract', () => {
    const prompt = protectStagingPromptStyle('Place the actor at the counter.');

    expect(prompt).toContain(STAGING_DEFAULT_MEDIUM_CONTRACT);
    expect(prompt).toContain('Use a natural photographic visual medium');
    expect(prompt).toContain('Place the actor at the counter.');
  });

  it('does not inject unwanted visual-media names into the default contract', () => {
    const prompt = protectStagingPromptStyle('Place the actor at the counter.');

    expect(prompt).not.toMatch(/comic|anime|cartoon|cel[- ]?shad|graphic novel|stylized avatar|3D animation/i);
  });

  it('uses an explicit Auto-Style override as the selected medium', () => {
    const override = deriveExplicitStyleOverride({
      renderStyle: 'premium animated feature look',
      medium: 'digital animation'
    } as ExtractedStyle);
    const prompt = protectStagingPromptStyle('Stage the scene.', override);

    expect(prompt).toContain('Use the explicitly selected visual medium: premium animated feature look.');
    expect(prompt).toContain('The selected medium is authoritative.');
  });

  it('keeps direct visual-medium requests in scene instructions under the default contract', () => {
    const prompt = protectStagingPromptStyle('Create a watercolor illustration of the cafe scene.');

    expect(prompt).toContain('unless the current scene instructions explicitly request another visual medium');
    expect(prompt).toContain('Create a watercolor illustration of the cafe scene.');
    expect(prompt).not.toContain('Use the explicitly selected visual medium');
  });

  it('orders background first and geometry overlay last', () => {
    const refs = finalizeStagingReferences({
      cleanBgPlate: 'bg://plate',
      anchorGuide: 'anchor://guide',
      contentReferences: [{ url: 'ref://actor', label: 'REFERENCE_1' }],
      controlOverlay: 'overlay://geometry'
    });

    expect(refs.map((ref) => ref.label)).toEqual([
      'CLEAN_BG_PLATE',
      'ANCHOR_GUIDE',
      'REFERENCE_1',
      'CONTROL_OVERLAY_GEOMETRY_ONLY'
    ]);
  });

  it('keeps the geometry overlay last and never first without a background', () => {
    const refs = finalizeStagingReferences({
      contentReferences: [{ url: 'ref://actor', label: 'REFERENCE_1' }],
      controlOverlay: 'overlay://geometry'
    });

    expect(refs[0]?.label).toBe('REFERENCE_1');
    expect(refs.at(-1)?.label).toBe('CONTROL_OVERLAY_GEOMETRY_ONLY');
  });

  it('limits references to 14 while retaining scene authority and final overlay', () => {
    const refs = finalizeStagingReferences({
      cleanBgPlate: 'bg://plate',
      contentReferences: Array.from({ length: 20 }, (_, index) => ({
        url: `ref://${index}`,
        label: `REFERENCE_${index}`
      })),
      controlOverlay: 'overlay://geometry'
    });

    expect(refs).toHaveLength(14);
    expect(refs[0]?.label).toBe('CLEAN_BG_PLATE');
    expect(refs.at(-1)?.label).toBe('CONTROL_OVERLAY_GEOMETRY_ONLY');
  });

  it('sanitizes contaminated reference analyses while preserving clothing and material details', () => {
    expect(sanitizeReferenceAnalysisForPrompt('Middle-aged man in black polo, shown via high-resolution biometric scan, revealing realistic detailed skin texture.'))
      .toBe('Middle-aged man in black polo with detailed skin texture.');
    expect(sanitizeReferenceAnalysisForPrompt('White linen shirt with gray stylized floral embroidery and visible fabric texture.'))
      .toBe('White linen shirt with gray floral embroidery and visible fabric texture.');
  });

  it('captures the exact submitted prompt and final reference order for Prompt Engine display', () => {
    const prompt = 'FINAL PROMPT TEXT\nDo not alter this string.';
    const refs = finalizeStagingReferences({
      cleanBgPlate: 'bg://plate',
      contentReferences: [{ url: 'ref://actor', label: 'REFERENCE_1' }],
      controlOverlay: 'overlay://geometry'
    });
    const snapshot = buildSubmittedStagingRequestSnapshot('strict', prompt, refs, 123);

    expect(snapshot.prompt).toBe(prompt);
    expect(snapshot.references.map((ref) => ref.label)).toEqual([
      'CLEAN_BG_PLATE',
      'REFERENCE_1',
      'CONTROL_OVERLAY_GEOMETRY_ONLY'
    ]);
    expect(snapshot.createdAt).toBe(123);
  });
});