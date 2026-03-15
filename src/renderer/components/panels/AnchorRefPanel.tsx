import { ImageIcon, X, Upload as UploadIcon, RefreshCcw, Maximize as MaximizeIcon, Lock, AlertTriangle } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import { Dropdown } from '../ui/Dropdown';
import type { DirectorMergeStrategy, CameraMode, Framing, EnvironmentPreservation } from '../../context/AppContext';

interface AnchorRefPanelProps {
 state: any;
 dispatch: (action: any) => void;
 bgPrompt: string;
 setBgPrompt: (val: string) => void;
 generateBg: () => void;
 anchorFileInputRef: React.RefObject<HTMLInputElement | null>;
 fileToDataUrl: (file: File) => Promise<string>;
 setDirector: (updates: any) => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart: (id: string) => void;
 onDrop: (targetId: string) => void;
}

export const AnchorRefPanel = ({
 state,
 dispatch,
 bgPrompt,
 setBgPrompt,
 generateBg,
 anchorFileInputRef,
 fileToDataUrl,
 setDirector,
 collapsed,
 onToggle,
 onDragStart,
 onDrop
}: AnchorRefPanelProps) => {
 return (
 <SidebarPanel
 key="anchor"
 id="anchor"
 title="Scene Generator"
 icon={ImageIcon}
 headerColor="text-purple-500"
 collapsed={collapsed}
 onToggle={onToggle}
 onDragStart={onDragStart}
 onDrop={onDrop}
 >
 <div className="space-y-3">
 <div className="aspect-video bg-black/40 rounded border border-[#27272a] overflow-hidden relative group cursor-pointer"
 onClick={() => anchorFileInputRef.current?.click()}>
 {state.backgroundUrl ? (
 <>
 <img src={state.backgroundUrl} className="w-full h-full object-contain transition-all duration-500" />
 <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button
 onClick={(e) => {
 e.stopPropagation();
 dispatch({ type: 'SET_BG', payload: null });
 }}
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
 <span className="text-[9px] font-bold uppercase tracking-widest text-center">Drag / Paste<br />Scene Reference</span>
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
            <div className="space-y-3">
                
                {/* Explicit Spatial Controls */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Camera Mode</label>
                        <Dropdown
                            value={state.director.cameraMode || 'locked'}
                            options={[
                                { type: "option", label: 'Locked View', value: 'locked' },
                                { type: "option", label: 'Reframed Crop', value: 'reframed' },
                                { type: "option", label: 'Repositioned Camera', value: 'repositioned' }
                            ]}
                            onChange={(v) => setDirector({ cameraMode: v as CameraMode })}
                        />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Framing</label>
                        <Dropdown
                            value={state.director.framing || 'full_body'}
                            options={[
                                { type: "option", label: 'Wide Shot', value: 'wide' },
                                { type: "option", label: 'Full Body', value: 'full_body' },
                                { type: "option", label: 'Three-Quarter', value: 'three_quarter' },
                                { type: "option", label: 'Medium Shot', value: 'medium' },
                                { type: "option", label: 'Close-Up', value: 'close_up' }
                            ]}
                            onChange={(v) => setDirector({ framing: v as Framing })}
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Environment</label>
                        <Dropdown
                            value={state.director.environmentPreservation || 'high'}
                            options={[
                                { type: "option", label: 'Exact', value: 'exact' },
                                { type: "option", label: 'High', value: 'high' },
                                { type: "option", label: 'Moderate', value: 'moderate' },
                                { type: "option", label: 'Loose', value: 'loose' }
                            ]}
                            onChange={(v) => setDirector({ environmentPreservation: v as EnvironmentPreservation })}
                        />
                    </div>
                </div>

                {/* Compatibility Warning */}
                {state.director.cameraMode === 'repositioned' && state.director.environmentPreservation === 'exact' && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 flex gap-2 items-start mt-2">
                        <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                        <p className="text-[9px] text-orange-200/80 leading-snug">
                            <span className="font-bold text-orange-400">Environment Conflict:</span> Exact environment preservation is not fully compatible with a repositioned camera. The scene will be reconstructed from a new viewpoint, so some surrounding elements may be naturally reinterpreted.
                        </p>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                        <input
                            className="flex-1 bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[10px] text-gray-300 resize-none focus:border-blue-500 outline-none"
                            placeholder="Optional lighting, mood, or scene notes..."
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
                            disabled={
                                state.isProcessing || 
                                !(
                                    !!bgPrompt.trim() || !!state.backgroundUrl ||
                                    (state.director.cameraMode || 'locked') !== 'locked' ||
                                    (state.director.framing || 'full_body') !== 'full_body' ||
                                    (state.director.environmentPreservation || 'high') !== 'high'
                                )
                            }
                            className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded flex items-center justify-center disabled:opacity-50 disabled:bg-gray-800"
                            title="Generate Background"
                        >
                            {state.isProcessing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <MaximizeIcon className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <p className="text-[8px] text-gray-500 italic px-1">Text is optional when using the spatial controls above.</p>
                </div>

                <div className="mt-4 flex gap-2 items-end">
 <div className="flex-1 flex flex-col gap-1">
 <label className="text-[10px] uppercase font-bold text-gray-500">Merge Strategy</label>
 <Dropdown
 value={state.director.mergeStrategy}
 options={['Character Identity', 'Style Transfer', 'Composition Reference', 'Photo Merge'].map(v => ({ type: "option", label: v, value: v }))}
 onChange={(v) => setDirector({ mergeStrategy: v as DirectorMergeStrategy })}
 />
 </div>
 <button
 onClick={() => setDirector({ sceneLock: !state.director.sceneLock })}
 className={`h-[38px] min-w-[50px] rounded flex flex-col items-center justify-center border transition-all ${state.director.sceneLock ? 'bg-purple-500/20 border-purple-500 text-purple-400 -[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-[#18181b] border-[#27272a] text-gray-600 hover:text-gray-400 hover:border-gray-700'}`}
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
};



