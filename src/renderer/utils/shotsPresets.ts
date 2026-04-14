import type { ShotPackId, ShotPresetId } from '../types/shots';

export type ShotFraming = 'closeup' | 'mediumClose' | 'medium' | 'wide' | 'full';
export type ShotTargetMode = 'scene' | 'single' | 'pair';
export type ShotElevation = 'high' | 'eye' | 'low';
export type ShotOrbit = 'front' | 'threeQuarterLeft' | 'threeQuarterRight' | 'profileLeft' | 'profileRight' | 'overShoulder';
export type ShotPlacement = 'center' | 'leftThird' | 'rightThird';
export type ShotLensClass = 'portrait' | 'normal' | 'mildWide';

export type ShotPresetDefinition = {
  id: ShotPresetId;
  label: string;
  description: string;
  shotInstruction: string;
  defaultLensNote: string;

  targetMode: ShotTargetMode;
  framing: ShotFraming;
  elevation: ShotElevation;
  orbit: ShotOrbit;
  placement: ShotPlacement;
  lensClass: ShotLensClass;

  cropRule: string;
  uniquenessKey: string;
  negatives: string[];
};

export const SHOT_PRESETS: Record<ShotPresetId, ShotPresetDefinition> = {
  closeup: {
    id: 'closeup',
    label: 'Close-Up',
    description: 'Tight facial framing with strong identity clarity.',
    shotInstruction: 'Recompose as a cinematic close-up centered on the primary subject’s face and upper shoulders.',
    defaultLensNote: 'Natural portrait perspective with clean facial proportions.',
    targetMode: 'single',
    framing: 'closeup',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'portrait',
    cropRule: 'Face and upper shoulders only. Do not drift into medium framing.',
    uniquenessKey: 'front_close_identity',
    negatives: [
      'Do not widen to medium shot',
      'Do not convert to three-quarter orbit',
      'Do not recenter as a full-scene shot',
      'Do not change actor count'
    ]
  },
  mediumClose: {
    id: 'mediumClose',
    label: 'Medium Close',
    description: 'Head-and-torso framing for dialogue and performance emphasis.',
    shotInstruction: 'Recompose as a cinematic medium close-up from approximately chest-up.',
    defaultLensNote: 'Natural perspective, no distortion.',
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'normal',
    cropRule: 'Head and torso, chest up. Tighter than medium but looser than closeup.',
    uniquenessKey: 'front_medclose',
    negatives: [
      'Do not widen to wide shot',
      'Do not crop strictly to the face',
      'Do not change actor count'
    ]
  },
  medium: {
    id: 'medium',
    label: 'Medium Shot',
    description: 'Balanced subject and environment relationship.',
    shotInstruction: 'Recompose as a cinematic medium shot preserving posture and environment context.',
    defaultLensNote: 'Balanced field of view.',
    targetMode: 'single',
    framing: 'medium',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'normal',
    cropRule: 'Waist-up or hip-up framing preserving actor gestures.',
    uniquenessKey: 'front_medium',
    negatives: [
      'Do not crop to face only',
      'Do not widen to full room view losing actor focus',
      'Do not change actor count'
    ]
  },
  wide: {
    id: 'wide',
    label: 'Wide Shot',
    description: 'Subject and environment coverage with scene context.',
    shotInstruction: 'Recompose as a cinematic wide shot showing the subject within the environment.',
    defaultLensNote: 'Wide framing without fisheye distortion.',
    targetMode: 'scene',
    framing: 'wide',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Preserve scene context. Do not collapse into portrait or medium crop.',
    uniquenessKey: 'scene_wide_master',
    negatives: [
      'Do not crop to head-and-torso',
      'Do not behave like a close-up',
      'Do not remove environmental context',
      'Do not change actor count'
    ]
  },
  lowAngleHero: {
    id: 'lowAngleHero',
    label: 'Low-Angle Hero',
    description: 'Subtle low-angle power framing.',
    shotInstruction: 'Recompose from a subtle low-angle hero perspective while preserving realism and proportions.',
    defaultLensNote: 'Cinematic low-angle perspective, no exaggerated warping.',
    targetMode: 'single',
    framing: 'medium',
    elevation: 'low',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Subtle up-angle. Subject placed slightly higher in frame.',
    uniquenessKey: 'front_low_power',
    negatives: [
      'Do not shoot from eye-level',
      'Do not exaggerate fisheye distortion',
      'Do not crop the head completely off'
    ]
  },
  highAngle: {
    id: 'highAngle',
    label: 'High-Angle',
    description: 'Subtle elevated viewpoint.',
    shotInstruction: 'Recompose from a subtle high-angle perspective while preserving realism and scene continuity.',
    defaultLensNote: 'Natural elevated perspective.',
    targetMode: 'scene',
    framing: 'wide',
    elevation: 'high',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Look down from elevated position. Subject placed slightly lower in frame.',
    uniquenessKey: 'scene_high_elevated',
    negatives: [
      'Do not shoot from ground level',
      'Do not crop into close-up',
      'Do not change actor count'
    ]
  },
  threeQuarterLeft: {
    id: 'threeQuarterLeft',
    label: '3/4 Left',
    description: 'Three-quarter framing from the left side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-left camera angle, preserving identity and continuity.',
    defaultLensNote: 'Natural perspective with clear facial consistency.',
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'threeQuarterLeft',
    placement: 'rightThird',
    lensClass: 'normal',
    cropRule: 'Camera from the left, subject typically favored on the right third looking left.',
    uniquenessKey: 'left_34_angle',
    negatives: [
      'Do not compose face-front',
      'Do not compose a pure profile',
      'Do not forget directional lighting changes based on rotation'
    ]
  },
  threeQuarterRight: {
    id: 'threeQuarterRight',
    label: '3/4 Right',
    description: 'Three-quarter framing from the right side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-right camera angle, preserving identity and continuity.',
    defaultLensNote: 'Natural perspective with clear facial consistency.',
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'threeQuarterRight',
    placement: 'leftThird',
    lensClass: 'normal',
    cropRule: 'Camera from the right, subject typically favored on the left third looking right.',
    uniquenessKey: 'right_34_angle',
    negatives: [
      'Do not compose face-front',
      'Do not compose a pure profile',
      'Do not forget directional lighting changes based on rotation'
    ]
  },
  profile: {
    id: 'profile',
    label: 'Profile Emphasis',
    description: 'Profile-oriented composition with side-view emphasis.',
    shotInstruction: 'Recompose with a strong profile emphasis while preserving subject identity and scene logic.',
    defaultLensNote: 'Natural side-view framing, no facial drift.',
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'profileLeft',
    placement: 'center',
    lensClass: 'portrait',
    cropRule: 'Strict 90-degree profile. No full frontal face.',
    uniquenessKey: 'side_profile_strict',
    negatives: [
      'Do not reveal both eyes',
      'Do not revert to 3/4 or front facing',
      'Do not change actor count'
    ]
  },
  overTheShoulder: {
    id: 'overTheShoulder',
    label: 'Over-the-Shoulder',
    description: 'Looking past a foreground subject to focus on the target.',
    shotInstruction: 'Recompose as an over-the-shoulder shot, placing one subject as a soft foreground shoulder/head wedge while keeping the target subject in focus. Preserve the same stylized render medium, same character world, and same non-photoreal visual treatment as the source image.',
    defaultLensNote: 'Cinematic depth of field, natural perspective.',
    targetMode: 'pair',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'overShoulder',
    placement: 'leftThird',
    lensClass: 'normal',
    cropRule: 'Foreground out of focus shoulder/head wedge, revealing target subject prominently.',
    uniquenessKey: 'pair_ots_depth',
    negatives: [
      'Do not omit the foreground subject completely',
      'Do not place both subjects in perfect equal focus',
      'Do not change total actor count',
      'Do not convert the image into live-action or photoreal cinema',
      'Do not make skin, lighting, or materials photographic',
      'Do not reinterpret the source as a real human film still'
    ]
  },
  twoShot: {
    id: 'twoShot',
    label: 'Two-Shot',
    description: 'Balanced framing containing two subjects.',
    shotInstruction: 'Recompose as a balanced two-shot highlighting the interaction between both subjects.',
    defaultLensNote: 'Mid-lens perspective, equitable framing.',
    targetMode: 'pair',
    framing: 'medium',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Wide enough to include both interacting subjects clearly.',
    uniquenessKey: 'pair_twoshot_balanced',
    negatives: [
      'Do not crop to a single subject',
      'Do not heavily obscure one subject with OTS blurring',
      'Do not place one subject extremely far in the background'
    ]
  }
};

// Dynamically inject exact pose lock negatives into all presets (Requested by Prompt Engineering)
Object.values(SHOT_PRESETS).forEach(preset => {
  preset.negatives.push('Do not alter the subject pose from the source anchor');
  preset.negatives.push('Do not add new clothing, accessories, or props not present in the source anchor');
  preset.negatives.push('Do not add any headwear if the source subject has no headwear');
  preset.negatives.push('Do not embellish the costume with extra layers or decorative items');
  preset.negatives.push('Do not invent jewelry, belts, wraps, shawls, capes, staffs, weapons, or handheld objects');

  if (preset.targetMode === 'pair' || preset.id === 'overTheShoulder') {
    preset.negatives.push('Do not change gesture timing or limb placement');
    preset.negatives.push('Do not re-stage the actors');
    preset.negatives.push('Do not transfer wardrobe pieces or props between actors');
  }
});

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
