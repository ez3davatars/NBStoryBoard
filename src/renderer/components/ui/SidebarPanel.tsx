
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';

type PanelIcon = ComponentType<{ className?: string }>;

interface SidebarPanelProps {
 id: string;
 title: string;
 icon?: PanelIcon;
 children: ReactNode;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart?: (id: string) => void;
 onDrop?: (targetId: string) => void;
 isMaskMode?: boolean;
 headerColor?: string;
 rightElement?: ReactNode;
 draggable?: boolean;
 style?: CSSProperties;
}

export const SidebarPanel = ({
 id,
 title,
 icon: Icon,
 children,
 collapsed,
 onToggle,
 onDragStart,
 onDrop,
 isMaskMode,
 headerColor = "text-gray-500",
 rightElement,
 draggable = true,
 style
}: SidebarPanelProps) => {
 const isRegionActive = title === 'Region Edit' && isMaskMode;
 const activeBg = isRegionActive ? 'bg-green-500 text-black hover:bg-green-400' : '';

 // Icon gets the color, text remains neutral unless active mask mode
 const iconStyle = isRegionActive ? 'text-black' : headerColor;
 const titleStyle = isRegionActive ? 'text-black' : 'text-gray-400';
 const chevronStyle = isRegionActive ? 'text-black' : 'text-gray-600';
 const gripStyle = isRegionActive ? 'text-black/50' : headerColor;

 return (
 <div
 onDragOver={(e) => {
 if (draggable) e.preventDefault();
 }}
 onDrop={(e) => {
 if (draggable) {
 e.preventDefault();
 if (onDrop) onDrop(id);
 }
 }}
  className={`min-w-0 border border-[#27272a] rounded-xl overflow-hidden transition-all duration-300 shrink-0 ${collapsed ? 'h-[42px]' : 'bg-[#09090b]/80 backdrop-blur-md'}`}
 style={style}
 >
 <div
 draggable={draggable}
 onDragStart={(e) => {
 if (!draggable) {
 e.preventDefault();
 return;
 }
 e.dataTransfer.setData('panelId', id);
 if (onDragStart) onDragStart(id);
 }}
 onClick={() => onToggle(id)}
 className={`flex items-center justify-between p-3 cursor-pointer select-none hover:bg-white/5 transition-colors ${activeBg}`}
 >
  <div className="flex items-center gap-2 min-w-0">
  {draggable && <GripVertical className={`w-3 h-3 ${gripStyle} opacity-50 cursor-grab active:cursor-grabbing`} />}
  {Icon && <Icon className={`w-3.5 h-3.5 ${iconStyle}`} />}
  <span className={`min-w-0 truncate text-[10px] font-bold uppercase tracking-widest ${titleStyle}`}>{title}</span>
 </div>
 <div className="flex items-center gap-2">
 {rightElement}
 <div className={`${collapsed ? '-rotate-90' : ''} transition-transform duration-300`}>
 <ChevronDown className={`w-3 h-3 ${chevronStyle}`} />
 </div>
 </div>
 </div>
 {!collapsed && (
  <div className="min-w-0 p-3 border-t border-[#27272a]">
 {children}
 </div>
 )}
 </div>
 );
};



