import { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Search, Film, Image as ImageIcon } from 'lucide-react';

export default function StoryboardShotRail() {
    const { state, dispatch } = useAppContext();
    const [searchQuery, setSearchQuery] = useState("");

    const filteredShots = useMemo(() => {
        if (!searchQuery) return state.shots;
        const q = searchQuery.toLowerCase();
        return state.shots.filter(shot =>
            (shot.name && shot.name.toLowerCase().includes(q)) ||
            (shot.id && shot.id.toLowerCase().includes(q))
        );
    }, [state.shots, searchQuery]);

    const handleShotClick = (shot: any) => {
        dispatch({ type: 'SET_ACTIVE_SHOT', payload: { id: shot.id } });

        // Auto-sync frames to the active storyboard slots
        if (shot.startFrameUrl) {
            dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: { url: shot.startFrameUrl, dna: 'Shot Start' } });
        } else {
            dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: null });
        }

        if (shot.endFrameUrl) {
            dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: { url: shot.endFrameUrl, dna: 'Shot End' } });
        } else {
            dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: null });
        }
    };

    return (
        <div className="flex flex-col h-full bg-black/20">
            {/* Header & Search */}
            <div className="p-4 border-b border-white/5 space-y-3 shrink-0">
                <div className="flex items-center gap-2 text-gray-400">
                    <Film className="w-4 h-4" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">Shots</h3>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search shots..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-yellow-500/50 transition-colors"
                    />
                </div>
            </div>

            {/* Shots List */}
            <div className="flex-1 h-full min-h-0 overflow-y-auto no-scrollbar p-4 pb-6 space-y-2">
                {filteredShots.map((shot, index) => {
                    const isActive = state.activeShotId === shot.id;
                    const hasStart = !!shot.startFrameUrl;
                    const hasEnd = !!shot.endFrameUrl;

                    return (
                        <button
                            key={shot.id}
                            onClick={() => handleShotClick(shot)}
                            className={`w-full group flex items-center gap-3 p-2 rounded-xl border transition-all text-left
                            ${isActive
                                    ? 'bg-yellow-500/10 border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.1)] ring-1 ring-yellow-500/20'
                                    : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}
                        >
                            {/* Thumbnail */}
                            <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black/60 shrink-0 border border-white/5">
                                {hasStart ? (
                                    <img src={shot.startFrameUrl || undefined} alt="Thumbnail" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center opacity-30">
                                        <ImageIcon className="w-4 h-4 text-gray-500" />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 py-0.5">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-bold text-gray-500 shrink-0">{String(index + 1).padStart(2, '0')}</span>
                                    <span className={`text-[11px] font-bold truncate ${isActive ? 'text-yellow-400' : 'text-gray-300 group-hover:text-white'}`}>
                                        {shot.name || "Untitled Setup"}
                                    </span>
                                </div>

                                {/* Badges */}
                                <div className="flex gap-1.5">
                                    <span className={`text-[8px] font-black px-1.5 rounded-sm ${hasStart ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-gray-600'}`}>
                                        S
                                    </span>
                                    <span className={`text-[8px] font-black px-1.5 rounded-sm ${hasEnd ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-600'}`}>
                                        E
                                    </span>
                                </div>
                            </div>
                        </button>
                    );
                })}

                {filteredShots.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        <Film className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-[10px] uppercase font-bold tracking-widest">No shots found</p>
                    </div>
                )}
            </div>
        </div>
    );
}
