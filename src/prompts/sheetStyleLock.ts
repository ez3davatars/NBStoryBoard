export type SheetStyleLockSource = "reference_image" | "user_selected" | "auto_detected" | "default";
export type SheetStyleLockStrictness = "high" | "maximum";

export type SheetStyleFamily =
    | "cinematic_realism"
    | "stylized_3D"
    | "semi_realistic_3D"
    | "illustrated_concept_art"
    | "painterly"
    | "anime"
    | "toon_cartoon"
    | "noir"
    | "retro_futuristic"
    | "editorial_fashion_render"
    | "claymation_tactile";

export type SheetStyleLock = {
    enabled: true;
    source: SheetStyleLockSource;
    style_family: SheetStyleFamily;
    style_description: string;
    strictness: SheetStyleLockStrictness;
    allow_mixed_styles: false;
};

export type SheetStyleLockIntent = {
    source?: SheetStyleLockSource;
    selectedStyleLabel?: string;
    referenceStyleDescription?: string;
    strictness?: SheetStyleLockStrictness;
    appliesTo?: string[];
};

const STYLE_FAMILY_DESCRIPTIONS: Record<SheetStyleFamily, string> = {
    cinematic_realism: "cinematic realism with realistic human materials, photographic lighting logic, natural anatomy language, and grounded live-action character rendering",
    stylized_3D: "polished stylized 3D character render with soft cinematic lighting, rounded forms, clean material response, and high-quality production pitch-sheet finish",
    semi_realistic_3D: "semi-realistic 3D character render with believable facial structure, refined CG materials, cinematic lighting, and controlled stylization",
    illustrated_concept_art: "illustrated concept-art character board with cohesive drawn/painted rendering, designed shapes, production-art material reads, and consistent art-department finish",
    painterly: "painterly character render with cohesive brushwork, controlled value design, painted material treatment, and unified production illustration finish",
    anime: "anime/cel-inspired character rendering with consistent linework, cel shading, stylized facial language, and unified illustrated material treatment",
    toon_cartoon: "toon/cartoon character rendering with simplified shape language, consistent non-realistic shading, and coherent animated surface treatment",
    noir: "graphic noir character rendering with consistent ink/shadow language, dramatic contrast, restrained palette, and unified graphic material finish",
    retro_futuristic: "retro-futuristic character rendering with cohesive sci-fi material language, neon or analog-future lighting logic, and consistent stylized surface treatment",
    editorial_fashion_render: "editorial fashion character render with polished magazine-board lighting, refined garment material emphasis, and consistent high-end fashion illustration or photography finish",
    claymation_tactile: "tactile stop-motion / claymation character rendering with handcrafted sculpted forms, photographed miniature/puppet feel, visible handmade material response, non-photoreal clay surfaces, and cohesive stop-motion production finish"
};

const LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID = ["p", "i", "x", "a", "r"].join("");

const STYLE_ID_TO_FAMILY: Record<string, SheetStyleFamily> = {
    biometric_realism: "cinematic_realism",
    cinematic_photoreal: "cinematic_realism",
    exact_studio: "cinematic_realism",
    photorealism: "cinematic_realism",
    dslr_capture: "cinematic_realism",
    realism: "cinematic_realism",
    anim: "stylized_3D",
    hyper_real: "cinematic_realism",
    premium_cg: "semi_realistic_3D",
    stylized_realism: "semi_realistic_3D",
    family_3d: "stylized_3D",
    premium_animated_3d: "stylized_3D",
    [LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID]: "stylized_3D",
    animated_feature: "stylized_3D",
    stylized_animated_3d: "stylized_3D",
    claymation: "claymation_tactile",
    retro_cel: "anime",
    retro_anime: "anime",
    anime_manga: "anime",
    anime: "anime",
    editorial_illustration: "editorial_fashion_render",
    concept_art: "illustrated_concept_art",
    illustration: "illustrated_concept_art",
    uncategorized: "cinematic_realism",
    painterly: "painterly",
    comic_book: "toon_cartoon",
    graphic_novel: "noir",
    graphic_noir: "noir",
    cyberpunk: "retro_futuristic",
    cyberpunk_neon: "retro_futuristic",
    scifi: "retro_futuristic",
    sci_fi: "retro_futuristic"
};

export const SHEET_STYLE_LOCK_NEGATIVE_TEXT =
    "No mixed styles. No realism mixed with cartoon. No stylized 3D mixed with flat illustration. No rendering-mode drift between panels. No simplified flat/vector character diagrams inside a rendered sheet. No flat color-blocking character miniatures. No inconsistent shading model, texture language, lighting logic, line-work, anatomy language, or material finish.";

const normalizeStyleId = (styleId?: string | null): string =>
    (styleId || "").trim().toLowerCase();

export const resolveSheetStyleFamily = (styleId?: string | null): SheetStyleFamily => {
    const clean = normalizeStyleId(styleId);
    if (!clean || clean === "none" || clean === "no_specific_style") return "cinematic_realism";
    return STYLE_ID_TO_FAMILY[clean] || "cinematic_realism";
};

export const buildSheetStyleLock = (
    styleId?: string | null,
    intent: SheetStyleLockIntent = {}
): SheetStyleLock => {
    const styleFamily = resolveSheetStyleFamily(styleId);
    const selectedStyleText = intent.selectedStyleLabel ? `${intent.selectedStyleLabel}: ` : "";
    const referenceStyleText = intent.referenceStyleDescription ? `${intent.referenceStyleDescription} ` : "";

    return {
        enabled: true,
        source: intent.source || (styleId && normalizeStyleId(styleId) !== "no_specific_style" ? "user_selected" : "default"),
        style_family: styleFamily,
        style_description: `${selectedStyleText}${referenceStyleText}${STYLE_FAMILY_DESCRIPTIONS[styleFamily]}`.trim(),
        strictness: intent.strictness || "high",
        allow_mixed_styles: false
    };
};

const formatStyleLockJson = (styleLock: SheetStyleLock): string =>
    JSON.stringify({ style_lock: styleLock }, null, 2);

const DEFAULT_PANEL_TARGETS = [
    "hero full-body render",
    "front head",
    "3/4 head",
    "side profile head",
    "expressive close-up",
    "full-body turnaround views",
    "rear view",
    "action pose / gesture study",
    "footwear detail inset",
    "material detail inset",
    "color blocking / palette inset",
    "costume detail crop",
    "any inset containing the character, body, head, hands, costume, or footwear",
    "annotations and callout presentation"
];

export const buildSheetStyleLockContract = (
    styleId?: string | null,
    intent: SheetStyleLockIntent = {}
): string => {
    const styleLock = buildSheetStyleLock(styleId, intent);
    const panelTargets = intent.appliesTo?.length ? intent.appliesTo : DEFAULT_PANEL_TARGETS;

    return `SHEET STYLE LOCK:
${formatStyleLockJson(styleLock)}

SHEET-LEVEL STYLE INHERITANCE:
- The style_lock object is the single authoritative rendering style for this entire character sheet.
- Every sub-panel must inherit style_family "${styleLock.style_family}" and style_description "${styleLock.style_description}".
${panelTargets.map(target => `- ${target}: inherit style_family "${styleLock.style_family}" exactly.`).join("\n")}
- Do not let head studies, turnaround views, footwear inserts, material details, gesture studies, or callout presentation switch to a different rendering mode.
- If any inset, callout panel, color-blocking panel, construction panel, or material panel shows the character, face, body, hands, feet, wardrobe on the body, or a character silhouette, it must be rendered as the same character in style_family "${styleLock.style_family}".
- Material swatches and palette chips may be simple samples only when they contain no character body, no face, no hands, no pose, and no costume-on-body silhouette.
- Never use simplified flat/vector/cartoon character drawings as color-blocking diagrams inside a sheet whose locked style is rendered, 3D, photographic, painterly, anime, or otherwise non-flat.
- If a source image and selected style conflict, follow the style_lock source "${styleLock.source}" and keep the character identity, proportions, wardrobe, and pose requirements unchanged.

MIXED-STYLE NEGATIVE PROMPT:
- ${SHEET_STYLE_LOCK_NEGATIVE_TEXT}

SHEET STYLE VALIDATION:
- Before final export, reject the sheet if any panel uses a different rendering family, shading model, texture language, lighting logic, line-work system, anatomy language, or material finish than style_family "${styleLock.style_family}".
- If a panel drifts, correct only the mismatched panel style while preserving identity likeness, body proportions, wardrobe continuity, pose/orientation requirements, and labels.`;
};

export const shouldApplySheetStyleLock = (prompt: string): boolean =>
    /\b(character pitch sheet|character reference sheet|reference sheet|turnaround|head studies|full-body|footwear|material detail|gesture study)\b/i.test(prompt);

export const withSheetStyleLockContract = (
    prompt: string,
    styleId?: string | null,
    intent: SheetStyleLockIntent = {}
): string => {
    if (/SHEET STYLE LOCK:/i.test(prompt)) return prompt;
    if (!shouldApplySheetStyleLock(prompt)) return prompt;
    return `${prompt.trim()}\n\n${buildSheetStyleLockContract(styleId, intent)}`;
};

export const buildSheetStyleLockCorrectionText = (
    styleId?: string | null,
    intent: SheetStyleLockIntent = {}
): string => {
    const styleLock = buildSheetStyleLock(styleId, intent);
    return `SHEET STYLE LOCK CORRECTION PASS:
- Previous output showed mixed visual styles or rendering-mode drift.
- Locked style_family: ${styleLock.style_family}.
- Locked style_description: ${styleLock.style_description}.
- Regenerate only mismatched panels if the generation process supports panel-level correction; otherwise rerender the sheet while preserving all correct identity, wardrobe, pose, layout, and label decisions.
- Correct style only. Do not change character likeness, proportions, wardrobe, identity, pose, head angle, or callouts.
- ${SHEET_STYLE_LOCK_NEGATIVE_TEXT}`;
};
