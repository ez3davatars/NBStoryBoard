export type CharacterPitchSheetIdentitySource =
    | "text_only"
    | "portrait_reference"
    | "biometric_multiview"
    | "biometric_plus_character";

export type CharacterPitchSheetSourcePanelMode =
    | "costume_matched"
    | "raw_source"
    | "hidden";

export type CharacterPitchSheetRenderStyle =
    | "biometric_realism"
    | "cinematic_photoreal"
    | "stylized_realism"
    | "animated_feature"
    | "editorial_illustration"
    | "concept_art"
    | "graphic_novel"
    | "anime_manga";

export type CharacterPitchSheetBoardPresentationStyle =
    | "premium_film_board"
    | "clean_studio_sheet"
    | "art_department_board"
    | "forensic_reference_board"
    | "merchandising_sheet";

export type CharacterPitchSheetFrameSize = "small" | "medium" | "large";
export type CharacterPitchSheetMusculature = "minimal" | "average" | "athletic" | "muscular";
export type CharacterPitchSheetBuildInterpretation =
    | "lean"
    | "lean_average"
    | "average"
    | "athletic"
    | "soft_average"
    | "stocky";
export type CharacterPitchSheetPhysiquePriority =
    | "match_face_impression"
    | "balanced"
    | "strict_body_specs";

export type CharacterPitchSheetStylePhysiqueFidelity =
    | "strict"
    | "balanced"
    | "expressive";

export type CharacterPitchSheetAnchorType =
    | "hero_portrait"
    | "front_full_body"
    | "head_profile";

export type CharacterPitchSheetPhysiqueProfile = {
    heightIn?: number;
    weightLbs?: number;
    heightLabel: string;
    weightLabel: string;
    frameSize: CharacterPitchSheetFrameSize;
    musculature: CharacterPitchSheetMusculature;
    buildInterpretation: CharacterPitchSheetBuildInterpretation;
    physiquePriority: CharacterPitchSheetPhysiquePriority;
    bmi?: number;
    summary: string;
    visualDescription: string;
    priorityDescription: string;
};

export type CharacterPitchSheetInput = {
    referenceImageUrl?: string;
    referenceImages?: Array<{
        angle?: string;
        imageUrl: string;
        label?: string;
    }>;
    identitySource?: CharacterPitchSheetIdentitySource;
    identityStrength?: number;
    characterStyleReferenceUrl?: string;
    sourcePanelMode?: CharacterPitchSheetSourcePanelMode;
    characterRenderStyle?: CharacterPitchSheetRenderStyle;
    boardPresentationStyle?: CharacterPitchSheetBoardPresentationStyle;
    heightIn?: number;
    weightLbs?: number;
    frameSize?: CharacterPitchSheetFrameSize;
    musculature?: CharacterPitchSheetMusculature;
    buildInterpretation?: CharacterPitchSheetBuildInterpretation;
    physiquePriority?: CharacterPitchSheetPhysiquePriority;
    stylePhysiqueFidelity?: CharacterPitchSheetStylePhysiqueFidelity;
    characterName: string;
    aliasCodename: string;
    visualAge: string;
    height: string;
    build: string;
    designLanguage: string;
    worldEra: string;
    corePersonality: string;
    internalConflict: string;
    wardrobeDirection: string;
    propsSignatureItems: string;
    environment: string;
    lightingMood: string;
    sheetStyle: string;
    additionalNotes: string;
    faceDetails: string;
    performanceDirection: string;
    materialCostumeNotes: string;
    productionNotes: string;
};

export const defaultCharacterPitchSheetInput: CharacterPitchSheetInput = {
    referenceImageUrl: undefined,
    referenceImages: undefined,
    identitySource: "text_only",
    identityStrength: undefined,
    characterStyleReferenceUrl: undefined,
    sourcePanelMode: "costume_matched",
    characterRenderStyle: "biometric_realism",
    boardPresentationStyle: "premium_film_board",
    heightIn: undefined,
    weightLbs: undefined,
    frameSize: "medium",
    musculature: "average",
    buildInterpretation: undefined,
    physiquePriority: "balanced",
    stylePhysiqueFidelity: undefined,
    characterName: "",
    aliasCodename: "",
    visualAge: "",
    height: "",
    build: "",
    designLanguage: "Grounded cinematic realism with premium concept-art polish",
    worldEra: "",
    corePersonality: "",
    internalConflict: "",
    wardrobeDirection: "",
    propsSignatureItems: "",
    environment: "",
    lightingMood: "Controlled cinematic studio lighting with selective rim light",
    sheetStyle: "Premium asymmetric character design sheet",
    additionalNotes: "",
    faceDetails: "",
    performanceDirection: "",
    materialCostumeNotes: "",
    productionNotes: "",
};

const normalize = (value: string | undefined): string => {
    return (value || "").trim().replace(/\s+/g, " ");
};

const valueOr = (...values: Array<string | undefined>): string => {
    for (const value of values) {
        const normalized = normalize(value);
        if (normalized) return normalized;
    }

    return "";
};

const inferVisualAge = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.visualAge);
    if (supplied) return supplied;

    const era = normalize(input.worldEra).toLowerCase();
    const conflict = normalize(input.internalConflict).toLowerCase();

    if (era.includes("academy") || era.includes("school") || conflict.includes("coming of age")) {
        return "late teens to early twenties";
    }

    if (conflict.includes("veteran") || conflict.includes("regret") || conflict.includes("exile")) {
        return "weathered adult";
    }

    return "adult";
};

const inferBuild = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.build);
    if (supplied) return supplied;

    const designLanguage = normalize(input.designLanguage).toLowerCase();
    const personality = normalize(input.corePersonality).toLowerCase();
    const wardrobe = normalize(input.wardrobeDirection).toLowerCase();

    if (designLanguage.includes("brutal") || personality.includes("stoic") || wardrobe.includes("armor")) {
        return "strong, practical build with believable physical presence";
    }

    if (designLanguage.includes("elegant") || personality.includes("cunning") || personality.includes("precise")) {
        return "lean, poised build with controlled posture";
    }

    return "proportionate cinematic build inferred from role, wardrobe, and world";
};

const inferFaceDesign = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.faceDetails);
    if (supplied) return supplied;

    const personality = valueOr(input.corePersonality, "complex, readable personality");
    const conflict = valueOr(input.internalConflict, "private emotional pressure");
    const designLanguage = valueOr(input.designLanguage, defaultCharacterPitchSheetInput.designLanguage);

    return `Distinct face shaped by ${personality} and ${conflict}: memorable silhouette, specific eye shape, intentional nose and mouth design, subtle asymmetry, lived-in skin detail, hairline and brow choices that match ${designLanguage}.`;
};

const inferPerformance = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.performanceDirection);
    if (supplied) return supplied;

    const personality = valueOr(input.corePersonality, "controlled, watchful presence");
    const conflict = valueOr(input.internalConflict, "unspoken inner tension");

    return `Body language communicates ${personality}; expression carries ${conflict}. Keep the performance cinematic and specific, with restrained gesture, believable gaze, and pose variation that never changes the character identity.`;
};

const inferWardrobe = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.wardrobeDirection);
    if (supplied) return supplied;

    const world = valueOr(input.worldEra, "the character's inferred world");
    const designLanguage = valueOr(input.designLanguage, defaultCharacterPitchSheetInput.designLanguage);

    return `Wardrobe inferred from ${world} and ${designLanguage}: clear silhouette, functional layering, period-aware closures, visible footwear, and one memorable costume signature that can be repeated consistently from every angle.`;
};

const inferProps = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.propsSignatureItems);
    if (supplied) return supplied;

    const world = valueOr(input.worldEra, "the story world");

    return `One or two signature items inferred from ${world}; each item has a precise location, scale, and attachment point, with no duplicated accessories unless explicitly requested.`;
};

const inferEnvironment = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.environment);
    if (supplied) return supplied;

    const world = valueOr(input.worldEra, "the character's world");

    return `Subtle production backdrop drawn from ${world}, present as atmosphere and material context without overpowering the character sheet.`;
};

const inferMaterialNotes = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.materialCostumeNotes);
    if (supplied) return supplied;

    const wardrobe = inferWardrobe(input);

    return `Render every material in the wardrobe with accurate weight, seams, stitching, wear, metal behavior, leather grain, fabric tension, closures, straps, soles, and edges. Materials must stay identical across front, side, back, head studies, and portrait. Wardrobe basis: ${wardrobe}`;
};

const inferProductionNotes = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.productionNotes);
    if (supplied) return supplied;

    return "Design must be production-ready for casting, wardrobe, continuity, and later scene generation. Prioritize readable silhouette, repeatable costume logic, strong face identity, and clear material callouts.";
};

const isBiometricIdentitySource = (input: CharacterPitchSheetInput): boolean => {
    return input.identitySource === "biometric_multiview" || input.identitySource === "biometric_plus_character";
};

const isReferenceDrivenIdentitySource = (input: CharacterPitchSheetInput): boolean => {
    return input.identitySource === "portrait_reference" || isBiometricIdentitySource(input);
};

const CHARACTER_RENDER_STYLE_BLOCKS: Record<CharacterPitchSheetRenderStyle, string> = {
    biometric_realism: `
CHARACTER RENDER STYLE: BIOMETRIC REALISM.
- Render as a highly realistic live-action human character design sheet with natural skin, pores, facial weight, hair behavior, and believable costume construction.
- Prioritize exact actor likeness, physically plausible anatomy, realistic lens perspective, natural facial planes, and non-illustrated material response.
- Avoid painterly abstraction, comic outlines, anime proportions, plastic skin, doll-like smoothing, fantasy exaggeration, or concept-art looseness unless explicitly requested elsewhere.
`,
    cinematic_photoreal: `
CHARACTER RENDER STYLE: CINEMATIC PHOTOREAL.
- Render as a polished live-action film character sheet with photographic realism, cinematic grading, realistic lenses, grounded lighting, and physically built costume materials.
- Preserve a camera-ready actor likeness while allowing refined film-poster lighting and production still polish.
- Avoid illustration drift, painterly brush texture, sketchy edges, cartoon proportions, or mixed-media treatment.
`,
    stylized_realism: `
CHARACTER RENDER STYLE: STYLIZED REALISM.
- Render with believable human anatomy and material logic, but allow controlled stylization in silhouette, color design, shape language, and cinematic finish.
- Keep the face, body, age impression, costume, and material continuity grounded and readable.
- Do not slide into cartoon, anime, caricature, or generic fantasy illustration.
`,
    animated_feature: `
CHARACTER RENDER STYLE: ANIMATED FEATURE.
- Render as a premium animated feature character sheet with appealing shape design, clean surface logic, expressive posing, and polished studio lighting.
- Translate the actor identity into animation without losing signature facial structure, age impression, skin tone, hairline, facial weight, or costume continuity.
- Avoid photoreal/photo insert panels, harsh forensic presentation, or inconsistent animation styles across the board.
`,
    editorial_illustration: `
CHARACTER RENDER STYLE: EDITORIAL ILLUSTRATION.
- Render as a high-end editorial illustration board with elegant draftsmanship, refined value control, sophisticated color, and cinematic portrait hierarchy.
- Preserve actor identity and costume fidelity while using intentional illustrated finish.
- Avoid casual sketchbook looseness, generic fantasy art, and mismatched panel styles.
`,
    concept_art: `
CHARACTER RENDER STYLE: CONCEPT ART.
- Render as production-grade concept art with cinematic polish, material callouts, readable design decisions, and art-department clarity.
- Use painterly finish only as a controlled production rendering treatment; identity, costume, proportions, and continuity remain locked.
- Avoid unresolved sketch panels, generic RPG costume drift, and inconsistent face designs between views.
`,
    graphic_novel: `
CHARACTER RENDER STYLE: GRAPHIC NOVEL.
- Render with premium graphic-novel finish: intentional linework, controlled ink shadows, cinematic panels, readable silhouettes, and strong material shapes.
- Preserve exact actor identity through the stylized line language: same facial weight, asymmetry, bone structure, age impression, and signature features.
- Avoid anime proportions, flat clip-art styling, or panel-to-panel costume redesign.
`,
    anime_manga: `
CHARACTER RENDER STYLE: ANIME / MANGA.
- Render as a premium anime/manga character design board with cohesive linework, refined cel or painterly shading, and production-ready costume clarity.
- Translate the actor identity carefully into anime language while preserving age impression, face shape, eye spacing logic, nose/mouth relationships, skin tone, hairline, build, and signature features.
- Avoid changing the character into a generic anime archetype or losing the costume/world specificity.
`
};

const BOARD_PRESENTATION_STYLE_BLOCKS: Record<CharacterPitchSheetBoardPresentationStyle, string> = {
    premium_film_board: `
BOARD PRESENTATION STYLE: PREMIUM FILM BOARD.
- Use an elevated cinematic pitch-board composition: dominant hero portrait, asymmetrical hierarchy, integrated turnarounds, head studies, material callouts, and selective production labels.
- The board should feel expensive, art-directed, and ready for film development.
`,
    clean_studio_sheet: `
BOARD PRESENTATION STYLE: CLEAN STUDIO SHEET.
- Use a restrained studio presentation with clean spacing, neutral panels, readable full-body views, organized head studies, and precise material/detail insets.
- Keep it polished and premium; avoid a generic grid or lifeless model-sheet row.
`,
    art_department_board: `
BOARD PRESENTATION STYLE: ART DEPARTMENT BOARD.
- Prioritize production decision-making: costume construction notes, material callouts, prop attachment logic, front/back continuity, color/material swatches, and design rationale.
- Keep the layout cinematic and designed, not cluttered or technical-only.
`,
    forensic_reference_board: `
BOARD PRESENTATION STYLE: FORENSIC REFERENCE BOARD.
- Emphasize exact identity continuity, clear angles, facial structure, and repeatable costume details with a premium evidence-board restraint.
- Maintain cinematic finish and board cohesion; do not show casual raw source photos unless raw-source mode is explicitly selected.
`,
    merchandising_sheet: `
BOARD PRESENTATION STYLE: MERCHANDISING SHEET.
- Present the character as a production-ready brandable design: iconic silhouette, readable costume, clean hero pose, accessory callouts, footwear, emblem details, and consumer-product clarity.
- Keep identity and costume fidelity locked; do not simplify into toy-like proportions unless the render style asks for animation.
`
};

const requiresRealismLock = (style: CharacterPitchSheetRenderStyle): boolean => {
    return style === "biometric_realism" || style === "cinematic_photoreal";
};

const formatHeightLabel = (heightIn: number | undefined): string => {
    if (typeof heightIn !== "number" || !Number.isFinite(heightIn)) {
        return "";
    }

    const rounded = Math.round(heightIn);
    const feet = Math.floor(rounded / 12);
    const inches = rounded % 12;

    return `${feet}'${inches}"`;
};

const parseHeightToInches = (value: string | undefined): number | undefined => {
    const normalized = normalize(value).toLowerCase();
    if (!normalized) return undefined;

    const cmMatch = normalized.match(/(\d+(?:\.\d+)?)\s*cm\b/);
    if (cmMatch) {
        return Math.round(Number(cmMatch[1]) / 2.54);
    }

    const feetInchesMatch = normalized.match(/(\d+)\s*(?:'|ft|feet)\s*(\d+)?/);
    if (feetInchesMatch) {
        const feet = Number(feetInchesMatch[1]);
        const inches = feetInchesMatch[2] ? Number(feetInchesMatch[2]) : 0;

        return feet * 12 + inches;
    }

    const numeric = Number(normalized.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;

    if (numeric > 120) {
        return Math.round(numeric / 2.54);
    }

    return Math.round(numeric);
};

const parseWeightToLbs = (value: string | undefined): number | undefined => {
    const normalized = normalize(value).toLowerCase();
    if (!normalized) return undefined;

    const kgMatch = normalized.match(/(\d+(?:\.\d+)?)\s*kg\b/);
    if (kgMatch) {
        return Math.round(Number(kgMatch[1]) / 0.453592);
    }

    const lbMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/);
    if (lbMatch) {
        return Math.round(Number(lbMatch[1]));
    }

    return undefined;
};

const deriveBuildInterpretation = (
    heightIn: number | undefined,
    weightLbs: number | undefined,
    musculature: CharacterPitchSheetMusculature,
    explicitBuild?: CharacterPitchSheetBuildInterpretation
): CharacterPitchSheetBuildInterpretation => {
    if (explicitBuild) return explicitBuild;

    if (!heightIn || !weightLbs) {
        if (musculature === "athletic" || musculature === "muscular") return "athletic";
        if (musculature === "minimal") return "lean";

        return "average";
    }

    const bmi = (weightLbs / (heightIn * heightIn)) * 703;

    if ((musculature === "athletic" || musculature === "muscular") && bmi >= 21 && bmi <= 29) {
        return "athletic";
    }

    if (bmi < 20.5) return "lean";
    if (bmi < 24.5) return "lean_average";
    if (bmi < 26.8) return "average";
    if (bmi < 29.5) return "soft_average";

    return "stocky";
};

const frameDescriptions: Record<CharacterPitchSheetFrameSize, string> = {
    small: "small frame with narrower skeletal width, lighter joints, and compact shoulder span",
    medium: "medium frame with moderate shoulder width, proportionate torso width, natural waist, and balanced limbs",
    large: "large frame with broader skeletal structure, wider shoulders, stronger joints, and naturally substantial proportions"
};

const musculatureDescriptions: Record<CharacterPitchSheetMusculature, string> = {
    minimal: "minimal visible musculature, softer everyday tone, and slimmer arm and thigh definition",
    average: "average natural musculature with believable everyday tone and no exaggerated bulk",
    athletic: "athletic musculature with controlled definition, firmer shoulders and limbs, and functional strength without bodybuilder mass",
    muscular: "muscular development with visibly stronger shoulders, chest, arms, thighs, and neck while remaining anatomically believable"
};

const buildInterpretationDescriptions: Record<CharacterPitchSheetBuildInterpretation, string> = {
    lean: "lean silhouette, low visual body mass, narrow-to-moderate waist, slim limbs, and no stocky or bulky read",
    lean_average: "average-to-lean silhouette, not overweight, not bulky, moderate shoulder width, natural waist, average arm and thigh thickness, slight natural softness only, and proportionate overall frame",
    average: "average proportional build, balanced torso and limb mass, moderate waist, ordinary shoulder width, and no exaggerated heaviness",
    athletic: "athletic proportional build, stronger posture, controlled shoulder width, visible functional tone, and stable limb mass without arbitrary bulk",
    soft_average: "soft-average build with mild natural softness, moderate torso width, average limbs, and no excessive stockiness or heavy redesign",
    stocky: "stockier build with broader torso mass, thicker limbs, wider neck and waist, and compact weight distribution while staying consistent across views"
};

const physiquePriorityDescriptions: Record<CharacterPitchSheetPhysiquePriority, string> = {
    match_face_impression: "Let the face impression modestly inform the body, but do not contradict explicit numeric height, weight, or build fields.",
    balanced: "Balance face impression, entered numeric specs, and user build notes; explicit numbers and build settings should prevent arbitrary body drift.",
    strict_body_specs: "Obey entered height, weight, frame, musculature, and build interpretation over face impression or model assumptions."
};

export function buildPhysiqueProfile(input: CharacterPitchSheetInput): CharacterPitchSheetPhysiqueProfile {
    const heightIn = input.heightIn || parseHeightToInches(input.height);
    const weightLbs = input.weightLbs || parseWeightToLbs(input.build);
    const frameSize = input.frameSize || defaultCharacterPitchSheetInput.frameSize || "medium";
    const musculature = input.musculature || defaultCharacterPitchSheetInput.musculature || "average";
    const physiquePriority = input.physiquePriority || defaultCharacterPitchSheetInput.physiquePriority || "balanced";
    const buildInterpretation = deriveBuildInterpretation(heightIn, weightLbs, musculature, input.buildInterpretation);
    const bmi = heightIn && weightLbs ? Number(((weightLbs / (heightIn * heightIn)) * 703).toFixed(1)) : undefined;
    const heightLabel = formatHeightLabel(heightIn) || valueOr(input.height, "height inferred from role and proportions");
    const weightLabel = weightLbs ? `${Math.round(weightLbs)} lb` : "weight inferred from build notes and role";
    const summary = `${frameSize} frame, ${buildInterpretation.replace(/_/g, "-")} build, ${musculature} musculature, proportionate overall physique`;
    const visualDescription = [
        frameDescriptions[frameSize],
        musculatureDescriptions[musculature],
        buildInterpretationDescriptions[buildInterpretation]
    ].join("; ");

    return {
        heightIn,
        weightLbs,
        heightLabel,
        weightLabel,
        frameSize,
        musculature,
        buildInterpretation,
        physiquePriority,
        bmi,
        summary,
        visualDescription,
        priorityDescription: physiquePriorityDescriptions[physiquePriority]
    };
}

export function getDefaultStylePhysiqueFidelity(style: CharacterPitchSheetRenderStyle | undefined): CharacterPitchSheetStylePhysiqueFidelity {
    switch (style) {
        case "animated_feature":
            return "balanced";
        case "biometric_realism":
        case "cinematic_photoreal":
        case "stylized_realism":
        default:
            return "strict";
    }
}

const stylePhysiqueFidelityDescriptions: Record<CharacterPitchSheetStylePhysiqueFidelity, string> = {
    strict: "Strict fidelity: style may change finish and mild shape appeal, not body mass or silhouette.",
    balanced: "Balanced fidelity: preserve the entered build while allowing modest pose appeal and shape clarity.",
    expressive: "Expressive fidelity: allow stronger style language while keeping the entered height, weight class, frame, and build category recognizable."
};

const stylePhysiqueCalibrationRules: Record<CharacterPitchSheetRenderStyle, string> = {
    biometric_realism: `
- Biometric realism: preserve the entered physique directly with minimal distortion.
`,
    cinematic_photoreal: `
- Cinematic photoreal: filmic polish is allowed, but body mass and proportions must remain consistent.
`,
    stylized_realism: `
- Stylized realism: stylize rendering treatment, edge quality, color, and subtle shape appeal only. Do not increase apparent body mass or costume bulk.
`,
    animated_feature: `
- Animated feature: preserve the entered underlying physique unless expressive exaggeration is explicitly requested.
`,
    editorial_illustration: `
- Editorial illustration: use illustration treatment for finish and value design without changing the build.
`,
    concept_art: `
- Concept art: use production painting and design clarity without changing the canonical physique.
`,
    graphic_novel: `
- Graphic novel: stylize linework and shadows while keeping the body block-in consistent.
`,
    anime_manga: `
- Anime/manga: translate the character while keeping the specified height class, body mass, frame, musculature, and build category recognizable.
`
};

export function buildStylePhysiqueGuard(style: CharacterPitchSheetRenderStyle, input: CharacterPitchSheetInput): string {
    const profile = buildPhysiqueProfile(input);
    const fidelity = input.stylePhysiqueFidelity || getDefaultStylePhysiqueFidelity(style);

    return `
STYLE BODY CONSISTENCY RULE:
- Style affects rendering language, material treatment, edge quality, lighting, and shape appeal only.
- Physique reference: ${profile.summary}. Fidelity: ${fidelity}. ${stylePhysiqueFidelityDescriptions[fidelity]}
- Keep full-body panels reasonably consistent with the entered build without flattening cinematic pose, costume, or character design.

STYLE-SPECIFIC BODY CALIBRATION:
${stylePhysiqueCalibrationRules[style].trim()}

COSTUME BULK CONTROL:
- Costume may drape and layer richly, but it should not inflate the character into a broader or heavier silhouette than the entered build.
`;
}

export function requiresAnchorFirstPitchSheetWorkflow(input: CharacterPitchSheetInput): boolean {
    const style = input.characterRenderStyle || defaultCharacterPitchSheetInput.characterRenderStyle;

    return style === "cinematic_photoreal" || style === "stylized_realism";
}

const buildSingleSubjectIdentityRules = (
    input: CharacterPitchSheetInput,
    hasReferenceDrivenIdentity: boolean,
    characterRenderStyle: CharacterPitchSheetRenderStyle
): string => {
    const anchorWorkflowLine = requiresAnchorFirstPitchSheetWorkflow(input)
        ? "- This render style is routed through an anchor-first workflow. Do not solve the final board directly from raw biometric/source images alone."
        : "- If canonical anchors are supplied, treat them as continuity anchors for the final board.";
    const photorealSafetyBlock = characterRenderStyle === "cinematic_photoreal"
        ? `
CINEMATIC PHOTOREAL IDENTITY SAFETY RULE:
- Cinematic photoreal boards are especially vulnerable to second-person drift. Treat this as a single actor continuity task, not a collage of plausible faces.
- Do not reinterpret face shape, skull silhouette, facial hair, hairline, eyes, nose, mouth, jaw, skin tone, age impression, body mass, or costume from panel to panel.
- Photoreal polish must not recast the subject, beautify the subject, or create a different actor for hero, head studies, or turnarounds.
- If multiple references conflict, resolve identity from the authority hierarchy below rather than blending into a new person.
`
        : "";

    return `
SINGLE-SUBJECT BOARD RULE:
- The entire board must depict one person only: the same actor identity, same character, same costume package, same physique, same grooming, and same age impression in every panel.
- Hero portrait, head studies, profile, turnaround, side view, back view, action pose, costume callouts, and material insets must all belong to the exact same subject.
- Do not create siblings, variants, stunt doubles, alternates, younger/older versions, or lookalike replacements anywhere on the board.

IDENTITY AUTHORITY HIERARCHY:
${hasReferenceDrivenIdentity ? "- Highest priority: supplied biometric scans, uploaded actor references, and portrait anchors define the exact facial identity." : "- Highest priority: the text brief and canonical anchors define the single character identity."}
- Next priority: canonical hero portrait anchor defines approved face, expression presence, grooming, lighting language, and character essence.
- Next priority: canonical front full-body anchor defines approved costume package, body proportions, posture baseline, and silhouette.
- Next priority: canonical head/profile anchor defines approved head structure across front, three-quarter, and profile studies.
- Text prompt, style, board layout, costume callouts, and inferred design details must obey those identity anchors.

CANONICAL CHARACTER ANCHOR RULE:
${anchorWorkflowLine}
- When canonical anchors are attached, use them as the approved character package. The final board must expand those anchors, not redesign or recast them.
- Canonical hero portrait controls face identity and emotional presence.
- Canonical front full-body controls physique, costume, footwear, prop placement, and silhouette.
- Canonical head/profile anchor controls head-study consistency.
- Do not average canonical anchors with raw source images into a new person.

SOURCE PANEL DISCIPLINE RULE:
- Raw biometric captures, upload snapshots, and source photos are identity authority inputs, not visible casual photo tiles unless raw-source mode is explicitly selected.
- Do not paste source photos into the final premium board by default.
- If source/photo panels are visible by user request, label them as source references and keep them separate from rendered character panels.
- Rendered head-study panels must be costume-matched character panels, not casual raw photo inserts.

PANEL CONSISTENCY RULE:
- Every panel must preserve the same face structure, facial hair, hairline, skin tone, age impression, skull silhouette, neck, shoulder width, body mass, costume, accessories, and material logic.
- Front, profile, three-quarter, back, action, head-study, and hero panels must read as different views of one continuous person photographed or rendered in one production session.
- The final board must not contain mixed identities, alternate faces, mismatched costume variants, or contradictory body builds.

NO MULTI-PERSON DRIFT RULE:
- Do not generate multiple different-looking people.
- Do not let the hero portrait become one person while the turnaround or head studies become another.
- Do not create separate model actors for costume breakdown, profile study, or body studies.
- Any panel that cannot preserve the exact subject should be simplified rather than replaced with a lookalike.
${photorealSafetyBlock}
`;
};

const buildAnchorPromptPreamble = (input: CharacterPitchSheetInput): {
    characterName: string;
    visualAge: string;
    wardrobe: string;
    worldEra: string;
    lightingMood: string;
    physiqueProfile: CharacterPitchSheetPhysiqueProfile;
    characterRenderStyle: CharacterPitchSheetRenderStyle;
    styleGuard: string;
} => {
    const characterRenderStyle: CharacterPitchSheetRenderStyle = input.characterRenderStyle || defaultCharacterPitchSheetInput.characterRenderStyle || "biometric_realism";
    const characterName = valueOr(input.characterName, input.aliasCodename, "Unnamed lead character");
    const visualAge = inferVisualAge(input);
    const wardrobe = inferWardrobe(input);
    const worldEra = valueOr(input.worldEra, "original cinematic world inferred from the brief");
    const lightingMood = valueOr(input.lightingMood, defaultCharacterPitchSheetInput.lightingMood);
    const physiqueProfile = buildPhysiqueProfile(input);
    const styleGuard = buildStylePhysiqueGuard(characterRenderStyle, input);

    return {
        characterName,
        visualAge,
        wardrobe,
        worldEra,
        lightingMood,
        physiqueProfile,
        characterRenderStyle,
        styleGuard
    };
};

export function buildCharacterPitchSheetAnchorPrompt(
    input: CharacterPitchSheetInput,
    anchorType: CharacterPitchSheetAnchorType
): string {
    const {
        characterName,
        visualAge,
        wardrobe,
        worldEra,
        lightingMood,
        physiqueProfile,
        characterRenderStyle,
        styleGuard
    } = buildAnchorPromptPreamble(input);
    const hasReferenceDrivenIdentity = Boolean(normalize(input.referenceImageUrl)) || isReferenceDrivenIdentitySource(input);
    const identityRules = buildSingleSubjectIdentityRules(input, hasReferenceDrivenIdentity, characterRenderStyle);
    const baseRules = `
ANCHOR-FIRST CHARACTER CONTINUITY PASS:
- Generate exactly one canonical anchor image for ${characterName}; this is not the final pitch sheet.
- Use supplied biometric/source images as hidden identity authority and preserve the same actor identity exactly.
- Do not show raw source/photo boxes, contact sheets, UI labels, comparison grids, watermarks, or multiple alternate actors.
- Keep the result clean, production-ready, and reusable as a continuity anchor for the final character board.
- Character render style: ${characterRenderStyle}
- Visual age: ${visualAge}
- World/era: ${worldEra}
- Wardrobe/costume package: ${wardrobe}
- Physique: ${physiqueProfile.summary}. ${physiqueProfile.visualDescription}
${identityRules}
${styleGuard}
`;

    if (anchorType === "hero_portrait") {
        return `${baseRules}
CANONICAL HERO PORTRAIT ANCHOR:
- Create one cinematic hero portrait of ${characterName}, waist-up or chest-up, with ${lightingMood}.
- Preserve exact actor face, skull shape, skin tone, facial hair, hairline, age impression, and emotional presence from the identity references.
- Show the approved costume context through neckline, collar, shoulder treatment, cloak/armor/jacket/tunic edge, jewelry, straps, or upper-costume framing where appropriate.
- Do not include full-body turnaround views, source panels, duplicate faces, or extra people.
- This image will become the face and presence anchor for the final board.`;
    }

    if (anchorType === "front_full_body") {
        return `${baseRules}
CANONICAL FRONT FULL-BODY ANCHOR:
- Create one clean front-facing full-body image of ${characterName}, head to toe, in the approved costume package.
- This is the canonical body and costume anchor: exact physique, height impression, shoulder width, torso width, waist, limb thickness, footwear, accessories, and prop placement.
- Use a neutral production stance with clear feet and visible footwear. No crop, no alternate body, no second pose, no extra person.
- Preserve the same face and grooming from the identity references and hero portrait anchor if supplied.
- This image will become the body, costume, footwear, and silhouette anchor for the final board.`;
    }

    return `${baseRules}
CANONICAL HEAD / PROFILE ANCHOR:
- Create a compact rendered head-study anchor for ${characterName}: front head, three-quarter head, and clean side profile of the same actor identity.
- These must be rendered character head studies, not raw source photo inserts.
- Preserve exact face, skull silhouette, facial hair, hairline, skin tone, age impression, and profile structure from the identity references.
- Show costume-matched neckline, collar, shoulder wrap, armor edge, jacket edge, tunic edge, or garment framing where visible.
- Do not include full-body turnarounds, multiple people, casual source clothing, or upload-photo backgrounds.
- This image will become the head-study/profile continuity anchor for the final board.`;
}

export function buildAnchorFirstCharacterPitchSheetPrompt(input: CharacterPitchSheetInput): string {
    const style: CharacterPitchSheetRenderStyle = input.characterRenderStyle || defaultCharacterPitchSheetInput.characterRenderStyle || "biometric_realism";
    const hasReferenceDrivenIdentity = Boolean(normalize(input.referenceImageUrl)) || isReferenceDrivenIdentitySource(input);
    const anchorRules = buildSingleSubjectIdentityRules(input, hasReferenceDrivenIdentity, style);
    const basePrompt = buildCharacterPitchSheetPrompt(input);

    return `${basePrompt}

ANCHOR-FIRST FINAL BOARD DIRECTIVE:
- This final board pass receives raw identity references plus canonical character anchors.
- Use images labeled "Canonical Hero Portrait Anchor", "Canonical Front Full-Body Anchor", and "Canonical Head/Profile Anchor" as the approved character continuity package.
- Do not generate this final board as a fresh direct interpretation from raw biometric/source images alone.
- Expand the canonical anchors into a premium character pitch sheet while preserving the exact same subject and costume.
${anchorRules}

FINAL BOARD FAILURE CONDITIONS:
- Failure: hero portrait and turnaround look like different people.
- Failure: source photos appear as casual pasted webcam panels when source panel mode is not raw_source.
- Failure: head studies use different faces, different facial hair, different skull profiles, or different age impressions.
- Failure: costume breakdown, full-body views, and action pose use different body mass, garment package, footwear, or accessories.
- Failure: any panel creates a second actor, lookalike, variant, or generic replacement.`;
}

export function buildCharacterPitchSheetPrompt(input: CharacterPitchSheetInput): string {
    const physiqueProfile = buildPhysiqueProfile(input);
    const characterName = valueOr(input.characterName, input.aliasCodename, "Unnamed lead character");
    const alias = valueOr(input.aliasCodename, "No public codename");
    const visualAge = inferVisualAge(input);
    const height = valueOr(input.height, physiqueProfile.heightLabel, "height inferred from role and proportions");
    const build = valueOr(input.build, physiqueProfile.summary, inferBuild(input));
    const designLanguage = valueOr(input.designLanguage, defaultCharacterPitchSheetInput.designLanguage);
    const worldEra = valueOr(input.worldEra, "original cinematic world inferred from the brief");
    const corePersonality = valueOr(input.corePersonality, "layered, specific, screen-readable personality");
    const internalConflict = valueOr(input.internalConflict, "private inner contradiction visible through posture and expression");
    const wardrobe = inferWardrobe(input);
    const props = inferProps(input);
    const environment = inferEnvironment(input);
    const lightingMood = valueOr(input.lightingMood, defaultCharacterPitchSheetInput.lightingMood);
    const sheetStyle = valueOr(input.sheetStyle, defaultCharacterPitchSheetInput.sheetStyle);
    const additionalNotes = valueOr(input.additionalNotes, "No extra notes supplied; infer tasteful cinematic details from the brief.");
    const faceDesign = inferFaceDesign(input);
    const performanceDirection = inferPerformance(input);
    const materialNotes = inferMaterialNotes(input);
    const productionNotes = inferProductionNotes(input);
    const hasReferenceImage = Boolean(normalize(input.referenceImageUrl));
    const hasBiometricIdentity = isBiometricIdentitySource(input);
    const hasReferenceDrivenIdentity = hasReferenceImage || isReferenceDrivenIdentitySource(input);
    const identityStrength = typeof input.identityStrength === "number" ? `${input.identityStrength}%` : "maximum available";
    const hasCharacterStyleReference = input.identitySource === "biometric_plus_character" && Boolean(normalize(input.characterStyleReferenceUrl));
    const sourcePanelMode = input.sourcePanelMode || defaultCharacterPitchSheetInput.sourcePanelMode || "costume_matched";
    const characterRenderStyle: CharacterPitchSheetRenderStyle = input.characterRenderStyle || defaultCharacterPitchSheetInput.characterRenderStyle || "biometric_realism";
    const boardPresentationStyle: CharacterPitchSheetBoardPresentationStyle = input.boardPresentationStyle || defaultCharacterPitchSheetInput.boardPresentationStyle || "premium_film_board";
    const renderStyleBlock = CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle];
    const boardPresentationBlock = BOARD_PRESENTATION_STYLE_BLOCKS[boardPresentationStyle];
    const stylePhysiqueGuardBlock = buildStylePhysiqueGuard(characterRenderStyle, input);
    const realismLockBlock = requiresRealismLock(characterRenderStyle)
        ? `
REALISM LOCK:
- The selected render style requires realistic human character rendering. Treat the result as a believable live-action person in a constructed costume, not an illustration unless the user explicitly changes style.
- Preserve natural skin texture, real facial planes, facial weight, asymmetry, hair density, grooming detail, and physically plausible eyes, teeth, lips, ears, hands, and proportions.
- Costume materials must look photographed or film-real: fabric weave, leather grain, metal reflectance, stitch thickness, seams, closures, footwear construction, dirt, patina, and contact shadows.
- Avoid mixed realism/illustration drift, painterly brushwork, anime eyes, comic outlines, doll skin, plastic smoothing, idealized casting replacement, and generic concept-art shortcuts.
`
        : "";
    const styleApplicationRule = `
STYLE APPLICATION RULE:
- Apply the selected character render style only to rendering treatment, finish, lighting interpretation, line/texture language, and presentation polish.
- Apply the selected board presentation style only to layout hierarchy, callout density, panel organization, and production-board tone.
- Style must not change actor identity, facial structure, age impression, body build, costume design, wardrobe continuity, props, world/era, or material fidelity.
- Use one coherent style treatment across the entire board. Do not blend photorealism, illustration, anime, and concept-art treatments unless the user explicitly asks for a hybrid.
`;
    const boardQualityBlock = `
DO NOT SACRIFICE BOARD QUALITY:
- Maintain a premium film-development pitch board with cinematic hero portrait, rich costume design, material callouts, production notes, asymmetrical layout, and high-end presentation.
- Identity, source discipline, turnaround consistency, and physique accuracy are guardrails that support the board; they must not make the result plain, generic, clinical, or simplified.
- Cinematic Photoreal must not become a raw photo collage. Costume Matched source panel mode must not show raw source photos.
`;
    const physiqueGuardrailBlock = `
PHYSIQUE GUARDRAIL:
- Respect entered height, weight, frame size, musculature, and build interpretation while preserving the premium cinematic character-board design.
- Physique accuracy guides body proportions only; it must not simplify costume, reduce cinematic styling, weaken character presence, or turn the sheet into a generic model chart.
- Interpreted physique: ${physiqueProfile.summary}. Full-body panels should stay reasonably consistent without flattening pose, costume volume, silhouette design, or cinematic presentation.
`;
    const identityVsPhysiqueBlock = hasReferenceDrivenIdentity
        ? `
IDENTITY VS PHYSIQUE RULE:
- Biometric references preserve facial identity only; body inputs guide body mass and physique when provided.
- Do not infer body weight from the face when explicit body specifications are present.
`
        : "";
    const referenceIdentityBlock = hasReferenceImage && !hasBiometricIdentity
        ? `
STRICT REFERENCE-IMAGE IDENTITY BLOCK:
- A supplied portrait image is attached as the primary identity anchor for ${characterName}.
- Use the supplied portrait as the authoritative source for face, hair, skin tone, facial proportions, age impression, emotional presence, and overall character essence.
- Expand that exact character into a full cinematic design sheet without replacing, averaging, beautifying, genericizing, or reinterpreting the identity.
- Turnaround views, head studies, cinematic portrait, wardrobe breakdown, material callouts, and action pose must all belong to the same character from the supplied portrait.
- Do not change hairstyle, facial structure, skin tone, age impression, identity, or emotional presence unless the text brief explicitly requests that change.
- If text fields are sparse, infer world, wardrobe, props, and production details around the supplied character identity instead of inventing a different person.
`
        : "";
    const multiViewIdentityBlock = hasBiometricIdentity
        ? `
MULTI-VIEW BIOMETRIC IDENTITY LOCK:
- Use the supplied angle references as the only identity authority. Identity strength target: ${identityStrength}.
- Center/front reference controls primary face, eye spacing, nose width, mouth shape, skin tone, and frontal proportions.
- Left profile controls left skull silhouette, nose bridge, lips, chin, and jaw projection.
- Right profile controls right skull silhouette, asymmetry, nose projection, and jawline.
- Upward angle controls chin, neck, lower-face structure, and underside planes.
- Downward angle controls brow, forehead, top-plane structure, and upper-face planes.
- Do not average these into a generic face.
- Do not beautify, recast, or idealize the subject.
- Do not replace the actor with a similar-looking person.
- Every turnaround, head study, cinematic portrait, expression panel, and production callout must preserve the same actor identity.
- Do not use a fast biometric board or premium forensic board as the primary identity source when raw angle captures are supplied.
`
        : "";
    const styleReferenceBlock = hasCharacterStyleReference
        ? `
STYLE / CHARACTER REFERENCE:
- Use the generated character image as the approved style, wardrobe, lighting, and character-design reference.
- Use the biometric angle images as the higher-priority identity authority.
- If the character image conflicts with the biometric scan, preserve the biometric identity and only borrow style/wardrobe from the character image.
- Do not let the style reference recast, beautify, age-shift, or replace the biometric actor.
`
        : "";
    const sourcePanelPresentationBlock = hasReferenceDrivenIdentity && sourcePanelMode === "costume_matched"
        ? `
SOURCE PANEL PRESENTATION RULE (CRITICAL):
- Uploaded source photos, biometric scans, or reference captures are identity authority only.
- Do not display them literally as raw casual photo boxes unless explicitly requested.
- The visible head-study panels in the final board must be fully integrated character renderings that match the same costume, world, style, and production finish as the rest of the board.
- If the character is wearing a defined costume, the visible head-study panels must also reflect that costume through neckline, collar, shoulder treatment, garment framing, or visible upper-costume context.
- Do not show mismatched source clothing such as polos, t-shirts, hoodies, webcam clothing, or casualwear unless raw-source mode is explicitly requested.
- Costume priority for visible head studies: approved wardrobe reference or asset first, then approved generated character portrait, then wardrobe notes from the pitch-sheet form, then inferred costume from world and era.
- Visible source/head panels must feel art-directed and cinematic, not pasted in from the upload source.
`
        : hasReferenceDrivenIdentity && sourcePanelMode === "raw_source"
            ? `
SOURCE PANEL PRESENTATION MODE: RAW SOURCE VISIBLE.
- The user explicitly requested raw-source display, so actual upload, scan, or reference captures may appear as clearly labeled source reference inserts.
- Keep raw source inserts subordinate to the premium character board and do not let source clothing override the character costume unless explicitly requested in the wardrobe notes.
- Turnaround, cinematic portrait, action pose, material callouts, and rendered head studies must still use the defined character costume, world, lighting, and style language.
`
            : hasReferenceDrivenIdentity && sourcePanelMode === "hidden"
                ? `
SOURCE PANEL PRESENTATION MODE: HIDDEN.
- Use uploaded source photos, biometric scans, or reference captures as hidden identity authority only.
- Do not show raw source panels, scan inserts, casual upload snapshots, or source-photo boxes on the final board.
- All visible head studies must be fully rendered character panels matching the same costume, world, style, lighting, and production finish as the rest of the board.
- If a head panel shows shoulders, collar, neckline, armor edge, garment wrap, or upper torso, it must use the character costume context, not source-photo clothing.
`
                : "";
    const identityRenderedPanelLock = hasReferenceDrivenIdentity
        ? `
IDENTITY PRESERVATION RULE:
- Even when head-study panels are costume-matched and fully rendered, preserve the exact identity of the source actor.
- Do not replace the actor with a generic or idealized face.
- Do not idealize, beautify, recast, age-shift, slim, broaden, or otherwise redesign the supplied person.
- Preserve facial structure, asymmetry, age impression, facial weight, brow shape, eye spacing, nose shape, jawline, lips, skin tone, hairline, grooming, and signature features.
- The rendered head studies, cinematic portrait, turnaround, and action pose must all feel like the same actor wearing the character costume.
`
        : "";

    return `Create a full cinematic production-grade CHARACTER PITCH SHEET for ${characterName}. The result must feel like a premium character design board for film development, not a generic model sheet.
${referenceIdentityBlock}
${multiViewIdentityBlock}
${styleReferenceBlock}
${sourcePanelPresentationBlock}
${identityRenderedPanelLock}
${renderStyleBlock}
${boardPresentationBlock}
${boardQualityBlock}
${realismLockBlock}
${styleApplicationRule}

CHARACTER IDENTITY BLOCK:
- Name: ${characterName}
- Alias or codename: ${alias}
- Visual age: ${visualAge}
- Height: ${height}
- Build: ${build}
- Design language: ${designLanguage}
- World or era: ${worldEra}
- Sheet style: ${sheetStyle}
- Character render style: ${characterRenderStyle}
- Board presentation style: ${boardPresentationStyle}

FACE DESIGN:
- ${faceDesign}
- The face must be specific enough to cast: unique skull shape, brow, eyes, nose, mouth, jaw, ears, hairline, skin texture, marks, and asymmetries.
- Preserve the same face across every view, head study, and cinematic portrait. No face drift, no age drift, no ethnicity drift, no beauty-pass redesign between angles.

PSYCHOLOGICAL PROFILE:
- Core personality: ${corePersonality}
- Internal conflict: ${internalConflict}
- Let the design communicate psychology through posture, gaze, wardrobe wear, gesture economy, grooming, and how the character occupies space.

PERFORMANCE DIRECTION:
- ${performanceDirection}
- Include subtle acting notes in the drawing: neutral turnaround posture for technical views, controlled expressive variation in the portrait and head studies, and consistent gaze logic.
- Include one compact action pose or gesture study that shows how the character moves while preserving the same face, build, hairstyle, costume, props, and emotional presence.

WARDROBE BREAKDOWN:
- Direction: ${wardrobe}
- Props and signature items: ${props}
- Show full outfit from head to toe. Footwear is mandatory in every full-body view unless a crop is unavoidable; if cropped, include a dedicated footwear inset.
- Define outer layer, inner layer, closures, belts, straps, jewelry, gloves, bags, armor, footwear, and any prop attachment points with continuity-ready clarity.

MATERIAL ACCURACY:
- ${materialNotes}
- Every material must have believable surface response: fabric weave, leather creasing, metal edge wear, rubber soles, translucent or reflective elements where appropriate, dirt, patina, stitching, and thickness.
- Do not flatten complex garments into vague shapes. Show how straps wrap, how necklaces sit on the neck and chest, how layers overlap, and how backs of garments physically connect.

STRICT TURNAROUND INSTRUCTIONS:
- Include full-body front view, three-quarter view, clean side/profile view, and back view of the same character.
- The turnaround must be anatomically and costume-consistent, but it must not become a generic evenly spaced model-sheet row.
- Each angle must preserve identical face structure, hairline, hairstyle, height, build, shoulder width, costume pieces, footwear, accessories, prop scale, and left-right placement.
- Back view must resolve rear closures, straps, necklace paths, layered hems, bags, scabbards, armor plates, and footwear backs instead of inventing a new costume.

HEAD STUDY INSTRUCTIONS:
- Include dedicated head studies: front head, three-quarter head, side profile head, and one expressive close-up.
- All head studies must share the same facial DNA: same eyes, nose, mouth, jaw, ears, scars, hairline, hairstyle, skin marks, and age.
- Expressions may change, but identity may not. Do not make the profile face a different person.

CINEMATIC PORTRAIT INSTRUCTIONS:
- Include one larger cinematic portrait anchor of ${characterName} with ${lightingMood}.
- The portrait should reveal personality and internal conflict without changing costume, face, hairstyle, props, or material design established in the turnaround.
- Environment cue: ${environment}

PRODUCTION NOTES:
- ${productionNotes}
- Additional notes: ${additionalNotes}
- The final image should be useful for casting, wardrobe, continuity, key art, and later identity reference generation.

PREMIUM ASYMMETRIC LAYOUT RULES:
- Use an editorial, high-end asymmetric layout: one dominant cinematic portrait, supporting full-body turnarounds, head studies, material detail callouts, and selected prop/footwear insets.
- Include the action pose as a designed supporting element, not a separate redesign.
- Avoid generic grid layouts, evenly spaced model-sheet rows, rigid contact-sheet spacing, and empty repeated boxes.
- Use tasteful negative space, layered scale hierarchy, subtle labels if needed, and composition that feels designed rather than templated.
- Keep all artwork visible and readable. Do not let labels, callouts, or decorative elements cover important character details.

${stylePhysiqueGuardBlock}
${physiqueGuardrailBlock}
${identityVsPhysiqueBlock}

STRICT CONSISTENCY RULES:
- No duplicated accessories unless the brief explicitly asks for multiples.
- No missing footwear. No vague feet. No cropped-away shoe design without a footwear inset.
- No costume drift between front, side, three-quarter, back, head studies, and portrait.
- No necklace, strap, belt, bag, armor, cape, scarf, sash, holster, sleeve, glove, or layering inconsistencies between front and back views.
- No face drift between turnaround views. Same person, same proportions, same marks, same age, same hairline, same expression range.
- No random extra props, no swapped left-right placements, no unexplained color changes, no simplified back view, no generic fashion redesign.
- Maintain a single coherent character package across the entire sheet.`;
}
