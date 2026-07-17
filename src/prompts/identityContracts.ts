import type { ProductionActorProfile } from "../renderer/types/ProductionActorProfile";

export const PROMPT_PRIORITY_ORDER_LABEL = "biometric identity > style lock > premium board quality > costume/world > views > callouts > metadata/body";

export const PROMPT_PRIORITY_ORDER_BLOCK = `PROMPT PRIORITY ORDER:
1. Biometric / actor identity.
2. Style lock.
3. Premium cinematic board quality and presentation polish.
4. Costume / world presentation.
5. Turnaround and head-study consistency.
6. Accurate restrained callouts.
7. Metadata / body consistency.

Preserve the same actor identity first. Style, costume, body metadata, board layout, labels, and presentation polish must adapt around that identity; they must never recast, redesign, beautify, age-shift, or genericize the subject.`;

type IdentityContractOptions = {
    sourceDescription: string;
    identityRangeText?: string;
    generatedLayoutReferenceText?: string;
};

type BiometricIdentityContractOptions = {
    identityRangeText: string;
    identityStrength: number;
    selectedStyleLabel?: string;
    mode?: "hybrid" | "biometric";
    faceDominant?: boolean;
};

export type BiometricIdentityLock = {
    enabled?: boolean;
    scope?: "character";
    priority?: "absolute";
    source?: "uploaded_biometric_reference_images";
    characterId: string;
    referenceViews?: string[];
    identityRangeText?: string;
    identityStrength?: number;
    strictness?: "high" | "maximum";
    selectedStyleLabel?: string;
    appliesTo?: string;
    generatedSourceImageIndex?: number | null;
    generatedSourceRole?: string;
    faceDominant?: boolean;
    productionProfile?: ProductionActorProfile;
};

export type BiometricIdentityLockOptions = Omit<
    BiometricIdentityLock,
    "enabled" | "scope" | "priority" | "source" | "strictness"
> & {
    enabled?: boolean;
    strictness?: "high" | "maximum";
    productionProfile?: ProductionActorProfile;
};

export type CharacterInvariantContext = {
    hasBiometricIdentity?: boolean;
    hasGeneratedCharacterSource?: boolean;
    selectedStyleId?: string;
    selectedStyleFamily?: string;
    hasExplicitBodyOverride?: boolean;
    hasExplicitProps?: boolean;
};

export function buildGlobalCharacterInvariantContract(ctx: CharacterInvariantContext = {}): string {
    const biometricLine = ctx.hasBiometricIdentity
        ? "Biometric identity remains the source of truth for face/head identity when supplied."
        : "If biometric identity is supplied, it becomes the source of truth for face/head identity.";
    const generatedSourceLine = ctx.hasGeneratedCharacterSource
        ? "Generated character source remains the approved visual/body/costume source when supplied."
        : "If a generated character source is supplied, it remains the approved visual/body/costume source.";
    const bodyOverrideLine = ctx.hasExplicitBodyOverride
        ? "Explicit body override is active: apply it only to body silhouette/proportion and never to facial identity."
        : "No explicit body override is active: do not let default numeric body metadata change the generated body.";
    const styleLine = ctx.selectedStyleFamily ? `Selected render family: ${ctx.selectedStyleFamily}.` : "";
    const propLine = ctx.hasExplicitProps
        ? "Explicit props may appear, but they must not alter identity, body, style family, or costume locks."
        : "No explicit props are required; do not invent props that change the character package.";

    return `GLOBAL CHARACTER INVARIANT CONTRACT:
- ${styleLine || "Selected style controls rendering/material language only."}
- The selected style changes rendering/material language only; it must not recast the person.
- ${biometricLine}
- ${generatedSourceLine}
- Do not change skull/head shape, scalp/bald shape, hairline, brow placement, eye spacing, eye shape impression, nose shape/projection, mouth width/shape, jaw/chin structure, ears, facial hair pattern, skin tone value, visible marks, age impression, or identity markers.
- Do not create a new person inspired by the references.
- Do not beautify, youthify, age up, slim, bulk, feminize, masculinize, cute-ify, or genericize the subject unless explicitly requested.
- Do not infer body mass from face/head/neck scans.
- Large neck, full cheeks, broad jaw, rounded chin, mature face weight, facial hair, and close crop are identity features only, not body-mass evidence.
- Body changes require either selected Morphological Matrix archetype or explicit Advanced/Pitch Sheet Brief body instructions.
- Numeric body metadata is not permission to recast identity.
- ${bodyOverrideLine}
- Pitch Sheet Brief build/weight fields are board/body metadata for pitch-sheet workflow only; they must not override the base Nano Cast actor unless explicitly passed.
- ${propLine}
- All panels must show one coherent character package.`;
}

export const BIOMETRIC_IDENTITY_LOCK_REQUIRED_PROMPT =
    "Use the uploaded biometric reference images as the absolute source of truth for this character's identity. Preserve the same visible facial structure, skull/head/scalp shape, hairline or baldness pattern, brow shape and placement, eye shape and spacing, nose shape and projection, mouth shape and width, jawline, cheeks, chin, ears, skin tone, age impression, general complexion, and natural facial texture. Avoid making minor reference texture more prominent than it appears in the source. Replicate facial hair shape/length/density/color pattern if present (if the subject has a goatee but the upper lip is clean-shaven, you MUST keep the upper lip completely smooth, bald, and hairless, with absolutely no mustache or stubble), body build if visible, and distinctive identity traits across every panel. The render style may change only the artistic treatment, not the identity.";

export const BIOMETRIC_IDENTITY_LOCK_NEGATIVE_TEXT =
    "No identity drift. No face redesign. No altered head, scalp, or baldness shape. No changed hairline, baldness pattern, hairstyle, brow, eyes, nose, mouth, jawline, cheeks, chin, ears, skin tone, age impression, ethnicity, facial hair shape, facial hair length, facial hair density, facial hair color pattern, body build, or distinctive identity traits. No beautification. No cleanup into a smoother stock actor. No generic face. No stylized replacement face. No cartoon face replacing the biometric likeness. No younger version. No older version. No slimmer face. No wider face. No upper lip stubble. No prompt update, style update, costume update, layout update, or regeneration pass may weaken biometric likeness.";

export const createBiometricIdentityLock = ({
    enabled = true,
    characterId,
    referenceViews = [],
    identityRangeText,
    identityStrength = 100,
    strictness = "maximum",
    selectedStyleLabel,
    appliesTo,
    generatedSourceImageIndex = null,
    generatedSourceRole,
    faceDominant = true,
    productionProfile
}: BiometricIdentityLockOptions): BiometricIdentityLock => ({
    enabled,
    scope: "character",
    priority: "absolute",
    source: "uploaded_biometric_reference_images",
    characterId,
    referenceViews,
    identityRangeText,
    identityStrength: Math.max(0, Math.min(100, Math.round(identityStrength))),
    strictness,
    selectedStyleLabel,
    appliesTo,
    generatedSourceImageIndex,
    generatedSourceRole,
    faceDominant,
    productionProfile
});

export const shouldApplyBiometricIdentityLock = (
    lock?: BiometricIdentityLock | BiometricIdentityLock[] | null
): boolean => {
    if (!lock) return false;
    const locks = Array.isArray(lock) ? lock : [lock];
    return locks.some(item => item?.enabled !== false && Boolean(item.characterId));
};

const formatReferenceViews = (views?: string[]): string =>
    views && views.length ? views.join(", ") : "uploaded biometric reference views";

const formatIdentityLockJson = (lock: BiometricIdentityLock): string => {
    const referenceViews = lock.referenceViews || [];
    return JSON.stringify({
        identity_lock: {
            enabled: true,
            scope: "character",
            priority: "absolute",
            source: "uploaded_biometric_reference_images",
            character_id: lock.characterId,
            reference_views: referenceViews,
            preserve_visible_traits: true,
            strictness: lock.strictness || "maximum",
            allow_identity_drift: false,
            allow_beautification: false,
            allow_face_redesign: false,
            allow_age_change: false,
            allow_ethnicity_change: false,
            allow_genericization: false
        }
    }, null, 2);
};

export const buildBiometricIdentityLockContract = (
    lock: BiometricIdentityLock
): string => {
    if (lock.enabled === false || !lock.characterId) return "";

    const lockStrength = Math.max(0, Math.min(100, Math.round(lock.identityStrength ?? 100)));
    const identityRangeText = lock.identityRangeText || "the uploaded biometric reference images";
    const styleLine = lock.selectedStyleLabel
        ? `Selected style "${lock.selectedStyleLabel}" changes rendering treatment only; it must not replace this character's biometric likeness.`
        : "Selected or detected render style changes artistic treatment only; it must not replace this character's biometric likeness.";
    const hasGeneratedSourceImageIndex = typeof lock.generatedSourceImageIndex === "number" && Number.isFinite(lock.generatedSourceImageIndex);
    const generatedSourceLine = hasGeneratedSourceImageIndex
        ? `Generated source image [IMAGE ${lock.generatedSourceImageIndex}] is secondary to identity_lock: use it for wardrobe, design, body presentation, pose language, and visual styling only. If it conflicts with uploaded biometric references, preserve biometric identity.`
        : "Generated source character images, previews, recent generations, or prior outputs are secondary to identity_lock and must never replace uploaded biometric identity.";
    const appliesToLine = lock.appliesTo
        ? `This identity_lock applies to: ${lock.appliesTo}.`
        : "This identity_lock applies to generation, regeneration, refinement, preview, validation, panel repair, export, and board presentation requests for this character.";
    const scanScopeLine = lock.faceDominant === false
        ? "Preserve body build and proportions only when they are visibly supported by uploaded biometric/full-body references."
        : "Face/head-dominant biometric references preserve identity only; do not infer or change body mass aggressively from face scans alone.";

    const productionContract = lock.productionProfile
        ? `\n\n${buildProductionActorPromptContract(lock.productionProfile)}`
        : "";

    return `UNIVERSAL BIOMETRIC IDENTITY LOCK:
${formatIdentityLockJson(lock)}

IDENTITY LOCK CONTRACT:
- character_id: ${lock.characterId}.
- Reference views bound to this character: ${formatReferenceViews(lock.referenceViews)}.
- Reference image range: ${identityRangeText}.
- Lock strength: ${lockStrength}%. Strictness: ${lock.strictness || "maximum"}.
- ${BIOMETRIC_IDENTITY_LOCK_REQUIRED_PROMPT}
- Preserve only traits visible or inferable from the provided references; do not invent identity traits.
- Identity priority order: identity_lock > style_lock > costume_lock > pose/expression/action > board layout > labels/annotations > presentation polish.
- Uploaded biometric reference images override generated source character images, style presets, costume presets, board presentation styles, prompt refactors, regeneration passes, layout changes, pose changes, annotation changes, and export polish.
- ${generatedSourceLine}
- ${styleLine}
- ${scanScopeLine}
- ${appliesToLine}

IDENTITY LOCK NEGATIVE PROMPT:
${BIOMETRIC_IDENTITY_LOCK_NEGATIVE_TEXT}${productionContract}`;
};

export const withBiometricIdentityLockContract = (
    prompt: string,
    lock?: BiometricIdentityLock | BiometricIdentityLock[] | null
): string => {
    if (!shouldApplyBiometricIdentityLock(lock)) return prompt;

    const inputLocks = Array.isArray(lock) ? lock : lock ? [lock] : [];
    const locks = inputLocks
        .filter((item): item is BiometricIdentityLock => Boolean(item?.characterId) && item?.enabled !== false)
        .map(item => buildBiometricIdentityLockContract(item))
        .filter(Boolean);

    if (locks.length === 0) return prompt;
    if (prompt.includes("UNIVERSAL BIOMETRIC IDENTITY LOCK")) return prompt;

    return `${locks.join("\n\n")}\n\n${prompt}`;
};

export const buildAuthoritativeIdentityContract = ({
    sourceDescription,
    identityRangeText,
    generatedLayoutReferenceText
}: IdentityContractOptions): string => {
    const sourceLine = identityRangeText
        ? `Use ${identityRangeText} from ${sourceDescription} as the authoritative identity reference.`
        : `Use ${sourceDescription} as the authoritative identity reference.`;
    const generatedReferenceLine = generatedLayoutReferenceText
        ? `Generated sheets, styled portraits, previews, recent generations, or prior outputs may be used only as optional presentation/layout guidance: ${generatedLayoutReferenceText}. They must never replace the original identity anchors.`
        : "Generated sheets, styled portraits, previews, recent generations, or prior outputs must not replace the original identity anchors.";

    return `AUTHORITATIVE IDENTITY CONTRACT:
- ${sourceLine}
- Preserve the same real person across every panel and every angle.
- Do not substitute a similar-looking person.
- Do not beautify, average, age-shift, ethnicity-shift, skin-tone-shift, or redesign the face.
- Preserve facial proportions, brow shape, eye spacing, nose bridge and tip shape, mouth shape, jaw proportions, hairline, forehead, ear shape, skin tone family, and age impression.
- Render style may change the presentation only, not the identity.
- ${generatedReferenceLine}`;
};

export const buildStrictBiometricIdentityContract = ({
    identityRangeText,
    identityStrength,
    selectedStyleLabel,
    mode = "hybrid",
    faceDominant = true
}: BiometricIdentityContractOptions): string => {
    const lockStrength = Math.max(0, Math.min(100, Math.round(identityStrength)));
    const highLock = lockStrength >= 85;
    const styleLine = selectedStyleLabel
        ? `The selected style "${selectedStyleLabel}" must be applied to the scanned person; it must not replace the person with a generic style archetype.`
        : "The selected style must be applied to the scanned person; it must not replace the person with a generic style archetype.";

    return `STRICT BIOMETRIC IDENTITY RULES:
- The biometric scan images ${identityRangeText} are the authoritative identity source.
- Identity source mode: ${mode}. Identity lock: ${lockStrength}%${highLock ? " (strong biometric lock)" : ""}.
- Scan coverage: ${faceDominant ? "face/head dominant. Treat body mass as underdetermined unless a full-body source or explicit body directive exists." : "body evidence available. Preserve only body traits that are visibly supported."}
- Generate the same person shown in the scan, translated into the selected style.
- Do not invent a new face, mascot, actor, lookalike, cleaner stock performer, or generic character.
- Preserve the subject's recognizable facial structure, skull shape, head/scalp shape, brow structure, eye spacing, eye angle, nose bridge/tip/projection, cheek volume, mouth width and shape, jaw/chin structure, ears, skin tone, age impression, general complexion, and natural facial texture.
- Preserve the real head silhouette, scalp/bald shape, brow placement, eye spacing, skin tone, age impression, neck relationship, shoulder relationship, and natural facial texture.
- Preserve facial topology: the source person's brow-to-eye relationship, eye spacing, nose projection, cheek volume, mouth width, jaw mass, chin shape, and facial asymmetries must survive stylization.
- Preserve the bald head or hair state shown in the biometric scan.
- Preserve the visible facial-hair state exactly: if facial hair is present, keep its shape, outline, density, length impression, color distribution, and placement; do not trim, shorten, reshape, recolor, or simplify it.
- MUSTACHE AND UPPER LIP PROHIBITION: If the subject has facial hair on the chin (such as a goatee) but the upper lip is clean-shaven, you MUST keep the upper lip completely smooth, bald, and hairless. Absolutely do NOT draw a mustache, stubble, or shadow on the upper lip.
- If the subject is clean-shaven, do not add stubble, mustache, beard, or goatee.
- Preserve mature facial features and fuller/broader face structure when shown by the scan, but do not translate facial fullness into overweight body mass.
- Stylization may simplify texture/rendering, but it must not erase recognizable identity, shrink the broad mature face, soften the jaw/chin into a generic cartoon face, or average the nose/eyes/brow into a style template.
- Do not make the subject younger, slimmer, smoother, more symmetrical, or more conventionally attractive unless explicitly requested.
- ${styleLine}
- The final result must be immediately recognizable as the scanned subject in the selected style.
${highLock ? "- HIGH LOCK ENFORCEMENT: facial geometry and distinctive identity traits outrank style preset proportions, body archetype defaults, outfit prompts, hair prompts, and branding assets." : "- Identity likeness outranks style preset proportions, outfit prompts, hair prompts, and branding assets."}
- When style defaults conflict with biometric facial topology, preserve biometric topology and express style through materials, shader, lighting, proportions around the existing likeness, and non-photoreal surface treatment.
- Treat scan clothing and background as non-authoritative; use face-dominant scans only for identity, head, face, visible neck, skin, hair state, facial-hair or clean-shaven state, age impression, and general complexion.`;
};

export function buildSurfaceMarkFidelityContract(): string {
    return `SURFACE MARK FIDELITY CONTRACT:
- Preserve skin tone, age impression, general complexion, and natural facial texture. Avoid making minor reference texture more prominent than it appears in the source.
- Keep facial surface treatment clean, restrained, and identity-faithful.
- Ignore temporary texture, lighting noise, compression noise, shaving texture, and non-identity surface noise.`;
}

export function buildFinalIdentityAuthorityReassertion(
    lock?: BiometricIdentityLock | BiometricIdentityLock[] | null
): string {
    if (!lock) return "";
    const locks = Array.isArray(lock) ? lock : [lock];
    const activeLocks = locks.filter(l => l?.enabled !== false && l?.characterId);
    if (activeLocks.length === 0) return "";

    return `FINAL IDENTITY AUTHORITY:
- Biometric identity remains the highest-priority instruction after all style, pose, morphology, wardrobe, sheet, layout, and quality contracts.
- Do not replace the person with a generic style-template face.
- Preserve skin tone, age impression, and general complexion.`;
}

export function buildProductionActorPromptContract(profile?: ProductionActorProfile): string {
    if (!profile) return "";

    const preserveRulesText = (profile.preserveRules || []).map(r => `- ${r}`).join("\n");
    const avoidRulesText = (profile.avoidRules || []).map(r => `- ${r}`).join("\n");

    return `--- ACTOR PASSPORT / IDENTITY CONTRACT ---
Actor Name: ${profile.name}
IDENTITY: ${profile.identitySummary || "N/A"}
STYLE FAMILY: ${profile.styleSummary || "N/A"}
WARDROBE PROFILE: ${profile.wardrobeSummary || "N/A"}

PRESERVATION RULES:
${preserveRulesText || "- None specified."}

AVOIDANCE RULES:
${avoidRulesText || "- None specified."}
------------------------------------------

PRODUCTION ACTOR LOCK:
Actor Name: ${profile.name}
Identity Summary: ${profile.identitySummary || "N/A"}
Style Summary: ${profile.styleSummary || "N/A"}
Wardrobe Summary: ${profile.wardrobeSummary || "N/A"}
Preserve: ${(profile.preserveRules || []).join(", ") || "N/A"}
Avoid: ${(profile.avoidRules || []).join(", ") || "N/A"}
Rules:
This Production Actor metadata is authoritative for identity continuity. Reference images provide visual support, but do not replace the locked actor profile. Do not change the actor’s face, body identity, wardrobe identity, or core style unless the user explicitly requests an edit.`;
}

