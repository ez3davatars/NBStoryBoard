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
  FlipVertical,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowUpToLine,
  ArrowDownToLine,
  GripVertical,
  Pipette,
  Undo,
  Redo,
  Copy,
  Eye,
  EyeOff,
  ChevronDown,
  Film,
  Grid,
  Lock
} from 'lucide-react';






import { useAppContext } from '../context/AppContext';
import type {
  DirectorSettings,
  DirectorAspectRatio,

  DirectorMergeStrategy,
  DirectorSpatialLayout,
  ReferenceSlot,
  CastMember,
  StageToken
} from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import {
  compileV3DirectorPrompt,

} from '../utils/promptHelpers';
import HelpTooltip from './ui/HelpTooltip';
// --- HELPER FUNCTIONS ---
const DebouncedHueSlider = ({ color, onChange }: { color: string, onChange: (color: string) => void }) => {
  // Initialize ONLY on mount or when external color changes significantly (if needed)
  // But to avoid "lag" from external updates while dragging, we prefer internal state.
  const [localHue, setLocalHue] = useState(HexToHSL(color).h);

  // Ref to hold the latest onChange to call it without effect dependencies
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Ref to debounce
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Determine if we should sync from prop (only if not dragging?)
    // For simplicity, we just sync when prop changes IF it doesn't match our HSL approx.
    const propHue = HexToHSL(color).h;
    if (Math.abs(propHue - localHue) > 5) {
      setLocalHue(propHue);
    }
  }, [color]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseInt(e.target.value);
    setLocalHue(newHue); // Instant UI update for the slider handle

    // Debounce the heavy global dispatch
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      const currentHSL = HexToHSL(color);
      const newHex = HSLToHex(newHue, currentHSL.s, currentHSL.l);
      onChangeRef.current(newHex);
    }, 100); // 100ms throttle
  };

  return (
    <input
      type="range" min="0" max="360" step="1"
      value={localHue}
      onChange={handleChange}
      className="w-full h-2 rounded-lg appearance-none cursor-pointer"
      style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
    />
  );
};
const MemoizedDebouncedHueSlider = React.memo(DebouncedHueSlider);
// Helper to get hex from HSL
const HSLToHex = (h: number, s: number, l: number) => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
};

// Helper to get HSL from Hex
const HexToHSL = (hex: string) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt('0x' + hex[1] + hex[1]);
    g = parseInt('0x' + hex[2] + hex[2]);
    b = parseInt('0x' + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = parseInt('0x' + hex[1] + hex[2]);
    g = parseInt('0x' + hex[3] + hex[4]);
    b = parseInt('0x' + hex[5] + hex[6]);
  }
  r /= 255;
  g /= 255;
  b /= 255;
  const cmin = Math.min(r, g, b),
    cmax = Math.max(r, g, b),
    delta = cmax - cmin;
  let h = 0, s = 0, l = 0;

  if (delta === 0) h = 0;
  else if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;
  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return { h, s, l };
};

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

const SidebarPanel = ({ id, title, icon: Icon, children, collapsed, onToggle, onDragStart, onDrop, isMaskMode, headerColor = "text-gray-500", rightElement, draggable = true }: any) => {
  const isRegionActive = title === 'Region Edit' && isMaskMode;
  const activeBg = isRegionActive ? 'bg-green-500 text-black hover:bg-green-400' : '';

  // Icon gets the color, text remains neutral unless active mask mode
  const iconStyle = isRegionActive ? 'text-black' : headerColor;
  const titleStyle = isRegionActive ? 'text-black' : 'text-gray-400';
  const chevronStyle = isRegionActive ? 'text-black' : 'text-gray-600';
  const gripStyle = isRegionActive ? 'text-black/50' : headerColor;

  return (
    <div
      onDragOver={(e) => {
        if (draggable) e.preventDefault();
      }}
      onDrop={(e) => {
        if (draggable) {
          e.preventDefault();
          onDrop && onDrop(id);
        }
      }}
      className={`border border-[#27272a] rounded-xl overflow-hidden transition-all duration-300 ${collapsed ? 'h-[42px]' : 'bg-[#09090b]/80 backdrop-blur-md'}`}
    >
      <div
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData('panelId', id);
          onDragStart && onDragStart(id);
        }}
        onClick={() => onToggle && onToggle(id)}
        className={`flex items-center justify-between p-3 cursor-pointer select-none hover:bg-white/5 transition-colors ${activeBg}`}
      >
        <div className="flex items-center gap-2">
          {draggable && <GripVertical className={`w-3 h-3 ${gripStyle} opacity-50 cursor-grab active:cursor-grabbing`} />}
          {Icon && <Icon className={`w-3.5 h-3.5 ${iconStyle}`} />}
          <span className={`text-[10px] font-bold uppercase tracking-widest ${titleStyle}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {rightElement}
          <div className={`${collapsed ? '-rotate-90' : ''} transition-transform duration-300`}>
            <ChevronDown className={`w-3 h-3 ${chevronStyle}`} />
          </div>
        </div>
      </div>
      {!collapsed && (
        <div className="p-3 border-t border-[#27272a]">
          {children}
        </div>
      )}
    </div>
  );
};

// B. Scene Blocking Component
const SceneCanvas = () => {
  const { state, dispatch } = useAppContext();
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Camera Gate: an inner viewport that always matches the selected aspect ratio.
  // All staging (tokens, notes, masks) must live inside this gate to guarantee WYSIWYG export.
  const [viewportBox, setViewportBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 1,
    h: 1
  });

  const parseAspectRatioToNumber = (ar: DirectorAspectRatio | string | undefined): number => {
    const raw = String(ar || '16:9');
    const parts = raw.split(':').map((p) => Number(p));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[1] !== 0) {
      return parts[0] / parts[1];
    }
    return 16 / 9;
  };

  // Keep the camera gate centered and sized correctly even when the stage container changes.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      const cw = Math.max(1, stage.clientWidth);
      const ch = Math.max(1, stage.clientHeight);
      const ratio = parseAspectRatioToNumber(state.director.aspectRatio);

      let w = cw;
      let h = w / ratio;

      if (h > ch) {
        h = ch;
        w = h * ratio;
      }

      const x = (cw - w) / 2;
      const y = (ch - h) / 2;

      setViewportBox((prev) => {
        const changed =
          prev.x !== x || prev.y !== y || prev.w !== w || prev.h !== h;
        return changed ? { x, y, w, h } : prev;
      });
    };

    update();
    const obs = new ResizeObserver(update);
    obs.observe(stage);
    return () => obs.disconnect();
  }, [state.director.aspectRatio]);

  // Keyboard Shortcuts (Global)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // (Keep existing keyboard logic...)
      if (
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'TEXTAREA' ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selection) {
          e.preventDefault();
          if (state.selectionType === 'token') dispatch({ type: 'REMOVE_TOKEN', payload: state.selection });
          else dispatch({ type: 'REMOVE_ANNOTATION', payload: state.selection });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selection, state.selectionType, dispatch]);

  // --- SIDEBAR STATE ---
  const [panelOrder, setPanelOrder] = useState<string[]>(['specs', 'anchor', 'layers', 'ref_stacks', 'region_edit', 'scene_director']);

  // Use global panel state from AppContext to persist during navigation
  const collapsedPanels = (state as any).stagePanelState || {
    'ref_stacks': true,
    'region_edit': true,
    'stage-layers': true,
    'specs': true,
    'anchor': true,
    'scene_director': true
  };
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);



  const togglePanel = (id: string) => {
    dispatch({
      type: 'SET_STAGE_PANEL_STATE',
      payload: { id, isOpen: !collapsedPanels[id] }
    } as any);
  };

  const handlePanelDrop = (targetId: string) => {
    if (!draggedPanelId || draggedPanelId === targetId) return;
    const newOrder = [...panelOrder];
    const fromIndex = newOrder.indexOf(draggedPanelId);
    const toIndex = newOrder.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedPanelId);
    setPanelOrder(newOrder);
    setDraggedPanelId(null);
  };


  // Region Edit Job Runner (Cancel/Status)
  const [isRegionEditRunning, setIsRegionEditRunning] = useState(false);
  const cancelRegionEditRef = useRef(false);

  const requestCancelRegionEdit = () => {
    cancelRegionEditRef.current = true;
    dispatch({
      type: 'ADD_LOG',
      payload: {
        type: 'info',
        message: 'Cancel requested. The current layer will finish, then the queue will stop.',
      },
    });
  };



  // UNDO/REDO keybinds (Ctrl/Cmd+Z, Ctrl/Cmd+Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable;
      if (inField) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' } as any);
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        dispatch({ type: 'REDO' } as any);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // CLEANUP: Clear masks when leaving Staging to prevent bleed
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      dispatch({ type: 'CLEAR_ALL_REGION_MASKS' });
      dispatch({ type: 'SET_REGION_PROTECT_MASK', payload: { maskDataUrl: null } });
    };
  }, [dispatch]);
  // DRAG STATE FOR CANVAS ITEMS
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const [lastCustomColor, setLastCustomColor] = useState('#ffffff');
  const [showColorEditor, setShowColorEditor] = useState(false);


  const [dragItem, setDragItem] = useState<{ id: string, type: 'token' | 'annotation', startX: number, startY: number, initialX: number, initialY: number } | null>(null);
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
    uniformScale?: boolean,
    anchorX?: number,
    anchorY?: number
  } | null>(null);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [rotateItem, setRotateItem] = useState<{
    id: string,
    type: 'token' | 'annotation',
    centerX: number,
    centerY: number,
    startAngle: number,
    initialRotation: number
  } | null>(null);

  // --- V3-STYLE REFERENCE STACK (integrated) ---
  const refFileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [bgPrompt, setBgPrompt] = useState('');
  // --- SHOTS (Storyboard) ---
  // Shots live in AppContext so SceneCanvas / Veo / Production stay in sync.
  const [newShotName, setNewShotName] = useState('');
  const [activeShotNameDraft, setActiveShotNameDraft] = useState('');

  const shots = (state as any).shots as any[] | undefined;
  const activeShotId = (state as any).activeShotId as string | null | undefined;
  const activeShot = shots?.find(s => s.id === activeShotId) || null;

  useEffect(() => {
    setActiveShotNameDraft(activeShot?.name || '');
  }, [activeShotId]);


  // --- REGION EDIT (Mask / Brush) ---
  const regionEdit = (state as any).regionEdit as any;
  const activeLayer = regionEdit?.layers?.find((l: any) => l.id === regionEdit.activeLayerId) || regionEdit?.layers?.[0] || null;

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskIsDownRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  // --- PROTECTION MASK (Face / Hair / Subject lock) ---
  const [protectEnabled, setProtectEnabled] = useState(true);
  const [protectMaskUrl, setProtectMaskUrl] = useState<string | null>(null);
  const [rawProtectMaskUrl, setRawProtectMaskUrl] = useState<string | null>(null);
  const [protectErosion, setProtectErosion] = useState(0);
  const [protectStatus, setProtectStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');

  const loadDataUrlImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  // Erode (shrink) a white mask by radius pixels
  const erodeMask = async (srcUrl: string, radius: number): Promise<string> => {
    if (radius === 0) return srcUrl;

    const img = await loadDataUrlImage(srcUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return srcUrl;

    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    const w = canvas.width;
    const h = canvas.height;
    const result = new Uint8ClampedArray(d);

    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        const idx = (y * w + x) * 4;
        let minVal = 255;
        // Search neighborhood
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const nIdx = ((y + ky) * w + (x + kx)) * 4;
            // Use Red channel as luminance
            if (d[nIdx] < minVal) minVal = d[nIdx];
            if (minVal === 0) break;
          }
          if (minVal === 0) break;
        }
        result[idx] = result[idx + 1] = result[idx + 2] = minVal;
      }
    }

    const newId = new ImageData(result, w, h);
    ctx.putImageData(newId, 0, 0);
    return canvas.toDataURL();
  };

  useEffect(() => {
    if (rawProtectMaskUrl) {
      if (protectErosion === 0) {
        setProtectMaskUrl(rawProtectMaskUrl);
      } else {
        const timer = setTimeout(() => {
          erodeMask(rawProtectMaskUrl, protectErosion).then(setProtectMaskUrl);
        }, 300); // Debounce slider
        return () => clearTimeout(timer);
      }
    }
  }, [rawProtectMaskUrl, protectErosion]);

  // Subtract a protection mask (white = protected) from an edit mask (white = edit)
  const subtractProtectionMask = async (editMask: string, protectionMask: string): Promise<string> => {
    const editImg = await loadDataUrlImage(editMask);
    const protImg = await loadDataUrlImage(protectionMask);

    const w = Math.max(editImg.width, protImg.width) || 1;
    const h = Math.max(editImg.height, protImg.height) || 1;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return editMask;

    // Draw edit mask
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(editImg, 0, 0, w, h);
    const editData = ctx.getImageData(0, 0, w, h);

    // Draw protection mask
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(protImg, 0, 0, w, h);
    const protData = ctx.getImageData(0, 0, w, h);

    const ed = editData.data;
    const pd = protData.data;

    // If protection pixel is "white enough", erase edit pixel
    for (let i = 0; i < ed.length; i += 4) {
      const protLum = (pd[i] + pd[i + 1] + pd[i + 2]) / 3;
      if (protLum > 128) {
        ed[i] = 0; ed[i + 1] = 0; ed[i + 2] = 0; ed[i + 3] = 255;
      }
    }

    ctx.putImageData(editData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  const generateFaceProtectionMask = async () => {
    if (!state.apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for protection mask.', type: 'error' } } as any);
      return;
    }
    setProtectStatus('generating');
    try {
      const captured = await captureStage();
      if (!captured) throw new Error('Stage capture returned empty.');

      // Pick a Gemini image model for mask generation
      const maskModel = (state.model && String(state.model).includes('gemini')) ? state.model : 'gemini-2.5-flash-image';

      const prompt =
        "FACE + HAIR PROTECTION MASK: Create a pure black & white segmentation mask where ONLY the subject's face and hair are PURE WHITE (#FFFFFF). Everything else MUST be PURE BLACK (#000000). No gray. No gradients. No background. Use clean edges.";

      const res = await GeminiService.generateImage(
        prompt,
        state.apiKey,
        maskModel as any,
        [{ url: captured, label: 'Base Frame' }],
        { aspectRatio: state.director.aspectRatio }
      );

      setRawProtectMaskUrl(res);
      setProtectMaskUrl(res); // Initial set (erosion 0)
      setProtectStatus('ready');
      dispatch({ type: 'ADD_LOG', payload: { message: 'Protection mask generated (face/hair).', type: 'success' } } as any);
    } catch (e: any) {
      setProtectStatus('error');
      dispatch({ type: 'ADD_LOG', payload: { message: `Protection mask failed: ${e?.message || e}`, type: 'error' } } as any);
    }
  };

  const ensureMaskCanvasSize = () => {
    const canvas = maskCanvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const w = Math.max(1, Math.floor(viewport.clientWidth));
    const h = Math.max(1, Math.floor(viewport.clientHeight));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      // fill black base
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, w, h);
      }
      // reload active layer mask if exists
      if (activeLayer?.maskDataUrl) {
        void loadMaskToCanvas(activeLayer.maskDataUrl);
      }
    }
  };

  const loadMaskToCanvas = async (dataUrl: string) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // ensure black background
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  };

  const commitMaskToState = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !activeLayer) return;
    const dataUrl = canvas.toDataURL('image/png');
    dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: activeLayer.id, updates: { maskDataUrl: dataUrl } } } as any);
  };

  useEffect(() => {
    // keep canvas sized and synced when toggling mask mode or switching layers
    ensureMaskCanvasSize();
    if (activeLayer?.maskDataUrl) {
      void loadMaskToCanvas(activeLayer.maskDataUrl);
    } else {
      // clear to black
      const c = maskCanvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, c.width, c.height);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionEdit?.isMaskMode, regionEdit?.activeLayerId, viewportBox.w, viewportBox.h, activeLayer?.maskDataUrl]);

  useEffect(() => {
    const onResize = () => ensureMaskCanvasSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCanvasPoint = (e: React.PointerEvent) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const brushSize = Number(regionEdit?.brushSize ?? 40);
    const softness = Math.min(1, Math.max(0, Number(regionEdit?.brushSoftness ?? 0.35)));

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;

    const isErase = regionEdit?.mode === 'erase';
    const color = isErase ? 'black' : 'white';

    // soft edge via shadow blur
    ctx.shadowBlur = brushSize * softness;
    ctx.shadowColor = color;

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  };

  const handleMaskPointerDown = (e: React.PointerEvent) => {
    if (!regionEdit?.isMaskMode) return;
    e.preventDefault();
    e.stopPropagation();
    ensureMaskCanvasSize();
    maskIsDownRef.current = true;
    const pt = getCanvasPoint(e);
    lastPtRef.current = pt;
    // dot
    drawStroke(pt, pt);
  };

  const handleMaskPointerMove = (e: React.PointerEvent) => {
    if (!regionEdit?.isMaskMode) return;
    if (!maskIsDownRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = getCanvasPoint(e);
    const last = lastPtRef.current || pt;
    drawStroke(last, pt);
    lastPtRef.current = pt;
  };

  const handleMaskPointerUp = (e: React.PointerEvent) => {
    if (!regionEdit?.isMaskMode) return;
    if (!maskIsDownRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    maskIsDownRef.current = false;
    lastPtRef.current = null;
    commitMaskToState();
  };

  const clearActiveMask = () => {
    if (!activeLayer) return;
    dispatch({ type: 'CLEAR_REGION_LAYER_MASK', payload: { id: activeLayer.id } } as any);
    const c = maskCanvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, c.width, c.height);
    }
  };

  const applyRegionEditQueue = async () => {
    if (!state.apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for Region Edit.', type: 'error' } } as any);
      return;
    }
    if (!regionEdit?.layers?.some((l: any) => l.enabled && l.maskDataUrl && (l.prompt || '').trim())) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'No enabled mask layers with both mask + prompt.', type: 'error' } } as any);
      return;
    }

    cancelRegionEditRef.current = false;
    setIsRegionEditRunning(true);
    dispatch({ type: 'SET_PROCESSING', payload: true } as any);
    try {
      const editModel = state.model === 'imagen-4.0-generate-001' ? 'gemini-2.5-flash-image' : state.model;

      const captured = await captureStage();
      if (!captured) throw new Error('Stage capture returned empty.');

      let base: string = captured;

      const layers = (regionEdit.layers as any[]).filter((l: any) => l.enabled);

      // mark queued
      for (const layer of layers) {
        if (cancelRegionEditRef.current) {
          dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit cancelled.', type: 'info' } } as any);
          break;
        }
        dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'running', lastError: null } } } as any);
        dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'queued', lastError: null } } } as any);
      }

      for (const layer of layers) {
        if (cancelRegionEditRef.current) {
          dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit cancelled.', type: 'info' } } as any);
          break;
        }
        dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'running', lastError: null } } } as any);
        const mask: string | null = layer.maskDataUrl ?? null;
        const promptText: string = String(layer.prompt || '').trim();
        if (!mask || !promptText) {
          dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'idle' } } } as any);
          continue;
        }

        dispatch({ type: 'ADD_LOG', payload: { message: `Applying ${layer.name}...`, type: 'info' } } as any);

        let maskToSend: string = mask;
        if (protectEnabled && protectMaskUrl) {
          maskToSend = await subtractProtectionMask(mask, protectMaskUrl);
        }

        base = await GeminiService.editImageWithMask(
          base,
          maskToSend,
          promptText,
          state.apiKey,
          editModel,
          [],
          { aspectRatio: state.director.aspectRatio }
        );
      }

      dispatch({ type: 'SET_RESULT_IMAGE', payload: base } as any);
      dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit complete.', type: 'success' } } as any);
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Region Edit failed: ${e?.message || e}`, type: 'error' } } as any);
    } finally {
      setIsRegionEditRunning(false);
      dispatch({ type: 'SET_PROCESSING', payload: false } as any);
    }
  };

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



  const anchorFileInputRef = useRef<HTMLInputElement>(null);




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
    if ((state as any).regionEdit?.isMaskMode) return;
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
        // IMPORTANT: drag-resize should change width/height only.
        // Scale is reserved for intentional scaling + flips; resizing while also modifying
        // scale causes "double scaling" drift.
        dispatch({
          type: 'UPDATE_TOKEN',
          payload: {
            id: resizeItem.id,
            width: nw,
            height: nh,
            x: nx,
            y: ny,
            scaleX: resizeItem.initialScaleX,
            scaleY: resizeItem.initialScaleY,
          }
        });
      } else {
        // Annotations strictly standard top-left for now so passing ax=0, ay=0 effectively
        // Actually annotations use center rotation but left/top position.
        // Let's keep annotation logic simple or just use the same math with 0,0 anchors if not present.
        dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: resizeItem.id, width: nw, height: nh, x: newLeft, y: newTop } });
        // Note: Annotations x/y are Top-Left currently in renderer.
      }
    } else if (rotateItem) {
      const dx = e.clientX - rotateItem.centerX;
      const dy = e.clientY - rotateItem.centerY;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      // Delta from start click
      const delta = angle - rotateItem.startAngle;
      const newRot = (rotateItem.initialRotation + delta + 360) % 360; // Normalize 0-360

      if (rotateItem.type === 'token') {
        dispatch({ type: 'UPDATE_TOKEN', payload: { id: rotateItem.id, rotation: newRot } });
      } else {
        dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: rotateItem.id, rotation: newRot } });
      }
    }
  };


  const handleStageMouseUp = () => {
    setDragItem(null);
    setResizeItem(null);
    setRotateItem(null);
  };

  const deleteSelection = () => {
    if (!state.selection) return;
    if (state.selectionType === 'token') {
      dispatch({ type: 'REMOVE_TOKEN', payload: state.selection });
      dispatch({ type: 'ADD_LOG', payload: { message: "Token removed from Scene (Library Safe)", type: 'info' } });
    } else if (state.selectionType === 'annotation') {
      dispatch({ type: 'REMOVE_ANNOTATION', payload: state.selection });
    }
    dispatch({ type: 'SELECT_ITEM', payload: { id: null, type: null } });
  };

  // --- DROP HANDLER (Main Stage) ---
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ignore drops outside the camera gate
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

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
    if (!viewportRef.current) return null;

    // 1. Setup Canvas based on Director aspect ratio (fixed internal long-edge for AI stability)
    const ratio = parseAspectRatioToNumber(state.director.aspectRatio);
    const base = 1920; // Keep this stable: captureStage() is also used as AI input across multiple tools.
    let TARGET_W = base;
    let TARGET_H = Math.round(base / ratio);
    if (ratio < 1) {
      TARGET_H = base;
      TARGET_W = Math.round(base * ratio);
    }

    // Keep dimensions even (better encoder/model compatibility)
    TARGET_W = Math.max(2, Math.round(TARGET_W));
    TARGET_H = Math.max(2, Math.round(TARGET_H));
    if (TARGET_W % 2 !== 0) TARGET_W += 1;
    if (TARGET_H % 2 !== 0) TARGET_H += 1;

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");

    // 2. Determine Scale Factor based on the camera gate dimensions
    // This guarantees WYSIWYG capture regardless of screen size or UI letterboxing.
    const rect = viewportRef.current.getBoundingClientRect();
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

  // --- SHOT HELPERS ---
  const addShotFromStage = () => {
    dispatch({ type: 'ADD_SHOT_FROM_STAGE', payload: { name: newShotName.trim() || undefined } } as any);
    setNewShotName('');
  };



  const setActiveShot = (id: string) => {
    dispatch({ type: 'SET_ACTIVE_SHOT', payload: { id } } as any);
  };

  const duplicateShot = (id: string) => {
    dispatch({ type: 'DUPLICATE_SHOT', payload: { id } } as any);
  };

  const removeShot = (id: string) => {
    dispatch({ type: 'REMOVE_SHOT', payload: { id } } as any);
  };

  const renameActiveShot = () => {
    if (!activeShotId) return;
    const name = activeShotNameDraft.trim();
    if (!name) return;
    dispatch({ type: 'UPDATE_SHOT_META', payload: { id: activeShotId, updates: { name } } } as any);
  };

  const captureAndSetShotFrame = async (which: 'start' | 'end') => {
    if (!activeShotId) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } } as any);
      return;
    }
    dispatch({ type: 'SET_PROCESSING', payload: true } as any);
    try {
      const dataUrl = await captureStage();
      if (!dataUrl) throw new Error('Stage capture returned empty.');
      dispatch({ type: 'SET_SHOT_FRAME', payload: { id: activeShotId, which, url: dataUrl } } as any);
      dispatch({ type: 'ADD_LOG', payload: { message: `Saved ${which.toUpperCase()} frame from stage.`, type: 'success' } } as any);
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Failed to capture ${which} frame: ${e?.message || e}`, type: 'error' } } as any);
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false } as any);
    }
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
    if (!viewportRef.current) return;
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
  const selectedToken = state.tokens.find(t => t.id === state.selection && state.selectionType === 'token');
  const selectedAnnotation = state.annotations.find(a => a.id === state.selection && state.selectionType === 'annotation');


  // --- STABLE CALLBACKS FOR PERFORMANCE ---
  const handleHueChange = React.useCallback((newHex: string) => {
    if (selectedAnnotation) {
      dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: newHex } });
      setLastCustomColor(newHex);
    }
  }, [selectedAnnotation?.id, dispatch]);

  const duplicateSelection = () => {
    if (!state.selection || !state.selectionType) return;

    if (state.selectionType === 'token') {
      const original = state.tokens.find(t => t.id === state.selection);
      if (!original) return;

      const newId = `token-${Date.now()}`;
      // Find max zIndex to place on top (optional, or just +1)
      const maxZ = Math.max(...state.tokens.map(t => t.zIndex), 10);

      const cloneToken: StageToken = {
        ...original,
        id: newId,
        x: original.x + 40,
        y: original.y,
        zIndex: maxZ + 1
      };
      dispatch({ type: 'ADD_TOKEN', payload: cloneToken });
      dispatch({ type: 'SELECT_ITEM', payload: { id: newId, type: 'token' } });

    } else if (state.selectionType === 'annotation') {
      const original = state.annotations.find(a => a.id === state.selection);
      if (!original) return;

      const newId = `ann-${Date.now()}`;
      const maxZ = Math.max(...state.annotations.map(a => a.zIndex), 10);
      const cloneAnn = {
        ...original,
        id: newId,
        x: original.x + 40,
        y: original.y,
        zIndex: maxZ + 1
      };

      dispatch({ type: 'ADD_ANNOTATION', payload: cloneAnn });
      dispatch({ type: 'SELECT_ITEM', payload: { id: newId, type: 'annotation' } });
    }
  };


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
              className={`flex-grow py-3 rounded-lg text-[10px] font-black transition-all border uppercase tracking-wider active:scale-95 flex items-center justify-center gap-2 ${state.backgroundUrl
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
                  <span className="font-mono text-[10px] text-yellow-500 truncate">{selectedToken.tag.substring(0, 12)}...</span>
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
                        if (selectedToken.uniformScale) updates.scaleY = val * (selectedToken.scaleY < 0 ? -1 : 1);
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
                        if (selectedToken.uniformScale) updates.scaleX = val * (selectedToken.scaleX < 0 ? -1 : 1);
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

        {/* ANNOTATION PROPERTIES (NEW) */}
        {selectedAnnotation && (
          <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 shadow-xl shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <StickyNote className="w-4 h-4 text-purple-500" />
              </div>
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Annotation</h3>
            </div>


            <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300 relative">

              {/* Shared Hidden Input for Color Modification - Visually hidden but layout-present for popover position */}
              <input
                ref={colorPickerRef}
                type="color"
                className="opacity-0 absolute top-10 left-10 w-0 h-0 pointer-events-none"
                onChange={(e) => {
                  const c = e.target.value;
                  setLastCustomColor(c);
                  dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: c } });
                  setShowColorEditor(false); // Close editor after system picker selection
                }}
              />

              {/* Type Info - Show only if editor is CLOSED */}
              {!showColorEditor && (
                <div className="flex items-center justify-between bg-[#09090b] px-3 py-2 rounded border border-gray-800">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Selected Item</span>
                    <span className="font-mono text-[10px] text-purple-400 truncate uppercase">{selectedAnnotation.type}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={deleteSelection}
                      className="text-red-500 hover:text-red-400 p-1.5 bg-gray-800 hover:bg-red-900/20 rounded"
                      title="Delete Annotation"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* CONTROLS OR COLOR EDITOR */}
              {showColorEditor ? (
                <div className="bg-[#18181b] rounded-lg p-3 border border-gray-700 space-y-3 relative animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Color Editor</span>
                    <button
                      onClick={() => setShowColorEditor(false)}
                      className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Preview & Hex */}
                  <div className="flex gap-2">
                    <div
                      className="w-10 h-10 rounded border border-white/20 shadow-inner"
                      style={{ backgroundColor: selectedAnnotation.color || '#a855f7' }}
                    />
                    <div className="flex-1 space-y-1">
                      <label className="text-[8px] text-gray-500 uppercase font-bold block">Hex Code</label>
                      <input
                        type="text"
                        defaultValue={selectedAnnotation.color || '#a855f7'}
                        onBlur={(e) => {
                          const val = e.target.value;
                          dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: val } });
                          setLastCustomColor(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = e.currentTarget.value;
                            dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: val } });
                            setLastCustomColor(val);
                          }
                        }}
                        className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white font-mono uppercase focus:border-purple-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] text-gray-500 uppercase font-bold block">Hue Adjust</label>
                    <MemoizedDebouncedHueSlider
                      color={selectedAnnotation.color || '#a855f7'}
                      onChange={handleHueChange}
                    />
                    {/* Replaced Hue with System Picker Button for reliability */}
                    <button
                      onClick={() => colorPickerRef.current?.click()}
                      className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-[9px] text-gray-300 rounded border border-gray-600 uppercase font-bold flex items-center justify-center gap-2"
                    >
                      <Pipette className="w-3 h-3" /> Open System Picker
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {/* We could parse Hex to RGB here for inputs, but keeping it simple with Hex + System is better for stability unless user asked for RGB specifically. User asked for "Close button" and "Position". */}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2 border-t border-white/5">

                  {/* 1. SIZE / SCALE */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                      <span>Size</span>
                      <span className="text-purple-400 font-mono">{Math.round(selectedAnnotation.width)}px</span>
                    </div>
                    <input
                      type="range" min="20" max="600" step="10"
                      value={selectedAnnotation.width}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        // Uniform scale behavior for "Size" slider
                        const ratio = selectedAnnotation.width / selectedAnnotation.height;
                        // Avoid divide by zero if new item
                        const effectiveRatio = ratio || 1;

                        dispatch({
                          type: 'UPDATE_ANNOTATION',
                          payload: {
                            id: selectedAnnotation.id,
                            width: val,
                            height: val / effectiveRatio
                          }
                        });
                      }}
                      className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* 2. ROTATION */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-[60px_1fr_50px] items-center gap-3">
                      <span className="text-[10px] text-gray-500 uppercase font-medium">Rotate</span>
                      <input
                        type="range" min="-180" max="180"
                        value={selectedAnnotation.rotation}
                        onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, rotation: parseInt(e.target.value) } })}
                        className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={selectedAnnotation.rotation}
                          onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, rotation: parseInt(e.target.value) || 0 } })}
                          className="bg-black border border-gray-800 py-0.5 px-1 rounded text-[10px] text-purple-500 font-mono text-center outline-none w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. THICKNESS (Arrows only usually, but maybe border for zones later) */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                      <span>Thickness</span>
                      <span className="text-purple-400 font-mono">{selectedAnnotation.thickness ?? 2}px</span>
                    </div>
                    <input
                      type="range" min="1" max="25" step="1"
                      value={selectedAnnotation.thickness ?? 2}
                      onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, thickness: parseInt(e.target.value) } })}
                      className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* 4. POSITION */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] text-gray-500 uppercase font-bold block">X Position</label>
                        <input
                          type="number"
                          value={Math.round(selectedAnnotation.x)}
                          onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, x: parseInt(e.target.value) } })}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white font-mono focus:border-purple-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] text-gray-500 uppercase font-bold block">Y Position</label>
                        <input
                          type="number"
                          value={Math.round(selectedAnnotation.y)}
                          onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, y: parseInt(e.target.value) } })}
                          className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white font-mono focus:border-purple-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. COLOR */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Color</span>
                    <div className="grid grid-cols-6 gap-2">
                      {/* Presets */}
                      {[
                        '#a855f7', // Purple (Default)
                        '#ef4444', // Red
                        '#f97316', // Orange
                        '#eab308', // Yellow
                        '#22c55e', // Green
                        '#3b82f6', // Blue
                        '#ffffff', // White
                        '#000000', // Black
                      ].map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: c } });
                            setShowColorEditor(false); // Single click always exits editor if open (or just selects)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setShowColorEditor(true);
                            // We don't open system picker automatically anymore, we open OUR editor.
                          }}
                          className={`w-6 h-6 rounded-full border border-white/10 shadow-sm transition-transform hover:scale-110 ${selectedAnnotation.color === c ? 'ring-2 ring-white' : ''}`}
                          style={{ backgroundColor: c }}
                          title="Double-click to edit"
                        />
                      ))}

                      {/* Custom / Recent Slot */}
                      <button
                        onClick={() => {
                          dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: lastCustomColor } });
                          setShowColorEditor(false);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setShowColorEditor(true);
                        }}
                        className={`w-6 h-6 rounded-full border border-white/10 shadow-sm transition-transform hover:scale-110 flex items-center justify-center overflow-hidden ${selectedAnnotation.color === lastCustomColor ? 'ring-2 ring-white' : ''}`}
                        style={{ backgroundColor: lastCustomColor }}
                        title="Custom Color (Double-click to edit)"
                      >
                        <span className="text-[8px] text-white/50 bg-black/20 w-full text-center">+</span>
                      </button>
                    </div>
                  </div>

                  {/* 5. Z-INDEX DEPTH */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Layer {selectedAnnotation.zIndex}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, zIndex: selectedAnnotation.zIndex - 1 } })}
                        className="p-1 px-2 bg-gray-800 rounded text-[9px] text-gray-300 hover:text-white"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, zIndex: selectedAnnotation.zIndex + 1 } })}
                        className="p-1 px-2 bg-gray-800 rounded text-[9px] text-gray-300 hover:text-white"
                      >
                        Front
                      </button>
                    </div>
                  </div>

                </div>
              )}
              {/* End of ternary */}

            </div>
          </div>
        )}


      </div>
      {/* End of Left Sidebar */}

      {/* 2. CENTER AREA: THE STAGE */}
      < div className="flex-1 flex flex-col gap-4 min-w-0" >
        <div
          ref={stageRef}
          className="flex-1 bg-[#09090b] border border-[#27272a] rounded-xl relative overflow-hidden shadow-2xl group"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
        >
          {/* Stage Matte (outside the camera gate) */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#111111_0%,_#000000_100%)]" />

          {/* Camera Gate / Viewport (this is the actual rendered frame) */}
          <div
            ref={viewportRef}
            className="absolute relative bg-black overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10"
            style={{
              left: `${viewportBox.x}px`,
              top: `${viewportBox.y}px`,
              width: `${viewportBox.w}px`,
              height: `${viewportBox.h}px`
            }}
          >
            {state.backgroundUrl ? (
              <img
                src={state.backgroundUrl}
                alt="Stage Background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            ) : (
              <div className="absolute inset-0 text-gray-800 flex flex-col items-center justify-center gap-4 opacity-20">
                <Square className="w-24 h-24 stroke-[1]" />
                <span className="text-xs font-bold uppercase tracking-[0.5em]">Empty Stage</span>
              </div>
            )}

            {/* Region Edit Mask Overlay */}
            {(state as any).regionEdit?.isMaskMode && (
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 z-[55] opacity-40"
                style={{ pointerEvents: 'auto' }}
                onPointerDown={handleMaskPointerDown}
                onPointerMove={handleMaskPointerMove}
                onPointerUp={handleMaskPointerUp}
                onPointerLeave={handleMaskPointerUp}
              />
            )}

            {/* Tokens Layer */}
            {[...state.tokens].filter(t => t.visible !== false).sort((a, b) => a.zIndex - b.zIndex).map(token => (
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
                  if ((state as any).regionEdit?.isMaskMode) return;
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
                <div className={`absolute inset-0 transition-all duration-500 pointer-events-none`} />
                <img
                  src={token.url}
                  alt={token.tag}
                  className={`w-full h-full object-contain pointer-events-none transition-all duration-300 ${token.intelligence ? 'drop-shadow-[0_0_8px_rgba(34,197,94,0.9)]' : ''}`}
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
            {[...state.annotations].filter(a => a.visible !== false).sort((a, b) => a.zIndex - b.zIndex).map(note => (
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
                  if ((state as any).regionEdit?.isMaskMode) return;
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
                  <div className="w-full h-full flex flex-col shadow-lg border-2 border-yellow-400 bg-yellow-900/40 backdrop-blur-sm rounded-lg overflow-hidden">
                    {/* Fixed Header Label - Outside the note content area */}
                    <div className="bg-yellow-400 text-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center justify-between shrink-0 select-none">
                      <span>Director Note</span>
                      <Pencil className="w-2.5 h-2.5 opacity-50" />
                    </div>

                    {/* Content Area */}
                    <div
                      className="flex-1 p-2 overflow-hidden bg-black/40"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingAnnotationId(note.id);
                      }}
                    >
                      {editingAnnotationId === note.id ? (
                        <textarea
                          autoFocus
                          className="w-full h-full bg-transparent text-yellow-100 font-bold font-mono text-[11px] resize-none outline-none leading-relaxed placeholder:text-yellow-500/30"
                          value={note.text || ''}
                          onChange={(e) => dispatch({
                            type: 'UPDATE_ANNOTATION',
                            payload: { id: note.id, text: e.target.value }
                          })}
                          onBlur={() => setEditingAnnotationId(null)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="Type instructions..."
                        />
                      ) : (
                        <p className="text-yellow-100 font-bold font-mono text-[11px] whitespace-pre-wrap leading-relaxed select-none pointer-events-none break-words min-h-[1em]">
                          {note.text || ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {note.type === 'arrow' && (
                  <div className="w-full h-full flex items-center justify-center pointer-events-none">
                    {/* SVG Arrow using simple line math or lucide icon with stroke width */}
                    {/* Lucide icon is fixed path, strokeWidth is prop. Color is prop. */}
                    <MoveUpRight
                      className="w-full h-full"
                      strokeWidth={note.thickness ?? 2}
                      color={note.color || '#a855f7'} // Default purple
                      style={{ opacity: 0.9 }}
                    />
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
                        uniformScale: false,
                        anchorX: 0,
                        anchorY: 0
                      });
                    }}
                  />
                )}
                {/* Rotation Handle (Top Center) */}
                {state.selection === note.id && (
                  <div
                    className="absolute left-1/2 -top-6 -translate-x-1/2 w-5 h-5 bg-white border border-blue-500 rounded-full flex items-center justify-center cursor-grabbing shadow-lg z-50 group/rotate"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const gate = viewportRef.current;
                      if (!gate) return;
                      const rect = gate.getBoundingClientRect();
                      // Note x,y is relative to the camera gate (viewport).
                      // Center = rect.left + note.x + width/2
                      const cx = rect.left + note.x + (note.width / 2);
                      const cy = rect.top + note.y + (note.height / 2);

                      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

                      setRotateItem({
                        id: note.id,
                        type: 'annotation',
                        centerX: cx,
                        centerY: cy,
                        startAngle: angle,
                        initialRotation: note.rotation
                      });
                    }}
                  >
                    <RotateCw className="w-3 h-3 text-blue-500 group-hover/rotate:animate-spin" />
                  </div>
                )}
              </div>
            ))}

          </div>

        </div>

        {/* 2b. CANVAS TOOLBAR (Moved Horizontal Below Stage) */}
        <div className="flex items-center justify-between gap-4 p-2 bg-[#09090b] border border-[#27272a] rounded-xl shrink-0">

          {/* Left Group: History & Edit */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-white/5">
              <button
                onClick={() => dispatch({ type: 'UNDO' })}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Undo (Ctrl+Z)"
              >
                <Undo className="w-4 h-4" />
              </button>
              <button
                onClick={() => dispatch({ type: 'REDO' })}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Redo (Ctrl+Y)"
              >
                <Redo className="w-4 h-4" />
              </button>
            </div>

          </div>

          {/* Center Group: Edit & Add Tools */}
          <HelpTooltip zone="stage" id="compositionTools">
            <div className="flex items-center gap-2">
              {/* EDIT TOOLS (Moved here) */}
              <button
                onClick={duplicateSelection}
                disabled={!state.selection}
                className={`flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg transition-colors ${!state.selection ? 'opacity-50 pointer-events-none' : 'hover:bg-black'}`}
                title="Duplicate Selection"
              >
                <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                  <Copy className={`w-4 h-4 ${!state.selection ? 'text-gray-600' : 'text-purple-400'}`} />
                </div>
                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-purple-400">Copy</span>
              </button>

              <button
                onClick={() => {
                  if (confirm('Are you sure you want to clear the entire stage?')) {
                    dispatch({ type: 'CLEAR_STAGE' });
                  }
                }}
                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg hover:bg-black transition-colors"
                title="Clear Everything"
              >
                <div className="p-2 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
                  <TrashIcon className="w-4 h-4 text-red-500" />
                </div>
                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-red-400">CLEAR STAGE</span>
              </button>

              <div className="w-px h-10 bg-white/10 mx-2" />

              {/* ADD TOOLS */}
              <button
                onClick={() => {
                  const id = `ann-${Date.now()}`;
                  dispatch({
                    type: 'ADD_ANNOTATION', payload: {
                      id, type: 'note', x: 50, y: 50, width: 150, height: 100, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 10, text: ''
                    }
                  });
                  dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                }}
                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg hover:bg-black transition-colors"
              >
                <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <StickyNote className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-blue-400">Note</span>
              </button>

              <button
                onClick={() => {
                  const id = `ann-${Date.now()}`;
                  dispatch({
                    type: 'ADD_ANNOTATION', payload: {
                      id, type: 'zone', x: 100, y: 100, width: 200, height: 150, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 5
                    }
                  });
                  dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                }}
                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg hover:bg-black transition-colors"
              >
                <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                  <BoxSelect className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-emerald-400">Zone</span>
              </button>

              <button
                onClick={() => {
                  const id = `ann-${Date.now()}`;
                  dispatch({
                    type: 'ADD_ANNOTATION', payload: {
                      id, type: 'arrow', x: 200, y: 200, width: 60, height: 60, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 11
                    }
                  });
                  dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                }}
                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md shadow-lg hover:bg-black transition-colors"
              >
                <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                  <MoveUpRight className="w-4 h-4 text-purple-400" />
                </div>
                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-purple-400">Path</span>
              </button>
            </div>
          </HelpTooltip>

          {/* Right Group: Capture */}
          <div>
            <button
              onClick={downloadCanvas}
              className="bg-black/80 hover:bg-black border border-white/10 text-blue-500 hover:text-green-500 px-6 py-2 rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95"
            >
              <MonitorPlay className="w-4 h-4" />
              Capture Stage
            </button>
          </div>

        </div>
      </div >
      {/* 3. RIGHT SIDEBAR: GLOBAL SPECS, ANCHOR, & REFERENCES */}
      < div className="w-[400px] flex flex-col gap-4 overflow-y-auto pl-2 custom-scrollbar" >
        {/* DYNAMIC SIDEBAR PANELS */}
        <div className="flex flex-col gap-3">
          {panelOrder.map(panelId => {
            if (panelId === 'shots') {
              // --- SHOTS PANEL ---
              return (
                <HelpTooltip zone="stage" id="storyboardTimeline">
                  <SidebarPanel
                    key="shots"
                    id="shots"
                    title="Shot List"
                    icon={Film}
                    headerColor="text-blue-500"
                    collapsed={collapsedPanels['shots']}
                    onToggle={togglePanel}
                    onDrop={handlePanelDrop}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={addShotFromStage}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] py-2 rounded font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                      >
                        <Grid className="w-3 h-3" />
                        New Shot
                      </button>
                      <button
                        onClick={() => captureAndSetShotFrame('start')}
                        disabled={!activeShotId}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] py-2 rounded font-bold uppercase tracking-wider disabled:opacity-50"
                        title="Capture stage as Start Frame for active shot"
                      >
                        Start
                      </button>
                      <button
                        onClick={() => captureAndSetShotFrame('end')}
                        disabled={!activeShotId}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] py-2 rounded font-bold uppercase tracking-wider disabled:opacity-50"
                        title="Capture stage as End Frame for active shot"
                      >
                        End
                      </button>
                    </div>

                    {activeShotId && (
                      <div className="mb-3 space-y-2">
                        <label className="text-[9px] uppercase font-bold text-gray-500 block">Active Shot Name</label>
                        <div className="flex gap-2">
                          <input
                            value={activeShotNameDraft}
                            onChange={(e) => setActiveShotNameDraft(e.target.value)}
                            onBlur={renameActiveShot}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                renameActiveShot();
                              }
                            }}
                            className="flex-1 bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[10px] text-yellow-400 outline-none focus:border-yellow-500"
                          />
                          <button
                            onClick={renameActiveShot}
                            className="px-3 py-2 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded text-[10px] font-bold uppercase text-gray-300"
                            title="Rename active shot"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {(shots ?? []).map((s: any) => {
                        const active = s.id === activeShotId;
                        return (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 p-2 rounded border transition-colors ${active ? 'border-yellow-500 bg-yellow-500/5' : 'border-[#27272a] bg-[#0b0b0d] hover:bg-[#18181b]'
                              }`}
                          >
                            <button
                              onClick={() => setActiveShot(s.id)}
                              className="flex-1 text-left"
                              title="Load this shot into the stage"
                            >
                              <div className="text-[10px] font-bold text-gray-200 truncate">{s.name}</div>
                              <div className="text-[9px] text-gray-600 font-mono">
                                {s.startFrameUrl ? 'S' : '-'} / {s.endFrameUrl ? 'E' : '-'}
                              </div>
                            </button>

                            <button
                              onClick={() => duplicateShot(s.id)}
                              className="p-1.5 bg-black/30 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                              title="Duplicate shot"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => removeShot(s.id)}
                              className="p-1.5 bg-black/30 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400 transition-colors"
                              title="Delete shot"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}

                      {(shots ?? []).length === 0 && (
                        <div className="text-[10px] text-gray-600 italic py-2 border border-dashed border-gray-800 rounded text-center">
                          No shots yet. Add one from the current stage.
                        </div>
                      )}
                    </div>
                  </SidebarPanel>
                </HelpTooltip>
              );
            }

            if (panelId === 'region_edit') {
              // --- REGION EDIT PANEL ---
              return (
                <SidebarPanel
                  key="region_edit"
                  id="region_edit"
                  title="Region Edit"
                  icon={Sparkles}
                  headerColor="text-green-500"
                  collapsed={collapsedPanels['region_edit']}
                  onToggle={togglePanel}
                  onDragStart={setDraggedPanelId}
                  onDrop={handlePanelDrop}
                  isMaskMode={state.regionEdit?.isMaskMode}
                  rightElement={
                    (state as any).cursorMode === 'eraser' && (
                      <span className="text-[9px] font-bold text-red-400 uppercase border border-red-500/30 px-1 rounded bg-red-500/10">Eraser</span>
                    )
                  }
                >
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => dispatch({ type: 'SET_REGION_EDIT', payload: { isMaskMode: !(state as any).regionEdit?.isMaskMode } } as any)}
                      className={`flex-1 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider border transition-all duration-300 ${(state as any).regionEdit?.isMaskMode
                        ? 'bg-green-600 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)]'
                        : 'bg-[#18181b] border-[#27272a] text-gray-500 hover:text-white hover:border-gray-600'
                        }`}
                      title="Toggle mask paint mode"
                    >
                      {(state as any).regionEdit?.isMaskMode ? 'Mask ON' : 'Mask OFF'}
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'CLEAR_ALL_REGION_MASKS' } as any)}
                      className="px-3 py-1.5 bg-[#18181b] hover:bg-red-500/20 border border-[#27272a] text-gray-500 hover:text-red-400 rounded text-[9px] font-bold uppercase transition-colors"
                      title="Clear all painted masks"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => dispatch({ type: 'SET_REGION_EDIT', payload: { mode: 'paint' } } as any)}
                      className={`flex-1 py-2 rounded text-[10px] font-bold uppercase border ${(state as any).regionEdit?.mode === 'paint'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-[#18181b] text-accent border-[#27272a] hover:bg-[#27272a]'
                        }`}
                    >
                      Paint
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'SET_REGION_EDIT', payload: { mode: 'erase' } } as any)}
                      className={`flex-1 py-2 rounded text-[10px] font-bold uppercase border ${(state as any).regionEdit?.mode === 'erase'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-[#18181b] text-accent border-[#27272a] hover:bg-[#27272a]'
                        }`}
                    >
                      Erase
                    </button>
                  </div>

                  {/* Layer list */}
                  <div className="space-y-2 mb-3">
                    {((state as any).regionEdit?.layers || []).map((l: any) => {
                      const active = l.id === (state as any).regionEdit?.activeLayerId;
                      return (
                        <div
                          key={l.id}
                          className={`flex items-center gap-2 p-2 rounded border ${active ? 'border-blue-500 bg-blue-500/5' : 'border-[#27272a] bg-[#0b0b0d]'
                            }`}
                        >
                          <button
                            className="flex-1 text-left"
                            onClick={() => dispatch({ type: 'SET_REGION_ACTIVE_LAYER', payload: { id: l.id } } as any)}
                            title="Select layer to paint"
                          >
                            <div className="text-[10px] font-bold text-gray-200">{l.name}</div>
                            <div className="text-[9px] text-gray-600 font-mono">
                              {l.maskDataUrl ? 'MASK' : '--'} {l.prompt?.trim() ? ' / TXT' : ''}
                            </div>
                          </button>

                          <button
                            onClick={() =>
                              dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: l.id, updates: { enabled: !l.enabled } } } as any)
                            }
                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase border ${l.enabled ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-[#18181b] border-[#27272a] text-gray-400'
                              }`}
                            title="Include layer in Apply Queue"
                          >
                            {l.enabled ? 'ON' : 'OFF'}
                          </button>

                          <button
                            onClick={() => dispatch({ type: 'CLEAR_REGION_LAYER_MASK', payload: { id: l.id } } as any)}
                            className="p-1.5 bg-black/30 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400 transition-colors"
                            title="Clear this mask"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Brush controls */}
                  <div className="space-y-3 mb-3">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase font-bold">
                      <span>Brush Size</span>
                      <span className="text-blue-400 font-mono">{(state as any).regionEdit?.brushSize ?? 40}px</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={200}
                      value={(state as any).regionEdit?.brushSize ?? 40}
                      onChange={(e) => dispatch({ type: 'SET_REGION_EDIT', payload: { brushSize: parseInt(e.target.value) } } as any)}
                      className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />

                    <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase font-bold">
                      <span>Edge Softness</span>
                      <span className="text-blue-400 font-mono">{((state as any).regionEdit?.brushSoftness ?? 0.35).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={(state as any).regionEdit?.brushSoftness ?? 0.35}
                      onChange={(e) => dispatch({ type: 'SET_REGION_EDIT', payload: { brushSoftness: parseFloat(e.target.value) } } as any)}
                      className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>


                  {/* Protection Mask (Face/Hair Lock) */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={protectEnabled}
                          onChange={(e) => setProtectEnabled(e.target.checked)}
                          className="w-4 h-4 accent-blue-500 rounded border-white/10 bg-black"
                        />
                        Protect Face/Hair
                      </label>

                      <button
                        onClick={generateFaceProtectionMask}
                        disabled={!state.apiKey || protectStatus === 'generating'}
                        className="px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 bg-[#18181b] border-[#27272a] text-yellow-500 hover:bg-[#27272a]"
                        title="Generate a face/hair protection mask (white = protected)"
                      >
                        {protectStatus === 'generating' ? 'Generating…' : protectMaskUrl ? 'Regen' : 'Generate'}
                      </button>
                    </div>

                    {protectMaskUrl && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-12 rounded border border-[#27272a] bg-black overflow-hidden relative group">
                            <img src={protectMaskUrl} className="w-full h-full object-contain opacity-90" alt="Protection Mask" />
                            {state.isProcessing && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><RotateCw className="w-4 h-4 text-white animate-spin" /></div>}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] text-gray-500 font-bold uppercase">Shrink Mask</span>
                              <span className="text-[9px] text-yellow-500 font-mono">{protectErosion}px</span>
                            </div>
                            <input
                              type="range"
                              min={0} max={20} step={1}
                              value={protectErosion}
                              onChange={(e) => setProtectErosion(parseInt(e.target.value))}
                              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                              title="Erode mask to remove white halo"
                            />
                          </div>
                          <button
                            onClick={() => {
                              setProtectMaskUrl(null);
                              setRawProtectMaskUrl(null); // Clear raw too
                              setProtectStatus('idle');
                            }}
                            className="self-start mt-2 px-2 py-1 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded text-[8px] font-bold uppercase text-red-500"
                            title="Clear protection mask"
                          >
                            Clear
                          </button>
                          <span className="text-[9px] text-gray-600 ml-auto self-start mt-2">{protectStatus.toUpperCase()}</span>
                        </div>
                      </div>
                    )}

                    <p className="text-[9px] text-gray-600 mt-2 leading-relaxed">
                      When enabled, protected (white) pixels are automatically removed from every edit mask before applying.
                    </p>
                  </div>

                  {/* Prompt */}
                  <div className="space-y-2 mb-3">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Layer Instruction</label>
                    <textarea
                      value={activeLayer?.prompt || ''}
                      onChange={(e) =>
                        activeLayer &&
                        dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: activeLayer.id, updates: { prompt: e.target.value } } } as any)
                      }
                      className="w-full bg-[#18181b] border border-[#27272a] rounded p-2 text-[10px] text-gray-300 resize-none focus:border-blue-500 outline-none"
                      rows={3}
                      placeholder="e.g. Remove the IV line. Match lighting. No new objects."
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Remove', text: 'Remove the object in the masked area. Clean seamless fill. Match surrounding texture and lighting.' },
                        { label: 'Replace', text: 'Replace the masked area with: (describe). Match perspective, lighting, and realism.' },
                        { label: 'Relight', text: 'Relight the masked area to match scene lighting. Preserve identity and realism.' },
                      ].map((p) => (
                        <button
                          key={p.label}
                          onClick={() =>
                            activeLayer &&
                            dispatch({
                              type: 'UPDATE_REGION_LAYER',
                              payload: { id: activeLayer.id, updates: { prompt: (activeLayer.prompt || '') ? `${activeLayer.prompt}\n${p.text}` : p.text } },
                            } as any)
                          }
                          className="bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-gray-300 text-[9px] py-2 rounded uppercase font-bold"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={clearActiveMask}
                      disabled={!activeLayer}
                      className="flex-1 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-gray-300 hover:text-white text-[10px] py-2 rounded font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Clear Active
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'CLEAR_ALL_REGION_MASKS' } as any)}
                      className="flex-1 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-gray-300 hover:text-white text-[10px] py-2 rounded font-bold uppercase tracking-wider"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={applyRegionEditQueue}
                      disabled={state.isProcessing || !state.apiKey || isRegionEditRunning}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-[10px] uppercase tracking-[0.25em] py-3 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Apply Enabled Layers
                    </button>
                    <button
                      onClick={requestCancelRegionEdit}
                      disabled={!isRegionEditRunning}
                      className="px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Stops after current layer finishes"
                    >
                      Cancel
                    </button>
                  </div>

                  <p className="text-[9px] text-gray-600 mt-2 leading-relaxed">
                    Paint white to define the edit region. Apply runs each enabled layer sequentially.
                  </p>
                </SidebarPanel>
              );
            }

            if (panelId === 'layers') {
              // --- STAGE LAYERS ---
              const stageItemsCount = state.tokens.length + state.annotations.length;
              return (
                <SidebarPanel
                  key="layers"
                  id="layers"
                  title="Stage Layers"
                  icon={Layers}
                  headerColor="text-orange-400"
                  collapsed={collapsedPanels['layers']}
                  onToggle={togglePanel}
                  onDragStart={setDraggedPanelId}
                  onDrop={handlePanelDrop}
                  rightElement={<span className="text-[9px] text-gray-600 font-mono">{stageItemsCount} Items</span>}
                >
                  <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {[...state.tokens.map(t => ({ ...t, type: 'token' })), ...state.annotations.map(a => ({ ...a, type: 'annotation' }))]
                      .sort((a: any, b: any) => b.zIndex - a.zIndex)
                      .map((layer: any) => {
                        const isSelected = state.selection === layer.id;
                        const isDragging = draggedLayerId === layer.id;

                        return (
                          <div
                            key={layer.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedLayerId(layer.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (!draggedLayerId || draggedLayerId === layer.id) return;
                              // Capture current state of full list sorted by Z
                              const allLayers = [...state.tokens.map(t => ({ ...t, type: 'token' })), ...state.annotations.map(a => ({ ...a, type: 'annotation' }))]
                                .sort((a: any, b: any) => b.zIndex - a.zIndex);
                              const fromIndex = allLayers.findIndex(l => l.id === draggedLayerId);
                              const toIndex = allLayers.findIndex(l => l.id === layer.id);
                              if (fromIndex === -1 || toIndex === -1) return;
                              // Reorder array
                              const item = allLayers[fromIndex];
                              allLayers.splice(fromIndex, 1);
                              allLayers.splice(toIndex, 0, item);
                              // Re-assign Z-indices
                              const maxZ = allLayers.length;
                              allLayers.forEach((l, idx) => {
                                const newZ = maxZ - idx;
                                if (l.zIndex !== newZ) {
                                  if (l.type === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: l.id, zIndex: newZ } });
                                  else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: l.id, zIndex: newZ } });
                                }
                              });
                              setDraggedLayerId(null);
                            }}
                            onDragEnd={() => setDraggedLayerId(null)}
                            className={`flex items-center gap-2 p-1.5 rounded border transition-colors cursor-grab active:cursor-grabbing group ${isSelected ? 'bg-orange-500/10 border-orange-500/50' : 'bg-[#18181b] border-[#27272a] hover:bg-[#27272a]'} ${isDragging ? 'opacity-40 border-dashed border-orange-500' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: 'SELECT_ITEM', payload: { id: layer.id, type: layer.type } });
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (layer.type === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: layer.id, visible: layer.visible === false } });
                                else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: layer.id, visible: layer.visible === false } });
                              }}
                              className="p-1 text-gray-500 hover:text-white rounded hover:bg-white/10 transition-colors mr-1"
                              title={layer.visible === false ? "Show Layer" : "Hide Layer"}
                            >
                              {layer.visible === false ? <EyeOff className="w-3 h-3 text-gray-600" /> : <Eye className="w-3 h-3" />}
                            </button>

                            <div className="text-gray-600 group-hover:text-gray-400 cursor-grab active:cursor-grabbing">
                              <GripVertical className="w-3 h-3" />
                            </div>
                            <div className={`p-1 rounded ${isSelected ? 'bg-orange-500 text-black' : 'bg-gray-800 text-gray-400'}`}>
                              {layer.type === 'token' && <UserPlus className="w-3 h-3" />}
                              {layer.type === 'annotation' && layer.type === 'note' && <StickyNote className="w-3 h-3" />}
                              {layer.type === 'annotation' && layer.type === 'zone' && <BoxSelect className="w-3 h-3" />}
                              {layer.type === 'annotation' && layer.type === 'arrow' && <MoveUpRight className="w-3 h-3" />}
                            </div>
                            <span className={`text-[9px] font-bold uppercase truncate flex-1 ${isSelected ? 'text-orange-400' : 'text-gray-400'}`}>
                              {layer.tag || layer.text || layer.type}
                            </span>
                            <span className="text-[9px] font-mono text-gray-600 mr-2">Z:{layer.zIndex}</span>

                            {isSelected && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (layer.type === 'token') {
                                      dispatch({ type: 'REMOVE_TOKEN', payload: layer.id });
                                      dispatch({ type: 'ADD_LOG', payload: { message: "Token removed from Scene (Library Safe)", type: 'info' } });
                                    }
                                    else dispatch({ type: 'REMOVE_ANNOTATION', payload: layer.id });
                                  }}
                                  className="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-colors"
                                >
                                  <TrashIcon className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {state.tokens.length === 0 && state.annotations.length === 0 && (
                      <div className="text-[10px] text-gray-600 italic text-center py-4 border border-dashed border-gray-800 rounded">
                        Stage is empty. Add cast or notes.
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1 pt-2 border-t border-[#27272a] mt-2">
                    <button
                      disabled={!state.selection}
                      onClick={() => {
                        if (!state.selection) return;
                        const all = [...state.tokens, ...state.annotations];
                        const maxZ = Math.max(...all.map(i => i.zIndex));
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: maxZ + 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: maxZ + 1 } });
                      }}
                      className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                      title="Bring to Front"
                    >
                      <ArrowUpToLine className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={!state.selection}
                      onClick={() => {
                        if (!state.selection) return;
                        const item = [...state.tokens, ...state.annotations].find(i => i.id === state.selection);
                        if (!item) return;
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: item.zIndex + 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: item.zIndex + 1 } });
                      }}
                      className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                      title="Bring Forward"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={!state.selection}
                      onClick={() => {
                        if (!state.selection) return;
                        const item = [...state.tokens, ...state.annotations].find(i => i.id === state.selection);
                        if (!item) return;
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: item.zIndex - 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: item.zIndex - 1 } });
                      }}
                      className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                      title="Send Backward"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={!state.selection}
                      onClick={() => {
                        if (!state.selection) return;
                        const all = [...state.tokens, ...state.annotations];
                        const minZ = Math.min(...all.map(i => i.zIndex));
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: minZ - 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: minZ - 1 } });
                      }}
                      className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                      title="Send to Back"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </SidebarPanel>
              );
            }

            if (panelId === 'specs') {
              // --- GLOBAL SPECS ---
              return (
                <SidebarPanel
                  key="specs"
                  id="specs"
                  title="Context Specs"
                  icon={SettingsIcon}
                  headerColor="text-cyan-400"
                  collapsed={collapsedPanels['specs']}
                  onToggle={togglePanel}
                  onDragStart={setDraggedPanelId}
                  onDrop={handlePanelDrop}
                >
                  <div className="space-y-2 px-1">
                    {/* Resolution Display - Slimmer */}
                    <div className="flex items-center justify-between bg-[#18181b]/50 rounded-lg p-2 border border-[#27272a]">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Resolution</span>
                        <span className="text-sm font-mono text-cyan-400 font-bold tracking-tight">
                          {typeof state.director?.resolution === 'object' ? `${state.director.resolution.width}x${state.director.resolution.height}` : state.director?.resolution}
                        </span>
                      </div>

                      <div className="flex gap-1">
                        {[
                          { label: 'HD', w: 1920, h: 1080 },
                          { label: '4K', w: 3840, h: 2160 },
                          { label: '8K', w: 7680, h: 4320 },
                        ].map((r) => {
                          const currentW = typeof state.director.resolution === 'object' ? state.director.resolution.width : 1920;
                          const isActive = currentW === r.w;
                          return (
                            <button
                              key={r.label}
                              onClick={() => setDirector({ resolution: { width: r.w, height: r.h } })}
                              className={`px-2 py-1 rounded text-[9px] font-bold transition-colors uppercase border ${isActive
                                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                                : 'bg-[#27272a] text-gray-400 border-transparent hover:text-white hover:bg-[#3f3f46]'
                                }`}
                              title={`Set resolution to ${r.label} (${r.w}x${r.h})`}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1 mt-2">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-[#52525b]">Aspect Ratio</label>
                      <div className="flex gap-1">
                        {['16:9', '9:16', '1:1', '4:5'].map((ratio) => {
                          const isActive = state.director.aspectRatio === ratio;
                          return (
                            <button
                              key={ratio}
                              onClick={() => setDirector({ aspectRatio: ratio as DirectorAspectRatio })}
                              className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all uppercase border ${isActive
                                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                                : 'bg-[#27272a] text-gray-500 border-transparent hover:text-white hover:bg-[#3f3f46]'
                                }`}
                              title={`Set aspect ratio to ${ratio}`}
                            >
                              {ratio}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </SidebarPanel>
              );
            }

            if (panelId === 'anchor') {
              // --- ANCHOR REFERENCE ---
              return (
                <SidebarPanel
                  key="anchor"
                  id="anchor"
                  title="Anchor Ref"
                  icon={ImageIcon}
                  headerColor="text-purple-500"
                  collapsed={collapsedPanels['anchor']}
                  onToggle={togglePanel}
                  onDragStart={setDraggedPanelId}
                  onDrop={handlePanelDrop}
                >
                  <div className="space-y-3">
                    <div className="aspect-video bg-black/40 rounded border border-[#27272a] overflow-hidden relative group">
                      {state.backgroundUrl ? (
                        <>
                          <img src={state.backgroundUrl} className="w-full h-full object-contain transition-all duration-500" />
                          <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => dispatch({ type: 'SET_BG', payload: null })}
                              className="p-1.5 bg-black/60 text-white rounded hover:bg-red-500/80 transition-colors"
                              title="Clear Reference"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
                          <UploadIcon className="w-6 h-6 mb-2 opacity-20" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-center">Drag / Paste<br />Anchor Ref</span>
                        </div>
                      )}
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
                    {/* Anchor Tools */}
                    <div>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[10px] text-gray-300 resize-none focus:border-blue-500 outline-none"
                          placeholder="Or generate new anchor scene..."
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
                      <div className="mt-2 flex gap-2 items-end">
                        <div className="flex-1">
                          <Dropdown
                            label="Merge Strategy"
                            value={state.director.mergeStrategy}
                            options={['Character Identity', 'Style Transfer', 'Composition Reference', 'Photo Merge']}
                            onChange={(v: any) => setDirector({ mergeStrategy: v as DirectorMergeStrategy })}
                          />
                        </div>
                        <button
                          onClick={() => setDirector({ sceneLock: !state.director.sceneLock })}
                          className={`h-[42px] min-w-[50px] rounded flex flex-col items-center justify-center border transition-all ${state.director.sceneLock ? 'bg-purple-500/20 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-[#18181b] border-[#27272a] text-gray-600 hover:text-gray-400 hover:border-gray-700'}`}
                          title={state.director.sceneLock ? "Unlock Anchor Scene" : "Lock Anchor Scene"}
                        >
                          <Lock className="w-3.5 h-3.5 mb-0.5" />
                          <span className="text-[8px] font-bold uppercase tracking-wider">
                            {state.director.sceneLock ? "Locked" : "Lock"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Replacement Logic */}
                    <div className="pt-3 border-t border-[#27272a] space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={state.director.replaceAnchorSubjects ?? false}
                            onChange={(e) => setDirector({ replaceAnchorSubjects: e.target.checked })}
                            className="w-3 h-3 accent-yellow-500 bg-black"
                          />
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
                      {state.director.replaceAnchorSubjects && (
                        <div className="animate-in slide-in-from-top-2 duration-200">
                          <input
                            type="text"
                            className="w-full bg-[#18181b] border border-[#27272a] text-xs text-yellow-500 p-2 rounded focus:border-yellow-500 outline-none placeholder:text-gray-700"
                            placeholder="e.g. 'the actor in the center'"
                            value={state.director.globalReplaceTarget || ''}
                            onChange={(e) => setDirector({ globalReplaceTarget: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </SidebarPanel>
              );
            }



            if (panelId === 'ref_stacks') {
              // --- REFERENCE STACKS ---
              return (
                <SidebarPanel
                  key="ref_stacks"
                  id="ref_stacks"
                  title="Reference Stacks"
                  icon={RotateCw}
                  headerColor="text-yellow-500"
                  collapsed={collapsedPanels['ref_stacks']}
                  onToggle={togglePanel}
                  onDragStart={setDraggedPanelId}
                  onDrop={handlePanelDrop}
                >
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => dispatch({ type: 'CLEAR_REF_SLOTS' })}
                      className="text-[9px] text-gray-500 hover:text-red-400 font-bold uppercase border border-[#27272a] px-2 py-1 rounded hover:bg-white/5"
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
                </SidebarPanel>
              );
            }

            if (panelId === 'scene_director') {
              // --- SCENE DIRECTOR ---
              return (
                <SidebarPanel
                  key="scene_director"
                  id="scene_director"
                  title="Scene Director"
                  icon={Clapperboard}
                  headerColor="text-gray-500"
                  collapsed={collapsedPanels['scene_director']}
                  onToggle={togglePanel}
                  onDragStart={setDraggedPanelId}
                  onDrop={handlePanelDrop}
                  rightElement={state.director.envAuto && <span className="text-[9px] text-yellow-500 font-mono uppercase border border-yellow-500/30 px-1 rounded">Env Auto</span>}
                >
                  <div className="space-y-4">
                    <HelpTooltip zone="stage" id="stageInstructions">
                      <PropertyField
                        label="Subject / Action"
                        value={state.director.subject}
                        onChange={(v: any) => setDirector({ subject: v })}
                        placeholder="Describe the main action..."
                        type="textarea"
                      />
                    </HelpTooltip>

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
                    </div>
                  </div>
                </SidebarPanel>
              );
            }
            return null;
          })}
        </div>






        {/* v3 Prompt Terminal (Fixed at Bottom) */}
        <SidebarPanel
          key="v3_terminal"
          id="v3_terminal"
          title="PROMPT ENGINE"
          icon={MonitorPlay}
          headerColor="text-yellow-500"
          collapsed={collapsedPanels['v3_terminal']}
          onToggle={togglePanel}
          draggable={false} // <--- Disable dragging for Prompt Engine
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] text-gray-600 font-mono">COMPILED OUTPUT</div>
            <button
              onClick={handleCopyDirectorPrompt}
              className="p-1.5 hover:bg-white/10 rounded text-emerald-400 transition-colors"
              title="Copy to clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="bg-[#050505] p-3 rounded border border-[#27272a] font-mono text-[9px] text-emerald-500 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-60 custom-scrollbar select-text shadow-inner">
            {v3DirectorPrompt}
          </div>
        </SidebarPanel>






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
                      updateRefSlot(inspectRefIndex!, {
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
        )
        }
      </div >
    </div >
  );
};

export default SceneCanvas;
