
import { Film, Grid, Copy, Trash2, Clapperboard } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import HelpTooltip from '../ui/HelpTooltip';

import type { Shot } from '../../context/AppContext';

interface ShotListPanelProps {
 shots: Shot[];
 activeShotId: string | null;
 activeShotNameDraft: string;
 setActiveShotNameDraft: (val: string) => void;
 renameActiveShot: () => void;
 addShotFromStage: () => void;
 captureAndSetShotFrame: (type: 'start' | 'end') => void;
 setActiveShot: (id: string) => void;
 duplicateShot: (id: string) => void;
 removeShot: (id: string) => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDrop: (targetId: string) => void;
 isProcessing?: boolean;
 onOpenStoryboard?: () => void;
}

export const ShotListPanel = ({
 shots,
 activeShotId,
 activeShotNameDraft,
 setActiveShotNameDraft,
 renameActiveShot,
 addShotFromStage,
 captureAndSetShotFrame,
 setActiveShot,
 duplicateShot,
 removeShot,
 collapsed,
 onToggle,
 onDrop,
 onOpenStoryboard
}: ShotListPanelProps) => {
 return (
 <HelpTooltip zone="stage" id="storyboardTimeline">
 <SidebarPanel
 key="shots"
 id="shots"
 title="Shot List"
 icon={Film}
 headerColor="text-blue-500"
 collapsed={collapsed}
 onToggle={onToggle}
 onDrop={onDrop}
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
 {onOpenStoryboard && (
 <button
 onClick={onOpenStoryboard}
 disabled={!activeShotId}
 className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded font-bold disabled:opacity-50 flex items-center justify-center transition-colors border border-emerald-500/50"
 title="Open Veo Prompt Studio"
 >
 <Clapperboard className="w-3.5 h-3.5" />
 </button>
 )}
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
 {(shots ?? []).map((s) => {
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
 className="p-1 px-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded text-[10px] font-bold uppercase text-gray-400"
 title="Duplicate this shot"
 >
 <Copy className="w-2.5 h-2.5" />
 </button>

 <button
 onClick={() => removeShot(s.id)}
 className="p-1 px-1.5 bg-[#18181b] hover:bg-red-500/20 border border-[#27272a] hover:border-red-500/40 rounded text-[10px] font-bold uppercase text-red-500"
 title="Delete this shot"
 >
 <Trash2 className="w-2.5 h-2.5" />
 </button>
 </div>
 );
 })}
 </div>
 </SidebarPanel>
 </HelpTooltip>
 );
};



