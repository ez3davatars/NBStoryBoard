import type { ShotPackId, ShotPresetId } from '../types/shots';

export type ShotFraming = 'closeup' | 'mediumClose' | 'medium' | 'wide' | 'full';
export type ShotTargetMode = 'scene' | 'single' | 'pair';
export type ShotElevation = 'high' | 'eye' | 'low';
export type ShotOrbit = 'front' | 'threeQuarterLeft' | 'threeQuarterRight' | 'profileLeft' | 'profileRight' | 'overShoulder';
export type ShotPlacement = 'center' | 'leftThird' | 'rightThird';
export type ShotLensClass = 'portrait' | 'normal' | 'mildWide';

export type ShotOpticalIntent = {
  focalFeel: string;
  compressionBehavior: string;
  depthOfFieldBehavior: string;
  separationStyle: string;
};

export type ShotPresetDefinition = {
  id: ShotPresetId;
  label: string;
  description: string;
  shotInstruction: string;
  defaultLensNote: string;
  opticalIntent: ShotOpticalIntent;

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
    shotInstruction: 'Recompose as a true cinematic close-up: the primary subject face and upper shoulders dominate the frame, with eyes/face as the clear focal center.',
    defaultLensNote: 'Portrait lens feel with clean facial proportions and no wide-angle face distortion.',
    opticalIntent: {
      focalFeel: 'Portrait-leaning focal feel with intimate field of view.',
      compressionBehavior: 'Mild flattering compression; avoid face widening.',
      depthOfFieldBehavior: 'Very shallow depth of field with strong rear falloff.',
      separationStyle: 'Subject isolated from background with soft bokeh rolloff.'
    },
    targetMode: 'single',
    framing: 'closeup',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'portrait',
    cropRule: 'Face and upper shoulders only. Crop below the shoulders at most; no waist, hips, legs, or full body.',
    uniquenessKey: 'front_close_identity',
    negatives: [
      'Do not widen to medium shot',
      'Do not show full torso, waist, legs, or feet',
      'Do not convert to three-quarter orbit',
      'Do not recenter as a full-scene shot',
      'Do not change actor count'
    ]
  },
  mediumClose: {
    id: 'mediumClose',
    label: 'Medium Close',
    description: 'Head-and-torso framing for dialogue and performance emphasis.',
    shotInstruction: 'Recompose as a true cinematic medium close-up from approximately chest-up, keeping expression, shoulders, and upper-torso performance readable.',
    defaultLensNote: 'Natural perspective, no distortion.',
    opticalIntent: {
      focalFeel: 'Neutral-to-portrait focal feel that protects facial identity.',
      compressionBehavior: 'Balanced compression with stable proportions.',
      depthOfFieldBehavior: 'Soft depth of field with readable environment cues.',
      separationStyle: 'Clear subject prominence without fully collapsing background detail.'
    },
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'normal',
    cropRule: 'Chest-up framing. Include head, shoulders, and upper torso; do not drift into face-only close-up or waist-up medium.',
    uniquenessKey: 'front_medclose',
    negatives: [
      'Do not widen to wide shot',
      'Do not crop strictly to the face',
      'Do not show full body or large empty environment',
      'Do not change actor count'
    ]
  },
  medium: {
    id: 'medium',
    label: 'Medium Shot',
    description: 'Balanced subject and environment relationship.',
    shotInstruction: 'Recompose as a true cinematic medium shot: waist-up or hip-up framing that preserves posture, gestures, and surrounding scene context.',
    defaultLensNote: 'Balanced field of view.',
    opticalIntent: {
      focalFeel: 'Neutral focal feel balancing actor and scene context.',
      compressionBehavior: 'Natural perspective with moderate depth continuity.',
      depthOfFieldBehavior: 'Moderate depth of field; both actor and set remain legible.',
      separationStyle: 'Subject remains focal, but scene geometry stays readable.'
    },
    targetMode: 'single',
    framing: 'medium',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'normal',
    cropRule: 'Waist-up or hip-up framing preserving actor gestures. Do not crop to face-only and do not pull back to a wide master.',
    uniquenessKey: 'front_medium',
    negatives: [
      'Do not crop to face only',
      'Do not widen to full room view losing actor focus',
      'Do not show the subject as a tiny figure in the environment',
      'Do not change actor count'
    ]
  },
  wide: {
    id: 'wide',
    label: 'Wide Shot',
    description: 'Subject and environment coverage with scene context.',
    shotInstruction: 'Recompose as a true cinematic wide shot: show the subject(s) inside the environment with clear scene geography, foreground/midground/background depth, and readable scale.',
    defaultLensNote: 'Wide framing without fisheye distortion.',
    opticalIntent: {
      focalFeel: 'Mild wide focal feel emphasizing spatial context.',
      compressionBehavior: 'Low compression with clear depth expansion.',
      depthOfFieldBehavior: 'Deeper depth of field so architecture and extras read clearly.',
      separationStyle: 'Foreground, midground, and background planes all remain distinguishable.'
    },
    targetMode: 'scene',
    framing: 'wide',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Preserve broad scene context. Subject(s) should not dominate the frame like a portrait or medium crop.',
    uniquenessKey: 'scene_wide_master',
    negatives: [
      'Do not crop to head-and-torso',
      'Do not behave like a close-up',
      'Do not remove environmental context',
      'Do not blur or crop away the geography needed to read the scene',
      'Do not change actor count'
    ]
  },
  lowAngleHero: {
    id: 'lowAngleHero',
    label: 'Low-Angle Hero',
    description: 'Clear upward camera placement with heroic scale.',
    shotInstruction: 'Recompose from a clear low-angle hero perspective: the camera is below the subject and looks upward, making the subject read taller and more dominant while preserving realism.',
    defaultLensNote: 'Cinematic low-angle perspective, no exaggerated warping.',
    opticalIntent: {
      focalFeel: 'Slightly wider heroic perspective without distortion.',
      compressionBehavior: 'Keep perspective cues honest; no artificial flattening.',
      depthOfFieldBehavior: 'Moderate depth with foreground-to-subject depth read.',
      separationStyle: 'Subject dominance comes from camera position, not synthetic blur alone.'
    },
    targetMode: 'single',
    framing: 'medium',
    elevation: 'low',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Low camera looking up. Subject sits slightly higher in frame with upward perspective cues; do not render from eye-level.',
    uniquenessKey: 'front_low_power',
    negatives: [
      'Do not shoot from eye-level',
      'Do not show top-down floor/ground dominance',
      'Do not exaggerate fisheye distortion',
      'Do not crop the head completely off'
    ]
  },
  highAngle: {
    id: 'highAngle',
    label: 'High-Angle',
    description: 'Elevated viewpoint looking down into the scene.',
    shotInstruction: 'Recompose from a clear high-angle perspective: the camera is physically above the subjects and looks downward into the scene while preserving continuity.',
    defaultLensNote: 'Natural elevated perspective.',
    opticalIntent: {
      focalFeel: 'Mildly wide overhead-leaning perspective without extreme top-down.',
      compressionBehavior: 'Natural perspective depth with visible floor and plane changes.',
      depthOfFieldBehavior: 'Moderate-to-deeper depth preserving layout readability.',
      separationStyle: 'Subject remains readable while environmental planes gain clarity.'
    },
    targetMode: 'scene',
    framing: 'wide',
    elevation: 'high',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Look down from an elevated position. Show floor/ground/top surfaces and place subject slightly lower in frame; do not render as eye-level.',
    uniquenessKey: 'scene_high_elevated',
    negatives: [
      'Do not shoot from ground level',
      'Do not shoot from eye level',
      'Do not use low-angle upward perspective',
      'Do not crop into close-up',
      'Do not change actor count'
    ]
  },
  threeQuarterLeft: {
    id: 'threeQuarterLeft',
    label: '3/4 Left',
    description: 'Three-quarter framing from the left side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-left camera angle: move the camera to the subject/scene left by roughly 35-55 degrees so side planes and parallax visibly change.',
    defaultLensNote: 'Natural perspective with clear facial consistency.',
    opticalIntent: {
      focalFeel: 'Normal lens feel suited for profile-adjacent facial geometry.',
      compressionBehavior: 'Moderate compression that preserves nose-cheek-jaw depth cues.',
      depthOfFieldBehavior: 'Soft background falloff with side-plane readability.',
      separationStyle: 'Subject separated while preserving side-of-face depth structure.'
    },
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'threeQuarterLeft',
    placement: 'rightThird',
    lensClass: 'normal',
    cropRule: 'Camera from the left, subject typically favored on the right third looking left. Must not read as straight-on front view.',
    uniquenessKey: 'left_34_angle',
    negatives: [
      'Do not compose face-front',
      'Do not compose a pure profile',
      'Do not keep the same background alignment as the source anchor',
      'Do not forget directional lighting changes based on rotation'
    ]
  },
  threeQuarterRight: {
    id: 'threeQuarterRight',
    label: '3/4 Right',
    description: 'Three-quarter framing from the right side.',
    shotInstruction: 'Recompose as a cinematic three-quarter-right camera angle: move the camera to the subject/scene right by roughly 35-55 degrees so side planes and parallax visibly change.',
    defaultLensNote: 'Natural perspective with clear facial consistency.',
    opticalIntent: {
      focalFeel: 'Normal lens feel suited for profile-adjacent facial geometry.',
      compressionBehavior: 'Moderate compression that preserves nose-cheek-jaw depth cues.',
      depthOfFieldBehavior: 'Soft background falloff with side-plane readability.',
      separationStyle: 'Subject separated while preserving side-of-face depth structure.'
    },
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'threeQuarterRight',
    placement: 'leftThird',
    lensClass: 'normal',
    cropRule: 'Camera from the right, subject typically favored on the left third looking right. Must not read as straight-on front view.',
    uniquenessKey: 'right_34_angle',
    negatives: [
      'Do not compose face-front',
      'Do not compose a pure profile',
      'Do not keep the same background alignment as the source anchor',
      'Do not forget directional lighting changes based on rotation'
    ]
  },
  profile: {
    id: 'profile',
    label: 'Profile Emphasis',
    description: 'Profile-oriented composition with side-view emphasis.',
    shotInstruction: 'Recompose as a strict side-profile emphasis: camera is roughly 90 degrees from the subject front, prioritizing silhouette and side-contour readability.',
    defaultLensNote: 'Natural side-view framing, no facial drift.',
    opticalIntent: {
      focalFeel: 'Portrait-to-normal side-view focal feel.',
      compressionBehavior: 'Subtle compression preserving silhouette purity.',
      depthOfFieldBehavior: 'Background softened enough to protect profile edge readability.',
      separationStyle: 'Subject contour separation is prioritized over frontal facial detail.'
    },
    targetMode: 'single',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'profileLeft',
    placement: 'center',
    lensClass: 'portrait',
    cropRule: 'Strict 90-degree profile. One-eye/side silhouette read; no full frontal face and no soft 3/4 compromise.',
    uniquenessKey: 'side_profile_strict',
    negatives: [
      'Do not reveal both eyes',
      'Do not revert to 3/4 or front facing',
      'Do not show a centered portrait crop',
      'Do not change actor count'
    ]
  },
  overTheShoulder: {
    id: 'overTheShoulder',
    label: 'Over-the-Shoulder',
    description: 'Looking past a foreground subject to focus on the target.',
    shotInstruction: 'Recompose as a true over-the-shoulder shot: one subject becomes a close, soft foreground shoulder/head wedge while the target subject is clearly visible and in focus beyond them. Preserve the same stylized render medium, same character world, and same non-photoreal visual treatment as the source image.',
    defaultLensNote: 'Cinematic depth of field, natural perspective.',
    opticalIntent: {
      focalFeel: 'Normal cinematic focal feel with pronounced near-to-far plane contrast.',
      compressionBehavior: 'Moderate compression retaining foreground wedge volume.',
      depthOfFieldBehavior: 'Foreground wedge softened, target subject remains in focal plane.',
      separationStyle: 'Layered foreground-background separation defines shot identity.'
    },
    targetMode: 'pair',
    framing: 'mediumClose',
    elevation: 'eye',
    orbit: 'overShoulder',
    placement: 'leftThird',
    lensClass: 'normal',
    cropRule: 'Foreground out-of-focus shoulder/head wedge must visibly frame the shot, revealing the target subject prominently beyond it.',
    uniquenessKey: 'pair_ots_depth',
    negatives: [
      'Do not omit the foreground subject completely',
      'Do not make the foreground subject tiny or equally distant',
      'Do not place both subjects in perfect equal focus',
      'Do not convert OTS into a balanced two-shot',
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
    shotInstruction: 'Recompose as a balanced two-shot: both subjects are visible in the same frame with their relationship, scale, and interaction clearly readable.',
    defaultLensNote: 'Mid-lens perspective, equitable framing.',
    opticalIntent: {
      focalFeel: 'Neutral cinematic focal feel that keeps both actors legible.',
      compressionBehavior: 'Balanced compression so neither actor appears unnaturally flattened.',
      depthOfFieldBehavior: 'Moderate depth to keep both actors readable in shared focus space.',
      separationStyle: 'Foreground/background separation supports interaction, not isolation.'
    },
    targetMode: 'pair',
    framing: 'medium',
    elevation: 'eye',
    orbit: 'front',
    placement: 'center',
    lensClass: 'mildWide',
    cropRule: 'Wide enough to include both interacting subjects clearly, but not so wide that their relationship becomes unreadable.',
    uniquenessKey: 'pair_twoshot_balanced',
    negatives: [
      'Do not crop to a single subject',
      'Do not heavily obscure one subject with OTS blurring',
      'Do not place one subject extremely far in the background',
      'Do not convert this into a close-up or solo portrait'
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
