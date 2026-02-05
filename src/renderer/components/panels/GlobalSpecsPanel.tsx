
import { Settings as SettingsIcon } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import type { DirectorAspectRatio } from '../../context/AppContext';

interface GlobalSpecsPanelProps {
    state: any;
    setDirector: (updates: any) => void;
    collapsed: boolean;
    onToggle: (id: string) => void;
    onDragStart: (id: string) => void;
    onDrop: (targetId: string) => void;
}

export const GlobalSpecsPanel = ({
    state,
    setDirector,
    collapsed,
    onToggle,
    onDragStart,
    onDrop
}: GlobalSpecsPanelProps) => {
    return (
        <SidebarPanel
            key="specs"
            id="specs"
            title="Context Specs"
            icon={SettingsIcon}
            headerColor="text-cyan-400"
            collapsed={collapsed}
            onToggle={onToggle}
            onDragStart={onDragStart}
            onDrop={onDrop}
        >
            <div className="space-y-2 px-1">
                {/* Resolution Display - Slimmer */}
                <div className="flex items-center justify-between bg-[#18181b]/50 rounded-lg p-2 border border-[#27272a]">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Resolution</span>
                        <span className="text-sm font-mono text-cyan-400 font-bold tracking-tight">
                            {typeof state.director?.resolution === 'object' ? `${state.director.resolution.width}x${state.director.resolution.height}` : state.director?.resolution}
                        </span>
                    </div>

                    <div className="flex gap-1">
                        {[
                            { label: 'HD', w: 1920, h: 1080 },
                            { label: '4K', w: 3840, h: 2160 },
                            { label: '8K', w: 7680, h: 4320 },
                        ].map((r) => {
                            const currentW = typeof state.director.resolution === 'object' ? state.director.resolution.width : 1920;
                            const isActive = currentW === r.w;
                            return (
                                <button
                                    key={r.label}
                                    onClick={() => setDirector({ resolution: { width: r.w, height: r.h } })}
                                    className={`px-2 py-1 rounded text-[9px] font-bold transition-colors uppercase border ${isActive
                                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                                        : 'bg-[#27272a] text-gray-400 border-transparent hover:text-white hover:bg-[#3f3f46]'
                                        }`}
                                    title={`Set resolution to ${r.label} (${r.w}x${r.h})`}
                                >
                                    {r.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-1 mt-2">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-[#52525b]">Aspect Ratio</label>
                    <div className="flex gap-1">
                        {['16:9', '9:16', '1:1', '4:5'].map((ratio) => {
                            const isActive = state.director.aspectRatio === ratio;
                            return (
                                <button
                                    key={ratio}
                                    onClick={() => setDirector({ aspectRatio: ratio as DirectorAspectRatio })}
                                    className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all uppercase border ${isActive
                                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                                        : 'bg-[#27272a] text-gray-500 border-transparent hover:text-white hover:bg-[#3f3f46]'
                                        }`}
                                    title={`Set aspect ratio to ${ratio}`}
                                >
                                    {ratio}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </SidebarPanel>
    );
};



