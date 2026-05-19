import { resolveRenderFamily } from "./styleContracts";

export type NanoCastStyleIdentityStrength = "maximum" | "very_high" | "high";
export type NanoCastFacialLandmarkStrictness = "exact" | "strict" | "style_translated";
export type NanoCastBodyFidelityStrength = "source_locked" | "strict" | "conservative";

export type NanoCastStyleIdentityEnforcementConfig = {
    ids: string[];
    label: string;
    identityStrength: NanoCastStyleIdentityStrength;
    bodyFidelityStrength: NanoCastBodyFidelityStrength;
    facialLandmarkStrictness: NanoCastFacialLandmarkStrictness;
    allowableStylizationRange: string;
    positiveRules: string[];
    negativeRules: string[];
};

export type NanoCastStyleIdentityEnforcementOptions = {
    selectedStyleLabel?: string;
    identityRangeText?: string;
    requestedIdentityStrength?: number;
    usesBiometricIdentity?: boolean;
    generatedCharacterSourceIndex?: number | null;
    bodyGuidance?: string;
    appliesTo?: string;
};

const LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID = ["p", "i", "x", "a", "r"].join("");

const NANO_CAST_STYLE_IDENTITY_CONFIGS: NanoCastStyleIdentityEnforcementConfig[] = [
    {
        ids: [LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID, "premium_animated_3d", "family_3d", "animated_feature", "stylized_animated_3d"],
        label: "Family 3D Animation",
        identityStrength: "maximum",
        bodyFidelityStrength: "source_locked",
        facialLandmarkStrictness: "strict",
        allowableStylizationRange: "stylize shaders, material finish, smooth CG surface response, and animation-film lighting only; preserve biometric identity geometry",
        positiveRules: [
            "Translate the same scanned person into premium animated 3D; do not create a new animated character inspired by them.",
            "Preserve head silhouette, scalp/bald shape, brow placement, eye spacing, eye shape impression, nose length/width/profile, mouth width/shape, cheek structure, jaw width, chin shape, ears, facial-hair pattern, skin tone value, age impression, neck thickness, shoulder relationship, visible neck identity boundary, and distinctive marks.",
            "Use animation-film materials, smooth stylized skin shading, and softened planes around the actual source likeness, not around a default cute face template.",
            "Preserve the selected Morphological Matrix or explicit body guidance and never infer body mass from face, head, or neck scans."
        ],
        negativeRules: [
            "do not make a generic animated person",
            "no generic friendly animated man",
            "no broad smile unless explicitly requested",
            "no default cute animated face template",
            "do not round out or simplify the face into a different person",
            "do not enlarge eyes into a different eye-spacing pattern",
            "do not shrink or average the nose",
            "do not soften the jaw/chin/grooming into a generic cartoon muzzle",
            "no changed facial-hair silhouette",
            "no altered bald/scalp shape",
            "no younger/slimmer/softer redesign",
            "no generic family-animation protagonist",
            "do not over-cartoony distort proportions",
            "do not beautify, youthify, slim, cute-ify, mascot-ify, or archetype-swap the subject"
        ]
    },
    {
        ids: ["exact_studio"],
        label: "Exact Likeness Studio",
        identityStrength: "maximum",
        bodyFidelityStrength: "source_locked",
        facialLandmarkStrictness: "exact",
        allowableStylizationRange: "lighting, lens, and studio finish only; zero identity geometry deviation",
        positiveRules: [
            "Perform a direct biometric reconstruction of the same scanned person, not a cleaner stock actor or lookalike.",
            "Replicate source head/scalp or hairline shape, brow placement, eye spacing, eye shape, nose length/width/profile, mouth width/shape, cheek structure, jaw width, chin shape, ears, skin tone value, age impression, facial marks, and visible asymmetries.",
            "Preserve grooming and facial-hair or clean-shaven state without idealization; keep facial-hair outline, length impression, density, placement, and dark/gray/color distribution exactly when visible.",
            "Preserve body and outfit from the generated character source or explicit body guidance without changing facial identity."
        ],
        negativeRules: [
            "no beautified actor replacement",
            "no cleaner stock actor",
            "no generic bald man",
            "no face averaging",
            "no stylized geometry changes",
            "no altered facial-hair or clean-shaven state",
            "no shortened or reshaped facial hair",
            "no changed scalp, baldness, or hairline shape",
            "no younger/slimmer/smoother face"
        ]
    },
    {
        ids: ["hyper_real", "premium_cg", "cinematic_realism", "realism"],
        label: "Premium CG Realism",
        identityStrength: "very_high",
        bodyFidelityStrength: "strict",
        facialLandmarkStrictness: "exact",
        allowableStylizationRange: "material fidelity, lighting, and render polish only; facial geometry remains source-locked",
        positiveRules: [
            "Preserve source facial proportions and mature facial structure with high fidelity.",
            "Keep CG polish from turning the subject into an idealized generic actor.",
            "Preserve generated-source body, costume, and proportions when provided."
        ],
        negativeRules: [
            "no idealized hero face",
            "no generic photoreal actor",
            "no beauty retouch identity drift",
            "no changed jaw, brow, nose, or mouth relationships"
        ]
    },
    {
        ids: ["retro_anime", "retro_cel", "anime_manga"],
        label: "Retro Cel Anime",
        identityStrength: "very_high",
        bodyFidelityStrength: "strict",
        facialLandmarkStrictness: "style_translated",
        allowableStylizationRange: "linework, cel shading, eye rendering language, and simplified planes only; identity landmarks remain mapped to source",
        positiveRules: [
            "Translate the same person into anime/cel rendering while preserving head silhouette, brow/eye spacing, nose profile, mouth width, jaw/chin, ears, hairline, and facial-hair or clean-shaven state.",
            "Let eye design become anime-readable without changing the real eye spacing or brow relationship.",
            "Preserve generated-source body, wardrobe, and proportions when provided."
        ],
        negativeRules: [
            "no generic anime face",
            "no new ethnicity cues",
            "no teenage/youthful replacement",
            "no tiny nose archetype replacing the source nose",
            "no added, erased, or changed facial-hair silhouette"
        ]
    },
    {
        ids: ["comic_book", "graphic_noir", "graphic_novel"],
        label: "Graphic Novel Noir",
        identityStrength: "high",
        bodyFidelityStrength: "strict",
        facialLandmarkStrictness: "style_translated",
        allowableStylizationRange: "ink, line weight, halftone, and shadow design only; identity landmarks stay source-mapped",
        positiveRules: [
            "Use graphic linework to describe the source face, not to replace it with a comic archetype.",
            "Preserve nose silhouette, brow mass, eye spacing, jaw/chin, ears, facial-hair or clean-shaven edges, and body/costume proportions.",
            "Keep generated-source outfit and silhouette as the visual authority when provided."
        ],
        negativeRules: [
            "no generic comic hero",
            "no square-jaw substitution",
            "no exaggerated musculature unless requested",
            "no added, erased, or changed facial-hair outline",
            "no costume redesign"
        ]
    },
    {
        ids: ["cyberpunk", "cyberpunk_neon", "sci_fi_stylized"],
        label: "Cyberpunk Neon",
        identityStrength: "high",
        bodyFidelityStrength: "strict",
        facialLandmarkStrictness: "style_translated",
        allowableStylizationRange: "lighting, techwear mood, material finish, and neon color response only; identity and body are not redesigned",
        positiveRules: [
            "Apply cyberpunk lighting and materials to the same source person.",
            "Preserve face, head shape, brow, eye spacing, nose, mouth, jaw/chin, ears, hairline, facial-hair or clean-shaven state, and body proportions.",
            "Keep any generated-source costume silhouette and proportions unless a wardrobe override explicitly changes them."
        ],
        negativeRules: [
            "no generic cyberpunk protagonist",
            "no face replaced by techwear model",
            "no visor or neon effects obscuring identity",
            "no altered grooming",
            "no body-type redesign"
        ]
    }
];

const normalizeStyleId = (styleId?: string | null): string => (styleId || "").trim().toLowerCase();

export const resolveNanoCastStyleIdentityEnforcementConfig = (
    styleId?: string | null
): NanoCastStyleIdentityEnforcementConfig => {
    const clean = normalizeStyleId(styleId);
    return NANO_CAST_STYLE_IDENTITY_CONFIGS.find(config => config.ids.includes(clean)) ?? NANO_CAST_STYLE_IDENTITY_CONFIGS[0];
};

const formatGeneratedSourceRule = (sourceIndex?: number | null): string => {
    if (!sourceIndex) {
        return "- Generated character source: none supplied for this request; use biometric images and explicit body/style controls as the authority.";
    }

    return `- Generated character source: [IMAGE ${sourceIndex}] is the primary visual/design source for body, outfit, silhouette, style translation, proportions, and overall character design only. It is not a face/head/grooming identity authority.`;
};

export const buildNanoCastStyleIdentityEnforcementContract = (
    styleId: string | null | undefined,
    options: NanoCastStyleIdentityEnforcementOptions = {}
): string => {
    const config = resolveNanoCastStyleIdentityEnforcementConfig(styleId);
    const styleLabel = options.selectedStyleLabel || config.label;
    const renderFamily = resolveRenderFamily(styleId);
    const identityRange = options.identityRangeText || "the supplied identity reference images";
    const requestedIdentityStrength = typeof options.requestedIdentityStrength === "number"
        ? Math.max(0, Math.min(100, Math.round(options.requestedIdentityStrength)))
        : undefined;
    const biometricRule = options.usesBiometricIdentity
        ? `- Biometric source: ${identityRange} are the identity authority for face, skull/head shape, skin tone, age impression, hair state, hairline, facial-hair or clean-shaven state, visible marks, and facial proportions.`
        : `- Identity source: ${identityRange} remains the identity authority.`;
    const bodyGuidance = options.bodyGuidance
        ? `- Body fidelity source: ${options.bodyGuidance}.`
        : "- Body fidelity source: selected Morphological Matrix first, then explicit Advanced body overrides when active; never infer body mass from face/head/neck scans.";
    const appliesTo = options.appliesTo || "NanoCast character render and any generated reference or pitch-sheet handoff";
    const biometricHardLine = options.usesBiometricIdentity
        ? `
UNIVERSAL SCAN-IDENTITY OVERRIDE:
- The selected style, body archetype, outfit, logo, lighting, presentation, and regeneration target are all subordinate to the uploaded biometric identity.
- Preserve the same visible head/scalp or hairline shape, brow/eye/nose/mouth/jaw/chin relationships, ears, skin tone value, visible marks, age impression, and facial-hair or clean-shaven state from ${identityRange}.
- Do not clean up, slim, smooth, beautify, youthify, average, or replace the scan with a generic style-template face.
- If style language conflicts with biometric geometry, reduce style deformation and preserve the scanned person's identity geometry.`
        : "";

    return `NANOCAST STYLE-SPECIFIC IDENTITY ENFORCEMENT:
- selectedStyle: ${styleLabel}
- selectedRenderFamily: ${renderFamily}
- identityStrengthTier: ${config.identityStrength}${requestedIdentityStrength !== undefined ? `; userIdentityLock: ${requestedIdentityStrength}%` : ""}
- bodyFidelityTier: ${config.bodyFidelityStrength}
- facialLandmarkStrictness: ${config.facialLandmarkStrictness}
- allowableStylizationRange: ${config.allowableStylizationRange}
- appliesTo: ${appliesTo}

SOURCE HIERARCHY:
${formatGeneratedSourceRule(options.generatedCharacterSourceIndex)}
${biometricRule}
- Style preset: rendering treatment only. Style must adapt to the same person; the person must not adapt into a generic style template.
${bodyGuidance}
${biometricHardLine}

STYLE-SPECIFIC POSITIVE IDENTITY RULES:
${config.positiveRules.map(rule => `- ${rule}`).join("\n")}

STYLE-SPECIFIC DRIFT BLOCKERS:
${config.negativeRules.map(rule => `- ${rule}.`).join("\n")}

STYLE IDENTITY SELF-CHECK:
- Before finalizing, verify that the head shape, brow, eye spacing, nose, mouth, jaw/chin, ears, hairline, facial-hair or clean-shaven state, body proportions, and costume silhouette still read as the same source character in ${styleLabel}.
- If the style treatment created a different person, reduce style deformation and restore source likeness.`;
};

export const buildNanoCastStyleIdentityNegativePrompt = (styleId?: string | null): string => {
    const config = resolveNanoCastStyleIdentityEnforcementConfig(styleId);
    return config.negativeRules.join(", ");
};

export const getNanoCastStyleIdentityCustomBlockLabels = (): string[] =>
    NANO_CAST_STYLE_IDENTITY_CONFIGS.map(config => config.label);
