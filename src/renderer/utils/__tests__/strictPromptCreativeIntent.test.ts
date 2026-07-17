import { describe, expect, it } from 'vitest';
import type { DirectorSettings } from '../../context/AppContext';
import { buildStrictPrompt, buildStrictAnchorReplacementPrompt } from '../promptHelpers';

const director = {
  qualityMode: 'Raw Uncompressed',
  resolution: 'Native 4K',
  environment: '',
  lighting: '',
  camera: '',
  subject: '',
  filmStock: '',
  replaceAnchorSubjects: false,
} as unknown as DirectorSettings;

describe('strict prompt creative intent restoration', () => {
  it('elevates user scene/style notes to a mandatory creative-intent block with an identity guard', () => {
    const prompt = buildStrictPrompt(
      [],
      {},
      'Rain-soaked neon alley at night, tense standoff, low dutch angle, hard rim light.',
      [],
      [],
      [],
      director
    );

    expect(prompt).toContain('### OVERALL SCENE & STYLE / CREATIVE INTENT (MANDATORY)');
    expect(prompt).toContain('Rain-soaked neon alley at night, tense standoff, low dutch angle, hard rim light.');
    expect(prompt).toContain('Honor the scene, environment, mood, lighting, style, and action content of this direction fully.');
    expect(prompt).toContain('### IDENTITY GUARD');
    expect(prompt).toContain("Do not change the actor's face, identity, age, body type, skin tone, hairline, facial hair, expression baseline, or likeness.");
    expect(prompt).not.toContain('ACTION / EDIT DIRECTION (NOT IDENTITY)');
  });

  it('omits the creative-intent block when no notes are provided', () => {
    const prompt = buildStrictPrompt([], {}, '', [], [], [], director);

    expect(prompt).not.toContain('### OVERALL SCENE & STYLE / CREATIVE INTENT (MANDATORY)');
  });

  it('keeps creative intent mandatory and identity guarded in replace-anchor mode', () => {
    const prompt = buildStrictAnchorReplacementPrompt({
      bgPrompt: 'Sun-drenched Tuscan courtyard, golden hour, warm cinematic grade.',
      mergeStrategy: 'natural',
      sceneLock: false,
      replaceAnchorSubjects: true,
      globalReplaceTarget: '',
      hasDepthMap: false,
      activeRefs: []
    });

    expect(prompt).toContain('=== OVERALL SCENE & STYLE / CREATIVE INTENT (MANDATORY) ===');
    expect(prompt).toContain('Sun-drenched Tuscan courtyard, golden hour, warm cinematic grade.');
    expect(prompt).toContain('Honor the scene, environment, mood, lighting, style, and action content of this direction fully.');
    expect(prompt).toContain('=== IDENTITY GUARD ===');
    expect(prompt).toContain('=== NEGATIVE IDENTITY DRIFT RULES ===');
    expect(prompt).not.toContain('ACTION / EDIT DIRECTION (NOT IDENTITY)');
  });

  it('retains the plain scene block in non-replace mode', () => {
    const prompt = buildStrictAnchorReplacementPrompt({
      bgPrompt: 'A cozy library reading nook.',
      mergeStrategy: 'natural',
      sceneLock: false,
      replaceAnchorSubjects: false,
      globalReplaceTarget: '',
      hasDepthMap: false,
      activeRefs: []
    });

    expect(prompt).toContain('=== OVERALL SCENE & STYLE ===');
    expect(prompt).toContain('A cozy library reading nook.');
  });
});
