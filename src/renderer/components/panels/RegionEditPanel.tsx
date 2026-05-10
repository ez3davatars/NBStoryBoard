import { Sparkles, X, RotateCw } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import type { Dispatch } from 'react';
import type { Action, RegionEditState } from '../../context/AppContext';

interface RegionEditPanelProps {
 regionEdit: RegionEditState;
 dispatch: Dispatch<Action>;
 protectEnabled: boolean;
 setProtectEnabled: (val: boolean) => void;
 protectStatus: 'idle' | 'generating' | 'ready' | 'error';
 protectMaskUrl: string | null;
 protectErosion: number;
 setProtectErosion: (val: number) => void;
 generateFaceProtectionMask: () => void;
 setProtectMaskUrl: (val: string | null) => void;
 setRawProtectMaskUrl: (val: string | null) => void;
 setProtectStatus: (val: 'idle' | 'generating' | 'ready' | 'error') => void;
 isProcessing: boolean;
 apiKey: string;
 billingMode?: string;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart: (id: string) => void;
 onDrop: (targetId: string) => void;
 cursorMode: string;
 clearActiveMask: () => void;
 applyRegionEditQueue: () => void;
 requestCancelRegionEdit: () => void;
 isRegionEditRunning: boolean;
}

export const RegionEditPanel = ({
 regionEdit,
 dispatch,
 protectEnabled,
 setProtectEnabled,
 protectStatus,
 protectMaskUrl,
 protectErosion,
 setProtectErosion,
 generateFaceProtectionMask,
 setProtectMaskUrl,
 setRawProtectMaskUrl,
 setProtectStatus,
 isProcessing,
 apiKey,
 billingMode = 'byok',
 collapsed,
 onToggle,
 onDragStart,
 onDrop,
 cursorMode,
 clearActiveMask,
 applyRegionEditQueue,
 requestCancelRegionEdit,
 isRegionEditRunning
}: RegionEditPanelProps) => {
 const layers = regionEdit?.layers || [];
 const activeLayer = layers.find(l => l.id === regionEdit?.activeLayerId);
 const hasApiAccess = !!apiKey || billingMode === 'hosted';
 const sourceImageMeta = regionEdit?.sourceImageMeta;
 const showSourceAuto =
 regionEdit?.contextSizingMode === 'source-auto' && Boolean(sourceImageMeta);
 const sourceAutoLabel = sourceImageMeta
 ? sourceImageMeta.width === sourceImageMeta.derivedRenderWidth &&
 sourceImageMeta.height === sourceImageMeta.derivedRenderHeight
 ? `Source Matched: ${sourceImageMeta.derivedRenderWidth} x ${sourceImageMeta.derivedRenderHeight}`
 : `Auto: ${sourceImageMeta.derivedRenderWidth} x ${sourceImageMeta.derivedRenderHeight}`
 : '';

 return (
 <SidebarPanel
 key="region_edit"
 id="region_edit"
 title="Region Edit"
 icon={Sparkles}
 headerColor="text-green-500"
 collapsed={collapsed}
 onToggle={onToggle}
 onDragStart={onDragStart}
 onDrop={onDrop}
 isMaskMode={regionEdit?.isMaskMode}
 rightElement={
 cursorMode === 'eraser' && (
 <span className="text-[9px] font-bold text-red-400 uppercase border border-red-500/30 px-1 rounded bg-red-500/10">Eraser</span>
 )
 }
 >
 <div className="flex items-center gap-2 mb-3">
 <button
 onClick={() => dispatch({ type: 'SET_REGION_EDIT', payload: { isMaskMode: !regionEdit?.isMaskMode } })}
 className={`flex-1 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider border transition-all duration-300 ${regionEdit?.isMaskMode
 ? 'bg-green-600 border-green-500 text-white -[0_0_15px_rgba(34,197,94,0.6)]'
 : 'bg-[#18181b] border-[#27272a] text-gray-500 hover:text-white hover:border-gray-600'
 }`}
 title="Toggle mask paint mode"
 >
 {regionEdit?.isMaskMode ? 'Mask ON' : 'Mask OFF'}
 </button>
 <button
 onClick={() => dispatch({ type: 'CLEAR_ALL_REGION_MASKS' })}
 className="px-3 py-1.5 bg-[#18181b] hover:bg-red-500/20 border border-[#27272a] text-gray-500 hover:text-red-400 rounded text-[9px] font-bold uppercase transition-colors"
 title="Clear all painted masks"
 >
 Clear All
 </button>
 </div>

 <div className="flex items-center gap-2 mb-3">
 <button
 onClick={() => dispatch({ type: 'SET_REGION_EDIT', payload: { mode: 'paint' } })}
 className={`flex-1 py-2 rounded text-[10px] font-bold uppercase border ${regionEdit?.mode === 'paint'
 ? 'bg-blue-600 text-white border-blue-600'
 : 'bg-[#18181b] text-accent border-[#27272a] hover:bg-[#27272a]'
 }`}
 >
 Paint
 </button>
 <button
 onClick={() => dispatch({ type: 'SET_REGION_EDIT', payload: { mode: 'erase' } })}
 className={`flex-1 py-2 rounded text-[10px] font-bold uppercase border ${regionEdit?.mode === 'erase'
 ? 'bg-blue-600 text-white border-blue-600'
 : 'bg-[#18181b] text-accent border-[#27272a] hover:bg-[#27272a]'
 }`}
 >
 Erase
 </button>
 </div>

 {showSourceAuto && (
 <div className="mb-3 rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-cyan-200">
 {sourceAutoLabel}
 </div>
 )}

 {/* Layer list */}
 <div className="space-y-2 mb-3">
 {layers.map((l) => {
 const active = l.id === regionEdit?.activeLayerId;
 return (
 <div
 key={l.id}
 className={`flex items-center gap-2 p-2 rounded border ${active ? 'border-blue-500 bg-blue-500/5' : 'border-[#27272a] bg-[#0b0b0d]'
 }`}
 >
 <button
 className="flex-1 text-left"
 onClick={() => dispatch({ type: 'SET_REGION_ACTIVE_LAYER', payload: { id: l.id } })}
 title="Select layer to paint"
 >
 <div className="text-[10px] font-bold text-gray-200">{l.name}</div>
 <div className="text-[9px] text-gray-600 font-mono">
 {l.maskDataUrl ? 'MASK' : '--'} {l.prompt?.trim() ? ' / TXT' : ''}
 </div>
 </button>

 <button
 onClick={() =>
 dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: l.id, updates: { enabled: !l.enabled } } })
 }
 className={`px-2 py-1 rounded text-[9px] font-bold uppercase border ${l.enabled ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-[#18181b] border-[#27272a] text-gray-400'
 }`}
 title="Include layer in Apply Queue"
 >
 {l.enabled ? 'ON' : 'OFF'}
 </button>

 <button
 onClick={() => dispatch({ type: 'CLEAR_REGION_LAYER_MASK', payload: l.id })}
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
 <span className="text-blue-400 font-mono">{regionEdit?.brushSize ?? 40}px</span>
 </div>
 <input
 type="range"
 min={5}
 max={200}
 value={regionEdit?.brushSize ?? 40}
 onChange={(e) => dispatch({ type: 'SET_REGION_EDIT', payload: { brushSize: parseInt(e.target.value) } })}
 className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
 />

 <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase font-bold">
 <span>Edge Softness</span>
 <span className="text-blue-400 font-mono">{(regionEdit?.brushSoftness ?? 0.35).toFixed(2)}</span>
 </div>
 <input
 type="range"
 min={0}
 max={1}
 step={0.05}
 value={regionEdit?.brushSoftness ?? 0.35}
 onChange={(e) => dispatch({ type: 'SET_REGION_EDIT', payload: { brushSoftness: parseFloat(e.target.value) } })}
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
 Protect Anatomy
 </label>

 <button
 onClick={generateFaceProtectionMask}
 disabled={!hasApiAccess || protectStatus === 'generating'}
 className="px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 bg-[#18181b] border-[#27272a] text-yellow-500 hover:bg-[#27272a]"
 title="Generate an anatomy protection mask (white = protected)"
 >
 {protectStatus === 'generating' ? 'Generating…' : protectMaskUrl ? 'Regen' : 'Generate'}
 </button>
 </div>

 {protectMaskUrl && (
 <div className="flex flex-col gap-2">
 <div className="flex items-center gap-2">
 <div className="w-12 h-12 rounded border border-[#27272a] bg-black overflow-hidden relative group">
 <img src={protectMaskUrl} className="w-full h-full object-contain opacity-90" alt="Protection Mask" />
 {isProcessing && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><RotateCw className="w-4 h-4 text-white animate-spin" /></div>}
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
 dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: activeLayer.id, updates: { prompt: e.target.value } } })
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
 })
 }
 className="bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-gray-300 h-6 flex items-center justify-center rounded uppercase font-bold tracking-wider transition-colors"
 style={{ fontSize: '11px' }}
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
 className="flex-1 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-gray-300 hover:text-white h-6 flex items-center justify-center rounded font-bold uppercase tracking-wider disabled:opacity-50 transition-colors"
 style={{ fontSize: '11px' }}
 >
 Clear Active
 </button>
 <button
 onClick={() => dispatch({ type: 'CLEAR_ALL_REGION_MASKS' })}
 className="flex-1 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-gray-300 hover:text-white h-6 flex items-center justify-center rounded font-bold uppercase tracking-wider transition-colors"
 style={{ fontSize: '11px' }}
 >
 Clear All
 </button>
 </div>

 <div className="flex gap-2 mt-3">
 <button
 onClick={applyRegionEditQueue}
 disabled={isProcessing || !hasApiAccess || isRegionEditRunning}
 className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black h-8 flex items-center justify-center uppercase tracking-[0.1em] rounded-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
 style={{ fontSize: '12px' }}
 >
 Apply Enabled Layers
 </button>
 <button
 onClick={requestCancelRegionEdit}
 disabled={!isRegionEditRunning}
 className="px-3 h-8 flex items-center justify-center rounded-md font-black uppercase tracking-[0.1em] border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
 style={{ fontSize: '12px' }}
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
};



