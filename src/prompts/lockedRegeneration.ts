export type CharacterGenerationMode = "CREATE_NEW_CHARACTER" | "REGENERATE_LOCKED_CHARACTER";

export type RegenerationTarget =
    | "quality_artifacts_only"
    | "body_focus"
    | "style_consistency"
    | "wardrobe_v2"
    | "wardrobe_consistency"
    | "pose_refinement"
    | "sheet_layout";

export type LockedRegenerationContractOptions = {
    characterId: string;
    approvedSourceImageId?: string | null;
    approvedSourceUsage?: string;
    biometricReferenceIds?: string[];
    regenerationTarget?: RegenerationTarget;
    identityLockPresent?: boolean;
    bodyLockSource: "user_selected" | "body_reference" | "approved_generated_source" | "neutral_default";
    bodyDescription?: string;
    faceOnlyBiometricReferences?: boolean;
    styleLockSource: "user_selected" | "approved_generated_source" | "auto_detected";
    styleDescription?: string;
    costumeLockSource: "approved_generated_source" | "user_selected" | "wardrobe_reference";
    costumeDescription?: string;
    allowCostumeChange?: boolean;
    allowStyleChange?: boolean;
    allowBodyFocusChange?: boolean;
};

export const LOCKED_REGENERATION_REQUIRED_PROMPT =
    "This is a locked regeneration pass for an existing character, not a new character creation. Preserve the exact same character identity, biometric facial structure, head shape, age impression, body build, wardrobe, and style from the locked sources. Correct only the requested issue. Do not reinterpret, redesign, recast, beautify, caricature, or replace the character.";

export const LOCKED_REGENERATION_NEGATIVE_PROMPT =
    "No new character. No recasting. No identity drift. No partial likeness only. No generic similar face. No stylized replacement face. No altered head shape. No changed facial proportions. No changed eyes, nose, mouth, cheeks, chin, jawline, ears, skin tone, age impression, facial hair, body type, costume, or style. No randomization. No prompt reinterpretation. No character redesign.";

const targetDescription: Record<RegenerationTarget, string> = {
    quality_artifacts_only: "Quality/artifact improvement only. Improve fidelity, cleanup, clarity, hands, edges, compression, and rendering artifacts without changing identity, body, wardrobe, style, age, or silhouette.",
    body_focus: "Body-focused correction only. Improve body proportions inside the existing body_lock while preserving identity, style, costume, age, head, and facial structure.",
    style_consistency: "Style consistency correction only. Reapply the locked style family without changing identity, body, wardrobe, age, or silhouette.",
    wardrobe_v2: "Wardrobe V2 correction only. Costume may update only where explicitly requested, while identity, head, body build, style family, and character silhouette remain locked.",
    wardrobe_consistency: "Wardrobe consistency correction only. Repair clothing continuity while preserving the same outfit design unless an explicit wardrobe replacement was requested.",
    pose_refinement: "Pose refinement only. Improve pose/grounding/anatomy while preserving identity, body type, style, wardrobe, age, and silhouette.",
    sheet_layout: "Sheet/layout correction only. Repair panel/layout presentation while preserving the same character, identity, body, style, and costume."
};

export const buildLockedRegenerationContract = ({
    characterId,
    approvedSourceImageId,
    approvedSourceUsage,
    biometricReferenceIds = [],
    regenerationTarget = "quality_artifacts_only",
    identityLockPresent = false,
    bodyLockSource,
    bodyDescription,
    faceOnlyBiometricReferences = true,
    styleLockSource,
    styleDescription,
    costumeLockSource,
    costumeDescription,
    allowCostumeChange = false,
    allowStyleChange = false,
    allowBodyFocusChange = false
}: LockedRegenerationContractOptions): string => {
    const lockModel = {
        generation_mode: "REGENERATE_LOCKED_CHARACTER",
        character_id: characterId,
        approved_source_image_id: approvedSourceImageId || null,
        approved_source_usage: approvedSourceUsage || "approved continuity reference only; never identity authority when biometric references are supplied",
        biometric_reference_ids: biometricReferenceIds,
        locks: {
            identity_lock: {
                enabled: identityLockPresent || biometricReferenceIds.length > 0 || Boolean(approvedSourceImageId),
                priority: "absolute",
                source: biometricReferenceIds.length > 0
                    ? "uploaded_biometric_reference_images"
                    : "approved_generated_source",
                strictness: "maximum",
                allow_identity_drift: false
            },
            body_lock: {
                enabled: true,
                source: bodyLockSource,
                description: bodyDescription || "existing approved character body build",
                strictness: "high",
                allow_body_type_drift: false
            },
            style_lock: {
                enabled: true,
                source: styleLockSource,
                description: styleDescription || "existing approved character render style",
                strictness: "high",
                allow_style_drift: false
            },
            costume_lock: {
                enabled: true,
                source: costumeLockSource,
                description: costumeDescription || "existing approved character costume",
                strictness: "high",
                allow_costume_drift: allowCostumeChange
            }
        },
        regeneration_target: regenerationTarget
    };

    return `LOCKED CHARACTER REGENERATION CONTRACT:
${JSON.stringify(lockModel, null, 2)}

REGENERATION MODE:
- generation_mode MUST remain REGENERATE_LOCKED_CHARACTER.
- This request must not be handled as CREATE_NEW_CHARACTER.
- ${LOCKED_REGENERATION_REQUIRED_PROMPT}
- Active regeneration target: ${regenerationTarget}. ${targetDescription[regenerationTarget]}
- Approved source image: ${approvedSourceImageId || "none supplied"}. ${approvedSourceImageId ? (approvedSourceUsage || "If supplied, use it as the current approved continuity reference, while biometric references remain identity authority.") : "No previous generated result is approved as source authority for this pass."}
- Biometric references: ${biometricReferenceIds.length ? biometricReferenceIds.join(", ") : "none supplied"}. If supplied, they remain the highest-priority identity authority.
- Identity lock always outranks approved source image, style, costume, body, prompt edits, and board presentation.
- Body lock source: ${bodyLockSource}${bodyDescription ? ` (${bodyDescription})` : ""}.
- Style lock source: ${styleLockSource}${styleDescription ? ` (${styleDescription})` : ""}.
- Costume lock source: ${costumeLockSource}${costumeDescription ? ` (${costumeDescription})` : ""}.
- ${faceOnlyBiometricReferences ? "Face-only biometric references are not body-mass evidence. Do not invent a heavier, slimmer, taller, younger, older, or differently proportioned body from face scans alone." : "Preserve body traits only where supported by visible body evidence or explicit body controls."}
- ${allowBodyFocusChange ? "Body Focus may adjust anatomy only within body_lock rules; it cannot replace the person, identity, face, age, costume, or style." : "Do not alter body type, body mass, body age, or silhouette except for artifact/anatomy cleanup inside the existing body_lock."}
- ${allowStyleChange ? "A style correction may change rendering treatment only; it cannot change identity, body, costume, age, or silhouette." : "Do not change the locked style family unless this request explicitly targets style consistency."}
- ${allowCostumeChange ? "Wardrobe V2 may update costume only as explicitly requested; identity, body build, age, head, and style remain locked." : "Do not change wardrobe, outfit silhouette, colors, footwear, accessories, or costume package unless explicit wardrobe regeneration was requested."}

LOCKED REGENERATION NEGATIVE PROMPT:
${LOCKED_REGENERATION_NEGATIVE_PROMPT}`;
};
