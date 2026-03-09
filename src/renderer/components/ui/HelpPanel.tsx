import { useState } from 'react';
import { useHelp } from '../../context/HelpContext';
import { HelpCircle, X } from 'lucide-react';

interface HelpPanelProps {
 zone: string;
 id: string;
 className?: string;
}

const HelpPanel: React.FC<HelpPanelProps> = ({ zone, id, className = '' }) => {
 const help = useHelp(zone, id);
 const [isOpen, setIsOpen] = useState(false);

 // Strict: Only render if type is correct
 if (!help || help.type !== 'help') {
 return null;
 }

 return (
 <>
 <button
 onClick={() => setIsOpen(true)}
 className={`flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-400 uppercase bg-[#18181b] rounded hover:text-white transition-colors ${className}`}
 >
 <HelpCircle className="w-4 h-4" />
 {help.title || "Help"}
 </button>

 {isOpen && (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
 <div className="w-[400px] bg-[#09090b] border border-[#27272a] rounded-xl p-6 relative" onClick={(e) => e.stopPropagation()}>
 <button
 onClick={() => setIsOpen(false)}
 className="absolute top-4 right-4 text-gray-500 hover:text-white"
 >
 <X className="w-5 h-5" />
 </button>

 <h2 className="text-lg font-bold text-white mb-4">{help.title}</h2>
 <div className="prose prose-invert text-sm text-gray-300">
 {/* 
 Strict Rule: Renders simple text or markdown.
 Since we must not infer, we currently just render the text. 
 If markdown parsing is needed, we would add strict ReactMarkdown here.
 For single sentence requirement, rendering as text is correct.
 "help_map.json" text field serves as the content source.
 */}
 <p>{help.text}</p>
 </div>
 </div>
 </div>
 )}
 </>
 );
};

export default HelpPanel;



