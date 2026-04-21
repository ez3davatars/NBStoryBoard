import { useState, useEffect } from 'react';
import { X, Link2 } from 'lucide-react';
import { PropertyField } from '../ui/PropertyField';
import type { ReferenceSlot } from '../../context/AppContext';
import { resolveDisplayUrl } from '../../utils/assetUrlResolver';

interface RefInspectorModalProps {
 inspectRefIndex: number;
 referenceSlots: ReferenceSlot[];
 inspectName: string;
 setInspectName: (val: string) => void;
 inspectAnalysis: string;
 setInspectAnalysis: (val: string) => void;
 inspectTarget: string;
 setInspectTarget: (val: string) => void;
 setInspectRefIndex: (idx: number | null) => void;
 replaceAnchorSubjects: boolean;
 toggleReplaceMode: (val: boolean) => void;
 onSave: (updates: Partial<ReferenceSlot>) => void;
 onAnalyze: () => Promise<void>;
 isAnalyzing: boolean;
}

export const RefInspectorModal = ({
 inspectRefIndex,
 referenceSlots,
 inspectName,
 setInspectName,
 inspectAnalysis,
 setInspectAnalysis,
 inspectTarget,
 setInspectTarget,
 setInspectRefIndex,
 replaceAnchorSubjects,
 toggleReplaceMode,
 onSave,
 onAnalyze,
 isAnalyzing
}: RefInspectorModalProps) => {
 const slot = referenceSlots.find(s => s.index === inspectRefIndex);
 const [displayUrl, setDisplayUrl] = useState<{ sourceUrl: string; value: string | null } | null>(null);

 useEffect(() => {
   if (!slot?.url) return;
   
   let isMounted = true;
   const isLocalSafe = slot.url.startsWith('blob:') || slot.url.startsWith('data:');
   
   resolveDisplayUrl({
     localPath: slot.localPath,
     sourceUrl: slot.sourceUrl,
     localUrl: isLocalSafe ? slot.url : null,
     remoteUrl: !isLocalSafe && slot.url && slot.url.startsWith('http') ? slot.url : null
   }).then(resolved => {
     if (isMounted) {
       setDisplayUrl({ sourceUrl: slot.url!, value: resolved });
     }
   });

   return () => { isMounted = false; };
 }, [slot?.localPath, slot?.sourceUrl, slot?.url]);

 if (!slot || !slot.url) return null;
 const effectiveUrl = displayUrl?.sourceUrl === slot.url ? (displayUrl.value || slot.url) : slot.url;

 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/95 backdrop-blur-md">
 <div className="bg-[#09090b] border border-[#27272a] rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex animate-in zoom-in-95 duration-200">
 {/* Image Preview */}
 <div className="flex-1 bg-black flex items-center justify-center p-8 relative">
 <img
 src={effectiveUrl}
 alt="Inspector Preview"
 className="max-w-full max-h-full object-contain rounded-lg"
 />
 <div className="absolute top-4 left-4 flex items-center gap-2">
 <div className="px-3 py-1.5 bg-yellow-500 text-black text-[10px] font-bold rounded-full uppercase tracking-widest">
 Reference Slot {inspectRefIndex}
 </div>
 </div>
 </div>

 {/* Metadata Editor */}
 <div className="w-[450px] border-l border-[#27272a] flex flex-col p-8 bg-[#09090b]">
 <div className="flex items-center justify-between mb-8">
 <h3 className="text-sm font-bold text-white uppercase tracking-[0.2em]">Reference DNA</h3>
 <button
 onClick={() => setInspectRefIndex(null)}
 className="p-2 hover:bg-white/5 rounded-full text-gray-500 hover:text-white transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar text-left">
 <PropertyField
 label="Alias / Identity"
 value={inspectName}
 onChange={setInspectName}
 placeholder="e.g. Hero Protagonist"
 />
 <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">
        Reference DNA / Notes
      </label>
      <button
        onClick={onAnalyze}
        disabled={isAnalyzing}
        className={`px-3 py-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-[10px] font-bold uppercase tracking-widest transition-colors ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isAnalyzing ? 'Analyzing...' : 'Auto-Analyze'}
      </button>
    </div>
    <textarea
      value={inspectAnalysis}
      onChange={(e) => setInspectAnalysis(e.target.value)}
      placeholder="AI analysis for precision generation or type your own notes..."
      className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-y min-h-[100px]"
    />
  </div>

 <div className="pt-6 border-t border-[#27272a]">
 <div className="flex items-center justify-between mb-4">
 <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2">
 <Link2 className="w-3 h-3 text-blue-500" /> Subject Replacement
 </label>
 <div
 onClick={() => toggleReplaceMode(!replaceAnchorSubjects)}
 className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${replaceAnchorSubjects ? 'bg-blue-600' : 'bg-gray-800'}`}
 >
 <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${replaceAnchorSubjects ? 'left-6' : 'left-1'}`} />
 </div>
 </div>
 {replaceAnchorSubjects && (
 <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
 <PropertyField
 label="Target in Anchor Scene"
 value={inspectTarget}
 onChange={setInspectTarget}
 placeholder="e.g. the man on the bench"
 />
 <p className="text-[9px] text-gray-400 italic leading-relaxed">
 This character identity will precisely replace the target subject identified in the anchor scene.
 </p>
 </div>
 )}
 </div>

 <div className="pt-8 flex flex-col gap-3">
 <button
 onClick={() => {
 onSave({
 name: inspectName,
 analysis: inspectAnalysis,
 target: inspectTarget || undefined
 });
 setInspectRefIndex(null);
 }}
 className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest transition-all "
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
 </div>
 );
};



