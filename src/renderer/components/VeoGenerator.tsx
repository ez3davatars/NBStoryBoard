import { useEffect, useMemo, useState } from 'react';
import {
 Trash2, MonitorPlay, Image as ImageIcon,
 X, Lock, Unlock, Sparkles, RotateCw, Film, Copy
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const InspectorSection = ({ title, children, defaultOpen = true, titleAddon }: any) => (
 <details open={defaultOpen} className="group rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0">
 <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/80 select-none bg-white/5 hover:bg-white/10 transition-colors">
 <div className="flex items-center gap-2">
 {title}
 {titleAddon}
 </div>
 <svg className="w-4 h-4 text-white/40 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
 </svg>
 </summary>
 <div className="p-4 pt-2 space-y-3 border-t border-white/5">
 {children}
 </div>
 </details>
);

const VeoGenerator = ({ smartAnalyze }: { smartAnalyze: any }) => {
 const { state, dispatch } = useAppContext();
 const { analysisResult, isAnalyzing, runSmartAnalyze: doSmartAnalyze, setAnalysisResult } = smartAnalyze;
 const [strictCharacterAds, setStrictCharacterAds] = useState(true);
 const [continuityLockEnabled, setContinuityLockEnabled] = useState(true);
 const [noExtraObjects, setNoExtraObjects] = useState(true);
 const [noMorph, setNoMorph] = useState(true);
 const [activeSlot, setActiveSlot] = useState<1 | 2>(1);


 // --- Shot Sync (from AppContext Shot List) ---
 const activeShot = useMemo(() => {
 const shots = (state as any).shots as any[] | undefined;
 const activeShotId = (state as any).activeShotId as string | undefined;
 if (!shots || !activeShotId) return null;
 return shots.find((s) => s.id === activeShotId) || null;
 }, [state]);

 const loadFramesFromActiveShot = () => {
 if (!activeShot) return;

 const startUrl = activeShot.startFrameUrl as string | undefined;
 const endUrl = activeShot.endFrameUrl as string | undefined;

 if (startUrl) {
 dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: { url: startUrl } });
 }
 if (endUrl) {
 dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: { url: endUrl } });
 }

 dispatch({
 type: 'ADD_LOG',
 payload: {
 message: `Loaded frames from Active Shot: ${activeShot.name || activeShot.id}`,
 type: 'success'
 }
 });
 };

 // Auto-load frames if user has an active shot and both slots are empty.
 useEffect(() => {
 if (!activeShot) return;
 if (state.storyboardSource || state.storyboardEndSource) return;

 const startUrl = activeShot.startFrameUrl as string | undefined;
 const endUrl = activeShot.endFrameUrl as string | undefined;

 if (startUrl) dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: { url: startUrl } });
 if (endUrl) dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: { url: endUrl } });
 }, [activeShot, state.storyboardSource, state.storyboardEndSource, dispatch]);




 const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
 const file = e.target.files?.[0];
 if (file) {
 const reader = new FileReader();
 reader.onload = (ev) => {
 const payload = { url: ev.target?.result as string };
 dispatch({ type: slot === 1 ? 'SET_STORYBOARD_SOURCE' : 'SET_STORYBOARD_END_SOURCE', payload });
 };
 reader.readAsDataURL(file);
 }
 };

 const runSmartAnalyze = async () => {
    const startUrl = (activeShot?.startFrameUrl as string | undefined) ?? state.storyboardSource?.url;
    const endUrl = (activeShot?.endFrameUrl as string | undefined) ?? state.storyboardEndSource?.url;
    const draftSource = activeShot ? activeShot.veoPromptDraft : state.veoPromptDraft;

    await doSmartAnalyze({
        apiKey: state.apiKey,
        model: state.model,
        startUrl,
        endUrl,
        tokens: state.tokens,
        strictCharacterAds,
        continuityLockEnabled,
        noExtraObjects,
        noMorph,
        dispatch,
        injectPromptDraft: draftSource
    });
 };



 return (
 <div className="flex flex-col h-full text-gray-200">
 <div className="flex-1 h-full min-h-0 overflow-y-auto p-4 pb-6 space-y-4">

 {/* Header */}
 <div className="flex items-center justify-between shrink-0 mb-2">
 <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
 <MonitorPlay className="w-4 h-4 text-blue-500" /> Keyframe Engine
 </h3>
 <button
 onClick={() => {
 dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: null });
 dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: null });
 dispatch({ type: 'SET_STORYBOARD_GENERATIONS', payload: [] });
 setAnalysisResult('');
 }}
 className="text-[9px] font-bold text-gray-500 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 bg-white/5 rounded border border-white/5"
 >
 <Trash2 className="w-3 h-3" /> Reset
 </button>
 </div>

 <InspectorSection title="Temporal Director" defaultOpen={true}>
 <div className="flex bg-black/40 p-1 rounded-lg border border-white/5 mx-auto mb-2 w-full justify-center">
 <button
 onClick={() => setActiveSlot(1)}
 className={`flex-1 py-1 rounded text-[9px] font-bold uppercase transition-all ${activeSlot === 1 ? 'bg-blue-600 text-white ' : 'text-gray-600 hover:text-gray-400'}`}
 >Start Plate</button>
 <button
 onClick={() => setActiveSlot(2)}
 className={`flex-1 py-1 rounded text-[9px] font-bold uppercase transition-all ${activeSlot === 2 ? 'bg-indigo-600 text-white ' : 'text-gray-600 hover:text-gray-400'}`}
 >End Plate</button>
 </div>

 <div className="grid grid-cols-2 gap-3">
 {/* START FRAME SLOT */}
 <div className={`relative aspect-[3/4] rounded-xl border-2 border-dashed overflow-hidden group transition-all ${state.storyboardSource ? 'border-blue-500/50 bg-black' : 'border-white/10 bg-black/50 hover:border-white/20'}`}>
 {state.storyboardSource ? (
 <img src={state.storyboardSource.url} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
 <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
 <span className="text-[8px] font-black uppercase tracking-widest text-center">Drop<br />Start</span>
 </div>
 )}
 <input type="file" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={(e) => handleUpload(e, 1)} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
 {state.storyboardSource && (
 <button
 onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: null }); }}
 className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
 ><X className="w-3 h-3" /></button>
 )}
 </div>

 {/* END FRAME SLOT */}
 <div className={`relative aspect-[3/4] rounded-xl border-2 border-dashed overflow-hidden group transition-all ${state.storyboardEndSource ? 'border-indigo-500/50 bg-black' : 'border-white/10 bg-black/50 hover:border-white/20'}`}>
 {state.storyboardEndSource ? (
 <img src={state.storyboardEndSource.url} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
 <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
 <span className="text-[8px] font-black uppercase tracking-widest text-center">Drop<br />End</span>
 </div>
 )}
 <input type="file" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={(e) => handleUpload(e, 2)} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
 {state.storyboardEndSource && (
 <button
 onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: null }); }}
 className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
 ><X className="w-3 h-3" /></button>
 )}
 </div>
 </div>

 {/* Shot Sync */}
 {activeShot && (
 <div className="p-2 bg-black/30 rounded-lg border border-white/5 flex flex-col gap-2 mt-2">
 <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
 Active Shot Sync
 <span className="text-[8px] font-mono text-yellow-500 truncate max-w-[80px]">{activeShot.name || activeShot.id}</span>
 </div>
 <div className="flex gap-2">
 <button
 onClick={loadFramesFromActiveShot}
 className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-[8px] uppercase tracking-widest rounded transition-all border border-white/5"
 >Load</button>
 <button
 onClick={async () => {
 if (!activeShot) return;
 loadFramesFromActiveShot();
 await runSmartAnalyze();
 }}
 className="flex-1 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-bold text-[8px] uppercase tracking-widest rounded transition-all border border-blue-500/20"
 >Load & Sync</button>
 </div>
 </div>
 )}
 </InspectorSection>

 <InspectorSection title="Advanced DNA Controls" defaultOpen={false}>
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex flex-col">
 <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Character Adherence</span>
 <span className="text-[8px] text-gray-500 font-mono">Inject Whitelist</span>
 </div>
 <button
 onClick={() => setStrictCharacterAds(!strictCharacterAds)}
 className={`p-1.5 rounded-lg border transition-all ${strictCharacterAds ? 'bg-green-500/20 border-green-500/40 text-green-500' : 'bg-black/40 border-white/10 text-gray-600'}`}
 >
 {strictCharacterAds ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
 </button>
 </div>

 <div className="flex items-center justify-between">
 <div className="flex flex-col">
 <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Continuity Lock</span>
 <span className="text-[8px] text-gray-500 font-mono">Anti-morph + no drift</span>
 </div>
 <button
 onClick={() => setContinuityLockEnabled(!continuityLockEnabled)}
 className={`p-1.5 rounded-lg border transition-all ${continuityLockEnabled ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-black/40 border-white/10 text-gray-600'}`}
 >
 {continuityLockEnabled ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
 </button>
 </div>

 <div className="flex items-center justify-between border-t border-white/5 pt-2">
 <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">No Extra Objects</span>
 <button
 onClick={() => setNoExtraObjects(!noExtraObjects)}
 className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border transition-all ${noExtraObjects ? 'bg-blue-500/10 border-blue-500/20 text-blue-200' : 'bg-black/50 border-white/10 text-gray-500'}`}
 >
 {noExtraObjects ? 'ON' : 'OFF'}
 </button>
 </div>

 <div className="flex items-center justify-between">
 <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">No Morphing</span>
 <button
 onClick={() => setNoMorph(!noMorph)}
 className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border transition-all ${noMorph ? 'bg-blue-500/10 border-blue-500/20 text-blue-200' : 'bg-black/50 border-white/10 text-gray-500'}`}
 >
 {noMorph ? 'ON' : 'OFF'}
 </button>
 </div>
 </div>
 </InspectorSection>

 <InspectorSection title="Advanced: Raw JSON Spec" defaultOpen={false}>
 <div className="flex items-center justify-between mb-2">
 <h4 className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Veo 3.1 Prompt Output</h4>
 {analysisResult && (
 <button
 onClick={() => navigator.clipboard.writeText(analysisResult)}
 className="p-1 px-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded border border-white/5 transition-all flex items-center gap-1 text-[8px] font-bold uppercase"
 >
 <Copy className="w-2.5 h-2.5" /> Copy
 </button>
 )}
 </div>
 <div className={`w-full h-40 bg-black/40 rounded-lg border border-white/5 p-3 font-mono text-[9px] leading-relaxed overflow-y-auto ${isAnalyzing ? 'animate-pulse' : ''}`}>
 {isAnalyzing ? (
 <div className="flex flex-col items-center justify-center h-full text-blue-500">
 <RotateCw className="w-4 h-4 animate-spin mb-2" />
 <span className="text-[8px] font-black uppercase tracking-widest">Synthesizing...</span>
 </div>
 ) : analysisResult ? (
 <div className="text-gray-300">
 <span className="text-blue-400 font-bold block mb-2 border-b border-blue-500/20 pb-1">STRICT_CONSISTENCY_PROTOCOL_v3.1</span>
 {analysisResult.split('\n').map((line: string, i: number) => (
 <p key={i} className={line.startsWith('[') ? 'text-blue-500 font-bold mt-1' : ''}>{line}</p>
 ))}
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center h-full opacity-30 text-gray-500">
 <Film className="w-6 h-6 mb-2" />
 <span className="text-[8px] font-black uppercase tracking-widest text-center">Empty JSON</span>
 </div>
 )}
 </div>
 </InspectorSection>

 </div>

 {/* Anchored Action Panel */}
 <div className="shrink-0 p-4 border-t border-white/10 bg-black/40 backdrop-blur-md flex flex-col gap-2">
 <button
 onClick={runSmartAnalyze}
 disabled={(!(activeShot?.startFrameUrl || state.storyboardSource) && !(activeShot?.endFrameUrl || state.storyboardEndSource)) || isAnalyzing}
 className="w-full py-2.5 rounded-full flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all bg-gradient-to-r from-yellow-400 to-amber-500 text-black hover:scale-[1.02] -[0_0_15px_rgba(250,204,21,0.3)] disabled:opacity-50 disabled:scale-100"
 >
 {isAnalyzing ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
 {isAnalyzing ? 'Analyzing DNA...' : 'Smart Analyze'}
 </button>
 </div>

 </div>
 );
};

export default VeoGenerator;



