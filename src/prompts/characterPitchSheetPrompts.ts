import {
    PROMPT_PRIORITY_ORDER_BLOCK,
    buildAuthoritativeIdentityContract,
    buildBiometricIdentityLockContract,
    buildGlobalCharacterInvariantContract,
    buildStrictBiometricIdentityContract,
    buildFinalIdentityAuthorityReassertion,
    buildSurfaceMarkFidelityContract,
    type BiometricIdentityLock,
    buildProductionActorPromptContract
} from "./identityContracts";
import type { ProductionActorProfile } from "../renderer/types/ProductionActorProfile";

import { buildHeadshotWardrobeContinuityContract, buildHeadshotWardrobeNegativeTokens } from "./headshotWardrobeContinuity";
import { buildPoseCoherenceNegativeTokens, buildTurnaroundPoseCoherenceContract, buildWholeBodyAxisLockContract } from "./poseCoherence";
import { SHEET_STYLE_LOCK_NEGATIVE_TEXT, buildSheetStyleLockContract } from "./sheetStyleLock";
import { buildStyleCategoryContract, buildStyleNegativePrompt, resolveRenderFamily } from "./styleContracts";
import { CHARACTER_ANATOMY_INTEGRITY_CONTRACT, CHARACTER_ANATOMY_NEGATIVE_TEXT } from "./characterAnatomyIntegrity";
import { buildNanoCastStyleIdentityEnforcementContract } from "./nanoCastStyleIdentityEnforcement";

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
    | "exact_studio"
    | "photorealism"
    | "dslr_capture"
    | "stylized_realism"
    | "animated_feature"
    | "family_3d"
    | "premium_animated_3d"
    | "claymation"
    | "editorial_illustration"
    | "concept_art"
    | "retro_cel"
    | "retro_anime"
    | "comic_book"
    | "graphic_novel"
    | "graphic_noir"
    | "anime_manga"
    | "cyberpunk_neon"
    | "cyberpunk"
    | "no_specific_style";

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

export type PitchSheetCallout = {
    label: string;
    category:
        | "garment"
        | "material"
        | "footwear"
        | "accessory"
        | "prop"
        | "performance"
        | "construction";
    target: string;
    material?: string;
    placementHint?: string;
    visibleOnlyIf?: string;
};

export type CharacterPitchSheetInput = {
    referenceImageUrl?: string;
    referenceImages?: Array<{
        angle?: string;
        imageUrl: string;
        label?: string;
    }>;
    identityLock?: BiometricIdentityLock;
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
    debugVisibleLabels?: boolean;
    productionProfile?: ProductionActorProfile;
};

export const defaultCharacterPitchSheetInput: CharacterPitchSheetInput = {
    referenceImageUrl: undefined,
    referenceImages: undefined,
    identitySource: "text_only",
    identityStrength: undefined,
    characterStyleReferenceUrl: undefined,
    sourcePanelMode: "costume_matched",
    productionProfile: undefined,
    characterRenderStyle: "biometric_realism",
    boardPresentationStyle: "premium_film_board",
    physiquePriority: "match_face_impression",
    characterName: "",
    aliasCodename: "",
    visualAge: "",
    height: "",
    build: "",
    designLanguage: "Cinematic actor-based character design",
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
    debugVisibleLabels: false,
};

const LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID = ["p", "i", "x", "a", "r"].join("");

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

const dedupeList = (values: string[]): string[] => {
    const seen = new Set<string>();

    return values.filter(value => {
        const normalized = normalize(value).toLowerCase();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
};

const isAncientIsraeliteWorld = (input: Pick<CharacterPitchSheetInput, "worldEra">): boolean => {
    const world = normalize(input.worldEra).toLowerCase();

    return /\b(ancient\s+israel|israelite|judean|judea|jerusalem|biblical|hebrew|levant|canaan|second\s+temple|iron\s+age)\b/.test(world);
};

const supportsTechCostumeLanguage = (input: CharacterPitchSheetInput): boolean => {
    const combined = [
        input.worldEra,
        input.designLanguage,
        input.additionalNotes
    ].map(normalize).join(" ").toLowerCase();

    return /\b(sci[- ]?fi|science fiction|cyberpunk|futuristic|future|android|robot|mecha|space opera|starship|near[- ]future|posthuman|high[- ]tech|techwear|cybernetic|tactical tech)\b/.test(combined);
};

const isInternalHandoffVisibleLine = (line: string): boolean => {
    return (
        /\bNanoCast\b.*\b(handoff|loaded|scan|scanner|sent|source|reference|generated)\b/i.test(line) ||
        /\bgenerated\s+NanoCast\s+character\s+image\b/i.test(line) ||
        /\bidentity\s+lock\s+status\b/i.test(line) ||
        /\bsource\s+image\b/i.test(line) ||
        /\breference\s+image\s+labels?\b/i.test(line) ||
        /\bprompt\s+engine\b/i.test(line) ||
        /\bdebug\s+(?:image|label|language)\b/i.test(line) ||
        /\btechnical\s+debug\s+language\b/i.test(line) ||
        /\binternal\s+handoff\s+language\b/i.test(line)
    );
};

const sanitizeVisibleBoardText = (value: string | undefined, input: CharacterPitchSheetInput): string => {
    const raw = value || "";
    if (!normalize(raw)) return "";

    const allowTech = supportsTechCostumeLanguage(input);
    const ancientIsraelite = isAncientIsraeliteWorld(input);

    const sanitizedLines = raw
        .split(/\r?\n/)
        .map(line => {
            if (isInternalHandoffVisibleLine(line)) return "";

            let clean = line
                .replace(/\bmoles\b/gi, "beauty marks")
                .replace(/\bmole\b/gi, "beauty mark");

            clean = clean
                .replace(/\bgenerated\s+NanoCast\s+character\s+image\b/gi, "approved character image")
                .replace(/\bNanoCast\s+markings?\b/gi, ancientIsraelite ? "handworked markings" : "costume markings")
                .replace(/\bNanoCast\s+etching\b/gi, ancientIsraelite ? "hand-tooled detail" : "etched costume detail")
                .replace(/\bNanoCast\s+closures?\b/gi, ancientIsraelite ? "leather ties" : "costume closures")
                .replace(/\bNanoCast\s+clasps?\b/gi, ancientIsraelite ? "bronze clasp" : "costume clasp")
                .replace(/\bNanoCast\b/gi, "")
                .replace(/\bbiometric\s+scanner\b/gi, "actor likeness guide")
                .replace(/\bbiometric\s+closures?\b/gi, ancientIsraelite ? "leather ties" : "costume closures")
                .replace(/\bbiometric\s+etching\b/gi, ancientIsraelite ? "hand-tooled detail" : "etched costume detail")
                .replace(/\bbiometric\s+clasps?\b/gi, ancientIsraelite ? "bronze clasp" : "costume clasp")
                .replace(/\bbiometric\s+hardware\b/gi, ancientIsraelite ? "period hardware" : "costume hardware")
                .replace(/\bidentity\s+lock\s+status\b/gi, "")
                .replace(/\bidentity\s+lock\b/gi, "actor likeness continuity")
                .replace(/\bsource\s+images?\b/gi, "actor likeness guide")
                .replace(/\breference\s+image\s+labels?\b/gi, "")
                .replace(/\bdebug\s+(?:image|label|language)s?\b/gi, "")
                .replace(/\btechnical\s+debug\s+language\b/gi, "")
                .replace(/\binternal\s+handoff\s+language\b/gi, "")
                .replace(/\bimage\s*#?\s*\d+\b/gi, "")
                .replace(/\bmulti[- ]?view\s+scan\b/gi, "actor likeness study")
                .replace(/\braw\s+angle\s+captures?\b/gi, "actor likeness studies")
                .replace(/\bangle\s+references?\b/gi, "likeness guides")
                .replace(/\bidentity\s+references?\b/gi, "actor likeness guides")
                .replace(/\bstrict\s+actor\s+identity\s+source\b/gi, "strict actor likeness source")
                .replace(/\bbiometric\b/gi, "actor likeness");

            if (!allowTech) {
                clean = clean
                    .replace(/\bintegrated\s+circuitry\b/gi, ancientIsraelite ? "bronze claspwork" : "costume hardware")
                    .replace(/\bcircuitry\b/gi, ancientIsraelite ? "woven trim" : "costume detailing")
                    .replace(/\bscanners?\b/gi, "likeness guides")
                    .replace(/\bcybernetic\b/gi, "physical")
                    .replace(/\btactical\s+tech\b/gi, "practical gear")
                    .replace(/\bfuturistic\b/gi, ancientIsraelite ? "period-aware" : "grounded")
                    .replace(/\bglowing\s+tech\s+clasps?\b/gi, ancientIsraelite ? "bronze clasps" : "metal clasps")
                    .replace(/\bsci[- ]?fi\s+closures?\b/gi, ancientIsraelite ? "leather ties" : "practical closures")
                    .replace(/\bergonomic\s+boots?\b/gi, ancientIsraelite ? "sandal construction" : "practical footwear");
            }

            if (ancientIsraelite) {
                clean = clean
                    .replace(/\bmodern\s+boots?\b/gi, "period sandals")
                    .replace(/\btech\s+clasps?\b/gi, "bronze clasps")
                    .replace(/\btechwear\b/gi, "period-aware layering");
            }

            return clean
                .replace(/\s+([,.;:])/g, "$1")
                .replace(/\(\s*\)/g, "")
                .replace(/\s{2,}/g, " ")
                .trim();
        })
        .filter(Boolean);

    return dedupeList(sanitizedLines).join(" ");
};

const sanitizeDesignLanguage = (value: string | undefined, input: CharacterPitchSheetInput): string => {
    const raw = normalize(value);
    if (!raw) return "";

    const hasInternalDesignLanguage = /\b(NanoCast|biometric|scanner|source\s+image|identity\s+lock|generated\s+image)\b/i.test(raw);
    if (!hasInternalDesignLanguage) {
        return sanitizeVisibleBoardText(raw, input);
    }

    if (isAncientIsraeliteWorld(input)) {
        return "Cinematic ancient character design with actor-based likeness";
    }

    const styleHint = sanitizeVisibleBoardText(
        raw
            .replace(/\bNanoCast\b/gi, "")
            .replace(/\bbiometric\b/gi, "")
            .replace(/\bcharacter\s+design\b/gi, "")
            .replace(/\bcinematic\b/gi, ""),
        input
    );

    return styleHint
        ? `${styleHint} cinematic actor-based character design`
        : "Cinematic actor-based character design";
};

const sanitizeLightingMood = (value: string | undefined, input: CharacterPitchSheetInput): string => {
    const raw = normalize(value);
    if (!raw) return "";

    if (
        isInternalHandoffVisibleLine(raw) ||
        /\b(NanoCast|biometric|source\s+image|reference\s+image|identity\s+lock|generated\s+image|handoff)\b/i.test(raw)
    ) {
        return "";
    }

    return sanitizeVisibleBoardText(raw, input);
};

const buildSafeReferenceLabel = (
    reference: { angle?: string; label?: string },
    index: number,
    input: CharacterPitchSheetInput
): string => {
    if (input.debugVisibleLabels && normalize(reference.label)) {
        return sanitizeVisibleBoardText(reference.label, input) || `Debug Reference ${index + 1}`;
    }

    const angle = normalize(reference.angle).toLowerCase();
    if (input.sourcePanelMode === "raw_source") {
        if (angle === "center" || angle === "front") return "Actor Reference";
        if (angle === "left") return "Left Profile Reference";
        if (angle === "right") return "Right Profile Reference";
        if (angle === "up") return "Upward Angle Reference";
        if (angle === "down") return "Downward Angle Reference";
        return "Actor Reference";
    }

    if (angle === "center" || angle === "front") return "Actor Likeness Guide";
    if (angle === "left" || angle === "right") return "Profile Likeness Guide";
    return "Actor Likeness Guide";
};

export function sanitizeVisibleBoardLanguage(input: CharacterPitchSheetInput): CharacterPitchSheetInput {
    const context: CharacterPitchSheetInput = {
        ...input,
        debugVisibleLabels: input.debugVisibleLabels ?? false
    };

    const sanitized: CharacterPitchSheetInput = {
        ...context,
        characterName: sanitizeVisibleBoardText(context.characterName, context),
        aliasCodename: sanitizeVisibleBoardText(context.aliasCodename, context),
        visualAge: sanitizeVisibleBoardText(context.visualAge, context),
        height: sanitizeVisibleBoardText(context.height, context),
        build: sanitizeVisibleBoardText(context.build, context),
        designLanguage: sanitizeDesignLanguage(context.designLanguage, context),
        worldEra: sanitizeVisibleBoardText(context.worldEra, context),
        corePersonality: sanitizeVisibleBoardText(context.corePersonality, context),
        internalConflict: sanitizeVisibleBoardText(context.internalConflict, context),
        wardrobeDirection: sanitizeVisibleBoardText(context.wardrobeDirection, context),
        propsSignatureItems: sanitizeVisibleBoardText(context.propsSignatureItems, context),
        environment: sanitizeVisibleBoardText(context.environment, context),
        lightingMood: sanitizeLightingMood(context.lightingMood, context),
        sheetStyle: sanitizeVisibleBoardText(context.sheetStyle, context),
        additionalNotes: sanitizeVisibleBoardText(context.additionalNotes, context),
        faceDetails: sanitizeVisibleBoardText(context.faceDetails, context),
        performanceDirection: sanitizeVisibleBoardText(context.performanceDirection, context),
        materialCostumeNotes: sanitizeVisibleBoardText(context.materialCostumeNotes, context),
        productionNotes: sanitizeVisibleBoardText(context.productionNotes, context),
        referenceImages: context.referenceImages?.map((reference, index) => ({
            ...reference,
            label: buildSafeReferenceLabel(reference, index, context)
        }))
    };

    return sanitized;
}

const hasAnyTerm = (value: string, terms: string[]): boolean => {
    return terms.some(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(value));
};

const calloutText = (input: CharacterPitchSheetInput): string => {
    return [
        input.worldEra,
        input.wardrobeDirection,
        input.propsSignatureItems,
        input.designLanguage,
        input.sheetStyle,
        input.materialCostumeNotes,
        input.additionalNotes,
        input.productionNotes,
        input.characterRenderStyle,
        input.boardPresentationStyle
    ].map(normalize).join(" ").toLowerCase();
};

const titleCaseCalloutLabel = (value: string): string => {
    return normalize(value)
        .replace(/\b[a-z]/g, character => character.toUpperCase())
        .replace(/\s+\/\s+/g, " / ");
};

const splitCalloutItems = (value: string): string[] => {
    return value
        .split(/[,;\n]+|\s+\band\s+/i)
        .map(normalize)
        .filter(Boolean);
};

const isVagueCalloutLabel = (value: string): boolean => {
    const label = normalize(value).toLowerCase();

    return (
        /^(construction|material|design|object|accessory|garment)\s+detail$/.test(label) ||
        /^(material\s+read|object\s+read|design\s+read)$/.test(label) ||
        /^(primary\s+garment|primary\s+material\s+swatch)$/.test(label) ||
        /^detail$/.test(label)
    );
};

const makeCallout = (
    label: string,
    category: PitchSheetCallout["category"],
    target: string,
    options: Pick<PitchSheetCallout, "material" | "placementHint" | "visibleOnlyIf"> = {}
): PitchSheetCallout => ({
    label,
    category,
    target,
    ...options
});

const sanitizeCallout = (callout: PitchSheetCallout, input: CharacterPitchSheetInput): PitchSheetCallout | null => {
    const label = sanitizeVisibleBoardText(callout.label, input);
    const target = sanitizeVisibleBoardText(callout.target, input);
    const material = callout.material ? sanitizeVisibleBoardText(callout.material, input) : undefined;
    const placementHint = callout.placementHint ? sanitizeVisibleBoardText(callout.placementHint, input) : undefined;
    const visibleOnlyIf = callout.visibleOnlyIf ? sanitizeVisibleBoardText(callout.visibleOnlyIf, input) : undefined;

    if (!label || !target) return null;
    if (isVagueCalloutLabel(label)) return null;

    return {
        label,
        category: callout.category,
        target,
        material: material || undefined,
        placementHint: placementHint || undefined,
        visibleOnlyIf: visibleOnlyIf || undefined
    };
};

const dedupeCallouts = (callouts: PitchSheetCallout[]): PitchSheetCallout[] => {
    const seen = new Set<string>();

    return callouts.filter(callout => {
        const key = `${callout.category}:${normalize(callout.label).toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const formatCalloutPlan = (callouts: PitchSheetCallout[]): string => {
    return callouts.map(callout => {
        const details = [
            `category: ${callout.category}`,
            `target: ${callout.target}`,
            callout.material ? `material: ${callout.material}` : "",
            callout.placementHint ? `placement: ${callout.placementHint}` : "",
            callout.visibleOnlyIf ? `visible only if: ${callout.visibleOnlyIf}` : ""
        ].filter(Boolean).join("; ");

        return `- ${callout.label} (${details})`;
    }).join("\n");
};

const describeCalloutContext = (input: CharacterPitchSheetInput): string => {
    const text = calloutText(input);
    const characterRenderStyle = input.characterRenderStyle || defaultCharacterPitchSheetInput.characterRenderStyle || "biometric_realism";

    if (hasAnyTerm(text, ["robot", "mech", "android", "droid", "automaton", "synthetic body", "machine"])) return "robot/mech";
    if (hasAnyTerm(text, ["creature", "animal", "beast", "dragon", "wolf", "fox", "lion", "fur", "horn", "scale", "claw", "paw"])) return "creature/animal";
    if (
        hasAnyTerm(text, ["mascot", "plush", "character suit"]) ||
        ["animated_feature", "family_3d", "premium_animated_3d", LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID, "claymation", "retro_cel", "retro_anime", "anime_manga"].includes(characterRenderStyle)
    ) return "stylized/animated";
    if (
        hasAnyTerm(text, ["sci-fi", "science fiction", "cyberpunk", "futuristic", "space", "starship", "android", "interface", "tech jacket", "tactical"]) ||
        ["cyberpunk_neon", "cyberpunk"].includes(characterRenderStyle)
    ) return "sci-fi/cyberpunk";
    if (hasAnyTerm(text, ["fantasy", "warrior", "knight", "mage", "ranger", "elf", "dwarf", "sword", "shield", "bracer", "forged"])) return "fantasy/adventure";
    if (hasAnyTerm(text, ["business", "corporate", "spokesperson", "office", "tailored", "suit", "blazer", "tie", "watch", "polished shoe"])) return "modern/business";
    if (hasAnyTerm(text, ["ancient", "historical", "period", "medieval", "roman", "greek", "egyptian", "israelite", "judean", "biblical", "victorian", "regency", "feudal"])) return "historical/period";

    return "general cinematic";
};

const buildGarmentCalloutCandidates = (input: CharacterPitchSheetInput): PitchSheetCallout[] => {
    const text = calloutText(input);
    const context = describeCalloutContext(input);
    const callouts: PitchSheetCallout[] = [];
    const wardrobeText = input.wardrobeDirection || "";
    const hasExplicit = Boolean(normalize(input.wardrobeDirection));
    const supportsCollar = !hasExplicit || finalWardrobeSupportsCollar(wardrobeText);

    if (context === "robot/mech") {
        callouts.push(
            makeCallout("Faceplate Design", "construction", "visible faceplate or head assembly", { material: "hard surface material", placementHint: "point only to the faceplate/head inset" }),
            makeCallout("Panel Seam", "construction", "visible armor panel seam or body plate", { material: "metal or composite", placementHint: "point to an actual seam line" })
        );
    } else if (context === "creature/animal") {
        callouts.push(
            makeCallout("Fur Pattern", "material", "visible fur pattern on body or head", { material: "fur", placementHint: "point to fur, not costume fabric", visibleOnlyIf: "fur is visibly present" }),
            makeCallout("Horn / Scale Texture", "material", "visible horn, scale, or hide texture", { material: "horn, scale, or hide", placementHint: "point only to creature anatomy", visibleOnlyIf: "horns, scales, or textured hide are visible" })
        );
    } else if (context === "sci-fi/cyberpunk") {
        callouts.push(
            makeCallout("Reinforced Tech Jacket", "garment", "visible jacket or outerwear", { material: "synthetic textile or armor fabric", placementHint: "point to the jacket body, not skin or background" }),
            makeCallout("Utility Harness", "accessory", "visible harness, belt, or carried rig", { material: "webbing, polymer, or metal fittings", placementHint: "point to harness straps or attachment points", visibleOnlyIf: "a harness, belt rig, or utility strap is visible" })
        );
    } else if (context === "modern/business") {
        callouts.push(
            makeCallout("Tailored Jacket", "garment", "visible jacket or blazer", { material: "tailored fabric", placementHint: "point to lapel, shoulder, or jacket body" }),
            ...(supportsCollar ? [makeCallout("Shirt Collar Construction", "construction", "visible shirt collar", { material: "shirt fabric", placementHint: "point to collar edge or collar stand", visibleOnlyIf: "a shirt collar is visible" })] : [])
        );
    } else if (context === "fantasy/adventure") {
        callouts.push(
            makeCallout("Layered Cloak", "garment", "visible cloak or outer layer", { material: "woven or weathered textile", placementHint: "point to cloak mass or hem", visibleOnlyIf: "a cloak or cape is visible" }),
            makeCallout("Leather Bracer", "accessory", "visible bracer, cuff, or forearm guard", { material: "leather", placementHint: "point to wrist/forearm gear", visibleOnlyIf: "a bracer or cuff is visible" })
        );
    } else if (context === "stylized/animated") {
        callouts.push(
            makeCallout("Pose Read", "performance", "visible pose read, posture, or body-language study", { placementHint: "point to the rendered pose or body language, not costume material" }),
            makeCallout("Character Color Blocking", "material", "visible costume color zones", { material: "costume color/material areas", placementHint: "point to a clear color block or material swatch" })
        );
    } else if (context === "historical/period") {
        callouts.push(
            makeCallout("Period Outer Layer", "garment", "visible cloak, robe, coat, mantle, or outer garment", { material: "period-appropriate textile", placementHint: "point to the outer garment", visibleOnlyIf: "an outer layer is visible" }),
            makeCallout("Period Inner Layer", "garment", "visible tunic, shirt, robe, or dress layer", { material: "historically inspired textile", placementHint: "point to the inner garment body" })
        );
    } else {
        callouts.push(
            makeCallout("Main Costume Layer", "garment", "visible main garment or outer layer", { placementHint: "point to the main costume layer, not a background area", visibleOnlyIf: "the main garment is clearly visible" }),
            makeCallout("Layering System", "construction", "visible overlap between garment layers", { placementHint: "point to layered hems, collars, straps, or fasteners" })
        );
    }

    if (hasAnyTerm(text, ["field jacket"])) {
        callouts.unshift(makeCallout("Field Jacket", "garment", "visible field jacket body, collar, sleeve, or pocket flap", { material: "canvas, cotton, or weathered textile if visible", placementHint: "point to the field jacket body, collar, pocket flap, or sleeve" }));
    } else if (!["modern/business", "sci-fi/cyberpunk"].includes(context) && hasAnyTerm(text, ["jacket", "coat", "parka"])) {
        callouts.unshift(makeCallout("Outer Jacket Layer", "garment", "visible jacket, coat, or parka", { material: "outerwear textile", placementHint: "point to the jacket or coat body" }));
    }
    if (context !== "creature/animal" && hasAnyTerm(text, ["cloak", "cape", "mantle"])) {
        callouts.unshift(makeCallout("Cloak Layer", "garment", "visible cloak, cape, or mantle", { material: "outer textile", placementHint: "point to cloak fabric or hem" }));
    }
    if (hasAnyTerm(text, ["tunic"])) {
        callouts.unshift(makeCallout("Tunic Construction", "garment", "visible tunic body", { material: "fabric", placementHint: "point to the tunic body" }));
    } else if (hasAnyTerm(text, ["robe", "cloak"])) {
        callouts.unshift(makeCallout("Outer Garment Layer", "garment", "visible robe, cloak, or outer garment", { material: "fabric", placementHint: "point to the outer garment body" }));
    } else if (hasAnyTerm(text, ["dress", "gown"])) {
        callouts.unshift(makeCallout("Dress Silhouette", "garment", "visible dress or gown", { material: "fabric", placementHint: "point to the dress/gown body" }));
    } else if (context !== "modern/business" && hasAnyTerm(text, ["shirt"]) && supportsCollar) {
        callouts.unshift(makeCallout("Shirt Collar", "garment", "visible shirt collar, placket, or sleeve", { material: "shirt fabric", placementHint: "point to the shirt collar, placket, or sleeve" }));
    }
    if (hasAnyTerm(text, ["armor", "armour", "breastplate", "plate", "pauldron"])) {
        callouts.unshift(makeCallout("Armor Panel", "garment", "visible armor plate or protective panel", { material: "metal, leather, or composite armor", placementHint: "point to the armor panel, not fabric underneath" }));
    }
    if (hasAnyTerm(text, ["emblem", "insignia", "crest", "logo"])) {
        callouts.push(makeCallout("Emblem / Insignia", "accessory", "visible emblem, insignia, crest, or badge", { placementHint: "point to the emblem itself", visibleOnlyIf: "an emblem or insignia is visible" }));
    }

    return callouts;
};

const buildMaterialCalloutCandidates = (input: CharacterPitchSheetInput): PitchSheetCallout[] => {
    const text = calloutText(input);
    const context = describeCalloutContext(input);
    const callouts: PitchSheetCallout[] = [];

    if (context === "robot/mech") {
        callouts.push(makeCallout("Hard-Surface Finish", "material", "visible robotic panel, joint, chassis, or finish swatch", { material: "metal/composite", placementHint: "point to hard-surface material" }));
    }
    if (hasAnyTerm(text, ["linen", "wool", "cotton", "silk", "denim", "canvas", "tweed", "fabric", "woven", "textile"])) {
        callouts.push(makeCallout("Fabric Drape / Weave", "material", "visible fabric area or dedicated fabric swatch", { material: "fabric/textile", placementHint: "point only to fabric or a fabric swatch" }));
    }
    if (hasAnyTerm(text, ["leather", "suede", "hide"])) {
        callouts.push(makeCallout("Leather Grain", "material", "visible leather belt, strap, bracer, boot, glove, or leather swatch", { material: "leather", placementHint: "point only to leather, never to fabric" }));
    }
    if (hasAnyTerm(text, ["bronze", "iron", "steel", "metal", "gold", "silver", "clasp", "buckle", "fitting", "chain", "armor", "armour"])) {
        callouts.push(makeCallout("Metal Finish / Patina", "material", "visible metal clasp, fitting, armor, jewelry, weapon, or metal swatch", { material: "metal", placementHint: "point only to metal, never to fabric or skin" }));
    }
    if (hasAnyTerm(text, ["synthetic", "polymer", "rubber", "plastic", "carbon", "composite", "kevlar"])) {
        callouts.push(makeCallout("Synthetic Material Finish", "material", "visible synthetic textile, polymer, rubber, or composite surface", { material: "synthetic/composite", placementHint: "point to the synthetic surface or swatch" }));
    }
    if (context === "sci-fi/cyberpunk" && hasAnyTerm(text, ["tech", "interface", "tactical", "utility", "reinforced", "armor", "armour", "panel"])) {
        callouts.push(makeCallout("Synthetic Material Finish", "material", "visible tech garment, armor panel, interface trim, or synthetic material swatch", { material: "synthetic/composite", placementHint: "point to sci-fi costume material, not skin or background" }));
    }
    if (hasAnyTerm(text, ["fur", "pelt"])) {
        callouts.push(makeCallout("Fur Texture", "material", "visible fur or fur swatch", { material: "fur", placementHint: "point only to fur" }));
    }
    if (hasAnyTerm(text, ["scale", "scales", "horn", "claw"])) {
        callouts.push(makeCallout("Horn / Scale Material", "material", "visible horn, scale, claw, or anatomy swatch", { material: "horn/scale", placementHint: "point to anatomy material, not costume" }));
    }
    if (context !== "robot/mech" && hasAnyTerm(text, ["panel", "joint", "faceplate", "chassis", "mech", "robot", "droid"])) {
        callouts.push(makeCallout("Hard-Surface Finish", "material", "visible robotic panel, joint, chassis, or finish swatch", { material: "metal/composite", placementHint: "point to hard-surface material" }));
    }

    if (callouts.length === 0 && hasAnyTerm(text, ["jacket", "coat", "cloak", "tunic", "robe", "shirt", "dress", "uniform", "pants", "trousers", "skirt", "garment", "costume"])) {
        callouts.push(makeCallout("Main Costume Textile", "material", "clearest visible textile garment area or material swatch", { material: "visible textile", placementHint: "point only to visible textile or a textile swatch", visibleOnlyIf: "a textile garment area is clearly visible" }));
    }

    return callouts;
};

const buildFootwearCalloutCandidate = (input: CharacterPitchSheetInput): PitchSheetCallout => {
    const text = calloutText(input);
    const context = describeCalloutContext(input);

    if (context === "creature/animal") {
        return makeCallout("Paw / Claw Construction", "footwear", "visible paw, claw, hoof, or foot anatomy", { placementHint: "point only to feet/paws/claws", visibleOnlyIf: "feet, paws, claws, or hooves are visible" });
    }
    if (context === "robot/mech") {
        return makeCallout("Foot / Joint Assembly", "footwear", "visible robotic foot, ankle, or lower-leg joint", { material: "metal/composite", placementHint: "point only to feet or lower joints" });
    }
    if (hasAnyTerm(text, ["sandal", "sandals"])) {
        return makeCallout("Sandal Construction", "footwear", "visible sandals or sandal inset", { material: "leather, textile, or period footwear material", placementHint: "point only to sandals" });
    }
    if (hasAnyTerm(text, ["boot", "boots", "tactical"])) {
        return makeCallout(context === "sci-fi/cyberpunk" ? "Tactical Boot Construction" : "Boot Construction", "footwear", "visible boots or boot inset", { material: "footwear material", placementHint: "point only to boots" });
    }
    if (hasAnyTerm(text, ["shoe", "shoes", "polished", "loafer", "heel", "sneaker"])) {
        return makeCallout(context === "modern/business" ? "Polished Shoe Construction" : "Shoe Construction", "footwear", "visible shoes or shoe inset", { material: "footwear material", placementHint: "point only to shoes" });
    }
    if (context === "stylized/animated") {
        return makeCallout("Stylized Footwear Shape", "footwear", "visible footwear or footwear inset", { placementHint: "point only to footwear" });
    }

    return makeCallout("Footwear Construction", "footwear", "visible footwear or footwear inset", { placementHint: "point only to footwear", visibleOnlyIf: "footwear is clearly visible" });
};

const buildAccessoryOrPropCalloutCandidates = (input: CharacterPitchSheetInput): PitchSheetCallout[] => {
    const text = calloutText(input);
    const props = normalize(input.propsSignatureItems);
    const callouts: PitchSheetCallout[] = [];
    const propItems = splitCalloutItems(props)
        .map(part => sanitizeVisibleBoardText(part, input))
        .filter(Boolean);

    for (const propItem of propItems) {
        const propCallout = buildPropCallout(propItem);
        if (propCallout) callouts.push(propCallout);
    }

    if (hasAnyTerm(text, ["watch", "bracelet", "ring", "necklace", "earring", "glasses", "bag", "belt", "sash", "harness", "insignia", "badge", "jewelry", "jewellery"])) {
        if (hasAnyTerm(text, ["watch"])) {
            callouts.push(makeCallout("Watch Case / Strap", "accessory", "visible watch case, watch strap, or wrist accessory", { material: "metal, leather, or modern accessory material", placementHint: "point to the watch or strap itself, not sleeve fabric" }));
        } else if (hasAnyTerm(text, ["belt", "sash", "harness", "strap"])) {
            callouts.push(makeCallout(hasAnyTerm(text, ["harness"]) ? "Harness Straps" : "Belt Hardware", "accessory", "visible belt, sash, harness, buckle, or strapwork", { material: "leather, textile, webbing, or metal hardware", placementHint: "point to the belt, strap, buckle, or harness itself" }));
        } else {
            callouts.push(makeCallout("Visible Accessory", "accessory", "visible jewelry, bag, eyewear, insignia, clasp, or pin", { placementHint: "point only to the accessory", visibleOnlyIf: "the accessory is clearly visible" }));
        }
    }

    if (describeCalloutContext(input) === "fantasy/adventure" && hasAnyTerm(text, ["sword", "dagger", "staff", "shield", "bow", "weapon"])) {
        callouts.push(makeCallout("Weapon Grip", "prop", "visible weapon grip, handle, shield grip, or prop inset", { material: "wood, leather, metal, or prop material", placementHint: "point to the weapon grip, handle, shield grip, or prop inset" }));
    }
    if (describeCalloutContext(input) === "robot/mech" && hasAnyTerm(text, ["core", "chest", "power"])) {
        callouts.push(makeCallout("Power Core Module", "construction", "visible chest module, power core, or central panel", { material: "metal/composite/glass", placementHint: "point only to the chest/core module" }));
    }

    return callouts;
};

const buildPropCallout = (prop: string): PitchSheetCallout | null => {
    const value = normalize(prop);
    const lower = value.toLowerCase();
    if (!value || /\b(no prop|none|n\/a)\b/.test(lower)) return null;

    if (/\b(field\s+journal|journal)\b/.test(lower)) {
        return makeCallout("Field Journal", "prop", "visible field journal, journal cover, pages, or dedicated prop inset", {
            material: "paper, cloth, or leather cover if visible",
            placementHint: "point only to the field journal or prop inset; never to face, body, clothing, or empty space",
            visibleOnlyIf: "the journal is clearly visible"
        });
    }

    if (/\btablet\b/.test(lower)) {
        return makeCallout("Tablet Prop", "prop", "visible tablet, screen edge, carried tablet, or dedicated prop inset", {
            material: "glass, metal, or polymer if visible",
            placementHint: "point only to the tablet or tablet inset",
            visibleOnlyIf: "the tablet is clearly visible"
        });
    }

    if (/\bprojector\b/.test(lower)) {
        return makeCallout(titleCaseCalloutLabel(value), "prop", `visible ${value}, projector housing, wrist mount, or dedicated prop inset`, {
            material: "device material if visible",
            placementHint: `point only to the ${value}, projector housing, wrist mount, or prop inset`,
            visibleOnlyIf: `the ${value} is clearly visible`
        });
    }

    return makeCallout(titleCaseCalloutLabel(value), "prop", `visible ${value} or dedicated prop inset`, {
        placementHint: `point only to the ${value} or prop inset; never to face, body, clothing, or empty space`,
        visibleOnlyIf: `the ${value} is clearly visible`
    });
};

const buildPerformanceCalloutCandidate = (input: CharacterPitchSheetInput): PitchSheetCallout => {
    const performance = valueOr(input.performanceDirection, input.corePersonality, "Controlled, readable presence");
    const label = `Performance Note: ${performance.split(/[.;,]/)[0].slice(0, 54)}`;

    return makeCallout(label, "performance", "visible expression, stance, gesture, or action pose", {
        placementHint: "point to face, stance, hand gesture, or pose, not to costume material"
    });
};

const buildConstructionCalloutCandidate = (input: CharacterPitchSheetInput): PitchSheetCallout | null => {
    const text = calloutText(input);
    const wardrobeText = input.wardrobeDirection || "";
    const hasExplicit = Boolean(normalize(input.wardrobeDirection));
    const supportsCollar = !hasExplicit || finalWardrobeSupportsCollar(wardrobeText);

    if (hasAnyTerm(text, ["joint", "robot", "mech", "android", "panel"])) {
        return makeCallout("Joint Assembly", "construction", "visible joint, hinge, panel seam, or mechanical assembly", { material: "metal/composite", placementHint: "point to the actual joint or panel seam" });
    }
    if (hasAnyTerm(text, ["pocket", "flap"])) {
        return makeCallout("Pocket Flap", "construction", "visible pocket flap, pocket seam, or closure flap", { placementHint: "point to the actual pocket flap or pocket seam" });
    }
    if (hasAnyTerm(text, ["sleeve", "cuff"])) {
        return makeCallout("Sleeve Cuff", "construction", "visible sleeve cuff, cuff seam, or cuff closure", { placementHint: "point to the sleeve cuff itself" });
    }
    if (hasAnyTerm(text, ["clasp", "buckle", "closure", "fastener", "button", "zipper", "lacing"])) {
        return makeCallout(hasAnyTerm(text, ["belt", "buckle"]) ? "Belt Hardware" : "Closure Hardware", "construction", "visible clasp, buckle, closure, button, zipper, lacing, or fastener", { placementHint: "point to the fastener itself", visibleOnlyIf: "the named fastener or closure is visible" });
    }
    if (hasAnyTerm(text, ["stitch", "seam", "tailored", "collar"])) {
        if (hasAnyTerm(text, ["jacket", "coat"])) {
            return makeCallout("Jacket Seam Detail", "construction", "visible jacket seam, stitching, lapel edge, or tailored construction", { placementHint: "point to the jacket seam or stitching" });
        }
        if (hasAnyTerm(text, ["shirt", "collar"]) && supportsCollar) {
            return makeCallout("Shirt Collar", "construction", "visible shirt collar, collar edge, or collar stand", { placementHint: "point to the shirt collar or collar stand" });
        }
        return makeCallout("Seam / Stitching", "construction", "visible seam, stitching, collar edge, or tailored construction", { placementHint: "point to seam or stitching" });
    }

    if (hasAnyTerm(text, [
        "jacket", "coat", "cloak", "tunic", "vest", "harness", "belt", "straps", "pockets", "flaps",
        "layer", "layered", "overlap", "overlapping", "hem", "hems"
    ])) {
        return makeCallout("Layering System", "construction", "visible overlap between garment layers, hems, collars, straps, panels, or fasteners", {
            placementHint: "point to a clear overlap between actual garment layers",
            visibleOnlyIf: "a visible garment overlap, hem, collar, strap, panel, or fastener is present"
        });
    }

    return null;
};

export function buildPitchSheetCallouts(input: CharacterPitchSheetInput): PitchSheetCallout[] {
    const garmentCandidates = buildGarmentCalloutCandidates(input);
    const materialCandidates = buildMaterialCalloutCandidates(input);
    const accessoryPropCandidates = buildAccessoryOrPropCalloutCandidates(input);
    const footwear = buildFootwearCalloutCandidate(input);
    const construction = buildConstructionCalloutCandidate(input);
    const performance = buildPerformanceCalloutCandidate(input);

    const selected = [
        ...garmentCandidates.slice(0, 2),
        ...materialCandidates.slice(0, 2),
        footwear,
        ...(accessoryPropCandidates.length > 0
            ? accessoryPropCandidates.slice(0, 1)
            : (construction ? [construction] : [])),
        performance
    ].filter((callout): callout is PitchSheetCallout => callout !== null);

    return dedupeCallouts(
        selected
            .map(callout => sanitizeCallout(callout, input))
            .filter((callout): callout is PitchSheetCallout => Boolean(callout))
    ).slice(0, 7);
};

const buildVisibleVocabularyRule = (input: CharacterPitchSheetInput, callouts: PitchSheetCallout[]): string => {
    return `WORLD / ERA CALLOUT VOCABULARY RULE:
- Callout labels must match the character's world, era, wardrobe, and props: ${valueOr(input.worldEra, "the character's world")}.
- Modern characters should use modern garment/accessory language.
- Historical characters should use period-appropriate material/garment language.
- Sci-fi characters may use tech/armor/interface language only when the world supports it.
- Fantasy characters may use fantasy-appropriate construction/material language.
- Creature, robot, and mascot characters should use anatomy/material/construction labels appropriate to that type.
- Do not import futuristic, medieval, modern, tactical, cybernetic, fantasy, religious, or technical vocabulary unless it fits the selected world/era or user-provided wardrobe/props.
- Controlled callout vocabulary for this sheet: ${callouts.map(callout => callout.label).join("; ")}.`;
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

    const hasIdentityDrivenSource =
        isBiometricIdentitySource(input) ||
        !!input.referenceImageUrl ||
        !!input.referenceImages?.length ||
        !!input.characterStyleReferenceUrl ||
        !!input.identityLock;

    if (hasIdentityDrivenSource) {
        return "Preserve the supplied biometric/reference face exactly: same head shape, scalp/bald shape, brow structure, eye shape and spacing, nose shape, mouth shape, jaw, facial hair pattern, age impression, and visible identity markers. Do not invent a new face design.";
    }

    const personality = valueOr(input.corePersonality, "complex, readable personality");
    const conflict = valueOr(input.internalConflict, "private emotional pressure");
    const designLanguage = valueOr(input.designLanguage, defaultCharacterPitchSheetInput.designLanguage);

    return `Distinct face shaped by ${personality} and ${conflict}: memorable silhouette, intentional facial structure, subtle asymmetry, lived-in skin detail, hairline and brow choices that match ${designLanguage}.`;
};

const inferPerformance = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.performanceDirection);
    if (supplied) return supplied;

    return "Neutral, controlled, readable presence matching the supplied biometric references.";
};

const inferWardrobe = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.wardrobeDirection);
    if (supplied) return supplied;

    if (input.characterStyleReferenceUrl) {
        return "Preserve the approved generated character source costume package, silhouette, footwear, material language, and visible wardrobe layers. Do not invent major new costume signatures unless requested.";
    }

    const world = valueOr(input.worldEra, "the character's inferred world");
    const designLanguage = valueOr(input.designLanguage, defaultCharacterPitchSheetInput.designLanguage);

    return `Wardrobe inferred conservatively from ${world} and ${designLanguage}: clear silhouette, visible footwear, and consistent material language. Do not invent weapons, tactical gear, armor, or major accessories unless requested.`;
};

export const inferProps = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.propsSignatureItems);
    if (supplied) return supplied;

    return "";
};

const inferEnvironment = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.environment);
    if (supplied) return supplied;

    const world = valueOr(input.worldEra, "the character's world");

    return `Subtle production backdrop drawn from ${world}, present as atmosphere without overpowering the character sheet.`;
};

const inferMaterialNotes = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.materialCostumeNotes);
    if (supplied) return supplied;

    return "Render fabric, leather, metal, footwear, stitching, visible closures, garment edges, wear, and patina with production-ready clarity.";
};

const inferProductionNotes = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.productionNotes);
    if (supplied) return supplied;

    return "Design must be production-ready for casting, wardrobe, continuity, and later scene generation.";
};

const hasActorSourceForPitchSheet = (input: CharacterPitchSheetInput): boolean => {
    return Boolean(
        input.referenceImageUrl ||
        input.referenceImages?.length ||
        input.characterStyleReferenceUrl ||
        input.identityLock ||
        input.identitySource === "portrait_reference" ||
        input.identitySource === "biometric_multiview" ||
        input.identitySource === "biometric_plus_character"
    );
};

const finalWardrobeSupportsCollar = (text: string): boolean => {
    const clean = normalize(text).toLowerCase();
    if (!clean) return true;
    if (/\b(tank|tank-top|sleeveless|shirtless|bare chest|crop top|sports bra|singlet)\b/.test(clean)) return false;
    return /\b(collar|collared|polo|button-up|dress shirt|jacket|coat|blazer|uniform|robe|tunic)\b/.test(clean);
};

const wrapFaceDetailsForPrompt = (
    text: string,
    hasActorSource: boolean
): string => {
    const supplied = normalize(text);

    if (!supplied) {
        return hasActorSource
            ? "Use the hidden actor likeness lock as the face/head authority. The visible Face Details field is empty, but actor identity remains locked to the supplied source."
            : "Distinct readable face design appropriate to the current character brief.";
    }

    if (!hasActorSource) return supplied;

    return `Use the following user Face Details only as supplemental face/head rendering guidance. The supplied actor source remains the primary identity authority. Do not let these notes override source likeness unless the workflow explicitly requests identity transformation. User notes: "${supplied}"`;
};

const wrapPerformanceDirectionForPrompt = (
    text: string,
    hasActorSource: boolean
): string => {
    const supplied = normalize(text);

    if (!supplied) {
        return hasActorSource
            ? "Neutral, controlled, readable presence matching the supplied actor source."
            : "Neutral, controlled, readable presence matching the character brief.";
    }

    if (!hasActorSource) return supplied;

    return `Apply the following user Performance Direction through pose, body language, attitude, gesture, expression, or action staging only. Do not change actor identity, face structure, head shape, scalp outline, hair, hairline, facial hair, grooming, skin tone, age impression, or core likeness. User direction: "${supplied}"`;
};

const wrapMaterialCostumeNotesForPrompt = (
    text: string,
    hasActorSource: boolean
): string => {
    const supplied = normalize(text);

    if (!supplied) {
        return "Render fabric, leather, metal, footwear, stitching, visible closures, garment edges, wear, and patina with production-ready clarity.";
    }

    if (!hasActorSource) return supplied;

    return `Apply the following user Material / Costume Notes only to wardrobe, fabrics, materials, clothing construction, accessories, footwear, costume presentation, and visible costume details. Do not change actor identity, face/head likeness, hair, hairline, facial hair, grooming, head shape, scalp outline, skin tone, or age impression. User notes: "${supplied}"`;
};

const wrapProductionNotesForPrompt = (
    text: string,
    hasActorSource: boolean
): string => {
    const supplied = normalize(text);

    if (!supplied) {
        return "Design must be production-ready for casting, wardrobe, continuity, and later scene generation.";
    }

    if (!hasActorSource) return supplied;

    return `Apply the following user Production Notes to board structure, production intent, presentation, sequencing, callouts, shot emphasis, and design-sheet communication only. Do not change actor identity, face/head likeness, hair, hairline, facial hair, grooming, head shape, scalp outline, skin tone, or age impression. User notes: "${supplied}"`;
};

const buildHiddenActorSourceIdentityLock = (
    input: CharacterPitchSheetInput,
    options: {
        hasGeneratedCharacterSource: boolean;
        hasPortraitReferenceSource: boolean;
        characterName: string;
        supportingPosePanelLabel: string;
    }
): string => {
    if (!hasActorSourceForPitchSheet(input)) return "";

    const identitySourceText = options.hasGeneratedCharacterSource
        ? "the generated character source plus biometric actor likeness references"
        : options.hasPortraitReferenceSource
            ? "the approved portrait actor source"
            : "the supplied actor likeness source";

    const authoritySplit = options.hasGeneratedCharacterSource
        ? `
SOURCE AUTHORITY SPLIT:
- Image A / [IMAGE 1] controls outfit, body presentation, render style, costume, silhouette, pose attitude, and approved character design.
- Images B-F / biometric likeness references control face, head, hair, hairline, facial hair, grooming, skin tone, head shape, scalp outline, facial proportions, asymmetry, age impression, and actor identity.
- Performance Direction controls pose, action, and body language only.
- Material / Costume Notes control wardrobe and materials only.
- No user freeform field can create a new actor.
- Pitch Sheet Brief instructions control presentation, layout, pose ideas, callouts, labels, and production board structure only.

SCAN + CHARACTER AUTHORITY:
- Image A / generated character source controls outfit, body presentation, render style, costume silhouette, color/material look, and approved character design.
- Biometric actor references control face, head shape, hair, hairline, scalp coverage, facial hair, grooming, skin tone, facial proportions, asymmetry, age impression, and actor identity.
- If Image A conflicts with biometric actor references on hair, hairline, facial identity, or grooming, the biometric actor references win.
- Do not create a new actor.
- Do not make the actor bald unless the biometric references or explicit user guidance support baldness.`
        : `
SOURCE AUTHORITY:
- The actor source controls face, head, hair, hairline, facial hair, grooming, skin tone, head shape, scalp outline, facial proportions, asymmetry, age impression, and actor identity.
- Pitch Sheet Brief instructions control presentation, layout, pose ideas, costume notes, callouts, labels, and production board structure only.`;

    return `
HIDDEN STRICT ACTOR LIKENESS LOCK:
- The supplied actor source is the strict actor likeness authority for ${options.characterName || "this character"}.
- Preserve the same actor identity across hero portrait, head studies, turnaround views, expression study, ${options.supportingPosePanelLabel}, callout panels, and supporting poses.
- Preserve hair, hairline, facial hair, grooming, head shape, scalp outline, facial proportions, asymmetry, skin tone, age impression, and emotional presence consistently across every view.
- Do not reinterpret, redesign, replace, beautify, age-shift, youthify, slim, bulk, or substitute the actor.
- Do not let pose, costume, material, performance, board style, production notes, body metadata, or layout instructions change the actor's face/head identity.
- Apply all user customization as compatible guidance while preserving ${identitySourceText}.

HAIR / SCALP SOURCE AUTHORITY:
- Hair, hairline, scalp coverage, hair texture, hair density, and grooming are actor identity attributes.
- Use the biometric actor references as the authority for hair and hairline.
- If biometric references show visible hair, preserve visible hair.
- Do not render the actor bald unless the biometric references clearly show baldness or the user explicitly requests bald/shaved hair.
- If Image A / the generated character source appears bald but biometric actor references show hair, preserve the biometric hair and hairline while keeping Image A's outfit, body presentation, and render style.
- Style may simplify hair rendering, but must not erase visible biometric hair.

CONFLICT RESOLUTION:
- If any user customization conflicts with actor likeness preservation, preserve actor likeness first.
- Reinterpret the user customization in the closest compatible way without changing the actor's identity.
- User text may direct pose, action, mood, costume, materials, board presentation, or callout emphasis, but may not implicitly replace the actor.

${authoritySplit}
`;
};

const isBiometricIdentitySource = (input: CharacterPitchSheetInput): boolean => {
    return input.identitySource === "biometric_multiview" || input.identitySource === "biometric_plus_character";
};

const isReferenceDrivenIdentitySource = (input: CharacterPitchSheetInput): boolean => {
    return input.identitySource === "portrait_reference" || isBiometricIdentitySource(input);
};

const formatHeightLabel = (heightIn: number | undefined): string => {
    if (typeof heightIn !== "number" || !Number.isFinite(heightIn)) return "";

    const rounded = Math.round(heightIn);
    return `${Math.floor(rounded / 12)}'${rounded % 12}"`;
};

const parseHeightToInches = (value: string | undefined): number | undefined => {
    const normalized = normalize(value).toLowerCase();
    const match = normalized.match(/(\d+)\s*(?:'|ft|feet)\s*(\d+)?/);
    if (!match) return undefined;

    return (Number(match[1]) * 12) + Number(match[2] || 0);
};

const parseWeightToLbs = (value: string | undefined): number | undefined => {
    const normalized = normalize(value).toLowerCase();
    const match = normalized.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/);
    if (!match) return undefined;

    return Math.round(Number(match[1]));
};

const buildBodyGuide = (input: CharacterPitchSheetInput): string => {
    const height = formatHeightLabel(input.heightIn || parseHeightToInches(input.height));
    const weight = input.weightLbs || parseWeightToLbs(input.build);
    const frameSize = input.frameSize ? `${input.frameSize} frame` : "";
    const musculature = input.musculature ? `${input.musculature} musculature` : "";
    const interpretation = input.buildInterpretation ? `${input.buildInterpretation.replace(/_/g, "-")} build` : "";

    return [height, weight ? `${weight} lb` : "", frameSize, musculature, interpretation]
        .filter(Boolean)
        .join(", ");
};

const buildBodyMetadataForBoard = (input: CharacterPitchSheetInput): string => {
    return buildBodyGuide(input);
};

const cleanBodyGuideText = (value: string): string => {
    return value
        .replace(/\s*,\s*,/g, ",")
        .replace(/^\s*,\s*|\s*,\s*$/g, "")
        .trim();
};

const buildBodyGuideForPrompt = (input: CharacterPitchSheetInput): string => {
    const rawGuide = buildBodyGuide(input);
    const strictBodySpecs = input.physiquePriority === "strict_body_specs";

    if (strictBodySpecs) return rawGuide;

    const withoutExactWeight = cleanBodyGuideText(rawGuide
        .replace(/\b\d{2,3}\s*lb\b/gi, "")
    );
    const buildTextWithoutExactWeight = cleanBodyGuideText(
        normalize(input.build).replace(/\b\d+(?:\.\d+)?\s*(?:lb|lbs|pound|pounds)\b/gi, "")
    );

    const qualitative = dedupeList([
        withoutExactWeight,
        input.buildInterpretation ? `${input.buildInterpretation.replace(/_/g, "-")} build` : "",
        input.frameSize ? `${input.frameSize} frame` : "",
        input.musculature ? `${input.musculature} musculature` : "",
        buildTextWithoutExactWeight
    ].filter(Boolean)).join(", ");

    return qualitative || "preserve source-visible build and proportions";
};

const CHARACTER_RENDER_STYLE_BLOCKS: Record<CharacterPitchSheetRenderStyle, string> = {
    biometric_realism: "Biometric Realism: realistic actor-based character design sheet, face-reference likeness, consistent subject across panels, realistic skin, wardrobe, and materials.",
    cinematic_photoreal: "Cinematic Photoreal: premium film-grade character board, realistic actor-based likeness, cinematic lighting, believable wardrobe, strong production presentation.",
    exact_studio: "Exact Studio realism: clean professional studio lighting, accurate actor likeness, realistic skin, realistic wardrobe materials, sharp portrait detail. Preserve the exact source subject while translating only the rendering style.",
    photorealism: "Photorealistic rendering: natural camera realism, believable skin, realistic fabric, grounded lighting, no illustration. Preserve the exact source subject while translating only the rendering style.",
    dslr_capture: "DSLR capture look: real camera portraiture, natural lens behavior, subtle depth of field, realistic skin texture, documentary-quality detail. Preserve the exact source subject while translating only the rendering style.",
    stylized_realism: "Stylized Realism: grounded actor identity with controlled shape simplification, painterly surface finish, realistic materials, and cinematic character-board polish.",
    animated_feature: "Animated Feature style: the same supplied actor translated into polished animated-feature 3D, with readable stylized expression, soft sculpted forms, animation-ready material treatment, and soft cinematic non-photoreal lighting. Preserve the exact source subject and biometric likeness while translating only the rendering style. Do not redesign the actor into a generic animated protagonist.",
    family_3d: "High-end family 3D animation style: the same supplied actor translated into polished family-animation 3D, with clean sculpted forms, soft cinematic stylized lighting, readable expression, and smooth non-photoreal CG materials. Preserve the exact source subject and biometric likeness while translating only the rendering style. Do not drift into realism, claymation, concept art, or a generic family-animation protagonist.",
    premium_animated_3d: "Premium Pixar-style animated 3D: polished family-feature animated character rendering with smooth stylized materials, soft cinematic animated-feature lighting, clean sculpted forms, and appealing CG finish. This is a render-style translation of the same biometric actor, not a new character design. Preserve the actor's biometric identity geometry, head silhouette, facial hair pattern, age impression, body presence, and costume continuity while changing only the render/material style. Do not drift into realism, claymation, concept art, line art, or generic animated-character redesign.",
    claymation: "Claymation / tactile stop-motion style: translate the same supplied actor identity into handcrafted clay/plasticine material. Preserve the exact face structure, head shape, scalp/bald shape, facial hair pattern, brow shape, eyes, nose, mouth, jaw, age impression, body proportions, and costume continuity while changing only the material/render treatment into tactile clay. Use subtle handmade surface character and stop-motion material feel, but do not create a new puppet character, mascot, caricature, chibi figure, toy-like body, or premium animated 3D character.",
    editorial_illustration: "Editorial Illustration: refined illustrated portrait treatment, elegant value hierarchy, controlled color blocking, magazine-quality production finish.",
    concept_art: "Concept Art: production-design polish, clear material rendering, cinematic atmosphere, resolved wardrobe details, art-department presentation.",
    retro_cel: "Retro cel animation style: clean hand-drawn shapes, cel shading, limited painterly texture, classic animation-board feel. Preserve the exact source subject while translating only the rendering style.",
    retro_anime: "Retro anime style: anime-inspired facial design, clean linework, stylized shading, cinematic illustrated presentation. Preserve the exact source subject while translating only the rendering style.",
    comic_book: "Comic book style: bold shapes, inked detail, controlled shadows, graphic readability, production-art finish. Preserve the exact source subject while translating only the rendering style.",
    graphic_novel: "Graphic Novel: panel-ready linework, controlled ink treatment, dramatic shadows, refined print texture, cinematic graphic presentation.",
    graphic_noir: "Graphic noir style: dramatic contrast, noir-inspired shadows, strong silhouettes, restrained palette, graphic presentation. Preserve the exact source subject while translating only the rendering style.",
    anime_manga: "Anime / Manga: anime-inspired linework, stylized facial rendering, clean cel shading, cinematic illustrated presentation, character-board clarity.",
    cyberpunk_neon: "Cyberpunk neon style: futuristic wardrobe/material language, neon rim lighting, high-tech atmosphere, cinematic sci-fi color contrast. Preserve the exact source subject while translating only the rendering style.",
    cyberpunk: "Cyberpunk style: futuristic urban styling, techwear influence, moody lighting, high-tech world language. Preserve the exact source subject while translating only the rendering style.",
    no_specific_style: "No specific style override: follow the user's brief, world, wardrobe, and board presentation style without adding a strong preset look. Preserve the exact source subject while translating only the rendering style."
};

const renderedFamilyStyles = new Set<CharacterPitchSheetRenderStyle>([
    "biometric_realism",
    "cinematic_photoreal",
    "exact_studio",
    "photorealism",
    "dslr_capture"
]);

const illustratedFamilyStyles = new Set<CharacterPitchSheetRenderStyle>([
    "retro_cel",
    "retro_anime",
    "anime_manga",
    "comic_book",
    "graphic_novel",
    "graphic_noir",
    "editorial_illustration",
    "concept_art"
]);

const stylizedBiometricTranslationStyles = new Set<CharacterPitchSheetRenderStyle>([
    "stylized_realism",
    "animated_feature",
    "family_3d",
    "premium_animated_3d",
    "claymation",
    "editorial_illustration",
    "concept_art",
    "retro_cel",
    "retro_anime",
    "comic_book",
    "graphic_novel",
    "graphic_noir",
    "anime_manga",
    "cyberpunk_neon",
    "cyberpunk"
]);

const strictRenderedFamilyStyles = new Set<CharacterPitchSheetRenderStyle>([
    "dslr_capture",
    "photorealism",
    "exact_studio",
    "biometric_realism"
]);

const animated3dStyles = new Set<string>([
    "premium_animated_3d",
    "family_3d",
    "animated_feature",
    LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID
]);

const isCharacterRenderStyle = (value: string): value is CharacterPitchSheetRenderStyle =>
    value in CHARACTER_RENDER_STYLE_BLOCKS;

const normalizeCharacterRenderStyle = (value?: CharacterPitchSheetRenderStyle | string | null): CharacterPitchSheetRenderStyle => {
    const clean = (value || "").trim();
    if (clean === LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID) return "premium_animated_3d";
    if (isCharacterRenderStyle(clean)) return clean;
    return defaultCharacterPitchSheetInput.characterRenderStyle || "biometric_realism";
};

export const mapNanoCastStyleToPitchSheetRenderStyle = (
    nanoStyle?: string | null
): CharacterPitchSheetRenderStyle => {
    const clean = String(nanoStyle || "").toLowerCase();

    if (clean.includes("premium_animated") || clean.includes("family_3d") || clean.includes("animated")) {
        return "premium_animated_3d";
    }

    if (clean.includes("exact")) {
        return "exact_studio";
    }

    if (clean.includes("cg") || clean.includes("realism") || clean.includes("photo")) {
        return "cinematic_photoreal";
    }

    if (clean.includes("anime") || clean.includes("cel")) {
        return "retro_cel";
    }

    if (clean.includes("graphic") || clean.includes("noir") || clean.includes("comic")) {
        return "graphic_noir";
    }

    if (clean.includes("cyber")) {
        return "cyberpunk_neon";
    }

    return "premium_animated_3d";
};


const BOARD_PRESENTATION_STYLE_BLOCKS: Record<CharacterPitchSheetBoardPresentationStyle, string> = {
    premium_film_board: "Board presentation: premium film-development board with dominant hero portrait, asymmetrical hierarchy, turnarounds, head studies, material callouts, and selective labels.",
    clean_studio_sheet: "Board presentation: clean polished studio sheet with organized studies, readable views, and refined spacing.",
    art_department_board: "Board presentation: art-department board with costume construction notes, material callouts, and clear production decisions.",
    forensic_reference_board: "Board presentation: restrained premium reference board emphasizing identity continuity, clear angles, and repeatable costume details.",
    merchandising_sheet: "Board presentation: production-ready merchandising sheet with iconic silhouette, readable costume, accessory callouts, and footwear clarity."
};

const HEADSHOT_BACKGROUND_ISOLATION_RULE = `HEADSHOT / REFERENCE PORTRAIT BACKGROUND ISOLATION:
- Use uploaded portraits only as identity references for the subject's face, head shape, hairline, age, skin tone, and facial proportions.
- Do not copy or preserve any uploaded portrait background.
- Fully isolate the head/face identity from the source image and place every rendered head study on the clean neutral studio background used by this character sheet.
- No rooms, doors, walls, furniture, windows, home interiors, office backgrounds, source-photo lighting environments, cropped room details, or background objects may appear in any headshot or head-study panel.
- Preserve facial identity, head shape, hairline, expression neutrality, skin tone, and angle accuracy while replacing the source-photo environment with the sheet's intended neutral/studio treatment.

HEADSHOT BACKGROUND NEGATIVE EXCLUSIONS:
- Exclude source image background, bedroom, hallway, door frame, wall corner, window, furniture, home interior, office background, uneven source lighting, cropped room details, original photo environment.`;

const CONTROLLED_TEXT_AND_LABEL_CONTRACT = `CONTROLLED TEXT AND LABEL CONTRACT:
- Use clean, readable production-board text only.
- Do not invent fake technical labels, fake anatomy terms, fake metadata, pseudo-words, or corrupted text.
- Do not write internal debug phrases, prompt fragments, or nonsensical labels.
- Do not add handwritten signatures, artist signatures, approval signatures, stamps, signed-off marks, or decorative autograph marks.
- Text must be typed production-board labeling only.
- Do not use cursive, handwritten, autograph-like, or decorative script text.
- Do not add unlabeled decorative writing.
- Do not create fake signatures to make the board look finished.
- Only use labels that describe visible elements accurately.
- Keep labels short, direct, and tied to actual visible features.
- Prefer fewer, accurate labels over many labels.
- If a label would be small, crowded, or uncertain, omit it.
- Do not fill empty space with decorative text.

VISIBLE TEXT LEAKAGE BAN:
- Do not render internal instructions, hidden prompt rules, camera metadata, source-reference labels, debug notes, or process notes as visible board text.
- Do not render phrases such as "NO MIRRORING CHEAT", "ORIGINAL CAMERA", "50MM Standard Portrait", "source image", "reference image", "identity lock", "Image A", "Image 1", "biometric", "scan", or "generated character source".
- Do not render parenthetical instruction text like "(NO MIRRORING CHEAT)" anywhere on the board.
- Visible board text must be limited to clean production labels, character metadata, wardrobe labels, material labels, pose labels, and approved view labels.
- If an internal rule is needed, obey it silently. Do not write it on the board.

APPROVED HEAD STUDY LABELS:
- NEUTRAL FRONT HEAD
- 3/4 LEFT-FACING HEAD
- 3/4 RIGHT-FACING HEAD
- LEFT-FACING PROFILE HEAD
- RIGHT-FACING PROFILE HEAD

APPROVED BODY VIEW LABELS:
- FRONT VIEW
- 3/4 VIEW
- LEFT-FACING SIDE VIEW
- RIGHT-FACING SIDE VIEW
- BACK VIEW

Forbidden visible label text:
- LEFT PROFILE HEAD
- RIGHT PROFILE HEAD
when used ambiguously without "FACING"
- NO MIRRORING CHEAT
- ORIGINAL CAMERA
- 50MM Standard Portrait
- internal debug text
- source/reference/internal process labels

Approved label examples:
- FRONT VIEW
- 3/4 VIEW
- LEFT-FACING SIDE VIEW
- RIGHT-FACING SIDE VIEW
- BACK VIEW
- NEUTRAL FRONT HEAD
- 3/4 LEFT-FACING HEAD
- 3/4 RIGHT-FACING HEAD
- LEFT-FACING PROFILE HEAD
- RIGHT-FACING PROFILE HEAD
- EXPRESSION STUDY
- SUPPORTING POSE
- COSTUME LAYER
- MAIN COSTUME TEXTILE
- NECKLINE / COLLAR
- ARMHOLE / SHOULDER SEAM
- FOOTWEAR CONSTRUCTION
- MATERIAL CALLOUTS
- CHARACTER PALETTE
- FABRIC TEXTURE
- TURNAROUND VIEW

Forbidden text examples:
- Signed
- signature
- approved
- sign-off
- Global body axes
- no oui anatomy
- jowoul-turn anatomy
- internal debug label
- fake anatomy labels
- unreadable pseudo-technical text

The forbidden examples are negative examples only. Do not render them as visible board text anywhere in the image.

Important:
If the model cannot label something accurately, omit the label instead of inventing one.
- Do not create duplicate labels for the same panel.
- Do not label two panels with the same profile direction unless the board intentionally asks for repeated views.`;

const NO_SIGNATURE_RULE_CONTRACT = `NO SIGNATURE / ARTIST MARK CONTRACT:
- Do not add artist signatures, cursive signatures, handwritten names, approval marks, sign-off marks, stamps, watermarks, autograph marks, decorative initials, or fake artist labels anywhere on the sheet.
- Do not place signature-like marks inside head-study panels, portrait panels, detail panels, footer areas, or empty corners.
- Do not add handwritten marks next to the face, neck, shoulders, or panel edges.
- This is a clean production reference sheet, not a signed illustration or collector print.
- The only allowed text is clean readable production-board labeling from the approved label vocabulary.
- If a panel has empty space, leave it clean. Do not fill it with decorative writing.`;

const HEAD_STUDY_PANEL_CLEANNESS = `HEAD STUDY PANEL CLEANNESS:
- Head-study panels must contain only the actor head/face view and clean panel label text.
- Do not add signatures, handwritten text, approval marks, decorative initials, sketch marks, stamps, or fake artist notes inside head-study panels.
- Keep the area around the head clean and production-reference focused.`;

const DETAIL_INSET_CLEANNESS = `DETAIL / INSET CLEANNESS:
- Detail panels must not include signatures, autographs, approval marks, or decorative handwriting.
- Detail panels should contain only the isolated detail and accurate label text.`;

const PITCH_SHEET_PRECISION_REFINEMENT_CONTRACT = `WARDROBE SPEC FIDELITY LOCK:
- All wardrobe, clothing, material, footwear, and accessory callout panels must be derived from the same approved outfit worn by the character in the main rendered views.
- If a clothing detail panel appears, it must match the actual garment or item shown on the character.
- This applies to: footwear construction, fabric texture, material texture, collar / neckline / cuff / sleeve details, logo placement, ornament detail, accessory detail, color blocking, garment construction callouts.
- Do not invent a different shoe, different fabric, different accessory, or different construction detail than the one shown on the character.
- Do not create generic spec panels that do not match the visible outfit.
- If a footwear detail panel is shown, it must reflect the actual footwear worn in the body views.
- If a fabric/material callout is shown, it must reflect the actual garment materials visible in the character outfit.
- If an accessory/ornament detail is shown, it must come from a visible accessory actually present on the character.

DETAIL PANEL DERIVATION RULE:
- Every spec/detail panel must be a zoomed-in, extracted, or diagrammatic breakdown of something visibly present in the main character design.
- Detail panels must not behave like independent design inventions.
- Do not generate "spec board filler."
- Do not add extra labeled panels just to fill space.
- Do not invent mismatched footwear details.
- Do not invent mismatched garment/material details.

PANEL TITLE ACCURACY RULE:
- Every panel title must match the content actually shown in that panel.
- Do not use generic or templated titles if the referenced content does not support them.
- Do not label a panel as footwear construction, material texture, supporting pose, expression study, ornament detail, or color blocking unless that exact type of content is visibly present.

CONDITIONAL PANEL TITLE RULE:
- If a panel type is not meaningfully present, omit the title and omit the panel rather than forcing a placeholder heading.
- Examples:
  * If there is no distinct supporting pose beyond the standard front/3/4/profile/turnaround presentation, do not include a "Supporting Pose" panel or title.
  * If there is no separate expression study, do not include an "Expression Study" title.
  * If there is no meaningful footwear close-up, do not include a "Footwear Construction" panel.
  * If there is no distinct material zoom panel, do not include a "Material Texture" panel.

POSE TITLE PRECISION:
- Use "Supporting Pose" only when there is a clearly distinct additional pose that is separate from the standard front/3/4/profile/turnaround presentation and communicates character personality or action.
- If no distinct supporting pose is present, omit the supporting pose panel and title completely.

HEAD VIEW ANGLE ACCURACY LOCK:
- Every head-study panel must match its label exactly.
- Required head-view definitions:
  * Neutral Front Head: face points straight toward camera, both eyes visible evenly, nose centered, ears balanced or equally hidden, no left/right turn.
  * 3/4 Left-Facing Head: head turned approximately 45 degrees toward the viewer's left, both eyes still partly visible, not a full side profile.
  * 3/4 Right-Facing Head: head turned approximately 45 degrees toward the viewer's right, both eyes still partly visible, not a full side profile.
  * Left-Facing Profile Head: true side profile facing viewer's left, one eye visible, nose and lips in clear side silhouette, ear visible, not a 3/4 view.
  * Right-Facing Profile Head: true side profile facing viewer's right, one eye visible, nose and lips in clear side silhouette, ear visible, not a 3/4 view.
- Do not mislabel head angles.
- Do not label a 3/4 view as a profile.
- Do not label a profile view as a 3/4 view.
- Do not label an upward-looking head as a neutral front head.
- Do not duplicate the same head angle under different labels.
- Do not use a near-front view for side profile labels.
- Do not use a side profile view for neutral front labels.

HEAD STUDY BIOMETRIC MATCHING RULE:
- When biometric references are present:
  * front head views should follow the center/front biometric structure.
  * left-facing and left-profile head views should follow the left biometric structure.
  * right-facing and right-profile head views should follow the right biometric structure.
  * upward/downward references should inform chin, jaw, nostril, forehead, crown, and head-volume structure only.
- Use biometric references for geometry and likeness, not rendering style.
- All head studies must remain in the selected Character Render Style.

TITLE TO CONTENT CONSISTENCY:
- Head-study titles must match the actual head angle shown.
- Profile labels must match the actual facing direction shown.
- Body-view titles must match the actual camera/body angle shown.
- Detail panel titles must match the actual item shown.
- Do not use a title that overstates or misidentifies the content.`;

const HEAD_STUDY_VS_BODY_TURNAROUND_SEPARATION = `HEAD STUDY VS BODY TURNAROUND SEPARATION:
- Head-study panels are close-up face/head references.
- Body turnaround panels are full-body or torso references.
- Do not use body turnaround labels to define head-study angles.
- Do not allow a body side-view direction error to infect head-study labels.
- Each head-study panel must be independently correct.`;

const BODY_ORIENTATION_COHERENCE_CONTRACT = `BODY ORIENTATION COHERENCE LOCK:
Every body view must have all body parts aligned to the same camera/view direction.

This applies to:
- head
- neck
- shoulders
- chest
- torso
- waist
- hips
- arms
- elbows
- hands
- thighs
- knees
- lower legs
- feet
- shoes

Do not mix body-part directions within the same figure.
Do not place a side-facing head on a front-facing torso.
Do not place a front-facing torso on side-facing legs.
Do not place front-facing feet on a profile body.
Do not place hands or arms in a different orientation than the torso.
Do not twist the pelvis, knees, or feet away from the labeled body angle unless the pose explicitly requires a natural small turn.

VIEW-SPECIFIC BODY RULES:
- Front View (0°): both shoulders visible evenly, chest faces camera, hips face camera, both feet face mostly forward.
- 3/4 View (45°): head, shoulders, torso, hips, knees, and feet all share the same three-quarter turn.
- Left-Facing Side View (90°): the entire body must read as a true side profile facing viewer’s left. Only one side of the torso should dominate. Feet and shoes must point left. Arms should hang naturally along the side plane.
- Right-Facing Side View (90°): the entire body must read as a true side profile facing viewer’s right. Feet and shoes must point right. Arms should hang naturally along the side plane.
- Back View (180°): head, shoulders, torso, hips, legs, and feet must all face away from the camera.

TURNAROUND ANATOMY CONSISTENCY:
The turnaround lineup must look like the same body rotated around a vertical axis, not separate poses with mismatched anatomy.
Each view should preserve the same body proportions, clothing fit, and silhouette while rotating cleanly.

SIDE-VIEW LIMB ALIGNMENT:
For side views, the arm, hand, thigh, knee, lower leg, foot, and shoe must all align with the side-facing direction.
Do not show a side-facing torso with a front-facing hand, front-facing foot, or twisted leg.
The visible shoe should be a side profile of the shoe, not a front or 3/4 shoe.

TITLE TO BODY VIEW CONSISTENCY:
Only label a body panel as LEFT-FACING SIDE VIEW if the entire body is truly side-facing left.
Only label a body panel as RIGHT-FACING SIDE VIEW if the entire body is truly side-facing right.
Only label a body panel as FRONT VIEW if the entire body faces forward.
Only label a body panel as BACK VIEW if the entire body faces away.

If the body angle is ambiguous or mixed, correct the body orientation rather than mislabeling it.`;

const STRICT_BODY_VIEW_DIRECTION_MAP = `STRICT BODY VIEW DIRECTION MAP:
- FRONT VIEW (0°): body faces viewer directly.
- 3/4 VIEW (45°): body turned approximately 45°, not side profile.
- LEFT PROFILE / SIDE PROFILE (90°): true side profile with head, chest, pelvis, knees, and feet aligned in the same side-facing direction.
- BACK VIEW (180°): rear view only, showing back of head/body/clothing.
- Do not duplicate side views and label them differently.
- Do not show front-facing feet on a side-facing body.
- Do not show a side-facing head on a front-facing torso unless explicitly posed.
- Direction labels must match the visible anatomy.`;

const TURNAROUND_ANATOMY_INTEGRITY_CONTRACT = `TURNAROUND ANATOMY INTEGRITY:
- All full-body and torso views must depict the same anatomically coherent actor.
- Preserve correct head-to-neck-to-torso alignment.
- Preserve correct shoulder, elbow, wrist, hip, knee, ankle, and foot placement.
- Do not twist the torso one direction while legs face the opposite direction unless the panel is explicitly a dynamic pose.
- Do not reverse left/right limbs.
- Do not swap front/back body anatomy.
- Do not create extra limbs, missing limbs, fused fingers, broken shoulders, backward knees, backward feet, or impossible joints.
- In side/profile views, body axis, head direction, nose direction, chest direction, pelvis, knees, and feet must agree.
- Back view must show rear anatomy and rear clothing only, not a front-facing torso or front-facing feet.
- Turnaround panels must be neutral and readable unless the panel is specifically labeled as a supporting pose.
- Neutral turnaround views must remain clean production references.
- Do not use dynamic performance poses in front, 3/4, side, or back turnaround panels unless explicitly requested for the whole sheet.
- Keep performance/action content separate from construction/detail panels.`;

const PERFORMANCE_DIRECTION_SCOPE_CONTRACT = `PERFORMANCE DIRECTION SCOPE FOR PITCH SHEET:
- Apply Performance Direction primarily to the supporting pose / action inset / expression study panel.
- Keep neutral turnaround views anatomically neutral, readable, and production-safe.
- Do not apply dynamic gym flexing poses to every front/side/back turnaround unless explicitly requested.
- The turnaround row should remain useful for costume, body, and silhouette reference.
- Performance Direction may affect the supporting pose/action inset only.
- Performance Direction must not affect footwear detail panels, material detail panels, palette panels, construction callouts, or neutral turnaround views.
- If the user asks for flexing, gym poses, action poses, or expressive body language, place that only in the supporting pose panel or expression/pose study area.
- Performance Direction must not alter the neutral head-study direction map.
- It must not alter neutral turnaround direction labels.`;

const CALLOUT_ACCURACY_CONTRACT = `CALLOUT ACCURACY CONTRACT:
- Callout arrows must point to the exact visible feature being labeled.
- Do not label invisible features.
- Do not point to the wrong body part, wrong costume part, or empty space.
- Do not invent anatomy callouts.
- If the final wardrobe has no collar, do not label a collar.
- If the final wardrobe is a tank top, prefer labels such as neckline, armhole, shoulder seam, fabric stretch, garment fit, and material texture.
- If uncertain, use fewer callouts rather than inaccurate callouts.`;

const DETAIL_PANEL_ISOLATION_CONTRACT = `DETAIL PANEL ISOLATION CONTRACT:
- Detail panels must show isolated, readable construction references only.
- Do not mix actor pose panels with footwear, material, palette, or construction detail panels.
- Do not place a full actor body, flexing pose, face portrait, or action pose inside footwear detail panels.
- Do not attach a giant shoe, sole, prop, material swatch, or accessory to an actor's body inside a detail panel.
- Footwear detail panels should show footwear only: shoe side view, sole tread, heel, toe box, laces, material, stitching, and construction.
- Material detail panels should show material/fabric texture only, not body parts or full actor poses.
- Palette panels should show color/material swatches only.
- Supporting pose panels are the only panels that may show the actor performing the requested action.
- Keep every inset panel visually independent and accurately labeled.`;

const FOOTWEAR_DETAIL_PANEL_RULE = `FOOTWEAR DETAIL PANEL RULE:
- A Footwear Detail or Footwear Construction panel must show the shoe/boot/sneaker as an isolated product detail.
- Show the footwear at normal product-reference scale.
- Do not show the actor holding the shoe.
- Do not show a foot or leg thrust toward camera unless explicitly requested.
- Do not merge the actor's body with the shoe.
- Do not combine gym flexing, action poses, or portrait content with footwear detail.
- If a sole view is included, it must be a clean isolated sole/tread reference, not attached to a distorted body.`;

const PANEL_LABEL_ACCURACY = `PANEL LABEL ACCURACY:
- A panel labeled "FOOTWEAR DETAIL" must contain footwear detail only.
- A panel labeled "FABRIC TEXTURE" must contain fabric/material texture only.
- A panel labeled "PERFORMANCE NOTE" or "SUPPORTING POSE" may contain the actor performing the user-requested pose.
- Do not label a mixed or morphed scene as a construction detail.
- If a clean detail cannot be shown, omit the inset rather than merging unrelated subjects.`;

const AVOID_OVERPOPULATING_SHEET_CONTRACT = `AVOID OVERPOPULATING THE SHEET:
- Prefer fewer clean detail panels over crowded or confusing insets.
- Do not fill empty layout space with extra invented mini-scenes.
- Every inset must have one clear purpose.`;

export function buildCharacterPitchSheetPrompt(rawInput: CharacterPitchSheetInput): string {
    const input = sanitizeVisibleBoardLanguage(rawInput);
    console.warn('[PITCH_PROMPT_CONSTRUCTION]', {
      identitySource: input.identitySource,
      characterStyleReferenceUrl: input.characterStyleReferenceUrl,
      sourcePanelMode: input.sourcePanelMode,
      identityLockExists: Boolean(input.identityLock),
      identityLockImagesRange: input.identityLock?.identityRangeText,
      generatedSourceImageIndex: input.identityLock?.generatedSourceImageIndex,
      generatedSourceRole: input.identityLock?.generatedSourceRole
    });

    console.debug('[PitchSheet User Directives]', {
      characterName: input.characterName,
      alias: input.aliasCodename,
      visualAge: input.visualAge,
      height: input.height,
      build: input.build,
      designLanguage: input.designLanguage,
      worldEra: input.worldEra,
      lightingMood: input.lightingMood,
      sheetStyle: input.sheetStyle,
      corePersonality: input.corePersonality,
      internalConflict: input.internalConflict,
      wardrobeDirection: input.wardrobeDirection,
      propsSignatureItems: input.propsSignatureItems,
      environment: input.environment,
    });

    console.debug('[PitchSheet Style Purity]', {
      characterRenderStyle: input.characterRenderStyle,
      sheetStyle: input.sheetStyle,
      identitySource: input.identitySource,
    });

    // @ts-ignore
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
        console.info("[PitchSheetBrief] Detail panel isolation active", {
            detailPanelIsolationActive: true,
            footwearDetailIsolationActive: true,
            performanceScopedAwayFromDetails: true
        });
        console.info("[PitchSheetBrief] No-signature audit", {
            noSignatureContractActive: true,
            headStudyCleannessActive: true,
            controlledTextContractActive: true
        });
        console.info("[PitchSheetBrief] View direction contract active", {
            strictHeadViewDirectionMap: true,
            headOrientationSanityCheck: true,
            strictBodyViewDirectionMap: true
        });
        console.info("[PitchSheetBrief] Direction/inset coherence active", {
            pageDirectionHeadViewLock: true,
            supportingPoseInsetCoherence: true,
            turnaroundPageDirectionRule: true
        });
        console.info("[PitchSheetBrief] Direction + garment segmentation rules active", {
            headDirectionContract: true,
            turnaroundOrientationLock: true,
            garmentAnatomySeparationLock: true,
            detailPanelSafetyRule: true
        });
        console.info("[PitchSheetBrief] Profile/text leakage safeguards active", {
            pageFacingProfileLabels: true,
            visibleTextLeakageBan: true,
            rightProfileOptionalIfUnclear: true
        });
        console.info("[PitchSheetBrief] Hair/skull safety active", {
            hairSourceAuthorityActive: true,
            noSkullMedicalInsertRuleActive: true,
            skullTriggerTermsRemoved: true
        });
        console.info("[PitchSheetBrief] Text/anatomy safety audit", {
            controlledLabelsActive: true,
            noSignatureRuleActive: true,
            anatomyIntegrityActive: true,
            calloutAccuracyActive: true,
            performanceDirectionScopedToSupportingPose: true
        });
    }

    const visibleInput = input;
    const characterName = valueOr(visibleInput.characterName, visibleInput.aliasCodename, "Unnamed lead character");
    const alias = valueOr(visibleInput.aliasCodename, "No public codename");
    const visualAge = inferVisualAge(visibleInput);
    const bodyMetadataForBoard = buildBodyMetadataForBoard(visibleInput);
    const bodyGuideForPrompt = buildBodyGuideForPrompt(visibleInput);
    const height = valueOr(formatHeightLabel(visibleInput.heightIn), visibleInput.height, "height inferred from role and proportions");
    const isBuildEmpty = !visibleInput.build || visibleInput.build.trim() === "";
    const buildMetadata = isBuildEmpty 
        ? "inferred from source image" 
        : valueOr(bodyMetadataForBoard, visibleInput.build, inferBuild(visibleInput));
    const buildPromptGuide = isBuildEmpty 
        ? "no explicit build directive; infer body only from primary approved character source (Image A)" 
        : valueOr(bodyGuideForPrompt, inferBuild(visibleInput));
    const designLanguage = valueOr(visibleInput.designLanguage, defaultCharacterPitchSheetInput.designLanguage);
    const worldEra = valueOr(visibleInput.worldEra, "original cinematic world inferred from the brief");
    const corePersonality = valueOr(visibleInput.corePersonality, "layered, specific, screen-readable personality");
    const internalConflict = valueOr(visibleInput.internalConflict, "private inner contradiction visible through posture and expression");
    const wardrobe = inferWardrobe(visibleInput);
    const props = inferProps(visibleInput);
    const hasExplicitProps = !!normalize(visibleInput.propsSignatureItems);
    const propsDisplay = hasExplicitProps ? props : "No distinctive props specified.";
    const propOrFootwearInsetText = hasExplicitProps ? "selected prop and footwear insets" : "footwear and material-detail insets";
    const environment = inferEnvironment(visibleInput);
    const lightingMood = valueOr(visibleInput.lightingMood, defaultCharacterPitchSheetInput.lightingMood);
    const sheetStyle = valueOr(visibleInput.sheetStyle, defaultCharacterPitchSheetInput.sheetStyle);
    const additionalNotes = valueOr(visibleInput.additionalNotes, "No extra notes supplied; infer tasteful cinematic details from the brief.");
    const rawFaceDesign = inferFaceDesign(visibleInput);
    const rawPerformanceDirection = inferPerformance(visibleInput);
    const rawMaterialNotes = inferMaterialNotes(visibleInput);
    const rawProductionNotes = inferProductionNotes(visibleInput);
    const sourcePanelMode = visibleInput.sourcePanelMode || defaultCharacterPitchSheetInput.sourcePanelMode || "costume_matched";
    const characterRenderStyle = normalizeCharacterRenderStyle(visibleInput.characterRenderStyle);
    const characterRenderFamily = resolveRenderFamily(characterRenderStyle);
    const supportingPosePanelLabel = "supporting pose render";
    const performanceStudyRule = `- Include at most one compact ${supportingPosePanelLabel} that preserves the same face, build, hairstyle, costume, props, body proportions, and emotional presence.
- The ${supportingPosePanelLabel} must be a single coherent figure, not a duplicated crop and not a collage of body fragments.
- Do not create a second performance inset, duplicate arm crop, floating limb crop, disconnected torso crop, isolated flexed bicep crop, or partial anatomy fragment.
- If the ${supportingPosePanelLabel} is shown, it must be a readable complete figure or a coherent half-body figure with anatomically intact shoulders, arms, torso connection, and pose silhouette.
- If the ${supportingPosePanelLabel} cannot be rendered cleanly in the exact same style family as the rest of the sheet, omit it instead of rendering a cartoon, flat illustration, vector, doodle, off-style miniature, or cropped anatomy fragment.
- Do not invent combat/action behavior unless explicitly requested.
- Use only one visible performance note block. Do not duplicate the same performance note text in multiple places.`;
    const boardPresentationStyle = visibleInput.boardPresentationStyle || defaultCharacterPitchSheetInput.boardPresentationStyle || "premium_film_board";
    const characterRenderStyleLabel = CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle].split(":")[0] || characterRenderStyle;
    const debugVisibleLabels = visibleInput.debugVisibleLabels === true;
    const strictBodySpecs = visibleInput.physiquePriority === "strict_body_specs";
    const pitchSheetCallouts = buildPitchSheetCallouts(visibleInput);
    const calloutPlan = formatCalloutPlan(pitchSheetCallouts);
    const visibleVocabularyRule = buildVisibleVocabularyRule(visibleInput, pitchSheetCallouts);
    const hasReferenceDrivenIdentity = Boolean(normalize(input.referenceImageUrl)) || isReferenceDrivenIdentitySource(input);
    const hasGeneratedCharacterSource = input.identitySource === "biometric_plus_character" && Boolean(normalize(input.characterStyleReferenceUrl));
    const hasPortraitReferenceSource = input.identitySource === "portrait_reference" && Boolean(normalize(input.referenceImageUrl));
    const hasActorSource = hasActorSourceForPitchSheet(input);

    const hasExplicitWardrobeDirection = Boolean(normalize(visibleInput.wardrobeDirection));

    const wardrobeAuthorityMode = hasExplicitWardrobeDirection
        ? "user_wardrobe_override"
        : hasGeneratedCharacterSource || hasPortraitReferenceSource
            ? "source_wardrobe"
            : "text_defined_wardrobe";

    const wardrobeAuthorityInstruction = hasExplicitWardrobeDirection
        ? `
WARDROBE AUTHORITY OVERRIDE:
- The user supplied Wardrobe Direction is the wardrobe/costume authority for this pitch sheet.
- Apply the user Wardrobe Direction consistently across hero portrait, full-body turnarounds, head studies, callouts, material panels, and supporting pose panels.
- Replace any default NanoCast black polo, collared shirt, source-photo shirt, or source-photo collar if it conflicts with the user Wardrobe Direction.
- Do not keep the collared shirt/polo merely because it appears in Image A.
- Image A still controls actor body presentation, proportions, visual style, pose attitude, and approved character feel.
- Biometric references still control face/head identity, hair, hairline, facial hair, grooming, skin tone, head shape, scalp outline, and age impression.
- Wardrobe changes must not change actor identity or face/head likeness.
- User Wardrobe Direction: "${wardrobe}"

CALLOUT WARDROBE OVERRIDE:
- If Wardrobe Direction replaces a collared shirt with non-collared clothing, do not label or point to a shirt collar.
- Callouts must match the final wardrobe, not Image A's original clothing.
`
        : `
WARDROBE SOURCE LOCK:
- No explicit Wardrobe Direction was supplied.
- Preserve the wardrobe/costume visible in the approved character source, including neckline, collar, shoulders, upper chest, outfit layers, materials, colors, footwear, accessories, and costume silhouette.
`;

    const faceDesign = wrapFaceDetailsForPrompt(rawFaceDesign, hasActorSource);
    const performanceDirection = wrapPerformanceDirectionForPrompt(rawPerformanceDirection, hasActorSource);
    const materialNotes = wrapMaterialCostumeNotesForPrompt(rawMaterialNotes, hasActorSource);
    const productionNotes = wrapProductionNotesForPrompt(rawProductionNotes, hasActorSource);

    const hiddenActorSourceIdentityLock = buildHiddenActorSourceIdentityLock(visibleInput, {
        hasGeneratedCharacterSource,
        hasPortraitReferenceSource,
        characterName,
        supportingPosePanelLabel
    });

    // @ts-ignore
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
        console.info("[PitchSheetBrief] Actor identity lock audit", {
            identitySource: input.identitySource,
            hasActorSource,
            hasGeneratedCharacterSource,
            hasPortraitReferenceSource,
            injectedStrictActorLikenessLock: Boolean(hiddenActorSourceIdentityLock.trim()),
            performanceDirectionScoped: Boolean(performanceDirection.trim()),
            materialCostumeScoped: Boolean(materialNotes.trim()),
            faceDetailsScoped: Boolean(faceDesign.trim()),
            productionNotesScoped: Boolean(productionNotes.trim())
        });
        console.info("[PitchSheetBrief] Wardrobe authority audit", {
            identitySource: input.identitySource,
            hasGeneratedCharacterSource,
            hasPortraitReferenceSource,
            hasExplicitWardrobeDirection,
            wardrobeAuthorityMode,
            wardrobe
        });
    }

    const needsSurfaceMarkContract = isBiometricIdentitySource(input) || input.identitySource === "portrait_reference";
    const surfaceMarkFidelity = needsSurfaceMarkContract ? `\n${buildSurfaceMarkFidelityContract()}\n` : "";

    const groomingFidelityRule = `GROOMING FIDELITY CONTRACT:
- STRICT ADHERENCE TO REF/IMAGE A GROOMING STATE: Preserve the exact facial hair state shown in the reference scans and approved Image A.
- CLEAN-SHAVEN CONTINUITY: If the reference subject/Image A is clean-shaven, there must be ABSOLUTELY NO mustache, no upper lip stubble, no beard, no sideburn stubble, no shadow, and no stubble of any kind on any of the panels.
- NO INVENTED FACIAL HAIR: Do not draw any invented beard, mustache, stubble, or hair if not clearly visible and present in the biometric scans/Image A. Keep the skin completely clean and clean-shaven if the source is clean-shaven.`;

    const groomingFidelity = hasReferenceDrivenIdentity ? `\n${groomingFidelityRule}\n` : "";
    const identityContract = isBiometricIdentitySource(input)
        ? buildAuthoritativeIdentityContract({
            sourceDescription: "the original multi-view biometric source image set",
            identityRangeText: hasGeneratedCharacterSource
                ? "Images B-F / the supplied center/front, left, right, up, and down identity anchors"
                : "the supplied center/front, left, right, up, and down identity anchors"
        })
        : hasReferenceDrivenIdentity
            ? buildAuthoritativeIdentityContract({
                sourceDescription: "the uploaded portrait identity reference",
            })
            : buildAuthoritativeIdentityContract({
                sourceDescription: "the character identity defined by the current text brief"
            });
    const biometricIdentityLockContract = isBiometricIdentitySource(input) && input.identityLock
        ? buildBiometricIdentityLockContract(input.identityLock)
        : "";
    const productionActorPromptContract = input.productionProfile
        ? `\n${buildProductionActorPromptContract(input.productionProfile)}\n`
        : "";
    const strictBiometricContract = isBiometricIdentitySource(input)
        ? buildStrictBiometricIdentityContract({
            identityRangeText: hasGeneratedCharacterSource
                ? "Images B-F / the supplied center/front, left, right, up, and down identity anchors"
                : "the supplied center/front, left, right, up, and down identity anchors",
            identityStrength: input.identityStrength ?? 100,
            selectedStyleLabel: characterRenderStyleLabel,
            mode: "biometric",
            faceDominant: true
        })
        : "";
    const styleIdentityEnforcementContract = isBiometricIdentitySource(input)
        ? buildNanoCastStyleIdentityEnforcementContract(characterRenderStyle, {
            selectedStyleLabel: characterRenderStyleLabel,
            identityRangeText: hasGeneratedCharacterSource
                ? "Images B-F / the supplied center/front, left, right, up, and down identity anchors"
                : "the supplied center/front, left, right, up, and down identity anchors",
            requestedIdentityStrength: input.identityStrength ?? 100,
            usesBiometricIdentity: true,
            generatedCharacterSourceIndex: hasGeneratedCharacterSource ? 1 : null,
            bodyGuidance: buildPromptGuide,
            appliesTo: `hero portrait, head studies, turnaround views, ${supportingPosePanelLabel}, and expression study`
        })
        : "";
    const identityRule = hasReferenceDrivenIdentity
        ? `Identity consistency: use supplied references as identity guidance, and keep the same subject across the hero portrait, head studies, turnaround figures, ${supportingPosePanelLabel}, and expression study.`
        : `Identity consistency: keep the same invented character identity across the hero portrait, head studies, turnaround figures, ${supportingPosePanelLabel}, and expression study.`;
    const sourcePanelRule = hasReferenceDrivenIdentity && sourcePanelMode === "costume_matched"
        ? "Source panel mode: Costume Matched. Raw reference photos are hidden identity authority only; visible head studies must be costume/world matched with no raw technical labels."
        : hasReferenceDrivenIdentity && sourcePanelMode === "raw_source"
            ? debugVisibleLabels
                ? "Source panel mode: Raw Source. Raw references may appear as subordinate reference inserts; debug labels are permitted only because debugVisibleLabels is true."
                : "Source panel mode: Raw Source. Raw references may appear only as subordinate inserts with clean labels such as Actor Reference, Front Reference, Profile Reference, Side Reference, or Back Reference; rendered character panels still use the character costume and world."
            : hasReferenceDrivenIdentity && sourcePanelMode === "hidden"
                ? "Source panel mode: Hidden. Do not show source-photo panels; use references only to guide identity."
                : "";
    const approvedPortraitDesignLock = hasPortraitReferenceSource
        ? `APPROVED PORTRAIT DESIGN LOCK:
- [IMAGE 1] / Image A is the approved character portrait generated in Portrait Studio.
- The approved character portrait defines the exact visual design, face likeness, hair style, clothing, render style, lighting, and look to convert into a pitch sheet.
- Build the pitch sheet from this same approved character portrait, not from scratch.
- Preserve [IMAGE 1]'s facial features, facial structure, skin tone, eye shape/spacing, brow, nose, mouth, jawline, hair, and overall look exactly.
- Keep the rendering style, lighting mood, color palette, and character details identical to [IMAGE 1] across all panels.
- Do not create a new character design or recast the face.
- Do not reinterpret or redesign the character away from the approved portrait design.`
        : "";
    const generatedCharacterSourceRule = hasGeneratedCharacterSource
        ? `GENERATED CHARACTER SOURCE LOCK:
- [IMAGE 1] / Image A is the generated character source image and the current approved character render.
- The generated character source image is the primary visual design to convert into a pitch sheet.
- Build the pitch sheet from this same generated character, not from scratch.
- ${hasExplicitWardrobeDirection
    ? "Preserve Image A's body, silhouette, proportions, render style, pose attitude, grooming read, and overall character design. Because the user supplied Wardrobe Direction, Image A's clothing/outfit is not the final wardrobe authority where it conflicts with the user wardrobe request."
    : "Preserve Image A's body, outfit, silhouette, costume package, material read, proportions, render style, footwear, accessories, pose attitude, grooming read, and overall character design."
}
- Use Images B-F / the biometric scan images only to preserve identity accuracy: face, head shape, scalp outline, skin tone, age impression, hair state, facial hair, visible marks, and facial proportions.
- Do not create a new character design.
- Do not reinterpret the body, face, age, outfit, style category, or proportions away from the generated character source.
- The pitch sheet should present this same generated character consistently across hero portrait, head studies, turnaround views, ${supportingPosePanelLabel}, expression study, and material/wardrobe detail panels.
- If Image A and the biometric scans appear to conflict, preserve Image A's costume/body/design while using the biometric scans to correct facial identity only.
- Do not ignore the generated character source, do not generate a generic character board from the biometric scan alone, and do not output the biometric scan collage.`
        : "";
    const styleReferenceRule = hasGeneratedCharacterSource
        ? "Generated character source: Image A is not a mood board, layout guide, or optional style hint. It is the approved source character that this pitch sheet is about."
        : hasPortraitReferenceSource
            ? "Approved Portrait Source: Image A is the approved character portrait. It defines the exact visual design, face likeness, hair style, clothing, render style, lighting, and look. It is the absolute authority for the style and look of this character sheet."
            : input.characterStyleReferenceUrl
                ? "Style reference: borrow approved wardrobe, lighting, and character-design language from the supplied character image while keeping the same subject identity."
                : "";
    const structuredBodySourceOfTruth = [
        `character name: ${characterName}`,
        `codename: ${alias}`,
        `visual age: ${visualAge}`,
        `height: ${height}`,
        `build/body metadata: ${buildMetadata}`
    ].join("; ");
    const bodyAuthorityRule = hasGeneratedCharacterSource
        ? strictBodySpecs
            ? "Image A remains identity and costume authority. Apply structured body specs only as a controlled proportional adjustment; do not recast the actor, change the face, change the head, change the age impression, or replace the body with a generic model."
            : "Image A is the body, outfit, silhouette, costume, stance, and proportion authority. Structured height/build/weight values are metadata and subtle fit guidance only; they must not override Image A's visible person, body identity, face, head, proportions, or costume silhouette."
        : hasReferenceDrivenIdentity
            ? strictBodySpecs
                ? "Biometric references remain face/head/identity authority. Apply structured body specs only as a controlled proportional guide; do not recast the actor or infer a different person from the weight."
                : "Biometric references are identity authority. Structured height/build/weight values are metadata and subtle body-fit guidance only; they must not override biometric identity, face, head, age impression, or create a different person."
            : "Keep one consistent invented character body across all full-body views. Use structured build values as design guidance without changing identity between panels.";
    const strictBodySpecsRule = strictBodySpecs
        ? "- Because strict body specs is enabled, apply body specs more directly, but strict_body_specs still cannot change identity; preserve the same actor identity, same face, same head, same age impression, and same character source."
        : "";
    const pitchSheetPoseCoherence = buildTurnaroundPoseCoherenceContract([
        { label: "front full-body panel", viewAngle: "front", degrees: 0, bodyFacing: "straight front-facing unified axis" },
        { label: "three-quarter full-body panel", viewAngle: "front_3_4_left", degrees: 45, bodyFacing: "one consistent three-quarter axis" },
        { label: "side/profile full-body panel", viewAngle: "left_profile", degrees: 90, bodyFacing: "true side profile axis" },
        { label: "back full-body panel", viewAngle: "back", degrees: 180, bodyFacing: "straight rear-facing unified axis" },
        { label: supportingPosePanelLabel, viewAngle: "custom", bodyFacing: "single deliberate supporting-pose axis; no accidental upper/lower split" }
    ]);
    const headshotWardrobeContinuity = buildHeadshotWardrobeContinuityContract({
        identitySource: hasReferenceDrivenIdentity
            ? "uploaded portrait/biometric identity references for face, head, skin tone, hairstyle, facial hair, and age impression only"
            : "the text-defined character identity",
        wardrobeAuthority: hasExplicitWardrobeDirection
            ? `the explicit user Wardrobe Direction: ${wardrobe}. This user wardrobe request overrides Image A clothing if there is a conflict, including any default black polo, collared shirt, or source-photo collar. Preserve actor identity from the actor/biometric source.`
            : hasGeneratedCharacterSource
                ? `Image A / the generated character source image, especially the neckline, collar, shoulders, upper chest, outfit layers, materials, colors, footwear, accessories, and costume silhouette. Supplemental text wardrobe notes: ${wardrobe}`
                : hasPortraitReferenceSource
                    ? `Image A / the approved character portrait, especially the neckline, collar, shoulders, upper chest, outfit layers, materials, colors, footwear, accessories, and costume silhouette. Supplemental text wardrobe notes: ${wardrobe}`
                    : `the final character wardrobe/costume defined by this sheet: ${wardrobe}`,
        finalLookReference: hasGeneratedCharacterSource || hasPortraitReferenceSource
            ? "Image A as the approved character source, then the hero portrait, full-body turnarounds, wardrobe breakdown, and controlled callout plan in this same board"
            : "the hero portrait, full-body turnarounds, wardrobe breakdown, and controlled callout plan in this same board",
        appliesTo: "head studies, reference portraits, profile heads, facial-angle panels, and the expressive close-up",
        strictness: boardPresentationStyle === "forensic_reference_board" ? "forensic_board" : "reference_sheet"
    });
    const styleCategoryContract = buildStyleCategoryContract(characterRenderStyle, {
        selectedStyleId: characterRenderStyle,
        selectedStyleLabel: CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle],
        sourceImagePolicy: hasGeneratedCharacterSource || hasPortraitReferenceSource
            ? "Image A controls the approved character design, costume, body, silhouette, proportions, and style translation. Biometric references control biometric identity only; source-photo realism must not leak into stylized render categories."
            : "Source images control identity likeness only; source-photo realism must not leak into stylized render categories.",
        boardPresentationPolicy: "Board Presentation Style controls layout, hierarchy, typography, labels, and production-board composition only.",
        lightingPolicy: "Lighting mood must be interpreted inside the selected Character Render Style and must not convert the character category.",
        appliesTo: `hero portrait, full-body turnarounds, head studies, ${supportingPosePanelLabel}, expression study, prop/detail insets where the character appears, and board previews`
    });
    const sheetStyleLockContract = buildSheetStyleLockContract(characterRenderStyle, {
        source: characterRenderStyle !== "no_specific_style"
            ? "user_selected"
            : hasReferenceDrivenIdentity
                ? "reference_image"
                : "default",
        selectedStyleLabel: characterRenderStyleLabel,
        referenceStyleDescription: hasGeneratedCharacterSource
            ? "Image A supplies the current approved character render style; preserve it across the sheet."
            : undefined,
        strictness: "high",
        appliesTo: [
            "hero full-body render",
            "Neutral Front Head",
            "3/4 Left Head",
            "3/4 Right Head",
            "Left Profile Head",
            "Right Profile Head",
            "expressive close-up",
            "full-body turnaround views",
            "rear view",
            supportingPosePanelLabel,
            "color blocking / palette inset",
            "costume detail crop",
            "footwear and material detail insets",
            "any inset containing the character, body, head, hands, costume, or footwear",
            "annotations and callout presentation"
        ]
    });
    const strictRenderedFamilyLock = strictRenderedFamilyStyles.has(characterRenderStyle)
        ? `STRICT RENDERED FAMILY LOCK:
- Every panel containing the character must stay in the same rendered style family as the selected Character Render Style.
- Hero portrait, turnaround figures, head studies, expression study, and ${supportingPosePanelLabel} must all look like the same rendering family.
- Do not switch secondary panels into concept art, painted concept sheet style, comic style, cel style, line-art model sheet style, diagram style, flat-color character thumbnail style, or semi-illustrated board style.
- For DSLR Capture, all character-containing panels must read as DSLR-style rendered imagery, not drawn or painted concept art.
- If a panel contains the character's body, face, head, pose, or costume-on-body silhouette, it must match the selected rendered family exactly.`
        : "";
    const animated3dIdentityLock = animated3dStyles.has(characterRenderStyle)
        ? `PREMIUM ANIMATED 3D BIOMETRIC GEOMETRY LOCK:
- Translate the supplied biometric actor into Premium Animated 3D.
- Preserve the actor's biometric identity geometry across every panel.
- Keep the same head silhouette, scalp/bald shape, forehead height, brow placement, brow thickness impression, eye spacing, eye angle, nose length, nose width, mouth width, lip shape impression, cheek structure, jaw width, chin shape, facial hair outline, facial hair density pattern, age impression, neck thickness, shoulder relationship, and body presence.
- Stylization may change the surface shader, lighting model, and material finish, but it must not change the underlying identity geometry.
- Do not make the actor generically friendlier, younger, slimmer, smoother, cuter, rounder, or more heroic.
- Preserve the source expression attitude unless the user explicitly requests a new performance note.
- Do not default to a broad smile unless explicitly requested.
- Do not add a broad smile or friendly expression by default.
- Do not turn the actor into a generic family-animation protagonist.
- The result must read as the same biometric person rendered in Premium Animated 3D.

Important distinction:
- Allowed: smooth stylized animated 3D materials, premium animated lighting, simplified skin texture, clean CG surface.
- Forbidden: changing the face design, changing expression, changing head/scalp proportions, changing facial hair shape, changing age impression, changing body identity.`
        : "";
    const animated3dPanelLock = animated3dStyles.has(characterRenderStyle)
        ? `PREMIUM ANIMATED 3D PANEL FAMILY LOCK:
- Every panel containing the character must stay in the same premium animated 3D rendering family.
- Hero portrait, turnarounds, head studies, expression study, supporting pose render, and all character-containing insets must match the same stylized animated 3D family.
- Do not drift into live-action realism, photoreal portraiture, painterly concept art, flat illustration, claymation, cel animation, line-art mannequin studies, or semi-realistic off-style panels.
- Board presentation style may affect layout and typography only; it must not change the character rendering family.
- Lighting must remain premium animated-feature lighting: soft cinematic, sculptural, readable, polished, and non-photoreal.`
        : "";
    const claymationStrictRule = characterRenderStyle === "claymation"
        ? `STRICT CLAYMATION STYLE LOCK:
- Every panel containing the character must read as the same tactile stop-motion / claymation rendering family.
- The character must feel handcrafted and sculpted while remaining the same actor translated into clay/plasticine form.
- Preserve actor likeness, adult proportions, head shape, facial hair, costume continuity, and body identity while changing only the material/render surface.
- Do not render the character as premium animated-feature 3D, family CG, sleek stylized 3D, Pixar-like CG, or polished modern animation.
- Do not use clean CG skin shading, overly perfect surfaces, or generic premium-animated 3D materials.
- Any inset showing the face, body, pose, costume-on-body silhouette, or expression must match the same claymation/tactile rendering family.`
        : "";
    const claymationIdentityLock = characterRenderStyle === "claymation"
        ? `CLAYMATION BIOMETRIC LIKENESS LOCK:
- Claymation is a material/render translation of the same actor, not a new character design.
- Preserve the supplied biometric identity across every panel.
- Keep the same head shape, scalp/bald shape, brow structure, eye spacing, nose shape, mouth shape, jaw, facial hair shape, skin tone value, age impression, and body proportions.
- Do not make the actor cuter, younger, rounder, more toy-like, more mascot-like, or more generic.
- Do not exaggerate facial features into a caricature.
- Do not turn the actor into a chibi, toy figurine, generic stop-motion villager, or premium animated 3D character.
- The result should look like the same person recreated in clay/plasticine material.`
        : "";
    const claymationInsetRule = characterRenderStyle === "claymation"
        ? `CLAYMATION INSET CLEANUP RULE:
- Do not create random clay lumps, flesh blobs, disconnected facial chunks, abstract body-part fragments, or malformed clay masses.
- Material/detail insets should show clean costume fabric, leather, footwear, seams, buckles, buttons, or full readable character/costume crops only.
- If showing clay surface texture, use a clean neutral material swatch, not an isolated body part or malformed clay fragment.
`
        : "";
    const claymationStyleDriftNegative = characterRenderStyle === "claymation"
        ? "- No premium animated 3D drift. No Pixar-like CG drift. No family-animation gloss. No polished sleek CG skin. No modern premium feature-animation rendering. No rendering the claymation character as ordinary stylized 3D."
        : "";
    const characterPanelStylePurity = characterRenderStyle === "claymation"
        ? `CHARACTER PANEL STYLE PURITY:
- Board presentation style may affect layout and typography only.
- Every character-containing panel must remain claymation / tactile stop-motion.
- Do not drift into premium animated 3D, Pixar-like CG, photorealism, or flat illustration.`
        : renderedFamilyStyles.has(characterRenderStyle)
            ? `CHARACTER PANEL STYLE PURITY:
- Board presentation style may affect layout and typography only.
- Every character-containing panel must remain in the selected rendered/photographic style family.
- Do not switch secondary panels into concept art, painted concept sheet style, comic style, cel style, line-art model sheet style, diagram style, flat-color thumbnails, or semi-illustrated board style.`
            : illustratedFamilyStyles.has(characterRenderStyle)
                ? `CHARACTER PANEL STYLE PURITY:
- Board presentation style may affect layout and typography only.
- Every character-containing panel must remain in the selected illustrated style family.
- Do not drift into photorealism, DSLR capture, premium animated 3D, claymation, or unrelated rendering families.`
                : `CHARACTER PANEL STYLE PURITY:
- Board presentation style may affect layout and typography only.
- Every character-containing panel must remain in the selected Character Render Style.
- Do not mix rendering families between hero portrait, head studies, turnarounds, ${supportingPosePanelLabel}, and character-containing insets.`;
    const stylizedBiometricTranslationRule = stylizedBiometricTranslationStyles.has(characterRenderStyle) && hasReferenceDrivenIdentity
        ? `STYLIZED BIOMETRIC TRANSLATION RULE:
- For stylized render styles, style changes the rendering/material language only.
- Biometric identity geometry remains locked.
- Do not use the selected style as permission to invent a new face, new head shape, new scalp outline, new expression, new facial hair pattern, new age impression, or new body identity.
- The output should look like the supplied biometric person translated into the selected style.`
        : "";
    const styleNegativePrompt = buildStyleNegativePrompt(characterRenderStyle);
    const globalInvariantContract = buildGlobalCharacterInvariantContract({
        hasBiometricIdentity: isBiometricIdentitySource(input),
        hasGeneratedCharacterSource,
        selectedStyleId: characterRenderStyle,
        selectedStyleFamily: characterRenderFamily,
        hasExplicitBodyOverride: strictBodySpecs,
        hasExplicitProps
    });
    const localBodyAxisLock = buildWholeBodyAxisLockContract();

    return `Create a full cinematic production-grade CHARACTER PITCH SHEET for ${characterName}. The result must feel like a premium character design board for film development, not a generic model sheet.

${PROMPT_PRIORITY_ORDER_BLOCK}

${globalInvariantContract}
${hiddenActorSourceIdentityLock}
${wardrobeAuthorityInstruction}

${CONTROLLED_TEXT_AND_LABEL_CONTRACT}

${NO_SIGNATURE_RULE_CONTRACT}

${BOARD_PRESENTATION_STYLE_BLOCKS[boardPresentationStyle]}

${CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle]}
${styleCategoryContract}
${input.identitySource === "biometric_plus_character" && input.characterStyleReferenceUrl ? `\nSCAN + CHARACTER SOURCE CONTRACT:
Image A is the approved actor. The pitch sheet must expand Image A into a production character board.
Do not create a new actor.
Do not reinterpret the actor from scratch.
Do not average Image A with biometric scans.
Do not blend Images B-F into a new person.

Images B-F are not alternate character references.
Images B-F are view-specific biometric geometry references for the same person represented by Image A.

Image A controls:
- approved actor design
- stylized face interpretation
- wardrobe
- costume
- body silhouette
- render style
- overall character language

Images B-F control only:
- facial structure by matching angle
- head shape
- nose/jaw/mouth/eye geometry
- scalp/crown/chin structure
- skin tone and facial hair consistency when visible

Images B-F must not control:
- render style
- wardrobe
- costume
- body design
- age shift
- new face creation
- alternate actor identity

VIEW MATCHING RULE:
Use Image B for front-facing head views.
Use Image C for left-facing views.
Use Image D for right-facing views.
Use Image E only for upward/lower-face structural support.
Use Image F only for downward/upper-head structural support.

PROMPT PRIORITY:
1. Expand Image A as the approved actor.
2. Use Images B-F only as angle-specific facial geometry constraints.
3. Preserve Image A’s render style unless the user explicitly selected another render style.
4. Apply user options only if they do not conflict with Image A or the angle-specific geometry references.

If any instruction conflicts with Image A, Image A wins for actor design.
If any biometric scan conflicts with Image A’s design, use the scan only to correct facial geometry, not to create a new actor.\n` : ""}
USER PRODUCTION DIRECTIVES:
The following user-entered fields are intentional production design directives, not loose metadata.
Apply them visibly in the pitch sheet wherever appropriate, while preserving the approved actor identity from Image A.

Field application rules & current values:

- Character Name (Current Value: "${input.characterName || 'N/A'}"):
  Use as the visible character name/title where the sheet design allows.

- Alias / Codename (Current Value: "${input.aliasCodename || 'N/A'}"):
  Include as secondary character identification if provided.

- Visual Age (Current Value: "${input.visualAge || 'N/A'}"):
  Reflect in age presentation only if it does not conflict with the approved actor likeness.

- Height (Current Value: "${input.height || 'N/A'}"):
  Use for body proportion notes and board metadata.

- Build (Current Value: "${input.build || 'N/A'}"):
  Reflect in body silhouette, costume fit, posture, and build metadata.
  Do not change facial identity.

- Design Language (Current Value: "${input.designLanguage || 'N/A'}"):
  Apply to the overall visual design, genre treatment, material callouts, and board language.

- World / Era (Current Value: "${input.worldEra || 'N/A'}"):
  Apply visibly through wardrobe influence, props, material notes, environmental motifs, background/context cues, typography/ornament where appropriate, and board annotations.
  If a world or era is provided, the sheet should clearly feel connected to that world/era.
  Do not ignore this field.
  Do not change the actor into a different person.

- Lighting Mood (Current Value: "${input.lightingMood || 'N/A'}"):
  Apply to the hero portrait, sheet lighting language, and mood presentation.

- Sheet Style (Current Value: "${input.sheetStyle || 'N/A'}"):
  Apply to layout, hierarchy, graphic presentation, and board formatting.

- Core Personality (Current Value: "${input.corePersonality || 'N/A'}"):
  Reflect through expression, supporting pose, posture, performance note, and character notes.

- Internal Conflict (Current Value: "${input.internalConflict || 'N/A'}"):
  Reflect through subtle pose/expression/story notes if provided.

- Wardrobe Direction (Current Value: "${input.wardrobeDirection || 'N/A'}"):
  If provided, this is a strong wardrobe directive.
  Apply it to costume, garment callouts, material notes, and turnaround views.
  If not provided, preserve Image A wardrobe.

- Props / Signature Items (Current Value: "${input.propsSignatureItems || 'N/A'}"):
  If provided, include them as visible prop/detail callouts when layout permits.

- Environment (Current Value: "${input.environment || 'N/A'}"):
  If provided, reflect through background motifs, world context notes, floor/wall/background language, and visual atmosphere.

USER DIRECTIVE PRIORITY:
User fields must be applied visibly when provided.
If a user directive conflicts with Image A’s facial identity, preserve Image A.
If a user directive conflicts with Image A’s wardrobe and the user provided explicit Wardrobe Direction, follow the user wardrobe directive while preserving actor identity.
If World / Era is provided but Wardrobe Direction is blank, apply the world/era through design motifs, accessories, props, background, materials, and annotations without fully replacing Image A’s wardrobe unless the prompt clearly asks for era-specific wardrobe.

Do not treat user fields as decorative text only.
Do not ignore World / Era, Build, Design Language, Lighting Mood, Sheet Style, Personality, Props, Wardrobe Direction, or Environment when they are provided.

ACTOR PANEL STYLE PURITY LOCK:
The selected Character Render Style (Selected Style: "${characterRenderStyleLabel || 'N/A'}") is the only permitted rendering style for every panel that depicts the actor as a person.

This applies to:
- hero portrait
- full-body turnaround views
- 3/4 body views
- back view
- supporting pose
- neutral front head
- 3/4 left-facing head
- 3/4 right-facing head
- left-facing profile head
- right-facing profile head
- expression study panels
- any inset where the actor’s face, head, or body appears

Every actor depiction must look like it was rendered by the same visual pipeline in the same selected Character Render Style.

Do not mix rendering styles.
Do not let head-study panels become realistic if the selected Character Render Style is stylized.
Do not let profile heads become photographic while body views remain stylized.
Do not render any actor panel as a raw biometric/photo-derived image unless the selected Character Render Style is explicitly photoreal.
Do not combine photographic realism with Premium Animated 3D.
Do not allow semi-realistic profile heads, realistic skin texture, camera-photo lighting, pores, or raw scan texture to appear in stylized character panels.

BIOMETRIC STYLE BARRIER:
Biometric source images are geometry and likeness references only.
They are not style references.
They must not contribute photographic rendering, skin texture, camera lighting, photo realism, lens distortion, or raw scan appearance.
Translate biometric facial structure into the selected Character Render Style.

STYLE RESPONSIBILITY MAP:
- Character Render Style controls the rendering language of every actor depiction panel.
- Sheet Style (Selected Style: "${input.sheetStyle || 'N/A'}") controls only layout, board design, typography feel, panel structure, and presentation format.
- Biometric images control only likeness, facial geometry, head shape, skin tone consistency, hair/facial-hair placement, and angle-specific structure.
- Image A controls approved actor identity, wardrobe/body design, and approved character design.

HEAD STUDY STYLE LOCK:
All head-study and profile panels must be stylized translations of the biometric geometry into the selected Character Render Style.
They must not appear more realistic than the hero portrait, turnarounds, or supporting pose.
The front head, 3/4 heads, profile heads, and expression studies must all share the same rendering language.

If the selected Character Render Style is Premium Animated 3D:
- all actor panels must be Premium Animated 3D
- all head-study panels must be Premium Animated 3D
- all profile panels must be Premium Animated 3D
- no photo-real head panels
- no realistic skin texture
- no photographic skin rendering
- no realism leakage

STYLE CONSISTENCY REQUIREMENT:
The final sheet must read as one cohesive production board from one visual style system. Likeness may come from biometric structure, but the visible rendering style must come only from the selected Character Render Style.

${sheetStyleLockContract}
${strictRenderedFamilyLock}
${animated3dIdentityLock}
${animated3dPanelLock}
${claymationStrictRule}
${claymationIdentityLock}
${characterPanelStylePurity}

${biometricIdentityLockContract}
${productionActorPromptContract}
${identityContract}
${surfaceMarkFidelity}
${groomingFidelity}
${strictBiometricContract ? `\n${strictBiometricContract}\n` : ""}
${styleIdentityEnforcementContract ? `\n${styleIdentityEnforcementContract}\n` : ""}
${stylizedBiometricTranslationRule}
${identityRule}
${sourcePanelRule}
${approvedPortraitDesignLock}
${generatedCharacterSourceRule}
${styleReferenceRule}
Body consistency: ${bodyAuthorityRule}
Body guide: ${buildPromptGuide}.
${pitchSheetPoseCoherence}
${CHARACTER_ANATOMY_INTEGRITY_CONTRACT}
${TURNAROUND_ANATOMY_INTEGRITY_CONTRACT}
${BODY_ORIENTATION_COHERENCE_CONTRACT}

STRUCTURED CHARACTER DATA / BOARD METADATA:
- Structured values are board metadata and subtle fit guidance only: ${structuredBodySourceOfTruth}.
- Approved character source Image A remains visual/body/costume/identity authority when supplied.
- Biometric references or approved Image A remain identity authority.
- Numeric weight values must not recast body unless strict body specs / explicit override is active.
- "athletic, 200 lbs" means athletic solid adult build, not overweight.
- These values must not override biometric identity, approved generated character source, face, head shape, age impression, hairstyle, costume silhouette, or body identity.
- Numeric weight values are metadata and subtle proportional guidance only, not permission to recast the actor or generate a different person.
- Weight/build metadata must not recast the actor, replace the likeness, or become a new casting specification.
- If a numeric weight conflicts with the supplied identity/source images, preserve the supplied identity/source images.
${strictBodySpecsRule}
- Do not let stale older prompt fragments, previous generated board text, or older metadata conflict with these current structured values.

EMPTY FIELD RULE:
If a user field is blank, do not invent that field from previous generations or prior prompt state.
Blank Build means no user build directive is provided.
Use the approved actor source for body proportions unless the user explicitly supplies a Build directive.

UNIVERSAL STYLE CONSISTENCY CONTRACT:
- Style affects rendering language only.
- It must not change head shape, scalp outline, face structure, hairline, eyes, brows, nose, mouth, jaw, facial asymmetry, age impression, body type, costume package, footwear, props, or world/era unless the user explicitly requests that.
- Source images are the identity authority when supplied.
- ${hasGeneratedCharacterSource ? "Generated character source Image A is the visual/design authority when supplied; biometric images remain identity authority only." : "If a generated character source is supplied, it is the visual/design authority while identity references remain likeness authority."}
- If style and likeness conflict, likeness wins.
- Head studies must preserve the same exact subject, and turnaround figures must not use generic mannequin faces.
- Source panel mode must not weaken identity; it only controls whether source references are visible, hidden, or costume matched.
- Treat the selected render style as an output treatment applied to the same character package, not as permission to redesign the character.
- Source image controls identity. Character Render Style controls visual category. Board Presentation Style controls layout only. Lighting Mood must adapt to the selected render style.
- Cinematic lighting, premium film-board language, and photo-grade presentation words must not dilute or override the selected Character Render Style.

STYLE-PHYSIQUE RULE:
- Keep the source-visible body identity locked across every render style. Use this body guide only as identity-safe fit guidance: ${buildPromptGuide}. Do not let stylization or body metadata alter the actor identity, height impression, frame size, shoulder width, waist relationship, limb thickness, footwear scale, or costume fit.

SOURCE PANEL MODE HAS PRIORITY OVER STYLE:
- Follow source panel mode before render style. If source panel mode hides raw references or requires costume-matched head studies, style must obey that mode and may only alter the rendered finish.

STYLE-SAFE VISIBLE LABELING:
- Visible labels must name costume, material, performance, prop, or production design details in clean film/costume-department language.
- Do not print render-style enum keys, app workflow terms, identity-system labels, reference attachment labels, or source panel implementation labels on the board.

STYLE DRIFT NEGATIVE CONSTRAINTS:
- No recasting, no beautifying into a different person, no generic photoreal model, no generic stylized face, no widened or bulked body, no new animated character, no costume redesign, no genre upgrade, no footwear changes, no accessory swaps, no prop replacements, no world/era drift.
- ${hasGeneratedCharacterSource ? "Do not ignore Image A. Do not treat Image A as optional inspiration. Do not generate a generic board from the biometric scans alone. Do not change Image A's outfit, body type, proportions, style category, costume package, or character silhouette unless explicitly requested." : "Do not change body type or proportions unless explicitly requested. Do not over-infer body build from face scans."}
- Do not recast the actor due to weight, build, height, or body metadata.
- Do not generate a generic person matching the weight number.
- Do not change face, head shape, scalp outline, eyes, nose, mouth, jaw, skin tone, facial hair, age impression, or identity because of build/weight text.
- Do not treat "200 lb" or any numeric weight as a new casting specification.
- Numeric body metadata must not override the supplied biometric references or generated character source.
- ${SHEET_STYLE_LOCK_NEGATIVE_TEXT}
- No selected-style category drift: ${styleNegativePrompt || "do not blur the selected render style with another category"}.
${claymationStyleDriftNegative}
- No ${buildPoseCoherenceNegativeTokens()}.
- No ${buildHeadshotWardrobeNegativeTokens()}.
- ${CHARACTER_ANATOMY_NEGATIVE_TEXT}

${HEADSHOT_BACKGROUND_ISOLATION_RULE}
${headshotWardrobeContinuity}

VISIBLE BOARD LANGUAGE RULE:
- Internal workflow terms such as NanoCast, biometric scanner, identity lock, source image, reference image, prompt engine, generated image, or debug image labels must not appear as visible text on the final board.
- Visible board text must sound like professional film-development and costume-department language appropriate to the character's world and era.
- Use internal reference and likeness logic only to preserve identity; do not turn it into board titles, costume labels, material callouts, or world-building text.

${visibleVocabularyRule}

CALLOUT TARGET ACCURACY RULE:
- A callout arrow must terminate inside the exact visible object named by the label.
- Do not point a callout to a nearby garment if the label names a different garment.
- Do not point "Layering System" to a flat shirt panel unless two actual overlapping garment layers are visible.
- Do not point "Character Color Blocking" to the character body unless the target is a dedicated color/material swatch.
- Do not point footwear callouts anywhere except footwear or a footwear detail inset.
- Do not point performance/pose callouts to clothing seams or material swatches.
- If no exact visible target exists, omit the callout.
- Fewer correct callouts are better than inaccurate callouts.

CALLOUT CATEGORY PLACEMENT RULE:
- Garment labels must point to the named garment.
- Material labels must point to the matching visible material or a material swatch.
- Footwear labels must point only to footwear or a footwear inset.
- Prop labels must point only to the actual prop or prop inset.
- Accessory labels must point to visible accessories such as belt, pouch, watch, jewelry, glasses, bag, insignia, clasp, or pin.
- Construction labels must point to seams, stitching, closures, pocket flaps, fasteners, buckles, straps, panels, joints, or garment structure.
- Performance labels must point to pose, expression, gesture, posture, or body language--not costume materials.
- Turnaround labels and material callouts must not be confused with each other.

PROP CALLOUT RULE:
- If a prop is included, its callout must point to the prop itself, not the character's face, body, clothing, or nearby empty space.
- Match prop labels to the named visible prop or a dedicated prop inset.
- Do not convert a prop into a construction or material label unless the visible target is specifically that prop's construction or material detail.
- Do not label a face, profile, head, body, garment, or background area as a prop or prop construction detail.

VISIBLE-ONLY CALLOUT RULE:
- Only label visible objects or visible material features.
- Do not label hidden construction, implied hardware, or unseen details.
- If a garment has no visible zipper, do not label zipper construction.
- If a prop is not clearly visible, do not label it.
- If a material is ambiguous, use a broader label or omit it.

CALLOUT OMISSION RULE:
- If the model cannot place a callout accurately, it should omit that callout.
- It is better to have 4 correct callouts than 8 inaccurate ones.

${CALLOUT_ACCURACY_CONTRACT}

CALLOUT COUNT RULE:
- Use 5 to 7 total visible callouts by default.
- Preferred distribution: 2 to 3 wardrobe/garment callouts, 1 to 2 material callouts, 1 footwear callout if footwear is visible, 1 accessory/prop callout if provided, and 1 performance/gesture callout if useful.
- Use fewer accurate callouts rather than many uncertain callouts.

STYLE-CALLOUT RULE:
- The selected render style may affect line quality, shading, material rendering, and presentation finish, but it must not create inaccurate callout labels or mismatch callouts to the wrong object.
- Callout labels must remain materially and contextually accurate regardless of style.

STYLE-LOCKED INSET RULE:
- Color blocking, palette, construction, material, footwear, expression, and gesture boxes are part of the same character sheet, not separate illustration modes.
- Do not generate "Character Color Blocking" or any palette panel as flat 2D/vector/cartoon miniature character drawings when the sheet style is rendered, 3D, photographic, painterly, anime, or another non-flat style.
- Color-blocking information should appear as material swatches, palette chips, or cropped costume/material details. If a person, head, body, hands, feet, pose, or costume-on-body silhouette appears in an inset, it must match the hero portrait and turnaround rendering style exactly.
- If an inset contains face, skin, head, body, hands, feet, pose, or costume-on-body silhouette, it must be a readable character crop matching the same actor and same selected style.
- If an inset contains face, body, pose, hands, feet, or costume-on-body silhouette, it must match the same selected render family exactly.
- Do not generate off-style miniatures, line-art mannequin studies, claymation fragments, painterly crops, or semi-realistic side-panels inside a Premium Animated 3D board.
- Do not use isolated body fragments or ambiguous clay/flesh shapes as design insets.
- Do not add simplified diagram characters, alternate model-sheet miniatures, flat-color stand-ins, icon bodies, or off-style thumbnails anywhere on the board.

RENDERED INSET ENFORCEMENT:
- If the selected Character Render Style is a rendered 3D, CG, photographic, claymation, or other non-flat family, every inset containing a character, face, body, hands, feet, pose, costume-on-body silhouette, or expression must be rendered in that same selected style family.
- Never use a flat illustration, vector diagram, mascot drawing, cartoon miniature, simplified model-sheet doodle, icon body, chibi insert, silhouette diagram, or 2D auxiliary figure inside a rendered character sheet.
- If the available space is too small to render the supporting pose in the selected family, omit that character inset rather than switching style families.
- Material swatches may be simple samples only if they contain no character body, no face, no hands, no feet, no pose, and no costume-on-body silhouette.

SUPPORTING POSE / DETAIL INSET COHERENCE RULE:
- Supporting pose content may appear only once on the board unless the user explicitly requests multiple performance studies.
- Do not generate a secondary pose crop, duplicate performance crop, isolated limb insert, floating arm, disconnected leg, cropped torso fragment, or ambiguous anatomy crop.
- If a pose inset is included, it must remain anatomically coherent and visibly attached: no detached shoulders, no duplicated arms, no merged limbs, no floating hands, no floating feet.
- If space is too tight for a clean pose inset, omit the supporting pose inset instead of inventing a cropped body fragment.
- Footwear detail inset must contain only footwear, sole, tread, or shoe construction detail. It must not include face, torso, performance pose, or unrelated body parts.
- Material texture inset must contain only fabric/material/garment-surface detail or a clean garment crop. It must not contain face, pose, or stray anatomy.
- Expression study inset must contain only a coherent face/head crop of the same subject.
- Never place a performance crop inside a footwear detail inset or a material inset.

DETAIL PANEL SAFETY RULE:
- Insets must contain only the content appropriate to that inset type.
- Footwear detail inset: shoes/sole/tread only; no face, torso, or pose anatomy.
- Material texture inset: material/fabric detail only; no body parts.
- Supporting pose inset: one coherent whole-body or half-body pose only.
- Do not create cropped anatomy fragments or accidental merged body/garment composites inside inset panels.
- If an inset cannot be rendered cleanly, omit it rather than generating a malformed or blended result.

NO MEDICAL / SKELETON / ANATOMY INSERTS:
- Do not render skulls, skeletons, bones, x-rays, anatomical diagrams, medical cutaways, anatomy overlays, or anatomical study inserts unless explicitly requested by the user.
- Do not interpret "head shape," "cranial silhouette," "face structure," or "identity preservation" as permission to draw a skull or skeleton.
- Pitch Sheet Brief is a character production board, not a medical anatomy sheet.
- If an inset is needed, use actor portrait, head study, footwear, fabric, material, palette, wardrobe, or performance pose panels only.

${claymationInsetRule}

${DETAIL_PANEL_ISOLATION_CONTRACT}

${FOOTWEAR_DETAIL_PANEL_RULE}

${PANEL_LABEL_ACCURACY}

${AVOID_OVERPOPULATING_SHEET_CONTRACT}

${DETAIL_INSET_CLEANNESS}

${PITCH_SHEET_PRECISION_REFINEMENT_CONTRACT}

FORBIDDEN INTERNAL VISIBLE TERMS:
- Do not show internal workflow/debug terms as visible board callouts unless debugVisibleLabels is true.
- Forbidden by default: NanoCast; biometric scanner; identity lock; source image; reference image; Image 1; Image 2; Image 3; prompt engine; generated image; debug labels.
- Use clean character, costume, and production-board language instead.

CONTROLLED CALLOUT PLAN:
${calloutPlan}

VISIBLE CALLOUTS:
- Use the controlled callout plan above as the preferred visible callout set.
- Do not invent unlimited additional labels beyond the controlled plan.
- Do not invent visible labels from raw prompt text, file/reference names, handoff text, image attachment names, internal identity terms, or render-style enum names.
- Omit any planned callout whose target is not clearly visible in the generated board.
- Keep visible labels specific and clean: no duplicate title/codename labels, no generic material-read labels, no standalone "Detail" labels, no malformed or duplicated label text.
- If the object or material cannot be named confidently, omit the callout instead of using a vague replacement label.

NEGATIVE VISIBLE TEXT CONSTRAINTS:
- Do not write "NanoCast," "biometric scanner," "biometric closures," "biometric etching," "biometric clasp," "integrated circuitry," "circuitry," "scanner," "generated NanoCast character image," "source image," "reference image," "identity lock," "Image 1," "Image 2," "Image 3," or any internal technical/debug label anywhere on the visible board.
- Terms named in this negative list remain forbidden as visible text even if they appear in hidden reference attachment identifiers or internal instructions.

CHARACTER IDENTITY BLOCK:
- Name: ${characterName}
- Codename: ${alias}
- Visual age: ${visualAge}
- Height: ${height}
- Build metadata / board label: ${buildMetadata}
- Body generation guidance: ${buildPromptGuide}
- Design language: ${designLanguage}
- World or era: ${worldEra}
- Sheet style: ${sheetStyle}

FACE DESIGN:
- ${faceDesign}
- Same face across every view, head study, and cinematic portrait.

PSYCHOLOGICAL PROFILE:
- Core personality: ${corePersonality}
- Internal conflict: ${internalConflict}
- Communicate psychology through posture, gaze, wardrobe wear, gesture economy, grooming, and how the character occupies space.

WEAPON / PROP SAFETY RULE:
- Do not invent weapons, combat props, tactical gear, holsters, utility rigs, armor, shields, or action accessories unless explicitly requested in props/wardrobe notes or clearly present in the approved generated character source.
- If no props are specified, do not add a weapon.

PERFORMANCE DIRECTION:
- ${performanceDirection}
${performanceStudyRule}
${PERFORMANCE_DIRECTION_SCOPE_CONTRACT}

WARDROBE BREAKDOWN:
- Direction: ${wardrobe}
- Props and signature items: ${propsDisplay}
- Show full outfit from head to toe, including footwear.
${hasExplicitWardrobeDirection
    ? "- Use the explicit Wardrobe Direction as the final wardrobe/costume authority. Replace conflicting source clothing, including default collared polo/shirt, while preserving identity, body proportions, and render style."
    : "- Preserve the approved costume package and visible silhouette consistently across the sheet."
}
- Define only visible and relevant garment layers, closures, accessories, and material details.
- Do not invent armor, tactical harnesses, bags, straps, holsters, prop attachment points, or weapons unless they are explicitly requested or clearly present in the approved generated character source.

GARMENT-ANATOMY SEPARATION LOCK:
- Garments must read as worn clothing, not pigment blended into the body.
- Every wardrobe item must have a clean silhouette boundary where fabric ends and exposed skin begins.
- Maintain visible separation at armholes, necklines, waistlines, hems, leg openings, sleeve openings, bra lines, waistband edges, shorts hems, leggings edges, and shoe openings.
- Do not let costume color bleed into adjacent skin.
- Do not let exposed skin inherit garment color, garment texture, or garment shading.
- Do not let fabric appear fused, melted, airbrushed, or painted directly onto anatomy.
- Preserve clear garment construction and edge readability even in small turnaround panels.
- If the wardrobe includes shorts, the shorts must terminate clearly above the exposed leg with a visible edge or hem.
- If the wardrobe includes leggings, the leggings must fully cover the intended leg region cleanly, without patchy fade into skin.
- If the wardrobe includes a tank top or sleeveless top, the armhole boundaries must remain distinct and anatomically clean.
- If the wardrobe includes a crop top, sports bra, or fitted training top, the garment edge under the bust / waist must remain clearly separated from exposed torso skin.
- When the costume is tight athletic wear, show fitted fabric construction, not body-color blending.

GARMENT EDGE NEGATIVE CONSTRAINTS:
- no clothing fused into skin
- no painted-on shorts
- no blended leggings-to-skin transition
- no garment color bleeding into thighs, hips, torso, or arms
- no melted armhole
- no disappearing hemline
- no false skin-texture on clothing
- no false clothing-texture on exposed skin
- no ambiguous leg opening
- no costume-to-anatomy merge

MATERIAL ACCURACY:
- ${materialNotes}
- Include natural professional material callouts such as fabric weave, leather grain, metal patina, stitching, closure construction, and footwear details.

STRICT TURNAROUND INSTRUCTIONS:
- Include full-body front view, three-quarter view, clean side/profile view, and back view of the same character.
- The turnaround must be costume-consistent without becoming a generic evenly spaced model-sheet row.
${TURNAROUND_ANATOMY_INTEGRITY_CONTRACT}
- Back view must resolve only the rear costume details that are actually visible or clearly implied by the approved character design.
- Do not invent bags, armor plates, tactical harnesses, straps, or weapon rigs unless explicitly requested or clearly present in the approved generated character source.

${STRICT_BODY_VIEW_DIRECTION_MAP}

${localBodyAxisLock}

${BODY_ORIENTATION_COHERENCE_CONTRACT}

TURNAROUND ORIENTATION LOCK:
- Every turnaround figure must follow a single coherent global axis from head through feet.
- Front View (0°): chest, pelvis, knees, and toes face forward.
- 3/4 View (45°): head, ribcage, pelvis, knees, and feet share one three-quarter axis.
- Left Side Profile (90°): the face and full body point toward the LEFT side of the page.
- Back View (180°): back-facing only; no front facial leakage.
- If any body-view label contains a direction, the rendered figure must obey that exact page-facing direction.
- Do not duplicate one side-facing body panel and relabel it as a different view.

TURNAROUND NEGATIVE CONSTRAINTS:
- no duplicated body direction panels
- no mirrored relabeling
- no upper/lower body axis split
- no torso facing one way and legs another
- no contradictory foot direction
- no profile/back confusion

HEAD STUDY ORIENTATION CONTRACT:
- Use page-facing profile labels to avoid ambiguity.
- NEUTRAL FRONT HEAD: face looks straight forward toward the viewer.
- 3/4 LEFT-FACING HEAD: face turns approximately 45° toward the LEFT side of the page. This is not a full profile.
- LEFT-FACING PROFILE HEAD: true 90° profile with the nose, lips, chin, and face silhouette pointing LEFT on the page.
- RIGHT-FACING PROFILE HEAD: true 90° profile with the nose, lips, chin, and face silhouette pointing RIGHT on the page.
- LEFT-FACING PROFILE HEAD and RIGHT-FACING PROFILE HEAD must face opposite directions.
- Do not duplicate the same profile direction twice.
- Do not use one mirrored or repeated head crop and label it as the opposite profile.
- Do not label a left-facing head as right-facing.
- Do not label a right-facing head as left-facing.
- It is better to include one correct profile and omit the opposite profile than to duplicate or mislabel the same profile.
- Do not force four head panels if doing so creates duplicate or mislabeled directions.
- If a correct opposite-facing profile cannot be rendered, omit the weaker profile panel rather than duplicating the wrong direction.

HEAD STUDY CONTENT RULE:
- Head studies must show the actor's visible head/face/hair only.
- Do not replace any head study with a skull, skeleton, anatomy diagram, x-ray, medical reference, or bone structure illustration.
- Profile panels must show the actor's face/head profile, not skull anatomy.

${HEAD_STUDY_PANEL_CLEANNESS}

${HEAD_STUDY_VS_BODY_TURNAROUND_SEPARATION}

HEAD VIEW NEGATIVE CONSTRAINTS:
- no duplicate left/right head profile direction
- no repeated side profile under different labels
- no mislabeled page-facing direction
- no profile duplication
- no mirrored fake relabel
- no front/profile ambiguity
- no directionally inconsistent ear-nose-jaw relationship

HEAD CALLOUT DIRECTION RULE:
- If a visible callout refers to a head view, use direction-safe wording such as NEUTRAL FRONT HEAD, 3/4 LEFT-FACING HEAD, LEFT-FACING PROFILE HEAD, or RIGHT-FACING PROFILE HEAD.
- Avoid loose head callout language that could blur direction, such as profile study, head contour, or side head without explicit left/right wording.

CINEMATIC PORTRAIT INSTRUCTIONS:
- Include one larger cinematic portrait of ${characterName} with ${lightingMood}.
- Environment cue: ${environment}

PRODUCTION NOTES:
- ${productionNotes}
- Additional notes: ${additionalNotes}

PREMIUM ASYMMETRIC LAYOUT RULES:
- Use an editorial, high-end asymmetric layout: one dominant cinematic portrait, supporting full-body turnarounds, head studies, material detail callouts, and ${propOrFootwearInsetText}.
- Include the ${supportingPosePanelLabel} as a designed supporting element, not a separate redesign.
- Avoid generic grid layouts, evenly spaced model-sheet rows, rigid contact-sheet spacing, and empty repeated boxes.
- Use tasteful negative space, layered scale hierarchy, subtle labels if needed, and composition that feels designed rather than templated.

FINAL VISUAL INTEGRITY CHECK:
Before finalizing the pitch sheet, ensure:
- head-study directions are correct and non-duplicated
- Left Profile Head points left on the page
- Right Profile Head points right on the page
- 3/4 Left Head is not a duplicate profile
- turnaround figures keep one coherent axis
- garment boundaries remain clean and visibly separate from exposed skin
- no clothing-to-skin blending occurs in shorts, leggings, tops, or armholes
- no inset contains malformed anatomy or fused costume/body regions

FINAL TEXT AND VIEW CHECK:
Before finalizing the sheet:
- Confirm LEFT-FACING PROFILE HEAD points left on the page.
- Confirm RIGHT-FACING PROFILE HEAD points right on the page.
- Confirm the two profile head panels are not duplicates.
- Confirm no hidden instruction text, camera metadata, source metadata, debug labels, or parenthetical process notes appear as visible text.
- Confirm all visible labels are clean production-board labels only.

STRICT CONSISTENCY RULES:
- No duplicated accessories unless requested.
- No missing footwear.
- No costume drift between front, side, three-quarter, back, head studies, and portrait.
- No face drift between turnaround views.
- Maintain a single coherent character package across the entire sheet.

${buildFinalIdentityAuthorityReassertion(input.identityLock)}`;
}
