import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors, Image as ImageIcon,
  Trash2, Upload, RotateCw, MonitorPlay,
  Eraser, X,
  Target, Download, UserPlus, Sparkles,
  Maximize, RefreshCcw, LayoutTemplate, Share2, Info, CheckCircle2,
  ChevronRight
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

const REF_SHEET_STYLES = {
  family_3d: {
    id: 'family_3d',
    label: 'Family 3D Animation',
    keywords: "premium family-friendly 3D animation, soft subsurface scattering, clean stylized materials, expressive facial features, high-end CG render, smooth shading, gentle rim light, cinematic depth",
    lighting: "Golden hour, cinematic bounce light"
  },
  premium_cg: {
    id: 'premium_cg',
    label: 'Premium CG Realism',
    keywords: "photorealistic CG, exact facial structure preservation, highly detailed skin pores, 85mm lens look, f/1.8 depth of field, cinematic natural lighting, sharp focus, biometric fidelity",
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
  const [showControls, setShowControls] = useState(true);



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
  const [refStyle, setRefStyle] = useState<keyof typeof REF_SHEET_STYLES>('family_3d');
  const [bodyWeight, setBodyWeight] = useState<'thin' | 'light' | 'medium' | 'heavy' | 'athletic'>('medium');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [sheetContent, setSheetContent] = useState<'full' | 'head'>('full');

  const imgRef = useRef<HTMLImageElement>(null);
  const maskImgRef = useRef<HTMLImageElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const generationIdRef = useRef<number>(0);

  // DELETE CONFIRMATION STATE
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'cast' | 'library', payload: string, name: string } | null>(null);

  const executeDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'cast') {
      dispatch({ type: 'REMOVE_CAST', payload: deleteTarget.payload });
      dispatch({ type: 'ADD_LOG', payload: { message: "Token removed from stage", type: 'info' } });
    } else {
      dispatch({ type: 'REMOVE_ACTOR_LIBRARY_BY_URL', payload: deleteTarget.payload });
      dispatch({ type: 'ADD_LOG', payload: { message: "Actor removed from library", type: 'info' } });
    }
    setDeleteTarget(null);
  };

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

        // SMOOTH EROSION (BLUR + THRESHOLD)
        if (matteErosion > 0 && maskData) {
          // 1. Blur to create a gradient for "level" adjustment
          const chokeCanvas = document.createElement('canvas');
          chokeCanvas.width = canvas.width;
          chokeCanvas.height = canvas.height;
          const chokeCtx = chokeCanvas.getContext('2d');

          if (chokeCtx) {
            // Use the value as blur radius
            chokeCtx.filter = `blur(${matteErosion}px)`;
            chokeCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);

            // 2. Hard threshold (Leveled Choke)
            const d = chokeCtx.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < d.data.length; i += 4) {
              // Threshold high (> 180) to erode white
              const lum = d.data[i];
              if (lum < 180) {
                d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
              } else {
                d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
              }
            }
            tempCtx?.putImageData(d, 0, 0);
          }
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
      const selectedStyleData = REF_SHEET_STYLES[refStyle];
      let finalPrompt = `${REFERENCE_SHEET_PROMPT}
      
      VISUAL STYLE: ${selectedStyleData.label}
      STYLE KEYWORDS: ${selectedStyleData.keywords}
      LIGHTING: ${selectedStyleData.lighting}
      
      PHYSIQUE/BUILD: ${bodyWeight.toUpperCase()} build. Ensure anatomical consistency with this weight class.
      CONTENT FOCUS: ${sheetContent === 'head' ? "Emphasis on facial expressions and head rotation." : "Full body turnaround focus."}
      `;

      if (sheetContent === 'head') {
        finalPrompt += " [LAYOUT - HEADSHOTS ONLY]: Grid/Array of 6-8 detailed headshots showing different angles (Front, Profile, 3/4) and expressions. DO NOT INCLUDE ANY FULL BODY FIGURES. Focus strictly on facial details, identity, and hair.";
      } else {
        if (refLayout === 'form_focus') {
          finalPrompt += " [LAYOUT A - CLASSIC]: Split canvas horizontally. Top 65% height: ROW OF EXACTLY 3 Full Body views (Front, Side, Back). Bottom 35% height: Grid of EXACTLY 4 Headshots. Ensure headshots are MACRO-DETAILED and hyper-sharp.";
        } else if (refLayout === 'face_focus') {
          finalPrompt += " [LAYOUT B - FACE FIRST]: Split canvas horizontally. Top 55% height: Row of EXACTLY 4 Large Headshots (Front, Left, Right, Back). Bottom 45% height: Row of EXACTLY 3 Full Body views. Headshots must maintain perfect identity.";
        } else if (refLayout === 'split_focus') {
          finalPrompt += " [LAYOUT C - STUDIO]: Split canvas vertically. Left 45% width: Vertical stack of EXACTLY 3 Full Body views (Front, Side, Back). DO NOT ADD A FOURTH VIEW. Right 55% width: 2x2 Grid of Large Headshots. Highest possible facial resolution.";
        }
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

  // --- PREMIUM DESIGN SYSTEM ---
  const UI = {
    CARD: "bg-[#18181b] border border-[#27272a] rounded-2xl shadow-xl p-5 flex flex-col gap-4",
    LABEL: "text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block",
    INPUT: "w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-sm text-gray-200 focus:border-blue-500 focus:outline-none transition-colors",
    BTN: {
      PRIMARY: "w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white text-[11px] font-black uppercase tracking-widest rounded-lg border border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] active:scale-95 transition-all flex items-center justify-center gap-2",
      SECONDARY: "px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] text-gray-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-lg border border-white/5 transition-all flex items-center gap-2",
      ICON: "p-2 hover:bg-white/10 text-gray-500 hover:text-white rounded-full transition-colors",
      SEGMENT_CONTAINER: "flex bg-black/40 p-1 rounded-lg border border-white/5",
      SEGMENT_ITEM: (isActive: boolean) => `flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap ${isActive ? 'bg-[#27272a] text-white shadow-sm border border-white/10' : 'text-gray-600 hover:text-gray-400'}`
    }
  };

  return (
    <div className="flex h-full gap-6 p-4">
      {/* 1. LEFT SIDEBAR: Source & Tools */}
      <div className="w-[400px] flex flex-col gap-4 h-full shrink-0">

        {/* Source Material */}
        <div className={UI.CARD}>
          <div className="flex justify-between items-center">
            <h2 className={UI.LABEL}>1. Source Material</h2>
            <button
              onClick={() => dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: '' })}
              className={UI.BTN.ICON}
              title="Clear Text"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            className={UI.INPUT}
            placeholder="Describe your character..."
            value={state.lastCastedPrompt}
            onChange={(e) => dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: e.target.value })}
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={state.isProcessing}
              className={`${UI.BTN.PRIMARY} flex-grow`}
            >
              {state.isProcessing ? <RotateCw className="animate-spin w-3.5 h-3.5" /> : <MonitorPlay className="w-3.5 h-3.5" />}
              {state.lastCastedImage ? 'Stylize' : 'Generate'}
            </button>
            <label className={`${UI.BTN.SECONDARY} cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" />
              Upload
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
            </label>
          </div>
        </div>

        {/* Turnaround Completer */}
        <div className={UI.CARD}>
          <div
            onClick={() => setShowTurnaround(!showTurnaround)}
            className="flex items-center justify-between cursor-pointer group select-none"
          >
            <h2 className={`${UI.LABEL} mb-0 group-hover:text-gray-300 transition-colors`}>2. Turnaround Completer</h2>
            <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${showTurnaround ? 'rotate-90 text-blue-500' : ''}`} />
          </div>

          {showTurnaround && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
              <div className="flex flex-wrap gap-2">
                {['front', 'back', 'left side', 'right side', '3/4 left', '3/4 right'].map((view: any) => (
                  <button
                    key={view}
                    onClick={() => setTargetAngle(targetAngle === view ? null : view)}
                    className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase transition-all border ${targetAngle === view
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40'
                      : 'bg-[#27272a] border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
                      }`}
                  >
                    {view}
                  </button>
                ))}
              </div>
              <button
                onClick={handleGenerateMissing}
                disabled={state.isProcessing || !targetAngle || !state.lastCastedImage}
                className={`${UI.BTN.PRIMARY} ${!targetAngle ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
              >
                {state.isProcessing ? <RotateCw className="animate-spin w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}
                Generate View
              </button>
            </div>
          )}
        </div>


        {/* Reference Sheet Generator */}
        <div className={`${UI.CARD} pb-6`}>
          <div className="flex justify-between items-center">
            <h2 className={UI.LABEL}>3. Actor Reference Sheet</h2>
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-gray-600 hover:text-white cursor-help" />
              <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-black border border-gray-800 rounded text-[9px] text-gray-400 hidden group-hover:block z-50">
                Strict identity & layout enforcement.
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Layout Control */}
            <div className={UI.BTN.SEGMENT_CONTAINER}>
              {[
                { id: 'form_focus', label: 'Form A' },
                { id: 'face_focus', label: 'Face B' },
                { id: 'split_focus', label: 'Split C' }
              ].map((l) => (
                <button
                  key={l.id}
                  onClick={() => setRefLayout(l.id as any)}
                  className={UI.BTN.SEGMENT_ITEM(refLayout === l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {/* Compact Controls Row */}
            <div className="h-px bg-white/10 w-full my-1"></div>
            <div className="space-y-3 mt-2 relative">
              <button
                onClick={() => setStyleMenuOpen(!styleMenuOpen)}
                className="w-full bg-[#09090b] text-gray-300 hover:text-white text-[11px] font-bold uppercase rounded-lg border border-[#27272a] hover:border-gray-600 px-3 py-3 outline-none transition-colors tracking-wider flex items-center justify-center"
              >
                {REF_SHEET_STYLES[refStyle]?.label}
              </button>

              {styleMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setStyleMenuOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden shadow-2xl z-50 flex flex-col p-1 animate-in fade-in zoom-in-95 duration-200">
                    {Object.values(REF_SHEET_STYLES).map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => { setRefStyle(s.id); setStyleMenuOpen(false); }}
                        className={`w-full text-center py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors ${refStyle === s.id
                          ? 'bg-purple-600/20 text-purple-400'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className={UI.BTN.SEGMENT_CONTAINER}>
                {['thin', 'medium', 'athletic'].map((w) => (
                  <button
                    key={w}
                    onClick={() => setBodyWeight(w as any)}
                    className={UI.BTN.SEGMENT_ITEM(bodyWeight === w)}
                  >
                    {w === 'medium' ? 'MED | LRG' : w}
                  </button>
                ))}
              </div>
            </div>

            {/* Sheet Content Toggle */}
            <div className={UI.BTN.SEGMENT_CONTAINER}>
              <button onClick={() => setSheetContent('full')} className={UI.BTN.SEGMENT_ITEM(sheetContent === 'full')}>Full Sheet</button>
              <button onClick={() => setSheetContent('head')} className={UI.BTN.SEGMENT_ITEM(sheetContent === 'head')}>Headshots</button>
            </div>
          </div>

          <button
            onClick={handleGenerateRefSheet}
            disabled={state.isProcessing || !state.lastCastedImage}
            className={`${UI.BTN.PRIMARY}`}
          >
            {state.isProcessing ? <RotateCw className="animate-spin w-3.5 h-3.5" /> : <LayoutTemplate className="w-3.5 h-3.5" />}
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

        {/* CAST ASSETS */}
        <div className={`${UI.CARD} flex-grow min-h-0`}>
          <div className="flex justify-between items-center">
            <h2 className={UI.LABEL}>Cast Assets</h2>
            <span className="text-[9px] font-mono text-gray-600 bg-black px-2 py-1 rounded border border-gray-800">{state.cast.length} TOKENS</span>
          </div>
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
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'cast', payload: c.id, name: c.tag || 'Token' }); }}
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
                <div className="col-span-3 text-center py-10 text-[10px] text-gray-600 italic border border-dashed border-gray-800 rounded-lg">Stage Empty</div>
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
            <div className="flex items-center gap-2">
              {state.lastCastedImage && (
                <>
                  <button
                    onClick={handleSaveToActorLibrary}
                    className={`${UI.BTN.SECONDARY} hover:bg-emerald-900/50 hover:text-emerald-400 hover:border-emerald-500/50`}
                    title="Save to Library"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> <span className="hidden xl:inline">Save</span>
                  </button>
                  <button
                    onClick={handleDownload}
                    className={UI.BTN.ICON}
                    title="Download PNG"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-gray-800 mx-2"></div>
                </>
              )}
              <button
                onClick={() => setIsCropping(!isCropping)}
                className={`${UI.BTN.SECONDARY} ${isCropping ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40 hover:bg-blue-500' : ''}`}
              >
                <Scissors className="w-3.5 h-3.5" />
                Slicer
              </button>
              <div className="w-px h-4 bg-gray-800 mx-2"></div>
              <button
                onClick={() => setShowControls(!showControls)}
                className={`${UI.BTN.SECONDARY} ${showControls ? 'text-blue-400 border-blue-500/30' : 'text-gray-500'}`}
                title={showControls ? "Hide Control Deck" : "Show Control Deck"}
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
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

          {/* BOTTOM TOOLBAR */}
          {state.lastCastedImage && showControls && (
            <div className="bg-[#18181b] border-t border-gray-800 p-6 animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-start justify-between gap-8">
                {/* LEFT: MAIN TOGGLES */}
                <div className="flex flex-col gap-4 min-w-[200px]">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-black/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={removeBg}
                      onChange={(e) => setRemoveBg(e.target.checked)}
                      className="w-4 h-4 accent-blue-500 rounded"
                    />
                    <Eraser className="w-3.5 h-3.5" /> Remove Background
                  </label>

                  {removeBg && (
                    <div className="flex flex-col gap-2 p-3 bg-black/20 rounded-lg border border-white/5">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
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
                            className="w-3.5 h-3.5 accent-blue-500 rounded"
                          />
                          <Sparkles className="w-3 h-3" /> AI Masking
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
                      {aiMaskActive && !state.lastCastedMask && (
                        <div className="flex items-center gap-2 mt-2">
                          <Sparkles className="w-3 h-3 text-blue-400 animate-spin" />
                          <span className="text-[9px] font-bold text-blue-300 animate-pulse">GENERATING MASK...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* CENTER: SLIDERS (Grid Layout) */}
                {removeBg && (
                  <div className="flex-grow grid grid-cols-2 gap-x-8 gap-y-4 px-8 border-l border-r border-gray-800">
                    {/* Tolerance */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                        <span>Tolerance</span>
                        <span>{tolerance}%</span>
                      </div>
                      <input type="range" min="1" max="100" value={tolerance} onChange={(e) => setTolerance(parseInt(e.target.value))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                    </div>

                    {/* Spill Suppression */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-bold text-green-400/60 uppercase tracking-wider">
                        <span>Spill Suppression</span>
                        <span>{spillSuppression}%</span>
                      </div>
                      <input type="range" min="0" max="100" value={spillSuppression} onChange={(e) => setSpillSuppression(parseInt(e.target.value))} className="w-full h-1 bg-green-900/30 rounded-lg appearance-none cursor-pointer" />
                    </div>

                    {state.lastCastedMask && aiMaskActive && (
                      <>
                        {/* Matte Contraction */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider">
                            <span>Matte Contraction</span>
                            <span>{matteErosion}px</span>
                          </div>
                          <input type="range" min="0" max="10" step="0.1" value={matteErosion} onChange={(e) => setMatteErosion(parseFloat(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer" />
                        </div>

                        {/* Mask Softening */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider">
                            <span>Mask Softening</span>
                            <span>{maskSoftening}px</span>
                          </div>
                          <input type="range" min="0" max="10" step="0.1" value={maskSoftening} onChange={(e) => setMaskSoftening(parseFloat(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer" />
                        </div>
                      </>
                    )}

                    <div className="col-span-2 pt-2 border-t border-white/5 flex items-center gap-4">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:text-gray-300 transition-colors">
                        <input type="checkbox" checked={invertBg} onChange={(e) => setInvertBg(e.target.checked)} className="w-3.5 h-3.5 accent-red-500 rounded border-gray-700 bg-black/50" />
                        Invert Matte
                      </label>
                      <div className="flex-grow flex justify-end">
                        <canvas ref={previewCanvasRef} className="h-6 w-auto object-contain opacity-50" />
                      </div>
                    </div>
                  </div>
                )}

                {/* RIGHT: MAIN ACTIONS */}
                <div className="flex flex-col gap-2 min-w-[60px]">
                  <button onClick={handleSaveToActorLibrary} className="w-full aspect-square bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-xl transition-all flex items-center justify-center border border-emerald-500/20 shadow-lg" title="Add to Cast">
                    <UserPlus className="w-5 h-5" />
                  </button>
                  <button onClick={handleDownload} className="w-full aspect-square bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-xl transition-all flex items-center justify-center border border-blue-500/20 shadow-lg" title="Download">
                    <Download className="w-5 h-5" />
                  </button>
                  <button onClick={() => dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: null })} className="w-full aspect-square bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all flex items-center justify-center border border-red-500/20 shadow-lg" title="Clear">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}


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
                        onClick={() => setDeleteTarget({ type: 'library', payload: actor.url, name: actor.name })}
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


      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
            <div className="bg-[#18181b] border border-gray-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full relative overflow-hidden">
              <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">Delete Asset?</h3>
              <p className="text-sm text-gray-400 mb-6">
                Are you sure you want to delete <span className="text-white font-bold">{deleteTarget.name}</span>?
                {deleteTarget.type === 'library' && " This will verify remove it from your global actors."}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20"
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div >
  );
};

export default CastingForge;
