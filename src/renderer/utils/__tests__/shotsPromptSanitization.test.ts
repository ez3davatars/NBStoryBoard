import { describe, expect, it } from 'vitest';
import type { SceneTruthSnapshot, ShotPresetId } from '../../types/shots';
import { stripShotDirectiveContamination } from '../analysisSanitizers';
import { buildShotVariantPrompt } from '../promptHelpers';
import { SHOT_PRESETS } from '../shotsPresets';

const SCENE_TRUTH_FIXTURE: SceneTruthSnapshot = {
  sourceResultUrl: 'fixture://source-result',
  expectedActorCount: 2,
  actors: [],
  environment: {
    structuralCues: ['walls'],
    setDressingCues: ['table']
  },
  cameraConstraints: {
    allowOverhead: false,
    allowDutch: false,
    allowExtremeTopDown: false
  }
};

function buildVariantPrompt(presetId: ShotPresetId, subjectActionText?: string): string {
  return buildShotVariantPrompt({
    sourceResultUrl: 'fixture://source-result',
    sceneTruth: SCENE_TRUTH_FIXTURE,
    packId: 'coverage',
    presetId,
    locks: {
      identity: true,
      wardrobe: true,
      background: true,
      lighting: true
    },
    subjectActionText
  });
}

describe('stripShotDirectiveContamination', () => {
  it('removes shot directive clauses but preserves non-shot action clauses', () => {
    const input = 'Recompose as a cinematic close-up centered on the primary subject face and upper shoulders. Actor slams the folder on the desk.';
    expect(stripShotDirectiveContamination(input)).toBe('Actor slams the folder on the desk');
  });

  it('removes pure shot/camera directive text fully', () => {
    const input = 'Recompose as a cinematic wide shot showing the subject within the environment.';
    expect(stripShotDirectiveContamination(input)).toBe('');
  });
});

describe('buildShotVariantPrompt contamination guard', () => {
  it.each(['medium', 'wide'] as const)(
    'keeps preset injection authoritative and single for %s',
    (presetId) => {
      const contaminated = SHOT_PRESETS.closeup.shotInstruction;
      const prompt = buildVariantPrompt(presetId, contaminated);

      const presetBlockCount =
        (prompt.match(/### SHOTS PRESET BLOCK \(AUTHORITATIVE: APPLY EXACTLY ONCE\)/g) || [])
          .length;

      expect(presetBlockCount).toBe(1);
      expect(prompt).toContain(`- Framing Intent: ${SHOT_PRESETS[presetId].shotInstruction}`);
      expect(prompt).not.toContain(`- Scene Action context:`);
      expect(prompt).not.toContain(SHOT_PRESETS.closeup.shotInstruction);
    }
  );

  it('retains non-shot action context when mixed with shot directives', () => {
    const mixedText = `${SHOT_PRESETS.closeup.shotInstruction}. Actor slams the folder on the desk.`;
    const prompt = buildVariantPrompt('medium', mixedText);
    expect(prompt).toContain('- Scene Action context: Actor slams the folder on the desk');
    expect(prompt).not.toContain(SHOT_PRESETS.closeup.shotInstruction);
  });
});
