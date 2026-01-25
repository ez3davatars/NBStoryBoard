import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Upload, RefreshCcw, Maximize, Shirt, Sparkles, Download,
  UserPlus, X, Eraser, Save, Trash2
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import type { WardrobeItem, CastMember } from '../context/AppContext';

const WardrobeStudio = () => {
  const { state, dispatch } = useAppContext();
  const [activeTab, setActiveTab] = useState<'designer' | 'library'>('designer');
  const [designerPrompt, setDesignerPrompt] = useState("");
  const [designerImage, setDesignerImage] = useState<string | null>(null);
  const [designerMask, setDesignerMask] = useState<string | null>(null);
  const [selectedCostume, setSelectedCostume] = useState<WardrobeItem | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<CastMember | null>(null);
  const [fittedImage, setFittedImage] = useState<string | null>(null);
  const [tryOnNote, setTryOnNote] = useState("");
  const [tryOnMask, setTryOnMask] = useState<string | null>(null);

  // Try-On Removal State
  const [removeTryOnBg, setRemoveTryOnBg] = useState(false);
  const [tryOnAiMaskActive, setTryOnAiMaskActive] = useState(true);
  const [tryOnTolerance, setTryOnTolerance] = useState(15);
  const [tryOnSpillSuppression, setTryOnSpillSuppression] = useState(100);
  const [tryOnMaskSoftening, setTryOnMaskSoftening] = useState(1.5);
  const [tryOnInvertBg, setTryOnInvertBg] = useState(false);
  const [matteErosion, setMatteErosion] = useState(1); // 0-5 pixels erosion
  const tryOnImgRef = useRef<HTMLImageElement>(null);
  const tryOnMaskImgRef = useRef<HTMLImageElement>(null);
  const tryOnCanvasRef = useRef<HTMLCanvasElement>(null);
  const [processedTryOnUrl, setProcessedTryOnUrl] = useState<string | null>(null);

  // Designer Workspace Refs
  const designerImgRef = useRef<HTMLImageElement>(null);
  const maskImgRef = useRef<HTMLImageElement>(null);

  const runTryOnIsolation = (): string | null => {
    if (removeTryOnBg && fittedImage && tryOnImgRef.current && tryOnCanvasRef.current) {
      const canvas = tryOnCanvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = tryOnImgRef.current;
      if (!img.complete || img.naturalWidth === 0) return null;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);

      let finalUrl: string | null = null;

      // AI MASKING BRANCH
      if (tryOnAiMaskActive && tryOnMask && tryOnMaskImgRef.current) {
        const maskImg = tryOnMaskImgRef.current;
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
              // Thresholding high (> 128) erodes the mask.
              const d = chokeCtx.getImageData(0, 0, canvas.width, canvas.height);
              for (let i = 0; i < d.data.length; i += 4) {
                // Threshold at 50% luminance. 
                // As blur increases, the 50% boundary moves inward if original was white on black?
                // Actually, Gaussian blur is centered, so 50% stays at the edge. 
                // To ERODE, we must threshold HIGHER (e.g. require > 200 brightness).
                // Heuristic: Base threshold 128 + dynamic. 
                // Let's force a High Threshold (200) to ensure shrinkage.
                const lum = d.data[i];
                if (lum < 180) { // Aggressive cutoff
                  d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
                } else {
                  // Keep it white (binary mask)
                  d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
                }
              }
              tempCtx?.putImageData(d, 0, 0);
            }
          }

          // APPLY MASK SOFTENING (Blur the mask itself for smooth edges)
          if (tryOnMaskSoftening > 0 && tempCtx) {
            const blurCanvas = document.createElement('canvas');
            blurCanvas.width = canvas.width;
            blurCanvas.height = canvas.height;
            const blurCtx = blurCanvas.getContext('2d');
            if (blurCtx) {
              blurCtx.filter = `blur(${tryOnMaskSoftening}px)`;
              blurCtx.drawImage(tempCanvas, 0, 0);
              // Update maskData to blurred version
              maskData = blurCtx.getImageData(0, 0, canvas.width, canvas.height);
            }
          }

          // 3. Composite original image with (eroded/softened) mask
          ctx?.drawImage(img, 0, 0);
          const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
          const finalMaskData = maskData || tempCtx?.getImageData(0, 0, canvas.width, canvas.height);

          if (imgData && finalMaskData) {
            const data = imgData.data;
            const mask = finalMaskData.data;

            for (let i = 0; i < data.length; i += 4) {
              const maskLum = (mask[i] + mask[i + 1] + mask[i + 2]) / 3;
              data[i + 3] = tryOnInvertBg ? (255 - maskLum) : maskLum;

              if (tryOnSpillSuppression > 0 && data[i + 3] > 0) {
                const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
                const avgRB = (r + b) / 2;
                if (g > avgRB) {
                  const factor = tryOnSpillSuppression / 100;
                  data[i + 1] = g * (1 - factor) + avgRB * factor;
                }
              }
            }

            ctx?.putImageData(imgData, 0, 0);
            setProcessedTryOnUrl(canvas.toDataURL('image/png'));
            return canvas.toDataURL('image/png');
          }
        }
      }

      // FALLBACK: Color Keying
      ctx?.drawImage(img, 0, 0);
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      if (imageData) {
        const data = imageData.data;
        const key = { r: data[0], g: data[1], b: data[2] };
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
          const isMatch = Math.abs(r - key.r) < tryOnTolerance && Math.abs(g - key.g) < tryOnTolerance && Math.abs(b - key.b) < tryOnTolerance;

          if (tryOnInvertBg) { if (!isMatch) data[i + 3] = 0; }
          else { if (isMatch) data[i + 3] = 0; }

          if (tryOnSpillSuppression > 0 && data[i + 3] > 0) {
            const rP = data[i]; const gP = data[i + 1]; const bP = data[i + 2];
            const avgRB = (rP + bP) / 2;
            if (gP > avgRB) {
              const factor = tryOnSpillSuppression / 100;
              data[i + 1] = gP * (1 - factor) + avgRB * factor;
            }
          }
        }
        ctx?.putImageData(imageData, 0, 0);
        finalUrl = canvas.toDataURL('image/png');
        setProcessedTryOnUrl(finalUrl);
        return finalUrl;
      }
    } else {
      setProcessedTryOnUrl(null);
    }
    return null;
  };

  useEffect(() => {
    runTryOnIsolation();
  }, [removeTryOnBg, tryOnTolerance, matteErosion, fittedImage, tryOnMask, tryOnAiMaskActive, tryOnSpillSuppression, tryOnMaskSoftening, tryOnInvertBg]);

  const scanWardrobe = async () => {
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
      dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe scan failed: ${e.message}`, type: 'error' } });
    }
  };

  useEffect(() => {
    scanWardrobe();
  }, [state.saveDirectoryHandle]);

  const saveToWardrobe = async (imageUrl: string, prompt: string) => {
    if (!state.saveDirectoryHandle) return;
    try {
      const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
      const filename = `WARDROBE-${Date.now()}.png`;
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
      dispatch({ type: 'ADD_LOG', payload: { message: `Costume saved to wardrobe: ${filename}`, type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save wardrobe item: ${e.message}`, type: 'error' } });
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
         Isolated garment, no background distractions. Strictly solid white background only.`,
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
        alert("Item already exists in library.");
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
        dispatch({ type: 'ADD_LOG', payload: { message: `Uploaded & Saved: ${file.name}`, type: 'success' } });
      };
      reader.readAsDataURL(file);

    } catch (err: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Upload failed: ${err.message}`, type: 'error' } });
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
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      // PASS 1: Generate Fusion on Neon Green for best edge isolation
      const res = await GeminiService.generateImage(
        `Perform a professional virtual try-on and fashion fitting. 
         [IMAGE 1] is the target SUBJECT. 
         [IMAGE 2] is the standalone COSTUME to fit.
         
         OBJECTIVE: Apply the costume from [IMAGE 2] onto the subject in [IMAGE 1].
         
         CRITICAL RULES:
         1. **STRICT BIOMETRIC MATCH (PRIORITY #1)**: The generated face MUST be an exact copy of the subject in [IMAGE 1]. 
            - If [IMAGE 1] is a REFERENCE SHEET (multiple angles), USE THE FRONT VIEW FACE as the absolute source of truth.
            - Do NOT generate a random/generic actor.
         2. **STRICT FRONT VIEW POSE**: The generated character MUST BE standing in a static FRONT VIEW pose.
            - NO side profiles. NO dynamic action poses.
            - This is required for the auto-masking system to function.
         3. **SINGLE ACTOR ONLY**: Generate EXACTLY ONE full-body character.
            - NEGATIVE CONSTRAINTS: NO floating heads. NO extra faces. NO grid layouts. NO reference sheet formatting. NO background artifacts.
            - Do NOT mimic the layout of [IMAGE 1]. Use [IMAGE 1] ONLY for facial data.
         4. **IDENTITY PRESERVATION**: Maintain the subject's exact facial features, skin tone, and body proportions.
         5. **ANATOMY**: Hands and feet MUST be visible (unless covered by long sleeves/hemline).
            - HANDS: Must match the face's skin tone perfectly.
            - FEET: If legs are visible, generate appropriate footwear matching the costume's style (e.g., boots for armor, shoes for suits). If the dress/robe is floor-length, feet may be covered.
         6. **LIGHTING**: Match studio lighting to the subject.
         7. ${tryOnNote || "Clean professional studio execution."}
         8. **ISOLATION**: Use a solid Neon Green background (#39FF14).`,
        state.apiKey,
        state.model,
        [
          { url: selectedCharacter.url, label: "Subject Reference" },
          { url: selectedCostume.url, label: "Costume Reference" }
        ],
        { aspectRatio: '1:1' }
      );
      setFittedImage(res);
      dispatch({ type: 'ADD_LOG', payload: { message: "Fusion complete. Creating character edge mask...", type: 'info' } });

      // PASS 2: Generate Fusion Mask
      try {
        const maskRes = await GeminiService.generateImage(
          `DIGITAL CHARACTER SEGMENTATION MASK: Create a pure black and white silhouette of the character in [IMAGE 1].
             The entire character silhouette (skin, hair, clothes) MUST be PURE WHITE (#FFFFFF).
             The background MUST be PURE BLACK (#000000).
             Film-grade precision, no gradients, no shadows.`,
          state.apiKey,
          state.model,
          [{ url: res, label: "Reference" }],
          { aspectRatio: '1:1' }
        );
        setTryOnMask(maskRes);
        dispatch({ type: 'ADD_LOG', payload: { message: "Character mask generated with high fidelity", type: 'success' } });
      } catch (maskErr: any) {
        dispatch({ type: 'ADD_LOG', payload: { message: `Character mask failed: ${maskErr.message}. Falling back to standard keying.`, type: 'error' } });
      }

    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleAddToCast = () => {
    const freshUrl = runTryOnIsolation();
    const finalUrl = freshUrl || processedTryOnUrl || fittedImage;
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

  const handleSaveFittedToActors = async () => {
    const freshUrl = runTryOnIsolation();
    const finalUrl = freshUrl || processedTryOnUrl || fittedImage;
    if (!finalUrl || !state.saveDirectoryHandle) {
      if (!state.saveDirectoryHandle) dispatch({ type: 'ADD_LOG', payload: { message: "No save directory configured", type: 'error' } });
      return;
    }

    try {
      const actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: true });
      const safeName = (selectedCharacter?.name || 'FittedActor').slice(0, 30).replace(/[^a-z0-9]/gi, '_');
      const filename = `Actor-Fitted-${Date.now()}-${safeName}.png`;
      const fileHandle = await actorsDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      const res = await fetch(finalUrl);
      const blob = await res.blob();
      await writable.write(blob);
      await writable.close();

      const newActor: CastMember = {
        id: `actor-fitted-${Date.now()}`,
        url: finalUrl,
        tag: 'front',
        name: `${selectedCharacter?.name} (Fitted)`,
        profile: {
          identity: selectedCharacter?.profile?.identity || "Unknown",
          wardrobe: selectedCostume?.name || "Fitted Costume",
          accessories: "",
          style: "Virtual Try-On"
        }
      };
      dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
      dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors Library: ${filename}`, type: 'success' } });

    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save actor: ${e.message}`, type: 'error' } });
    }
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
          {!state.saveDirectoryHandle && (
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
                <img src={item.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
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

        <div className="flex-grow overflow-y-auto p-8">
          {activeTab === 'designer' ? (
            <div className="max-w-4xl mx-auto grid grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 shadow-xl">
                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-500" /> Designer Workshop
                  </h3>
                  <textarea
                    className="w-full bg-[#09090b] border border-[#27272a] p-4 rounded-xl text-sm text-gray-200 focus:border-yellow-500 focus:outline-none transition-colors h-40 resize-none mb-4"
                    placeholder="Describe the clothing (e.g. 'A futuristic chrome-plated flight suit with neon orange cabling')..."
                    value={designerPrompt}
                    onChange={(e) => setDesignerPrompt(e.target.value)}
                  />
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
            <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-6">
              {/* COL 1: SELECTOR COLUMN */}
              <div className="col-span-3 space-y-6">
                <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 shadow-xl">
                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">1. Selected Subject</h3>
                  <div className="grid grid-cols-4 gap-2 mb-6 h-32 overflow-y-auto p-2">
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
                      <div className="col-span-4 py-8 text-center text-[10px] text-gray-600 uppercase font-bold">No Cast Members Available</div>
                    )}
                  </div>

                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest border-t border-gray-800 pt-6">2. Active Wardrobe</h3>
                  <div className="aspect-square bg-[#09090b] rounded-xl border border-gray-800 mb-6 flex items-center justify-center overflow-hidden">
                    {selectedCostume ? (
                      <img src={selectedCostume.url} className="w-full h-full object-contain" />
                    ) : (
                      <Shirt className="w-10 h-10 opacity-10" />
                    )}
                  </div>

                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest border-t border-gray-800 pt-6">3. Fitting Notes</h3>
                  <textarea
                    className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-xs text-gray-300 h-20 resize-none mb-4 focus:border-yellow-500 focus:outline-none"
                    placeholder="Optional: adjust the fit (e.g. 'heavy battle damage')..."
                    value={tryOnNote}
                    onChange={(e) => setTryOnNote(e.target.value)}
                  />

                  <button
                    onClick={handleTryOn}
                    disabled={state.isProcessing || !selectedCharacter || !selectedCostume}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Execute Virtual Try-On
                  </button>
                </div>
              </div>

              {/* RESULT COLUMN */}

              {/* COL 2: RESULT COLUMN (Center Stage) */}
              <div className="col-span-6">
                <div
                  className="aspect-square bg-black rounded-3xl border border-gray-800 shadow-2xl flex items-center justify-center overflow-hidden relative group border-4 border-[#18181b]"
                >
                  {fittedImage ? (
                    <>
                      <img
                        ref={tryOnImgRef}
                        src={fittedImage}
                        className={processedTryOnUrl ? 'hidden' : 'w-full h-full object-cover'}
                      />
                      {processedTryOnUrl && (
                        <img src={processedTryOnUrl} className="w-full h-full object-cover" />
                      )}
                      <canvas ref={tryOnCanvasRef} className="hidden" />
                      {tryOnMask && (
                        <img ref={tryOnMaskImgRef} src={tryOnMask} className="hidden" />
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
                  <div className="mt-4 flex justify-center gap-3">
                    <button
                      onClick={handleAddToCast}
                      className="w-14 h-14 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      title="Add to Cast Library"
                    >
                      <UserPlus className="w-6 h-6 stroke-[2.5]" />
                    </button>
                    <button
                      onClick={() => downloadImage(processedTryOnUrl || fittedImage!, `fitted-${selectedCharacter?.name || 'character'}.png`)}
                      className="w-14 h-14 bg-white/10 hover:bg-white text-white hover:text-black rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                      title="Download Transparent PNG"
                    >
                      <Download className="w-6 h-6 stroke-[2.5]" />
                    </button>
                    <button
                      onClick={() => setFittedImage(null)}
                      className="w-14 h-14 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                      title="Discard Result"
                    >
                      <X className="w-6 h-6 stroke-[3]" />
                    </button>
                    <button
                      onClick={handleSaveFittedToActors}
                      className="w-14 h-14 bg-indigo-500/20 hover:bg-indigo-500 text-indigo-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                      title="Save to Global Actor Library (Disk)"
                    >
                      <Save className="w-6 h-6 stroke-[2.5]" />
                    </button>
                  </div>
                )}
              </div>

              {/* COL 3: SETTINGS SIDEBAR */}
              <div className="col-span-3 space-y-6">
                {fittedImage ? (
                  <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 shadow-xl space-y-6">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-500" /> Image Controls
                    </h3>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-black/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={removeTryOnBg}
                          onChange={(e) => setRemoveTryOnBg(e.target.checked)}
                          className="w-4 h-4 accent-blue-500 rounded"
                        />
                        <Eraser className="w-3.5 h-3.5" /> Remove Background
                      </label>

                      {tryOnMask && (
                        <div className="flex flex-col gap-2 p-3 bg-black/20 rounded-lg border border-white/5">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={tryOnAiMaskActive}
                                onChange={(e) => setTryOnAiMaskActive(e.target.checked)}
                                className="w-3.5 h-3.5 accent-blue-500 rounded"
                              />
                              <Sparkles className="w-3 h-3" /> AI Masking
                            </label>
                            <button
                              onClick={async () => {
                                if (!fittedImage || !state.apiKey) return;
                                setTryOnMask(null);
                                dispatch({ type: 'ADD_LOG', payload: { message: "Regenerating fusion mask...", type: 'info' } });
                                try {
                                  const maskRes = await GeminiService.generateImage(
                                    `DIGITAL CHARACTER SEGMENTATION MASK: Create a pure black and white silhouette of the character in [IMAGE 1].
                                             The entire character silhouette (skin, hair, clothes) MUST be PURE WHITE (#FFFFFF).
                                             The background MUST be PURE BLACK (#000000).
                                             Film-grade precision, no gradients, no shadows.`,
                                    state.apiKey,
                                    state.model,
                                    [{ url: fittedImage, label: "Reference" }],
                                    { aspectRatio: '1:1' }
                                  );
                                  setTryOnMask(maskRes);
                                  dispatch({ type: 'ADD_LOG', payload: { message: "Mask regenerated successfully", type: 'success' } });
                                } catch (maskErr: any) {
                                  dispatch({ type: 'ADD_LOG', payload: { message: `Mask regeneration failed: ${maskErr.message}`, type: 'error' } });
                                }
                              }}
                              className="text-gray-500 hover:text-white transition-colors p-1"
                              title="Regenerate Mask"
                            >
                              <RefreshCcw className="w-3 h-3" />
                            </button>
                          </div>

                          {tryOnAiMaskActive && (
                            <>
                              {!tryOnMask ? (
                                <div className="h-24 flex flex-col items-center justify-center gap-2 bg-white/5 rounded-lg my-1 animate-pulse">
                                  <RefreshCcw className="w-4 h-4 text-blue-400 animate-spin" />
                                  <span className="text-[8px] uppercase font-bold text-blue-300">Generating Mask...</span>
                                </div>
                              ) : (
                                <div className="space-y-3 pt-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider">
                                      <span>Matte Contraction</span>
                                      <span>{matteErosion}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="0" max="10"
                                      step="0.1"
                                      value={matteErosion}
                                      onChange={(e) => setMatteErosion(parseFloat(e.target.value))}
                                      className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider">
                                      <span>Mask Softening</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="0" max="10"
                                      step="0.5"
                                      value={tryOnMaskSoftening}
                                      onChange={(e) => setTryOnMaskSoftening(parseFloat(e.target.value))}
                                      className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
                                    />
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {removeTryOnBg && (
                        <div className="space-y-4 pt-4 border-t border-gray-800">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                              <span>Tolerance</span>
                              <span>{tryOnTolerance}%</span>
                            </div>
                            <input
                              type="range"
                              min="1" max="100"
                              value={tryOnTolerance}
                              onChange={(e) => setTryOnTolerance(parseInt(e.target.value))}
                              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-bold text-green-400/60 uppercase tracking-wider">
                              <span>Spill Suppression</span>
                              <span>{tryOnSpillSuppression}%</span>
                            </div>
                            <input
                              type="range"
                              min="0" max="100"
                              value={tryOnSpillSuppression}
                              onChange={(e) => setTryOnSpillSuppression(parseInt(e.target.value))}
                              className="w-full h-1 bg-green-900/30 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:text-gray-200 transition-colors">
                              <input
                                type="checkbox"
                                checked={tryOnInvertBg}
                                onChange={(e) => setTryOnInvertBg(e.target.checked)}
                                className="w-3.5 h-3.5 accent-red-500 rounded border-gray-700 bg-black/50"
                              />
                              Invert Matte
                            </label>
                            <div className="w-10 h-10 bg-black/60 border border-white/5 rounded-lg overflow-hidden shadow-inner flex items-center justify-center">
                              <canvas ref={tryOnCanvasRef} className="max-w-full max-h-full object-contain scale-150" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full border border-dashed border-gray-800 rounded-2xl flex items-center justify-center">
                    <span className="text-[10px] uppercase font-bold text-gray-700 tracking-widest">Controls Inactive</span>
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
                    Delete Forever
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </AnimatePresence >
    </div >
  );
};

export default WardrobeStudio;
