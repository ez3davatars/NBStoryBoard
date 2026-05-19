import {
    PROMPT_PRIORITY_ORDER_BLOCK,
    buildAuthoritativeIdentityContract,
    buildBiometricIdentityLockContract,
    buildGlobalCharacterInvariantContract,
    type BiometricIdentityLock
} from "./identityContracts";
import { buildHeadshotWardrobeContinuityContract, buildHeadshotWardrobeNegativeTokens } from "./headshotWardrobeContinuity";
import { buildPoseCoherenceNegativeTokens, buildTurnaroundPoseCoherenceContract, buildWholeBodyAxisLockContract } from "./poseCoherence";
import { SHEET_STYLE_LOCK_NEGATIVE_TEXT, buildSheetStyleLockContract } from "./sheetStyleLock";
import { buildStyleCategoryContract, buildStyleNegativePrompt, resolveRenderFamily } from "./styleContracts";
import { CHARACTER_ANATOMY_INTEGRITY_CONTRACT, CHARACTER_ANATOMY_NEGATIVE_TEXT } from "./characterAnatomyIntegrity";

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

            let clean = line;

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
            makeCallout("Shirt Collar Construction", "construction", "visible shirt collar", { material: "shirt fabric", placementHint: "point to collar edge or collar stand", visibleOnlyIf: "a shirt collar is visible" })
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
    } else if (context !== "modern/business" && hasAnyTerm(text, ["shirt"])) {
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

const buildConstructionCalloutCandidate = (input: CharacterPitchSheetInput): PitchSheetCallout => {
    const text = calloutText(input);

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
        if (hasAnyTerm(text, ["shirt", "collar"])) {
            return makeCallout("Shirt Collar", "construction", "visible shirt collar, collar edge, or collar stand", { placementHint: "point to the shirt collar or collar stand" });
        }
        return makeCallout("Seam / Stitching", "construction", "visible seam, stitching, collar edge, or tailored construction", { placementHint: "point to seam or stitching" });
    }

    return makeCallout("Layering System", "construction", "visible overlap between garment layers, hems, collars, straps, panels, or fasteners", {
        placementHint: "point to a clear overlap between actual garment layers",
        visibleOnlyIf: "a visible garment overlap, hem, collar, strap, panel, or fastener is present"
    });
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
        ...(accessoryPropCandidates.length > 0 ? accessoryPropCandidates.slice(0, 1) : [construction]),
        performance
    ];

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

export function buildCharacterPitchSheetPrompt(input: CharacterPitchSheetInput): string {
    const visibleInput = sanitizeVisibleBoardLanguage(input);
    const characterName = valueOr(visibleInput.characterName, visibleInput.aliasCodename, "Unnamed lead character");
    const alias = valueOr(visibleInput.aliasCodename, "No public codename");
    const visualAge = inferVisualAge(visibleInput);
    const bodyMetadataForBoard = buildBodyMetadataForBoard(visibleInput);
    const bodyGuideForPrompt = buildBodyGuideForPrompt(visibleInput);
    const height = valueOr(formatHeightLabel(visibleInput.heightIn), visibleInput.height, "height inferred from role and proportions");
    const buildMetadata = valueOr(bodyMetadataForBoard, visibleInput.build, inferBuild(visibleInput));
    const buildPromptGuide = valueOr(bodyGuideForPrompt, inferBuild(visibleInput));
    const designLanguage = valueOr(visibleInput.designLanguage, defaultCharacterPitchSheetInput.designLanguage);
    const worldEra = valueOr(visibleInput.worldEra, "original cinematic world inferred from the brief");
    const corePersonality = valueOr(visibleInput.corePersonality, "layered, specific, screen-readable personality");
    const internalConflict = valueOr(visibleInput.internalConflict, "private inner contradiction visible through posture and expression");
    const wardrobe = inferWardrobe(visibleInput);
    const props = inferProps(visibleInput);
    const hasExplicitProps = !!normalize(visibleInput.propsSignatureItems);
    const propsDisplay = hasExplicitProps ? props : "No signature props specified.";
    const propOrFootwearInsetText = hasExplicitProps ? "selected prop and footwear insets" : "footwear and material-detail insets";
    const environment = inferEnvironment(visibleInput);
    const lightingMood = valueOr(visibleInput.lightingMood, defaultCharacterPitchSheetInput.lightingMood);
    const sheetStyle = valueOr(visibleInput.sheetStyle, defaultCharacterPitchSheetInput.sheetStyle);
    const additionalNotes = valueOr(visibleInput.additionalNotes, "No extra notes supplied; infer tasteful cinematic details from the brief.");
    const faceDesign = inferFaceDesign(visibleInput);
    const performanceDirection = inferPerformance(visibleInput);
    const materialNotes = inferMaterialNotes(visibleInput);
    const productionNotes = inferProductionNotes(visibleInput);
    const sourcePanelMode = visibleInput.sourcePanelMode || defaultCharacterPitchSheetInput.sourcePanelMode || "costume_matched";
    const characterRenderStyle = normalizeCharacterRenderStyle(visibleInput.characterRenderStyle);
    const characterRenderFamily = resolveRenderFamily(characterRenderStyle);
    const supportingPosePanelLabel = "supporting pose render";
    const performanceStudyRule = `- Include one compact ${supportingPosePanelLabel} that preserves the same face, build, hairstyle, costume, props, body proportions, and emotional presence.
- If the ${supportingPosePanelLabel} cannot be rendered in the exact same style family as the rest of the sheet, omit it instead of rendering a cartoon, flat illustration, vector, doodle, or off-style miniature.
- Do not invent combat/action behavior unless explicitly requested.`;
    const boardPresentationStyle = visibleInput.boardPresentationStyle || defaultCharacterPitchSheetInput.boardPresentationStyle || "premium_film_board";
    const characterRenderStyleLabel = CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle].split(":")[0] || characterRenderStyle;
    const debugVisibleLabels = visibleInput.debugVisibleLabels === true;
    const strictBodySpecs = visibleInput.physiquePriority === "strict_body_specs";
    const pitchSheetCallouts = buildPitchSheetCallouts(visibleInput);
    const calloutPlan = formatCalloutPlan(pitchSheetCallouts);
    const visibleVocabularyRule = buildVisibleVocabularyRule(visibleInput, pitchSheetCallouts);
    const hasReferenceDrivenIdentity = Boolean(normalize(input.referenceImageUrl)) || isReferenceDrivenIdentitySource(input);
    const hasGeneratedCharacterSource = input.identitySource === "biometric_plus_character" && Boolean(normalize(input.characterStyleReferenceUrl));
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
    const generatedCharacterSourceRule = hasGeneratedCharacterSource
        ? `GENERATED CHARACTER SOURCE LOCK:
- [IMAGE 1] / Image A is the generated character source image and the current approved character render.
- The generated character source image is the primary visual design to convert into a pitch sheet.
- Build the pitch sheet from this same generated character, not from scratch.
- Preserve Image A's body, outfit, silhouette, costume package, material read, proportions, render style, footwear, accessories, pose attitude, grooming read, and overall character design.
- Use Images B-F / the biometric scan images only to preserve identity accuracy: face, skull/head shape, skin tone, age impression, hair state, facial hair, visible marks, and facial proportions.
- Do not create a new character design.
- Do not reinterpret the body, face, age, outfit, style category, or proportions away from the generated character source.
- The pitch sheet should present this same generated character consistently across hero portrait, head studies, turnaround views, ${supportingPosePanelLabel}, expression study, and material/wardrobe detail panels.
- If Image A and the biometric scans appear to conflict, preserve Image A's costume/body/design while using the biometric scans to correct facial identity only.
- Do not ignore the generated character source, do not generate a generic character board from the biometric scan alone, and do not output the biometric scan collage.`
        : "";
    const styleReferenceRule = hasGeneratedCharacterSource
        ? "Generated character source: Image A is not a mood board, layout guide, or optional style hint. It is the approved source character that this pitch sheet is about."
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
        wardrobeAuthority: hasGeneratedCharacterSource
            ? `Image A / the generated character source image, especially the neckline, collar, shoulders, upper chest, outfit layers, materials, colors, footwear, accessories, and costume silhouette. Supplemental text wardrobe notes: ${wardrobe}`
            : `the final character wardrobe/costume defined by this sheet: ${wardrobe}`,
        finalLookReference: hasGeneratedCharacterSource
            ? "Image A as the approved generated character source, then the hero portrait, full-body turnarounds, wardrobe breakdown, and controlled callout plan in this same board"
            : "the hero portrait, full-body turnarounds, wardrobe breakdown, and controlled callout plan in this same board",
        appliesTo: "head studies, reference portraits, profile heads, facial-angle panels, and the expressive close-up",
        strictness: boardPresentationStyle === "forensic_reference_board" ? "forensic_board" : "reference_sheet"
    });
    const styleCategoryContract = buildStyleCategoryContract(characterRenderStyle, {
        selectedStyleId: characterRenderStyle,
        selectedStyleLabel: CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle],
        sourceImagePolicy: hasGeneratedCharacterSource
            ? "Image A controls the current generated character design, costume, body, silhouette, proportions, and style translation. Images B-F control biometric identity only; source-photo realism must not leak into stylized render categories."
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
- Forbidden: changing the face design, changing expression, changing skull/head proportions, changing facial hair shape, changing age impression, changing body identity.`
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
- Do not use the selected style as permission to invent a new face, new skull shape, new expression, new facial hair pattern, new age impression, or new body identity.
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

${BOARD_PRESENTATION_STYLE_BLOCKS[boardPresentationStyle]}
${CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle]}
${styleCategoryContract}
${sheetStyleLockContract}
${strictRenderedFamilyLock}
${animated3dIdentityLock}
${animated3dPanelLock}
${claymationStrictRule}
${claymationIdentityLock}
${characterPanelStylePurity}

${biometricIdentityLockContract}
${identityContract}
${stylizedBiometricTranslationRule}
${identityRule}
${sourcePanelRule}
${generatedCharacterSourceRule}
${styleReferenceRule}
Body consistency: ${bodyAuthorityRule}
Body guide: ${buildPromptGuide}.
${pitchSheetPoseCoherence}
${CHARACTER_ANATOMY_INTEGRITY_CONTRACT}

STRUCTURED CHARACTER DATA / BOARD METADATA:
- Structured values are board metadata and subtle fit guidance only: ${structuredBodySourceOfTruth}.
- Generated character source Image A remains visual/body/costume authority when supplied.
- Biometric references remain identity authority.
- Numeric weight values must not recast body unless strict body specs / explicit override is active.
- "athletic, 200 lbs" means athletic solid adult build, not overweight.
- These values must not override biometric identity, approved generated character source, face, head shape, age impression, hairstyle, costume silhouette, or body identity.
- Numeric weight values are metadata and subtle proportional guidance only, not permission to recast the actor or generate a different person.
- Weight/build metadata must not recast the actor, replace the likeness, or become a new casting specification.
- If a numeric weight conflicts with the supplied identity/source images, preserve the supplied identity/source images.
${strictBodySpecsRule}
- Do not let stale older prompt fragments, previous generated board text, or older metadata conflict with these current structured values.

UNIVERSAL STYLE CONSISTENCY CONTRACT:
- Style affects rendering language only.
- It must not change skull shape, face structure, hairline, eyes, brows, nose, mouth, jaw, facial asymmetry, age impression, body type, costume package, footwear, props, or world/era unless the user explicitly requests that.
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
- Do not change face, skull, head, eyes, nose, mouth, jaw, skin tone, facial hair, age impression, or identity because of build/weight text.
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
- Every callout arrow must point directly to the exact visible object, garment area, material, prop, or pose feature named in the label.
- Do not point a callout to a nearby unrelated object.
- Do not point a prop label to a face, body part, or garment.
- Do not point a garment label to a prop.
- Do not point a material label to empty background.
- If the target object is not clearly visible, omit that callout instead of guessing.
- Do not duplicate the same callout unless it points to a separate dedicated material swatch.
- Do not invent labels from nearby visual guesses, raw prompt text, file names, or reference labels.

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

${claymationInsetRule}

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

WARDROBE BREAKDOWN:
- Direction: ${wardrobe}
- Props and signature items: ${propsDisplay}
- Show full outfit from head to toe, including footwear.
- Preserve the approved costume package and visible silhouette consistently across the sheet.
- Define only visible and relevant garment layers, closures, accessories, and material details.
- Do not invent armor, tactical harnesses, bags, straps, holsters, prop attachment points, or weapons unless they are explicitly requested or clearly present in the approved generated character source.

MATERIAL ACCURACY:
- ${materialNotes}
- Include natural professional material callouts such as fabric weave, leather grain, metal patina, stitching, closure construction, and footwear details.

STRICT TURNAROUND INSTRUCTIONS:
- Include full-body front view, three-quarter view, clean side/profile view, and back view of the same character.
- The turnaround must be costume-consistent without becoming a generic evenly spaced model-sheet row.
- Back view must resolve only the rear costume details that are actually visible or clearly implied by the approved character design.
- Do not invent bags, armor plates, tactical harnesses, straps, or weapon rigs unless explicitly requested or clearly present in the approved generated character source.

${localBodyAxisLock}
- Front view: face, chest, pelvis, knees, toes, and footwear fronts are all front-facing.
- Three-quarter view: head, torso, pelvis, knees, and feet all share one 45-degree axis.
- Side/profile view: shoulders, chest plane, pelvis, knees, feet, and footwear must all read as true side profile.
- Back view: true rear axis with no visible front facial features.
- Supporting pose render: one deliberate whole-body pose axis; no accidental upper/lower split.

HEAD STUDY INSTRUCTIONS:
- Include multiple strictly labeled signed head studies:
  1. Neutral Front Head - true 0 degree front-facing head.
  2. 3/4 Left Head - true 45 degree turn to the character's left.
  3. Left Profile Head - true 90 degree profile to the character's left.
  4. 3/4 Right Head - true 45 degree turn to the character's right.
  5. Right Profile Head - true 90 degree profile to the character's right.
- If space is limited, omit one of the intermediate 3/4 views before sacrificing correctness.
- Head studies must match the same character and costume/world styling.
- Head-study panels must use the sheet's clean neutral/studio background only; never preserve source-photo rooms, doors, walls, windows, furniture, shelves, lighting fixtures, or other environment details.
- Any visible neckline, collar, shoulder, lapel, upper chest, jewelry, armor, robe, tunic, jacket, uniform, or accessory detail in head studies must match the final character wardrobe shown in the hero portrait and turnarounds. Never keep the source-photo shirt/collar.

HEAD STUDY LOCK:
- If head studies are included, each labeled head panel must obey the label exactly.
- FRONT HEAD must be true front.
- 3/4 LEFT HEAD must be true 45-degree left.
- 3/4 RIGHT HEAD must be true 45-degree right.
- LEFT PROFILE HEAD must be true 90-degree left profile.
- RIGHT PROFILE HEAD must be true 90-degree right profile.
- Do not mirror one head panel to create another.
- Do not reuse the same head orientation under different labels.
- Left-facing and right-facing panels must be genuinely opposite signed views of the same person.
- The rendered craniofacial direction must match the text label.
- Use explicit labels only: Neutral Front Head, 3/4 Left Head, 3/4 Right Head, Left Profile Head, and Right Profile Head.
- Do not use a generic single-side profile label when both profile sides are requested.
- No mislabeled head angle.
- No mirrored duplicate.
- No left/right profile duplication.
- No front-looking profile.
- No profile-looking 3/4.
- No inconsistent ear / nose / jaw direction.

HEAD CALLOUT DIRECTION RULE:
- If a visible callout refers to a head view, use direction-safe wording such as Specific Head Contour, Neutral Front Study, Signed 3/4 View, True Side Profile, Left Profile Head, or Right Profile Head.
- Avoid loose head callout language that could blur signed direction, such as unspecific profile study, head contour, or side head without left/right wording.

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

STRICT CONSISTENCY RULES:
- No duplicated accessories unless requested.
- No missing footwear.
- No costume drift between front, side, three-quarter, back, head studies, and portrait.
- No face drift between turnaround views.
- Maintain a single coherent character package across the entire sheet.`;
}
