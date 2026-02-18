
import { Layers, Eye, EyeOff, GripVertical, UserPlus, StickyNote, BoxSelect, MoveUpRight, Trash2, ArrowUpToLine, ArrowUp, ArrowDown, ArrowDownToLine } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';

interface StageLayersPanelProps {
    state: any;
    dispatch: (action: any) => void;
    collapsed: boolean;
    onToggle: (id: string) => void;
    draggedLayerId: string | null;
    setDraggedLayerId: (id: string | null) => void;
    setDraggedPanelId: (id: string | null) => void;
    handlePanelDrop: (id: string) => void;
}

export const StageLayersPanel = ({
    state,
    dispatch,
    collapsed,
    onToggle,
    draggedLayerId,
    setDraggedLayerId,
    setDraggedPanelId,
    handlePanelDrop
}: StageLayersPanelProps) => {
    const stageItemsCount = state.tokens.length + state.annotations.length;

    return (
        <SidebarPanel
            key="layers"
            id="layers"
            title="Stage Layers"
            icon={Layers}
            headerColor="text-orange-400"
            collapsed={collapsed}
            onToggle={onToggle}
            onDragStart={setDraggedPanelId}
            onDrop={handlePanelDrop}
            rightElement={<span className="text-[9px] text-gray-600 font-mono">{stageItemsCount} Items</span>}
        >
            <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                {[...state.tokens.map((t: any) => ({ ...t, type: 'token' })), ...state.annotations.map((a: any) => ({ ...a, type: 'annotation' }))]
                    .sort((a: any, b: any) => b.zIndex - a.zIndex)
                    .map((layer: any) => {
                        const isSelected = state.selection === layer.id;
                        const isDragging = draggedLayerId === layer.id;

                        return (
                            <div
                                key={layer.id}
                                draggable
                                onDragStart={(e) => {
                                    setDraggedLayerId(layer.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (!draggedLayerId || draggedLayerId === layer.id) return;
                                    // Capture current state of full list sorted by Z
                                    const allLayers = [...state.tokens.map((t: any) => ({ ...t, type: 'token' })), ...state.annotations.map((a: any) => ({ ...a, type: 'annotation' }))]
                                        .sort((a: any, b: any) => b.zIndex - a.zIndex);
                                    const fromIndex = allLayers.findIndex(l => l.id === draggedLayerId);
                                    const toIndex = allLayers.findIndex(l => l.id === layer.id);
                                    if (fromIndex === -1 || toIndex === -1) return;
                                    // Reorder array
                                    const item = allLayers[fromIndex];
                                    allLayers.splice(fromIndex, 1);
                                    allLayers.splice(toIndex, 0, item);
                                    // Re-assign Z-indices
                                    const maxZ = allLayers.length;
                                    allLayers.forEach((l, idx) => {
                                        const newZ = maxZ - idx;
                                        if (l.zIndex !== newZ) {
                                            if (l.type === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: l.id, zIndex: newZ } });
                                            else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: l.id, zIndex: newZ } });
                                        }
                                    });
                                    setDraggedLayerId(null);
                                }}
                                onDragEnd={() => setDraggedLayerId(null)}
                                className={`flex items-center gap-2 p-1.5 rounded border transition-colors cursor-grab active:cursor-grabbing group ${isSelected ? 'bg-orange-500/10 border-orange-500/50' : 'bg-[#18181b] border-[#27272a] hover:bg-[#27272a]'} ${isDragging ? 'opacity-40 border-dashed border-orange-500' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({ type: 'SELECT_ITEM', payload: { id: layer.id, type: layer.type } });
                                }}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (layer.type === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: layer.id, visible: layer.visible === false } });
                                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: layer.id, visible: layer.visible === false } });
                                    }}
                                    className="p-1 text-gray-500 hover:text-white rounded hover:bg-white/10 transition-colors mr-1"
                                    title={layer.visible === false ? "Show Layer" : "Hide Layer"}
                                >
                                    {layer.visible === false ? <EyeOff className="w-3 h-3 text-gray-600" /> : <Eye className="w-3 h-3" />}
                                </button>

                                <div className="text-gray-600 group-hover:text-gray-400 cursor-grab active:cursor-grabbing">
                                    <GripVertical className="w-3 h-3" />
                                </div>
                                <div className={`p-1 rounded ${isSelected ? 'bg-orange-500 text-black' : 'bg-gray-800 text-gray-400'}`}>
                                    {layer.type === 'token' && <UserPlus className="w-3 h-3" />}
                                    {layer.type === 'annotation' && layer.subtype === 'note' && <StickyNote className="w-3 h-3" />}
                                    {layer.type === 'annotation' && layer.subtype === 'zone' && <BoxSelect className="w-3 h-3" />}
                                    {layer.type === 'annotation' && layer.subtype === 'arrow' && <MoveUpRight className="w-3 h-3" />}
                                </div>
                                <span className={`text-[9px] font-bold uppercase truncate flex-1 ${isSelected ? 'text-orange-400' : 'text-gray-400'}`}>
                                    {layer.tag || layer.text || layer.type}
                                </span>
                                <span className="text-[9px] font-mono text-gray-600 mr-2">Z:{layer.zIndex}</span>

                                {isSelected && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (layer.type === 'token') {
                                                    dispatch({ type: 'REMOVE_TOKEN', payload: layer.id });
                                                    dispatch({ type: 'ADD_LOG', payload: { message: "Token removed from Scene (Library Safe)", type: 'info' } });
                                                }
                                                else dispatch({ type: 'REMOVE_ANNOTATION', payload: layer.id });
                                            }}
                                            className="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-colors"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                {state.tokens.length === 0 && state.annotations.length === 0 && (
                    <div className="text-[10px] text-gray-600 italic text-center py-4 border border-dashed border-gray-800 rounded">
                        Stage is empty. Add cast or notes.
                    </div>
                )}
            </div>
            <div className="grid grid-cols-4 gap-1 pt-2 border-t border-[#27272a] mt-2">
                <button
                    disabled={!state.selection}
                    onClick={() => {
                        if (!state.selection) return;
                        const all = [...state.tokens, ...state.annotations];
                        const maxZ = all.length > 0 ? Math.max(...all.map(i => i.zIndex)) : 0;
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: maxZ + 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: maxZ + 1 } });
                    }}
                    className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                    title="Bring to Front"
                >
                    <ArrowUpToLine className="w-3.5 h-3.5" />
                </button>
                <button
                    disabled={!state.selection}
                    onClick={() => {
                        if (!state.selection) return;
                        const item = [...state.tokens, ...state.annotations].find(i => i.id === state.selection);
                        if (!item) return;
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: item.zIndex + 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: item.zIndex + 1 } });
                    }}
                    className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                    title="Bring Forward"
                >
                    <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                    disabled={!state.selection}
                    onClick={() => {
                        if (!state.selection) return;
                        const item = [...state.tokens, ...state.annotations].find(i => i.id === state.selection);
                        if (!item) return;
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: item.zIndex - 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: item.zIndex - 1 } });
                    }}
                    className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                    title="Send Backward"
                >
                    <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                    disabled={!state.selection}
                    onClick={() => {
                        if (!state.selection) return;
                        const all = [...state.tokens, ...state.annotations];
                        const minZ = all.length > 0 ? Math.min(...all.map(i => i.zIndex)) : 0;
                        if (state.selectionType === 'token') dispatch({ type: 'UPDATE_TOKEN', payload: { id: state.selection, zIndex: minZ - 1 } });
                        else dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: state.selection, zIndex: minZ - 1 } });
                    }}
                    className="bg-[#18181b] hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 border border-[#27272a] rounded p-1.5 flex items-center justify-center disabled:opacity-30"
                    title="Send to Back"
                >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                </button>
            </div>
        </SidebarPanel>
    );
};



