import type { DirectorSettings, ReferenceSlot, StageToken, StageAnnotation } from '../context/AppContext';
import { computeDepthScore } from './spatialHelpers';
import type { PlacementIntent } from './spatialHelpers';
import type { ExtractedStyle, SceneIntent } from '../services/GeminiService';
import type { ShotPackId, ShotPresetId, ShotLocks, DirectedShotSlot } from '../types/shots';
import type { ActorIdentityReferenceSet, ShotsActorOption } from '../context/AppContext';
import { SHOT_PRESETS } from './shotsPresets';
import type { ShotPresetDefinition } from './shotsPresets';
import { buildSceneTruthSnapshotBlock } from './sceneTruthHelpers';

export const SCENE_LOCK_NEGATIVE_TOKENS = "scene alteration, background change, lighting shift, camera angle change, style deviation, new composition, structural change, reimagined scene, time of day shift, seasonal change, architectural alteration, furniture movement, lens flares, color grading shift, original studio background, white backgrounds showing through gaps";

export const STAGE_W = 1024;
export const STAGE_H = 576;

export const lightingProtocol = "Subject MUST inherit the environmental lighting. Match global illumination, color temperature, and atmospheric perspective of the background. Directional lighting matching the environment's light source. Subject is physically grounded in the scene. Generate realistic contact shadows. Match the contrast ratio and black levels of the environment. No crushed blacks.";

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

const BACKGROUND_UNIQUENESS_LOCK_BLOCK = [
  "BACKGROUND UNIQUENESS LOCK (NON-NEGOTIABLE):",
  "- Every visible person in the scene must be a unique individual.",
  "- Do not duplicate or clone background people.",
  "- Do not mirror-copy crowd groups from left to right.",
  "- Do not repeat the same face, beard, hair silhouette, clothing silhouette, or pose across multiple extras.",
  "- Avoid tiled or stamped crowd patterns.",
  "- Keep natural variation in gesture timing, head turn, body angle, spacing, and costume details while preserving era/style continuity."
].join('\n');

export const getActiveReferenceSlots = (slots: ReferenceSlot[]) => {
  return slots
    .filter(s => !!s.url && s.active)
    .sort((a, b) => a.index - b.index);
};

import { LIGHTING_PRESETS, CAMERA_PRESETS } from '../../prompts/portraitPrompts';

export const compileV3DirectorPrompt = (director: DirectorSettings, slots: ReferenceSlot[], tokens: StageToken[] = [], bgPrompt: string = ''): string => {
  const activeRefs = getActiveReferenceSlots(slots);

  const segments: string[] = [];

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
  const neg = mergeNegatives(director.negativePrompt || '', safetyNegs, markerNegs, sceneLockNegs);
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
  segments.push(BACKGROUND_UNIQUENESS_LOCK_BLOCK);

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
      tokens.forEach(token => {
        const ref = activeRefs.find(r => r.castId === token.castId);
        if (ref) {
          const center = token.x + token.width / 2;
          const relX = center / STAGE_W;
          let posH = "center";
          if (relX < 0.38) posH = "left side";
          else if (relX > 0.62) posH = "right side";
          
          let dnaMandate = '';
          if (ref.analysis && ref.analysis.trim()) {
              dnaMandate = ` CRITICAL BIOMETRIC OVERRIDE: Specifically alter the generated subject's physical body, height, weight, and traits to perfectly match this DNA profile: "${ref.analysis.trim()}".`;
          }
          specificMaps.push(`- The character physically positioned on the ${posH} of the frame MUST be replaced by the subject in Reference ${ref.index} (${ref.name || 'Subject'}).${dnaMandate}`);
        }
      });
    }

    if (specificMaps.length > 0) {
      segments.push(`CRITICAL REPLACEMENT MAP (MANDATORY IDENTITY TARGETING):\n${specificMaps.join('\n')}\nWARNING: You MUST enforce this exact positioning. DO NOT rely on visual similarity between the reference faces and the original anchor bodies to decide who goes where. You MUST strictly swap the identities into the physical locations defined above. Randomly swapping these characters is a FAILURE.\nOMNIPOTENT OBLITERATION DIRECTIVE: When replacing subjects, you are FORBIDDEN from preserving the anchor's original facial structure, hair, or head shape. You MUST completely overwrite their biological traits to match the Reference Subject and their Biometric Profile, EVEN IF it breaks the original silhouette.\nWARDROBE CONTINUITY (CRITICAL): Unless the Biometric Override explicitly requests a different outfit, you MUST perfectly preserve the EXACT original clothing, suits, and attire worn by the humans in the anchor image. Re-dress your generated subjects in those exact anchor outfits. Do NOT use the casual clothing from the Reference images. Maintain exact environment details.`);
    } else {
      const t = director.globalReplaceTarget ? `"${director.globalReplaceTarget.trim()}"` : 'any characters/subjects';
      segments.push(
        `CRITICAL DIRECTIVE: Identify ${t} present in the Anchor Scene/Environment. Replace them with the characters defined in the Reference Images.`
      );
    }
  }

  // RESOLVE PRESETS for Lighting and Camera
  const resolvedLighting = LIGHTING_PRESETS.find((p) => p.key === director.lighting)?.prompt || director.lighting?.trim() || '';
  const resolvedCamera = CAMERA_PRESETS.find((p) => p.key === director.camera)?.prompt || director.camera?.trim() || '';

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
    plan: Array<{
      region: number | string;
      actorLabel: string;
      token: StageToken;
      profile?: unknown;
    }>,
    dnaForRender: {
      environment?: string;
      lighting?: string;
      camera?: string;
    },
    notes: string, 
    tokens: StageToken[], 
    annotations: StageAnnotation[],
    referenceSlots: ReferenceSlot[],
    director: DirectorSettings,
    extractedStyle?: ExtractedStyle | null
) => {
    const tech = buildMasterStyleKeywords(director);
    const styleSignature = `${extractedStyle?.medium || ''} ${extractedStyle?.renderStyle || ''} ${extractedStyle?.styleSummary || ''}`.toLowerCase();
    const requestsStylizedMedium =
        /3d|cgi|stylized|illustration|anime|toon|cartoon|digital art|painted|painterly|render/.test(styleSignature) ||
        director.qualityMode === '3D Render' ||
        director.qualityMode === 'Stylized';
    const frameStyleDirective = requestsStylizedMedium
        ? "- STYLE-CONSISTENT OUTPUT: The final image must be a single clean cinematic frame in the requested stylized medium. Do NOT force live-action photorealism when stylization is requested."
        : "- REALISM OUTPUT: The final image should read as a natural photograph or movie frame unless explicitly stylized.";

    const dnaBlock = [
        (director.environment || dnaForRender.environment) ? `Environment Match: ${director.environment || dnaForRender.environment}` : '',
        (director.lighting || dnaForRender.lighting) ? `Lighting Setup: ${director.lighting || dnaForRender.lighting}` : '',
        (director.camera || dnaForRender.camera) ? `Camera Settings: ${director.camera || dnaForRender.camera}` : ''
    ].filter(Boolean).join('\n');

    const regions = plan.map(r => {
        const t = r.token;

        const boundsBlock = `BBOX_ABS: [${Math.round(t.x)}, ${Math.round(t.y)}, ${Math.round(t.width)}, ${Math.round(t.height)}]`;
        let profile = typeof r.profile === 'string' ? r.profile : (r.profile ? JSON.stringify(r.profile) : `You MUST perfectly match the facial identity, skin tone, hair, and clothing of the subject in the attached image labeled "REGION_${r.region}_REF"`);
        if (t.intelligence) profile += `\nMANDATORY ACTION/POSE: ${t.intelligence}`;

        return `REGION ${r.region} (${r.actorLabel}):\n- Position: ${boundsBlock}\n- Description: ${profile}`;
    }).join('\n\n');

    // Director Canvas Semantic Handoff
    const intents = buildHumanPlacementIntents(tokens, annotations);
    const intentBlock = intents.length > 0 ? formatPlacementIntents(intents) : "";

    const refStackActive = getActiveReferenceSlots(referenceSlots);
    const refStackBlock = refStackActive.length > 0
        ? `GLOBAL STYLE/CONSISTENCY REFERENCES:\n${refStackActive.map(r => `- REFERENCE ${r.index}: ${r.analysis || r.name}`).join('\n')}`
        : '';

    const rules = [
        "SCENE RECONSTRUCTION AND COMPOSITING AUTHORIZATION:",
        "You are a professional digital compositor and lighter.",
        tech.length > 0 ? `(Master Style: ${tech.join(', ')})\n` : "",
        director.subject.trim() ? `Subject Focus: ${director.subject.trim()}` : "",
        director.filmStock.trim() ? `Film Look: ${director.filmStock.trim()}` : "",
        refStackBlock,
        "",
        "CRITICAL COMMANDS (ZERO TOLERANCE):",
        "1. SINGLE IMAGE OUTPUT: Generate ONLY the final rendered scene. Do NOT render a collage, sidebar, dashboard, or layout showing the references. If the output is not a single clean 16:9 scene, it is a FAILURE.",
        "- UNIFORM ENVIRONMENT: All background details (walls, props, lighting) must remain 100% identical to the CLEAN_BG_PLATE outside of the character regions.",
        "- SEAMLESS BLENDING: The ANCHOR_GUIDE contains a rough composite of the characters. Your job is to blend them naturally into the scene. Match the lighting, shadows, and color grading of the background.",
        "- LIGHTING OVERRIDE: Absolutely DO NOT carry over the original lighting from the character references. You MUST re-light the characters entirely from scratch to naturally match the environment's ambient light and the specified Cinematography lighting.",
        "- NEGATIVE SPACE: Ignore any solid or white studio backgrounds present in the REGION_REFS. Treat flat white areas (such as inside a hollow helmet, or between arms and torso) as transparent, and fill them perfectly with the scene environment.",
        "- NO OUTLINES: Do NOT draw any boxes, boundaries, or outlines around the characters.",
        frameStyleDirective,
        "- NO Hallucinations: Do not add any extra objects, people, or details not requested in the Director Brief or Region Plan.",
        `### ${BACKGROUND_UNIQUENESS_LOCK_BLOCK}`,
        "- ASPECT RATIO LOCK: DO NOT STRETCH OR SQUASH. If a character cutout does not perfectly fill its assigned BBOX_ABS, DO NOT distort the character. Maintain natural proportions and fill any remainder with pixels from the CLEAN_BG_PLATE.",
        "- OVERLAP LOCK: If the ANCHOR_GUIDE shows subjects overlapping, maintain that exact occlusion.",
        "",
        dnaBlock ? `### ANCHOR DNA:\n${dnaBlock}\n` : "",
        notes ? `### DIRECTOR NOTES (EXPLICIT USER REQUEST - MANDATORY LOCATION/SCENE):\n${notes}\n` : "",
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

ANTI-STYLE-DRIFT GUARDRAIL: This style envelope MUST ONLY affect the rendering look, colors, and visual treatment. It MUST NOT reinterpret or replace the requested location, scene category, furniture, props, or world (e.g., do not turn a cafe into a dungeon). The core scene nouns from the Director Notes remain mandatory and primary.` : "",
        extractedStyle ? "\n" : "",
        "### SCENE LIGHTING PROTOCOL:",
        lightingProtocol,
        "",
        "### IDENTITY PRECEDENCE",
        buildIdentityPrecedenceBlock({
            hasFaceAnchors: refStackActive.length > 0,
            hasActorReferences: refStackActive.length > 0,
            hasSubjectStyleAnalysis: !!extractedStyle
        }),
        "### FACE IDENTITY LOCK",
        buildStrictFaceIdentityLockBlock({
            actorIdentitySets: refStackActive.map(r => ({ actorId: String(r.castId || r.index), angleFaceAnchors: [], supportIdentityRefs: [], wardrobeRefs: [], primaryFaceAnchor: r.url!, identityPriority: 'strict' })),
            allowWardrobeChange: true,
            multiActor: refStackActive.length > 1
        }),
        "IDENTITY LOCK: FACE_STRICT"
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
    bgPrompt?: string
) => {
    const sortedTokens = [...tokens].sort((a, b) => a.x - b.x);
    
    // Inline implementation of buildReferenceStackText for loose prompt
    const activeSlots = getActiveReferenceSlots(referenceSlots);
    const refStackBlock = activeSlots.length > 0
        ? `GLOBAL REFERENCES:\n${activeSlots.map(r => `- REF ${r.index}: ${r.analysis || r.name}`).join('\n')}`
        : '';

    const tech = buildMasterStyleKeywords(director);

    // Director Canvas Semantic Handoff
    const intents = buildHumanPlacementIntents(tokens, annotations);
    const intentBlock = intents.length > 0 ? formatPlacementIntents(intents) : "";

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

    if (refStackBlock) p += `${refStackBlock}\n\n`;
    p += "Cinematic composition. ";

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

### BACKGROUND UNIQUENESS LOCK
- Every visible background person must be unique.
- Do not duplicate or mirror-copy crowd members.
- Do not reuse the same cheering extra (same face + same pose + same outfit) on both sides of frame.
- Keep extras varied in gesture timing, head angle, torso angle, and silhouette.

### ANATOMY & REALISM GUARDRAIL
CRITICAL NEGATIVE PROMPT: You MUST NOT generate extra limbs, extra legs, phantom body parts, or disembodied characters. Ensure perfect anatomical structure. Characters must have exactly two legs and two arms. No floating legs under tables or detached hands.\n`;

    if (extractedStyle) {
        const looseStyleSignature = `${extractedStyle.medium || ''} ${extractedStyle.renderStyle || ''} ${extractedStyle.styleSummary || ''}`.toLowerCase();
        const nonPhotorealRequested = /3d|cgi|stylized|illustration|anime|toon|cartoon|digital art|painted|painterly|render/.test(looseStyleSignature);
        p += `\n### STYLE ENVELOPE (VISUAL TREATMENT ONLY):
- Artistic Medium: ${extractedStyle.medium}
- Render Style: ${extractedStyle.renderStyle}
- Color Palette: ${extractedStyle.palette}
- Mood/Vibe: ${extractedStyle.mood}

ANTI-STYLE-DRIFT GUARDRAIL: This style envelope MUST ONLY affect the rendering look, colors, and visual treatment. It MUST NOT reinterpret or replace the requested location, scene category, furniture, props, or world (e.g., do not turn a modern office into a fantasy tavern). The core scene nouns remain mandatory and primary.
STYLE LOCK: Keep the final output in the extracted medium/render style. ${nonPhotorealRequested ? 'Do NOT force live-action photorealism; maintain stylized/CG treatment.' : 'Use natural cinematic realism unless another style directive is given.'}\n`;
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
    tokens?: StageToken[]
}): string => {

    const refLines = p.activeRefs.map(r => `[REFERENCE: ${r.name || `Ref ${r.index}`}]: Use this exact image to define the identity, clothing, and traits of the target subject.`);

    let prompt = `You are a Strict Geometry Compositor. Your ONLY job is to replace the specified blank regions (silhouettes/cutouts) with the requested subjects.

CRITICAL DIRECTIVES:
1. Do NOT touch, alter, or hallucinate anything in the background. The background is pre-rendered and MUST remain identical.
2. Fill ONLY the boundaries of the provided target regions.
3. Obey the exact pose, scale, and lighting implied by the empty silhouette.`;

    if (p.sceneLock) {
        prompt += `\n4. SCENE LOCK ACTIVE: ${SCENE_LOCK_NEGATIVE_TOKENS}`;
    }

    if (p.hasDepthMap) {
        prompt += `\n5. DEPTH MAP ACTIVE: Perfectly preserve the 3D spatial relationships and occlusion defined by the depth map.`;
    }

    if (p.replaceAnchorSubjects) {
        const specificMaps: string[] = [];
        
        // Explicit UI Target Overrides
        p.activeRefs.forEach(ref => {
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
            p.tokens.forEach(token => {
                const ref = p.activeRefs.find(r => r.castId === token.castId);
                if (ref) {
                    const center = token.x + token.width / 2;
                    const relX = center / STAGE_W;
                    let posH = "center";
                    if (relX < 0.38) posH = "left side";
                    else if (relX > 0.62) posH = "right side";
                    
                    let dnaMandate = '';
                    if (ref.analysis && ref.analysis.trim()) {
                        dnaMandate = ` CRITICAL BIOMETRIC OVERRIDE: Specifically alter the generated subject's physical body, height, weight, and traits to perfectly match this DNA profile: "${ref.analysis.trim()}".`;
                    }
                    specificMaps.push(`- The character physically positioned on the ${posH} of the frame MUST be replaced by the subject in Reference ${ref.index} (${ref.name || 'Subject'}).${dnaMandate}`);
                }
            });
        }

        if (specificMaps.length > 0) {
            prompt += `\n6. CRITICAL REPLACEMENT MAP (MANDATORY IDENTITY TARGETING):\n${specificMaps.join('\n')}\nWARNING: You MUST enforce this exact positioning. DO NOT rely on visual similarity between the reference faces and the original anchor bodies to decide who goes where. You MUST strictly swap the identities into the physical locations defined above. Randomly swapping these characters is a FAILURE.\nOMNIPOTENT OBLITERATION DIRECTIVE: When replacing subjects, you are FORBIDDEN from preserving the anchor's original facial structure, hair, or head shape. You MUST completely overwrite their biological traits to match the Reference Subject and their Biometric Profile, EVEN IF it breaks the original silhouette.\nWARDROBE CONTINUITY (CRITICAL): Unless the Biometric Override explicitly requests a different outfit, you MUST perfectly preserve the EXACT original clothing, suits, and attire worn by the humans in the anchor image. Re-dress your generated subjects in those exact anchor outfits. Do NOT use the casual clothing from the Reference images.`;
        } else {
            prompt += `\n6. REPLACE ANCHOR SUBJECTS: Disregard the original subjects defined in the anchor plate. Completely overwrite them with the new Reference/Subject identities.`;
        }
    }

    prompt += `\n\n=== REFERENCES ===\n${refLines.length > 0 ? refLines.join('\n') : "No direct image references provided. Rely on text description."}`;

    prompt += `\n\n=== OVERALL SCENE & STYLE ===\n${p.bgPrompt || "A generic scene."}`;

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

export function buildEnvironmentConsistencyLockBlock(args: BuildEnvironmentConsistencyLockBlockArgs): string {
  void args;
  return [
    "Preserve the exact same room, architecture, layout, and set dressing as shown in the scene anchor.",
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
    args.isShotVariant ? "TRUTH LOCK: Preserve the underlying layout and blocking of the scene." : "Preserve the exact same scene layout and blocking shown in the source anchor.",
    "Keep the same people in the same absolute geographical positions.",
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
    base.push("CINEMATIC CONTINUITY: Preserve exact crop centering and micro-composition continuity when possible, but allow perspective shift required by the requested camera view as long as it does not break anatomy.");
  }

  if (args.expectedActorCount !== undefined) {
    if (args.expectedActorCount > 0) {
      base.push(`CRITICAL DIRECTIVE: The scene must contain exactly ${args.expectedActorCount} visible person(s). Do not hallucinate crowds.`);
    } else {
      base.push(`CRITICAL DIRECTIVE: The scene must preserve ALL visible people already present in the anchor image. Do not hallucinate extra crowds or remove existing subjects.`);
    }
  }
  return base.join('\n');
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
  tokensCount?: number;
  sceneId?: string;
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

export function buildExactPoseLockBlock(isShotVariant?: boolean): string {
  if (isShotVariant) {
    return [
      "CINEMATIC POSE CONTINUITY:",
      "Preserve the underlying body pose, gesture timing, and exact anatomical proportions from the source result image.",
      "Preserve the performance beat and pose logic. Allow limbs to be naturally occluded or revealed based on the new camera geometry.",
      "Do not shrink the head. Do not widen the shoulders. Do not mutate the face or hair structure.",
      "Do not reinterpret the performance. Treat the source result as a frozen moment in time viewed from a different camera."
    ].join('\n');
  }

  return [
    "EXACT POSE LOCK (HARD):",
    "Preserve the exact same body pose from the source result image.",
    "Do not reinterpret the performance.",
    "Do not create a new gesture.",
    "Preserve the performance beat and pose logic. Allow limbs/hands to be naturally hidden or revealed by the new camera viewpoint without forcing them to remain artificially visible.",
    "Do not re-pose the character to better fit the shot.",
    "The only allowed change is camera position, lens, crop, and perspective.",
    "Treat the source result as a frozen moment in time viewed from a different camera.",
    "In close-up framing, preserve the same facial expression, gaze direction, head angle, and shoulder tension implied by the source pose.",
    "If limbs are cropped out by framing, crop naturally without inventing a new gesture or relaxed replacement pose.",
    "If a limb or hand is partially hidden in the anchor, infer only the hidden continuation of the same pose, not a new pose.",
    "Do not convert a symmetrical pose into an asymmetrical one or vice versa.",
    "Do not change weight distribution or balance.",
    "No re-acting, no new animation beat, no new gesture."
  ].join('\n');
}

function buildShotFramingLockBlock(preset: ShotPresetDefinition): string {
  const base = [
    `Target preset: ${preset.label}.`,
    `Framing class: ${preset.framing}. Elevation: ${preset.elevation}. Orbit: ${preset.orbit}. Placement: ${preset.placement}.`,
    "Do not collapse this preset into another preset's framing class.",
    "This preset must be visually and geometrically distinct from the other coverage presets in the set."
  ];

  switch (preset.id) {
    case 'closeup':
      base.push(
        "Subject coverage target: approximately 78-92% of frame height.",
        "Keep both shoulders and neck tension consistent with the source pose when visible.",
        "Close-up crop preference: avoid showing wrists/hands at frame edges; crop cleanly before elbows when possible.",
        "Do not reframe as medium/full-body."
      );
      break;
    case 'mediumClose':
      base.push(
        "Subject coverage target: approximately 55-72% of frame height.",
        "Chest-up or upper-torso framing. Not face-only and not full-body.",
        "Keep visible negative space around the head and shoulders so this does not read as a close-up."
      );
      break;
    case 'medium':
      base.push(
        "Subject coverage target: approximately 40-58% of frame height.",
        "Waist-up/hip-up framing with clear environment around the subject.",
        "This must read as a balanced mid-shot, not chest-up coverage and not a wide master."
      );
      break;
    case 'wide':
      base.push(
        "Subject coverage target: approximately 18-36% of frame height.",
        "Show substantial architecture and scene context beyond the subject.",
        "The room and blocking must dominate more strongly than in every other preset."
      );
      break;
    case 'lowAngleHero':
      base.push(
        "Low-angle requirement: camera is physically lower than subject chest level and tilts upward.",
        "Subject coverage target: approximately 40-65% of frame height.",
        "Do not render as neutral eye-level framing."
      );
      break;
    case 'highAngle':
      base.push(
        "High-angle requirement: camera is physically above the subject and tilts downward.",
        "Reveal more top planes and floor/desk/surface visibility than eye-level shots.",
        "Do not render as neutral eye-level framing."
      );
      break;
    case 'threeQuarterLeft':
      base.push(
        "Left-orbit requirement: the camera must move to the subject's left side, producing a true three-quarter-left face view.",
        "One cheek must dominate and the far side of the face must visibly recede. Do not cheat back toward frontal."
      );
      break;
    case 'threeQuarterRight':
      base.push(
        "Right-orbit requirement: the camera must move to the subject's right side, producing a true three-quarter-right face view.",
        "One cheek must dominate and the far side of the face must visibly recede. Do not cheat back toward frontal."
      );
      break;
    case 'profile':
      base.push(
        "Profile requirement: this must be a strict side-view silhouette with only one eye readable or implied.",
        "Do not soften the face into a three-quarter portrait."
      );
      break;
    case 'overTheShoulder':
      base.push(
        "Over-the-shoulder requirement: preserve a large blurred foreground shoulder/head wedge occupying one edge of frame.",
        "The target subject must remain the focal plane beyond that foreground wedge."
      );
      break;
    case 'twoShot':
      base.push(
        "Two-shot requirement: keep both subjects clearly readable in the same frame with shared visual importance.",
        "Do not collapse into single-subject coverage."
      );
      break;
    default:
      break;
  }

  return base.join('\n');
}

export function buildShotVariantPrompt(args: BuildShotVariantPromptArgs): string {
    const preset = SHOT_PRESETS[args.presetId];
    
    let p = `OPERATION\n`;
    p += `DIFFERENTIATION MANDATE: This output MUST be materially different in framing from the other requested shots.\n`;
    p += `Obey the requested preset geometry: ${preset.label}.\n`;
    p += `CAMERA PIVOT RULE: Move the camera viewpoint around the subject/scene as requested. Do NOT simulate a new shot by reusing the same camera and cropping differently.\n`;
    p += `Do NOT merely crop the original composition.\n\n`;

    p += `CAMERA BLUEPRINT AUTHORITY (COMPOSITION)\n`;
    p += `The camera instruction blueprint controls framing, orbit, elevation, and target occupancy.\n`;
    p += `This overrides the scene anchor's original framing.\n\n`;

    p += `Create a NEW CAMERA SETUP of the same scene continuity using the staged result image as the primary visual anchor for content truth.\n`;
    p += `Recompose this image as a ${preset.label}.\n`;
    p += `${preset.shotInstruction}\n`;
    p += `Lens Note: ${preset.defaultLensNote}\n`;
    if (preset.repairOpticalIntent) {
        p += `Optical Intent: ${preset.repairOpticalIntent}\n`;
    }
    p += `\n### SHOT FRAMING LOCK\n${buildShotFramingLockBlock(preset)}\n\n`;

    p += `CHANGE\n`;
    p += `- camera only, not body pose\n`;
    p += `- camera angle\n`;
    p += `- lens / focal length\n`;
    p += `- crop / subject size in frame\n`;
    p += `- screen position\n`;
    p += `- headroom\n`;
    p += `- perspective\n\n`;
    p += `- physically plausible parallax from the new camera position\n\n`;

    p += `KEEP\n`;
    if (args.locks.identity) p += `- actor identity\n`;
    if (args.locks.wardrobe) p += `- wardrobe / hair / makeup\n`;
    if (args.locks.background) p += `- environment continuity\n`;
    if (args.locks.background) p += `- prop continuity\n`;
    if (args.locks.lighting) p += `- approximate lighting continuity\n`;
    if (args.environmentText) p += `- Scene Environment context: ${args.environmentText}\n`;
    if (args.subjectActionText) p += `- Scene Action context: ${args.subjectActionText}\n`;
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
    p += `- do not change the core pose geometry or performance intent\n`;
    p += `- do not re-gesture the actor into a new action\n`;
    p += `- do not add headwear, crowns, hats, hoods, scarves, veils, wraps, or helmets\n`;
    p += `- do not add jewelry, belts, sashes, capes, shawls, or extra costume layers\n`;
    p += `- do not add props or handheld objects not present in the source anchor\n`;
    p += `- do not invent wardrobe details that are not clearly visible in the source image\n`;
    p += `- do not transfer props or wardrobe pieces between actors\n`;
    p += `- do not reproduce the anchor framing\n`;
    p += `- do not return the same crop as the source image\n`;
    p += `- do not flatten back into the original source composition\n`;
    p += `- do not duplicate crowd extras or stamp repeated background people\n`;
    p += `- do not mirror-copy the same cheering/background group on left and right sides\n`;
    p += `- do not output a contact sheet, grid, or collage\n`;
    p += `- do not add cinematic black bars unless already present in the anchor\n`;
    p += `- do not output malformed hands, fused fingers, extra digits, or broken wrists\n`;
    p += `- if hand anatomy is uncertain at frame edges, crop cleanly instead of generating partial fists/hands\n`;
    preset.negatives.forEach(neg => {
        p += `- ${neg}\n`;
    });
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
    
    p += `\n### DIAGNOSTICS_TEMP_ACTOR_TRACE\n`;
    p += `- expectedActorCount (prop): ${args.expectedActorCount}\n`;
    p += `- tokens.length (state): ${args.tokensCount}\n`;
    p += `- actorIdentitySets.length: ${args.actorIdentitySets?.length || 0}\n`;
    p += `- final resolved visibleActorCount: ${args.sceneTruth.expectedActorCount}\n`;
    p += `- sceneId: ${args.sceneId}\n`;
    p += `- slotId: ${args.directedSlot?.id || 'none'}\n`;
    p += `- presetId: ${args.presetId}\n`;

    p += `\n${buildSceneTruthSnapshotBlock(args.sceneTruth)}\n`;
    
    p += `\n### ENVIRONMENT & LAYOUT TRUTH (IMMUTABLE)\n`;
    p += `${buildEnvironmentConsistencyLockBlock({})}\n`;
    p += `${buildSceneLayoutLockBlock({ expectedActorCount: args.sceneTruth.expectedActorCount, isShotVariant: true })}\n`;
    
    p += `\n### CINEMATIC CONTINUITY (FLEXIBLE)\n`;
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

  if (!isFinalRerender) {
    let differentiation = `DIFFERENTIATION MANDATE: This shot is part of a professional coverage set. `;
    differentiation += `You must uniquely compose this shot according to the directed slot plan (focusing on ${targetDisplay}) while obeying scene truth.`;
    lines.push(differentiation);
    lines.push(`SET UNIQUENESS RULE: This shot must be materially different from the other selected presets in camera height, orbit, crop scale, or foreground/background relationship.`);
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

  p += `CHANGE\n`;
  p += `- Upscale and refine the detail\n\n`;

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
  p += `- do not duplicate crowd extras or repeat the same background person multiple times\n`;
  p += `- do not mirror-copy the same background group on opposite sides of frame\n`;
  p += `- do not add text or watermark\n`;
  p += `- do not add headwear, crowns, hats, hoods, scarves, veils, wraps, or helmets\n`;
  p += `- do not add jewelry, belts, sashes, capes, shawls, or extra costume layers\n`;
  p += `- do not add props or handheld objects not present in the source anchor\n`;
  p += `- do not invent wardrobe details that are not clearly visible in the source image\n`;
  p += `- do not transfer props or wardrobe pieces between actors\n`;
  preset.negatives.forEach(neg => {
      p += `- ${neg}\n`;
  });

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
  p += `${buildExactPoseLockBlock(false)}\n`;

  p += buildDirectedSlotBlock(args.directedSlot, args.shotsActorOptions, true);

  p += `\nIDENTITY LOCK: FACE_STRICT\n`;

  return p;
}

export function buildShotRepairPrompt(args: BuildShotVariantPromptArgs): string {
    const preset = SHOT_PRESETS[args.presetId];
    
    let p = `CRITICAL GEN-REPAIR INSTRUCTION\n`;
    p += `This is a constrained generative repair pass. The provided control image is a deterministic 2.5D geometric projection.\n`;
    p += `The camera layout, perspective, depth, and scale in this image are MATHEMATICALLY EXACT. Do not invent your own composition.\n\n`;

    p += `REPAIR CONTRACT:\n`;
    p += `1. PRESERVE THE PROVIDED COMPOSITION EXACTLY.\n`;
    p += `2. DO NOT REFRAME, crop, zoom, or alter the aspect ratio under any circumstances.\n`;
    p += `3. DO NOT MOVE THE SUBJECT. Keep their silhouette, pose, and physical anchor placement absolutely fixed.\n`;
    p += `4. DO NOT RESTORE FRONTAL SYMMETRY. If the projection shows a side profile or heavy oblique angle, maintain it strictly.\n`;
    p += `5. FILL MISSING REGIONS ONLY. Focus solely on smoothing seams and filling tears/voids in the geometry.\n`;
    p += `6. DO NOT REDESIGN THE SCENE OR INVENT NEW PROPS/STRUCTURAL ELEMENTS.\n`;
    p += `7. BLACK MASK REGION = FULLY PROTECTED. NON-MASKED PIXELS MUST REMAIN UNCHANGED.\n\n`;

    p += `PROTECTED REGIONS (STRICTLY DO NOT MODIFY):\n`;
    p += `- The subject's exact projected silhouette\n`;
    p += `- Foreground pillar geometry and scale\n`;
    p += `- Already-correct scene regions and environmental textures\n`;
    p += `- Any preserved ropes, chains, or attachments actually present in the primary projection image.\n\n`;

    p += `SHOT CONTEXT (For optical intent only):\n`;
    p += `This geometry represents a ${preset.label}.\n`;
    p += `Optical Intent to apply during repair fusing: ${preset.repairOpticalIntent || preset.defaultLensNote}\n\n`;

    p += `CONTINUITY LOCKS:\n`;
    if (args.locks?.identity || (args.actorIdentitySets && args.actorIdentitySets.length > 0)) {
        p += `IDENTITY: Strictly preserve the original face/identity traits.\n`;
    }
    if (args.locks?.wardrobe) {
        p += `WARDROBE: Preserve the original clothing explicitly.\n`;
    }
    p += `Apply these ONLY to ensure the reconstructed subject pixels perfectly match the original intent, without changing the geometric pose/silhouette.\n\n`;

    if (args.locks?.background && args.environmentText) {
        p += `ENVIRONMENT LOCK:\n${args.environmentText}\n`;
        p += `Apply this specifically to the newly revealed/inpainted background space behind moving occlusion structures.\n\n`;
    }

    if (args.locks?.lighting && args.lightingText) {
        p += `LIGHTING FUSION:\n${args.lightingText}\n`;
    }

    return p;
}
