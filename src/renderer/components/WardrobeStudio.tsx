
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, RefreshCcw, Maximize, Shirt, Sparkles, Download,
    UserPlus, X, Eraser, Trash2, Undo2, Redo2, CheckCircle2, FolderPlus, Zap, HelpCircle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import type { WardrobeItem, CastMember, WardrobeState } from '../context/AppContext';
import { nativeJoinPath, nativeListFiles, nativeWriteFile, safeFetchBlob } from '../utils/NativeFileAssets';
import { removeBackground } from "@imgly/background-removal";
import { CutoutService } from "../services/CutoutService";
// Style Imports for Save Modal
import styleRealism from '../assets/cover-realism.png';
import styleAnimation from '../assets/cover-anim.png';
import styleIllustration from '../assets/cover-illustration.png';
import styleScifi from '../assets/cover-scifi.png';
import ActorSaveModal from './ActorSaveModal';
import HelpTooltip from './ui/HelpTooltip';
import InlineHint from './ui/InlineHint';
import ConfirmDialog from './ui/ConfirmDialog';
import { LibraryAssetMaterializer } from '../services/LibraryAssetMaterializer';

async function materializeDisplayUrl(url: string | null | undefined): Promise<string> {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;

    if (/^https?:\/\//i.test(url)) {
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) throw new Error(`Failed to fetch remote display asset: ${res.status}`);
            const fetchedBlob = await res.blob();
            
            // True Base64 Pivot instead of transient blob
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(fetchedBlob);
            });
        } catch (e) {
            console.warn(`Failed to materialize remote display asset to base64:`, e);
            return url;
        }
    }

    return url;
}

const WardrobeLibrarySkeletonCard = () => (
    <div className="aspect-square rounded-lg border border-gray-800 overflow-hidden bg-black/40 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.8s_linear_infinite]" />
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
        </div>
        <div className="absolute bottom-2 left-2 right-2 h-3 rounded bg-white/5" />
    </div>
);

// --- WARDROBE STUDIO COMPONENT ---
const WardrobeStudio = () => {
    const [libraryLoading, setLibraryLoading] = useState(false);
    const { state, dispatch } = useAppContext();
    const [activeTab, setActiveTab] = useState<'designer' | 'library'>('designer');
    // GLOBAL STATE MAPPING
    const {
        fittedImage, tryOnMask, restorationLayer, removeBg: removeTryOnBg,
        fringeSize, brushSize, history, historyIndex, isBrushActive: globalIsBrushActive,
        tryOnNote, processedTryOnUrl, brandingLogo, logoPosition,
        tryOnOutputMode, tryOnViews, tryOnSheetFB, tryOnSheetLR, activeTryOnView
    } = state.wardrobeState;

    // Local Helper to update global state
    const updateState = (updates: Partial<WardrobeState>) => {
        dispatch({ type: 'SET_WARDROBE_STATE', payload: updates });
    };

    // Alias for setters (to minimize code churn)
    const setFittedImage = (val: string | null) => updateState({ fittedImage: val });
    const setTryOnMask = (val: string | null) => updateState({ tryOnMask: val });
    const setRestorationLayer = (val: string | null) => updateState({ restorationLayer: val });
    const setRemoveTryOnBg = (val: boolean) => updateState({ removeBg: val });
    const setFringeSize = (val: number) => updateState({ fringeSize: val });
    const setBrushSize = (val: number) => updateState({ brushSize: val });
    const setHistory = (val: string[]) => updateState({ history: val });
    const setHistoryIndex = (val: number) => updateState({ historyIndex: val });
    const setIsBrushActive = (val: boolean) => updateState({ isBrushActive: val });
    const setTryOnNote = (val: string) => updateState({ tryOnNote: val });
    const setProcessedTryOnUrl = (val: string | null) => updateState({ processedTryOnUrl: val });
    const setBrandingLogo = (val: string | null) => updateState({ brandingLogo: val });
    const setLogoPosition = (val: string) => updateState({ logoPosition: val });
    const setTryOnOutputMode = (val: 'front' | 'turnaround') => updateState({ tryOnOutputMode: val });
    const setTryOnViews = (val: Record<'front' | 'back' | 'left' | 'right', string> | null) => updateState({ tryOnViews: val });
    const setTryOnSheetFB = (val: string | null) => updateState({ tryOnSheetFB: val });
    const setTryOnSheetLR = (val: string | null) => updateState({ tryOnSheetLR: val });
    const setActiveTryOnView = (val: 'front' | 'back' | 'left' | 'right' | 'sheetFB' | 'sheetLR') => updateState({ activeTryOnView: val });

    // Use global isBrushActive
    const isBrushActive = globalIsBrushActive;

    // Local Transient State
    const [designerPrompt, setDesignerPrompt] = useState("");
    const [designerImage, setDesignerImage] = useState<string | null>(null);
    const [designerMask, setDesignerMask] = useState<string | null>(null);
    const [selectedCostume, setSelectedCostume] = useState<WardrobeItem | null>(null);
    const [selectedCharacter, setSelectedCharacter] = useState<CastMember | null>(null);

    // --- TRY-ON OUTPUT & TURNAROUND (2-SHEET MODE) ---
    type TryOnView = 'front' | 'back' | 'left' | 'right';
    type TryOnDisplay = TryOnView | 'sheetFB' | 'sheetLR';

    // State migrated to global context (AppContext)

    // Character Sheet reference (identity anchor for turnarounds)
    const [tryOnCharacterSheet, setTryOnCharacterSheet] = useState<string | null>(null);

    // --- COSTUME DESIGNER: REFERENCE INPUT (SESSION ONLY) ---
    type DesignerRefKind = 'sketch' | 'costume';
    const [designerRefKind, setDesignerRefKind] = useState<DesignerRefKind>('sketch');
    const [designerRefImage, setDesignerRefImage] = useState<string | null>(null);
    const [designerRefName, setDesignerRefName] = useState<string>('');
    const [designerDropActive, setDesignerDropActive] = useState(false);

    const [bgToolTab, setBgToolTab] = useState<'isolate' | 'restore'>('isolate');



    // Derived / Transient
    const [erodedUrl, setErodedUrl] = useState<string | null>(null);
    // processedTryOnUrl is now global
    const [isIsolating, setIsIsolating] = useState(false);
    const [isolationProgress, setIsolationProgress] = useState(0);
    const [notification, setNotification] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setNotification(msg);
        setTimeout(() => setNotification(null), 3000);
    };

    // --- FILE/IMAGE HELPERS ---
    const fileToDataUrl = (file: Blob) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });





    // --- TRY-ON / WARDROBE HELPERS ---
    const isDesignReferenceSelected = (item: WardrobeItem) =>
        item.category === 'DesignRef' || /^DESIGNREF/i.test(item.id);

    // --- COSTUME DESIGNER: SESSION-ONLY DESIGN REFERENCE (NOT SAVED TO WARDROBE LIBRARY) ---
    const setDesignerReferenceFromFile = async (file: File) => {
        const dataUrl = await fileToDataUrl(file);
        const safeBase = file.name.replace(/\.[^/.]+$/, '').trim() || 'Reference';
        setDesignerRefImage(dataUrl);
        setDesignerRefName(safeBase);

        // Reset generated output so the viewport shows the reference until generation completes.
        setDesignerImage(null);
        setDesignerMask(null);

        showToast(designerRefKind === 'sketch' ? 'Design sketch/pattern loaded.' : 'Costume reference loaded.');
    };

    const handleUploadDesignerReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        try {
            await setDesignerReferenceFromFile(file);
        } catch {
            showToast('Failed to load reference image.');
        } finally {
            e.target.value = "";
        }
    };

    const handleDropDesignerReference = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDesignerDropActive(false);

        const file = e.dataTransfer.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        try {
            await setDesignerReferenceFromFile(file);
        } catch {
            showToast("Failed to load dropped reference image.");
        }
    };

    const clearDesignerWorkspace = () => {
        setDesignerRefImage(null);
        setDesignerRefName('');
        setDesignerImage(null);
        setDesignerMask(null);
    };


    const handleUploadTryOnCharacterSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        try {
            const dataUrl = await fileToDataUrl(file);
            setTryOnCharacterSheet(dataUrl);
            showToast("Character sheet loaded.");
        } finally {
            e.target.value = "";
        }
    };

    const buildSubjectReferenceImages = (subject: CastMember) => {
        const refs: { url: string; label: string }[] = [];
        if (tryOnCharacterSheet) refs.push({ url: tryOnCharacterSheet, label: "Character Sheet (Identity Anchor)" });
        refs.push({ url: subject.previewUrl || subject.url, label: "Subject Reference" });
        return refs;
    };

    const setTryOnDisplay = (view: TryOnDisplay) => {
        setActiveTryOnView(view);

        // Switching views invalidates any active isolation/restore state
        setRemoveTryOnBg(false);
        setTryOnMask(null);
        setProcessedTryOnUrl(null);
        purgeRestorationState();

        if (view === 'sheetFB' && tryOnSheetFB) {
            setFittedImage(tryOnSheetFB);
            return;
        }
        if (view === 'sheetLR' && tryOnSheetLR) {
            setFittedImage(tryOnSheetLR);
            return;
        }
        if (tryOnViews && (view === 'front' || view === 'back' || view === 'left' || view === 'right')) {
            setFittedImage(tryOnViews[view]);
        }
    };


    // Draggable Panel State
    // Draggable Panel State Removed

    // Refs
    const tryOnImgRef = useRef<HTMLImageElement>(null); // The Base Image (Fitted)
    const previewImgRef = useRef<HTMLImageElement>(null); // The Composite Result

    // --- SAVE TO ACTOR LIBRARY STATE ---
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveCategory, setSaveCategory] = useState("realism");
    const [newActorName, setNewActorName] = useState("");

    const handleOpenSaveModal = () => {
        if (!fittedImage) return;
        setNewActorName("Fitted Character");
        setShowSaveModal(true);
    };

    const confirmSaveToLibrary = async (nameOverride?: string, categoryOverride?: string) => {
        const targetName = nameOverride || newActorName;
        const targetCategory = categoryOverride || saveCategory;

        const hasStorage = !!state.saveDirectoryHandle || !!state.saveDirectoryPath;

        if (!hasStorage || !fittedImage) {
            showToast("Save Folder & Image Required");
            dispatch({ type: 'ADD_LOG', payload: { message: "Save Failed: Missing Save Folder or Image", type: 'error' } });
            return;
        }

        // FIX: Use Processed URL (BG Removed) if available, otherwise fallback to Original
        const sourceImage = processedTryOnUrl || fittedImage;

        // Map Category to a valid Style for Library Filtering
        const catToStyle: Record<string, string> = {
            "realism": "exact_studio",
            "anim": "family_3d",
            "illustration": "retro_anime",
            "scifi": "cyberpunk_neon",
            "uncategorized": "exact_studio"
        };
        const activeStyle = catToStyle[targetCategory] || "exact_studio";

        try {
            const mat = await LibraryAssetMaterializer.materializeCastAsset({
                sourceUrl: sourceImage,
                saveDirectoryPath: state.saveDirectoryPath,
                actorName: targetName,
                category: targetCategory
            });

            // INSTANT UI UPDATE
            const newActor: CastMember = {
                id: crypto.randomUUID(),
                name: targetName || `Actor-${Date.now()}`,
                url: mat.previewUrl,
                localPath: mat.localPath || undefined,
                previewUrl: mat.previewUrl,
                sourceUrl: mat.sourceUrl,
                tag: 'front',
                filename: mat.filename,
                profile: {
                    identity: targetName || `Actor-${Date.now()}`,
                    style: activeStyle,
                    wardrobe: "Fitted",
                    accessories: ""
                }
            };
            dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });

            if (mat.previewUrl) {
                // Immediately swap Hosted preview URL for durable local loaded URL
                setFittedImage(mat.previewUrl);
            }

            setShowSaveModal(false);
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved Actor: ${mat.filename || "Storage"}`, type: 'success' } });

        } catch (err: any) {
            console.error("Save Failed:", err);
            dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${err.message}`, type: 'error' } });
        }
    };
    const uiCanvasRef = useRef<HTMLCanvasElement>(null); // For Brush Cursor
    const restorationCanvasRef = useRef<HTMLCanvasElement>(null); // Offscreen Layer
    const tryOnCanvasRef = useRef<HTMLCanvasElement>(null); // Internal Processing Canvas
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);
    const isPaintingRef = useRef(false);

    // SYNC REFS WITH GLOBAL STATE ON MOUNT / CHANGE
    useEffect(() => {
        historyRef.current = history;
        historyIndexRef.current = historyIndex;
    }, [history, historyIndex]);
    const isSyncingRef = useRef(false); // Track async canvas sync state
    const syncRequestId = useRef(0); // Track migration/sync requests to avoid race conditions
    const lastPaintPos = useRef<{ x: number, y: number } | null>(null);
    const lastScreenPos = useRef<{ x: number, y: number } | null>(null);
    const cachedBaseImgRef = useRef<HTMLImageElement | null>(null);
    const cachedOriginalImgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null); // Main container for interactions

    // Designer Workspace Refs
    const designerImgRef = useRef<HTMLImageElement>(null);
    const maskImgRef = useRef<HTMLImageElement>(null);

    // --- HELPERS PORTED FROM CASTINGFORGE ---

    // PHASE 1: EROSION (Heavy - CPU)
    const generateErodedMask = async (srcUrl: string, pixels: number): Promise<string> => {
        if (pixels === 0) return srcUrl;

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) { resolve(srcUrl); return; }

                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const w = canvas.width;
                const h = canvas.height;

                // GREEN SUPPRESSION PASS REMOVED (Was causing artifacts on green costumes)

                // Create a copy for reading so we don't read already-modified pixels
                const originalAlphaArr = new Uint8Array(w * h);
                for (let i = 0; i < w * h; i++) {
                    originalAlphaArr[i] = data[i * 4 + 3];
                }

                // SUB-PIXEL EROSION
                const rBase = Math.floor(pixels);
                const rExt = rBase + 1;
                const fraction = pixels - rBase;

                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = (y * w + x) * 4;
                        if (data[idx + 3] === 0) continue;

                        let minBase = 255;
                        let minExt = 255;

                        for (let dy = -rExt; dy <= rExt; dy++) {
                            for (let dx = -rExt; dx <= rExt; dx++) {
                                const nx = x + dx;
                                const ny = y + dy;
                                let nAlpha = 0;
                                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                    nAlpha = originalAlphaArr[ny * w + nx];
                                }
                                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                                if (dist <= rBase) { if (nAlpha < minBase) minBase = nAlpha; }
                                if (dist <= rExt) { if (nAlpha < minExt) minExt = nAlpha; }
                            }
                        }
                        const finalAlpha = minBase * (1 - fraction) + minExt * fraction;
                        // PRESERVE RGB - ONLY MODIFY ALPHA
                        data[idx + 3] = finalAlpha;
                    }
                }

                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL());
            };
            img.onerror = () => {
                console.error("Failed to load mask for erosion");
                resolve(srcUrl); // Fallback to original
            };
            img.src = srcUrl;
        });
    };


    // PHASE 2: RESTORATION (Light - GPU Composition)
    const compositeRestoration = (
        baseInput: string | HTMLImageElement,
        originalInput: string | HTMLImageElement,
        restoreLayerUrl: string | null
    ): Promise<string> => {
        // console.log("COMPOSITE: Start", { hasRestore: !!restoreLayerUrl, baseType: typeof baseInput });

        // If no restoration layer, return base (if string) or src (if image)
        if (!restoreLayerUrl) {
            return Promise.resolve(typeof baseInput === 'string' ? baseInput : baseInput.src);
        }

        // RETRY LOGIC WRAPPER
        const attemptComposite = (retryCount = 0): Promise<string> => {
            return new Promise((resolve) => {
                // Helper to wait for image if string
                const ensureImage = (input: string | HTMLImageElement): Promise<HTMLImageElement> => {
                    if (typeof input !== 'string') return Promise.resolve(input);
                    return new Promise((res, rej) => {
                        const i = new Image();
                        i.crossOrigin = "anonymous";
                        i.onload = () => res(i);
                        i.onerror = () => {
                            console.error(`Failed to load image: ${input.slice(0, 50)}...`);
                            rej();
                        };
                        i.src = input;
                    });
                };

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                ensureImage(baseInput).then(baseImg => {
                    canvas.width = baseImg.width;
                    canvas.height = baseImg.height;

                    if (!ctx) { resolve(baseImg.src); return; }

                    // 1. Draw Eroded Base
                    ctx.drawImage(baseImg, 0, 0);

                    // 2. Local Restoration
                    const restoreImg = new Image();
                    restoreImg.onload = () => {
                        ensureImage(originalInput).then(originalImg => {
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = canvas.width;
                            tempCanvas.height = canvas.height;
                            const tCtx = tempCanvas.getContext('2d');
                            if (tCtx) {
                                tCtx.drawImage(restoreImg, 0, 0);
                                tCtx.globalCompositeOperation = 'source-in';
                                tCtx.drawImage(originalImg, 0, 0);

                                ctx.globalCompositeOperation = 'source-over';
                                ctx.drawImage(tempCanvas, 0, 0);
                            }
                            resolve(canvas.toDataURL());
                        }).catch(() => {
                            console.error("Failed to load original for composite");
                            if (retryCount < 1) {
                                console.warn("Retrying composite with fresh load...");
                                attemptComposite(retryCount + 1).then(resolve);
                            } else {
                                resolve(baseImg.src);
                            }
                        });
                    };
                    restoreImg.onerror = () => {
                        console.error("Failed to load restoration mask");
                        if (retryCount < 1) {
                            console.warn("Retrying composite due to mask load fail...");
                            attemptComposite(retryCount + 1).then(resolve);
                        } else {
                            resolve(baseImg.src);
                        }
                    };
                    restoreImg.src = restoreLayerUrl;

                }).catch(() => {
                    console.error("Failed to load base for composite");
                    resolve("");
                });
            });
        };

        return attemptComposite(0);
    };

    // EFFECT: Reset Restoration on New Image
    useEffect(() => {
        // When the main image changes, we MUST clear all manual edits
        setRestorationLayer(null);
        setRemoveTryOnBg(false); // Reset bg toggle
        setIsBrushActive(false); // Reset brush tool

        // Clear History
        setHistory([]);
        historyRef.current = [];
        setHistoryIndex(-1);
        historyIndexRef.current = -1;

        // Clear Canvas
        if (restorationCanvasRef.current) {
            const ctx = restorationCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
        }
    }, [fittedImage]);

    // EFFECT 1.5: Preload/Cache Static Images
    useEffect(() => {
        // ALWAYS clear cache first to prevent stale image usage
        cachedBaseImgRef.current = null;

        const base = erodedUrl || tryOnMask;
        if (base && typeof base === 'string') {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = base;
            img.onload = () => { cachedBaseImgRef.current = img; };
        }
    }, [erodedUrl, tryOnMask]);

    useEffect(() => {
        cachedOriginalImgRef.current = null;
        if (fittedImage) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = fittedImage;
            img.onload = () => { cachedOriginalImgRef.current = img; };
        }
    }, [fittedImage]);

    // EFFECT 2: Handle Composition (Fast)
    useEffect(() => {
        // If Remove BG is off, show nothing
        if (!removeTryOnBg) {
            setProcessedTryOnUrl(null);
            return;
        }

        // Determine the base mask (Eroded or Raw)
        const base = erodedUrl || tryOnMask;
        if (!base) return;

        let active = true;

        const composite = async () => {
            // Use Cached Images if available to prevent flickering
            const baseInput = cachedBaseImgRef.current || base;
            const originalInput = cachedOriginalImgRef.current || fittedImage;

            if (originalInput) {
                compositeRestoration(baseInput, originalInput, restorationLayer).then(url => {
                    if (active) {
                        setProcessedTryOnUrl(url);
                    }
                });
            }
        };

        composite();

        return () => { active = false; };
    }, [erodedUrl, tryOnMask, restorationLayer, removeTryOnBg, fittedImage]);

    // Simplified Isolation (Just triggers Img.ly and sets mask)
    const runTryOnIsolation = async (): Promise<string | null> => {
        if (!fittedImage) return null; // removeTryOnBg check removed to allow manual run even if off? No, safer to keep logic consistent but Cast allows run if null.

        try {
            setIsIsolating(true);
            setIsolationProgress(0);

            const blob = await safeFetchBlob(fittedImage);

            const config = await CutoutService.getImglyConfig(
                (_key: string, current: number, total: number) => {
                    if (total > 0) setIsolationProgress(Math.round((current / total) * 100));
                }
            );

            const blobResult = await removeBackground(blob, config);

            const url = URL.createObjectURL(blobResult);
            setTryOnMask(url);
            setRemoveTryOnBg(true); // Auto-enable
            return url;
        } catch (e) {
            console.error("Isolation failed", e);
            dispatch({ type: 'ADD_LOG', payload: { message: "Isolation failed. Please try again.", type: 'error' } });
            return null;
        } finally {
            setIsIsolating(false);
            setIsolationProgress(0);
        }
    };

    // EFFECT: Handle Erosion (Slow)
    useEffect(() => {
        if (!removeTryOnBg || !tryOnMask) {
            setErodedUrl(null);
            setIsIsolating(false);
            return;
        }

        if (fringeSize === 0) {
            setErodedUrl(tryOnMask);
            setIsIsolating(false);
            return;
        }

        setIsIsolating(true);
        let active = true;
        const t = setTimeout(() => {
            generateErodedMask(tryOnMask, fringeSize).then(url => {
                if (active) {
                    setErodedUrl(url);
                    setIsIsolating(false);
                }
            });
        }, 100);

        return () => { active = false; clearTimeout(t); };
    }, [tryOnMask, fringeSize, removeTryOnBg]);


    // --- INTERACTION HANDLERS ---

    // SAFE SYNC REF CANVAS (Async Locked)
    const syncRefCanvas = (url: string | null) => {
        // Note: Wardrobe uses 'tryOnImgRef' as the dimension source
        if (!tryOnImgRef.current) return;

        // Ensure Dimension Sync
        const requiredW = tryOnImgRef.current.naturalWidth;
        const requiredH = tryOnImgRef.current.naturalHeight;

        if (!restorationCanvasRef.current || restorationCanvasRef.current.width !== requiredW) {
            console.log("SyncRef initializing canvas:", requiredW, requiredH);
            const c = document.createElement('canvas');
            c.width = requiredW;
            c.height = requiredH;
            restorationCanvasRef.current = c;
        }

        const ctx = restorationCanvasRef.current.getContext('2d');
        if (!ctx) return;

        const currentId = ++syncRequestId.current;

        if (url) {
            isSyncingRef.current = true;
            const img = new Image();
            img.onload = () => {
                if (currentId === syncRequestId.current) {
                    if (restorationCanvasRef.current) {
                        // Re-verify dimensions on load just in case
                        if (restorationCanvasRef.current.width !== img.width && img.width > 0) {
                            restorationCanvasRef.current.width = img.width;
                            restorationCanvasRef.current.height = img.height;
                        }

                        const ctx = restorationCanvasRef.current.getContext('2d');
                        ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
                        ctx?.drawImage(img, 0, 0);
                    }
                }
                isSyncingRef.current = false;
            };
            img.onerror = () => {
                console.error("Failed to load history snapshot in SyncRef");
                isSyncingRef.current = false;
            }
            img.src = url;
        } else {
            ctx.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
        }
    };

    const handleUndo = () => {
        const currentIndex = historyIndexRef.current;
        // Allow undoing if we are at least at index 0 (1st item) to go back to -1 (Empty)
        if (currentIndex >= 0) {
            const newIndex = currentIndex - 1;
            const snapshot = newIndex >= 0 ? historyRef.current[newIndex] : null;

            historyIndexRef.current = newIndex;
            setHistoryIndex(newIndex);
            setRestorationLayer(snapshot);
            syncRefCanvas(snapshot);
        }
    };

    const handleRedo = () => {
        const currentIndex = historyIndexRef.current;
        const currentHist = historyRef.current;
        if (currentIndex < currentHist.length - 1) {
            const newIndex = currentIndex + 1;
            const snapshot = currentHist[newIndex];

            historyIndexRef.current = newIndex;
            setHistoryIndex(newIndex);
            setRestorationLayer(snapshot);
            syncRefCanvas(snapshot);
        }
    };

    // HELPER: Purge Restoration State
    const purgeRestorationState = () => {
        setRestorationLayer(null);
        setHistory([]);
        setHistoryIndex(-1);
        historyRef.current = [];
        historyIndexRef.current = -1;
        if (restorationCanvasRef.current) {
            const ctx = restorationCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
        }
    };

    // handlePanelMouseDown removed


    // MOUSE TO IMAGE COORDINATE MAPPER
    const getImgCoords = (clientX: number, clientY: number) => {
        // 1. Identify which image is ACTUALLY visible to the user
        // If preview exists, we use previewImgRef (which is object-contain)
        // If not, we use tryOnImgRef (which is object-contain)
        const activeImg = (processedTryOnUrl && previewImgRef.current)
            ? previewImgRef.current
            : tryOnImgRef.current;

        if (!containerRef.current || !activeImg) return null;

        // 2. Get Geometries

        // We need the ACTUAL rendered dimensions of the image content within the object-fit: contain element
        // standard getBoundingClientRect on the img tag returns the ELEMENT size (w-full h-full), not the content size
        const naturalW = activeImg.naturalWidth;
        const naturalH = activeImg.naturalHeight;
        const elemW = activeImg.offsetWidth;
        const elemH = activeImg.offsetHeight;

        const imgRatio = naturalW / naturalH;
        const containerRatio = elemW / elemH;

        let renderedW, renderedH, renderedLeft, renderedTop;

        if (containerRatio > imgRatio) {
            // Container is wider than image -> Pillarbox (empty left/right)
            // Image height matches container height
            renderedH = elemH;
            renderedW = elemH * imgRatio;
            renderedTop = 0;
            renderedLeft = (elemW - renderedW) / 2;
        } else {
            // Container is taller than image -> Letterbox (empty top/bottom)
            // Image width matches container width
            renderedW = elemW;
            renderedH = elemW / imgRatio;
            renderedLeft = 0;
            renderedTop = (elemH - renderedH) / 2;
        }

        // 3. Calculate Image Coordinates
        // Adjust mouse position by the rendered offset
        // relative to the activeImg element
        const imgElementRect = activeImg.getBoundingClientRect();
        const clientXRelToImg = clientX - imgElementRect.left;
        const clientYRelToImg = clientY - imgElementRect.top;

        const mouseX = clientXRelToImg - renderedLeft;
        const mouseY = clientYRelToImg - renderedTop;

        // 4. Scale to Natural Dimensions
        const scale = naturalW / renderedW;

        // 5. Calculate UI Screen Coordinates (for Cursor Dot)
        // We want the cursor dot to track the mouse EXACTLY
        // But we should clamp or hide it if outside the image? 
        // For now, let's just track the mouse on screen relative to canvas
        let screenX = 0;
        let screenY = 0;

        if (uiCanvasRef.current) {
            const canvasRect = uiCanvasRef.current.getBoundingClientRect();
            screenX = clientX - canvasRect.left;
            screenY = clientY - canvasRect.top;
        }

        return {
            x: mouseX * scale,
            y: mouseY * scale,
            w: naturalW,
            h: naturalH,
            scale: scale,
            screenX: screenX,
            screenY: screenY,
        };
    };

    const startInteraction = (e: React.MouseEvent) => {
        // Block interaction if canvas is syncing (prevent race conditions)
        if (isSyncingRef.current) return;
        // Drag check removed

        if (!isBrushActive || !tryOnImgRef.current) return;

        e.stopPropagation();
        e.preventDefault();
        isPaintingRef.current = true;

        const coords = getImgCoords(e.clientX, e.clientY);

        // Init Canvas if Needed OR if Sizing Mismatch
        const requiredW = tryOnImgRef.current.naturalWidth;
        const requiredH = tryOnImgRef.current.naturalHeight;

        if (!restorationCanvasRef.current || restorationCanvasRef.current.width !== requiredW || restorationCanvasRef.current.height !== requiredH) {
            console.log("Re-initializing Restoration Canvas to match image:", requiredW, requiredH);
            const c = document.createElement('canvas');
            c.width = requiredW;
            c.height = requiredH;
            restorationCanvasRef.current = c;
            if (restorationLayer) {
                const ctx = c.getContext('2d');
                const prevImg = new Image();
                prevImg.onload = () => ctx?.drawImage(prevImg, 0, 0, requiredW, requiredH); // Force fit
                prevImg.src = restorationLayer;
            }
        }

        // Init UI Canvas (Visual Feedback)
        if (uiCanvasRef.current && containerRef.current) {
            uiCanvasRef.current.width = containerRef.current.clientWidth;
            uiCanvasRef.current.height = containerRef.current.clientHeight;
            const uictx = uiCanvasRef.current.getContext('2d');
            uictx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
        }

        if (coords) {
            lastPaintPos.current = { x: coords.x, y: coords.y };
            const uiX = coords.screenX;
            const uiY = coords.screenY;
            lastScreenPos.current = { x: uiX, y: uiY };

            // Dot for click
            const ctx = restorationCanvasRef.current.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                const r = (brushSize * coords.scale) / 2;
                ctx.arc(coords.x, coords.y, r, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();
            }

            // Draw visual dot on UI canvas
            const uictx = uiCanvasRef.current?.getContext('2d');
            if (uictx) {
                uictx.beginPath();
                const r = brushSize / 2;
                uictx.arc(uiX, uiY, r, 0, Math.PI * 2);
                uictx.fillStyle = 'white';
                uictx.fill();
            }
        }
    };

    const moveInteraction = (e: React.MouseEvent) => {
        if (!containerRef.current) return;

        // PANEL DRAG (Priority)
        // Panel Drag Logic removed

        if (isBrushActive) {
            const coords = getImgCoords(e.clientX, e.clientY);

            if (coords && restorationCanvasRef.current && isPaintingRef.current && lastPaintPos.current) {
                const ctx = restorationCanvasRef.current.getContext('2d');
                const uictx = uiCanvasRef.current?.getContext('2d');

                if (ctx) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = brushSize * coords.scale;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.moveTo(lastPaintPos.current.x, lastPaintPos.current.y);
                    ctx.lineTo(coords.x, coords.y);
                    ctx.stroke();
                }

                if (uictx && lastScreenPos.current) {
                    uictx.beginPath();
                    uictx.strokeStyle = 'white';
                    uictx.lineWidth = brushSize;
                    uictx.lineCap = 'round';
                    uictx.lineJoin = 'round';
                    uictx.moveTo(lastScreenPos.current.x, lastScreenPos.current.y);
                    uictx.lineTo(coords.screenX, coords.screenY);
                    uictx.stroke();
                }

                lastPaintPos.current = { x: coords.x, y: coords.y };
                lastScreenPos.current = { x: coords.screenX, y: coords.screenY };
            }
        }
    };

    const endInteraction = () => {
        // Drag state removed

        // Commit Painting
        if (isPaintingRef.current && restorationCanvasRef.current) {
            const newSnapshot = restorationCanvasRef.current.toDataURL();
            setRestorationLayer(newSnapshot);

            // HISTORY PUSH
            // Use Ref to ensure we slice from the ACTUAL current pointer, not stale state
            const currentIndex = historyIndexRef.current;
            const currentHistory = historyRef.current; // Read from Ref

            const newHistory = currentHistory.slice(0, currentIndex + 1);
            newHistory.push(newSnapshot);
            if (newHistory.length > 20) newHistory.shift(); // Cap history to 20

            // Update Refs (Source of Truth)
            historyRef.current = newHistory;
            historyIndexRef.current = newHistory.length - 1;

            // Sync React State
            setHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);

            // Clear Visual Layer
            if (uiCanvasRef.current) {
                const ctx = uiCanvasRef.current.getContext('2d');
                ctx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
            }
        }

        isPaintingRef.current = false;
        lastPaintPos.current = null;
        lastScreenPos.current = null;
    };

    // SAFETY: Force clear painting state when brush is deactivated
    useEffect(() => {
        if (!isBrushActive) {
            isPaintingRef.current = false;
            lastPaintPos.current = null;
            lastScreenPos.current = null;
            // Clear visual feedback
            if (uiCanvasRef.current) {
                const ctx = uiCanvasRef.current.getContext('2d');
                ctx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
            }
        }
    }, [isBrushActive]);

    const scanWardrobe = async () => {
        // 1. Native Mode
        if (state.saveDirectoryPath) {
            try {
                const wardrobePath = await nativeJoinPath(state.saveDirectoryPath, 'wardrobe');
                const files = await nativeListFiles(wardrobePath);
                const items: WardrobeItem[] = [];

                for (const file of files) {
                    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
                        // Skip ComfyUI Designer sketches that mistakenly save to the wardrobe root
                        if (file.toLowerCase().includes('_designer_')) continue;

                        const fullPath = await nativeJoinPath(wardrobePath, file);
                        const base64 = await window.electronAPI?.readFile?.(fullPath);
                        if (base64) {
                            items.push({
                                id: file,
                                url: `data:image/png;base64,${base64}`,
                                localPath: fullPath,
                                filename: file,
                                name: file.replace(/\.[^/.]+$/, "").split('-').slice(1).join(' '),
                                prompt: "Saved costume asset",
                                category: "General",
                                timestamp: Date.now()
                            });
                        }
                    }
                }
                dispatch({ type: 'SET_WARDROBE_ITEMS', payload: items });
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
            const items: WardrobeItem[] = [];
            // @ts-ignore
            // @ts-ignore
            for await (const entry of (wardrobeHandle as any).values()) {
                if (entry.kind === 'file' && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
                    // Skip ComfyUI Designer sketches from polluting the library
                    if (entry.name.toLowerCase().includes('_designer_')) continue;

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
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe scan failed: ${e.message} `, type: 'error' } });
        }
    };

    const withLibraryTransition = (work: () => void | Promise<void>, minMs = 180) => {
        setLibraryLoading(true);
        const started = Date.now();

        Promise.resolve(work()).finally(() => {
            const elapsed = Date.now() - started;
            const remaining = Math.max(0, minMs - elapsed);
            window.setTimeout(() => setLibraryLoading(false), remaining);
        });
    };

    useEffect(() => {
        scanWardrobe();
    }, [state.saveDirectoryHandle]);

    const saveToWardrobe = async (imageUrl: string, prompt: string) => {
        const hasStorage = !!state.saveDirectoryHandle || !!state.saveDirectoryPath;
        if (!hasStorage) return;

        try {
            const mat = await LibraryAssetMaterializer.materializeWardrobeAsset({
                sourceUrl: imageUrl,
                saveDirectoryPath: state.saveDirectoryPath,
                prompt: prompt
            });

            const newItem: WardrobeItem = {
                id: mat.filename || `WARDROBE-${Date.now()}.png`,
                url: mat.url,
                localPath: mat.localPath || undefined,
                sourceUrl: mat.sourceUrl,
                filename: mat.filename,
                name: prompt.substring(0, 20),
                prompt: prompt,
                category: "Designer",
                timestamp: Date.now()
            };

            dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
            dispatch({ type: 'ADD_LOG', payload: { message: `Costume saved to wardrobe: ${mat.filename || 'local storage'}`, type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save wardrobe item: ${e.message}`, type: 'error' } });
        }
    };

    const handleDesignerGenerate = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;
        const hasHosted = state.billingEntitlements.hasHostedAccess;
        const hasByok = state.billingEntitlements.hasByokAccess;
        
        if (billingMode === 'hosted' && state.hostedCredits === 0) {
            dispatch({ type: 'ADD_LOG', payload: { message: "Generation blocked: Insufficient credits", type: 'error' } });
            dispatch({ type: 'SET_CREDIT_MODAL', payload: true });
            return;
        }
        
        if (billingMode === "hosted" && !hasHosted) {
            showToast("Hosted Cloud access required for Costume Designer.");
            dispatch({ type: 'ADD_LOG', payload: { message: "Hosted Cloud access required for Costume Designer.", type: 'error' } });
            return;
        }

        if (billingMode === "byok" && (!hasByok || !state.apiKey)) {
            showToast("API Key required for BYOK Costume Designer.");
            dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for BYOK Costume Designer.", type: 'error' } });
            return;
        }

        if (!designerPrompt) {
            showToast("Enter a wardrobe prompt to generate a costume.");
            dispatch({ type: 'ADD_LOG', payload: { message: "Costume Designer requires a prompt.", type: 'error' } });
            return;
        }

        setDesignerMask(null);
        dispatch({ type: 'SET_PROCESSING', payload: true });

        // --- TIMEOUT & ETA LOGIC ---
        const getEtaMs = () => state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
        const etaMs = getEtaMs();

        // --- PROGRESS SIMULATION TIMER ---
        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Designing Garment" } });

        const updateMs = 1000;
        const increment = (updateMs / etaMs) * 100;

        // Using window.setInterval to avoid NodeJS Timeout typing issues in React/Vite
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95; // Cap at 95% until complete

            let text = "Designing Garment";
            if (currentPercent > 30) text = "Processing Pattern Logistics...";
            if (currentPercent > 60) text = "Refining Material Properties...";
            if (currentPercent > 80) text = "Finalizing Render...";
            if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, updateMs);

        try {
            const refs: { url: string; label: string }[] = [];

            if (designerRefImage) {
                refs.push({
                    url: designerRefImage,
                    label: designerRefKind === 'sketch'
                        ? 'Design Reference (Sketch / Pattern)'
                        : 'Design Reference (Costume Photo)'
                });
            }

            if (brandingLogo) {
                refs.push({ url: brandingLogo, label: 'Branding Logo (Apply to garment)' });
            }

            const referenceInstructions = designerRefImage
                ? (designerRefKind === 'sketch'
                    ? `REFERENCE IMAGE: Image 1 is a fashion sketch or sewing pattern. Reconstruct a finished wearable garment.
- Do NOT include sketch lines, pattern pieces, letters, numbers, measurement tables, or annotations.
- Preserve construction logic implied by the reference (panels, seams, pockets, closures).`
                    : `REFERENCE IMAGE: Image 1 is a costume reference photo.
- Use it to match silhouette, materials, and key details.
- Output must be a clean standalone garment product photo (not a person wearing it).`)
                : `NO REFERENCE IMAGE: Create the garment from text description only.`;

            const brandingInstructions = brandingLogo
                ? `BRANDING: The last reference image is a logo.
- Apply it subtly and realistically at: ${logoPosition}.
- Ensure correct proportions and legibility.`
                : `BRANDING: None.`;

            const prompt = `
Professional garment design + studio product photography.

${referenceInstructions}

USER DESCRIPTION:
${designerPrompt}

OUTPUT REQUIREMENTS (STRICT):
- Single standalone garment only (NO person, NO mannequin, NO hanger, NO hands).
- Solid black studio background (#000000), no gradients, no shadows on background.
- Centered, full garment visible, no cropping.
- Photoreal fabric texture, seams, stitching, and hardware details.
- High-resolution studio product lighting.
- 1:1 square composition.

${brandingInstructions}

NEGATIVE:
text, labels, watermarks, diagrams, pattern layouts, mannequins, models, busy backgrounds.
`;

            let actualGenId = '';
            const res = await GeminiService.generateImage(
                prompt.trim(),
                state.apiKey,
                state.model,
                refs,
                { 
                    aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements,
                    onJobAccepted: (id) => {
                        actualGenId = id;
                        dispatch({ type: 'ADD_BACKGROUND_JOB', payload: { id, status: 'polling_foreground', context: 'wardrobe_designer', startedAt: Date.now() } });
                    }
                }
            );

            if (actualGenId) dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: actualGenId });

            const rawUrl =
                typeof res === 'string'
                    ? res
                    : (res && typeof res === 'object' ? (res as any).asset_url || '' : '');

            let safeUrl = rawUrl;
            try {
                safeUrl = await materializeDisplayUrl(rawUrl);
            } catch (e) {
                console.warn("Failed to materialize designer result:", e);
            }

            setDesignerImage(safeUrl);
            dispatch({ type: 'ADD_LOG', payload: { message: "Costume generated (Costume Designer).", type: 'success' } });
        } catch (e: any) {
            const isTimeout = e.name === 'TimeoutError' || e.message?.includes('Pending');
            if (isTimeout && e.generationId) {
                dispatch({ type: 'UPDATE_BACKGROUND_JOB', payload: { id: e.generationId, updates: { status: 'pending_background' } } });
                dispatch({ type: 'ADD_LOG', payload: { message: "Job shifted to background due to long queue.", type: 'info' } });
            } else {
                dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
            }
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleUploadCostume = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const hasStorage = !!state.saveDirectoryHandle || !!state.saveDirectoryPath;
        if (!e.target.files || e.target.files.length === 0 || !hasStorage) return;
        const file = e.target.files[0];

        try {
            // DUPLICATE CHECK
            if (state.wardrobeItems.some(i => i.id.includes(file.name) || i.name === file.name.split('.')[0])) {
                showToast("Item already exists in library.");
                return;
            }

            const safeName = `Custom-Costume-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;

            // 1. Native Mode
            if (state.saveDirectoryPath) {
                const wardrobePath = await nativeJoinPath(state.saveDirectoryPath, 'wardrobe');
                const fullPath = await nativeJoinPath(wardrobePath, safeName);
                const success = await nativeWriteFile(fullPath, file);
                if (!success) throw new Error("Failed to write image file natively");
            }
            // 2. Web API Mode
            else if (state.saveDirectoryHandle) {
                const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
                const fileHandle = await wardrobeHandle.getFileHandle(safeName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            }

            // Read for immediate display
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;

                const newItem: WardrobeItem = {
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
            dispatch({ type: 'ADD_LOG', payload: { message: `Upload failed: ${err.message} `, type: 'error' } });
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<WardrobeItem | null>(null);

    const executeDelete = async () => {
        if (!confirmDelete) return;
        const item = confirmDelete;

        try {
            let deleted = false;
            let diag = "";
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
                const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'wardrobe', item.id);
                deleted = await window.electronAPI.deleteFile(filePath);
                diag += `IPC[${deleted}] (${filePath}). `;
            } else {
                diag += `IPC[Missing/NoPath]. `;
            }

            if (!deleted && state.saveDirectoryHandle) {
                const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: false });
                await wardrobeHandle.removeEntry(item.id);
                deleted = true;
                diag += `Web[Succeed]. `;
            }

            if (!deleted) throw new Error("Disk deletion failed! Trace: " + diag);

            const newItems = state.wardrobeItems.filter(i => i.id !== item.id);
            dispatch({ type: 'SET_WARDROBE_ITEMS', payload: newItems });
            if (selectedCostume?.id === item.id) setSelectedCostume(null);
            dispatch({ type: 'ADD_LOG', payload: { message: `Deleted costume: ${item.name} | ${diag}`, type: 'success' } });

        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Delete failed: ${e.message}`, type: 'error' } });
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleTryOn = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;
        const hasHosted = state.billingEntitlements.hasHostedAccess;
        const hasByok = state.billingEntitlements.hasByokAccess;

        if (billingMode === 'hosted' && state.hostedCredits === 0) {
            dispatch({ type: 'ADD_LOG', payload: { message: "Generation blocked: Insufficient credits", type: 'error' } });
            dispatch({ type: 'SET_CREDIT_MODAL', payload: true });
            return;
        }

        if (!selectedCharacter || !selectedCostume) {
            showToast("Select both a subject and a wardrobe item.");
            dispatch({ type: 'ADD_LOG', payload: { message: "Try-On requires a selected subject and wardrobe item.", type: 'error' } });
            return;
        }

        if (billingMode === "hosted" && !hasHosted) {
            showToast("Hosted Cloud access required for Virtual Try-On.");
            dispatch({ type: 'ADD_LOG', payload: { message: "Hosted Cloud access required for Virtual Try-On.", type: 'error' } });
            return;
        }

        if (billingMode === "byok" && (!hasByok || !state.apiKey)) {
            showToast("API Key required for BYOK Virtual Try-On.");
            dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for BYOK Virtual Try-On.", type: 'error' } });
            return;
        }

        dispatch({
            type: 'ADD_LOG',
            payload: {
                message: `Starting Virtual Try-On (${billingMode.toUpperCase()})...`,
                type: 'info'
            }
        });

        console.log('TRY-ON MODE:', tryOnOutputMode);

        // Reset output + editing state
        setRemoveTryOnBg(false);
        setTryOnMask(null);
        setProcessedTryOnUrl(null);
        setTryOnViews(null);
        setTryOnSheetFB(null);
        setTryOnSheetLR(null);
        setActiveTryOnView('front');

        purgeRestorationState();
        dispatch({ type: 'SET_PROCESSING', payload: true });

        const getEtaMs = () =>
            tryOnOutputMode === 'turnaround'
                ? (state.imageResolution === '4K' ? 90000 : state.imageResolution === '2K' ? 70000 : 45000)
                : (state.imageResolution === '4K' ? 45000 : state.imageResolution === '2K' ? 35000 : 25000);

        const etaMs = getEtaMs();

        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Initiating Try-On Protocol" } });

        const updateMs = 1000;
        const increment = (updateMs / etaMs) * 100;

        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Initiating Try-On Protocol";
            if (currentPercent > 20) text = tryOnOutputMode === 'turnaround' ? "Processing Front/Back Sheet..." : "Matching Costume Structure...";
            if (currentPercent > 45) text = tryOnOutputMode === 'turnaround' ? "Processing Left/Right Sheet..." : "Preserving Face Window...";
            if (currentPercent > 75) text = "Finalizing Output...";
            if (currentPercent >= 95) text = "Finalizing Output... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, updateMs);

        try {
            const subjectStyle = selectedCharacter.profile?.style || "Matching Style";
            const costumeName = selectedCostume.name;
            const costumeText = `${costumeName} ${tryOnNote || ''}`.toLowerCase();

            const subjectRefs = buildSubjectReferenceImages(selectedCharacter);
            const costumeRef = { url: selectedCostume.url, label: "Costume Reference" };

            const isDesignRef = isDesignReferenceSelected(selectedCostume);

            const isEnclosureCostume =
                /costume|mascot|onesie|full[- ]?body|character suit|banana|fruit|food|animal|creature|dinosaur|novelty|plush|foam suit|body suit|bodysuit|robe|shell|armor/i.test(costumeText);

            const faceWindowLockBlock = isEnclosureCostume ? `
 FACE WINDOW LOCK (CRITICAL)
 - If the Costume Reference shows a dedicated face hole, face window, or face opening, the subject's face must appear only through that designed face window.
 - Preserve the exact position, size, shape, and border of the designed face window as shown in the Costume Reference.
 - Do NOT widen, shrink, move, reshape, split, or redesign the face window.
 - Do NOT place the face in any other cavity, mouth opening, cutout, gap, or decorative opening unless the reference clearly shows that it is the intended face window.
 - Decorative openings, cavities, or structural gaps must remain decorative unless the reference explicitly shows they are used for the face.
 - Adjust the subject internally to the costume rather than changing the costume opening.
 - Do NOT expose extra neck, chest, shoulders, wrists, ankles, hands, or feet unless explicitly visible in the Costume Reference.
` : '';

            const fittingBlock = isEnclosureCostume ? `
 COSTUME TRANSFER (HARD LOCK)
 - Transfer the costume onto the subject while preserving the original design exactly.
 - The costume may stretch or fit naturally to the person's body, but the designed structure must remain intact.
 - Preserve the exact silhouette, enclosure, coverage, padding, bulk, appendages, and visible openings shown in the Costume Reference.
 - Do NOT redesign any structural part of the costume in order to fit the subject.
 - If the face must be aligned to the designed face window, adjust the internal fit, neck length, or interior positioning rather than changing the costume opening itself.
 - Do NOT invent extra arm shapes, extra sleeve shapes, duplicate limb-like costume protrusions, extra glove logic, or extra foot logic.
 - Do NOT convert the costume into ordinary clothing or a body-contoured reinterpretation.
 ${faceWindowLockBlock}
` : `
 GARMENT TRANSFER (STRICT)
 - Transfer the exact garment from the Costume Reference onto the subject.
 - Preserve silhouette, proportions, colors, materials, and visible construction details.
 - Fit the garment naturally only insofar as needed to look physically worn.
 - Do NOT redesign the garment.
`;

            const designAssemblyBlock = isDesignRef ? `
 DESIGN REFERENCE LOCK
 - Reconstruct only what is explicitly visible in the reference.
 - Preserve visible paneling, seam placement, closures, pockets, color blocking, silhouette, visible coverage, and visible openings exactly.
 - Do NOT infer hidden anatomy exposure, hidden openings, hidden closures, hidden glove logic, hidden footwear logic, or concealed structural details unless clearly shown.
 - If a structural detail is unknown, keep it closed, neutral, and non-revealing.
` : `
 COSTUME REFERENCE LOCK
 - Copy the Costume Reference exactly.
 - Preserve the exact colors, textures, fabrics, silhouette, visible openings, appendages, and visible construction.
 - Do NOT hallucinate new colors, new materials, alternate costume logic, or extra limbs.
`;

            const sideViewLockBlock = `
 SIDE-VIEW LOCK
 - The Canonical Front/Back Sheet is the absolute source of truth.
 - Side views must be rotations of the already-established costume, not reinterpretations.
 - Do NOT invent new openings, new exposed anatomy, new glove separation, new ankle shaping, new footwear logic, or new costume structure.
 - Do NOT reinterpret the original Costume Reference if it conflicts with the Canonical Front/Back Sheet.
 - If a side detail is not visible in the Canonical Front/Back Sheet, keep it structurally consistent and non-revealing.
`;

            const effectiveTryOnNote = isEnclosureCostume
                ? `${tryOnNote ? `${tryOnNote}. ` : ''}Preserve the costume exactly. If the design has a dedicated face window, keep that opening exactly as shown and place the subject's face only there. Do not use any other cavity or decorative opening as the face opening.`
                : (tryOnNote || "Transfer the garment exactly and preserve the visible design.");

            const sourceAppearanceContinuityBlock = `
 SOURCE APPEARANCE CONTINUITY LOCK (CRITICAL)
 - Preserve the complete worn appearance package established by the Subject Reference, Costume Reference, and Canonical Front/Back Sheet.
 - Any element that is worn, attached, styled, or visibly part of the look must remain present and consistent across all generated views unless explicitly instructed otherwise.
 - This includes hairstyle state, headwear, jewelry, eyewear, veils, hoods, scarves, gloves, sleeves, footwear, attached adornments, and any other worn or source-established appearance elements.
 - Do NOT remove, simplify, restyle, reinterpret, swap, or silently omit worn elements in side, back, or profile views.
 - Do NOT trade off one appearance element to preserve another.
 - If multiple appearance elements coexist, preserve all of them together.
 - All turnaround views must be rotations of the same exact worn look, not creative reinterpretations.
`;

            const hairConsistencyBlock = `
 HAIR STATE LOCK
 - Preserve the exact hairstyle state across all generated views.
 - If hair is worn down in the source or canonical sheet, it must remain down in all turnaround angles unless explicitly instructed otherwise.
 - Do NOT convert loose hair into a bun, ponytail, braid, pinned style, updo, or tied-back style unless explicitly shown in the source.
 - Preserve approximate hair length, fullness, parting, texture, and silhouette.
 - Hair continuity must coexist with all worn accessories and headwear.
`;

            let brandingInstruction = "";
            const baseImages: { url: string; label: string }[] = [
                ...subjectRefs,
                costumeRef
            ];

            if (brandingLogo) {
                baseImages.push({ url: brandingLogo, label: "Branding Logo" });
                brandingInstruction = `
 BRANDING & IDENTITY (OVERRIDE)
 - Place the Branding Logo onto the clothing.
 - EXACT PLACEMENT: ${logoPosition}.
 - CRITICAL: Preserve the exact color and design of the logo. Do NOT change the logo's color.
 - Integrate the logo realistically with fabric folds and lighting without distorting its color.
 - If the clothing already has a logo at that position, replace it perfectly.
 `;
            }

            // FRONT ONLY
            if (tryOnOutputMode === 'front') {
                console.log('Running FRONT branch');

                const res = await GeminiService.generateImage(
                    `Perform a professional virtual try-on and fashion fitting.

 SUBJECT (IDENTITY LOCK)
 - Use the Subject Reference image(s) only to preserve the exact facial identity and likeness of the person.
 - Same face, same person, no morphing, no age change.

 STYLE MATCH
 - The final rendering style should match the Subject Reference style: ${subjectStyle}.
 - If the Subject Reference is a realistic photograph, render the fitted costume as realistic material with realistic texture and lighting.

 COSTUME (HARD TRANSFER AUTHORITY)
 - The Costume Reference (${costumeName}) is the authority for the outfit.
 - Copy the costume exactly as shown.
 - Preserve the exact visible silhouette, enclosure, coverage, face-window placement, colors, textures, materials, and construction.
 - Do NOT reinterpret it into a more wearable, more fitted, more anatomical, or more revealing version.
 - IGNORE filename text if it conflicts with the image.
 ${designAssemblyBlock}
 ${faceWindowLockBlock}

 COLOR & MATERIAL LOCK
 - Preserve the exact costume colors from the Costume Reference.
 - Do NOT shift, mute, brighten, darken, replace, or reinterpret the costume colors.
 - Preserve the exact visible material finish and fabric appearance.

 SUBJECT IDENTITY
 - Preserve the subject's face and identity.
 - The body exists only to support the costume transfer.
 - Do NOT prioritize body contour over costume structure.

 ${fittingBlock}
 - Remove existing clothing/accessories from the subject before fitting the costume.

 FOOTWEAR (CONTEXTUAL MATCH)
 - If the Costume Reference explicitly shows shoes, feet, or foot coverings, copy them exactly.
 - Do NOT invent footwear logic not visible in the Costume Reference.
 - Do NOT expose feet unless explicitly visible in the Costume Reference.

 COMPOSITION
 - Single subject only. Full body visible. No cropping head/feet.
 - Solid black studio background (#000000).

 ${brandingInstruction}

 [FITTING NOTES]: ${effectiveTryOnNote}

 NEGATIVE CONSTRAINTS:
 face placed in wrong opening, face placed in decorative cavity, face placed in non-face opening,
 redesigned face hole, widened face window, shrunken face window, moved face window, broken face-window border,
 invented openings, extra cutouts, exposed neck when not shown, exposed wrists when not shown, exposed ankles when not shown, exposed hands when not shown, exposed feet when not shown,
 reshaped gloves, reshaped feet, anatomy contouring, body-hugging reinterpretation, bodysuit reinterpretation, costume redesign,
 extra limbs, duplicate arms, duplicate sleeves, duplicate glove forms, duplicate foot forms, extra costume appendages,
 altered costume colors, shifted palette, desaturated costume, brighter costume, darker costume, material reinterpretation,
 flat cutout, bad photoshop, unnatural drape, floating clothes, modified design, text, watermark.`,
                    state.apiKey,
                    state.model,
                    baseImages,
                    {
                        aspectRatio: '1:1',
                        imageSize: state.imageResolution,
                        thinkingLevel: state.enableImageThinking,
                        googleGrounding: state.enableGoogleGrounding,
                        billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements
                    }
                );

                const rawUrl =
                    typeof res === 'string'
                        ? res
                        : (res && typeof res === 'object' ? (res as any).asset_url || '' : '');

                let safeUrl = rawUrl;
                try {
                    safeUrl = await materializeDisplayUrl(rawUrl);
                } catch (e) {
                    console.warn("Failed to materialize try-on result:", e);
                }

                setFittedImage(safeUrl);
                setActiveTryOnView('front');
                dispatch({ type: 'ADD_LOG', payload: { message: "Front view fitting complete.", type: 'success' } });
                return;
            }

            console.log('Running TURNAROUND branch');

            const twoPanelFormat = `
 OUTPUT FORMAT (STRICT)
 - Produce ONE square image (1:1) with TWO equal vertical panels (left/right).
 - Subtle center divider is allowed; no frames, no collage borders, no extra panels.
 - Same solid black background (#000000) and consistent studio lighting in both panels.
 - Full body visible in both panels (no cropping head/feet).
 - FOOTWEAR CONSISTENCY (CRITICAL): The subject must have the EXACT SAME footwear (or lack thereof) in both panels.
 - No text, no labels, no watermarks.
 `;

            const fbSheet = await GeminiService.generateImage(
                `Professional virtual try-on TURNAROUND SHEET.

 ${twoPanelFormat}

 SUBJECT (IDENTITY LOCK)
 - Use the Subject Reference image(s) only to preserve the exact facial identity and likeness.
 - The LEFT and RIGHT panels must depict the SAME person.
 - Do NOT let body anatomy override costume structure.
 ${sourceAppearanceContinuityBlock}
 ${hairConsistencyBlock}

 COSTUME (HARD TRANSFER AUTHORITY)
 - The Costume Reference (${costumeName}) is the authority for the outfit.
 - Copy the costume exactly as shown.
 - Preserve the exact visible silhouette, enclosure, coverage, designed face-window placement, colors, textures, materials, and construction.
 - Do NOT reinterpret it into a more wearable, more fitted, more anatomical, or more revealing version.
 - IGNORE filename text if it conflicts with the image.
 ${designAssemblyBlock}
 ${faceWindowLockBlock}
 - If the costume has a dedicated face window, that is the only valid face placement location.

 COLOR & MATERIAL LOCK
 - Preserve the exact costume colors from the Costume Reference.
 - Do NOT shift, mute, brighten, darken, replace, or reinterpret the costume colors.
 - Preserve the exact visible material finish and fabric appearance.

 SILHOUETTE & STRUCTURE (STRICT LOCK)
 - Preserve the exact outer silhouette and visible structure of the Costume Reference.
 - Preserve all enclosure logic, shell shape, padding, bulk, visible openings, and visible appendages exactly.
 - Do NOT simplify the costume into regular clothing.
 - Do NOT expose body parts unless the Costume Reference explicitly shows them.

 PANELS
 - LEFT PANEL: FRONT view, straight-on.
 - RIGHT PANEL: BACK view, straight-on.

 STRUCTURE RULE
 - The front and back panels must depict the same exact costume structure.
 - Any enclosure or coverage shown in front must remain structurally consistent in back unless the reference explicitly shows otherwise.
 - Do NOT create a back opening or exposed head/neck zone unless explicitly visible in the Costume Reference.

 ${fittingBlock}

 ${brandingInstruction}

 [FITTING NOTES]: ${effectiveTryOnNote}

 NEGATIVE:
 face placed in wrong opening, face placed in decorative cavity, face placed in non-face opening,
 redesigned face hole, widened face window, shrunken face window, moved face window, broken face-window border,
 extra limbs, duplicate arms, duplicate sleeves, duplicate gloves, extra costume appendages, invented openings, extra cutouts, exposed neck when not shown, exposed wrists when not shown, exposed ankles when not shown, exposed hands when not shown, exposed feet when not shown, anatomy contouring, body-hugging reinterpretation, bodysuit reinterpretation, costume redesign, mascot redesign,
 missing worn accessory, removed accessory, dropped headwear, missing jewelry, removed jewelry, missing eyewear, removed eyewear, missing veil, removed veil, missing hood, removed hood, missing scarf, removed scarf, missing glove, removed glove, missing footwear, removed footwear, missing adornment, simplified adornment, omitted source appearance element, restyled hair, bun hairstyle, updo, tied-back hair, ponytail, braid, pinned hair, shorter hair, different hair volume, different hair silhouette,
 altered costume colors, shifted palette, desaturated costume, brighter costume, darker costume, material reinterpretation,
 flat cutout, bad photoshop, unnatural drape, floating clothes, modified design, text, watermark.`,
                state.apiKey,
                state.model,
                baseImages,
                {
                    aspectRatio: '1:1',
                    imageSize: state.imageResolution,
                    thinkingLevel: state.enableImageThinking,
                    googleGrounding: state.enableGoogleGrounding,
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements
                }
            );

            const lrImages: { url: string; label: string }[] = [
                ...subjectRefs,
                costumeRef,
                { url: fbSheet, label: "Canonical Front/Back Sheet" }
            ];

            const brandingInstructionLR = brandingLogo ? `
 BRANDING & IDENTITY (LOCK)
 - Match the logo placement and appearance exactly from the Canonical Front/Back Sheet.
 ` : '';

            const lrSheet = await GeminiService.generateImage(
                `Professional virtual try-on TURNAROUND SHEET of the SAME subject and SAME outfit.

 ${twoPanelFormat}

 SUBJECT IDENTITY (CRITICAL LOCK)
 - The LEFT and RIGHT panels must depict the exact same person.
 - Preserve face identity and neutral upright posture.
 - Do NOT let body anatomy override the costume structure established by the Canonical Front/Back Sheet.
 ${sourceAppearanceContinuityBlock}
 ${hairConsistencyBlock}

 COSTUME & APPEARANCE CANON (ABSOLUTE LOCK)
 - The Canonical Front/Back Sheet is the absolute source of truth for the full worn look.
 - Preserve the same costume structure, same visible coverage, same accessories, same hairstyle state, same headwear, same worn adornments, and same footwear across all turnaround views.
 - Do NOT add, remove, restyle, simplify, or reinterpret any source-established appearance element.
 - Side and back views must be faithful rotations of the same exact appearance package.
 - If the source-established look contains multiple simultaneous elements, preserve all of them together.
 ${sideViewLockBlock}
 ${faceWindowLockBlock}
 - If the costume has a dedicated face window, that is the only valid face placement location.

 COLOR & MATERIAL LOCK
 - Preserve the exact costume colors established by the Canonical Front/Back Sheet.
 - Do NOT shift, mute, brighten, darken, replace, or reinterpret the costume colors.
 - Preserve the exact visible material finish and fabric appearance.

 SILHOUETTE & STRUCTURE (STRICT LOCK)
 - Side views must preserve the exact volume, bulk, closure, and external silhouette established by the Canonical Front/Back Sheet.
 - Do NOT invent side-specific shaping that exposes more anatomy than the Canonical Front/Back Sheet implies.

 PANELS
 - LEFT PANEL: LEFT profile view (90 degrees), facing Viewer's LEFT.
 - RIGHT PANEL: RIGHT profile view (90 degrees), facing Viewer's RIGHT.

 PROFILE RULE
 - Left and right panels must be profile rotations of the already-established costume.
 - Do NOT introduce new arm, hand, leg, ankle, head, glove, or sleeve construction details not already established by the Canonical Front/Back Sheet.

 FOOTWEAR (CRITICAL LOCK & CONTEXTUAL MATCH)
 - The exact boot, sandal, or shoe design from the Canonical Front/Back Sheet MUST be preserved identically.
 - Do NOT change the strap design, height, armor coverage, or type of footwear.
 - If the subject has simple sandals in the Front/Back Sheet, do NOT upgrade them to armored boots or add greaves in the side view.
 - If the subject is barefoot in the Front/Back Sheet, they MUST be barefoot in both profile views. NO EXCEPTIONS. Do NOT add shoes if they are barefoot.
 - Do NOT hallucinate different shoes for the profile view.

 ${brandingInstructionLR}

 [FITTING NOTES]: ${effectiveTryOnNote}

 NEGATIVE CONSTRAINTS (FORBIDDEN):
 face placed in wrong opening, face placed in decorative cavity, face placed in non-face opening,
 redesigned face hole, widened face window, shrunken face window, moved face window, broken face-window border,
 extra limbs, duplicate arms, duplicate sleeves, duplicate gloves, extra costume appendages, invented openings, exposed neck when not shown, exposed wrists when not shown, exposed ankles when not shown,
 exposed hands when not shown, exposed feet when not shown, anatomy contouring, body-hugging reinterpretation, bodysuit reinterpretation,
 costume redesign, side-view reinterpretation, outfit mismatch,
 missing worn accessory, removed accessory, dropped headwear, missing jewelry, removed jewelry, missing eyewear, removed eyewear, missing veil, removed veil, missing hood, removed hood, missing scarf, removed scarf, missing glove, removed glove, missing footwear, removed footwear, missing adornment, simplified adornment, omitted source appearance element, restyled hair, bun hairstyle, updo, tied-back hair, ponytail, braid, pinned hair, shorter hair, different hair volume, different hair silhouette,
 altered costume colors, shifted palette, desaturated costume, brighter costume, darker costume, material reinterpretation,
 text, watermark.`,
                state.apiKey,
                state.model,
                lrImages,
                {
                    aspectRatio: '1:1',
                    imageSize: state.imageResolution,
                    thinkingLevel: state.enableImageThinking,
                    googleGrounding: state.enableGoogleGrounding,
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements
                }
            );

            // Extract exact view frames from turnaround sheets using offscreen canvas logic
            const extractPanel = (sourceUrl: string, isRightPanel: boolean): Promise<string> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width / 2;
                        canvas.height = img.height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) {
                            resolve(sourceUrl);
                            return;
                        }

                        const srcX = isRightPanel ? img.width / 2 : 0;
                        ctx.drawImage(img, srcX, 0, img.width / 2, img.height, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL("image/webp", 1.0));
                    };
                    img.onerror = () => resolve(sourceUrl);
                    img.src = sourceUrl;
                });
            };

            let safeFbSheet = fbSheet;
            let safeLrSheet = lrSheet;

            try {
                safeFbSheet = await materializeDisplayUrl(fbSheet);
            } catch (e) {
                console.warn("Failed to materialize FB sheet:", e);
            }

            try {
                safeLrSheet = await materializeDisplayUrl(lrSheet);
            } catch (e) {
                console.warn("Failed to materialize LR sheet:", e);
            }

            // Extract panels from the safe/materialized sheets
            const frontExtracted = await extractPanel(safeFbSheet, false);
            const backExtracted = await extractPanel(safeFbSheet, true);
            const leftExtracted = await extractPanel(safeLrSheet, false);
            const rightExtracted = await extractPanel(safeLrSheet, true);

            setTryOnSheetFB(safeFbSheet);
            setTryOnSheetLR(safeLrSheet);

            setTryOnViews({
                front: frontExtracted,
                back: backExtracted,
                left: leftExtracted,
                right: rightExtracted
            });

            setFittedImage(safeFbSheet);
            setActiveTryOnView('sheetFB');

            dispatch({ type: 'ADD_LOG', payload: { message: "Turnaround complete (2 sheets generated: FB + LR).", type: 'success' } });
        } catch (e: any) {
            const isTimeout = e.name === 'TimeoutError' || e.message?.includes('Pending');
            dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: isTimeout ? 'info' : 'error' } });
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_PROCESSING', payload: false });
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 0, text: '' } });
        }
    };

    const handleAddToCast = async () => {
        // Strictly use the current visual state. No new processing.
        const finalUrl = processedTryOnUrl || fittedImage;
        if (!finalUrl) return;

        const currentView = activeTryOnView;
        let tag: CastMember['tag'] = 'front';
        let label = 'Fitted';

        if (currentView === 'sheetFB') {
            tag = 'front';
            label = 'Turnaround (FB)';
        } else if (currentView === 'sheetLR') {
            tag = 'side';
            label = 'Turnaround (LR)';
        }

        const newMember: CastMember = {
            id: `fitted-${Date.now()}`,
            url: finalUrl,
            previewUrl: finalUrl,
            sourceUrl: finalUrl,
            tag,
            name: selectedCharacter ? `${selectedCharacter.name} (${label})` : `Fitted Character (${label})`,
            profile: {
                identity: selectedCharacter?.profile?.identity || selectedCharacter?.name || "Unknown Identity",
                wardrobe: selectedCostume?.prompt || "Selected Wardrobe",
                accessories: selectedCharacter?.profile?.accessories || "",
                style: selectedCharacter?.profile?.style || ""
            }
        };
        dispatch({ type: 'ADD_CAST', payload: newMember });
        dispatch({ type: 'ADD_LOG', payload: { message: `Character added to cast (${label})`, type: 'success' } });
    };



    const downloadImage = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="h-full bg-[#0f0f11] flex overflow-hidden">
            {/* LEFT: WARDROBE LIBRARY */}
            <div className="w-96 border-r border-gray-800 bg-[#18181b] flex flex-col ">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-sm font-black text-white tracking-widest uppercase">Wardrobe Library</h2>
                    <div className="flex gap-1.5">
                        <button onClick={() => document.getElementById('wardrobe-upload-input')?.click()} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400" title="Upload Costume">
                            <Upload className="w-3.5 h-3.5" />
                            <input id="wardrobe-upload-input" type="file" className="hidden" accept="image/*" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleUploadCostume} />
                        </button>
                        <button onClick={() => withLibraryTransition(scanWardrobe)} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400" title="Scan Folder">
                            <RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-4">
                    {!state.saveDirectoryHandle && !state.saveDirectoryPath && (
                        <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                            <p className="text-[10px] text-yellow-500 font-bold leading-relaxed">
                                ⚠️ PLEASE SELECT A SAVE FOLDER IN SETTINGS TO ENABLE LOCAL WARDROBE STORAGE.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        {libraryLoading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <WardrobeLibrarySkeletonCard key={`wardrobe-skeleton-${i}`} />
                            ))
                        ) : (
                            state.wardrobeItems.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedCostume(item)}
                                    className={`aspect-square rounded-lg border overflow-hidden transition-all group relative cursor-pointer ${selectedCostume?.id === item.id ? 'border-yellow-500 border-2' : 'border-gray-800 hover:border-gray-600'}`}
                                >
                                    <img src={item.url} className="w-full h-full transition-transform group-hover:scale-110 object-contain" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
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

                                    <span className="text-[8px] font-bold text-white uppercase truncate absolute bottom-2 left-2 right-2 text-center">{item.name}</span>
                                </div>
                            ))
                        )}
                    </div>

                    {state.wardrobeItems.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30">
                            <Shirt className="w-10 h-10 mb-2" />
                            <span className="text-[10px] uppercase font-bold tracking-tighter">Library Empty</span>
                        </div>
                    )}
                </div>
            </div>

            {/* CENTER: WORKSPACE */}
            <div className="flex-grow flex flex-col bg-[#09090b]">
                {/* TABS */}
                <div className="flex bg-[#18181b] px-4 pt-4 gap-4 border-b border-gray-800">
                    <button
                        onClick={() => setActiveTab('designer')}
                        className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'designer' ? 'border-yellow-500 text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Costume Designer
                    </button>
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'library' ? 'border-yellow-500 text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Virtual Try-On Room
                    </button>
                    <div className="flex-grow" />
                    <button
                        onClick={() => {
                            dispatch({ type: 'SET_HELP_SECTION', payload: 'tab' });
                            dispatch({ type: 'TOGGLE_HELP', payload: true });
                        }}
                        title="Wardrobe Help"
                        className="pb-3 px-2 text-gray-500 hover:text-yellow-500 transition-colors"
                    >
                        <HelpCircle className="w-4 h-4" />
                    </button>
                </div>

                <div className={`flex-grow min-h-0 ${activeTab === 'designer' ? 'overflow-hidden p-4' : 'overflow-hidden p-4 flex flex-col'}`}>
                    {activeTab === 'designer' ? (
                        <div className="w-full h-full flex gap-6 min-h-0">
                            {/* LEFT: DESIGN CONTROLS */}
                            <div className="w-[380px] shrink-0 flex flex-col h-full min-h-0">
                                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                    {/* DESIGN REFERENCE (UPLOAD) */}
                                    <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 ">
                                        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                                            <Upload className="w-4 h-4 text-blue-400" /> Design Reference
                                        </h3>

                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                                Reference Type
                                            </div>
                                            <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
                                                <button
                                                    onClick={() => setDesignerRefKind('sketch')}
                                                    className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${designerRefKind === 'sketch'
                                                        ? 'ring-2 ring-white text-white -[0_0_8px_rgba(255,255,255,0.8)] bg-black/60'
                                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                                        }`}
                                                >
                                                    Sketch
                                                </button>
                                                <button
                                                    onClick={() => setDesignerRefKind('costume')}
                                                    className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${designerRefKind === 'costume'
                                                        ? 'ring-2 ring-white text-white -[0_0_8px_rgba(255,255,255,0.8)] bg-black/60'
                                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                                        }`}
                                                >
                                                    Costume
                                                </button>
                                            </div>
                                        </div>

                                        <div
                                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDesignerDropActive(true); }}
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDesignerDropActive(true); }}
                                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDesignerDropActive(false); }}
                                            onDrop={handleDropDesignerReference}
                                            className={`rounded-xl border border-dashed p-4 transition-all ${designerDropActive ? 'border-blue-500/70 bg-blue-500/5' : 'border-white/10 bg-black/20'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                                        <Upload className="w-5 h-5 text-gray-400" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-white leading-tight">
                                                            {designerRefImage ? 'Reference loaded' : 'Drop a reference image'}
                                                        </div>
                                                        <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                                            {designerRefKind === 'sketch' ? 'Sketch/Pattern' : 'Costume Photo'} • Session only
                                                        </div>
                                                    </div>
                                                </div>

                                                <label className="shrink-0 text-[9px] font-bold text-gray-200 hover:text-white cursor-pointer bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 transition-colors">
                                                    Upload
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/*"
                                                        onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                                        onChange={handleUploadDesignerReference}
                                                    />
                                                </label>
                                            </div>

                                            {designerRefImage && (
                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Active</div>
                                                        <div className="text-sm font-bold text-white truncate">{designerRefName || 'Reference'}</div>
                                                    </div>
                                                    <button
                                                        onClick={clearDesignerWorkspace}
                                                        className="shrink-0 bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white px-3 py-2 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-wider transition-all"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-3 text-[10px] text-gray-500 leading-relaxed">
                                            The main viewport shows your uploaded reference until you generate a finished costume.
                                        </div>
                                    </div>

                                    {/* PROMPT + GENERATE */}
                                    <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 ">
                                        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-yellow-500" /> Designer Workshop
                                        </h3>
                                        <HelpTooltip zone="wardrobe" id="fabricEditor">
                                            <textarea
                                                className="w-full bg-[#09090b] border border-[#27272a] p-4 rounded-xl text-sm text-gray-200 focus:border-yellow-500 focus:outline-none transition-colors h-40 resize-none mb-4"
                                                placeholder="Describe the outfit you want (materials, silhouette, details, colors)..."
                                                value={designerPrompt}
                                                onChange={(e) => setDesignerPrompt(e.target.value)}
                                            />
                                        </HelpTooltip>
                                        <InlineHint zone="wardrobe" id="fabricEditor" className="mb-4" />
                                        <button
                                            onClick={handleDesignerGenerate}
                                            disabled={
                                                state.isProcessing || 
                                                !designerPrompt ||
                                                (state.billingEntitlements.effectiveBillingMode === "hosted" && !state.billingEntitlements.hasHostedAccess) || (state.billingEntitlements.effectiveBillingMode === "byok" && (!state.billingEntitlements.hasByokAccess || !state.apiKey))
                                            }
                                            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            Generate Costume
                                        </button>
                                    </div>

                                    {/* BRANDING */}
                                    <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 ">
                                        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-[#eab308] fill-[#eab308]" /> Branding & Identity
                                        </h3>

                                        <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-4">
                                            <div className="flex items-start gap-4">
                                                <label className="relative group cursor-pointer shrink-0">
                                                    <div className="w-16 h-16 rounded-lg border-2 border-dashed border-white/10 group-hover:border-blue-500/50 flex flex-col items-center justify-center transition-all bg-black/20 overflow-hidden">
                                                        {brandingLogo ? (
                                                            <img src={brandingLogo} className="w-full h-full object-contain" alt="Branding Logo" />
                                                        ) : (
                                                            <Upload className="w-6 h-6 text-gray-500 group-hover:text-blue-400" />
                                                        )}
                                                    </div>
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/*"
                                                        onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (ev) => setBrandingLogo(ev.target?.result as string);
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                    {brandingLogo && (
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); setBrandingLogo(null); }}
                                                            className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-400 transition-all"
                                                            title="Remove Logo"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </label>

                                                <div className="flex-grow min-w-0">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Logo Position</div>
                                                    <select
                                                        value={logoPosition}
                                                        onChange={(e) => setLogoPosition(e.target.value)}
                                                        className="w-full bg-[#09090b] border border-[#27272a] p-2 rounded-lg text-xs text-gray-200 focus:border-yellow-500 focus:outline-none"
                                                    >
                                                        <option value="Center Chest">Center Chest</option>
                                                        <option value="Left Chest">Left Chest</option>
                                                        <option value="Right Chest">Right Chest</option>
                                                        <option value="Upper Back">Upper Back</option>
                                                        <option value="Lower Back">Lower Back</option>
                                                        <option value="Left Sleeve">Left Sleeve</option>
                                                        <option value="Right Sleeve">Right Sleeve</option>
                                                    </select>
                                                    <div className="mt-2 text-[10px] text-gray-500 leading-relaxed">
                                                        Upload a PNG logo (transparent background recommended). This applies to generated costumes and Try-On results.
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: LARGE VIEWPORT */}
                            <div className="flex-grow min-w-0 h-full bg-black rounded-2xl border border-gray-800 flex items-center justify-center overflow-hidden relative group">
                                {designerImage && (
                                    <img ref={designerImgRef} src={designerImage} className="hidden" />
                                )}
                                {designerMask && (
                                    <img ref={maskImgRef} src={designerMask} className="hidden" />
                                )}

                                {(designerImage || designerRefImage) ? (
                                    <div className="relative w-full h-full">
                                        <img
                                            src={designerImage || designerRefImage || ''}
                                            className="w-full h-full object-contain"
                                        />

                                        {/* ACTIONS */}
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-50">
                                            {designerImage ? (
                                                <>
                                                    <button
                                                        onClick={() => saveToWardrobe(designerImage!, designerPrompt)}
                                                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest border border-blue-400 transition-all active:scale-95 flex items-center gap-3"
                                                    >
                                                        <Shirt className="w-4 h-4" /> Save to Wardrobe
                                                    </button>
                                                    <button
                                                        onClick={clearDesignerWorkspace}
                                                        className="bg-red-600/80 hover:bg-red-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest border border-red-500/50 transition-all active:scale-95 flex items-center gap-3"
                                                        title="Discard Generated Costume"
                                                    >
                                                        <X className="w-4 h-4" /> Clear
                                                    </button>
                                                    <button
                                                        onClick={() => downloadImage(designerImage!, `costume-${Date.now()}.png`)}
                                                        className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-all border border-white/10 active:scale-95"
                                                        title="Download Generated Costume"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => downloadImage(designerRefImage!, `reference-${Date.now()}.png`)}
                                                        className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full transition-all border border-white/10 active:scale-95 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                                                        title="Download Reference"
                                                    >
                                                        <Download className="w-4 h-4" /> Download
                                                    </button>
                                                    <button
                                                        onClick={clearDesignerWorkspace}
                                                        className="bg-red-500/80 hover:bg-red-500 text-white px-6 py-3 rounded-full transition-all border border-red-400/30 active:scale-95 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                                                        title="Clear Reference"
                                                    >
                                                        <Trash2 className="w-4 h-4" /> Clear
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center opacity-20">
                                        <Shirt className="w-16 h-16 mb-4" />
                                        <span className="text-xs font-black uppercase tracking-widest text-[#a1a1aa]">Awaiting Design</span>
                                    </div>
                                )}

                                <div className="absolute top-4 right-4 flex items-center gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const img = designerImage || designerRefImage;
                                            if (img) dispatch({ type: 'SET_INSPECT_IMAGE', payload: img });
                                        }}
                                        disabled={!designerImage && !designerRefImage}
                                        className={`bg-black/60 hover:bg-black/80 text-white p-2 rounded-full border border-white/10 backdrop-blur-sm transition-all active:scale-95 ${(!designerImage && !designerRefImage) ? 'opacity-30 cursor-not-allowed' : ''
                                            }`}
                                        title="Inspect Large"
                                    >
                                        <Maximize className="w-4 h-4" />
                                    </button>

                                    <div className="bg-black/60 px-3 py-1.5 rounded-full border border-white/10 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] backdrop-blur-sm">
                                        Costume Designer
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full flex gap-4">
                            {/* SELECTOR COLUMN */}
                            <div className="w-80 shrink-0 flex flex-col space-y-4 h-full overflow-hidden">
                                <div className="bg-[#18181b] p-4 rounded-2xl border border-gray-800 flex flex-col h-full min-h-0 overflow-hidden">
                                    <div className="flex-grow min-h-0 overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                        <div>
                                            <h3 className="text-xs font-black text-gray-400 uppercase mb-2 tracking-widest flex-shrink-0">1. Selected Subject</h3>
                                            <div className="grid grid-cols-4 gap-2 h-32 overflow-y-auto p-2 border border-gray-800/50 rounded-lg bg-black/20">
                                                {state.cast.map(c => (
                                                    <button
                                                        key={c.id}
                                                        onClick={() => setSelectedCharacter(c)}
                                                        className={`aspect-square rounded border transition-all overflow-hidden ${selectedCharacter?.id === c.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-800 hover:border-gray-600'}`}
                                                    >
                                                        <img src={c.previewUrl || c.url} className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                                {state.cast.length === 0 && (
                                                    <div className="col-span-4 py-8 text-center text-[10px] text-gray-600 uppercase font-bold">No Cast</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-black/20 border border-white/5 rounded-xl p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Selected Wardrobe</span>
                                                <span className={`text-[9px] font-bold ${selectedCostume ? 'text-emerald-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                                    {selectedCostume ? (isDesignReferenceSelected(selectedCostume) ? 'Sketch/Pattern' : 'Costume') : 'None'}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-xs text-gray-200 font-bold truncate">
                                                {selectedCostume ? selectedCostume.name : 'Choose from Library (or generate & save in Costume Designer).'}
                                            </div>

                                            {selectedCostume && (
                                                <div className="mt-3 h-44 rounded-lg border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center">
                                                    <img src={selectedCostume.url} className="w-full h-full object-contain p-2" />
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className="text-xs font-black text-gray-400 uppercase mb-2 tracking-widest border-t border-gray-800 pt-4 flex-shrink-0">2. Fitting Notes</h3>
                                            <textarea
                                                className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-xs text-gray-300 h-20 resize-none focus:border-yellow-500 focus:outline-none"
                                                placeholder="Optional: adjust the fit..."
                                                value={tryOnNote}
                                                onChange={(e) => setTryOnNote(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-gray-800 flex-shrink-0">
                                        <button
                                            onClick={handleTryOn}
                                            disabled={
                                                state.isProcessing || 
                                                !selectedCharacter || 
                                                !selectedCostume ||
                                                (state.billingEntitlements.effectiveBillingMode === "hosted" && !state.billingEntitlements.hasHostedAccess) || (state.billingEntitlements.effectiveBillingMode === "byok" && (!state.billingEntitlements.hasByokAccess || !state.apiKey))
                                            }
                                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.25em] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Execute Virtual Try-On
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* RESULT COLUMN */}
                            <div className="flex-grow flex flex-row bg-black rounded-2xl overflow-hidden border border-gray-800 relative min-w-0">
                                <div
                                    ref={containerRef}
                                    onMouseDown={startInteraction}
                                    onMouseMove={moveInteraction}
                                    onMouseUp={endInteraction}
                                    onMouseLeave={endInteraction}
                                    className="flex-grow h-full bg-black flex items-center justify-center overflow-hidden relative group cursor-crosshair"
                                >
                                    {fittedImage ? (
                                        <>
                                            <img
                                                ref={tryOnImgRef}
                                                src={fittedImage}
                                                className={processedTryOnUrl ? 'hidden' : 'w-full h-full object-contain pointer-events-none'}
                                            />
                                            {processedTryOnUrl && (
                                                <img ref={previewImgRef} src={processedTryOnUrl} className="w-full h-full object-contain pointer-events-none" />
                                            )}

                                            {/* INTERACTION CANVASES */}
                                            <canvas ref={uiCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-50 opacity-50" />
                                            <canvas ref={restorationCanvasRef} className="hidden" />

                                            {/* Internal Processing Canvas (Hidden) */}
                                            <canvas ref={tryOnCanvasRef} className="hidden" />

                                            {isIsolating && (
                                                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
                                                    <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4 -[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                                    <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden border border-white/10">
                                                        <div
                                                            className="h-full bg-blue-500 transition-all duration-200 ease-out -[0_0_10px_rgba(59,130,246,0.8)]"
                                                            style={{ width: `${isolationProgress}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-black text-blue-400 mt-2 uppercase tracking-widest animate-pulse">
                                                        Processing {isolationProgress}%
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center opacity-10">
                                            <UserPlus className="w-24 h-24 mb-6" />
                                            <span className="text-sm font-black uppercase tracking-[0.5em]">Ready for Fitting</span>
                                        </div>
                                    )}

                                    <div className="absolute top-6 left-6 flex items-center gap-2 z-20">
                                        <div className="bg-blue-600 text-[10px] font-black uppercase px-3 py-1 rounded-full text-white ">FITTING MIRROR</div>
                                        <div className="bg-black/40 backdrop-blur-md text-[9px] font-bold text-gray-300 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
                                            {selectedCharacter ? selectedCharacter.name : 'No Subject'} + {selectedCostume ? selectedCostume.name : 'No Costume'}
                                        </div>

                                        {(tryOnSheetFB || tryOnSheetLR) && (
                                            <div className="flex items-center gap-1 ml-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTryOnDisplay('sheetFB'); }}
                                                    disabled={!tryOnSheetFB}
                                                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors ${activeTryOnView === 'sheetFB' ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]' : 'bg-black/40 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                                    title="Show Front/Back Sheet"
                                                >
                                                    FB
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTryOnDisplay('sheetLR'); }}
                                                    disabled={!tryOnSheetLR}
                                                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors ${activeTryOnView === 'sheetLR' ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]' : 'bg-black/40 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                                    title="Show Left/Right Sheet"
                                                >
                                                    LR
                                                </button>
                                            </div>
                                        )}


                                    </div>
                                </div>


                                <div className="w-96 shrink-0 border-l border-white/10 bg-[#18181b]/50 h-full flex flex-col">
                                    <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            {fittedImage ? (removeTryOnBg ? 'Image Adjustments' : 'Try-On Setup') : 'Try-On Setup'}
                                        </h3>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={removeTryOnBg}
                                                onChange={(e) => {
                                                    const next = e.target.checked;
                                                    if (next && !fittedImage) {
                                                        showToast("Generate a fit first.");
                                                        return;
                                                    }
                                                    setRemoveTryOnBg(next);
                                                }}
                                                disabled={!fittedImage}
                                                className="w-4 h-4 accent-blue-500 rounded border-white/10 bg-black cursor-pointer"
                                            />
                                            <Eraser className="w-3.5 h-3.5" /> Remove BG
                                        </label>
                                    </div>

                                    <div className="flex-grow p-4 space-y-4 overflow-hidden">
                                        {removeTryOnBg && fittedImage ? (
                                            <div className="space-y-4">
                                                <div className="bg-black/30 border border-white/10 rounded-xl p-1.5 flex items-center gap-1">
                                                    <button
                                                        onClick={() => setBgToolTab('isolate')}
                                                        className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${bgToolTab === 'isolate' ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'
                                                            }`}
                                                    >
                                                        Isolate
                                                    </button>
                                                    <button
                                                        onClick={() => setBgToolTab('restore')}
                                                        className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${bgToolTab === 'restore' ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'
                                                            }`}
                                                    >
                                                        Restore
                                                    </button>
                                                </div>

                                                {bgToolTab === 'isolate' ? (
                                                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                                                Isolation
                                                            </span>
                                                            <button
                                                                onClick={runTryOnIsolation}
                                                                className="text-[9px] font-bold text-gray-200 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 transition-colors flex items-center gap-1"
                                                            >
                                                                <Sparkles className="w-3 h-3" />
                                                                {tryOnMask ? 'Re-run' : 'Run'}
                                                            </button>
                                                        </div>

                                                        <div className="flex items-center justify-between gap-3 bg-black/20 p-2 rounded-lg border border-white/5">
                                                            <span className="text-[10px] text-gray-400 font-bold w-12 text-right">
                                                                {fringeSize}px
                                                            </span>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="10"
                                                                step="0.5"
                                                                value={fringeSize}
                                                                onChange={(e) => setFringeSize(parseFloat(e.target.value))}
                                                                className="flex-grow h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                            />
                                                        </div>

                                                        <div className="text-[9px] text-gray-500 leading-relaxed">
                                                            {tryOnMask ? 'Isolation ready. Switch to Restore to paint back details.' : 'Run isolation to enable Restore tools.'}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                                                Restore Brush
                                                            </span>
                                                            <button
                                                                onClick={() => setIsBrushActive(!isBrushActive)}
                                                                disabled={!tryOnMask}
                                                                className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-colors ${!tryOnMask
                                                                    ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-gray-400'
                                                                    : isBrushActive
                                                                        ? 'bg-blue-600 text-white border-blue-400/30'
                                                                        : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10'
                                                                    }`}
                                                            >
                                                                {isBrushActive ? 'On' : 'Off'}
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2 items-center">
                                                            <button
                                                                onClick={handleUndo}
                                                                disabled={historyIndex < 0}
                                                                className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 disabled:opacity-40 disabled:hover:bg-white/5 flex items-center justify-center"
                                                                title="Undo"
                                                            >
                                                                <Undo2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={handleRedo}
                                                                disabled={historyIndex >= history.length - 1}
                                                                className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 disabled:opacity-40 disabled:hover:bg-white/5 flex items-center justify-center"
                                                                title="Redo"
                                                            >
                                                                <Redo2 className="w-4 h-4" />
                                                            </button>

                                                            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest text-center">
                                                                {historyIndex === -1 ? 0 : historyIndex + 1}/{history.length}
                                                            </div>
                                                        </div>

                                                        {isBrushActive && (
                                                            <div className="flex items-center gap-3 bg-black/20 p-2 rounded-lg border border-white/5">
                                                                <span className="text-[10px] text-gray-400 font-bold w-12 text-right">{brushSize}px</span>
                                                                <input
                                                                    type="range"
                                                                    min="1"
                                                                    max="100"
                                                                    value={brushSize}
                                                                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    className="flex-grow h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="text-[9px] text-gray-500 leading-relaxed">
                                                            Paint on the image to restore original pixels (requires isolation).
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 truncate">
                                                                Character Sheet (Identity Anchor)
                                                            </div>
                                                            <div className="text-[9px] text-gray-500 font-bold leading-relaxed">
                                                                Optional • Recommended for Turnaround.
                                                            </div>
                                                        </div>

                                                        <label className="shrink-0 text-[9px] font-bold text-gray-200 hover:text-white cursor-pointer bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 transition-colors flex items-center gap-1.5">
                                                            <Upload className="w-3.5 h-3.5" /> Upload
                                                            <input type="file" className="hidden" accept="image/*" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleUploadTryOnCharacterSheet} />
                                                        </label>
                                                    </div>

                                                    <div className="bg-black/40 border border-white/10 rounded-lg p-2 flex items-center gap-3">
                                                        <div className="w-14 h-14 rounded-md border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center shrink-0">
                                                            {tryOnCharacterSheet ? (
                                                                <img src={tryOnCharacterSheet} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <UserPlus className="w-6 h-6 opacity-20" />
                                                            )}
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="text-xs text-gray-200 font-semibold leading-tight">
                                                                {tryOnCharacterSheet ? 'Loaded.' : 'None loaded.'}
                                                            </div>
                                                            {tryOnCharacterSheet && (
                                                                <button
                                                                    onClick={() => setTryOnCharacterSheet(null)}
                                                                    className="mt-2 text-[9px] font-bold text-red-400 hover:text-red-300 uppercase tracking-widest"
                                                                >
                                                                    Remove
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Output Views</div>
                                                        <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                                            {tryOnOutputMode === 'front' ? '1 image' : '2 images'}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => setTryOnOutputMode('front')}
                                                            className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${tryOnOutputMode === 'front'
                                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                                : 'bg-black/20 border-white/10 text-gray-300 hover:bg-white/5'
                                                                }`}
                                                        >
                                                            Front
                                                        </button>
                                                        <button
                                                            onClick={() => setTryOnOutputMode('turnaround')}
                                                            className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${tryOnOutputMode === 'turnaround'
                                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                                : 'bg-black/20 border-white/10 text-gray-300 hover:bg-white/5'
                                                                }`}
                                                        >
                                                            Turnaround
                                                        </button>
                                                    </div>

                                                    <p className="text-[9px] text-gray-500 leading-relaxed">
                                                        Turnaround generates two sheets: <span className="text-gray-300 font-bold">Front+Back</span> and <span className="text-gray-300 font-bold">Left+Right</span>.
                                                    </p>
                                                </div>

                                                <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                                                    <div className="text-[9px] text-gray-500 font-bold leading-relaxed">
                                                        Upload Sketch/Costume + Branding in <span className="text-gray-300">Costume Designer</span>.
                                                    </div>
                                                    <button
                                                        onClick={() => setActiveTab('designer')}
                                                        className="shrink-0 bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-2 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-wider"
                                                    >
                                                        Open
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 border-t border-white/10 bg-[#09090b]/50 shrink-0 space-y-3">
                                        <button onClick={handleAddToCast} className="w-full bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-emerald-500/20 hover:-[0_0_15px_rgba(16,185,129,0.4)] text-[10px] font-black uppercase tracking-wider" title="Add to Session Cast">
                                            <UserPlus className="w-4 h-4" /> Add to Cast
                                        </button>

                                        <button onClick={handleOpenSaveModal} className="w-full bg-purple-500/10 hover:bg-purple-500 text-purple-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-purple-500/20 hover:-[0_0_15px_rgba(168,85,247,0.4)] text-[10px] font-black uppercase tracking-wider" title="Save to Actor Library">
                                            <FolderPlus className="w-4 h-4" /> Save to Library
                                        </button>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => downloadImage(processedTryOnUrl || fittedImage!, `fitted-${selectedCharacter?.name || 'character'}.png`)} className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-blue-500/20 hover:-[0_0_15px_rgba(37,99,235,0.4)] text-[10px] font-black uppercase tracking-wider" title="Download">
                                                <Download className="w-4 h-4" /> Save
                                            </button>
                                            <button onClick={() => {
                                                setSelectedCostume(null);
                                                updateState({
                                                    fittedImage: null,
                                                    tryOnMask: null,
                                                    restorationLayer: null,
                                                    removeBg: false,
                                                    history: [],
                                                    historyIndex: -1,
                                                    processedTryOnUrl: null
                                                });
                                            }} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-red-500/20 hover:-[0_0_15px_rgba(239,68,68,0.4)] text-[10px] font-black uppercase tracking-wider" title="Clear/Discard">
                                                <X className="w-4 h-4" /> Clear
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}



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
                        backgrounds={{
                            realism: styleRealism,
                            animation: styleAnimation,
                            illustration: styleIllustration,
                            scifi: styleScifi
                        }}
                    />
                    <ConfirmDialog
                        isOpen={!!confirmDelete}
                        onClose={() => setConfirmDelete(null)}
                        onConfirm={executeDelete}
                        title="Delete Costume?"
                        message={confirmDelete ? (
                            <>
                                Are you sure you want to delete <span className="text-white font-bold">{confirmDelete.name}</span>? This action cannot be undone.
                            </>
                        ) : ""}
                        confirmText="Delete"
                        cancelText="Cancel"
                        variant="danger"
                    />

                    {/* TOAST OVERLAY */}
                    <AnimatePresence>
                        {notification && (
                            <motion.div
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#09090b] border border-yellow-500/50 text-white px-6 py-3 rounded-full backdrop-blur-xl z-[5000] flex items-center gap-3"
                            >
                                <CheckCircle2 className="w-5 h-5 text-yellow-500" />
                                <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default WardrobeStudio;



