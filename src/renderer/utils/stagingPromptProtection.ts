import type { ReferenceSlot } from '../context/AppContext';
import type { ExtractedStyle } from '../services/GeminiService';

export const CONTROL_OVERLAY_GEOMETRY_ONLY_LABEL = 'CONTROL_OVERLAY_GEOMETRY_ONLY';

export const STAGING_DEFAULT_MEDIUM_CONTRACT = [
  '### OUTPUT MEDIUM - HARD',
  'Use a natural photographic visual medium unless the current scene instructions explicitly request another visual medium.',
  'Render continuous-tone shading, realistic skin and fabric microtexture, physically plausible illumination, natural lens behavior, and realistic material response.',
  'CLEAN_BG_PLATE is the scene, lighting, color, and visual-medium authority when present.',
  'Identity references control identity only.',
  'Wardrobe and prop references control design, construction, material, and color only.',
  'ANCHOR_GUIDE and CONTROL_OVERLAY_GEOMETRY_ONLY control geometry only.',
  'Omit all guide marks, text, borders, labels, marker colors, and overlay backgrounds from the final image.',
  'When the current scene instructions explicitly request another visual medium, that explicit request overrides the photographic default.'
].join('\n');

const buildExplicitMediumContract = (override: string): string => [
  '### OUTPUT MEDIUM - HARD',
  `Use the explicitly selected visual medium: ${override}.`,
  'The selected medium is authoritative.',
  'Identity, wardrobe, prop, anchor-guide, and geometry-control references must not change that medium.'
].join('\n');

export const protectStagingPromptStyle = (
  prompt: string,
  explicitStyleOverride?: string | null
): string => {
  const override = (explicitStyleOverride || '').trim();
  const contract = override
    ? buildExplicitMediumContract(override)
    : STAGING_DEFAULT_MEDIUM_CONTRACT;

  return `${contract}\n\n${prompt}`;
};

export const deriveExplicitStyleOverride = (extractedStyle?: ExtractedStyle | null): string | null => {
  const override = (extractedStyle?.renderStyle || extractedStyle?.medium || '').trim();
  return override || null;
};

const ANALYSIS_MEDIUM_PATTERNS: Array<[RegExp, string]> = [
  [/\bshown\s+via\s+(?:a\s+)?(?:high[- ]resolution\s+)?biometric\s+scan\b/gi, ''],
  [/\b(?:high[- ]resolution\s+)?biometric\s+scan\b/gi, ''],
  [/\b(?:rendered|render|cgi|3d render|3d-rendered|digitally rendered)\b/gi, ''],
  [/\b(?:stylized|illustrated|illustration|cartoon|anime|cel[- ]?shaded|comic(?: book)?|graphic novel|painted|painterly)\b/gi, ''],
  [/\b(?:image[- ]making medium|aesthetic treatment|rendering process|scan process|camera treatment)\b/gi, ''],
  [/\b(?:photographic|photo[- ]real|photorealistic|cinematic|lens|camera)\b/gi, '']
];

export const sanitizeReferenceAnalysisForPrompt = (analysis?: string | null): string => {
  if (!analysis) return '';

  let sanitized = analysis;
  for (const [pattern, replacement] of ANALYSIS_MEDIUM_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized
    .replace(/,\s*revealing\s+/gi, ' with ')
    .replace(/\brealistic\s+(?=detailed skin texture\b)/gi, '')
    .replace(/,\s+with\b/gi, ' with')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s+,/g, ',')
    .trim();
};

export const createPromptSafeReferenceSlots = <T extends Pick<ReferenceSlot, 'analysis'>>(
  slots: T[]
): T[] => (
  slots.map((slot) => ({
    ...slot,
    analysis: sanitizeReferenceAnalysisForPrompt(slot.analysis)
  }))
);

export type StagingReference = {
  url: string;
  label: string;
};

export type FinalizedStagingReference = StagingReference & {
  role: string;
};

const normalizeReferenceLabel = (label: string): string => {
  if (label === 'CONTROL_OVERLAY') return CONTROL_OVERLAY_GEOMETRY_ONLY_LABEL;
  if (label === 'Environment/Lighting Anchor') return 'CLEAN_BG_PLATE';
  return label;
};

export const deriveStagingReferenceRole = (label: string): string => {
  const normalized = normalizeReferenceLabel(label);
  if (normalized === 'CLEAN_BG_PLATE') return 'scene_visual_medium_lighting_authority';
  if (normalized === 'ANCHOR_GUIDE') return 'anchor_geometry_guide';
  if (normalized === CONTROL_OVERLAY_GEOMETRY_ONLY_LABEL) return 'geometry_control_only';
  if (
    normalized.startsWith('REFERENCE_') ||
    normalized.includes('_ID_') ||
    normalized === 'ACTOR IDENTITY ANCHOR' ||
    normalized.startsWith('Character:')
  ) {
    return 'selected_cast_reference';
  }
  if (normalized.startsWith('REGION_')) return 'pose_wardrobe_continuity_reference';
  return 'content_reference';
};

export const finalizeStagingReferences = (input: {
  cleanBgPlate?: string | null;
  anchorGuide?: string | null;
  contentReferences?: StagingReference[];
  controlOverlay?: string | null;
  maxReferences?: number;
}): FinalizedStagingReference[] => {
  const maxReferences = Math.max(1, input.maxReferences ?? 14);
  const seen = new Set<string>();
  const ordered: StagingReference[] = [];

  const add = (reference?: StagingReference | null): boolean => {
    if (!reference?.url || seen.has(reference.url) || ordered.length >= maxReferences) return false;
    ordered.push({
      url: reference.url,
      label: normalizeReferenceLabel(reference.label)
    });
    seen.add(reference.url);
    return true;
  };

  add(input.cleanBgPlate ? { url: input.cleanBgPlate, label: 'CLEAN_BG_PLATE' } : null);
  add(input.anchorGuide ? { url: input.anchorGuide, label: 'ANCHOR_GUIDE' } : null);

  const ordinaryLimit = input.controlOverlay ? Math.max(0, maxReferences - 1) : maxReferences;
  for (const reference of input.contentReferences || []) {
    if (ordered.length >= ordinaryLimit) break;
    const label = normalizeReferenceLabel(reference.label);
    if (label === CONTROL_OVERLAY_GEOMETRY_ONLY_LABEL) continue;
    add({ ...reference, label });
  }

  if (input.controlOverlay && !seen.has(input.controlOverlay) && ordered.length > 0) {
    if (ordered.length >= maxReferences) {
      ordered.pop();
    }
    ordered.push({
      url: input.controlOverlay,
      label: CONTROL_OVERLAY_GEOMETRY_ONLY_LABEL
    });
  }

  return ordered.map((reference) => ({
    ...reference,
    role: deriveStagingReferenceRole(reference.label)
  }));
};

export type SubmittedStagingRequestSnapshot = {
  mode: 'loose' | 'strict' | 'strict-pass';
  prompt: string;
  references: Array<{
    order: number;
    label: string;
    role: string;
  }>;
  createdAt: number;
};

export const buildSubmittedStagingRequestSnapshot = (
  mode: SubmittedStagingRequestSnapshot['mode'],
  prompt: string,
  references: Array<{ label: string; role?: string }>,
  createdAt = Date.now()
): SubmittedStagingRequestSnapshot => ({
  mode,
  prompt,
  references: references.map((reference, index) => ({
    order: index + 1,
    label: reference.label,
    role: reference.role || deriveStagingReferenceRole(reference.label)
  })),
  createdAt
});
const ANALYSIS_SUSPECT_PATTERN = /\b(biometric scan|rendered|render|cgi|stylized|illustrated|illustration|cartoon|anime|cel[- ]?shaded|comic|graphic novel|painted|painterly|camera treatment|rendering process|scan process)\b/i;

export const findReferenceAnalysisMediumContamination = (
  slots: Array<Pick<ReferenceSlot, 'index' | 'name' | 'analysis'>>
): Array<{ index: number; name?: string; phrase: string }> => (
  slots.flatMap((slot) => {
    const match = (slot.analysis || '').match(ANALYSIS_SUSPECT_PATTERN);
    return match
      ? [{ index: slot.index, name: slot.name, phrase: match[0] }]
      : [];
  })
);
