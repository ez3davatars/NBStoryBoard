import { SidebarPanel } from '../ui/SidebarPanel';
import { Sparkles, RefreshCcw } from 'lucide-react';
import { GeminiService } from '../../services/GeminiService';
import type { GroundingAudit } from '../../context/AppContext';
import { DebouncedTextarea } from '../ui/DebouncedTextarea';

interface ActorIntelligencePanelProps {
 state: any;
 dispatch: (action: any) => void;
 updateToken: (id: string, updates: any) => void;
 authorityStatus: string;
 analyzingTokenId: string | null;
 setAnalyzingTokenId: (id: string | null) => void;
 showDebugDepthMap: boolean;
 setShowDebugDepthMap: (val: boolean) => void;
 showDebugFloor: boolean;
 setShowDebugFloor: (val: boolean) => void;
 showDebugVolumes: boolean;
 setShowDebugVolumes: (val: boolean) => void;
 showDebugBands: boolean;
 setShowDebugBands: (val: boolean) => void;
 showDebugActorHUD: boolean;
 setShowDebugActorHUD: (val: boolean) => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart: (id: string) => void;
 onDrop: (targetId: string) => void;
 onRefreshSpatialData: () => void;
}

export const ActorIntelligencePanel = ({
 state,
 dispatch,
 updateToken,
 authorityStatus,
 analyzingTokenId,
 setAnalyzingTokenId,
 showDebugDepthMap,
 setShowDebugDepthMap,
 showDebugFloor,
 setShowDebugFloor,
 showDebugVolumes,
 setShowDebugVolumes,
 showDebugBands,
 setShowDebugBands,
 showDebugActorHUD: showDebugActorOverlay,
 setShowDebugActorHUD: setShowDebugActorOverlay,
 collapsed,
 onToggle,
 onDragStart,
 onDrop,
 onRefreshSpatialData
}: ActorIntelligencePanelProps) => {
 return (
 <SidebarPanel
 id="actor_intel"
 title="Actor Intelligence"
 icon={Sparkles}
 collapsed={collapsed}
 onToggle={onToggle}
 onDragStart={onDragStart}
 onDrop={onDrop}
 draggable={false}
 headerColor={authorityStatus === 'AUTHORITATIVE' ? 'text-green-400' : authorityStatus === 'DEGRADED' ? 'text-amber-400' : 'text-red-500'}
 rightElement={
 <div className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black tracking-tight uppercase border transition-colors ${authorityStatus === 'AUTHORITATIVE' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
 authorityStatus === 'DEGRADED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
 'bg-red-500/10 text-red-500 border-red-500/30'
 }`}>
 {authorityStatus === 'AUTHORITATIVE' ? 'Locked' :
 authorityStatus === 'DEGRADED' ? 'Limited' :
 'Unavailable'}
 </div>
 }
 >
 {/* TECHNICAL DEBUG (DEV ONLY) */}
 {import.meta.env.DEV && (
 <div className="mb-4 p-2 bg-[#1c1c1f] rounded-lg border border-[#27272a] space-y-2">
 <h5 className="text-[9px] font-black text-blue-400/80 uppercase tracking-tighter mb-1">
 Debug Overlays
 </h5>
 <div className="grid grid-cols-2 gap-2">
 {/* 1. Depth Map (with Loading State) & Refresh */}
 <div className="flex gap-1 items-center">
 <button
 onClick={() => setShowDebugDepthMap(!showDebugDepthMap)}
 disabled={state.isDepthProcessing}
 className={`flex-1 px-2 py-2 text-[8px] font-bold rounded border transition-colors flex items-center justify-center gap-1 ${state.isDepthProcessing ? 'bg-blue-900/10 text-blue-300/50 border-blue-500/10 cursor-wait' : showDebugDepthMap ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-500 border-white/5'}`}
 title="Visualizes the projected high-fidelity depth map. Lighter values represent closer objects."
 >
 {state.isDepthProcessing && <RefreshCcw className="w-2.5 h-2.5 animate-spin" />}
 {state.isDepthProcessing ? 'Generating...' : 'Depth Map'}
 </button>
 <button
 onClick={onRefreshSpatialData}
 disabled={state.isDepthProcessing}
 className="px-2 py-2 bg-blue-900/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
 title="Force Refresh: Regenerate Depth Map & Floor Plane"
 >
 <RefreshCcw className="w-3 h-3" />
 </button>
 </div>

 {/* 2. Floor Plane */}
 <button
 onClick={() => setShowDebugFloor(!showDebugFloor)}
 className={`px-2 py-2 text-[8px] font-bold rounded border transition-colors ${showDebugFloor ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-500 border-white/5'}`}
 title="Visualizes the detected ground plane (cyan line). This 'Grounding Baseline' triggers automatic foot placement for actors."
 >
 Floor Plane
 </button>

 {/* 3. Volumes */}
 <button
 onClick={() => setShowDebugVolumes(!showDebugVolumes)}
 className={`px-2 py-2 text-[8px] font-bold rounded border transition-colors ${showDebugVolumes ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-500 border-white/5'}`}
 title="Visualizes occupied 3D volumes (amber boxes). These represent furniture or obstacles that actors can walk behind or in front of."
 >
 Volumes
 </button>

 {/* 4. Bands */}
 <button
 onClick={() => setShowDebugBands(!showDebugBands)}
 className={`px-2 py-2 text-[8px] font-bold rounded border transition-colors ${showDebugBands ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-500 border-white/5'}`}
 title="Visualizes the depth 'slice' assigned to each actor in the scene."
 >
 Depth Bands
 </button>

 {/* 5. HUD */}
 <button
 onClick={() => setShowDebugActorOverlay(!showDebugActorOverlay)}
 className={`px-2 py-2 text-[8px] font-bold rounded border transition-colors col-span-2 ${showDebugActorOverlay ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-500 border-white/5'}`}
 title="Overlays raw spatial metrics (Z-Index, Depth Score) on top of each actor."
 >
 Actor HUD
 </button>
 </div>
 </div>
 )}

 <div className="space-y-3">
 {state.tokens.length === 0 ? (
 <div className="text-[10px] text-gray-600 italic py-4 border border-dashed border-gray-800 rounded-lg text-center">
 No actors on stage.
 </div>
 ) : (
 state.tokens.map((token: any) => (
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
 <div className="flex flex-col gap-2">
 <DebouncedTextarea
 value={token.intelligence || ''}
 onChange={(val) => dispatch({ type: 'UPDATE_TOKEN', payload: { id: token.id, intelligence: val } })}
 className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-[10px] text-gray-400 focus:border-blue-500 outline-none resize-none"
 rows={2}
 placeholder="Pose, Action, Lighting DNA..."
 />

 {/* Grounding Control */}
 <div className="flex items-center justify-between gap-2 px-1">
 <button
 onClick={() => {
 const nextGrounding = !token.groundingEnabled;
 if (nextGrounding && state.floorPlane?.confidence === 'fallback' && !token.manualGroundingOverride) {
 dispatch({ type: 'ADD_LOG', payload: { message: "GROUNDING BLOCKED: Low-confidence floor detection.", type: 'info' } });
 return;
 }

 const audit: GroundingAudit | undefined = nextGrounding && state.floorPlane?.confidence === 'fallback' && token.manualGroundingOverride
 ? { overriddenAt: Date.now(), confidenceAtTime: 'fallback' }
 : token.groundingAudit;

 dispatch({
 type: 'UPDATE_TOKEN', payload: {
 id: token.id,
 groundingEnabled: nextGrounding,
 depth: nextGrounding && state.floorPlane ? (state.floorPlane.depth / 255) : token.depth,
 groundingAudit: audit
 }
 });
 }}
 className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[9px] font-bold uppercase transition-all ${token.groundingEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800/50 text-gray-500 border border-gray-700/50 hover:bg-gray-800'}`}
 >
 <div className={`w-1.5 h-1.5 rounded-full ${token.groundingEnabled ? 'bg-emerald-400 -[0_0_4px_rgba(52,211,153,0.5)]' : 'bg-gray-600'}`} />
 Grounding
 </button>

 <div className="flex-1 flex items-center gap-2 bg-black/40 px-2 py-1 rounded border border-white/5">
 <input
 type="checkbox"
 id={`manual-${token.id}`}
 checked={token.manualGroundingOverride || false}
 onChange={(e) => {
 const checked = e.target.checked;
 const auditData = checked && state.floorPlane?.confidence === 'fallback'
 ? { overriddenAt: Date.now(), confidenceAtTime: 'fallback' as const }
 : undefined;

 dispatch({
 type: 'UPDATE_TOKEN', payload: {
 id: token.id,
 manualGroundingOverride: checked,
 groundingAudit: auditData
 }
 });
 }}
 className="w-3 h-3 rounded bg-zinc-800 border-zinc-700 text-yellow-500"
 />
 <label htmlFor={`manual-${token.id}`} className="text-[8px] font-bold text-gray-500 uppercase cursor-pointer select-none">Manual</label>
 </div>
 </div>

 <div className="mt-2 pt-2 border-t border-white/5">
 <div className="flex items-center justify-between mb-2">
 <label className="text-[9px] font-bold text-gray-500 uppercase">Anchor Depth</label>
 {token.spatialDescriptor && (
 <div className="text-[7px] font-mono text-blue-400 uppercase font-black">{token.spatialDescriptor.depthLayer}</div>
 )}
 </div>
 <div className="grid grid-cols-3 gap-1 mb-2">
 {(['foreground', 'midground', 'background'] as const).map(layer => (
 <button
 key={layer}
 onClick={() => updateToken(token.id, { anchorLayer: layer })}
 className={`py-1 rounded text-[9px] font-bold uppercase border transition-all ${token.anchorLayer === layer ? 'bg-blue-600 border-blue-400 text-white -[0_0_8px_rgba(37,99,235,0.3)]' : 'bg-black/40 border-white/5 text-gray-600 hover:text-gray-400 hover:border-white/10'}`}
 >
 {layer === 'foreground' ? 'Fore' : layer === 'midground' ? 'Mid' : 'Back'}
 </button>
 ))}
 </div>
 </div>
 </div>
 </div>
 ))
 )}
 </div>
 </SidebarPanel>
 );
};



