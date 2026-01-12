import type { Veo31Spec } from './types';
import { buildNegatives } from './negatives';

export interface BuiltPrompt {
  prompt: string;
  negatives: string;
  debug: any;
}

export function buildVeo31Prompt(spec: Veo31Spec): BuiltPrompt {
  const safeJoin = (val: any) => {
      if (Array.isArray(val)) return val.join(", ");
      if (typeof val === 'string') return val;
      return "";
  };

  // 1. Construct SHARED VISUAL DNA (LOCKED)
  const dnaBlock = [
    "**1. SHARED VISUAL DNA (LOCKED):**",
    `*   **Identity:** ${spec.character.identity}. ${spec.character.wardrobe}.`,
    `*   **Locked Traits:** ${safeJoin(spec.character.lockedTraits)}.`,
    `*   **Environment:** ${spec.environment.setting}. Props: ${safeJoin(spec.environment.props)}.`,
    `*   **Locked Elements:** ${safeJoin(spec.environment.lockedElements)}.`,
    `*   **Style:** ${spec.style.visualStyle}, ${spec.style.lighting}, ${spec.style.colorPalette}, ${spec.style.lensLanguage}.`
  ].join("\n");

  // 2. Construct MOTION DELTA
  // This section explicitly describes what IS changing to contrast with what is locked.
  const motionBlock = [
    "**2. MOTION DELTA (DYNAMIC):**",
    `*   **Camera:** ${spec.motion.cameraMovement}`,
    `*   **Action:** ${spec.motion.characterAction}`
  ].join("\n");

  // 3. Frame Layouts
  const frame1Block = `**Frame 1:** ${spec.frame1Description}`;
  const frame2Block = `**Frame 2:** ${spec.frame2Description}`;

  // 4. Assembly
  const fullPromptParts = [
    "[VEO 3.1 TEMPORAL INTERPOLATION]",
    dnaBlock,
    motionBlock,
    frame1Block,
    frame2Block,
    "GENERATE VEO VIDEO."
  ];

  const fullPrompt = fullPromptParts.join("\n\n");
  const negatives = buildNegatives(spec).join(", ");

  return {
    prompt: fullPrompt,
    negatives: negatives,
    debug: { spec }
  };
}
