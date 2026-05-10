import { ImageIcon, X, Upload as UploadIcon, RefreshCcw, Maximize as MaximizeIcon, Lock, Sparkles, Trash2 } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import { Dropdown } from '../ui/Dropdown';
import { getEffectiveResultAnchorForScene } from '../../context/AppContext';
import type { DirectorMergeStrategy } from '../../context/AppContext';
import type { Action, AppState, DirectorSettings, StageToken } from '../../context/AppContext';
import { buildSourceImageMeta, getImageIntrinsicSize } from '../../utils/sourceImageSizing';

type ExtractedStyle = {
 styleSummary?: string;
} | null;

type SceneIntent = {
 location?: string;
 action?: string;
 furniture?: string[];
 propContext?: string[];
} | null;

interface AnchorRefPanelProps {
 state: AppState;
 dispatch: React.Dispatch<Action>;
 bgPrompt: string;
 setBgPrompt: (val: string) => void;
 generateBg: () => void;
 anchorFileInputRef: React.RefObject<HTMLInputElement | null>;
 fileToDataUrl: (file: File) => Promise<string>;
 setDirector: (updates: Partial<DirectorSettings>) => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart: (id: string) => void;
 onDrop: (targetId: string) => void;
 
 // Style Transfer Props
 selectedTokenId: string | null;
 isAnalyzingStyle: boolean;
 extractedStyle: ExtractedStyle;
 handleAutoStyleEnvironment: () => void;
 sceneIntent?: SceneIntent;
 previousBackgroundUrl?: string | null;
 onRestoreBackground?: () => void;
 style?: React.CSSProperties;
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
 onDrop,
 selectedTokenId,
 isAnalyzingStyle,
 extractedStyle,
 handleAutoStyleEnvironment,
 sceneIntent,
 previousBackgroundUrl,
 onRestoreBackground,
 style
}: AnchorRefPanelProps) => {
  const activeShotId = state.activeShotId || 'default';
  const currentAnchor = getEffectiveResultAnchorForScene(state, activeShotId);
  const isCurrentSource = currentAnchor?.kind === 'uploaded_result' && currentAnchor?.imageUrl === state.backgroundUrl;

  const handlePromoteToResult = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!state.backgroundUrl) return;
    dispatch({
      type: 'SET_SCENE_RESULT_ANCHOR',
          payload: {
        sceneId: activeShotId,
        anchor: { 
          kind: 'uploaded_result', 
          imageUrl: state.backgroundUrl, 
          sourceImageId: 'background',
          visibleActorCount: state.tokens.filter((t: StageToken) => t.elementType === 'actor' || !t.elementType).length
        }
      }
    });
    dispatch({ type: 'ADD_LOG', payload: { message: "Uploaded image set as SHOTS source.", type: 'success' } });
  };

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
 style={style}
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
 const inputEl = anchorFileInputRef.current;
 const file = e.target.files?.[0];
 if (file) {
 const url = await fileToDataUrl(file);
 dispatch({ type: 'SET_BG', payload: url });
 try {
 const dimensions = await getImageIntrinsicSize(url);
 const sourceImageMeta = buildSourceImageMeta(dimensions.width, dimensions.height);
 if (sourceImageMeta) {
 dispatch({
 type: 'SET_REGION_EDIT',
 payload: {
 contextSizingMode: 'source-auto',
 sourceImageMeta
 }
 });
 }
 } catch (error) {
 console.warn('[Region Edit] Could not read uploaded source dimensions.', error);
 }
 }
 if (inputEl) inputEl.value = '';
 }}
 />
 </div>

  {state.backgroundUrl && (
      <div className="flex items-center justify-between">
          {isCurrentSource ? (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-400 uppercase tracking-widest bg-orange-500/10 px-2 py-1.5 rounded border border-orange-500/30 w-full justify-center">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Current SHOTS Source
              </div>
          ) : (
              <button
                  onClick={handlePromoteToResult}
                  className="flex items-center gap-1.5 w-full justify-center text-[10px] font-bold text-gray-300 hover:text-white uppercase tracking-widest bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded border border-[#27272a] hover:border-gray-500 transition-colors"
                  title="Use this uploaded image as the direct source for SHOTS coverage"
              >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Use as Result
              </button>
          )}
      </div>
  )}

 {/* Anchor Tools */}
            <div className="space-y-3">
                
                <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                        <textarea
                            rows={2}
                            className="min-w-0 flex-1 min-h-[2.5rem] max-h-24 bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[10px] text-gray-300 resize-y overflow-y-auto custom-scrollbar focus:border-blue-500 outline-none leading-snug"
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
                        <div className="flex flex-col gap-1 shrink-0">
                            <button
                                onClick={generateBg}
                                disabled={
                                    state.isProcessing || 
                                    !(!!bgPrompt.trim() || !!state.backgroundUrl)
                                }
                                className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded flex items-center justify-center disabled:opacity-50 disabled:bg-gray-800 transition-colors"
                                title="Generate Background"
                            >
                                {state.isProcessing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <MaximizeIcon className="w-3.5 h-3.5" />}
                            </button>
                            <button
                                onClick={() => setBgPrompt('')}
                                disabled={!bgPrompt.trim()}
                                className="bg-[#18181b] hover:bg-red-500/20 text-gray-500 hover:text-red-300 p-2 rounded flex items-center justify-center border border-[#27272a] hover:border-red-500/40 disabled:opacity-30 disabled:hover:bg-[#18181b] disabled:hover:text-gray-500 disabled:hover:border-[#27272a] transition-colors"
                                title="Clear Scene Notes"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    
                    {/* Style Transfer Button */}
                    <div className="flex flex-col gap-1 mt-1">
                        <button
                            onClick={handleAutoStyleEnvironment}
                            disabled={isAnalyzingStyle || !selectedTokenId || !state.tokens.find((t: StageToken) => t.id === selectedTokenId)}
                            className={`relative w-full overflow-hidden py-2 px-2 border rounded text-[10px] uppercase font-black tracking-wider transition-all flex items-center justify-center gap-2 ${
                                isAnalyzingStyle
                                    ? 'border-fuchsia-300/60 bg-gradient-to-r from-fuchsia-600 via-cyan-500 to-amber-400 text-white shadow-[0_0_24px_rgba(34,211,238,0.35)] animate-pulse'
                                    : extractedStyle
                                        ? 'border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-purple-500/20 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.18)] hover:border-emerald-300/70 hover:text-white'
                                        : 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 disabled:opacity-30 disabled:hover:bg-blue-500/10'
                            }`}
                        >
                            {isAnalyzingStyle ? (
                                <>
                                    <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.28)_35%,transparent_70%)] animate-shimmer" />
                                    <RefreshCcw className="relative z-10 w-3.5 h-3.5 animate-spin" />
                                    <span className="relative z-10">Analyzing character aesthetic...</span>
                                </>
                            ) : extractedStyle ? (
                                <>
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                                    Style Locked
                                    <span className="text-cyan-200">/ Auto-Style Again</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                                    Auto-Style Environment
                                </>
                            )}
                        </button>
                        {isAnalyzingStyle && (
                            <div className="h-1 rounded-full bg-black/50 border border-white/5 overflow-hidden">
                                <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-purple-400 via-cyan-300 to-yellow-300 animate-style-scan" />
                            </div>
                        )}
                        {extractedStyle && !isAnalyzingStyle && (
                            <div className="text-[9px] text-blue-300/70 italic px-1 leading-tight border-l border-blue-500/30 ml-1 pl-2">
                                Style locked: {extractedStyle.styleSummary}
                            </div>
                        )}
                        {sceneIntent && !isAnalyzingStyle && (
                            <div className="text-[9px] text-emerald-400/80 italic px-1 leading-tight border-l border-emerald-500/30 ml-1 pl-2 flex justify-between items-start mt-1">
                                <span>Scene Intent: {
                                    [sceneIntent.location, sceneIntent.action, ...(sceneIntent.furniture || []), ...(sceneIntent.propContext || [])]
                                        .filter(Boolean)
                                        .join(', ') || 'No core elements detected'
                                }</span>
                            </div>
                        )}
                        {previousBackgroundUrl && onRestoreBackground && (
                            <button
                                onClick={onRestoreBackground}
                                className="mt-1 text-[8px] uppercase tracking-wider text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-1.5 py-0.5 self-start ml-1 transition-colors"
                            >
                                Revert Background
                            </button>
                        )}
                        {!extractedStyle && !isAnalyzingStyle && (
                            <p className="text-[8px] text-gray-500 italic px-1">Select an actor on stage to extract their style.</p>
                        )}
                    </div>

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



