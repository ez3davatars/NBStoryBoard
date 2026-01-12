import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, RefreshCcw, Maximize, Shirt, Sparkles, Download, 
  UserPlus, X, Eraser, Save 
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
                                    const lum = (originalData[nIdx] + originalData[nIdx+1] + originalData[nIdx+2]) / 3;
                                    if (lum < minLuminance) minLuminance = lum;
                                    if (minLuminance === 0) break;
                                }
                                if (minLuminance === 0) break;
                            }
                            eroded[idx] = eroded[idx+1] = eroded[idx+2] = minLuminance;
                        }
                    }
                    tempCtx?.putImageData(maskData, 0, 0);
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
                        const maskLum = (mask[i] + mask[i+1] + mask[i+2]) / 3;
                        data[i+3] = tryOnInvertBg ? (255 - maskLum) : maskLum;

                        if (tryOnSpillSuppression > 0 && data[i+3] > 0) {
                            const r = data[i]; const g = data[i+1]; const b = data[i+2];
                            const avgRB = (r + b) / 2;
                            if (g > avgRB) {
                                const factor = tryOnSpillSuppression / 100;
                                data[i+1] = g * (1 - factor) + avgRB * factor;
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
            for(let i = 0; i < data.length; i += 4) { 
                const r = data[i]; const g = data[i+1]; const b = data[i+2];
                const isMatch = Math.abs(r - key.r) < tryOnTolerance && Math.abs(g - key.g) < tryOnTolerance && Math.abs(b - key.b) < tryOnTolerance;
                
                if (tryOnInvertBg) { if (!isMatch) data[i+3] = 0; } 
                else { if (isMatch) data[i+3] = 0; }

                if (tryOnSpillSuppression > 0 && data[i+3] > 0) {
                    const rP = data[i]; const gP = data[i+1]; const bP = data[i+2];
                    const avgRB = (rP + bP) / 2;
                    if (gP > avgRB) {
                        const factor = tryOnSpillSuppression / 100;
                        data[i+1] = gP * (1 - factor) + avgRB * factor;
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
      const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
      const items: WardrobeItem[] = [];
      // @ts-ignore
      for await (const entry of (wardrobeHandle as any).values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.png')) {
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
      dispatch({ type: 'SET_WARDROBE_ITEMS', payload: items.sort((a,b) => b.timestamp - a.timestamp) });
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

  const handleUploadCostume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setDesignerImage(dataUrl);
      setDesignerPrompt(file.name.replace(/\.[^/.]+$/, "")); // Use filename as default prompt
      setActiveTab('designer'); // Switch to designer to show the preview
      dispatch({ type: 'ADD_LOG', payload: { message: `Loaded: ${file.name}. Click 'Save' to add to library.`, type: 'info' } });
    };
    reader.readAsDataURL(file);
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
         CRITICAL CONSTRAINTS:
         1. MAINTAIN the subject's exact facial identity, hairstyle, and body proportions from [IMAGE 1].
         2. FULLY REPLACE their current clothing with the outfit in [IMAGE 2].
         3. Adjust the fit to match their pose and lighting naturally.
         4. ${tryOnNote || "Clean studio execution."}
         5. Use a solid Neon Green background (#39FF14) for perfect subject isolation.`,
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
              <button 
                key={item.id}
                onClick={() => setSelectedCostume(item)}
                className={`aspect-square rounded-lg border overflow-hidden transition-all group relative ${selectedCostume?.id === item.id ? 'border-yellow-500 border-2 shadow-lg shadow-yellow-500/20' : 'border-gray-800 hover:border-gray-600'}`}
              >
                <img src={item.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url }); }}
                        className="bg-blue-500/80 hover:bg-blue-500 text-white p-1.5 rounded-full shadow-lg"
                        title="Inspect Large"
                    >
                        <Maximize className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[8px] font-bold text-white uppercase truncate absolute bottom-2 left-2 right-2 text-center">{item.name}</span>
                </div>
              </button>
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
            <div className="max-w-6xl mx-auto grid grid-cols-12 gap-8">
                {/* SELECTOR COLUMN */}
                <div className="col-span-4 space-y-6">
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
                <div className="col-span-8">
                    <div className="aspect-square bg-black rounded-3xl border border-gray-800 shadow-2xl flex items-center justify-center overflow-hidden relative group border-4 border-[#18181b]">
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

                        {fittedImage && (
                            <div className="absolute top-6 right-6 flex flex-col gap-3 z-20 bg-black/60 p-4 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
                                <div className="flex items-center justify-between gap-6">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={removeTryOnBg} 
                                            onChange={(e) => setRemoveTryOnBg(e.target.checked)} 
                                            className="w-4 h-4 accent-blue-500 rounded" 
                                        />
                                        <Eraser className="w-3.5 h-3.5" /> Remove BG
                                    </label>

                                    {tryOnMask && (
                                        <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={tryOnAiMaskActive} 
                                                onChange={(e) => setTryOnAiMaskActive(e.target.checked)} 
                                                className="w-3.5 h-3.5 accent-blue-500 rounded" 
                                            />
                                            <Sparkles className="w-3 h-3" /> AI Masking
                                        </label>
                                    )}
                                </div>
                                
                                {removeTryOnBg && (
                                    <div className="space-y-3 pt-2 border-t border-white/5">
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

                                        {tryOnMask && tryOnAiMaskActive && (
                                            <>
                                                <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider pt-1">
                                                    <span>Matte Contraction</span>
                                                    <span>{matteErosion}px</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0" max="10" 
                                                    step="1"
                                                    value={matteErosion} 
                                                    onChange={(e) => setMatteErosion(parseInt(e.target.value))}
                                                    className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
                                                />

                                                <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase tracking-wider pt-1">
                                                    <span>Mask Softening</span>
                                                    <span>{tryOnMaskSoftening}px</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0" max="10" 
                                                    step="0.5"
                                                    value={tryOnMaskSoftening} 
                                                    onChange={(e) => setTryOnMaskSoftening(parseFloat(e.target.value))}
                                                    className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer"
                                                />
                                            </>
                                        )}

                                        <div className="flex items-center justify-between text-[9px] font-bold text-green-400/60 uppercase tracking-wider pt-1">
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
                                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:text-gray-300 transition-colors pt-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={tryOnInvertBg} 
                                                    onChange={(e) => setTryOnInvertBg(e.target.checked)} 
                                                    className="w-3.5 h-3.5 accent-red-500 rounded border-gray-700 bg-black/50"
                                                />
                                                Invert Matte
                                            </label>
                                            <div className="w-10 h-10 bg-black/60 border border-white/5 rounded-xl overflow-hidden shadow-inner flex items-center justify-center mt-2">
                                                <canvas ref={tryOnCanvasRef} className="max-w-full max-h-full object-contain scale-150" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {fittedImage && (
                            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 z-30 bg-black/40 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
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
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WardrobeStudio;
