
import { useState, useEffect, useMemo } from "react";
import { RefreshCw, Terminal, Activity, Wand2, Sparkles, X, Download, UserPlus, Hammer, Fingerprint, Maximize2, Save, Calculator, ScanFace, Aperture, Check, RotateCcw, Copy, Lock, Unlock } from "lucide-react";
// Remove GlassCard import
import { Input } from "./ui/Input";
import { Slider } from "./ui/Slider";
import { Dropdown } from "./ui/Dropdown";
import type { CharacterDNA } from "../../types/characterDNA";
import { computeBMI, deriveBuildDescription } from "../../types/characterDNA";
import { useAppContext } from "../context/AppContext";
import { GeminiService } from "../services/GeminiService";
import { NanobananaThinking } from "./ui/NanobananaThinking";
import ConfirmDialog from "./ui/ConfirmDialog";
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
        } catch (e) {
            return DEFAULT_DNA;
        }
    });
    const [presets, setPresets] = useState<Record<string, { id: string; name: string; dna: CharacterDNA }>>({});
    const [randomSeed, setRandomSeed] = useState<number>(() => Date.now());
    const [lastDnaSnapshot, setLastDnaSnapshot] = useState<CharacterDNA | null>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(() => {
        const saved = localStorage.getItem("portrait_session_state");
        if (!saved) return null;
        try {
            const parsed = JSON.parse(saved);
            return parsed.generatedImage || null;
        } catch (e) {
            return null;
        }
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [isInspecting, setIsInspecting] = useState(false);
    // --- CHARACTER STATE ---

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

            const sessionState = {
                dna: prunedDna,
                generatedImage: generatedImage
            };
            localStorage.setItem("portrait_session_state", JSON.stringify(sessionState));
        } catch (e) {
            console.warn("Session persistence failed (Storage likely full):", e);
        }
    }, [dna]);
    // Note: If generatedImage/variations are needed across refresh, they should be stored 
    // in IndexedDB or as local files, not localStorage.

    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");

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

            // Reset transient UI state
            setGeneratedImage(null);
        }
    };

    // --- DNA UPDATERS ---
    const updateIdentity = (key: keyof CharacterDNA["identity"], value: any) => {
        setDna((prev) => ({
            ...prev,
            identity: { ...prev.identity, [key]: value },
            // Auto-sync skin age if it matches chronological age (heuristic)
            skin:
                key === "age" && prev.skin.dermalAge === prev.identity.age
                    ? { ...prev.skin, dermalAge: Number(value) }
                    : prev.skin,
        }));
    };

    const toggleHairLock = () => {
        setDna(prev => ({
            ...prev,
            allowRefHair: !prev.allowRefHair
        }));
    };

    const setLifeStage = (stage: "child" | "teen" | "adult" | "elder") => {
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

    const updateMorphology = (key: keyof CharacterDNA["morphology"], value: any) => {
        setDna((prev) => {
            const nextMorph = { ...prev.morphology, [key]: value };
            // Recompute BMI
            if (key === "heightCm" || key === "weightKg") {
                nextMorph.bmi = computeBMI(nextMorph.heightCm, nextMorph.weightKg);
                nextMorph.buildDescription = deriveBuildDescription(nextMorph.bmi);
            }
            return { ...prev, morphology: nextMorph };
        });
    };

    const updateFace = (key: keyof CharacterDNA["face"], value: any) => {
        setDna((prev) => ({ ...prev, face: { ...prev.face, [key]: value } }));
    };

    const updateSkin = (key: keyof CharacterDNA["skin"], value: any) => {
        setDna((prev) => ({ ...prev, skin: { ...prev.skin, [key]: value } }));
    };

    const updateHair = (key: keyof CharacterDNA["hair"], value: any) => {
        setDna((prev) => ({ ...prev, hair: { ...prev.hair, [key]: value } }));
    };

    const updateRender = (key: keyof CharacterDNA["render"], value: any) => {
        setDna((prev) => ({ ...prev, render: { ...prev.render, [key]: value } }));
    };

    const updateReferenceFlags = (flags: Partial<Pick<CharacterDNA, "allowRefHair" | "allowRefFace" | "allowRefSkin" | "allowRefMorphology">>) => {
        setDna(prev => ({ ...prev, ...flags }));
    };

    // --- COMPILER (PHASE 2) ---
    const compiledPrompt = useMemo(() => buildPortraitPrompt(dna), [dna]);

    useEffect(() => {
        setIsCompiling(true);
        const timer = setTimeout(() => setIsCompiling(false), 250);
        return () => clearTimeout(timer);
    }, [dna]);

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
    const [progress, setProgress] = useState<{ phase: string, percent: number, text?: string } | null>(null);

    const handleGenerate = async () => {
        if (!state.apiKey) {
            dispatch({ type: "ADD_LOG", payload: { message: "API Key required for generation", type: "error" } });
            return;
        }
        setIsGenerating(true);
        dispatch({ type: "ADD_LOG", payload: { message: "Generating Portrait...", type: "info" } });

        // Simulated Progress for the UX Loader
        setProgress({ phase: 'initializing', percent: 0, text: 'Initializing neural link...' });
        let currentPercent = 0;
        const progressInterval = setInterval(() => {
            currentPercent += (100 - currentPercent) * 0.05; // Asymptotic approach to 99%
            let text = 'Formulating prompt...';
            if (currentPercent > 30) text = 'Synthesizing image data...';
            if (currentPercent > 70) text = 'Refining output...';
            if (currentPercent > 90) text = 'Finalizing render...';
            setProgress({ phase: 'generating', percent: currentPercent, text });
        }, 800);

        try {
            // MULTIMODAL WIRING: Pass reference image if in Reference Mode
            const referenceImages = dna.identityMode === "reference" && dna.referenceImageUrl
                ? [{ url: dna.referenceImageUrl, label: "Identity Reference" }]
                : [];

            const url = await GeminiService.generateImage(compiledPrompt, state.apiKey, state.model, referenceImages, { imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding });
            setGeneratedImage(url); // Set local state for preview
            dispatch({ type: "SET_LAST_CASTED_IMAGE", payload: url });
            dispatch({ type: "SET_LAST_CASTED_PROMPT", payload: compiledPrompt });
            dispatch({ type: "ADD_LOG", payload: { message: "Portrait Generated", type: "success" } });
        } catch (e: any) {
            dispatch({ type: "ADD_LOG", payload: { message: `Generation failed: ${e.message}`, type: "error" } });
        } finally {
            clearInterval(progressInterval);
            setProgress(null);
            setIsGenerating(false);
        }
    };

    const handleStartNew = () => {
        setDna(DEFAULT_DNA);
        setGeneratedImage(null);
    };

    const sendToNanoCast = () => {
        console.log({ dna, compiledPrompt });
        dispatch({ type: "SET_LAST_CASTED_PROMPT", payload: compiledPrompt });
        dispatch({ type: "SET_VIEW", payload: "nano_cast" });
        dispatch({ type: "ADD_LOG", payload: { message: "DNA transferred to NanoCast", type: "success" } });
    };

    const sendToReferenceSheet = () => {
        console.log({ dna, compiledPrompt });
        dispatch({ type: "ADD_LOG", payload: { message: "Sent to Ref Sheet (Console Logged)", type: "info" } });
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
            {isGenerating && <NanobananaThinking progress={progress} />}

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
                        <div className="flex justify-between items-center">
                            <h3 className="text-base font-black text-white/80 uppercase tracking-[0.15em] flex items-center gap-3 border-l-4 border-yellow-500/50 pl-4">
                                <Fingerprint className="w-5 h-5 opacity-70" /> Identity Matrix
                            </h3>
                            {/* MODE TOGGLE (FOR TESTING/V1.2) */}
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
                        </div>

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
                                                onClick={() => {
                                                    const input = document.createElement('input');
                                                    input.type = 'file';
                                                    input.accept = 'image/*';
                                                    input.onchange = (e: any) => {
                                                        const file = e.target.files[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = (re: any) => {
                                                                setDna(prev => ({ ...prev, referenceImageUrl: re.target.result }));
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    };
                                                    input.click();
                                                }}
                                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const file = e.dataTransfer.files[0];
                                                    if (file && file.type.startsWith('image/')) {
                                                        const reader = new FileReader();
                                                        reader.onload = (re: any) => {
                                                            setDna(prev => ({ ...prev, referenceImageUrl: re.target.result }));
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
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
                                                        onClick={() => {
                                                            const input = document.createElement('input');
                                                            input.type = 'file';
                                                            input.accept = 'image/*';
                                                            input.onchange = (e: any) => {
                                                                const file = e.target.files[0];
                                                                if (file) {
                                                                    const reader = new FileReader();
                                                                    reader.onload = (re: any) => {
                                                                        setDna(prev => ({ ...prev, referenceImageUrl: re.target.result }));
                                                                    };
                                                                    reader.readAsDataURL(file);
                                                                }
                                                            };
                                                            input.click();
                                                        }}
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
                                            options={[
                                                { type: "option", label: "Child", value: "child" },
                                                { type: "option", label: "Teen", value: "teen" },
                                                { type: "option", label: "Adult", value: "adult" },
                                                { type: "option", label: "Elder", value: "elder" }
                                            ]}
                                            value={dna.identity.lifeStage}
                                            onChange={(val) => setLifeStage(val as any)}
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
                                            options={[
                                                { type: "option", label: "Child", value: "child" },
                                                { type: "option", label: "Teen", value: "teen" },
                                                { type: "option", label: "Adult", value: "adult" },
                                                { type: "option", label: "Elder", value: "elder" }
                                            ]}
                                            value={dna.identity.lifeStage}
                                            onChange={(val) => setLifeStage(val as any)}
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
                    </section>

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
                            {[
                                { label: "Face Shape", field: "faceShape" as const, presets: FACE_SHAPE_PRESETS, placeholder: "e.g. Oval" },
                                { label: "Eyes", field: "eyes" as const, presets: EYE_PRESETS, placeholder: "e.g. Blue" },
                                { label: "Nose", field: "nose" as const, presets: NOSE_PRESETS, placeholder: "e.g. Straight" },
                                { label: "Lips", field: "lips" as const, presets: LIP_PRESETS, placeholder: "e.g. Full" },
                                { label: "Jawline", field: "jaw" as const, presets: JAW_PRESETS, placeholder: "e.g. Soft" }
                            ].map((feature) => {
                                const currentValue = dna.face[feature.field];
                                // We trust the presets are structured correctly, but we cast to any to silence the implicit any error in map
                                const isPreset = feature.presets.some((p: any) => p.key === currentValue);
                                const dropdownValue = isPreset ? (currentValue as string) : "custom_input";

                                const isStructuralField = feature.field === "faceShape" || feature.field === "nose" || feature.field === "jaw";
                                const isLocked = dna.identityMode === "reference" && (dna.likenessLock || 100) === 100 && isStructuralField;

                                return (
                                    <div key={feature.field} className={`flex flex-col gap-1.5 animate-in fade-in duration-500 transition-opacity ${isLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">{feature.label}</label>
                                        <div className="flex flex-col gap-2">
                                            <Dropdown
                                                options={[
                                                    ...feature.presets.map((p: any) => ({ type: "option" as const, label: p.label, value: p.key })),
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
                </SolidPanel>

                {/* RENDER SETTINGS */}
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
            </div>

            {/* RIGHT PANEL: CONSOLE */}
            <div className="w-[480px] flex flex-col gap-4 shrink-0 pb-10 overflow-hidden pt-2">

                {/* CHARACTER SUMMARY BLOCK (NEW) */}
                <SolidPanel className="p-4 flex flex-col gap-2 shrink-0 border-white/10 relative">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Fingerprint className="w-12 h-12" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Live DNA Stream
                    </div>
                    <div className="flex justify-between items-end relative z-10">
                        <div className="flex flex-col gap-0.5">
                            <div className="text-lg font-black text-white leading-none">
                                {dna.identityMode === "reference" ? "IDENTITY REFERENCE" : dna.identity.ethnicity}
                            </div>
                            <div className="text-xs text-gray-400 font-medium">
                                {dna.identityMode === "reference" ? "Locked to source photograph" : `${dna.identity.sex}, ${dna.identity.age} years`}
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="text-sm font-bold text-white font-mono">{dna.morphology.heightCm}cm / {dna.morphology.weightKg}kg</div>
                            <div className="text-[10px] text-yellow-500 uppercase font-bold tracking-wider">BMI {dna.morphology.bmi} • {dna.morphology.buildDescription}</div>
                        </div>
                    </div>
                </SolidPanel>

                {/* GENERATED IMAGE RESULT (INLINE) */}
                {generatedImage && (
                    <SolidPanel className="p-1 border-green-500/20 -[0_0_30px_rgba(74,222,128,0.1)] relative group shrink-0 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <button
                            onClick={() => setGeneratedImage(null)}
                            className="absolute top-3 right-3 z-20 p-1.5 bg-black/50 hover:bg-red-500/80 text-white rounded-full transition-colors backdrop-blur-sm opacity-0 group-hover:opacity-100"
                            title="Close Result"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        <div className="rounded-xl overflow-hidden h-96 w-full relative bg-black group-hover/image">
                            <img src={generatedImage} alt="Generated Portrait" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                            {/* Image Actions Overlay */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-center gap-4 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                <button
                                    onClick={() => {
                                        const link = document.createElement("a");
                                        link.href = generatedImage;
                                        link.download = `portrait_${dna.identity.sex.toLowerCase()}_${dna.identity.age}.png`;
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

                {/* CONSOLE CARD */}
                <SolidPanel className="flex-1 flex flex-col h-full border-white/5 bg-[#050505] -[inset_0_2px_20px_rgba(0,0,0,0.5)]">
                    {/* Console Header */}
                    <div className="h-12 bg-black/60 border-b border-white/5 flex items-center justify-between px-5 shrink-0">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-4 h-4 text-green-500/50" />
                            <span className="text-[10px] font-mono text-green-500/50 uppercase tracking-widest">DNA_COMPILER_V1.EXE</span>
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
                            {/* Primary Action - Dominant */}
                            {!generatedImage ? (
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handleGenerate}
                                        disabled={isGenerating || (dna.identityMode === "reference" && !dna.referenceImageUrl)}
                                        className={`w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold rounded-xl px-6 py-3 hover: hover:brightness-110 transition-all duration-200 ease-out flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover: group relative
 ${(dna.identityMode === "reference" && !dna.referenceImageUrl) ? 'grayscale opacity-30 ' : ''}`}
                                    >
                                        {isGenerating ? (
                                            <RefreshCw className="w-5 h-5 animate-spin relative z-10" />
                                        ) : (
                                            <Wand2 className="w-5 h-5 -[0_0_6px_rgba(255,215,0,0.35)] transition-transform duration-200 group-hover:-translate-y-px relative z-10" />
                                        )}
                                        <span className="relative z-10">{isGenerating ? "Synthesizing DNA..." : "Generate DNA Portrait"}</span>
                                    </button>

                                    {/* Randomize row */}
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

                                    {dna.identityMode === "reference" && !dna.referenceImageUrl && (
                                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-tight text-center animate-pulse">
                                            Reference image required in Reference Mode.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-3">
                                        <button
                                            onClick={handleGenerate}
                                            className="flex-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/50 font-semibold rounded-xl px-6 py-3 transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-xs"
                                        >
                                            <RefreshCw className="w-4 h-4" /> Generate Again
                                        </button>
                                        <button
                                            onClick={handleStartNew}
                                            className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold rounded-xl px-6 py-3 transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-xs"
                                        >
                                            <Sparkles className="w-4 h-4" /> Start New Subject
                                        </button>
                                    </div>
                                    {/* Removed redundant Download Button */}
                                </div>
                            )}

                            {/* Integration Actions (Ghost) */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={sendToNanoCast}
                                    className="text-[9px] font-bold text-blue-500/40 hover:text-blue-400 uppercase tracking-[0.2em] py-2 transition-colors text-center hover:bg-blue-500/10 rounded"
                                >
                                    Send to Casting
                                </button>
                                <button
                                    onClick={sendToReferenceSheet}
                                    className="text-[9px] font-bold text-emerald-500/40 hover:text-emerald-400 uppercase tracking-[0.2em] py-2 transition-colors text-center hover:bg-emerald-500/10 rounded"
                                >
                                    Send to Ref Sheet
                                </button>
                            </div>
                        </div>
                    </div>
                </SolidPanel>



                {/* Integration Actions (Ghost) */}

            </div>

            {/* LIGHTBOX INSPECTOR */}
            {isInspecting && generatedImage && (
                <div
                    className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-200"
                    onClick={() => setIsInspecting(false)}
                >
                    <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
                        <img
                            src={generatedImage}
                            alt="Inspecting Portrait"
                            className="max-w-full max-h-[85vh] object-contain rounded-lg ring-1 ring-white/10 pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Floating Action Bar */}
                    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex gap-4 z-[2001] bg-black/40 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl " onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => {
                                const newCast: any = {
                                    id: `cast-insp-${Date.now()}`,
                                    url: generatedImage,
                                    tag: 'front',
                                    name: 'New Portrait Subject',
                                    profile: { identity: dna.identity.ethnicity, wardrobe: '', accessories: '', style: 'Portrait' }
                                };
                                dispatch({ type: 'ADD_CAST', payload: newCast });
                                dispatch({ type: 'ADD_LOG', payload: { message: "Added to Cast", type: 'success' } });
                            }}
                            className="w-14 h-14 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-emerald-500/30"
                            title="Add to Cast Assets"
                        >
                            <UserPlus className="w-6 h-6 stroke-[2.5]" />
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

                        <div className="w-px h-10 bg-white/10 my-auto mx-2" />

                        <button
                            onClick={() => {
                                const link = document.createElement("a");
                                link.href = generatedImage;
                                link.download = `portrait_${dna.identity.sex.toLowerCase()}_${dna.identity.age}.png`;
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
            )}

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
