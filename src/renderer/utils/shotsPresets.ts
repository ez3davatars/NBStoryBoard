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
  opticalIntent: string;
  uniquenessKey: string;
  negatives: string[];
};

export const SHOT_PRESETS: Record<ShotPresetId, ShotPresetDefinition> = {
  closeup: {
    id: 'closeup',
    label: 'Close-Up',
    description: 'Tight facial framing with strong identity clarity.',
    shotInstruction: 'Recompose as a cinematic close-up centered on the primary subject\'s face and upper shoulders while preserving the same performance moment (no re-posed portrait behavior). Prefer to keep forearms/hands out of frame in this preset.',
    defaultLensNote: 'Natural portrait perspective with clean facial proportions.',
    targetMode: 'single',
    framing: 'closeup',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'portrait',
    cropRule: 'Face and upper shoulders dominant. Crop before elbows/wrists where possible to avoid edge-limb artifacts. Do not drift into medium/full-body framing.',
    opticalIntent: 'Extremely shallow depth of field. Background should be heavily blurred/bokeh. High focal compression drawing maximum attention to facial features and eyes.',
    uniquenessKey: 'front_close_identity',
    negatives: [
      'Do not widen to medium-close or medium shot',
      'Do not convert to three-quarter orbit',
      'Do not recenter as a full-scene shot',
      'Do not show cropped fists or partial hands at frame edges',
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
    opticalIntent: 'Shallow depth of field with soft background blur. Ensure the subject clearly pops from the environment without dissolving background shapes completely.',
    uniquenessKey: 'front_medclose',
    negatives: [
      'Do not widen to medium or wide shot',
      'Do not crop strictly to the face (do not behave like a close-up)',
      'Do not drift to waist-up medium',
      'Do not change actor count'
    ]
  },
  medium: {
    id: 'medium',
    label: 'Medium Shot',
    description: 'Balanced subject and environment relationship.',
    shotInstruction: 'Recompose as a cinematic medium shot preserving posture while showing a balanced subject-to-environment relationship.',
    defaultLensNote: 'Balanced field of view.',
    targetMode: 'single',
    framing: 'medium',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'normal',
    cropRule: 'Waist-up or hip-up framing. Must be clearly wider than mediumClose and clearly tighter than wide.',
    opticalIntent: 'Moderate depth of field. Background is readable but slightly out of focus, allowing structural context while favoring the subject.',
    uniquenessKey: 'front_medium',
    negatives: [
      'Do not crop to face only or medium-close',
      'Do not widen to full room view losing actor focus',
      'Do not behave like a wide/master',
      'Do not change actor count'
    ]
  },
  wide: {
    id: 'wide',
    label: 'Wide Shot',
    description: 'Subject and environment coverage with scene context.',
    shotInstruction: 'Recompose as a cinematic wide shot where environment context is a major part of the frame.',
    defaultLensNote: 'Wide framing without fisheye distortion.',
    targetMode: 'scene',
    framing: 'wide',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Environment-forward framing with substantial architecture visible. Do not collapse into portrait/medium crop.',
    opticalIntent: 'Deep focus (large depth of field). Background and environment should be sharp and readable. Minimal lens compression.',
    uniquenessKey: 'scene_wide_master',
    negatives: [
      'Do not crop to medium or medium-close',
      'Do not behave like a close-up',
      'Do not remove environmental context',
      'Do not change actor count'
    ]
  },
  lowAngleHero: {
    id: 'lowAngleHero',
    label: 'Low-Angle Hero',
    description: 'Subtle low-angle power framing.',
    shotInstruction: 'Recompose from a clear low-angle hero perspective (camera physically below subject chest level) while preserving realism and proportions.',
    defaultLensNote: 'Cinematic low-angle perspective, no exaggerated warping.',
    targetMode: 'single',
    framing: 'medium',
    elevation: 'low',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Subtle up-angle. Subject placed slightly higher in frame.',
    opticalIntent: 'Clear focal separation drawing the eye to the subject, but preserving strong perspective lines from the ground pushing upwards.',
    uniquenessKey: 'front_low_power',
    negatives: [
      'Do not shoot from eye-level',
      'Do not exaggerate fisheye distortion',
      'Do not crop the head completely off',
      'Do not flatten into neutral coverage'
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
    opticalIntent: 'Deep focus pushing down into the floor. Foreground structural elements (desks, ground) should feel grounded with readable depth.',
    uniquenessKey: 'scene_high_elevated',
    negatives: [
      'Do not shoot from ground level or eye-level',
      'Do not crop into close-up',
      'Do not collapse into neutral coverage',
      'Do not change actor count'
    ]
  },
  threeQuarterLeft: {
    id: 'threeQuarterLeft',
    label: '3/4 Left',
    description: 'Three-quarter framing from the left side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-left camera angle, preserving identity and continuity. Perform a true camera orbit revealing the correct new asymmetrical background space; do NOT just rotate the subject in place.',
    defaultLensNote: 'Natural perspective with clear facial consistency.',
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'threeQuarterLeft',
    placement: 'rightThird',
    lensClass: 'normal',
    cropRule: 'Camera from the left, subject typically favored on the right third looking left.',
    opticalIntent: 'Soft depth of field focusing on the near-plane of the face. Far shoulder/background should softly fall off in focus.',
    uniquenessKey: 'left_34_angle',
    negatives: [
      'Do not drift to frontal or face-front',
      'Do not drift to pure profile',
      'Do not forget directional lighting changes based on rotation',
      'Do not preserve frontal symmetry from the anchor',
      'Do not keep both side columns or walls revealed in the same balanced way as the source',
      'Do not fake a camera move by just rotating the subject in place'
    ]
  },
  threeQuarterRight: {
    id: 'threeQuarterRight',
    label: '3/4 Right',
    description: 'Three-quarter framing from the right side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-right camera angle, preserving identity and continuity. Perform a true camera orbit revealing the correct new asymmetrical background space; do NOT just rotate the subject in place.',
    defaultLensNote: 'Natural perspective with clear facial consistency.',
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'threeQuarterRight',
    placement: 'leftThird',
    lensClass: 'normal',
    cropRule: 'Camera from the right, subject typically favored on the left third looking right.',
    opticalIntent: 'Soft depth of field focusing on the near-plane of the face. Far shoulder/background should softly fall off in focus.',
    uniquenessKey: 'right_34_angle',
    negatives: [
      'Do not drift to frontal or face-front',
      'Do not drift to pure profile',
      'Do not forget directional lighting changes based on rotation',
      'Do not preserve frontal symmetry from the anchor',
      'Do not keep both side columns or walls revealed in the same balanced way as the source',
      'Do not fake a camera move by just rotating the subject in place'
    ]
  },
  profile: {
    id: 'profile',
    label: 'Profile Emphasis',
    description: 'Profile-oriented composition with tight side-view silhouette emphasis.',
    shotInstruction: 'Recompose with a strong profile silhouette while preserving subject identity and scene logic. Perform a true camera orbit revealing the correct new asymmetrical background space; do NOT just rotate the subject in place.',
    defaultLensNote: 'Natural side-view framing, no facial drift.',
    targetMode: 'single',
    framing: 'closeup',
    elevation: 'eye',
    orbit: 'profileLeft',
    placement: 'center',
    lensClass: 'portrait',
    cropRule: 'Extremely tight crop. Shoulders and head only. NO full body context. Strict 90-degree profile. Focus purely on one-eye side silhouette.',
    opticalIntent: 'Strong background blur to perfectly silhouette and separate the harsh profile line from the environment.',
    uniquenessKey: 'side_profile_strict',
    negatives: [
      'Do not reveal both eyes',
      'Do not revert to three-quarter or near-frontal facing',
      'Do not drift to 3/4',
      'Do not change actor count',
      'Do not preserve frontal symmetry from the anchor',
      'Do not keep both side columns or walls revealed in the same balanced way as the source',
      'Do not fake a camera move by just rotating the subject in place',
      'Do not show the opposite side of the body',
      'Do not render as wide or full-body coverage'
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
    opticalIntent: 'Extreme depth stratification: foreground shoulder must be heavily blurred (bokeh), target subject perfectly sharp, and background softly blurred.',
    uniquenessKey: 'pair_ots_depth',
    negatives: [
      'Do not omit the foreground shoulder layer',
      'Do not place both subjects in perfect equal focus',
      'Do not behave like a standard single coverage shot',
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
    opticalIntent: 'Split diopter or sufficient depth of field to keep both subjects sharp and clearly readable, while the background remains softly separated.',
    uniquenessKey: 'pair_twoshot_balanced',
    negatives: [
      'Do not isolate only one subject',
      'Do not heavily obscure one subject with OTS blurring',
      'Do not place one subject extremely far in the background',
      'Do not behave like a single coverage shot'
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

export const getDefaultCameraFlavorForPreset = (presetId: ShotPresetId): import('../types/shots').CameraFlavor => {
  switch (presetId) {
    case 'closeup':
      return 'intimate';
    default:
      return 'neutral';
  }
};

export const getDefaultShotNotesForPreset = (presetId: ShotPresetId): string | undefined => {
  switch (presetId) {
    case 'closeup':
      return 'Tight face-dominant framing. Fill the frame with the subject and avoid reading as a medium-close shot.';
    case 'mediumClose':
      return 'Frame from roughly chest-to-head. Keep it clearly wider than a close-up and tighter than a medium shot.';
    case 'medium':
      return 'Frame from roughly waist-up. Do not crop so tight that it resembles a medium-close shot.';
    case 'wide':
      return 'Play as a true master/wide shot. Hold meaningful environment and spatial context around the subject.';
    case 'lowAngleHero':
      return 'Use a clearly low camera height looking upward. Do not render as neutral eye-level framing.';
    case 'highAngle':
      return 'Use a clearly elevated camera looking downward. Do not render as neutral eye-level framing.';
    case 'threeQuarterLeft':
      return 'Favor a left three-quarter view with the subject presented from the left-oblique side, not frontal.';
    case 'threeQuarterRight':
      return 'Favor a right three-quarter view with the subject presented from the right-oblique side, not frontal.';
    case 'profile':
      return 'Render as a strong side profile. Avoid slipping back toward a frontal or three-quarter view.';
    case 'overTheShoulder':
      return 'Compose as a true over-the-shoulder shot with a readable foreground shoulder framing the target.';
    case 'twoShot':
      return 'Compose both primary subjects clearly in frame as a balanced shared-coverage two-shot.';
    default:
      return undefined;
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
