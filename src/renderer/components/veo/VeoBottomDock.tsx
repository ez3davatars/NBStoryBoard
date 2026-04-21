import { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Copy, Check, Terminal, FileCode2, ChevronDown } from 'lucide-react';
import { formatVeoTimestampSequence, buildCombinedPrompt } from '../../promptEngine/veoFivePart';

interface VeoBottomDockProps {
 mode: 'builder' | 'keyframes' | 'timeline';
}

export default function VeoBottomDock({ mode }: VeoBottomDockProps) {
 const { state, dispatch } = useAppContext();
 const [showCopied, setShowCopied] = useState(false);
 const [showNegCopied, setShowNegCopied] = useState(false);

 // Attempt to parse out the live draft content from the active shot
 const activeShot = state.shots.find(s => s.id === state.activeShotId);
 const draft = activeShot?.veoPromptDraft;

 const formattedPrompt = useMemo(() => {
 if (!activeShot) return "No active shot selected.";

 if (mode === 'timeline') {
 const beats = activeShot.veoTimeline || [];
 if (beats.length === 0) return "No timestamp sequence defined.";
 return formatVeoTimestampSequence(beats);
 }

 if (!draft) return "No active draft available. Select a shot and start building your prompt.";
 const combined = buildCombinedPrompt(draft, draft.audio, undefined, draft.negativePrompt);
    const base = combined.prompt || "Draft is empty...";

 
 return base;
 }, [activeShot, draft, mode]);

 const negativePrompt = draft?.negativePrompt || "No negative prompt assigned.";

 const handleCopy = (text: string, isNegative: boolean) => {
 if (!text || text.includes("No active shot") || text.includes("No active draft") || text.includes("Draft is empty") || text.includes("No timestamp sequence")) return;

 navigator.clipboard.writeText(text);
 if (isNegative) {
 setShowNegCopied(true);
 setTimeout(() => setShowNegCopied(false), 2000);
 } else {
 setShowCopied(true);
 setTimeout(() => setShowCopied(false), 2000);
 }
 dispatch({ type: 'ADD_LOG', payload: { message: `Copied ${isNegative ? 'Negative ' : ''}${mode === 'timeline' ? 'Sequence' : 'Prompt'} to clipboard`, type: 'info' } });
 };



 return (
 <div className="h-full w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl ring-1 ring-white/5 flex flex-col min-h-0 overflow-hidden relative group">

 <div className="h-full min-h-0 overflow-y-auto p-4 pb-6 flex flex-col">
 {/* Output Header */}
 <div className="flex items-center justify-between mb-3 shrink-0">
 <div className="flex items-center gap-2">
 <Terminal className="w-4 h-4 text-emerald-400" />
 <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
 Compiled Output <span className="text-white/30 px-1">|</span> <span className="text-emerald-400">{mode === 'timeline' ? 'Sequence' : 'Prompt'}</span>
 </span>
 </div>
 <button
 onClick={() => handleCopy(formattedPrompt, false)}
 className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[9px] uppercase tracking-wider font-bold transition-colors text-gray-300"
 >
 {showCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
 {showCopied ? "Copied" : "Copy"}
 </button>
 </div>

 {/* Main Prompt Output Area */}
 <div className="flex-1 overflow-hidden relative min-h-[60px]">
 <textarea
 readOnly
 value={formattedPrompt}
 className="w-full h-full bg-black/40 border border-white/5 rounded-lg p-4 text-xs font-mono text-emerald-300/90 leading-relaxed outline-none resize-none no-scrollbar "
 />
 </div>

 {/* Optional Negative Prompt Section */}
 {draft?.negativePrompt && (
 <details className="mt-4 shrink-0 group/neg bg-black/30 border border-red-900/30 rounded-lg overflow-hidden">
 <summary className="px-4 py-2 cursor-pointer list-none flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-red-400/80 hover:bg-red-900/20 transition-colors select-none">
 <div className="flex items-center gap-2">
 <FileCode2 className="w-3.5 h-3.5" /> Negative Traits
 </div>
 <div className="flex items-center gap-4">
 <button
 onClick={(e) => { e.preventDefault(); handleCopy(negativePrompt, true); }}
 className="flex items-center gap-1.5 px-2 py-0.5 bg-red-900/30 hover:bg-red-900/50 rounded text-[8px] uppercase tracking-wider font-bold transition-colors text-red-300"
 >
 {showNegCopied ? <Check className="w-3 h-3 text-red-400" /> : <Copy className="w-3 h-3" />}
 {showNegCopied ? "Copied" : "Copy"}
 </button>
 <ChevronDown className="w-4 h-4 text-red-400/40 group-open/neg:rotate-180 transition-transform" />
 </div>
 </summary>
 <div className="p-3 border-t border-red-900/30">
 <textarea
 readOnly
 value={negativePrompt}
 className="w-full h-12 bg-transparent text-xs font-mono text-red-300/80 outline-none resize-none no-scrollbar"
 />
 </div>
 </details>
 )}
 </div>
 </div>
 );
}
