
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, RefreshCcw, Maximize, Shirt, Sparkles, Download,
  UserPlus, X, Eraser, Trash2, Undo2, Redo2, CheckCircle2, FolderPlus, Zap
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import type { WardrobeItem, CastMember, WardrobeState } from '../context/AppContext';
import { nativeJoinPath, nativeListFiles, nativeReadFile, nativeWriteFile } from '../utils/NativeFileAssets';
import { removeBackground } from "@imgly/background-removal";
// Style Imports for Save Modal
import styleRealism from '../assets/styles/style_exact_studio_masc.png';
import styleAnimation from '../assets/styles/style_pixar_masc.png';
import styleIllustration from '../assets/styles/style_retro_anime_masc.png';
import styleScifi from '../assets/styles/style_cyberpunk_masc.png';
import ActorSaveModal from './ActorSaveModal';
import HelpTooltip from './ui/HelpTooltip';
import InlineHint from './ui/InlineHint';
import ConfirmDialog from './ui/ConfirmDialog';

// --- WARDROBE STUDIO COMPONENT ---
const WardrobeStudio = () => {
  const { state, dispatch } = useAppContext();
  const [activeTab, setActiveTab] = useState<'designer' | 'library'>('designer');
  // GLOBAL STATE MAPPING
  const {
    fittedImage, tryOnMask, restorationLayer, removeBg: removeTryOnBg,
    fringeSize, brushSize, history, historyIndex, isBrushActive: globalIsBrushActive,
    tryOnNote, processedTryOnUrl, brandingLogo, logoPosition
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

  // Use global isBrushActive
  const isBrushActive = globalIsBrushActive;

  // Local Transient State
  const [designerPrompt, setDesignerPrompt] = useState("");
  const [designerImage, setDesignerImage] = useState<string | null>(null);
  const [designerMask, setDesignerMask] = useState<string | null>(null);
  const [selectedCostume, setSelectedCostume] = useState<WardrobeItem | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<CastMember | null>(null);

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

  // Draggable Panel State
  // Draggable Panel State Removed

  // Refs
  const tryOnImgRef = useRef<HTMLImageElement>(null); // The Base Image (Fitted)
  const previewImgRef = useRef<HTMLImageElement>(null); // The Composite Result

  // --- SAVE TO ACTOR LIBRARY STATE ---
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCategory, setSaveCategory] = useState("Realism");
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

    // NATIVE MODE SUPPORT
    if (state.saveDirectoryPath) {
      try {
        const root = state.saveDirectoryPath;
        const actorsDir = await nativeJoinPath(root, 'Actors');
        const catDir = await nativeJoinPath(actorsDir, targetCategory);

        // Ensure Category Directory exists (not actor subfolder)
        // nativeWriteFile handles directory creation recursively

        // REVERT TO GENERIC NAMING (User Request: "Original generic ACTOR #")
        // We ignore the input name for the FILE, but keep it in metadata.
        const timestamp = Date.now();
        const safeName = `Actor-${timestamp}`;

        // FLAT STRUCTURE: Write directly to .../Category/Name.png
        const portraitPath = await nativeJoinPath(catDir, `${safeName}.png`);
        const res = await fetch(sourceImage);
        const blob = await res.blob();
        const saveImg = await nativeWriteFile(portraitPath, blob);

        if (!saveImg) throw new Error("Failed to write image file");

        // Map Category to a valid Style for Library Filtering
        const catToStyle: Record<string, string> = {
          "Realism": "exact_studio",
          "Stylized Cartoon": "family_3d",
          "Illustration": "retro_anime",
          "Sci-Fi": "cyberpunk_neon",
          "Extras": "exact_studio"
        };
        const activeStyle = catToStyle[targetCategory] || "exact_studio";

        // Save Metadata
        const metaPath = await nativeJoinPath(catDir, `${safeName}.json`);
        const metadata = {
          id: crypto.randomUUID(),
          name: targetName || safeName, // Keep their typed name in metadata
          category: targetCategory,
          created: timestamp,
          tags: ["wardrobe_fit"],
          baseImage: `${safeName}.png`,
          style: activeStyle
        };
        const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
        const saveMeta = await nativeWriteFile(metaPath, metaBlob);

        if (!saveMeta) throw new Error("Failed to write metadata file");

        // INSTANT UI UPDATE
        const newActor: any = {
          id: metadata.id,
          name: metadata.name,
          url: sourceImage, // Use Blob URL for immediate render!
          tag: 'front',
          profile: {
            identity: metadata.name,
            style: activeStyle,
            wardrobe: "Fitted",
            accessories: ""
          }
        };
        dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });

        setShowSaveModal(false);
        // Alert removed after verification
        dispatch({ type: 'ADD_LOG', payload: { message: `Saved Actor (Native): ${safeName}`, type: 'success' } });
        return;

      } catch (err: any) {
        console.error("Native Save Failed:", err);
        dispatch({ type: 'ADD_LOG', payload: { message: `Native Save Failed: ${err.message}`, type: 'error' } });
        return;
      }
    }

    if (state.saveDirectoryHandle) {
      try {
        // 1. Get/Create "Actors" folder
        const root = state.saveDirectoryHandle;
        const actorsDir = await root.getDirectoryHandle('Actors', { create: true });

        // 2. Get/Create Category folder
        const catDir = await actorsDir.getDirectoryHandle(targetCategory, { create: true });

        // 3. Create Actor Folder
        const safeName = targetName.replace(/[^a-z0-9\s-_]/gi, '').trim() || `Actor-${Date.now()}`;
        const actorDir = await catDir.getDirectoryHandle(safeName, { create: true });

        // 4. Save Portrait
        const fileHandle = await actorDir.getFileHandle('portrait.png', { create: true });
        const writable = await fileHandle.createWritable();

        const res = await fetch(sourceImage);
        const blob = await res.blob();

        await writable.write(blob);
        await writable.close();

        // 5. Save Metadata (actor.json)
        const metaHandle = await actorDir.getFileHandle('actor.json', { create: true });
        const metaWritable = await metaHandle.createWritable();
        const metadata = {
          id: crypto.randomUUID(),
          name: safeName,
          category: targetCategory,
          created: Date.now(),
          tags: ["wardrobe_fit"],
          baseImage: "portrait.png"
        };
        await metaWritable.write(JSON.stringify(metadata, null, 2));
        await metaWritable.close();

        setShowSaveModal(false);
        // alert("Actor Saved to Library!"); 
        dispatch({ type: 'ADD_LOG', payload: { message: `Saved Actor: ${safeName}`, type: 'success' } });

      } catch (err) {
        console.error("Failed to save to library:", err);
        dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${err}`, type: 'error' } });
      }
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

      const res = await fetch(fittedImage);
      const blob = await res.blob();

      const blobResult = await removeBackground(blob, {
        progress: (_key: string, current: number, total: number) => {
          if (total > 0) setIsolationProgress(Math.round((current / total) * 100));
        }
      });

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

  useEffect(() => {
    scanWardrobe();
  }, [state.saveDirectoryHandle]);

  const saveToWardrobe = async (imageUrl: string, prompt: string) => {
    if (!state.saveDirectoryHandle) return;
    try {
      const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
      const filename = `WARDROBE - ${Date.now()}.png`;
      const fileHandle = await wardrobeHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      await writable.write(blob);
      await writable.close();

      const newItem: WardrobeItem = {
        id: filename,
        url: imageUrl,
        name: prompt.substring(0, 20),
        prompt: prompt,
        category: "Designer",
        timestamp: Date.now()
      };

      dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
      dispatch({ type: 'ADD_LOG', payload: { message: `Costume saved to wardrobe: ${filename} `, type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save wardrobe item: ${e.message} `, type: 'error' } });
    }
  };

  const handleDesignerGenerate = async () => {
    if (!designerPrompt || !state.apiKey) return;
    setDesignerMask(null);
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      const res = await GeminiService.generateImage(
        `Professional standalone apparel photography: ${designerPrompt}. 
         Film quality, detailed fabric texture, cinematic studio lighting, solid white studio background. 
         Isolated garment, no background distractions.Strictly solid white background only.`,
        state.apiKey,
        state.model,
        [],
        { aspectRatio: '1:1' }
      );
      setDesignerImage(res);
      dispatch({ type: 'ADD_LOG', payload: { message: "Costume generated on studio white.", type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleUploadCostume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !state.saveDirectoryHandle) return;
    const file = e.target.files[0];

    try {
      // DUPLICATE CHECK
      if (state.wardrobeItems.some(i => i.id.includes(file.name) || i.name === file.name.split('.')[0])) {
        showToast("Item already exists in library.");
        return;
      }

      const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
      const safeName = `Custom - Costume - ${Date.now()} -${file.name.replace(/[^a-z0-9.]/gi, '_')} `;
      const fileHandle = await wardrobeHandle.getFileHandle(safeName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();

      // Read for immediate display
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setDesignerImage(dataUrl); // Allow previewing
        setDesignerPrompt(file.name.replace(/\.[^/.]+$/, ""));

        const newItem: WardrobeItem = {
          id: safeName,
          url: dataUrl,
          name: file.name.split('.')[0].substring(0, 20),
          prompt: "User Upload",
          category: "General",
          timestamp: Date.now()
        };

        dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
        dispatch({ type: 'ADD_LOG', payload: { message: `Uploaded & Saved: ${file.name} `, type: 'success' } });
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
      if (state.saveDirectoryHandle) {
        try {
          const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: false });
          await wardrobeHandle.removeEntry(item.id);
        } catch (e) { console.warn("Disk delete failed or not found", e); }
      }

      const newItems = state.wardrobeItems.filter(i => i.id !== item.id);
      dispatch({ type: 'SET_WARDROBE_ITEMS', payload: newItems });
      if (selectedCostume?.id === item.id) setSelectedCostume(null);
      dispatch({ type: 'ADD_LOG', payload: { message: `Deleted costume: ${item.name}`, type: 'success' } });

    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Delete failed: ${e.message}`, type: 'error' } });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleTryOn = async () => {
    if (!selectedCharacter || !selectedCostume || !state.apiKey) return;
    setRemoveTryOnBg(false);
    setTryOnMask(null);
    purgeRestorationState(); // Reset Paint History
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      // Build Dynamic Context
      const subjectIdentity = selectedCharacter.profile?.identity || selectedCharacter.name;
      const subjectStyle = selectedCharacter.profile?.style || "Matching Style";
      const costumeName = selectedCostume.name;

      // Build Image Array for pass 1
      const inputImages = [
        { url: selectedCharacter.url, label: "Subject Reference" },
        { url: selectedCostume.url, label: "Costume Reference" }
      ];

      let brandingInstruction = "";
      if (brandingLogo) {
        inputImages.push({ url: brandingLogo, label: "Branding Logo" });
        brandingInstruction = `
          8. BRANDING & IDENTITY (OVERRIDE)
             - Place the logo from [IMAGE 3] onto the character's clothing.
             - EXACT PLACEMENT: ${logoPosition}.
             - Integrate the logo realistically: it must wrap with the fabric's folds, match the lighting, and follow the texture of the garment.
             - If the clothing already has a logo at that position, replace it with the one from [IMAGE 3].
        `;
      }

      // PASS 1: Generate Fusion
      const res = await GeminiService.generateImage(
        `Perform a professional virtual try-on and fashion fitting. 
         [IMAGE 1] is the target SUBJECT: ${subjectIdentity}.
         The target STYLE/AESTHETIC for the final result is: ${subjectStyle}.
         [IMAGE 2] is the standalone COSTUME ASSET: ${costumeName}.
         
         1. IDENTITY LOCK — SUBJECT
            - Preserve the exact facial identity, features, and ethnicity of the person in [IMAGE 1].
            - Same face, same person, same likeness.
            - No facial morphing, no age change, no style change.

         2. SUBJECT ANATOMY & GENDER PRESERVATION (CRITICAL)
            - Preserve the specific body type, gender, and anatomy of the subject in [IMAGE 1].
            - DO NOT change the subject's gender or physical build to match the costume's source character.
            - The subject's biological sex and physical frame must remain identical to [IMAGE 1].

         3. ADAPTIVE COSTUME FITTING (CROSS-COMPATIBLE)
            - Convert and adapt the apparel from [IMAGE 2] to fit the subject's body naturally and appropriately.
            - Tailor the clothing to the subject's specific gender-specific anatomy (e.g. feminine tailoring for females, masculine for males).
            - The clothing must feel LIKE IT WAS DESIGNED FOR the person in [IMAGE 1].
            - No "rigid mascot" effects unless explicitly requested. The clothing should be flexible fabric unless [IMAGE 2] is clearly metal armor.

         4. STYLE TRANSLATION & UNIFICATION
            - Match the overall rendering style, realism, and aesthetic of the subject in [IMAGE 1].
            - STYLE RULE: If [IMAGE 1] is a realistic photograph, the costume from [IMAGE 2] must be rendered as realistic clothing with realistic fabric textures, even if [IMAGE 2] is a cartoon, 3D render, or illustration.
            - The final output must be a single, cohesive image with no clashing styles.

         5. CLEAN SLATE SUBJECT PREPARATION
            - Remove all existing clothing, headwear, goggles, helmets, accessories, and props from [IMAGE 1].
            - Use only the actor’s face, skin, and basic body volume as the internal wearer.

         6. COSTUME FIDELITY
            - Maintain the key design elements of the costume in [IMAGE 2] (colors, logos, textures, specific patterns).
            - Integrate these elements seamlessly into the new fitted garment.

         7. COMPOSITION
            - Single subject only. Full body visible. No cropping head/feet.
            - Solid white studio background (#FFFFFF).
            
         ${brandingInstruction}

         [FITTING NOTES]: ${tryOnNote || "Ensure a perfect tailored fit."}

         NEGATIVE CONSTRAINTS:
         original accessories from [IMAGE 1], human shoes, floating head,
         elongated neck, mannequin, reference panels, text, watermark, 
         extra limbs, cropped anatomy, changing subject gender, 
         clashing rendering styles, distorted proportions.`,
        state.apiKey,
        state.model,
        inputImages,
        { aspectRatio: '1:1' }
      );
      setFittedImage(res);

      // PASS 2: Auto-Isolation REMOVED per user request (Manual Trigger Only)
      dispatch({ type: 'ADD_LOG', payload: { message: "Fitting complete. Ready for isolation.", type: 'success' } });

    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleAddToCast = async () => {
    // Strictly use the current visual state. No new processing.
    const finalUrl = processedTryOnUrl || fittedImage;
    if (!finalUrl || !selectedCharacter) return;
    const newMember: CastMember = {
      id: `fitted-${Date.now()}`,
      url: finalUrl,
      tag: 'front',
      name: `${selectedCharacter.name} (Fitted)`,
      profile: {
        identity: selectedCharacter.profile?.identity || selectedCharacter.name,
        wardrobe: selectedCostume?.prompt || "Selected Wardrobe",
        accessories: selectedCharacter.profile?.accessories || "",
        style: selectedCharacter.profile?.style || ""
      }
    };
    dispatch({ type: 'ADD_CAST', payload: newMember });
    dispatch({ type: 'ADD_LOG', payload: { message: "Character added to cast library", type: 'success' } });
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
      <div className="w-80 border-r border-gray-800 bg-[#18181b] flex flex-col shadow-xl">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-black text-white tracking-widest uppercase">Wardrobe Library</h2>
          <div className="flex gap-1.5">
            <label className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 cursor-pointer" title="Upload Costume">
              <Upload className="w-3.5 h-3.5" />
              <input type="file" className="hidden" accept="image/*" onChange={handleUploadCostume} />
            </label>
            <button onClick={scanWardrobe} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400" title="Scan Folder">
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
            {state.wardrobeItems.map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedCostume(item)}
                className={`aspect-square rounded-lg border overflow-hidden transition-all group relative cursor-pointer ${selectedCostume?.id === item.id ? 'border-yellow-500 border-2 shadow-lg shadow-yellow-500/20' : 'border-gray-800 hover:border-gray-600'}`}
              >
                <img src={item.url} className={`w-full h-full transition-transform group-hover:scale-110 ${item.category === 'Designer' ? 'object-cover' : 'object-contain p-2 bg-black/50'}`} />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                    }}
                    className="bg-blue-500/80 hover:bg-blue-500 text-white p-1.5 rounded-full shadow-lg cursor-pointer"
                    title="Inspect Large"
                  >
                    <Maximize className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}
                    className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-full shadow-lg cursor-pointer transition-transform hover:scale-110"
                    title="Delete Costume"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className="text-[8px] font-bold text-white uppercase truncate absolute bottom-2 left-2 right-2 text-center">{item.name}</span>
              </div>
            ))}
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
        </div>

        <div className={`flex-grow ${activeTab === 'designer' ? 'overflow-y-auto p-8' : 'overflow-hidden p-4 flex flex-col'}`}>
          {activeTab === 'designer' ? (
            <div className="max-w-4xl mx-auto grid grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 shadow-xl">
                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-500" /> Designer Workshop
                  </h3>
                  <HelpTooltip zone="wardrobe" id="fabricEditor">
                    <textarea
                      className="w-full bg-[#09090b] border border-[#27272a] p-4 rounded-xl text-sm text-gray-200 focus:border-yellow-500 focus:outline-none transition-colors h-40 resize-none mb-4"
                      placeholder="Describe the clothing (e.g. 'A futuristic chrome-plated flight suit with neon orange cabling')..."
                      value={designerPrompt}
                      onChange={(e) => setDesignerPrompt(e.target.value)}
                    />
                  </HelpTooltip>
                  <InlineHint zone="wardrobe" id="fabricEditor" className="mb-4" />
                  <button
                    onClick={handleDesignerGenerate}
                    disabled={state.isProcessing || !designerPrompt}
                    className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-yellow-500/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Generate Costume
                  </button>
                </div>
              </div>

              <div className="aspect-square bg-black rounded-2xl border border-gray-800 shadow-2xl flex items-center justify-center overflow-hidden relative group bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
                {designerImage && (
                  <img
                    ref={designerImgRef}
                    src={designerImage}
                    className="hidden"
                  />
                )}

                {designerMask && (
                  <img
                    ref={maskImgRef}
                    src={designerMask}
                    className="hidden"
                  />
                )}

                {designerImage ? (
                  <div className="relative w-full h-full">
                    <img src={designerImage} className="w-full h-full object-contain" />
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-50">
                      <button
                        onClick={() => saveToWardrobe(designerImage!, designerPrompt)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-blue-900/40 border border-blue-400 transition-all active:scale-95 flex items-center gap-3"
                      >
                        <Shirt className="w-4 h-4" /> Save to Wardrobe
                      </button>
                      <button
                        onClick={() => downloadImage(designerImage!, `costume-${Date.now()}.png`)}
                        className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-all border border-white/10 active:scale-95"
                        title="Download Asset"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center opacity-20">
                    <Shirt className="w-16 h-16 mb-4" />
                    <span className="text-xs font-black uppercase tracking-widest text-[#a1a1aa]">Awaiting Creation</span>
                  </div>
                )}

                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_INSPECT_IMAGE', payload: designerImage! }); }}
                    className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-full border border-white/10 backdrop-blur-sm transition-all active:scale-95"
                    title="Inspect Large"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                  <div className="bg-black/60 px-3 py-1.5 rounded-full border border-white/10 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] backdrop-blur-sm">
                    Designer Workshop
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex gap-4">
              {/* SELECTOR COLUMN */}
              <div className="w-80 shrink-0 flex flex-col space-y-4 h-full overflow-hidden">
                <div className="bg-[#18181b] p-4 rounded-2xl border border-gray-800 shadow-xl flex flex-col h-full overflow-hidden">
                  <h3 className="text-xs font-black text-gray-400 uppercase mb-2 tracking-widest flex-shrink-0">1. Selected Subject</h3>
                  <div className="grid grid-cols-4 gap-2 mb-4 h-32 overflow-y-auto p-2 flex-shrink-0 border border-gray-800/50 rounded-lg bg-black/20">
                    {state.cast.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCharacter(c)}
                        className={`aspect-square rounded border transition-all overflow-hidden ${selectedCharacter?.id === c.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-800 hover:border-gray-600'}`}
                      >
                        <img src={c.url} className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {state.cast.length === 0 && (
                      <div className="col-span-4 py-8 text-center text-[10px] text-gray-600 uppercase font-bold">No Cast</div>
                    )}
                  </div>

                  <h3 className="text-xs font-black text-gray-400 uppercase mb-2 tracking-widest border-t border-gray-800 pt-4 flex-shrink-0">2. Active Wardrobe</h3>
                  <div className="bg-[#09090b] rounded-xl border border-gray-800 mb-4 flex-grow min-h-0 flex items-center justify-center overflow-hidden">
                    {selectedCostume ? (
                      <img src={selectedCostume.url} className="w-full h-full object-contain p-2" />
                    ) : (
                      <Shirt className="w-10 h-10 opacity-10" />
                    )}
                  </div>

                  <h3 className="text-xs font-black text-gray-400 uppercase mb-2 tracking-widest border-t border-gray-800 pt-4 flex-shrink-0">3. Fitting Notes</h3>
                  <textarea
                    className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-xs text-gray-300 h-16 resize-none mb-2 focus:border-yellow-500 focus:outline-none flex-shrink-0"
                    placeholder="Optional: adjust the fit..."
                    value={tryOnNote}
                    onChange={(e) => setTryOnNote(e.target.value)}
                  />

                  <div className="mt-auto pt-2 border-t border-gray-800 flex-shrink-0">
                    <button
                      onClick={handleTryOn}
                      disabled={state.isProcessing || !selectedCharacter || !selectedCostume}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Execute Virtual Try-On
                    </button>
                  </div>
                </div>
              </div>

              {/* RESULT COLUMN */}
              <div className="flex-grow flex flex-row bg-[#09090b] rounded-2xl overflow-hidden border border-gray-800 shadow-xl relative min-w-0">
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
                          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                          <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden border border-white/10">
                            <div
                              className="h-full bg-blue-500 transition-all duration-200 ease-out shadow-[0_0_10px_rgba(59,130,246,0.8)]"
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
                    <div className="bg-blue-600 text-[10px] font-black uppercase px-3 py-1 rounded-full text-white shadow-lg">FITTING MIRROR</div>
                    <div className="bg-black/40 backdrop-blur-md text-[9px] font-bold text-gray-300 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
                      {selectedCharacter ? selectedCharacter.name : 'No Subject'} + {selectedCostume ? selectedCostume.name : 'No Costume'}
                    </div>
                  </div>

                </div>

                {fittedImage && (
                  <div className="w-80 shrink-0 border-l border-white/10 bg-[#18181b]/50 h-full flex flex-col animate-in slide-in-from-right-10 duration-300">
                    <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Image Adjustments</h3>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
                        <input
                          type="checkbox"
                          checked={removeTryOnBg}
                          onChange={(e) => setRemoveTryOnBg(e.target.checked)}
                          className="w-4 h-4 accent-blue-500 rounded border-white/10 bg-black cursor-pointer"
                        />
                        <Eraser className="w-3.5 h-3.5" /> Remove BG
                      </label>
                    </div>

                    <div className="flex-grow overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                      {removeTryOnBg ? (
                        <>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Edge Refinement</span>

                              {tryOnMask ? (
                                <div className="flex items-center gap-1.5 text-blue-400">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span className="text-[9px] font-bold uppercase">Isolated</span>
                                </div>
                              ) : (
                                <button
                                  onClick={runTryOnIsolation}
                                  className="text-[9px] font-bold text-gray-400 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded transition-colors"
                                >
                                  <Sparkles className="w-3 h-3" /> Run
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-3 bg-black/20 p-2 rounded-lg border border-white/5">
                              <span className="text-[10px] text-gray-400 font-bold w-8 text-right">{fringeSize}px</span>
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
                          </div>

                          <div className="pt-4 border-t border-white/5 space-y-3">
                            <div className="flex flex-col w-full gap-2">
                              <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none">Restore</span>
                              <HelpTooltip zone="wardrobe" id="restorationTools">
                                <div className="w-full flex items-center justify-between gap-1 bg-black/40 rounded-lg p-1 border border-white/10">
                                  <div className="relative group/history">
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black border border-gray-700 px-2 py-1 rounded text-[9px] text-gray-300 opacity-0 group-hover/history:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                                      History State: {historyIndex}
                                    </div>
                                    <span className="text-xs font-bold text-blue-400 font-mono px-2 select-none bg-blue-900/30 rounded border border-blue-500/30 min-w-[36px] text-center whitespace-nowrap block">
                                      {historyIndex === -1 ? '0' : historyIndex + 1} / {history.length}
                                    </span>
                                  </div>

                                  <button
                                    onClick={() => setIsBrushActive(!isBrushActive)}
                                    className={`p-1.5 rounded transition-all ${isBrushActive
                                      ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]'
                                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                                      }`}
                                    title="Restore Mask Brush"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20a6 6 0 0 0-12 0" /><path d="M12 20v-6" /><path d="M12 14a4 4 0 0 1 4-4V5a4 4 0 0 0-8 0v5a4 4 0 0 1 4 4z" /></svg>
                                  </button>
                                  <div className="w-px h-3 bg-white/10 mx-0.5" />
                                  <button
                                    onClick={handleUndo}
                                    disabled={historyIndex < 0}
                                    className="p-3 rounded hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors group"
                                  >
                                    <Undo2 className="w-4 h-4 pointer-events-none" />
                                  </button>
                                  <button
                                    onClick={handleRedo}
                                    disabled={historyIndex >= history.length - 1}
                                    className="p-3 rounded hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors group"
                                  >
                                    <Redo2 className="w-4 h-4 pointer-events-none" />
                                  </button>
                                </div>
                              </HelpTooltip>
                            </div>

                            {isBrushActive && (
                              <div className="flex items-center gap-3 pl-2 animate-in fade-in slide-in-from-top-1 bg-black/20 p-2 rounded-lg border border-white/5">
                                <span className="text-[9px] font-bold text-gray-500 w-8 text-right">{brushSize}px</span>
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
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                          <Eraser className="w-8 h-8 mb-2" />
                          <span className="text-[10px] font-bold uppercase tracking-widest block max-w-[150px] leading-relaxed">Enable "Remove BG" to access tools</span>
                        </div>
                      )}
                    </div>

                    {/* BRANDING & IDENTITY SECTION */}
                    <div className="p-4 border-t border-white/10 space-y-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#eab308] fill-[#eab308]" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">
                          Branding & Identity
                        </h3>
                      </div>

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
                                onClick={(e) => {
                                  e.preventDefault();
                                  setBrandingLogo(null);
                                }}
                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-lg hover:bg-red-600 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </label>

                          <div className="flex-grow space-y-1">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Logo Position</span>
                            <input
                              type="text"
                              value={logoPosition}
                              onChange={(e) => setLogoPosition(e.target.value)}
                              placeholder="e.g. Center Chest"
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-all font-bold"
                            />
                          </div>
                        </div>

                        <p className="text-[9px] text-gray-500 leading-relaxed italic">
                          Upload a PNG logo (transparent background recommended). Specify exact placement for the weaver.
                        </p>
                      </div>
                    </div>

                    <div className="p-4 border-t border-white/10 bg-[#09090b]/50 shrink-0 space-y-3">
                      <button onClick={handleAddToCast} className="w-full bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] text-[10px] font-black uppercase tracking-wider" title="Add to Session Cast">
                        <UserPlus className="w-4 h-4" /> Add to Cast
                      </button>

                      <button onClick={handleOpenSaveModal} className="w-full bg-purple-500/10 hover:bg-purple-500 text-purple-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-purple-500/20 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] text-[10px] font-black uppercase tracking-wider" title="Save to Actor Library">
                        <FolderPlus className="w-4 h-4" /> Save to Library
                      </button>

                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => downloadImage(processedTryOnUrl || fittedImage!, `fitted-${selectedCharacter?.name || 'character'}.png`)} className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-blue-500/20 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] text-[10px] font-black uppercase tracking-wider" title="Download">
                          <Download className="w-4 h-4" /> Save
                        </button>
                        <button onClick={() => {
                          updateState({
                            fittedImage: null,
                            tryOnMask: null,
                            restorationLayer: null,
                            removeBg: false,
                            history: [],
                            historyIndex: -1,
                            processedTryOnUrl: null
                          });
                        }} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] text-[10px] font-black uppercase tracking-wider" title="Clear/Discard">
                          <X className="w-4 h-4" /> Clear
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {
          confirmDelete && (
            <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
              <div className="bg-[#18181b] border border-gray-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full relative overflow-hidden">
                <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">Delete Costume?</h3>
                <p className="text-sm text-gray-400 mb-6">
                  Are you sure you want to delete <span className="text-white font-bold">{confirmDelete.name}</span>? This cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeDelete}
                    className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )
        }
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
        message={confirmDelete ? `Are you sure you want to delete ${confirmDelete.name}? This action cannot be undone.` : ""}
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
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#09090b] border border-yellow-500/50 text-white px-6 py-3 rounded-full shadow-2xl backdrop-blur-xl z-[5000] flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-yellow-500" />
            <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WardrobeStudio;



