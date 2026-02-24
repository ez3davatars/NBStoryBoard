import { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { formatVeoTimestampSequence } from '../../promptEngine/veoFivePart';
import type { VeoTimestampBeat } from '../../promptEngine/veoFivePart';
import { Plus, Trash2, Save, Copy, Check } from 'lucide-react';
import AutoGrowTextarea from '../ui/AutoGrowTextarea';

export default function VeoTimelinePanel() {
    const { state, dispatch } = useAppContext();
    const activeShot = state.shots.find(s => s.id === state.activeShotId);

    const [beats, setBeats] = useState<VeoTimestampBeat[]>([]);
    const [showSaved, setShowSaved] = useState(false);
    const [showCopied, setShowCopied] = useState(false);

    // Sync from active shot when it changes
    useEffect(() => {
        if (activeShot?.veoTimeline) {
            setBeats(activeShot.veoTimeline);
        } else {
            setBeats([]);
        }
    }, [activeShot?.id]);

    const updateBeats = (newBeats: VeoTimestampBeat[]) => {
        setBeats(newBeats);
        if (activeShot) {
            dispatch({
                type: 'UPDATE_SHOT_META',
                payload: { id: activeShot.id, updates: { veoTimeline: newBeats } }
            });
        }
    };

    const handleUpdateBeat = (index: number, updates: Partial<VeoTimestampBeat>) => {
        const newBeats = [...beats];
        newBeats[index] = { ...newBeats[index], ...updates };
        updateBeats(newBeats);
    };

    const handleAddBeat = () => {
        const lastBeat = beats[beats.length - 1];
        updateBeats([
            ...beats,
            {
                startMs: lastBeat ? lastBeat.endMs : 0,
                endMs: lastBeat ? lastBeat.endMs + 2000 : 2000,
                prompt: ''
            }
        ]);
    };

    const handleRemoveBeat = (index: number) => {
        updateBeats(beats.filter((_, i) => i !== index));
    };

    const handleSaveToShot = () => {
        if (!activeShot) {
            dispatch({ type: 'ADD_LOG', payload: { message: "No active shot to save to", type: 'error' } });
            return;
        }

        dispatch({
            type: 'UPDATE_SHOT_META',
            payload: { id: activeShot.id, updates: { veoTimeline: beats } }
        });

        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
        dispatch({ type: 'ADD_LOG', payload: { message: "Timeline saved to Shot", type: 'success' } });
    };

    const handleCopySequence = () => {
        const formatted = formatVeoTimestampSequence(beats);
        if (formatted) {
            navigator.clipboard.writeText(formatted);
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
            dispatch({ type: 'ADD_LOG', payload: { message: "Timeline Sequence Copied", type: 'info' } });
        }
    };

    // Convert "00:02" to ms for storage
    const parseTimeInput = (timeStr: string): number => {
        const parts = timeStr.split(':');
        if (parts.length === 2) {
            const m = parseInt(parts[0], 10) || 0;
            const s = parseInt(parts[1], 10) || 0;
            return (m * 60 + s) * 1000;
        }
        const s = parseInt(timeStr, 10) || 0;
        return s * 1000;
    }

    // Convert ms to "00:02" for input value
    const formatTimeInput = (ms: number): string => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return (
        <div className="h-full min-h-0 w-full text-gray-200 overflow-hidden flex flex-col relative">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-6 flex flex-col">

                {/* Header Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 mb-6">
                    <div>
                        <h2 className="text-lg font-black text-white uppercase tracking-wider">Veo 3.1 Timeline</h2>
                        <p className="text-xs text-gray-500 mt-1">Multi-Shot Timestamp Formatting</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopySequence}
                            disabled={beats.length === 0}
                            title="Copy Timestamp Sequence"
                            className={`flex items-center gap-2 px-3 py-1.5 rounded uppercase text-[10px] font-bold transition-colors ${beats.length === 0 ? 'bg-zinc-800 text-zinc-600' : 'bg-[#27272a] hover:bg-zinc-700 text-white'}`}
                        >
                            {showCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {showCopied ? "Copied" : "Copy Sequence"}
                        </button>

                        <button
                            onClick={handleSaveToShot}
                            disabled={!activeShot}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded uppercase text-[10px] font-bold transition-colors ${!activeShot ? 'bg-zinc-800 text-zinc-600' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                        >
                            {showSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                            {showSaved ? "Saved" : "Save to Shot"}
                        </button>
                    </div>
                </div>

                {/* Beats List */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2 pb-6">
                    <div className="max-w-4xl space-y-3 pb-12">
                        {beats.length === 0 ? (
                            <div className="bg-[#18181b] border border-[#27272a] border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center">
                                <p className="text-zinc-500 text-sm mb-4">No timestamp beats defined for this shot.</p>
                                <button
                                    onClick={handleAddBeat}
                                    className="bg-[#27272a] hover:bg-zinc-700 text-white px-4 py-2 rounded uppercase text-xs font-bold transition-colors flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Add First Beat
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {beats.map((beat, index) => (
                                    <div key={index} className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 grid grid-cols-[auto_1fr_auto] sm:grid-cols-[140px_1fr_28px] gap-4 items-start relative group">
                                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                            <div className="flex items-center bg-[#09090b] border border-[#27272a] rounded overflow-hidden shadow-inner">
                                                <input
                                                    type="text"
                                                    value={formatTimeInput(beat.startMs)}
                                                    onChange={(e) => handleUpdateBeat(index, { startMs: parseTimeInput(e.target.value) })}
                                                    className="w-14 bg-transparent text-center px-1 py-1.5 text-xs text-yellow-500 font-mono outline-none focus:bg-white/5 transition-colors"
                                                />
                                                <span className="text-zinc-600 px-1">-</span>
                                                <input
                                                    type="text"
                                                    value={formatTimeInput(beat.endMs)}
                                                    onChange={(e) => handleUpdateBeat(index, { endMs: parseTimeInput(e.target.value) })}
                                                    className="w-14 bg-transparent text-center px-1 py-1.5 text-xs text-yellow-500 font-mono outline-none focus:bg-white/5 transition-colors"
                                                />
                                            </div>
                                        </div>

                                        <div className="min-w-0 flex flex-col items-stretch w-full">
                                            <AutoGrowTextarea
                                                value={beat.prompt}
                                                onChange={(e: { target: { value: string; } }) => handleUpdateBeat(index, { prompt: e.target.value })}
                                                placeholder="Action occurring during this timestamp..."
                                                className="w-full bg-[#09090b] shadow-inner text-gray-300 text-[13px] leading-relaxed resize-y border border-transparent focus:border-white/10 p-3 outline-none transition-all placeholder:text-zinc-600 rounded-lg min-h-[44px]"
                                                minRows={2}
                                                maxRows={10}
                                            />
                                        </div>

                                        <button
                                            onClick={() => handleRemoveBeat(index)}
                                            className="p-1.5 text-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all self-start mt-1 opacity-0 group-hover:opacity-100 sm:opacity-100"
                                            title="Remove Beat"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sticky Footer for Add Beat */}
                {beats.length > 0 && (
                    <div className="sticky bottom-0 pt-3 pb-2 bg-gradient-to-t from-[#0b0f14] via-[#0b0f14]/90 to-transparent z-10 w-full max-w-4xl">
                        <button
                            onClick={handleAddBeat}
                            className="bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] border-dashed text-zinc-400 hover:text-white w-full py-3 rounded-xl uppercase text-xs font-bold transition-all flex justify-center items-center gap-2 shadow-2xl"
                        >
                            <Plus className="w-4 h-4" /> Add Next Beat
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}
