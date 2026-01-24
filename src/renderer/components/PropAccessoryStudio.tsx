import { useState, useEffect, useRef } from 'react';
import {
  Package, RefreshCcw, Maximize, Sparkles,
  Download, UserPlus, X, Eraser, Save
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import type { PropItem, CastMember } from '../context/AppContext';

const PropAccessoryStudio = () => {
  const { state, dispatch } = useAppContext();
  const [activeTab, setActiveTab] = useState<'designer' | 'library'>('designer');
  const [designerPrompt, setDesignerPrompt] = useState("");
  const [designerImage, setDesignerImage] = useState<string | null>(null);
  const [selectedProp, setSelectedProp] = useState<PropItem | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<CastMember | null>(null);
  const [appliedImage, setAppliedImage] = useState<string | null>(null);
  const [applyNote, setApplyNote] = useState("");
  const [applyMask, setApplyMask] = useState<string | null>(null);

  // Apply Removal State
  const [removeApplyBg, setRemoveApplyBg] = useState(false);
  const [applyAiMaskActive, setApplyAiMaskActive] = useState(true);
  const [applyTolerance, setApplyTolerance] = useState(15);
  const [applySpillSuppression, setApplySpillSuppression] = useState(100);
  const [applyMaskSoftening, setApplyMaskSoftening] = useState(1.5);
  const [applyInvertBg] = useState(false);
  const [matteErosion, setMatteErosion] = useState(1);
  const applyImgRef = useRef<HTMLImageElement>(null);
  const applyMaskImgRef = useRef<HTMLImageElement>(null);
  const applyCanvasRef = useRef<HTMLCanvasElement>(null);
  const [processedApplyUrl, setProcessedApplyUrl] = useState<string | null>(null);

  const runApplyIsolation = (): string | null => {
    if (removeApplyBg && appliedImage && applyImgRef.current && applyCanvasRef.current) {
      const canvas = applyCanvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = applyImgRef.current;
      if (!img.complete || img.naturalWidth === 0) return null;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);

      if (applyAiMaskActive && applyMask && applyMaskImgRef.current) {
        const maskImg = applyMaskImgRef.current;
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

          if (applyMaskSoftening > 0 && tempCtx) {
            const blurCanvas = document.createElement('canvas');
            blurCanvas.width = canvas.width;
            blurCanvas.height = canvas.height;
            const blurCtx = blurCanvas.getContext('2d');
            if (blurCtx) {
              blurCtx.filter = `blur(${applyMaskSoftening}px)`;
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
              data[i + 3] = applyInvertBg ? (255 - maskLum) : maskLum;

              if (applySpillSuppression > 0 && data[i + 3] > 0) {
                const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
                const avgRB = (r + b) / 2;
                if (g > avgRB) {
                  const factor = applySpillSuppression / 100;
                  data[i + 1] = g * (1 - factor) + avgRB * factor;
                }
              }
            }
            ctx?.putImageData(imgData, 0, 0);
            setProcessedApplyUrl(canvas.toDataURL('image/png'));
            return canvas.toDataURL('image/png');
          }
        }
      }

      ctx?.drawImage(img, 0, 0);
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      if (imageData) {
        const data = imageData.data;
        const key = { r: data[0], g: data[1], b: data[2] };
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
          const isMatch = Math.abs(r - key.r) < applyTolerance && Math.abs(g - key.g) < applyTolerance && Math.abs(b - key.b) < applyTolerance;

          if (applyInvertBg) { if (!isMatch) data[i + 3] = 0; }
          else { if (isMatch) data[i + 3] = 0; }

          if (applySpillSuppression > 0 && data[i + 3] > 0) {
            const rP = data[i]; const gP = data[i + 1]; const bP = data[i + 2];
            const avgRB = (rP + bP) / 2;
            if (gP > avgRB) {
              const factor = applySpillSuppression / 100;
              data[i + 1] = gP * (1 - factor) + avgRB * factor;
            }
          }
        }
        ctx?.putImageData(imageData, 0, 0);
        const res = canvas.toDataURL('image/png');
        setProcessedApplyUrl(res);
        return res;
      }
    } else {
      setProcessedApplyUrl(null);
    }
    return null;
  };

  useEffect(() => {
    runApplyIsolation();
  }, [removeApplyBg, applyTolerance, matteErosion, appliedImage, applyMask, applyAiMaskActive, applySpillSuppression, applyMaskSoftening, applyInvertBg]);

  const scanProps = async () => {
    if (!state.saveDirectoryHandle) return;
    try {
      // @ts-ignore
      if ((await state.saveDirectoryHandle.queryPermission({ mode: 'read' })) !== 'granted') return;

      const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
      const items: PropItem[] = [];
      // @ts-ignore
      for await (const entry of (propsHandle as any).values()) {
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
            prompt: "Saved prop asset",
            timestamp: file.lastModified
          });
        }
      }
      dispatch({ type: 'SET_PROP_ITEMS', payload: items.sort((a, b) => b.timestamp - a.timestamp) });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Props scan failed: ${e.message}`, type: 'error' } });
    }
  };

  useEffect(() => {
    scanProps();
  }, [state.saveDirectoryHandle]);
  // --- Reference Slot quick-bind (Shift+Click power-user shortcut) ---
  const bindToFirstEmptyRefSlot = (url: string, name: string) => {
    const slots: any[] = (state as any).referenceSlots || [];
    if (!slots.length) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'No reference slots available to bind.', type: 'error' } });
      return;
    }
    const slot = slots.find((s) => !s.url) ?? slots[0];
    const index = typeof slot.index === 'number' ? slot.index : 0;

    dispatch({
      type: 'UPDATE_REF_SLOT',
      payload: {
        index,
        updates: {
          url,
          name,
          active: true,
          status: 'ready',
          analysis: '',
        },
      },
    });

    dispatch({
      type: 'ADD_LOG',
      payload: { message: `Bound to Reference Slot ${index + 1}: ${name}`, type: 'success' },
    });
  };

  const getFinalAppliedUrl = (): string | null => {
    const freshUrl = runApplyIsolation();
    return freshUrl || processedApplyUrl || appliedImage || null;
  };

  const saveToProps = async (imageUrl: string, prompt: string) => {
    if (!state.saveDirectoryHandle) return;
    try {
      const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
      const filename = `PROP-${Date.now()}.png`;
      const fileHandle = await propsHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      await writable.write(blob);
      await writable.close();
      const newItem: PropItem = {
        id: filename,
        url: imageUrl,
        name: prompt.substring(0, 20),
        prompt: prompt,
        timestamp: Date.now()
      };
      dispatch({ type: 'ADD_PROP_ITEM', payload: newItem });
      dispatch({ type: 'ADD_LOG', payload: { message: `Prop saved to library: ${filename}`, type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save prop: ${e.message}`, type: 'error' } });
    }
  };

  const handleDesignerGenerate = async () => {
    if (!designerPrompt || !state.apiKey) return;
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      const res = await GeminiService.generateImage(
        `Professional standalone object photography: ${designerPrompt}. 
         High resolution, detailed texture, cinematic studio lighting, solid white studio background. 
         Isolated prop, no background distractions. Strictly solid white background only.`,
        state.apiKey,
        state.model,
        [],
        { aspectRatio: '1:1' }
      );
      setDesignerImage(res);
      dispatch({ type: 'ADD_LOG', payload: { message: "Prop generated on studio white.", type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleApply = async () => {
    if (!selectedCharacter || !selectedProp || !state.apiKey) return;
    setRemoveApplyBg(false);
    setApplyMask(null);
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      const res = await GeminiService.generateImage(
        `Perform a professional prop integration. 
         [IMAGE 1] is the target SUBJECT. 
         [IMAGE 2] is the standalone PROP to add.
         
         OBJECTIVE: Integrate the prop from [IMAGE 2] into the scene with the subject in [IMAGE 1].
         CRITICAL CONSTRAINTS:
         1. MAINTAIN the subject's exact identity and appearance from [IMAGE 1].
         2. Integrate the prop naturally (e.g. held in hand, worn, or placed nearby).
         3. Adjust the prop's lighting and perspective to match the subject perfectly.
         4. ${applyNote || "Clean professional placement."}
         5. Use a solid Neon Green background (#39FF14) for perfect subject isolation.`,
        state.apiKey,
        state.model,
        [
          { url: selectedCharacter.url, label: "Subject Reference" },
          { url: selectedProp.url, label: "Prop Reference" }
        ],
        { aspectRatio: '1:1' }
      );
      setAppliedImage(res);
      dispatch({ type: 'ADD_LOG', payload: { message: "Prop integrated. Creating character edge mask...", type: 'info' } });
      try {
        const maskRes = await GeminiService.generateImage(
          "DIGITAL CHARACTER SEGMENTATION MASK: Create a pure black and white silhouette of the character and the integrated prop. White = Subject, Black = Background.",
          state.apiKey,
          state.model,
          [{ url: res, label: "Reference" }],
          { aspectRatio: '1:1' }
        );
        setApplyMask(maskRes);
      } catch { }
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleAddToCast = () => {
    const freshUrl = runApplyIsolation();
    const finalUrl = freshUrl || processedApplyUrl || appliedImage;
    if (!finalUrl || !selectedCharacter) return;
    dispatch({
      type: 'ADD_CAST',
      payload: {
        id: `propfit-${Date.now()}`,
        url: finalUrl,
        tag: 'front',
        name: `${selectedCharacter.name} + Prop`,
        profile: {
          identity: selectedCharacter.profile?.identity || selectedCharacter.name,
          wardrobe: selectedCharacter.profile?.wardrobe || "",
          accessories: selectedProp?.prompt || "Selected Accessory",
          style: selectedCharacter.profile?.style || ""
        }
      }
    });
  };

  const handleSaveToActors = async () => {
    const freshUrl = runApplyIsolation();
    const finalUrl = freshUrl || processedApplyUrl || appliedImage;
    if (!finalUrl || !state.saveDirectoryHandle) return;
    try {
      const actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: true });
      const safeName = (selectedCharacter?.name || 'PropActor').slice(0, 30).replace(/[^a-z0-9]/gi, '_');
      const filename = `Actor-Prop-${Date.now()}-${safeName}.png`;
      const fileHandle = await actorsDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      const res = await fetch(finalUrl);
      const blob = await res.blob();
      await writable.write(blob);
      await writable.close();
      dispatch({
        type: 'ADD_ACTOR_LIBRARY',
        payload: {
          id: `actor-prop-${Date.now()}`,
          url: finalUrl,
          tag: 'front',
          name: `${selectedCharacter?.name} (Prop)`,
          profile: {
            identity: selectedCharacter?.profile?.identity || "Unknown",
            wardrobe: selectedCharacter?.profile?.wardrobe || "",
            accessories: selectedProp?.name || "Prop",
            style: "Prop Application"
          }
        }
      });
      dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors Library: ${filename}`, type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save actor: ${e.message}`, type: 'error' } });
    }
  };

  return (
    <div className="h-full bg-[#0f0f11] flex overflow-hidden">
      <div className="w-80 border-r border-gray-800 bg-[#18181b] flex flex-col shadow-xl">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-black text-white tracking-widest uppercase">Prop Library</h2>
          <div className="flex gap-1.5">
            <button onClick={scanProps} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400">
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-4 grid grid-cols-2 gap-2">
          {state.propItems.map(item => (
            <button
              key={item.id}
              onClick={(e) => {
                if ((e as any).shiftKey) {
                  bindToFirstEmptyRefSlot(item.url, item.name || 'Prop');
                  return;
                }
                setSelectedProp(item);
              }}
              className={`aspect-square rounded-lg border overflow-hidden transition-all group relative ${selectedProp?.id === item.id ? 'border-blue-500 border-2' : 'border-gray-800 hover:border-gray-600'}`}
            >
              <img src={item.url} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {/* FIX: avoid nested <button> inside <button> */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                    }
                  }}
                  className="bg-blue-500/80 p-1.5 rounded-full cursor-pointer hover:bg-blue-500"
                  title="Inspect Large"
                >
                  <Maximize className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-grow flex flex-col bg-[#09090b]">
        <div className="flex bg-[#18181b] px-4 pt-4 gap-4 border-b border-gray-800">
          <button onClick={() => setActiveTab('designer')} className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'designer' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Prop Designer</button>
          <button onClick={() => setActiveTab('library')} className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'library' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Application Room</button>
        </div>

        <div className="flex-grow overflow-y-auto p-8">
          {activeTab === 'designer' ? (
            <div className="max-w-4xl mx-auto grid grid-cols-2 gap-8">
              <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800">
                <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">Designer Workshop</h3>
                <textarea value={designerPrompt} onChange={(e) => setDesignerPrompt(e.target.value)} className="w-full bg-[#09090b] border border-[#27272a] p-4 rounded-xl text-sm text-gray-200 h-40 mb-4" placeholder="Describe the object..." />
                <button onClick={handleDesignerGenerate} disabled={state.isProcessing || !designerPrompt} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black text-xs uppercase">Generate Prop</button>
              </div>
              <div className="aspect-square bg-black rounded-2xl border border-gray-800 flex items-center justify-center overflow-hidden relative">
                {designerImage ? (
                  <div className="relative w-full h-full">
                    <img src={designerImage} className="w-full h-full object-contain" />
                    <button onClick={() => saveToProps(designerImage!, designerPrompt)} className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-3"><Save className="w-4 h-4" /> Save to Library</button>
                  </div>
                ) : (
                  <Package className="w-16 h-16 opacity-10" />
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto grid grid-cols-12 gap-8">
              <div className="col-span-4 space-y-6">
                <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800">
                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">1. Subject</h3>
                  <div className="grid grid-cols-4 gap-2 mb-6 h-32 overflow-y-auto">
                    {state.cast.map(c => (
                      <button key={c.id} onClick={() => setSelectedCharacter(c)} className={`aspect-square rounded border ${selectedCharacter?.id === c.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-800'}`}><img src={c.url} className="w-full h-full object-cover" /></button>
                    ))}
                  </div>
                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest border-t border-gray-800 pt-6">2. Active Prop</h3>
                  <div className="aspect-square bg-[#09090b] rounded-xl border border-gray-800 mb-6 flex items-center justify-center overflow-hidden">
                    {selectedProp ? <img src={selectedProp.url} className="w-full h-full object-contain" /> : <Package className="w-10 h-10 opacity-10" />}
                  </div>
                  <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest border-t border-gray-800 pt-6">3. Placement Notes</h3>
                  <textarea className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-xs text-gray-300 h-20 mb-4 focus:border-blue-500 focus:outline-none" placeholder="Where should the prop be?..." value={applyNote} onChange={(e) => setApplyNote(e.target.value)} />
                  <button onClick={handleApply} disabled={state.isProcessing || !selectedCharacter || !selectedProp} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 disabled:opacity-50">Apply to Character</button>
                </div>
              </div>

              <div className="col-span-8">
                <div className="aspect-square bg-black rounded-3xl border border-gray-800 flex items-center justify-center overflow-hidden relative">
                  {appliedImage ? (
                    <>
                      <img ref={applyImgRef} src={appliedImage} className={processedApplyUrl ? 'hidden' : 'w-full h-full object-cover'} />
                      {processedApplyUrl && <img src={processedApplyUrl} className="w-full h-full object-cover" />}
                      <canvas ref={applyCanvasRef} className="hidden" />
                      {applyMask && <img ref={applyMaskImgRef} src={applyMask} className="hidden" />}
                    </>
                  ) : (
                    <Package className="w-24 h-24 opacity-10" />
                  )}

                  {appliedImage && (
                    <div className="absolute top-6 right-6 flex flex-col gap-3 z-20 bg-black/60 p-4 rounded-3xl border border-white/10 backdrop-blur-md">
                      <div className="flex items-center justify-between gap-6">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={removeApplyBg} onChange={(e) => setRemoveApplyBg(e.target.checked)} className="w-4 h-4 accent-blue-500 rounded" />
                          <Eraser className="w-3.5 h-3.5" /> Remove BG
                        </label>
                        {applyMask && (
                          <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={applyAiMaskActive} onChange={(e) => setApplyAiMaskActive(e.target.checked)} className="w-3.5 h-3.5 accent-blue-500 rounded" />
                            <Sparkles className="w-3 h-3" /> AI Masking
                          </label>
                        )}
                      </div>

                      {removeApplyBg && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between text-[9px] font-bold text-gray-500 uppercase tracking-wider"><span>Tolerance</span><span>{applyTolerance}%</span></div>
                          <input type="range" min="1" max="100" value={applyTolerance} onChange={(e) => setApplyTolerance(parseInt(e.target.value))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none" />
                          {applyMask && applyAiMaskActive && (
                            <>
                              <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase pt-1"><span>Matte Contraction</span><span>{matteErosion}px</span></div>
                              <input type="range" min="0" max="10" step="1" value={matteErosion} onChange={(e) => setMatteErosion(parseInt(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none" />
                              <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase pt-1"><span>Mask Softening</span><span>{applyMaskSoftening}px</span></div>
                              <input type="range" min="0" max="10" step="0.5" value={applyMaskSoftening} onChange={(e) => setApplyMaskSoftening(parseFloat(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none" />
                            </>
                          )}
                          <div className="flex items-center justify-between text-[9px] font-bold text-green-400/60 uppercase pt-1"><span>Spill Suppression</span><span>{applySpillSuppression}%</span></div>
                          <input type="range" min="0" max="100" value={applySpillSuppression} onChange={(e) => setApplySpillSuppression(parseInt(e.target.value))} className="w-full h-1 bg-green-900/30 rounded-lg appearance-none" />
                        </div>
                      )}
                    </div>
                  )}

                  {appliedImage && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 z-30">
                      <button onClick={(e) => {
                        if ((e as any).shiftKey) {
                          const finalUrl = getFinalAppliedUrl();
                          if (finalUrl) {
                            bindToFirstEmptyRefSlot(finalUrl, `${selectedCharacter?.name || 'Subject'} + Prop Result`);
                          }
                          return;
                        }
                        handleAddToCast();
                      }} className="w-14 h-14 bg-emerald-500/20 text-emerald-500 rounded-xl flex items-center justify-center border border-emerald-500/30"><UserPlus className="w-6 h-6" /></button>
                      <button onClick={() => { const l = document.createElement('a'); l.href = processedApplyUrl || appliedImage!; l.download = "applied-prop.png"; l.click(); }} className="w-14 h-14 bg-white/10 text-white rounded-xl flex items-center justify-center border border-white/20"><Download className="w-6 h-6" /></button>
                      <button onClick={() => setAppliedImage(null)} className="w-14 h-14 bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center border border-red-500/30"><X className="w-6 h-6" /></button>
                      <button onClick={handleSaveToActors} className="w-14 h-14 bg-indigo-500/20 text-indigo-500 rounded-xl flex items-center justify-center border border-indigo-500/30"><Save className="w-6 h-6" /></button>
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

export default PropAccessoryStudio;
