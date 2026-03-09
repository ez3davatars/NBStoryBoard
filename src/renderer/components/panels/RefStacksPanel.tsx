
import { RotateCw, Pencil, X, Upload } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import type { ReferenceSlot } from '../../context/AppContext';

interface RefStacksPanelProps {
 state: any;
 dispatch: (action: any) => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart: (id: string) => void;
 onDrop: (targetId: string) => void;
 handleRefSlotClick: (index: number) => void;
 handleRefSlotDrop: (index: number, e: React.DragEvent) => void;
 setDragOverRefSlot: (index: number | null) => void;
 dragOverRefSlot: number | null;
 setInspectRefIndex: (index: number | null) => void;
 clearRefSlot: (index: number) => void;
 refFileInputs: React.MutableRefObject<Record<number, HTMLInputElement | null>>;
 handleRefSlotFile: (index: number, file: File) => void;
}

export const RefStacksPanel = ({
 state,
 dispatch,
 collapsed,
 onToggle,
 onDragStart,
 onDrop,
 handleRefSlotClick,
 handleRefSlotDrop,
 setDragOverRefSlot,
 dragOverRefSlot,
 setInspectRefIndex,
 clearRefSlot,
 refFileInputs,
 handleRefSlotFile
}: RefStacksPanelProps) => {
 return (
 <SidebarPanel
 key="ref_stacks"
 id="ref_stacks"
 title="Reference Stacks"
 icon={RotateCw}
 headerColor="text-yellow-500"
 collapsed={collapsed}
 onToggle={onToggle}
 onDragStart={onDragStart}
 onDrop={onDrop}
 >
 <div className="flex justify-end mb-2">
 <button
 onClick={() => dispatch({ type: 'CLEAR_REF_SLOTS' })}
 className="text-[9px] text-gray-500 hover:text-red-400 font-bold uppercase border border-[#27272a] px-2 py-1 rounded hover:bg-white/5"
 >
 Clear All
 </button>
 </div>
 <div className="grid grid-cols-2 gap-3 mb-2">
 {state.referenceSlots.map((slot: ReferenceSlot) => (
 <div
 key={slot.index}
 onClick={() => handleRefSlotClick(slot.index)}
 onDragOver={(e) => { e.preventDefault(); setDragOverRefSlot(slot.index); }}
 onDragLeave={() => setDragOverRefSlot(null)}
 onDrop={(e) => handleRefSlotDrop(slot.index, e)}
 className={`relative aspect-square rounded-lg border-2 transition-all cursor-pointer overflow-hidden ${slot.active ? 'border-yellow-500 ' : 'border-[#27272a] opacity-60 hover:opacity-100'} ${dragOverRefSlot === slot.index ? 'border-blue-500 bg-blue-500/10 scale-95' : ''}`}
 >
 {slot.url ? (
 <>
 <img src={slot.url} alt={`Ref ${slot.index}`} className="w-full h-full object-contain" />
 {!slot.active && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-500" /></div>}
 <div className="absolute bottom-1 right-1 flex flex-col gap-1">
 <button
 onClick={(e) => { e.stopPropagation(); setInspectRefIndex(slot.index); }}
 className="p-1 bg-black/60 hover:bg-black rounded text-white transition-colors"
 >
 <Pencil className="w-2.5 h-2.5" />
 </button>
 <button
 onClick={(e) => { e.stopPropagation(); clearRefSlot(slot.index); }}
 className="p-1 bg-black/60 hover:bg-red-500 rounded text-white transition-colors"
 >
 <X className="w-2.5 h-2.5" />
 </button>
 </div>
 </>
 ) : (
 <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#18181b]">
 <span className="text-[12px] font-bold text-gray-700">{slot.index}</span>
 <Upload className="w-3 h-3 text-gray-700" />
 </div>
 )}
 <input
 type="file"
 ref={el => { if (refFileInputs.current) refFileInputs.current[slot.index] = el; }}
 className="hidden"
 onChange={(e) => e.target.files?.[0] && handleRefSlotFile(slot.index, e.target.files[0])}
 />
 </div>
 ))}
 </div>
 </SidebarPanel>
 );
};



