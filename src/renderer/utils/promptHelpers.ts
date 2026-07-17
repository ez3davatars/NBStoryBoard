import type { DirectorSettings, ReferenceSlot, StageToken, StageAnnotation } from '../context/AppContext';
import { computeDepthScore } from './spatialHelpers';
import type { PlacementIntent } from './spatialHelpers';
import type { ExtractedStyle, SceneIntent } from '../services/GeminiService';
import type { ShotPackId, ShotPresetId, ShotLocks, DirectedShotSlot } from '../types/shots';
import type { ActorIdentityReferenceSet, ShotsActorOption } from '../context/AppContext';
import { SHOT_PRESETS, type ShotPresetDefinition } from './shotsPresets';
import { buildSceneTruthSnapshotBlock } from './sceneTruthHelpers';
import { stripShotDirectiveContamination } from './analysisSanitizers';
import { createPromptSafeReferenceSlots, sanitizeReferenceAnalysisForPrompt } from './stagingPromptProtection';
import { buildPoseCoherenceContract, buildPoseCoherenceNegativeTokens } from '../../prompts/poseCoherence';
import { buildStyleCategoryContract, buildStyleNegativePrompt } from '../../prompts/styleContracts';
import { buildStagingSpatialControlBlock, type SpatialFrame } from './stagingSpatialDirectives';

export const SCENE_LOCK_NEGATIVE_TOKENS = "scene alteration, background change, lighting shift, camera angle change, style deviation, new composition, structural change, reimagined scene, time of day shift, seasonal change, architectural alteration, furniture movement, lens flares, color grading shift, original studio background, white backgrounds showing through gaps";

export const STAGE_W = 1024;
export const STAGE_H = 576;

export const lightingProtocol = "CLEAN_BG_PLATE / anchor image is the lighting authority. Subjects MUST inherit the local environmental lighting from the anchor image, including key direction, fill level, color temperature, exposure, black level, shadow softness, atmospheric perspective, and visible bounce/accent light. Discard source-reference studio lighting and re-light subjects from scratch so contact shadows, ambient occlusion, highlights, and color grading match the exact area where each subject is placed. No crushed blacks.";

export const buildMasterStyleKeywords = (director: DirectorSettings): string[] => {
  const tech: string[] = [];
  if (director.qualityMode === 'Raw Uncompressed') tech.push('Raw Uncompressed', 'hyper-realistic');
  if (director.qualityMode === 'Stylized') tech.push('Stylized', 'Digital Art', 'Creative');
  if (director.qualityMode === '3D Render') {
    tech.push(
      'High-end 3D character design',
      'CGI',
      'subsurface scattering',
      'soft volumetric lighting',
      'expressive features',
      '4k octane render',
      'smooth textures'
    );
  }

  if (director.resolution === 'Native 4K') tech.push('Native 4K', 'Ultra-High Definition');
  if (director.resolution === '2K QHD') tech.push('2K QHD', 'High Definition');
  if (director.resolution === '1K') tech.push('1K', 'Speed');

  return tech;
};

// Gemini 3.1 Flash Image tends to follow short, explicit constraints better than long comma-chains.
// We still merge negatives as tokens, but will format them as a compact bullet block.
export const mergeNegatives = (...chunks: string[]) => {
  const split = (c: string) =>
    c
      .split(/[,;\n]+/g)
      .map(t => t.trim())
      .filter(Boolean);

  const tokens = chunks.flatMap(split);

  // Case-insensitive de-dupe while preserving first occurrence.
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
  }

  return uniq.join(', ');
};

const formatNegativesForGemini = (merged: string, maxItems = 18): string => {
  const items = merged
    .split(/[,;\n]+/g)
    .map(t => t.trim())
    .filter(Boolean);

  const clipped = items.slice(0, maxItems);
  const lines = clipped.map(i => `- ${i}`);

  if (items.length > maxItems) {
    lines.push(`- (and ${items.length - maxItems} more)`);
  }

  return lines.join('\n');
};

export const buildProductionActorPromptContract = (profile: any, refLabel: string): string => {
  if (!profile) return '';

  const displayName = profile.displayName || profile.name || 'Production Actor';
  const identitySummary = profile.identitySummary || 'No identity summary available.';
  const styleSummary = profile.styleSummary || 'No style summary available.';
  const wardrobeSummary = profile.wardrobeSummary || 'No wardrobe summary available.';
  
  const preserveRules = Array.isArray(profile.preserveRules) ? profile.preserveRules : [];
  const avoidRules = Array.isArray(profile.avoidRules) ? profile.avoidRules : [];

  const preserveStr = preserveRules.length > 0 ? preserveRules.join(', ') : 'None';
  const avoidStr = avoidRules.length > 0 ? avoidRules.join(', ') : 'None';

  return `PRODUCTION ACTOR LOCK FOR ${refLabel}:
Actor Name: ${displayName}

Identity Summary:
${identitySummary}

Style Summary:
${styleSummary}

Wardrobe Summary:
${wardrobeSummary}

Preserve:
${preserveStr}

Avoid:
${avoidStr}

Rules:
This Production Actor metadata is authoritative for identity continuity.
The reference image provides visual support, but the locked actor profile defines what must be preserved.
Do not change the actor’s face, body identity, wardrobe identity, core style, or preserve-list traits unless the user explicitly requests an edit.
Avoid all avoid-list traits.`;
};

export const getActiveReferenceSlots = (slots: ReferenceSlot[]) => {
  return slots
    .filter(s => !!s.url && s.active)
    .sort((a, b) => a.index - b.index);
};

const compactReferenceText = (value?: string | null, maxLength = 520): string => {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
};

const buildReferenceStackIdentitySourceBlock = (referenceSlots: ReferenceSlot[]): string => {
  const active = getActiveReferenceSlots(referenceSlots);
  if (active.length === 0) return '';

  const lines = [
    '### REFERENCE STACK IDENTITY SOURCES (HARD)',
    'Every active Reference Stack image is an attached identity/body/wardrobe source. Do not treat these as mood boards only.',
    'If a Reference Stack note names a subject, generate that subject from the matching REFERENCE_* image label. Do not invent a replacement actor or presenter.',
    'Preserve the visible identity, body build, wardrobe, sheet/board design, and character traits from each REFERENCE_* image unless a user note explicitly changes one of those traits.'
  ];

  active.forEach((ref) => {
    const name = compactReferenceText(ref.name, 80) || `Reference ${ref.index}`;
    const note = compactReferenceText([ref.target, ref.analysis].filter(Boolean).join(' | '), 520);
    lines.push(
      `- REF_SLOT_${ref.index} (${name}) is attached as REFERENCE_${ref.index}. Use REFERENCE_${ref.index} as the exact identity/body/wardrobe source.${note ? ` Directive/DNA: "${note}".` : ''}`
    );
  });

  return lines.join('\n');
};

import { LIGHTING_PRESETS, CAMERA_PRESETS } from '../../prompts/portraitPrompts';

type PresetPromptOption = {
  key: string;
  prompt: string;
};

const buildExtractedStyleCategoryBlock = (extractedStyle?: ExtractedStyle | null): string => {
  if (!extractedStyle) return '';
  const styleSeed = extractedStyle.renderStyle || extractedStyle.medium || '';
  return buildStyleCategoryContract(styleSeed, {
    selectedStyleLabel: extractedStyle.renderStyle || extractedStyle.medium || 'scene character style',
    sourceImagePolicy: 'Actor/source references control identity, body, wardrobe, and placement only; source-photo realism must not override the active character render category.',
    boardPresentationPolicy: 'Staging controls scene layout, placement, camera, and environment composition only.',
    lightingPolicy: 'Scene lighting and cinematic grading must be interpreted within the active character render category.',
    appliesTo: 'every visible staged character, inserted actor, replacement subject, shot variant, and scene thumbnail'
  });
};

const buildExtractedStyleCategoryNegative = (extractedStyle?: ExtractedStyle | null): string => {
  if (!extractedStyle) return '';
  return buildStyleNegativePrompt(extractedStyle.renderStyle || extractedStyle.medium || '');
};

type StrictPromptPlanEntry = {
  region: number;
  token: StageToken;
  actorLabel?: string;
  cast?: { name?: string } | null;
  profile?: string | object | null;
};

type StrictPromptDNA = {
  environment?: string;
  lighting?: string;
  camera?: string;
};

const HEIGHT_RELATIONSHIP_PATTERNS = [
  /\btaller than\b/i,
  /\bshorter than\b/i,
  /\bsame height\b/i,
  /\bheight should reach\b/i,
  /\bmake\s+[^.\n,;:]+?\s+taller\b/i,
  /\bmake\s+[^.\n,;:]+?\s+shorter\b/i,
  /\bheight\b[^.\n]*\b(?:arrow|tip|line|reach|taller|shorter)\b/i
];

const textHasHeightRelationshipIntent = (text?: string | null): boolean => {
  if (!text || !text.trim()) return false;
  return HEIGHT_RELATIONSHIP_PATTERNS.some((pattern) => pattern.test(text));
};

const normalizeHeightInstructionText = (text: string): string => (
  text
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'")
    .trim()
    .slice(0, 280)
);

const getAnnotationInstructionText = (annotation: StageAnnotation): string => (
  [annotation.label, annotation.text]
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .join(': ')
);

export const HEIGHT_RELATIONSHIP_LOCK_PROMPT_TEXT = `HEIGHT RELATIONSHIP LOCK:
Detected height instruction: "<detected height wording>".
Apply the detected height instruction as a relational body-scale constraint between the named staged actors.
The target actor must be visibly taller/shorter than the reference actor.
If the request says same height, keep the actors approximately the same visible height.
If the request says a height should reach an arrow tip/line, treat that arrow as an approximate height guide for the named actor.
Adjust full-body proportions naturally, not just head size.
Keep both actors on the same floor plane.
Preserve identity, face, wardrobe, pose, props/tools, lighting, and scene.
Do not use perspective trickery.
Ensure eye line, shoulder line, head top, torso length, and leg length support the requested height relationship.`;

export const HEIGHT_ANNOTATION_ARROW_GUIDE_PROMPT_TEXT = `The arrow is an annotation guide for intended height, not an object in the final scene. Do not render the arrow unless explicitly requested.`;

export const buildHeightRelationshipLockBlock = (input: {
  director?: Pick<DirectorSettings, 'subject' | 'environment'>;
  notes?: string;
  bgPrompt?: string;
  tokens?: StageToken[];
  annotations?: StageAnnotation[];
}): string => {
  const annotations = input.annotations || [];
  const tokens = input.tokens || [];
  const textSources = [
    input.notes,
    input.bgPrompt,
    input.director?.subject,
    input.director?.environment,
    ...tokens.flatMap((token) => [token.tag, token.actionNote, token.intelligence, token.notes]),
    ...annotations.map(getAnnotationInstructionText)
  ]
    .map((value) => (value || '').trim())
    .filter(Boolean);

  const detectedInstructions = Array.from(
    new Set(
      textSources
        .filter(textHasHeightRelationshipIntent)
        .map(normalizeHeightInstructionText)
    )
  );

  if (detectedInstructions.length === 0) return '';

  const hasArrowGuide =
    annotations.some((annotation) => annotation.type === 'arrow' && annotation.visible !== false) ||
    detectedInstructions.some((text) => /\b(?:arrow|tip|line)\b/i.test(text));

  const detectedText = detectedInstructions.slice(0, 3).join(' / ');
  const block = HEIGHT_RELATIONSHIP_LOCK_PROMPT_TEXT.replace('<detected height wording>', () => detectedText);

  return hasArrowGuide
    ? `${block}\n${HEIGHT_ANNOTATION_ARROW_GUIDE_PROMPT_TEXT}`
    : block;
};

export const compileV3DirectorPrompt = (
  director: DirectorSettings,
  slots: ReferenceSlot[],
  tokens: StageToken[] = [],
  bgPrompt: string = '',
  annotations: StageAnnotation[] = [],
  spatialFrame?: SpatialFrame
): string => {
  const promptSafeSlots = createPromptSafeReferenceSlots(slots);
  const activeRefs = getActiveReferenceSlots(promptSafeSlots);
  const heightRelationshipBlock = buildHeightRelationshipLockBlock({
    director,
    bgPrompt,
    tokens,
    annotations
  });
  const spatialControlBlock = buildStagingSpatialControlBlock({
    referenceSlots: promptSafeSlots,
    tokens,
    annotations,
    spatialFrame,
    includeTokenMap: true
  });
  const referenceIdentityBlock = buildReferenceStackIdentitySourceBlock(promptSafeSlots);

  const segments: string[] = [];
  const hasVisibleHumanSubject =
    activeRefs.length > 0 ||
    tokens.length > 0 ||
    /\b(actor|character|person|human|subject|body|wardrobe|costume)\b/i.test(`${director.subject} ${bgPrompt}`);

  // 0) Output contract (put first for better compliance)
  segments.push(
    `CREATE ONE IMAGE. Follow ALL instructions exactly. If instructions conflict, prioritize: (1) HARD MASKING / MARKER directives, (2) SPATIAL PROTOCOL, (3) explicit replacement/mapping rules, then everything else.`
  );

  if (director.aspectRatio) {
    // Gemini does not treat "--ar" as a control token; keep aspect ratio as plain language.
    segments.push(`ASPECT RATIO: ${director.aspectRatio}.`);
  }

  // Negatives (place early for Gemini 3.1 Flash Image)
  const safetyNegs = director.safety === 'Strict'
    ? 'nsfw, nudity, violence, blood, gore, disturbing content, inappropriate attire'
    : '';
  const markerNegs = director.markerType
    ? 'text, numbers, annotations, outlines, bounding boxes, arrows, circles, ui elements, red lines, green lines, marker strokes, sketches, overlay'
    : '';
  const sceneLockNegs = director.sceneLock ? SCENE_LOCK_NEGATIVE_TOKENS : '';
  const poseNegs = hasVisibleHumanSubject ? buildPoseCoherenceNegativeTokens() : '';
  const neg = mergeNegatives(director.negativePrompt || '', safetyNegs, markerNegs, sceneLockNegs, poseNegs);
  if (neg.trim()) {
    segments.push(`NON-NEGOTIABLE — DO NOT INCLUDE ANY OF THE FOLLOWING:\n${formatNegativesForGemini(neg.trim())}`);
  }

  // 1) Master style
  const tech = buildMasterStyleKeywords(director);
  if (tech.length > 0) segments.push(`MASTER STYLE KEYWORDS: ${tech.join(', ')}.`);

  // 2) Spatial Protocol (Authority #1-3 enforcement)
  segments.push(
    `SPATIAL PROTOCOL (NON-NEGOTIABLE):\n` +
      `- Actors are positioned using explicit anchor regions and user-defined layout.\n` +
      `- Relative distance is determined by scale and vertical placement.\n` +
      `- Foreground/midground/background layers are preassigned.\n` +
      `- Do NOT reposition actors.\n` +
      `- Do NOT reinterpret spatial layout.\n` +
      `- Lighting must respect layer separation.`
  );
  if (spatialControlBlock) segments.push(spatialControlBlock);
  if (referenceIdentityBlock) segments.push(referenceIdentityBlock);

  if (hasVisibleHumanSubject) {
    segments.push(buildPoseCoherenceContract({
      strictness: 'scene',
      subjectScope: 'visible_body',
      stanceType: 'anchor_preserved',
      footingMode: 'anchor_preserved',
      twistAllowed: false,
      twistIntensity: 0
    }));
  }

  // 3) Replacement / Mapping priority: Marker > Spatial > Replace
  if (director.markerType) {
    const markerDirectives: string[] = [];
    activeRefs.forEach(ref => {
      const targetVal = (ref.target || '').trim() || `Marker #${ref.index}`;
      const subjectDesc = (ref.analysis || ref.name || '').trim() || `Subject from Ref ${ref.index}`;
      markerDirectives.push(
        `REGION ${ref.index}: Locate the ${director.markerType} identified as "${targetVal}". ACTION: Generate ${subjectDesc} STRICTLY INSIDE this shape.`
      );
    });

    segments.push(`HARD MASKING via ${director.markerType} (HIGHEST PRIORITY).`);
    segments.push(
      `CRITICAL: FREEZE THE SCENE. All pixels OUTSIDE the ${director.markerType} must remain UNCHANGED and identical to the Anchor Image. Only pixels INSIDE marked zones may change.`
    );
    if (markerDirectives.length > 0) segments.push(markerDirectives.join('\n'));
    segments.push(
      `FINAL STEP: Remove the colored marker outlines themselves. Blend edges seamlessly, but do NOT alter the surrounding room/environment.`
    );
  } else if (director.spatialLayout && activeRefs.length >= 1) {
    const sorted = activeRefs.map(r => r.index);
    const p1 = sorted[0] ? `[Ref ${sorted[0]} Subject]` : 'Empty';
    const p2 = sorted[1] ? `[Ref ${sorted[1]} Subject]` : 'Secondary Element';

    let layoutPrompt = '';
    if (director.spatialLayout === 'horizontal') layoutPrompt = `COMPOSITION: Split-screen. LEFT: ${p1}. RIGHT: ${p2}. Clear separation.`;
    if (director.spatialLayout === 'vertical') layoutPrompt = `COMPOSITION: Vertical stack. TOP: ${p1}. BOTTOM: ${p2}.`;
    if (director.spatialLayout === 'center') layoutPrompt = `COMPOSITION: Hero shot. CENTER: ${p1}. Surrounding/periphery: other reference elements.`;
    if (layoutPrompt) segments.push(layoutPrompt);
  } else if (director.replaceAnchorSubjects) {
    const specificMaps: string[] = [];
    
    // 1. Explicit UI Target Overrides
    activeRefs.forEach(ref => {
      const targetVal = (ref.target || '').trim();
      let dnaMandate = '';
      if (ref.analysis && ref.analysis.trim()) {
          dnaMandate = ` CRITICAL BIOMETRIC OVERRIDE: Specifically alter the generated subject's physical body, height, weight, and traits to perfectly match this DNA profile: "${ref.analysis.trim()}".`;
      }
      
      if (targetVal) {
        specificMaps.push(`- Identify the subject physically located at/described as "${targetVal}" in the anchor image. ERADICATE their original identity and REPLACE THEM ENTIRELY with the subject shown in Reference ${ref.index} (${ref.name || 'Subject'}).${dnaMandate}`);
      }
    });

    // 2. Spatial Token Inference Fallback (if they didn't manually assign text targets)
    if (specificMaps.length === 0 && tokens.length > 0) {
      const orderedRefs = [...activeRefs].sort((a, b) => a.index - b.index);
      tokens.forEach((token, tokenIndex) => {
        const ref = activeRefs.find(r => r.castId === token.castId) || orderedRefs[tokenIndex];
        if (ref) {
          const x = Math.round(Number(token.x) || 0);
          const y = Math.round(Number(token.y) || 0);
          const w = Math.round(Number(token.width) || 0);
          const h = Math.round(Number(token.height) || 0);
          const tag = (token.tag || '').trim();
          
          let dnaMandate = '';
          if (ref.analysis && ref.analysis.trim()) {
              dnaMandate = ` CRITICAL BIOMETRIC OVERRIDE: Specifically alter the generated subject's physical body, height, weight, and traits to perfectly match this DNA profile: "${ref.analysis.trim()}".`;
          }
          specificMaps.push(`- The subject occupying anchor BBOX [${x}, ${y}, ${w}, ${h}]${tag ? ` ("${tag}")` : ''} MUST be replaced by the subject in Reference ${ref.index} (${ref.name || 'Subject'}).${dnaMandate}`);
        }
      });
    }

    if (specificMaps.length > 0) {
      segments.push(`CRITICAL REPLACEMENT MAP (MANDATORY IDENTITY TARGETING):\n${specificMaps.join('\n')}\nWARNING: You MUST enforce this exact positioning. DO NOT rely on visual similarity between the reference faces and the original anchor bodies to decide who goes where. You MUST strictly swap the identities into the physical locations defined above. Randomly swapping these characters is a FAILURE.\nFULL-SUBJECT REPLACEMENT LOCK (NON-NEGOTIABLE): This is NOT a face-swap. You MUST replace each target subject's full visible identity: face, head shape, hairline, neck, shoulder width, torso build, arm thickness, and overall body proportions to match the reference subject.\nOMNIPOTENT OBLITERATION DIRECTIVE: When replacing subjects, you are FORBIDDEN from preserving the anchor's original facial structure, hair, head shape, or body build. You MUST completely overwrite their biological traits to match the Reference Subject and their Biometric Profile, EVEN IF it breaks the original silhouette.\nWARDROBE CONTINUITY (CRITICAL): Unless the Biometric Override explicitly requests a different outfit, you MUST perfectly preserve the EXACT original clothing, suits, and attire worn by the humans in the anchor image. Re-dress your generated subjects in those exact anchor outfits. Do NOT use the casual clothing from the Reference images. Maintain exact environment details.`);
    } else {
      const t = director.globalReplaceTarget ? `"${director.globalReplaceTarget.trim()}"` : 'any characters/subjects';
      segments.push(
        `CRITICAL DIRECTIVE: Identify ${t} present in the Anchor Scene/Environment. Replace them with the characters defined in the Reference Images.`
      );
    }
  }

  // RESOLVE PRESETS for Lighting and Camera
  const resolvedLighting =
    LIGHTING_PRESETS.find((p: PresetPromptOption) => p.key === director.lighting)?.prompt ||
    director.lighting?.trim() ||
    '';
  const resolvedCamera =
    CAMERA_PRESETS.find((p: PresetPromptOption) => p.key === director.camera)?.prompt ||
    director.camera?.trim() ||
    '';

  // 2.5) Actor Intelligence (Pose, Lighting interaction per actor & Spatial Enforcement)
  tokens.forEach(token => {
    let intelligence = token.intelligence || '';
    if (token.spatialDescriptor) {
      // Authority #4: Lighting rules derived from semantic layers (with preset overrides)
      let spatialLighting = '';
      if (resolvedLighting) {
        spatialLighting = `Fully lit entirely by: ${resolvedLighting}`;
      } else {
        // Fallback to spatial ambient lighting matching the environment
        if (token.spatialDescriptor.depthLayer === 'foreground') spatialLighting = 'Match ambient lighting color and direction from Environment. Higher contrast, sharper shadows.';
        else if (token.spatialDescriptor.depthLayer === 'midground') spatialLighting = 'Match ambient lighting color and direction from Environment. Neutral contrast.';
        else if (token.spatialDescriptor.depthLayer === 'background') spatialLighting = 'Match ambient lighting color and direction from Environment. Softer lighting, lower contrast.';
      }

      intelligence += ` (STAGING: ${token.spatialDescriptor.depthLayer}. LIGHTING: ${spatialLighting})`;
    }

    // 2.6) Occlusion Directives
    if (token.occlusionMode === 'front') {
      intelligence += ` (OCCLUSION: FORCE FRONT - Render this actor in front of all environment/background objects).`;
    } else if (token.occlusionBias && token.occlusionBias !== 0) {
      const direction = token.occlusionBias > 0 ? 'PUSHED BACK (deeper into scene)' : 'PULLED FORWARD (closer to camera)';
      intelligence += ` (OCCLUSION BIAS: ${direction} relative to anchor depth).`;
    }

    // Always push position + intelligence for layout strictness
    const match = activeRefs.find(r => r.castId === token.castId);
    let name = token.tag;
    if (match) name = match.name || `Ref ${match.index}`;

    const center = token.x + token.width / 2;
    const relX = center / STAGE_W;
    let posH = "center";
    if (relX < 0.38) posH = "left";
    else if (relX > 0.62) posH = "right";

    segments.push(`[Actor Positioning & Intelligence for ${name}]: Placed on the ${posH}. ${intelligence.trim()}`);
  });

  // 3) Subject + Environment
  let main = '';
  const mergedNotes = bgPrompt.trim() || director.subject.trim();
  if (mergedNotes) main += `Scene Notes/Subject: ${mergedNotes}. `;
  if (director.environment.trim()) main += `Environment: ${director.environment.trim()}. `;
  if (main.trim()) segments.push(main.trim());
  if (heightRelationshipBlock) segments.push(heightRelationshipBlock);

  // 4) Knowledge injection
  if (director.knowledge.trim()) {
    segments.push(`FACTUAL ACCURACY REQUIREMENT: Ensure historical/factual accuracy for: "${director.knowledge.trim()}".`);
  }

  // 5) Cinematography
  const cinema = [resolvedLighting, resolvedCamera, director.filmStock?.trim()].filter(Boolean);
  if (cinema.length > 0) segments.push(`Cinematography: ${cinema.join(', ')}.`);

  // 6) Reference Context
  if (activeRefs.length > 0) {
    let refBlock = `REFERENCE IMAGES (MUST FOLLOW) — strategy: ${director.mergeStrategy}. Fidelity priority: Ref 1–6.\n`;
    activeRefs.forEach(ref => {
      const txt = (ref.analysis || ref.name || '').trim();
      refBlock += `- Ref ${ref.index}: ${txt || 'No analysis provided'}\n`;
      
      const profile = ref.productionActorProfile || ref.productionProfile;
      if (profile) {
        refBlock += `\n` + buildProductionActorPromptContract(profile, `Ref ${ref.index}`) + `\n\n`;
      }
    });
    segments.push(refBlock.trim());
  }

  // 7) Text layer
  if (director.textRender.trim()) {
    let textInstruction = `Render Text: "${director.textRender.trim()}"`;
    if (director.textStyle.trim()) textInstruction += ` in style of ${director.textStyle.trim()}`;
    segments.push(`TEXT LAYER: ${textInstruction}.`);
  }

  return segments.join('\n\n').trim();
};


// --- CONTINUITY LOCK BLOCK (Veo/NanoBanana) ---
export type ContinuityLockOptions = {
  identityLocks?: string[];
  lockEnvironment?: boolean;
  lockLighting?: boolean;
  lockLens?: boolean;
  lockStyle?: boolean;
  noExtraObjects?: boolean;
  noMorph?: boolean;
};

export const buildContinuityLockBlock = (opts: ContinuityLockOptions = {}): string => {
  const lines: string[] = [];
  const identity = (opts.identityLocks || []).filter(Boolean).join(', ');
  lines.push('CONTINUITY LOCK (HARD):');
  lines.push('- Preserve character identity across all frames. No facial/hair/body morphing.');
  if (identity) lines.push(`- Locked Identity Traits: ${identity}.`);
  if (opts.lockEnvironment) lines.push('- Keep environment/setting consistent. No background changes.');
  if (opts.lockLighting) lines.push('- Keep lighting direction, exposure, and color temperature consistent.');
  if (opts.lockLens) lines.push('- Keep camera/lens language consistent unless explicitly instructed.');
  if (opts.lockStyle) lines.push('- Keep visual style and color palette consistent. No style drift.');
  if (opts.noExtraObjects) lines.push('- Do NOT add extra objects, text, watermarks, logos, or random people. MAINTAIN PERFECT OBJECT PERMANENCE: If a prop leaves the camera view and re-enters, it must remain completely identical. NO PROP SUBSTITUTION.');
  if (opts.noMorph) lines.push('- Do NOT duplicate limbs/heads, do NOT change anatomy, do NOT change clothing unexpectedly. NO HALLUCINATIONS of existing objects.');
  return lines.join('\n');
};

/**
 * DERIVE SPATIAL DESCRIPTOR
 * Consolidates depth, layer, and z-index into a single descriptor for actor instances.
 */
export const deriveSpatialDescriptor = (token: StageToken): { depthScore: number; depthLayer: 'foreground' | 'midground' | 'background'; zIndex: number } => {
  const STAGE_H = 540;
  const score = computeDepthScore(
    {
      scale: token.scaleX,
      position: { y: token.y },
      height: token.height,
      depthLayer: token.anchorLayer
    },
    { height: STAGE_H }
  );

  // depthLayer mapping (manual override takes precedence)
  let depthLayer: 'foreground' | 'midground' | 'background' = 'midground';
  if (score < 0.33) depthLayer = 'foreground';
  else if (score > 0.66) depthLayer = 'background';

  return {
    depthScore: score,
    depthLayer: token.anchorLayer || depthLayer, // Authority #1 takes precedence
    zIndex: token.zIndex
  };
};

/**
 * Builds a dedicated natural language prompt for an actor's placement intent
 */
export const buildPlacementPrompt = (
    intent: PlacementIntent,
    actor: StageToken,
    anchor: StageAnnotation,
    lookAt?: StageAnnotation
): string => {
    let prompt = `Place ${actor.tag}`;

    if (intent.action === 'sit') {
        prompt += ` seated naturally`;
        if (anchor.label) prompt += ` in the ${anchor.label}`;
        else prompt += ` in the chair/seat area`;
        prompt += `. Hips fully on the seat, back aligned, feet on the floor.`;
    } else if (intent.action === 'lean') {
        prompt += ` leaning naturally`;
        if (anchor.label) prompt += ` against the ${anchor.label}`;
        else prompt += ` against the surface`;
        prompt += `.`;
    } else {
        prompt += ` standing naturally`;
        if (anchor.label) prompt += ` at the ${anchor.label}`;
        prompt += `.`;
    }

    if (lookAt) {
        if (lookAt.label) prompt += ` Torso and head turned toward the ${lookAt.label}.`;
        else prompt += ` Looking toward the indicated direction.`;
    }

    if (intent.poseNotes) {
        prompt += ` ${intent.poseNotes}`;
    }

    prompt += ` Keep the full body contained inside the masked area. Do not place ${actor.tag} standing, floating, or in any other location. Do not change the room, furniture, camera framing, lighting, crew, or background subjects.`;

    return prompt;
};

// ==========================================
// PRODUCTION RENDER PROMPT COMPILERS
// ==========================================

import { buildHumanPlacementIntents, formatPlacementIntents } from './placementHelpers';

export const buildStrictPrompt = (
    plan: StrictPromptPlanEntry[],
    dnaForRender: StrictPromptDNA,
    notes: string, 
    tokens: StageToken[], 
    annotations: StageAnnotation[],
    referenceSlots: ReferenceSlot[],
    director: DirectorSettings,
    extractedStyle?: ExtractedStyle | null,
    spatialFrame?: SpatialFrame
) => {
    const promptSafeReferenceSlots = createPromptSafeReferenceSlots(referenceSlots);
    const tech = buildMasterStyleKeywords(director);

    const dnaBlock = [
        (director.environment || dnaForRender.environment) ? `Environment Match: ${director.environment || dnaForRender.environment}` : '',
        (director.lighting || dnaForRender.lighting) ? `Lighting Setup: ${director.lighting || dnaForRender.lighting}` : '',
        (director.camera || dnaForRender.camera) ? `Camera Settings: ${director.camera || dnaForRender.camera}` : ''
    ].filter(Boolean).join('\n');

    const regions = plan.map(r => {
        const t = r.token;
        const actorLabel = r.actorLabel || r.cast?.name || t.tag || `Actor ${r.region}`;

        const boundsBlock = `BBOX_ABS: [${Math.round(t.x)}, ${Math.round(t.y)}, ${Math.round(t.width)}, ${Math.round(t.height)}]`;
        let profile = typeof r.profile === 'string'
            ? r.profile
            : (r.profile
                ? JSON.stringify(r.profile)
                : (
                    director.replaceAnchorSubjects
                        ? `Use CLEAN_BG_PLATE at this region as the source of pose, gaze direction, body orientation, and wardrobe continuity. Do NOT copy facial identity or body morphology from anchor occupants. Identity and biometric morphology (face + head + neck + body build) must come from the mapped actor identity references for this region.`
                        : `You MUST perfectly match the facial identity, skin tone, hair, and clothing of the subject in the attached image labeled "REGION_${r.region}_REF"`
                ));
        if (t.intelligence) profile += `\nMANDATORY ACTION/POSE: ${t.intelligence}`;

        return `REGION ${r.region} (${actorLabel}):\n- Position: ${boundsBlock}\n- Description: ${profile}`;
    }).join('\n\n');

    // Director Canvas Semantic Handoff
    const intents = buildHumanPlacementIntents(tokens, annotations);
    const intentBlock = intents.length > 0 ? formatPlacementIntents(intents) : "";
    const heightRelationshipBlock = buildHeightRelationshipLockBlock({
        director,
        notes,
        tokens,
        annotations
    });

    const spatialControlBlock = buildStagingSpatialControlBlock({
        referenceSlots: promptSafeReferenceSlots,
        tokens,
        annotations,
        spatialFrame,
        includeTokenMap: true
    });
    const refStackActive = getActiveReferenceSlots(promptSafeReferenceSlots);
    const refStackBlock = buildReferenceStackIdentitySourceBlock(promptSafeReferenceSlots);

    const rules = [
        "SCENE RECONSTRUCTION AND COMPOSITING AUTHORIZATION:",
        "You are a professional digital compositor and lighter.",
        tech.length > 0 ? `(Master Style: ${tech.join(', ')})\n` : "",
        director.subject.trim() ? `Subject Focus: ${director.subject.trim()}` : "",
        director.filmStock.trim() ? `Film Look: ${director.filmStock.trim()}` : "",
        refStackBlock,
        "",
        "CRITICAL COMMANDS (ZERO TOLERANCE):",
        buildPoseCoherenceContract({
            strictness: 'scene',
            subjectScope: 'visible_body',
            stanceType: 'anchor_preserved',
            footingMode: 'anchor_preserved',
            twistAllowed: false,
            twistIntensity: 0
        }),
        "1. SINGLE IMAGE OUTPUT: Generate ONLY the final rendered scene. Do NOT render a collage, sidebar, dashboard, or layout showing the references. If the output is not a single clean 16:9 scene, it is a FAILURE.",
        "- UNIFORM ENVIRONMENT: All background details (walls, props, lighting) must remain 100% identical to the CLEAN_BG_PLATE outside of the character regions.",
        director.replaceAnchorSubjects
            ? "- SEAMLESS BLENDING: ANCHOR_GUIDE provides region/layout guidance. Use CLEAN_BG_PLATE as the canonical scene for pose, gaze, wardrobe, and lighting continuity."
            : "- SEAMLESS BLENDING: The ANCHOR_GUIDE contains a rough composite of the characters. Your job is to blend them naturally into the scene. Match the lighting, shadows, and color grading of the background.",
        "- LIGHTING OVERRIDE: Absolutely DO NOT carry over the original lighting from the character references. You MUST re-light the characters entirely from scratch to naturally match the environment's ambient light and the specified Cinematography lighting.",
        director.replaceAnchorSubjects
            ? "- POSE/GAZE LOCK FROM ANCHOR: For each mapped subject, preserve the anchor subject's gaze direction, head angle, torso orientation, and stance at that location unless explicitly overridden."
            : "",
        director.replaceAnchorSubjects
            ? "- WARDROBE SOURCE LOCK: Wardrobe must come from the anchor subject in CLEAN_BG_PLATE for that mapped location. Never import clothing from identity reference images."
            : "",
        director.replaceAnchorSubjects
            ? "- HEADWEAR FIT LOCK: If the mapped anchor subject wears a hat/cap/headwear, preserve that exact item fit and geometry (crown height, brim curvature, tilt angle, forehead sit, and scalp contact). Do not reshape it loosely."
            : "",
        director.replaceAnchorSubjects
            ? "- LOGO/EMBLEM LOCK: Preserve visible logos/insignia/embroidered marks from the mapped anchor wardrobe item exactly at the same relative location and scale. Do not remove, blur out, or substitute a different mark."
            : "",
        director.replaceAnchorSubjects
            ? "- REFERENCE SOURCE POLICY: Identity references provide face/body identity only. CLEAN_BG_PLATE provides pose, gaze, wardrobe, and scene lighting."
            : "",
        "- NEGATIVE SPACE: Ignore any solid or white studio backgrounds present in the REGION_REFS. Treat flat white areas (such as inside a hollow helmet, or between arms and torso) as transparent, and fill them perfectly with the scene environment.",
        "- NO OUTLINES: Do NOT draw any boxes, boundaries, or outlines around the characters. The final image must look like a natural photograph or movie frame.",
        "- NO Hallucinations: Do not add any extra objects, people, or details not requested in the Director Brief or Region Plan.",
        director.replaceAnchorSubjects
            ? "- MORPHOLOGY OVERRIDE (REPLACE MODE): You may change in-region body silhouette/proportions to match the mapped reference subject. Preserve placement intent and ground contact, but do NOT force anchor-body shape retention."
            : "- ASPECT RATIO LOCK: DO NOT STRETCH OR SQUASH. If a character cutout does not perfectly fill its assigned BBOX_ABS, DO NOT distort the character. Maintain natural proportions and fill any remainder with pixels from the CLEAN_BG_PLATE.",
        "- OVERLAP LOCK: If the ANCHOR_GUIDE shows subjects overlapping, maintain that exact occlusion.",
        director.replaceAnchorSubjects
            ? "- FULL-SUBJECT REPLACEMENT LOCK: This is NOT a face transplant. Replace face + head + neck + body build to match the mapped reference subject. Keeping anchor bodies and only swapping heads is a hard failure."
            : "",
        director.replaceAnchorSubjects
            ? "- WARDROBE CARRYOVER LOCK: Keep anchor clothing/suits/attire and fit that wardrobe naturally to the replacement subject's body proportions."
            : "",
        "",
        dnaBlock ? `### SCENE LOCK (BACKGROUND / LAYOUT / LIGHTING ONLY)\n${dnaBlock}\nScene DNA may describe background, layout, lighting, and camera only. Scene DNA is never an identity source.\n` : "",
        notes ? `### OVERALL SCENE & STYLE / CREATIVE INTENT (MANDATORY)\n${notes}\nHonor the scene, environment, mood, lighting, style, and action content of this direction fully.\n\n### IDENTITY GUARD\nApply this direction to the locked reference actor(s) only. Do not infer or generate a new subject from this text. Do not change the actor's face, identity, age, body type, skin tone, hairline, facial hair, expression baseline, or likeness.\n` : "",
        spatialControlBlock ? `${spatialControlBlock}\n` : "",
        heightRelationshipBlock ? `### HEIGHT RELATIONSHIP INSTRUCTIONS\n${heightRelationshipBlock}\n` : "",
        "",
        "### REGION COMPOSITION PLAN (FOLLOW EXACTLY):",
        intentBlock ? `${intentBlock}\n\n` : "",
        regions,
        "",
        extractedStyle ? `### STYLE ENVELOPE (VISUAL TREATMENT ONLY):
- Artistic Medium: ${extractedStyle.medium}
- Render Style: ${extractedStyle.renderStyle}
- Color Palette: ${extractedStyle.palette}
- Mood/Vibe: ${extractedStyle.mood}
${buildExtractedStyleCategoryBlock(extractedStyle)}

ANTI-STYLE-DRIFT GUARDRAIL: This style envelope MUST ONLY affect the rendering look, colors, and visual treatment. It MUST NOT reinterpret or replace the requested location, scene category, furniture, props, or world (e.g., do not turn a cafe into a dungeon). The core scene nouns from the Director Notes remain mandatory and primary.` : "",
        extractedStyle ? "\n" : "",
        "### SCENE LIGHTING PROTOCOL:",
        lightingProtocol,
        "",
        "### IDENTITY PRECEDENCE",
        director.replaceAnchorSubjects
            ? [
                "Use actor reference stacks as the definitive source of full-subject identity, not just facial identity.",
                "Treat style analysis as secondary guidance only.",
                "If any conflict exists, preserve reference-defined full-subject morphology over anchor-body retention.",
                "NO FACE-SWAP POLICY: Do not keep anchor bodies and replace only heads."
            ].join('\n')
            : buildIdentityPrecedenceBlock({
                hasFaceAnchors: refStackActive.length > 0,
                hasActorReferences: refStackActive.length > 0,
                hasSubjectStyleAnalysis: !!extractedStyle
            }),
        director.replaceAnchorSubjects ? "### FULL-SUBJECT IDENTITY LOCK" : "### FACE IDENTITY LOCK",
        buildStrictFaceIdentityLockBlock({
            actorIdentitySets: refStackActive.map(r => ({ actorId: String(r.castId || r.index), angleFaceAnchors: [], supportIdentityRefs: [], wardrobeRefs: [], primaryFaceAnchor: r.url!, identityPriority: 'strict' })),
            allowWardrobeChange: !director.replaceAnchorSubjects,
            multiActor: refStackActive.length > 1
        }),
        director.replaceAnchorSubjects
            ? "### BODY IDENTITY LOCK\nPreserve replacement subject body morphology from references (height impression, shoulder width, neck thickness, torso/limb build) while keeping anchor-scene pose, placement, and wardrobe continuity."
            : "",
        director.replaceAnchorSubjects
            ? "### NO FACE-SWAP PROTOCOL\n- Hard failure if output keeps anchor body and changes only head/face.\n- Hard failure if neck/shoulder/torso build remains anchor-like while only facial features are replaced.\n- Required behavior: full-subject biometric remap (face + head + neck + body build) with anchor wardrobe continuity.\n- Preserve anchor pose/gaze orientation at each mapped location.\nIDENTITY LOCK: FULL_SUBJECT_STRICT\nNO_FACE_SWAP: TRUE\nBODY_MORPH_REQUIRED: TRUE\nPOSE_GAZE_LOCK: TRUE\nLIGHTING_FROM_SCENE_ONLY: TRUE\nWARDROBE_FROM_ANCHOR_ONLY: TRUE\nHEADWEAR_FIT_LOCK: TRUE\nLOGO_EMBLEM_LOCK: TRUE"
            : "IDENTITY LOCK: FACE_STRICT"
    ].filter(Boolean).join("\n");

    return rules;
};

export const buildLoosePrompt = (
    dna: { environment: string; lighting: string; camera: string },
    tokens: StageToken[],
    annotations: StageAnnotation[],
    referenceSlots: ReferenceSlot[],
    director: DirectorSettings,
    extractedStyle?: ExtractedStyle | null,
    bgPrompt?: string,
    spatialFrame?: SpatialFrame
) => {
    const promptSafeReferenceSlots = createPromptSafeReferenceSlots(referenceSlots);
    const sortedTokens = [...tokens].sort((a, b) => a.x - b.x);
    
    // Inline implementation of buildReferenceStackText for loose prompt
    const activeSlots = getActiveReferenceSlots(promptSafeReferenceSlots);
    const refStackBlock = buildReferenceStackIdentitySourceBlock(promptSafeReferenceSlots);

    const tech = buildMasterStyleKeywords(director);

    // Director Canvas Semantic Handoff
    const intents = buildHumanPlacementIntents(tokens, annotations);
    const intentBlock = intents.length > 0 ? formatPlacementIntents(intents) : "";
    const heightRelationshipBlock = buildHeightRelationshipLockBlock({
        director,
        bgPrompt,
        tokens,
        annotations
    });
    const spatialControlBlock = buildStagingSpatialControlBlock({
        referenceSlots: promptSafeReferenceSlots,
        tokens,
        annotations,
        spatialFrame,
        includeTokenMap: true
    });

    let p = "";
    if (tech.length > 0) p += `(Master Style: ${tech.join(', ')})\n\n`;

    const mergedNotes = (bgPrompt || "").trim() || director.subject.trim();
    if (mergedNotes) p += `Scene Notes/Subject: ${mergedNotes}. `;
    if (director.knowledge.trim()) p += `(Reasoning Constraint: Ensure historical/factual accuracy for: "${director.knowledge.trim()}"). `;
    if (director.filmStock.trim()) p += `Film Look: ${director.filmStock.trim()}. `;
    if (director.textRender.trim()) {
        let t = `Render Text: "${director.textRender.trim()}"`;
        if (director.textStyle.trim()) t += ` in style of ${director.textStyle.trim()}`;
        p += `(Text Layer: ${t}). `;
    }
    if (heightRelationshipBlock) p += `\n\n### HEIGHT RELATIONSHIP INSTRUCTIONS\n${heightRelationshipBlock}\n\n`;
    if (spatialControlBlock) p += `\n\n${spatialControlBlock}\n\n`;

    if (refStackBlock) p += `${refStackBlock}\n\n`;
    p += "Cinematic composition. ";
    if (activeSlots.length > 0 || sortedTokens.length > 0) {
        p += `\n${buildPoseCoherenceContract({
            strictness: 'scene',
            subjectScope: 'visible_body',
            stanceType: 'anchor_preserved',
            footingMode: 'anchor_preserved',
            twistAllowed: false,
            twistIntensity: 0
        })}\n\n`;
    }

    sortedTokens.forEach((t, i) => {
        const center = t.x + t.width / 2;
        const relX = center / STAGE_W;
        const relY = (t.y + t.height) / STAGE_H;

        let posH = "in the center";
        if (relX < 0.33) posH = "on the left";
        if (relX > 0.66) posH = "on the right";

        p += `Character ${i + 1} (${t.tag}) is ${posH} at vertical level ${(relY * 100).toFixed(0)}%`;
        if (t.actionNote) p += `, doing action: ${t.actionNote}`;
        if (t.intelligence) p += `. MANDATORY ACTION/POSE: ${t.intelligence}`;
        p += `. You MUST perfectly preserve the facial identity, features, and overall look of the subject in the attached image labeled "Character: ${t.tag}". `;
    });

    p += "\n\n";

    if (dna.environment || director.environment) p += `Environment: ${director.environment || dna.environment}\n`;
    if (dna.lighting || director.lighting) p += `Lighting: ${director.lighting || dna.lighting}\n`;
    if (dna.camera || director.camera) p += `Camera: ${director.camera || dna.camera}\n`;

    if (intentBlock) {
        p += `\n### SCENARIO-SPECIFIC ACTOR PLACEMENT\n${intentBlock}\n`;
    }

    p += `\n### ENVIRONMENT INTEGRATION GUARDRAIL
CRITICAL: You are compositing these characters into the provided background anchor image.
- DO NOT duplicate props. If a table or surface in the background already has a coffee, book, or object, the characters must interact with THAT existing object. DO NOT generate a second coffee cup if one is already visible.
- DO NOT duplicate furniture. The characters must sit on or interact with the chairs/seating ALREADY PRESENT in the background image. DO NOT generate new chairs cutting through the existing ones.
- Seamlessly wrap the characters into the existing environment physics.

### ANATOMY & REALISM GUARDRAIL
CRITICAL NEGATIVE PROMPT: You MUST NOT generate extra limbs, extra legs, phantom body parts, or disembodied characters. Ensure perfect anatomical structure. Characters must have exactly two legs and two arms. No floating legs under tables or detached hands.\n`;
    const extractedStyleNegative = buildExtractedStyleCategoryNegative(extractedStyle);
    if (extractedStyleNegative) {
        p += `\n### STYLE CATEGORY NEGATIVES\nselected style category drift, ${extractedStyleNegative}.\n`;
    }

    if (extractedStyle) {
        p += `\n### STYLE ENVELOPE (VISUAL TREATMENT ONLY):
- Artistic Medium: ${extractedStyle.medium}
- Render Style: ${extractedStyle.renderStyle}
- Color Palette: ${extractedStyle.palette}
- Mood/Vibe: ${extractedStyle.mood}
${buildExtractedStyleCategoryBlock(extractedStyle)}

ANTI-STYLE-DRIFT GUARDRAIL: This style envelope MUST ONLY affect the rendering look, colors, and visual treatment. It MUST NOT reinterpret or replace the requested location, scene category, furniture, props, or world (e.g., do not turn a modern office into a fantasy tavern). The core scene nouns remain mandatory and primary.\n`;
    }

    p += `\n### SCENE LIGHTING PROTOCOL:\n${lightingProtocol}\n`;

    p += `\n### IDENTITY PRECEDENCE\n`;
    p += `${buildIdentityPrecedenceBlock({
        hasFaceAnchors: activeSlots.length > 0,
        hasActorReferences: activeSlots.length > 0,
        hasSubjectStyleAnalysis: !!extractedStyle
    })}\n`;

    const identityArgs: BuildStrictFaceIdentityLockBlockArgs = {
        actorIdentitySets: activeSlots.map(r => ({ actorId: String(r.castId || r.index), angleFaceAnchors: [], supportIdentityRefs: [], wardrobeRefs: [], primaryFaceAnchor: r.url!, identityPriority: 'strict' })),
        allowWardrobeChange: true,
        multiActor: activeSlots.length > 1
    };
    p += `\n### FACE IDENTITY LOCK\n${buildStrictFaceIdentityLockBlock(identityArgs)}\n`;
    p += `\nIDENTITY LOCK: FACE_STRICT\n`;

    return p;
};

export const buildEnvironmentOnlyPrompt = (
    sceneIntent: SceneIntent,
    extractedStyle?: ExtractedStyle | null,
    cameraSetting?: string,
    tokens: StageToken[] = [],
    annotations: StageAnnotation[] = []
) => {
    let prompt = `CRITICAL DIRECTIVE: Generate the environment/background plate ONLY.\n`;
    prompt += `- STRONGLY FORBIDDEN: Do NOT generate a person or character.\n`;
    prompt += `- STRONGLY FORBIDDEN: Do NOT include a human subject.\n`;
    prompt += `- This pass is exclusively for the empty background plate/scene.\n\n`;

    prompt += `### SCENE INTENT (MANDATORY REQUIREMENTS):\n`;
    prompt += `CRITICAL: You MUST fulfill this core request exactly as described: "${sceneIntent.summary}"\n`;
    
    // Add structured extractions if they exist to help guide the generation safely
    if (sceneIntent.location) prompt += `- Location/Setting: ${sceneIntent.location}\n`;
    if (sceneIntent.action) prompt += `- Implied Context: ${sceneIntent.action}\n`;
    if (sceneIntent.furniture && sceneIntent.furniture.length > 0) prompt += `- Necessary Furniture: ${sceneIntent.furniture.join(', ')}\n`;
    if (sceneIntent.propContext && sceneIntent.propContext.length > 0) prompt += `- Necessary Props: ${sceneIntent.propContext.join(', ')}\n`;

    // Stronger fallback guardrail
    if (!sceneIntent.location && !sceneIntent.action) {
        prompt += `\nANTI-SCENE-DRIFT GUARDRAIL: You MUST generate exactly what is described in the Core Request. Do not invent a room or forest if one is not asked for.\n\n`;
    } else {
        prompt += `\nANTI-SCENE-DRIFT GUARDRAIL: You MUST honor the requested location and setting above. Do not hallucinate or reinterpret the location into a different genre or environment (e.g. if the intent is a cafe, it must be a cafe; if an office, it must be an office).\n\n`;
    }

    if (extractedStyle) {
        prompt += `\n### ERA / WORLD CONSISTENCY (HIGH PRIORITY):
Match the environment to the character's visible wardrobe, props, and implied time period.
Inferred era: ${extractedStyle.impliedEra || 'None detected'}
World type: ${extractedStyle.impliedWorld || 'Neutral'}
Architecture direction: ${extractedStyle.architectureHints || 'Clean, abstract'}
Do not generate an environment that contradicts the character's clothing or prop language.
Constraints/Forbidden elements: ${extractedStyle.environmentMustAvoid || 'None'}\n\n`;

        prompt += `### STYLE ENVELOPE (VISUAL TREATMENT ONLY):
- Artistic Medium: ${extractedStyle.medium}
- Render Style: ${extractedStyle.renderStyle}
- Color Palette: ${extractedStyle.palette}
- Mood/Vibe: ${extractedStyle.mood}

ANTI-STYLE-DRIFT GUARDRAIL: This style envelope MUST ONLY affect the rendering look, colors, and visual treatment. It MUST NOT reinterpret the core scene intent nouns defined above.\n`;
    }

    if (cameraSetting) {
        prompt += `\n### CAMERA SHOT SIZE:\n`;
        prompt += `CRITICAL DIRECTIVE: You MUST frame this background composition as a ${cameraSetting} shot. Do NOT generate a wide room if a Close-Up or Medium shot is requested. The framing must match a ${cameraSetting} perspective of the ${sceneIntent.location || 'location'}.\n`;
    }

    const intents = buildHumanPlacementIntents(tokens, annotations);
    const intentBlock = intents.length > 0 ? formatPlacementIntents(intents) : "";
    if (intentBlock) {
        prompt += `\n### FOREGROUND STAGING & LAYOUT REQUIREMENTS:\n`;
        prompt += `CRITICAL DIRECTIVE: You MUST design the room layout to physically accommodate the following actions in the foreground or midground. `;
        prompt += `DO NOT generate the people, but DO generate the necessary empty tables, surfaces, or open floor space for them to occupy later:\n`;
        prompt += `${intentBlock}\n`;
        prompt += `\nANTI-DUPLICATION GUARDRAIL: If the human is described as drinking, reading, or holding an object (e.g. coffee, book, laptop), DO NOT generate those props on the table. Leave the table surface completely EMPTY and clean so the characters can be generated holding those items in the next compositing pass. Do NOT generate duplicate seating where the characters are intended to stand/sit, leave the space open.\n`;
    }

    prompt += `\nABSOLUTE FINAL NEGATIVE PROMPT: No people, no humans, nobody, empty, empty room, uninhabited, landscape only, scenery only, body parts, floating limbs.`;

    return prompt;
};

export const normalizeStyleOnlyRequest = (prompt: string, fallbackSubject: string): string => {
    const isJustStyle =
        prompt.trim() === '' ||
        /^(in the style of|style of|photography|cinematic|render|4k|8k|masterpiece|illustration|drawing|painting)[\s,]*$/i.test(prompt);

    if (isJustStyle) {
        return fallbackSubject ? `${fallbackSubject}, ${prompt}` : prompt;
    }
    return prompt;
};

export const buildStrictAnchorReplacementPrompt = (p: {
    bgPrompt: string,
    mergeStrategy: string,
    sceneLock: boolean,
    replaceAnchorSubjects: boolean,
    globalReplaceTarget: string,
    hasDepthMap: boolean,
    activeRefs: ReferenceSlot[],
    actorIdentitySets?: ActorIdentityReferenceSet[],
    tokens?: StageToken[],
    annotations?: StageAnnotation[],
    spatialFrame?: SpatialFrame
}): string => {
    const promptSafeActiveRefs = createPromptSafeReferenceSlots(p.activeRefs);
    const strictIdentitySets = (p.actorIdentitySets && p.actorIdentitySets.length > 0)
        ? p.actorIdentitySets.map((set) => ({
            ...set,
            biometricProfile: sanitizeReferenceAnalysisForPrompt(set.biometricProfile)
        }))
        : promptSafeActiveRefs
            .filter((r) => !!r.url)
            .map((r) => ({
                actorId: String(r.castId || r.index),
                actorLabel: r.name || `Reference ${r.index}`,
                primaryFaceAnchor: r.url,
                angleFaceAnchors: [],
                supportIdentityRefs: [],
                wardrobeRefs: [],
                biometricProfile: r.analysis,
                identityPriority: 'strict' as const
            }));

    const refLines = promptSafeActiveRefs.map(r => {
        let base = '';
        if (p.replaceAnchorSubjects) {
            base = `[REFERENCE: ${r.name || `Ref ${r.index}`}]: Use this exact image to define the target subject's identity and biometric morphology (face + head + neck + body build). Do NOT copy reference clothing, headwear fit, or logos unless explicitly requested.`;
        } else {
            base = `[REFERENCE: ${r.name || `Ref ${r.index}`}]: Use this exact image to define the identity, clothing, and traits of the target subject.`;
        }

        const profile = r.productionActorProfile || r.productionProfile;
        if (profile) {
            base += `\n\n` + buildProductionActorPromptContract(profile, `Ref ${r.index}`);
        }
        return base;
    });

    const identityFingerprintLines = promptSafeActiveRefs.map((r) => {
        const refLabel = r.name || `Ref ${r.index}`;
        const biometricText = (r.analysis || '').trim();
        const biometricClause = biometricText
            ? ` Use these biometric traits as mandatory identity anchors: "${biometricText}".`
            : '';
        return `- REFERENCE ${r.index} (${refLabel}): MUST be the exact same person as the reference stack. Preserve age appearance, sex presentation, skin texture, facial proportions, and distinctive face geometry exactly. No lookalike substitutions, no beautification, no rejuvenation, no ethnicity drift.${biometricClause}`;
    });

    let prompt = `You are a Strict Geometry Compositor. Your ONLY job is to replace the specified blank regions (silhouettes/cutouts) with the requested subjects.

CRITICAL DIRECTIVES:
1. Do NOT touch, alter, or hallucinate anything in the background. The background is pre-rendered and MUST remain identical.
2. Stay inside each target region coverage area, but in REPLACE mode you may remap subject silhouette/body proportions to match the mapped reference subject.
3. Preserve scene placement intent, feet/ground contact, and lighting integration; do NOT lock to anchor-body shape or exact anchor-body scale.
4. This is NOT a face-swap task. Replace full-subject identity and body morphology, not just the head.
5. SOURCE POLICY (REPLACE MODE): Identity references define WHO the subject is (face/head/body morphology). CLEAN_BG_PLATE defines HOW they are posed, where they are looking, what they are wearing, and how they are lit.
6. WARDROBE DETAIL LOCK (REPLACE MODE): Preserve anchor wardrobe details exactly, including hat/cap fit and any visible logo/emblem placement on that wardrobe item.
7. MASK SUPREMACY (REPLACE MODE): ANCHOR_GUIDE masked/cutout regions are hard replacement zones. Re-render full subjects from scratch inside those zones. Do NOT preserve anchor face/head/skin pixels within the masked regions.
8. PIXEL SOURCE LOCK (REPLACE MODE): CLEAN_BG_PLATE is environment/wardrobe/lighting context only. Never keep original anchor identity pixels inside replacement regions.
9. IDENTITY FINGERPRINT LOCK (REPLACE MODE): Each replacement subject MUST remain the exact person from its mapped reference stack. Randomly generating a similar person is a hard failure.
10. GAZE/HEAD POSE LOCK (REPLACE MODE): Match each target subject's head orientation and eye gaze from CLEAN_BG_PLATE at that location. Do NOT default to camera-facing portrait orientation unless the anchor subject is camera-facing.
11. LIGHTING LOCK (REPLACE MODE): Match local scene lighting from CLEAN_BG_PLATE at region boundaries (key/fill direction, shadow softness, color temperature). Do NOT import lighting style from identity references.`;

    const heightRelationshipBlock = buildHeightRelationshipLockBlock({
        notes: p.bgPrompt,
        tokens: p.tokens || [],
        annotations: p.annotations || []
    });
    const spatialControlBlock = buildStagingSpatialControlBlock({
        referenceSlots: promptSafeActiveRefs,
        tokens: p.tokens || [],
        annotations: p.annotations || [],
        spatialFrame: p.spatialFrame,
        includeTokenMap: true
    });
    const referenceIdentityBlock = buildReferenceStackIdentitySourceBlock(promptSafeActiveRefs);

    if (heightRelationshipBlock) {
        prompt += `\n\n### HEIGHT RELATIONSHIP INSTRUCTIONS\n${heightRelationshipBlock}`;
    }
    if (spatialControlBlock) {
        prompt += `\n\n${spatialControlBlock}`;
    }
    if (referenceIdentityBlock) {
        prompt += `\n\n${referenceIdentityBlock}`;
    }

    if (p.sceneLock) {
        prompt += `\n4. SCENE LOCK ACTIVE: ${SCENE_LOCK_NEGATIVE_TOKENS}`;
    }

    if (p.hasDepthMap) {
        prompt += `\n5. SPATIAL HINT AVAILABLE: Use the staged layout as an estimated visual composition helper for actor layering and occlusion. Do not treat it as precise or authoritative geometry.`;
    }

    if (p.replaceAnchorSubjects) {
        const specificMaps: string[] = [];
        const hasTokenTargets = Boolean(p.tokens && p.tokens.length > 0);
        const hasExplicitTargets = promptSafeActiveRefs.some((ref) => (ref.target || '').trim().length > 0);
        const dominantSingleSubjectFallback = promptSafeActiveRefs.length === 1 && !hasExplicitTargets && !hasTokenTargets;
        
        // Explicit UI Target Overrides
        promptSafeActiveRefs.forEach(ref => {
            const targetVal = (ref.target || '').trim();
            let dnaMandate = '';
            if (ref.analysis && ref.analysis.trim()) {
                dnaMandate = ` CRITICAL BIOMETRIC OVERRIDE: Specifically alter the generated subject's physical body, height, weight, and traits to perfectly match this DNA profile: "${ref.analysis.trim()}".`;
            }
            if (targetVal) {
                specificMaps.push(`- Identify the subject physically located at/described as "${targetVal}" in the anchor image. ERADICATE their original identity and REPLACE THEM ENTIRELY with the subject shown in Reference ${ref.index} (${ref.name || 'Subject'}).${dnaMandate}`);
            }
        });

        // Spatial Token Inference Fallback
        if (specificMaps.length === 0 && p.tokens && p.tokens.length > 0) {
            const orderedRefs = [...promptSafeActiveRefs].sort((a, b) => a.index - b.index);
            p.tokens.forEach((token, tokenIndex) => {
                const ref = promptSafeActiveRefs.find(r => r.castId === token.castId) || orderedRefs[tokenIndex];
                if (ref) {
                    const x = Math.round(Number(token.x) || 0);
                    const y = Math.round(Number(token.y) || 0);
                    const w = Math.round(Number(token.width) || 0);
                    const h = Math.round(Number(token.height) || 0);
                    const tag = (token.tag || '').trim();
                    
                    let dnaMandate = '';
                    if (ref.analysis && ref.analysis.trim()) {
                        dnaMandate = ` CRITICAL BIOMETRIC OVERRIDE: Specifically alter the generated subject's physical body, height, weight, and traits to perfectly match this DNA profile: "${ref.analysis.trim()}".`;
                    }
                    specificMaps.push(`- The subject occupying anchor BBOX [${x}, ${y}, ${w}, ${h}]${tag ? ` ("${tag}")` : ''} MUST be replaced by the subject in Reference ${ref.index} (${ref.name || 'Subject'}).${dnaMandate}`);
                }
            });
        }

        if (specificMaps.length > 0) {
            prompt += `\n6. CRITICAL REPLACEMENT MAP (MANDATORY IDENTITY TARGETING):\n${specificMaps.join('\n')}\nWARNING: You MUST enforce this exact positioning. DO NOT rely on visual similarity between the reference faces and the original anchor bodies to decide who goes where. You MUST strictly swap the identities into the physical locations defined above. Randomly swapping these characters is a FAILURE.\nFULL-SUBJECT REPLACEMENT LOCK (NON-NEGOTIABLE): This is NOT a face-swap. Replace each target subject's full visible identity and build (face, head shape, hairline, neck, shoulder width, torso build, limb thickness, overall body proportions). Keeping the anchor body and only changing the head is a hard failure.\nOMNIPOTENT OBLITERATION DIRECTIVE: When replacing subjects, you are FORBIDDEN from preserving the anchor's original facial structure, hair, head shape, or body build. You MUST completely overwrite their biological traits to match the Reference Subject and their Biometric Profile, EVEN IF it breaks the original silhouette.\nWARDROBE CONTINUITY (CRITICAL): Unless the Biometric Override explicitly requests a different outfit, you MUST perfectly preserve the EXACT original clothing, suits, and attire worn by the humans in the anchor image. Re-dress your generated subjects in those exact anchor outfits. Do NOT use the casual clothing from the Reference images.\nHEADWEAR/LOGO CONTINUITY (CRITICAL): If the anchor subject wears a hat/cap/headwear, preserve its fit geometry and visible logo/emblem exactly (position, scale, and orientation).\nGAZE/HEAD POSE CONTINUITY (CRITICAL): Preserve head yaw/pitch/roll and eye gaze direction from the mapped anchor subject at this location. Do NOT make subjects face camera unless the anchor subject does.\nLIGHTING CONTINUITY (CRITICAL): Match local key/fill and color temperature from CLEAN_BG_PLATE pixels around the mapped region boundary.\nANTI-HEAD-SWAP PIXEL RULE (CRITICAL): Inside each mapped replacement region, do NOT keep anchor facial/head/skin pixels. Re-synthesize the entire subject body from the mapped identity references while preserving anchor pose, gaze, wardrobe, and lighting continuity.`;
        } else if (dominantSingleSubjectFallback) {
            const onlyRef = promptSafeActiveRefs[0];
            prompt += `\n6. SINGLE-SUBJECT DOMINANT REPLACEMENT LOCK (MANDATORY): Identify the single most prominent, camera-dominant human subject in the anchor image and replace that exact subject entirely with the person from Reference ${onlyRef.index} (${onlyRef.name || 'Subject'}).\n- This is a one-person identity overwrite, not a vibe match.\n- Preserve the anchor subject's pose, gaze direction, framing, wardrobe, props, and background.\n- Overwrite the anchor subject's face, head shape, hairline, neck, shoulder width, and body build to match Reference ${onlyRef.index} exactly.\n- If the anchor subject differs from Reference ${onlyRef.index} in sex presentation, age appearance, facial structure, skin texture, or ethnicity-presenting features, those anchor traits must be replaced by the reference-defined identity.\n- Do NOT keep the anchor body and only change the head.\n- Do NOT invent a similar-looking new person.\n- If multiple humans are visible, replace only the most visually dominant human subject and leave all others unchanged.`;
        } else {
            prompt += `\n6. REPLACE ANCHOR SUBJECTS: Disregard the original subjects defined in the anchor plate. Completely overwrite them with the new Reference/Subject identities. This is a full-subject biometric replacement, not a loose resemblance transfer. Do NOT invent a lookalike.`;
        }
    }

    prompt += `\n\n=== REFERENCES ===\n${refLines.length > 0 ? refLines.join('\n') : "No direct image references provided. Rely on text description."}`;
    if (identityFingerprintLines.length > 0) {
        prompt += `\n\n=== PER-REFERENCE IDENTITY FINGERPRINT LOCK ===\n${identityFingerprintLines.join('\n')}`;
    }
    if (strictIdentitySets.length > 0) {
        prompt += `\n\n### IDENTITY PRECEDENCE\n`;
        prompt += p.replaceAnchorSubjects
            ? [
                "Use actor reference stacks as the definitive source of full-subject identity, not just facial identity.",
                "Treat any style analysis or anchor-body resemblance as secondary guidance only.",
                "If any conflict exists, preserve reference-defined identity over anchor-body retention.",
                "NO LOOKALIKE POLICY: Never generate a new person who merely resembles the reference."
            ].join('\n')
            : buildIdentityPrecedenceBlock({
                hasFaceAnchors: strictIdentitySets.length > 0,
                hasActorReferences: strictIdentitySets.length > 0,
                hasSubjectStyleAnalysis: promptSafeActiveRefs.some((r) => !!(r.analysis || '').trim())
            });
        prompt += `\n\n### ${p.replaceAnchorSubjects ? 'FULL-SUBJECT IDENTITY LOCK' : 'FACE IDENTITY LOCK'}\n`;
        prompt += buildStrictFaceIdentityLockBlock({
            actorIdentitySets: strictIdentitySets,
            allowWardrobeChange: !p.replaceAnchorSubjects,
            multiActor: strictIdentitySets.length > 1
        });
        if (p.replaceAnchorSubjects) {
            prompt += `\n\n### BODY IDENTITY LOCK\nPreserve replacement subject body morphology from references (height impression, shoulder width, neck thickness, torso build, limb thickness, and overall silhouette tendencies) while keeping anchor-scene pose, placement, wardrobe continuity, and camera framing.`;
            prompt += `\n\n### NO FACE-SWAP PROTOCOL\n- Hard failure if output keeps anchor body and changes only head/face.\n- Hard failure if neck/shoulder/torso build remains anchor-like while only facial features are replaced.\n- Required behavior: full-subject biometric remap (face + head + neck + body build) with anchor wardrobe continuity.\n- Preserve anchor pose/gaze orientation at each mapped location.\nIDENTITY LOCK: FULL_SUBJECT_STRICT\nNO_FACE_SWAP: TRUE\nBODY_MORPH_REQUIRED: TRUE\nPOSE_GAZE_LOCK: TRUE\nLIGHTING_FROM_SCENE_ONLY: TRUE\nWARDROBE_FROM_ANCHOR_ONLY: TRUE`;
        } else {
            prompt += `\n\nIDENTITY LOCK: FACE_STRICT`;
        }
    }

    prompt += p.replaceAnchorSubjects
        ? `\n\n=== OVERALL SCENE & STYLE / CREATIVE INTENT (MANDATORY) ===\n${p.bgPrompt || "No additional scene, style, or action direction."}\nHonor the scene, environment, mood, lighting, style, and action content of this direction fully.\n\n=== IDENTITY GUARD ===\nApply this direction to the locked selected-cast reference actor(s) only. Do not infer or generate a new subject from this text. Do not change the actor's face, identity, age, body type, skin tone, hairline, facial hair, expression baseline, or likeness.\n\n=== SCENE LOCK ===\nPreserve the existing background composition, typography, logo placement, colors, props, camera, layout, and environment from CLEAN_BG_PLATE. Scene DNA may describe background/layout only and is never an identity source.\n\n=== NEGATIVE IDENTITY DRIFT RULES ===\nDo not create a different person. Do not average the actor with the background image. Do not reinterpret the actor from text or Scene DNA. No random similar face. No partial likeness only.`
        : `\n\n=== OVERALL SCENE & STYLE ===\n${p.bgPrompt || "A generic scene."}`;

    return prompt;
};



export type BuildIdentityPrecedenceBlockArgs = {
  hasActorReferences: boolean;
  hasFaceAnchors: boolean;
  hasSubjectStyleAnalysis: boolean;
};

export function buildIdentityPrecedenceBlock(args: BuildIdentityPrecedenceBlockArgs): string {
  const { hasActorReferences, hasFaceAnchors, hasSubjectStyleAnalysis } = args;

  if (!hasActorReferences && !hasFaceAnchors) return '';

  const lines = [
    "Use the actor reference stack and face anchors as the definitive source of facial identity.",
    "Treat any subject or style analysis as secondary guidance only.",
    "Do not let style analysis, aesthetic inference, or subject summarization override the exact facial likeness shown in the reference images.",
    "If there is any conflict, preserve the reference-defined face exactly."
  ];

  if (hasSubjectStyleAnalysis) {
    lines.push("Subject/style analysis may help with scene mood, wardrobe tone, or environment styling only, and may not redefine the actor's face.");
  }

  return lines.join('\n');
}

export type BuildStrictFaceIdentityLockBlockArgs = {
  actorIdentitySets?: ActorIdentityReferenceSet[];
  allowWardrobeChange?: boolean;
  multiActor?: boolean;
};

export function buildStrictFaceIdentityLockBlock(args: BuildStrictFaceIdentityLockBlockArgs): string {
  const { actorIdentitySets = [], allowWardrobeChange = false, multiActor = false } = args;

  const biometricOverrides = actorIdentitySets.map(set => {
    const analysis = set.biometricProfile;
    if (analysis && analysis.trim()) {
        const actorName = set.actorLabel || 'the subject';
        return `CRITICAL BIOMETRIC OVERRIDE for ${actorName}: Specifically alter this subject's physical body, height, weight, and traits to perfectly match this DNA profile: "${analysis.trim()}".`;
    }
    return null;
  }).filter(Boolean) as string[];

  const base = [
    "Facial identity is non-negotiable and must remain locked to the provided actor reference images.",
    "Preserve the actor's exact facial geometry and feature relationships.",
    "Match the same person's eye spacing, eye shape, brow shape, nose structure, lip shape, jawline, cheek structure, chin, hairline, and skin tone.",
    "Do not create a similar-looking person.",
    "Do not beautify, idealize, or genericize the face.",
    "Do not let costume, scene styling, or cinematic treatment alter facial identity.",
    allowWardrobeChange
      ? "Wardrobe and styling may adapt only where requested, but the face must remain the same person."
      : "WARDROBE LOCK: You MUST preserve the exact same clothing, colors, and styling for all subjects. Do NOT change their outfits into casual wear or different suits. Retain the exact anchor wardrobe.",
  ];

  const actorSpecific = actorIdentitySets.length
    ? [
        "Use the primary face anchor as the definitive identity source.",
        "Use angle face anchors only to preserve the same face across alternate camera views.",
        "Use wardrobe references only for clothing and styling, not for facial identity.",
        "Match each actor to that actor's own reference inputs only.",
      ]
    : [];

  const multi = multiActor
    ? [
        "Preserve each actor according to that actor's own reference stack only.",
        "Do not blend, swap, average, or transfer facial traits between actors.",
      ]
    : [];

  const negatives = [
    "No lookalikes.",
    "No actor blending.",
    "No ethnicity-presenting facial drift.",
    "No trait borrowing between actors.",
    "No face changes caused by wardrobe changes.",
    "No wardrobe invention, no accessory invention, and no headwear invention.",
  ];

  return [...base, ...biometricOverrides, ...actorSpecific, ...multi, ...negatives].join('\n');
}

export type BuildEnvironmentConsistencyLockBlockArgs = {
  environmentText?: string;
  preserveArchitecture?: boolean;
  preserveLayout?: boolean;
  preserveSetDressing?: boolean;
};

export function buildEnvironmentConsistencyLockBlock(_args: BuildEnvironmentConsistencyLockBlockArgs): string {
  return [
    "ENVIRONMENT IMMUTABILITY (HARD): The source anchor image defines the canonical location. This location may NOT be changed.",
    "Preserve the exact same room, architecture, layout, and set dressing as shown in the scene anchor.",
    "Do not relocate the scene to a different place, city, biome, set, or architectural style.",
    "Do not convert indoor scenes to outdoor scenes. Do not convert outdoor scenes to indoor scenes.",
    "Do not shift time-of-day, weather, season, or overall environmental mood away from the anchor.",
    "Maintain the same wall positions, window arrangement, ceiling lines, lighting fixture placement, glass partition layout, furniture placement, and overall spatial proportions.",
    "CRITICAL FURNITURE ENFORCEMENT: DO NOT add, generate, or invent any new furniture (desks, tables, chairs, benches) that was not present in the anchor image.",
    "CRITICAL ARCHITECTURE ENFORCEMENT: Do not alter room architecture or move walls, windows, or glass partitions. Keep the wall paneling exactly the same width and material.",
    "Reframe the camera within the same room.",
    "Do not redesign, reinterpret, or substitute the environment.",
    "If the shot is wider, reveal more of the same room rather than inventing a new version of it.",
    "Do not invent new ceiling layouts or substitute a similar-looking room.",
    "Do not remove or relocate major fixtures or furniture geography unless explicitly directed."
  ].join('\n');
}

export type BuildSceneLayoutLockBlockArgs = {
  expectedActorCount?: number;
  preserveActorOrder?: boolean;
  preserveRelativePositions?: boolean;
  preserveSpacing?: boolean;
  preservePoseRoles?: boolean;
  isShotVariant?: boolean;
};

export function buildSceneLayoutLockBlock(args: BuildSceneLayoutLockBlockArgs): string {
  const base = [
    args.isShotVariant
      ? "TRUTH LOCK: Preserve the underlying layout and blocking of the scene."
      : "Preserve the exact same scene layout and blocking shown in the source anchor.",
    "Keep the same people in the same absolute geographical positions.",
    "ACTOR POSITION LOCK: Do NOT move an actor to a new world position to satisfy a crop, close-up, wide shot, or visibility note. Move the camera/crop instead.",
    "RELATIONSHIP LOCK: Preserve actor-to-actor and actor-to-object relationships exactly. If a subject is riding, sitting on, leaning on, holding, touching, hugging, carrying, or standing beside something in the anchor, preserve that same relationship and contact points.",
    "MOUNT/SEAT LOCK: Do not turn a mounted/seated subject into a standing subject, and do not detach a subject from the animal, vehicle, chair, surface, or prop they are using in the source anchor.",
    "CAMERA PIVOT RULE: To change a camera angle, you must physically move the camera around the subjects, revealing the appropriate new background area. DO NOT rotate the subjects in place to face the camera. The subjects' physical orientation relative to the room MUST remain permanently locked.",
    "PARALLAX REQUIREMENT: Camera-angle presets must show real 3D viewpoint change (foreground/background overlap shifts, different wall or column reveals, and perspective depth changes) proving the camera moved in space.",
    "CRITICAL HEIGHT & SCALE LOCK: Maintain the exact relative height differences, body scale, and physical build between all subjects.",
    "Maintain the same left-to-right ordering, seating/standing roles, spacing, and subject-to-room relationships.",
    "Only change the camera framing and viewpoint.",
    "Do not add, remove, duplicate, merge, or invent any additional people.",
    "CROWD UNIQUENESS LOCK: Background extras must remain unique individuals. Do not mirror-copy or stamp repeated crowd figures on opposite sides of frame.",
    "BACKGROUND CHARACTER LOCK: You MUST preserve the exact physical appearance, hair color, and clothing of any background characters (e.g., judges, extras). Do not alter their outfits, hair, or ethnicity.",
    "No shifting actor positions, no swapping left/right ordering."
  ];

  if (!args.isShotVariant) {
    base.push("CRITICAL POSTURE LOCK: Do NOT change a standing subject into a seated subject. Do NOT change a seated subject into a standing subject. They MUST retain their original anchor posture.");
    base.push("No moving subjects closer or farther unless caused only by camera reframing.");
  } else {
    base.push("CINEMATIC CONTINUITY: Preserve scene geography and performance blocking while allowing natural crop/headroom drift required by the requested camera move.");
  }

  if (args.expectedActorCount !== undefined) {
    if (args.expectedActorCount > 0) {
      base.push(`CRITICAL DIRECTIVE: The scene must contain exactly ${args.expectedActorCount} visible person(s). Do not hallucinate crowds.`);
    } else {
      base.push(`CRITICAL DIRECTIVE: Preserve all visible people already present in the anchor image. Do not hallucinate extra crowds or remove existing subjects.`);
    }
  }

  return base.join('\n');
}

export function buildActorPosePositionLockBlock(): string {
  return [
    "### DEFAULT ACTOR POSITION & POSE LOCK (HARD)",
    "Unless a user instruction explicitly asks to move, reposition, re-pose, stand, sit, turn, relocate, remount, dismount, or change an actor's action, every actor must keep the same world position, pose, gesture, gaze, and subject-to-object relationship from the source result.",
    "Shot presets and camera notes authorize camera movement only: crop, lens, camera height, orbit, perspective, headroom, and subject size in frame.",
    "Visibility notes are NOT reblocking instructions. Requests such as 'keep the elephant head in view', 'include the prop', 'show both faces', or 'keep the doorway visible' mean adjust camera/crop/composition while preserving actor position and pose.",
    "Do not move an actor closer to the camera, off a mount, away from a prop, or into a new pose just to make the requested shot easier.",
    "If the requested shot cannot include every requested visible element without moving actors, choose the closest camera/crop that preserves the original blocking."
  ].join('\n');
}

export function buildCameraAxisContinuityBlock(preset: ShotPresetDefinition): string {
  const lines = [
    "### 180-DEGREE CAMERA AXIS & VIEWPOINT SIMULATION (HARD)",
    "Infer the scene action axis from the source anchor using the dominant subject relationship, screen direction, gaze/action flow, mounts/seats/props, and the main path or set geometry.",
    "Keep every alternate shot on the same side of that action axis. Do not cross the line, reverse screen direction, swap left/right geography, or flip the subject relationship.",
    "The camera may move only within the same-side 180-degree arc around the locked subject positions.",
    "Do not fake an angle by keeping the same front-facing background and merely cropping, zooming, or sliding the frame.",
    "A spatial shot must show viewpoint parallax: foreground/background overlap changes, side surfaces become visible or hidden, landmarks shift relative to subjects, and occlusion changes naturally.",
    "Preserve the same environment and landmark ordering. Infer plausible adjacent side/top/low surfaces from the source, but do not redesign the set, move landmarks, or invent a new location.",
    "Keep actor world positions and pose locked while the camera moves around them."
  ];

  if (preset.orbit === 'threeQuarterLeft' || preset.orbit === 'threeQuarterRight' || preset.orbit === 'profileLeft' || preset.orbit === 'profileRight') {
    lines.push("ORBIT PROOF: Reveal real side-plane information and shifted background alignment from the requested side while staying on the same side of the 180-degree line.");
  }

  if (preset.orbit === 'overShoulder') {
    lines.push("OTS PROOF: The foreground shoulder/head must come from the same-side camera arc and must not reverse the target subject's screen direction or relationship.");
  }

  if (preset.elevation === 'high') {
    lines.push("HIGH-ANGLE PROOF: Show top surfaces, floor/ground layout, and downward occlusion changes from above without crossing the action axis.");
  } else if (preset.elevation === 'low') {
    lines.push("LOW-ANGLE PROOF: Show underside/canopy/ceiling/sky or upward perspective cues from below without crossing the action axis.");
  }

  return lines.join('\n');
}

export type BuildShotVariantPromptArgs = {
  sourceResultUrl: string;
  sceneTruth: import('../types/shots').SceneTruthSnapshot;
  actorIdentitySets?: ActorIdentityReferenceSet[];
  shotsActorOptions?: ShotsActorOption[];
  packId: ShotPackId;
  presetId: ShotPresetId;
  locks: ShotLocks;
  environmentText?: string;
  subjectActionText?: string;
  lightingText?: string;
  expectedActorCount?: number;
  coveragePurpose?: string;
  targetRole?: string;
  sceneType?: string;
  directedSlot?: DirectedShotSlot;
  hasSubjectStyleAnalysis?: boolean;
  sourceStyleLock?: string;
};

export function buildWardrobeAndPropContinuityLockBlock(): string {
  return [
    "WARDROBE & PROP CONTINUITY LOCK (HARD):",
    "Preserve the exact same visible wardrobe, accessories, and props from the source result image.",
    "Do not invent any new clothing items, garments, layers, accessories, or props that are not clearly present in the source anchor.",
    "Do not add headwear of any kind unless it is clearly present in the source image.",
    "This includes hats, hoods, veils, scarves, wraps, crowns, helmets, headbands, turbans, or any other head covering.",
    "Do not add jewelry, necklaces, earrings, bracelets, rings, belts, sashes, capes, shawls, cloaks, gloves, or armor unless they are clearly present in the source image.",
    "Do not add handheld props, staffs, weapons, tools, books, cups, bags, torches, or scene objects to the actor unless they are clearly present in the source image.",
    "Do not restyle, embellish, upgrade, fantasy-ize, royal-ize, or accessorize the character.",
    "If a wardrobe detail is not clearly visible in the source, do not invent it.",
    "If the source character has no head covering, the generated shot must also have no head covering.",
    "Preserve wardrobe ownership correctly. Do not transfer clothing or props from one actor to another.",
    "No new costume layers. No added costume complexity. No decorative additions."
  ].join('\n');
}

export function buildExactPoseLockBlock(isShotVariant = false): string {
  if (isShotVariant) {
    return [
      "CINEMATIC POSE CONTINUITY:",
      "Preserve the underlying body pose, gesture timing, and exact anatomical proportions from the source result image.",
      "Preserve the performance beat and pose logic. Allow limbs to be naturally occluded or revealed based on the new camera geometry.",
      "Preserve seated, mounted, standing, leaning, holding, touching, and riding relationships exactly. Do not detach a subject from a mount/seat/prop or move them beside it.",
      "Do not solve a close-up or alternate angle by re-staging the actor. The actor remains in the same physical place and pose; only the camera changes.",
      "Do not shrink the head. Do not widen the shoulders. Do not mutate the face or hair structure.",
      "Do not reinterpret the performance. Treat the source result as a frozen moment in time viewed from a different camera.",
      buildPoseCoherenceContract({
        strictness: 'scene',
        subjectScope: 'visible_body',
        stanceType: 'anchor_preserved',
        footingMode: 'anchor_preserved',
        twistAllowed: false,
        twistIntensity: 0
      })
    ].join('\n');
  }

  return [
    "EXACT POSE LOCK (HARD):",
    "Preserve the exact same body pose from the source result image.",
    "Do not reinterpret the performance.",
    "Do not create a new gesture.",
    "Preserve the performance beat and pose logic. Allow limbs/hands to be naturally hidden or revealed by the new camera viewpoint without forcing artificial visibility.",
    "Do not re-pose the character to better fit the shot.",
    "The only allowed change is camera position, lens, crop, and perspective.",
    "Preserve seated, mounted, standing, leaning, holding, touching, and riding relationships exactly. Do not detach a subject from a mount/seat/prop or move them beside it.",
    "Treat the source result as a frozen moment in time viewed from a different camera.",
    "In close-up framing, preserve the same facial expression, gaze direction, head angle, and shoulder tension implied by the source pose.",
    "If limbs are cropped out by framing, crop naturally without inventing a new gesture or replacement pose.",
    "If a limb or hand is partially hidden in the anchor, infer only the hidden continuation of the same pose, not a new pose.",
    "Do not convert a symmetrical pose into an asymmetrical one or vice versa.",
    "Do not change weight distribution or balance.",
    "No re-acting, no new animation beat, no new gesture.",
    buildPoseCoherenceContract({
      strictness: 'scene',
      subjectScope: 'visible_body',
      stanceType: 'anchor_preserved',
      footingMode: 'anchor_preserved',
      twistAllowed: false,
      twistIntensity: 0
    })
  ].join('\n');
}

export function buildShotPresetBlock(preset: ShotPresetDefinition): string {
  const lines = [
    "### SHOTS PRESET BLOCK (AUTHORITATIVE: APPLY EXACTLY ONCE)",
    `- Preset: ${preset.label}`,
    `- Framing Intent: ${preset.shotInstruction}`,
    `- Lens Note: ${preset.defaultLensNote}`,
    `- Focal Feel: ${preset.opticalIntent.focalFeel}`,
    `- Compression Behavior: ${preset.opticalIntent.compressionBehavior}`,
    `- Depth-of-Field Behavior: ${preset.opticalIntent.depthOfFieldBehavior}`,
    `- Foreground/Background Separation: ${preset.opticalIntent.separationStyle}`,
    `- Crop Rule: ${preset.cropRule}`,
    "- Preset-Specific Constraints:"
  ];

  preset.negatives.forEach(neg => {
    lines.push(`  - ${neg}`);
  });

  lines.push('');
  lines.push(buildShotDesignationComplianceBlock(preset));

  return lines.join('\n');
}

export function buildShotDesignationComplianceBlock(preset: ShotPresetDefinition, finalHold = false): string {
  const lines = [
    finalHold
      ? "### SHOT DESIGNATION HOLD (HARD)"
      : "### SHOT DESIGNATION COMPLIANCE (HARD)",
    finalHold
      ? `The selected preview must remain unmistakably a ${preset.label}. Refine quality only; do not drift into a different camera designation.`
      : `The generated image must read immediately and unmistakably as a ${preset.label}. This is not optional style text; it is the camera assignment.`
  ];

  switch (preset.framing) {
    case 'closeup':
      lines.push('- FRAMING: Tight face-and-upper-shoulders composition. Face is the dominant visual mass, with only minimal chest/shoulder context.');
      lines.push('- SCALE CHECK: Do not show waist, hips, knees, feet, or full body. Background must be secondary and softened.');
      break;
    case 'mediumClose':
      lines.push('- FRAMING: Chest-up / upper-torso composition. Head, shoulders, and chest are visible with readable expression.');
      lines.push('- SCALE CHECK: Looser than close-up but not a waist-up medium. Do not show full body or large empty environment.');
      break;
    case 'medium':
      lines.push('- FRAMING: Waist-up or hip-up composition with gestures and body posture readable.');
      lines.push('- SCALE CHECK: Subject remains dominant, but enough environment remains visible to show spatial context.');
      break;
    case 'wide':
      lines.push('- FRAMING: Wide environmental coverage. Subject(s) occupy a smaller portion of the frame and the scene geography is clearly readable.');
      lines.push('- SCALE CHECK: Include meaningful foreground/midground/background context. Do not crop into portrait, medium, or close-up framing.');
      break;
    case 'full':
      lines.push('- FRAMING: Full-body coverage. Preserve head-to-toe readability and physical ground contact.');
      break;
  }

  switch (preset.elevation) {
    case 'high':
      lines.push('- ELEVATION: Camera is physically above the subject eye line and looking downward.');
      lines.push('- HIGH-ANGLE PROOF: Show top surfaces, floor/ground plane, downward perspective, and subject lower in frame. Avoid eye-level, low-angle, or flat front-on views.');
      break;
    case 'low':
      lines.push('- ELEVATION: Camera is physically below the subject chest/waist line and looking upward.');
      lines.push('- LOW-ANGLE PROOF: Show upward perspective cues such as underside/canopy/ceiling/sky reveal, taller subject presence, and lower camera placement. Avoid top-down or eye-level views.');
      break;
    case 'eye':
      lines.push('- ELEVATION: Camera remains near natural eye/chest height unless the orbit specifically requires an over-shoulder foreground layer.');
      break;
  }

  switch (preset.orbit) {
    case 'threeQuarterLeft':
      lines.push('- ORBIT: Camera moves to the subject/scene left side by roughly 35-55 degrees. Show real side-plane/parallax change, not a frontal crop.');
      lines.push('- 3/4 LEFT PROOF: One side of the face/body is favored, background alignment shifts left-side perspective, and the result is neither full front nor strict profile.');
      break;
    case 'threeQuarterRight':
      lines.push('- ORBIT: Camera moves to the subject/scene right side by roughly 35-55 degrees. Show real side-plane/parallax change, not a frontal crop.');
      lines.push('- 3/4 RIGHT PROOF: One side of the face/body is favored, background alignment shifts right-side perspective, and the result is neither full front nor strict profile.');
      break;
    case 'profileLeft':
    case 'profileRight':
      lines.push('- ORBIT: Strict side-profile camera relationship, roughly 80-100 degrees from front.');
      lines.push('- PROFILE PROOF: Side silhouette dominates. Do not show both eyes equally; do not fall back to 3/4 or front-facing portrait.');
      break;
    case 'overShoulder':
      lines.push('- ORBIT: True over-the-shoulder coverage. A near foreground shoulder/head wedge partially frames the image, with the target subject visible beyond it.');
      lines.push('- OTS PROOF: Foreground subject is closer to camera, larger, and softly defocused or edge-cropped; target subject remains the focus. Do not make this a normal two-shot.');
      break;
    case 'front':
      lines.push('- ORBIT: Front-readable camera relationship. If the source pose is not frontal, preserve the pose while keeping the requested front coverage and crop.');
      break;
  }

  if (preset.targetMode === 'pair') {
    lines.push('- TARGET MODE: Pair coverage. Include both intended subjects with clear foreground/background or shared-frame relationship.');
  } else if (preset.targetMode === 'single') {
    lines.push('- TARGET MODE: Single-subject emphasis. Keep the primary subject dominant without adding or duplicating actors.');
  } else {
    lines.push('- TARGET MODE: Scene coverage. Prioritize the whole environment/subject relationship, not a portrait crop.');
  }

  if (preset.placement === 'leftThird') {
    lines.push('- COMPOSITION: Favor the subject/action on the left third unless scene continuity makes that impossible.');
  } else if (preset.placement === 'rightThird') {
    lines.push('- COMPOSITION: Favor the subject/action on the right third unless scene continuity makes that impossible.');
  } else {
    lines.push('- COMPOSITION: Center-weighted composition unless the directed shot plan specifies a target side.');
  }

  lines.push('- FAILURE CONDITION: If the frame could be mistaken for a generic crop of the source anchor, regenerate with stronger camera movement and clearer designation cues.');

  return lines.join('\n');
}

export function buildShotVariantPrompt(args: BuildShotVariantPromptArgs): string {
    const preset = SHOT_PRESETS[args.presetId];
    const safeSceneActionContext = stripShotDirectiveContamination(args.subjectActionText);
    
    let p = `OPERATION\n`;
    p += `Create a NEW CAMERA SETUP of the same scene continuity using the staged result image as the primary visual anchor.\n`;
    p += `SOURCE-OF-TRUTH PRIORITY (HARD): Anchor image > Shot Blueprint > Text instructions. If any text conflicts with the anchor image environment, the anchor image always wins.\n`;
    p += `${buildShotPresetBlock(preset)}\n\n`;

    p += `CHANGE\n`;
    p += `- camera only, not body pose\n`;
    p += `- camera angle\n`;
    p += `- lens / focal length\n`;
    p += `- crop / subject size in frame\n`;
    p += `- screen position\n`;
    p += `- headroom\n`;
    p += `- perspective\n`;
    p += `- physically plausible parallax from the new camera position\n\n`;
    p += `${buildActorPosePositionLockBlock()}\n\n`;
    p += `${buildCameraAxisContinuityBlock(preset)}\n\n`;

    p += `KEEP\n`;
    if (args.locks.identity) p += `- actor identity\n`;
    if (args.locks.wardrobe) p += `- wardrobe / hair / makeup\n`;
    if (args.locks.background) p += `- environment continuity\n`;
    if (args.locks.background) p += `- prop continuity\n`;
    if (args.locks.lighting) p += `- approximate lighting continuity\n`;
    if (args.environmentText) p += `- Scene Environment context (advisory only, cannot override anchor location/architecture): ${args.environmentText}\n`;
    if (safeSceneActionContext) p += `- Scene Action context: ${safeSceneActionContext}\n`;
    if (args.lightingText) p += `- Scene Lighting context: ${args.lightingText}\n\n`;

    if (args.locks.wardrobe) {
      p += `### WARDROBE & PROP LOCK\n`;
      p += `${buildWardrobeAndPropContinuityLockBlock()}\n\n`;
    }

    if (args.sourceStyleLock) {
      p += `- render medium continuity\n\n`;
      p += `### RENDER MEDIUM LOCK\n`;
      p += `${args.sourceStyleLock}\n`;
      p += `If the source image is stylized 3D / CGI, the generated shot MUST remain stylized 3D / CGI.\n`;
      p += `Do not convert the shot into live-action, photoreal film, realistic photography, or human realism.\n\n`;
    }

    p += `FORBIDDEN\n`;
    p += `- do not change pose geometry\n`;
    p += `- do not move, relocate, detach, remount, dismount, or re-stage any actor unless the user explicitly requested that actor movement\n`;
    p += `- do not re-gesture the actor\n`;
    p += `- do not alter arm spread, hand placement, torso bend, or head orientation\n`;
    p += `- do not add headwear, crowns, hats, hoods, scarves, veils, wraps, or helmets\n`;
    p += `- do not add jewelry, belts, sashes, capes, shawls, or extra costume layers\n`;
    p += `- do not add props or handheld objects not present in the source anchor\n`;
    p += `- do not invent wardrobe details that are not clearly visible in the source image\n`;
    p += `- do not transfer props or wardrobe pieces between actors\n`;
    p += `- do not reproduce the anchor framing\n`;
    p += `- do not return the same crop as the source image\n`;
    p += `- do not flatten back into the original source composition\n`;
    p += `- do not output a contact sheet, grid, or collage\n`;
    p += `- do not add cinematic black bars unless already present in the anchor\n`;
    p += `- No text, no watermark, no duplicate subjects, no distorted anatomy, no unrealistic perspective warping.\n`;

    if (args.actorIdentitySets && args.actorIdentitySets.length > 0) {
        p += `\n### ACTOR REFERENCE ANCHORS\n`;
        p += `CRITICAL: Use the provided actor reference stack images as identity anchors for the corresponding actors in the scene.\n`;
        p += `Preserve each actor according to that actor's own references.\n`;
        p += `Do not merge, swap, or blend identities, wardrobe ownership, accessories, or distinguishing facial traits across actors.\n`;
        p += `Preserve side-dependent details and ensure stable traits across angles.\n`;
    }

    const hasFaceAnchors = args.actorIdentitySets?.some(s => !!s.primaryFaceAnchor || s.angleFaceAnchors.length > 0) || false;
    const hasActorReferences = (args.actorIdentitySets?.length || 0) > 0;
    
    p += `\n### IDENTITY PRECEDENCE\n`;
    p += `${buildIdentityPrecedenceBlock({
        hasFaceAnchors,
        hasActorReferences,
        hasSubjectStyleAnalysis: !!args.hasSubjectStyleAnalysis
    })}\n`;

    const identityArgs: BuildStrictFaceIdentityLockBlockArgs = {
        actorIdentitySets: args.actorIdentitySets,
        allowWardrobeChange: !args.locks.wardrobe,
        multiActor: (args.actorIdentitySets?.length || 0) > 1
    };
    p += `\n### FACE IDENTITY LOCK\n${buildStrictFaceIdentityLockBlock(identityArgs)}\n`;
    
    p += `\n${buildSceneTruthSnapshotBlock(args.sceneTruth)}\n`;
    
    p += `\n### ENVIRONMENT & LAYOUT GUARDRAILS (REINFORCEMENTS)\n`;
    p += `${buildEnvironmentConsistencyLockBlock({})}\n`;
    p += `${buildSceneLayoutLockBlock({ expectedActorCount: args.sceneTruth.expectedActorCount, isShotVariant: true })}\n`;
    p += `${buildExactPoseLockBlock(true)}\n`;
    
    p += buildDirectedSlotBlock(args.directedSlot, args.shotsActorOptions, false);

    p += `\nIDENTITY LOCK: FACE_STRICT\n`;

    return p;
}

export function buildDirectedSlotBlock(slot?: DirectedShotSlot, actorOptions?: ShotsActorOption[], isFinalRerender?: boolean): string {
  if (!slot) return '';

  const lines = [
    `\n### DIRECTED SLOT PLAN`
  ];

  let targetDisplay = 'the scene';
  if (slot.targetType === 'actor' && slot.targetActorId && actorOptions) {
     const actor = actorOptions.find(a => a.actorId === slot.targetActorId);
     if (actor) targetDisplay = `Actor ${actor.actorLabel}`;
  } else if (slot.targetType === 'pair') {
     const actor1 = actorOptions?.find(a => a.actorId === slot.targetActorId);
     const actor2 = actorOptions?.find(a => a.actorId === slot.secondaryActorId);
     if (actor1 && actor2) targetDisplay = `Actor ${actor1.actorLabel} and Actor ${actor2.actorLabel}`;
  }

  lines.push(`TARGET FOCUS: ${targetDisplay}`);
  
  if (slot.actionText) lines.push(`ACTION / INTENT: ${slot.actionText}`);
  if (slot.cameraFlavor && slot.cameraFlavor !== 'neutral') lines.push(`CAMERA FLAVOR: ${slot.cameraFlavor.toUpperCase()}`);
  if (slot.shotNotes) lines.push(`DIRECTOR NOTES: ${slot.shotNotes}`);
  if (slot.coveragePurpose) lines.push(`COVERAGE ROLE: ${slot.coveragePurpose}`);
  lines.push(`DIRECTED NOTES POLICY: Treat action/notes as camera, crop, focus, or visibility guidance unless they explicitly request moving, repositioning, or re-posing an actor. Do not re-stage actor positions to satisfy a visibility note.`);

  if (!isFinalRerender) {
    let differentiation = `DIFFERENTIATION MANDATE: This shot is part of a professional coverage set. `;
    differentiation += `You must uniquely compose this shot according to the directed slot plan (focusing on ${targetDisplay}) while strictly obeying all scene truth and identity locks.`;
    lines.push(differentiation);
  } else {
    lines.push(`COVERAGE REINFORCEMENT: Ensure the final render faithfully captures the directed slot purpose of the preview.`);
  }

  return lines.join('\n') + '\n';
}

export type BuildShotFinalRerenderPromptArgs = {
  sourceResultUrl: string;
  sceneTruth: import('../types/shots').SceneTruthSnapshot;
  selectedShotPreviewUrl: string;
  actorIdentitySets?: ActorIdentityReferenceSet[];
  shotsActorOptions?: ShotsActorOption[];
  presetId: ShotPresetId;
  locks: ShotLocks;
  environmentText?: string;
  subjectActionText?: string;
  lightingText?: string;
  expectedActorCount?: number;
  coveragePurpose?: string;
  targetRole?: string;
  sceneType?: string;
  directedSlot?: DirectedShotSlot;
  hasSubjectStyleAnalysis?: boolean;
  sourceStyleLock?: string;
};

export function buildShotFinalRerenderPrompt(args: BuildShotFinalRerenderPromptArgs): string {
  const preset = SHOT_PRESETS[args.presetId];

  let p = `OPERATION\n`;
  p += `Generate a higher-quality final render of the selected preview shot.\n`;
  p += `Use the original staged result image only as supporting scene continuity context.\n\n`;
  p += `SOURCE-OF-TRUTH PRIORITY (HARD): Selected preview framing + source anchor environment are authoritative. Text instructions cannot relocate the scene.\n\n`;
  p += `${buildShotDesignationComplianceBlock(preset, true)}\n\n`;

  p += `CHANGE\n`;
  p += `- Upscale and refine the detail\n\n`;
  p += `${buildActorPosePositionLockBlock()}\n\n`;
  p += `${buildCameraAxisContinuityBlock(preset)}\n\n`;

  p += `KEEP\n`;
  p += `- The exact composition, camera angle, crop, subject placement, and pose relationships from the preview shot\n`;
  if (args.actorIdentitySets && args.actorIdentitySets.length > 0) {
      p += `- actor identity (use reference images to reinforce fidelity)\n`;
  }
  if (args.locks.wardrobe) p += `- wardrobe / hair / makeup\n`;
  if (args.locks.background) p += `- environment continuity\n`;
  if (args.locks.background) p += `- prop continuity\n`;
  if (args.locks.lighting) p += `- approximate lighting continuity\n\n`;

  if (args.locks.wardrobe) {
    p += `### WARDROBE & PROP LOCK\n`;
    p += `${buildWardrobeAndPropContinuityLockBlock()}\n\n`;
  }

  if (args.sourceStyleLock) {
    p += `- render medium continuity\n\n`;
    p += `### RENDER MEDIUM LOCK\n`;
    p += `${args.sourceStyleLock}\n`;
    p += `The final render must preserve the same stylized source medium exactly.\n`;
    p += `Do not increase realism beyond the source medium.\n\n`;
  }

  p += `FORBIDDEN\n`;
  p += `- do not generate a new alternative shot\n`;
  p += `- do not reinterpret the scene into a different shot\n`;
  p += `- do not change framing, subject positions, or camera relationship\n`;
  p += `- do not zoom or crop differently\n`;
  p += `- do not rearrange subjects\n`;
  p += `- do not duplicate subjects\n`;
  p += `- do not add text or watermark\n`;
  p += `- do not add headwear, crowns, hats, hoods, scarves, veils, wraps, or helmets\n`;
  p += `- do not add jewelry, belts, sashes, capes, shawls, or extra costume layers\n`;
  p += `- do not add props or handheld objects not present in the source anchor\n`;
  p += `- do not invent wardrobe details that are not clearly visible in the source image\n`;
  p += `- do not transfer props or wardrobe pieces between actors\n`;

  const hasFaceAnchors = args.actorIdentitySets?.some(s => !!s.primaryFaceAnchor || s.angleFaceAnchors.length > 0) || false;
  const hasActorReferences = (args.actorIdentitySets?.length || 0) > 0;
  
  p += `\n### IDENTITY PRECEDENCE\n`;
  p += `${buildIdentityPrecedenceBlock({
      hasFaceAnchors,
      hasActorReferences,
      hasSubjectStyleAnalysis: !!args.hasSubjectStyleAnalysis
  })}\n`;

  const identityArgs: BuildStrictFaceIdentityLockBlockArgs = {
      actorIdentitySets: args.actorIdentitySets,
      allowWardrobeChange: !args.locks.wardrobe,
      multiActor: (args.actorIdentitySets?.length || 0) > 1
  };
  p += `\n### FACE IDENTITY LOCK\n${buildStrictFaceIdentityLockBlock(identityArgs)}\n`;
  
  p += `\n${buildSceneTruthSnapshotBlock(args.sceneTruth)}\n`;
    
  p += `\n### ENVIRONMENT & LAYOUT GUARDRAILS (REINFORCEMENTS)\n`;
  p += `${buildEnvironmentConsistencyLockBlock({})}\n`;
  p += `${buildSceneLayoutLockBlock({ expectedActorCount: args.sceneTruth.expectedActorCount })}\n`;

  p += `\n### EXACT POSE LOCK\n`;
  p += `${buildExactPoseLockBlock()}\n`;

  p += buildDirectedSlotBlock(args.directedSlot, args.shotsActorOptions, true);

  p += `\nIDENTITY LOCK: FACE_STRICT\n`;

  return p;
}
