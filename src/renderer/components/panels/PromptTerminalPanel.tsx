import { MonitorPlay, Copy } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';

type SubmittedStagingRequest = {
 mode: 'loose' | 'strict' | 'strict-pass';
 prompt: string;
 references: Array<{
  order: number;
  label: string;
  role: string;
 }>;
 createdAt: number;
};

interface PromptTerminalPanelProps {
 v3DirectorPrompt: string;
 submittedStagingRequest?: SubmittedStagingRequest | null;
 handleCopyDirectorPrompt: () => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
}

const formatModeLabel = (mode: SubmittedStagingRequest['mode']) => {
 if (mode === 'strict-pass') return 'STRICT PASS';
 return mode.toUpperCase();
};

export const PromptTerminalPanel = ({
 v3DirectorPrompt,
 submittedStagingRequest,
 handleCopyDirectorPrompt,
 collapsed,
 onToggle
}: PromptTerminalPanelProps) => {
 const displayPrompt = submittedStagingRequest?.prompt || v3DirectorPrompt;
 const statusLabel = submittedStagingRequest
  ? `LAST SUBMITTED - ${formatModeLabel(submittedStagingRequest.mode)}`
  : 'CURRENT PREVIEW - NOT YET SUBMITTED';

 return (
 <SidebarPanel
 key="v3_terminal"
 id="v3_terminal"
 title="PROMPT ENGINE"
 icon={MonitorPlay}
 headerColor="text-yellow-500"
 collapsed={collapsed}
 onToggle={onToggle}
 draggable={false}
 >
 <div className="flex items-center justify-between mb-2">
 <div className="text-[9px] text-gray-600 font-mono">{statusLabel}</div>
 <button
 onClick={handleCopyDirectorPrompt}
 className="p-1.5 hover:bg-white/10 rounded text-emerald-400 transition-colors"
 title="Copy prompt text"
 >
 <Copy className="w-3.5 h-3.5" />
 </button>
 </div>
 <div className="bg-[#050505] p-3 rounded border border-[#27272a] font-mono text-[9px] text-emerald-500 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-60 custom-scrollbar select-text ">
 {displayPrompt || 'Prompt engine idle. Add instructions or actors to begin compilation.'}
 </div>
 {submittedStagingRequest && (
 <div className="mt-2 bg-[#050505] p-3 rounded border border-[#27272a] font-mono text-[9px] text-sky-300 leading-relaxed overflow-x-auto max-h-36 custom-scrollbar select-text">
 <div className="text-gray-500 mb-1">ORDERED REFERENCES</div>
 {submittedStagingRequest.references.length > 0
  ? submittedStagingRequest.references.map((reference) => (
   <div key={`${reference.order}-${reference.label}`}>
    {reference.order}. {reference.label} - {reference.role}
   </div>
  ))
  : <div>No image references submitted.</div>}
 </div>
 )}
 </SidebarPanel>
 );
};