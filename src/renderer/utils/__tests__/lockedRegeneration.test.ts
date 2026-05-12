import { describe, expect, it } from 'vitest';

import {
  LOCKED_REGENERATION_NEGATIVE_PROMPT,
  LOCKED_REGENERATION_REQUIRED_PROMPT,
  buildLockedRegenerationContract,
} from '../../../prompts/lockedRegeneration';

const buildContract = (overrides: Partial<Parameters<typeof buildLockedRegenerationContract>[0]> = {}) =>
  buildLockedRegenerationContract({
    characterId: 'char-regen',
    approvedSourceImageId: '[IMAGE 1]',
    biometricReferenceIds: ['[IMAGE 2]', '[IMAGE 3]', '[IMAGE 4]'],
    identityLockPresent: true,
    bodyLockSource: 'approved_generated_source',
    bodyDescription: 'average medium build from approved source',
    styleLockSource: 'user_selected',
    styleDescription: 'Family 3D Animation',
    costumeLockSource: 'approved_generated_source',
    costumeDescription: 'approved generated character costume',
    ...overrides,
  });

describe('locked character regeneration contract', () => {
  it('preserves identity_lock during regenerate', () => {
    const contract = buildContract();

    expect(contract).toContain('"generation_mode": "REGENERATE_LOCKED_CHARACTER"');
    expect(contract).toContain('"identity_lock"');
    expect(contract).toContain('"priority": "absolute"');
    expect(contract).toContain('"allow_identity_drift": false');
    expect(contract).toContain(LOCKED_REGENERATION_REQUIRED_PROMPT);
  });

  it('preserves body_lock during regenerate', () => {
    const contract = buildContract();

    expect(contract).toContain('"body_lock"');
    expect(contract).toContain('"source": "approved_generated_source"');
    expect(contract).toContain('"allow_body_type_drift": false');
  });

  it('preserves style_lock during regenerate', () => {
    const contract = buildContract();

    expect(contract).toContain('"style_lock"');
    expect(contract).toContain('"description": "Family 3D Animation"');
    expect(contract).toContain('"allow_style_drift": false');
  });

  it('preserves costume_lock during regenerate', () => {
    const contract = buildContract();

    expect(contract).toContain('"costume_lock"');
    expect(contract).toContain('"description": "approved generated character costume"');
    expect(contract).toContain('"allow_costume_drift": false');
  });

  it('does not set regeneration mode to CREATE_NEW_CHARACTER', () => {
    const contract = buildContract();

    expect(contract).toContain('"generation_mode": "REGENERATE_LOCKED_CHARACTER"');
    expect(contract).not.toContain('"generation_mode": "CREATE_NEW_CHARACTER"');
  });

  it('prevents face-only biometric references from inventing a new body type', () => {
    const contract = buildContract({ faceOnlyBiometricReferences: true });

    expect(contract).toContain('Face-only biometric references are not body-mass evidence');
    expect(contract).toContain('Do not invent a heavier, slimmer, taller, younger, older, or differently proportioned body');
  });

  it('defaults quality-only regeneration to artifact improvement only', () => {
    const contract = buildContract({ regenerationTarget: 'quality_artifacts_only' });

    expect(contract).toContain('"regeneration_target": "quality_artifacts_only"');
    expect(contract).toContain('Improve fidelity, cleanup, clarity, hands, edges, compression, and rendering artifacts');
    expect(contract).toContain(LOCKED_REGENERATION_NEGATIVE_PROMPT);
  });

  it('allows Wardrobe V2 to change costume only while preserving identity and body', () => {
    const contract = buildContract({
      regenerationTarget: 'wardrobe_v2',
      allowCostumeChange: true,
    });

    expect(contract).toContain('"regeneration_target": "wardrobe_v2"');
    expect(contract).toContain('"allow_identity_drift": false');
    expect(contract).toContain('"allow_body_type_drift": false');
    expect(contract).toContain('"allow_costume_drift": true');
  });

  it('allows Body Focus only within body_lock rules while preserving identity', () => {
    const contract = buildContract({
      regenerationTarget: 'body_focus',
      allowBodyFocusChange: true,
    });

    expect(contract).toContain('"regeneration_target": "body_focus"');
    expect(contract).toContain('Body Focus may adjust anatomy only within body_lock rules');
    expect(contract).toContain('"allow_identity_drift": false');
  });

  it('allows style preset correction only while preserving identity and body', () => {
    const contract = buildContract({
      regenerationTarget: 'style_consistency',
      allowStyleChange: true,
      styleDescription: 'Retro Cel Anime',
    });

    expect(contract).toContain('"regeneration_target": "style_consistency"');
    expect(contract).toContain('"description": "Retro Cel Anime"');
    expect(contract).toContain('A style correction may change rendering treatment only');
    expect(contract).toContain('"allow_identity_drift": false');
    expect(contract).toContain('"allow_body_type_drift": false');
  });
});
