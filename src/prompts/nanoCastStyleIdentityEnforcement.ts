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

const NANO_CAST_STYLE_IDENTITY_CONFIGS: NanoCastStyleIdentityEnforcementConfig[] = [
    {
        ids: ["pixar", "family_3d", "animated_feature", "stylized_animated_3d"],
        label: "Family 3D Animation",
        identityStrength: "maximum",
        bodyFidelityStrength: "source_locked",
        facialLandmarkStrictness: "strict",
        allowableStylizationRange: "stylize shaders, surface softness, eye readability, and appealing 3D form language only; keep identity geometry close to source",
        positiveRules: [
            "Preserve the source head shape as closely as possible while translating it into premium stylized 3D.",
            "Preserve brow shape, brow placement, eye spacing, eye shape, nose width, nose length, nose profile, mouth shape, smile structure, jawline, chin, ears, hairline, and facial-hair placement.",
            "Keep the jaw/chin/goatee relationship recognizable; facial hair must remain the same pattern, density, length impression, color distribution, and placement.",
            "Use animation-film materials and softened planes around the actual source likeness, not around a default cute face template.",
            "Preserve body build, shoulder/waist relationship, torso length, limb thickness, and stance from the generated character source or explicit body guidance."
        ],
        negativeRules: [
            "do not make a generic animated bald man",
            "do not round out or simplify the face into a different person",
            "do not enlarge eyes into a different eye-spacing pattern",
            "do not shrink or average the nose",
            "do not soften the jaw/chin/goatee into a generic cartoon muzzle",
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
            "Replicate the source facial geometry as a strict digital-double likeness.",
            "Preserve skin tone, facial marks, grooming, hair state, and facial hair without idealization.",
            "Preserve body and outfit from the generated character source or explicit body guidance."
        ],
        negativeRules: [
            "no beautified actor replacement",
            "no face averaging",
            "no stylized geometry changes",
            "no altered facial hair",
            "no changed hairline"
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
            "Translate the same person into anime/cel rendering while preserving head silhouette, brow/eye spacing, nose profile, mouth width, jaw/chin, ears, hairline, and facial hair.",
            "Let eye design become anime-readable without changing the real eye spacing or brow relationship.",
            "Preserve generated-source body, wardrobe, and proportions when provided."
        ],
        negativeRules: [
            "no generic anime face",
            "no new ethnicity cues",
            "no teenage/youthful replacement",
            "no tiny nose archetype replacing the source nose",
            "no erased beard or changed facial hair silhouette"
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
            "Preserve nose silhouette, brow mass, eye spacing, jaw/chin, ears, facial hair edges, and body/costume proportions.",
            "Keep generated-source outfit and silhouette as the visual authority when provided."
        ],
        negativeRules: [
            "no generic comic hero",
            "no square-jaw substitution",
            "no exaggerated musculature unless requested",
            "no changed beard outline",
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
            "Preserve face, head shape, brow, eye spacing, nose, mouth, jaw/chin, ears, hairline, facial hair, and body proportions.",
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

    return `- Generated character source: [IMAGE ${sourceIndex}] is the primary visual/design source for body, outfit, silhouette, style translation, proportions, grooming read, and overall character design. It is not optional inspiration.`;
};

export const buildNanoCastStyleIdentityEnforcementContract = (
    styleId: string | null | undefined,
    options: NanoCastStyleIdentityEnforcementOptions = {}
): string => {
    const config = resolveNanoCastStyleIdentityEnforcementConfig(styleId);
    const styleLabel = options.selectedStyleLabel || config.label;
    const identityRange = options.identityRangeText || "the supplied identity reference images";
    const requestedIdentityStrength = typeof options.requestedIdentityStrength === "number"
        ? Math.max(0, Math.min(100, Math.round(options.requestedIdentityStrength)))
        : undefined;
    const biometricRule = options.usesBiometricIdentity
        ? `- Biometric source: ${identityRange} are the identity authority for face, skull/head shape, skin tone, age impression, hair state, hairline, facial hair, visible marks, and facial proportions.`
        : `- Identity source: ${identityRange} remains the identity authority.`;
    const bodyGuidance = options.bodyGuidance
        ? `- Body fidelity source: ${options.bodyGuidance}.`
        : "- Body fidelity source: generated character source first, then explicit body controls, then conservative neutral body inference.";
    const appliesTo = options.appliesTo || "NanoCast character render and any generated reference or pitch-sheet handoff";

    return `NANOCAST STYLE-SPECIFIC IDENTITY ENFORCEMENT:
- selectedStyle: ${styleLabel}
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

STYLE-SPECIFIC POSITIVE IDENTITY RULES:
${config.positiveRules.map(rule => `- ${rule}`).join("\n")}

STYLE-SPECIFIC DRIFT BLOCKERS:
${config.negativeRules.map(rule => `- ${rule}.`).join("\n")}

STYLE IDENTITY SELF-CHECK:
- Before finalizing, verify that the head shape, brow, eye spacing, nose, mouth, jaw/chin, ears, hairline, facial hair, body proportions, and costume silhouette still read as the same source character in ${styleLabel}.
- If the style treatment created a different person, reduce style deformation and restore source likeness.`;
};

export const buildNanoCastStyleIdentityNegativePrompt = (styleId?: string | null): string => {
    const config = resolveNanoCastStyleIdentityEnforcementConfig(styleId);
    return config.negativeRules.join(", ");
};

export const getNanoCastStyleIdentityCustomBlockLabels = (): string[] =>
    NANO_CAST_STYLE_IDENTITY_CONFIGS.map(config => config.label);
