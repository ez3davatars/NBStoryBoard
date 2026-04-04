import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import {
    Scan, Target, User, Layers, Share2,
    ChevronRight, RefreshCw, Cpu, Aperture, CheckCircle2, UserPlus, Upload, Sliders,
    Swords, Zap, Shield, Ghost, Camera as CameraIcon, Ban, RotateCcw,
    EyeOff, Shirt, Sparkles, LayoutTemplate, Download, X, ChevronDown, Pencil,
    Trash2, Maximize, RefreshCcw, FolderPlus, AlertTriangle
} from 'lucide-react';
import { nativeJoinPath, nativeListFiles, nativeReadFile, nativeWriteFile } from '../utils/NativeFileAssets';
import { nativeSelectFolder } from '../utils/NativeFileAssets';
import type { CastMember } from '../context/AppContext';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import HelpTooltip from './ui/HelpTooltip';
import InlineHint from './ui/InlineHint';
import ConfirmDialog from './ui/ConfirmDialog';

import BodyScopeSelector from './BodyScopeSelector';
import type { BodyScope } from './BodyScopeSelector';

import titanMasc from '../assets/archetypes/titan_masc.png';
import scoutMasc from '../assets/archetypes/scout_masc.png';
import guardianMasc from '../assets/archetypes/guardian_masc.png';
import spriteMasc from '../assets/archetypes/sprite_masc.png';

// Import Fem Images
import titanFem from '../assets/archetypes/titan_fem.png';
import scoutFem from '../assets/archetypes/scout_fem.png';
import guardianFem from '../assets/archetypes/guardian_fem.png';
import spriteFem from '../assets/archetypes/sprite_fem.png';

// Import Youth Images
import titanYouth from '../assets/archetypes/titan_youth.png';
import scoutYouth from '../assets/archetypes/scout_youth.png';
import guardianYouth from '../assets/archetypes/guardian_youth.png';
import spriteYouth from '../assets/archetypes/sprite_youth.png';

// Import Archetype Images (Youth - Fem)
import titanYouthFem from '../assets/archetypes/titan_youth_fem.png';
import scoutYouthFem from '../assets/archetypes/scout_youth_fem.png';
import guardianYouthFem from '../assets/archetypes/guardian_youth_fem.png';
import spriteYouthFem from '../assets/archetypes/sprite_youth_fem.png';

import ActorSaveModal from './ActorSaveModal';

import {
    saveAssetToDisk,
    loadAssetFromDisk,
    deleteAssetFromDisk,
    verifyPermission
} from '../utils/FileSystemAssets';

// Import Style Images
// Import Style Images (Feminine / Default)
import stylePixarFem from '../assets/styles/style_pixar.png';
import styleHyperRealFem from '../assets/styles/style_hyper_real.png';
import styleRetroAnimeFem from '../assets/styles/style_retro_anime.png';
import styleComicBookFem from '../assets/styles/style_comic_book.png';
import styleCyberpunkFem from '../assets/styles/style_cyberpunk.png';
import styleExactStudioFem from '../assets/styles/style_exact_studio.png';

// Import Style Images (Masculine)
import stylePixarMasc from '../assets/styles/style_pixar_masc.png';
import styleHyperRealMasc from '../assets/styles/style_hyper_real_masc.png';
import styleRetroAnimeMasc from '../assets/styles/style_retro_anime_masc.png';
import styleComicBookMasc from '../assets/styles/style_comic_book_masc.png';
import styleCyberpunkMasc from '../assets/styles/style_cyberpunk_masc.png';
import styleExactStudioMasc from '../assets/styles/style_exact_studio_masc.png';

// Import Style Images (Youth - Masc)
import stylePixarYouth from '../assets/styles/style_pixar_youth.png';
import styleHyperRealYouth from '../assets/styles/style_hyper_real_youth.png';
import styleRetroAnimeYouth from '../assets/styles/style_retro_anime_youth.png';
import styleComicBookYouth from '../assets/styles/style_comic_book_youth.png';
import styleCyberpunkYouth from '../assets/styles/style_cyberpunk_youth.png';
import styleExactStudioYouth from '../assets/styles/style_exact_studio_youth.png';

// Import Style Images (Youth - Fem)
import stylePixarYouthFem from '../assets/styles/style_pixar_youth_fem.png';
import styleHyperRealYouthFem from '../assets/styles/style_hyper_real_youth_fem.png';
import styleRetroAnimeYouthFem from '../assets/styles/style_retro_anime_youth_fem.png';
import styleComicBookYouthFem from '../assets/styles/style_comic_book_youth_fem.png';
import styleCyberpunkYouthFem from '../assets/styles/style_cyberpunk_youth_fem.png';
import styleExactStudioYouthFem from '../assets/styles/style_exact_studio_youth_fem.png';




const REF_SHEET_STYLES = {
    family_3d: {
        id: 'family_3d',
        label: 'Family 3D Animation',
        keywords: "High-end studio 3D character, stylized facial features, vibrant colors, soft subsurface scattering, clean stylized materials, high-end CG render, smooth shading",
        lighting: "Golden hour, cinematic bounce light"
    },
    premium_cg: {
        id: 'premium_cg',
        label: 'Premium CG Realism',
        keywords: "photorealistic CG, exact facial structure preservation, highly detailed skin pores, 85mm lens look, cinematic natural lighting, sharp focus, biometric fidelity",
        lighting: "High-contrast studio lighting"
    },
    exact_studio: {
        id: 'exact_studio',
        label: 'Exact Likeness Studio',
        keywords: "ultra-realistic studio portrait, 1:1 identity replication, strict facial feature preservation, highly detailed skin texture, raw photography look, 85mm lens, sharp focus, identity locked",
        lighting: "Professional studio lighting"
    },
    retro_cel: {
        id: 'retro_cel',
        label: 'Retro Cel Anime',
        keywords: "90s retro anime aesthetic, cel shading, hand-drawn ink lines, limited animation feel, vintage film grain, soft pastel palette, nostalgic Japanese animation look",
        lighting: "Soft diffused daylight"
    },
    graphic_noir: {
        id: 'graphic_noir',
        label: 'Graphic Noir',
        keywords: "modern graphic novel style, heavy ink outlines, halftone dot patterns, high contrast, dramatic shadows, bold dynamic lines",
        lighting: "Hard noir shadows"
    },
    cyberpunk_neon: {
        id: 'cyberpunk_neon',
        label: 'Cyberpunk Neon',
        keywords: "futuristic techwear, neon glow, wet pavement reflections, volumetric fog, teal and orange palette, cinematic cyberpunk lighting",
        lighting: "Neon-drenched night"
    }
};





// Canonical style ID resolver
const normalizeStyleId = (id: string) => {
    const map: Record<string, string> = {
        family_3d: 'pixar',
        premium_cg: 'hyper_real',
        retro_cel: 'retro_anime',
        graphic_noir: 'comic_book',
        cyberpunk_neon: 'cyberpunk',
    };
    return map[id] ?? id;
};

// --- CONFIGURATION CONSTANTS ---
const STYLE_SCOPE_RULES: Record<string, { default: BodyScope; allowed: BodyScope[] }> = {
    pixar: { default: 'full', allowed: ['full', 'torso'] },
    retro_anime: { default: 'full', allowed: ['full'] },
    comic_book: { default: 'torso', allowed: ['torso', 'full'] },
    cyberpunk: { default: 'torso', allowed: ['head', 'torso', 'full'] },
    hyper_real: { default: 'head', allowed: ['head', 'torso', 'full'] },
    exact_studio: { default: 'head', allowed: ['head', 'torso', 'full'] },
    // Defaults for undefined styles
    default: { default: 'full', allowed: ['head', 'torso', 'full'] }
};

const SCOPE_COST: Record<BodyScope, { gpu: string; note: string }> = {
    head: { gpu: 'low', note: 'Fastest generation' },
    torso: { gpu: 'medium', note: 'Balanced detail' },
    full: { gpu: 'high', note: 'Higher compute cost' }
};




// Types for Phases
type Phase = 1 | 2 | 3 | 4 | 5;

const formatHeight = (inches: number) => {
    const ft = Math.floor(inches / 12);
    const range = inches % 12;
    return `${ft}'${range}"`;
};



const NanoCastingDirector = () => {
    const { state, dispatch } = useAppContext();
    const [phase, setPhase] = useState<Phase>(1);

    // --- WARDROBE LIBRARY HANDLERS ---
    const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
    const [showCoverDeleteConfirm, setShowCoverDeleteConfirm] = useState<string | null>(null);
    const [localBiometricSheetUrl, setLocalBiometricSheetUrl] = useState<string | null>(null);

    const scanWardrobe = async () => {
        // 1. Native Mode
        if (state.saveDirectoryPath) {
            try {
                const wardrobePath = await nativeJoinPath(state.saveDirectoryPath, 'wardrobe');
                const files = await nativeListFiles(wardrobePath);
                const items: any[] = []; // Type as WardrobeItem if available

                for (const file of files) {
                    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
                        const fullPath = await nativeJoinPath(wardrobePath, file);
                        const dataUrl = await nativeReadFile(fullPath);
                        if (dataUrl) {
                            items.push({
                                id: file,
                                url: dataUrl,
                                name: file.replace(/\.[^/.]+$/, "").split('-').slice(1).join(' '),
                                prompt: "Saved costume asset",
                                category: "General",
                                timestamp: Date.now()
                            });
                        }
                    }
                }
                dispatch({ type: 'SET_WARDROBE_ITEMS', payload: items });
                dispatch({ type: 'ADD_LOG', payload: { message: "Wardrobe Library Refreshed", type: 'success' } });
                return;
            } catch (err) {
                console.error("Failed to scan native wardrobe:", err);
                return;
            }
        }

        if (!state.saveDirectoryHandle) return;
        try {
            // @ts-ignore
            if ((await state.saveDirectoryHandle.queryPermission({ mode: 'read' })) !== 'granted') return;

            const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
            const items: any[] = [];
            // @ts-ignore
            for await (const entry of (wardrobeHandle as any).values()) {
                if (entry.kind === 'file' && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
                    const file = await entry.getFile();
                    const reader = new FileReader();
                    const dataUrl = await new Promise<string>((resolve) => {
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });

                    items.push({
                        id: entry.name,
                        url: dataUrl,
                        name: entry.name.replace('.png', '').split('-').slice(1).join(' '),
                        prompt: "Saved costume asset",
                        category: "General",
                        timestamp: file.lastModified
                    });
                }
            }
            dispatch({ type: 'SET_WARDROBE_ITEMS', payload: items.sort((a, b) => b.timestamp - a.timestamp) });
            dispatch({ type: 'ADD_LOG', payload: { message: "Wardrobe Library Refreshed", type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe scan failed: ${e.message}`, type: 'error' } });
        }
    };

    // --- ACTOR LIBRARY SCANNER (NATIVE) ---
    const scanActorLibrary = async () => {
        if (!state.saveDirectoryPath) return;

        try {
            const actorsRoot = await nativeJoinPath(state.saveDirectoryPath, 'Actors');
            let categories: string[] = [];

            try {
                // Check if Actors folder exists and get categories
                const rootContents = await nativeListFiles(actorsRoot);
                // Filter for directories (simplified check: no extension = directory convention)
                categories = rootContents.filter(c => !c.includes('.'));
            } catch {
                return; // Actors folder likely doesn't exist yet
            }

            const libraryPayload: CastMember[] = [];

            for (const catName of categories) {
                const catPath = await nativeJoinPath(actorsRoot, catName);
                let files: string[] = [];
                try {
                    files = await nativeListFiles(catPath);
                } catch { continue; }

                for (const potentialFile of files) {
                    // FLAT STRUCTURE SUPPORT: Actor-123.png + Actor-123.json in Category Folder
                    if (potentialFile.endsWith('.png')) {
                        const baseName = potentialFile.replace('.png', '');
                        const imgPath = await nativeJoinPath(catPath, potentialFile);

                        // Check for Sidecar JSON
                        const jsonName = `${baseName}.json`;
                        let metadata: any = null;

                        if (files.includes(jsonName)) {
                            const jsonPath = await nativeJoinPath(catPath, jsonName);
                            const jsonContent = await nativeReadFile(jsonPath);

                            if (jsonContent && typeof jsonContent === 'string') {
                                try {
                                    // Handle Data URL (if nativeReadFile returns it) or raw text
                                    // Assuming nativeReadFile returns a Data URL for generic text files or need special handling
                                    // The standard util returns a Data URL.
                                    let jsonStr = jsonContent;
                                    if (jsonContent.startsWith('data:')) {
                                        const base64 = jsonContent.split(',')[1];
                                        jsonStr = atob(base64);
                                    }
                                    metadata = JSON.parse(jsonStr);
                                } catch (e) {
                                    console.warn("Invalid JSON for actor:", baseName);
                                }
                            }
                        }

                        // Load Image (nativeReadFile returns DataURL for images)
                        const imgUrl = await nativeReadFile(imgPath);
                        if (imgUrl) {
                            libraryPayload.push({
                                id: metadata?.id || `${catName}-${baseName}`,
                                name: metadata?.name || baseName, // Use metadata name if available
                                url: imgUrl,
                                tag: 'front',
                                profile: {
                                    identity: metadata?.name || baseName,
                                    wardrobe: "Saved Actor",
                                    accessories: "",
                                    style: metadata?.style || catName
                                }
                            });
                        }
                    }
                }
            }

            // Update Library State
            if (libraryPayload.length > 0) {
                // Sort by creation time if possible (descending)
                libraryPayload.sort((a, b) => b.id.localeCompare(a.id));

                dispatch({ type: 'SET_ACTOR_LIBRARY', payload: libraryPayload });
                console.log(`[NanoCast] Loaded ${libraryPayload.length} actors from library.`);
            }

        } catch (err) {
            console.error("Failed to scan native Actor Library:", err);
        }
    };

    // Auto-Scan on Mount / Path Change
    useEffect(() => {
        if (state.saveDirectoryPath) {
            scanActorLibrary();
        }
    }, [state.saveDirectoryPath]);

    const handleUploadCostume = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !state.saveDirectoryHandle) return;
        const file = e.target.files[0];

        try {
            // DUPLICATE CHECK
            if (state.wardrobeItems.some((i: any) => i.id.includes(file.name) || i.name === file.name.split('.')[0])) {
                showToast("Item already exists in library.");
                return;
            }

            const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
            const safeName = `Custom-Costume-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
            const fileHandle = await wardrobeHandle.getFileHandle(safeName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();

            // Read for immediate display
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                // setDesignerImage(dataUrl); // Not present in Nano
                // setDesignerPrompt(file.name.replace(/\.[^/.]+$/, ""));

                const newItem = {
                    id: safeName,
                    url: dataUrl,
                    name: file.name.split('.')[0].substring(0, 20),
                    prompt: "User Upload",
                    category: "General",
                    timestamp: Date.now()
                };

                dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
                dispatch({ type: 'ADD_LOG', payload: { message: `Uploaded & Saved: ${file.name}`, type: 'success' } });
            };
            reader.readAsDataURL(file);

        } catch (err: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Upload failed: ${err.message}`, type: 'error' } });
        }
    };

    const executeDelete = async () => {
        if (!confirmDelete) return;
        const item = confirmDelete;

        try {
            let deleted = false;
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
                const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'wardrobe', item.id);
                deleted = await window.electronAPI.deleteFile(filePath);
            }

            if (!deleted && state.saveDirectoryHandle) {
                const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: false });
                await wardrobeHandle.removeEntry(item.id);
                deleted = true;
            }

            if (!deleted) throw new Error("File deletion failed or permission denied on disk.");

            const newItems = state.wardrobeItems.filter((i: any) => i.id !== item.id);
            dispatch({ type: 'SET_WARDROBE_ITEMS', payload: newItems });
            if (selectedWardrobeItem?.id === item.id) setSelectedWardrobeItem(null);
            dispatch({ type: 'ADD_LOG', payload: { message: `Deleted costume: ${item.name}`, type: 'success' } });

        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Delete failed: ${e.message}`, type: 'error' } });
        } finally {
            setConfirmDelete(null);
        }
    };

    // --- PHASE 2: BODY ARCHETYPE STATE ---
    const [selectedBody, setSelectedBody] = useState<string | null>(null);
    const [morphVariant, setMorphVariant] = useState<'masc' | 'fem' | 'youth_masc' | 'youth_fem'>('masc');

    // --- CUSTOM COVERS STATE ---
    const [customArchetypeCovers, setCustomArchetypeCovers] = useState<Record<string, string>>({});
    // const [isLoadingCovers, setIsLoadingCovers] = useState(true); // Unused for now

    // Load covers from IndexedDB on mount
    // Load covers from Disk on mount/change
    useEffect(() => {
        // Revoke old URLs to prevent memory leaks
        return () => {
            Object.values(customArchetypeCovers).forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    useEffect(() => {
        const loadCovers = async () => {
            if (!state.saveDirectoryHandle) return;

            // Verify Read Permission
            const hasPermission = await verifyPermission(state.saveDirectoryHandle, false);
            if (!hasPermission) return;

            const loaded: Record<string, string> = {};
            const variants = ['masc', 'fem', 'youth_masc', 'youth_fem'];
            const archetypes = ['titan', 'scout', 'guardian', 'sprite'];

            for (const v of variants) {
                for (const a of archetypes) {
                    const storageKey = `${v}_${a}`;
                    const filename = `Archetype_${storageKey}.png`;
                    const url = await loadAssetFromDisk(state.saveDirectoryHandle, filename);
                    if (url) {
                        loaded[storageKey] = url;
                    }
                }
            }
            if (Object.keys(loaded).length > 0) {
                setCustomArchetypeCovers(prev => ({ ...prev, ...loaded }));
            }
        };

        loadCovers();
    }, [state.saveDirectoryHandle]);

    const handleArchetypeCoverUpload = async (storageKey: string, file: File) => {
        if (!state.saveDirectoryHandle) {
            dispatch({ type: 'ADD_LOG', payload: { message: "Set Save Folder to use Custom Covers", type: 'error' } });
            return;
        }

        const filename = `Archetype_${storageKey}.png`;

        try {
            // Verify Write Permission
            const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
            if (!hasPermission) {
                dispatch({ type: 'ADD_LOG', payload: { message: "Permission Denied. Re-connect folder in settings.", type: 'error' } });
                return;
            }

            await saveAssetToDisk(state.saveDirectoryHandle, filename, file);
            // Reload to get blob URL
            const url = await loadAssetFromDisk(state.saveDirectoryHandle, filename);

            if (url) {
                setCustomArchetypeCovers(prev => ({
                    ...prev,
                    [storageKey]: url
                }));
                dispatch({ type: 'ADD_LOG', payload: { message: "Archetype Cover Saved", type: 'success' } });
            }

        } catch (error) {
            console.error("Failed to save cover to disk", error);
            dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${error}`, type: 'error' } });
        }
    };

    const handleArchetypeCoverDelete = async (storageKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setShowCoverDeleteConfirm(storageKey);
    };

    const confirmCoverDelete = async () => {
        if (!showCoverDeleteConfirm) return;
        const storageKey = showCoverDeleteConfirm;
        setShowCoverDeleteConfirm(null);

        if (!state.saveDirectoryHandle) return;

        const filename = `Archetype_${storageKey}.png`;

        try {
            await deleteAssetFromDisk(state.saveDirectoryHandle, filename);

            setCustomArchetypeCovers(prev => {
                const next = { ...prev };
                delete next[storageKey];
                return next;
            });
            dispatch({ type: 'ADD_LOG', payload: { message: "Cover Reverted to Default", type: 'info' } });

        } catch (error) {
            console.error("Failed to delete cover from disk", error);
        }
    };

    const getArchetypes = (variant: 'masc' | 'fem' | 'youth_masc' | 'youth_fem') => {
        switch (variant) {
            case 'fem': return [
                { id: 'titan', name: 'The Amazon', desc: 'Tall, athletic strength, powerful feminine build', icon: Zap, defaultImage: titanFem },
                { id: 'scout', name: 'The Muse', desc: 'Slender, grace, agile elegance', icon: Sparkles, defaultImage: scoutFem },
                { id: 'guardian', name: 'The Matriarch', desc: 'Curvaceous, heavy-set, commanding presence', icon: Shield, defaultImage: guardianFem },
                { id: 'sprite', name: 'The Fae', desc: 'Petite, ethereal, stylized proportions', icon: Ghost, defaultImage: spriteFem }
            ];
            case 'youth_masc': return [
                { id: 'titan', name: 'The Prodigy', desc: 'Strong for age, athletic youth', icon: Swords, defaultImage: titanYouth },
                { id: 'scout', name: 'The Rascal', desc: 'Wiry, quick, mischievous energy', icon: Zap, defaultImage: scoutYouth },
                { id: 'guardian', name: 'The Husky', desc: 'Solid, chubby, sturdy frame', icon: Shield, defaultImage: guardianYouth },
                { id: 'sprite', name: 'The Chibi', desc: 'Cute, oversized head, toddler proportions', icon: Ghost, defaultImage: spriteYouth }
            ];
            case 'youth_fem': return [
                { id: 'titan', name: 'The Prodigy', desc: 'Strong for age, athletic youth', icon: Swords, defaultImage: titanYouthFem },
                { id: 'scout', name: 'The Rascal', desc: 'Wiry, quick, mischievous energy', icon: Zap, defaultImage: scoutYouthFem },
                { id: 'guardian', name: 'The Husky', desc: 'Solid, chubby, sturdy frame', icon: Shield, defaultImage: guardianYouthFem },
                { id: 'sprite', name: 'The Chibi', desc: 'Cute, oversized head, toddler proportions', icon: Ghost, defaultImage: spriteYouthFem }
            ];
            // Fallback for MASC and default
            default: return [
                { id: 'titan', name: 'The Titan', desc: 'Heroic V-taper, broad shoulders, muscular frame', icon: Swords, defaultImage: titanMasc },
                { id: 'scout', name: 'The Scout', desc: 'Slim, agile, tall, sleek athletic build', icon: Zap, defaultImage: scoutMasc },
                { id: 'guardian', name: 'The Guardian', desc: 'Stocky, powerhouse, heavy-set, rectangular frame', icon: Shield, defaultImage: guardianMasc },
                { id: 'sprite', name: 'The Sprite', desc: 'Stylized Chibi proportions, oversized head', icon: Ghost, defaultImage: spriteMasc }
            ];
        }
    };

    const bodyArchetypes = getArchetypes(morphVariant);

    // --- PHASE 3: STYLE SYNTHESIS ---
    const [selectedStyle, setSelectedStyle] = useState<string | null>(null);

    // --- PHASE 3: BODY SCOPE (REQUIRED AFTER STYLE) ---
    const [bodyScope, setBodyScope] = useState<BodyScope | null>(() => {
        // STEP 12: PERSISTENCE (RESTORE)
        const saved = localStorage.getItem('nano_body_scope');
        return (saved === 'head' || saved === 'torso' || saved === 'full') ? saved : null;
    });

    // STEP 12 & 15: PERSISTENCE (SAVE) & TELEMETRY
    useEffect(() => {
        if (bodyScope) {
            localStorage.setItem('nano_body_scope', bodyScope);
            // STEP 15: TELEMETRY
            console.log("event: body_scope_selected", { scope: bodyScope, style: selectedStyle });
        }
    }, [bodyScope, selectedStyle]);

    // Ensure style rules override persistence if incompatible
    useEffect(() => {
        if (selectedStyle && bodyScope) {
            const rules = STYLE_SCOPE_RULES[selectedStyle] ?? STYLE_SCOPE_RULES.default;
            if (!rules.allowed.includes(bodyScope)) {
                setBodyScope(null); // Force reset if invalid for new style
            }
        }
    }, [selectedStyle, bodyScope]);

    // --- STYLE CONFIGURATION BY CATEGORY ---
    const getStyleMatrix = (variant: 'masc' | 'fem' | 'youth_masc' | 'youth_fem') => {
        const images = {
            masc: {
                pixar: stylePixarMasc,
                hyper_real: styleHyperRealMasc,
                retro_anime: styleRetroAnimeMasc,
                comic_book: styleComicBookMasc,
                cyberpunk: styleCyberpunkMasc,
                exact_studio: styleExactStudioMasc
            },
            fem: {
                pixar: stylePixarFem,
                hyper_real: styleHyperRealFem,
                retro_anime: styleRetroAnimeFem,
                comic_book: styleComicBookFem,
                cyberpunk: styleCyberpunkFem,
                exact_studio: styleExactStudioFem
            },
            youth_masc: {
                pixar: stylePixarYouth,
                hyper_real: styleHyperRealYouth,
                retro_anime: styleRetroAnimeYouth,
                comic_book: styleComicBookYouth,
                cyberpunk: styleCyberpunkYouth,
                exact_studio: styleExactStudioYouth
            },
            youth_fem: {
                pixar: stylePixarYouthFem,
                hyper_real: styleHyperRealYouthFem,
                retro_anime: styleRetroAnimeYouthFem,
                comic_book: styleComicBookYouthFem,
                cyberpunk: styleCyberpunkYouthFem,
                exact_studio: styleExactStudioYouthFem
            }
        };

        const activeImages = images[variant] || images.masc; // Fallback

        return {
            pixar: {
                id: 'pixar', label: 'Family 3D Animation',
                keywords: "3D Disney-Pixar animation style, stylized proportions, big eyes, soft shapes, vibrant colors, exaggerated features, cute, charming, subsurface scattering, rim lighting, soft textures, Octane Render, masterpiece 3D.",
                lighting: "Golden hour, cinematic bounce light",
                image: activeImages.pixar
            },
            hyper_real: {
                id: 'hyper_real', label: 'Premium CG Realism',
                keywords: "Photorealistic 4k, raw photo, exact facial structure preservation, 3d scan, photogrammetry, highly detailed skin pores, 85mm lens, f/1.8, cinematic natural lighting, sharp focus, masterpiece, biometric fidelity.",
                lighting: "High-contrast studio lighting",
                image: activeImages.hyper_real
            },
            retro_anime: {
                id: 'retro_anime', label: 'Retro Cel Anime',
                keywords: "90s retro anime aesthetic, large eyes, simplified nose, dynamic hair, cel-shaded, hand-drawn ink lines, Studio Ghibli vibes, vintage film grain, soft pastel palette.",
                lighting: "Soft diffused daylight",
                image: activeImages.retro_anime
            },
            comic_book: {
                id: 'comic_book', label: 'Graphic Novel Noir',
                keywords: "Modern graphic novel style, heavy ink outlines, Halftone dot patterns, high contrast, dramatic shadows, bold dynamic lines.",
                lighting: "Hard noir shadows",
                image: activeImages.comic_book
            },
            cyberpunk: {
                id: 'cyberpunk', label: 'Cyberpunk V2',
                keywords: "Futuristic tech-wear, neon glow, wet pavement reflections, volumetric fog, teal and orange palette, high-tech interface overlays.",
                lighting: "Neon-drenched night",
                image: activeImages.cyberpunk
            },
            exact_studio: {
                id: 'exact_studio', label: 'Exact Likeness Studio',
                keywords: "Ultra-realistic 4k portrait, 1:1 identity replication, strict facial feature preservation, studio lighting, highly detailed skin texture, raw photography, 85mm lens, sharp focus, masterpiece, identity locked.",
                lighting: "Professional studio lighting",
                image: activeImages.exact_studio
            }
        };
    };

    const styleMatrix = getStyleMatrix(morphVariant);

    // --- PHASE 4 & 5: STATE ---
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ phase: '', percent: 0, detail: '' });
    const [uploadMode, setUploadMode] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // --- REF SHEET GENERATOR STATE ---
    const [showRefSheet, setShowRefSheet] = useState(false);
    const [refSheetUrl, setRefSheetUrl] = useState<string | null>(null);
    const [refLayout, setRefLayout] = useState<'form_focus' | 'face_focus' | 'split_focus'>('form_focus');
    const [refStyle, setRefStyle] = useState<keyof typeof REF_SHEET_STYLES>('family_3d');

    // Inherit the style choice from Phase 3 (Style Synthesis)
    useEffect(() => {
        if (selectedStyle && Object.keys(REF_SHEET_STYLES).includes(selectedStyle)) {
            setRefStyle(selectedStyle as keyof typeof REF_SHEET_STYLES);
        }
    }, [selectedStyle]);

    const [identitySource, setIdentitySource] = useState<'hybrid' | 'biometric' | 'generated'>('hybrid');
    // sheetContent is now derived from refLayout (face_focus = head, others = full)
    // Numeric body controls (more precise than categorical presets)
    const [weightLbs, setWeightLbs] = useState<number>(170); // 90–300
    // OPTIMIZATION: Local state for slider to prevent heavy re-renders during drag
    const [localWeight, setLocalWeight] = useState<number>(170);

    // Sync local weight when external weight changes (e.g. reset)
    useEffect(() => {
        setLocalWeight(weightLbs);
    }, [weightLbs]);

    // --- AUTO-SYNC: SCOPE -> FRAMING ---
    useEffect(() => {
        if (!bodyScope) return;

        // Auto-update Director Controls based on Scope
        setDirectorControls(prev => {
            let framing: 'bust' | 'half_body' | 'full_body' = 'full_body';
            if (bodyScope === 'head') framing = 'bust';
            if (bodyScope === 'torso') framing = 'half_body';

            // Silent update only if changed
            if (prev.shotFraming !== framing) {
                return { ...prev, shotFraming: framing };
            }
            return prev;
        });

        // Auto-update Ref Sheet Layout
        if (bodyScope === 'head') setRefLayout('face_focus');
        else if (bodyScope === 'torso') setRefLayout('split_focus');
        else setRefLayout('form_focus');

    }, [bodyScope]);

    const [heightIn, setHeightIn] = useState<number>(70); // 36–108 (3'0"–9'0")

    // --- DIRECTOR CONTROLS ---
    const [showSettings, setShowSettings] = useState(false);
    const [directorControls, setDirectorControls] = useState({
        identityStrength: 85, // 0-100
        stylization: 50, // 0-100
        age: 25, // 10-90
        outfit: "Black polo t-shirt",
        hairStyle: "",
        lighting: "studio_default",
        shotFraming: "full_body" as 'bust' | 'half_body' | 'full_body',
        logoImage: null as string | null,
        logoPlacement: "Center Chest"
    });

    // --- PHASE 1: BIOMETRIC SCANNER STATE ---
    const webcamRef = useRef<Webcam>(null);
    const [capturedAngles, setCapturedAngles] = useState<{
        center: string | null;
        left: string | null;
        right: string | null;
        up: string | null;
        down: string | null;
    }>({
        center: null,
        left: null,
        right: null,
        up: null,
        down: null
    });


    // --- LIVE PROGRESS SIMULATION ---
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isProcessing && progress.phase === 'synthesis') {
            const getEta = () => {
                if (state.imageResolution === '4K') return 90000; // 90s ETA for 4K
                if (state.imageResolution === '2K') return 45000; // 45s ETA for 2K
                return 20000; // 20s ETA for 1K
            };
            const eta = getEta();
            const updateMs = 1000; // Update every second
            const increment = (updateMs / eta) * 100;

            interval = setInterval(() => {
                setProgress(p => {
                    if (p.phase === 'synthesis' && p.percent < 95) {
                        return { ...p, percent: Math.min(95, p.percent + increment) };
                    }
                    return p;
                });
            }, updateMs);
        }
        return () => clearInterval(interval);
    }, [isProcessing, progress.phase, state.imageResolution]);

    // Explicit setter to handle cleanup
    const setAngle = (angle: keyof typeof capturedAngles, url: string | null) => {
        setCapturedAngles(prev => {
            const oldUrl = prev[angle];
            if (oldUrl && oldUrl !== url) {
                URL.revokeObjectURL(oldUrl);
            }
            return { ...prev, [angle]: url };
        });
    };

    // Refs for stable access inside callbacks without re-triggering
    const capturedAnglesRef = useRef(capturedAngles);
    const [yaw, setYaw] = useState(0);
    const [pitch, setPitch] = useState(0);
    const [activeSector, setActiveSector] = useState<'center' | 'left' | 'right' | 'up' | 'down' | null>(null);

    const [stabilityProgress, setStabilityProgress] = useState(0);
    const [cameraEnabled, setCameraEnabled] = useState(false);

    // --- PERSISTENCE & WARDROBE STATES ---
    const [sidebarMode, setSidebarMode] = useState<'director' | 'wardrobe'>('director');
    const [wardrobePrompt, setWardrobePrompt] = useState("");



    // Scan Stability Logic
    const lastSectorRef = useRef<string | null>(null);
    const sectorStableFramesRef = useRef(0);
    const scanCooldownRef = useRef(false);
    const lastUpdateRef = useRef(0);
    const STABILITY_THRESHOLD = 15; // Frames to hold steady
    const SCAN_COOLDOWN_MS = 1500;

    // Helper: Convert Base64 to Blob URL for memory efficiency
    const base64ToBlobUrl = (base64: string) => {
        const byteString = atob(base64.split(',')[1]);
        const mimeString = base64.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        return URL.createObjectURL(blob);
    };

    // Fix for Stale State in Closures
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // Update ref when state changes
    useEffect(() => {
        capturedAnglesRef.current = capturedAngles;
    }, [capturedAngles]);

    // FaceMesh Setup
    const onResults = useCallback((results: any) => {
        // Throttle updates to ~10fps to reduce React render load
        const now = Date.now();
        if (now - lastUpdateRef.current < 100) return;
        lastUpdateRef.current = now;

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            setActiveSector(null);
            setStabilityProgress(0);
            sectorStableFramesRef.current = 0;
            return;
        }

        const landmarks = results.multiFaceLandmarks[0];
        // Heuristic Pose Estimation
        const nose = landmarks[1];
        const leftEar = landmarks[234];
        const rightEar = landmarks[454];
        const chin = landmarks[152];
        const forehead = landmarks[10];

        // Yaw Calculation
        const midEarX = (leftEar.x + rightEar.x) / 2;
        const noseOffset = nose.x - midEarX;
        const estimatedYaw = noseOffset * 400;

        // Pitch Calculation
        const midFaceY = (forehead.y + chin.y) / 2;
        const noseOffsetY = nose.y - midFaceY;
        const estimatedPitch = noseOffsetY * -500;

        setYaw(estimatedYaw);
        setPitch(estimatedPitch);

        // Center Proximity Check (Strict Centering)
        // Nose is landmarks[1]
        const centerX = nose.x;
        const centerY = nose.y;
        const distFromCenter = Math.sqrt(Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2));

        // Threshold: 0.25 radius (approx 25% away from center - Relaxed for usability)
        const isCentered = distFromCenter < 0.25;

        // Check Thresholds - Adjusted for comfortable 45-degree capture
        let currentSector: 'center' | 'left' | 'right' | 'up' | 'down' | null = null;

        if (!isCentered) {
            // WARNING ONLY - Do not block
            // currentSector = null; 
        } else if (estimatedPitch > 12) currentSector = 'up';
        else if (estimatedPitch < -10) currentSector = 'down';
        else if (estimatedYaw > 20) currentSector = 'left';
        else if (estimatedYaw < -20) currentSector = 'right';
        else if (Math.abs(estimatedYaw) < 10 && Math.abs(estimatedPitch) < 10) currentSector = 'center';

        setActiveSector(currentSector);

        // Auto-Capture Logic with Guardrails
        if (currentSector && webcamRef.current && !scanCooldownRef.current) {
            // Check if already captured
            if (capturedAnglesRef.current[currentSector]) {
                setStabilityProgress(100); // Already done
                return;
            }

            // Stability Check
            if (currentSector === lastSectorRef.current) {
                sectorStableFramesRef.current++;
            } else {
                lastSectorRef.current = currentSector;
                sectorStableFramesRef.current = 0;
            }

            // Update Progress UI
            const progress = Math.min(100, (sectorStableFramesRef.current / STABILITY_THRESHOLD) * 100);
            setStabilityProgress(progress);

            if (sectorStableFramesRef.current > STABILITY_THRESHOLD) {
                captureCurrentFrame(currentSector);
            }
        } else {
            // Reset stability if lost sector
            sectorStableFramesRef.current = 0;
            setStabilityProgress(0);
        }
    }, []);

    const captureCurrentFrame = async (sector: keyof typeof capturedAngles) => {
        console.log("Attempting Capture:", sector);
        if (!webcamRef.current) { console.log("No Webcam Ref"); return; }
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
            // IMMEDIATE SYNCHRONOUS STATE UPDATES
            // Prevent re-entry immediately
            scanCooldownRef.current = true;
            sectorStableFramesRef.current = 0;
            setStabilityProgress(0);

            // Set timeout to clear cooldown
            setTimeout(() => {
                scanCooldownRef.current = false;
            }, SCAN_COOLDOWN_MS);

            const blobUrl = base64ToBlobUrl(imageSrc);

            // Trigger capture
            setAngle(sector, blobUrl);

            // Auto-Save Logic (Async)
            if (stateRef.current.saveDirectoryHandle) {
                try {
                    // @ts-ignore - File System Access API
                    const scansDir = await stateRef.current.saveDirectoryHandle.getDirectoryHandle('Scans', { create: true });
                    const filename = `Scan_${sector.toUpperCase()}_${Date.now()}.png`;
                    // @ts-ignore
                    const fileHandle = await scansDir.getFileHandle(filename, { create: true });
                    // @ts-ignore
                    const writable = await fileHandle.createWritable();

                    // Convert Base64 to Blob
                    const byteString = atob(imageSrc.split(',')[1]);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                    const blob = new Blob([ab], { type: 'image/png' });

                    await writable.write(blob);
                    await writable.close();
                } catch (err) {
                    console.error("Auto-save failed:", err);
                }
            } else {
                console.warn("Auto-save skipped: No save directory configured.");
                // Optional: notifying user might be too spammy if they haven't set it yet, but useful for debugging this issue
                // dispatch({ type: 'ADD_LOG', payload: { message: "Scan not saved: No save folder set in Settings.", type: 'error' } });
            }
        }
    };

    useEffect(() => {
        let camera: Camera | null = null;
        let faceMesh: FaceMesh | null = null;
        let isActive = true;

        const initFaceMesh = async () => {
            faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.15, // Extremely low for maximum recall
                minTrackingConfidence: 0.15
            });

            faceMesh.onResults(onResults);

            if (webcamRef.current && webcamRef.current.video && isActive) {
                camera = new Camera(webcamRef.current.video, {
                    onFrame: async () => {
                        if (webcamRef.current?.video && isActive) {
                            await faceMesh?.send({ image: webcamRef.current.video });
                        }
                    },
                    width: 1280,
                    height: 720
                });
                await camera.start();
            }
        };

        if (phase === 1 && !uploadMode && cameraEnabled) {
            initFaceMesh();
        }

        return () => {
            isActive = false;
            if (camera) camera.stop();
            if (faceMesh) faceMesh.close();
        };
    }, [phase, uploadMode, onResults, cameraEnabled]);


    // Helper: Fetch Blob URL and convert to Base64 for API
    const getBase64FromBlobUrl = async (blobUrl: string): Promise<string> => {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    };



    // ... existing imports ...

    // --- SAVING FUNCTIONS ---

    const handleSaveToActors = async () => {
        if (!finalCharacterUrl || (!state.saveDirectoryHandle && !state.saveDirectoryPath)) {
            if (!state.saveDirectoryHandle && !state.saveDirectoryPath) dispatch({ type: 'ADD_LOG', payload: { message: "No save folder configured in settings.", type: 'error' } });
            return;
        }

        try {
            // NATIVE MODE
            if (state.saveDirectoryPath) {
                const root = state.saveDirectoryPath;
                const actorsDir = await nativeJoinPath(root, 'Actors');
                // Ensure directory existence is handled by nativeWriteFile or we might need a mkdir equivalent if strictly required, 
                // but WardrobeStudio says "nativeWriteFile handles directory creation recursively".

                const safeName = "NanoCast_" + Date.now();
                const filename = `${safeName}.png`;
                const filePath = await nativeJoinPath(actorsDir, filename);

                const res = await fetch(finalCharacterUrl);
                const blob = await res.blob();

                await nativeWriteFile(filePath, blob);

                const newActor = {
                    id: `actor-${Date.now()}`,
                    url: finalCharacterUrl,
                    tag: 'front',
                    name: "Nano Cast",
                    profile: {
                        identity: "Generated",
                        wardrobe: "Standard",
                        accessories: "",
                        style: (selectedStyle && styleMatrix[selectedStyle as keyof typeof styleMatrix]?.label) || "Cinematic"
                    }
                };
                // @ts-ignore
                dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
                dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors (Native): ${filename}`, type: 'success' } });
                return;
            }

            // WEB MODE
            if (!state.saveDirectoryHandle) return;
            const actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: true });
            const safeName = "NanoCast_" + Date.now();
            const filename = `${safeName}.png`;
            const fileHandle = await actorsDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            const res = await fetch(finalCharacterUrl);
            const blob = await res.blob();
            await writable.write(blob);
            await writable.close();

            const newActor = {
                id: `actor-${Date.now()}`,
                url: finalCharacterUrl,
                tag: 'front',
                name: "Nano Cast",
                profile: {
                    identity: "Generated",
                    wardrobe: "Standard",
                    accessories: "",
                    style: (selectedStyle && styleMatrix[selectedStyle as keyof typeof styleMatrix]?.label) || "Cinematic"
                }
            };
            // @ts-ignore
            dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors: ${filename}`, type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Actor save failed: ${e.message}`, type: 'error' } });
        }
    };

    const handleSaveToWardrobe = async () => {
        if (!finalCharacterUrl || (!state.saveDirectoryHandle && !state.saveDirectoryPath)) {
            if (!state.saveDirectoryHandle && !state.saveDirectoryPath) dispatch({ type: 'ADD_LOG', payload: { message: "No save folder configured in settings.", type: 'error' } });
            return;
        }
        try {
            const filename = `WARDROBE-${Date.now()}.png`;

            // NATIVE MODE
            if (state.saveDirectoryPath) {
                const root = state.saveDirectoryPath;
                const wardrobeDir = await nativeJoinPath(root, 'wardrobe');
                const filePath = await nativeJoinPath(wardrobeDir, filename);

                const res = await fetch(finalCharacterUrl);
                const blob = await res.blob();
                await nativeWriteFile(filePath, blob);

                const newItem = {
                    id: filename,
                    url: finalCharacterUrl,
                    name: "Nano Creation",
                    prompt: "Generated from NanoCasting",
                    category: "Nano",
                    timestamp: Date.now()
                };

                // @ts-ignore
                dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
                dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Wardrobe (Native): ${filename}`, type: 'success' } });
                return;
            }

            // WEB MODE
            if (!state.saveDirectoryHandle) return;
            const wardrobeDir = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
            const fileHandle = await wardrobeDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            const res = await fetch(finalCharacterUrl);
            const blob = await res.blob();
            await writable.write(blob);
            await writable.close();

            const newItem = {
                id: filename,
                url: finalCharacterUrl,
                name: "Nano Creation",
                prompt: "Generated from NanoCasting",
                category: "Nano",
                timestamp: Date.now()
            };

            // @ts-ignore
            dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Wardrobe: ${filename}`, type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe save failed: ${e.message}`, type: 'error' } });
        }
    };

    const generateWardrobe = async () => {
        if (!state.apiKey) return;
        if (!wardrobePrompt && !selectedWardrobeItem) return;

        setIsProcessing(true);
        setProgress({ phase: 'synthesis', percent: 5, detail: "Weaving digital fabric..." });

        try {
            let garment = "";

            const timeoutPromise = (ms: number) => new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));
            const getTimeoutMs = () => state.imageResolution === '4K' ? 120000 : (state.imageResolution === '2K' ? 90000 : 45000);

            // 1. Determine Garment Source
            if (selectedWardrobeItem) {
                // Use selected item from library
                garment = selectedWardrobeItem.url;
            } else {
                // Generate new from prompt
                setProgress({ phase: 'synthesis', percent: 30, detail: "Synthesizing garment geometry..." });
                garment = await Promise.race([
                    GeminiService.generateImage(
                        `Create a single image.

GARMENT AUTHORITY
- Render one standalone garment only based on this description: ${wardrobePrompt}.
- Preserve the intended silhouette, materials, colors, and visible construction.
- Do not add a model, mannequin head, props, text, or extra accessories.

COMPOSITION
- Isolated garment only.
- Solid white studio background.
- Full garment visible.

NEGATIVE CONSTRAINTS:
extra garments, mannequin person, text, watermark, props, cropped garment, altered colors, redesign.`,
                        state.apiKey,
                        state.model,
                        [],
                        { aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingMode }
                    ),
                    timeoutPromise(getTimeoutMs())
                ]);
            }

            // 2. Try-On (Simulated by sending garment + current character to Gemini)
            if (finalCharacterUrl) {
                setProgress({ phase: 'synthesis', percent: 70, detail: "Performing virtual fitting..." });
                const fitted = await Promise.race([
                    GeminiService.generateImage(
                        `Create a single image.

SUBJECT LOCK
- [IMAGE 1] is the subject. Preserve the exact identity, pose, framing, and body proportions.

COSTUME AUTHORITY
- [IMAGE 2] is the outfit reference. Transfer it exactly onto the subject.
- Preserve the outfit silhouette, colors, materials, and visible construction.
- Do not redesign the outfit.

COMPOSITION
- Match the original framing and aspect ratio of [IMAGE 1].
- Single subject only.
- Studio-quality lighting.

NEGATIVE CONSTRAINTS:
identity drift, altered pose, changed framing, extra limbs, extra people, redesigned outfit, altered colors, text, watermark.`,
                        state.apiKey,
                        state.model,
                        [
                            { url: finalCharacterUrl, label: "Subject" },
                            { url: garment, label: "New Outfit" }
                        ],
                        { aspectRatio: '2:3', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingMode } // Portrait
                    ),
                    timeoutPromise(getTimeoutMs())
                ]);

                setFinalCharacterUrl(fitted);
                dispatch({ type: 'ADD_LOG', payload: { message: "Virtual fitting complete.", type: 'success' } });
            }

        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
        } finally {
            setIsProcessing(false);
            setProgress({ phase: '', percent: 0, detail: "" });
        }
    };

    // --- PHASE 4 & 5: ORCHESTRATION & REVEAL ---
    const [generationLogs, setGenerationLogs] = useState<string[]>([]);
    const [finalCharacterUrl, setFinalCharacterUrl] = useState<string | null>(null);

    // New: Pack Mode State
    const [generatePackMode] = useState(true);
    const [selectedWardrobeItem, setSelectedWardrobeItem] = useState<any | null>(null);

    // --- TOAST NOTIFICATIONS ---
    const [notification, setNotification] = useState<string | null>(null);
    const showToast = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(null), 3000);
    };

    const handleOrchestration = async () => {
        // Enforce Minimum Refs
        if (!uploadMode && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) {
            showToast("Missing required angles (Center, Left, Right)");
            return;
        }

        const addLog = (msg: string) => setGenerationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

        try {
            setPhase(4);
            setGenerationLogs([]);
            abortControllerRef.current = new AbortController();

            addLog("INITIALIZING NANO NEURAL LINK...");
            setIsProcessing(true);
            setProgress({ phase: 'scanning', percent: 0, detail: "Initializing Biometric Core..." });

            // 1. Prepare References (Convert Blobs to Base64)
            const referenceImages: { url: string; label: string }[] = [];
            const angles: (keyof typeof capturedAngles)[] = ['center', 'left', 'right', 'up', 'down'];

            for (const angle of angles) {
                const blobUrl = capturedAngles[angle];
                if (blobUrl) {
                    try {
                        const b64 = await getBase64FromBlobUrl(blobUrl);
                        referenceImages.push({ url: b64, label: `Reference Angle: ${angle}` });
                    } catch (err) {
                        console.error(`Failed to process ${angle} angle:`, err);
                    }
                }
            }

            if (referenceImages.length === 0) {
                addLog("CRITICAL: No valid biometric data found.");
                throw new Error("No reference images");
            }

            addLog(`ACQUIRED BIOMETRIC REFERENCES. SYNTHESIZING GRAPH...`);
            setProgress({ phase: 'neural', percent: 40, detail: "Synthesizing Neural Graph..." });

            // 2. Construct Director Prompt
            const styleObj = styleMatrix[selectedStyle as keyof typeof styleMatrix] || styleMatrix.pixar;
            const archetypeObj = bodyArchetypes.find(b => b.id === selectedBody) || bodyArchetypes[0];

            // STRICTNESS CHECK: Differentiate between Realistic (Geometric Lock) and Stylized (Likeness Translation)
            const isBiometric = identitySource === 'biometric';
            const isRealistic = ['hyper_real', 'exact_studio', 'cyberpunk', 'premium_cg'].includes(selectedStyle || '');
            const isExactLikeness = selectedStyle === 'exact_studio';

            let strictnessInstruction = "";
            if (isBiometric) {
                if (isRealistic) {
                    strictnessInstruction = "CRITICAL_STRICTNESS: The face in the generated image MUST BE AN EXACT BIOMETRIC MATCH. PRESERVE FACIAL GEOMETRY ABOVE ALL ELSE. Apply the Material/Lighting of the style, but DO NOT ALTER THE SKULL SHAPE. Treat as 'Digital Makeup'.";
                } else {
                    // STYLIZED: Harmonious Adaptation
                    strictnessInstruction = "CRITICAL_LIKENESS: HARMONIOUSLY ADAPT the face to match the [Style] aesthetic. The subject must be IMMEDIATELY RECOGNIZABLE as [IMAGE 1]. Adapt the *Form* (eyes, head shape) to the style, but PRESERVE THE IDENTITY FEATURES (Nose shape, Jawline, Eye Color). It should look like a glorious 3D render of THIS SPECIFIC PERSON.";
                }
            }

            // Capture the count of biometric images BEFORE adding the logo
            const biometricRefLimit = referenceImages.length;
            const biometricRangeText = biometricRefLimit === 1 ? "[IMAGE 1]" : `[IMAGE 1] to [IMAGE ${biometricRefLimit}]`;

            // --- F. LOGO / BRANDING ---
            let brandingPrompt = "";
            if (directorControls.logoImage) {
                referenceImages.push({ url: directorControls.logoImage, label: "Logo Asset" });
                const logoRefIndex = referenceImages.length; // 1-based index (Ref images + Logo)

                brandingPrompt += `\nBRANDING DIRECTIVE (CRITICAL):\n`;
                brandingPrompt += `Apply the logo provided in [IMAGE ${logoRefIndex}] ("Logo Asset") to the character's outfit.\n`;
                brandingPrompt += `PLACEMENT: ${directorControls.logoPlacement}. Scale the logo appropriately so it looks like a realistic piece of apparel branding (e.g. left breast pocket size), NOT a massive billboard.\n`;
                brandingPrompt += `INTEGRATION: The logo MUST be fully integrated into the fabric's material. It must warp naturally with the fabric folds and catch the lighting/shadows of the shirt. It must look like highly realistic embroidery or a high-quality screen print that belongs in the scene. DO NOT render it as a flat, glowing, or pasted-on sticker.\n`;
                brandingPrompt += `NOTE: [IMAGE ${logoRefIndex}] is NOT an identity reference. It is a graphic asset.\n`;
            }

            // --- CONDITIONAL OVERRIDES ---
            // "I only want those settings to become active when the person makes a selection in the advanced options."
            // We check if the current values differ from the baseline initialization defaults.
            const defaults = {
                age: 25,
                outfit: "Black polo t-shirt",
                hairStyle: "",
                identityStrength: isExactLikeness ? 100 : 85,
                stylization: isExactLikeness ? 0 : 50
            };

            const applyAge = directorControls.age !== defaults.age;
            const applyOutfit = directorControls.outfit !== ''; // ALWAYS apply outfit if there is one, defaulting to the Black polo
            const applyHair = directorControls.hairStyle !== defaults.hairStyle && directorControls.hairStyle !== '';
            const applyStylization = directorControls.stylization !== defaults.stylization;
            const applyIdentity = directorControls.identityStrength !== defaults.identityStrength;

            const prompt = `
 Create a single image.

 CHARACTER CONCEPT ART
 
 IDENTITY REFERENCES: Use ${biometricRangeText} as the ONLY source for the character's face and body shape.
 ${directorControls.logoImage ? `LOGO ASSET: Use the last image provided as a Branding Asset only.` : ''}
 
 STYLE PROTOCOL: ${styleObj.label}
 VISUAL KEYWORDS: ${styleObj.keywords}
 LIGHTING: ${styleObj.lighting}
 
 BODY MORPHOLOGY: A subject with a ${archetypeObj.desc}.
 
 DIRECTOR OVERRIDES:
 ${applyAge ? `- Age Appearance: Approx ${directorControls.age} years old.` : ''}
 ${applyOutfit ? `- Outfit: ${directorControls.outfit}.` : ''}
 ${applyHair ? `- Hair Style: ${directorControls.hairStyle}.` : ''}
 ${applyIdentity ? `- Identity Match Priority: ${directorControls.identityStrength}%.` : ''}
 ${applyStylization ? `- Stylization Intensity: ${directorControls.stylization}%.` : ''}

 CRITICAL INSTRUCTIONS:
 ${applyOutfit ? `0. THE CHARACTER MUST WEAR: ${directorControls.outfit}. YOU MUST OVERRIDE THE ORIGINAL CLOTHING MULTIMODAL REFERENCES. DO NOT copy the colors, patterns, or style of the original clothing. If you do not follow the exact clothing description, the generation is a failure. YOU MUST RENDER THE SHIRT AS DESCRIBED IN THE OVERRIDE PROMPT.` : ''}
 ${strictnessInstruction}
 1. MAINTAIN FACIAL IDENTITY from ${biometricRangeText} with high fidelity (Priority: ${directorControls.identityStrength}%). DO NOT transfer the clothing from the identity references.
 ${applyStylization ? `2. APPLY the selected "${styleObj.label}" art style (Intensity: ${directorControls.stylization}%).` : ''}
 3. Body proportions must match "${archetypeObj.name}".
 4. Background: Neutral, dark, cinematic studio void.
 5. High resolution, 4k, masterpiece.
 6. Facial Expression: Slight, natural smile (warm and approachable).
 ${directorControls.logoImage ? `7. BRANDING: See Branding Directive below. Apply logo to ${directorControls.logoPlacement}.` : ''}
 
 ${generatePackMode ? 'OUTPUT: Cinematic Character Portrait (Front View) with high detail.' : ''}
 
 ${brandingPrompt}

 NEGATIVE CONSTRAINTS:
 - No watermarks (except requested branding), signatures, or UI elements.
 - No distorted features, bad hands, or asymmetric eyes.
 - No extra limbs or fused fingers.
 - No text overlays.
 ${applyOutfit ? `- EXTREMELY IMPORTANT: DO NOT COPY THE CLOTHING FROM THE SOURCE IMAGES. DO NOT RENDER THE ORIGINAL ATTIRE.` : ''}
 
 BODY SCOPE DIRECTIVE (NON-NEGOTIABLE):
 ${bodyScope === 'head' ? '- HEAD: Head & shoulders only. No torso or legs.' : ''}
 ${bodyScope === 'torso' ? '- TORSO: Upper body only. Shoulders to waist.' : ''}
 ${bodyScope === 'full' ? '- FULL: Full body. Head to toe.' : ''}

 SHOT FRAMING: ${bodyScope === 'head'
                    ? 'HEAD AND SHOULDERS ONLY. Do NOT generate torso or legs.'
                    : bodyScope === 'torso'
                        ? 'UPPER BODY ONLY. From shoulders to waist.'
                        : 'FULL BODY. Head to toe, complete posture.'
                }
 `;

            // UPDATE APP CONTEXT
            dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: prompt });
            addLog("TRANSMITTING TO NANO BANANA 2 CLUSTER...");

            // 3. Call Gemini
            setProgress({ phase: 'synthesis', percent: 5, detail: "Generative Matrix Active..." });

            const timeoutPromise = (ms: number) => new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Generation request timed out')), ms));
            const getTimeoutMs = () => state.imageResolution === '4K' ? 120000 : (state.imageResolution === '2K' ? 90000 : 45000);

            let synthPercent = 5;
            const synthEtaMs = state.imageResolution === '4K' ? 35000 : 15000;
            const synthInc = (1000 / synthEtaMs) * 100;
            const synthInterval = setInterval(() => {
                synthPercent = Math.min(95, synthPercent + synthInc);
                let detail = "Generative Matrix Active...";
                if (synthPercent > 50) detail = "Synthesizing Attributes...";
                if (synthPercent >= 95) detail = "Finalizing Render... (Still working, please wait)";
                setProgress({ phase: 'synthesis', percent: synthPercent, detail });
            }, 1000);

            // Note: If GeminiService adds AbortSignal support, pass abortControllerRef.current.signal here
            let resultUrl: string;
            try {
                resultUrl = await Promise.race([
                    GeminiService.generateImage(prompt, state.apiKey, state.model, referenceImages, { imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingMode }),
                    timeoutPromise(getTimeoutMs())
                ]);
            } finally {
                clearInterval(synthInterval);
            }

            if (abortControllerRef.current?.signal.aborted) {
                throw new Error("Generation aborted by user");
            }

            setProgress({ phase: 'refinement', percent: 90, detail: "Finalizing Render..." });
            addLog("ASSET GENERATED. DECODING...");
            await new Promise(r => setTimeout(r, 500));

            setFinalCharacterUrl(resultUrl);
            setPhase(5); // Move to Result Phase
            setIsProcessing(false);

        } catch (error) {
            if ((error as Error).message === "Generation aborted by user") {
                addLog("ABORTED BY COMMAND.");
            } else {
                console.error("Orchestration Error:", error);
                showToast("Generation Failed: " + (error as Error).message);
            }
            setIsProcessing(false);
            // Stay on Ph4 or reset depending on preference? Let's stay Ph4 but stop loading
        }
    };

    const handleRegenerate = () => {
        // Ensure we don't lose state
        console.log("Regenerating...");
        if (!capturedAngles.center) {
            showToast("Error: Biometrics Lost. Please Re-scan.");
            setPhase(1); // Only go back if data is missing
            return;
        }
        handleOrchestration();
    };

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsProcessing(false);
            showToast("Sequence Aborted");

            // Redirect based on state
            if (finalCharacterUrl) {
                setPhase(5); // Return to Result view
            } else {
                setPhase(3); // Return to Style Selection
            }
        }
    };



    const addToCast = (asLead = false) => {
        if (!finalCharacterUrl) return;

        const newMember = {
            id: `nano_${Date.now()}`,
            url: finalCharacterUrl,
            name: `${selectedStyle}_${selectedBody}_${asLead ? 'LEAD' : 'Cast'}`,
            tag: 'front' as const,
            profile: {
                identity: "Nano_Gen_v1",
                wardrobe: directorControls.outfit || "Default",
                accessories: "None",
                style: selectedStyle || "Standard_Neural_Mix"
            }
        };

        dispatch({ type: 'ADD_CAST', payload: newMember });
        showToast(asLead ? "Accredited as Project Lead" : "Accessioned to Cast Database");
    };

    const downloadPoster = () => {
        if (!finalCharacterUrl) return;
        const a = document.createElement('a');
        a.href = finalCharacterUrl;
        a.download = `NanoCast_${Date.now()}.png`;
        a.click();
        showToast("Poster Asset Extracted");
    };

    // --- SAVE TO ACTOR LIBRARY STATE ---
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveCategory, setSaveCategory] = useState("realism");
    const [newActorName, setNewActorName] = useState("");
    const [saveMode, setSaveMode] = useState<'actor' | 'ref_sheet'>('actor');

    const handleOpenSaveModal = (mode: 'actor' | 'ref_sheet' = 'actor') => {
        const urlToUse = mode === 'ref_sheet' ? refSheetUrl : finalCharacterUrl;
        if (!urlToUse) return;

        setSaveMode(mode);
        if (mode === 'ref_sheet') {
            setNewActorName(`RefSheet-${Date.now()}`);
        } else {
            const promptSummary = state.lastCastedPrompt ? state.lastCastedPrompt.substring(0, 15) : "Generated Actor";
            setNewActorName(promptSummary);
        }
        setShowSaveModal(true);
    };

    const confirmSaveToLibrary = async (nameOverride?: string, categoryOverride?: string) => {
        const targetName = nameOverride || newActorName;
        const targetCategory = categoryOverride || saveCategory;
        const targetUrl = saveMode === 'ref_sheet' ? refSheetUrl : finalCharacterUrl;

        showToast(`Save Identity: ${targetName}`);

        if ((!state.saveDirectoryHandle && !state.saveDirectoryPath) || !targetUrl) {
            console.warn("Save aborted: No Directory Handle or URL");
            showToast("No Save Folder or Image! Link Storage in Sidebar.");
            return;
        }

        try {
            // NATIVE MODE
            if (state.saveDirectoryPath) {
                const root = state.saveDirectoryPath;
                const actorsDir = await nativeJoinPath(root, 'Actors');
                const catDir = await nativeJoinPath(actorsDir, targetCategory);

                const safeName = targetName.replace(/[^a-z0-9\s-_]/gi, '').trim() || `Actor-${Date.now()}`;
                const portraitPath = await nativeJoinPath(catDir, safeName, 'portrait.png');

                const res = await fetch(targetUrl);
                const blob = await res.blob();

                await nativeWriteFile(portraitPath, blob); // Handles partial directory creation

                // Reference Sheet Backup
                if (saveMode === 'ref_sheet') {
                    const refPath = await nativeJoinPath(catDir, safeName, 'reference_sheet.png');
                    await nativeWriteFile(refPath, blob);
                }

                // Metadata
                const metaPath = await nativeJoinPath(catDir, safeName, 'actor.json');
                const metadata = {
                    id: crypto.randomUUID(),
                    name: safeName,
                    description: saveMode === 'ref_sheet' ? "Nano Reference Sheet" : (state.lastCastedPrompt || "Nano Cast Generation"),
                    tags: [targetCategory, "Nano Cast", selectedBody || "Unknown Class", saveMode === 'ref_sheet' ? 'Reference Sheet' : 'Portrait'],
                    version: "1.0",
                    created: Date.now(),
                    dna: {
                        weight: weightLbs,
                        height: heightIn,
                        identity_lock: directorControls.identityStrength,
                        stylization: directorControls.stylization
                    }
                };
                const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
                await nativeWriteFile(metaPath, metaBlob);

                showToast(`Saved to Library (Native): ${targetCategory}/${safeName}`);
                setShowSaveModal(false);
                return;
            }

            // WEB MODE
            if (!state.saveDirectoryHandle) return;
            // 1. Get/Create "Actors" folder
            const root = state.saveDirectoryHandle;
            const actorsDir = await root.getDirectoryHandle('Actors', { create: true });

            // 2. Get/Create Category folder
            const catDir = await actorsDir.getDirectoryHandle(targetCategory, { create: true });

            // 3. Create Actor Folder
            const safeName = targetName.replace(/[^a-z0-9\s-_]/gi, '').trim() || `Actor-${Date.now()}`;
            const actorDir = await catDir.getDirectoryHandle(safeName, { create: true });

            // 4. Save Main Image (as portrait.png for consistency in library)
            const fileHandle = await actorDir.getFileHandle('portrait.png', { create: true });
            const writable = await fileHandle.createWritable();

            const res = await fetch(targetUrl);
            const blob = await res.blob();

            await writable.write(blob);
            await writable.close();

            // 4b. If Reference Sheet, save backup copy with distinct name
            if (saveMode === 'ref_sheet') {
                const refHandle = await actorDir.getFileHandle('reference_sheet.png', { create: true });
                const refWritable = await refHandle.createWritable();
                await refWritable.write(blob); // Same blob
                await refWritable.close();
            }

            // 5. Save Metadata (actor.json)
            const metaHandle = await actorDir.getFileHandle('actor.json', { create: true });
            const metaWritable = await metaHandle.createWritable();
            const metadata = {
                id: crypto.randomUUID(),
                name: safeName,
                description: saveMode === 'ref_sheet' ? "Nano Reference Sheet" : (state.lastCastedPrompt || "Nano Cast Generation"),
                tags: [targetCategory, "Nano Cast", selectedBody || "Unknown Class", saveMode === 'ref_sheet' ? 'Reference Sheet' : 'Portrait'],
                version: "1.0",
                created: Date.now(),
                dna: {
                    weight: weightLbs,
                    height: heightIn,
                    identity_lock: directorControls.identityStrength,
                    stylization: directorControls.stylization
                }
            };
            await metaWritable.write(JSON.stringify(metadata, null, 2));
            await metaWritable.close();

            showToast(`Saved to Library: ${targetCategory}/${safeName}`);
            setShowSaveModal(false);

        } catch (e: any) {
            console.error("Save to Library Failed:", e);
            showToast("Save Failed: " + e.message);
        }
    };

    // UI Helpers
    useEffect(() => {
        if (!state.apiKey) {
            // navigate('/');
        }
        // Persistence: Restore last casted image if available and we are essentially "fresh"
        if (state.lastCastedImage && !finalCharacterUrl && phase === 1) {
            setFinalCharacterUrl(state.lastCastedImage);
            setPhase(5); // Jump to result
        }
    }, [state.apiKey, state.lastCastedImage, finalCharacterUrl, phase]);

    // Persistence: Save when we get a result
    useEffect(() => {
        if (finalCharacterUrl) {
            dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: finalCharacterUrl });
        }
    }, [finalCharacterUrl, dispatch]);

    const generateLocalBiometricSheet = async () => {
        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: `Compositing Fast Local Biometric Sheet...`, type: 'info' } });
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1920;
            canvas.height = 1080;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not initialize canvas context");

            // Base Background & Blueprint Grid
            ctx.fillStyle = '#1D2430'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle Technical Grid
            ctx.strokeStyle = '#2A3546';
            ctx.lineWidth = 1;
            for (let i = 0; i < canvas.width; i += 40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
            }
            for (let i = 0; i < canvas.height; i += 40) {
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
            }

            // Top Header
            const dateStr = new Date().toLocaleDateString('en-US');
            const subjectIdText = `SUBJECT ID: NANO-${Math.floor(100000 + Math.random() * 900000)}, DATE: ${dateStr}`;
            ctx.fillStyle = '#E2E8F0';
            ctx.font = '500 24px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(subjectIdText, canvas.width / 2, 40);

            // Tight Mathematical Layout logic (Perfect 3x2 Grid)
            const w = 610;
            const h = 460;
            const gap = 20;
            const startX = Math.floor((canvas.width - ((w * 3) + (gap * 2))) / 2); 
            
            const col1 = startX;
            const col2 = startX + w + gap;
            const col3 = startX + (w * 2) + (gap * 2);
            
            const row1Y = 70;
            const row2Y = 70 + h + gap;

            const boxes = [
                { key: 'left', label: 'LEFT PROFILE', x: col1, y: row1Y },
                { key: 'center', label: 'CENTER FRONT', x: col2, y: row1Y },
                { key: 'right', label: 'RIGHT PROFILE', x: col3, y: row1Y },
                { key: 'up', label: 'TOP DOWN', x: col1, y: row2Y },
                { key: 'center', label: 'CENTER FRONT (ALT)', x: col2, y: row2Y },
                { key: 'down', label: 'BOTTOM UP', x: col3, y: row2Y }
            ];

            // Render watermark at the bottom right
            ctx.fillStyle = '#64748B';
            ctx.font = '400 14px "Inter", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('NanoCast Biometric Scanner', canvas.width - startX, canvas.height - 20);

            const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

            for (const box of boxes) {
                // Ensure no grid overlaps by rendering an opaque background first
                ctx.fillStyle = '#1D2430'; 
                ctx.fillRect(box.x, box.y, w, h);

                const blobUrl = capturedAngles[box.key as keyof typeof capturedAngles];
                if (blobUrl) {
                    try {
                        const img = await loadImage(blobUrl);
                        let sW = img.width;
                        let sH = img.height;
                        let tW = w;
                        let tH = h;

                        let cW = sW;
                        let cH = sW * (tH/tW);
                        if (cH > sH) {
                            cH = sH;
                            cW = sH * (tW/tH);
                        }
                        let cX = (sW - cW) / 2;
                        let cY = (sH - cH) / 2;

                        ctx.drawImage(img, cX, cY, cW, cH, box.x, box.y, tW, tH);
                    } catch (e) {
                        console.error(`Failed to draw biometric image ${box.key}`, e);
                        ctx.fillStyle = '#1E293B';
                        ctx.fillRect(box.x, box.y, w, h);
                    }
                }
                
                // Thin border overlay around the box (exactly match reference)
                ctx.strokeStyle = '#64748B';
                ctx.lineWidth = 1;
                ctx.strokeRect(box.x - 1, box.y - 1, w + 2, h + 2);
            }

            const finalDataUrl = canvas.toDataURL('image/png');
            setLocalBiometricSheetUrl(finalDataUrl);
        } catch (error) {
            console.error(error);
            showToast("Failed to composite fast sheet.");
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleGeneratePremiumBiometricSheet = async () => {
        if (!state.apiKey) {
            showToast("API Key Required for Premium Synthesis");
            return;
        }

        const hasBiometrics = Boolean(capturedAngles.center && capturedAngles.left && capturedAngles.right);
        if (!hasBiometrics) {
            showToast("Requires: Center + Left + Right Scans");
            return;
        }

        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: "Generating Premium Forensic Biometric Sheet...", type: 'info' } });

        try {
            // Validate Credits Here (assuming logic exists elsewhere, or warn)
            const imageRefs: { url: string; label: string }[] = [];
            const angles: (keyof typeof capturedAngles)[] = ['center', 'left', 'right', 'up', 'down'];
            
            for (const angle of angles) {
                const blobUrl = capturedAngles[angle];
                if (blobUrl) {
                    const b64 = await getBase64FromBlobUrl(blobUrl);
                    imageRefs.push({ url: b64, label: `Forensic Source: ${angle}` });
                }
            }

            const identityRefLimit = imageRefs.length;
            const biometricRangeText = identityRefLimit === 1 ? "[IMAGE 1]" : `[IMAGE 1] to [IMAGE ${identityRefLimit}]`;

            const prompt = `
Create a single image.

FORENSIC BIOMETRIC BOARD (PHASE 1)
This is a raw identity capture meant for neutral observation. It is NOT a stylized character reference.

SOURCE MATERIALS: Use ${biometricRangeText} as the ONLY source for the subject's face, skin tone, hair texture, and skull geometry.

STYLE PROTOCOL: High-end Premium Biometric Database. Premium cybersecurity identity capture overlay.
LIGHTING: Cinematic studio lighting, sharp edge lights, rich dark atmosphere, moody lighting.
CLOTHING: Tactical dark grey/black collared polo or utility undershirt.
BACKGROUND: SOLID BLACK STUDIO BACKGROUND. SOLID COLOR. DO NOT under any circumstances draw any grids, lines, blueprint markings, or graph paper patterns anywhere on the character portraits.

LAYOUT PROTOCOL:
- MULTI-ANGLE IDENTITY GRID. Perfect 3 columns by 2 rows.
- NO GRIDS ANYWHERE INSIDE BOXES: DO NOT draw grids or lines inside the portrait boxes or on the subjects.
- NO TEXT INSIDE BOXES: DO NOT write "LENS 1" or any other labels inside the portrait panels.
- PANEL BORDERS: Thin sharp rectangular outlines separating each of the 6 panels.
- UPPER HALF: 3 Headshots/Busts. Left Profile, Center Frontal face, Right Profile.
- LOWER HALF: 3 Alternate Headshots/Busts. Elevated/Top-down, Looking slightly off-center, Lower/Bottom-up angle.
- TOP TEXT: Centered exactly at the very top of the image (above the image grid): "SUBJECT ID: NANO-${Math.floor(100000 + Math.random() * 900000)}, DATE: ${new Date().toLocaleDateString('en-US')}"
- BOTTOM RIGHT TEXT: Flush right at the very bottom edge of the image: "NanoCast Biometric Scanner".

CRITICAL DIRECTIVES:
1. BIOMETRIC IDENTITY LOCK: MAXIMAL LIKENESS. This is for identity preservation. The face, nose shape, eyes, lips, and jaw structure must match the source scans perfectly.
2. NO RECASTING: Scans must be the ONLY identity authority. Do not average them into a generic or new person.
3. NO BEAUTIFICATION: Preserve all flaws, asymmetries, and exact age markers. Do not smooth skin or idealize features.
4. LEFT/RIGHT PROFILE PRESERVATION: Exactly preserve the side profiles provided in the inputs.
5. ALL PANELS SAME PERSON: Ensure strict continuity of identity across every single angle.
6. NO THEMES: Ignore any "Cyberpunk", "Fantasy", or "Sci-Fi" settings. This is a scientific output only.

NEGATIVE CONSTRAINTS:
stylized, painted, anime, 3d render, smiling, action pose, cinematic lighting, dramatic shadows, costumes, logos, text, watermarks, deformed, asymmetrical, duplicate angles.
`;

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 10, text: "Forensic Synthesis Initiated" } });
            
            let res = null;
            let currentPercent = 10;
            const etaMs = 25000;
            const updateMs = 1000;
            const increment = (updateMs / etaMs) * 100;
            const progressInterval = setInterval(() => {
                currentPercent = Math.min(95, currentPercent + increment);
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Reconstructing Biometric Mesh..." } });
            }, updateMs);

            try {
                res = await GeminiService.generateImage(prompt, state.apiKey, state.model, imageRefs, { imageSize: '4K', thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingMode });
            } finally {
                clearInterval(progressInterval);
            }

            if (res) {
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 100, text: "Forensic Matrix Complete" } });
                const finalUrl = res;
                setFinalCharacterUrl(finalUrl);
                
                // Show in the reference sheet viewer with special title
                setRefSheetUrl(finalUrl);
                setShowRefSheet(true);
                
                dispatch({ type: 'ADD_LOG', payload: { message: "Premium Biometric Board Generated Successfully.", type: 'success' } });
            } else {
                throw new Error("No image data returned from Nano-Engine.");
            }

        } catch (err: any) {
            console.error(err);
            showToast("Forensic Generation Failed.");
            dispatch({ type: 'ADD_LOG', payload: { message: `Generation failed: ${err.message}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleGenerateRefSheet = async () => {
        if (!state.apiKey) return;

        const hasBiometrics = Boolean(capturedAngles.center && capturedAngles.left && capturedAngles.right);
        const hasPortrait = Boolean(finalCharacterUrl);

        // Validation based on Identity Source
        if (identitySource === 'biometric') {
            if (!hasBiometrics) {
                showToast("Requires: Center + Left + Right");
                return;
            }
        } else {
            if (!hasPortrait) {
                showToast("Requires: Generate a portrait first");
                return;
            }
        }



        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: "Generating Character Reference Sheet...", type: 'info' } });

        try {

            // 1. PREPARE IMAGE REFERENCES FIRST
            const imageRefs: { url: string; label: string }[] = [];

            // A. Biometric or Portrait Refs
            if (identitySource === 'biometric') {
                const angles: (keyof typeof capturedAngles)[] = ['center', 'left', 'right', 'up', 'down'];
                for (const angle of angles) {
                    const blobUrl = capturedAngles[angle];
                    if (blobUrl) {
                        const b64 = await getBase64FromBlobUrl(blobUrl);
                        imageRefs.push({ url: b64, label: `Reference: ${angle}` });
                    }
                }
            } else {
                imageRefs.push({ url: finalCharacterUrl!, label: 'Character Reference' });
            }

            // Capture the count of biometric/identity images BEFORE adding the logo
            const identityRefLimit = imageRefs.length;

            // CRITICAL VALIDATION: Ensure we actually have identity images
            if (identitySource === 'biometric' && identityRefLimit === 0) {
                throw new Error("No biometric scans found. Please re-scan logic.");
            }
            if (identitySource === 'generated' && identityRefLimit === 0) {
                throw new Error("No portrait found. Please generate a portrait first.");
            }

            const identityRangeText = identityRefLimit === 1 ? "[IMAGE 1]" : `[IMAGE 1] to [IMAGE ${identityRefLimit}]`;

            // B1. Add Wardrobe Reference if exists
            let wardrobeRefIndex = -1;
            if (selectedWardrobeItem) {
                imageRefs.push({ url: selectedWardrobeItem.url, label: "Costume Asset" });
                wardrobeRefIndex = imageRefs.length;
            }

            // B2. Add Logo Reference if exists
            let logoRefIndex = -1;
            if (directorControls.logoImage) {
                imageRefs.push({ url: directorControls.logoImage, label: "Logo Asset" });
                logoRefIndex = imageRefs.length; // 1-based index
            }

            // 2. SANITIZE KEYWORDS
            const getSafeKeywords = (style: string, originalKeywords: string) => {
                let safe = originalKeywords;
                if (identitySource === 'biometric') {
                    if (style === 'family_3d' || style === 'pixar') {
                        safe = safe.replace(/Disney-Pixar/gi, 'High-End 3D Render').replace(/expressive features,?/gi, '').replace(/exaggerated,?/gi, '').replace(/cartoon proportions,?/gi, '');
                    }
                    if (style === 'retro_anime' || style === 'retro_cel') {
                        safe = safe.replace(/anime aesthetic/gi, 'Cel-Shaded Art Style').replace(/Studio Ghibli vibes/gi, 'Hand-drawn Animation Look');
                    }
                    if (style === 'cyberpunk' || style === 'cyberpunk_neon') {
                        safe = safe.replace(/interface overlays,?/gi, '').replace(/high-tech interface,?/gi, '');
                    }
                    if (style === 'hyper_real' || style === 'premium_cg' || style === 'exact_studio') {
                        // SANITIZE REALISM: Remove "Idealized" terms that trigger generic beauty
                        safe = safe.replace(/exact facial structure preservation,?/gi, 'raw scan data').replace(/perfect face,?/gi, '').replace(/idealized features,?/gi, '');
                    }
                }
                return safe;
            };

            const targetStyleKey = refStyle || 'family_3d';
            const styleConfig = REF_SHEET_STYLES[targetStyleKey as keyof typeof REF_SHEET_STYLES] || REF_SHEET_STYLES.family_3d;
            const safeKeywords = getSafeKeywords(targetStyleKey, styleConfig.keywords);

            // 3. PROMPT CONSTRUCTION
            const effectiveStylization = directorControls.stylization;
            const styleNote = "";
            let effectiveIdentityStrength = directorControls.identityStrength;

            if (identitySource === 'biometric') {
                // FORCE MAX IDENTITY for Biometric Scans
                effectiveIdentityStrength = 100;
                // Note: We removed the "Safety Clamp". Now we trust the Qualitative Tiers to handle high stylization without identity drift.
            }

            let finalPrompt = "";

            // 0. GLOBAL LAYOUT (MUST BE FIRST)
            finalPrompt += `REFERENCE SHEET BACKGROUND PROTOCOL:\n`;
            finalPrompt += "Background must be a SOLID BLACK STUDIO BACKDROP. No maps, no text, no scenery, no patterns.\n\n";

            finalPrompt += `LAYOUT & COMPOSITION PROTOCOL (AGGRESSIVE ENFORCEMENT):\n`;
            finalPrompt += `1. VARIATION LOCK: Every panel MUST show a unique viewpoint. NO DUPLICATE ANGLES.\n`;
            finalPrompt += `2. FORBIDDEN: Do NOT repeat the same camera angle (e.g., do not show 3/4 view twice). Do NOT generate the same expression twice.\n`;
            finalPrompt += `3. MULTI-ANGLE CAMERA RIG: Each panel shows a different viewpoint of the character. Each lens is unique.\n\n`;

            if (refLayout === 'form_focus') {
                // BODY FOCUS -> Vertical Split (Image 3)
                finalPrompt += " [LAYOUT A]: Vertical Split.\n";
                finalPrompt += " LEFT PANEL (50%): 3 Full Standing Figures. LENS 1: Frontal, LENS 2: Left 3/4, LENS 3: Back View.\n";
                finalPrompt += " RIGHT PANEL (50%): 2x2 Grid of 4 HEAD PANELS. LENS 4: Frontal Close-Up Face (0-degree yaw). LENS 5: True Left Profile Face (90-degree left yaw). LENS 6: True Right Profile Face (90-degree right yaw). LENS 7: Upward Tilt Face (near-frontal yaw, chin raised).\n";
            } else if (refLayout === 'face_focus') {
                finalPrompt += " [LAYOUT B]: 8 Distinct Expression Panels. ALL views must show the costume collar.\n";
                finalPrompt += " MANDATORY UNIQUE LENS ANGLES: [LENS 1: Frontal], [LENS 2: 45-degree Left], [LENS 3: 45-degree Right], [LENS 4: Extreme 90-degree Left Profile], [LENS 5: Extreme 90-degree Right Profile], [LENS 6: Tilted Up], [LENS 7: Tilted Down], [LENS 8: High Angle Bird's Eye].\n";
            } else {
                // HYBRID -> Horizontal Split (Image 4)
                finalPrompt += " [LAYOUT C]: Horizontal Split.\n";
                finalPrompt += " UPPER SECTION (60%): 3 Full Standing Figures. LENS 1: Frontal, LENS 2: Right 3/4, LENS 3: Back View.\n";
                finalPrompt += " LOWER SECTION (40%): Row of 5 HEAD PANELS. LENS 4: Frontal Close-Up Face (0-degree yaw). LENS 5: True Left Profile Face (90-degree left yaw). LENS 6: True Right Profile Face (90-degree right yaw). LENS 7: Upward Tilt Face (near-frontal yaw, chin raised). LENS 8: Downward Tilt Face (near-frontal yaw, chin lowered).\n";
            }
            finalPrompt += " EXCLUSION RULE: NEVER duplicate any angle. No two panels may share the same rotation. Every single lens angle MUST be unique.\n\n";

            finalPrompt += `ANGLE LOCK (MAXIMUM PRIORITY):\n`;
            finalPrompt += `- The head panels are a technical angle set, not expressive variations.\n`;
            finalPrompt += `- Each head panel must occupy a distinct mandatory angle bucket.\n`;
            finalPrompt += `- Frontal close-up = 0-degree yaw, both eyes equally visible, symmetrical face presentation.\n`;
            finalPrompt += `- True left profile = 90-degree left yaw, one eye visible, true left-side silhouette.\n`;
            finalPrompt += `- True right profile = 90-degree right yaw, one eye visible, true right-side silhouette.\n`;
            finalPrompt += `- Upward tilt = near-frontal yaw, chin elevated, nostril and under-chin visibility.\n`;
            finalPrompt += `- Downward tilt = near-frontal yaw, chin lowered, forehead and top-plane emphasis.\n`;
            finalPrompt += `- Do not substitute 3/4 views for profile views.\n`;
            finalPrompt += `- Do not generate two panels in the same yaw family.\n`;
            finalPrompt += `- If two panels read as near-identical angle variants, the render is invalid.\n\n`;

            finalPrompt += `PROFILE DISTINCTNESS RULE:\n`;
            finalPrompt += `- Left profile and right profile must be mirror-opposed true side views.\n`;
            finalPrompt += `- Frontal close-up must not drift into 3/4.\n`;
            finalPrompt += `- Upward tilt and downward tilt must remain near-frontal in yaw.\n`;
            finalPrompt += `- Do not produce a second left-leaning 3/4 view when a true right profile is required.\n\n`;

            if (identitySource !== 'biometric') {
                // GENERATED IDENTITY
                finalPrompt += `GENERATE CHARACTER REFERENCE SHEET:\n`;
                finalPrompt += `Subject: ${selectedBody ? bodyArchetypes.find(b => b.id === selectedBody)?.name : "Character"}.\n`;
                if (directorControls.hairStyle) { finalPrompt += `Hair Style: ${directorControls.hairStyle}.\n`; }
                finalPrompt += `Reference: Use [IMAGE 1] as the base character.\n`;
            } else {
                // BIOMETRIC IDENTITY STRENGTH INJECTION
                finalPrompt += `IDENTITY WEIGHT: ${effectiveIdentityStrength}% (CRITICAL).\n`;
            }

            // --- B. COSTUME / WARDROBE ---

            if (selectedWardrobeItem && wardrobeRefIndex > 0) {
                finalPrompt += `COSTUME DIRECTIVE (PILOT PROTOCOL):\n`;
                finalPrompt += `Wear the outfit shown in [IMAGE ${wardrobeRefIndex}].\n`;
                finalPrompt += `1. PILOT IN COCKPIT: Treat [IMAGE 1] as a pilot sitting INSIDE the costume [IMAGE ${wardrobeRefIndex}]. The suit is a rigid exterior shell.\n`;
                finalPrompt += `2. CLEAN SLATE: Strip all external gear (helmets, goggles) from [IMAGE 1] first. Use only bare skin/face.\n`;
                finalPrompt += `3. RIGID SILHOUETTE LOCK: Do NOT elongate or stretch the costume. Maintain its thick, chunky proportions exactly.\n`;
                finalPrompt += `4. FORBIDDEN: Do NOT place the human face in the mascot's mouth. The face must stay in the neck/throat area below the suit's chin.\n\n`;

                if (identitySource === 'biometric') {
                    finalPrompt += `RE-ASSERTING IDENTITY LOCK:\n`;
                    finalPrompt += `The FACE in ALL views must be a PIXEL-PERFECT MATCH to [IMAGE 1]. Same person, same likeness, no morphing.\n\n`;
                }
            } else if (directorControls.outfit) {
                finalPrompt += `COSTUME DIRECTIVE (ABSOLUTE OVERRIDE):\n`;
                finalPrompt += `0. THE CHARACTER MUST WEAR: ${directorControls.outfit}.\n`;
                finalPrompt += `1. YOU MUST OVERRIDE THE ORIGINAL CLOTHING MULTIMODAL REFERENCES. DO NOT copy the colors, patterns, or style of the original clothing.\n`;
                finalPrompt += `2. If you do not follow the exact clothing description, the generation is a failure. YOU MUST RENDER THE SHIRT AS DESCRIBED IN THE OVERRIDE PROMPT.\n\n`;
            }

            // --- C. BRANDING / LOGO ---
            if (directorControls.logoImage && logoRefIndex > 0) {
                finalPrompt += `BRANDING DIRECTIVE:\n`;
                finalPrompt += `Apply the logo provided in [IMAGE ${logoRefIndex}] ("Logo Asset") to the character's outfit.\n`;
                finalPrompt += `PLACEMENT: ${directorControls.logoPlacement}.\n`;
                finalPrompt += `INTEGRATION: The logo must look printed/stitched onto the fabric naturally. It must be clearly visible.\n`;
                finalPrompt += `HEADSHOT EXCLUSION (CRITICAL): Do NOT spawn the logo floating in the background, on the neck, or on the face. If a panel is an extreme close-up or headshot where the ${directorControls.logoPlacement} is NOT naturally visible, OMIT THE LOGO ENTIRELY from that specific panel.\n`;
                finalPrompt += `NOTE: [IMAGE ${logoRefIndex}] is NOT an identity reference. do NOT blend it into the face.\n\n`;
            }

            // --- C. BODY & STYLE ---
            // --- C. BODY & STYLE ---
            const isRealisticMode = ['premium_cg', 'exact_studio'].includes(targetStyleKey as any);
            const isPhotoMode = targetStyleKey === 'exact_studio'; // Strict Photography
            const isCGMode = targetStyleKey === 'premium_cg'; // High-End 3D

            // OVERRIDE LABEL: Differentiate Photo vs CG
            let promptStyleLabel = styleConfig.label;
            let promptKeywords = safeKeywords;



            if (identitySource === 'biometric') {
                if (isPhotoMode) {
                    promptStyleLabel = "Photorealistic Source (8k Photography)";
                }
                if (isCGMode) {
                    promptStyleLabel = "Stylized Realism (Feature Animation Style)";
                    // Override keywords to prevent "Photorealistic" from bleeding in
                    promptKeywords = "Stylized Realism, Modern Feature Animation, Stylized Surface Detail, Expressive Features, Subsurface Scattering, Cinematic Lighting, 3D Render, AAA Game Cinematic, Soft Box Lighting, Octane Render.";
                }
            }

            finalPrompt += `STYLE PROTOCOL: ${promptStyleLabel}\n`;
            finalPrompt += `Keywords: ${promptKeywords}\n`;

            if (isRealisticMode && identitySource === 'biometric') {
                if (isPhotoMode) {
                    finalPrompt += `Stylization Intensity: 0% (Biometric Lock)\n`;
                } else {
                    // Unlock for CG Mode to allow stylized rendering
                    finalPrompt += `Stylization Intensity: ${effectiveStylization}%\n`;
                    finalPrompt += `STYLIZATION SCOPE: Apply style to MATERIAL, SHADER, LIGHTING, and TEXTURE only.\n`;
                    finalPrompt += `GEOMETRY LOCK: The 3D Mesh of the face must be an EXACT topological match to [IMAGE 1]. Do not deform features for 'appeal'.\n`;
                }

                if (isPhotoMode) {
                    // PHOTOGRAPHY TIERS (Exact Studio)
                    if (effectiveStylization <= 10) {
                        finalPrompt += `LIGHTING MODE: STANDARD PORTRAIT PHOTOGRAPHY. Natural, neutral studio lighting. Accurate skin tones. No diffusion.\n\n`;
                    } else if (effectiveStylization <= 40) {
                        finalPrompt += `LIGHTING MODE: HIGH-END FASHION PHOTOGRAPHY. 85mm Portrait Lens. f/1.8 Aperture. Sharp Focus on Eyes. Detailed Skin Texture.\n\n`;
                    } else {
                        finalPrompt += `LIGHTING MODE: AWARD-WINNING EDITORIAL PHOTOGRAPHY. Dramatic Cinematic Lighting. Rembrandt lighting. Hyper-Realistic Texture. 8k Resolution.\n\n`;
                    }
                    // NEGATIVE CONSTRAINTS (Forbid CG/Render)
                    finalPrompt += `NEGATIVE CONSTRAINTS: Cartoon, 3D Render, Illustration, Anime, Painting, Drawing, Plastic, Doll, Action Figure, Caricature, CGI look, stylized features.\n`;
                } else {
                    // CG RENDER TIERS (Premium CG / Cyberpunk) -> STYLIZED REALISM
                    if (effectiveStylization <= 10) {
                        finalPrompt += `RENDER QUALITY: STANDARD 3D ASSET. Clean topology. Neutral lighting. Good shape appeal.\n\n`;
                    } else if (effectiveStylization <= 40) {
                        finalPrompt += `RENDER QUALITY: HIGH-END GAME CINEMATIC. Blizzard Animation Style. Expressive shapes. Saturated textures. Soft lighting.\n\n`;
                    } else {
                        finalPrompt += `RENDER QUALITY: FEATURE FILM ANIMATION. Sony/DreamWorks Style. "Spider-Verse" detail levels. Dynamic Lighting. Strong Shape Appeal.\n\n`;
                    }
                    // NEGATIVE CONSTRAINTS (Allow Stylized, Ban 2D/Low Poly)
                    finalPrompt += `NEGATIVE CONSTRAINTS: Anime, 2D, Drawing, Sketch, Low Poly, Mobile Game, Flat shading, Pixel art, Oil painting, Watercolor, Different Haircut, Hair growth, Shaved beard, Grooming change.\n`;
                }

            } else {
                finalPrompt += `Stylization Intensity: ${effectiveStylization}%${styleNote}.\n\n`;
            }

            if (identitySource === 'biometric') {
                finalPrompt += `ADVANCED BODY MORPHOLOGY (NON-DESTRUCTIVE):\n`;
                finalPrompt += `Target Height: ${formatHeight(heightIn)}\n`;
                const promptWeight = Math.round(weightLbs / 5) * 5;
                finalPrompt += `Target Mass: ${promptWeight} lbs\n`;
                finalPrompt += `INSTRUCTION: Adjust the BODY MASS index to match ${promptWeight} lbs, but MAINTAIN THE EXACT CRANIAL STRUCTURE of [IMAGE 1].\n`;
                finalPrompt += `Do not generate a generic 'heavy' or 'thin' face. Apply weight naturally to the body, neck, and jawline, but keep the eyes, nose, and mouth spacing IDENTICAL to the source.\n\n`;
            }



            if (identitySource === 'biometric') {
                // --- A. IDENTITY LOCK (MOVED TO END FOR PRIORITY) ---
                finalPrompt += `FINAL IMAGE MASTERY: IDENTITY OVERRIDE (MAXIMUM PRIORITY):\n`;

                const isRealistic = ['premium_cg', 'exact_studio'].includes(targetStyleKey);
                if (isRealistic) {
                    finalPrompt += `FINAL INSTRUCTION: The face in ALL views must be a PIXEL-PERFECT IDENTITY LIKENESS to [IMAGE 1]. PRESERVE FACIAL GEOMETRY ABOVE ALL ELSE.\n`;
                    finalPrompt += `CRITICAL ROTATION OVERRIDE: While the identity must match, YOU MUST NOT COPY THE CAMERA ANGLE OF [IMAGE 1]. You MUST dynamically rotate the character's head and body in 3D space to precisely match the required LENS angle (Profile, 3/4, Back, etc) for each individual panel.\n`;
                    if (directorControls.hairStyle) {
                        finalPrompt += `GROOMING OVERRIDE: Apply the hairstyle "${directorControls.hairStyle}". Preserve facial hair from [IMAGE 1] but override head hair.\n`;
                    } else {
                        finalPrompt += `GROOMING LOCK: The Hairstyle (or lack thereof) and Facial Hair must match [IMAGE 1] exactly. IMPORTANT: If the subject is BALD in [IMAGE 1], they MUST BE BALD in the output. Do not add hair. Do not change the beard style.\n`;
                    }
                    finalPrompt += `TEXTURE PROJECTION: Treat [IMAGE 1] as the SOURCE TEXTURE MAP. Project the exact features (Eyes, Nose, Mouth, Skin Details) onto the model. Do not use a fallback generic face.\n`;

                    finalPrompt += `MODE: MULTI-ANGLE IDENTITY REPLICATION. Ignore style-based facial adjustments. Pure Biometric fidelity required, but fully rotated per lens.\n`;
                    finalPrompt += `STYLIZATION SCOPE: The chosen Stylization Intensity (${effectiveStylization}%) applies ONLY to Lighting, Skin Texture Resolution, and Render Quality. It matches the *fidelity* of the style. It applies 0% deviation to the Identity/Geometry.\n`;
                } else {
                    // STYLIZED: Allow caricature but prioritize recognition
                    finalPrompt += `FINAL INSTRUCTION: HARMONIOUSLY ADAPT the face shape, eyes, and nose to match the [Style] aesthetic. The goal is a STYLIZED LIKENESS that resembles [IMAGE 1]. Adapt the proportions (e.g. Larger Eyes, Softer Jaw) but PRESERVE THE IDENTITY FEATURES (Nose shape, Jawline, Eye Color).\n`;
                }

                finalPrompt += `Use ${identityRangeText} as the source for the character's SKINTONE, FACE, and HAIR ONLY. IGNORE clothing and shoulders in [IMAGE 1].\n`;
                if (directorControls.outfit) {
                    finalPrompt += `HEADSHOT WARDROBE LOCK: Even in extreme close-up or headshot views, the visible collar and shoulders MUST be the ${directorControls.outfit}. Do not use the clothing from the identity scan.\n`;
                }

                if (isRealistic) {
                    finalPrompt += `Primary Directive: Exact match of facial hair (beard/mustache/stubble) and grooming from ${identityRangeText}. Do NOT add hair that is not there.\n`;
                } else {
                    finalPrompt += `Reference [IMAGE 1] for key features (Facial Hair, Hair Color, Eye Color). Simplify the *Skin Shading* only. DO NOT SIMPLIFY THE COSTUME DETAILS. The outfit must remain highly detailed and accurate to the reference.\n`;
                }
            }

            // --- E. NEGATIVES ---
            finalPrompt += `\nNEGATIVE CONSTRAINTS:\n`;
            finalPrompt += `different person, face swap, identity replacement, recast identity, portrait mismatch, approved portrait ignored, generic face, younger face, idealized face, video game protagonist hallucination, generic action hero, muscular replacing overweight, slenderized body, idealized 3D template, stylized-hero hallucination, generic cartoon structure, altered skull, incorrect profile, inconsistent nose projection, inconsistent jawline, inconsistent ear placement, inconsistent beard silhouette, inconsistent hairline, off-model panels, panel-to-panel face drift, restyled face that changes identity, generic profile, beautified profile, style-averaged face, new character per panel, duplicate angle, repeated yaw bucket, near-identical head panel, second left profile, second near-left 3/4, profile replaced by 3/4, frontal drifting to 3/4, upward tilt with side yaw, downward tilt with side yaw, costume reinterpretation, branding loss, missing logo when visible, relocated logo, replaced logo, incorrect logo placement, stylized logo hallucination, shader inconsistency, mismatched stylization, unintended realism increase, realistic turnaround drift, photographic drift, raw DSLR look in premium CG, studio headshot photography in premium CG, documentary photo realism in premium CG, flattened CGI treatment, missing CGI shader response, missing subsurface scattering, missing rendered-digital-double look, technical identity-sheet realism, right-panel realism drift, closeup realism drift, flattened stylization, weak cyberpunk treatment, generic neutral studio lighting, missing neon rim light, missing teal/magenta separation, loss of futuristic render mood, inconsistent cyberpunk intensity across panels, dramatic hero panel with neutral supporting panels, neutral turnaround row, flat profile panels, uneven theatrical treatment, loss of animated eye language, loss of softened facial planes, loss of stylized nose treatment, mismatch between body-panel style and headshot-panel style, squeezed torso, narrow 3/4 body, narrow back view, stretched body, compressed body, body mass ignored, inconsistent shoulder width, inconsistent pelvis width, inconsistent limb thickness, different body mass across turnaround panels, mismatched full-body silhouette, unnatural neck twist, owl turn, over-rotated head, visible face in true back view, cheating face visibility in rear panel, head misaligned with torso, extra people, text, watermarks, scenery, maps, landscape, background graphics.\n`;
            finalPrompt += `cropped legs, cut off feet, cowboy shot, 3/4 shot, knees up, waist up, torso only, close up body, cropped head.\n`;
            if (directorControls.outfit) {
                finalPrompt += `EXTREMELY IMPORTANT: DO NOT COPY THE CLOTHING FROM THE SOURCE IMAGES. DO NOT RENDER THE ORIGINAL ATTIRE.\n`;
            }
            if (identitySource === 'biometric') {
                finalPrompt += `generic face, random person, default avatar, face swap, extra people, text, watermarks, maps.\n`;
                if (['premium_cg', 'exact_studio'].includes(targetStyleKey)) {
                    // REALISTIC: Ban caricature
                    finalPrompt += `caricature, cartoon face, distorted proportions, big eyes, small nose, altered skull shape.\n`;
                } else {
                    // STYLIZED: Ban realism
                    finalPrompt += `photorealistic, hyperrealistic, raw photo, human skin texture, realistic proportions, unstylized.\n`;
                }
                if (['hyper_real', 'exact_studio'].includes(selectedStyle || '')) {
                    finalPrompt += `caricature, cartoon face, distorted proportions, big eyes, small nose, altered skull shape.\n`;
                }
            }
            if (selectedWardrobeItem) {
                finalPrompt += `face from costume image, identity from costume image, person from wardrobe ref, mixed identity, source photo clothing, mismatching clothes, casual clothes, t-shirt, polo shirt.\n`;
            }

            let res = null;
            let attempts = 0;
            const maxRetries = 3;

            // --- TIMEOUT & ETA LOGIC ---
            const getEtaMs = () => state.imageResolution === '4K' ? 90000 : (state.imageResolution === '2K' ? 45000 : 20000);
            const getTimeoutMs = () => state.imageResolution === '4K' ? 120000 : (state.imageResolution === '2K' ? 90000 : 45000);

            const etaMs = getEtaMs();
            const timeoutMs = getTimeoutMs();

            // Timeout Helper
            const timeoutPromise = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));

            // --- PROGRESS SIMULATION TIMER ---
            let currentPercent = 5;
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Synthesizing Reference Sheet" } });

            const updateMs = 1000;
            const increment = (updateMs / etaMs) * 100;

            let progressInterval: NodeJS.Timeout | undefined;
            progressInterval = setInterval(() => {
                currentPercent = Math.min(95, currentPercent + increment);
                let text = "Neural Matrix Synthesizing";
                if (currentPercent > 50) text = "Arranging Panel Layouts...";
                if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
            }, updateMs);

            while (attempts <= maxRetries) {
                try {
                    res = await Promise.race([
                        GeminiService.generateImage(
                            finalPrompt,
                            state.apiKey,
                            state.model,
                            imageRefs,
                            { aspectRatio: '16:9', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingMode }
                        ),
                        timeoutPromise(timeoutMs) // Dynamic Timeout
                    ]);
                    break; // Success
                } catch (err: any) {
                    const isTimeout = err.message?.includes('timed out');
                    const isOverloaded = err.message?.includes('503') || err.message?.includes('overloaded');
                    if ((isTimeout || isOverloaded) && attempts < maxRetries) {
                        attempts++;
                        const reason = isTimeout ? "Request Packet Dropped (Timeout)" : "Server Overloaded (503)";
                        dispatch({ type: 'ADD_LOG', payload: { message: `${reason}. Retrying attempt ${attempts}/${maxRetries}...`, type: 'info' } });
                        currentPercent = 10; // reset progress visual
                        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: `Retracting Pulse (${attempts}/${maxRetries})` } });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        throw err;
                    }
                }
            }

            if (progressInterval) clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 100, text: "Decoding Cast Sheet" } });
            await new Promise(r => setTimeout(r, 500));

            setRefSheetUrl(res as string);
            setShowRefSheet(true);
            dispatch({ type: 'ADD_LOG', payload: { message: "Reference Sheet Generated.", type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Ref Sheet failed: ${e.message}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
        }
    };

    const getPhaseTitle = (p: Phase) => {
        switch (p) {
            case 1: return "Biometric Acquisition";
            case 2: return "Morphological Matrix";
            case 3: return "Style Synthesis";
            case 4: return "Nano Neural Link";
            case 5: return "Digital Reconstruction";
            default: return "System Idle";
        }
    };

    // Smart Lock Logic
    const isPhaseLocked = (p: Phase) => {
        if (p === 1) return false; // Always open
        // Minimum Viable Scan: Center + Left + Right
        if (p === 2) return !(capturedAngles.center && capturedAngles.left && capturedAngles.right);
        if (p === 3) return !selectedBody; // Need body
        if (p === 4) return !selectedStyle; // Need style
        if (p === 5) return !finalCharacterUrl; // Need result
        return true;
    };

    // Lock Reason Tooltip
    const getLockReason = (p: Phase) => {
        if (!isPhaseLocked(p)) return null;
        if (p === 2) return "Requires Center + Left + Right scans";
        if (p === 3) return "Select Body Archetype";
        if (p === 4) return "Select Art Style";
        if (p === 5) return "Generate Result First";
        return "Locked";
    }

    const isScanning = activeSector && !capturedAngles[activeSector];

    const resetScan = () => {
        // Revoke URLs to free memory
        Object.keys(capturedAngles).forEach(key => setAngle(key as keyof typeof capturedAngles, null));

        // CRITICAL: Reset the ref that tracks captured angles, otherwise auto-scan thinks it's done
        capturedAnglesRef.current = { center: null, left: null, right: null, up: null, down: null };

        // Reset local scan state
        setActiveSector(null);
        setStabilityProgress(0);
        sectorStableFramesRef.current = 0;

        // Clear persistence
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: null });
        setFinalCharacterUrl(null);
        setPhase(1);
    };

    // Helper: Handle file upload
    const handleFileUpload = (angle: keyof typeof capturedAngles, file: File) => {
        const url = URL.createObjectURL(file);
        setAngle(angle, url);
    };

    return (
        <div className="flex h-full bg-bg text-fg overflow-hidden relative font-sans select-none">
            {/* Background Grid - Subtle */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.05]"
                style={{
                    backgroundImage: 'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}>
            </div>

            {/* SIDEBAR */}
            <div className="w-64 border-r border-border bg-surface/90 backdrop-blur-md z-10 flex flex-col">
                <div className="p-6 border-b border-border">
                    <h1 className="text-2xl font-black tracking-tighter text-fg flex items-center gap-2">
                        <Target className="text-accent w-6 h-6 animate-pulse" />
                        NANO<span className="text-muted text-sm align-top">BANANA</span>
                    </h1>
                    <p className="text-[10px] text-muted uppercase tracking-[0.2em] mt-1">Biometric Casting Engine</p>
                </div>

                <div className="flex-1 py-8 px-4 space-y-2">
                    {[1, 2, 3, 4, 5].map((p) => {
                        const locked = isPhaseLocked(p as Phase);
                        const reason = getLockReason(p as Phase);
                        return (
                            <button
                                key={p}
                                disabled={locked}
                                onClick={() => setPhase(p as Phase)}
                                title={reason || ""}
                                className={`w-full text-left px-4 py-4 rounded-xl border transition-all group relative overflow-hidden flex justify-between items-center ${phase === p
                                    ? 'border-accent-2 bg-accent-2/10 text-accent-2 -[0_0_15px_rgba(59,130,246,0.2)]'
                                    : locked
                                        ? 'border-transparent text-muted cursor-not-allowed opacity-50'
                                        : 'border-transparent text-muted hover:text-white hover:bg-surface-2'
                                    }`}
                            >
                                <div className="z-10 flex flex-col">
                                    <span className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${phase === p ? 'animate-pulse' : ''}`}>
                                        <span>Phase 0{p}</span>
                                    </span>
                                    {locked && <span className="text-[10px] normal-case opacity-70 mt-1">{reason}</span>}
                                </div>
                                {phase === p && <ChevronRight className="w-4 h-4 text-accent animate-bounce-x" />}
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-border text-[9px] text-muted text-center">
                    SYSTEM READY // NANO.1.0 SAFE MODE
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col z-10 relative">
                <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-bg/80 backdrop-blur">
                    <div className="flex items-center gap-4">
                        <div className="w-2 h-2 bg-accent rounded-full animate-ping"></div>
                        <h2 className="text-lg font-bold text-fg uppercase tracking-wider">
                            {getPhaseTitle(phase)}
                            {phase >= 3 && bodyScope && <span className="text-accent ml-2 opacity-70"> // {bodyScope}</span>}
                        </h2>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted font-bold tracking-widest">
                        <div className="flex items-center gap-2">
                            <Scan className="w-4 h-4" />
                            <span>SENSOR: {webcamRef.current ? "ONLINE" : "STANDBY"}</span>
                        </div>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`flex items-center gap-2 hover:text-fg transition-colors ${showSettings ? 'text-accent-2' : ''}`}
                        >
                            <Sliders className="w-4 h-4" />
                            <span>CONTROLS</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 p-8 relative overflow-hidden">
                    {/* DIRECTOR CONTROLS DRAWER */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ x: "100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "100%" }}
                                className="absolute top-0 right-0 z-50 h-full w-80 bg-surface border-l border-border p-6 overflow-y-auto backdrop-blur-xl"
                            >
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-center mb-6">
                                        <HelpTooltip zone="nano" id="directorModeToggle">
                                            <div className="flex bg-surface-2 rounded-lg p-1 gap-1">
                                                <button
                                                    onClick={() => setSidebarMode('director')}
                                                    className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-black tracking-wider transition-all border ${sidebarMode === 'director'
                                                        ? 'bg-surface text-accent border-accent -[0_0_10px_rgba(250,204,21,0.2)]'
                                                        : 'border-transparent text-muted hover:text-fg'
                                                        }`}
                                                >
                                                    Director
                                                </button>
                                                <button
                                                    onClick={() => setSidebarMode('wardrobe')}
                                                    className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-black tracking-wider transition-all border ${sidebarMode === 'wardrobe'
                                                        ? 'bg-surface text-accent border-accent -[0_0_10px_rgba(250,204,21,0.2)]'
                                                        : 'border-transparent text-muted hover:text-fg'
                                                        }`}
                                                >
                                                    Wardrobe
                                                </button>
                                            </div>
                                        </HelpTooltip>
                                        <button onClick={() => setShowSettings(false)} className="text-muted hover:text-fg">&times;</button>
                                    </div>

                                    {/* STORAGE CONFIGURATION */}
                                    <div className="mb-6 p-3 bg-black/40 rounded-lg border border-border/50">
                                        <h4 className="text-[10px] uppercase font-black text-muted tracking-widest mb-2 flex justify-between">
                                            Storage Link
                                            <span className={state.saveDirectoryHandle || state.saveDirectoryPath ? 'text-success' : 'text-danger'}>
                                                {state.saveDirectoryHandle || state.saveDirectoryPath ? 'CONNECTED' : 'NOT LINKED'}
                                            </span>
                                        </h4>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    // NATIVE MODE
                                                    if (window.electronAPI) {
                                                        const path = await nativeSelectFolder();
                                                        if (path) {
                                                            dispatch({ type: 'SET_SAVE_PATH', payload: path });
                                                            dispatch({ type: 'ADD_LOG', payload: { message: `Native Storage Linked: ${path}`, type: 'success' } });
                                                        }
                                                        return;
                                                    }

                                                    // WEB MODE
                                                    // @ts-ignore
                                                    const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
                                                    if (handle) {
                                                        dispatch({ type: 'SET_SAVE_DIRECTORY', payload: handle });
                                                        dispatch({ type: 'ADD_LOG', payload: { message: "Storage Link Established", type: 'success' } });
                                                    }
                                                } catch (e) {
                                                    console.log("Folder selection cancelled");
                                                }
                                            }}
                                            className={`w-full py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all border ${state.saveDirectoryHandle || state.saveDirectoryPath
                                                ? 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                                                : 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20'
                                                }`}
                                        >
                                            {state.saveDirectoryPath
                                                ? `Linked: ${state.saveDirectoryPath.split(/[\\/]/).pop()}`
                                                : state.saveDirectoryHandle
                                                    ? `Linked: ${state.saveDirectoryHandle.name}`
                                                    : 'Connect Save Folder'}
                                        </button>
                                    </div>

                                    {sidebarMode === 'director' ? (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Identity Lock</span>
                                                    <span className="text-white">{directorControls.identityStrength}%</span>
                                                </label>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={directorControls.identityStrength}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, identityStrength: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Stylization</span>
                                                    <span className="text-white">{directorControls.stylization}%</span>
                                                </label>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={directorControls.stylization}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, stylization: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Approx. Age</span>
                                                    <span className="text-white">{directorControls.age} yrs</span>
                                                </label>
                                                <input
                                                    type="range" min="10" max="90"
                                                    value={directorControls.age}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, age: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between items-center">
                                                    <span>Basic Outfit Prompt</span>
                                                    <button
                                                        onClick={() => setDirectorControls(p => ({ ...p, outfit: '' }))}
                                                        className="text-[9px] text-zinc-500 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500 px-2 rounded bg-black/50"
                                                    >
                                                        CLEAR
                                                    </button>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Cyberpunk Tactical Vest"
                                                    value={directorControls.outfit}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, outfit: e.target.value }))}
                                                    className="w-full bg-black/50 border border-border rounded-lg px-4 py-3 text-sm text-white focus:border-accent outline-none"
                                                />
                                                <InlineHint zone="nano" id="promptInput" />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between items-center">
                                                    <span>Hair Style Prompt</span>
                                                    <button
                                                        onClick={() => setDirectorControls(p => ({ ...p, hairStyle: '' }))}
                                                        className="text-[9px] text-zinc-500 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500 px-2 rounded bg-black/50"
                                                    >
                                                        CLEAR
                                                    </button>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Buzz cut, messy hair, slicked back"
                                                    value={directorControls.hairStyle}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, hairStyle: e.target.value }))}
                                                    className="w-full bg-black/50 border border-border rounded-lg px-4 py-3 text-sm text-white focus:border-accent outline-none"
                                                />
                                            </div>

                                            <div className="space-y-3 pt-6 border-t border-border">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-xs text-accent uppercase tracking-widest font-black flex items-center gap-2">
                                                        <Zap className="w-3 h-3" /> Branding & Identity
                                                    </label>
                                                    {directorControls.logoImage && (
                                                        <button
                                                            onClick={() => setDirectorControls(p => ({ ...p, logoImage: null }))}
                                                            className="text-[9px] text-danger hover:text-red-400 uppercase font-black"
                                                        >
                                                            Remove Logo
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="bg-black/40 rounded-lg border border-border/50 p-3 space-y-3">
                                                    {/* Logo Uploader */}
                                                    <div className="flex gap-3">
                                                        <div className="w-16 h-16 bg-black rounded border border-border dashed-border flex items-center justify-center overflow-hidden relative group cursor-pointer">
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        const reader = new FileReader();
                                                                        reader.onload = (e) => {
                                                                            setDirectorControls(p => ({ ...p, logoImage: e.target?.result as string }));
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    }
                                                                }}
                                                            />
                                                            {directorControls.logoImage ? (
                                                                <img src={directorControls.logoImage} className="w-full h-full object-contain" />
                                                            ) : (
                                                                <Upload className="w-6 h-6 text-muted group-hover:text-accent transition-colors" />
                                                            )}
                                                            <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                                        </div>

                                                        <div className="flex-1 space-y-2">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] text-muted uppercase tracking-widest font-bold">Logo Position</label>
                                                                <input
                                                                    type="text"
                                                                    className="w-full bg-black/50 border border-border rounded px-2 py-1.5 text-[10px] text-white focus:border-accent outline-none"
                                                                    placeholder="e.g. Left Chest, Back of Jacket"
                                                                    value={directorControls.logoPlacement}
                                                                    onChange={(e) => setDirectorControls(p => ({ ...p, logoPlacement: e.target.value }))}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="text-[9px] text-muted/60 leading-tight">
                                                        Upload a PNG logo (transparent background recommended). Specify exact placement for the weaver.
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-border space-y-2">
                                                <button
                                                    onClick={handleSaveToActors}
                                                    disabled={!finalCharacterUrl}
                                                    className="w-full bg-surface-2 hover:bg-surface-3 text-white py-3 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-border transition-all hover:scale-[1.02]"
                                                >
                                                    <UserPlus className="w-4 h-4 text-emerald-500" /> Save Character
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                            <div className="bg-surface-2/50 p-4 rounded-xl border border-border">
                                                <h4 className="text-[10px] uppercase font-black text-accent tracking-widest mb-3 flex items-center gap-2">
                                                    <Sparkles className="w-3 h-3" /> Designer Studio
                                                </h4>
                                                <textarea
                                                    className="w-full bg-black/50 border border-border rounded-lg p-3 text-xs text-white h-20 resize-none mb-3 focus:outline-none focus:border-accent"
                                                    placeholder="Describe new outfit..."
                                                    value={wardrobePrompt}
                                                    onChange={(e) => setWardrobePrompt(e.target.value)}
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={generateWardrobe}
                                                        disabled={isProcessing}
                                                        className="bg-black border border-yellow-500 text-yellow-500 hover:text-yellow-400 hover:border-yellow-400 hover:-[0_0_20px_rgba(234,179,8,0.6)] py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                                                    >
                                                        {selectedWardrobeItem ? "Fit Selected Item" : "Generate & Fit"}
                                                    </button>
                                                    <button
                                                        onClick={handleSaveToWardrobe}
                                                        disabled={!finalCharacterUrl}
                                                        className="bg-surface-3 hover:bg-surface-2 text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border border-border"
                                                    >
                                                        Save to Library
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center border-b border-border pb-2">
                                                    <h4 className="text-[10px] uppercase font-black text-muted tracking-widest">
                                                        Wardrobe Library ({state.wardrobeItems.length})
                                                    </h4>
                                                    <div className="flex gap-1.5">
                                                        <label className="p-1.5 hover:bg-surface-3 rounded transition-colors text-muted hover:text-white cursor-pointer" title="Upload Costume">
                                                            <Upload className="w-3.5 h-3.5" />
                                                            <input type="file" className="hidden" accept="image/*" onChange={handleUploadCostume} />
                                                        </label>
                                                        <button onClick={scanWardrobe} className="p-1.5 hover:bg-surface-3 rounded transition-colors text-muted hover:text-white" title="Scan Folder">
                                                            <RefreshCcw className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                                                    {state.wardrobeItems.map((item: any) => (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => setSelectedWardrobeItem(item)}
                                                            className={`aspect-square rounded-lg border overflow-hidden transition-all group relative cursor-pointer ${selectedWardrobeItem?.id === item.id ? 'border-2 ' : 'border-border hover:border-gray-600'}`}
                                                            style={selectedWardrobeItem?.id === item.id ? { borderColor: '#eab308', boxShadow: '0 0 20px rgba(234, 179, 8, 0.3)' } : {}}
                                                        >
                                                            <img src={item.url} className="w-full h-full transition-transform group-hover:scale-110 object-cover" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        // @ts-ignore
                                                                        dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                                                                    }}
                                                                    className="bg-blue-500/80 hover:bg-blue-500 text-white p-1.5 rounded-full cursor-pointer"
                                                                    title="Inspect Large"
                                                                >
                                                                    <Maximize className="w-3.5 h-3.5" />
                                                                </button>

                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}
                                                                    className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-full cursor-pointer transition-transform hover:scale-110"
                                                                    title="Delete Costume"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>

                                                            <span className="text-[8px] font-bold text-white uppercase truncate absolute bottom-2 left-2 right-2 text-center ">{item.name}</span>
                                                        </div>
                                                    ))}

                                                    {state.wardrobeItems.length === 0 && (
                                                        <div className="col-span-2 flex flex-col items-center justify-center py-10 opacity-30">
                                                            <Shirt className="w-10 h-10 mb-2" />
                                                            <span className="text-[10px] uppercase font-bold tracking-tighter">Library Empty</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence mode='wait'>
                        {/* PHASE 1: BIOMETRIC SCANNER */}
                        {phase === 1 && (
                            <motion.div
                                key="phase1"
                                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                                className="h-full flex gap-8"
                            >
                                <div className="flex-1 relative bg-black rounded-2xl overflow-hidden border border-border group flex flex-col">
                                    {/* TOGGLE HEADER */}
                                    {/* TOGGLE HEADER */}
                                    <div className="absolute top-4 right-4 z-20 flex items-center gap-4">

                                        {/* Camera Toggle */}
                                        <HelpTooltip zone="nano" id="cameraControl">
                                            <button
                                                onClick={() => setCameraEnabled(!cameraEnabled)}
                                                className={`p-3 rounded-full border transition-all ${cameraEnabled ? 'bg-surface border-accent text-accent -[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-black border-white/20 text-white/50 hover:text-white'}`}
                                                title={cameraEnabled ? "Disable Camera" : "Enable Camera"}
                                            >
                                                {cameraEnabled ? <CameraIcon className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                            </button>
                                        </HelpTooltip>

                                        <div className="flex bg-black/90 backdrop-blur rounded-full border border-border p-2 gap-2 ">
                                            <button
                                                onClick={() => setUploadMode(false)}
                                                className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all border ${!uploadMode ? 'bg-surface border-accent text-accent -[0_0_15px_rgba(250,204,21,0.3)]' : 'border-transparent text-white hover:text-accent hover:bg-white/5'}`}
                                            >
                                                Auto-Scan
                                            </button>
                                            <button
                                                onClick={() => setUploadMode(true)}
                                                className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${uploadMode ? 'bg-surface border-accent text-accent -[0_0_15px_rgba(250,204,21,0.3)]' : 'border-transparent text-white hover:text-accent hover:bg-white/5'}`}
                                            >
                                                <Upload className="w-3 h-3" /> Upload
                                            </button>
                                        </div>
                                    </div>

                                    {!uploadMode ? (
                                        <div className="relative h-full w-full bg-black">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {cameraEnabled ? (
                                                    <Webcam
                                                        ref={webcamRef}
                                                        screenshotFormat="image/jpeg"
                                                        className="h-full w-full object-cover"
                                                        videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center text-muted gap-6 animate-pulse">
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setCameraEnabled(true)}
                                                                className="group relative flex flex-col items-center gap-4"
                                                            >
                                                                <div className="w-24 h-24 rounded-full border-4 border-dashed border-accent/30 flex items-center justify-center group-hover:border-accent group-hover:bg-accent/10 transition-all duration-500">
                                                                    <CameraIcon className="w-10 h-10 text-accent group-hover:scale-110 transition-transform" />
                                                                </div>
                                                                <div className="text-center">
                                                                    <h3 className="text-xl font-black text-white uppercase tracking-widest mb-1"> Initialize Sensors </h3>
                                                                    <p className="text-xs text-accent uppercase tracking-widest font-mono"> Turn On Camera to Begin </p>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* SPOTLIGHT OVERLAY & HUD */}
                                            <div className="absolute inset-0 pointer-events-none">
                                                {/* Darken peripheral area - Radial Gradient approach */}
                                                <div
                                                    className="absolute inset-0 z-10"
                                                    style={{ background: 'radial-gradient(circle at center, transparent 20%, rgba(9,9,11,0.95) 60%)' }}
                                                ></div>

                                                {/* Tints for active states */}
                                                {isScanning && (
                                                    <div className="absolute inset-0 bg-success/5 z-10 animate-pulse"></div>
                                                )}

                                                {/* SCANNING BEAM */}
                                                <div className="absolute inset-0 z-20 opacity-30 overflow-hidden">
                                                    <div className="w-full h-[2px] bg-accent -[0_0_20px_rgba(250,204,21,0.8)] animate-[scan_3s_ease-in-out_infinite]" style={{ top: '50%' }}></div>
                                                </div>

                                                {/* CENTRAL HUD CIRCLE - Increased size to match detection zone */}
                                                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] z-30 flex items-center justify-center transition-all duration-300 pointer-events-none ${isScanning ? 'scale-105' : 'scale-100'}`}>

                                                    {/* Outer Bracket Corners */}
                                                    <div className="absolute inset-0 border-[2px] border-accent/20 rounded-[4rem] scale-110"></div>
                                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent rounded-tl-3xl"></div>
                                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent rounded-tr-3xl"></div>
                                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-accent rounded-bl-3xl"></div>
                                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-accent rounded-br-3xl"></div>

                                                    {/* Rotating Dashed Ring */}
                                                    <div className={`absolute inset-4 border border-accent/20 rounded-full border-dashed animate-[spin_20s_linear_infinite]`}></div>

                                                    {/* Active Status Ring (Blue Static -> Reversed Spin) -- UPDATED: Thicker, Visible, Counter-Rotate */}
                                                    <svg className={`absolute inset-0 w-full h-full opacity-100 ${isScanning ? 'animate-[spin_10s_linear_infinite_reverse]' : 'rotate-45'}`}>
                                                        <circle
                                                            cx="50%" cy="50%" r="48%"
                                                            fill="none" strokeWidth="4"
                                                            stroke="currentColor"
                                                            strokeDasharray="16 16"
                                                            className="text-accent-2"
                                                        />
                                                    </svg>

                                                    {/* Progress Ring (Gold) */}
                                                    <div className="absolute inset-0 rounded-full rotate-[-90deg]">
                                                        <svg className="w-full h-full">
                                                            <circle
                                                                cx="50%" cy="50%" r="48%"
                                                                fill="none" strokeWidth="6"
                                                                stroke="currentColor"
                                                                strokeDasharray="289 289" // 2 * pi * r (approx 48% of 320px container is ~ 150px rad -> wait. SVG scaling. viewbox is implicit. 48% is relative)
                                                                strokeDashoffset={289 - (289 * stabilityProgress / 100)}
                                                                pathLength="289" // Explicit path length for easier calc
                                                                strokeLinecap="round"
                                                                className={`transition-all duration-100 ease-linear -[0_0_10px_rgba(250,204,21,0.8)] ${activeSector ? 'text-accent' : 'text-transparent'}`}
                                                            />
                                                        </svg>
                                                    </div>

                                                    {/* Center Fixation Point */}
                                                    <div
                                                        className={`w-2 h-2 rounded-full transition-all ${isScanning ? 'bg-success scale-150 -[0_0_15px_#22c55e]' : 'bg-accent/50'
                                                            }`}
                                                    ></div>
                                                </div>

                                                {/* STATUS PILLS */}
                                                {activeSector && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="absolute top-[15%] left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur border border-accent/50 px-6 py-2 rounded-full -[0_0_20px_rgba(250,204,21,0.2)]"
                                                    >
                                                        <span className="text-accent font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                                            <Target className="w-4 h-4 animate-spin-slow" />
                                                            LOCKING: {activeSector}
                                                        </span>
                                                    </motion.div>
                                                )}

                                                {/* OUT OF BOUNDS WARNING */}
                                                {!activeSector && !capturedAngles.center && (
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        className="absolute top-[15%] left-1/2 -translate-x-1/2 z-40 bg-danger/90 backdrop-blur border border-danger/50 px-6 py-2 rounded-full -[0_0_20px_rgba(220,38,38,0.4)]"
                                                    >
                                                        <span className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                                            <Scan className="w-4 h-4 animate-pulse" />
                                                            CENTER FACE TO SCAN
                                                        </span>
                                                    </motion.div>
                                                )}

                                                <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                                                    <button
                                                        onClick={() => capturedAngles.center ? activeSector && captureCurrentFrame(activeSector) : captureCurrentFrame('center')}
                                                        className="px-8 py-3 bg-black/90 hover:bg-black border border-accent/50 hover:border-accent text-accent rounded-full -[0_0_20px_rgba(250,204,21,0.2)] hover:-[0_0_30px_rgba(250,204,21,0.6)] text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all group scale-100 hover:scale-110"
                                                    >
                                                        <CameraIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                                        Manual Capture
                                                    </button>
                                                </div>

                                                <div className="absolute bottom-6 left-8 z-30 hidden md:block">
                                                    <div className="flex gap-8 opacity-90 font-mono text-xs text-accent font-bold bg-black/50 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-muted uppercase tracking-wider">Yaw Axis</span>
                                                            <span className="text-lg">{yaw.toFixed(1)}°</span>
                                                        </div>
                                                        <div className="w-[1px] bg-white/20"></div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-muted uppercase tracking-wider">Pitch Axis</span>
                                                            <span className="text-lg">{pitch.toFixed(1)}°</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full w-full p-12 grid grid-cols-3 gap-6 overflow-y-auto">
                                            {(['center', 'left', 'right', 'up', 'down'] as const).map(angle => (
                                                <div key={angle} className="relative aspect-video bg-surface-2 border border-border rounded-xl overflow-hidden group hover:border-accent/50 transition-all">
                                                    {capturedAngles[angle] ? (
                                                        <>
                                                            <img src={capturedAngles[angle]!} className="w-full h-full object-cover opacity-80" />
                                                            <button
                                                                onClick={() => setAngle(angle, null)}
                                                                className="absolute top-2 right-2 bg-black/50 p-2 rounded-full hover:bg-red-500/50 transition-colors"
                                                            >
                                                                <RefreshCw className="w-4 h-4 text-white" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-surface transition-colors">
                                                            <Upload className="w-8 h-8 text-muted mb-2 group-hover:text-accent" />
                                                            <span className="text-xs text-muted font-bold uppercase tracking-widest">{angle} Reference</span>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    if (e.target.files?.[0]) handleFileUpload(angle, e.target.files[0]);
                                                                }}
                                                            />
                                                        </label>
                                                    )}
                                                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-[9px] text-accent uppercase font-bold tracking-widest">
                                                        {angle}
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="col-span-1 flex items-center justify-center p-6 text-center text-muted text-xs font-mono border border-dashed border-border rounded-xl">
                                                Minimum requirements:<br />Center + Left + Right
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="w-80 flex flex-col gap-4">
                                    <h3 className="text-xs font-bold text-accent uppercase tracking-[0.2em] mb-2 border-b border-border pb-2">Biometric Manifest</h3>
                                    {(['center', 'left', 'right', 'up', 'down'] as const).map((label) => (
                                        <div
                                            key={label}
                                            onClick={() => {
                                                if (capturedAngles[label]) setAngle(label, null);
                                            }}
                                            className={`border p-3 rounded-lg flex items-center justify-between group transition-all cursor-pointer hover:bg-surface-2 ${capturedAngles[label] ? 'bg-success/5 border-success/30' : 'bg-surface border-border'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-md flex items-center justify-center relative overflow-hidden bg-black`}>
                                                    {capturedAngles[label] ? (
                                                        <img src={capturedAngles[label]!} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-4 h-4 text-muted" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className={`text-xs font-bold uppercase ${capturedAngles[label] ? 'text-success' : 'text-muted'}`}>{label}</div>
                                                    <div className="text-[9px] text-muted opacity-70">{capturedAngles[label] ? 'ACQUIRED (CLICK TO RETAKE)' : 'PENDING'}</div>
                                                </div>
                                            </div>
                                            {capturedAngles[label] && <CheckCircle2 className="w-4 h-4 text-success" />}
                                        </div>
                                    ))}
                                    <div className="mt-auto flex flex-col gap-2">
                                        <button
                                            disabled={!capturedAngles.center || !capturedAngles.left || !capturedAngles.right}
                                            onClick={generateLocalBiometricSheet}
                                            className="w-full py-4 bg-surface-2 hover:bg-surface-3 text-white border border-border text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Scan className="w-4 h-4" /> FAST BIOMETRIC SHEET
                                        </button>
                                        
                                        <button
                                            disabled={!capturedAngles.center || !capturedAngles.left || !capturedAngles.right || isProcessing}
                                            onClick={handleGeneratePremiumBiometricSheet}
                                            className="w-full py-4 bg-[#1a1a24] hover:bg-[#252538] text-indigo-400 border border-indigo-500/30 hover:border-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Uses 1 API Credit"
                                        >
                                            <Cpu className="w-4 h-4" /> PREMIUM FORENSIC BOARD
                                        </button>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={resetScan}
                                                className="flex-1 py-4 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 font-black uppercase tracking-widest transition-all text-[10px] rounded-lg flex items-center justify-center gap-2"
                                            >
                                                <RotateCcw className="w-3 h-3" /> RETAKE
                                            </button>
                                            <button
                                                disabled={isPhaseLocked(2)}
                                                onClick={() => setPhase(2)}
                                                className={`flex-[2] py-4 font-black uppercase tracking-widest transition-all text-xs rounded-lg flex items-center justify-center gap-2 ${isPhaseLocked(2)
                                                    ? 'bg-surface-2 text-muted cursor-not-allowed'
                                                    : 'bg-accent hover:bg-cyan-400 text-blue-900 shadow-[0_0_15px_rgba(34,211,238,0.4)]'
                                                    }`}
                                            >
                                                Proceed <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 2: BODY ARCHETYPES */}
                        {phase === 2 && (
                            <motion.div
                                key="phase2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="h-full flex flex-col items-center justify-center p-12"
                            >
                                <div className="text-center mb-12">
                                    <h2 className="text-4xl font-black text-fg uppercase tracking-tighter mb-4 flex justify-center items-center gap-4">
                                        <Layers className="w-8 h-8 text-accent animate-bounce" />
                                        Morphological Matrix
                                    </h2>
                                    <p className="text-muted uppercase tracking-widest text-sm max-w-2xl mx-auto">
                                        Select physical substrate for neural projection mapping.
                                    </p>

                                    {/* VARIANT SELECTOR */}
                                    <div className="flex justify-center gap-4 mt-8">
                                        {[
                                            { id: 'masc', label: 'Masculine' },
                                            { id: 'fem', label: 'Feminine' },
                                            { id: 'youth_masc', label: 'Youth (Boy)' },
                                            { id: 'youth_fem', label: 'Youth (Girl)' }
                                        ].map((v) => (
                                            <button
                                                key={v.id}
                                                onClick={() => setMorphVariant(v.id as any)}
                                                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${morphVariant === v.id
                                                    ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500 -[0_0_20px_rgba(234,179,8,0.4)] scale-105'
                                                    : 'bg-surface border border-border text-muted hover:text-white hover:border-accent/50'
                                                    }`}
                                            >
                                                {v.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
                                    {bodyArchetypes.map((type) => {
                                        const Icon = type.icon;
                                        // Scope cover by variant so 'titan' (masc) is different from 'titan' (fem)
                                        const storageKey = `${morphVariant}_${type.id}`;
                                        const customCover = customArchetypeCovers[storageKey];

                                        return (
                                            <div key={type.id} className="relative group h-96 w-full rounded-2xl overflow-hidden border border-white/10 transition-all hover:scale-[1.02] hover:border-white/30 cursor-pointer" onClick={() => setSelectedBody(type.id)}>
                                                {/* Hidden File Input for Editing */}
                                                <input
                                                    type="file"
                                                    id={`upload-${type.id}`}
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) handleArchetypeCoverUpload(storageKey, file);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()} // Prevent card selection
                                                />

                                                {/* Edit Button (Top Right) */}
                                                <div className="absolute top-3 right-3 z-30 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                    {/* Reset Button (Only if custom cover exists) */}
                                                    {customCover && (
                                                        <button
                                                            className="p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full border border-white/10 "
                                                            onClick={(e) => handleArchetypeCoverDelete(storageKey, e)}
                                                            title="Reset to Default"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}

                                                    {/* Upload Button */}
                                                    <label
                                                        htmlFor={`upload-${type.id}`}
                                                        className="p-2 bg-black/60 hover:bg-black/90 text-white/50 hover:text-white rounded-full border border-white/10 hover:border-white/30 cursor-pointer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Change Cover Image"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </label>
                                                </div>

                                                {/* Background Image */}
                                                {(customCover || (type as any).defaultImage) ? (
                                                    <img src={customCover || (type as any).defaultImage} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                ) : (
                                                    <div className={`absolute inset-0 bg-gradient-to-br transition-all duration-300 ${selectedBody === type.id ? 'from-gray-800 to-black' : 'from-gray-900 to-black'}`}>
                                                        {/* Fallback pattern if no image */}
                                                        <div className="absolute inset-0 opacity-10"
                                                            style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Selection Border Overlay */}
                                                {selectedBody === type.id && (
                                                    <div className="absolute inset-0 border-2 border-accent z-20 pointer-events-none rounded-2xl -[inset_0_0_30px_rgba(250,204,21,0.2)]"></div>
                                                )}

                                                {/* Cinematic Filter Overlay */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent z-10 flex flex-col justify-end px-6 pb-6">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {/* Small Icon next to title */}
                                                            <Icon className={`w-4 h-4 ${selectedBody === type.id ? 'text-accent' : 'text-white/70'}`} />
                                                            <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">{type.id} CLASS</span>
                                                        </div>
                                                        <h3 className={`text-2xl font-black italic tracking-tighter uppercase transition-colors leading-none ${selectedBody === type.id ? 'text-yellow-500' : 'text-white group-hover:text-yellow-500'}`}>
                                                            {type.name}
                                                        </h3>
                                                        <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                                                            {type.desc}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-16 flex justify-between w-full max-w-6xl">
                                    <button onClick={() => setPhase(1)} className="text-muted hover:text-fg text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                        &larr; Return to Scan
                                    </button>
                                    <button
                                        disabled={!selectedBody}
                                        onClick={() => setPhase(3)}
                                        className={`px-12 py-4 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${selectedBody
                                            ? 'bg-accent text-blue-700 hover:scale-105 -[0_0_20px_rgba(250,204,21,0.4)]'
                                            : 'bg-surface-2 text-muted cursor-not-allowed'
                                            }`}
                                    >
                                        Initialize Style Synthesis &rarr;
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 3: STYLE SELECTION */}
                        {phase === 3 && (
                            <motion.div
                                key="phase3"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="h-full flex flex-col items-center justify-center p-12"
                            >
                                <div className="text-center mb-12">
                                    <h2 className="text-4xl font-black text-fg uppercase tracking-tighter mb-4 flex justify-center items-center gap-4">
                                        <Aperture className="w-8 h-8 text-accent animate-spin-slow" />
                                        Style Synthesis Engine
                                    </h2>
                                    <p className="text-muted uppercase tracking-widest text-sm max-w-2xl mx-auto">
                                        Select rendering protocol for universe instantiation.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
                                    {Object.values(styleMatrix).map((style) => {
                                        const normalizedId = normalizeStyleId(style.id);
                                        const isSelected = selectedStyle === normalizedId;

                                        return (
                                            <div
                                                key={style.id}
                                                onClick={() => {
                                                    const normalizedId = normalizeStyleId(style.id);
                                                    setSelectedStyle(normalizedId);

                                                    // Immediately set default scope to prevent null-state flicker/jump
                                                    const rules = STYLE_SCOPE_RULES[normalizedId] || STYLE_SCOPE_RULES.default;
                                                    setBodyScope(rules.default);

                                                    // AUTO-SETTINGS for Exact Likeness
                                                    if (normalizedId === 'exact_studio') {
                                                        setDirectorControls(prev => ({
                                                            ...prev,
                                                            identityStrength: 100,
                                                            stylization: 0
                                                        }));
                                                        showToast("Exact Likeness: Auto-locked Identity to 100%");
                                                    }
                                                }}
                                                className={`group relative h-56 border rounded-xl transition-all duration-300 overflow-hidden flex flex-col justify-end cursor-pointer ${isSelected
                                                    ? 'bg-surface border-blue-500 -[0_0_20px_rgba(59,130,246,0.3)] scale-[1.02] z-10'
                                                    : 'bg-surface border-border hover:border-accent hover: hover:scale-[1.01]'
                                                    }`}
                                            >
                                                {/* Background Image */}
                                                <img
                                                    src={style.image}
                                                    className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`}
                                                />

                                                {/* Selection Border Overlay */}
                                                {isSelected && (
                                                    <div className="absolute inset-0 border-2 border-blue-500 z-20 pointer-events-none rounded-xl -[inset_0_0_30px_rgba(59,130,246,0.2)]"></div>
                                                )}

                                                {/* Cinematic Filter Overlay */}
                                                <div className={`absolute inset-0 z-10 flex flex-col justify-end px-6 pb-2.5 transition-all duration-300 ${isSelected
                                                    ? 'bg-gradient-to-t from-black/90 via-black/20 to-transparent'
                                                    : 'bg-gradient-to-t from-black/90 via-black/30 to-transparent group-hover:via-black/20'
                                                    }`}>
                                                    <div className="transform transition-transform duration-300 group-hover:-translate-y-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Target className={`w-3 h-3 ${isSelected ? 'text-blue-400' : 'text-white/70'}`} />
                                                            <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">PROTOCOL</span>
                                                        </div>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <h3 className={`text-lg font-black italic tracking-tighter uppercase transition-colors leading-none ${isSelected ? 'text-blue-400' : 'text-white group-hover:text-blue-400'}`}>
                                                                {style.label}
                                                            </h3>
                                                        </div>
                                                        <p className={`text-[10px] font-medium leading-tight line-clamp-2 mb-2 ${isSelected ? 'text-blue-100/80' : 'text-gray-300/80'}`}>
                                                            {style.keywords.split(',').slice(0, 4).join(', ')}...
                                                        </p>

                                                        {/* Tech Specs Micro-UI */}
                                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[7px] font-mono text-white/70 border border-white/10 uppercase tracking-wider">
                                                                8K RES
                                                            </div>
                                                            <div className="px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[7px] font-mono text-white/70 border border-white/10 uppercase tracking-wider">
                                                                AUTO-LIGHT
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-6 w-full max-w-5xl flex justify-center min-h-[140px]">
                                    <AnimatePresence mode="wait">
                                        {selectedStyle && (
                                            <motion.div
                                                key="body-scope"
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                                className="flex flex-col items-center gap-6"
                                            >
                                                <BodyScopeSelector
                                                    value={bodyScope}
                                                    onChange={setBodyScope}
                                                    allowedScopes={STYLE_SCOPE_RULES[selectedStyle]?.allowed ?? STYLE_SCOPE_RULES.default.allowed}
                                                    defaultScope={STYLE_SCOPE_RULES[selectedStyle]?.default ?? STYLE_SCOPE_RULES.default.default}
                                                />
                                                <div className={`h-6 text-[9px] text-muted flex items-center gap-2 transition-all duration-300 ${bodyScope ? 'opacity-100' : 'opacity-0'}`}>
                                                    {bodyScope ? (
                                                        <>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${SCOPE_COST[bodyScope].gpu === 'low' ? 'bg-emerald-500' : SCOPE_COST[bodyScope].gpu === 'medium' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                                                            <span className="uppercase tracking-widest">{SCOPE_COST[bodyScope].gpu} COMPUTE: {SCOPE_COST[bodyScope].note}</span>
                                                        </>
                                                    ) : (
                                                        <span className="uppercase tracking-widest text-transparent">Computing...</span>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <div className="mt-16 flex justify-between w-full max-w-5xl">
                                    <button onClick={() => setPhase(2)} className="text-muted hover:text-fg text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                        &larr; Return to Body
                                    </button>
                                    <div className="flex flex-col items-end gap-2">
                                        <button
                                            disabled={!selectedStyle || !bodyScope}
                                            onClick={handleOrchestration}
                                            className={`px-12 py-4 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${selectedStyle && bodyScope
                                                ? 'bg-gradient-to-r from-accent to-blue-600 text-white hover: -accent/20'
                                                : 'bg-surface-2 text-muted cursor-not-allowed'
                                                }`}
                                        >
                                            Initialize Neural Link &rarr;
                                        </button>
                                        {selectedStyle && !bodyScope && (
                                            <div className="text-[9px] text-danger uppercase tracking-widest font-bold animate-pulse">
                                                Select Body Scope to Continue
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 4: NANO NEURAL LINK (Processing) */}
                        {(phase === 4 || isProcessing) && (
                            <motion.div
                                key="phase4"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="h-full flex flex-col items-center justify-center p-8 relative"
                            >
                                <div className="w-full max-w-2xl bg-surface border border-border p-1 rounded-xl relative overflow-hidden ">
                                    <div className="h-1 bg-surface-2 w-full mb-1 relative overflow-hidden">
                                        <motion.div
                                            className="h-full bg-blue-500 relative"
                                            initial={{ width: "0%" }}
                                            animate={{ width: `${progress.percent}%` }}
                                            transition={{ duration: 0.5, ease: "easeInOut" }}
                                        >
                                            <div className="absolute inset-0 bg-yellow-400/30 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(250, 204, 21, 0.5), transparent)' }}></div>
                                        </motion.div>
                                        {/* Indeterminate loader backing when stalled */}
                                        <div className="absolute inset-0 w-full h-full bg-accent/20 animate-pulse z-0 mix-blend-overlay"></div>
                                    </div>
                                    <div className="flex justify-between items-center px-2 pt-1 pb-2">
                                        <span className="text-[10px] uppercase font-bold text-muted/70 flex items-center gap-1">
                                            <Cpu className="w-3 h-3" /> Core: {state.imageResolution} Matrix
                                        </span>
                                        <span className="text-xs font-black text-accent">{Math.round(progress.percent)}%</span>
                                    </div>
                                    <div className="h-96 bg-bg p-6 font-mono text-xs overflow-hidden flex flex-col-reverse rounded-b-lg border-t border-border">
                                        {generationLogs.map((log, i) => (
                                            <div key={i} className="mb-1 text-muted border-l-2 border-border pl-2">
                                                <span className="text-accent mr-2">{'>'}</span>{log}
                                            </div>
                                        ))}
                                    </div>

                                </div>
                                <div className="mt-6 w-full max-w-2xl px-4 flex flex-col items-center gap-6">
                                    <div className="text-accent animate-pulse font-black tracking-widest text-sm uppercase flex items-center gap-2 justify-center">
                                        <Cpu className="w-4 h-4 animate-spin" />
                                        {progress.detail || "Nano Neural Engine Active..."}
                                    </div>

                                    {/* Resolution Time Warning */}
                                    <div className="w-full flex justify-center">
                                        {state.imageResolution === '4K' && (
                                            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 max-w-sm">
                                                <span className="text-[10px] font-bold text-yellow-500 uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Notice: 4K Ultra HD Selected</span>
                                                <span className="text-[10px] text-gray-400 mt-1">Generation can take up to 90 seconds. Please do not close this window.</span>
                                            </div>
                                        )}
                                        {state.imageResolution === '2K' && (
                                            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-sm">
                                                <span className="text-[10px] font-bold text-blue-400 uppercase">Notice: 2K High Quality Selected</span>
                                                <span className="text-[10px] text-gray-400 mt-1">Generation takes approximately 45 seconds.</span>
                                            </div>
                                        )}
                                        {state.imageResolution === '1K' && (
                                            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20 max-w-sm">
                                                <span className="text-[10px] font-bold text-green-400 uppercase">Notice: 1K Active</span>
                                                <span className="text-[10px] text-gray-400 mt-1">Fastest generation speed. ETA ~15 seconds.</span>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={cancelGeneration}
                                        className="px-6 py-2 rounded-full border border-danger/30 text-danger hover:bg-danger/10 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 mt-2"
                                    >
                                        <Ban className="w-4 h-4" /> Abort Sequence
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 5: DIGITAL RECONSTRUCTION (RESULT) */}
                        {phase === 5 && finalCharacterUrl && (
                            <motion.div
                                key="phase5"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="h-full flex gap-8 items-center justify-center p-12"
                            >
                                <div className="h-full aspect-[2/3] relative rounded-xl overflow-hidden border-2 border-accent group">
                                    <img src={finalCharacterUrl} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80"></div>

                                    {/* ID CARD */}
                                    <div className="absolute bottom-6 left-6 right-6 font-mono text-xs">
                                        <div className="flex justify-between items-end border-b border-white/20 pb-2 mb-2">
                                            <div>
                                                <div className="text-accent uppercase tracking-widest text-[9px]">Subject ID</div>
                                                <div className="text-xl font-black text-white">{state.lastCastedPrompt ? state.lastCastedPrompt.substring(0, 8).toUpperCase() : 'UNK-001'}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-accent uppercase tracking-widest text-[9px]">Class</div>
                                                <div className="text-white font-bold">{selectedBody?.toUpperCase()}</div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-[9px] uppercase tracking-widest text-white/50">
                                            <span>Sim-Date: {new Date().toLocaleDateString()}</span>
                                            <span>Nano-Banana Pro</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="w-96 flex flex-col gap-4 h-full overflow-y-scroll px-4 pb-24">
                                    <h3 className="text-2xl font-black text-fg uppercase italic tracking-tighter">
                                        Reconstruction <span className="text-accent">Complete</span>
                                    </h3>
                                    <p className="text-xs text-muted mb-8 leading-relaxed">
                                        Neural synthesis successful. Subject has been re-topologized and is ready for integration into the storyboard matrix.
                                        {generatePackMode && " Full variation pack generated."}
                                    </p>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => addToCast(false)}
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-accent font-black uppercase tracking-widest text-xs rounded-xl transition-all -accent/10 border border-accent flex flex-col items-center gap-1 group-hover:scale-[1.02]"
                                        >
                                            <UserPlus className="w-5 h-5" />
                                            {generatePackMode ? "Add Pack" : "Add Actor"}
                                        </button>

                                        <button
                                            onClick={() => handleOpenSaveModal('actor')}
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-purple-400 font-black uppercase tracking-widest text-xs rounded-xl transition-all border border-purple-500/30 hover:border-purple-500 flex flex-col items-center gap-1"
                                        >
                                            <FolderPlus className="w-5 h-5" />
                                            Save Library
                                        </button>

                                        <button
                                            // Call distinct handler to ensure state preservation
                                            onClick={handleRegenerate}
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-fg font-bold uppercase tracking-widest text-xs rounded-xl transition-all border border-border hover:border-accent flex flex-col items-center gap-1"
                                        >
                                            <RotateCcw className="w-5 h-5 text-accent-2" />
                                            Regenerate
                                        </button>

                                        <button
                                            onClick={downloadPoster}
                                            className="col-span-1 py-3 bg-bg border border-border text-muted hover:text-fg hover:border-accent text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <Share2 className="w-3 h-3" /> Save Poster
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowSettings(true);
                                                setSidebarMode('wardrobe');
                                            }}
                                            className="col-span-1 py-3 bg-bg border border-border text-muted hover:text-accent hover:border-accent/30 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <Layers className="w-3 h-3" /> Wardrobe V2
                                        </button>

                                        {/* Reference Sheet Section */}
                                        <div className="col-span-2 pt-2 border-t border-border mt-2 space-y-3">
                                            <div className="flex gap-2">
                                                {[
                                                    { id: 'form_focus', label: 'Body Focus' },
                                                    { id: 'face_focus', label: 'Expressions' },
                                                    { id: 'split_focus', label: 'Hybrid' }
                                                ].map((l) => (
                                                    <button
                                                        key={l.id}
                                                        onClick={() => setRefLayout(l.id as any)}
                                                        className={`flex-1 py-2 rounded text-[9px] font-bold uppercase transition-all border ${refLayout === l.id
                                                            ? 'bg-accent/20 border-accent text-accent -[0_0_10px_rgba(250,204,21,0.2)]'
                                                            : 'bg-surface-2 border-border text-muted hover:border-white/50'
                                                            }`}
                                                    >
                                                        {l.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Style Preset */}
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-muted uppercase tracking-widest pl-1">Style Preset</label>
                                                <div className="relative">
                                                    <select
                                                        value={refStyle}
                                                        onChange={(e) => setRefStyle(e.target.value as any)}
                                                        className="w-full appearance-none bg-bg border border-border rounded-xl px-3 py-2 text-[10px] font-bold uppercase text-white outline-none focus:border-accent transition-colors cursor-pointer"
                                                    >
                                                        {Object.values(REF_SHEET_STYLES).map((s) => (
                                                            <option key={s.id} value={s.id}>{s.label}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
                                                </div>
                                            </div>

                                            {/* Advanced (Identity + Scope + Body Sliders) */}
                                            <details className="group rounded-xl border border-border bg-surface-2/40 p-3">
                                                <summary className="list-none flex items-center justify-between cursor-pointer text-[9px] font-bold text-muted uppercase tracking-widest">
                                                    <span>Advanced</span>
                                                    <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="pt-3 space-y-4">
                                                    {/* Identity Source */}
                                                    <div className="space-y-1">
                                                        <label className="text-[8px] text-muted/70 uppercase tracking-widest font-bold">Identity Source</label>
                                                        <div className="flex bg-bg rounded-lg p-1 border border-border">
                                                            <button
                                                                onClick={() => setIdentitySource('hybrid')}
                                                                className={`flex-1 py-1 px-0.5 rounded text-[7px] font-bold uppercase tracking-tighter truncate transition-all ${identitySource === 'hybrid'
                                                                    ? 'bg-accent/15 text-accent border border-accent/30'
                                                                    : 'text-muted hover:text-white'
                                                                    }`}
                                                            >
                                                                Hybrid
                                                            </button>
                                                            <button
                                                                onClick={() => setIdentitySource('biometric')}
                                                                className={`flex-1 py-1 px-0.5 rounded text-[7px] font-bold uppercase tracking-tighter truncate transition-all ${identitySource === 'biometric'
                                                                    ? 'bg-accent/15 text-accent border border-accent/30'
                                                                    : 'text-muted hover:text-white'
                                                                    }`}
                                                            >
                                                                Biometric
                                                            </button>
                                                            <button
                                                                onClick={() => setIdentitySource('generated')}
                                                                className={`flex-1 py-1 px-0.5 rounded text-[7px] font-bold uppercase tracking-tighter truncate transition-all ${identitySource === 'generated'
                                                                    ? 'bg-accent/15 text-accent border border-accent/30'
                                                                    : 'text-muted hover:text-white'
                                                                    }`}
                                                            >
                                                                Portrait
                                                            </button>
                                                        </div>
                                                        <div className="text-[9px] text-muted/70 normal-case">
                                                            Hybrid blends your scan with the portrait style. Biometric forces strict raw likeness. Portrait uses only text prompting.
                                                        </div>
                                                    </div>



                                                    {/* Weight */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[8px] text-muted/70 uppercase tracking-widest font-bold">Weight</label>
                                                            <div className="flex items-center gap-2">
                                                                {identitySource === 'biometric' && weightLbs === 275 && (
                                                                    <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider">(MAX SAFE LIMIT)</span>
                                                                )}
                                                                <span className="text-[10px] font-bold text-white">{localWeight} lb</span>
                                                            </div>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={90}
                                                            max={identitySource === 'biometric' ? 275 : 300}
                                                            step={5}
                                                            value={localWeight > (identitySource === 'biometric' ? 275 : 300) ? (identitySource === 'biometric' ? 275 : 300) : localWeight}
                                                            onChange={(e) => setLocalWeight(parseInt(e.target.value, 10))}
                                                            onPointerUp={() => setWeightLbs(localWeight)}
                                                            className="w-full accent-accent h-2 rounded-full appearance-none cursor-pointer bg-bg"
                                                        />
                                                    </div>

                                                    {/* Height */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[8px] text-muted/70 uppercase tracking-widest font-bold">Height</label>
                                                            <span className="text-[10px] font-bold text-white">{formatHeight(heightIn)}</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={36}
                                                            max={108}
                                                            value={heightIn}
                                                            onChange={(e) => setHeightIn(parseInt(e.target.value, 10))}
                                                            className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-bg"
                                                        />
                                                    </div>
                                                </div>
                                            </details>

                                            <div className="relative group w-full">
                                                <button
                                                    onClick={handleGenerateRefSheet}
                                                    disabled={isProcessing || (identitySource === 'biometric' && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) || (identitySource === 'generated' && !finalCharacterUrl)}
                                                    className={`w-full py-3 bg-bg border border-border text-muted hover:text-accent hover:border-accent text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${(identitySource === 'biometric' && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) || (identitySource === 'generated' && !finalCharacterUrl)
                                                        ? 'opacity-60 cursor-not-allowed'
                                                        : ''
                                                        }`}
                                                >
                                                    <LayoutTemplate className="w-3 h-3" />
                                                    Generate Reference Sheet
                                                </button>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 normal-case text-left">
                                                    <strong className="text-white block mb-1">Production Note:</strong>
                                                    High-Fidelity AI Synthesis: Identity & layout are strictly enforced, but minor variations may occur. Always review for production use.
                                                </div>
                                            </div>

                                            {identitySource === 'biometric' && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right) && (
                                                <div className="text-center text-[9px] text-danger font-bold uppercase tracking-widest bg-danger/10 py-1 rounded">
                                                    Requires Center + Left + Right Scans
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-8 border-t border-border pt-4">
                                        <button
                                            onClick={resetScan}
                                            className="w-full py-3 text-muted hover:text-danger text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            Initialize New Subject
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* REFERENCE SHEET MODAL */}
                        {showRefSheet && refSheetUrl && (
                            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                                <div className="relative w-full max-w-7xl h-full max-h-[90vh] flex flex-col bg-[#0a0a0c] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
                                    <div className="flex justify-between items-center w-full px-4 py-3 border-b border-white/10 bg-[#121216] flex-shrink-0">
                                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                            <LayoutTemplate className="w-4 h-4 text-accent" /> Character Reference Sheet
                                        </h3>
                                    </div>

                                    <div className="flex-1 w-full min-h-0 overflow-auto flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat bg-[length:50px] p-2 custom-scrollbar">
                                        <img src={refSheetUrl} className="max-w-full h-auto object-contain rounded shadow-lg" />
                                    </div>

                                    <div className="w-full p-3 border-t border-white/10 bg-[#18181b] flex-shrink-0 sticky bottom-0 flex justify-end gap-3 z-10">
                                        <button
                                            onClick={() => {
                                                const newMember = {
                                                    id: `nano_ref_${Date.now()}`,
                                                    url: refSheetUrl,
                                                    name: `Ref_Sheet_${new Date().toLocaleTimeString()}`,
                                                    tag: 'front' as const,
                                                    profile: {
                                                        identity: "Reference Sheet",
                                                        wardrobe: "N/A",
                                                        accessories: "N/A",
                                                        style: "Technical"
                                                    }
                                                };
                                                // @ts-ignore
                                                dispatch({ type: 'ADD_CAST', payload: newMember });
                                                showToast("Added to Cast Assets");
                                            }}
                                            className="bg-surface hover:bg-surface-2 text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-white/10 flex items-center gap-2"
                                        >
                                            <UserPlus className="w-4 h-4" /> Cast
                                        </button>
                                        <button
                                            onClick={() => {
                                                const a = document.createElement('a');
                                                a.href = refSheetUrl;
                                                a.download = `RefSheet-${Date.now()}.png`;
                                                a.click();
                                                showToast("Download Started");
                                            }}
                                            className="bg-surface hover:bg-surface-2 text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-white/10 flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" /> Download
                                        </button>
                                        <button
                                            onClick={() => handleOpenSaveModal('ref_sheet')}
                                            className="bg-accent hover:bg-white text-green-900 px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all flex items-center gap-2"
                                        >
                                            <Share2 className="w-4 h-4" /> Save
                                        </button>
                                        <button
                                            onClick={() => { setShowRefSheet(false); setRefSheetUrl(null); }}
                                            className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-red-500/20 flex items-center gap-2"
                                        >
                                            <X className="w-4 h-4" /> Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* LOCAL BIOMETRIC SHEET MODAL */}
                        {localBiometricSheetUrl && (
                            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                                <div className="relative w-full max-w-7xl h-full max-h-[90vh] flex flex-col bg-[#0a0a0c] rounded-xl border border-indigo-500/30 overflow-hidden shadow-[0_0_50px_rgba(79,70,229,0.15)]">
                                    <div className="flex justify-between items-center w-full px-4 py-3 border-b border-indigo-500/20 bg-[#121216] flex-shrink-0">
                                        <h3 className="text-sm font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                            <Cpu className="w-4 h-4" /> FAST BIOMETRIC BOARD
                                        </h3>
                                    </div>
                                    
                                    <div className="flex-1 w-full min-h-0 overflow-auto flex items-center justify-center p-2 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat bg-[length:50px]">
                                        <img src={localBiometricSheetUrl} className="max-w-full h-auto object-contain rounded drop-shadow-[0_0_20px_rgba(79,70,229,0.2)]" />
                                    </div>

                                    <div className="w-full p-3 border-t border-indigo-500/20 bg-[#121216] flex-shrink-0 sticky bottom-0 flex justify-end gap-3 z-10">
                                        <button
                                            onClick={() => {
                                                const a = document.createElement('a');
                                                a.href = localBiometricSheetUrl;
                                                a.download = `FastBiometric-${Date.now()}.png`;
                                                a.click();
                                                showToast("Download Started");
                                            }}
                                            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-indigo-500/30 flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" /> Save to Drive
                                        </button>
                                        <button
                                            onClick={() => setLocalBiometricSheetUrl(null)}
                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-red-500/20 flex items-center gap-2"
                                        >
                                            <X className="w-4 h-4" /> Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </AnimatePresence>

                    {/* SAVE TO LIBRARY MODAL (Refactored) */}
                    <ActorSaveModal
                        isOpen={showSaveModal}
                        initialName={newActorName}
                        onClose={() => setShowSaveModal(false)}
                        onSave={(name, category) => {
                            setNewActorName(name);
                            setSaveCategory(category);
                            confirmSaveToLibrary(name, category);
                        }}
                    />

                    <ConfirmDialog
                        isOpen={!!confirmDelete}
                        onClose={() => setConfirmDelete(null)}
                        onConfirm={executeDelete}
                        title="Delete Costume?"
                        message={confirmDelete ? `Are you sure you want to delete ${confirmDelete.name}? This action cannot be undone.` : ""}
                        confirmText="Delete"
                        cancelText="Cancel"
                        variant="danger"
                    />

                    <ConfirmDialog
                        isOpen={!!showCoverDeleteConfirm}
                        onClose={() => setShowCoverDeleteConfirm(null)}
                        onConfirm={confirmCoverDelete}
                        title="Remove Custom Cover?"
                        message="This will delete the uploaded image and revert this archetype to its original default look. This action cannot be undone."
                        confirmText="Remove Cover"
                        cancelText="Keep Custom"
                        variant="danger"
                    />

                    {/* TOAST OVERLAY */}
                    <AnimatePresence>
                        {notification && (
                            <motion.div
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-surface border border-accent/50 text-fg px-6 py-3 rounded-full backdrop-blur-xl z-[5000] flex items-center gap-3"
                            >
                                <CheckCircle2 className="w-5 h-5 text-accent" />
                                <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
};

export default NanoCastingDirector;



