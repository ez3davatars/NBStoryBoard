import { describe, expect, it } from 'vitest';

import {
  CHARACTER_ANATOMY_NEGATIVE_TEXT,
  shouldApplyCharacterAnatomyIntegrity,
  withCharacterAnatomyIntegrityContract,
} from '../../../prompts/characterAnatomyIntegrity';

describe('character anatomy integrity contract', () => {
  it('applies to character sheet and pose prompts', () => {
    const prompt = 'Create a character pitch sheet with turnaround figures and a crossed-arm gesture pose.';
    const contracted = withCharacterAnatomyIntegrityContract(prompt);

    expect(shouldApplyCharacterAnatomyIntegrity(prompt)).toBe(true);
    expect(contracted).toContain('CHARACTER ANATOMY INTEGRITY CONTRACT');
    expect(contracted).toContain('Crossed-arm');
    expect(contracted).toContain('No third forearm');
    expect(contracted).toContain(CHARACTER_ANATOMY_NEGATIVE_TEXT);
  });

  it('does not apply to standalone garment product images', () => {
    const prompt = 'Single standalone garment only. NO person, NO mannequin, NO hands.';

    expect(shouldApplyCharacterAnatomyIntegrity(prompt)).toBe(false);
  });

  it('keeps non-human anatomy source-locked instead of adding appendages', () => {
    const contracted = withCharacterAnatomyIntegrityContract('Generate a robot character turnaround.');

    expect(contracted).toContain('preserve the exact appendage count implied by the source image or prompt');
    expect(contracted).toContain('Do not add extra heads, torsos, arms, hands, fingers, legs, feet, tails, wings, tentacles, or mechanical appendages');
  });

  it('does not duplicate an existing contract', () => {
    const first = withCharacterAnatomyIntegrityContract('Create a character portrait.');
    const second = withCharacterAnatomyIntegrityContract(first);

    expect(second.match(/CHARACTER ANATOMY INTEGRITY CONTRACT/g)).toHaveLength(1);
  });
});
