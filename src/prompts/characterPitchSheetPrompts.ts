import { PROMPT_PRIORITY_ORDER_BLOCK, buildAuthoritativeIdentityContract } from "./identityContracts";

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

export type PitchSheetCallout = {
    label: string;
    category:
        | "garment"
        | "material"
        | "footwear"
        | "accessory"
        | "prop"
        | "body"
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
    debugVisibleLabels: false,
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
    if (hasAnyTerm(text, ["mascot", "plush", "character suit"]) || characterRenderStyle === "animated_feature" || characterRenderStyle === "anime_manga") return "stylized/animated";
    if (hasAnyTerm(text, ["sci-fi", "science fiction", "cyberpunk", "futuristic", "space", "starship", "android", "interface", "tech jacket", "tactical"])) return "sci-fi/cyberpunk";
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
            makeCallout("Fur Pattern", "body", "visible fur pattern on body or head", { material: "fur", placementHint: "point to fur, not costume fabric", visibleOnlyIf: "fur is visibly present" }),
            makeCallout("Horn / Scale Texture", "body", "visible horn, scale, or hide texture", { material: "horn, scale, or hide", placementHint: "point only to creature anatomy", visibleOnlyIf: "horns, scales, or textured hide are visible" })
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
            makeCallout("Signature Silhouette", "body", "overall readable character silhouette", { placementHint: "point to the character outline or silhouette study" }),
            makeCallout("Character Color Blocking", "material", "visible costume color zones", { material: "costume color/material areas", placementHint: "point to a clear color block or material swatch" })
        );
    } else if (context === "historical/period") {
        callouts.push(
            makeCallout("Period Outer Layer", "garment", "visible cloak, robe, coat, mantle, or outer garment", { material: "period-appropriate textile", placementHint: "point to the outer garment", visibleOnlyIf: "an outer layer is visible" }),
            makeCallout("Period Inner Layer", "garment", "visible tunic, shirt, robe, or dress layer", { material: "historically inspired textile", placementHint: "point to the inner garment body" })
        );
    } else {
        callouts.push(
            makeCallout("Primary Garment", "garment", "visible main garment or outer layer", { placementHint: "point to the named garment, not a background area" }),
            makeCallout("Layering System", "construction", "visible overlap between garment layers", { placementHint: "point to layered hems, collars, straps, or fasteners" })
        );
    }

    if (hasAnyTerm(text, ["cloak", "cape", "mantle"])) {
        callouts.unshift(makeCallout("Cloak Layer", "garment", "visible cloak, cape, or mantle", { material: "outer textile", placementHint: "point to cloak fabric or hem" }));
    }
    if (hasAnyTerm(text, ["tunic"])) {
        callouts.unshift(makeCallout("Tunic Construction", "garment", "visible tunic body", { material: "fabric", placementHint: "point to the tunic body" }));
    } else if (hasAnyTerm(text, ["robe", "cloak"])) {
        callouts.unshift(makeCallout("Outer Garment Layer", "garment", "visible robe, cloak, or outer garment", { material: "fabric", placementHint: "point to the outer garment body" }));
    } else if (hasAnyTerm(text, ["dress", "gown"])) {
        callouts.unshift(makeCallout("Dress Silhouette", "garment", "visible dress or gown", { material: "fabric", placementHint: "point to the dress/gown body" }));
    } else if (hasAnyTerm(text, ["shirt"])) {
        callouts.unshift(makeCallout("Shirt Construction", "garment", "visible shirt body, collar, or sleeve", { material: "fabric", placementHint: "point to the shirt body" }));
    }
    if (hasAnyTerm(text, ["armor", "armour", "breastplate", "plate", "pauldron"])) {
        callouts.unshift(makeCallout("Armor Panel", "garment", "visible armor plate or protective panel", { material: "metal, leather, or composite armor", placementHint: "point to the armor panel, not fabric underneath" }));
    }
    if (hasAnyTerm(text, ["emblem", "insignia", "crest", "logo"])) {
        callouts.push(makeCallout("Emblem Detail", "accessory", "visible emblem, insignia, crest, or badge", { placementHint: "point to the emblem itself", visibleOnlyIf: "an emblem or insignia is visible" }));
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

    if (callouts.length === 0) {
        callouts.push(makeCallout("Primary Material Swatch", "material", "clearest visible costume material or material swatch", { placementHint: "point only to a visible material that can be identified confidently" }));
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
    const firstProp = props.split(/[,;\n]+/).map(part => sanitizeVisibleBoardText(part, input)).find(Boolean);

    if (firstProp) {
        callouts.push(makeCallout(`${firstProp} Detail`, "prop", `visible ${firstProp} or dedicated prop inset`, { placementHint: "point only to the named prop or prop inset" }));
    }

    if (hasAnyTerm(text, ["watch", "bracelet", "ring", "necklace", "earring", "glasses", "bag", "belt", "sash", "harness", "insignia", "badge", "jewelry", "jewellery"])) {
        if (hasAnyTerm(text, ["watch"])) {
            callouts.push(makeCallout("Watch / Accessory Detail", "accessory", "visible watch or wrist accessory", { material: "metal, leather, or modern accessory material", placementHint: "point to the watch/accessory, not sleeve fabric" }));
        } else if (hasAnyTerm(text, ["belt", "sash", "harness", "strap"])) {
            callouts.push(makeCallout("Belt / Strapwork", "accessory", "visible belt, sash, harness, or strapwork", { material: "leather, textile, or webbing", placementHint: "point to the belt/strap itself" }));
        } else {
            callouts.push(makeCallout("Accessory Detail", "accessory", "visible jewelry, bag, eyewear, insignia, or accessory", { placementHint: "point only to the accessory" }));
        }
    }

    if (describeCalloutContext(input) === "fantasy/adventure" && hasAnyTerm(text, ["sword", "dagger", "staff", "shield", "bow", "weapon"])) {
        callouts.push(makeCallout("Weapon Grip Detail", "prop", "visible weapon grip, handle, shield grip, or prop inset", { material: "wood, leather, metal, or prop material", placementHint: "point to the grip or prop detail" }));
    }
    if (describeCalloutContext(input) === "robot/mech" && hasAnyTerm(text, ["core", "chest", "power"])) {
        callouts.push(makeCallout("Power Core / Chest Detail", "construction", "visible chest module, core, or central panel", { material: "metal/composite/glass", placementHint: "point only to the chest/core detail" }));
    }

    return callouts;
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
    if (hasAnyTerm(text, ["clasp", "buckle", "closure", "fastener", "button", "zipper", "lacing"])) {
        return makeCallout("Closure Construction", "construction", "visible clasp, buckle, closure, button, zipper, lacing, or fastener", { placementHint: "point to the fastener itself" });
    }
    if (hasAnyTerm(text, ["stitch", "seam", "tailored", "collar"])) {
        return makeCallout("Seam / Stitching Detail", "construction", "visible seam, stitching, collar edge, or tailored construction", { placementHint: "point to seam or stitching detail" });
    }

    return makeCallout("Construction Detail", "construction", "visible seam, fastener, strap, panel, joint, or garment structure", { placementHint: "point to a clear construction detail" });
};

export function buildPitchSheetCallouts(input: CharacterPitchSheetInput): PitchSheetCallout[] {
    const garmentCandidates = buildGarmentCalloutCandidates(input);
    const materialCandidates = buildMaterialCalloutCandidates(input);
    const accessoryPropCandidates = buildAccessoryOrPropCalloutCandidates(input);
    const footwear = buildFootwearCalloutCandidate(input);
    const construction = buildConstructionCalloutCandidate(input);
    const performance = buildPerformanceCalloutCandidate(input);

    const selected = [
        ...garmentCandidates.slice(0, 3),
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
    return `WORLD / ERA VISIBLE VOCABULARY:
- Visible costume, material, prop, environment, and callout labels must match the selected world or era: ${valueOr(input.worldEra, "the character's world")}.
- Do not import futuristic, medieval, modern, tactical, cybernetic, fantasy, religious, or technical vocabulary unless it fits the selected world/era or user-provided wardrobe/props.
- If the user selects a historical world, keep callouts historically inspired.
- If the user selects sci-fi, allow technology, armor, interface, and synthetic-material language only when those objects are part of the costume/props.
- If the user selects modern, use modern garment, tailoring, footwear, and accessory language.
- If the user selects fantasy, use fantasy-appropriate but still material-accurate garment, armor, prop, and construction language.
- If the user selects creature, mascot, or robot, use anatomy, material, and construction labels appropriate to that character type.
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

    const personality = valueOr(input.corePersonality, "complex, readable personality");
    const conflict = valueOr(input.internalConflict, "private emotional pressure");
    const designLanguage = valueOr(input.designLanguage, defaultCharacterPitchSheetInput.designLanguage);

    return `Distinct face shaped by ${personality} and ${conflict}: memorable silhouette, intentional facial structure, subtle asymmetry, lived-in skin detail, hairline and brow choices that match ${designLanguage}.`;
};

const inferPerformance = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.performanceDirection);
    if (supplied) return supplied;

    const personality = valueOr(input.corePersonality, "controlled, watchful presence");
    const conflict = valueOr(input.internalConflict, "unspoken inner tension");

    return `Body language communicates ${personality}; expression carries ${conflict}. Keep the performance cinematic and specific.`;
};

const inferWardrobe = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.wardrobeDirection);
    if (supplied) return supplied;

    const world = valueOr(input.worldEra, "the character's inferred world");
    const designLanguage = valueOr(input.designLanguage, defaultCharacterPitchSheetInput.designLanguage);

    return `Wardrobe inferred from ${world} and ${designLanguage}: clear silhouette, functional layering, visible footwear, and one memorable costume signature repeated consistently from every angle.`;
};

const inferProps = (input: CharacterPitchSheetInput): string => {
    const supplied = normalize(input.propsSignatureItems);
    if (supplied) return supplied;

    const world = valueOr(input.worldEra, "the story world");

    return `One or two signature items inferred from ${world}, with precise placement and scale.`;
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

    return "Render fabric, leather, metal, footwear, stitching, closures, straps, edges, wear, and patina with production-ready clarity.";
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

const CHARACTER_RENDER_STYLE_BLOCKS: Record<CharacterPitchSheetRenderStyle, string> = {
    biometric_realism: `Biometric Realism: Realistic actor-based character design sheet. Use face references for likeness. Same subject across all panels. Realistic skin, wardrobe, and materials. No illustration or generic substitute casting.`,
    cinematic_photoreal: `Cinematic Photoreal: Premium film-grade character design board. Realistic actor-based likeness, cinematic lighting, believable wardrobe, strong production presentation. Same subject across panels. Do not turn into a plain corporate reference sheet.`,
    stylized_realism: `Active render style contract: stylized realism.
- May change: controlled shape simplification, painterly surface language, color design, edge treatment, and realistic stylization level.
- Must preserve: recognizable face anchors, facial proportions, body mass, shoulder/waist relationship, costume construction, footwear, accessories, props, and world/era.
- Style risk guard: do not bulk, widen, slim, exaggerate, genericize the face, or convert the body into a default stylized template.`,
    animated_feature: `Active render style contract: animated feature.
- May change: animated surface finish, appealing line/shape language, simplified texture, family-feature lighting, and animation-ready material treatment.
- Must preserve: this actor's identity translated into the style, recognizable face anchors, body proportions, costume, footwear, accessories, props, and world/era.
- Style risk guard: translate this actor; do not invent a new animated character, mascot, archetype, or unrelated feature-film face.`,
    editorial_illustration: `Active render style contract: editorial illustration.
- May change: illustration texture, value hierarchy, refined color blocking, brush/print finish, and magazine-quality surface treatment.
- Must preserve: actor identity, face structure, body proportions, costume, footwear, accessories, props, and world/era.
- Style risk guard: do not simplify into a generic fashion illustration, replace the wardrobe, or prioritize graphic elegance over likeness continuity.`,
    concept_art: `Active render style contract: concept art.
- May change: polish level, production-design finish, material rendering clarity, atmosphere, and callout presentation.
- Must preserve: actor identity, face structure, body proportions, established costume, footwear, accessories, props, and world/era.
- Style risk guard: polish, clarify, and resolve; do not redesign, recast, change silhouette, add new gear, or upgrade the world into another genre.`,
    graphic_novel: `Active render style contract: graphic novel.
- May change: line weight, ink treatment, panel-ready shadows, halftone/print texture, contrast, and graphic surface language.
- Must preserve: recognizable actor identity, face shape, body proportions, costume, footwear, accessories, props, and world/era.
- Style risk guard: do not replace the face with a comic archetype, inflate anatomy, alter costume continuity, or add genre-inappropriate symbols.`,
    anime_manga: `Active render style contract: anime/manga.
- May change: anime/manga linework, eye rendering language, simplified planes, cel shading, screen-tone texture, and stylized surface finish.
- Must preserve: recognizable identity anchors, face silhouette, key facial proportions, age impression, body proportions, costume, footwear, accessories, props, and world/era.
- Style risk guard: preserve this subject's identity; do not default to a generic anime face, change ethnicity cues, reshape the body, or replace costume logic.`
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
    const bodyGuide = buildBodyGuide(visibleInput);
    const height = valueOr(formatHeightLabel(visibleInput.heightIn), visibleInput.height, "height inferred from role and proportions");
    const build = valueOr(bodyGuide, visibleInput.build, inferBuild(visibleInput));
    const designLanguage = valueOr(visibleInput.designLanguage, defaultCharacterPitchSheetInput.designLanguage);
    const worldEra = valueOr(visibleInput.worldEra, "original cinematic world inferred from the brief");
    const corePersonality = valueOr(visibleInput.corePersonality, "layered, specific, screen-readable personality");
    const internalConflict = valueOr(visibleInput.internalConflict, "private inner contradiction visible through posture and expression");
    const wardrobe = inferWardrobe(visibleInput);
    const props = inferProps(visibleInput);
    const environment = inferEnvironment(visibleInput);
    const lightingMood = valueOr(visibleInput.lightingMood, defaultCharacterPitchSheetInput.lightingMood);
    const sheetStyle = valueOr(visibleInput.sheetStyle, defaultCharacterPitchSheetInput.sheetStyle);
    const additionalNotes = valueOr(visibleInput.additionalNotes, "No extra notes supplied; infer tasteful cinematic details from the brief.");
    const faceDesign = inferFaceDesign(visibleInput);
    const performanceDirection = inferPerformance(visibleInput);
    const materialNotes = inferMaterialNotes(visibleInput);
    const productionNotes = inferProductionNotes(visibleInput);
    const sourcePanelMode = visibleInput.sourcePanelMode || defaultCharacterPitchSheetInput.sourcePanelMode || "costume_matched";
    const characterRenderStyle = visibleInput.characterRenderStyle || defaultCharacterPitchSheetInput.characterRenderStyle || "biometric_realism";
    const boardPresentationStyle = visibleInput.boardPresentationStyle || defaultCharacterPitchSheetInput.boardPresentationStyle || "premium_film_board";
    const debugVisibleLabels = visibleInput.debugVisibleLabels === true;
    const pitchSheetCallouts = buildPitchSheetCallouts(visibleInput);
    const calloutPlan = formatCalloutPlan(pitchSheetCallouts);
    const visibleVocabularyRule = buildVisibleVocabularyRule(visibleInput, pitchSheetCallouts);
    const hasReferenceDrivenIdentity = Boolean(normalize(input.referenceImageUrl)) || isReferenceDrivenIdentitySource(input);
    const hasCharacterStyleReference = input.identitySource === "biometric_plus_character" && Boolean(normalize(input.characterStyleReferenceUrl));
    const identityContract = isBiometricIdentitySource(input)
        ? buildAuthoritativeIdentityContract({
            sourceDescription: "the original multi-view biometric source image set",
            identityRangeText: "the supplied center/front, left, right, up, and down identity anchors",
            generatedLayoutReferenceText: hasCharacterStyleReference ? "the approved character/style image can guide presentation, lighting, costume continuity, and board feel only" : undefined
        })
        : hasReferenceDrivenIdentity
            ? buildAuthoritativeIdentityContract({
                sourceDescription: "the uploaded portrait identity reference",
                generatedLayoutReferenceText: hasCharacterStyleReference ? "the approved character/style image can guide presentation, lighting, costume continuity, and board feel only" : undefined
            })
            : buildAuthoritativeIdentityContract({
                sourceDescription: "the character identity defined by the current text brief"
            });
    const identityRule = hasReferenceDrivenIdentity
        ? "Identity consistency: use supplied references as identity guidance, and keep the same subject across the hero portrait, head studies, turnaround figures, action pose, and expression study."
        : "Identity consistency: keep the same invented character identity across the hero portrait, head studies, turnaround figures, action pose, and expression study.";
    const sourcePanelRule = hasReferenceDrivenIdentity && sourcePanelMode === "costume_matched"
        ? "Source panel mode: Costume Matched. Raw reference photos are hidden identity authority only; visible head studies must be costume/world matched with no raw technical labels."
        : hasReferenceDrivenIdentity && sourcePanelMode === "raw_source"
            ? debugVisibleLabels
                ? "Source panel mode: Raw Source. Raw references may appear as subordinate reference inserts; debug labels are permitted only because debugVisibleLabels is true."
                : "Source panel mode: Raw Source. Raw references may appear only as subordinate inserts with clean labels such as Actor Reference, Front Reference, Profile Reference, Side Reference, or Back Reference; rendered character panels still use the character costume and world."
            : hasReferenceDrivenIdentity && sourcePanelMode === "hidden"
                ? "Source panel mode: Hidden. Do not show source-photo panels; use references only to guide identity."
                : "";
    const styleReferenceRule = hasCharacterStyleReference
        ? "Style reference: borrow approved wardrobe, lighting, and character-design language from the supplied character image while keeping the same subject identity."
        : "";
    const structuredBodySourceOfTruth = [
        `character name: ${characterName}`,
        `codename: ${alias}`,
        `visual age: ${visualAge}`,
        `height: ${height}`,
        `build/body: ${build}`
    ].join("; ");

    return `Create a full cinematic production-grade CHARACTER PITCH SHEET for ${characterName}. The result must feel like a premium character design board for film development, not a generic model sheet.

${PROMPT_PRIORITY_ORDER_BLOCK}

${BOARD_PRESENTATION_STYLE_BLOCKS[boardPresentationStyle]}
${CHARACTER_RENDER_STYLE_BLOCKS[characterRenderStyle]}

${identityContract}
${identityRule}
${sourcePanelRule}
${styleReferenceRule}
Body consistency: keep the same proportions, body mass, shoulder width, waist relationship, limb thickness, and overall build across all full-body views. Body guide: ${build}.

STRUCTURED CHARACTER DATA SOURCE OF TRUTH:
- Use the current structured UI values as the single source of truth for character name, codename, visual age, height, build, and body settings: ${structuredBodySourceOfTruth}.
- Do not let stale older prompt fragments, previous generated board text, or older metadata conflict with these current structured values.

UNIVERSAL STYLE CONSISTENCY CONTRACT:
- Style may change rendering treatment, lighting, texture, color finish, line language, and surface language only.
- Style must not change actor identity, face structure, skull geometry, age impression, body proportions, costume, footwear, accessories, props, or world/era.
- Treat the selected render style as an output treatment applied to the same character package, not as permission to redesign the character.

STYLE-PHYSIQUE RULE:
- Keep the body guide locked across every render style: ${build}. Do not let stylization alter height impression, frame size, body mass, shoulder width, waist relationship, limb thickness, footwear scale, or costume fit.

SOURCE PANEL MODE HAS PRIORITY OVER STYLE:
- Follow source panel mode before render style. If source panel mode hides raw references or requires costume-matched head studies, style must obey that mode and may only alter the rendered finish.

STYLE-SAFE VISIBLE LABELING:
- Visible labels must name costume, material, performance, prop, or production design details in clean film/costume-department language.
- Do not print render-style enum keys, app workflow terms, identity-system labels, reference attachment labels, or source panel implementation labels on the board.

STYLE DRIFT NEGATIVE CONSTRAINTS:
- No recasting, no beautifying into a different person, no generic photoreal model, no generic stylized face, no widened or bulked body, no new animated character, no costume redesign, no genre upgrade, no footwear changes, no accessory swaps, no prop replacements, no world/era drift.

${HEADSHOT_BACKGROUND_ISOLATION_RULE}

VISIBLE BOARD LANGUAGE RULE:
- Internal workflow terms such as NanoCast, biometric scanner, identity lock, source image, reference image, prompt engine, generated image, or debug image labels must not appear as visible text on the final board.
- Visible board text must sound like professional film-development and costume-department language appropriate to the character's world and era.
- Use internal reference and likeness logic only to preserve identity; do not turn it into board titles, costume labels, material callouts, or world-building text.

${visibleVocabularyRule}

CALLOUT ACCURACY RULE:
- Use only callouts appropriate to this character's world, wardrobe, props, accessories, footwear, board presentation style, and render style.
- Every callout arrow must point to the exact visible object or material named by the label.
- Do not point callouts to empty space.
- Do not label one material as another material.
- Do not label fabric as leather, leather as metal, metal as fabric, skin as costume, or background as wardrobe.
- Do not duplicate the same callout unless it points to a separate dedicated material swatch.
- Do not invent random labels that are not supported by the visible costume/prop design.
- If a material or object is not clearly visible, omit that callout instead of guessing.

CALLOUT CATEGORY PLACEMENT RULE:
- Garment callouts must point to the named garment.
- Material callouts must point to the matching visible material or material swatch.
- Footwear callouts must point only to footwear or a footwear inset.
- Accessory callouts must point to jewelry, belts, bags, glasses, watches, insignia, or other visible accessories.
- Prop callouts must point only to props or prop insets.
- Performance callouts must point to expression, stance, gesture, or pose, not costume materials.
- Construction callouts must point to seams, fasteners, stitching, closures, panels, joints, straps, or garment structure.
- Turnaround labels and material callouts must not be confused with each other.

CALLOUT COUNT RULE:
- Use 5 to 7 total visible callouts by default.
- Preferred distribution: 2 to 3 wardrobe/garment callouts, 1 to 2 material callouts, 1 footwear callout if footwear is visible, 1 accessory/prop callout if provided, and 1 performance/gesture callout if useful.
- Use a restrained number of accurate callouts. Fewer accurate callouts are better than many incorrect callouts.

STYLE-CALLOUT RULE:
- The selected render style may affect line quality, shading, material rendering, and presentation finish, but it must not create inaccurate callout labels or mismatch callouts to the wrong object.
- Callout labels must remain materially and contextually accurate regardless of style.

FORBIDDEN INTERNAL VISIBLE TERMS:
- Do not show internal workflow/debug terms as visible board callouts unless debugVisibleLabels is true.
- Forbidden by default: NanoCast; biometric scanner; identity lock; source image; reference image; Image 1; Image 2; Image 3; prompt engine; generated image; debug labels.
- Use clean character, costume, and production-board language instead.

CONTROLLED CALLOUT PLAN:
${calloutPlan}

VISIBLE CALLOUTS:
- Use the controlled callout plan above as the preferred visible callout set.
- Do not invent visible labels from raw prompt text, file/reference names, handoff text, image attachment names, internal identity terms, or render-style enum names.
- Omit any planned callout whose target is not clearly visible in the generated board.
- Keep visible labels specific and clean: no duplicate title/codename labels, no generic material-read labels, no standalone "Detail" labels, no malformed or duplicated label text.

NEGATIVE VISIBLE TEXT CONSTRAINTS:
- Do not write "NanoCast," "biometric scanner," "biometric closures," "biometric etching," "biometric clasp," "integrated circuitry," "circuitry," "scanner," "generated NanoCast character image," "source image," "reference image," "identity lock," "Image 1," "Image 2," "Image 3," or any internal technical/debug label anywhere on the visible board.
- Terms named in this negative list remain forbidden as visible text even if they appear in hidden reference attachment identifiers or internal instructions.

CHARACTER IDENTITY BLOCK:
- Name: ${characterName}
- Codename: ${alias}
- Visual age: ${visualAge}
- Height: ${height}
- Build: ${build}
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

PERFORMANCE DIRECTION:
- ${performanceDirection}
- Include one compact action pose or gesture study that preserves the same face, build, hairstyle, costume, props, and emotional presence.

WARDROBE BREAKDOWN:
- Direction: ${wardrobe}
- Props and signature items: ${props}
- Show full outfit from head to toe, including footwear.
- Define outer layer, inner layer, closures, belts, straps, jewelry, gloves, bags, armor, footwear, and prop attachment points with continuity-ready clarity.

MATERIAL ACCURACY:
- ${materialNotes}
- Include natural professional material callouts such as fabric weave, leather grain, metal patina, stitching, closure construction, and footwear details.

STRICT TURNAROUND INSTRUCTIONS:
- Include full-body front view, three-quarter view, clean side/profile view, and back view of the same character.
- The turnaround must be costume-consistent without becoming a generic evenly spaced model-sheet row.
- Back view must resolve rear closures, straps, layered hems, bags, armor plates, and footwear backs.

HEAD STUDY INSTRUCTIONS:
- Include rendered head studies: neutral front head, three-quarter head, side profile, and one expressive close-up.
- Head studies must match the same character and costume/world styling.
- Head-study panels must use the sheet's clean neutral/studio background only; never preserve source-photo rooms, doors, walls, windows, furniture, shelves, lighting fixtures, or other environment details.

CINEMATIC PORTRAIT INSTRUCTIONS:
- Include one larger cinematic portrait of ${characterName} with ${lightingMood}.
- Environment cue: ${environment}

PRODUCTION NOTES:
- ${productionNotes}
- Additional notes: ${additionalNotes}

PREMIUM ASYMMETRIC LAYOUT RULES:
- Use an editorial, high-end asymmetric layout: one dominant cinematic portrait, supporting full-body turnarounds, head studies, material detail callouts, and selected prop/footwear insets.
- Include the action pose as a designed supporting element, not a separate redesign.
- Avoid generic grid layouts, evenly spaced model-sheet rows, rigid contact-sheet spacing, and empty repeated boxes.
- Use tasteful negative space, layered scale hierarchy, subtle labels if needed, and composition that feels designed rather than templated.

STRICT CONSISTENCY RULES:
- No duplicated accessories unless requested.
- No missing footwear.
- No costume drift between front, side, three-quarter, back, head studies, and portrait.
- No face drift between turnaround views.
- Maintain a single coherent character package across the entire sheet.`;
}
