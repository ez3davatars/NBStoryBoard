import { describe, expect, it } from 'vitest';

import {
  BIOMETRIC_IDENTITY_LOCK_NEGATIVE_TEXT,
  buildBiometricIdentityLockContract,
  createBiometricIdentityLock,
  withBiometricIdentityLockContract,
} from '../../../prompts/identityContracts';

const buildLock = (characterId: string, identityRangeText = '[IMAGE 1] to [IMAGE 5]') =>
  createBiometricIdentityLock({
    characterId,
    referenceViews: ['center', 'left', 'right', 'up', 'down'],
    identityRangeText,
    identityStrength: 96,
    selectedStyleLabel: 'Family 3D Animation',
    appliesTo: 'test generation pipeline',
  });

describe('biometric identity lock contract', () => {
  it('binds one character with biometric references to a persistent character_id', () => {
    const contract = buildBiometricIdentityLockContract(buildLock('char-alpha'));

    expect(contract).toContain('"character_id": "char-alpha"');
    expect(contract).toContain('[IMAGE 1] to [IMAGE 5]');
    expect(contract).toContain('Use the uploaded biometric reference images as the absolute source of truth');
    expect(contract).toContain(BIOMETRIC_IDENTITY_LOCK_NEGATIVE_TEXT);
  });

  it('keeps multiple characters on separate biometric identity locks', () => {
    const prompt = withBiometricIdentityLockContract('Generate a staged cast preview.', [
      buildLock('char-alpha', 'ALPHA [IMAGE 1] to [IMAGE 3]'),
      buildLock('char-beta', 'BETA [IMAGE 4] to [IMAGE 6]'),
    ]);

    expect(prompt).toContain('"character_id": "char-alpha"');
    expect(prompt).toContain('"character_id": "char-beta"');
    expect(prompt).toContain('ALPHA [IMAGE 1] to [IMAGE 3]');
    expect(prompt).toContain('BETA [IMAGE 4] to [IMAGE 6]');
  });

  it('preserves the same identity_lock when style presets change', () => {
    const base = buildLock('char-style');
    const family3d = withBiometricIdentityLockContract('Style preset: Family 3D Animation.', {
      ...base,
      selectedStyleLabel: 'Family 3D Animation',
    });
    const anime = withBiometricIdentityLockContract('Style preset: Retro Cel Anime.', {
      ...base,
      selectedStyleLabel: 'Retro Cel Anime',
    });

    expect(family3d).toContain('"character_id": "char-style"');
    expect(anime).toContain('"character_id": "char-style"');
    expect(family3d).toContain('changes rendering treatment only');
    expect(anime).toContain('changes rendering treatment only');
  });

  it('preserves identity_lock through board presentation changes', () => {
    const premiumBoard = withBiometricIdentityLockContract('Board presentation: Premium Film Board.', buildLock('char-board'));
    const forensicBoard = withBiometricIdentityLockContract('Board presentation: Forensic Reference Board.', buildLock('char-board'));

    expect(premiumBoard).toContain('"character_id": "char-board"');
    expect(forensicBoard).toContain('"character_id": "char-board"');
    expect(premiumBoard).toContain('board presentation styles');
    expect(forensicBoard).toContain('board presentation styles');
  });

  it('includes the lock on panel regeneration prompts', () => {
    const prompt = withBiometricIdentityLockContract(
      'Regenerate only the side profile panel.',
      {
        ...buildLock('char-panel'),
        appliesTo: 'panel regeneration and validation',
      },
    );

    expect(prompt).toContain('"character_id": "char-panel"');
    expect(prompt).toContain('panel regeneration and validation');
    expect(prompt).toContain('No prompt update, style update, costume update, layout update, or regeneration pass may weaken biometric likeness');
  });

  it('keeps generated source character secondary to uploaded biometric references', () => {
    const prompt = withBiometricIdentityLockContract(
      'Build pitch sheet from generated source Image A.',
      createBiometricIdentityLock({
        characterId: 'char-generated-secondary',
        referenceViews: ['center', 'left', 'right'],
        identityRangeText: 'Images B-D / [IMAGE 2] to [IMAGE 4]',
        identityStrength: 100,
        generatedSourceImageIndex: 1,
        generatedSourceRole: 'primary visual design only',
        appliesTo: 'pitch sheet generation',
      }),
    );

    expect(prompt).toContain('"character_id": "char-generated-secondary"');
    expect(prompt).toContain('Generated source image [IMAGE 1] is secondary to identity_lock');
    expect(prompt).toContain('Images B-D / [IMAGE 2] to [IMAGE 4]');
  });
});
