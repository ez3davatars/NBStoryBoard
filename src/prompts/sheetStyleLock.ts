export type SheetStyleLockSource = "reference_image" | "user_selected" | "auto_detected" | "default";
export type SheetStyleLockStrictness = "high" | "maximum";

export type RenderFamily =
    | "photoreal"
    | "premium_animated_3d"
    | "claymation_tactile"
    | "anime_cel"
    | "graphic_comic"
    | "illustrated_concept"
    | "cyberpunk_stylized"
    | "noir_graphic"
    | "editorial_fashion";

export type SheetStyleFamily = RenderFamily;

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

const RENDER_FAMILY_DESCRIPTIONS: Record<RenderFamily, string> = {
    photoreal: "photoreal character rendering with realistic human materials, camera-plausible lighting logic, natural anatomy language, and grounded live-action or studio character finish",
    premium_animated_3d: "premium animated 3D character rendering with smooth sculpted forms, non-photoreal CG materials, animation-feature lighting, and cohesive family-feature production finish",
    claymation_tactile: "tactile stop-motion / claymation character rendering that translates the same actor identity into handcrafted clay/plasticine material, visible handmade surface response, non-photoreal clay surfaces, and cohesive stop-motion production finish",
    anime_cel: "anime/cel character rendering with consistent linework, cel shading, signed head/pose readability, stylized facial language, and unified illustrated material treatment",
    graphic_comic: "graphic comic character rendering with controlled ink language, bold value shapes, print/comic material simplification, and unified graphic panel treatment",
    illustrated_concept: "illustrated concept-art character board with cohesive drawn/painted rendering, designed shapes, production-art material reads, and consistent art-department finish",
    cyberpunk_stylized: "stylized cyberpunk / sci-fi character rendering with cohesive high-tech material language, neon or futuristic lighting logic, and consistent stylized surface treatment",
    noir_graphic: "graphic noir character rendering with consistent ink/shadow language, dramatic contrast, restrained palette, and unified graphic material finish",
    editorial_fashion: "editorial fashion character rendering with polished magazine-board lighting, refined garment material emphasis, and consistent high-end fashion illustration or photography finish"
};

const LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID = ["p", "i", "x", "a", "r"].join("");

const STYLE_ID_TO_RENDER_FAMILY: Record<string, RenderFamily> = {
    biometric_realism: "photoreal",
    photoreal: "photoreal",
    cinematic_realism: "photoreal",
    cinematic_photoreal: "photoreal",
    exact_studio: "photoreal",
    photorealism: "photoreal",
    dslr_capture: "photoreal",
    realism: "photoreal",
    hyper_real: "photoreal",
    premium_cg: "photoreal",
    exactlikenessstudio: "photoreal",
    premiumcgrealism: "photoreal",
    anim: "premium_animated_3d",
    family_3d: "premium_animated_3d",
    premium_animated_3d: "premium_animated_3d",
    premiumanimated3d: "premium_animated_3d",
    [LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID]: "premium_animated_3d",
    animated_feature: "premium_animated_3d",
    stylized_animated_3d: "premium_animated_3d",
    claymation: "claymation_tactile",
    claymation_tactile: "claymation_tactile",
    retro_cel: "anime_cel",
    retro_anime: "anime_cel",
    anime_manga: "anime_cel",
    anime: "anime_cel",
    anime_cel: "anime_cel",
    anime_stylized: "anime_cel",
    retrocelanime: "anime_cel",
    comic_book: "graphic_comic",
    graphic_comic: "graphic_comic",
    graphic_novel: "graphic_comic",
    graphic_noir: "noir_graphic",
    noir_graphic: "noir_graphic",
    graphicnovelnoir: "noir_graphic",
    editorial_illustration: "editorial_fashion",
    editorial_fashion: "editorial_fashion",
    concept_art: "illustrated_concept",
    illustration: "illustrated_concept",
    illustration_painted: "illustrated_concept",
    illustrated_concept: "illustrated_concept",
    stylized_realism: "illustrated_concept",
    painterly: "illustrated_concept",
    cyberpunk: "cyberpunk_stylized",
    cyberpunk_neon: "cyberpunk_stylized",
    scifi: "cyberpunk_stylized",
    sci_fi: "cyberpunk_stylized",
    cyberpunkv2: "cyberpunk_stylized",
    sci_fi_stylized: "cyberpunk_stylized",
    cyberpunk_stylized: "cyberpunk_stylized",
    uncategorized: "photoreal",
    no_specific_style: "photoreal"
};

export const SHEET_STYLE_LOCK_NEGATIVE_TEXT =
    "No mixed styles. No realism mixed with cartoon. No stylized 3D mixed with flat illustration. No rendering-mode drift between panels. No simplified flat/vector character diagrams inside a rendered sheet. No flat color-blocking character miniatures. No inconsistent shading model, texture language, lighting logic, line-work, anatomy language, or material finish.";

const normalizeStyleId = (styleId?: string | null): string =>
    (styleId || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const resolveRenderFamily = (
    styleId?: string | null,
    fallback: RenderFamily = "premium_animated_3d"
): RenderFamily => {
    const clean = normalizeStyleId(styleId);
    if (!clean || clean === "none" || clean === "no_specific_style") return fallback;
    return STYLE_ID_TO_RENDER_FAMILY[clean] || fallback;
};

export const resolveSheetStyleFamily = (styleId?: string | null): SheetStyleFamily =>
    resolveRenderFamily(styleId);

export const describeRenderFamily = (family: RenderFamily): string =>
    RENDER_FAMILY_DESCRIPTIONS[family];

export const buildSheetStyleLock = (
    styleId?: string | null,
    intent: SheetStyleLockIntent = {}
): SheetStyleLock => {
    const styleFamily = resolveRenderFamily(styleId);
    const selectedStyleText = intent.selectedStyleLabel ? `${intent.selectedStyleLabel}: ` : "";
    const referenceStyleText = intent.referenceStyleDescription ? `${intent.referenceStyleDescription} ` : "";

    return {
        enabled: true,
        source: intent.source || (styleId && normalizeStyleId(styleId) !== "no_specific_style" ? "user_selected" : "default"),
        style_family: styleFamily,
        style_description: `${selectedStyleText}${referenceStyleText}${RENDER_FAMILY_DESCRIPTIONS[styleFamily]}`.trim(),
        strictness: intent.strictness || "high",
        allow_mixed_styles: false
    };
};

export function buildRenderFamilyPanelContract(styleId: string): string {
    const family = resolveRenderFamily(styleId);
    const familySpecificRules: Record<RenderFamily, string[]> = {
        photoreal: [
            "No cartoon/anime/illustration/CG toy drift.",
            "No stylized 3D inset.",
            "No flat drawn pose insert in a photographic board."
        ],
        premium_animated_3d: [
            "No photoreal realism.",
            "No claymation.",
            "No flat illustration.",
            "No vector/cartoon mini figure.",
            "No line-art mannequin.",
            "No concept-art painted inset.",
            "No separate 2D pose diagram."
        ],
        claymation_tactile: [
            "No premium CG/Pixar-like drift.",
            "No realism.",
            "No flat cartoon inset.",
            "No malformed clay/flesh blob insets."
        ],
        anime_cel: [
            "No photoreal head inserts.",
            "No 3D render panels.",
            "No clay/premium CG insets."
        ],
        graphic_comic: [
            "No photoreal insets.",
            "No 3D miniatures unless explicitly requested as a multi-style comparison.",
            "Keep ink/graphic language consistent."
        ],
        noir_graphic: [
            "No photoreal insets.",
            "No 3D miniatures unless explicitly requested as a multi-style comparison.",
            "Keep ink/graphic language consistent."
        ],
        illustrated_concept: [
            "No photoreal insets.",
            "No premium animated 3D miniatures unless explicitly requested as a multi-style comparison.",
            "Keep painted/illustrated language consistent."
        ],
        cyberpunk_stylized: [
            "No generic attractive cyberpunk model replacing the subject.",
            "No random prosthetics or cybernetic face changes unless explicitly requested.",
            "No realism/flat illustration drift away from the selected sci-fi render family."
        ],
        editorial_fashion: [
            "No cartoon/anime/clay insets.",
            "No unrelated fashion model replacing the actor.",
            "Keep editorial garment rendering and identity translation consistent across all character panels."
        ]
    };

    return `RENDER FAMILY PANEL CONTRACT:
- Selected render family: ${family}.
- Every panel containing the character must remain in this render family.
- Hero portrait, full-body turnarounds, head studies, expression close-up, supporting pose render, costume-on-body insets, footwear-on-body insets, hands, feet, and any character silhouette must match the same render family.
- Board presentation style controls layout, typography, callouts, and composition only. It must not change the character rendering family.
- If an inset cannot be rendered in the selected family, omit it instead of switching rendering families.
- Material swatches may be simple samples only when they contain no character body, face, hands, feet, or pose.
${familySpecificRules[family].map(rule => `- ${rule}`).join("\n")}`;
}

const formatStyleLockJson = (styleLock: SheetStyleLock): string =>
    JSON.stringify({ style_lock: styleLock }, null, 2);

const DEFAULT_PANEL_TARGETS = [
    "hero full-body render",
    "Neutral Front Head",
    "3/4 Left Head",
    "3/4 Right Head",
    "Left Profile Head",
    "Right Profile Head",
    "expressive close-up",
    "full-body turnaround views",
    "rear view",
    "supporting pose render",
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

${buildRenderFamilyPanelContract(styleId || styleLock.style_family)}

SHEET-LEVEL STYLE INHERITANCE:
- The style_lock object is the single authoritative rendering style for this entire character sheet.
- Every sub-panel must inherit style_family "${styleLock.style_family}" and style_description "${styleLock.style_description}".
${panelTargets.map(target => `- ${target}: inherit style_family "${styleLock.style_family}" exactly.`).join("\n")}
- Do not let head studies, turnaround views, footwear inserts, material details, supporting pose renders, or callout presentation switch to a different rendering mode.
- If any inset, callout panel, color-blocking panel, construction panel, or material panel shows the character, face, body, hands, feet, wardrobe on the body, or a character silhouette, it must be rendered as the same character in style_family "${styleLock.style_family}".
- Material swatches and palette chips may be simple samples only when they contain no character body, no face, no hands, no pose, and no costume-on-body silhouette.
- Never use simplified flat/vector/cartoon character drawings as color-blocking diagrams inside a sheet whose locked style is rendered, 3D, photographic, painterly, anime, or otherwise non-flat.
- If a source image and selected style conflict, follow the style_lock source "${styleLock.source}" and keep the character identity, proportions, wardrobe, and pose requirements unchanged.

MIXED-STYLE NEGATIVE PROMPT:
- ${SHEET_STYLE_LOCK_NEGATIVE_TEXT}

SHEET STYLE VALIDATION:
- Before final export, reject the sheet if any panel uses a different rendering family, shading model, texture language, lighting logic, line-work system, anatomy language, or material finish than style_family "${styleLock.style_family}".
- If a supporting pose render or inset containing the character appears as flat cartoon, vector, diagram, icon, doodle, chibi, mascot, or a different rendering family than the selected style_lock family, the sheet fails validation.
- If a character inset cannot inherit style_family exactly, omit it rather than switching style.
- Supporting pose render must inherit style_family exactly.
- HEAD PANEL VALIDATION:
- If a panel label specifies left, the rendered head must read left.
- If a panel label specifies right, the rendered head must read right.
- If a panel label specifies profile, the head must read as true profile.
- If a panel label specifies 3/4, the head must read as true 3/4.
- If two head panels that should be opposite signed views look like mirrored or repeated versions of the same side, validation fails.
- If a head panel is directionally ambiguous, validation fails.
- Head direction failure traits: head-direction mismatch, mirrored head duplication, left-right profile collapse, profile label mismatch, three-quarter label mismatch.
- If a panel drifts, correct only the mismatched panel style while preserving identity likeness, body proportions, wardrobe continuity, pose/orientation requirements, and labels.`;
};

export const shouldApplySheetStyleLock = (prompt: string): boolean =>
    /\b(character pitch sheet|pitch sheet|character reference sheet|reference sheet|character sheet|turnaround sheet|production board|model sheet)\b/i.test(prompt);

export const withSheetStyleLockContract = (
    prompt: string,
    styleId?: string | null,
    intent: SheetStyleLockIntent = {},
    force = false
): string => {
    if (/SHEET STYLE LOCK:/i.test(prompt)) return prompt;
    if (!force && !shouldApplySheetStyleLock(prompt)) return prompt;
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
