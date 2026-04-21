import type { Veo31Spec } from './types';
import { buildNegatives } from './negatives';
import { buildContinuityLockBlock } from '../utils/promptHelpers';
import type { VeoFivePartDraft } from './veoFivePart';

type PromptDraftOverrides = Partial<VeoFivePartDraft> & { concept?: string };

type BuiltPromptDebug = {
  spec: Veo31Spec;
  opts: VeoPromptOptions;
  continuityOn: boolean;
};

export interface BuiltPrompt {
  prompt: string;
  negatives: string;
  debug: BuiltPromptDebug;
}

export type VeoPromptOptions = {
  continuityLock?: boolean;
  noExtraObjects?: boolean;
  noMorph?: boolean;
  lockEnvironment?: boolean;
  lockLighting?: boolean;
  lockLens?: boolean;
  lockStyle?: boolean;
  injectPromptDraft?: PromptDraftOverrides;
};

const safeJoin = (val: unknown): string => {
  if (Array.isArray(val)) return val.filter(Boolean).join(', ');
  if (typeof val === 'string') return val;
  return '';
};

export function buildVeo31Prompt(spec: Veo31Spec, opts: VeoPromptOptions = {}): BuiltPrompt {
  const character = spec.character ?? {};
  const style = spec.style ?? {};
  const environment = spec.environment ?? {};
  const motion = spec.motion ?? {};

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

  const frame1Block = spec.frame1Description
    ? `FRAME 1 DESCRIPTION:\n${safeJoin(spec.frame1Description)}`
    : '';
  const frame2Block = spec.frame2Description
    ? `FRAME 2 DESCRIPTION:\n${safeJoin(spec.frame2Description)}`
    : '';

  // INJECT USER'S HANDWRITTEN OVERRIDES (if available)
  const userOverrideParts: string[] = [];
  if (opts.injectPromptDraft) {
    userOverrideParts.push('==================================================');
    userOverrideParts.push('DIRECTOR\'S MANUAL OVERRIDES (HIGHEST PRIORITY):');

    const draft = opts.injectPromptDraft;
    if (draft.concept) userOverrideParts.push(`CONCEPT TARGET: ${draft.concept}`);

    // Deconstruct cinematography
    const cParts = [draft.cinematographyShotType, draft.cinematographyMotion, draft.cinematographyLens, draft.cinematography].filter(Boolean);
    if (cParts.length > 0) userOverrideParts.push(`CINEMATOGRAPHY: ${cParts.join(', ')}`);

    if (draft.subject) userOverrideParts.push(`SUBJECT: ${draft.subject}`);
    if (draft.action) userOverrideParts.push(`ACTION: ${draft.action}`);
    if (draft.context) userOverrideParts.push(`CONTEXT: ${draft.context}`);
    if (draft.styleAmbiance) userOverrideParts.push(`STYLE/AMBIANCE: ${draft.styleAmbiance}`);
    userOverrideParts.push('==================================================');
  }
  const userOverrideBlock = userOverrideParts.join('\n');

  const fullPromptParts = [
    'VEO 3.1 DIRECTOR SPEC (STRICT):',
    continuityBlock,
    charBlock,
    envBlock,
    styleBlock,
    motionBlock,
    frame1Block,
    frame2Block,
    userOverrideBlock,
    'OUTPUT: Generate a coherent video that matches the bibles above.',
    'CRITICAL INSTRUCTION: If DIRECTOR\'S MANUAL OVERRIDES are present, you MUST prioritize them over the forensic bibles above.'
  ].filter(Boolean);

  const fullPrompt = fullPromptParts.join('\n\n');
  const negatives = buildNegatives(spec).join(', ');

  return {
    prompt: fullPrompt,
    negatives,
    debug: { spec, opts, continuityOn }
  };
}
