
import { useState, useEffect, useMemo } from "react";
import { RefreshCw, Terminal, Activity, Wand2, Sparkles, X, Download, UserPlus, Hammer, Fingerprint, Maximize2, Save, Calculator, ScanFace, Aperture, Check, RotateCcw, Copy, Lock, Unlock, FolderOutput, ChevronDown, ShieldCheck } from "lucide-react";
// Remove GlassCard import
import { Input } from "./ui/Input";
import { Slider } from "./ui/Slider";
import { Dropdown, type DropdownOption } from "./ui/Dropdown";
import type { CharacterDNA } from "../../types/characterDNA";
import { computeBMI, deriveBuildDescription } from "../../types/characterDNA";
import { useAppContext } from "../context/AppContext";
import type { CastMember, PendingPitchSheetHandoff, PendingRefSheetHandoff } from "../context/AppContext";
import { GeminiService } from "../services/GeminiService";
import { ensureAuthenticatedForGeneration } from "../services/AuthGenerationGate";
import { CastDirectorThinking } from "./ui/CastDirectorThinking";
import ConfirmDialog from "./ui/ConfirmDialog";
import { useRecentGenerationsStore } from "../stores/useRecentGenerationsStore";
import { RecentGenerationsCacheService } from "../services/RecentGenerationsCacheService";
import RecentGenerationsStrip from "./recent/RecentGenerationsStrip";
import { LibraryAssetMaterializer } from "../services/LibraryAssetMaterializer";
import ActorSaveModal from "./ActorSaveModal";
import { createUniqueDownloadFilename } from "../utils/downloadFilenames";
import {
    buildPortraitPrompt,
    LIGHTING_PRESETS,
    CAMERA_PRESETS,
    FACE_SHAPE_PRESETS,
    EYE_PRESETS,
    NOSE_PRESETS,
    LIP_PRESETS,
    JAW_PRESETS
} from "../../prompts/portraitPrompts";
import {
    buildCharacterPitchSheetPrompt,
    defaultCharacterPitchSheetInput,
    sanitizeVisibleBoardLanguage,
    mapNanoCastStyleToPitchSheetRenderStyle,
    type CharacterPitchSheetInput,
    type CharacterPitchSheetRenderStyle
} from "../../prompts/characterPitchSheetPrompts";


export type NanoRefSheetHandoff = PendingRefSheetHandoff;

type NanoPitchSheetHandoff = PendingPitchSheetHandoff;

const DEFAULT_DNA: CharacterDNA = {
    id: "default",
    identity: {
        sex: "Female",
        ethnicity: "Caucasian",
        lifeStage: "adult",
        age: 25,
        skinTone: "Fair",
    },
    morphology: {
        heightCm: 170,
        weightKg: 60,
        bmi: 20.8,
        buildDescription: "Average / Athletic",
    },
    face: {
        faceShape: "Oval",
        eyes: "Blue",
        nose: "Straight",
        lips: "Full",
        jaw: "Soft",
    },
    skin: {
        freckles: 0,
        scars: 0,
        dermalAge: 25,
        surfaceUnderEyeControl: true
    },
    hair: {
        style: "Long waves",
        color: "Blonde",
        length: "Long",
        texture: "Wavy",
    },
    render: {
        lighting: "Studio Softbox",
        camera: "85mm Portrait Lens",
        realismLevel: 100,
        stylizationLevel: 0,
    },
    // --- REFERENCE MODE DEFAULTS ---
    identityMode: "synthetic",
    refEditMode: "enhance",
    allowRefMorphology: true,
    allowRefHair: false,
    allowRefFace: false,
    allowRefSkin: false,
    likenessLock: 100
};

const LIFE_STAGES = {
    child: { min: 3, max: 12, label: "Child" },
    teen: { min: 13, max: 19, label: "Teen" },
    adult: { min: 20, max: 59, label: "Adult" },
    elder: { min: 60, max: 90, label: "Elder" }
};
type LifeStage = CharacterDNA["identity"]["lifeStage"];
type PortraitStudioMode = "portrait" | "pitch_sheet";
type PitchSheetAdvancedSectionKey = "face" | "performance" | "material" | "production";
type CharacterPitchSheetTextField = Extract<
    keyof CharacterPitchSheetInput,
    | "characterName"
    | "aliasCodename"
    | "visualAge"
    | "height"
    | "build"
    | "designLanguage"
    | "worldEra"
    | "lightingMood"
    | "sheetStyle"
    | "corePersonality"
    | "internalConflict"
    | "wardrobeDirection"
    | "propsSignatureItems"
    | "environment"
    | "additionalNotes"
    | "faceDetails"
    | "performanceDirection"
    | "materialCostumeNotes"
    | "productionNotes"
>;

const LIFE_STAGE_OPTIONS: Array<{ type: "option"; label: string; value: LifeStage }> = [
    { type: "option", label: "Child", value: "child" },
    { type: "option", label: "Teen", value: "teen" },
    { type: "option", label: "Adult", value: "adult" },
    { type: "option", label: "Elder", value: "elder" }
];

const isLifeStage = (value: string): value is LifeStage => {
    return value in LIFE_STAGES;
};

const actorLibraryStyleForCategory = (category: string): string => {
    switch (category) {
        case "anim":
            return "family_3d";
        case "illustration":
            return "retro_anime";
        case "scifi":
            return "cyberpunk_neon";
        case "realism":
        case "uncategorized":
        default:
            return "exact_studio";
    }
};

type FacePreset = {
    key: string;
    label: string;
    prompt: string;
    disabled?: boolean;
};

const FACE_FEATURES: Array<{
    label: string;
    field: keyof CharacterDNA["face"];
    presets: FacePreset[];
    placeholder: string;
}> = [
    { label: "Face Shape", field: "faceShape", presets: FACE_SHAPE_PRESETS, placeholder: "e.g. Oval" },
    { label: "Eyes", field: "eyes", presets: EYE_PRESETS, placeholder: "e.g. Blue" },
    { label: "Nose", field: "nose", presets: NOSE_PRESETS, placeholder: "e.g. Straight" },
    { label: "Lips", field: "lips", presets: LIP_PRESETS, placeholder: "e.g. Full" },
    { label: "Jawline", field: "jaw", presets: JAW_PRESETS, placeholder: "e.g. Soft" }
];

const PITCH_SHEET_SHORT_FIELDS: Array<{ field: CharacterPitchSheetTextField; label: string; placeholder: string }> = [
    { field: "characterName", label: "Character Name", placeholder: "e.g. Samson Vale" },
    { field: "aliasCodename", label: "Alias / Codename", placeholder: "e.g. The Ash Shepherd" },
    { field: "visualAge", label: "Visual Age", placeholder: "e.g. late 30s" },
    { field: "height", label: "Height", placeholder: "e.g. 6'2\"" },
    { field: "build", label: "Build", placeholder: "e.g. broad, weathered, powerful" },
    { field: "designLanguage", label: "Design Language", placeholder: "e.g. mythic western realism" },
    { field: "worldEra", label: "World / Era", placeholder: "e.g. post-collapse frontier city" },
    { field: "lightingMood", label: "Lighting Mood", placeholder: "e.g. warm dusk rim light" },
    { field: "sheetStyle", label: "Sheet Style", placeholder: "e.g. premium asymmetric pitch sheet" }
];

const PITCH_SHEET_LONG_FIELDS: Array<{ field: CharacterPitchSheetTextField; label: string; placeholder: string }> = [
    { field: "corePersonality", label: "Core Personality", placeholder: "e.g. gentle authority hiding a violent past" },
    { field: "internalConflict", label: "Internal Conflict", placeholder: "e.g. wants peace but believes he only brings ruin" },
    { field: "wardrobeDirection", label: "Wardrobe Direction", placeholder: "e.g. worn preacher coat, patched work shirt, dust-stained boots" },
    { field: "propsSignatureItems", label: "Props / Signature Items", placeholder: "e.g. iron prayer beads, broken revolver, field journal" },
    { field: "environment", label: "Environment", placeholder: "e.g. abandoned chapel workshop at the edge of a storm" },
    { field: "additionalNotes", label: "Additional Notes", placeholder: "Any must-have silhouette, story, or continuity detail..." }
];

const PITCH_SHEET_ADVANCED_SECTIONS: Array<{
    key: PitchSheetAdvancedSectionKey;
    field: CharacterPitchSheetTextField;
    label: string;
    placeholder: string;
}> = [
    { key: "face", field: "faceDetails", label: "Face Details", placeholder: "Specific skull shape, eyes, nose, scars, hairline, skin marks, grooming..." },
    { key: "performance", field: "performanceDirection", label: "Performance Direction", placeholder: "Posture, gaze, acting energy, expression range, movement quality..." },
    { key: "material", field: "materialCostumeNotes", label: "Material / Costume Notes", placeholder: "Fabric weight, leather wear, metal finish, closures, straps, jewelry, footwear..." },
    { key: "production", field: "productionNotes", label: "Production Notes", placeholder: "Continuity, casting, callouts, layout emphasis, production constraints..." }
];

const SOURCE_PANEL_MODE_OPTIONS: Array<{
    value: NonNullable<CharacterPitchSheetInput["sourcePanelMode"]>;
    label: string;
}> = [
    { value: "costume_matched", label: "Costume Matched" },
    { value: "raw_source", label: "Raw Source" },
    { value: "hidden", label: "Hidden" }
];

type CharacterRenderStyleOption =
    | Extract<DropdownOption, { type: "group" }>
    | (Extract<DropdownOption, { type: "option" }> & {
        value: NonNullable<CharacterPitchSheetInput["characterRenderStyle"]>;
    });

const CHARACTER_RENDER_STYLE_OPTIONS: CharacterRenderStyleOption[] = [
    { type: "group", label: "Realism" },
    { type: "option", value: "biometric_realism", label: "Biometric Realism" },
    { type: "option", value: "cinematic_photoreal", label: "Cinematic Photoreal" },
    { type: "option", value: "exact_studio", label: "Exact Studio" },
    { type: "option", value: "photorealism", label: "Photorealism" },
    { type: "option", value: "dslr_capture", label: "DSLR Capture" },
    { type: "group", label: "Stylized / Animation" },
    { type: "option", value: "stylized_realism", label: "Stylized Realism" },
    { type: "option", value: "animated_feature", label: "Animated Feature" },
    { type: "option", value: "family_3d", label: "Family 3D" },
    { type: "option", value: "premium_animated_3d", label: "Premium Animated 3D" },
    { type: "option", value: "claymation", label: "Claymation" },
    { type: "group", label: "Illustration" },
    { type: "option", value: "editorial_illustration", label: "Editorial Illustration" },
    { type: "option", value: "concept_art", label: "Concept Art" },
    { type: "option", value: "retro_cel", label: "Retro Cel" },
    { type: "option", value: "retro_anime", label: "Retro Anime" },
    { type: "option", value: "comic_book", label: "Comic Book" },
    { type: "option", value: "graphic_novel", label: "Graphic Novel" },
    { type: "option", value: "graphic_noir", label: "Graphic Noir" },
    { type: "option", value: "anime_manga", label: "Anime / Manga" },
    { type: "group", label: "Sci-Fi" },
    { type: "option", value: "cyberpunk_neon", label: "Cyberpunk Neon" },
    { type: "option", value: "cyberpunk", label: "Cyberpunk" },
    { type: "group", label: "Other" },
    { type: "option", value: "no_specific_style", label: "No Specific Style" }
];

const LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID = ["p", "i", "x", "a", "r"].join("");



const normalizePitchSheetRenderStyle = (value: unknown): NonNullable<CharacterPitchSheetInput["characterRenderStyle"]> => {
    const clean = typeof value === "string" ? value.trim() : "";
    if (clean === LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID) return "premium_animated_3d";

    const isKnownOption = CHARACTER_RENDER_STYLE_OPTIONS.some(option =>
        option.type === "option" && option.value === clean
    );

    return isKnownOption
        ? clean as NonNullable<CharacterPitchSheetInput["characterRenderStyle"]>
        : defaultCharacterPitchSheetInput.characterRenderStyle || "biometric_realism";
};

const BOARD_PRESENTATION_STYLE_OPTIONS: Array<{
    type: "option";
    value: NonNullable<CharacterPitchSheetInput["boardPresentationStyle"]>;
    label: string;
}> = [
    { type: "option", value: "premium_film_board", label: "Premium Film Board" },
    { type: "option", value: "clean_studio_sheet", label: "Clean Studio Sheet" },
    { type: "option", value: "art_department_board", label: "Art Department Board" },
    { type: "option", value: "forensic_reference_board", label: "Forensic Reference Board" },
    { type: "option", value: "merchandising_sheet", label: "Merchandising Sheet" }
];

const isPortraitStudioMode = (value: unknown): value is PortraitStudioMode => {
    return value === "portrait" || value === "pitch_sheet";
};

const safeFilenameSegment = (value: string): string => {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "character";
};

const parsePitchSheetHeightToInches = (value: string): number | undefined => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;

    const match = normalized.match(/(\d+)\s*(?:'|ft|feet)\s*(\d+)?/);
    if (!match) return undefined;

    return (Number(match[1]) * 12) + Number(match[2] || 0);
};

const parsePitchSheetWeightToLbs = (value: string): number | undefined => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;

    const match = normalized.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/);
    if (!match) return undefined;

    return Math.round(Number(match[1]));
};

const dedupeLines = (value: string): string => {
    const seen = new Set<string>();

    return value
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => {
            if (seen.has(line)) return false;
            seen.add(line);
            return true;
        })
        .join("\n");
};

const normalizeAutofillLine = (value: string | undefined): string => {
    return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
};

const removeNanoCastWardrobeAutofillFromMaterialNotes = (value: string): string => {
    return dedupeLines(
        value
            .split(/\r?\n/)
            .filter(line => !line.trim().startsWith("Wardrobe direction from NanoCast:"))
            .join("\n")
    );
};

const removeNanoCastWardrobeDirectionAutofill = (value: string, handoffOutfit?: string): string => {
    const autofillLines = new Set(
        ["Black polo t-shirt", handoffOutfit]
            .map(normalizeAutofillLine)
            .filter(Boolean)
    );

    return dedupeLines(
        value
            .split(/\r?\n/)
            .filter(line => {
                const normalizedLine = normalizeAutofillLine(line);
                return normalizedLine && !autofillLines.has(normalizedLine);
            })
            .join("\n")
    );
};

const isBiometricPitchSheetSource = (source: CharacterPitchSheetInput["identitySource"]): boolean => {
    return source === "biometric_multiview" || source === "biometric_plus_character";
};

const getPitchSheetAngleLabel = (angle: string | undefined, fallbackIndex: number): string => {
    switch ((angle || "").toLowerCase()) {
        case "center":
        case "front":
            return "Front";
        case "left":
            return "Left Profile";
        case "right":
            return "Right Profile";
        case "up":
            return "Upward Angle";
        case "down":
            return "Downward Angle";
        default:
            return `Angle ${fallbackIndex + 1}`;
    }
};

const PITCH_SHEET_PREVIEW_HELP =
    "Character Pitch Sheet Preview creates cinematic character design boards from text, portrait, or scan references. Results are active and usable, but exact likeness, body proportions, and panel consistency may vary while this feature is refined.";

const PITCH_SHEET_PREVIEW_NOTE =
    "Preview feature: designed for cinematic character boards and concept exploration. Identity, body, and style consistency may vary between generations.";

function PitchSheetPreviewBadge({ className = "" }: { className?: string }) {
    return (
        <span
            title={PITCH_SHEET_PREVIEW_HELP}
            className={`inline-flex items-center justify-center rounded-full border border-blue-400/25 bg-blue-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase leading-none tracking-[0.16em] text-blue-200 shadow-[0_0_8px_rgba(96,165,250,0.14)] ${className}`}
        >
            PREVIEW
        </span>
    );
}

// Local component for solid panels to ensure rendering stability
function SolidPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-[#0f1117] bg-opacity-95 border border-white/10 rounded-2xl ${className}`}>
            {children}
        </div>
    );
}

// --- RNG HELPERS ---
function mulberry32(a: number) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const randFloat = (rng: () => number, min: number, max: number) => {
    return rng() * (max - min) + min;
};

const randInt = (rng: () => number, min: number, max: number) => {
    return Math.floor(randFloat(rng, min, max + 1));
};

const pick = <T,>(rng: () => number, arr: T[]): T => {
    return arr[Math.floor(rng() * arr.length)];
};

export default function PortraitStudio() {
    const { state, dispatch } = useAppContext();
    const [dna, setDna] = useState<CharacterDNA>(() => {
        const saved = localStorage.getItem("portrait_session_state");
        if (!saved) return DEFAULT_DNA;
        try {
            const parsed = JSON.parse(saved);
            return parsed.dna || DEFAULT_DNA;
        } catch {
            return DEFAULT_DNA;
        }
    });
    const [mode, setMode] = useState<PortraitStudioMode>(() => {
        const saved = localStorage.getItem("portrait_session_state");
        if (!saved) return "portrait";
        try {
            const parsed = JSON.parse(saved);
            return isPortraitStudioMode(parsed.mode) ? parsed.mode : "portrait";
        } catch {
            return "portrait";
        }
    });
    const [pitchSheetInput, setPitchSheetInput] = useState<CharacterPitchSheetInput>(() => {
        const saved = localStorage.getItem("portrait_session_state");
        if (!saved) return defaultCharacterPitchSheetInput;
        try {
            const parsed = JSON.parse(saved);
            const loadedPitchSheetInput: CharacterPitchSheetInput = {
                ...defaultCharacterPitchSheetInput,
                ...(parsed.pitchSheetInput || {})
            };
            return {
                ...loadedPitchSheetInput,
                characterRenderStyle: normalizePitchSheetRenderStyle(loadedPitchSheetInput.characterRenderStyle)
            };
        } catch {
            return defaultCharacterPitchSheetInput;
        }
    });
    const [expandedPitchSheetSections, setExpandedPitchSheetSections] = useState<Record<PitchSheetAdvancedSectionKey, boolean>>({
        face: false,
        performance: false,
        material: false,
        production: false
    });
    const [presets, setPresets] = useState<Record<string, { id: string; name: string; dna: CharacterDNA }>>({});
    const [randomSeed, setRandomSeed] = useState<number>(() => Date.now());
    const [lastDnaSnapshot, setLastDnaSnapshot] = useState<CharacterDNA | null>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(() => {
        const saved = localStorage.getItem("portrait_session_state");
        if (!saved) return null;

        try {
            const parsed = JSON.parse(saved);
            const candidate = parsed.generatedImage || null;
            return typeof candidate === "string" && candidate.startsWith("data:")
                ? candidate
                : null;
        } catch {
            return null;
        }
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [isInspecting, setIsInspecting] = useState(false);
    const [isAddingCast, setIsAddingCast] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => {
            setToast(null);
        }, 2500);
        return () => clearTimeout(timer);
    }, [toast]);

    const [showActorSaveModal, setShowActorSaveModal] = useState(false);
    const [pendingActorSave, setPendingActorSave] = useState<{
        sourceUrl: string;
        initialName: string;
        recentGenerationId?: string;
    } | null>(null);

    const getErrorMessage = (error: unknown): string => {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    };

    const isPitchSheetMode = mode === "pitch_sheet";
    const pitchSheetSubjectName = pitchSheetInput.characterName.trim() || pitchSheetInput.aliasCodename.trim() || "Character Pitch Sheet";
    const activeLibraryName = isPitchSheetMode ? pitchSheetSubjectName : `Portrait ${dna.identity.sex} ${dna.identity.age}`;
    const generatedOutputAlt = isPitchSheetMode ? "Generated Character Pitch Sheet" : "Generated Portrait";
    const generatedOutputFilename = isPitchSheetMode
        ? `character_pitch_sheet_${safeFilenameSegment(pitchSheetSubjectName)}.png`
        : `portrait_${dna.identity.sex.toLowerCase()}_${dna.identity.age}.png`;
    const generateButtonLabel = isPitchSheetMode ? "GENERATE CHARACTER PITCH SHEET" : "GENERATE PORTRAIT";
    const generatingButtonLabel = isPitchSheetMode ? "GENERATING SHEET..." : "GENERATING PORTRAIT...";
    const isReferenceImageRequired = mode === "portrait" && dna.identityMode === "reference" && !dna.referenceImageUrl;
    const canBuildPitchSheetFromCharacter = mode === "portrait" && Boolean(generatedImage || state.lastCastedImage);
    const pitchSheetSourcePanelMode = pitchSheetInput.sourcePanelMode || defaultCharacterPitchSheetInput.sourcePanelMode || "costume_matched";
    const pitchSheetCharacterRenderStyle = normalizePitchSheetRenderStyle(pitchSheetInput.characterRenderStyle);
    const pitchSheetBoardPresentationStyle = pitchSheetInput.boardPresentationStyle || defaultCharacterPitchSheetInput.boardPresentationStyle || "premium_film_board";

    const updatePitchSheetInput = (field: CharacterPitchSheetTextField, value: string) => {
        setPitchSheetInput(prev => {
            const next: CharacterPitchSheetInput = { ...prev, [field]: value };

            if (field === "height") {
                next.heightIn = parsePitchSheetHeightToInches(value);
            }

            if (field === "build") {
                next.weightLbs = parsePitchSheetWeightToLbs(value);
            }

            return next;
        });
    };

    const togglePitchSheetSection = (section: PitchSheetAdvancedSectionKey) => {
        setExpandedPitchSheetSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const getPresetLabel = (presetsList: Array<{ key: string; label: string }>, key: string): string => {
        return presetsList.find(preset => preset.key === key)?.label || key;
    };

    const openActorSaveModal = (sourceUrl: string, initialName?: string, recentGenerationId?: string) => {
        if (!sourceUrl) return;
        setPendingActorSave({
            sourceUrl,
            initialName: initialName || activeLibraryName,
            recentGenerationId,
        });
        setShowActorSaveModal(true);
    };

    const savePendingActorToLibrary = async (name: string, category: string) => {
        if (!pendingActorSave?.sourceUrl) return;

        try {
            const mat = await LibraryAssetMaterializer.materializeCastAsset({
                sourceUrl: pendingActorSave.sourceUrl,
                saveDirectoryPath: state.saveDirectoryPath,
                actorName: name,
                category,
            });

            const newActor: CastMember = {
                id: crypto.randomUUID(),
                name,
                url: mat.previewUrl,
                localPath: mat.localPath || undefined,
                previewUrl: mat.previewUrl,
                sourceUrl: mat.sourceUrl,
                tag: 'front',
                filename: mat.filename,
                identityLock: isPitchSheetMode ? pitchSheetInput.identityLock : undefined,
                profile: {
                    identity: isPitchSheetMode ? pitchSheetSubjectName : dna.identity.ethnicity,
                    wardrobe: isPitchSheetMode ? pitchSheetInput.wardrobeDirection : '',
                    accessories: isPitchSheetMode ? pitchSheetInput.propsSignatureItems : '',
                    style: actorLibraryStyleForCategory(category),
                    ...(isPitchSheetMode
                        ? {
                            generationStatus: 'preview' as const,
                            featureSource: 'character_pitch_sheet' as const,
                        }
                        : {}),
                },
            };

            dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
            if (pendingActorSave.sourceUrl === generatedImage && mat.previewUrl) {
                setGeneratedImage(mat.previewUrl);
            }
            if (pendingActorSave.recentGenerationId) {
                useRecentGenerationsStore.getState().markExported(pendingActorSave.recentGenerationId);
            }
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actor Library: ${mat.filename || name}`, type: 'success' } });
            setShowActorSaveModal(false);
            setPendingActorSave(null);
        } catch (err) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Export failed: ${getErrorMessage(err)}`, type: 'error' } });
        }
    };

    const setReferenceImageFromFile = (file: File | undefined) => {
        if (!file || !file.type.startsWith("image/")) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === "string") {
                setDna(prev => ({ ...prev, referenceImageUrl: result }));
            }
        };
        reader.readAsDataURL(file);
    };

    const setPitchSheetReferenceImageFromFile = (file: File | undefined) => {
        if (!file || !file.type.startsWith("image/")) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === "string") {
                setPitchSheetInput(prev => ({
                    ...prev,
                    referenceImageUrl: result,
                    identitySource: "portrait_reference",
                    identityStrength: 100
                }));
            }
        };
        reader.readAsDataURL(file);
    };

    const openReferenceImagePicker = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (event: Event) => {
            if (!(event.target instanceof HTMLInputElement)) {
                return;
            }

            setReferenceImageFromFile(event.target.files?.[0]);
        };
        input.click();
    };

    const openPitchSheetReferenceImagePicker = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (event: Event) => {
            if (!(event.target instanceof HTMLInputElement)) {
                return;
            }

            setPitchSheetReferenceImageFromFile(event.target.files?.[0]);
        };
        input.click();
    };
    // --- CHARACTER STATE ---
    const remoteUrlToDataUrl = async (url: string): Promise<string> => {
        if (!url) return url;
        if (url.startsWith("data:")) return url;

        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) {
            throw new Error(`Failed to fetch remote image: ${res.status}`);
        }

        const blob = await res.blob();

        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (!result) reject(new Error("Failed to convert blob to data URL"));
                else resolve(result);
            };
            reader.onerror = () => reject(new Error("FileReader failed"));
            reader.readAsDataURL(blob);
        });
    };

    // --- PRESET SYSTEM (PHASE 4) ---
    useEffect(() => {
        try {
            const saved = localStorage.getItem("portrait_dna_presets");
            if (saved) {
                // Ensure legacy presets don't break the app
                const parsed = JSON.parse(saved);
                setPresets(parsed);
            }
        } catch (e) {
            console.error("Failed to load presets or storage full", e);
            // If storage is completely full/corrupted, we might need to clear specific keys
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
                console.warn("Storage quota reached. Clearing session state to make room.");
                localStorage.removeItem("portrait_session_state");
            }
        }
    }, []);

    // --- SESSION PERSISTENCE (PHASE 8) ---
    useEffect(() => {
        try {
            // CRITICAL: Prune binary/base64 data to avoid QuotaExceededError (5MB limit)
            const prunedDna = {
                ...dna,
                referenceImageUrl: undefined // Never store reference image in localStorage
            };
            const prunedPitchSheetInput = {
                ...pitchSheetInput,
                referenceImageUrl: undefined,
                referenceImages: undefined,
                characterStyleReferenceUrl: undefined
            };

            const sessionState = {
                dna: prunedDna,
                mode,
                pitchSheetInput: prunedPitchSheetInput,
                generatedImage: generatedImage
            };
            localStorage.setItem("portrait_session_state", JSON.stringify(sessionState));
        } catch (e) {
            console.warn("Session persistence failed (Storage likely full):", e);
        }
    }, [dna, generatedImage, mode, pitchSheetInput]);
    // Note: If generatedImage/variations are needed across refresh, they should be stored 
    // in IndexedDB or as local files, not localStorage.

    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");

    useEffect(() => {
        if (localStorage.getItem("portrait_pitchsheet_handoff")) {
            localStorage.removeItem("portrait_pitchsheet_handoff");
        }

        const payload: NanoPitchSheetHandoff | null = state.pendingPitchSheetHandoff;
        if (!payload) return;

        console.warn('[PORTRAIT_NANO_HANDOFF_RECEIVED]', {
            mode: payload.mode,
            finalCharacterUrl: payload.finalCharacterUrl,
            characterStyleReferenceUrl: payload.characterStyleReferenceUrl,
            identityImageCount: payload.identityImages?.length,
            generatedSourceImageIndex: payload.generatedSourceImageIndex,
            generatedSourceRole: payload.generatedSourceRole
        });

        try {
            if ((payload.source !== "nanocast_biometric_scan" && payload.source !== "production_actor_workflow") || !Array.isArray(payload.identityImages) || payload.identityImages.length === 0) {
                dispatch({ type: "ADD_LOG", payload: { message: "Pitch Sheet handoff was empty. Please send the NanoCast scan again.", type: "error" } });
                dispatch({ type: "CLEAR_PENDING_PITCH_SHEET_HANDOFF" });
                return;
            }

            const identitySource = payload.source === "production_actor_workflow" 
                ? "biometric_plus_character" 
                : payload.mode === "scan_plus_character"
                    ? "biometric_plus_character"
                    : "biometric_multiview";
            const referenceImages = payload.identityImages.map(image => ({
                angle: image.angle,
                imageUrl: image.imageUrl,
                label: image.angle === "center"
                    ? "Actor Likeness Guide"
                    : "Profile Likeness Guide"
            }));
            const styleText = payload.selectedStyle
                ? `${payload.selectedStyle} cinematic actor-based character design`
                : "Cinematic actor-based character design";
            const hairNotes = payload.hairStyle
                ? `Hair and grooming direction: ${payload.hairStyle}.`
                : "Preserve hair, hairline, facial hair, and grooming consistently across every view.";
            const productionNote = "Maintain actor-based likeness continuity across hero portrait, head studies, turnaround views, and expression study.";

            setMode("pitch_sheet");
            setGeneratedImage(null);
            setPitchSheetInput(prev => {
                const resolvedMappedStyle =
                    (payload.approvedPitchSheetRenderStyle as CharacterPitchSheetRenderStyle | undefined) ||
                    mapNanoCastStyleToPitchSheetRenderStyle(
                        payload.approvedNanoCastStyle ||
                        payload.selectedStyle ||
                        prev.characterRenderStyle
                    );

                console.info("[PortraitStudio] Received NanoCast render style handoff", {
                    handoffRenderStyle: payload.approvedPitchSheetRenderStyle || payload.approvedNanoCastStyle || payload.selectedStyle,
                    appliedCharacterRenderStyle: resolvedMappedStyle
                });

                return {
                    ...prev,
                    characterRenderStyle: resolvedMappedStyle,
                    referenceImageUrl: undefined,
                    referenceImages,
                    identityLock: payload.identityLock,
                    identitySource,
                    identityStrength: payload.identityStrength || 100,
                    characterStyleReferenceUrl: payload.mode === "scan_plus_character" ? payload.finalCharacterUrl || undefined : undefined,
                    sourcePanelMode: payload.mode === "scan_plus_character" ? "costume_matched" : prev.sourcePanelMode,
                    visualAge: "",
                    height: "",
                    heightIn: undefined,
                    weightLbs: undefined,
                    build: "",
                    designLanguage: styleText,
                    wardrobeDirection: removeNanoCastWardrobeDirectionAutofill(prev.wardrobeDirection, payload.outfit),
                    lightingMood: payload.mode === "scan_plus_character"
                        ? prev.lightingMood || defaultCharacterPitchSheetInput.lightingMood
                        : prev.lightingMood,
                    faceDetails: payload.source === "production_actor_workflow" && payload.productionActorProfile ? dedupeLines([
                        `IDENTITY: ${payload.productionActorProfile.identitySummary}`,
                        `PRESERVE: ${payload.productionActorProfile.preserveRules.join(", ")}`,
                        `AVOID: ${payload.productionActorProfile.avoidRules.join(", ")}`
                    ].join("\n")) : [
                        "Actor likeness study supplied as the strict actor likeness source.",
                        hairNotes,
                        "Preserve exact skull geometry, facial proportions, asymmetry, skin tone, age impression, and emotional presence."
                    ].join(" "),
                    materialCostumeNotes: removeNanoCastWardrobeAutofillFromMaterialNotes(prev.materialCostumeNotes),
                    productionNotes: dedupeLines([prev.productionNotes, productionNote].filter(Boolean).join("\n"))
                };
            });

            dispatch({ type: "CLEAR_PENDING_PITCH_SHEET_HANDOFF" });
            dispatch({ type: "ADD_LOG", payload: { message: "NanoCast biometric scan loaded into Character Pitch Sheet", type: "success" } });
        } catch (error) {
            console.error("Failed to load pending pitch sheet handoff", error);
            dispatch({ type: "CLEAR_PENDING_PITCH_SHEET_HANDOFF" });
            dispatch({ type: "ADD_LOG", payload: { message: "Pitch Sheet handoff could not be loaded. Please send the NanoCast scan again.", type: "error" } });
        }
    }, [dispatch, state.pendingPitchSheetHandoff]);

    useEffect(() => {
        if (mode !== "pitch_sheet") return;

        setPitchSheetInput(prev => {
            const wardrobeDirection = isBiometricPitchSheetSource(prev.identitySource)
                ? removeNanoCastWardrobeDirectionAutofill(prev.wardrobeDirection)
                : prev.wardrobeDirection;
            const materialCostumeNotes = removeNanoCastWardrobeAutofillFromMaterialNotes(prev.materialCostumeNotes);
            const productionNotes = dedupeLines(prev.productionNotes);

            if (
                wardrobeDirection === prev.wardrobeDirection
                && materialCostumeNotes === prev.materialCostumeNotes
                && productionNotes === prev.productionNotes
            ) {
                return prev;
            }

            return {
                ...prev,
                wardrobeDirection,
                materialCostumeNotes,
                productionNotes
            };
        });
    }, [mode]);

    const handleSavePreset = () => {
        if (!newPresetName.trim()) return;
        const name = newPresetName.trim();

        // Functional update to ensure stability
        setPresets(prev => {
            // CRITICAL: Ensure reference photo isn't stored in presets (quota exhaustion)
            const cleanDna = { ...dna, referenceImageUrl: undefined };

            const newPreset = {
                id: crypto.randomUUID(),
                name,
                dna: cleanDna
            };

            const newPresets = { ...prev, [name]: newPreset };
            try {
                localStorage.setItem("portrait_dna_presets", JSON.stringify(newPresets));
            } catch (e) {
                console.error("Failed to save preset to storage:", e);
                // Alert might be appropriate here if it's a manual user action
            }
            console.log("Saved preset:", newPreset);
            return newPresets;
        });
        setIsSavingPreset(false);
        setNewPresetName("");
    };

    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const deletePreset = (name: string) => {
        setDeleteTarget(name);
    };

    const confirmDelete = () => {
        if (!deleteTarget) return;
        setPresets(prev => {
            const newPresets = { ...prev };
            delete newPresets[deleteTarget];
            localStorage.setItem("portrait_dna_presets", JSON.stringify(newPresets));
            return newPresets;
        });
        setDeleteTarget(null);
    };

    const loadPreset = (name: string) => {
        const preset = presets[name];
        if (preset) {
            console.log("Loading preset:", preset);

            // Deep clone to separate from preset storage
            const loadedDna = JSON.parse(JSON.stringify(preset.dna));

            // CRITICAL: Recompute derived fields
            loadedDna.morphology.bmi = computeBMI(loadedDna.morphology.heightCm, loadedDna.morphology.weightKg);
            loadedDna.morphology.buildDescription = deriveBuildDescription(loadedDna.morphology.bmi);

            // Full replacement of state
            setDna(loadedDna);

            // Reset transient UI state and results
            clearPortraitResult();
        }
    };

    // --- DNA UPDATERS ---
    const updateIdentity = <K extends keyof CharacterDNA["identity"]>(key: K, value: CharacterDNA["identity"][K]) => {
        setDna((prev) => ({
            ...prev,
            identity: { ...prev.identity, [key]: value },
            // Auto-sync skin age if it matches chronological age (heuristic)
            skin:
                key === "age" && prev.skin.dermalAge === prev.identity.age
                    ? { ...prev.skin, dermalAge: typeof value === "number" ? value : prev.skin.dermalAge }
                    : prev.skin,
        }));
    };

    const toggleHairLock = () => {
        setDna(prev => ({
            ...prev,
            allowRefHair: !prev.allowRefHair
        }));
    };

    const setLifeStage = (stage: LifeStage) => {
        setDna((prev) => {
            const range = LIFE_STAGES[stage];
            let newAge = prev.identity.age;
            if (newAge < range.min) newAge = range.min;
            if (newAge > range.max) newAge = range.max;

            return {
                ...prev,
                identity: { ...prev.identity, lifeStage: stage, age: newAge },
            };
        });
    };

    const updateMorphology = <K extends keyof CharacterDNA["morphology"]>(key: K, value: CharacterDNA["morphology"][K]) => {
        setDna((prev) => {
            const nextMorph = { ...prev.morphology, [key]: value } as CharacterDNA["morphology"];
            // Recompute BMI
            if (key === "heightCm" || key === "weightKg") {
                nextMorph.bmi = computeBMI(nextMorph.heightCm, nextMorph.weightKg);
                nextMorph.buildDescription = deriveBuildDescription(nextMorph.bmi);
            }
            return { ...prev, morphology: nextMorph };
        });
    };

    const updateFace = <K extends keyof CharacterDNA["face"]>(key: K, value: CharacterDNA["face"][K]) => {
        setDna((prev) => ({ ...prev, face: { ...prev.face, [key]: value } }));
    };

    const updateSkin = <K extends keyof CharacterDNA["skin"]>(key: K, value: CharacterDNA["skin"][K]) => {
        setDna((prev) => ({ ...prev, skin: { ...prev.skin, [key]: value } }));
    };

    const updateHair = <K extends keyof CharacterDNA["hair"]>(key: K, value: CharacterDNA["hair"][K]) => {
        setDna((prev) => ({ ...prev, hair: { ...prev.hair, [key]: value } }));
    };

    const updateRender = <K extends keyof CharacterDNA["render"]>(key: K, value: CharacterDNA["render"][K]) => {
        setDna((prev) => ({ ...prev, render: { ...prev.render, [key]: value } }));
    };

    const updateReferenceFlags = (flags: Partial<Pick<CharacterDNA, "allowRefHair" | "allowRefFace" | "allowRefSkin" | "allowRefMorphology">>) => {
        setDna(prev => ({ ...prev, ...flags }));
    };

    // --- COMPILER (PHASE 2) ---
    const compiledPrompt = useMemo(() => {
        if (mode === "pitch_sheet") {
            return buildCharacterPitchSheetPrompt(pitchSheetInput);
        }

        return buildPortraitPrompt(dna);
    }, [dna, mode, pitchSheetInput]);

    const buildGenerationReferenceImages = () => {
        if (mode === "portrait" && dna.identityMode === "reference" && dna.referenceImageUrl) {
            return [{ url: dna.referenceImageUrl, label: "Identity Reference" }];
        }

        if (mode !== "pitch_sheet") {
            return [];
        }

        const safePitchSheetInput = sanitizeVisibleBoardLanguage(pitchSheetInput);

        const hasGeneratedCharacterSource =
            safePitchSheetInput.identitySource === "biometric_plus_character" &&
            Boolean(safePitchSheetInput.characterStyleReferenceUrl);

        const originalIdentityAnchors = (safePitchSheetInput.referenceImages || []).map((ref, index) => ({
            url: ref.imageUrl,
            label: hasGeneratedCharacterSource
                ? `Image ${String.fromCharCode(66 + index)} - Biometric Scan Identity Reference (${getPitchSheetAngleLabel(ref.angle, index)}): identity authority for face, skull, skin tone, age, hair state, facial hair, and marks only.`
                : `Image ${String.fromCharCode(65 + index)} - Biometric Scan Identity Reference (${getPitchSheetAngleLabel(ref.angle, index)}): identity authority for face, skull, skin tone, age, hair state, facial hair, and marks.`
        }));

        const primaryGeneratedCharacterSource = hasGeneratedCharacterSource && safePitchSheetInput.characterStyleReferenceUrl
            ? [{
                url: safePitchSheetInput.characterStyleReferenceUrl,
                label: "Image A - Primary Generated Character Source / Current Approved Character Render: preserve this character's body, outfit, silhouette, proportions, render style, costume, and overall design."
            }]
            : [];

        const portraitIdentityReference = safePitchSheetInput.referenceImageUrl
            ? [{
                url: safePitchSheetInput.referenceImageUrl,
                label: safePitchSheetInput.identitySource === "portrait_reference"
                    ? "Image A - Primary Approved Character Portrait: preserve this character's body, outfit, silhouette, proportions, render style, costume, and overall design."
                    : hasGeneratedCharacterSource
                    ? "Additional Portrait Identity Guide - secondary to Image A design and biometric identity anchors."
                    : "Actor Likeness Guide"
            }]
            : [];

        const looseStyleReference = !hasGeneratedCharacterSource && safePitchSheetInput.characterStyleReferenceUrl
            ? [{
                url: safePitchSheetInput.characterStyleReferenceUrl,
                label: "Board Presentation Guide Only - Not Actor Likeness"
            }]
            : [];

        return [
            ...primaryGeneratedCharacterSource,
            ...originalIdentityAnchors,
            ...portraitIdentityReference,
            ...looseStyleReference
        ];
    };

    useEffect(() => {
        setIsCompiling(true);
        const timer = setTimeout(() => setIsCompiling(false), 250);
        return () => clearTimeout(timer);
    }, [compiledPrompt]);

    // --- RANDOMIZATION SYSTEM ---
    const handleRandomizeDNA = () => {
        // 1. Snapshot for Undo
        setLastDnaSnapshot(JSON.parse(JSON.stringify(dna)));

        // 2. Setup RNG
        const newSeed = Date.now();
        const rng = mulberry32(newSeed);
        setRandomSeed(newSeed);

        setDna(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            next.randomSeed = newSeed;

            const isRef = next.identityMode === "reference";

            // --- RENDER (Both Modes) ---
            next.render.lighting = pick(rng, LIGHTING_PRESETS.filter(p => !p.disabled)).key;
            next.render.camera = pick(rng, CAMERA_PRESETS.filter(p => !p.disabled)).key;

            if (!isRef) {
                // --- SYNTHETIC MODE ONLY ---

                // Identity
                next.identity.sex = pick(rng, ["Female", "Male"]);
                next.identity.ethnicity = pick(rng, ["Caucasian", "Black", "East Asian", "South Asian", "Hispanic", "Middle Eastern", "Pacific Islander", "Mixed Race", "Fantasy Skin"]);
                next.identity.skinTone = pick(rng, ["Type I", "Type II", "Type III", "Type IV", "Type V", "Type VI"]);

                const stage = pick(rng, ["child", "teen", "adult", "elder"]) as "child" | "teen" | "adult" | "elder";
                next.identity.lifeStage = stage;
                const range = LIFE_STAGES[stage];
                next.identity.age = randInt(rng, range.min, range.max);

                // Morphology
                const ft = randInt(rng, 4, 7);
                const inch = randInt(rng, 0, 11);
                next.morphology.heightCm = Math.round(((ft * 12) + inch) * 2.54);

                const weightLbs = randInt(rng, 90, 280);
                next.morphology.weightKg = weightLbs * 0.453592;

                // Sync BMI
                next.morphology.bmi = computeBMI(next.morphology.heightCm, next.morphology.weightKg);
                next.morphology.buildDescription = deriveBuildDescription(next.morphology.bmi);

                // Facial Architecture
                next.face.faceShape = pick(rng, FACE_SHAPE_PRESETS).key;
                next.face.eyes = pick(rng, EYE_PRESETS).key;
                next.face.nose = pick(rng, NOSE_PRESETS).key;
                next.face.lips = pick(rng, LIP_PRESETS).key;
                next.face.jaw = pick(rng, JAW_PRESETS).key;

                // Skin
                next.skin.freckles = pick(rng, [0, 0, 0, 5, 10, 15, 25, 35]); // Weighted towards 0
                next.skin.scars = pick(rng, [0, 0, 0, 5, 10, 15, 25]); // Weighted towards 0
                next.skin.skinAge = Math.max(0, next.identity.age + randInt(rng, -5, 10));

                // Hair
                next.hair.color = pick(rng, ["Black", "Dark Brown", "Brown", "Blonde", "Auburn", "Red", "Gray"]);
                next.hair.style = pick(rng, ["Short crop", "Medium length", "Long waves", "Braided", "Bob cut", "Tapered fade"]);
                next.hair.length = pick(rng, ["Short", "Medium", "Long"]);
                next.hair.texture = pick(rng, ["Straight", "Wavy", "Curly", "Coily"]);

                // Render Levels
                next.render.realismLevel = randInt(rng, 80, 100);
                next.render.stylizationLevel = randInt(rng, 0, 20);

            } else {
                // --- REFERENCE MODE ONLY ---

                // Safe Hair Override
                if (next.refEditMode === "override" && next.allowRefHair) {
                    next.hair.style = pick(rng, ["Short crop", "Medium length", "Long waves", "Braided", "Bob cut", "Tapered fade"]);
                }

                // Reference-aware Render
                const lock = next.likenessLock || 100;
                if (lock >= 90) {
                    next.render.stylizationLevel = randInt(rng, 0, 20);
                    next.render.realismLevel = randInt(rng, 70, 100);
                }
            }

            return next;
        });

        dispatch({ type: "ADD_LOG", payload: { message: `DNA randomized (seed: ${newSeed})`, type: "info" } });
    };

    const handleUndoRandomize = () => {
        if (lastDnaSnapshot) {
            setDna(lastDnaSnapshot);
            setLastDnaSnapshot(null);
            dispatch({ type: "ADD_LOG", payload: { message: "Randomize reverted", type: "success" } });
        }
    };

    const handleCopySeed = () => {
        navigator.clipboard.writeText(randomSeed.toString());
        dispatch({ type: "ADD_LOG", payload: { message: "Seed copied to clipboard", type: "success" } });
    };

    // --- ACTIONS ---
    const [progress, setProgress] = useState<{ phase: string, percent: number, text?: string, subtext?: string } | null>(null);

    const handleGenerate = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;
        if (billingMode === "byok" && !state.apiKey) {
            dispatch({
                type: "ADD_LOG",
                payload: { message: "API Key required for BYOK generation", type: "error" }
            });
            return;
        }
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: isPitchSheetMode ? "Portrait pitch sheet generation" : "Portrait generation" }))) {
            return;
        }

        setIsGenerating(true);
        dispatch({ type: "ADD_LOG", payload: { message: isPitchSheetMode ? "Generating Character Pitch Sheet..." : "Generating Portrait...", type: "info" } });

        // Simulated Progress for the UX Loader
        setProgress({ phase: 'initializing', percent: 0, text: 'Initializing neural link...' });
        let currentPercent = 0;
        
        const getPitchSheetProgressMessage = (progress: number, calloutsEnabled: boolean): string => {
            if (progress < 10) return 'Preparing source actor and style target...';
            if (progress < 22) return 'Locking identity traits and body proportions...';
            if (progress < 35) return 'Preserving wardrobe, hairstyle, and key visual details...';
            if (progress < 50) return 'Building the production reference sheet layout...';
            if (progress < 65) return 'Composing front, side, back, and detail views...';
            if (progress < 78) return 'Balancing consistency across all actor views...';
            if (progress < 90) {
                return calloutsEnabled
                    ? 'Adding production-ready callout labels...'
                    : 'Finalizing production sheet details...';
            }
            if (progress < 98) return 'Finalizing the pitch sheet render...';
            return 'Preparing the finished sheet...';
        };

        const progressInterval = setInterval(() => {
            currentPercent += (100 - currentPercent) * 0.05; // Asymptotic approach to 99%
            let text = 'Formulating prompt...';
            let subtext: string | undefined = undefined;

            if (isPitchSheetMode) {
                text = getPitchSheetProgressMessage(currentPercent, true);
                subtext = 'Reference sheets can take longer because multiple views and identity details are being composed together.';
            } else {
                if (currentPercent > 30) text = 'Synthesizing image data...';
                if (currentPercent > 70) text = 'Refining output...';
                if (currentPercent > 90) text = 'Finalizing render...';
            }

            setProgress({ phase: 'generating', percent: currentPercent, text, subtext });
        }, 800);

        try {
            const referenceImages = buildGenerationReferenceImages();
            if (isPitchSheetMode) {
                const generatedCharacterSourceUrl = pitchSheetInput.characterStyleReferenceUrl;
                const biometricReferenceCount = (pitchSheetInput.referenceImages || []).filter(ref => Boolean(ref.imageUrl)).length;
                const characterRenderStyle = pitchSheetCharacterRenderStyle;
                const boardPresentationStyle = pitchSheetBoardPresentationStyle;
                const sourcePanelDisplay = pitchSheetInput.sourcePanelMode || "costume_matched";

                console.info("[PitchSheet] Scan + Character source audit", {
                    mode: "scan_plus_character",
                    hasGeneratedCharacterSource: Boolean(generatedCharacterSourceUrl),
                    generatedCharacterSourceFirst: true,
                    biometricReferenceCount,
                    characterRenderStyle,
                    boardPresentationStyle,
                    sourcePanelDisplay
                });

                console.info("[PitchSheet] Reference Images Ordering Labels:", referenceImages.map((ref, index) => ({
                    index: index + 1,
                    label: ref.label
                })));
            }
            const generationOptions = {
                imageSize: state.imageResolution,
                thinkingLevel: state.enableImageThinking,
                googleGrounding: state.enableGoogleGrounding,
                billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                entitlements: state.billingEntitlements
            };
            const pitchSheetStyleLabel =
                CHARACTER_RENDER_STYLE_OPTIONS.find((option): option is Extract<CharacterRenderStyleOption, { type: "option" }> =>
                    option.type === "option" && option.value === pitchSheetCharacterRenderStyle
                )?.label || pitchSheetCharacterRenderStyle;

            const url = await GeminiService.generateImage(
                compiledPrompt,
                state.apiKey,
                state.model,
                referenceImages,
                mode === "pitch_sheet"
                    ? {
                        ...generationOptions,
                        thinkingLevel: 'high',
                        googleGrounding: false,
                        strictMode: true,
                        identityLock: isBiometricPitchSheetSource(pitchSheetInput.identitySource)
                            ? pitchSheetInput.identityLock
                            : undefined,
                        sheetStyleLock: true,
                        styleCategory: {
                            enabled: pitchSheetCharacterRenderStyle !== "no_specific_style",
                            styleId: pitchSheetCharacterRenderStyle,
                            intent: {
                                selectedStyleLabel: pitchSheetStyleLabel,
                                appliesTo: "Portrait Studio character pitch sheet, hero portrait, full-body panels, headshot strip, and recent thumbnail"
                            }
                        }
                    }
                    : generationOptions
            );
            
            const stableDisplayUrl = /^https?:\/\//i.test(url) ? await remoteUrlToDataUrl(url) : url;
            
            setGeneratedImage(stableDisplayUrl); // Set local state for preview
            dispatch({ type: "SET_LAST_CASTED_IMAGE", payload: stableDisplayUrl });
            dispatch({ type: "SET_LAST_CASTED_PROMPT", payload: compiledPrompt });
            dispatch({ type: "ADD_LOG", payload: { message: isPitchSheetMode ? "Character Pitch Sheet Generated" : "Portrait Generated", type: "success" } });

            // --- RECENT GENERATIONS: Cache result silently ---
            const recentStore = useRecentGenerationsStore.getState();
            if (recentStore.cacheDirPath && stableDisplayUrl) {
                RecentGenerationsCacheService.cacheGeneration({
                    imageDataUrl: stableDisplayUrl,
                    studio: 'portrait',
                    cacheDirPath: recentStore.cacheDirPath,
                }).then((cacheResult) => {
                    if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                        recentStore.addRecentGeneration({
                            studio: 'portrait',
                            localCachePath: cacheResult.localCachePath,
                            displayUrl: cacheResult.displayUrl,
                            createdAt: Date.now(),
                            prompt: compiledPrompt,
                            mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                            ...(isPitchSheetMode
                                ? {
                                    displayLabel: 'Pitch Sheet Preview',
                                    generationStatus: 'preview' as const,
                                    featureSource: 'character_pitch_sheet' as const,
                                }
                                : {}),
                        });
                    }
                }).catch((e) => {
                    console.warn('[Portrait] Recent generation caching failed:', e);
                });
            }
        } catch (error: unknown) {
            dispatch({ type: "ADD_LOG", payload: { message: `Generation failed: ${getErrorMessage(error)}`, type: "error" } });
        } finally {
            clearInterval(progressInterval);
            setProgress(null);
            setIsGenerating(false);
        }
    };

    const clearPortraitResult = () => {
        // 1. Clear in-memory local state
        setGeneratedImage(null);

        // 2. Clear the shared app-level state preventing cross-tab zombie images
        dispatch({ type: "SET_LAST_CASTED_IMAGE", payload: null });
        dispatch({ type: "SET_LAST_CASTED_PROMPT", payload: "" });

        // 3. Scrub from localStorage so it doesn't survive a full browser reload
        try {
            const saved = localStorage.getItem("portrait_session_state");
            if (saved) {
                const parsed = JSON.parse(saved);
                parsed.generatedImage = null;
                localStorage.setItem("portrait_session_state", JSON.stringify(parsed));
            }
        } catch (e) {
            console.warn("Failed to clear portrait session state from localStorage", e);
        }
    };

    const handleStartNew = () => {
        if (mode === "pitch_sheet") {
            setPitchSheetInput(defaultCharacterPitchSheetInput);
        } else {
            setDna(DEFAULT_DNA);
        }
        clearPortraitResult();
    };

    const buildPitchSheetFromGeneratedPortrait = () => {
        const imageUrl = generatedImage || state.lastCastedImage;

        if (!imageUrl) {
            dispatch({
                type: "ADD_LOG",
                payload: { message: "Generate or select a character portrait before building a pitch sheet.", type: "error" }
            });
            return;
        }

        const lightingLabel = getPresetLabel(LIGHTING_PRESETS, dna.render.lighting);
        const cameraLabel = getPresetLabel(CAMERA_PRESETS, dna.render.camera);
        const faceNotes = [
            `${dna.identity.sex} ${dna.identity.ethnicity} character, ${dna.identity.age} years, ${dna.identity.skinTone} skin tone.`,
            `Face: ${dna.face.faceShape} face shape, ${dna.face.eyes} eyes, ${dna.face.nose} nose, ${dna.face.lips} lips, ${dna.face.jaw} jaw.`,
            `Hair: ${dna.hair.color} ${dna.hair.texture} hair, ${dna.hair.length} length, ${dna.hair.style} style.`,
            `Skin detail: freckles ${dna.skin.freckles}/10, scars or marks ${dna.skin.scars}/10, dermal age ${dna.skin.dermalAge}.`
        ].join(" ");
        const productionNote = `Source portrait identity anchor from Portrait Studio. Preserve the approved face, hair, skin tone, proportions, and emotional presence exactly while expanding into the sheet. Original lens/camera direction: ${cameraLabel}.`;

        setMode("pitch_sheet");
        setPitchSheetInput(prev => {
            const existingProductionNotes = prev.productionNotes.trim();

            return {
                ...prev,
                referenceImageUrl: imageUrl,
                referenceImages: undefined,
                identityLock: undefined,
                identitySource: "portrait_reference",
                identityStrength: 100,
                characterStyleReferenceUrl: undefined,
                characterName: prev.characterName || `Portrait ${dna.identity.sex} ${dna.identity.age}`,
                visualAge: "",
                height: "",
                heightIn: undefined,
                weightLbs: undefined,
                build: "",
                designLanguage: `${dna.identity.ethnicity} cinematic realism, preserving the approved Portrait Studio identity`,
                lightingMood: lightingLabel,
                faceDetails: faceNotes,
                productionNotes: existingProductionNotes.includes("Source portrait identity anchor")
                    ? existingProductionNotes
                    : [existingProductionNotes, productionNote].filter(Boolean).join("\n"),
            };
        });

        dispatch({ type: "ADD_LOG", payload: { message: "Generated portrait loaded as pitch sheet identity reference", type: "success" } });
    };

    const handleLoadToCast = () => {
        const imageUrl = generatedImage || state.lastCastedImage;

        if (!imageUrl) {
            dispatch({
                type: "ADD_LOG",
                payload: {
                    message: "Generate an image before loading to Cast.",
                    type: "error"
                }
            });
            return;
        }

        const alreadyInCast = state.cast.some((c: CastMember) => c.url === imageUrl || c.previewUrl === imageUrl);
        if (alreadyInCast) {
            dispatch({
                type: "ADD_LOG",
                payload: {
                    message: "This character is already registered in the session Cast.",
                    type: "info"
                }
            });
            return;
        }

        const newCast: CastMember = {
            id: `cast-port-${Date.now()}`,
            url: imageUrl,
            previewUrl: imageUrl,
            sourceUrl: imageUrl,
            tag: 'front',
            name: isPitchSheetMode ? pitchSheetSubjectName : activeLibraryName,
            identityLock: isPitchSheetMode ? pitchSheetInput.identityLock : undefined,
            profile: {
                identity: isPitchSheetMode ? pitchSheetSubjectName : dna.identity.ethnicity,
                wardrobe: isPitchSheetMode ? pitchSheetInput.wardrobeDirection : '',
                accessories: isPitchSheetMode ? pitchSheetInput.propsSignatureItems : '',
                style: isPitchSheetMode ? 'Character Pitch Sheet Preview' : 'Portrait',
                ...(isPitchSheetMode
                    ? {
                        generationStatus: 'preview' as const,
                        featureSource: 'character_pitch_sheet' as const,
                    }
                    : {})
            }
        };

        dispatch({ type: 'ADD_CAST', payload: newCast });
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: imageUrl });
        dispatch({ type: "ADD_LOG", payload: { message: "Successfully loaded into session Cast and Forge!", type: "success" } });
    };

    return (
        <div className="flex h-full w-full bg-[#0f0f11] text-gray-200 p-8 gap-8 overflow-hidden selection:bg-yellow-500/30 font-sans">
            <style>{`
 @keyframes compilePulse {
 0%, 100% { opacity: 0.2; background-color: #ffffff; box-: none; }
 50% { opacity: 1; background-color: #4ade80; box-: 0 0 6px rgba(34,197,94,0.4); }
 }
 `}</style>

            {/* GLOBAL LOADING OVERLAY */}
            {isGenerating && <CastDirectorThinking progress={progress} />}

            {/* LEFT PANEL: CONTROLS */}
            <div className="flex-1 flex flex-col gap-8 overflow-y-auto pr-4 pb-32 scrollbar-none">

                {/* HEADER */}
                <div className="flex justify-between items-end border-b border-white/5 pb-6">
                    <div>
                        <h2 className="text-4xl font-black text-white tracking-tighter mix-blend-screen leading-none">
                            PORTRAIT <span className="text-yellow-500">STUDIO</span>
                        </h2>
                        <p className="text-[10px] text-gray-500 font-mono tracking-[0.2em] uppercase mt-3 opacity-60 flex items-center gap-2">
                            <Activity className="w-3 h-3 text-green-500" /> Character DNA Engine v1.1
                        </p>
                    </div>
                    {/* Header Controls Removed */}
                </div>

                {/* MAIN CONTROLS GROUP */}
                <SolidPanel className="p-10 flex flex-col gap-12 overflow-visible">

                    <section className="flex flex-col gap-8">
                        {/* IDENTITY - Stronger Header */}
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-base font-black text-white/80 uppercase tracking-[0.15em] flex items-center gap-3 border-l-4 border-yellow-500/50 pl-4">
                                        <Fingerprint className="w-5 h-5 opacity-70" /> {mode === "pitch_sheet" ? "Pitch Sheet Brief" : "Identity Matrix"}
                                    </h3>
                                    {isPitchSheetMode && <PitchSheetPreviewBadge />}
                                </div>
                                {isPitchSheetMode && (
                                    <p className="max-w-xl pl-5 text-[11px] leading-relaxed text-blue-100/65">
                                        {PITCH_SHEET_PREVIEW_NOTE}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-3 flex-wrap justify-end">
                                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                    <button
                                        onClick={() => setMode("portrait")}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] uppercase tracking-wider whitespace-nowrap transition-all duration-200 ${mode === "portrait"
                                            ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold '
                                            : 'text-white/60 hover:bg-white/5 font-medium'
                                            }`}
                                    >
                                        Portrait
                                    </button>
                                    <button
                                        onClick={() => setMode("pitch_sheet")}
                                        title={PITCH_SHEET_PREVIEW_HELP}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider whitespace-nowrap transition-all duration-200 inline-flex items-center justify-center gap-1.5 ${mode === "pitch_sheet"
                                            ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold '
                                            : 'text-white/60 hover:bg-white/5 font-medium'
                                            }`}
                                    >
                                        <span>Character Pitch Sheet</span>
                                        <span className={mode === "pitch_sheet" ? "text-white/70" : "text-white/25"}>&middot;</span>
                                        <PitchSheetPreviewBadge className={mode === "pitch_sheet" ? "border-white/25 bg-white/10 text-white shadow-none" : ""} />
                                    </button>
                                </div>

                                {mode === "portrait" && (
                                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                        <button
                                            onClick={() => setDna(prev => ({
                                                ...prev,
                                                identityMode: "synthetic",
                                                referenceImageUrl: undefined,
                                                likenessLock: 100,
                                                refEditMode: "enhance",
                                                allowRefMorphology: true,
                                                allowRefHair: true,
                                                skin: { ...prev.skin, surfaceUnderEyeControl: true }
                                            }))}
                                            className={`px-4 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200 ${dna.identityMode === "synthetic"
                                                ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold '
                                                : 'text-white/60 hover:bg-white/5 font-medium'
                                                }`}
                                        >
                                            Synthetic
                                        </button>
                                        <button
                                            onClick={() => setDna(prev => ({
                                                ...prev,
                                                identityMode: "reference",
                                                allowRefHair: false,
                                                allowRefFace: false,
                                                allowRefSkin: false,
                                                allowRefMorphology: false
                                            }))}
                                            className={`px-4 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200 ${dna.identityMode === "reference"
                                                ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold '
                                                : 'text-white/60 hover:bg-white/5 font-medium'
                                                }`}
                                        >
                                            Reference
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {mode === "portrait" ? (
                            <>
                        {/* PRESETS & REFERENCE MANAGEMENT */}
                        <div className="flex flex-col gap-6 pt-2 border-b border-white/5 pb-8 mb-2">
                            {/* PRESET ROW (Synthetic only) */}
                            {dna.identityMode === "synthetic" && (
                                <div className="flex items-end gap-3 relative z-40 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex-1 flex flex-col gap-1.5 text-white">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Load Preset</label>
                                        <Dropdown
                                            options={Object.keys(presets).map(k => ({
                                                type: "option",
                                                label: k,
                                                value: k,
                                                onDelete: () => deletePreset(k)
                                            }))}
                                            value=""
                                            onChange={(val) => loadPreset(val)}
                                            placeholder="Select Preset..."
                                        />
                                    </div>
                                    <div className="h-[34px] flex items-center mb-0.5">
                                        {isSavingPreset ? (
                                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                                                <input
                                                    type="text"
                                                    value={newPresetName}
                                                    onChange={(e) => setNewPresetName(e.target.value)}
                                                    placeholder="Preset Name..."
                                                    className="h-[34px] px-3 bg-[#0f1117] border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-yellow-500/50 min-w-[140px] placeholder:text-gray-600 ring-1 ring-yellow-500/10"
                                                    onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={handleSavePreset}
                                                    className="h-[34px] px-3 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg border border-green-500/20 transition-colors flex items-center justify-center"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setIsSavingPreset(false)}
                                                    className="h-[34px] px-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg border border-red-500/20 transition-colors flex items-center justify-center"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setIsSavingPreset(true)}
                                                className="h-[34px] px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                                                title="Save Preset"
                                            >
                                                <Save className="w-3.5 h-3.5" /> Save Preset
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* REFERENCE MODE UPLOAD & FIDELITY (Reference only) */}
                            {dna.identityMode === "reference" && (
                                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                    {/* DRAG & DROP UPLOAD CARD */}
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-bold text-blue-400/60 uppercase tracking-widest pl-1 mb-1">Identity Reference Photo</label>
                                        {!dna.referenceImageUrl ? (
                                            <div
                                                className="min-h-[140px] border-2 border-dashed border-white/10 rounded-2xl bg-[#0f1117] hover:bg-white/[0.02] hover:border-blue-500/30 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group"
                                                onClick={openReferenceImagePicker}
                                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setReferenceImageFromFile(e.dataTransfer.files?.[0]);
                                                }}
                                            >
                                                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                                                    <Download className="w-5 h-5" />
                                                </div>
                                                <div className="flex flex-col items-center gap-1">
                                                    <p className="text-xs font-bold text-white/80">Drag & drop a reference photo here</p>
                                                    <p className="text-[10px] text-white/40 font-medium">or click to upload from your device</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black/40 min-h-[140px] flex items-center justify-center">
                                                <img src={dna.referenceImageUrl} alt="Reference" className="max-w-full max-h-[200px] object-contain" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                                    <button
                                                        onClick={openReferenceImagePicker}
                                                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border border-white/10"
                                                    >
                                                        Replace
                                                    </button>
                                                    <button
                                                        onClick={() => setDna(prev => ({ ...prev, referenceImageUrl: undefined }))}
                                                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-500/20"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-3 pt-2">
                                        <Slider
                                            label="Likeness Fidelity Lock"
                                            min={0} max={100}
                                            value={dna.likenessLock || 100}
                                            valueDisplay={`${dna.likenessLock || 100}%`}
                                            onChange={(e) => setDna(prev => ({ ...prev, likenessLock: Number(e.target.value) }))}
                                            className="accent-blue-500"
                                        />
                                        <p className="text-[9px] text-blue-400/60 font-bold uppercase tracking-tight pl-1 leading-none">Controls how strongly the reference photo influences the generative output.</p>
                                    </div>
                                </div>
                            )}
                        </div>


                        {dna.identityMode === "reference" ? (
                            <div className="flex flex-col gap-6 p-5 bg-white/5 rounded-2xl border border-white/10 animate-in fade-in slide-in-from-top-4 duration-500">
                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Activity className="w-3 h-3" /> Age Transform
                                </h4>

                                <div className="grid grid-cols-2 gap-10">
                                    <div className="flex flex-col gap-1.5 relative z-20">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Life Stage</label>
                                        <Dropdown
                                            options={LIFE_STAGE_OPTIONS}
                                            value={dna.identity.lifeStage}
                                            onChange={(val) => {
                                                if (isLifeStage(val)) {
                                                    setLifeStage(val);
                                                }
                                            }}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <Slider
                                            label="Chronological Age"
                                            min={LIFE_STAGES[dna.identity.lifeStage].min}
                                            max={LIFE_STAGES[dna.identity.lifeStage].max}
                                            value={dna.identity.age}
                                            valueDisplay={`${dna.identity.age} yrs`}
                                            onChange={(e) => updateIdentity("age", Number(e.target.value))}
                                            className="accent-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 bg-blue-500/5 p-3 rounded-lg border border-blue-500/10">
                                    <span className="text-[10px] text-blue-400/80 font-medium leading-relaxed">
                                        Reference photo controls identity. Life Stage and Age apply an age progression/regression while preserving exact likeness.
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-10">
                                <div className="flex flex-col gap-8">
                                    <div className="flex flex-col gap-1.5 relative z-30">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Biosign: Sex</label>
                                        <Dropdown
                                            options={[{ type: "option", label: "Female", value: "Female" }, { type: "option", label: "Male", value: "Male" }]}
                                            value={dna.identity.sex}
                                            onChange={(val) => updateIdentity("sex", val)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5 relative z-20">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Biosign: Ethnicity</label>
                                        <Dropdown
                                            options={[
                                                { type: "option", label: "Caucasian", value: "Caucasian" },
                                                { type: "option", label: "Black / African", value: "Black" },
                                                { type: "option", label: "East Asian", value: "East Asian" },
                                                { type: "option", label: "South Asian", value: "South Asian" },
                                                { type: "option", label: "Hispanic / Latino", value: "Hispanic" },
                                                { type: "option", label: "Middle Eastern", value: "Middle Eastern" },
                                                { type: "option", label: "Pacific Islander", value: "Pacific Islander" },
                                                { type: "option", label: "Mixed", value: "Mixed Race" },
                                                { type: "option", label: "Fantasy / Alien", value: "Fantasy Skin" }
                                            ]}
                                            value={dna.identity.ethnicity}
                                            onChange={(val) => updateIdentity("ethnicity", val)}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-8">
                                    <div className="flex flex-col gap-1.5 relative z-30">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Dermal: Tone</label>
                                        <Dropdown
                                            options={[
                                                { type: "option", label: "Type I (Pale White)", value: "Type I" },
                                                { type: "option", label: "Type II (White)", value: "Type II" },
                                                { type: "option", label: "Type III (White to Olive)", value: "Type III" },
                                                { type: "option", label: "Type IV (Olive / Brown)", value: "Type IV" },
                                                { type: "option", label: "Type V (Dark Brown)", value: "Type V" },
                                                { type: "option", label: "Type VI (Black)", value: "Type VI" },
                                            ]}
                                            value={dna.identity.skinTone}
                                            onChange={(val) => updateIdentity("skinTone", val)}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5 relative z-20">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Life Stage</label>
                                    <Dropdown
                                        options={LIFE_STAGE_OPTIONS}
                                        value={dna.identity.lifeStage}
                                        onChange={(val) => {
                                            if (isLifeStage(val)) {
                                                setLifeStage(val);
                                            }
                                        }}
                                    />
                                </div>

                                    <Slider
                                        label="Chronological Age"
                                        min={LIFE_STAGES[dna.identity.lifeStage].min}
                                        max={LIFE_STAGES[dna.identity.lifeStage].max}
                                        value={dna.identity.age}
                                        valueDisplay={`${dna.identity.age} yrs`}
                                        onChange={(e) => updateIdentity("age", Number(e.target.value))}
                                    />
                                </div>
                            </div>
                        )}
                            </>
                        ) : (
                            <div className="flex flex-col gap-8 pt-2 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                                {Boolean(pitchSheetInput.referenceImages?.length) && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold text-yellow-500/70 uppercase tracking-widest pl-1">
                                                Multi-View Biometric Identity Lock
                                            </label>
                                            <button
                                                onClick={() => setPitchSheetInput(prev => ({
                                                    ...prev,
                                                    referenceImages: undefined,
                                                    identityLock: undefined,
                                                    identitySource: prev.referenceImageUrl ? "portrait_reference" : "text_only",
                                                    characterStyleReferenceUrl: undefined
                                                }))}
                                                className="text-[9px] font-bold text-red-400/60 hover:text-red-400 uppercase tracking-[0.2em] transition-colors"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-5 gap-2">
                                            {(pitchSheetInput.referenceImages || []).map((ref, index) => (
                                                <div key={`${ref.angle || "angle"}-${index}`} className="relative aspect-[4/5] rounded-xl overflow-hidden border border-yellow-500/20 bg-black/40">
                                                    <img src={ref.imageUrl} alt={ref.label || "Biometric reference"} className="w-full h-full object-cover" />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-black/65 px-2 py-1 text-[8px] text-yellow-500 uppercase font-black tracking-widest text-center">
                                                        {ref.angle || `Ref ${index + 1}`}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {pitchSheetInput.characterStyleReferenceUrl && (
                                            <div className="flex items-center gap-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10 p-3">
                                                <img src={pitchSheetInput.characterStyleReferenceUrl} alt="Approved generated character source" className="w-16 h-16 rounded-lg object-cover border border-white/10 bg-black" />
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.2em]">
                                                        {pitchSheetInput.identitySource === "biometric_plus_character" ? "Generated Character Source" : "Style / Character Reference"}
                                                    </span>
                                                    <span className="text-[10px] text-white/45 leading-relaxed">
                                                        {pitchSheetInput.identitySource === "biometric_plus_character"
                                                            ? "This generated character is the primary visual design for the pitch sheet; biometric angles preserve facial identity."
                                                            : "Biometric angles remain the identity authority; this image contributes wardrobe, lighting, and character-design direction."}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!pitchSheetInput.referenceImages?.length && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-bold text-yellow-500/70 uppercase tracking-widest pl-1">
                                        Identity Reference
                                    </label>
                                    {!pitchSheetInput.referenceImageUrl ? (
                                        <div
                                            className="min-h-[132px] border-2 border-dashed border-white/10 rounded-2xl bg-[#0f1117] hover:bg-white/[0.02] hover:border-yellow-500/30 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer group"
                                            onClick={openPitchSheetReferenceImagePicker}
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setPitchSheetReferenceImageFromFile(e.dataTransfer.files?.[0]);
                                            }}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500 group-hover:scale-110 transition-transform">
                                                <Download className="w-5 h-5" />
                                            </div>
                                            <div className="flex flex-col items-center gap-1">
                                                <p className="text-xs font-bold text-white/80">Drop or upload a portrait anchor</p>
                                                <p className="text-[10px] text-white/40 font-medium">Optional identity reference for the pitch sheet</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="relative group rounded-2xl overflow-hidden border border-yellow-500/20 bg-black/40 min-h-[132px] flex items-center justify-center">
                                            <img src={pitchSheetInput.referenceImageUrl} alt="Pitch sheet identity reference" className="max-w-full max-h-[220px] object-contain" />
                                            <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                                <button
                                                    onClick={openPitchSheetReferenceImagePicker}
                                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border border-white/10"
                                                >
                                                    Replace
                                                </button>
                                                <button
                                                    onClick={() => setPitchSheetInput(prev => ({
                                                        ...prev,
                                                        referenceImageUrl: undefined,
                                                        identitySource: prev.referenceImages?.length ? prev.identitySource : "text_only"
                                                    }))}
                                                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-500/20"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                )}

                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-bold text-yellow-500/70 uppercase tracking-widest pl-1">
                                        Source Panel Display
                                    </label>
                                    <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-gradient-to-b from-[#171820] via-[#0c0d12] to-[#07080c] border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_34px_rgba(0,0,0,0.32)]">
                                        {SOURCE_PANEL_MODE_OPTIONS.map((option) => {
                                            const isSelected = pitchSheetSourcePanelMode === option.value;

                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() => setPitchSheetInput(prev => ({
                                                        ...prev,
                                                        sourcePanelMode: option.value
                                                    }))}
                                                    className={`relative min-h-[42px] rounded-xl px-3 py-2.5 flex items-center justify-center text-center text-[10px] leading-tight font-black uppercase tracking-[0.16em] border transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090a0f] ${isSelected
                                                        ? "text-white bg-gradient-to-b from-[#5a4513] via-[#33250d] to-[#161108] border-yellow-400/45 shadow-[0_0_16px_rgba(234,179,8,0.22),0_8px_18px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,236,179,0.20)] -translate-y-px"
                                                        : "text-white/70 bg-gradient-to-b from-white/[0.055] to-white/[0.018] border-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:text-white/90 hover:bg-white/[0.075] hover:border-white/[0.10] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                                        }`}
                                                >
                                                    {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 relative z-30">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
                                            Character Render Style
                                        </label>
                                        <Dropdown
                                            options={CHARACTER_RENDER_STYLE_OPTIONS}
                                            value={pitchSheetCharacterRenderStyle}
                                            onChange={(value) => setPitchSheetInput(prev => ({
                                                ...prev,
                                                characterRenderStyle: value as NonNullable<CharacterPitchSheetInput["characterRenderStyle"]>
                                            }))}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
                                            Board Presentation Style
                                        </label>
                                        <Dropdown
                                            options={BOARD_PRESENTATION_STYLE_OPTIONS}
                                            value={pitchSheetBoardPresentationStyle}
                                            onChange={(value) => setPitchSheetInput(prev => ({
                                                ...prev,
                                                boardPresentationStyle: value as NonNullable<CharacterPitchSheetInput["boardPresentationStyle"]>
                                            }))}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {PITCH_SHEET_SHORT_FIELDS.map((field) => (
                                        <Input
                                            key={field.field}
                                            label={field.label}
                                            value={pitchSheetInput[field.field]}
                                            onChange={(e) => updatePitchSheetInput(field.field, e.target.value)}
                                            placeholder={field.placeholder}
                                        />
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {PITCH_SHEET_LONG_FIELDS.map((field) => (
                                        <div key={field.field} className={field.field === "additionalNotes" ? "flex flex-col gap-1.5 col-span-2" : "flex flex-col gap-1.5"}>
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
                                                {field.label}
                                            </label>
                                            <textarea
                                                value={pitchSheetInput[field.field]}
                                                onChange={(e) => updatePitchSheetInput(field.field, e.target.value)}
                                                placeholder={field.placeholder}
                                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 focus:bg-black/50 transition-all placeholder:text-white/20 hover:border-white/20 resize-none min-h-[92px] leading-relaxed"
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-col gap-3 pt-2">
                                    {PITCH_SHEET_ADVANCED_SECTIONS.map((section) => {
                                        const isOpen = expandedPitchSheetSections[section.key];

                                        return (
                                            <div key={section.key} className="border border-white/10 rounded-xl bg-black/20 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => togglePitchSheetSection(section.key)}
                                                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                                                >
                                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                                        {section.label}
                                                    </span>
                                                    <ChevronDown className={`w-4 h-4 text-yellow-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                                                </button>
                                                {isOpen && (
                                                    <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                                        <textarea
                                                            value={pitchSheetInput[section.field]}
                                                            onChange={(e) => updatePitchSheetInput(section.field, e.target.value)}
                                                            placeholder={section.placeholder}
                                                            className="w-full bg-[#0f1117] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition-all placeholder:text-white/20 resize-none min-h-[110px] leading-relaxed"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>

                    {mode === "portrait" && (
                        <>
                    {/* MORPHOLOGY - Visual emphasis Upgrade */}
                    <section className={`flex flex-col gap-8 bg-black/20 -mx-10 px-10 py-10 border-y border-white/5 relative group transition-all duration-500 ${!dna.allowRefMorphology ? 'opacity-40 pointer-events-none' : ''}`}>
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                            <Activity className="w-32 h-32" />
                        </div>

                        <div className="flex justify-between items-center z-10">
                            <div className="flex items-center gap-6">
                                <h3 className="text-sm font-black text-yellow-500/90 uppercase tracking-[0.2em] flex items-center gap-3">
                                    <Calculator className="w-4 h-4" /> Morphology
                                </h3>
                                {dna.identityMode === "reference" && (
                                    <button
                                        onClick={() => updateReferenceFlags({ allowRefMorphology: !dna.allowRefMorphology })}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 ${dna.allowRefMorphology
                                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                                            }`}
                                    >
                                        {dna.allowRefMorphology ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                        <span className="text-[8px] font-black uppercase tracking-widest leading-none">
                                            {dna.allowRefMorphology ? 'Edits Enabled' : 'Locked to Reference'}
                                        </span>
                                    </button>
                                )}
                            </div>
                            {/* Prominent BMI Badge */}
                            <div className="flex items-center gap-4 bg-yellow-500/5 px-5 py-3 rounded-lg border border-yellow-500/10 -[0_4px_20px_rgba(0,0,0,0.2)] hover:border-yellow-500/30 transition-colors cursor-help group/bmi">
                                <div className="flex flex-col gap-0.5 text-right border-r border-yellow-500/20 pr-4 mr-1">
                                    <span className="text-[9px] text-yellow-500/70 font-bold uppercase tracking-widest">Metabolic Index</span>
                                    <span className="text-[9px] text-white/40 uppercase tracking-widest group-hover/bmi:text-white/60 transition-colors">{dna.morphology.buildDescription}</span>
                                </div>
                                <span className="text-3xl font-black text-white tracking-tight tabular-nums transition-all duration-300 group-hover/bmi:text-yellow-400">
                                    {dna.morphology.bmi}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-16 z-10">
                            {/* Height - Dropdowns Left, Big Number Right */}
                            <div className="flex items-center gap-6">
                                <div className="flex-1 flex flex-col gap-3">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Height (ft / in)</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 relative z-20">
                                            <Dropdown
                                                options={[3, 4, 5, 6, 7, 8, 9].map(f => ({ type: "option", label: `${f} ft`, value: f.toString() }))}
                                                value={Math.floor(Math.round(dna.morphology.heightCm / 2.54) / 12).toString()}
                                                onChange={(val) => {
                                                    const ft = Number(val);
                                                    const inch = Math.round(dna.morphology.heightCm / 2.54) % 12;
                                                    updateMorphology("heightCm", Math.round(((ft * 12) + inch) * 2.54));
                                                }}
                                            />
                                        </div>
                                        <div className="flex-1 relative z-20">
                                            <Dropdown
                                                options={Array.from({ length: 12 }, (_, i) => i).map(i => ({ type: "option", label: `${i} in`, value: i.toString() }))}
                                                value={(Math.round(dna.morphology.heightCm / 2.54) % 12).toString()}
                                                onChange={(val) => {
                                                    const ft = Math.floor(Math.round(dna.morphology.heightCm / 2.54) / 12);
                                                    const inch = Number(val);
                                                    updateMorphology("heightCm", Math.round(((ft * 12) + inch) * 2.54));
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <span className="text-5xl font-thin text-white font-mono tracking-tighter tabular-nums w-32 text-right transition-all duration-150">
                                    {Math.floor(Math.round(dna.morphology.heightCm / 2.54) / 12)}'<span className="text-2xl text-gray-500 mx-1">{Math.round(dna.morphology.heightCm / 2.54) % 12}"</span>
                                </span>
                            </div>

                            {/* Weight - Slider Left, Big Number Right */}
                            <div className="flex items-center gap-6">
                                <div className="flex-1 flex flex-col gap-3">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Weight (lbs)</label>
                                    <input
                                        type="range"
                                        min={90} max={300}
                                        value={Math.round(dna.morphology.weightKg / 0.453592)}
                                        onChange={(e) => updateMorphology("weightKg", Number(e.target.value) * 0.453592)}
                                        className="w-full h-2 bg-black/50 rounded-full appearance-none cursor-pointer accent-white hover:accent-yellow-500 transition-all border border-white/5"
                                    />
                                    <div className="flex justify-between text-[9px] text-gray-700 font-mono">
                                        <span>90lbs</span>
                                        <span>300lbs</span>
                                    </div>
                                </div>
                                <span className="text-5xl font-thin text-white font-mono tracking-tighter tabular-nums w-32 text-right transition-all duration-150">
                                    {Math.round(dna.morphology.weightKg / 0.453592)}<span className="text-sm text-gray-600 ml-1 font-sans font-bold">lbs</span>
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* FACIAL STRUCTURE - Lighter Touch */}
                    <section className="flex flex-col gap-8">
                        <div className="flex justify-between items-center pr-2">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2 pl-1">
                                <ScanFace className="w-4 h-4 opacity-50" /> Facial Architecture
                            </h3>
                            {dna.identityMode === "reference" && (
                                <button
                                    onClick={() => updateReferenceFlags({ allowRefFace: !dna.allowRefFace })}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 ${dna.allowRefFace
                                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                        : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {dna.allowRefFace ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                    <span className="text-[8px] font-black uppercase tracking-widest leading-none">
                                        {dna.allowRefFace ? 'Edits Enabled' : 'Locked to Reference'}
                                    </span>
                                </button>
                            )}
                        </div>
                        {dna.identityMode === "reference" && !dna.allowRefFace && (
                            <p className="text-[9px] text-blue-400/60 font-medium uppercase tracking-tight -mt-4 mb-2 animate-in fade-in duration-500 ml-1">
                                Face shape, eyes, nose, and lips are preserved from the reference photo.
                            </p>
                        )}
                        <div className={`grid grid-cols-2 gap-x-10 gap-y-8 pl-2 transition-all duration-500 ${(!dna.allowRefFace && dna.identityMode === "reference") ? 'opacity-40 pointer-events-none' : ''}`}>


                            {/* Feature Selectors */}
                            {FACE_FEATURES.map((feature) => {
                                const currentValue = dna.face[feature.field];
                                const isPreset = feature.presets.some((preset) => preset.key === currentValue);
                                const dropdownValue = isPreset ? (currentValue as string) : "custom_input";

                                const isStructuralField = feature.field === "faceShape" || feature.field === "nose" || feature.field === "jaw";
                                const isLocked = dna.identityMode === "reference" && (dna.likenessLock || 100) === 100 && isStructuralField;

                                return (
                                    <div key={feature.field} className={`flex flex-col gap-1.5 animate-in fade-in duration-500 transition-opacity ${isLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">{feature.label}</label>
                                        <div className="flex flex-col gap-2">
                                            <Dropdown
                                                options={[
                                                    ...feature.presets.map((preset) => ({ type: "option" as const, label: preset.label, value: preset.key })),
                                                    { type: "option" as const, label: "Custom...", value: "custom_input" }
                                                ]}
                                                value={dropdownValue}
                                                disabled={isLocked}
                                                onChange={(val) => {
                                                    if (val === "custom_input") {
                                                        if (isPreset) updateFace(feature.field, "");
                                                    } else {
                                                        updateFace(feature.field, val);
                                                    }
                                                }}
                                            />

                                            {dropdownValue === "custom_input" && (
                                                <input
                                                    type="text"
                                                    value={currentValue}
                                                    onChange={(e) => updateFace(feature.field, e.target.value)}
                                                    placeholder={feature.placeholder}
                                                    className="w-full bg-[#0f1117]/50 border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-yellow-500/50 transition-all placeholder:text-gray-700 animate-in slide-in-from-top-1 fade-in duration-200"
                                                    autoFocus={currentValue === ""}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Creative Direction</label>
                                <textarea
                                    value={dna.render.additionalNotes || ""}
                                    onChange={(e) => updateRender("additionalNotes", e.target.value)}
                                    placeholder="Add subtle details..."
                                    className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-xs focus:outline-none focus:border-yellow-500/50 transition-colors placeholder:text-gray-700 resize-none h-[42px] leading-tight overflow-hidden"
                                />
                            </div>
                        </div>
                    </section>

                    {/* SKIN & HAIR GROUP - Two Columns */}
                    <div className="grid grid-cols-2 gap-12 pt-4 border-t border-white/5 transition-all duration-500">
                        {/* SKIN DETAILS */}
                        <section className="flex flex-col gap-6">
                            <div className="flex justify-between items-center pr-2">
                                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
                                    Surface Imperfections
                                </h3>
                                {dna.identityMode === "reference" && (
                                    <button
                                        onClick={() => updateReferenceFlags({ allowRefSkin: !dna.allowRefSkin })}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 ${dna.allowRefSkin
                                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                                            }`}
                                    >
                                        {dna.allowRefSkin ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                        <span className="text-[8px] font-black uppercase tracking-widest leading-none">
                                            {dna.allowRefSkin ? 'Edits Enabled' : 'Locked to Reference'}
                                        </span>
                                    </button>
                                )}
                            </div>
                            {dna.identityMode === "reference" && !dna.allowRefSkin && (
                                <p className="text-[9px] text-blue-400/60 font-medium uppercase tracking-tight -mt-4 mb-2 animate-in fade-in duration-500">
                                    Freckles, scars, and skin age are preserved from the reference photo.
                                </p>
                            )}
                            <div className={`flex flex-col gap-6 transition-all duration-500 ${(!dna.allowRefSkin && dna.identityMode === "reference") ? 'opacity-40 pointer-events-none' : ''}`}>
                                <Slider
                                    label="Freckles Density"
                                    min={0} max={10}
                                    value={dna.skin.freckles}
                                    valueDisplay={dna.skin.freckles}
                                    onChange={(e) => updateSkin("freckles", Number(e.target.value))}
                                />
                                <Slider
                                    label="Scars / Marks"
                                    min={0} max={10}
                                    value={dna.skin.scars}
                                    valueDisplay={dna.skin.scars}
                                    onChange={(e) => updateSkin("scars", Number(e.target.value))}
                                />
                                <Slider
                                    label="Dermal Age"
                                    min={0} max={100}
                                    value={dna.skin.dermalAge}
                                    valueDisplay={`${dna.skin.dermalAge}y`}
                                    onChange={(e) => updateSkin("dermalAge", Number(e.target.value))}
                                />
                                {dna.identityMode === "reference" && (
                                    <div className="flex items-center gap-2 pl-1 animate-in fade-in slide-in-from-left-2 duration-300">
                                        <input
                                            id="ref-under-eye"
                                            type="checkbox"
                                            checked={dna.skin.surfaceUnderEyeControl}
                                            onChange={(e) => updateSkin("surfaceUnderEyeControl", e.target.checked)}
                                            className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-yellow-500 focus:ring-yellow-500/50"
                                        />
                                        <label htmlFor="ref-under-eye" className="text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer hover:text-gray-300 transition-colors">
                                            Treat under-eye bags as surface aging
                                        </label>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* HAIR */}
                        <section className="flex flex-col gap-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
                                    Follicle System
                                </h3>
                                {dna.identityMode === "reference" && (
                                    <button
                                        onClick={toggleHairLock}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200 pointer-events-auto ${dna.allowRefHair
                                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                                            }`}
                                    >
                                        {dna.allowRefHair ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                        <span className="text-[8px] font-black uppercase tracking-widest leading-none">
                                            {dna.allowRefHair ? 'Edits Enabled' : 'Locked to Reference'}
                                        </span>
                                    </button>
                                )}
                            </div>
                            {dna.identityMode === "reference" && !dna.allowRefHair && (
                                <p className="text-[9px] text-blue-400/60 font-medium uppercase tracking-tight -mt-4 mb-2 animate-in fade-in duration-500">
                                    Hair, facial hair, and eyewear are preserved from the reference photo.
                                </p>
                            )}
                            <div className={`grid grid-cols-2 gap-6 transition-all duration-500 ${(!dna.allowRefHair && dna.identityMode === "reference") ? 'opacity-40 pointer-events-none' : ''}`}>
                                <Input label="Color" value={dna.hair.color} onChange={(e) => updateHair("color", e.target.value)} />
                                <Input label="Style" value={dna.hair.style} onChange={(e) => updateHair("style", e.target.value)} />
                                <Input label="Length" value={dna.hair.length} onChange={(e) => updateHair("length", e.target.value)} />
                                <Input label="Texture" value={dna.hair.texture} onChange={(e) => updateHair("texture", e.target.value)} />
                            </div>
                        </section>
                    </div>
                        </>
                    )}
                </SolidPanel>

                {/* RENDER SETTINGS */}
                {mode === "portrait" && (
                    <SolidPanel className="p-10 flex flex-col gap-8 relative z-50">
                    <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Aperture className="w-4 h-4 opacity-70" /> Render Protocol
                    </h3>
                    <div className="grid grid-cols-2 gap-12">
                        <div className="flex flex-col gap-6 relative z-10">
                            {/* LIGHTING PRESET SELECT */}
                            <div className="flex flex-col gap-1.5 relative z-20">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
                                    Lighting Setup
                                </label>
                                <Dropdown
                                    options={LIGHTING_PRESETS.map(p =>
                                        p.disabled ? { type: "group", label: p.category } : { type: "option", label: p.label, value: p.key }
                                    )}
                                    value={dna.render.lighting}
                                    onChange={(val) => updateRender("lighting", val)}
                                    placeholder="Select Lighting..."
                                    forceUpward={true}
                                    closeOnMouseLeave={true}
                                    variant="render"
                                />
                            </div>

                            {/* OPTICS PRESET SELECT */}
                            <div className="flex flex-col gap-1.5 relative z-10">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
                                    Optics / Lens
                                </label>
                                <Dropdown
                                    options={CAMERA_PRESETS.map(p =>
                                        p.disabled ? { type: "group", label: p.category } : { type: "option", label: p.label, value: p.key }
                                    )}
                                    value={dna.render.camera}
                                    onChange={(val) => updateRender("camera", val)}
                                    placeholder="Select Lens..."
                                    forceUpward={true}
                                    closeOnMouseLeave={true}
                                    variant="render"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-8 pt-2">
                            <Slider
                                label="Realism Threshold"
                                min={0} max={100}
                                value={dna.render.realismLevel}
                                valueDisplay={`${dna.render.realismLevel}%`}
                                onChange={(e) => updateRender("realismLevel", Number(e.target.value))}
                                className="accent-emerald-500"
                            />
                            <Slider
                                label="Construct Stylization"
                                min={0} max={100}
                                value={dna.render.stylizationLevel}
                                valueDisplay={`${dna.render.stylizationLevel}%`}
                                onChange={(e) => updateRender("stylizationLevel", Number(e.target.value))}
                                className="accent-purple-500"
                            />
                        </div>
                    </div>
                    </SolidPanel>
                )}
            </div>

            {/* RIGHT PANEL: CONSOLE */}
            <div className="w-[480px] flex flex-col gap-4 shrink-0 pb-10 overflow-y-auto pt-2 scrollbar-none">

                {/* CHARACTER SUMMARY BLOCK (NEW) */}
                <SolidPanel className="p-4 flex flex-col gap-2 shrink-0 border-white/10 relative">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Fingerprint className="w-12 h-12" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        {isPitchSheetMode ? "PITCH SHEET \u00b7 PREVIEW" : "Live DNA Stream"}
                    </div>
                    <div className="flex justify-between items-end relative z-10">
                        <div className="flex flex-col gap-0.5">
                            <div className="text-lg font-black text-white leading-none">
                                {isPitchSheetMode ? pitchSheetSubjectName.toUpperCase() : (dna.identityMode === "reference" ? "IDENTITY REFERENCE" : dna.identity.ethnicity)}
                            </div>
                            <div className="text-xs text-gray-400 font-medium">
                                {isPitchSheetMode
                                    ? (pitchSheetInput.aliasCodename || pitchSheetInput.worldEra || "Cinematic design sheet")
                                    : (dna.identityMode === "reference" ? "Locked to source photograph" : `${dna.identity.sex}, ${dna.identity.age} years`)}
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="text-sm font-bold text-white font-mono">
                                {isPitchSheetMode ? (pitchSheetInput.visualAge || "inferred age") : `${dna.morphology.heightCm}cm / ${dna.morphology.weightKg}kg`}
                            </div>
                            {isPitchSheetMode ? (
                                <div className="text-[10px] text-yellow-500 uppercase font-bold tracking-wider">
                                    {pitchSheetInput.sheetStyle ? `${pitchSheetInput.sheetStyle} \u00b7 Preview` : "PITCH SHEET \u00b7 PREVIEW"}
                                </div>
                            ) : null}
                            {!isPitchSheetMode && (
                            <div className="text-[10px] text-yellow-500 uppercase font-bold tracking-wider">BMI {dna.morphology.bmi} • {dna.morphology.buildDescription}</div>
                            )}
                        </div>
                    </div>
                </SolidPanel>

                {/* GENERATED IMAGE RESULT (INLINE) */}
                {generatedImage && (
                    <SolidPanel className="p-1 border-green-500/20 -[0_0_30px_rgba(74,222,128,0.1)] relative group shrink-0 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <button
                            onClick={clearPortraitResult}
                            className="absolute top-3 right-3 z-20 p-1.5 bg-black/50 hover:bg-red-500/80 text-white rounded-full transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100"
                            title="Close Result"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        <div className="rounded-xl overflow-hidden h-96 w-full relative bg-black group-hover/image">
                            <img src={generatedImage} alt={generatedOutputAlt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                            {/* Image Actions Overlay */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-center gap-4 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                <button
                                    onClick={() => {
                                        const link = document.createElement("a");
                                        link.href = generatedImage;
                                        link.download = createUniqueDownloadFilename(generatedOutputFilename);
                                        link.click();
                                    }}
                                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-md border border-white/10 transition-colors"
                                    title="Download High-Res"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setIsInspecting(true)}
                                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-md border border-white/10 transition-colors"
                                    title="Inspect Large"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </SolidPanel>
                )}

                {/* RECENT GENERATIONS STRIP */}
                <RecentGenerationsStrip
                    studio="portrait"
                    className="shrink-0"
                    onSelectGeneration={(gen) => {
                        setGeneratedImage(gen.displayUrl);
                        dispatch({ type: "SET_LAST_CASTED_IMAGE", payload: gen.displayUrl });
                    }}
                    onExportGeneration={(gen) => {
                        openActorSaveModal(gen.displayUrl, activeLibraryName, gen.id);
                    }}
                />

                {/* CONSOLE CARD */}
                <SolidPanel className="flex-1 flex flex-col h-full border-white/5 bg-[#050505] -[inset_0_2px_20px_rgba(0,0,0,0.5)]">
                    {/* Console Header */}
                    <div className="h-12 bg-black/60 border-b border-white/5 flex items-center justify-between px-5 shrink-0">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-4 h-4 text-green-500/50" />
                            <span className="text-[10px] font-mono text-green-500/50 uppercase tracking-widest">{isPitchSheetMode ? "PITCH_SHEET_PREVIEW_COMPILER_V1.EXE" : "DNA_COMPILER_V1.EXE"}</span>
                        </div>
                        <div className="flex gap-1.5">
                            {[0, 150, 300].map((delay, i) => (
                                <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full bg-white transition-all duration-300 ${!isCompiling ? 'opacity-20' : ''}`}
                                    style={isCompiling ? { animation: 'compilePulse 0.8s ease-in-out infinite', animationDelay: `${delay}ms` } : {}}
                                ></div>
                            ))}
                        </div>
                    </div>

                    {/* Output Area */}
                    <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-green-500/20 to-transparent"></div>

                        <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] pl-1">Compiled Output Stream</label>
                            <textarea
                                className="w-full flex-1 bg-[#0a0a0c] border border-white/5 rounded-lg p-5 text-xs font-mono text-green-400/90 focus:outline-none resize-none leading-relaxed tracking-wide selection:bg-green-500/30 transition-opacity duration-150"
                                readOnly
                                value={compiledPrompt}
                            />
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col gap-4 mt-2">
                            {/* Top section: Generate button (full width) */}
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || isReferenceImageRequired}
                                    className={`w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold rounded-xl px-6 py-3.5 hover:brightness-110 transition-all duration-200 ease-out flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 group relative ${isReferenceImageRequired ? 'grayscale opacity-30 ' : ''}`}
                                >
                                    {isGenerating ? (
                                        <RefreshCw className="w-4 h-4 animate-spin relative z-10" />
                                    ) : (
                                        <Wand2 className="w-4 h-4 -[0_0_6px_rgba(255,215,0,0.35)] transition-transform duration-200 group-hover:-translate-y-px relative z-10" />
                                    )}
                                    <span className="relative z-10 font-bold uppercase tracking-wider text-xs whitespace-nowrap">
                                        {isGenerating ? generatingButtonLabel : generateButtonLabel}
                                    </span>
                                    {isPitchSheetMode && (
                                        <PitchSheetPreviewBadge className="relative z-10 border-white/25 bg-black/20 text-white shadow-none text-[8px] py-0.5 px-1.5 ml-2 uppercase font-black tracking-widest shrink-0" />
                                    )}
                                </button>

                                {isReferenceImageRequired && (
                                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-tight text-center animate-pulse">
                                        Reference image required in Reference Mode.
                                    </p>
                                )}
                            </div>

                            {/* Below / secondary section: LOAD TO CAST, START NEW SUBJECT, PRODUCTION ACTOR side-by-side */}
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    onClick={handleLoadToCast}
                                    disabled={isGenerating}
                                    className="flex-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold rounded-xl px-2 py-3.5 transition-all flex flex-col items-center justify-center gap-1 uppercase tracking-wider text-[9px] disabled:opacity-35 disabled:cursor-not-allowed text-center leading-tight"
                                    title="Load Generated Image to Cast State"
                                >
                                    <UserPlus className="w-3.5 h-3.5 mb-0.5" />
                                    <span>LOAD TO CAST</span>
                                </button>
                                <button
                                    onClick={() => dispatch({ type: 'SET_PRODUCTION_ACTOR_WORKFLOW_SOURCE', payload: { imageUrl: generatedImage!, suggestedName: 'Portrait ' + Date.now() } })}
                                    disabled={!generatedImage || isGenerating}
                                    className="flex-1 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold rounded-xl px-2 py-3.5 transition-all flex flex-col items-center justify-center gap-1 uppercase tracking-wider text-[9px] disabled:opacity-35 text-center leading-tight"
                                    title="Convert this generation into a reusable Production Actor."
                                >
                                    <ShieldCheck className="w-3.5 h-3.5 mb-0.5" />
                                    <span>PRODUCTION ACTOR</span>
                                </button>
                                <button
                                    onClick={handleStartNew}
                                    disabled={isGenerating}
                                    className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold rounded-xl px-2 py-3.5 transition-all flex flex-col items-center justify-center gap-1 uppercase tracking-wider text-[9px] disabled:opacity-35 text-center leading-tight"
                                >
                                    <Sparkles className="w-3.5 h-3.5 mb-0.5" />
                                    <span>START NEW</span>
                                </button>
                            </div>

                            {/* Build Pitch Sheet From Character option (if available) */}
                            {canBuildPitchSheetFromCharacter && (
                                <button
                                    onClick={buildPitchSheetFromGeneratedPortrait}
                                    className="w-full bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/40 font-semibold rounded-xl px-5 py-3 transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-xs"
                                >
                                    <Sparkles className="w-4 h-4" /> Build Pitch Sheet From Character
                                    <PitchSheetPreviewBadge className="border-yellow-400/30 bg-yellow-500/10 text-yellow-200 shadow-none" />
                                </button>
                            )}

                            {/* Randomize row (if mode is portrait) */}
                            {mode === "portrait" && !generatedImage && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleRandomizeDNA}
                                        disabled={isGenerating}
                                        className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] disabled:opacity-30"
                                    >
                                        <span>🎲 Randomize DNA</span>
                                    </button>

                                    {lastDnaSnapshot && (
                                        <button
                                            onClick={handleUndoRandomize}
                                            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2 group"
                                            title="Undo Randomize"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-colors" />
                                            <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 group-hover:text-white">Undo</span>
                                        </button>
                                    )}

                                    <div className="h-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-gray-500 font-bold uppercase tracking-tight leading-none">Seed</span>
                                            <span className="text-[10px] font-mono text-yellow-500/80 tracking-wider">
                                                {randomSeed.toString().slice(-6)}
                                            </span>
                                        </div>
                                        <button
                                            onClick={handleCopySeed}
                                            className="text-gray-500 hover:text-white transition-colors"
                                            title="Copy Full Seed"
                                        >
                                            <Copy className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </SolidPanel>



                {/* Integration Actions (Ghost) */}

            </div>

            {/* LIGHTBOX INSPECTOR */}
            {/* LIGHTBOX INSPECTOR */}
            {isInspecting && generatedImage && (
                <div
                    className={`inspect-large-overlay ${mode === "pitch_sheet" ? "inspect-large-overlay--pitch-sheet" : ""} animate-in fade-in duration-200`}
                    onClick={() => setIsInspecting(false)}
                >
                    <div className="inspect-large-safe-stage">
                        <img
                            src={generatedImage}
                            alt={generatedOutputAlt}
                            className={`inspect-large-image ${mode === "pitch_sheet" ? "inspect-large-image--pitch-sheet" : ""}`}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Floating Action Bar */}
                    <div className="inspect-large-actions-wrap" onClick={(e) => e.stopPropagation()}>
                        {toast && (
                            <div 
                                className="inspect-large-action-message absolute bottom-[calc(100%+12px)] left-1/2"
                                style={toast.type === 'error' ? { 
                                    borderColor: 'rgba(239, 68, 68, 0.35)', 
                                    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.65), 0 10px 26px rgba(0, 0, 0, 0.42), 0 0 22px rgba(239, 68, 68, 0.16)' 
                                } : {}}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {toast.message}
                            </div>
                        )}
                        <div className="inspect-large-actions flex gap-4 bg-black/40 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl">
                            <button
                                onClick={async () => {
                                    if (isAddingCast) return;
                                    setIsAddingCast(true);
                                    try {
                                        const newCast: CastMember = {
                                            id: `cast-insp-${Date.now()}`,
                                            url: generatedImage,
                                            previewUrl: generatedImage,
                                            sourceUrl: generatedImage,
                                            tag: 'front',
                                            name: activeLibraryName,
                                            identityLock: isPitchSheetMode ? pitchSheetInput.identityLock : undefined,
                                            profile: {
                                                identity: isPitchSheetMode ? pitchSheetSubjectName : dna.identity.ethnicity,
                                                wardrobe: isPitchSheetMode ? pitchSheetInput.wardrobeDirection : '',
                                                accessories: isPitchSheetMode ? pitchSheetInput.propsSignatureItems : '',
                                                style: isPitchSheetMode ? 'Character Pitch Sheet Preview' : 'Portrait',
                                                ...(isPitchSheetMode
                                                    ? {
                                                        generationStatus: 'preview' as const,
                                                        featureSource: 'character_pitch_sheet' as const,
                                                    }
                                                    : {})
                                            }
                                        };
                                        dispatch({ type: 'ADD_CAST', payload: newCast });
                                        dispatch({ type: 'ADD_LOG', payload: { message: "Added to Cast", type: 'success' } });
                                        setToast({ message: "Added to Cast", type: 'success' });
                                    } catch (err: unknown) {
                                        setToast({ message: "Could not add to Cast", type: 'error' });
                                    } finally {
                                        setIsAddingCast(false);
                                    }
                                }}
                                disabled={isAddingCast}
                                className={`w-14 h-14 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-emerald-500/30 ${
                                    isAddingCast ? 'opacity-60 cursor-not-allowed scale-95' : ''
                                }`}
                                title="Add to Cast Assets"
                            >
                                {isAddingCast ? (
                                    <RefreshCw className="w-6 h-6 animate-spin stroke-[2.5]" />
                                ) : (
                                    <UserPlus className="w-6 h-6 stroke-[2.5]" />
                                )}
                            </button>

                            <button
                                onClick={() => {
                                    dispatch({ type: 'SET_PRODUCTION_ACTOR_WORKFLOW_SOURCE', payload: { imageUrl: generatedImage!, suggestedName: 'Portrait ' + Date.now() } });
                                    setIsInspecting(false);
                                }}
                                className="w-14 h-14 bg-accent/20 hover:bg-accent text-accent hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-accent/30"
                                title="Create Production Actor"
                            >
                                <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
                            </button>

                            <button
                                onClick={() => {
                                    dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: generatedImage });
                                    dispatch({ type: 'SET_VIEW', payload: 'casting' });
                                    setIsInspecting(false);
                                    dispatch({ type: 'ADD_LOG', payload: { message: "Loaded into Forge", type: 'success' } });
                                }}
                                className="w-14 h-14 bg-blue-500/20 hover:bg-blue-500 text-blue-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-blue-500/30"
                                title="Send to Casting Forge"
                            >
                                <Hammer className="w-6 h-6 stroke-[2.5]" />
                            </button>

                            {/* Export to Library (Inspector) */}
                            <button
                                onClick={() => openActorSaveModal(generatedImage!, activeLibraryName)}
                                className="w-14 h-14 bg-blue-500/20 hover:bg-blue-500 text-blue-400 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-blue-500/30"
                                title="Export to Library"
                            >
                                <FolderOutput className="w-6 h-6 stroke-[2.5]" />
                            </button>

                            <div className="w-px h-10 bg-white/10 my-auto mx-2" />

                            <button
                                onClick={() => {
                                    const link = document.createElement("a");
                                    link.href = generatedImage;
                                    link.download = createUniqueDownloadFilename(generatedOutputFilename);
                                    link.click();
                                    dispatch({ type: 'ADD_LOG', payload: { message: "Image Saved", type: 'success' } });
                                }}
                                className="w-14 h-14 bg-white/5 hover:bg-white/20 text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-white/10"
                                title="Download Original"
                            >
                                <Download className="w-6 h-6 stroke-[2.5]" />
                            </button>

                            <button
                                onClick={() => setIsInspecting(false)}
                                className="w-14 h-14 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-red-500/30"
                                title="Close Inspector"
                            >
                                <X className="w-6 h-6 stroke-[3]" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ActorSaveModal
                isOpen={showActorSaveModal}
                initialName={pendingActorSave?.initialName || activeLibraryName}
                onClose={() => {
                    setShowActorSaveModal(false);
                    setPendingActorSave(null);
                }}
                onSave={(name, category) => {
                    void savePendingActorToLibrary(name, category);
                }}
                title="Save to Actor Library"
                description="Select a Studio Folder to organize this actor:"
            />

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Delete Preset"
                message={
                    <>
                        Are you sure you want to permanently delete the preset <span className="text-white font-bold">"{deleteTarget}"</span>? This action cannot be undone.
                    </>
                }
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
}
