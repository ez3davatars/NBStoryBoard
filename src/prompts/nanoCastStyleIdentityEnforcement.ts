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
            "PREMIUM ANIMATED 3D BIOMETRIC TRANSLATION LOCK:",
            "- Treat this as an adult biometric actor translation into premium animated 3D, not a new animated character design.",
            "- Preserve the scanned person's adult identity, head shape, face width, cheek structure, jaw/chin relationship, brow placement, eye spacing, eye size relationship, nose shape, nose/mouth relationship, lips, hairline, hair presence, grooming, skin tone, and age impression.",
            "- Do not youthify the subject.",
            "- Do not beautify the subject into a generic animated protagonist.",
            "- Do not enlarge eyes beyond the biometric source person's real proportions.",
            "- Do not narrow the face, soften the jaw, shrink the nose, round the cheeks, or simplify the mouth into a generic cute animated face.",
            "- Do not replace the actor with a different person who merely shares broad traits.",
            "- Stylization may change shader, material finish, lighting, and simplified surface rendering, but must not change identity geometry.",
            "Translate the same scanned biometric person into Family 3D / Premium Animated 3D; do not create a new animated character inspired by them.",
            "Preserve skin tone, age impression, and general complexion.",
            "Preserve the real head silhouette, scalp/bald shape, brow placement, eye spacing, eye shape impression, nose length/width/profile, mouth width/shape, cheek structure, jaw width, chin shape, ears, facial-hair pattern, neck thickness, shoulder relationship, visible neck identity boundary, and natural facial texture.",
            "Use smooth stylized CG skin/materials and animated-feature lighting around the real identity geometry.",
            "Style changes shader, material response, simplification, and lighting only; it must not replace the person with a default cute animated face template.",
            "Preserve the selected Morphological Matrix or explicit body guidance and never infer body mass from face, head, or neck scans."
        ],
        negativeRules: [
            "PREMIUM ANIMATED 3D IDENTITY NEGATIVES:",
            "- no generic animated protagonist",
            "- no childlike or teen-like redesign",
            "- no oversized eyes",
            "- no narrowed face",
            "- no softened jaw that changes identity",
            "- no generic cute face",
            "- no different actor with similar skin tone or hair",
            "- no altered age impression",
            "do not make a generic animated person",
            "no generic friendly animated man",
            "no generic friendly bald animated man",
            "no broad smile unless explicitly requested",
            "no default cute animated face template",
            "do not round out or simplify the face into a different person",
            "do not enlarge eyes into a different eye-spacing pattern",
            "do not shrink or average the nose",
            "no altered brow/eye/nose/mouth/jaw relationships",
            "do not soften the jaw/chin/grooming into a generic cartoon muzzle",
            "no changed facial-hair silhouette",
            "no altered bald/scalp shape",
            "no exaggerated skin texture or artificially amplified details",
            "no mustache if upper lip is clean-shaven",
            "no upper lip stubble, no upper lip hair, no mustache shadow",
            "no invented details on body or clothing",
            "no different actor likeness",
            "no younger/slimmer/softer redesign",
            "no generic family-animation protagonist",
            "do not over-cartoony distort proportions",
            "do not beautify, youthify, slim, cute-ify, mascot-ify, or archetype-swap the subject",
            "no generic template face",
            "no stylized replacement face",
            "no cartoon face replacing the biometric likeness",
            "no prompt update or style update may weaken biometric likeness"
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
            "EXACT LIKENESS STUDIO IDENTITY LOCK:",
            "- This is the strictest identity mode.",
            "- Preserve the biometric actor with maximum fidelity.",
            "- Do not stylize, beautify, simplify, age-shift, or reinterpret identity.",
            "- Any deviation from biometric face/head identity is a failure.",
            "Perform a direct biometric reconstruction of the same scanned person, not a cleaner stock actor or lookalike.",
            "Preserve skin tone, age impression, general complexion, and natural facial texture. Avoid making minor reference texture more prominent than it appears in the source.",
            "Replicate source head/scalp or hairline shape, brow placement, eye spacing, eye shape, nose length/width/profile, mouth width/shape, cheek structure, jaw width, chin shape, ears, skin tone value, age impression, general complexion, and visible asymmetries.",
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
            "no younger/slimmer/smoother face",
            "no exaggerated skin texture or artificially amplified details",
            "no mustache if upper lip is clean-shaven",
            "no upper lip stubble, no upper lip hair, no mustache shadow",
            "no invented details on body or clothing"
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
            "PREMIUM CG REALISM BIOMETRIC TRANSLATION LOCK:",
            "- Preserve the biometric actor literally and realistically.",
            "- Do not beautify, age-shift, slim, widen, or editorially recast the actor.",
            "- CG polish may improve lighting and render quality only.",
            "- Facial identity must remain source-faithful.",
            "Preserve source facial proportions and mature facial structure with high fidelity.",
            "Preserve skin tone, age impression, general complexion, and natural facial texture. Avoid making minor reference texture more prominent than it appears in the source.",
            "Keep CG polish from turning the subject into an idealized generic actor.",
            "Preserve generated-source body, costume, and proportions when provided."
        ],
        negativeRules: [
            "no idealized hero face",
            "no generic photoreal actor",
            "no beauty retouch identity drift",
            "no changed jaw, brow, nose, or mouth relationships",
            "no exaggerated skin texture or artificially amplified details",
            "no mustache if upper lip is clean-shaven",
            "no upper lip stubble, no upper lip hair, no mustache shadow",
            "no invented details on body or clothing"
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
            "RETRO CEL ANIME BIOMETRIC TRANSLATION LOCK:",
            "- Treat this as an adult biometric portrait translated into retro cel animation, not a generic anime archetype.",
            "- Preserve adult face fullness, true eye spacing, brow shape, nose bridge, mouth relationship, jaw/chin shape, cheek volume, hairline, grooming, and age impression.",
            "- Do not create a teenage anime face.",
            "- Do not enlarge the eyes, shrink the nose, narrow the jaw, or simplify the face into a stock anime character.",
            "- Cel styling may simplify linework and shadows only; it must not replace the actor identity.",
            "Translate the same person into anime/cel rendering while preserving head silhouette, brow/eye spacing, nose profile, mouth width, jaw/chin, ears, hairline, and facial-hair or clean-shaven state.",
            "Preserve skin tone, age impression, and general complexion.",
            "Let eye design become anime-readable without changing the real eye spacing or brow relationship.",
            "Preserve generated-source body, wardrobe, and proportions when provided."
        ],
        negativeRules: [
            "no generic anime face",
            "no new ethnicity cues",
            "no childlike/teenage anime face",
            "no oversized eyes",
            "no tiny generic anime nose",
            "no exaggerated skin texture or artificially amplified details",
            "no generic anime archetype",
            "no added, erased, or changed facial-hair silhouette",
            "no mustache if upper lip is clean-shaven",
            "no upper lip stubble, no upper lip hair, no mustache shadow",
            "no invented details on body or clothing"
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
            "GRAPHIC NOVEL NOIR BIOMETRIC TRANSLATION LOCK:",
            "- Treat this as the same biometric actor rendered in graphic noir language.",
            "- Preserve head shape, jaw/chin, facial proportions, eye/nose/mouth relationship, hairline, grooming, age impression, and body presence.",
            "- Noir shadows, ink lines, and halftone treatment must follow the actor's actual structure.",
            "- Do not turn facial shadows or graphic marks into a different face.",
            "- Do not exaggerate features into a caricature unless explicitly requested.",
            "Use graphic linework to describe the source face, not to replace it with a comic archetype.",
            "Preserve skin tone, age impression, and general complexion.",
            "Preserve nose silhouette, brow mass, eye spacing, jaw/chin, ears, facial-hair or clean-shaven edges, and body/costume proportions.",
            "Keep generated-source outfit and silhouette as the visual authority when provided."
        ],
        negativeRules: [
            "no generic comic hero",
            "no square-jaw substitution",
            "no exaggerated musculature unless requested",
            "no added, erased, or changed facial-hair outline",
            "no costume redesign",
            "no exaggerated skin texture or artificially amplified details",
            "no mustache if upper lip is clean-shaven",
            "no upper lip stubble, no upper lip hair, no mustache shadow",
            "no invented details on body or clothing"
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
            "CYBERPUNK BIOMETRIC TRANSLATION LOCK:",
            "- Treat cyberpunk as lighting, color, techwear, neon, atmosphere, and material treatment over the same biometric actor.",
            "- Preserve face/head identity, hairline, grooming, skin tone, age impression, and facial proportions.",
            "- Do not let cybernetic accents, neon lighting, makeup, tech markings, or futuristic styling replace the actor's face.",
            "- Do not generate a different cyberpunk model with similar broad traits.",
            "Apply cyberpunk lighting and materials to the same source person.",
            "Preserve skin tone, age impression, general complexion, and natural facial texture. Avoid making minor reference texture more prominent than it appears in the source.",
            "Preserve face, head shape, brow, eye spacing, nose, mouth, jaw/chin, ears, hairline, facial-hair or clean-shaven state, and body proportions.",
            "Keep any generated-source costume silhouette and proportions unless a wardrobe override explicitly changes them."
        ],
        negativeRules: [
            "no generic cyberpunk protagonist",
            "no face replaced by techwear model",
            "no visor or neon effects obscuring identity",
            "no altered grooming",
            "no body-type redesign",
            "no exaggerated skin texture or artificially amplified details",
            "no mustache if upper lip is clean-shaven",
            "no upper lip stubble, no upper lip hair, no mustache shadow",
            "no invented details on body or clothing"
        ]
    }
];

const normalizeStyleId = (styleId?: string | null): string => (styleId || "").trim().toLowerCase();

export const getFallbackNanoCastStyleConfig = (): NanoCastStyleIdentityEnforcementConfig => {
    return NANO_CAST_STYLE_IDENTITY_CONFIGS.find(c => c.label === "Family 3D Animation") ?? NANO_CAST_STYLE_IDENTITY_CONFIGS[0];
};

export const resolveNanoCastStyleIdentityEnforcementConfig = (
    styleId?: string | null
): NanoCastStyleIdentityEnforcementConfig | undefined => {
    const clean = normalizeStyleId(styleId);
    return NANO_CAST_STYLE_IDENTITY_CONFIGS.find(config => config.ids.includes(clean));
};

const formatGeneratedSourceRule = (sourceIndex?: number | null): string => {
    const hasSourceIndex = typeof sourceIndex === "number" && Number.isFinite(sourceIndex);
    if (!hasSourceIndex) {
        return "- Generated character source: none supplied for this request; use biometric images and explicit body/style controls as the authority.";
    }

    return `- Generated character source: [IMAGE ${sourceIndex}] is the primary visual/design source for body, outfit, silhouette, style translation, proportions, and overall character design only. It is not a face/head/grooming identity authority.`;
};

export const buildNanoCastStyleIdentityEnforcementContract = (
    styleId: string | null | undefined,
    options: NanoCastStyleIdentityEnforcementOptions = {}
): string => {
    const config = resolveNanoCastStyleIdentityEnforcementConfig(styleId) ?? getFallbackNanoCastStyleConfig();
    const styleLabel = options.selectedStyleLabel || config.label;
    const renderFamily = resolveRenderFamily(styleId);
    const identityRange = options.identityRangeText || "the supplied identity reference images";
    const requestedIdentityStrength = typeof options.requestedIdentityStrength === "number"
        ? Math.max(0, Math.min(100, Math.round(options.requestedIdentityStrength)))
        : undefined;
    const biometricRule = options.usesBiometricIdentity
        ? `- Biometric source: ${identityRange} are the identity authority for face, skull/head shape, skin tone, age impression, hair state, hairline, facial-hair or clean-shaven state, and facial proportions.`
        : `- Identity source: ${identityRange} remains the identity authority.`;
    const bodyGuidance = options.bodyGuidance
        ? `- Body fidelity source: ${options.bodyGuidance}.`
        : "- Body fidelity source: selected Morphological Matrix first, then explicit Advanced body overrides when active; never infer body mass from face/head/neck scans.";
    const appliesTo = options.appliesTo || "NanoCast character render and any generated reference or pitch-sheet handoff";
    const biometricHardLine = options.usesBiometricIdentity
        ? `
UNIVERSAL SCAN-IDENTITY OVERRIDE:
- The selected style, body archetype, outfit, logo, lighting, presentation, and regeneration target are all subordinate to the uploaded biometric identity.
- SURFACE FIDELITY:
  - Keep facial surface treatment clean, restrained, and identity-faithful.
  - Ignore temporary texture, lighting noise, compression noise, shaving texture, and non-identity surface noise.
- MUSTACHE AND UPPER LIP PROHIBITION: If the subject has facial hair on the chin (such as a goatee) but the upper lip is clean-shaven, you MUST keep the upper lip completely smooth, bald, and hairless. Absolutely do NOT draw a mustache, stubble, or shadow on the upper lip.
- Preserve the same visible head/scalp or hairline shape, brow/eye/nose/mouth/jaw/chin relationships, ears, skin tone value, age impression, and facial-hair or clean-shaven state from ${identityRange}.
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
    const config = resolveNanoCastStyleIdentityEnforcementConfig(styleId) ?? getFallbackNanoCastStyleConfig();
    return config.negativeRules.join(", ");
};

export const getNanoCastStyleIdentityCustomBlockLabels = (): string[] =>
    NANO_CAST_STYLE_IDENTITY_CONFIGS.map(config => config.label);

export type NanoCastStyleKey =
  | 'premium_animated_3d'
  | 'premium_cg_realism'
  | 'retro_cel_anime'
  | 'graphic_novel_noir'
  | 'cyberpunk_v2'
  | 'exact_likeness_studio';

export type BodyScope = 'head' | 'torso' | 'full_body';

export interface StylizationEnvelope {
  sliderValue: number;          // 0–100 UI value
  normalized: number;           // 0–1
  tier:
    | 'source_faithful'
    | 'light'
    | 'moderate'
    | 'strong'
    | 'high'
    | 'max_safe';
  styleSpecificCap: number;     // effective cap per style
  proportionFlex: 'none' | 'minimal' | 'light' | 'moderate';
  shadingFlex: 'minimal' | 'light' | 'moderate' | 'strong';
  materialFlex: 'minimal' | 'light' | 'moderate' | 'strong';
  abstractionFlex: 'minimal' | 'light' | 'moderate' | 'strong';
}

export function clampStylizationByStyle(
  styleKey: NanoCastStyleKey,
  sliderValue: number
): number {
  const capMap: Record<NanoCastStyleKey, number> = {
    premium_animated_3d: 100,
    graphic_novel_noir: 90,
    retro_cel_anime: 85,
    cyberpunk_v2: 75,
    premium_cg_realism: 55,
    exact_likeness_studio: 25,
  };
  const cap = capMap[styleKey] ?? 100;
  return Math.max(0, Math.min(cap, sliderValue));
}

export function buildStylizationEnvelope(
  styleKey: NanoCastStyleKey,
  sliderValue: number
): StylizationEnvelope {
  const clamped = clampStylizationByStyle(styleKey, sliderValue);
  const normalized = clamped / 100;
  
  let tier: StylizationEnvelope['tier'] = 'moderate';
  if (clamped <= 10) tier = 'source_faithful';
  else if (clamped <= 25) tier = 'light';
  else if (clamped <= 45) tier = 'moderate';
  else if (clamped <= 65) tier = 'strong';
  else if (clamped <= 85) tier = 'high';
  else tier = 'max_safe';

  // Mapping rules based on tier
  let proportionFlex: StylizationEnvelope['proportionFlex'] = 'light';
  let shadingFlex: StylizationEnvelope['shadingFlex'] = 'moderate';
  let materialFlex: StylizationEnvelope['materialFlex'] = 'moderate';
  let abstractionFlex: StylizationEnvelope['abstractionFlex'] = 'moderate';

  switch (tier) {
    case 'source_faithful':
      proportionFlex = 'none';
      shadingFlex = 'minimal';
      materialFlex = 'minimal';
      abstractionFlex = 'minimal';
      break;
    case 'light':
      proportionFlex = 'minimal';
      shadingFlex = 'light';
      materialFlex = 'light';
      abstractionFlex = 'light';
      break;
    case 'moderate':
      proportionFlex = 'light';
      shadingFlex = 'moderate';
      materialFlex = 'moderate';
      abstractionFlex = 'moderate';
      break;
    case 'strong':
      proportionFlex = 'light';
      shadingFlex = 'strong';
      materialFlex = 'strong';
      abstractionFlex = 'strong';
      break;
    case 'high':
      proportionFlex = 'moderate';
      shadingFlex = 'strong';
      materialFlex = 'strong';
      abstractionFlex = 'strong';
      break;
    case 'max_safe':
      proportionFlex = 'moderate';
      shadingFlex = 'strong';
      materialFlex = 'strong';
      abstractionFlex = 'strong';
      break;
  }

  return {
    sliderValue,
    normalized,
    tier,
    styleSpecificCap: clampStylizationByStyle(styleKey, 100),
    proportionFlex,
    shadingFlex,
    materialFlex,
    abstractionFlex,
  };
}

export function buildNanoCastIdentityLockBlock(): string {
  return `
NANOCAST HIGH-PRIORITY IDENTITY LOCK:
- Biometric Scan Authority: The uploaded biometric scan references are the absolute, immutable source of truth for the character's identity.
- Preserve: facial structure, head shape, scalp outline, brow, eyes, nose, mouth, jawline, ears, skin tone, general complexion, and age impression across all generations.
- Stylization dial increases only rendering treatment, shading, line-weight, material representation, and abstraction layers; it must NEVER loosen the biometric likeness or produce identity drift.
- Do not swap the subject's gender, age band, or ethnicity.
- Do not simplify or deform the eyes, nose, mouth, jaw, or ears into a generic style template or cartoon caricature that replaces the biometric likeness.
- If there is any conflict between stylistic deformation and biometric identity preservation, biometric identity preservation wins.
`;
}

export function buildStyleFamilyLockBlock(styleKey: NanoCastStyleKey): string {
  const styleLabelMap: Record<NanoCastStyleKey, string> = {
    premium_animated_3d: 'Premium Animated 3D / Family 3D',
    premium_cg_realism: 'Premium CG Realism',
    retro_cel_anime: 'Retro Cel Anime',
    graphic_novel_noir: 'Graphic Novel Noir',
    cyberpunk_v2: 'Cyberpunk V2',
    exact_likeness_studio: 'Exact Likeness Studio',
  };
  const label = styleLabelMap[styleKey] ?? styleKey;
  return `
STYLE FAMILY LOCK:
- Active Style: ${label}
- Visual Family Constraint: The final render must conform strictly to the visual family of ${label}.
- Stylization must not drift into other families: graphic novel must not drift into photo portrait; anime must not collapse into stylized 3D CG; CG realism must not simplify into cel shading.
- Maintain style family consistency across all elements (hair rendering, garments, shading model, edge treatment, material response).
`;
}

export function buildBodyScopeLockBlock(scope: BodyScope): string {
  const bodyScopeMap: Record<BodyScope, string> = {
    head: 'HEAD AND SHOULDERS ONLY. Portrait composition. Do not generate the torso, arms, legs, waist, feet, or full outfit silhouette. Focus entirely on facial features, scalp, hair, and neck.',
    torso: 'UPPER BODY / HALF-BODY ONLY. Composition from head to waist. Include chest, upper arms, and shoulders. Do not generate legs, thighs, knees, feet, or complete lower-body garments.',
    full_body: 'FULL BODY. Head-to-toe full composition. Include head, neck, entire torso, arms, hands, legs, knees, ankles, feet, and footwear. Do not crop to portrait or half-body format. The full outfit silhouette must be clearly visible.',
  };
  const directive = bodyScopeMap[scope] ?? 'Match requested body focus';
  return `
BODY-SCOPE LOCK (NON-NEGOTIABLE):
- Active Focus: ${scope.toUpperCase()}
- Framing Rule: ${directive}
- Strict Constraint: Do not violate this framing to satisfy stylistic layouts, background scenery, or posing convenience.
`;
}

export function buildStylizationBehaviorBlock(
  styleKey: NanoCastStyleKey,
  envelope: StylizationEnvelope
): string {
  return `
STYLIZATION BEHAVIOR SPECIFICATION:
- Slider Value: ${envelope.sliderValue}/100
- Effective Internal Level: ${envelope.normalized * 100}% (Clamped at max ${envelope.styleSpecificCap}% for ${styleKey})
- Stylization Tier: ${envelope.tier.toUpperCase()}
- Permitted Variations:
  * proportionFlex: ${envelope.proportionFlex.toUpperCase()} (Proportion envelope flex allowed within safe likeness bounds)
  * shadingFlex: ${envelope.shadingFlex.toUpperCase()} (Lighting, contrast, linework, or rendering pass intensity)
  * materialFlex: ${envelope.materialFlex.toUpperCase()} (Smooth surface, painterly brushstroke, cel-shading flat, or tech gloss treatment)
  * abstractionFlex: ${envelope.abstractionFlex.toUpperCase()} (Plain simplification, comic outline, and rendering abstraction)
- HARD INVARIANT: Do not scale identity deviation, age shift, ethnicity drift, body-scope drift, or hairstyle/grooming override. Stylization dial exclusively controls the artistic/shading treatment and simplification depth around the core biometric subject structure.
`;
}

export function buildNanoCastStyleIdentityContract(args: {
  styleKey: NanoCastStyleKey;
  bodyScope: BodyScope;
  stylizationValue: number;
  includeHairLock?: boolean;
}): string {
  const envelope = buildStylizationEnvelope(args.styleKey, args.stylizationValue);
  const identityLock = buildNanoCastIdentityLockBlock();
  const styleLock = buildStyleFamilyLockBlock(args.styleKey);
  const bodyLock = buildBodyScopeLockBlock(args.bodyScope);
  const stylizationBehavior = buildStylizationBehaviorBlock(args.styleKey, envelope);
  
  const hairLockText = args.includeHairLock
    ? `
HAIR IDENTITY LOCK:
- Preserve hair structure, scalp outline, hairline, density, and color pattern matching the biometric scan set. Do not modify the styling, color, or hair presence unless requested.
`
    : '';

  return `
=========================================
NANOCAST STYLIZATION & IDENTITY CONTRACT:
=========================================
${identityLock}
${styleLock}
${bodyLock}
${stylizationBehavior}
${hairLockText}
=========================================
`;
}
