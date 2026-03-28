import type { ShotPackId, ShotPresetId } from '../types/shots';

export type ShotPresetDefinition = {
  id: ShotPresetId;
  label: string;
  description: string;
  shotInstruction: string;
  defaultLensNote: string;
};

export const SHOT_PRESETS: Record<ShotPresetId, ShotPresetDefinition> = {
  closeup: {
    id: 'closeup',
    label: 'Close-Up',
    description: 'Tight facial framing with strong identity clarity.',
    shotInstruction: 'Recompose as a cinematic close-up centered on the subject’s face and upper shoulders.',
    defaultLensNote: 'Natural portrait perspective with clean facial proportions.'
  },
  mediumClose: {
    id: 'mediumClose',
    label: 'Medium Close',
    description: 'Head-and-torso framing for dialogue and performance emphasis.',
    shotInstruction: 'Recompose as a cinematic medium close-up from approximately chest-up.',
    defaultLensNote: 'Natural perspective, no distortion.'
  },
  medium: {
    id: 'medium',
    label: 'Medium Shot',
    description: 'Balanced subject and environment relationship.',
    shotInstruction: 'Recompose as a cinematic medium shot preserving posture and environment context.',
    defaultLensNote: 'Balanced field of view.'
  },
  wide: {
    id: 'wide',
    label: 'Wide Shot',
    description: 'Subject and environment coverage with scene context.',
    shotInstruction: 'Recompose as a cinematic wide shot showing more of the surrounding environment.',
    defaultLensNote: 'Wide framing without fisheye distortion.'
  },
  lowAngleHero: {
    id: 'lowAngleHero',
    label: 'Low-Angle Hero',
    description: 'Subtle low-angle power framing.',
    shotInstruction: 'Recompose from a subtle low-angle hero perspective while preserving realism and proportions.',
    defaultLensNote: 'Cinematic low-angle perspective, no exaggerated warping.'
  },
  highAngle: {
    id: 'highAngle',
    label: 'High-Angle',
    description: 'Subtle elevated viewpoint.',
    shotInstruction: 'Recompose from a subtle high-angle perspective while preserving realism and scene continuity.',
    defaultLensNote: 'Natural elevated perspective.'
  },
  threeQuarterLeft: {
    id: 'threeQuarterLeft',
    label: '3/4 Left',
    description: 'Three-quarter framing from the left side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-left camera angle, preserving identity and continuity.',
    defaultLensNote: 'Natural perspective with clear facial consistency.'
  },
  threeQuarterRight: {
    id: 'threeQuarterRight',
    label: '3/4 Right',
    description: 'Three-quarter framing from the right side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-right camera angle, preserving identity and continuity.',
    defaultLensNote: 'Natural perspective with clear facial consistency.'
  },
  profile: {
    id: 'profile',
    label: 'Profile Emphasis',
    description: 'Profile-oriented composition with side-view emphasis.',
    shotInstruction: 'Recompose with a strong profile emphasis while preserving subject identity and scene logic.',
    defaultLensNote: 'Natural side-view framing, no facial drift.'
  }
};

export function buildShotPresetIdsForPack(packId: ShotPackId, count: 4 | 6 | 9): ShotPresetId[] {
  if (packId === 'cinematic') {
    if (count === 4) return ['closeup', 'medium', 'wide', 'lowAngleHero'];
    if (count === 6) return ['closeup', 'mediumClose', 'medium', 'wide', 'lowAngleHero', 'highAngle'];
    return ['closeup', 'mediumClose', 'medium', 'wide', 'lowAngleHero', 'highAngle', 'threeQuarterLeft', 'threeQuarterRight', 'profile'];
  }
  
  if (packId === 'portrait') {
    if (count === 4) return ['closeup', 'mediumClose', 'threeQuarterLeft', 'threeQuarterRight'];
    if (count === 6) return ['closeup', 'mediumClose', 'threeQuarterLeft', 'threeQuarterRight', 'profile', 'medium'];
    return ['closeup', 'mediumClose', 'threeQuarterLeft', 'threeQuarterRight', 'profile', 'medium', 'highAngle', 'lowAngleHero', 'wide'];
  }
  
  if (packId === 'coverage') {
    if (count === 4) return ['closeup', 'mediumClose', 'medium', 'wide'];
    if (count === 6) return ['closeup', 'mediumClose', 'medium', 'wide', 'highAngle', 'lowAngleHero'];
    return ['closeup', 'mediumClose', 'medium', 'wide', 'highAngle', 'lowAngleHero', 'threeQuarterLeft', 'threeQuarterRight', 'profile'];
  }
  
  return ['closeup', 'medium', 'wide', 'profile'].slice(0, count) as ShotPresetId[];
}
