import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useAppContext } from '../../context/AppContext';
import { GeminiService } from '../../services/GeminiService';
import { formatVeoFivePartPrompt } from '../../promptEngine/veoFivePart';
import type { VeoFivePartDraft, VeoAudioBlock } from '../../promptEngine/veoFivePart';
import { Wand2, Loader2, ChevronDown, Check, Maximize2, Trash2 } from 'lucide-react';
import AutoGrowTextarea from '../ui/AutoGrowTextarea';
import { Dropdown } from '../ui/Dropdown';
import { SHOT_TYPES, LENS_OPTIONS, CAMERA_MOTIONS } from './cinematographyOptions';

export interface VeoPromptBuilderRef {
    copyPrompt: () => void;
    copyNegative: () => void;
    saveToShot: () => void;
}

type VeoDraftExtended = VeoFivePartDraft & {
    audio?: VeoAudioBlock;
    concept?: string;
    negativePrompt?: string;
    shotType?: string;
    lens?: string;
    motion?: string;
};

type ActiveEditorState = {
    id: string;
    title: string;
    value: string;
    setter: (val: string) => void;
};

type InspectorSectionProps = {
    title: string;
    children: ReactNode;
    defaultOpen?: boolean;
    titleAddon?: ReactNode;
    showExpand?: boolean;
    onExpand?: () => void;
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

// Helper for inspector sections
const InspectorSection = ({ title, children, defaultOpen = true, titleAddon, showExpand, onExpand }: InspectorSectionProps) => (
    <details open={defaultOpen} className="group rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0">
        <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/80 select-none bg-white/5 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-2">
                {title}
                {titleAddon}
            </div>
            <div className="flex items-center gap-3">
                {showExpand && onExpand && (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onExpand();
                        }}
                        className="text-white/30 hover:text-white/80 transition-colors"
                        title="Expand editor"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                )}
                <ChevronDown className="w-4 h-4 text-white/40 group-open:rotate-180 transition-transform" />
            </div>
        </summary>
        <div className="p-4 pt-2 space-y-3 border-t border-white/5">
            {children}
        </div>
    </details>
);

const VeoPromptBuilderPanel = forwardRef<VeoPromptBuilderRef>((_, ref) => { // Removed analysisSpec from props
    const { state, dispatch } = useAppContext();
    const activeShot = state.shots.find(s => s.id === state.activeShotId);
    const activeShotId = activeShot?.id;

    // Local state for the draft
    const [concept, setConcept] = useState('');
    const [cinematography, setCinematography] = useState('');
    const [subject, setSubject] = useState('');
    const [action, setAction] = useState('');
    const [contextStr, setContextStr] = useState('');
    const [styleAmbiance, setStyleAmbiance] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');

    // Audio state
    const [audioDialogue, setAudioDialogue] = useState('');
    const [audioSfx, setAudioSfx] = useState('');
    const [audioAmbience, setAudioAmbience] = useState('');
    const [audioMusic, setAudioMusic] = useState('');

    const [shotType, setShotType] = useState('');
    const [lens, setLens] = useState('');
    const [motion, setMotion] = useState('');

    const [isEnhancing, setIsEnhancing] = useState(false);

    const [activeEditor, setActiveEditor] = useState<ActiveEditorState | null>(null);

    // Sync from active shot (or global fallback) when it changes
    useEffect(() => {
        console.warn("[VeoPromptBuilderPanel] MOUNT OR SYNC EFFECT RAN! activeShot?.id:", activeShot?.id);
        const draftSource = activeShot?.veoPromptDraft || state.veoPromptDraft;

        if (draftSource) {
            const draft = draftSource as VeoDraftExtended;
            setConcept(draft.concept || '');
            setCinematography(draft.cinematography || '');
            setSubject(draft.subject || '');
            setAction(draft.action || '');
            setContextStr(draft.context || '');
            setStyleAmbiance(draft.styleAmbiance || '');
            setNegativePrompt(draft.negativePrompt || '');

            setShotType(draft.cinematographyShotType || draft.shotType || '');
            setLens(draft.cinematographyLens || draft.lens || '');
            setMotion(draft.cinematographyMotion || draft.motion || '');

            if (draft.audio) {
                setAudioDialogue(draft.audio.dialogue || '');
                setAudioSfx(draft.audio.sfx || '');
                setAudioAmbience(draft.audio.ambience || '');
                setAudioMusic(draft.audio.music || '');
            }
        } else {
            // Reset if no draft
            setConcept('');
            setCinematography('');
            setSubject('');
            setAction('');
            setContextStr('');
            setStyleAmbiance('');
            setNegativePrompt('');
            setShotType('');
            setLens('');
            setMotion('');
            setAudioDialogue('');
            setAudioSfx('');
            setAudioAmbience('');
            setAudioMusic('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeShotId]); // Re-sync when switching shots

    // Auto-save draft changes to Active Shot OR Global State (Debounced)
    useEffect(() => {
        const draft: VeoFivePartDraft & { audio?: VeoAudioBlock, concept?: string, negativePrompt?: string } = {
            concept,
            cinematography,
            cinematographyShotType: shotType,
            cinematographyLens: lens,
            cinematographyMotion: motion,
            subject,
            action,
            context: contextStr,
            styleAmbiance,
            negativePrompt,
            audio: {
                dialogue: audioDialogue,
                sfx: audioSfx,
                ambience: audioAmbience,
                music: audioMusic
            }
        };

        const timer = setTimeout(() => {
            if (activeShotId) {
                dispatch({
                    type: 'UPDATE_SHOT_META',
                    payload: { id: activeShotId, updates: { veoPromptDraft: draft } }
                });
            } else {
                dispatch({
                    type: 'SET_GLOBAL_VEO_DRAFT',
                    payload: draft
                });
            }
        }, 1000); // 1 second debounce

        return () => clearTimeout(timer);
    }, [
        activeShotId, // Ensure we save to the correct boundary
        concept, cinematography, shotType, lens, motion, subject, action, contextStr, styleAmbiance, negativePrompt,
        audioDialogue, audioSfx, audioAmbience, audioMusic, dispatch
    ]);

    const handleEnhance = async () => {
        if (!concept.trim()) return;
        setIsEnhancing(true);
        try {
            const draft = await GeminiService.generateVeoFivePartDraft(concept, state.apiKey, undefined, {
                billingMode: state.billingEntitlements?.effectiveBillingMode as 'hosted' | 'byok',
                entitlements: state.billingEntitlements
            });
            if (draft.cinematography) setCinematography(draft.cinematography);
            if (draft.subject) setSubject(draft.subject);
            if (draft.action) setAction(draft.action);
            if (draft.context) setContextStr(draft.context);
            if (draft.styleAmbiance) setStyleAmbiance(draft.styleAmbiance);
            const enhancedDraft = draft as VeoDraftExtended;
            if (enhancedDraft.negativePrompt) setNegativePrompt(enhancedDraft.negativePrompt);

            if (draft.audio) {
                if (draft.audio.dialogue) setAudioDialogue(draft.audio.dialogue);
                if (draft.audio.sfx) setAudioSfx(draft.audio.sfx);
                if (draft.audio.ambience) setAudioAmbience(draft.audio.ambience);
                if (draft.audio.music) setAudioMusic(draft.audio.music);
            }

            dispatch({ type: 'ADD_LOG', payload: { message: "Prompt Enhanced via Gemini", type: 'success' } });
        } catch (err: unknown) {
            console.error(err);
            dispatch({ type: 'ADD_LOG', payload: { message: `Enhance failed: ${getErrorMessage(err)} `, type: 'error' } });
        } finally {
            setIsEnhancing(false);
        }
    };

    const handleClear = () => {
        if (window.confirm("Are you sure you want to clear the entire prompt draft? This cannot be undone.")) {
            // First clear local state to immediately update UI
            setConcept('');
            setCinematography('');
            setSubject('');
            setAction('');
            setContextStr('');
            setStyleAmbiance('');
            setNegativePrompt('');
            setShotType('');
            setLens('');
            setMotion('');
            setAudioDialogue('');
            setAudioSfx('');
            setAudioAmbience('');
            setAudioMusic('');

            // Bypass the debounce and explicitly wipe the stores right now
            if (activeShot) {
                dispatch({
                    type: 'UPDATE_SHOT_META',
                    payload: { id: activeShot.id, updates: { veoPromptDraft: undefined } }
                });
            } else {
                dispatch({
                    type: 'SET_GLOBAL_VEO_DRAFT',
                    payload: undefined
                });
            }
            dispatch({ type: 'ADD_LOG', payload: { message: "Prompt Cleared", type: 'info' } });
        }
    };

    const handleSaveToShot = () => {
        if (!activeShot) {
            dispatch({ type: 'ADD_LOG', payload: { message: "No active shot to save to", type: 'error' } });
            return;
        }

        const draft: VeoFivePartDraft & { audio?: VeoAudioBlock, concept?: string, negativePrompt?: string } = {
            concept,
            cinematography,
            cinematographyShotType: shotType,
            cinematographyLens: lens,
            cinematographyMotion: motion,
            subject,
            action,
            context: contextStr,
            styleAmbiance,
            negativePrompt,
            audio: {
                dialogue: audioDialogue,
                sfx: audioSfx,
                ambience: audioAmbience,
                music: audioMusic
            }
        };

        dispatch({
            type: 'UPDATE_SHOT_META',
            payload: { id: activeShot.id, updates: { veoPromptDraft: draft } }
        });

        dispatch({ type: 'ADD_LOG', payload: { message: "Prompt saved to Shot", type: 'success' } });
    };

    const handleCopyPrompt = () => {
        const formatted = formatVeoFivePartPrompt({
            cinematography,
            subject,
            action,
            context: contextStr,
            styleAmbiance
        });

        // Append audio manually to the copy buffer if desired, or just copy the 5-part core.
        // The user requested: "copies formatted 5-part prompt (use formatVeoFivePartPrompt)"
        // We will stick exactly to the requested 5-part format.

        const combined = formatted;

        if (combined) {
            navigator.clipboard.writeText(combined);
            // setShowCopied(true); // Removed as per instruction
            // setTimeout(() => setShowCopied(false), 2000); // Removed as per instruction
            dispatch({ type: 'ADD_LOG', payload: { message: "Prompt Copied", type: 'info' } });
        }
    };

    const handleCopyNegative = () => {
        if (negativePrompt) {
            navigator.clipboard.writeText(negativePrompt);
            dispatch({ type: 'ADD_LOG', payload: { message: "Negative Prompt Copied", type: 'info' } });
        }
    }

    const handleCinematographyDropdownChange = (type: 'shotType' | 'lens' | 'motion', val: string) => {
        const newShotType = type === 'shotType' ? val : shotType;
        const newLens = type === 'lens' ? val : lens;
        const newMotion = type === 'motion' ? val : motion;

        const oldPrefix = [shotType, motion, lens].filter(Boolean).join(', ');
        const newPrefix = [newShotType, newMotion, newLens].filter(Boolean).join(', ');

        let updatedNotes = cinematography.trim();
        if (oldPrefix && updatedNotes.startsWith(oldPrefix)) {
            updatedNotes = updatedNotes.slice(oldPrefix.length).trim();
            if (updatedNotes.startsWith(',')) updatedNotes = updatedNotes.slice(1).trim();
        }

        const combined = [newPrefix, updatedNotes].filter(Boolean).join(', ');
        setCinematography(combined);

        if (type === 'shotType') setShotType(val);
        if (type === 'lens') setLens(val);
        if (type === 'motion') setMotion(val);
    };

    useImperativeHandle(ref, () => ({
        copyPrompt: handleCopyPrompt,
        copyNegative: handleCopyNegative,
        saveToShot: handleSaveToShot
    }));


    return (
        <div className="flex flex-col h-full text-gray-200">
            <div className="flex-1 h-full min-h-0 overflow-y-auto p-4 pb-6 space-y-4">

                <InspectorSection
                    title="Concept Target"
                    defaultOpen={true}
                    showExpand={true}
                    onExpand={() => setActiveEditor({ id: 'concept', title: 'Concept Target', value: concept, setter: setConcept })}
                >
                    <AutoGrowTextarea
                        value={concept}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                            console.warn("[VeoPromptBuilderPanel] Concept onChange FIRED. Value:", e.target.value);
                            setConcept(e.target.value);
                        }}
                        placeholder="Briefly describe what you want to see happen in this shot..."
                        className="bg-black/30 text-gray-300 placeholder-gray-600 focus:border-yellow-500/50"
                        minRows={2}
                    />
                </InspectorSection>

                <InspectorSection
                    title="1. Cinematography"
                    defaultOpen={true}
                    showExpand={true}
                    onExpand={() => setActiveEditor({ id: 'cinematography', title: '1. Cinematography', value: cinematography, setter: setCinematography })}
                >
                    <div className="grid grid-cols-1 gap-2">
                        <Dropdown
                            value={shotType}
                            placeholder="Shot Type..."
                            options={SHOT_TYPES}
                            variant="render"
                            onChange={(val) => handleCinematographyDropdownChange('shotType', val)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Dropdown
                                value={lens}
                                placeholder="Lens..."
                                options={LENS_OPTIONS}
                                variant="render"
                                onChange={(val) => handleCinematographyDropdownChange('lens', val)}
                            />
                            <Dropdown
                                value={motion}
                                placeholder="Camera Motion..."
                                options={CAMERA_MOTIONS}
                                variant="render"
                                onChange={(val) => handleCinematographyDropdownChange('motion', val)}
                            />
                        </div>
                    </div>
                    <AutoGrowTextarea
                        value={cinematography}
                        onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setCinematography(e.target.value)}
                        placeholder="Additional camera notes..."
                        className="bg-black/30 text-gray-300 placeholder-gray-600 focus:border-yellow-500/50 mt-1"
                        minRows={2}
                    />
                </InspectorSection>

                <InspectorSection
                    title="2. Subject"
                    defaultOpen={true}
                    showExpand={true}
                    onExpand={() => setActiveEditor({ id: 'subject', title: '2. Subject', value: subject, setter: setSubject })}
                >
                    <AutoGrowTextarea
                        value={subject}
                        onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setSubject(e.target.value)}
                        placeholder="Detailed description of main subject(s)..."
                        className="bg-black/30 text-gray-300 placeholder-gray-600 focus:border-yellow-500/50"
                        minRows={2}
                    />
                </InspectorSection>

                <InspectorSection
                    title="3. Action"
                    defaultOpen={true}
                    showExpand={true}
                    onExpand={() => setActiveEditor({ id: 'action', title: '3. Action', value: action, setter: setAction })}
                >
                    <AutoGrowTextarea
                        value={action}
                        onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setAction(e.target.value)}
                        placeholder="Specific movement and dynamics..."
                        className="bg-black/30 text-gray-300 placeholder-gray-600 focus:border-yellow-500/50"
                        minRows={2}
                    />
                </InspectorSection>

                <InspectorSection
                    title="4. Context"
                    defaultOpen={true}
                    showExpand={true}
                    onExpand={() => setActiveEditor({ id: 'context', title: '4. Context', value: contextStr, setter: setContextStr })}
                >
                    <AutoGrowTextarea
                        value={contextStr}
                        onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setContextStr(e.target.value)}
                        placeholder="Background, lighting, setting elements..."
                        className="bg-black/30 text-gray-300 placeholder-gray-600 focus:border-yellow-500/50"
                        minRows={2}
                    />
                </InspectorSection>

                <InspectorSection
                    title="5. Style & Ambiance"
                    defaultOpen={true}
                    showExpand={true}
                    onExpand={() => setActiveEditor({ id: 'style', title: '5. Style & Ambiance', value: styleAmbiance, setter: setStyleAmbiance })}
                >
                    <AutoGrowTextarea
                        value={styleAmbiance}
                        onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setStyleAmbiance(e.target.value)}
                        placeholder="Film stock, overarching visual mood, color grading..."
                        className="bg-black/30 text-gray-300 placeholder-gray-600 focus:border-yellow-500/50"
                        minRows={2}
                    />
                </InspectorSection>

                <InspectorSection
                    title="Negative Prompt"
                    defaultOpen={false}
                    showExpand={true}
                    onExpand={() => setActiveEditor({ id: 'negative', title: 'Negative Prompt', value: negativePrompt, setter: setNegativePrompt })}
                >
                    <AutoGrowTextarea
                        value={negativePrompt}
                        onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setNegativePrompt(e.target.value)}
                        placeholder="What to exclude..."
                        className="bg-black/30 text-gray-300 placeholder-gray-600 !border-red-900/30 focus:!border-red-500/50 !text-red-200"
                        minRows={2}
                    />
                </InspectorSection>

                <InspectorSection title="Audio Prompts" defaultOpen={false}>
                    <div className="space-y-4">
                        <div className="relative group/audio">
                            <label className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                Dialogue
                                <button
                                    onClick={() => setActiveEditor({ id: 'audio_dialogue', title: 'Audio Dialogue', value: audioDialogue, setter: setAudioDialogue })}
                                    className="opacity-0 group-hover/audio:opacity-100 text-gray-500 hover:text-white transition-all px-1"
                                >
                                    <Maximize2 className="w-3 h-3" />
                                </button>
                            </label>
                            <AutoGrowTextarea
                                value={audioDialogue}
                                onChange={e => setAudioDialogue(e.target.value)}
                                placeholder='Ex: "Stop right there!"'
                                className="w-full bg-black/30 border border-white/10 rounded-lg text-xs text-gray-300 placeholder-gray-600 focus:border-blue-500/50"
                                minRows={1}
                            />
                        </div>
                        <div className="relative group/audio">
                            <label className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                SFX
                                <button
                                    onClick={() => setActiveEditor({ id: 'audio_sfx', title: 'Audio SFX', value: audioSfx, setter: setAudioSfx })}
                                    className="opacity-0 group-hover/audio:opacity-100 text-gray-500 hover:text-white transition-all px-1"
                                >
                                    <Maximize2 className="w-3 h-3" />
                                </button>
                            </label>
                            <AutoGrowTextarea
                                value={audioSfx}
                                onChange={e => setAudioSfx(e.target.value)}
                                placeholder="Ex: Footsteps, glass breaking"
                                className="w-full bg-black/30 border border-white/10 rounded-lg text-xs text-gray-300 placeholder-gray-600 focus:border-blue-500/50"
                                minRows={1}
                            />
                        </div>
                        <div className="relative group/audio">
                            <label className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                Ambience
                                <button
                                    onClick={() => setActiveEditor({ id: 'audio_ambience', title: 'Audio Ambience', value: audioAmbience, setter: setAudioAmbience })}
                                    className="opacity-0 group-hover/audio:opacity-100 text-gray-500 hover:text-white transition-all px-1"
                                >
                                    <Maximize2 className="w-3 h-3" />
                                </button>
                            </label>
                            <AutoGrowTextarea
                                value={audioAmbience}
                                onChange={e => setAudioAmbience(e.target.value)}
                                placeholder="Ex: Distant traffic, wind"
                                className="w-full bg-black/30 border border-white/10 rounded-lg text-xs text-gray-300 placeholder-gray-600 focus:border-blue-500/50"
                                minRows={1}
                            />
                        </div>
                        <div className="relative group/audio">
                            <label className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                                Music
                                <button
                                    onClick={() => setActiveEditor({ id: 'audio_music', title: 'Audio Music', value: audioMusic, setter: setAudioMusic })}
                                    className="opacity-0 group-hover/audio:opacity-100 text-gray-500 hover:text-white transition-all px-1"
                                >
                                    <Maximize2 className="w-3 h-3" />
                                </button>
                            </label>
                            <AutoGrowTextarea
                                value={audioMusic}
                                onChange={e => setAudioMusic(e.target.value)}
                                placeholder="Ex: Tense synth baseline"
                                className="w-full bg-black/30 border border-white/10 rounded-lg text-xs text-gray-300 placeholder-gray-600 focus:border-blue-500/50"
                                minRows={1}
                            />
                        </div>
                    </div>
                </InspectorSection>

            </div>

            {/* Anchored Action Panel */}
            <div className="shrink-0 p-4 border-t border-white/10 bg-black/40 backdrop-blur-md flex items-center gap-2">
                <button
                    onClick={handleClear}
                    className="p-2.5 rounded-full flex items-center justify-center gap-2 text-red-500/70 hover:text-red-400 hover:bg-white/5 transition-all outline-none border border-transparent hover:border-red-900/30 shrink-0"
                    title="Clear entire prompt"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={handleEnhance}
                    disabled={isEnhancing || !concept.trim()}
                    className="flex-1 py-2.5 px-4 rounded-full flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all bg-white/5 hover:bg-white/10 border border-white/10 text-white disabled:opacity-50"
                >
                    {isEnhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-yellow-500" />}
                    {isEnhancing ? "Structuring..." : "Enhance with AI"}
                </button>
            </div>

            {/* Pop-out Editor Modal */}
            {activeEditor && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8 backdrop-blur-sm">
                    <div className="bg-[#0b1220] border border-white/20 rounded-2xl w-full max-w-3xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">{activeEditor.title}</h2>
                            <button
                                onClick={() => setActiveEditor(null)}
                                className="text-gray-400 hover:text-white transition-colors p-1"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <AutoGrowTextarea
                                value={activeEditor.value}
                                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                                    activeEditor.setter(e.target.value);
                                    setActiveEditor({ ...activeEditor, value: e.target.value });
                                }}
                                minRows={10}
                                maxRows={30}
                                className="text-sm "
                                autoFocus
                            />
                        </div>
                        <div className="px-6 py-4 bg-black/40 border-t border-white/10 flex justify-end">
                            <button
                                onClick={() => setActiveEditor(null)}
                                className="bg-yellow-500 hover:bg-yellow-400 text-black px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all -[0_0_15px_rgba(250,204,21,0.2)]"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default VeoPromptBuilderPanel;
