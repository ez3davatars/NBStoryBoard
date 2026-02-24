import { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { MonitorPlay, Image as ImageIcon, FileSearch, ArrowRight, Plus } from 'lucide-react';

type PlateSelection = 'start' | 'end';

export default function VeoMonitorPanel() {
    const { state, dispatch } = useAppContext();
    const [activePlate, setActivePlate] = useState<PlateSelection>('start');

    const activeShot = state.shots.find(s => s.id === state.activeShotId);

    // Fallbacks to global storyboard source if activeShot doesn't have it (or to preview what's currently loaded)
    const currentStartUrl = activeShot?.startFrameUrl ||
        (typeof state.storyboardSource === 'string' ? state.storyboardSource : state.storyboardSource?.url);
    const currentEndUrl = activeShot?.endFrameUrl ||
        (typeof state.storyboardEndSource === 'string' ? state.storyboardEndSource : state.storyboardEndSource?.url);

    // Force activePlate to 'start' if end plate is removed
    useEffect(() => {
        if (!currentEndUrl && activePlate === 'end') {
            setActivePlate('start');
        }
    }, [currentEndUrl, activePlate]);

    const displayUrl = activePlate === 'start' ? currentStartUrl : currentEndUrl;

    const handleSyncToPlate = () => {
        if (!activeShot) return;

        if (activePlate === 'start' && currentStartUrl) {
            dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: { url: currentStartUrl, dna: 'Shot Start' } });
            dispatch({ type: 'ADD_LOG', payload: { message: "Loaded Start Frame", type: 'info' } });
        } else if (activePlate === 'end' && currentEndUrl) {
            dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: { url: currentEndUrl, dna: 'Shot End' } });
            dispatch({ type: 'ADD_LOG', payload: { message: "Loaded End Frame", type: 'info' } });
        }
    };

    const handleAddEndPlate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: { url } });
            dispatch({ type: 'ADD_LOG', payload: { message: "End Plate added", type: 'success' } });
            setActivePlate('end');
        }
    };

    return (
        <div className="h-full w-full min-h-0 flex items-center justify-center p-2 outline-none">
            <div className="mx-auto w-full max-w-[1100px] max-h-full flex flex-col aspect-video bg-black/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative">

                {/* Header: Monitor Label & Plate Toggle */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/60 z-20">
                    <div className="flex items-center gap-2">
                        <MonitorPlay className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-black uppercase tracking-widest text-white/80">Program Monitor</span>
                    </div>

                    {/* Segmented Plate Toggle */}
                    {currentEndUrl && (
                        <div className="flex items-center bg-black/50 p-1 rounded-lg border border-white/5">
                            <button
                                onClick={() => setActivePlate('start')}
                                className={`px-4 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all 
                            ${activePlate === 'start' ? 'bg-white/15 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Start Plate
                            </button>
                            <button
                                onClick={() => setActivePlate('end')}
                                className={`px-4 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all 
                            ${activePlate === 'end' ? 'bg-white/15 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                End Plate
                            </button>
                        </div>
                    )}
                </div>

                {/* Main Canvas Area */}
                <div className="flex-1 relative bg-black/80 flex items-center justify-center overflow-hidden group">
                    {/* Visual Overlays */}
                    <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_40%,rgba(0,0,0,0.6)_100%)] z-10" />
                    <div className="absolute top-4 right-4 z-20 pointer-events-none">
                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest bg-black/60 border border-white/10 backdrop-blur-md ${activePlate === 'start' ? 'text-green-400' : 'text-blue-400'}`}>
                            {activePlate}
                        </span>
                    </div>

                    {displayUrl ? (
                        <img
                            src={displayUrl}
                            alt={`${activePlate} frame`}
                            className="w-full h-full object-contain z-0 transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center z-10">
                            <ImageIcon className="w-12 h-12 mb-4 text-white/10" />
                            <h3 className="text-sm font-black uppercase tracking-widest text-white/30 mb-2">
                                No {activePlate} Plate Selected
                            </h3>
                            {activeShot ? (
                                <p className="text-[10px] text-gray-500 max-w-xs uppercase tracking-wider">
                                    Drop an image into the {activePlate} slot for <span className="text-yellow-500 font-bold">{activeShot.name}</span> to preview it here.
                                </p>
                            ) : (
                                <p className="text-[10px] text-gray-500 max-w-xs uppercase tracking-wider">
                                    Select a shot from the left rail to load plate monitors
                                </p>
                            )}
                        </div>
                    )}

                    {/* Hover Sync Overlay */}
                    {displayUrl && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20 backdrop-blur-[2px]">
                            <button
                                onClick={handleSyncToPlate}
                                className={`px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-transform transform hover:scale-105 shadow-xl border flex items-center gap-2
                                ${activePlate === 'start'
                                        ? 'bg-green-500/20 text-green-400 border-green-500/50 hover:bg-green-500/30'
                                        : 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30'}`}
                            >
                                <FileSearch className="w-4 h-4" />
                                Sync target DNA
                            </button>
                        </div>
                    )}
                </div>

                {/* Bottom Filmstrip */}
                <div className="shrink-0 h-24 bg-black/90 border-t border-white/10 flex items-center justify-center gap-8 px-6 relative z-20">
                    {/* Start Thumbnail Row */}
                    <button
                        onClick={() => setActivePlate('start')}
                        className={`relative h-16 w-28 rounded-md overflow-hidden border-2 transition-all flex-shrink-0 bg-[#0d131f]
                    ${activePlate === 'start' ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)] ring-2 ring-green-500/20' : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/30'}`}
                    >
                        <div className="absolute top-1 left-1 z-10 bg-black/80 px-1.5 rounded text-[8px] font-black tracking-widest text-green-400 uppercase">S</div>
                        {currentStartUrl ? (
                            <img src={currentStartUrl} className="w-full h-full object-cover" alt="Start Thumbnail" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-white/20" />
                            </div>
                        )}
                    </button>

                    {/* Transition Arrow */}
                    <div className="flex flex-col items-center justify-center text-white/20 shrink-0">
                        <ArrowRight className="w-5 h-5 mb-1" />
                        <span className="text-[8px] uppercase tracking-widest font-black text-white/30">Target Gen</span>
                    </div>

                    {/* End Thumbnail Row or Placeholder */}
                    {currentEndUrl ? (
                        <button
                            onClick={() => setActivePlate('end')}
                            className={`relative h-16 w-28 rounded-md overflow-hidden border-2 transition-all flex-shrink-0 bg-[#0d131f]
                        ${activePlate === 'end' ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] ring-2 ring-blue-500/20' : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/30'}`}
                        >
                            <div className="absolute top-1 left-1 z-10 bg-black/80 px-1.5 rounded text-[8px] font-black tracking-widest text-blue-400 uppercase">E</div>
                            <img src={currentEndUrl} className="w-full h-full object-cover" alt="End Thumbnail" />
                        </button>
                    ) : (
                        <label className="relative h-16 w-28 rounded-md border-2 border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/10 transition-all group flex-shrink-0">
                            <input type="file" className="hidden" accept="image/*" onChange={handleAddEndPlate} />
                            <Plus className="w-5 h-5 text-gray-400 group-hover:text-blue-400 mb-1" />
                            <span className="text-[8px] font-black text-gray-500 group-hover:text-blue-400 uppercase tracking-widest text-center leading-[1.1]">
                                Add End Plate<br />(Optional)
                            </span>
                        </label>
                    )}
                </div>
            </div>
        </div>
    );
}
