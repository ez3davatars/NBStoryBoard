import type { Veo31Spec } from './types';
import { buildNegatives } from './negatives';
import { buildContinuityLockBlock } from '../utils/promptHelpers';

export interface BuiltPrompt {
  prompt: string;
  negatives: string;
  debug: any;
}

export type VeoPromptOptions = {
  continuityLock?: boolean;
  noExtraObjects?: boolean;
  noMorph?: boolean;
  lockEnvironment?: boolean;
  lockLighting?: boolean;
  lockLens?: boolean;
  lockStyle?: boolean;
};

const safeJoin = (val: any): string => {
  if (Array.isArray(val)) return val.filter(Boolean).join(', ');
  if (typeof val === 'string') return val;
  return '';
};

export function buildVeo31Prompt(spec: Veo31Spec, opts: VeoPromptOptions = {}): BuiltPrompt {
  const character: any = (spec as any).character ?? {};
  const style: any = (spec as any).style ?? {};
  const environment: any = (spec as any).environment ?? {};
  const motion: any = (spec as any).motion ?? {};

  const identityLocks: string[] = Array.isArray(character.lockedTraits)
    ? character.lockedTraits
    : [];

  const continuityOn = opts.continuityLock !== false; // default ON

  const continuityBlock = continuityOn
    ? buildContinuityLockBlock({
        identityLocks,
        lockEnvironment: opts.lockEnvironment ?? true,
        lockLighting: opts.lockLighting ?? true,
        lockLens: opts.lockLens ?? true,
        lockStyle: opts.lockStyle ?? true,
        noExtraObjects: opts.noExtraObjects ?? true,
        noMorph: opts.noMorph ?? true,
      })
    : '';

  const charBlock = [
    'CHARACTER BIBLE:',
    `- Identity: ${safeJoin(character.identity) || 'Match the reference character exactly.'}`,
    `- Wardrobe: ${safeJoin(character.wardrobe) || 'Maintain wardrobe continuity.'}`,
    character.emotionalState ? `- Emotional State: ${safeJoin(character.emotionalState)}` : '',
    identityLocks.length ? `- Locked Traits: ${safeJoin(identityLocks)}` : '',
  ].filter(Boolean).join('\n');

  const styleBlock = [
    'STYLE BIBLE:',
    style.visualStyle ? `- Visual Style: ${safeJoin(style.visualStyle)}` : '- Visual Style: Cinematic, high fidelity.',
    style.lighting ? `- Lighting: ${safeJoin(style.lighting)}` : '',
    style.colorPalette ? `- Color Palette: ${safeJoin(style.colorPalette)}` : '',
    style.lensLanguage ? `- Lens Language: ${safeJoin(style.lensLanguage)}` : '',
  ].filter(Boolean).join('\n');

  const envBlock = [
    'ENVIRONMENT BIBLE:',
    environment.setting ? `- Setting: ${safeJoin(environment.setting)}` : '- Setting: Match the reference environment.',
    environment.weatherTime ? `- Weather/Time: ${safeJoin(environment.weatherTime)}` : '',
    environment.props ? `- Key Props: ${safeJoin(environment.props)}` : '',
    environment.lockedElements ? `- Locked Elements: ${safeJoin(environment.lockedElements)}` : '',
  ].filter(Boolean).join('\n');

  const motionBlock = [
    'MOTION DELTA:',
    motion.cameraMovement ? `- Camera: ${safeJoin(motion.cameraMovement)}` : '- Camera: Smooth, realistic.',
    motion.characterAction ? `- Character Action: ${safeJoin(motion.characterAction)}` : '',
  ].filter(Boolean).join('\n');

  const frame1Block = (spec as any).frame1Description
    ? `FRAME 1 DESCRIPTION:\n${safeJoin((spec as any).frame1Description)}`
    : '';
  const frame2Block = (spec as any).frame2Description
    ? `FRAME 2 DESCRIPTION:\n${safeJoin((spec as any).frame2Description)}`
    : '';

  const fullPromptParts = [
    'VEO 3.1 DIRECTOR SPEC (STRICT):',
    continuityBlock,
    charBlock,
    envBlock,
    styleBlock,
    motionBlock,
    frame1Block,
    frame2Block,
    'OUTPUT: Generate a coherent video that matches the bibles above. Obey continuity locks.',
  ].filter(Boolean);

  const fullPrompt = fullPromptParts.join('\n\n');
  const negatives = buildNegatives(spec as any).join(', ');

  return {
    prompt: fullPrompt,
    negatives,
    debug: { spec, opts, continuityOn }
  };
}
