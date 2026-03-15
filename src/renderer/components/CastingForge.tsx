import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors,
  Trash2, Upload, RotateCw, MonitorPlay,
  Eraser, RefreshCw, X,
  Download, UserPlus, Sparkles,
  Search, Calendar, Type, Layers, Folder, HelpCircle,
  Maximize, LayoutTemplate, Share2, Info, CheckCircle2,
  ArrowDownUp, Edit2, FolderInput, Hammer, Lock,
  Undo2, Redo2, Zap
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { removeBackground } from "@imgly/background-removal";
import { GeminiService } from '../services/GeminiService';
import HelpTooltip from './ui/HelpTooltip';
import InlineHint from './ui/InlineHint';
import ConfirmDialog from './ui/ConfirmDialog';

// Types are exported from AppContext
import type { CastMember } from '../context/AppContext';
import {
  saveAssetToDisk,
  loadAssetFromDisk,
  getStudioCoverFilename,
  verifyPermission
} from '../utils/FileSystemAssets';
import { isNativeParams, nativeLoadCover, nativeSaveCover, nativeWriteFile, nativeJoinPath, safeFetchBlob } from '../utils/NativeFileAssets';

import coverRealism from '../assets/cover-realism.png';
import coverAnim from '../assets/cover-anim.png';
import coverIllustration from '../assets/cover-illustration.png';
import coverScifi from '../assets/cover-scifi.png';

const REFERENCE_SHEET_PROMPT = `
Create a professional, 8k resolution character reference sheet
based strictly on the provided fitted character image.

IMPORTANT:
This is a DOCUMENTATION task, not a refitting task.

ABSOLUTE RULES:

1. NO RE-FITTING
- Do NOT alter costume proportions, openings, or geometry.
- Do NOT reposition the face, head, or neck.
- Do NOT reinterpret anatomy.
- Preserve the exact fitted result as-is.

2. IDENTITY PRESERVATION
- The subject must remain the same person across all views.
- Facial features must remain consistent where visible.
- Do NOT invent or exaggerate facial structure.

3. COSTUME PRESERVATION
- The mascot costume is rigid.
- Jaw, mouth opening, and neck opening must remain fixed.
- No stretching, sliding, or reshaping across views.

4. VIEW CONSISTENCY
- Each view shows the SAME fitted character from a different camera angle.
- No duplicates.
- No symmetry mirroring tricks.

5. CAMERA SET
- Full Body: Front, Left Profile, Right Profile, Rear
- Head Close-ups: Front, Left 3/4, Right 3/4, Side Profile

6. COMPOSITION
- Clean neutral background.
- Empty negative space.
- No floating heads.
- No disembodied parts.
- No extra characters.

7. OUTPUT QUALITY
- Crisp, production-ready.
- No artifacts.
- No stylization drift.

NEGATIVE CONSTRAINTS:
refitting, reinterpreting anatomy, moving openings,
elongated necks, stretched costume,
floating heads, mannequins, text, watermarks.
`;

const STUDIO_FOLDERS = [
  { id: 'realism', label: 'Realism', description: "Photorealistic Portraiture & Raw Detail", image: coverRealism, styles: ['exact_studio', 'photorealism', 'dslr_capture'] },
  { id: 'anim', label: 'Stylized Cartoon', description: "Modern 3D Animation & Soft Lighting", image: coverAnim, styles: ['family_3d', 'pixar', 'claymation'] },
  { id: 'illustration', label: 'Illustration', description: "Anime, Noir & Graphic", image: coverIllustration, styles: ['retro_cel', 'graphic_noir', 'retro_anime', 'comic_book'] },
  { id: 'scifi', label: 'Sci-Fi', description: "Cyberpunk & High Tech", image: coverScifi, styles: ['cyberpunk_neon', 'cyberpunk'] },
  { id: 'uncategorized', label: 'Unsorted', description: "No Specific Style", image: null, styles: [] as string[] }
];

// Aggressive normalization: "Family 3D" == "family_3d" == "family-3d"
const normalizeStyle = (s: string | undefined | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');


const CastingForge = () => {
  const { state, dispatch } = useAppContext();

  // Pre-compute styles locally to ensure consistency
  const knownStyles = React.useMemo(() => {
    return new Set(
      STUDIO_FOLDERS
        .filter(f => f.id !== 'uncategorized')
        .flatMap(f => f.styles)
        .map(s => normalizeStyle(s))
    );
  }, []);

  // ... (existing state) ...


  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Crop & Edit State
  const [isCropping, setIsCropping] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number, y: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [aiMaskActive, setAiMaskActive] = useState(false);


  // Draggable Panel State (Removed - Docked Controls)

  // Auto-reset UI when image is cleared
  useEffect(() => {
    if (!state.lastCastedImage) {
      setRemoveBg(false);
      setAiMaskActive(false);
    }
  }, [state.lastCastedImage]);

  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  const [showRefSheet, setShowRefSheet] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [refLayout, setRefLayout] = useState<'form_focus' | 'face_focus' | 'split_focus'>('form_focus');
  const [fringeSize, setFringeSize] = useState(0); // 0-10 pixels
  const [isIsolating, setIsIsolating] = useState(false);
  const [isolationProgress, setIsolationProgress] = useState(0);
  const [brandingLogo, setBrandingLogo] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<string>('');

  // MASK RESTORATION STATE
  const [isBrushActive, setIsBrushActive] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [restorationLayer, setRestorationLayer] = useState<string | null>(null); // Data URL of painted mask
  const [erodedUrl, setErodedUrl] = useState<string | null>(null); // Intermediate eroded state
  const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);


  // HISTORY STATE
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const historyRef = useRef<(string | null)[]>([null]); // Source of Truth for logic
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0); // Synchronous track for rapid undo/redo

  // CACHE REFS (Optimization)
  const cachedBaseImgRef = useRef<HTMLImageElement | null>(null);
  const cachedOriginalImgRef = useRef<HTMLImageElement | null>(null);

  // MANUAL MASK CONTROLS
  // These states were removed as per instruction.

  // EFFECT: Reset Restoration on New Image
  useEffect(() => {
    // When the main image changes, we MUST clear all manual edits
    setRestorationLayer(null);
    setRemoveBg(false); // Reset bg toggle
    setIsBrushActive(false); // Reset brush tool

    // Clear History
    const initialHistory = [null];
    setHistory(initialHistory);
    historyRef.current = initialHistory;
    setHistoryIndex(0);
    historyIndexRef.current = 0;

    // Clear Canvas
    if (restorationCanvasRef.current) {
      const ctx = restorationCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
    }

    // Reset Cursor
    setCursorPos(null);
  }, [state.lastCastedImage]);

  // EFFECT: Composite Layers (Main + Mask + Restoration) -> Preview
  // Crucial for Undo/Redo visual feedback AND Isolation
  useEffect(() => {
    if (!state.lastCastedImage) {
      setProcessedPreviewUrl(null);
      return;
    }

    // Determine if we are effectively removing BG (Must have checkbox AND mask)
    const effectiveRemoveBg = removeBg && !!state.lastCastedMask;

    // If no layers to composite AND not removing BG, show raw
    if (!restorationLayer && !effectiveRemoveBg) {
      setProcessedPreviewUrl(null);
      return;
    }

    const composite = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const mainImg = new Image();
      mainImg.crossOrigin = "anonymous";
      await new Promise(r => {
        mainImg.onload = r;
        mainImg.onerror = r; // Prevent hang
        mainImg.src = state.lastCastedImage!;
      });

      if (mainImg.naturalWidth === 0) {
        console.error("Composite: Main Image failed to load or has 0 width");
        setProcessedPreviewUrl(null);
        return;
      }

      canvas.width = mainImg.naturalWidth;
      canvas.height = mainImg.naturalHeight;

      // 1. Draw Main (Base)
      // If Remove BG is active, we start Transparent.
      // If NOT active (or no mask), we start with Main Image.
      if (!effectiveRemoveBg) {
        ctx.drawImage(mainImg, 0, 0);
      }
      // If Remove BG is TRUE, key assumption: user wants to see CUTOUT + RESTORATION.
      // We do NOT draw the main image background.

      // 2. Draw Mask (Cutout) if available & active
      if (state.lastCastedMask && effectiveRemoveBg) {
        const maskImg = new Image();
        maskImg.crossOrigin = "anonymous";
        await new Promise(r => {
          maskImg.onload = r;
          maskImg.onerror = r;
          maskImg.src = state.lastCastedMask!;
        });
        // Check if loaded
        if (maskImg.naturalWidth > 0) {
          ctx.drawImage(maskImg, 0, 0);
        } else {
          console.warn("Composite: Mask Failed to Load");
        }
      }

      // 3. Draw Restoration (The Magic Part)
      // We want to "Paint Back" the original image where the user stroked.
      if (restorationLayer && effectiveRemoveBg) {
        // Create a mask from the restoration layer (White Strokes)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskCtx = maskCanvas.getContext('2d');

        if (maskCtx) {
          const restImg = new Image();
          await new Promise(r => {
            restImg.onload = r;
            restImg.onerror = r;
            restImg.src = restorationLayer!;
          });

          // Draw Strokes
          if (restImg.naturalWidth > 0) {
            maskCtx.drawImage(restImg, 0, 0);
          } else {
            console.warn("Composite: Restoration Layer Failed to Load");
          }

          // COMPOSITE: 'source-in' -> Keep strict intersection of Stroke + Main Image
          maskCtx.globalCompositeOperation = 'source-in';
          maskCtx.drawImage(mainImg, 0, 0);

          // Now maskCanvas contains "Floating Patches" of the original image

          // Draw these patches onto the main canvas
          ctx.drawImage(maskCanvas, 0, 0);
        }
      }
      // If restoration exists but BG is NOT removed, the restoration is effectively invisible
      // (painting opaque pixels on opaque pixels), so we skip it to save cycles/artifacts.

      // 3. Update Preview
      setProcessedPreviewUrl(canvas.toDataURL());
    };

    composite();
  }, [state.lastCastedImage, restorationLayer, state.lastCastedMask, removeBg]);

  const handleAddToCast = () => {
    if (!state.lastCastedImage) return;
    const finalUrl = processedPreviewUrl || state.lastCastedImage;
    const newCast: CastMember = {
      id: `cast-${Date.now()}`,
      url: finalUrl,
      tag: 'front',
      name: `Cast ${state.cast.length + 1}`,
      profile: {
        identity: state.lastCastedPrompt || "Unknown Identity",
        wardrobe: "",
        accessories: "",
        style: "External Asset"
      }
    };
    dispatch({ type: 'ADD_CAST', payload: newCast });
    dispatch({ type: 'ADD_LOG', payload: { message: "Added to Cast Assets", type: 'success' } });
  };

  const [pendingRefSheet, setPendingRefSheet] = useState<string | null>(null);

  const handleSaveToActorLibrary = async (targetFolderOverride?: string) => {
    // 1. Determine Content (Ref Sheet vs standard Casted Image)
    const isRefSheet = !!pendingRefSheet;
    const finalUrl = pendingRefSheet || processedPreviewUrl || state.lastCastedImage;

    if (!finalUrl) return;

    // 2. Prepare Metadata
    const targetFolderId = targetFolderOverride || activeFolder || 'uncategorized';
    // Find style from folder, or default
    const targetFolder = STUDIO_FOLDERS.find(f => f.id === targetFolderId);
    const assignedStyle = targetFolder ? (targetFolder.styles[0] || 'External Asset') : 'External Asset';

    const timestamp = Date.now();
    const newActorId = isRefSheet ? `ref-${timestamp}` : `actor-${timestamp}`;
    const filename = isRefSheet ? `RefSheet_${timestamp}.png` : `Actor_${timestamp}.png`;
    const name = isRefSheet ? `Ref Sheet ${new Date().toLocaleTimeString()}` : `Actor ${state.actorLibrary.length + 1}`;
    const identity = isRefSheet ? "Reference Sheet" : (state.lastCastedPrompt || "Unknown Identity");

    const targetCategoryLabel = targetFolderId === 'uncategorized' ? '' : (targetFolder?.label || '');

    const newActor: CastMember = {
      id: newActorId,
      url: finalUrl,
      tag: 'front', // Default
      name: name,
      filename: targetCategoryLabel ? `${targetCategoryLabel}/${filename}` : filename, // Important for disk sync
      profile: {
        identity: identity,
        wardrobe: "",
        accessories: "",
        style: assignedStyle
      }
    };

    try {
      // 3. Convert DataURL to Blob for saving
      const res = await fetch(finalUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/png' });

      // 4. Save to Disk (if configured)
      // NATIVE
      if (isNativeParams() && state.saveDirectoryPath) {
        const actorsDir = await nativeJoinPath(state.saveDirectoryPath, 'Actors');
        // Ensure subfolder exists by joining it; nativeWriteFile handles recursive mkdir
        const targetDir = targetCategoryLabel ? await nativeJoinPath(actorsDir, targetCategoryLabel) : actorsDir;
        const fullPath = await nativeJoinPath(targetDir, filename);
        await nativeWriteFile(fullPath, file);
      }
      // WEB
      else if (state.saveDirectoryHandle) {
        const webPath = targetCategoryLabel ? `Actors/${targetCategoryLabel}/${filename}` : `Actors/${filename}`;
        await saveAssetToDisk(state.saveDirectoryHandle, webPath, file);
      }

      // 5. Update State
      dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
      dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Library (${targetFolderId})`, type: 'success' } });
      setShowSaveModal(false); // Close modal if open
      setPendingRefSheet(null); // Clear pending state

    } catch (e: any) {
      console.error("Save Actor Failed", e);
      dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${e.message}`, type: 'error' } });
      // Fallback: Add to memory anyway so user doesn't lose work
      dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
    }
  };

  // ... (Update Ref Sheet Modal Button below) ...


  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);

  const handleGenerate = async () => {
    // CHANGE: "Character design sheet" triggers text layouts. Use "Full body character portrait" instead.
    let effectivePrompt = state.lastCastedPrompt || "A full body character portrait";
    let styleDirectives = "";
    let negativePrompt = "";

    // INJECT SELECTED STYLE into the prompt if defined
    if (selectedStyleId) {
      const folder = STUDIO_FOLDERS.find(f => f.id === selectedStyleId);
      if (folder) {
        // e.g. "Realism studio style, Exact Likeness & Premium CG..."
        const baseStyle = `${folder.label} studio style, ${folder.description}`;

        // STRICT REALISM ENFORCEMENT
        if (selectedStyleId === 'realism') {
          // FORCE PHOTOGRAPHY SEMANTICS
          // PREPEND keywords to prime the model for photography immediately
          effectivePrompt = effectivePrompt.replace("character", "real person");
          effectivePrompt = `Raw unedited candid photo, shot on DSLR. ${effectivePrompt}.`;

          // ROBUST PHOTOGRAPHY PROMPT (Safe but detailed)
          styleDirectives = "Shot on Sony A7R IV, 50mm lens. Harsh realistic lighting, flash photography, visible pores, dermatological details, authentic skin texture, imperfect, grainy, sharp focus. Backlight separation, perfect white balance on subject, no color contamination. DO NOT crop off the top of the head.";

          // BACKGROUND RE-PHRASING (To avoid 'digital green' bias)
          effectivePrompt += " Standing in front of a solid soft white studio background.";

          // STRICT ANTI-CG CONSTRAINTS
          negativePrompt = "Do not use: digital art, illustration, painting, drawing, cartoon, anime, 3d render, cgi, unreal engine, smooth skin, airbrushed, beauty filter, perfect lighting, symmetry, plastic, doll-like, artistic adaptation, stylized.";
        } else {
          // For other styles, keep the prefix
          effectivePrompt = `${baseStyle}, ${effectivePrompt}`;
        }
      }
    }

    dispatch({ type: 'SET_PROCESSING', payload: true });

    // --- TIMEOUT & ETA LOGIC ---
    const getEtaMs = () => state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
    const etaMs = getEtaMs();

    // --- PROGRESS SIMULATION TIMER ---
    let currentPercent = 5;
    dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Synthesizing Asset" } });

    const updateMs = 1000;
    const increment = (updateMs / etaMs) * 100;

    // Using window.setInterval to avoid NodeJS Timeout typing issues in React/Vite
    const progressInterval = window.setInterval(() => {
      currentPercent += increment;
      if (currentPercent > 95) currentPercent = 95; // Cap at 95% until complete

      let text = "Synthesizing Asset";
      if (currentPercent > 40) text = "Processing Style Protocol...";
      if (currentPercent > 70) text = "Refining Cutout Mask...";
      if (currentPercent >= 95) text = "Refining Cutout Mask... (Still working, please wait)";

      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
    }, updateMs);

    dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
    setProcessedPreviewUrl(null);

    const currentGenId = Date.now();
    generationIdRef.current = currentGenId;

    try {
      let res;
      if (state.lastCastedImage && state.apiKey) {
        dispatch({ type: 'ADD_LOG', payload: { message: "Applying stylization to character...", type: 'info' } });
        const stylizePrompt = `Create a single character portrait.

SUBJECT LOCK
- [IMAGE 1] is the subject reference.
- Preserve the same identity, facial structure, age range, body type, and overall likeness from [IMAGE 1].
- Preserve the same pose/framing unless the prompt explicitly requests otherwise.

STYLE AUTHORITY
- Apply this character description exactly: ${effectivePrompt}
- Apply this style direction exactly: ${styleDirectives}
- Keep the output as one clean isolated character on a solid soft white studio background.

COMPOSITION
- Single subject only.
- Full visible character based on the requested framing.
- No HUD, no labels, no overlays, no floating props.

NEGATIVE CONSTRAINTS:
text, labels, HUD, overlays, duplicate subjects, identity drift, extra limbs, fused fingers, wrong background, stylization drift${negativePrompt ? `, ${negativePrompt}` : ''}.`;
        res = await GeminiService.generateImage(
          stylizePrompt,
          state.apiKey,
          state.model,
          [{ url: state.lastCastedImage, label: 'Subject Reference' }],
          { imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true }
        );
      } else {
        const createPrompt = `Create a single character portrait.

SUBJECT DEFINITION
- Generate this character exactly: ${effectivePrompt}
- Apply this style direction exactly: ${styleDirectives}

COMPOSITION
- One subject only.
- Solid soft white studio background.
- No text, no labels, no HUD, no overlays.

NEGATIVE CONSTRAINTS:
text, labels, HUD, overlays, duplicate subjects, extra limbs, fused fingers, wrong background, stylization drift${negativePrompt ? `, ${negativePrompt}` : ''}.`;
        res = await GeminiService.generateImage(
          createPrompt,
          state.apiKey,
          state.model,
          [],
          { imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true }
        );
      }

      if (generationIdRef.current === currentGenId) {
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: res });
      } else {
        return;
      }

      try {
        if (!aiMaskActive) return;

        dispatch({ type: 'ADD_LOG', payload: { message: "Running local AI isolation...", type: 'info' } });

        // Fetch the generated image as a blob (safeFetchBlob supports local paths)
        const blob = await safeFetchBlob(res);

        // Run @imgly/background-removal
        // Note: The first run will download model assets (approx 40MB)
        const blobResult = await removeBackground(blob, {
          progress: (key: string, current: number, total: number) => {
            // Optional: Update progress
            console.log(`Downloading ${key}: ${current} of ${total}`);
          }
        });

        const cutoutUrl = URL.createObjectURL(blobResult);

        if (generationIdRef.current === currentGenId) {
          dispatch({ type: 'SET_LAST_CASTED_MASK', payload: cutoutUrl });
          dispatch({ type: 'ADD_LOG', payload: { message: "Subject Isolated Successfully", type: 'success' } });
        }
      } catch (maskErr: any) {
        console.error("Isolation Failed:", maskErr);
        dispatch({ type: 'ADD_LOG', payload: { message: `Isolation Failed: ${maskErr.message}`, type: 'error' } });
      }

      const logMessage = state.lastCastedImage ? "Character stylized" : "Character generated";
      dispatch({ type: 'ADD_LOG', payload: { message: logMessage, type: 'success' } });
      dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: '' }); // Clear input as requested
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      clearInterval(progressInterval);
      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };


  const imgRef = useRef<HTMLImageElement>(null);
  const maskImgRef = useRef<HTMLImageElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // RESTORATION REFS
  const restorationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);
  const lastPaintPos = useRef<{ x: number, y: number } | null>(null);
  const lastScreenPos = useRef<{ x: number, y: number } | null>(null);
  const isSyncingRef = useRef(false); // Track async canvas sync state
  const syncRequestId = useRef(0); // Track migration/sync requests to avoid race conditions

  const generationIdRef = useRef<number>(0);

  // DELETE CONFIRMATION STATE
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'cast' | 'library', payload: string, name: string } | null>(null);

  const executeDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'cast') {
      dispatch({ type: 'REMOVE_CAST', payload: deleteTarget.payload });
      dispatch({ type: 'ADD_LOG', payload: { message: "Actor removed from Cast List", type: 'info' } });
    } else {
      // Library Deletion with Disk Persistence
      const actorId = deleteTarget.payload;
      const actor = state.actorLibrary.find(a => a.id === actorId);

      const performDelete = async () => {      // 1. If it's a file-based actor, delete from disk FIRST
        if (actor && actor.filename) {
          try {
            let deleted = false;
            let diag = "";
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
              const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors', actor.filename);
              deleted = await window.electronAPI.deleteFile(filePath);
              diag += `IPC[${deleted}] (${filePath}). `;

              // SMART FALLBACK: If direct delete failed, maybe the file moved or category changed?
              if (!deleted && window.electronAPI?.exists) {
                diag += `FallbackSearch... `;
                const possibleCats = ['', 'Realism', 'Stylized Cartoon', 'Illustration', 'Sci-Fi', 'Uncategorized', 'Extras'];
                const basename = actor.filename?.split(/[\\/]/).pop();

                if (basename) {
                  for (const cat of possibleCats) {
                    const testPath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors', cat, basename);
                    if (await window.electronAPI.exists(testPath)) {
                      deleted = await window.electronAPI.deleteFile(testPath);
                      if (deleted) {
                        diag += `FoundIn[${cat || 'Root'}]. `;
                        break;
                      }
                    }
                  }
                }
              }
            } else {
              diag += `IPC[Missing/NoPath]. `;
            }

            if (!deleted && state.saveDirectoryHandle) {
              const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
              if (!hasPermission) {
                showToast("Permission Denied: Cannot delete file from disk.");
                return; // Abort delete
              }
              let curDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors');
              const pathParts = actor.filename.split(/[\\/]/);
              for (let i = 0; i < pathParts.length - 1; i++) {
                curDir = await curDir.getDirectoryHandle(pathParts[i]);
              }
              await curDir.removeEntry(pathParts[pathParts.length - 1]);
              deleted = true;
              diag += `Web[Succeed]. `;
            }

            if (!deleted) throw new Error("File deletion failed or permission denied on disk. Trace: " + diag);

            dispatch({ type: 'ADD_LOG', payload: { message: `File deleted from disk ${diag}`, type: 'success' } });

            // Only remove from memory if disk delete succeeded
            dispatch({ type: 'REMOVE_ACTOR_LIBRARY', payload: actorId });
            dispatch({ type: 'ADD_LOG', payload: { message: "Actor permanently removed", type: 'info' } });

          } catch (e: any) {
            console.error("Disk delete failed", e);
            showToast(`Delete Error: ${e.message}`);
            dispatch({ type: 'ADD_LOG', payload: { message: `Disk delete failed: ${e.message}`, type: 'error' } });
            // Do NOT remove from memory if disk delete failed, prevents "zombie" confusion
          }
        } else {
          // Memory-only actor or no handle? Just remove from memory.
          dispatch({ type: 'REMOVE_ACTOR_LIBRARY', payload: actorId });
          dispatch({ type: 'ADD_LOG', payload: { message: "Actor removed (Memory Only)", type: 'info' } });
        }
      };

      performDelete();
    }
    setDeleteTarget(null);
  };


  // --- LIBRARY SEARCH & SORT STATE ---
  const [librarySearch, setLibrarySearch] = useState('');
  const [sortOption, setSortOption] = useState<'name' | 'date' | 'type'>('date');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [refSheetUrl, setRefSheetUrl] = useState<string | null>(null);

  // Custom Covers moved to AppContext for persistence
  // const [customCovers, setCustomCovers] = useState<Record<string, string>>({});

  const [needsPermission, setNeedsPermission] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The following lines are duplicates from the provided diff, keeping the first set.
  // const [librarySearch, setLibrarySearch] = useState("");
  // const [sortOption, setSortOption] = useState<'date' | 'name' | 'type'>('date');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [organizeTarget, setOrganizeTarget] = useState<{ id: string, name: string } | null>(null);

  // Load covers from disk if available
  // This useEffect is removed as per instructions, as customCovers are now in AppContext
  // and should not be revoked on component unmount.

  const loadDiskCovers = useCallback(async (autoRequest: boolean = false) => {
    // 1. NATIVE MODE (Electron)
    // 1. NATIVE MODE (Electron)
    if (isNativeParams() && state.saveDirectoryPath) {
      console.log(`[CustomCovers] Native Mode Check. Path: ${state.saveDirectoryPath}`);
      console.log(`[CustomCovers] Current State Keys: ${Object.keys(state.customCovers).join(', ')}`);

      if (Object.keys(state.customCovers).length > 0 && !autoRequest) {
        console.log(`[CustomCovers] Skipping load, covers already in memory.`);
        setNeedsPermission(false);
        return;
      }

      console.log(`[CustomCovers] Loading from disk...`);
      const loaded: Record<string, string> = { ...state.customCovers };

      for (const folder of STUDIO_FOLDERS) {
        try {
          const url = await nativeLoadCover(state.saveDirectoryPath, folder.id);
          if (url) {
            console.log(`[CustomCovers] Loaded ${folder.id} from disk.`);
            loaded[folder.id] = url;
          } else {
            console.log(`[CustomCovers] Failed to load ${folder.id} (not found/empty).`);
          }
        } catch (e) {
          console.error(`[CustomCovers] Error loading ${folder.id}:`, e);
        }
      }

      const loadedCount = Object.keys(loaded).length;
      console.log(`[CustomCovers] Load Complete. Found ${loadedCount} covers.`);

      if (loadedCount > 0) {
        dispatch({ type: 'SET_CUSTOM_COVERS', payload: loaded });
      }
      setNeedsPermission(false);
      return;
    }

    // Fallback log if path missing
    if (isNativeParams() && !state.saveDirectoryPath) {
      // console.warn("[CustomCovers] Native Mode but saveDirectoryPath is empty. Cannot load covers.");
    }

    // 2. WEB MODE (File System Access API)
    // If we receive a saveDirectoryHandle, we MUST verify it still has permission.
    if (!state.saveDirectoryHandle) return;

    // Redundant guard: If we are native, we should NOT be checking handles unless mixed mode (rare)
    if (isNativeParams()) {
      setNeedsPermission(false);
      return;
    }

    try {
      // If autoRequest is false (silent check), capture the failure to show Banner
      const hasPermission = await verifyPermission(state.saveDirectoryHandle, false, autoRequest);

      if (!hasPermission) {
        if (autoRequest) {
          showToast("Permission Denied. Please approve read access.");
        } else {
          // Silent check failed -> Show Resume Banner
          setNeedsPermission(true);
        }
        return;
      }

      // If we got here, we have permission!
      setNeedsPermission(false);

    } catch (err) {
      console.error("loadDiskCovers: Permission check crashed", err);
      return;
    }

    const loaded: Record<string, string> = {};

    for (const folder of STUDIO_FOLDERS) {
      // Unsorted is now INCLUDED
      const filename = getStudioCoverFilename(folder.id);
      try {
        const url = await loadAssetFromDisk(state.saveDirectoryHandle, filename);
        if (url) {
          loaded[folder.id] = url;
        }
      } catch (e) {
        // File likely doesn't exist
      }
    }

    if (Object.keys(loaded).length > 0) {
      dispatch({ type: 'SET_CUSTOM_COVERS', payload: { ...state.customCovers, ...loaded } });
    }
  }, [state.saveDirectoryHandle, state.saveDirectoryPath, dispatch]);

  useEffect(() => {
    loadDiskCovers(false);
  }, []);


  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingFolderId) return;

    // 1. NATIVE MODE
    if (isNativeParams() && state.saveDirectoryPath) {
      const success = await nativeSaveCover(state.saveDirectoryPath, editingFolderId, file);
      if (success) {
        const newUrl = await nativeLoadCover(state.saveDirectoryPath, editingFolderId);
        if (newUrl) {
          dispatch({ type: 'SET_CUSTOM_COVERS', payload: { ...state.customCovers, [editingFolderId]: newUrl } });
          setEditingFolderId(null);
          dispatch({ type: 'ADD_LOG', payload: { message: "Cover updated", type: 'success' } });
        }
      } else {
        dispatch({ type: 'ADD_LOG', payload: { message: "Failed to save cover.", type: 'error' } });
      }
      return;
    }

    // 2. WEB MODE
    if (!state.saveDirectoryHandle) {
      showToast("Please set a Save Directory (Settings) to use Custom Covers.");
      return;
    }
    try {
      // Verify Write Permission
      const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
      if (!hasPermission) {
        showToast("Permission Denied. Please re-connect folder.");
        return;
      }

      const filename = getStudioCoverFilename(editingFolderId);
      await saveAssetToDisk(state.saveDirectoryHandle, filename, file);

      const newUrl = await loadAssetFromDisk(state.saveDirectoryHandle, filename);
      if (newUrl) {
        dispatch({ type: 'SET_CUSTOM_COVERS', payload: { ...state.customCovers, [editingFolderId]: newUrl } });
        dispatch({ type: 'ADD_LOG', payload: { message: "Cover Saved to Disk", type: 'success' } });
      }
    } catch (err: any) {
      console.error("Save failed", err);
      dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${err.message}`, type: 'error' } });
    }

    e.target.value = ''; // Reset
    setEditingFolderId(null);
  };


  const triggerCoverEdit = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderId(folderId);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  // Derived Library List
  const filteredLibrary = React.useMemo(() => {
    let result = state.actorLibrary;

    // 1. Search Filter
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q));
    }

    // 2. Folder Filter (NEW)
    if (activeFolder) {
      const folder = STUDIO_FOLDERS.find(f => f.id === activeFolder);
      if (folder) {
        if (folder.id === 'uncategorized') {
          // Robust Unsorted Filter
          result = result.filter(a => {
            const s = normalizeStyle(a.profile?.style);
            // If style is empty OR it is NOT in the known list -> It is Unsorted
            const isUnsorted = !s || !knownStyles.has(s);
            // DEBUG removed
            return isUnsorted;
          });
          // console.log(`Filtered Uncategorized: ${result.length} actors remain of ${state.actorLibrary.length}`);
        } else {
          // Robust Category Filter
          const targetStyles = new Set(folder.styles.map(s => normalizeStyle(s)));
          result = result.filter(a => targetStyles.has(normalizeStyle(a.profile?.style)));
        }
      }
    }

    // 3. Sort Logic
    return [...result].sort((a, b) => { // ... existing logic
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortOption === 'type') {
        const typeA = a.profile?.style || '';
        const typeB = b.profile?.style || '';
        return typeA.localeCompare(typeB);
      } else {
        // Date (Default: Newest First)
        // Heuristic: ID is timestamp-based "actor-123456789"
        const timeA = parseInt(a.id.split('-')[1] || '0');
        const timeB = parseInt(b.id.split('-')[1] || '0');
        return timeB - timeA;
      }
    });
  }, [state.actorLibrary, librarySearch, sortOption, activeFolder]);

  // --- 4. ISOLATION PROCESS (UPDATED for Imgly) ---
  // The 'mask' is now the isolated image URL itself.
  // --- 4. ISOLATION PROCESS (UPDATED for Imgly) ---
  // The 'mask' is now the isolated image URL itself.

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

  // EFFECT 1: Handle Erosion (Slow)
  useEffect(() => {
    if (!removeBg || !state.lastCastedMask) {
      setErodedUrl(null);
      setIsIsolating(false); // SAFETY RESET
      return;
    }

    // If no fringe, the "eroded" state is just the mask
    if (fringeSize === 0) {
      setErodedUrl(state.lastCastedMask);
      setIsIsolating(false); // SAFETY RESET
      return;
    }

    setIsIsolating(true);
    let active = true;
    const t = setTimeout(() => {
      generateErodedMask(state.lastCastedMask!, fringeSize).then(url => {
        if (active) {
          setErodedUrl(url);
          setIsIsolating(false);
        }
      });
    }, 100);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [state.lastCastedMask, fringeSize, removeBg]);

  // EFFECT 1.5: Preload/Cache Static Images
  useEffect(() => {
    // ALWAYS clear cache first to prevent stale image usage
    cachedBaseImgRef.current = null;

    const base = erodedUrl || state.lastCastedMask;
    if (base && typeof base === 'string') {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = base;
      img.onload = () => { cachedBaseImgRef.current = img; };
    }
  }, [erodedUrl, state.lastCastedMask]);

  useEffect(() => {
    // ALWAYS clear cache first
    cachedOriginalImgRef.current = null;

    if (state.lastCastedImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = state.lastCastedImage;
      img.onload = () => { cachedOriginalImgRef.current = img; };
    }
  }, [state.lastCastedImage]);


  // EFFECT 2: Handle Composition (Fast)
  useEffect(() => {
    // If Remove BG is off, show nothing
    if (!removeBg) {
      setProcessedPreviewUrl(null);
      return;
    }

    if (!erodedUrl && !state.lastCastedMask) {
      setProcessedPreviewUrl(null);
      return;
    }

    const base = erodedUrl || state.lastCastedMask;
    if (!base) return;

    let active = true;
    if (restorationLayer && state.lastCastedImage) {
      // USE CACHED IMAGES IF AVAILABLE
      const baseInput = cachedBaseImgRef.current || base;
      const originalInput = cachedOriginalImgRef.current || state.lastCastedImage;

      // console.log("EFFECT 2: Triggered. Using Cache?", { baseCached: !!cachedBaseImgRef.current, origCached: !!cachedOriginalImgRef.current });

      // Fast composite
      compositeRestoration(baseInput, originalInput, restorationLayer).then(url => {
        if (active) {
          // console.log("EFFECT 2: Success. Updating Preview.");
          setProcessedPreviewUrl(url);
        } else {
          // console.log("EFFECT 2: Stale result ignored.");
        }
      });
    } else {
      setProcessedPreviewUrl(base);
    }
    return () => { active = false; };
  }, [erodedUrl, restorationLayer, removeBg, state.lastCastedImage, state.lastCastedMask]);









  const handleDownload = () => {
    if (!state.lastCastedImage) return;
    const link = document.createElement('a');
    link.href = processedPreviewUrl || state.lastCastedImage;
    link.download = `nano_banana_export_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    dispatch({ type: 'ADD_LOG', payload: { message: "Image downloaded.", type: 'info' } });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawDataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = async () => {
          const w = img.width;
          const h = img.height;
          let targetRatio = 1;
          const ratio = w / h;

          if (Math.abs(ratio - 16 / 9) < 0.2) { targetRatio = 16 / 9; }
          else if (Math.abs(ratio - 9 / 16) < 0.2) { targetRatio = 9 / 16; } // approximate portrait
          else if (ratio > 1.2) { targetRatio = 16 / 9; }
          else if (ratio < 0.8) { targetRatio = 9 / 16; }

          let cropW = w;
          let cropH = h;
          if (ratio > targetRatio) {
            cropW = h * targetRatio;
          } else {
            cropH = w / targetRatio;
          }

          const cropX = (w - cropW) / 2;
          const cropY = (h - cropH) / 2;

          const canvas = document.createElement('canvas');
          canvas.width = cropW;
          canvas.height = cropH;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          const standardizedUrl = canvas.toDataURL('image/png');

          dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: standardizedUrl });
          dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
          setProcessedPreviewUrl(null);

          const currentGenId = Date.now();
          generationIdRef.current = currentGenId;

          if (state.apiKey) {
            try {
              dispatch({ type: 'ADD_LOG', payload: { message: "Isolating character silhouette locally...", type: 'info' } });
              const blob = await safeFetchBlob(standardizedUrl);
              const maskResBlob = await removeBackground(blob, {
                progress: () => {
                  // Keep it simple, or emit progress if needed. Imgly handles it.
                }
              });
              const maskResDataUrl = URL.createObjectURL(maskResBlob);

              if (generationIdRef.current === currentGenId) {
                dispatch({ type: 'SET_LAST_CASTED_MASK', payload: maskResDataUrl });
                dispatch({ type: 'ADD_LOG', payload: { message: "Character silhouette isolated successfully", type: 'success' } });
              }
            } catch (err: any) {
              if (generationIdRef.current === currentGenId) {
                dispatch({ type: 'ADD_LOG', payload: { message: `Mask generation failed: ${err.message}`, type: 'error' } });
              }
            }
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateRefSheet = async () => {
    if (!state.lastCastedImage || !state.apiKey) return;
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'ADD_LOG', payload: { message: "Generating Character Reference Sheet...", type: 'info' } });

    // --- TIMEOUT & ETA LOGIC ---
    const getEtaMs = () => state.imageResolution === '4K' ? 90000 : (state.imageResolution === '2K' ? 45000 : 20000);
    const etaMs = getEtaMs();

    // --- PROGRESS SIMULATION TIMER ---
    let currentPercent = 5;
    dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Synthesizing Reference Sheet" } });

    const updateMs = 1000;
    const increment = (updateMs / etaMs) * 100;

    const progressInterval = setInterval(() => {
      currentPercent += increment;
      if (currentPercent > 95) currentPercent = 95; // Cap at 95% until complete

      let text = "Synthesizing Reference Sheet";
      if (currentPercent > 30) text = "Refining Geometry...";
      if (currentPercent > 60) text = "Applying Materials...";
      if (currentPercent > 80) text = "Finalizing Render...";
      if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";

      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
    }, updateMs);

    try {
      let finalPrompt = REFERENCE_SHEET_PROMPT;

      if (refLayout === 'form_focus') {
        finalPrompt += " [LAYOUT A - CLASSIC]: Split canvas horizontally. Top 65% height: ROW OF EXACTLY 3 Full Body views with DISTINCT ANGLES (1. Front, 2. Side Profile, 3. Back). Bottom 35% height: Grid of EXACTLY 4 Headshots with VARIED ANGLES (Front, EXTREME LEFT PROFILE, EXTREME RIGHT PROFILE, Looking Up). Ensure headshots are MACRO-DETAILED and hyper-sharp.";
      } else if (refLayout === 'face_focus') {
        finalPrompt += " [LAYOUT B - FACE FIRST]: Split canvas horizontally. Top 55% height: Row of EXACTLY 4 Large Headshots showing VARIED ANGLES (Front, EXTREME LEFT PROFILE, EXTREME RIGHT PROFILE, Looking Up). Bottom 45% height: Row of EXACTLY 3 Full Body views with DISTINCT ANGLES (1. Front, 2. Side Profile, 3. Back). Headshots must maintain perfect identity.";
      } else if (refLayout === 'split_focus') {
        finalPrompt += " [LAYOUT C - STUDIO]: Split canvas vertically. Left 45% width: Vertical stack of EXACTLY 3 Full Body views with DISTINCT ANGLES (1. Front, 2. Side Profile, 3. Back). DO NOT ADD A FOURTH VIEW. Right 55% width: 2x2 Grid of Large Headshots with VARIED ANGLES (Front, EXTREME LEFT PROFILE, EXTREME RIGHT PROFILE, Looking Up). Highest possible facial resolution.";
      }

      finalPrompt += " EXCLUSION RULE: NEVER put two identical profile views next to each other. The Left Profile and Right Profile MUST face opposite directions.\n";

      finalPrompt += "\n\nCRITICAL ROTATION OVERRIDE: While the identity and costume must match the reference, YOU MUST NOT COPY THE CAMERA ANGLE OF THE REFERENCE IMAGE across all panels. You MUST dynamically rotate the character's head and body in 3D space to precisely match the requested viewpoints (Profile, 3/4, Back, etc) for each individual panel.\n\n";

      // BRANDING INJECTION
      let inputImages = [{ url: state.lastCastedImage, label: 'Character Reference' }];

      if (brandingLogo) {
        inputImages.push({ url: brandingLogo, label: 'Branding Logo' });
        finalPrompt += `
 
 8. BRANDING & IDENTITY (OVERRIDE)
 - Place the logo from [IMAGE 2] onto the character's clothing in views where the torso is visible.
 - EXACT PLACEMENT: ${logoPosition || "Chest/Torso"}.
 - Integrate the logo realistically: it must wrap with the fabric's folds, match the lighting, and follow the texture of the garment.
 - The logo must be visible and consistent across all full-body angles (Front, Side, Back).
 - HEADSHOT EXCLUSION (CRITICAL): Do NOT spawn the logo floating in the background, on the neck, or on the face. If a panel is an extreme close-up or headshot where the ${logoPosition || "Chest/Torso"} is NOT naturally visible, OMIT THE LOGO ENTIRELY from that specific panel.`;
      }

      const res = await GeminiService.generateImage(
        finalPrompt,
        state.apiKey,
        state.model, // Use the user's selected model (consistent with main generator)
        inputImages,
        { aspectRatio: refLayout === 'split_focus' ? '16:9' : '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true }
      );
      setRefSheetUrl(res);
      setShowRefSheet(true);
      dispatch({ type: 'ADD_LOG', payload: { message: "Reference Sheet Generated.", type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Ref Sheet failed: ${e.message}`, type: 'error' } });
    } finally {
      clearInterval(progressInterval);
      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const panelDimRef = useRef({ w: 0, h: 0 });
  void panelDimRef;

  // handlePanelMouseDown removed (Docked Controls)

  // MOUSE TO IMAGE COORDINATE MAPPER
  const getImgCoords = (clientX: number, clientY: number) => {
    // 1. Identify which image is ACTUALLY visible to the user
    // If preview exists, we use previewImgRef (which is object-contain)
    // If not, we use imgRef (which is object-contain)
    // Note: When preview is active, imgRef becomes 'absolute invisible', so its rect helps nobody.
    const activeImg = (processedPreviewUrl && previewImgRef.current)
      ? previewImgRef.current
      : imgRef.current;

    if (!containerRef.current || !activeImg) return null;

    // 2. Get Geometries
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const imgRect = activeImg.getBoundingClientRect();

    // 3. Calculate Image Coordinates
    // relative to the IMAGE element's top-left
    const mouseX = clientX - imgRect.left;
    const mouseY = clientY - imgRect.top;

    // 4. Scale to Natural Dimensions
    // naturalWidth / renderedWidth
    const scale = activeImg.naturalWidth / imgRect.width;

    // 5. Calculate UI Screen Coordinates (for Cursor Dot)
    // Relative to Container Content Box (where .absolute children live)
    // screenX = clientX - (containerLeft + borderLeft)
    const borderLeft = container.clientLeft || 0;
    const borderTop = container.clientTop || 0;
    const screenX = clientX - containerRect.left - borderLeft;
    const screenY = clientY - containerRect.top - borderTop;

    return {
      x: mouseX * scale,
      y: mouseY * scale,
      w: activeImg.naturalWidth,
      h: activeImg.naturalHeight,
      scale: scale,
      screenX: screenX,
      screenY: screenY,
    };
  };

  const startInteraction = (e: React.MouseEvent, handle: string | null = null) => {
    // Block interaction if canvas is syncing (prevent race conditions)
    if (isSyncingRef.current) return;

    // Drag logic removed

    // BRUSH INTERACTION
    if (isBrushActive && imgRef.current) {
      e.stopPropagation();
      e.preventDefault();
      isPaintingRef.current = true;

      const coords = getImgCoords(e.clientX, e.clientY);

      // Init Canvas if Needed
      if (!restorationCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = imgRef.current.naturalWidth;
        c.height = imgRef.current.naturalHeight;
        restorationCanvasRef.current = c;

        if (restorationLayer) {
          const ctx = c.getContext('2d');
          const prevImg = new Image();
          prevImg.onload = () => ctx?.drawImage(prevImg, 0, 0);
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

        // USE CALCULATED SCREEN COORDS
        const uiX = coords.screenX;
        const uiY = coords.screenY;
        lastScreenPos.current = { x: uiX, y: uiY };

        // Dot for click
        const ctx = restorationCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          // SCALE BRUSH: Screen Pixels -> Image Pixels
          const r = (brushSize * coords.scale) / 2;
          ctx.arc(coords.x, coords.y, r, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          // NO STATE UPDATE HERE - Wait for mouse up
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
      return;
    }

    if (!isCropping || !containerRef.current) return;

    // CROP INTERACTION
    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (handle) {
      setActiveHandle(handle);
    } else {
      setActiveHandle(null);
      setCropStart({ x, y });
      setCropRect({ x, y, w: 0, h: 0 });
    }
  };

  const moveInteraction = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    // Panel Dragging Logic removed

    // BRUSH MOVE (AND CURSOR TRACKING)
    if (isBrushActive) {
      const coords = getImgCoords(e.clientX, e.clientY);

      // 1. Update Cursor (Always, if coords valid)
      if (coords) {
        // USE CALCULATED SCREEN COORDS (Fixes Alignment)
        const uiX = coords.screenX;
        const uiY = coords.screenY;

        setCursorPos({ x: uiX, y: uiY });

        // 2. Painting Logic (Only if dragging & canvas ready)
        if (restorationCanvasRef.current && isPaintingRef.current && lastPaintPos.current) {
          const ctx = restorationCanvasRef.current.getContext('2d');
          const uictx = uiCanvasRef.current?.getContext('2d');

          // Draw Logic (Image Space)
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

          // Draw Visual (Screen Space)
          if (uictx && lastScreenPos.current) {
            uictx.beginPath();
            uictx.strokeStyle = 'white';
            uictx.lineWidth = brushSize;
            uictx.lineCap = 'round';
            uictx.lineJoin = 'round';
            uictx.moveTo(lastScreenPos.current.x, lastScreenPos.current.y);
            uictx.lineTo(uiX, uiY);
            uictx.stroke();
          }
          lastPaintPos.current = { x: coords.x, y: coords.y };
          lastScreenPos.current = { x: uiX, y: uiY };
        }
      }
      return;
    }

    if (!isCropping) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    if (activeHandle && cropRect) {
      let newRect = { ...cropRect };
      if (activeHandle.includes('e')) newRect.w = currX - cropRect.x;
      if (activeHandle.includes('s')) newRect.h = currY - cropRect.y;
      if (activeHandle.includes('w')) {
        const diff = cropRect.x - currX;
        newRect.x = currX;
        newRect.w = cropRect.w + diff;
      }
      if (activeHandle.includes('n')) {
        const diff = cropRect.y - currY;
        newRect.y = currY;
        newRect.h = cropRect.h + diff;
      }
      if (newRect.w < 0) { newRect.x += newRect.w; newRect.w = Math.abs(newRect.w); }
      if (newRect.h < 0) { newRect.y += newRect.h; newRect.h = Math.abs(newRect.h); }
      setCropRect(newRect);
    } else if (cropStart) {
      setCropRect({
        x: Math.min(currX, cropStart.x),
        y: Math.min(currY, cropStart.y),
        w: Math.abs(currX - cropStart.x),
        h: Math.abs(currY - cropStart.y)
      });
    }
  };

  const endInteraction = () => {
    // Panel Drag End removed

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

      console.log("HISTORY PUSH:", { prevIndex: currentIndex, newLength: newHistory.length });

      // Update Refs (Source of Truth)
      historyRef.current = newHistory;
      const nextIndex = newHistory.length - 1;
      historyIndexRef.current = nextIndex;

      // Sync React State
      setHistory(newHistory);
      setHistoryIndex(nextIndex);

      // Clear Visual Layer
      if (uiCanvasRef.current) {
        const ctx = uiCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
      }
    }

    isPaintingRef.current = false;
    lastPaintPos.current = null;
    lastScreenPos.current = null;

    setCropStart(null);
    setActiveHandle(null);
  };

  const syncRefCanvas = (url: string | null) => {
    if (!imgRef.current) return;

    // Re-init canvas if missing
    if (!restorationCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = imgRef.current.naturalWidth;
      c.height = imgRef.current.naturalHeight;
      restorationCanvasRef.current = c;
    }

    const ctx = restorationCanvasRef.current.getContext('2d');
    if (!ctx) return;

    // Increment request ID
    const currentId = ++syncRequestId.current;

    // Defer clearing until image loads to prevent race condition
    if (url) {
      isSyncingRef.current = true;
      const img = new Image();
      img.onload = () => {
        // Only draw if this is the latest request
        if (currentId === syncRequestId.current) {
          if (restorationCanvasRef.current) {
            ctx.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
            ctx.drawImage(img, 0, 0);
          }
        } else {
          console.log("Ignored stale undo/redo request (Lock released)");
        }
        // ALWAYS RELEASE LOCK
        isSyncingRef.current = false;
      };
      img.onerror = () => {
        console.error("Failed to load history snapshot");
        isSyncingRef.current = false; // RELEASE LOCK ON ERROR
      };
      img.src = url;
    } else {
      // Safe to clear immediately if no URL
      ctx.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
    }
  };

  const handleUndo = () => {
    const currentIndex = historyIndexRef.current;
    console.log("UNDO CLICK. Current Ref:", currentIndex);
    if (currentIndex > 0) {
      const newIndex = Math.max(0, currentIndex - 1);
      const snapshot = historyRef.current[newIndex]; // Read from Ref

      console.log("UNDO SNAPSHOT FOUND:", { newIndex, snapshotLen: snapshot?.length });

      if (snapshot === undefined) return;

      historyIndexRef.current = newIndex;
      setHistoryIndex(newIndex);
      setRestorationLayer(snapshot);
      setRestorationLayer(snapshot);
      syncRefCanvas(snapshot);
    }
  };

  const handleRedo = () => {
    const currentIndex = historyIndexRef.current;
    const currentHist = historyRef.current;
    console.log("REDO CLICK. Current Ref:", currentIndex, "Hist Len:", currentHist.length);
    if (currentIndex < currentHist.length - 1) {
      const newIndex = Math.min(currentHist.length - 1, currentIndex + 1);
      const snapshot = currentHist[newIndex]; // Read from Ref

      console.log("REDO SNAPSHOT FOUND:", { newIndex, snapshotLen: snapshot?.length });

      if (snapshot === undefined) return;

      historyIndexRef.current = newIndex;
      setHistoryIndex(newIndex);
      setRestorationLayer(snapshot);
      syncRefCanvas(snapshot);
    }
  };

  const handleMouseLeave = () => {
    endInteraction();
    setCursorPos(null);
  };

  const finalizeCrop = () => {
    if (!cropRect || !containerRef.current || cropRect.w < 10) return;
    const isUsingProcessedPreview = !!(processedPreviewUrl && previewImgRef.current);
    const visualElement = isUsingProcessedPreview ? previewImgRef.current : imgRef.current;
    if (!visualElement || !imgRef.current) return;

    const visualRect = visualElement.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const offsetLeft = visualRect.left - containerRect.left;
    const offsetTop = visualRect.y - containerRect.y;
    const cropX_onVisual = cropRect.x - offsetLeft;
    const cropY_onVisual = cropRect.y - offsetTop;

    const sourceElement = isUsingProcessedPreview ? previewImgRef.current : imgRef.current;
    if (!sourceElement) return;

    const sourceFullWidth = sourceElement.naturalWidth;
    const sourceFullHeight = sourceElement.naturalHeight;

    const scaleX = sourceFullWidth / visualRect.width;
    const scaleY = sourceFullHeight / visualRect.height;
    const sourceX = Math.floor(cropX_onVisual * scaleX);
    const sourceY = Math.floor(cropY_onVisual * scaleY);
    const sourceW = Math.max(1, Math.floor(cropRect.w * scaleX));
    const sourceH = Math.max(1, Math.floor(cropRect.h * scaleY));

    const safeSx = Math.max(0, sourceX);
    const safeSy = Math.max(0, sourceY);
    const safeDx = Math.max(0, -sourceX);
    const safeDy = Math.max(0, -sourceY);
    const safeW = Math.max(0, Math.min(sourceFullWidth - safeSx, sourceW - safeDx));
    const safeH = Math.max(0, Math.min(sourceFullHeight - safeSy, sourceH - safeDy));

    const canvas = document.createElement('canvas');
    canvas.width = sourceW;
    canvas.height = sourceH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      ctx.drawImage(sourceElement, safeSx, safeSy, safeW, safeH, safeDx, safeDy, safeW, safeH);
      const tokenUrl = canvas.toDataURL('image/png');

      // Update Viewport with Cropped Image
      dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: tokenUrl });
      dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
      setProcessedPreviewUrl(null);

      // Close Cropper
      setIsCropping(false);
      setCropRect(null);

      // Open Save Modal
      setShowSaveModal(true);
      dispatch({ type: 'ADD_LOG', payload: { message: "Crop applied. Select folder to save.", type: 'info' } });
    }
  };

  const getUiPositions = () => {
    if (!cropRect || !containerRef.current) return { tagsClass: '-bottom-8', toolClass: '-top-28' };
    const containerHeight = containerRef.current.clientHeight;
    const tagsClass = (cropRect.y + cropRect.h > containerHeight - 40) ? 'bottom-2 left-2' : '-bottom-8 left-0';
    const toolClass = (cropRect.y < 130) ? 'top-2 right-2' : '-top-28 right-0';
    return { tagsClass, toolClass };
  };

  const { tagsClass } = getUiPositions();

  return (
    <div className="flex h-full gap-6 p-4">
      {/* 1. LEFT SIDEBAR: Source & Tools */}
      <div className="w-[400px] flex flex-col gap-4 h-full shrink-0 min-h-0 overflow-y-auto pr-1 pb-2">

        {/* Source Material */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wide mb-1">Character Generator</h2>
              <p className="text-[10px] text-zinc-400 font-bold">Create or refine an actor before staging.</p>
            </div>
            <button
              onClick={() => dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: '' })}
              className="text-xs text-gray-600 hover:text-white transition-colors flex items-center gap-1 uppercase font-bold"
              title="Clear Text"
            >
              <Eraser className="w-3 h-3" /> Clear
            </button>
          </div>
          <textarea
            className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-sm text-gray-200 focus:border-yellow-500 focus:outline-none transition-colors h-24 resize-none mb-4"
            placeholder="Describe your character..."
            value={state.lastCastedPrompt}
            onChange={(e) => dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: e.target.value })}
          />

          {/* STYLE SELECTOR */}
          <div className="mb-4">
            <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-yellow-500" /> Target Studio Style
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STUDIO_FOLDERS.filter(f => f.id !== 'uncategorized').map(folder => (
                <HelpTooltip key={folder.id} zone="cast" id="studioStyleSelector">
                  <button
                    onClick={() => setSelectedStyleId(selectedStyleId === folder.id ? null : folder.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${selectedStyleId === folder.id
                      ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 -[0_0_10px_rgba(234,179,8,0.2)]'
                      : 'bg-[#09090b] border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                      }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${selectedStyleId === folder.id ? 'bg-yellow-500' : 'bg-gray-700'}`} />
                    <div className="text-left overflow-hidden">
                      <span className="text-[10px] font-bold uppercase block truncate">{folder.label}</span>
                    </div>
                  </button>
                </HelpTooltip>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <HelpTooltip zone="cast" id="generateActorButton">
              <button
                onClick={handleGenerate}
                disabled={state.isProcessing}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-black transition-all border uppercase tracking-wider active:scale-95 ${state.lastCastedImage
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-blue-400/50 -[0_0_15px_rgba(59,130,246,0.3)] hover:-[0_0_25px_rgba(59,130,246,0.5)]'
                  : 'bg-gradient-to-r from-[#27272a] to-[#18181b] hover:from-[#3f3f46] hover:to-[#27272a] text-white border-[#3f3f46] hover:border-gray-500 '
                  }`}
              >
                {state.isProcessing ? <RotateCw className="animate-spin w-4 h-4" /> : state.lastCastedImage ? <RefreshCw className="w-4 h-4" /> : <MonitorPlay className="w-4 h-4" />}
                {state.lastCastedImage ? 'Stylize' : 'Generate'}
              </button>
            </HelpTooltip>
            <label className="flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-white py-2.5 rounded-lg text-xs font-bold transition-all border border-[#3f3f46] hover:border-gray-500 cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
            </label>
          </div>
        </div>




        {/* Reference Sheet Generator */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 shrink-0">
          <h2 className="text-xs font-bold text-gray-600 uppercase tracking-normal mb-4 flex items-center gap-2">
            <LayoutTemplate className="w-3.5 h-3.5 opacity-50" /> Actor Reference Sheet
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-gray-400 hover:text-white cursor-help transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <strong className="text-white block mb-1">Production Note:</strong>
                High-Fidelity AI Synthesis: Identity & layout are strictly enforced, but minor variations may occur. Always review for production use.
              </div>
            </div>
          </h2>

          <div className="flex gap-2 mb-4">
            {[
              { id: 'form_focus', label: 'Form' },
              { id: 'face_focus', label: 'Face' },
              { id: 'split_focus', label: 'Split' }
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => setRefLayout(l.id as any)}
                className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all border ${refLayout === l.id
                  ? 'bg-purple-900 border-purple-500 text-white -[0_0_10px_rgba(168,85,247,0.4)]'
                  : 'bg-black border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* BRANDING SECTION */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-3 mb-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3.5 h-3.5 text-[#eab308] fill-[#eab308]" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">
                Branding & Identity
              </h3>
            </div>

            <div className="flex items-start gap-3">
              <label className="relative group cursor-pointer shrink-0">
                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-white/10 group-hover:border-blue-500/50 flex flex-col items-center justify-center transition-all bg-black/20 overflow-hidden">
                  {brandingLogo ? (
                    <img src={brandingLogo} className="w-full h-full object-contain" alt="Branding Logo" />
                  ) : (
                    <Upload className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
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
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </label>

              <div className="flex-grow space-y-1">
                <input
                  type="text"
                  value={logoPosition}
                  onChange={(e) => setLogoPosition(e.target.value)}
                  placeholder="Logo Placement (e.g. Chest)"
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-all font-bold"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerateRefSheet}
            disabled={state.isProcessing || !state.lastCastedImage}
            className={`w-full py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${state.lastCastedImage
              ? 'bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 text-purple-200 border-purple-500/30'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
              }`}
          >
            {state.isProcessing ? <RotateCw className="animate-spin w-4 h-4" /> : <LayoutTemplate className="w-4 h-4" />}
            Generate Reference Sheet
          </button>
        </div>

        {/* REF SHEET MODAL */}
        {showRefSheet && refSheetUrl && (
          <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-200">
            <div className="relative w-full max-w-6xl h-[90vh] flex flex-col items-center bg-[#18181b] rounded-2xl border border-white/10 overflow-hidden">
              <div className="flex justify-between items-center w-full p-6 border-b border-white/10 bg-[#09090b] flex-shrink-0">
                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                  <LayoutTemplate className="w-6 h-6 text-purple-400" /> Reference Sheet
                </h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPendingRefSheet(refSheetUrl);
                      setShowSaveModal(true);
                      // REMOVED duplicate dispatch calls. Now handled via Save Modal.
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-white/10 flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" /> Add to Library
                  </button>
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = refSheetUrl;
                      a.download = `RefSheet-${Date.now()}.png`;
                      a.click();
                      showToast("Download Started");
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-white/10 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                  <button
                    onClick={async () => {
                      if (state.saveDirectoryHandle) {
                        try {
                          // @ts-ignore - Verify permission
                          if ((await state.saveDirectoryHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
                            // @ts-ignore
                            if ((await state.saveDirectoryHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                              throw new Error("Permission denied");
                            }
                          }

                          const root = await state.saveDirectoryHandle.getDirectoryHandle('ReferenceSheets', { create: true });
                          const filename = `RefSheet-${Date.now()}.png`;
                          const handle = await root.getFileHandle(filename, { create: true });
                          const writable = await handle.createWritable();
                          const res = await fetch(refSheetUrl);
                          const blob = await res.blob();
                          await writable.write(blob);
                          await writable.close();
                          showToast("Saved to ReferenceSheets/");
                        } catch (e: any) {
                          showToast("Save failed. Downloading instead...");
                          // Fallback
                          const a = document.createElement('a');
                          a.href = refSheetUrl;
                          a.download = `RefSheet-Backup-${Date.now()}.png`;
                          a.click();
                        }
                      } else {
                        showToast("No Save Folder. Downloading instead...");
                        const a = document.createElement('a');
                        a.href = refSheetUrl;
                        a.download = `RefSheet-${Date.now()}.png`;
                        a.click();
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" /> Save Asset
                  </button>
                  <button
                    onClick={() => { setShowRefSheet(false); setRefSheetUrl(null); }}
                    className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-red-500/20 flex items-center gap-2"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 w-full bg-black/50 overflow-hidden flex items-center justify-center relative p-4 min-h-0">
                <img src={refSheetUrl} className="max-w-full max-h-full object-contain " />
              </div>
            </div>
          </div>
        )}

        {/* CAST ASSETS (RESTORED) */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 flex flex-col shrink-0">
          <h2 className="text-sm font-bold text-gray-400 uppercase mb-4 tracking-wider flex justify-between items-center shrink-0">
            <span>Cast Assets</span>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-500">{state.cast.length} tokens</span>
          </h2>
          <div className="pb-2">
            <div className="grid grid-cols-3 gap-2">
              {state.cast.map(c => (
                <div
                  key={c.id}
                  className="aspect-square bg-black border border-gray-700 rounded-lg overflow-hidden relative group cursor-pointer hover:border-yellow-500 transition-colors"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-cast-id', c.id);
                  }}
                >
                  <img src={c.url} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_INSPECT_IMAGE', payload: c.url }); }}
                      className="bg-blue-500/80 hover:bg-blue-500 text-white p-1 rounded-full "
                      title="Inspect Large"
                    >
                      <Maximize className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'cast', payload: c.id, name: c.tag || 'Token' }); }}
                      className="bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-full "
                      title="Delete Asset"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center text-gray-300 py-1 font-mono uppercase truncate px-1">
                    {c.tag}
                  </div>
                </div>
              ))}
              {state.cast.length === 0 && (
                <div className="col-span-3 text-center py-10 text-xs text-gray-600 italic">No tokens sliced yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. CENTER: Viewport */}
      <div className="flex-grow flex flex-col gap-6 overflow-hidden min-h-0">
        <div className="flex-grow bg-[#09090b] rounded-2xl border border-gray-800 flex flex-col overflow-hidden relative ">
          <div className="p-3 bg-[#18181b] border-b border-gray-800 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse border border-green-400/50"></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#a1a1aa]">Viewport: Active</span>
            </div>
            <div className="flex items-center gap-4">
              {state.lastCastedImage && (
                <div className="flex items-center gap-3 pr-4 border-r border-white/10">
                  <HelpTooltip zone="cast" id="addToLibraryButton">
                    <button
                      onClick={() => setShowSaveModal(true)}
                      className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white px-4 py-1.5 rounded-full text-[9px] font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border border-emerald-500/20"
                    >
                      <UserPlus className="w-4 h-4" /> Add to Library
                    </button>
                  </HelpTooltip>
                  <button
                    onClick={handleDownload}
                    className="text-gray-500 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                    title="Download PNG"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={3} />
                  </button>
                </div>
              )}
              <button
                onClick={() => setIsCropping(!isCropping)}
                className={`text-[9px] px-4 py-1.5 rounded-full font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border ${isCropping
                  ? 'bg-blue-600 text-white border-blue-400 '
                  : 'bg-black/40 text-gray-500 border-white/5 hover:border-white/20 hover:text-gray-200'
                  }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                Slicer {isCropping ? 'Active' : 'Idle'}
              </button>
            </div>
          </div>

          <div className="flex flex-row flex-grow overflow-hidden relative">
            <div
              ref={containerRef}
              className={`flex-grow relative bg-gradient-to-b from-[#18181b] to-black flex items-center justify-center overflow-hidden select-none group border-4 border-blue-500/30 rounded-2xl m-2 -[inset_0_0_0_1px_rgba(255,255,255,0.15),0_0_30px_rgba(59,130,246,0.1)] ${isBrushActive ? 'cursor-none' : ''}`}
              onMouseDown={(e) => startInteraction(e)}
              onMouseMove={moveInteraction}
              onMouseUp={endInteraction}
              onMouseLeave={handleMouseLeave}
            >
              {/* Visual Feedback Canvas layer */}
              <canvas ref={uiCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-40 opacity-50" />

              {isBrushActive && cursorPos && (
                <div
                  className="absolute pointer-events-none rounded-full border-2 border-white -[0_0_0_1px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(0,0,0,0.5)] z-50 transition-none mix-blend-normal"
                  style={{
                    width: `${brushSize}px`,
                    height: `${brushSize}px`,
                    left: cursorPos.x,
                    top: cursorPos.y,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              )}
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

              {state.lastCastedImage ? (
                <>
                  <img
                    ref={imgRef}
                    src={state.lastCastedImage}
                    crossOrigin="anonymous"
                    className={processedPreviewUrl ? 'invisible absolute pointer-events-none' : 'max-w-full max-h-full object-contain pointer-events-none'}
                  />
                  {processedPreviewUrl && (
                    <img
                      ref={previewImgRef}
                      src={processedPreviewUrl}
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />
                  )}
                  {state.lastCastedMask && (
                    <img
                      key={state.lastCastedMask}
                      ref={maskImgRef}
                      src={state.lastCastedMask}
                      crossOrigin="anonymous"
                      className="hidden"
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full select-none pointer-events-none group">
                  <div className="text-center bg-zinc-900/50 p-8 rounded-3xl backdrop-blur-sm transition-all duration-300 group-hover:bg-zinc-900/70">
                    {/* Ambient Actor Outline */}
                    <div className="relative w-32 h-32 mx-auto mb-4 opacity-40 transition-opacity duration-300 group-hover:opacity-70">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-full h-full text-zinc-500" strokeWidth="0.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {/* Subtle glow/tech accents */}
                      <div className="absolute inset-0 bg-blue-500/5 blur-2xl rounded-full" />
                    </div>

                    <div className="space-y-4 flex flex-col items-center">
                      <div className="w-fit">
                        {/* Brand Highlight Line (matches scrollbar) */}
                        <div className="w-full h-0.5 mb-3 bg-[#eab308] opacity-80 rounded-full" />

                        <h3 className="text-3xl font-black text-zinc-500 uppercase tracking-[0.2em] text-center whitespace-nowrap">ADD OR GENERATE AN ACTOR</h3>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest animate-stage-breathe max-w-lg mx-auto leading-relaxed">
                          Generate a new character or place an existing one<br /> to prepare it for directing.
                        </p>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          Background removal and slicing happen here before staging.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Floating Panel Removed - Moving to Sidebar */}

              {isCropping && cropRect && (
                <div
                  className="absolute border-2 border-yellow-500 bg-yellow-500/20 pointer-events-none"
                  style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
                >
                  <div onMouseDown={(e) => startInteraction(e, 'nw')} className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize pointer-events-auto z-50"></div>
                  <div onMouseDown={(e) => startInteraction(e, 'ne')} className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize pointer-events-auto z-50"></div>
                  <div onMouseDown={(e) => startInteraction(e, 'sw')} className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize pointer-events-auto z-50"></div>
                  <div onMouseDown={(e) => startInteraction(e, 'se')} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize pointer-events-auto z-50"></div>

                  {cropRect.w > 20 && (
                    <div className={`absolute flex gap-1 pointer-events-auto z-40 ${tagsClass}`}>
                      {['front', 'side', '3/4', 'back'].map((tag: any) => (
                        <button key={tag} onMouseDown={(e) => { e.stopPropagation(); finalizeCrop(); }} className="bg-[#18181b] text-white text-[10px] px-2 py-1 rounded border border-gray-600 hover:bg-yellow-500 hover:text-black uppercase font-bold">
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {state.lastCastedImage && (
              <div className="w-80 shrink-0 border-l border-white/10 bg-[#18181b]/50 h-full flex flex-col animate-in slide-in-from-right-10 duration-300">
                <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Image Adjustments</h3>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer select-none hover:text-white transition-colors">
                    <input
                      type="checkbox"
                      checked={removeBg}
                      onChange={(e) => setRemoveBg(e.target.checked)}
                      className="w-4 h-4 accent-blue-500 rounded border-white/10 bg-black cursor-pointer"
                    />
                    <Eraser className="w-3.5 h-3.5" /> Remove BG
                  </label>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                  {removeBg ? (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Edge Refinement</span>

                          {state.lastCastedMask ? (
                            <div className="flex items-center gap-1.5 text-blue-400">
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="text-[9px] font-bold uppercase">Isolated</span>
                            </div>
                          ) : (
                            <button
                              onClick={async () => {
                                if (!state.lastCastedImage) return;
                                try {
                                  dispatch({ type: 'ADD_LOG', payload: { message: "Starting isolation...", type: 'info' } });
                                  setIsIsolating(true);
                                  setIsolationProgress(5);
                                  const blob = await safeFetchBlob(state.lastCastedImage);
                                  const res = await removeBackground(blob, {
                                    progress: (_key: string, current: number, total: number) => {
                                      if (total) setIsolationProgress(Math.round((current / total) * 100));
                                    }
                                  });
                                  const url = URL.createObjectURL(res);
                                  dispatch({ type: 'SET_LAST_CASTED_MASK', payload: url });
                                  dispatch({ type: 'ADD_LOG', payload: { message: "Isolation Complete", type: 'success' } });
                                  setRemoveBg(true);
                                } catch (e: any) {
                                  dispatch({ type: 'ADD_LOG', payload: { message: "Isolation Error: " + e.message, type: 'error' } });
                                } finally {
                                  setIsIsolating(false);
                                  setIsolationProgress(0);
                                }
                              }}
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
                          <div className="w-full flex items-center justify-between gap-1 bg-black/40 rounded-lg p-1 border border-white/10">
                            <div className="relative group/history">
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black border border-gray-700 px-2 py-1 rounded text-[9px] text-gray-300 opacity-0 group-hover/history:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                                History State: {historyIndex}
                              </div>
                              <span className="text-xs font-bold text-blue-400 font-mono px-2 select-none bg-blue-900/30 rounded border border-blue-500/30 min-w-[36px] text-center whitespace-nowrap block">
                                {historyIndex} / {history.length - 1}
                              </span>
                            </div>

                            <button
                              onClick={() => setIsBrushActive(!isBrushActive)}
                              className={`p-1.5 rounded transition-all ${isBrushActive
                                ? 'bg-blue-600 text-white -[0_0_10px_rgba(37,99,235,0.5)]'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }`}
                              title="Restore Mask Brush"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20a6 6 0 0 0-12 0" /><path d="M12 20v-6" /><path d="M12 14a4 4 0 0 1 4-4V5a4 4 0 0 0-8 0v5a4 4 0 0 1 4 4z" /></svg>
                            </button>
                            <div className="w-px h-3 bg-white/10 mx-0.5" />
                            <button
                              onClick={handleUndo}
                              disabled={historyIndex <= 0}
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

                <div className="p-4 border-t border-white/10 bg-[#09090b]/50 shrink-0 space-y-3">
                  <button onClick={handleAddToCast} className="w-full bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-emerald-500/20 hover:-[0_0_15px_rgba(16,185,129,0.4)] text-[10px] font-black uppercase tracking-wider" title="Add to Session Cast">
                    <UserPlus className="w-4 h-4" /> Add to Cast
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleDownload} className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-blue-500/20 hover:-[0_0_15px_rgba(37,99,235,0.4)] text-[10px] font-black uppercase tracking-wider">
                      <Download className="w-4 h-4" /> Save
                    </button>
                    <button onClick={() => dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: null })} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-red-500/20 hover:-[0_0_15px_rgba(239,68,68,0.4)] text-[10px] font-black uppercase tracking-wider">
                      <X className="w-4 h-4" /> Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SAVE MODAL */}
      {
        showSaveModal && (
          <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowSaveModal(false)}>
            <div className="bg-[#18181b] border border-gray-700 rounded-2xl p-6 max-w-md w-full relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                <FolderInput className="w-5 h-5 text-emerald-500" /> Save to Actor Library
              </h3>
              <p className="text-xs text-gray-400 mb-4">Select a Studio Folder to organize this actor:</p>

              <div className="grid grid-cols-1 gap-2 mb-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                {STUDIO_FOLDERS.map((folder) => {
                  const activeImage = state.customCovers[folder.id] || folder.image;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => handleSaveToActorLibrary(folder.id)}
                      className="group relative h-24 w-full rounded-xl overflow-hidden border border-white/10 transition-all hover:scale-[1.02] hover:border-emerald-500 cursor-pointer mb-1 text-left"
                    >
                      {/* Background Image */}
                      {activeImage ? (
                        <img src={activeImage} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center">
                          <Folder className="w-8 h-8 text-white/10" />
                        </div>
                      )}

                      {/* Cinematic Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent flex flex-col justify-center px-6">
                        <div>
                          <h3 className="text-xl font-black text-white italic tracking-tighter uppercase group-hover:text-emerald-400 transition-colors leading-none">
                            {folder.label}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] font-bold text-gray-300 border-l-2 border-emerald-500 pl-2">
                              {folder.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* 3. RIGHT SIDEBAR: Actor Library */}
      <div className="w-96 border-l border-gray-800 bg-[#18181b] flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center h-16 bg-black/20">
          <h2 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-3">
            <UserPlus className="w-4 h-4 text-blue-400" /> Actor Library
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDiskCovers(true)}
              title="Reload Custom Assets (Fixes Missing Covers)"
              className="p-1 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <div className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30 text-blue-400 font-mono font-bold">{state.actorLibrary.length}</div>
          </div>
        </div>

        <div className="flex-grow overflow-y-scroll flex flex-col scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">

          <div className="sticky top-0 z-20 bg-[#18181b]/95 backdrop-blur-md px-4 pt-4 pb-2 border-b border-white/5 space-y-4">
            {activeFolder && (
              <div className="flex items-center gap-3 h-[34px]">
                <button
                  onClick={() => setActiveFolder(null)}
                  className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition-all uppercase tracking-wider"
                >
                  <ArrowDownUp className="w-3 h-3 rotate-90" /> Studios
                </button>
                <div className="h-6 w-[1px] bg-white/10" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest text-yellow-500">
                  {STUDIO_FOLDERS.find(f => f.id === activeFolder)?.label}
                </h3>
              </div>
            )}

            {/* SEARCH & SORT (Only show inside a folder) */}
            {activeFolder && (
              <div className="flex items-center gap-2">
                {/* Keep existing search UI */}
                <div className="relative flex-1 group">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-yellow-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search actors..."
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    className="w-full bg-black/40 border border-[#27272a] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-yellow-500/50 focus:outline-none transition-all"
                  />
                </div>
                {/* SORT BUTTON */}
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className={`h-9 px-3 flex items-center justify-center gap-2 rounded-lg border transition-all ${sortOption !== 'date' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'}`}
                  >
                    {sortOption === 'date' && <Calendar className="w-4 h-4" />}
                    {sortOption === 'name' && <Type className="w-4 h-4" />}
                    {sortOption === 'type' && <Layers className="w-4 h-4" />}
                    <span className="text-[10px] font-bold">SORT</span>
                  </button>
                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-2 w-32 bg-[#18181b] border border-[#27272a] rounded-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
                      <button onClick={() => { setSortOption('date'); setShowSortMenu(false); }} className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase flex items-center gap-2 hover:bg-white/5 text-gray-400"><Calendar className="w-3 h-3" /> Date</button>
                      <button onClick={() => { setSortOption('name'); setShowSortMenu(false); }} className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase flex items-center gap-2 hover:bg-white/5 text-gray-400"><Type className="w-3 h-3" /> Name</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>



          {/* CONTENT PADDING WRAPPER */}
          <div className="p-4 pt-2">

            {/* NATIVE MODE: MISSING CONFIG WARNING */}
            {isNativeParams() && !state.saveDirectoryPath && (
              <div className="mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-4">
                <div className="p-2 bg-yellow-500/20 rounded-lg text-yellow-500">
                  <LayoutTemplate className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-yellow-500 text-sm">Save Folder Not Configured</h3>
                  <p className="text-[11px] text-yellow-200/70">
                    To use Custom Covers in the Desktop App, you must select your project folder in Settings.
                    (Browser settings do not sync to Desktop automatically)
                  </p>
                </div>
                <button
                  onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs rounded-lg transition-colors"
                >
                  Configure
                </button>
              </div>
            )}

            {/* RESUME SESSION BANNER (Mobile/Desktop friendly) */}
            {needsPermission && (
              <div className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">File Access Needed</h4>
                    <p className="text-xs text-gray-400">Unlock your session to view custom covers.</p>
                  </div>
                </div>
                <button
                  onClick={() => loadDiskCovers(true)}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase text-xs rounded-lg tracking-widest transition-all "
                >
                  Resume
                </button>
              </div>
            )}

            {!activeFolder ? (
              // ROOT VIEW: HERO STUDIO CARDS
              <div className="flex flex-col gap-4 pb-20">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleCoverUpload} />

                {STUDIO_FOLDERS.map(folder => {
                  const count = state.actorLibrary.filter(a => {
                    const s = normalizeStyle(a.profile?.style);
                    if (folder.id === 'uncategorized') {
                      return !s || !knownStyles.has(s);
                    }
                    // Robust Category Count
                    const targetStyles = new Set(folder.styles.map(ts => normalizeStyle(ts)));
                    return targetStyles.has(s);
                  }).length;

                  const activeImage = state.customCovers[folder.id] || folder.image;

                  return (
                    <div key={folder.id} className="group relative h-48 w-full rounded-3xl overflow-hidden border border-white/10 transition-all hover:scale-[1.02] hover:border-white/30 cursor-pointer" onClick={() => setActiveFolder(folder.id)}>
                      {/* Background Image */}
                      {activeImage ? (
                        <img src={activeImage} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center">
                          <HelpCircle className="w-12 h-12 text-white/20" />
                        </div>
                      )}

                      {/* Cinematic Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent flex flex-col justify-end px-6 pb-4 pt-6">
                        <div>
                          <h3 className="text-lg font-black text-white italic tracking-tighter uppercase group-hover:text-yellow-500 transition-colors leading-none">
                            {folder.label}
                          </h3>
                          <div className="flex items-center gap-3 mt-2">
                            <p className="text-xs font-bold text-gray-300 border-l-2 border-yellow-500 pl-2">
                              {folder.description}
                            </p>
                            <span className="bg-white/10 backdrop-blur text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-sm border border-white/10">
                              {count} ACTORS
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Edit Hotspot (Corner Only) */}
                      <div className="absolute top-0 right-0 p-4 opacity-0 hover:opacity-100 transition-opacity duration-300 z-50">
                        <button
                          onClick={(e) => triggerCoverEdit(folder.id, e)}
                          className="w-auto h-8 px-3 rounded-full bg-black/80 border border-white/20 flex items-center gap-2 transition-all hover:bg-zinc-900 hover:border-yellow-500 group/btn"
                          title="Change Cover Image"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-white group-hover/btn:text-yellow-500 transition-colors" />
                          <span className="text-[10px] font-bold text-white group-hover/btn:text-yellow-500 uppercase tracking-wider transition-colors">Edit</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // FOLDER VIEW: GRID
              <div className="grid grid-cols-2 gap-4 pb-20">
                {filteredLibrary.map(actor => (
                  <div key={actor.id} className="group relative aspect-square rounded-xl overflow-hidden bg-black/40 border border-[#27272a] hover:border-yellow-500/50 transition-all hover:">
                    <img src={actor.url} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                    {/* Overlay Actions */}
                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-2 backdrop-blur-md">
                      {/* Top Row: 3 Actions */}
                      <div className="flex gap-2">
                        <HelpTooltip zone="cast" id="sendToDirectorButton">
                          <button
                            onClick={() => {
                              dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: actor.url });
                              dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: actor.profile?.identity || "" });
                              dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
                              setProcessedPreviewUrl(null);
                              dispatch({ type: 'ADD_LOG', payload: { message: `Loaded ${actor.name} into Viewport`, type: 'info' } });
                            }}
                            className="bg-[#27272a] hover:bg-orange-600 w-8 h-8 rounded-lg border border-white/10 hover:border-orange-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                            title="Load to Forge / Turnaround"
                          >
                            <Hammer className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                          </button>
                        </HelpTooltip>
                        <InlineHint zone="cast" id="sendToDirectorButton" className="hidden" />
                        <button
                          onClick={() => dispatch({ type: 'SET_INSPECT_IMAGE', payload: actor.url })}
                          className="bg-[#27272a] hover:bg-blue-600 w-8 h-8 rounded-lg border border-white/10 hover:border-blue-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                          title="Inspect Large"
                        >
                          <Maximize className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => dispatch({
                            type: 'ADD_CAST',
                            payload: { ...actor, id: `ref-${Date.now()}-${Math.random()}`, name: `${actor.name} (Ref)` }
                          })}
                          className="bg-[#27272a] hover:bg-emerald-600 w-8 h-8 rounded-lg border border-white/10 hover:border-emerald-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                          title="Add to Cast"
                        >
                          <UserPlus className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                        </button>
                      </div>
                      {/* Bottom Row: 2 Actions (Centered) */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setOrganizeTarget({ id: actor.id, name: actor.name })}
                          className="bg-[#27272a] hover:bg-purple-600 w-8 h-8 rounded-lg border border-white/10 hover:border-purple-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                          title="Move to Studio Folder"
                        >
                          <FolderInput className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ type: 'library', payload: actor.id, name: actor.name })}
                          className="bg-[#27272a] hover:bg-red-600 w-8 h-8 rounded-lg border border-white/10 hover:border-red-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                          title="Remove from Library"
                        >
                          <Trash2 className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                        </button>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/60 mt-3 pointer-events-none">Add to Stage</span>
                    </div>
                    {/* Centered Editable Label */}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-md border-t border-white/5 p-1.5 flex justify-center items-center">
                      <HelpTooltip zone="cast" id="actorNameDisplay">
                        <input
                          className="bg-transparent text-[10px] font-black uppercase text-center text-white/70 hover:text-white focus:text-white focus:outline-none w-full tracking-wider transition-colors"
                          value={actor.name}
                          onChange={(e) => dispatch({
                            type: 'UPDATE_ACTOR_LIBRARY',
                            payload: { id: actor.id, updates: { name: e.target.value } }
                          })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          title="Click to Rename Actor"
                        />
                      </HelpTooltip>
                    </div>
                  </div>
                ))}
                {filteredLibrary.length === 0 && (
                  <div className="col-span-2 py-10 flex flex-col items-center justify-center text-gray-600 gap-2 border border-dashed border-gray-800 rounded-xl">
                    <Folder className="w-8 h-8 opacity-20" />
                    <p className="text-xs uppercase font-bold tracking-widest">Empty Studio</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {state.actorLibrary.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-20 filter grayscale">
              <UserPlus className="w-12 h-12 mb-3 text-gray-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-center text-gray-500">Library Empty</span>
            </div>
          )}
        </div>
      </div>

      {/* TOAST OVERLAY */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.8 }}
            transition={{ type: "spring", damping: 15, stiffness: 300 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[5000] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 text-white px-5 py-3 rounded-full flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDelete}
        title="Delete Asset?"
        message={
          <>
            Are you sure you want to delete <span className="text-white font-bold">{deleteTarget?.name}</span>?
            {deleteTarget?.type === 'library' && " This will permanently remove it from your global actors."}
          </>
        }
        confirmText="Confirm"
        cancelText="Cancel"
        variant="danger"
      />

      <AnimatePresence>

        {/* ORGANIZATION MODAL */}
        {
          organizeTarget && (
            <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 max-w-md w-full relative overflow-hidden">
                <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                  <FolderInput className="w-5 h-5 text-purple-500" /> Move Actor
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  Select a Studio for <span className="text-white font-bold">{organizeTarget.name}</span>. This will update its style tag.
                </p>

                <div className="grid grid-cols-1 gap-2 mb-4">
                  {STUDIO_FOLDERS.filter(f => f.id !== 'uncategorized').map(folder => {
                    const activeImage = state.customCovers[folder.id] || folder.image;
                    return (
                      <div
                        key={folder.id}
                        onClick={() => {
                          const newStyle = folder.styles[0];
                          const actor = state.actorLibrary.find(a => a.id === organizeTarget.id);
                          if (actor) {
                            const updatedProfile = { ...(actor.profile || { identity: "Unknown", wardrobe: "", accessories: "", style: "" }), style: newStyle };
                            dispatch({
                              type: 'UPDATE_ACTOR_LIBRARY',
                              payload: {
                                id: organizeTarget.id,
                                updates: { profile: updatedProfile }
                              }
                            });
                            dispatch({ type: 'ADD_LOG', payload: { message: `Moved to ${folder.label}`, type: 'success' } });
                          }
                          setOrganizeTarget(null);
                        }}
                        className="group relative h-24 w-full rounded-xl overflow-hidden border border-white/10 transition-all hover:scale-[1.02] hover:border-purple-500 cursor-pointer mb-2"
                      >
                        {/* Background Image */}
                        {activeImage ? (
                          <img src={activeImage} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100" />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center">
                            <HelpCircle className="w-8 h-8 text-white/20" />
                          </div>
                        )}

                        {/* Cinematic Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent flex flex-col justify-center px-6">
                          <div>
                            <h3 className="text-xl font-black text-white italic tracking-tighter uppercase group-hover:text-purple-400 transition-colors leading-none">
                              {folder.label}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[10px] font-bold text-gray-300 border-l-2 border-purple-500 pl-2">
                                {folder.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setOrganizeTarget(null)}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </AnimatePresence>
    </div>
  );
};

export default CastingForge;



