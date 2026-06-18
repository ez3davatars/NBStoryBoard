import React from 'react';
import { SidebarPanel } from '../ui/SidebarPanel';
import { RefreshCcw, Database, Fingerprint, Code2, Info } from 'lucide-react';

type AdvancedRenderPanelProps = {
    collapsed: boolean;
    onToggle: (id: string) => void;
    onDragStart: (id: string) => void;
    onDrop: (id: string) => void;

    // Hook states Passed Down
    strictMode: boolean;
    setStrictMode: (v: boolean) => void;
    autoAnchorDNA: boolean;
    setAutoAnchorDNA: (v: boolean) => void;
    dnaStatus: 'idle' | 'analyzing' | 'ready' | 'error';
    anchorDNA: { environment: string; lighting: string; camera: string; };
    analyzeBackgroundDNA: () => void;
    autoTokenProfiles: boolean;
    setAutoTokenProfiles: (v: boolean) => void;
    handleAnalyzeMissingTokenProfiles: () => void;
    tokenProfilesReady: number;
    tokenProfilesTotal: number;

    // Realtime Compiler output
    compiledPrompt: string;
};

export const AdvancedRenderPanel: React.FC<AdvancedRenderPanelProps> = ({
    collapsed, onToggle, onDragStart, onDrop,
    strictMode, setStrictMode,
    autoAnchorDNA, setAutoAnchorDNA,
    dnaStatus, anchorDNA, analyzeBackgroundDNA,
    autoTokenProfiles, setAutoTokenProfiles,
    handleAnalyzeMissingTokenProfiles,
    tokenProfilesReady, tokenProfilesTotal,
    compiledPrompt
}) => {

    const semanticStatus = strictMode ? 'INJECTED' 
        : (compiledPrompt && compiledPrompt.includes('SCENARIO-SPECIFIC ACTOR PLACEMENT') ? 'PARTIAL' : 'INACTIVE');

    return (
        <SidebarPanel
            id="advanced_render"
            title="Advanced Render Parameters"
            icon={Fingerprint}
            collapsed={collapsed}
            onToggle={onToggle}
            onDragStart={onDragStart}
            onDrop={onDrop}
        >
            <div className="flex flex-col gap-4 p-3 bg-black/20 rounded-lg border border-white/5">
                
                {/* STRICT MODE TOGGLE */}
                <div className="flex flex-col gap-2 p-3 bg-red-950/20 border border-red-900/40 rounded shadow-inner relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl -mr-10 -mt-10" />
                    
                    <div className="flex items-center justify-between mb-1 z-10">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-red-400 tracking-wider flex items-center gap-1.5 uppercase">
                                Strict Semantic Lock
                                <span title="Bypasses standard creative interpretation. Forces the engine into a rigid geometry-aware compositor. Use only for structural identity replacement.">
                                    <Info className="w-3.5 h-3.5 text-red-400/50 cursor-help" />
                                </span>
                            </h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={strictMode} 
                                onChange={(e) => setStrictMode(e.target.checked)} 
                            />
                            <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-900 border border-white/10 shadow-inner"></div>
                        </label>
                    </div>
                </div>

                {/* SCENE-ONLY DNA EXTRACTION */}
                <div className={`flex flex-col gap-2 p-3 rounded border transition-all duration-300 ${strictMode ? 'bg-[#18181b] border-[#27272a]' : 'opacity-40 grayscale pointer-events-none'}`}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-300">Re-Extract Scene Only</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={autoAnchorDNA} 
                                onChange={(e) => setAutoAnchorDNA(e.target.checked)} 
                            />
                            <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-900 border border-white/10 shadow-inner"></div>
                        </label>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-snug">
                        Scene extraction preserves background/layout only. Actor identity comes from the selected cast reference.
                    </p>
                    <div className="text-[10px] text-gray-500 font-mono tracking-tight bg-black/40 p-2 rounded flex flex-col gap-1 overflow-hidden">
                        <div className="flex">
                            <span className="w-12 text-gray-600 shrink-0">ENV:</span>
                            <span className="truncate text-blue-300/80">{anchorDNA.environment || 'Pending Analysis...'}</span>
                        </div>
                        <div className="flex">
                            <span className="w-12 text-gray-600 shrink-0">LITE:</span>
                            <span className="truncate text-amber-300/80">{anchorDNA.lighting || 'Pending Analysis...'}</span>
                        </div>
                        <div className="flex">
                            <span className="w-12 text-gray-600 shrink-0">CAM:</span>
                            <span className="truncate text-green-300/80">{anchorDNA.camera || 'Pending Analysis...'}</span>
                        </div>
                    </div>
                    <button 
                        onClick={analyzeBackgroundDNA}
                        disabled={dnaStatus === 'analyzing'}
                        className="flex items-center justify-center gap-1.5 w-full py-1 mt-1 bg-[#27272a] hover:bg-[#3f3f46] text-white text-[9px] font-bold tracking-widest uppercase rounded disabled:opacity-50 transition-colors"
                    >
                        <RefreshCcw className={`w-3 h-3 ${dnaStatus === 'analyzing' ? 'animate-spin text-amber-500' : 'text-gray-400'}`} />
                        {dnaStatus === 'analyzing' ? 'Extracting...' : 'Re-Extract Scene Only'}
                    </button>
                </div>

                {/* WHITELIST PROFILES */}
                <div className={`flex flex-col gap-2 p-3 rounded border transition-all duration-300 ${strictMode ? 'bg-[#18181b] border-[#27272a]' : 'opacity-40 grayscale pointer-events-none'}`}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-300">Auto Whitelist Profiles</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={autoTokenProfiles} 
                                onChange={(e) => setAutoTokenProfiles(e.target.checked)} 
                            />
                            <div className="w-9 h-5 bg-black peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-900 border border-white/10 shadow-inner"></div>
                        </label>
                    </div>
                    <div className="flex items-center justify-between bg-black/40 px-2 py-1.5 rounded">
                        <div className="flex items-center gap-2">
                            <Database className={`w-3 h-3 ${tokenProfilesReady === tokenProfilesTotal ? 'text-green-500' : 'text-amber-500'}`} />
                            <span className="text-[10px] font-mono text-gray-400">Tokens Ready:</span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold ${tokenProfilesReady === tokenProfilesTotal ? 'text-green-400' : 'text-amber-400'}`}>
                            {tokenProfilesReady} / {tokenProfilesTotal}
                        </span>
                    </div>
                    {tokenProfilesReady < tokenProfilesTotal && (
                        <button
                            onClick={handleAnalyzeMissingTokenProfiles}
                            className="w-full py-1 text-[9px] font-bold tracking-widest uppercase bg-amber-900/30 hover:bg-amber-800/50 text-amber-500 border border-amber-900/50 rounded transition-colors"
                        >
                            Analyze Missing
                        </button>
                    )}
                </div>

                {/* COMPILED PROMPT PREVIEW */}
                <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-[10px] font-bold text-gray-500 tracking-wider uppercase">Active Handoff Payload</span>
                        </div>
                        <span className={`text-[8px] font-mono tracking-tighter uppercase px-1.5 py-0.5 rounded border ${
                            semanticStatus === 'INJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                            semanticStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                            'bg-gray-500/10 text-gray-400 border-gray-500/30'
                        }`}>
                            DIRECTOR CANVAS SEMANTIC MAPPING: {semanticStatus}
                        </span>
                    </div>
                    <div className="relative">
                        <textarea
                            readOnly
                            value={compiledPrompt || 'Pending Generation...'}
                            className="w-full h-48 bg-[#09090b] text-[9px] leading-tight text-gray-400 font-mono p-3 rounded border border-[#27272a] shadow-inner resize-y custom-scrollbar focus:outline-none focus:border-[#3f3f46] transition-colors"
                        />
                        <div className="absolute top-0 right-0 left-0 h-4 bg-gradient-to-b from-[#09090b] to-transparent pointer-events-none rounded-t-lg" />
                        <div className="absolute bottom-0 right-0 left-0 h-4 bg-gradient-to-t from-[#09090b] to-transparent pointer-events-none rounded-b-lg" />
                    </div>
                </div>

            </div>
        </SidebarPanel>
    );
};
