import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import VeoPromptBuilderPanel from './veo/VeoPromptBuilderPanel';
import type { VeoPromptBuilderRef } from './veo/VeoPromptBuilderPanel';
import VeoGenerator from './VeoGenerator';
import StoryboardShotRail from './veo/StoryboardShotRail';
import VeoMonitorPanel from './veo/VeoMonitorPanel';
import VeoBottomDock from './veo/VeoBottomDock';
import VeoTimelinePanel from './veo/VeoTimelinePanel';
import { useVeoSmartAnalyze } from '../hooks/useVeoSmartAnalyze';
import { Clapperboard, Edit3, Clock, Settings, Copy, Check, Save } from 'lucide-react';

type StudioTab = 'builder' | 'keyframes' | 'timeline';

export default function VeoPromptStudio() {
    const { state } = useAppContext();
    const [activeTab, setActiveTab] = useState<StudioTab>('builder');
    const smartAnalyze = useVeoSmartAnalyze();
    const builderRef = useRef<VeoPromptBuilderRef>(null);

    const [showCopied, setShowCopied] = useState(false);
    const [showCopiedNegative, setShowCopiedNegative] = useState(false);
    const [showSaved, setShowSaved] = useState(false);

    // Unified Topbar Button Style (Opaque neutral to beat bounding box background bleed)
    const sbPill =
        "inline-flex items-center h-10 rounded-xl border border-[#2a303a] bg-[#0f141b] shadow-md p-1 gap-1";

    const sbBtn =
        "inline-flex items-center gap-2 h-full px-4 rounded-lg text-xs font-semibold tracking-wide " +
        "text-white/70 bg-transparent " +
        "hover:bg-[#1a212b] hover:text-white " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/30 " +
        "transition-colors";

    const sbBtnActive =
        "bg-[#1a212b] text-white border border-[#3a4250] shadow-sm";

    // --- Layout Resizer Logic ---
    const GUTTER = 12;

    const [leftW, setLeftW] = useState(() => {
        const saved = localStorage.getItem('veo_layout_leftW');
        return saved ? parseInt(saved, 10) : 280;
    });

    const [rightW, setRightW] = useState(() => {
        const saved = localStorage.getItem('veo_layout_rightW');
        return saved ? parseInt(saved, 10) : 460;
    });

    const [dockH, setDockH] = useState(() => {
        const saved = localStorage.getItem('veo_layout_dockH');
        return saved ? parseInt(saved, 10) : 280;
    });

    const [dragState, setDragState] = useState<'left' | 'right' | 'dock' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeShot = state.shots.find(s => s.id === state.activeShotId);

    const handleCopyPrompt = () => {
        if (builderRef.current) {
            builderRef.current.copyPrompt();
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        }
    };

    const handleCopyNegative = () => {
        if (builderRef.current) {
            builderRef.current.copyNegative();
            setShowCopiedNegative(true);
            setTimeout(() => setShowCopiedNegative(false), 2000);
        }
    };

    const handleSaveToShot = () => {
        if (builderRef.current) {
            builderRef.current.saveToShot();
            setShowSaved(true);
            setTimeout(() => setShowSaved(false), 2000);
        }
    };

    const startDragging = useCallback((e: React.MouseEvent, type: 'left' | 'right' | 'dock') => {
        e.preventDefault();
        setDragState(type);
    }, []);

    useEffect(() => {
        if (!dragState) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();

            if (dragState === 'left') {
                let newWidth = e.clientX - containerRect.left;
                newWidth = Math.max(240, Math.min(newWidth, 420));
                // ensure center has space
                const centerSpace = containerRect.width - newWidth - rightW - (GUTTER * 2);
                if (centerSpace >= 640) setLeftW(newWidth);
            } else if (dragState === 'right') {
                let newWidth = containerRect.right - e.clientX;
                newWidth = Math.max(380, Math.min(newWidth, 680));
                // ensure center has space
                const centerSpace = containerRect.width - leftW - newWidth - (GUTTER * 2);
                if (centerSpace >= 640) setRightW(newWidth);
            } else if (dragState === 'dock') {
                let newHeight = containerRect.bottom - e.clientY;
                newHeight = Math.max(220, Math.min(newHeight, 420));
                setDockH(newHeight);
            }
        };

        const handleMouseUp = () => {
            setDragState(null);
            localStorage.setItem('veo_layout_leftW', leftW.toString());
            localStorage.setItem('veo_layout_rightW', rightW.toString());
            localStorage.setItem('veo_layout_dockH', dockH.toString());
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, leftW, rightW, dockH]);

    const isDraggingAny = dragState !== null;
    let cursorClass = '';
    if (dragState === 'left' || dragState === 'right') cursorClass = 'cursor-col-resize';
    if (dragState === 'dock') cursorClass = 'cursor-row-resize';

    return (
        <div className={`h-full min-h-0 flex flex-col bg-gradient-to-br from-[#0b1220] via-[#0b0f14] to-[#1b0f2a] text-white ${isDraggingAny ? `${cursorClass} select-none` : ''}`}>

            {/* 1) Studio Bar (Top Row) */}
            <div className="shrink-0 h-14 grid grid-cols-[1fr_auto_1fr] items-center px-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-20">
                {/* Left: Branding & Active Shot */}
                <div className="flex items-center gap-4 justify-self-start">
                    <div className="flex items-center gap-2">
                        <Clapperboard className="w-5 h-5 text-yellow-500" />
                        <h2 className="text-sm font-black tracking-widest text-white uppercase">Storyboard Studio</h2>
                    </div>
                    <div className="h-4 w-px bg-white/20"></div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Target:</span>
                        {activeShot ? (
                            <span className="text-[10px] font-bold text-yellow-500 truncate max-w-[200px]">{activeShot.name}</span>
                        ) : (
                            <span className="text-[10px] text-red-500 uppercase font-bold tracking-wider">No Shot Selected</span>
                        )}
                    </div>
                </div>

                {/* Center: Mode Tabs (Segmented Control) */}
                <div className={`justify-self-center ${sbPill}`}>
                    <button
                        onClick={() => setActiveTab('builder')}
                        className={`${sbBtn} ${activeTab === 'builder' ? sbBtnActive : ''}`}
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Prompt
                    </button>
                    <button
                        onClick={() => setActiveTab('keyframes')}
                        className={`${sbBtn} ${activeTab === 'keyframes' ? sbBtnActive : ''}`}
                    >
                        <Settings className="w-3.5 h-3.5" /> Keyframes
                    </button>
                    <button
                        onClick={() => setActiveTab('timeline')}
                        className={`${sbBtn} ${activeTab === 'timeline' ? sbBtnActive : ''}`}
                    >
                        <Clock className="w-3.5 h-3.5" /> Timeline
                    </button>
                </div>

                {/* Right: Actions */}
                <div className={`justify-self-end ${sbPill}`}>
                    <button
                        onClick={handleCopyPrompt}
                        disabled={activeTab !== 'builder'}
                        className={`${sbBtn} disabled:opacity-40 disabled:hover:bg-transparent`}
                    >
                        {showCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {showCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                        onClick={handleCopyNegative}
                        disabled={activeTab !== 'builder'}
                        className={`${sbBtn} disabled:opacity-40 disabled:hover:bg-transparent`}
                    >
                        {showCopiedNegative ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {showCopiedNegative ? "Copied" : "Neg"}
                    </button>
                    <button
                        onClick={handleSaveToShot}
                        disabled={!activeShot || activeTab !== 'builder'}
                        className={`${sbBtn} ${showSaved ? 'text-green-400 bg-[#1a212b]' : ''} disabled:opacity-40 disabled:hover:bg-transparent`}
                    >
                        {showSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                        {showSaved ? "Saved" : "Save"}
                    </button>
                </div>
            </div>

            {/* 2) Main Editor Work Area */}
            <div className="flex-1 min-h-0 flex flex-col" ref={containerRef}>
                <div className="flex-1 min-h-0 p-3 pb-3">
                    <div
                        className="h-full w-full grid min-h-0"
                        style={{
                            gridTemplateColumns: `${leftW}px ${GUTTER}px 1fr ${GUTTER}px ${rightW}px`,
                            gridTemplateRows: `1fr ${GUTTER}px ${dockH}px`
                        }}
                    >
                        {/* --- Content Panes --- */}
                        {/* Left Rail */}
                        <div className="col-start-1 row-start-1 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-xl ring-1 ring-white/5 flex flex-col min-h-0 overflow-hidden">
                            <StoryboardShotRail />
                        </div>

                        {/* Center Top: Cinematic Canvas */}
                        <div className="col-start-3 row-start-1 h-full min-h-0 relative">
                            <VeoMonitorPanel />
                        </div>

                        {/* Right Inspector */}
                        <div className="col-start-5 row-start-1 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-xl ring-1 ring-white/5 flex flex-col min-h-0 overflow-hidden">
                            <div className="flex-1 overflow-y-auto no-scrollbar relative min-h-0 bg-black/20">
                                {activeTab === 'builder' && <VeoPromptBuilderPanel ref={builderRef} />}
                                {activeTab === 'keyframes' && <VeoGenerator smartAnalyze={smartAnalyze} />}
                                {activeTab === 'timeline' && <VeoTimelinePanel />}
                            </div>
                        </div>

                        {/* Bottom Dock (Spans entire width) */}
                        <div className="col-start-1 col-span-5 row-start-3 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-xl ring-1 ring-white/5 flex flex-col min-h-0 overflow-hidden">
                            <VeoBottomDock mode={activeTab} />
                        </div>

                        {/* --- Drag Gutters --- */}
                        {/* Left Vertical Gutter */}
                        <div
                            className="col-start-2 row-start-1 cursor-col-resize flex flex-col justify-center items-center relative group z-30"
                            onMouseDown={(e) => startDragging(e, 'left')}
                        >
                            <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-px bg-white/10 group-hover:bg-white/20 transition-colors group-hover:shadow-[0_0_20px_rgba(250,204,21,0.12)]" />
                            <div className={`w-1 h-12 rounded-full transition-colors z-10 ${dragState === 'left' ? 'bg-blue-500' : 'bg-transparent group-hover:bg-white/30'}`} />
                        </div>

                        {/* Right Vertical Gutter */}
                        <div
                            className="col-start-4 row-start-1 cursor-col-resize flex flex-col justify-center items-center relative group z-30"
                            onMouseDown={(e) => startDragging(e, 'right')}
                        >
                            <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-px bg-white/10 group-hover:bg-white/20 transition-colors group-hover:shadow-[0_0_20px_rgba(250,204,21,0.12)]" />
                            <div className={`w-1 h-12 rounded-full transition-colors z-10 ${dragState === 'right' ? 'bg-blue-500' : 'bg-transparent group-hover:bg-white/30'}`} />
                        </div>

                        {/* Horizontal Gutter */}
                        <div
                            className="col-start-1 col-span-5 row-start-2 cursor-row-resize flex justify-center items-center relative group z-30"
                            onMouseDown={(e) => startDragging(e, 'dock')}
                        >
                            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-px bg-white/10 group-hover:bg-white/20 transition-colors group-hover:shadow-[0_0_20px_rgba(250,204,21,0.12)]" />
                            <div className={`w-12 h-1 rounded-full transition-colors z-10 ${dragState === 'dock' ? 'bg-blue-500' : 'bg-transparent group-hover:bg-white/30'}`} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
