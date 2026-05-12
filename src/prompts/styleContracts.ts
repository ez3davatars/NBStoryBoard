import {
    SHEET_STYLE_LOCK_NEGATIVE_TEXT,
    buildSheetStyleLockCorrectionText
} from "./sheetStyleLock";

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
    category: string;
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

const STYLE_ALIASES: Record<string, StyleCategoryId | undefined> = {
    pixar: 'stylized_animated_3d',
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
        category: 'non-photorealistic animated 3D character design',
        positivePrompt: [
            'premium stylized animated 3D character',
            'family-feature animation style',
            'expressive simplified facial forms',
            'appealing exaggerated proportions',
            'soft sculpted features',
            'smooth stylized skin shader',
            'high-end animated film asset'
        ],
        requiredTraits: [
            'clearly stylized 3D animated character',
            'simplified but expressive facial structure',
            'slightly exaggerated proportions',
            'softened facial planes',
            'clean sculpted geometry',
            'large readable eyes compared to realistic human anatomy',
            'smooth appealing forms',
            'non-photorealistic rendering',
            'animation-film character design language'
        ],
        forbiddenTraits: [
            'photorealistic human',
            'live-action actor',
            'realistic skin pores',
            'documentary portrait',
            'real camera photograph',
            'gritty realism',
            'hyperreal skin texture',
            'realistic DSLR portrait',
            'cinematic live-action realism',
            'real human head pasted onto stylized body',
            'uncanny semi-realism',
            'scan-like realism'
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
            'photorealistic',
            'realistic human portrait',
            'live-action',
            'DSLR photo',
            'documentary realism',
            'real skin pores',
            'natural human scan',
            'gritty realism',
            'uncanny realistic face',
            'realistic head on cartoon body',
            'semi-realistic cinematic photograph',
            'raw photo'
        ],
        validationCriteria: [
            'The face and body read as one stylized animated 3D character, not a photographed person.',
            'Headshots and full-body panels share the same stylized 3D category.',
            'Skin is smooth/stylized rather than pore-level photographic.',
            'Proportions show appealing animation-film simplification.'
        ]
    },
    cinematic_realism: {
        id: 'cinematic_realism',
        label: 'Cinematic Realism',
        category: 'realistic live-action / premium photographic character rendering',
        positivePrompt: [
            'realistic live-action film character',
            'natural human proportions',
            'believable photographic skin and wardrobe materials',
            'grounded cinematic portrait lighting'
        ],
        requiredTraits: [
            'realistic human proportions',
            'natural skin texture',
            'photographic lighting',
            'live-action film character read',
            'grounded anatomy and materials'
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
        category: 'anime-inspired stylized character rendering',
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
            'realistic human face texture'
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
        category: 'drawn or painted character rendering',
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
        category: 'graphic novel or comic-book character rendering',
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
            'smooth animated toy-like look unless explicitly hybrid'
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
        category: 'stylized high-tech character rendering',
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
            'style-neutral studio photo'
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
        category: 'handcrafted tactile stylized character rendering',
        positivePrompt: [
            'tactile stop-motion character',
            'soft sculpted handcrafted forms',
            'subtle clay-like surface',
            'non-photoreal physical miniature feel'
        ],
        requiredTraits: [
            'handcrafted sculpted forms',
            'tactile material finish',
            'stop-motion character design',
            'non-photoreal look'
        ],
        forbiddenTraits: [
            'photorealistic human portrait',
            'live-action actor',
            'real skin pores',
            'raw DSLR photo'
        ],
        materialRules: [
            'Use tactile, sculpted, handmade material language.',
            'Avoid realistic skin pore rendering.'
        ],
        lightingRules: [
            'Lighting can be cinematic but must feel like a photographed tactile miniature/stop-motion asset.',
            'Do not become live-action human realism.'
        ],
        negativePrompt: [
            'photorealistic',
            'live-action',
            'raw photo',
            'real skin pores',
            'DSLR portrait'
        ],
        validationCriteria: [
            'The image reads as tactile stop-motion/clay-inspired character art.'
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

    if (/\b(family 3d|pixar-style|stylized animated 3d|animated feature|animation-film|non-photorealistic animated)\b/i.test(promptWithoutNegatives)) {
        return 'stylized_animated_3d';
    }
    if (/\b(exact studio|cinematic photoreal|photorealistic\s+(?:4k|8k|portrait|human|render|character)|dslr\s+(?:capture|photo|portrait)|live-action\s+(?:film|actor|character|portrait)|raw photo\s+(?:portrait|character|capture)|realistic skin texture|photographic lighting)\b/i.test(promptWithoutNegatives)) {
        return 'cinematic_realism';
    }
    if (/\b(anime|manga|retro cel|cel-shaded)\b/i.test(promptWithoutNegatives)) return 'anime_stylized';
    if (/\b(illustration|illustrated|concept art|painted)\b/i.test(promptWithoutNegatives)) return 'illustration_painted';
    if (/\b(comic book|graphic novel|graphic noir|halftone)\b/i.test(promptWithoutNegatives)) return 'graphic_comic';
    if (/\b(cyberpunk|sci-fi|science fiction|neon techwear)\b/i.test(promptWithoutNegatives)) return 'sci_fi_stylized';
    if (/\b(claymation|stop-motion|clay-like)\b/i.test(promptWithoutNegatives)) return 'claymation_tactile';
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

    const selectedStyleLabel = intent.selectedStyleLabel || contract.label;
    const sourceImagePolicy = intent.sourceImagePolicy || 'Source images control identity only; they do not control visual style category.';
    const boardPresentationPolicy = intent.boardPresentationPolicy || 'Board Presentation Style controls layout, typography, labels, and production-board composition only.';
    const lightingPolicy = intent.lightingPolicy || 'Lighting Mood must adapt to the selected Character Render Style.';
    const appliesTo = intent.appliesTo || 'all character panels, full-body views, turnarounds, headshots, action insets, and previews where the character appears';

return `STYLE CATEGORY CONTRACT (CHARACTER RENDER STYLE LOCK):
- categoryId: ${contract.id}
- selectedStyleLabel: ${selectedStyleLabel}
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
- The selected Character Render Style must apply consistently to main body render, turnarounds, headshots, action pose insets, and character previews.

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

    return `
You are a strict style-category quality gate for generated character imagery.

Selected style category:
- categoryId: ${contract.id}
- label: ${intent.selectedStyleLabel || contract.label}
- category: ${contract.category}

Evaluate whether every visible character panel matches the selected category.
Source images are identity only; do not allow source-photo realism to override the selected render style.
Board/presentation style controls layout only; do not allow premium film board or cinematic lighting to change character category.
Also evaluate sheet-level style consistency: hero render, head studies, turnarounds, action pose, footwear/material insets, and callout presentation must share one rendering family.

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
Reject obvious mixed-style sheets where one panel is stylized 3D and another is flat illustration, realism, cartoon, anime, painterly, or another rendering family without explicit multi-style comparison instructions.

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
