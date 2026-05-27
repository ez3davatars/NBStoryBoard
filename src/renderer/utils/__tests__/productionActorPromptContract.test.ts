import { describe, expect, it } from 'vitest';
import { buildProductionActorPromptContract } from '../promptHelpers';

describe('Production Actor Prompt Contract Generation', () => {
  it('generates the exact required contract structure', () => {
    const profile = {
      name: 'Abner',
      displayName: 'Abner the Prophet',
      identitySummary: 'Strong jawline, gray beard, ancient robes.',
      styleSummary: 'Cinematic hyperrealism, high-contrast chiaroscuro.',
      wardrobeSummary: 'Brown tunic with gold embroidery, leather belt, sandals.',
      preserveRules: ['facial structure', 'gray beard style', 'clothing design'],
      avoidRules: ['modern collars', 'synthetic fabric reflections', 'soft studio lights']
    };

    const refLabel = 'Ref 1';
    const contract = buildProductionActorPromptContract(profile, refLabel);

    expect(contract).toContain('PRODUCTION ACTOR LOCK FOR Ref 1:');
    expect(contract).toContain('Actor Name: Abner the Prophet');
    expect(contract).toContain('Identity Summary:\nStrong jawline, gray beard, ancient robes.');
    expect(contract).toContain('Style Summary:\nCinematic hyperrealism, high-contrast chiaroscuro.');
    expect(contract).toContain('Wardrobe Summary:\nBrown tunic with gold embroidery, leather belt, sandals.');
    expect(contract).toContain('Preserve:\nfacial structure, gray beard style, clothing design');
    expect(contract).toContain('Avoid:\nmodern collars, synthetic fabric reflections, soft studio lights');
    expect(contract).toContain('Rules:');
    expect(contract).toContain('This Production Actor metadata is authoritative for identity continuity.');
    expect(contract).toContain('The reference image provides visual support, but the locked actor profile defines what must be preserved.');
    expect(contract).toContain('Do not change the actor’s face, body identity, wardrobe identity, core style, or preserve-list traits unless the user explicitly requests an edit.');
    expect(contract).toContain('Avoid all avoid-list traits.');
  });

  it('handles empty or missing profile properties gracefully', () => {
    const profile = {};
    const contract = buildProductionActorPromptContract(profile, 'Ref 2');

    expect(contract).toContain('PRODUCTION ACTOR LOCK FOR Ref 2:');
    expect(contract).toContain('Actor Name: Production Actor');
    expect(contract).toContain('Identity Summary:\nNo identity summary available.');
    expect(contract).toContain('Preserve:\nNone');
    expect(contract).toContain('Avoid:\nNone');
  });
});
