import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors, Image as ImageIcon,
  Trash2, Upload, RotateCw, MonitorPlay,
  Eraser, RefreshCw, X,
  Target, Download, UserPlus, Sparkles,
  Maximize, RefreshCcw, LayoutTemplate, Share2, Info, CheckCircle2
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';

// Types are exported from AppContext
import type { CastMember } from '../context/AppContext';

const REFERENCE_SHEET_PROMPT = `Create a professional, 8k resolution character reference sheet based strictly on the uploaded reference image. Use a clean, neutral plain background.
CRITICAL COMPOSITION RULES:
- STRICT ADHERENCE to view counts. DO NOT add extra rows or duplicate figures.
- NO ghost images or hallucinations in negative space. Leave empty areas EMPTY.
- Maintain PERFECT facial identity and symmetry across ALL views. No distortion.
- Ensure feet, hands, and facial features are anatomically correct and sharp.
- Lighting must be studio-neutral with no harsh shadows obscuring details.
- Output must be crisp, production-ready, and free of artifacts.
`;

const CastingForge = () => {
  const { state, dispatch } = useAppContext();

  // Notification State
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
  const [invertBg, setInvertBg] = useState(false);

  // Draggable Panel State
  const [panelPosition, setPanelPosition] = useState<{ x: number, y: number } | null>(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [panelDragOffset, setPanelDragOffset] = useState({ x: 0, y: 0 });

  // Auto-reset UI when image is cleared
  useEffect(() => {
    if (!state.lastCastedImage) {
      setRemoveBg(false);
      setAiMaskActive(false);
    }
  }, [state.lastCastedImage]);

  const [tolerance, setTolerance] = useState(15);
  const [spillSuppression, setSpillSuppression] = useState(100);
  const [maskSoftening, setMaskSoftening] = useState(1.0);
  const [matteErosion, setMatteErosion] = useState(2);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [targetAngle, setTargetAngle] = useState<'front' | 'back' | 'left side' | 'right side' | '3/4 left' | '3/4 right' | null>(null);
  const [showTurnaround, setShowTurnaround] = useState(false);
  const [showRefSheet, setShowRefSheet] = useState(false);
  const [refSheetUrl, setRefSheetUrl] = useState<string | null>(null);
  const [refLayout, setRefLayout] = useState<'form_focus' | 'face_focus' | 'split_focus'>('form_focus');

  const imgRef = useRef<HTMLImageElement>(null);
  const maskImgRef = useRef<HTMLImageElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const generationIdRef = useRef<number>(0);

  const runIsolationProcess = (): string | null => {
    if (!removeBg || !state.lastCastedImage || !imgRef.current || !previewCanvasRef.current) {
      setProcessedPreviewUrl(null);
      return null;
    }

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = imgRef.current;
    if (!img.complete || img.naturalWidth === 0) return null;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx?.clearRect(0, 0, canvas.width, canvas.height);

    let finalUrl: string | null = null;

    if (aiMaskActive && state.lastCastedMask && maskImgRef.current) {
      const maskImg = maskImgRef.current;
      if (maskImg.complete && maskImg.naturalWidth > 0) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx?.drawImage(maskImg, 0, 0, canvas.width, canvas.height);

        let maskData = tempCtx?.getImageData(0, 0, canvas.width, canvas.height);

        if (matteErosion > 0 && maskData) {
          const originalData = new Uint8ClampedArray(maskData.data);
          const width = canvas.width;
          const height = canvas.height;
          const eroded = maskData.data;
          const radius = matteErosion;

          for (let y = radius; y < height - radius; y++) {
            for (let x = radius; x < width - radius; x++) {
              const idx = (y * width + x) * 4;
              let minLuminance = 255;
              for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                  const nIdx = ((y + dy) * width + (x + dx)) * 4;
                  const lum = (originalData[nIdx] + originalData[nIdx + 1] + originalData[nIdx + 2]) / 3;
                  if (lum < minLuminance) minLuminance = lum;
                  if (minLuminance === 0) break;
                }
                if (minLuminance === 0) break;
              }
              eroded[idx] = eroded[idx + 1] = eroded[idx + 2] = minLuminance;
            }
          }
          tempCtx?.putImageData(maskData, 0, 0);
        }

        if (maskSoftening > 0 && tempCtx) {
          const blurCanvas = document.createElement('canvas');
          blurCanvas.width = canvas.width;
          blurCanvas.height = canvas.height;
          const blurCtx = blurCanvas.getContext('2d');
          if (blurCtx) {
            blurCtx.filter = `blur(${maskSoftening}px)`;
            blurCtx.drawImage(tempCanvas, 0, 0);
            maskData = blurCtx.getImageData(0, 0, canvas.width, canvas.height);
          }
        }

        ctx?.drawImage(img, 0, 0);
        const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        const finalMaskData = maskData || tempCtx?.getImageData(0, 0, canvas.width, canvas.height);

        if (imgData && finalMaskData) {
          const data = imgData.data;
          const mask = finalMaskData.data;

          for (let i = 0; i < data.length; i += 4) {
            const maskLum = (mask[i] + mask[i + 1] + mask[i + 2]) / 3;
            const finalAlpha = invertBg ? (255 - maskLum) : maskLum;
            data[i + 3] = finalAlpha;

            if (spillSuppression > 0 && finalAlpha > 0) {
              const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
              const avgRB = (r + b) / 2;
              if (g > avgRB) {
                const diff = g - avgRB;
                const factor = spillSuppression / 100;
                data[i + 1] = g - (diff * factor);
                if (finalAlpha < 240) {
                  const alphaReduction = Math.min(finalAlpha, (diff * (factor * 0.5)));
                  data[i + 3] = finalAlpha - alphaReduction;
                }
              }
            }
          }

          ctx?.putImageData(imgData, 0, 0);
          finalUrl = canvas.toDataURL('image/png');
          setProcessedPreviewUrl(finalUrl);
          return finalUrl;
        }
      }
    }

    ctx?.drawImage(img, 0, 0);
    const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    if (imageData) {
      const data = imageData.data;
      const key = { r: data[0], g: data[1], b: data[2] };
      const tol = tolerance;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
        const isMatch = Math.abs(r - key.r) < tol && Math.abs(g - key.g) < tol && Math.abs(b - key.b) < tol;

        if (invertBg) {
          if (!isMatch) data[i + 3] = 0;
        } else {
          if (isMatch) data[i + 3] = 0;
        }

        if (spillSuppression > 0 && data[i + 3] > 0) {
          const rP = data[i]; const gP = data[i + 1]; const bP = data[i + 2];
          const avgRB = (rP + bP) / 2;
          if (gP > avgRB) {
            const factor = spillSuppression / 100;
            data[i + 1] = gP * (1 - factor) + avgRB * factor;
          }
        }
      }
      ctx?.putImageData(imageData, 0, 0);
      finalUrl = canvas.toDataURL('image/png');
      setProcessedPreviewUrl(finalUrl);
      return finalUrl;
    }
    return null;
  };

  useEffect(() => {
    runIsolationProcess();
  }, [removeBg, invertBg, tolerance, state.lastCastedImage, aiMaskActive, matteErosion, spillSuppression, maskSoftening, state.lastCastedMask]);

  const handleGenerate = async () => {
    const effectivePrompt = state.lastCastedPrompt || "A character design sheet";
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
    setProcessedPreviewUrl(null);

    const currentGenId = Date.now();
    generationIdRef.current = currentGenId;

    try {
      let res;
      if (state.lastCastedImage && state.apiKey) {
        dispatch({ type: 'ADD_LOG', payload: { message: "Applying stylization to character...", type: 'info' } });
        res = await GeminiService.generateImage(
          `Stylize the subject in [IMAGE 1] to match this character description: ${effectivePrompt}. 
          CRITICAL: 
          1. MAINTAIN the subject's identity, hair structure, and key physical features from [IMAGE 1].
          2. TRANSFORM the render style and clothing to match the prompt.
          3. FORCE a solid Neon Green background (#39FF14) for perfect subject isolation.`,
          state.apiKey,
          state.model,
          [{ url: state.lastCastedImage, label: 'Subject Reference' }]
        );
      } else {
        res = await GeminiService.generateImage(`Character design sheet: ${effectivePrompt}, Use a solid Neon Green background (#39FF14) for perfect subject isolation.`, state.apiKey, 'imagen-4.0-generate-001');
      }

      if (generationIdRef.current === currentGenId) {
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: res });
      } else {
        return;
      }

      try {
        dispatch({ type: 'ADD_LOG', payload: { message: "Isolating character silhouette...", type: 'info' } });
        const maskModel = state.model.includes('gemini') ? state.model : 'gemini-2.5-flash-image';

        const img = new Image();
        img.onload = async () => {
          const w = img.width;
          const h = img.height;
          let aspectRatio = '1:1';
          const ratio = w / h;

          if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = '16:9';
          else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = '9:16';
          else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = '4:3';
          else if (Math.abs(ratio - 3 / 4) < 0.1) aspectRatio = '3:4';
          else if (Math.abs(ratio - 4 / 5) < 0.1) aspectRatio = '4:5';

          try {
            const maskRes = await GeminiService.generateImage(
              "DIGITAL CHARACTER SEGMENTATION MASK: Create a pixel-perfect, high-contrast black and white silhouette of the character. White (#FFFFFF) = Subject, Black (#000000) = Background. Ensure soft anti-aliased edges and zero color contamination. Film-grade precision.",
              state.apiKey!,
              maskModel,
              [{ url: res, label: "Subject" }],
              { aspectRatio }
            );

            if (generationIdRef.current === currentGenId) {
              dispatch({ type: 'SET_LAST_CASTED_MASK', payload: maskRes });
              dispatch({ type: 'ADD_LOG', payload: { message: "Mask auto-generated", type: 'success' } });
            }
          } catch (innerErr) { }
        };
        img.src = res;

      } catch (maskErr) { }

      const logMessage = state.lastCastedImage ? "Character stylized" : "Character generated";
      dispatch({ type: 'ADD_LOG', payload: { message: logMessage, type: 'success' } });
      dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: '' }); // Clear input as requested
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleGenerateMissing = async () => {
    if (!targetAngle || !state.lastCastedImage) return;
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
    setProcessedPreviewUrl(null);

    const currentGenId = Date.now();
    generationIdRef.current = currentGenId;
    const effectivePrompt = state.lastCastedPrompt || "this character";

    try {
      let imgUrl;
      dispatch({ type: 'ADD_LOG', payload: { message: `Generating isolated ${targetAngle} view...`, type: 'info' } });

      let anglePrompt = "";
      if (targetAngle === 'left side') anglePrompt = "FULL BODY LEFT PROFILE VIEW. Facing profile left at a sharp 90-degree angle.";
      if (targetAngle === 'right side') anglePrompt = "FULL BODY RIGHT PROFILE VIEW. Facing profile right at a sharp 90-degree angle.";
      if (targetAngle === 'front') anglePrompt = "FULL BODY FRONT VIEW. Facing directly forward.";
      if (targetAngle === 'back') anglePrompt = "FULL BODY BACK VIEW. Seen directly from behind at a 180-degree angle.";
      if (targetAngle === '3/4 left') anglePrompt = "FULL BODY THREE-QUARTER FRONT-LEFT VIEW. Facing at a 45-degree angle to the left.";
      if (targetAngle === '3/4 right') anglePrompt = "FULL BODY THREE-QUARTER FRONT-RIGHT VIEW. Facing at a 45-degree angle to the right.";

      if (state.apiKey) {
        imgUrl = await GeminiService.generateImage(
          `Generate a SINGLE, ISOLATED drawing of the ${anglePrompt} of this character. 
                CRITICAL DIRECTIONAL RULES: 
                1. STRICTLY follow the geometric angle specified: ${anglePrompt}.
                2. Draw ONLY one figure.
                3. STRICTLY maintain all costume details, colors, and features from the reference.
                4. FORCE a solid Neon Green background (#39FF14) for perfect subject isolation.
                Character description: ${effectivePrompt}`,
          state.apiKey,
          'gemini-2.5-flash-image',
          [{ url: state.lastCastedImage, label: 'Character Ref' }]
        );
      } else {
        imgUrl = await GeminiService.generateImage(
          `Character concept art, single isolated ${targetAngle} view of ${effectivePrompt}, FORCE a solid Neon Green background (#39FF14).`,
          state.apiKey,
          'imagen-4.0-generate-001'
        );
      }

      if (generationIdRef.current === currentGenId) {
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: imgUrl });
        try {
          const maskModel = state.model.includes('gemini') ? state.model : 'gemini-2.5-flash-image';
          const maskRes = await GeminiService.generateImage(
            "DIGITAL CHARACTER SEGMENTATION MASK: Create a pixel-perfect, high-contrast black and white silhouette. White = Subject, Black = Background. Ensure anti-aliased edges with zero bleed.",
            state.apiKey!,
            maskModel,
            [{ url: imgUrl, label: "Subject" }]
          );
          if (generationIdRef.current === currentGenId) {
            dispatch({ type: 'SET_LAST_CASTED_MASK', payload: maskRes });
          }
        } catch { }
      }
      dispatch({ type: 'ADD_LOG', payload: { message: `Generated ${targetAngle} view.`, type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleSaveToActorLibrary = async () => {
    if (!state.lastCastedImage) return;

    const prepareLibraryImage = (dataUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 2048;
          let w = img.width;
          let h = img.height;
          if (w > h) {
            if (w > maxDim) { h *= maxDim / w; w = maxDim; }
          } else {
            if (h > maxDim) { w *= maxDim / h; h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
      });
    };

    const freshlyIsolatedUrl = runIsolationProcess();
    const finalUrl = await prepareLibraryImage(freshlyIsolatedUrl || processedPreviewUrl || state.lastCastedImage);

    if (state.saveDirectoryHandle) {
      try {
        const actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: true });
        const safeName = (state.lastCastedPrompt || 'NewActor').slice(0, 30).replace(/[^a-z0-9]/gi, '_');
        const filename = `Actor-${state.actorLibrary.length + 1}-${safeName}.png`;
        const fileHandle = await actorsDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        const res = await fetch(finalUrl);
        const blob = await res.blob();
        await writable.write(blob);
        await writable.close();
        dispatch({ type: 'ADD_LOG', payload: { message: `Actor saved to disk: Actors/${filename}`, type: 'success' } });
      } catch (e: any) {
        dispatch({ type: 'ADD_LOG', payload: { message: `Disk save failed: ${e.message}`, type: 'error' } });
      }
    }

    const isDuplicate = state.actorLibrary.some(a => a.url === finalUrl);
    if (isDuplicate) {
      dispatch({ type: 'ADD_LOG', payload: { message: "Actor already in library", type: 'info' } });
      return;
    }

    const newActor: CastMember = {
      id: `actor-${Date.now()}`,
      url: finalUrl,
      tag: 'front',
      name: `Actor ${state.actorLibrary.length + 1}`,
      profile: {
        identity: state.lastCastedPrompt || "Unknown Identity",
        wardrobe: "",
        accessories: "",
        style: ""
      }
    };
    dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
    dispatch({ type: 'ADD_LOG', payload: { message: "Character saved to Actor Library", type: 'success' } });
  };

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
          let aspectRatio = '1:1';
          const ratio = w / h;

          if (Math.abs(ratio - 16 / 9) < 0.2) { aspectRatio = '16:9'; targetRatio = 16 / 9; }
          else if (Math.abs(ratio - 9 / 16) < 0.2) { aspectRatio = '9:16'; targetRatio = 9 / 16; }
          else if (Math.abs(ratio - 4 / 3) < 0.2) { aspectRatio = '4:3'; targetRatio = 4 / 3; }
          else if (Math.abs(ratio - 3 / 4) < 0.2) { aspectRatio = '3:4'; targetRatio = 3 / 4; }

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
              dispatch({ type: 'ADD_LOG', payload: { message: "Isolating character silhouette from upload...", type: 'info' } });
              const maskModel = state.model.includes('gemini') ? state.model : 'gemini-2.5-flash-image';
              const maskRes = await GeminiService.generateImage(
                "DIGITAL CHARACTER SEGMENTATION MASK: Create a pure black and white silhouette of the character in the image. White = Subject, Black = Background. Film precision.",
                state.apiKey,
                maskModel,
                [{ url: standardizedUrl, label: "Subject" }],
                { aspectRatio }
              );

              if (generationIdRef.current === currentGenId) {
                dispatch({ type: 'SET_LAST_CASTED_MASK', payload: maskRes });
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

    try {
      let finalPrompt = REFERENCE_SHEET_PROMPT;

      if (refLayout === 'form_focus') {
        finalPrompt += " [LAYOUT A - CLASSIC]: Split canvas horizontally. Top 65% height: ROW OF EXACTLY 3 Full Body views (Front, Side, Back). Bottom 35% height: Grid of EXACTLY 4 Headshots. Ensure headshots are MACRO-DETAILED and hyper-sharp.";
      } else if (refLayout === 'face_focus') {
        finalPrompt += " [LAYOUT B - FACE FIRST]: Split canvas horizontally. Top 55% height: Row of EXACTLY 4 Large Headshots (Front, Left, Right, Back). Bottom 45% height: Row of EXACTLY 3 Full Body views. Headshots must maintain perfect identity.";
      } else if (refLayout === 'split_focus') {
        finalPrompt += " [LAYOUT C - STUDIO]: Split canvas vertically. Left 45% width: Vertical stack of EXACTLY 3 Full Body views (Front, Side, Back). DO NOT ADD A FOURTH VIEW. Right 55% width: 2x2 Grid of Large Headshots. Highest possible facial resolution.";
      }

      const res = await GeminiService.generateImage(
        finalPrompt,
        state.apiKey,
        state.model.includes('imagen') ? 'imagen-4.0-generate-001' : 'gemini-3-pro-image-preview', // Force high-reasoning model if available
        [{ url: state.lastCastedImage, label: 'Character Reference' }],
        { aspectRatio: '16:9' }
      );
      setRefSheetUrl(res);
      setShowRefSheet(true);
      dispatch({ type: 'ADD_LOG', payload: { message: "Reference Sheet Generated.", type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Ref Sheet failed: ${e.message}`, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const panelDimRef = useRef({ w: 0, h: 0 });

  const handlePanelMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (['INPUT', 'BUTTON', 'LABEL'].includes(target.tagName)) return;

    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const panelRect = e.currentTarget.getBoundingClientRect();
    panelDimRef.current = { w: panelRect.width, h: panelRect.height };

    const offsetX = e.clientX - panelRect.left;
    const offsetY = e.clientY - panelRect.top;

    setPanelDragOffset({ x: offsetX, y: offsetY });
    setIsDraggingPanel(true);

    const borderLeft = containerRef.current.clientLeft || 0;
    const borderTop = containerRef.current.clientTop || 0;

    setPanelPosition({
      x: panelRect.left - containerRect.left - borderLeft,
      y: panelRect.top - containerRect.top - borderTop
    });
  };

  const startInteraction = (e: React.MouseEvent, handle: string | null = null) => {
    if (!isCropping || !containerRef.current) return;
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

    if (isDraggingPanel) {
      const containerRect = containerRef.current.getBoundingClientRect();
      let newX = e.clientX - containerRect.left - panelDragOffset.x;
      let newY = e.clientY - containerRect.top - panelDragOffset.y;
      const pW = panelDimRef.current.w || 320;
      const pH = panelDimRef.current.h || 400;
      const maxX = containerRect.width - pW;
      const maxY = containerRect.height - pH;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
      setPanelPosition({ x: newX, y: newY });
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
    setCropStart(null);
    setActiveHandle(null);
    setIsDraggingPanel(false);
  };

  const finalizeCrop = (tag: CastMember['tag']) => {
    if (!cropRect || !containerRef.current || cropRect.w < 10) return;
    const isUsingCanvas = !!(processedPreviewUrl && previewImgRef.current);
    const visualElement = isUsingCanvas ? previewImgRef.current : imgRef.current;
    if (!visualElement || !imgRef.current) return;

    const visualRect = visualElement.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const offsetLeft = visualRect.left - containerRect.left;
    const offsetTop = visualRect.top - containerRect.top;
    const cropX_onVisual = cropRect.x - offsetLeft;
    const cropY_onVisual = cropRect.y - offsetTop;

    let sourceFullWidth = imgRef.current.naturalWidth;
    let sourceFullHeight = imgRef.current.naturalHeight;
    if (isUsingCanvas && previewCanvasRef.current) {
      sourceFullWidth = previewCanvasRef.current.width;
      sourceFullHeight = previewCanvasRef.current.height;
    }

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
      if (isUsingCanvas && previewCanvasRef.current) {
        ctx.drawImage(previewCanvasRef.current, safeSx, safeSy, safeW, safeH, safeDx, safeDy, safeW, safeH);
      } else {
        ctx.drawImage(imgRef.current, safeSx, safeSy, safeW, safeH, safeDx, safeDy, safeW, safeH);
      }
      const tokenUrl = canvas.toDataURL('image/png');
      const newActor: CastMember = {
        id: `actor-${Date.now()}`,
        url: tokenUrl,
        tag: tag,
        name: `Actor ${state.actorLibrary.length + 1}`,
        profile: { identity: state.lastCastedPrompt || "Unknown Identity", wardrobe: "", accessories: "", style: "" }
      };
      dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
      setIsCropping(false);
      setCropRect(null);
      dispatch({ type: 'ADD_LOG', payload: { message: `Sliced to Actor Library (${tag})`, type: 'success' } });
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
      <div className="w-[400px] flex flex-col gap-4 h-full shrink-0">

        {/* Source Material */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 shadow-xl shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">1. Source Material</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleGenerate}
              disabled={state.isProcessing}
              className={`flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-black transition-all border uppercase tracking-wider active:scale-95 ${state.lastCastedImage
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)]'
                : 'bg-gradient-to-r from-[#27272a] to-[#18181b] hover:from-[#3f3f46] hover:to-[#27272a] text-white border-[#3f3f46] hover:border-gray-500 shadow-lg'
                }`}
            >
              {state.isProcessing ? <RotateCw className="animate-spin w-4 h-4" /> : state.lastCastedImage ? <RefreshCw className="w-4 h-4" /> : <MonitorPlay className="w-4 h-4" />}
              {state.lastCastedImage ? 'Stylize' : 'Generate'}
            </button>
            <label className="flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-white py-2.5 rounded-lg text-xs font-bold transition-all border border-[#3f3f46] hover:border-gray-500 cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
            </label>
          </div>
        </div>

        {/* Turnaround Completer */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 shadow-xl shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> 2. Turnaround Completer
            </h2>
            <button
              onClick={() => setShowTurnaround(!showTurnaround)}
              className={`w-10 h-5 rounded-full transition-all relative ${showTurnaround ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${showTurnaround ? 'left-5.5' : 'left-0.5'}`} />
            </button>
          </div>

          {showTurnaround && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="mb-4">
                <label className="text-[10px] text-gray-500 block mb-2 uppercase font-bold">Select Angle to Generate</label>
                <div className="grid grid-cols-2 gap-2">
                  {['front', 'back', 'left side', 'right side', '3/4 left', '3/4 right'].map((view: any) => (
                    <button
                      key={view}
                      onClick={() => setTargetAngle(targetAngle === view ? null : view)}
                      className={`py-2 rounded text-xs font-bold capitalize transition-all border ${targetAngle === view ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-gray-700 text-gray-400 hover:border-gray-500'}`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleGenerateMissing}
                disabled={state.isProcessing || !targetAngle || !state.lastCastedImage}
                className={`w-full py-4 rounded-xl text-[10px] font-black flex justify-center items-center gap-2 transition-all shadow-xl uppercase tracking-wider active:scale-95 ${!targetAngle || !state.lastCastedImage
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700 opacity-50'
                  : 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black shadow-[0_0_20px_rgba(234,179,8,0.2)] hover:shadow-[0_0_30px_rgba(234,179,8,0.4)] border border-yellow-400/30'
                  }`}
              >
                {state.isProcessing ? <RotateCw className="animate-spin w-4 h-4" /> : <Target className="w-4 h-4" />}
                {!state.lastCastedImage ? "Load Source First" : !targetAngle ? "Select an Angle" : `Generate ${targetAngle?.toUpperCase()} View`}
              </button>
            </div>
          )}
        </div>


        {/* Reference Sheet Generator */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 shadow-xl shrink-0">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" /> 3. Actor Reference Sheet
            <div className="group relative">
              <Info className="w-3 h-3 text-gray-600 hover:text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <strong className="text-white block mb-1">Production Note:</strong>
                High-Fidelity AI Synthesis: Identity & layout are strictly enforced, but minor variations may occur. Always review for production use.
              </div>
            </div>
          </h2>

          <div className="flex gap-2 mb-4">
            {[
              { id: 'form_focus', label: 'Form A' },
              { id: 'face_focus', label: 'Face B' },
              { id: 'split_focus', label: 'Split C' }
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => setRefLayout(l.id as any)}
                className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all border ${refLayout === l.id
                  ? 'bg-purple-900 border-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                  : 'bg-black border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
              >
                {l.label}
              </button>
            ))}
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
            <div className="relative w-full max-w-6xl h-[90vh] flex flex-col items-center bg-[#18181b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center w-full p-6 border-b border-white/10 bg-[#09090b] flex-shrink-0">
                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                  <LayoutTemplate className="w-6 h-6 text-purple-400" /> Reference Sheet
                </h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const newMember: CastMember = {
                        id: `ref-${Date.now()}`,
                        url: refSheetUrl,
                        name: `Ref Sheet ${new Date().toLocaleTimeString()}`,
                        tag: 'front',
                        profile: { identity: "Reference Sheet", wardrobe: "", accessories: "", style: "" }
                      };
                      dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newMember });
                      dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newMember });
                      showToast("Added to Library");
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
                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-purple-900/50 flex items-center gap-2"
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
                <img src={refSheetUrl} className="max-w-full max-h-full object-contain shadow-2xl" />
              </div>
            </div>
          </div>
        )}

        {/* CAST ASSETS (RESTORED) */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 flex-grow flex flex-col shadow-xl min-h-0">
          <h2 className="text-sm font-bold text-gray-400 uppercase mb-4 tracking-wider flex justify-between items-center shrink-0">
            <span>Cast Assets</span>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-500">{state.cast.length} tokens</span>
          </h2>
          <div className="overflow-y-auto pr-1 flex-grow scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent pb-2">
            <div className="grid grid-cols-3 gap-2">
              {state.cast.map(c => (
                <div
                  key={c.id}
                  className="aspect-square bg-black border border-gray-700 rounded-lg overflow-hidden relative group cursor-pointer hover:border-yellow-500 transition-colors"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify(c))}
                >
                  <img src={c.url} className="w-full h-full object-contain" />
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_INSPECT_IMAGE', payload: c.url }); }}
                      className="bg-blue-500/80 hover:bg-blue-500 text-white p-1 rounded-full shadow-lg"
                      title="Inspect Large"
                    >
                      <Maximize className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'REMOVE_CAST', payload: c.id }); }}
                      className="bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-full shadow-lg"
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
        <div className="flex-grow bg-[#09090b] rounded-2xl border border-gray-800 flex flex-col overflow-hidden relative shadow-2xl">
          <div className="p-3 bg-[#18181b] border-b border-gray-800 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse border border-green-400/50"></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#a1a1aa]">Viewport: Active</span>
            </div>
            <div className="flex items-center gap-4">
              {state.lastCastedImage && (
                <div className="flex items-center gap-3 pr-4 border-r border-white/10">
                  <button
                    onClick={handleSaveToActorLibrary}
                    className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white px-4 py-1.5 rounded-full text-[9px] font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border border-emerald-500/20"
                  >
                    <UserPlus className="w-4 h-4" /> Add to Library
                  </button>
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
                  ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/20'
                  : 'bg-black/40 text-gray-500 border-white/5 hover:border-white/20 hover:text-gray-200'
                  }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                Slicer {isCropping ? 'Active' : 'Idle'}
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="flex-grow relative bg-black flex items-center justify-center overflow-hidden select-none group border-4 border-blue-500/30 rounded-2xl m-2 shadow-[0_0_30px_rgba(59,130,246,0.1)]"
            onMouseDown={(e) => startInteraction(e)}
            onMouseMove={moveInteraction}
            onMouseUp={endInteraction}
            onMouseLeave={endInteraction}
          >
            {state.lastCastedImage ? (
              <>
                <img
                  ref={imgRef}
                  src={state.lastCastedImage}
                  crossOrigin="anonymous"
                  onLoad={() => runIsolationProcess()}
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
                    onLoad={() => runIsolationProcess()}
                    className="hidden"
                  />
                )}
              </>
            ) : (
              <div className="text-gray-700 flex flex-col items-center">
                <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-sm font-mono opacity-40">No Reference Image Loaded</p>
              </div>
            )}

            {state.lastCastedImage && (
              <div
                onMouseDown={handlePanelMouseDown}
                style={panelPosition ? { left: panelPosition.x, top: panelPosition.y, right: 'auto' } : undefined}
                className={`absolute ${!panelPosition ? 'top-8 right-8' : ''} flex flex-col gap-3 z-20 bg-black/60 p-4 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl w-80 animate-in fade-in zoom-in-95 duration-300 cursor-move active:border-blue-500/30 transition-colors pointer-events-auto`}
              >
                <div className="flex items-center justify-between gap-6 px-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={removeBg}
                      onChange={(e) => setRemoveBg(e.target.checked)}
                      className="w-4 h-4 accent-blue-500 rounded border-white/10 bg-black"
                    />
                    <Eraser className="w-3.5 h-3.5" /> Remove BG
                  </label>

                  <div className="flex items-center gap-2">
                    <label className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer select-none ${state.lastCastedMask ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'}`}>
                      <input
                        type="checkbox"
                        checked={aiMaskActive}
                        onChange={async (e) => {
                          setAiMaskActive(e.target.checked);
                          if (e.target.checked && !state.lastCastedMask) {
                            if (!state.apiKey) {
                              dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for AI Masking", type: 'error' } });
                              setAiMaskActive(false);
                              return;
                            }
                            if (state.lastCastedImage) {
                              try {
                                const currentGenId = Date.now();
                                generationIdRef.current = currentGenId;
                                dispatch({ type: 'ADD_LOG', payload: { message: "Auto-regenerating mask...", type: 'info' } });
                                const img = new Image();
                                img.onload = async () => {
                                  const w = img.width;
                                  const h = img.height;
                                  let aspectRatio = '1:1';
                                  const ratio = w / h;
                                  if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = '16:9';
                                  else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = '9:16';
                                  else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = '4:3';
                                  else if (Math.abs(ratio - 3 / 4) < 0.1) aspectRatio = '3:4';
                                  else if (Math.abs(ratio - 4 / 5) < 0.1) aspectRatio = '4:5';

                                  const maskModel = (state.model && state.model.includes('gemini')) ? state.model : 'gemini-2.5-flash-image';
                                  try {
                                    const maskRes = await GeminiService.generateImage(
                                      "DIGITAL CHARACTER SEGMENTATION MASK: Create a pixel-perfect, high-contrast black and white silhouette of the character. White = Subject, Black = Background. Sharp focus, anti-aliased edges.",
                                      state.apiKey!,
                                      maskModel,
                                      [{ url: state.lastCastedImage!, label: "Subject" }],
                                      { aspectRatio }
                                    );
                                    if (generationIdRef.current === currentGenId) {
                                      dispatch({ type: 'SET_LAST_CASTED_MASK', payload: maskRes });
                                      dispatch({ type: 'ADD_LOG', payload: { message: "Mask ready", type: 'success' } });
                                    }
                                  } catch (innerErr) { }
                                };
                                img.src = state.lastCastedImage;
                              } catch (err: any) { }
                            }
                          }
                        }}
                        className={`w-3.5 h-3.5 rounded border-white/10 bg-black ${state.lastCastedMask ? 'accent-blue-500' : 'accent-gray-600'}`}
                      />
                      <Sparkles className={`w-3 h-3 ${!state.lastCastedMask ? 'opacity-50' : ''}`} />
                      {aiMaskActive && !state.lastCastedMask ? (
                        <div className="ml-1 flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(59,130,246,0.15)] animate-in fade-in slide-in-from-left-1 duration-300">
                          <Sparkles className="w-3 h-3 text-blue-400 animate-spin" />
                          <span className="text-[8px] font-black uppercase tracking-widest bg-gradient-to-r from-blue-300 via-indigo-200 to-blue-300 text-transparent bg-clip-text animate-pulse">
                            Generating...
                          </span>
                        </div>
                      ) : (
                        "AI Masking"
                      )}
                    </label>
                    {state.lastCastedImage && (
                      <button
                        onClick={async () => {
                          if (!state.apiKey) return;
                          dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
                          const currentGenId = Date.now();
                          generationIdRef.current = currentGenId;
                          const img = new Image();
                          img.onload = async () => {
                            const w = img.width;
                            const h = img.height;
                            let aspectRatio = '1:1';
                            const ratio = w / h;
                            if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = '16:9';
                            else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = '9:16';
                            else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = '4:3';
                            else if (Math.abs(ratio - 3 / 4) < 0.1) aspectRatio = '3:4';
                            else if (Math.abs(ratio - 4 / 5) < 0.1) aspectRatio = '4:5';

                            try {
                              const maskModel = (state.model && state.model.includes('gemini')) ? state.model : 'gemini-2.5-flash-image';
                              const maskRes = await GeminiService.generateImage(
                                "DIGITAL CHARACTER SEGMENTATION MASK: Create a pixel-perfect, high-contrast black and white silhouette of the character. White = Subject, Black = Background. Zero bleeding, smooth edges.",
                                state.apiKey!,
                                maskModel,
                                [{ url: state.lastCastedImage!, label: "Subject" }],
                                { aspectRatio }
                              );
                              if (generationIdRef.current === currentGenId) {
                                dispatch({ type: 'SET_LAST_CASTED_MASK', payload: maskRes });
                              }
                            } catch (e: any) { }
                          };
                          img.src = state.lastCastedImage!;
                        }}
                        className="text-gray-600 hover:text-white transition-colors p-1"
                        title="Regenerate Mask"
                      >
                        <RefreshCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {removeBg && (
                  <div className="space-y-3 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      <span>Tolerance</span>
                      <span>{tolerance}%</span>
                    </div>
                    <input type="range" min="1" max="100" value={tolerance} onChange={(e) => setTolerance(parseInt(e.target.value))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                    {state.lastCastedMask && aiMaskActive && (
                      <>
                        <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider pt-1">
                          <span>Matte Contraction</span>
                          <span>{matteErosion}px</span>
                        </div>
                        <input type="range" min="0" max="10" step="1" value={matteErosion} onChange={(e) => setMatteErosion(parseInt(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer" />
                        <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider pt-1">
                          <span>Mask Softening</span>
                          <span>{maskSoftening}px</span>
                        </div>
                        <input type="range" min="0" max="10" step="0.5" value={maskSoftening} onChange={(e) => setMaskSoftening(parseFloat(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer" />
                      </>
                    )}
                    <div className="flex items-center justify-between text-[9px] font-bold text-green-400/60 uppercase tracking-wider pt-1">
                      <span>Spill Suppression</span>
                      <span>{spillSuppression}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={spillSuppression} onChange={(e) => setSpillSuppression(parseInt(e.target.value))} className="w-full h-1 bg-green-900/30 rounded-lg appearance-none cursor-pointer" />
                    <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:text-gray-300 transition-colors pt-2 select-none">
                        <input type="checkbox" checked={invertBg} onChange={(e) => setInvertBg(e.target.checked)} className="w-3.5 h-3.5 accent-red-500 rounded border-gray-700 bg-black/50" />
                        Invert Matte
                      </label>
                      <div className="w-10 h-10 bg-black/60 border border-white/5 rounded-xl overflow-hidden shadow-inner flex items-center justify-center mt-2">
                        <canvas ref={previewCanvasRef} className="max-w-full max-h-full object-contain scale-150" />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 pt-3 border-t border-white/5 mt-1">
                  <button onClick={handleSaveToActorLibrary} className="w-14 h-14 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-2xl transition-all flex items-center justify-center border border-emerald-500/20 shadow-lg">
                    <UserPlus className="w-6 h-6" />
                  </button>
                  <button onClick={handleDownload} className="w-14 h-14 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-2xl transition-all flex items-center justify-center border border-blue-500/20 shadow-lg">
                    <Download className="w-6 h-6" />
                  </button>
                  <button onClick={() => dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: null })} className="w-14 h-14 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all flex items-center justify-center border border-red-500/20 shadow-lg">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}

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
                      <button key={tag} onMouseDown={(e) => { e.stopPropagation(); finalizeCrop(tag); }} className="bg-[#18181b] text-white text-[10px] px-2 py-1 rounded border border-gray-600 hover:bg-yellow-500 hover:text-black uppercase font-bold">
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <canvas ref={previewCanvasRef} className="hidden" />
        </div>
      </div>

      {/* 3. RIGHT SIDEBAR: Actor Library */}
      <div className="w-96 border-l border-gray-800 bg-[#18181b] flex flex-col shadow-xl shrink-0">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center h-16 shadow-lg bg-black/20">
          <h2 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-3">
            <UserPlus className="w-4 h-4 text-blue-400" /> Actor Library
          </h2>
          <div className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30 text-blue-400 font-mono font-bold">{state.actorLibrary.length}</div>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
          <div className="grid grid-cols-2 gap-4">
            {state.actorLibrary
              .filter((actor, index, self) =>
                index === self.findIndex((t) => (
                  t.url === actor.url
                ))
              )
              .map(actor => (
                <div
                  key={actor.id}
                  className="group relative aspect-square rounded-2xl border border-[#27272a] overflow-hidden transition-all hover:border-yellow-500/50 shadow-2xl"
                >
                  <img src={actor.url} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: actor.url });
                          dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: actor.profile?.identity || "" });
                          dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
                          setProcessedPreviewUrl(null);
                          dispatch({ type: 'ADD_LOG', payload: { message: `Loaded ${actor.name} into Viewport`, type: 'info' } });
                        }}
                        className="bg-[#27272a] hover:bg-orange-600 w-12 h-12 rounded-xl border border-white/10 hover:border-orange-400/50 shadow-xl transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                        title="Load to Forge / Turnaround"
                      >
                        <RotateCw className="w-5 h-5 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => dispatch({ type: 'SET_INSPECT_IMAGE', payload: actor.url })}
                        className="bg-[#27272a] hover:bg-blue-600 w-12 h-12 rounded-xl border border-white/10 hover:border-blue-400/50 shadow-xl transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                        title="Inspect Large"
                      >
                        <Maximize className="w-5 h-5 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => dispatch({
                          type: 'ADD_CAST',
                          payload: { ...actor, id: `ref-${Date.now()}-${Math.random()}`, name: `${actor.name} (Ref)` }
                        })}
                        className="bg-[#27272a] hover:bg-emerald-600 w-12 h-12 rounded-xl border border-white/10 hover:border-emerald-400/50 shadow-xl transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                        title="Add to Cast"
                      >
                        <UserPlus className="w-5 h-5 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => {
                          dispatch({ type: 'REMOVE_ACTOR_LIBRARY_BY_URL', payload: actor.url });
                          dispatch({ type: 'ADD_LOG', payload: { message: `Removed actor from library`, type: 'info' } });
                        }}
                        className="bg-[#27272a] hover:bg-red-600 w-12 h-12 rounded-xl border border-white/10 hover:border-red-400/50 shadow-xl transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                        title="Remove from Library"
                      >
                        <Trash2 className="w-5 h-5 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  {/* Centered Editable Label */}
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-md border-t border-white/5 p-1.5 flex justify-center items-center">
                    <input
                      className="bg-transparent text-[10px] font-black uppercase text-center text-white/70 hover:text-white focus:text-white focus:outline-none w-full tracking-wider transition-colors"
                      value={actor.name}
                      onChange={(e) => dispatch({
                        type: 'UPDATE_ACTOR_LIBRARY',
                        payload: { id: actor.id, updates: { name: e.target.value } }
                      })}
                      onFocus={(e) => e.target.select()}
                      title="Click to Rename Actor"
                    />
                  </div>
                </div>
              ))}
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
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#27272a] border border-green-500/50 text-white px-6 py-3 rounded-full shadow-2xl backdrop-blur-xl z-[3000] flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CastingForge;
