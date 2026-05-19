import {
    SHEET_STYLE_LOCK_NEGATIVE_TEXT,
    buildSheetStyleLockCorrectionText,
    resolveRenderFamily,
    type RenderFamily
} from "./sheetStyleLock";

export { resolveRenderFamily, type RenderFamily } from "./sheetStyleLock";

export type StyleCategoryId =
    | 'cinematic_realism'
    | 'stylized_animated_3d'
    | 'anime_stylized'
    | 'illustration_painted'
    | 'graphic_comic'
    | 'sci_fi_stylized'
    | 'claymation_tactile';

export type StyleCategoryContract = {
    id: StyleCategoryId;
    label: string;
    renderFamily: RenderFamily;
    category: string;
    identityTranslationRule: string;
    positivePrompt: string[];
    requiredTraits: string[];
    forbiddenTraits: string[];
    materialRules: string[];
    lightingRules: string[];
    negativePrompt: string[];
    validationCriteria: string[];
};

export type StyleCategoryIntent = {
    selectedStyleId?: string | null;
    selectedStyleLabel?: string;
    sourceImagePolicy?: string;
    boardPresentationPolicy?: string;
    lightingPolicy?: string;
    appliesTo?: string;
};

export type StyleCategoryValidationResult = {
    styleCoherent: boolean;
    requiresRetry: boolean;
    confidence: number;
    detectedStyle?: string;
    issueSummary?: string;
    driftTraits?: string[];
};

const LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID = ["p", "i", "x", "a", "r"].join("");

const STYLE_ALIASES: Record<string, StyleCategoryId | undefined> = {
    [LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID]: 'stylized_animated_3d',
    premium_animated_3d: 'stylized_animated_3d',
    family_3d: 'stylized_animated_3d',
    anim: 'stylized_animated_3d',
    animated_feature: 'stylized_animated_3d',
    stylized_3d: 'stylized_animated_3d',
    stylized_animation: 'stylized_animated_3d',
    stylized_realism: 'illustration_painted',
    premium_cg: 'cinematic_realism',
    hyper_real: 'cinematic_realism',
    exact_studio: 'cinematic_realism',
    realism: 'cinematic_realism',
    biometric_realism: 'cinematic_realism',
    cinematic_photoreal: 'cinematic_realism',
    photorealism: 'cinematic_realism',
    dslr_capture: 'cinematic_realism',
    anime: 'anime_stylized',
    anime_manga: 'anime_stylized',
    retro_anime: 'anime_stylized',
    retro_cel: 'anime_stylized',
    illustration: 'illustration_painted',
    editorial_illustration: 'illustration_painted',
    concept_art: 'illustration_painted',
    comic_book: 'graphic_comic',
    graphic_novel: 'graphic_comic',
    graphic_noir: 'graphic_comic',
    cyberpunk: 'sci_fi_stylized',
    cyberpunk_neon: 'sci_fi_stylized',
    scifi: 'sci_fi_stylized',
    sci_fi: 'sci_fi_stylized',
    claymation: 'claymation_tactile'
};

const STYLE_CONTRACTS: Record<StyleCategoryId, StyleCategoryContract> = {
    stylized_animated_3d: {
        id: 'stylized_animated_3d',
        label: 'Premium Stylized Animated 3D',
        renderFamily: 'premium_animated_3d',
        category: 'non-photorealistic animated 3D character design',
        identityTranslationRule: 'Translate the same biometric actor into premium animated 3D. Preserve biometric identity geometry: head silhouette, scalp/bald shape, brow placement, eye spacing, eye shape impression, nose/mouth/jaw/chin relationships, facial hair pattern, age impression, body presence, and costume continuity. Stylization may change surface shader, material response, and lighting, but must not recast the face.',
        positivePrompt: [
            'premium Pixar-style animated 3D character rendering',
            'feature-quality stylized animated 3D finish',
            'same biometric actor translated into animated 3D',
            'smooth stylized skin shader',
            'soft sculpted forms',
            'warm cinematic animated-feature lighting',
            'clean high-end CG finish',
            'subtle stylized proportion simplification without recasting'
        ],
        requiredTraits: [
            'clearly premium animated 3D character rendering',
            'same biometric identity geometry preserved in stylized form',
            'recognizable head silhouette, scalp shape, facial hair pattern, and age impression',
            'stylized surface treatment without recasting',
            'clean sculpted geometry',
            'smooth appealing CG materials',
            'non-photorealistic animated rendering',
            'consistent Family 3D style across all panels',
            'readable animated eyes that preserve the source eye spacing and identity',
            'no separate cartoon/flat inset'
        ],
        forbiddenTraits: [
            'different actor likeness',
            'generic animated protagonist face',
            'overly friendly redesigned face',
            'younger redesigned face',
            'over-rounded face',
            'oversized eyes that change identity',
            'photorealistic human',
            'live-action actor',
            'realistic skin pores',
            'claymation texture',
            'flat cartoon inset',
            'line-art mannequin',
            'concept-art painted panel',
            'painterly concept-art drift',
            'line-art model-sheet drift'
        ],
        materialRules: [
            'Use non-photoreal animation-film materials and stylized skin shading.',
            'Costume materials may be detailed, but their shader response must stay within stylized animated 3D.',
            'Do not render pores, stubble, or skin microtexture as live-action photographic detail.'
        ],
        lightingRules: [
            'Cinematic lighting is allowed only as stylized animated 3D lighting.',
            'Premium board lighting must not convert the character into live-action realism.',
            'Use soft sculptural key/fill/rim behavior appropriate to animation-film assets.'
        ],
        negativePrompt: [
            'different person',
            'new face',
            'generic stylized face',
            'generic animated man',
            'overly friendly face',
            'broad smile unless requested',
            'oversized eyes',
            'over-rounded face',
            'changed facial hair',
            'changed head shape',
            'changed age impression',
            'photorealistic',
            'DSLR photo',
            'live-action realism',
            'claymation',
            'flat cartoon inset',
            'line-art mannequin',
            'concept art painting'
        ],
        validationCriteria: [
            'The face and body read as one stylized animated 3D character, not a photographed person.',
            'Headshots and full-body panels share the same stylized 3D category.',
            'Skin is smooth/stylized rather than pore-level photographic.',
            'Biometric identity geometry remains preserved after animated 3D stylization.'
        ]
    },
    cinematic_realism: {
        id: 'cinematic_realism',
        label: 'Cinematic Realism',
        renderFamily: 'photoreal',
        category: 'realistic live-action / premium photographic character rendering',
        identityTranslationRule: 'Preserve biometric identity literally and photographically.',
        positivePrompt: [
            'realistic live-action film character',
            'natural human proportions',
            'believable photographic skin and wardrobe materials',
            'grounded cinematic portrait lighting'
        ],
        requiredTraits: [
            'realistic human proportions',
            'natural skin texture',
            'real skin/face texture',
            'photographic lighting',
            'camera/plausible lighting',
            'live-action film character read',
            'grounded anatomy and materials',
            'no stylized family animation',
            'no cartoon/anime/clay/illustration panels'
        ],
        forbiddenTraits: [
            'cartoon exaggeration',
            'anime facial structure',
            'toy-like body',
            'plastic stylized skin',
            'illustration or painted linework',
            'animated feature proportions'
        ],
        materialRules: [
            'Use realistic skin, fabric, leather, metal, and hair response.',
            'Preserve natural camera plausibility and believable material scale.'
        ],
        lightingRules: [
            'Lighting may be cinematic, studio, or editorial, but should remain physically plausible.',
            'Do not stylize lighting into cartoon or cel-shaded treatment.'
        ],
        negativePrompt: [
            'cartoon',
            'toy-like',
            'anime',
            'exaggerated animated proportions',
            'plastic stylized skin',
            'illustration',
            'painted',
            'cel shaded'
        ],
        validationCriteria: [
            'The character reads as a believable live-action or premium realistic CG human.',
            'No cartoon/anime/illustration category drift is visible.'
        ]
    },
    anime_stylized: {
        id: 'anime_stylized',
        label: 'Anime / Cel-Stylized',
        renderFamily: 'anime_cel',
        category: 'anime-inspired stylized character rendering',
        identityTranslationRule: 'Translate biometric identity into anime/cel style while preserving head silhouette, facial hair pattern, age impression, and key facial relationships.',
        positivePrompt: [
            'anime-inspired facial structure',
            'cel-stylized rendering',
            'clean line/shading language',
            'illustrated stylized proportions'
        ],
        requiredTraits: [
            'anime or cel-stylized face language',
            'simplified graphic shadows',
            'stylized hair shapes',
            'illustrated character proportions'
        ],
        forbiddenTraits: [
            'photorealistic head replacement',
            'real skin pores',
            'live-action DSLR portrait',
            'documentary realism',
            'realistic human face texture',
            'premium 3D CG panels',
            'claymation',
            'random anime protagonist unrelated to source'
        ],
        materialRules: [
            'Use cel/anime-inspired material simplification.',
            'Costume detail should be graphic and readable, not photographic.'
        ],
        lightingRules: [
            'Cinematic lighting must translate into anime/cel shading and graphic values.',
            'Do not let realistic lighting override anime stylization.'
        ],
        negativePrompt: [
            'photorealistic',
            'realistic human portrait',
            'live-action',
            'DSLR photo',
            'real skin pores',
            'raw photo'
        ],
        validationCriteria: [
            'The face, hair, and body read as anime/cel-stylized.',
            'No realistic photo head appears in the stylized output.'
        ]
    },
    illustration_painted: {
        id: 'illustration_painted',
        label: 'Illustration / Concept Art',
        renderFamily: 'illustrated_concept',
        category: 'drawn or painted character rendering',
        identityTranslationRule: 'Translate biometric identity into illustrated/concept-art style while preserving the same head silhouette, face relationships, age impression, body presence, costume continuity, and identity markers.',
        positivePrompt: [
            'illustrated character art',
            'painted or drawn finish',
            'visible art-direction surface language',
            'concept-art presentation'
        ],
        requiredTraits: [
            'drawn/painted look',
            'visible illustration treatment',
            'art-directed edges and values',
            'non-photographic surface finish'
        ],
        forbiddenTraits: [
            'photorealistic render',
            'raw camera photograph',
            'realistic DSLR portrait',
            'live-action head replacement'
        ],
        materialRules: [
            'Materials should read through illustration or concept-art rendering.',
            'Avoid raw photographic material response.'
        ],
        lightingRules: [
            'Lighting supports the painted/illustrated value structure.',
            'Do not convert the image into a photo because of cinematic lighting.'
        ],
        negativePrompt: [
            'photorealistic',
            'DSLR photo',
            'raw photograph',
            'live-action',
            'real skin pores'
        ],
        validationCriteria: [
            'The final image reads as illustration/concept art rather than photography.'
        ]
    },
    graphic_comic: {
        id: 'graphic_comic',
        label: 'Graphic Comic / Noir',
        renderFamily: 'graphic_comic',
        category: 'graphic novel or comic-book character rendering',
        identityTranslationRule: 'Translate biometric identity into graphic/inked style while preserving key silhouette and facial structure.',
        positivePrompt: [
            'graphic novel character rendering',
            'controlled ink/line language',
            'bold value shapes',
            'comic-book readability'
        ],
        requiredTraits: [
            'graphic line or ink influence',
            'bold shadows or halftone/value design',
            'non-photographic comic presentation'
        ],
        forbiddenTraits: [
            'photorealistic portrait',
            'raw DSLR photo',
            'live-action realism',
            'smooth animated toy-like look unless explicitly hybrid',
            'premium animated 3D panels',
            'anime drift unless selected',
            'unrelated comic face template'
        ],
        materialRules: [
            'Materials should simplify into graphic shapes and readable marks.',
            'Avoid photographic skin microtexture.'
        ],
        lightingRules: [
            'Lighting should create graphic contrast and strong readable silhouettes.',
            'Do not let noir lighting become live-action photo realism.'
        ],
        negativePrompt: [
            'photorealistic',
            'raw photo',
            'DSLR portrait',
            'real skin pores',
            'live-action'
        ],
        validationCriteria: [
            'The image reads as comic/graphic novel, not a photo with contrast.'
        ]
    },
    sci_fi_stylized: {
        id: 'sci_fi_stylized',
        label: 'Stylized Sci-Fi / Cyberpunk',
        renderFamily: 'cyberpunk_stylized',
        category: 'stylized high-tech character rendering',
        identityTranslationRule: 'Translate same biometric actor into cyberpunk/stylized sci-fi look without changing core face/head identity.',
        positivePrompt: [
            'stylized sci-fi character design',
            'high-tech material language',
            'neon/cyberpunk color discipline',
            'genre-specific costume rendering'
        ],
        requiredTraits: [
            'clear futuristic styling',
            'high-tech wardrobe/material language',
            'stylized genre presentation rather than default realism'
        ],
        forbiddenTraits: [
            'plain documentary realism',
            'generic modern portrait',
            'unselected photorealistic actor rendering',
            'style-neutral studio photo',
            'generic attractive cyberpunk model',
            'different face',
            'random prosthetics/cybernetic face changes unless requested',
            'realism/flat illustration drift'
        ],
        materialRules: [
            'Sci-fi materials should look intentional and designed.',
            'Do not default to realism unless a realism style is selected.'
        ],
        lightingRules: [
            'Neon and cinematic lighting must support sci-fi style identity.',
            'Do not flatten into a neutral realistic studio portrait.'
        ],
        negativePrompt: [
            'plain DSLR portrait',
            'generic photo',
            'style-neutral realism',
            'ordinary modern clothing'
        ],
        validationCriteria: [
            'The image reads as stylized sci-fi/cyberpunk rather than ordinary realism.'
        ]
    },
    claymation_tactile: {
        id: 'claymation_tactile',
        label: 'Claymation / Tactile Stop-Motion',
        renderFamily: 'claymation_tactile',
        category: 'handcrafted tactile stylized character rendering',
        identityTranslationRule: 'Translate the same biometric actor into clay/plasticine material. Do not create a new puppet identity.',
        positivePrompt: [
            'same biometric likeness translated into clay',
            'handcrafted sculpted forms',
            'plasticine / clay material feel',
            'tactile stop-motion clay/plasticine rendering',
            'same biometric actor recreated in clay material',
            'same adult actor proportions',
            'same head and facial hair structure',
            'visible handmade surface character',
            'photographed miniature/stop-motion material feel',
            'non-photoreal practical stop-motion feel'
        ],
        requiredTraits: [
            'same biometric likeness translated into clay',
            'same adult actor proportions',
            'same head and facial hair structure',
            'tactile clay surface without recasting',
            'handcrafted sculpted forms',
            'tactile clay/plasticine material response',
            'non-photoreal handmade finish',
            'clear separation from polished premium CG'
        ],
        forbiddenTraits: [
            'photorealistic human portrait',
            'live-action actor',
            'real skin pores',
            'raw DSLR photo',
            'premium animated-feature CG',
            'Pixar-like polished 3D',
            'sleek family-animation rendering',
            'clean modern CG skin shading',
            'new puppet identity',
            'generic clay character',
            'generic clay puppet',
            'cute mascot face',
            'chibi proportions',
            'toy figurine proportions',
            'overly friendly redesigned face',
            'different actor likeness',
            'premium animated 3D'
        ],
        materialRules: [
            'Use tactile, sculpted, handmade clay/plasticine material language.',
            'Surfaces should feel shaped by hand rather than digitally perfect.',
            'Avoid realistic skin pores or polished CG skin shading.'
        ],
        lightingRules: [
            'Lighting may be cinematic but must feel like the same actor recreated as a tactile stop-motion clay/plasticine character asset.',
            'Do not become live-action human realism or premium animated-feature CG.'
        ],
        negativePrompt: [
            'photorealistic',
            'live-action',
            'raw photo',
            'real skin pores',
            'DSLR portrait',
            'Pixar-like',
            'premium animated 3D',
            'polished family 3D',
            'sleek CG character',
            'different person',
            'new face',
            'generic clay puppet',
            'cute mascot',
            'chibi',
            'toy-like proportions',
            'oversized head',
            'over-smiling face',
            'random clay blob',
            'flesh blob inset'
        ],
        validationCriteria: [
            'The image reads as tactile stop-motion/clay-inspired character art.',
            'The result preserves the same biometric likeness and adult actor proportions.',
            'The result does not read as premium animated-feature 3D.'
        ]
    }
};

const cleanStyleId = (value?: string | null): string =>
    (value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export const resolveStyleCategoryId = (styleId?: string | null): StyleCategoryId | undefined => {
    const cleaned = cleanStyleId(styleId);
    if (!cleaned || cleaned === 'none' || cleaned === 'no_specific_style') return undefined;
    return STYLE_ALIASES[cleaned] || (cleaned in STYLE_CONTRACTS ? cleaned as StyleCategoryId : undefined);
};

export const getStyleCategoryContract = (styleId?: string | null): StyleCategoryContract | undefined => {
    const resolved = resolveStyleCategoryId(styleId);
    return resolved ? STYLE_CONTRACTS[resolved] : undefined;
};

export const inferStyleCategoryIdFromPrompt = (prompt: string): StyleCategoryId | undefined => {
    if (/STYLE CATEGORY CONTRACT/i.test(prompt)) {
        const match = prompt.match(/- categoryId:\s*([a-z0-9_]+)/i);
        if (match) return resolveStyleCategoryId(match[1]);
    }
    const promptWithoutNegatives = prompt
        .replace(/\bNEGATIVE CONSTRAINTS?:[\s\S]*$/i, '')
        .replace(/\bDO NOT INCLUDE:[\s\S]*$/i, '');

    if (/\b(claymation|stop-motion|clay-like|plasticine)\b/i.test(promptWithoutNegatives)) return 'claymation_tactile';
    if (/\b(family 3d|premium animated 3d|premium animated-feature|stylized animated 3d|animated feature|animation-film|non-photorealistic animated)\b/i.test(promptWithoutNegatives)) {
        return 'stylized_animated_3d';
    }
    if (/\b(exact studio|cinematic photoreal|photorealistic\s+(?:4k|8k|portrait|human|render|character)|dslr\s+(?:capture|photo|portrait)|live-action\s+(?:film|actor|character|portrait)|raw photo\s+(?:portrait|character|capture)|realistic skin texture|photographic lighting)\b/i.test(promptWithoutNegatives)) {
        return 'cinematic_realism';
    }
    if (/\b(anime|manga|retro cel|cel-shaded)\b/i.test(promptWithoutNegatives)) return 'anime_stylized';
    if (/\b(illustration|illustrated|concept art|painted)\b/i.test(promptWithoutNegatives)) return 'illustration_painted';
    if (/\b(comic book|graphic novel|graphic noir|halftone)\b/i.test(promptWithoutNegatives)) return 'graphic_comic';
    if (/\b(cyberpunk|sci-fi|science fiction|neon techwear)\b/i.test(promptWithoutNegatives)) return 'sci_fi_stylized';
    return undefined;
};

// Appwide style authority: source images define identity, but the selected
// Character Render Style owns visual category and cannot be overridden by
// cinematic lighting, board layout language, or source-photo realism.
export const buildStyleCategoryContract = (
    styleId: string | null | undefined,
    intent: StyleCategoryIntent = {}
): string => {
    const resolvedStyleId = resolveStyleCategoryId(styleId) || inferStyleCategoryIdFromPrompt(styleId || '');
    const contract = resolvedStyleId ? STYLE_CONTRACTS[resolvedStyleId] : undefined;
    if (!contract) return '';
    const renderFamily = resolveRenderFamily(intent.selectedStyleId || styleId || resolvedStyleId);

    const selectedStyleLabel = intent.selectedStyleLabel || contract.label;
    const sourceImagePolicy = intent.sourceImagePolicy || 'Source images control identity only; they do not control visual style category.';
    const boardPresentationPolicy = intent.boardPresentationPolicy || 'Board Presentation Style controls layout, typography, labels, and production-board composition only.';
    const lightingPolicy = intent.lightingPolicy || 'Lighting Mood must adapt to the selected Character Render Style.';
    const appliesTo = intent.appliesTo || 'all character panels, full-body views, turnarounds, headshots, supporting pose insets, and previews where the character appears';

return `STYLE CATEGORY CONTRACT (CHARACTER RENDER STYLE LOCK):
- categoryId: ${contract.id}
- selectedStyleLabel: ${selectedStyleLabel}
- renderFamily: ${renderFamily}
- category: ${contract.category}
- appliesTo: ${appliesTo}

STYLE PRIORITY ORDER:
1. Identity likeness.
2. Selected Character Render Style category.
3. Wardrobe/costume design.
4. Lighting mood interpreted within the selected style.
5. Board/presentation style as layout only.
6. Background/world/era details.

ARCHITECTURAL RULES:
- ${sourceImagePolicy}
- Character Render Style controls visual category and is mandatory.
- Character Render Style must translate the source identity; it must not replace biometric/source facial topology with a generic style-template face.
- Style traits such as larger eyes, softened forms, or exaggerated proportions must be interpreted around the same person's brow, eye spacing, nose, cheek, mouth, jaw, chin, skull, hair state, facial hair, skin tone, age impression, and distinctive marks.
- If style-category defaults conflict with identity likeness, preserve identity topology and express the style through shader, material response, lighting, edge treatment, simplification level, and non-photoreal rendering.
- ${boardPresentationPolicy}
- ${lightingPolicy}
- Cinematic, premium, photo-grade, film-board, or realistic lighting language must not override the selected character render category.
- The selected Character Render Style must apply consistently to main body render, turnarounds, headshots, supporting pose render insets, and character previews.

IDENTITY TRANSLATION RULE:
- ${contract.identityTranslationRule}

POSITIVE STYLE DEFINITION:
${contract.positivePrompt.map((line) => `- ${line}`).join('\n')}

REQUIRED STYLE TRAITS:
${contract.requiredTraits.map((line) => `- ${line}`).join('\n')}

FORBIDDEN STYLE DRIFT:
${contract.forbiddenTraits.map((line) => `- ${line}`).join('\n')}

MATERIAL / RENDERING RULES:
${contract.materialRules.map((line) => `- ${line}`).join('\n')}

LIGHTING COMPATIBILITY RULES:
${contract.lightingRules.map((line) => `- ${line}`).join('\n')}

STYLE SELF-CHECK:
${contract.validationCriteria.map((line) => `- ${line}`).join('\n')}`;
};

export const buildStyleNegativePrompt = (styleId?: string | null): string => {
    const resolvedStyleId = resolveStyleCategoryId(styleId) || inferStyleCategoryIdFromPrompt(styleId || '');
    const contract = resolvedStyleId ? STYLE_CONTRACTS[resolvedStyleId] : undefined;
    return contract ? contract.negativePrompt.join(', ') : '';
};

export const withStyleCategoryContract = (
    prompt: string,
    styleId?: string | null,
    intent: StyleCategoryIntent = {}
): string => {
    if (/STYLE CATEGORY CONTRACT/i.test(prompt)) return prompt;
    const block = buildStyleCategoryContract(styleId || inferStyleCategoryIdFromPrompt(prompt), intent);
    return block ? `${prompt.trim()}\n\n${block}` : prompt;
};

export const shouldApplyStyleCategoryContract = (prompt: string, styleId?: string | null): boolean =>
    Boolean(resolveStyleCategoryId(styleId) || inferStyleCategoryIdFromPrompt(prompt));

export const shouldValidateStyleCategory = (prompt: string, styleId?: string | null): boolean =>
    shouldApplyStyleCategoryContract(prompt, styleId) &&
    /\b(character|actor|person|subject|portrait|headshot|reference sheet|character sheet|turnaround|wardrobe|costume|style)\b/i.test(prompt);

export const buildStyleValidationPrompt = (
    originalPrompt: string,
    styleId?: string | null,
    intent: StyleCategoryIntent = {}
): string => {
    const resolved = resolveStyleCategoryId(styleId) || inferStyleCategoryIdFromPrompt(originalPrompt);
    const contract = resolved ? STYLE_CONTRACTS[resolved] : undefined;
    if (!contract) return '';
    const renderFamily = resolveRenderFamily(intent.selectedStyleId || styleId || resolved);

    return `
You are a strict style-category quality gate for generated character imagery.

Selected style category:
- categoryId: ${contract.id}
- label: ${intent.selectedStyleLabel || contract.label}
- renderFamily: ${renderFamily}
- category: ${contract.category}

Evaluate whether every visible character panel matches the selected category.
Source images are identity only; do not allow source-photo realism to override the selected render style.
Board/presentation style controls layout only; do not allow premium film board or cinematic lighting to change character category.
Also evaluate sheet-level style consistency: hero render, head studies, turnarounds, supporting pose render, footwear/material insets, and callout presentation must share one rendering family.
Any color-blocking, palette, construction, material, footwear, expression, or gesture inset that contains a character/body/head/pose/costume-on-body silhouette must match that same rendering family. A flat/vector/cartoon miniature character in a rendered sheet is style drift, not an acceptable diagram.

Mixed-style rejection rule:
${SHEET_STYLE_LOCK_NEGATIVE_TEXT}

Required traits:
${contract.requiredTraits.map((line) => `- ${line}`).join('\n')}

Forbidden drift traits:
${contract.forbiddenTraits.map((line) => `- ${line}`).join('\n')}

Validation criteria:
${contract.validationCriteria.map((line) => `- ${line}`).join('\n')}

Prompt context:
${originalPrompt.slice(0, 6000)}

Reject obvious category drift only. If the character category is correct but lighting/layout differs, pass.
Reject if the selected style family is mixed with another family.
Reject obvious mixed-style sheets where one panel is stylized 3D and another is flat illustration, realism, cartoon, anime, painterly, or another rendering family without explicit multi-style comparison instructions.
Reject sheets where a color-blocking or detail inset uses simplified flat/vector character thumbnails while the rest of the character sheet uses the selected rendered style.
Reject if a supporting pose inset or gesture inset uses a different rendering family than the main character board.
Reject if a rendered 3D board contains a flat/cartoon/vector/mascot/chibi miniature character.
Reject if a Family 3D sheet contains photoreal or line-art inset.
Reject if a clay sheet contains premium CG or malformed clay/flesh blob inset.
Reject if profile panel has axis mismatch.
Reject if supporting pose render uses another render family.
Reject if a full-body panel shows upper-body/lower-body directional disagreement.
Reject if a side-profile panel has a profile torso but non-profile hips, legs, feet, or head.
Reject the sheet if a left profile head and right profile head do not read as opposite signed profile views.
Reject the sheet if a 3/4 left head and 3/4 right head collapse into the same orientation.
Reject the sheet if a profile head appears too frontal.
Reject the sheet if a 3/4 head appears too profile or too frontal.
Reject the sheet if the labeled head direction does not match the rendered craniofacial direction.
Reject the sheet if one head study appears to be a mirrored duplicate of another.

Possible drift traits:
- mixed render family
- cartoon inset in rendered sheet
- off-style supporting pose
- body-axis split
- profile axis cheat
- signed head-angle drift
- head label/render mismatch
- mirrored profile duplication
- left/right head ambiguity
- identity recast
- morphology/body override leak

Return ONLY valid JSON:
{
  "styleCoherent": true,
  "requiresRetry": false,
  "confidence": 0.0,
  "detectedStyle": "string",
  "issueSummary": "string",
  "driftTraits": ["string"]
}
`.trim();
};

export const parseStyleValidation = (text: string): StyleCategoryValidationResult => {
    const fallback: StyleCategoryValidationResult = {
        styleCoherent: true,
        requiresRetry: false,
        confidence: 0,
        issueSummary: 'validator returned non-JSON text'
    };

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return fallback;

    try {
        const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)) as Partial<StyleCategoryValidationResult>;
        const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0;

        return {
            styleCoherent: parsed.styleCoherent !== false,
            requiresRetry: parsed.requiresRetry === true,
            confidence,
            detectedStyle: parsed.detectedStyle,
            issueSummary: parsed.issueSummary,
            driftTraits: Array.isArray(parsed.driftTraits) ? parsed.driftTraits : []
        };
    } catch {
        return fallback;
    }
};

export const buildStyleCorrectionPrompt = (
    originalPrompt: string,
    validation: StyleCategoryValidationResult,
    styleId?: string | null,
    intent: StyleCategoryIntent = {}
): string => {
    const resolved = resolveStyleCategoryId(styleId) || inferStyleCategoryIdFromPrompt(originalPrompt);
    const contract = resolved ? STYLE_CONTRACTS[resolved] : undefined;
    if (!contract) return originalPrompt;

    const driftSummary = validation.issueSummary || `output drifted away from ${contract.label}`;
    return `${originalPrompt.trim()}

STYLE CATEGORY CORRECTION PASS (MANDATORY):
- Previous result failed selected Character Render Style validation: ${driftSummary}.
- Regenerate with stronger "${contract.label}" category discipline.
- Preserve identity likeness, hairstyle, facial hair, wardrobe/costume design, layout, pose coherence, headshot wardrobe continuity, and labels.
- Correct only the visual render category drift.
- Remove forbidden drift traits: ${contract.forbiddenTraits.join(', ')}.

${buildStyleCategoryContract(contract.id, {
    ...intent,
    selectedStyleId: intent.selectedStyleId || styleId || contract.id,
    selectedStyleLabel: intent.selectedStyleLabel || contract.label
})}

${buildSheetStyleLockCorrectionText(styleId || contract.id, {
    source: 'user_selected',
    selectedStyleLabel: intent.selectedStyleLabel || contract.label,
    strictness: 'high'
})}`;
};
