import React, { useState, useEffect, useRef } from 'react';

import { 
  ImageIcon, 
  RotateCw, 
  RefreshCcw, 
  X,
  Clapperboard, 
  Pencil,
  Settings as SettingsIcon,
  Upload,
  Upload as UploadIcon,
  Maximize as MaximizeIcon,
  Trash2 as TrashIcon,
  MonitorPlay,
  Download,
  Sparkles,
  BoxSelect,
  Square,

  StickyNote,
  MoveUpRight,
  Link2,
  UserPlus,
  FlipHorizontal,
  FlipVertical
} from 'lucide-react';






import { useAppContext } from '../context/AppContext';
import type { 
  DirectorSettings, 
  DirectorAspectRatio, 
  DirectorResolution, 
  DirectorQualityMode, 
  DirectorSafety, 
  DirectorMergeStrategy,
  DirectorSpatialLayout,
  DirectorMarkerType,
  ReferenceSlot, 
  CastMember, 
  StageToken
} from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { 
  compileV3DirectorPrompt, 

} from '../utils/promptHelpers';

// --- HELPER COMPONENTS (Moved outside to prevent re-mount focus loss) ---
const Dropdown = ({ label, value, options, onChange, icon: Icon }: any) => (
  <div className="flex-1 min-w-[120px]">
    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </label>
    <select 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-1.5 rounded focus:border-yellow-500 outline-none appearance-none"
    >
      {options.map((opt: any) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

const PropertyField = ({ label, value, onChange, icon: Icon, type = "text", placeholder = "" }: any) => (
  <div className="space-y-1">
    <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </label>
    {type === "textarea" ? (
      <textarea 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-2 rounded focus:border-yellow-500 outline-none resize-none"
      />
    ) : (
      <input 
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-2 rounded focus:border-yellow-500 outline-none"
      />
    )}
  </div>
);

// B. Scene Blocking Component
const SceneCanvas = () => {
  const { state, dispatch } = useAppContext();
  const stageRef = useRef<HTMLDivElement>(null);
  
  // DRAG STATE FOR CANVAS ITEMS
  const [dragItem, setDragItem] = useState<{id: string, type: 'token' | 'annotation', startX: number, startY: number, initialX: number, initialY: number} | null>(null);
  const [resizeItem, setResizeItem] = useState<{
    id: string, 
    type: 'token' | 'annotation', 
    handle: 'tl' | 'tr' | 'bl' | 'br', 
    startX: number, 
    startY: number, 
    initialW: number, 
    initialH: number,
    initialX: number,
    initialY: number,
    initialScaleX: number,
    initialScaleY: number,
    uniformScale?: boolean
  } | null>(null);

  // --- V3-STYLE REFERENCE STACK (integrated) ---
  const refFileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [bgPrompt, setBgPrompt] = useState('');

  const [dragOverRefSlot, setDragOverRefSlot] = useState<number | null>(null);
  const [inspectRefIndex, setInspectRefIndex] = useState<number | null>(null);
  const [inspectName, setInspectName] = useState('');
  const [inspectAnalysis, setInspectAnalysis] = useState('');
  const [analyzingTokenId, setAnalyzingTokenId] = useState<string | null>(null);
  const [inspectTarget, setInspectTarget] = useState('');

  const updateRefSlot = (index: number, updates: Partial<ReferenceSlot>) => {
    dispatch({ type: 'UPDATE_REF_SLOT', payload: { index, updates } });
  };

  const setDirector = (updates: Partial<DirectorSettings>) => {
    dispatch({ type: 'SET_DIRECTOR', payload: updates });
  };

  const refAnalysisPrompt = "Describe the subject, their clothing/appearance, and the specific art style or texture details. Be concise (max 20 words).";

  // Recompile prompt when stage or settings change


  // --- V3-STYLE ANCHOR SCENE INTELLIGENCE (integrated) ---
  const [anchorStatus, setAnchorStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [anchorMessage, setAnchorMessage] = useState<string>(() => state.backgroundUrl ? '> Anchor loaded. Ready to analyze.' : '> No anchor scene loaded.');
  const anchorFileInputRef = useRef<HTMLInputElement>(null);
  const lastBgRef = useRef<string | null>(state.backgroundUrl);

  const safeParseJson = (raw: string): any | null => {
    try {
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (lastBgRef.current === state.backgroundUrl) return;
    setAnchorStatus('idle');
    setAnchorMessage(state.backgroundUrl ? '> Anchor loaded. Ready to analyze.' : '> No anchor scene loaded.');
    // If the env/cam/light were auto-injected, clear them on anchor change (V3 behavior).
    if (state.director.envAuto) {
      setDirector({ environment: '', lighting: '', camera: '', envAuto: false });
    }
    lastBgRef.current = state.backgroundUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.backgroundUrl]);

  const analyzeAnchorDNA = async () => {
    if (!state.backgroundUrl) {
      setAnchorStatus('error');
      setAnchorMessage('> No anchor scene loaded.');
      return;
    }
    if (!state.apiKey) {
      setAnchorStatus('error');
      setAnchorMessage('> Auth Error: Check Settings.');
      return;
    }

    setAnchorStatus('analyzing');
    setAnchorMessage('> Analyzing Anchor Scene DNA...');

    try {
      const raw = await GeminiService.analyzeImage(
        "Analyze this image for a film director. Return a JSON object with 3 keys: 'environment' (string, concise setting/vibe), 'lighting' (string, e.g. 'Golden Hour', 'Neon', 'Dark/Moody'), and 'camera' (string, e.g. 'Wide Angle', 'Close Up', 'Drone'). Only return the JSON.",
        state.apiKey, 
        state.model,
        state.backgroundUrl
      );

      const parsed = safeParseJson(raw);
      if (!parsed) throw new Error('Non-JSON response');

      const dna = {
        environment: String(parsed.environment || '').trim(),
        lighting: String(parsed.lighting || '').trim(),
        camera: String(parsed.camera || '').trim(),
      };

      setDirector({
        environment: dna.environment,
        lighting: dna.lighting,
        camera: dna.camera,
        envAuto: true
      });

      setAnchorStatus('ready');
      setAnchorMessage('> DNA extracted.');
    } catch (e: any) {
      setAnchorStatus('error');
      setAnchorMessage(`> Analysis unavailable (${e.message || 'error'})`);
    }
  };

  const handleGenerateBackground = async () => {
    if (!state.apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for background generation.", type: 'error' } });
      return;
    }
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      const prompt = `Cinematic background scene: ${bgPrompt}. High quality, film precision, detailed environment, no people. Width-Height Ratio: ${state.director.aspectRatio}`;
      
      const img = await GeminiService.generateImage(        
        prompt,
        state.apiKey,
        state.model,
        [], 
        { aspectRatio: state.director.aspectRatio }
      );
      dispatch({ type: 'SET_BG', payload: img });
      dispatch({ type: 'ADD_LOG', payload: { message: "Background generated.", type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Background generation failed: ${e.message}`, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleDownloadBackground = () => {
    if (!state.backgroundUrl) return;
    const link = document.createElement('a');
    link.href = state.backgroundUrl;
    link.download = `nano_bg_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  };

  const analyzeRefSlot = async (index: number, imageUrl: string) => {
    if (!state.apiKey) {
      updateRefSlot(index, { analysis: 'Analysis unavailable (Manual Mode)', status: 'ready' });
      return;
    }

    try {
      const text = await GeminiService.analyzeImage(refAnalysisPrompt, state.apiKey, state.model, imageUrl);
      updateRefSlot(index, { analysis: text, status: 'ready' });
    } catch (e: any) {
      updateRefSlot(index, { analysis: `Analysis unavailable (${e.message || 'error'})`, status: 'ready' });
    }
  };

  const setSlotFromUrl = async (index: number, url: string, name?: string, castId?: string) => {
    updateRefSlot(index, {
      url,
      name: name || `Ref ${index}`,
      castId,
      active: true,
      status: 'analyzing',
      analysis: 'Analyzing…'
    });
    await analyzeRefSlot(index, url);
  };

  const handleRefSlotFile = async (index: number, file: File) => {
    const url = await fileToDataUrl(file);
    await setSlotFromUrl(index, url, file.name, undefined);
  };

  const handleRefSlotDrop = async (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRefSlot(null);

    // 1) Files from OS
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleRefSlotFile(index, file);
      return;
    }

    // 2) Dragged Forge asset
    const raw = e.dataTransfer.getData('application/json');
    if (raw) {
      try {
        const cast = JSON.parse(raw) as CastMember;
        await setSlotFromUrl(index, cast.url, cast.name || (cast as any).tag, cast.id);
      } catch {
        // ignore
      }
    }
  };

  const handleRefSlotClick = (index: number) => {
    const slot = state.referenceSlots.find(s => s.index === index);
    if (!slot) return;

    if (!slot.url) {
      refFileInputs.current[index]?.click();
      return;
    }

    // V3 behavior: clicking an occupied slot toggles active
    updateRefSlot(index, { active: !slot.active });
  };

  const clearRefSlot = (index: number) => {
    updateRefSlot(index, {
      url: undefined,
      name: undefined,
      analysis: undefined,
      target: undefined,
      castId: undefined,
      active: false,
      status: 'empty'
    });
  };

  const toggleReplaceMode = (next: boolean) => {
    setDirector({ replaceAnchorSubjects: next });
    if (!next) {
      // V3 behavior: wiping replacement map when turning off
      setDirector({ globalReplaceTarget: '' });
      state.referenceSlots.forEach(s => {
        if (s.target) updateRefSlot(s.index, { target: undefined });
      });
    }
  };

  // Sync inspector drafts when a slot is opened
  useEffect(() => {
    if (inspectRefIndex == null) return;
    const slot = state.referenceSlots.find(s => s.index === inspectRefIndex);
    if (!slot) return;
    setInspectName(slot.name || `Ref ${inspectRefIndex}`);
    setInspectAnalysis(slot.analysis || '');
    setInspectTarget(slot.target || '');
  }, [inspectRefIndex, state.referenceSlots]);

  // V3 Prompt Terminal output (pure string, copy-ready)
  const v3DirectorPrompt = React.useMemo(() => {
    return compileV3DirectorPrompt(state.director, state.referenceSlots, state.tokens);
  }, [state.director, state.referenceSlots, state.tokens]);

  const handleCopyDirectorPrompt = async () => {
    const text = v3DirectorPrompt || '';
    try {
      await navigator.clipboard.writeText(text);
      dispatch({ type: 'ADD_LOG', payload: { message: 'Director prompt copied to clipboard.', type: 'success' } });
    } catch {
      dispatch({ type: 'ADD_LOG', payload: { message: 'Clipboard copy failed (browser permissions).', type: 'error' } });
    }
  };


  // --- DRAG & RESIZE LOGIC ---
  const handleStageMouseMove = (e: React.MouseEvent) => {
    if (dragItem) {
      const dx = e.clientX - dragItem.startX;
      const dy = e.clientY - dragItem.startY;
      const updates = { x: dragItem.initialX + dx, y: dragItem.initialY + dy };
      
      if (dragItem.type === 'token') {
        dispatch({ type: 'UPDATE_TOKEN', payload: { id: dragItem.id, ...updates } });
      } else {
        dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: dragItem.id, ...updates } });
      }
    } else if (resizeItem) {
      const dx = e.clientX - resizeItem.startX;
      const dy = e.clientY - resizeItem.startY;
      
      let nw = resizeItem.initialW;
      let nh = resizeItem.initialH;

      // Better: we need the resizeItem to store the anchor to do this math properly if it varies per token.
      // Assuming 'token' type has anchorX/Y. We need to pass it in setResizeItem.
      // Let's assume passed in resizeItem.
      
      const ax = (resizeItem as any).anchorX ?? 0.5;
      const ay = (resizeItem as any).anchorY ?? 0.8;
      
      let oldLeft = resizeItem.initialX - (resizeItem.initialW * ax);
      let oldTop = resizeItem.initialY - (resizeItem.initialH * ay);
      
      let newLeft = oldLeft;
      let newTop = oldTop;
      
      // Calculate new dimensions based on handle
      if (resizeItem.handle.includes('r')) nw = Math.max(20, resizeItem.initialW + dx);
      if (resizeItem.handle.includes('l')) {
        nw = Math.max(20, resizeItem.initialW - dx);
        newLeft = oldLeft + (resizeItem.initialW - nw);
      }
      if (resizeItem.handle.includes('b')) nh = Math.max(20, resizeItem.initialH + dy);
      if (resizeItem.handle.includes('t')) {
        nh = Math.max(20, resizeItem.initialH - dy);
        newTop = oldTop + (resizeItem.initialH - nh);
      }
      
      // Aspect Ratio Lock
      if (resizeItem.uniformScale) {
        const ratio = resizeItem.initialW / resizeItem.initialH;
        if (resizeItem.handle === 'br' || resizeItem.handle === 'tl') {
             if (Math.abs(dx) > Math.abs(dy)) {
                 nh = nw / ratio;
                 if (resizeItem.handle === 'tl') newTop = oldTop + (resizeItem.initialH - nh);
             } else {
                 nw = nh * ratio;
                 if (resizeItem.handle === 'tl') newLeft = oldLeft + (resizeItem.initialW - nw);
             }
        } else if (resizeItem.handle === 'tr') {
             if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio; else nw = nh * ratio;
             newTop = oldTop + (resizeItem.initialH - nh);
        } else if (resizeItem.handle === 'bl') {
             if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio; else nw = nh * ratio;
             newLeft = oldLeft + (resizeItem.initialW - nw);
        }
      }

      // Recalculate Anchor Position from New Top-Left
      const nx = newLeft + (nw * ax);
      const ny = newTop + (nh * ay);

      if (resizeItem.type === 'token') {
        const newScaleX = resizeItem.initialScaleX * (nw / resizeItem.initialW);
        const newScaleY = resizeItem.initialScaleY * (nh / resizeItem.initialH);
        dispatch({ type: 'UPDATE_TOKEN', payload: { id: resizeItem.id, width: nw, height: nh, x: nx, y: ny, scaleX: newScaleX, scaleY: newScaleY } });
      } else {
        // Annotations strictly standard top-left for now so passing ax=0, ay=0 effectively
        // Actually annotations use center rotation but left/top position.
        // Let's keep annotation logic simple or just use the same math with 0,0 anchors if not present.
         dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: resizeItem.id, width: nw, height: nh, x: newLeft, y: newTop } });
         // Note: Annotations x/y are Top-Left currently in renderer.
      }
    }
  };


  const handleStageMouseUp = () => {
    setDragItem(null);
    setResizeItem(null);
  };

  const deleteSelection = () => {
    if (!state.selection) return;
    if (state.selectionType === 'token') {
      dispatch({ type: 'REMOVE_TOKEN', payload: state.selection });
    } else if (state.selectionType === 'annotation') {
      dispatch({ type: 'REMOVE_ANNOTATION', payload: state.selection });
    }
    dispatch({ type: 'SELECT_ITEM', payload: { id: null, type: null } });
  };

  // --- DROP HANDLER (Main Stage) ---
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 1) Actor Library Drop
    const raw = e.dataTransfer.getData('application/json');
    if (raw) {
      try {
        const item = JSON.parse(raw) as CastMember;
        const id = `token-${Date.now()}`;
        dispatch({
          type: 'ADD_TOKEN',
          payload: {
            id,
            castId: item.id,
            url: item.url,
            tag: item.name || 'Actor',
            x: x - 100,
            y: y - 150,
            width: 200,
            height: 300,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            pitch: 0,
            yaw: 0,
            anchorX: 0.5,
            anchorY: 0.8,
            zIndex: state.tokens.length + 1,
            uniformScale: true
          }
        });
        dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'token' } });
        return;
      } catch { /* ignore */ }
    }

    // 2) Wardrobe / Props (if applicable, but handled by the respective studios usually)
    // For now, we only handle CastMember drops on the canvas.
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };


  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 30)}...`));
      img.src = url;
    });
  };

  const captureStage = async (): Promise<string | null> => {
    if (!stageRef.current) return null;
    
    // 1. Setup Canvas (1920x1080 Pro Res for consistent high-quality export)
    const TARGET_W = 1920;
    const TARGET_H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");

    // 2. Determine Scale Factor based on the actual DOM stage dimensions
    // This allows WYSIWYG capture regardless of the user's screen size or zoom.
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    
    const scaleX = TARGET_W / rect.width;
    const scaleY = TARGET_H / rect.height;

    // 3. Draw Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.backgroundUrl) {
      try {
        const bg = await loadImage(state.backgroundUrl);
        // "object-cover" logic for background
        const imgRatio = bg.width / bg.height;
        const canvasRatio = canvas.width / canvas.height;
        let dw = canvas.width;
        let dh = canvas.height;
        let dx = 0;
        let dy = 0;

        if (imgRatio > canvasRatio) {
          // Image wider than canvas: crop sides
          dh = canvas.height;
          dw = dh * imgRatio;
          dx = (canvas.width - dw) / 2;
        } else {
          // Image taller than canvas: crop top/bottom
          dw = canvas.width;
          dh = dw / imgRatio;
          dy = (canvas.height - dh) / 2;
        }
        ctx.drawImage(bg, dx, dy, dw, dh);
      } catch (e) {
        console.error("BG Load Failed", e);
      }
    }

    // 4. Draw Tokens (Sorted by zIndex)
    const sortedTokens = [...state.tokens].sort((a, b) => a.zIndex - b.zIndex);
    for (const t of sortedTokens) {
      try {
        const img = await loadImage(t.url);
        
        // Map DOM coordinates to Canvas coordinates
        const x = t.x * scaleX;
        const y = t.y * scaleY;
        const w = t.width * scaleX;
        const h = t.height * scaleY;

        ctx.save();
        
        // Transform Origin Logic (default 50% 80% if not set)
        const ax = t.anchorX !== undefined ? t.anchorX : 0.5;
        const ay = t.anchorY !== undefined ? t.anchorY : 0.8;
        // In this new logic, t.x/t.y ARE the anchor point.
        const originX = x; 
        const originY = y;

        ctx.translate(originX, originY);
        ctx.rotate((t.rotation * Math.PI) / 180);
        ctx.scale(t.scaleX, t.scaleY);

        // "object-contain" logic for token content
        // The token DIV is (w, h). The image must fit INSIDE (w, h) maintaining aspect ratio.
        const imgRatio = img.width / img.height;
        const boxRatio = w / h;
        
        // Logic adapted from ProductionConsole to ensure parity
        let drawW = w;
        let drawH = h;
        let offX = 0;
        let offY = 0;

        if (imgRatio > boxRatio) {
          // Image is wider than box: constrain width, center height
          drawW = w;
          drawH = w / imgRatio;
          offX = 0;
          offY = (h - drawH) / 2;
        } else {
          // Image is taller than box: constrain height, center width
          drawH = h;
          drawW = h * imgRatio;
          offX = (w - drawW) / 2;
          offY = 0;
        }

        // We are drawing relative to the origin. 
        // The token top-left relative to origin is (-w * ax, -h * ay).
        // Add the object-contain offsets to that.
        ctx.drawImage(img, (-w * ax) + offX, (-h * ay) + offY, drawW, drawH);

        ctx.restore();
      } catch (e) {
        console.error("Token load failed", t);
      }
    }

    // 5. Draw Annotations
    const sortedAnnos = [...state.annotations].sort((a, b) => a.zIndex - b.zIndex);
    for (const a of sortedAnnos) {
      const x = a.x * scaleX;
      const y = a.y * scaleY;
      const w = a.width * scaleX;
      const h = a.height * scaleY;

      ctx.save();
      // Rotate around center for annotations
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((a.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);

      if (a.type === 'zone') {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // Blue
        ctx.lineWidth = 4 * ((scaleX + scaleY) / 2);
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(x, y, w, h);
        
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        ctx.fillRect(x, y, w, h);
        
        // Label
        ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        ctx.font = `bold ${16 * scaleX}px sans-serif`;
        ctx.fillText("ACTIVE ZONE", x + 10, y + 25 * scaleY);
      } 
      else if (a.type === 'note') {
        ctx.fillStyle = 'rgba(234, 179, 8, 0.2)'; // Yellow
        ctx.fillRect(x, y, w, h);
        
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
        ctx.lineWidth = 2 * ((scaleX + scaleY) / 2);
        ctx.strokeRect(x, y, w, h);
        
        if (a.text) {
          ctx.fillStyle = '#fef08a';
          ctx.font = `${14 * scaleX}px monospace`;
          // Simple multiline text wrapping could go here, but single line for now
          ctx.fillText(a.text, x + 5 * scaleX, y + 20 * scaleY);
        }
      }
      
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
  };

  // --- BACKGROUND GENERATION ---
  const generateBg = async () => {
    if (!bgPrompt.trim() || !state.apiKey) return;
    
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'ADD_LOG', payload: { message: `Generating Background: ${bgPrompt}`, type: 'info' } });

    try {
      const url = await GeminiService.generateImage(bgPrompt, state.apiKey, state.model);
      dispatch({ type: 'SET_BG', payload: url });
      dispatch({ type: 'ADD_LOG', payload: { message: 'Background generated successfully.', type: 'success' } });
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Background failed: ${e.message}`, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const downloadCanvas = async () => {
    if (!stageRef.current) return;
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'ADD_LOG', payload: { message: 'Composting Stage for Storyboard Capture...', type: 'info' } });

    try {
      const dataUrl = await captureStage();
      
      if (dataUrl) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `NB_Scene_${Date.now()}.png`;
        link.click();
        dispatch({ type: 'ADD_LOG', payload: { message: 'Stage captured successfully.', type: 'success' } });
      } else {
        throw new Error("Canvas composition returned empty.");
      }
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Capture failed: ${e.message}`, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  // --- INTERNAL UI HELPERS ---

  const updateToken = (id: string, updates: Partial<StageToken>) => {
    dispatch({ type: 'UPDATE_TOKEN', payload: { id, ...updates } });
  };



  // --- RENDER ---
  const selectedToken = state.tokens.find(t => t.id === state.selection);

  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden select-none">
      {/* 1. LEFT SIDEBAR: ACTIVE ACTOR INTELLIGENCE & PROPERTIES */}
      <div className="w-96 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar shrink-0">
        
        {/* Background Generator (Scene Generator) */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 shadow-xl shrink-0">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest flex items-center gap-2">
            <ImageIcon className="w-3 h-3 text-blue-400" /> Scene Generator
          </h3>
          
          <textarea 
            className="w-full bg-black border border-gray-800 p-2 rounded text-xs text-gray-300 h-24 resize-none mb-3 focus:border-blue-500 focus:outline-none transition-all"
            placeholder="Describe the setting (e.g. 'A high-tech control room with blue neon lighting')..."
            value={bgPrompt}
            onChange={(e) => setBgPrompt(e.target.value)}
          />

          <div className="mb-4">
             <label className="text-[9px] font-bold text-gray-500 uppercase mb-1 block">Aspect Ratio</label>
             <div className="grid grid-cols-4 gap-1">
                {(['16:9', '9:16', '1:1', '4:5'] as DirectorAspectRatio[]).map(ar => (
                  <button
                    key={ar}
                    onClick={() => setDirector({ aspectRatio: ar })}
                    className={`py-1 rounded text-[10px] font-bold border transition-all ${state.director.aspectRatio === ar ? 'bg-blue-600 border-blue-400 text-white' : 'bg-black border-gray-800 text-gray-500 hover:border-gray-600'}`}
                  >
                    {ar}
                  </button>
                ))}
             </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handleGenerateBackground}
              disabled={state.isProcessing || !bgPrompt || !state.apiKey}
              className={`flex-grow py-3 rounded-lg text-[10px] font-black transition-all border uppercase tracking-wider active:scale-95 flex items-center justify-center gap-2 ${
                state.backgroundUrl 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)]'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-400/50'
              }`}
            >
              {state.isProcessing ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : state.backgroundUrl ? (
                <RefreshCcw className="w-4 h-4" />
              ) : (
                <MonitorPlay className="w-4 h-4" />
              )}
              {state.backgroundUrl ? 'Stylize' : 'Generate'}
            </button>
            <button 
                onClick={handleDownloadBackground}
                disabled={!state.backgroundUrl}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 p-2 rounded cursor-pointer transition-colors disabled:opacity-50"
                title="Download current background"
            >
                <Download className="w-4 h-4" />
            </button>
            <label className="bg-gray-800 hover:bg-gray-700 text-gray-300 p-2 rounded cursor-pointer transition-colors" title="Upload custom background">
              <UploadIcon className="w-4 h-4" />
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => dispatch({ type: 'SET_BG', payload: ev.target?.result as string });
                    reader.readAsDataURL(file);
                  }
                  e.currentTarget.value = '';
                }} 
              />
            </label>
          </div>
        </div>


        {/* Token Properties (New Section) */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 shadow-xl shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <SettingsIcon className="w-4 h-4 text-yellow-500" />
              </div>
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Token Properties</h3>
            </div>

            {selectedToken ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                  {/* SELECTION INFO */}
                  <div className="flex items-center justify-between bg-[#09090b] px-3 py-2 rounded border border-gray-800">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Selected Token</span>
                        <span className="font-mono text-[10px] text-yellow-500 truncate">{selectedToken.tag.substring(0,12)}...</span>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => updateToken(selectedToken.id, { scaleX: selectedToken.scaleX * -1 })}
                          className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
                          title="Flip Horizontal"
                        >
                          <FlipHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => updateToken(selectedToken.id, { scaleY: selectedToken.scaleY * -1 })}
                          className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
                          title="Flip Vertical"
                        >
                          <FlipVertical className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={deleteSelection}
                          className="text-red-500 hover:text-red-400 p-1.5 bg-gray-800 hover:bg-red-900/20 rounded ml-2"
                          title="Delete Token"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                  </div>

                  {/* TRANSFORM CONTROLS */}
                  <div className="space-y-4 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></div>
                          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Transform</span>
                        </div>
                        <button 
                          onClick={() => updateToken(selectedToken.id, { 
                            x: 0, y: 0, rotation: 0, 
                            scaleX: 1, scaleY: 1, 
                            pitch: 0, yaw: 0, 
                            anchorX: 0.5, anchorY: 0.8,
                            uniformScale: true
                          })}
                          className="text-gray-600 hover:text-yellow-500 transition-colors"
                          title="Reset Transform"
                        >
                          <RefreshCcw className="w-3 h-3" />
                        </button>
                      </div>

                      {/* GRID LAYOUT FOR CONTROLS */}
                      <div className="grid grid-cols-[60px_1fr_24px_1fr_24px] items-center gap-2 px-1">
                        
                        {/* POSITION ROW */}
                        <span className="text-[10px] text-gray-500 uppercase font-medium">Position</span>
                        <div className="relative group">
                          <span className="absolute -top-2 left-1 text-[8px] text-gray-600 group-focus-within:text-yellow-500">X</span>
                          <input 
                            type="number"
                            value={Math.round(selectedToken.x)}
                            onChange={(e) => updateToken(selectedToken.id, { x: parseInt(e.target.value) || 0 })}
                            className="w-full bg-transparent border-b border-gray-800 focus:border-yellow-500 py-1 text-[11px] text-yellow-500 font-mono outline-none text-center"
                          />
                        </div>
                        <div className="text-center text-gray-700"></div> {/* Spacer */}
                        <div className="relative group">
                          <span className="absolute -top-2 left-1 text-[8px] text-gray-600 group-focus-within:text-yellow-500">Y</span>
                          <input 
                            type="number"
                            value={Math.round(selectedToken.y)}
                            onChange={(e) => updateToken(selectedToken.id, { y: parseInt(e.target.value) || 0 })}
                            className="w-full bg-transparent border-b border-gray-800 focus:border-yellow-500 py-1 text-[11px] text-yellow-500 font-mono outline-none text-center"
                          />
                        </div>
                        <button onClick={() => updateToken(selectedToken.id, { x: 0, y: 0 })} className="text-gray-700 hover:text-white"><RefreshCcw className="w-2.5 h-2.5" /></button>

                        {/* ZOOM ROW */}
                        <span className="text-[10px] text-gray-500 uppercase font-medium">Zoom</span>
                        <div className="relative group">
                          <span className="absolute -top-2 left-1 text-[8px] text-gray-600 group-focus-within:text-yellow-500">X</span>
                          <input 
                            type="number" step="0.01"
                            value={Math.abs(selectedToken.scaleX).toFixed(2)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const updates: Partial<StageToken> = { scaleX: val * (selectedToken.scaleX < 0 ? -1 : 1) };
                              if(selectedToken.uniformScale) updates.scaleY = val * (selectedToken.scaleY < 0 ? -1 : 1);
                              updateToken(selectedToken.id, updates);
                            }}
                            className="w-full bg-transparent border-b border-gray-800 focus:border-yellow-500 py-1 text-[11px] text-yellow-500 font-mono outline-none text-center"
                          />
                        </div>
                        <div className="flex justify-center">
                          <button 
                            onClick={() => updateToken(selectedToken.id, { uniformScale: !selectedToken.uniformScale })}
                            className={`p-1 rounded transition-colors ${selectedToken.uniformScale ? 'text-yellow-500 bg-yellow-500/10' : 'text-gray-600'}`}
                            title="Toggle Uniform Scale"
                          >
                            <Link2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="relative group">
                          <span className="absolute -top-2 left-1 text-[8px] text-gray-600 group-focus-within:text-yellow-500">Y</span>
                          <input 
                            type="number" step="0.01"
                            value={Math.abs(selectedToken.scaleY).toFixed(2)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const updates: Partial<StageToken> = { scaleY: val * (selectedToken.scaleY < 0 ? -1 : 1) };
                              if(selectedToken.uniformScale) updates.scaleX = val * (selectedToken.scaleX < 0 ? -1 : 1);
                              updateToken(selectedToken.id, updates);
                            }}
                            className="w-full bg-transparent border-b border-gray-800 focus:border-yellow-500 py-1 text-[11px] text-yellow-500 font-mono outline-none text-center"
                          />
                        </div>
                        <button onClick={() => updateToken(selectedToken.id, { scaleX: 1, scaleY: 1 })} className="text-gray-700 hover:text-white"><RefreshCcw className="w-2.5 h-2.5" /></button>

                        {/* ANCHOR ROW */}
                        <span className="text-[10px] text-gray-500 uppercase font-medium">Anchor</span>
                        <div className="relative group">
                          <span className="absolute -top-2 left-1 text-[8px] text-gray-600">X</span>
                          <input 
                            type="number" step="0.1"
                            value={selectedToken.anchorX.toFixed(1)}
                            onChange={(e) => updateToken(selectedToken.id, { anchorX: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-transparent border-b border-gray-800 focus:border-yellow-500 py-1 text-[11px] text-yellow-500 font-mono outline-none text-center"
                          />
                        </div>
                        <div className="text-center text-gray-700"></div> {/* Spacer */}
                        <div className="relative group">
                          <span className="absolute -top-2 left-1 text-[8px] text-gray-600">Y</span>
                          <input 
                            type="number" step="0.1"
                            value={selectedToken.anchorY.toFixed(1)}
                            onChange={(e) => updateToken(selectedToken.id, { anchorY: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-transparent border-b border-gray-800 focus:border-yellow-500 py-1 text-[11px] text-yellow-500 font-mono outline-none text-center"
                          />
                        </div>
                        <button onClick={() => updateToken(selectedToken.id, { anchorX: 0.5, anchorY: 0.8 })} className="text-gray-700 hover:text-white"><RefreshCcw className="w-2.5 h-2.5" /></button>
                      </div>

                      {/* SLIDER CONTROLS */}
                      <div className="space-y-3 mt-4 px-1">
                        {/* ROTATION */}
                        <div className="grid grid-cols-[60px_1fr_50px_24px] items-center gap-3">
                          <span className="text-[10px] text-gray-500 uppercase font-medium">Rotate</span>
                          <input 
                            type="range" min="-180" max="180"
                            value={selectedToken.rotation}
                            onChange={(e) => updateToken(selectedToken.id, { rotation: parseInt(e.target.value) })}
                            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                          />
                          <input 
                            type="number"
                            value={selectedToken.rotation}
                            onChange={(e) => updateToken(selectedToken.id, { rotation: parseInt(e.target.value) || 0 })}
                            className="bg-black border border-gray-800 py-0.5 px-1 rounded text-[10px] text-yellow-500 font-mono text-center outline-none w-full"
                          />
                          <button onClick={() => updateToken(selectedToken.id, { rotation: 0 })} className="text-gray-700 hover:text-white"><RefreshCcw className="w-2.5 h-2.5" /></button>
                        </div>
                        
                        {/* LAYER DEPTH */}
                        <div className="flex items-center justify-center pt-2 w-full">
                            <div className="flex gap-2 w-full max-w-[200px]">
                                <button 
                                  onClick={() => {
                                      // SMART BACK: Find the token immediately below and swap z-indices
                                      const currentZ = selectedToken.zIndex;
                                      const sorted = [...state.tokens].sort((a, b) => a.zIndex - b.zIndex);
                                      const lower = sorted.reverse().find(t => t.zIndex < currentZ); // Find closest below
                                      
                                      if (lower) {
                                          const newZ = lower.zIndex;
                                          // Swap
                                          updateToken(lower.id, { zIndex: currentZ });
                                          updateToken(selectedToken.id, { zIndex: newZ });
                                      } else {
                                          // Already at bottom, ensure min is 1
                                          if (currentZ > 1) updateToken(selectedToken.id, { zIndex: 1 });
                                      }
                                  }}
                                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-[10px] uppercase font-bold py-1.5 rounded"
                                >
                                    Back
                                </button>
                                <span className="bg-black px-3 py-1 text-[10px] text-gray-500 font-mono border border-gray-800 rounded">{selectedToken.zIndex}</span>
                                <button 
                                  onClick={() => {
                                      // SMART FRONT: Find the token immediately above and swap z-indices
                                      const currentZ = selectedToken.zIndex;
                                      const sorted = [...state.tokens].sort((a, b) => a.zIndex - b.zIndex);
                                      const higher = sorted.find(t => t.zIndex > currentZ); // Find closest above
                                      
                                      if (higher) {
                                          const newZ = higher.zIndex;
                                          // Swap
                                          updateToken(higher.id, { zIndex: currentZ });
                                          updateToken(selectedToken.id, { zIndex: newZ });
                                      } else {
                                          // Already at top? Just +1 to be sure?
                                          // Actually if we just +1 it might create a gap, which is fine.
                                          updateToken(selectedToken.id, { zIndex: currentZ + 1 });
                                      }
                                  }}
                                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-[10px] uppercase font-bold py-1.5 rounded"
                                >
                                    Front
                                </button>
                            </div>
                        </div>
                      </div>
                  </div>
              </div>
            ) : (
               <div className="flex-grow flex flex-col items-center justify-center text-gray-700 gap-3 opacity-50 py-10">
                  <BoxSelect className="w-10 h-10 stroke-[1]" />
                  <p className="text-xs font-bold uppercase tracking-widest">No Token Selected</p>
               </div>
            )}
        </div>

        
        {/* CAST PALETTE (RESTORED) */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl flex flex-col shadow-xl h-64 shrink-0">
            <div className="p-3 border-b border-[#27272a] flex justify-between items-center bg-[#18181b] rounded-t-xl">
                <div className="flex items-center gap-2">
                   <div className="p-1.5 bg-purple-500/10 rounded-lg">
                      <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                   </div>
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Available Cast</span>
                </div>
                <span className="text-[9px] bg-purple-500/10 px-1.5 py-0.5 rounded text-purple-400 font-mono border border-purple-500/20">{state.cast.length}</span>
            </div>
            <div className="p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                <div className="grid grid-cols-3 gap-2 pb-2">
                {state.cast.map(c => (
                    <div 
                        key={c.id} 
                        className="aspect-square bg-black border border-gray-700 rounded-lg overflow-hidden cursor-move hover:border-purple-500 transition-all relative group shadow-sm"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify(c));
                        }}
                    >
                        <img src={c.url} className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                           <span className="text-[8px] font-bold text-white uppercase px-1 text-center leading-tight truncate w-full">{c.tag}</span>
                        </div>
                    </div>
                ))}
                 {state.cast.length === 0 && (
                    <div className="col-span-3 text-center py-8 opacity-30">
                        <p className="text-[9px] uppercase font-bold">No Cast Loaded</p>
                    </div>
                )}
                </div>
            </div>
        </div>
      </div>

      {/* 2. CENTER AREA: THE STAGE */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div 
          ref={stageRef}
          className="flex-1 bg-[#09090b] border border-[#27272a] rounded-xl relative overflow-hidden shadow-2xl group"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
        >
          {/* Background Layer */}
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,_#111111_0%,_#000000_100%)]">
            {state.backgroundUrl ? (
              <img 
                src={state.backgroundUrl} 
                alt="Stage Background" 
                className="w-full h-full object-contain pointer-events-none opacity-50"
              />
            ) : (
              <div className="text-gray-800 flex flex-col items-center gap-4 opacity-20">
                <Square className="w-24 h-24 stroke-[1]" />
                <span className="text-xs font-bold uppercase tracking-[0.5em]">Empty Stage</span>
              </div>
            )}
          </div>

          {/* Tokens Layer */}
          {state.tokens.sort((a, b) => a.zIndex - b.zIndex).map(token => (
            <div
              key={token.id}
              className={`absolute cursor-move group/token ${state.selection === token.id ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-[#09090b] z-50' : ''}`}
              style={{
                left: token.x - (token.width * token.anchorX),
                top: token.y - (token.height * token.anchorY),
                width: token.width,
                height: token.height,
                transformOrigin: `${token.anchorX * 100}% ${token.anchorY * 100}%`,
                transform: `rotate(${token.rotation}deg) scale(${token.scaleX}, ${token.scaleY})`,
                zIndex: token.zIndex
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                dispatch({ type: 'SELECT_ITEM', payload: { id: token.id, type: 'token' } });
                setDragItem({
                  id: token.id,
                  type: 'token',
                  startX: e.clientX,
                  startY: e.clientY,
                  initialX: token.x,
                  initialY: token.y
                });
              }}
            >
              <div className={`absolute inset-0 transition-all duration-500 pointer-events-none ${token.intelligence ? 'ring-2 ring-green-500/50 rounded-lg shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse' : ''}`} />
              <img 
                src={token.url} 
                alt={token.tag} 
                className="w-full h-full object-contain pointer-events-none"
              />

              {/* Selection Utilities */}
              {state.selection === token.id && (
                <>
                    {/* Resize Handles */}
                    {['tl', 'tr', 'bl', 'br'].map((handle) => (
                      <div 
                        key={handle}
                        className={`absolute w-3 h-3 bg-white border border-blue-500 rounded-full shadow-lg z-50
                          ${handle === 'tl' ? '-top-1.5 -left-1.5 cursor-nwse-resize' : ''}
                          ${handle === 'tr' ? '-top-1.5 -right-1.5 cursor-nesw-resize' : ''}
                          ${handle === 'bl' ? '-bottom-1.5 -left-1.5 cursor-nesw-resize' : ''}
                          ${handle === 'br' ? '-bottom-1.5 -right-1.5 cursor-nwse-resize' : ''}
                        `}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizeItem({
                            id: token.id,
                            type: 'token',
                            handle: handle as any,
                            startX: e.clientX,
                            startY: e.clientY,
                            initialW: token.width,
                            initialH: token.height,
                            initialX: token.x,
                            initialY: token.y,
                            initialScaleX: token.scaleX,
                            initialScaleY: token.scaleY,
                            uniformScale: token.uniformScale,
                            // Pass anchor for resize math
                            anchorX: token.anchorX,
                            anchorY: token.anchorY
                          } as any);
                        }}
                      />
                    ))}
                </>
              )}
               
               {/* Label */}
               <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/60 px-2 py-0.5 rounded text-[8px] text-white uppercase font-bold tracking-wider pointer-events-none transition-opacity ${state.selection === token.id ? 'opacity-100' : 'opacity-0 group-hover/token:opacity-100'}`}>
                 {token.tag}
               </div>
            </div>
          ))}

          {/* Annotations Layer */}
          {state.annotations.map(note => (
             <div
                key={note.id}
                className={`absolute cursor-move group/note ${state.selection === note.id ? 'z-50' : ''}`}
                style={{
                  left: note.x,
                  top: note.y,
                  width: note.width,
                  height: note.height,
                  zIndex: note.zIndex,
                  transform: `rotate(${note.rotation}deg)`
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'SELECT_ITEM', payload: { id: note.id, type: 'annotation' } });
                  setDragItem({
                    id: note.id,
                    type: 'annotation',
                    startX: e.clientX,
                    startY: e.clientY,
                    initialX: note.x,
                    initialY: note.y
                  });
                }}
             >
                {note.type === 'zone' && (
                  <div className="w-full h-full border-4 border-dashed border-blue-500/50 bg-blue-500/10 flex items-center justify-center">
                    <span className="text-blue-500 font-bold uppercase tracking-widest text-[10px] bg-black/50 px-2 py-1 rounded">
                      Active Zone
                    </span>
                  </div>
                )}
                {note.type === 'note' && (
                  <div className="w-full h-full border-2 border-yellow-500/50 bg-yellow-500/20 p-2 overflow-hidden">
                    <p className="text-yellow-200 font-mono text-[10px] whitespace-pre-wrap leading-tight">
                      {note.text || 'New Note'}
                    </p>
                  </div>
                )}
                {note.type === 'arrow' && (
                   <div className="w-full h-full flex items-center justify-center">
                      <MoveUpRight className="w-full h-full text-purple-500 opacity-80" />
                   </div>
                )}

                {/* Selection Helpers */}
                {state.selection === note.id && (
                    <div 
                      className="absolute -right-1 -bottom-1 w-4 h-4 bg-white rounded-full cursor-nwse-resize flex items-center justify-center shadow-lg hover:scale-125 transition-transform"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizeItem({
                          id: note.id,
                          type: 'annotation',
                          handle: 'br',
                          startX: e.clientX,
                          startY: e.clientY,
                          initialW: note.width,
                          initialH: note.height,
                          initialX: note.x,
                          initialY: note.y,
                          initialScaleX: 1, // Annotations don't strictly use scale property for sizing yet, but required by type
                          initialScaleY: 1,
                          uniformScale: false
                        });
                      }}
                    />
                )}
             </div>
          ))}

          {/* Canvas Toolbar (Absolute Bottom Left) */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-[60]">
               <button 
                onClick={() => {
                  const id = `ann-${Date.now()}`;
                  dispatch({ type: 'ADD_ANNOTATION', payload: {
                    id, type: 'note', x: 50, y: 50, width: 150, height: 100, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 10, text: 'New Director Note'
                  }});
                  dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                }}
                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg hover:bg-black transition-colors"
               >
                 <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                   <StickyNote className="w-4 h-4 text-blue-400" />
                 </div>
                 <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-blue-400">Add Note</span>
               </button>
               
               <button 
                onClick={() => {
                  const id = `ann-${Date.now()}`;
                  dispatch({ type: 'ADD_ANNOTATION', payload: {
                    id, type: 'zone', x: 100, y: 100, width: 200, height: 150, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 5
                  }});
                  dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                }}
                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg hover:bg-black transition-colors"
               >
                 <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                   <BoxSelect className="w-4 h-4 text-emerald-400" />
                 </div>
                 <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-emerald-400">Add Zone</span>
               </button>

               <button 
                onClick={() => {
                  const id = `ann-${Date.now()}`;
                  dispatch({ type: 'ADD_ANNOTATION', payload: {
                    id, type: 'arrow', x: 200, y: 200, width: 60, height: 60, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 11
                  }});
                  dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                }}
                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg hover:bg-black transition-colors"
               >
                 <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                   <MoveUpRight className="w-4 h-4 text-purple-400" />
                 </div>
                 <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-purple-400">Add Path</span>
               </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => dispatch({ type: 'CLEAR_STAGE' })}
              className="px-4 py-2 hover:bg-gray-800 text-gray-400 hover:text-white rounded text-[10px] font-bold uppercase transition-colors"
            >
              Reset Stage
            </button>
            <button 
              onClick={downloadCanvas}
              className="bg-yellow-500 hover:bg-yellow-400 text-black px-6 py-2.5 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-yellow-900/20 active:scale-95"
            >
              <MonitorPlay className="w-4 h-4" />
              Capture to Storyboard
            </button>
          </div>
        </div>
      </div>
      {/* 3. RIGHT SIDEBAR: GLOBAL SPECS, ANCHOR, & REFERENCES */}
      <div className="w-[400px] flex flex-col gap-4 overflow-y-auto pl-2 custom-scrollbar">
        
        {/* Stage 01: Canvas Specs */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4">
           <div className="flex items-center justify-between mb-3">
             <div className="flex items-center gap-2">
                 <SettingsIcon className="w-4 h-4 text-gray-500" />
                 <h3 className="text-xs font-bold text-gray-500 uppercase">Canvas Specs</h3>
             </div>
             <div className="flex items-center gap-2 text-[10px] text-gray-600">
               <span className="px-2 py-0.5 rounded bg-black/40 border border-[#27272a]">AR: {state.director.aspectRatio}</span>
               <span className="px-2 py-0.5 rounded bg-black/40 border border-[#27272a]">RES: {state.director.resolution}</span>
             </div>
           </div>

           <div className="grid grid-cols-2 gap-3">
             <Dropdown 
                label="Aspect Ratio" 
                value={state.director.aspectRatio} 
                options={['16:9', '21:9', '3:2', '4:3', '9:16', '1:1', '4:5']} 
                onChange={(v: any) => setDirector({ aspectRatio: v as DirectorAspectRatio })} 
             />
             <Dropdown 
                label="Resolution" 
                value={state.director.resolution} 
                options={['Native 4K', '2K QHD', '1K']} 
                onChange={(v: any) => setDirector({ resolution: v as DirectorResolution })} 
             />
             <Dropdown 
                label="Quality Mode" 
                value={state.director.qualityMode} 
                options={['Standard', 'Raw Uncompressed', '3D Render', 'Stylized']} 
                onChange={(v: any) => setDirector({ qualityMode: v as DirectorQualityMode })} 
             />
             <Dropdown 
                label="Safety" 
                value={state.director.safety} 
                options={['Standard', 'Strict']} 
                onChange={(v: any) => setDirector({ safety: v as DirectorSafety })} 
             />
           </div>
        </div>

        {/* Stage 01.5: Anchor Scene & Intelligence */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4">
           <div className="flex items-center justify-between mb-3">
             <div className="flex items-center gap-2">
                 <ImageIcon className="w-4 h-4 text-gray-500" />
                 <h3 className="text-xs font-bold text-gray-500 uppercase">Anchor Scene</h3>
             </div>
             <span className={`text-[10px] font-mono ${anchorStatus === 'ready' ? 'text-green-500' : anchorStatus === 'analyzing' ? 'text-yellow-500' : anchorStatus === 'error' ? 'text-red-500' : 'text-gray-600'}`}>
               {anchorStatus.toUpperCase()}
             </span>
           </div>
           
           <div className="flex gap-3 mb-3">
             <div className="w-[100px] aspect-video bg-black rounded-lg border border-[#27272a] overflow-hidden relative group">
               {state.backgroundUrl ? (
                 <img src={state.backgroundUrl} className="w-full h-full object-cover opacity-90" alt="Anchor" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-gray-700">
                   <ImageIcon className="w-6 h-6 opacity-50" />
                 </div>
               )}
               <button
                 className="absolute inset-0 flex flex-col items-center justify-center text-[9px] font-bold text-gray-200 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider"
                 onClick={() => anchorFileInputRef.current?.click()}
               >
                 <UploadIcon className="w-4 h-4 mb-1" />
                 Upload
               </button>
               <input
                 ref={anchorFileInputRef}
                 type="file"
                 className="hidden"
                 accept="image/*"
                 onChange={async (e) => {
                   const file = e.target.files?.[0];
                   if (file) {
                      const url = await fileToDataUrl(file);
                      dispatch({ type: 'SET_BG', payload: url });
                   } 
                   e.currentTarget.value = '';
                 }}
               />
             </div>
             
             <div className="flex-1 flex flex-col gap-2">
                 <div className={`flex-1 bg-black/40 border border-[#27272a] rounded p-2 font-mono text-[10px] leading-tight ${anchorStatus === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                   {anchorMessage}
                 </div>
                 <button
                   onClick={analyzeAnchorDNA}
                   disabled={!state.backgroundUrl || !state.apiKey || anchorStatus === 'analyzing'}
                   className="w-full bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-gray-300 hover:text-white text-[9px] py-1.5 rounded font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                 >
                   {anchorStatus === 'analyzing' ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                   Extract DNA
                 </button>
             </div>
           </div>

           {/* Generator (Keep existing functionality, just moved) */}
            <div className="pt-3 border-t border-[#27272a]">
                <div className="flex gap-2">
                    <textarea 
                        className="flex-1 bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[10px] text-gray-300 resize-none focus:border-blue-500 outline-none"
                        placeholder="Or generate new anchor scene..."
                        rows={1}
                        value={bgPrompt}
                        onChange={(e) => setBgPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                generateBg();
                            }
                        }}
                    />
                    <button 
                        onClick={generateBg}
                        disabled={state.isProcessing || !bgPrompt.trim()}
                        className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded flex items-center justify-center disabled:opacity-50 disabled:bg-gray-800"
                        title="Generate Background"
                    >
                        {state.isProcessing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <MaximizeIcon className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>
             {/* Merge Strategy (New) */}
             <div className="mt-3 pt-3 border-t border-[#27272a] mb-3">
                  <Dropdown 
                      label="Merge Strategy" 
                      value={state.director.mergeStrategy} 
                      options={['Character Identity', 'Style Transfer', 'Composition Reference', 'Photo Merge']} 
                      onChange={(v: any) => setDirector({ mergeStrategy: v as DirectorMergeStrategy })} 
                  />
                 </div>
                 
                 {/* RESTORED: Reference Replacement Logic & Negative Prompt */}
                 <div className="pt-4 border-t border-[#27272a] space-y-4">
                    
                    {/* Global Replace Toggle */}
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2">
                           <div className={`w-3 h-3 rounded border ${state.director.replaceAnchorSubjects ? 'bg-yellow-500 border-yellow-500' : 'border-gray-600'} flex items-center justify-center cursor-pointer transition-colors`} onClick={() => setDirector({ replaceAnchorSubjects: !state.director.replaceAnchorSubjects })}>
                              {state.director.replaceAnchorSubjects && <div className="w-1.5 h-1.5 bg-black rounded-[1px]" />}
                           </div>
                           Replace Anchor Subjects
                        </label>
                        {state.director.replaceAnchorSubjects && (
                            <button 
                                onClick={() => setDirector({ globalReplaceTarget: '' })}
                                className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[9px] text-gray-400 uppercase font-bold"
                            >
                                Wipe
                            </button>
                        )}
                    </div>

                    {/* Global Replace Input */}
                    {state.director.replaceAnchorSubjects && (
                        <div className="animate-in slide-in-from-top-2 duration-200 space-y-1">
                            <label className="text-[9px] text-gray-500">Global Replace Target</label>
                            <input 
                                type="text"
                                className="w-full bg-[#18181b] border border-[#27272a] text-xs text-yellow-500 p-2 rounded focus:border-yellow-500 outline-none placeholder:text-gray-700"
                                placeholder="e.g. 'the actor in the center'"
                                value={state.director.globalReplaceTarget || ''}
                                onChange={(e) => setDirector({ globalReplaceTarget: e.target.value })}
                            />
                            <p className="text-[9px] text-gray-600 italic">Per-slot targets override the global target.</p>
                        </div>
                    )}

                    {/* Negative Prompt */}
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Negative Prompt (Exclusions)</label>
                        <textarea 
                            className="w-full bg-[#18181b] border border-[#27272a] text-[10px] text-gray-400 p-2 rounded focus:border-red-500/50 outline-none resize-none leading-relaxed custom-scrollbar"
                            rows={4}
                            value={state.director.negativePrompt}
                            onChange={(e) => setDirector({ negativePrompt: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            {['+ Anatomy', '+ Quality', '+ Details', '+ Photo'].map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => {
                                        // Simple append logic purely for UI demo, real usage might be more sophisticated
                                        // But for now, just appending "bad anatomy" etc based on tag? 
                                        // User didn't specify exact mapping, so I'll just leave it as a placeholder or append the tag text itself if that was the intent.
                                        // Actually let's map them to common negative embeddings/terms
                                        let term = '';
                                        if (tag === '+ Anatomy') term = 'bad anatomy, bad proportions, extra limbs, missing limbs, fused fingers, too many fingers';
                                        if (tag === '+ Quality') term = 'worst quality, low quality, normal quality, lowres, artifacting';
                                        if (tag === '+ Details') term = 'blurry, blurry background, bokeh, depth of field';
                                        if (tag === '+ Photo') term = 'sketch, painting, drawing, illustration, anime';
                                        
                                        const current = state.director.negativePrompt;
                                        setDirector({ negativePrompt: current ? `${current}, ${term}` : term });
                                    }}
                                    className="bg-[#18181b] border border-[#27272a] hover:bg-gray-800 text-gray-500 hover:text-gray-300 text-[9px] py-1.5 rounded uppercase font-bold transition-colors"
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scene Lock */}
                    <div className="flex items-center gap-2 pt-2">
                         <div className={`w-3 h-3 rounded border ${state.director.sceneLock ? 'bg-red-500 border-red-500' : 'border-gray-600'} flex items-center justify-center cursor-pointer transition-colors`} onClick={() => setDirector({ sceneLock: !state.director.sceneLock })}>
                              {state.director.sceneLock && <div className="w-1.5 h-1.5 bg-white rounded-[1px]" />}
                         </div>
                         <label className="text-[10px] uppercase font-bold text-gray-400 cursor-pointer" onClick={() => setDirector({ sceneLock: !state.director.sceneLock })}>
                            Lock Scene
                         </label>
                         <span className="text-[9px] text-gray-600 ml-auto">(Prompt-level)</span>
                    </div>

                 </div>

             </div>


             {/* v3 Prompt Terminal (Keep existing logic) */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 shadow-xl flex flex-col shrink-0">
           <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <RotateCw className="w-4 h-4 text-yellow-500" />
                </div>
                <h3 className="text-xs font-bold text-white uppercase tracking-widest">Reference Stacks</h3>
              </div>
              <button 
                onClick={() => dispatch({ type: 'CLEAR_REF_SLOTS' })}
                className="text-[10px] text-gray-500 hover:text-red-400 font-bold uppercase"
              >
                Clear All
              </button>
           </div>

           <div className="grid grid-cols-2 gap-3 mb-6">
             {state.referenceSlots.map((slot) => (
                <div 
                  key={slot.index}
                  onClick={() => handleRefSlotClick(slot.index)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverRefSlot(slot.index); }}
                  onDragLeave={() => setDragOverRefSlot(null)}
                  onDrop={(e) => handleRefSlotDrop(slot.index, e)}
                  className={`relative aspect-square rounded-lg border-2 transition-all cursor-pointer overflow-hidden ${slot.active ? 'border-yellow-500 shadow-lg shadow-yellow-900/20' : 'border-[#27272a] opacity-60 hover:opacity-100'} ${dragOverRefSlot === slot.index ? 'border-blue-500 bg-blue-500/10 scale-95' : ''}`}
                >
                  {slot.url ? (
                    <>
                      <img src={slot.url} alt={`Ref ${slot.index}`} className="w-full h-full object-contain" />
                      {!slot.active && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-500" /></div>}
                      <div className="absolute bottom-1 right-1 flex flex-col gap-1">
                         <button 
                            onClick={(e) => { e.stopPropagation(); setInspectRefIndex(slot.index); }}
                            className="p-1 bg-black/60 hover:bg-black rounded text-white transition-colors"
                         >
                            <Pencil className="w-2.5 h-2.5" />
                         </button>
                         <button 
                            onClick={(e) => { e.stopPropagation(); clearRefSlot(slot.index); }}
                            className="p-1 bg-black/60 hover:bg-red-500 rounded text-white transition-colors"
                         >
                            <X className="w-2.5 h-2.5" />
                         </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#18181b]">
                      <span className="text-[12px] font-bold text-gray-700">{slot.index}</span>
                      <Upload className="w-3 h-3 text-gray-700" />
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={el => { refFileInputs.current[slot.index] = el; }}

                    className="hidden" 
                    onChange={(e) => e.target.files?.[0] && handleRefSlotFile(slot.index, e.target.files[0])}
                  />
                </div>
             ))}
           </div>

           {/* Actor Intelligence List */}
           <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-3 h-3 text-blue-400" />
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Actor Intelligence</h4>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                {state.tokens.length === 0 ? (
                  <div className="text-[10px] text-gray-600 italic py-4 border border-dashed border-gray-800 rounded-lg text-center">
                    No actors on stage.
                  </div>
                ) : (
                  state.tokens.map(token => (
                    <div key={token.id} className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 group">
                       <div className="flex items-center justify-between mb-2">
                         <span className="text-[10px] font-bold text-white uppercase">{token.tag}</span>
                         <button 
                          onClick={async () => {
                            if (!state.apiKey) {
                                dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for Auto Analyze.", type: 'error' } });
                                return;
                            }
                            setAnalyzingTokenId(token.id);
                            try {
                              const intelligence = await GeminiService.analyzeImage(
                                "Describe this character's pose, expression, and physical action in this scene context. Be very specific about lighting interaction. Max 30 words.",
                                state.apiKey, state.model, token.url
                              );
                              dispatch({ type: 'UPDATE_TOKEN', payload: { id: token.id, intelligence } });
                            } catch { /* error handled by UI state */ }
                            setAnalyzingTokenId(null);
                          }}
                          disabled={analyzingTokenId === token.id}
                          className="text-[9px] text-blue-400 hover:text-blue-300 font-bold uppercase flex items-center gap-1"
                         >
                           {analyzingTokenId === token.id ? <RefreshCcw className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                           Auto Analyze
                         </button>
                       </div>
                       <textarea 
                         value={token.intelligence || ''}
                         onChange={(e) => dispatch({ type: 'UPDATE_TOKEN', payload: { id: token.id, intelligence: e.target.value } })}
                         className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-[10px] text-gray-400 focus:border-blue-500 outline-none resize-none"
                         rows={2}
                         placeholder="Pose, Action, Lighting DNA..."
                       />
                    </div>
                  ))
                )}
              </div>
           </div>

           {/* V3 Prompt Terminal */}
           <div className="mt-6 pt-6 border-t border-[#27272a]">
              <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center gap-2">
                    <MonitorPlay className="w-3 h-3 text-emerald-400" />
                    <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Prompt Powerhouse</h4>
                 </div>
                 <button 
                  onClick={handleCopyDirectorPrompt}
                  className="p-1.5 hover:bg-white/5 rounded transition-colors text-white/40 hover:text-white"
                  title="Copy Prompt"
                 >
                    <Download className="w-3.5 h-3.5" />
                 </button>
              </div>
              <div className="relative group">
                <div className="absolute inset-0 bg-emerald-500/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-3 h-32 overflow-y-auto custom-scrollbar font-mono text-[9px] text-emerald-500/80 leading-relaxed whitespace-pre-wrap">
                  {v3DirectorPrompt || '// Cinematic stage is empty.'}
                </div>
              </div>
           </div>
        </div>

        {/* Stage 03: Scene Director */}
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-4 shrink-0">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clapperboard className="w-4 h-4 text-gray-500" />
                    <h3 className="text-xs font-bold text-gray-500 uppercase">Scene Director</h3>
                </div>
                {state.director.envAuto && <span className="text-[9px] text-yellow-500 font-mono uppercase border border-yellow-500/30 px-1 rounded">Env Auto</span>}
             </div>

             <PropertyField 
                label="Subject / Action" 
                value={state.director.subject} 
                onChange={(v: any) => setDirector({ subject: v })} 
                placeholder="Describe the main action..."
                type="textarea"
             />

             <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Environment</label>
                    {state.director.envAuto && (
                        <button onClick={() => setDirector({ envAuto: false })} className="text-[9px] text-gray-500 hover:text-gray-300 uppercase">Unlock</button>
                    )}
                </div>
                <textarea 
                  className={`w-full bg-[#18181b] border rounded px-2 py-2 text-xs text-white h-12 resize-none outline-none ${state.director.envAuto ? 'border-yellow-500/50 text-gray-400' : 'border-[#27272a] focus:border-yellow-500'}`}
                  value={state.director.environment}
                  onChange={(e) => setDirector({ environment: e.target.value, envAuto: false })}
                  readOnly={state.director.envAuto}
                />
             </div>

             <div className="grid grid-cols-2 gap-3">
                 <PropertyField label="Lighting" value={state.director.lighting} onChange={(v: any) => setDirector({ lighting: v })} />
                 <PropertyField label="Camera" value={state.director.camera} onChange={(v: any) => setDirector({ camera: v })} />
             </div>

             <div className="grid grid-cols-2 gap-3">
                 <Dropdown 
                    label="Layout" 
                    value={state.director.spatialLayout} 
                    options={['', 'horizontal', 'vertical', 'depth', 'center']} 
                    onChange={(v: any) => setDirector({ spatialLayout: v as DirectorSpatialLayout })} 
                 />
                 <Dropdown 
                    label="Markers" 
                    value={state.director.markerType} 
                    options={['', 'Colored Bounding Boxes', 'Hand-Drawn Circles', 'Directional Arrows']} 
                    onChange={(v: any) => setDirector({ markerType: v as DirectorMarkerType })} 
                 />
             </div>
        </div>

      </div>

      {/* Reference Inspector Modal */}
      {inspectRefIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/90 backdrop-blur-sm">
          <div className="bg-[#09090b] border border-[#27272a] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Image Preview */}
            <div className="flex-1 bg-black flex items-center justify-center p-8 relative">
               <img 
                src={state.referenceSlots.find(s => s.index === inspectRefIndex)?.url} 
                alt="Inspector Preview" 
                className="max-w-full max-h-full object-contain shadow-2xl"
               />
               <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-yellow-500 text-black text-[10px] font-bold rounded-full uppercase tracking-widest">
                    Reference Slot {inspectRefIndex}
                  </div>
               </div>
            </div>

            {/* Metadata Editor */}
            <div className="w-[400px] border-l border-[#27272a] flex flex-col p-8 bg-[#09090b]">
               <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-bold text-white uppercase tracking-[0.2em]">Reference DNA</h3>
                  <button 
                    onClick={() => setInspectRefIndex(null)}
                    className="p-2 hover:bg-white/5 rounded-full text-gray-500 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <PropertyField 
                    label="Alias / Identity" 
                    value={inspectName} 
                    onChange={setInspectName} 
                    placeholder="e.g. Hero Protagonist"
                  />
                  <PropertyField 
                    label="Subject & Style Analysis" 
                    type="textarea"
                    value={inspectAnalysis} 
                    onChange={setInspectAnalysis} 
                    placeholder="AI analysis will appear here..."
                  />
                  
                  <div className="pt-4 border-t border-[#27272a]">
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2">
                        <Link2 className="w-3 h-3 text-blue-500" /> Subject Replacement
                      </label>
                      <div 
                        onClick={() => toggleReplaceMode(!state.director.replaceAnchorSubjects)}
                        className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${state.director.replaceAnchorSubjects ? 'bg-blue-600' : 'bg-gray-800'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${state.director.replaceAnchorSubjects ? 'left-6' : 'left-1'}`} />
                      </div>
                    </div>
                    {state.director.replaceAnchorSubjects && (
                      <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <PropertyField 
                          label="Target in Anchor Scene" 
                          value={inspectTarget} 
                          onChange={setInspectTarget} 
                          placeholder="e.g. the man on the bench"
                        />
                        <p className="text-[9px] text-gray-500 italic leading-relaxed">
                          This character identity will precisely replace the target subject identified in the anchor scene.
                        </p>
                      </div>
                    )}
                  </div>
               </div>

               <div className="pt-8 flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      updateRefSlot(inspectRefIndex, {
                        name: inspectName,
                        analysis: inspectAnalysis,
                        target: inspectTarget || undefined
                      });
                      setInspectRefIndex(null);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/40"
                  >
                    Save DNA Changes
                  </button>
                  <button 
                    onClick={() => setInspectRefIndex(null)}
                    className="w-full bg-transparent hover:bg-white/5 text-gray-400 font-bold py-3 rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SceneCanvas;
