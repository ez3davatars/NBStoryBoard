import type { DirectorAspectRatio } from '../context/AppContext';

export type StagingSourceMode =
  | 'standard_scene_generation'
  | 'source_preserving_layout_transform';

export type StagingDeliverableKind =
  | 'instagram_story'
  | 'instagram_post'
  | 'social_post'
  | 'promo_post'
  | 'poster'
  | 'banner'
  | 'ad_graphic'
  | 'thumbnail'
  | 'cover'
  | 'marketing_image'
  | 'layout_deliverable';

export type StagingIntentResolution = {
  mode: StagingSourceMode;
  source: 'uploaded_source_image' | 'none';
  deliverableKind?: StagingDeliverableKind;
  explicitRestyleRequested: boolean;
  recommendedAspectRatio?: DirectorAspectRatio;
  reason: string;
};

export type StagingReferenceImage = {
  url: string;
  label: string;
};

type ResolveStagingIntentArgs = {
  prompt?: string;
  hasUploadedSourceImage: boolean;
};

type SourcePreservationPromptArgs = {
  sourceLabel?: string;
  selectedAspectRatio?: DirectorAspectRatio;
};

const SOURCE_AUTHORITY_LABEL =
  'Image A - uploaded source image / authoritative visual, character-design, identity, wardrobe, and render-style source';

const normalizePrompt = (prompt?: string): string =>
  (prompt || '')
    .toLowerCase()
    .replace(/[^\w\s:/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasAny = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text));

const deliverablePatterns: Array<[StagingDeliverableKind, RegExp]> = [
  ['instagram_story', /\b(instagram|ig)\s+(story|stories|reel|reels)\b/],
  ['instagram_post', /\b(instagram|ig)\s+(image|post|feed|square|carousel)\b/],
  ['social_post', /\b(social media|social|feed)\s+(image|graphic|post|asset|creative)\b/],
  ['promo_post', /\b(promo|promotional)\s+(post|image|graphic|creative|asset)\b/],
  ['poster', /\b(poster|flyer|one sheet|one-sheet)\b/],
  ['banner', /\b(banner|header|wide ad|leaderboard)\b/],
  ['ad_graphic', /\b(ad|advertisement|advertising|ad graphic|paid social|campaign creative)\b/],
  ['thumbnail', /\b(thumbnail|youtube thumbnail|video thumbnail)\b/],
  ['cover', /\b(cover|cover art|cover image|hero image)\b/],
  ['marketing_image', /\b(marketing image|marketing graphic|campaign image|brand graphic)\b/],
  ['layout_deliverable', /\b(layout|deliverable|media asset|graphic asset)\b/]
];

const transformPatterns = [
  /\bconvert\s+(this|the uploaded|the source|image|sheet|board)\b/,
  /\bturn\s+(this|the uploaded|the source|image|sheet|board)\s+into\b/,
  /\bmake\s+(this|the uploaded|the source|image|sheet|board)\s+(a|an|into)\b/,
  /\bcreate\s+(a|an|the).{0,48}\b(from this|from the uploaded|from the source|using this|using the source)\b/,
  /\bformat\s+(this|the uploaded|the source|image|sheet|board)\s+as\b/,
  /\breformat\b/,
  /\badapt\s+(this|the uploaded|the source|image|sheet|board)\s+(for|into|as)\b/,
  /\bresize\s+(this|the uploaded|the source|image|sheet|board)\s+(for|into|as)\b/,
  /\brepurpose\s+(this|the uploaded|the source|image|sheet|board)\b/,
  /\buse\s+(this|the uploaded|the source|image|sheet|board)\s+as\s+(the\s+)?source\b/
];

const sourceCuePatterns = [
  /\bthis\s+(image|sheet|board|character sheet|pitch sheet|source)\b/,
  /\bfrom\s+(this|the uploaded|the source)\b/,
  /\busing\s+(this|the uploaded|the source)\b/,
  /\buploaded\s+(image|source|sheet|board)\b/
];

const explicitRestylePatterns = [
  /\b(restyle|change style|new style|different style|style transfer)\b/,
  /\b(convert|turn|make|render|transform)\b.{0,80}\b(anime|cartoon|toon|photoreal|photorealistic|realistic|cinematic realism|painterly|watercolor|sketch|ink|comic|manga|pixel art|claymation|stop motion|stylized 3d|3d render|noir|retro futurist|retro-futuristic)\b/,
  /\bin\s+(anime|cartoon|toon|photoreal|photorealistic|realistic|painterly|watercolor|sketch|ink|comic|manga|pixel art|stylized 3d|3d|noir)\s+style\b/
];

const resolveDeliverableKind = (text: string): StagingDeliverableKind | undefined => {
  const match = deliverablePatterns.find(([, pattern]) => pattern.test(text));
  return match?.[0];
};

const getRecommendedAspectRatio = (kind?: StagingDeliverableKind): DirectorAspectRatio | undefined => {
  switch (kind) {
    case 'instagram_story':
      return '9:16';
    case 'instagram_post':
    case 'social_post':
    case 'promo_post':
      return '1:1';
    case 'poster':
      return '3:4';
    case 'banner':
    case 'thumbnail':
    case 'cover':
    case 'ad_graphic':
      return '16:9';
    default:
      return undefined;
  }
};

export const resolveStagingIntent = ({
  prompt,
  hasUploadedSourceImage
}: ResolveStagingIntentArgs): StagingIntentResolution => {
  const text = normalizePrompt(prompt);
  const deliverableKind = resolveDeliverableKind(text);
  const explicitRestyleRequested = hasAny(text, explicitRestylePatterns);
  const transformRequested = hasAny(text, transformPatterns);
  const sourceCuePresent = hasAny(text, sourceCuePatterns);
  const shouldPreserveSource =
    hasUploadedSourceImage &&
    !!deliverableKind &&
    (transformRequested || sourceCuePresent || /\b(instagram|social media|promo|poster|banner|thumbnail|cover)\b/.test(text));

  if (!shouldPreserveSource) {
    return {
      mode: 'standard_scene_generation',
      source: hasUploadedSourceImage ? 'uploaded_source_image' : 'none',
      deliverableKind,
      explicitRestyleRequested,
      reason: hasUploadedSourceImage
        ? 'No source-to-deliverable conversion intent detected.'
        : 'No uploaded source image is available.'
    };
  }

  return {
    mode: 'source_preserving_layout_transform',
    source: 'uploaded_source_image',
    deliverableKind,
    explicitRestyleRequested,
    recommendedAspectRatio: getRecommendedAspectRatio(deliverableKind),
    reason: 'Uploaded source image plus deliverable/reformat intent detected.'
  };
};

export const buildStagingSourcePreservationPromptBlock = (
  resolution: StagingIntentResolution,
  args: SourcePreservationPromptArgs = {}
): string => {
  if (resolution.mode !== 'source_preserving_layout_transform') return '';

  const sourceLabel = args.sourceLabel || 'Image A';
  const aspectLine = args.selectedAspectRatio
    ? `- Respect the selected canvas aspect ratio (${args.selectedAspectRatio}); crop and recompose without stretching the source.`
    : resolution.recommendedAspectRatio
      ? `- Preferred deliverable aspect ratio: ${resolution.recommendedAspectRatio}; crop and recompose without stretching the source.`
      : '- Crop and recompose without stretching the source image.';
  const restyleLine = resolution.explicitRestyleRequested
    ? '- The user explicitly requested a style change. Apply only that requested rendering-style change while preserving the same identity, character design, proportions, wardrobe intent, and recognizable source content.'
    : '- No style change was requested. Preserve the exact rendering family and visual style from the source image.';

  return [
    '### STAGING SOURCE-PRESERVING LAYOUT TRANSFORM (HARD)',
    `${sourceLabel} is the uploaded source image and is the authoritative visual reference.`,
    '- This is a layout and presentation transformation, not a character redesign.',
    '- Reformat the uploaded source into the requested deliverable format.',
    aspectLine,
    '',
    'STRICT SOURCE PRESERVATION RULES:',
    `- ${sourceLabel} is the primary visual source and must remain the authority.`,
    `- Preserve the same character/person/design from ${sourceLabel}.`,
    `- Preserve the exact rendering family, character rendering style, facial stylization, body proportions, wardrobe, color palette, lighting family, and design language from ${sourceLabel}.`,
    '- Reformat and recompose the source into the requested deliverable layout.',
    '- Only change layout, framing, cropping, text placement, background composition, spacing, margins, and graphic presentation as needed for the requested deliverable.',
    restyleLine,
    '- If text from the source is reused, keep it clean, readable, and intentionally placed.',
    '- If source text is too small or cluttered, simplify the text layout without changing the character style.',
    '- Keep the output recognizable as the same source image adapted into a new composition.',
    '',
    'NEGATIVE SOURCE-PRESERVATION RULES:',
    '- Do not redesign the character.',
    '- Do not reinterpret the character in a new style unless the user explicitly requested that style change.',
    '- Do not convert the character into a different cartoon, anime, photorealistic, painterly, or simplified style unless explicitly requested.',
    '- Do not invent a new face, new body, new wardrobe, or new character.',
    '- Do not style drift. Do not replace the character. Do not generate a new unrelated version.',
    '- Do not treat the source as loose inspiration. Do not convert the source into a different visual medium.',
    '- If any generic scene-compositing, environment-anchor, merge-strategy, or style-transfer instruction conflicts with this block, this source-preservation block wins.'
  ].join('\n');
};

export const buildSourcePreservingReferenceImages = (
  sourceUrl: string,
  references: StagingReferenceImage[],
  maxImages = 14
): StagingReferenceImage[] => {
  const ordered: StagingReferenceImage[] = [
    {
      url: sourceUrl,
      label: SOURCE_AUTHORITY_LABEL
    }
  ];
  const seen = new Set<string>([sourceUrl]);

  for (const reference of references) {
    if (!reference.url || seen.has(reference.url)) continue;
    ordered.push(reference);
    seen.add(reference.url);
    if (ordered.length >= maxImages) break;
  }

  return ordered;
};
