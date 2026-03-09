import type { DirectorSettings, ReferenceSlot, StageToken } from '../context/AppContext';
import { computeDepthScore } from './spatialHelpers';

export const SCENE_LOCK_NEGATIVE_TOKENS = "scene alteration, background change, lighting shift, camera angle change, style deviation, new composition, structural change, reimagined scene, time of day shift, seasonal change, architectural alteration, furniture movement, lens flares, color grading shift, original studio background, white backgrounds showing through gaps";

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

export const mergeNegatives = (...chunks: string[]) => {
  const tokens = chunks
    .flatMap(c => c.split(','))
    .map(t => t.trim())
    .filter(Boolean);
  const uniq: string[] = [];
  tokens.forEach(t => {
    if (!uniq.includes(t)) uniq.push(t);
  });
  return uniq.join(', ');
};

export const getActiveReferenceSlots = (slots: ReferenceSlot[]) => {
  return slots
    .filter(s => !!s.url && s.active)
    .sort((a, b) => a.index - b.index);
};

import { LIGHTING_PRESETS, CAMERA_PRESETS } from '../../prompts/portraitPrompts';

export const compileV3DirectorPrompt = (director: DirectorSettings, slots: ReferenceSlot[], tokens: StageToken[] = []): string => {
  const activeRefs = getActiveReferenceSlots(slots);

  const aspectToken = director.aspectRatio ? `--ar ${director.aspectRatio}` : '';

  const segments: string[] = [];

  // 1) Master style
  const tech = buildMasterStyleKeywords(director);
  if (tech.length > 0) segments.push(`(Master Style: ${tech.join(', ')})`);

  // 2) Spatial Protocol (Authority #1-3 enforcement)
  segments.push(`(SPATIAL PROTOCOL: Actors are positioned using explicit anchor regions and user-defined layout. Relative distance is determined by scale and vertical placement. Foreground, midground, and background layers are preassigned. Do not reposition actors. Do not reinterpret spatial layout. Lighting respects layer separation.)`);

  // 3) Replacement / Mapping priority: Marker > Spatial > Replace
  if (director.markerType) {
    const markerDirectives: string[] = [];
    activeRefs.forEach(ref => {
      const targetVal = (ref.target || '').trim() || `Marker #${ref.index}`;
      const subjectDesc = (ref.analysis || ref.name || '').trim() || `Subject from Ref ${ref.index}`;
      markerDirectives.push(`(REGION ${ref.index}: Locate the ${director.markerType} identified as "${targetVal}". ACTION: GENERATE ${subjectDesc} STRICTLY INSIDE this shape.)`);
    });

    segments.push(`(PROTOCOL: HARD MASKING via ${director.markerType}.)`);
    segments.push(`(CRITICAL CONSTRAINT: FREEZE THE SCENE. All pixels OUTSIDE the ${director.markerType} must remain UNTOUCHED and identical to the Anchor Image. Only the content INSIDE the marked zones is mutable.)`);
    if (markerDirectives.length > 0) segments.push(markerDirectives.join(' '));
    segments.push(`(FINAL STEP: Remove the colored marker outlines themselves. Blend the edges seamlessly, but do not alter the surrounding room/environment.)`);
  } else if (director.spatialLayout && activeRefs.length >= 1) {
    const sorted = activeRefs.map(r => r.index);
    const p1 = sorted[0] ? `[Ref ${sorted[0]} Subject]` : 'Empty';
    const p2 = sorted[1] ? `[Ref ${sorted[1]} Subject]` : 'Secondary Element';

    let layoutPrompt = '';
    if (director.spatialLayout === 'horizontal') layoutPrompt = `(COMPOSITION: SPLIT-SCREEN. LEFT SIDE: ${p1}. RIGHT SIDE: ${p2}. Distinct separation.)`;
    if (director.spatialLayout === 'vertical') layoutPrompt = `(COMPOSITION: VERTICAL STACK. TOP HALF: ${p1}. BOTTOM HALF: ${p2}.)`;
    if (director.spatialLayout === 'center') layoutPrompt = `(COMPOSITION: HERO SHOT. CENTER: ${p1}. SURROUNDING/PERIPHERY: All other reference elements.)`;
    if (layoutPrompt) segments.push(layoutPrompt);
  } else if (director.replaceAnchorSubjects) {
    const specificMaps: string[] = [];
    activeRefs.forEach(ref => {
      const targetVal = (ref.target || '').trim();
      if (targetVal) {
        specificMaps.push(`(Specific Map: Replace "${targetVal}" with subject from Reference ${ref.index})`);
      }
    });

    if (specificMaps.length > 0) {
      segments.push(`(CRITICAL REPLACEMENT MAP: ${specificMaps.join('. ')}. MAINTAIN DETAILS.)`);
    } else {
      const t = director.globalReplaceTarget ? `"${director.globalReplaceTarget.trim()}"` : 'any characters/subjects';
      segments.push(`(CRITICAL DIRECTIVE: Identify ${t} present in the Anchor Scene/Environment. REPLACE them with the characters defined in the Reference Images. MAINTAIN the exact level of detail, texture, and style from the Reference Images.)`);
    }
  }

  // RESOLVE PRESETS for Lighting and Camera
  const resolvedLighting = LIGHTING_PRESETS.find((p: any) => p.key === director.lighting)?.prompt || director.lighting?.trim() || '';
  const resolvedCamera = CAMERA_PRESETS.find((p: any) => p.key === director.camera)?.prompt || director.camera?.trim() || '';

  // 2.5) Actor Intelligence (Pose, Lighting interaction per actor)
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

    if (intelligence) {
      // Resolve name if it looks like a ref slot
      let name = token.tag;
      if (token.castId?.startsWith('refslot-') || token.tag.toLowerCase().startsWith('ref_')) {
        const match = activeRefs.find(r => r.castId === token.castId);
        if (match) name = match.name || `Ref ${match.index}`;
      }
      segments.push(`[Actor Intelligence for ${name}: ${intelligence.trim()}]`);
    }
  });

  // 3) Subject + Environment
  let main = '';
  if (director.subject.trim()) main += `Subject: ${director.subject.trim()}. `;
  if (director.environment.trim()) main += `Environment: ${director.environment.trim()}. `;
  if (main.trim()) segments.push(main.trim());

  // 4) Knowledge injection
  if (director.knowledge.trim()) {
    segments.push(`(Reasoning Constraint: Ensure historical/factual accuracy for: "${director.knowledge.trim()}").`);
  }

  // 5) Cinematography
  const cinema = [resolvedLighting, resolvedCamera, director.filmStock?.trim()].filter(Boolean);
  if (cinema.length > 0) segments.push(`Cinematography: ${cinema.join(', ')}.`);

  // 6) Reference Context
  if (activeRefs.length > 0) {
    let refBlock = `[System: Processing ${activeRefs.length} Reference Images using strategy: ${director.mergeStrategy}. Primary fidelity on Ref 1-6].\n`;
    activeRefs.forEach(ref => {
      const txt = (ref.analysis || ref.name || '').trim();
      refBlock += `[Ref ${ref.index} Content: ${txt || 'No analysis provided'}] `;
    });
    segments.push(refBlock.trim());
  }

  // 7) Text layer
  if (director.textRender.trim()) {
    let textInstruction = `Render Text: "${director.textRender.trim()}"`;
    if (director.textStyle.trim()) textInstruction += ` in style of ${director.textStyle.trim()}`;
    segments.push(`(Text Layer: ${textInstruction}).`);
  }

  let out = segments.join('\n\n');
  if (aspectToken) out += ` ${aspectToken}`;

  // Negatives
  const safetyNegs = director.safety === 'Strict'
    ? 'nsfw, nudity, violence, blood, gore, disturbing content, inappropriate attire'
    : '';
  const markerNegs = director.markerType
    ? 'text, numbers, annotations, outlines, bounding boxes, arrows, circles, ui elements, red lines, green lines, marker strokes, sketches, overlay'
    : '';
  const sceneLockNegs = director.sceneLock ? SCENE_LOCK_NEGATIVE_TOKENS : '';
  const neg = mergeNegatives(director.negativePrompt || '', safetyNegs, markerNegs, sceneLockNegs);
  if (neg.trim()) out += `\n\nNEGATIVE CONSTRAINTS (CRITICAL - DO NOT GENERATE): ${neg.trim()}`;

  return out.trim();
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
