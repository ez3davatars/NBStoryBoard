import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  BIOMETRIC_IDENTITY_LOCK_NEGATIVE_TEXT,
  BIOMETRIC_IDENTITY_LOCK_REQUIRED_PROMPT,
  buildBiometricIdentityLockContract,
  buildStrictBiometricIdentityContract,
  createBiometricIdentityLock,
  withBiometricIdentityLockContract,
} from '../../../prompts/identityContracts';
import { buildNanoCastStyleIdentityEnforcementContract } from '../../../prompts/nanoCastStyleIdentityEnforcement';

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

  it('does not hardcode a facial-hair style into biometric identity prompts', () => {
    const strictContract = buildStrictBiometricIdentityContract({
      identityRangeText: '[IMAGE 1] to [IMAGE 5]',
      identityStrength: 100,
      selectedStyleLabel: 'Family 3D Animation',
      mode: 'biometric',
      faceDominant: true,
    });
    const styleContract = buildNanoCastStyleIdentityEnforcementContract('family_3d', {
      identityRangeText: '[IMAGE 1] to [IMAGE 5]',
      requestedIdentityStrength: 100,
      selectedStyleLabel: 'Family 3D Animation',
      usesBiometricIdentity: true,
    });
    const combined = `${strictContract}\n${styleContract}`.toLowerCase();

    expect(combined).toContain('clean-shaven');
    expect(combined).toContain('translate the same scanned person into premium animated 3d');
    expect(combined).toContain('preserve head silhouette, scalp/bald shape, brow placement, eye spacing');
    expect(combined).toContain('skin tone value, age impression, neck thickness, shoulder relationship');
    expect(combined).toContain('visible neck identity boundary, and distinctive marks');
    expect(combined).toContain('no generic friendly animated man');
    expect(combined).toContain('no broad smile unless explicitly requested');
    expect(combined).toContain('no default cute animated face template');
    expect(combined).toContain('no changed facial-hair silhouette');
    expect(combined).toContain('no altered bald/scalp shape');
    expect(combined).toContain('no younger/slimmer/softer redesign');
    expect(combined).toContain('no generic family-animation protagonist');
    expect(combined).not.toContain('salt-and-pepper goatee');
    expect(combined).not.toContain('jaw/chin/goatee');
    expect(combined).not.toContain('generic animated bald man');
    expect(combined).not.toContain('keep identity geometry close to source');
  });

  it('uses biometric identity as the first priority in shared identity contracts', () => {
    const source = readFileSync('src/prompts/identityContracts.ts', 'utf8');

    expect(source).toContain('biometric identity > style lock');
    expect(source).toContain('Preserve the same actor identity first.');
    expect(BIOMETRIC_IDENTITY_LOCK_REQUIRED_PROMPT).toContain('skull/head/scalp shape');
    expect(BIOMETRIC_IDENTITY_LOCK_REQUIRED_PROMPT).toContain('facial hair shape/length/density/color pattern');
    expect(BIOMETRIC_IDENTITY_LOCK_NEGATIVE_TEXT).toContain('No cleanup into a smoother stock actor');
    expect(BIOMETRIC_IDENTITY_LOCK_NEGATIVE_TEXT).toContain('No changed hairline, baldness pattern, hairstyle');
  });

  it('keeps Nano Cast morphology subordinate to biometric identity', () => {
    const source = readFileSync('src/renderer/components/NanoCastingDirector.tsx', 'utf8');
    const morphologySource = readFileSync('src/renderer/nanocast/nanoMorphologyGuides.ts', 'utf8');

    expect(source).toContain('buildNanoCastPrompt(nanoBlueprint)');
    expect(source).toContain('validateNanoBlueprint(nanoBlueprint)');
    expect(morphologySource).toContain('Morphology controls BODY SILHOUETTE ONLY.');
    expect(morphologySource).toContain('It must not change facial identity, head shape, scalp/bald shape, facial hair, expression, age impression, skin tone, or recognizable likeness');
    expect(morphologySource).toContain('Titan means muscular/broad, not fat.');
    expect(morphologySource).toContain('Do not make the subject overweight, heavy-set, bulky, stocky, obese, or large-bellied.');
    expect(morphologySource).toContain('Never apply chibi, childlike, or oversized-head proportions to adult scans.');
    expect(morphologySource).toContain('MORPHOLOGY BODY AUTHORITY MODEL');
    expect(source).not.toContain('Select physical substrate for neural projection mapping.');
    expect(source).not.toContain('Heroic V-taper');
    expect(source).not.toContain('heavy-set rectangular frame');
  });

  it('keeps Nano Cast biometric anchors authoritative across style settings', () => {
    const nanoCastSource = readFileSync('src/renderer/components/NanoCastingDirector.tsx', 'utf8');
    const appContextSource = readFileSync('src/renderer/context/AppContext.tsx', 'utf8');
    const nanoBuilderSource = readFileSync('src/renderer/nanocast/nanoPromptBuilder.ts', 'utf8');
    const nanoIdentitySource = readFileSync('src/renderer/nanocast/nanoIdentityAnchor.ts', 'utf8');
    const styleEnforcementSource = readFileSync('src/prompts/nanoCastStyleIdentityEnforcement.ts', 'utf8');

    expect(appContextSource).toContain("identitySource: 'biometric'");
    expect(nanoCastSource).toContain('NANO_CAST_BIOMETRIC_PIPELINE');
    expect(nanoCastSource).toContain('buildNanoCastPrompt(nanoBlueprint)');
    expect(nanoCastSource).toContain('PRIMARY FRONT LIKENESS ANCHOR');
    expect(nanoCastSource).toContain('SUPPORTING GEOMETRY ANCHOR');
    expect(nanoCastSource).toContain('Do not average all views into a new person');
    expect(nanoBuilderSource).toContain('buildNanoIdentityContract');
    expect(nanoIdentitySource).toContain('NANO CAST IMMUTABLE IDENTITY CONTRACT');
    expect(nanoIdentitySource).toContain('The scanned biometric subject is the only identity source.');
    expect(nanoCastSource).toContain('sheetStyleLock: false');
    expect(nanoCastSource).toContain('poseCoherence: false');
    expect(nanoCastSource).toContain('headshotWardrobeContinuity: false');
    expect(nanoCastSource).toContain('characterAnatomyIntegrity: false');
    expect(nanoCastSource).toContain('styleCategory: { enabled: false }');
    expect(nanoCastSource).toContain("identitySource !== 'generated' && hasBiometrics");
    expect(nanoCastSource).toContain('Portrait ignores scan anchors');
    expect(styleEnforcementSource).toContain('UNIVERSAL SCAN-IDENTITY OVERRIDE');
    expect(styleEnforcementSource).toContain('no cleaner stock actor');
    expect(styleEnforcementSource).toContain('no changed scalp, baldness, or hairline shape');
  });

  it('allows Nano Cast primary renders to skip sheet-style contracts', () => {
    const serviceSource = readFileSync('src/renderer/services/GeminiService.ts', 'utf8');

    expect(serviceSource).toContain('sheetStyleLock?: boolean');
    expect(serviceSource).toContain('characterAnatomyIntegrity?: boolean');
    expect(serviceSource).toContain('options.sheetStyleLock !== false');
    expect(serviceSource).toContain('options.characterAnatomyIntegrity !== false');
    expect(serviceSource).toContain(': promptWithAnatomyIntegrity');
  });
});
