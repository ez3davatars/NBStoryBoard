
import { MonitorPlay, Copy } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';

interface PromptTerminalPanelProps {
 v3DirectorPrompt: string;
 handleCopyDirectorPrompt: () => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
}

export const PromptTerminalPanel = ({
 v3DirectorPrompt,
 handleCopyDirectorPrompt,
 collapsed,
 onToggle
}: PromptTerminalPanelProps) => {
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
 <div className="text-[9px] text-gray-600 font-mono">COMPILED OUTPUT</div>
 <button
 onClick={handleCopyDirectorPrompt}
 className="p-1.5 hover:bg-white/10 rounded text-emerald-400 transition-colors"
 title="Copy to clipboard"
 >
 <Copy className="w-3.5 h-3.5" />
 </button>
 </div>
 <div className="bg-[#050505] p-3 rounded border border-[#27272a] font-mono text-[9px] text-emerald-500 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-60 custom-scrollbar select-text ">
 {v3DirectorPrompt || 'Prompt engine idle. Add instructions or actors to begin compilation.'}
 </div>
 </SidebarPanel>
 );
};



