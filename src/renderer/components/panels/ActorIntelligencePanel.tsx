import { SidebarPanel } from '../ui/SidebarPanel';
import { Sparkles, RefreshCcw, ShieldCheck } from 'lucide-react';
import { GeminiService } from '../../services/GeminiService';
import { ensureAuthenticatedForGeneration } from '../../services/AuthGenerationGate';
import type { Action, AppState, GroundingAudit } from '../../context/AppContext';
import { DebouncedTextarea } from '../ui/DebouncedTextarea';
import { DEPTH_FEATURE_ENABLED } from '../../config/featureFlags';
import { getCompactActorLabel } from '../../utils/nameHelpers';

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const ACTOR_ANALYSIS_UI_WAIT_MS = 60000;
const ACTOR_ANALYSIS_HARD_TIMEOUT_MS = 70000;

interface ActorIntelligencePanelProps {
    state: AppState;
    dispatch: (action: Action) => void;
    authorityStatus: string;
    analyzingTokenId: string | null;
    setAnalyzingTokenId: (id: string | null) => void;
    showDebugDepthMap: boolean;
    setShowDebugDepthMap: (val: boolean) => void;
    showDebugFloor: boolean;
    setShowDebugFloor: (val: boolean) => void;
    showDebugVolumes: boolean;
    setShowDebugVolumes: (val: boolean) => void;
    showDebugBands: boolean;
    setShowDebugBands: (val: boolean) => void;
    showDebugActorHUD: boolean;
    setShowDebugActorHUD: (val: boolean) => void;
    collapsed: boolean;
    onToggle: (id: string) => void;
    onDragStart: (id: string) => void;
    onDrop: (targetId: string) => void;
    onRefreshSpatialData: () => void;
    style?: React.CSSProperties;
}

export const ActorIntelligencePanel = ({
    state,
    dispatch,
    authorityStatus,
    analyzingTokenId,
    setAnalyzingTokenId,
    showDebugDepthMap,
    setShowDebugDepthMap,
    showDebugFloor,
    setShowDebugFloor,
    showDebugVolumes,
    setShowDebugVolumes,
    showDebugBands,
    setShowDebugBands,
    showDebugActorHUD: showDebugActorOverlay,
    setShowDebugActorHUD: setShowDebugActorOverlay,
    collapsed,
    onToggle,
    onDragStart,
    onDrop,
    onRefreshSpatialData,
    style
}: ActorIntelligencePanelProps) => {
    const showInternalDepthControls = DEPTH_FEATURE_ENABLED;
    const isDepthOff = !state.depthMapUrl && !state.isDepthProcessing;
    const headerColor = !showInternalDepthControls
        ? 'text-purple-400'
        : isDepthOff
        ? 'text-gray-500'
        : authorityStatus === 'AUTHORITATIVE'
            ? 'text-green-400'
            : authorityStatus === 'DEGRADED'
                ? 'text-amber-400'
                : 'text-red-500';
    const statusLabel = state.isDepthProcessing
        ? 'Building'
        : isDepthOff
            ? 'Off'
            : authorityStatus === 'AUTHORITATIVE'
                ? 'Locked'
                : authorityStatus === 'DEGRADED'
                    ? 'Limited'
                    : 'Unavailable';
    const statusClass = state.isDepthProcessing
        ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
        : isDepthOff
            ? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
            : authorityStatus === 'AUTHORITATIVE'
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : authorityStatus === 'DEGRADED'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-red-500/10 text-red-500 border-red-500/30';

    return (
        <SidebarPanel
            id="actor_intel"
            title="Actor Intelligence"
            icon={Sparkles}
            collapsed={collapsed}
            onToggle={onToggle}
            onDragStart={onDragStart}
            onDrop={onDrop}
            style={style}
            headerColor={headerColor}
            rightElement={showInternalDepthControls ? (
                <div className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black tracking-tight uppercase border transition-colors ${statusClass}`}>
                    {statusLabel}
                </div>
            ) : undefined}
        >
            {/* TECHNICAL DEBUG (DEV ONLY) */}
            {showInternalDepthControls && (
                <div className="mb-4 p-2 bg-[#1c1c1f] rounded-lg border border-[#27272a] space-y-2">
                    <h5 className="text-[11px] font-black text-blue-400/80 uppercase tracking-tighter mb-1">
                        Debug Overlays
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                        {/* 1. Depth Map (with Loading State) & Refresh */}
                        <div className="flex gap-1 items-center">
                            <button
                                onClick={() => {
                                    if (state.depthMapUrl) {
                                        setShowDebugDepthMap(!showDebugDepthMap);
                                    } else {
                                        onRefreshSpatialData();
                                    }
                                }}
                                disabled={state.isDepthProcessing || (!state.depthMapUrl && !state.backgroundUrl)}
                                className={`flex-1 px-3 py-1.5 text-[11px] font-bold rounded border transition-colors flex items-center justify-center gap-1 ${state.isDepthProcessing ? 'bg-blue-900/10 text-blue-300/50 border-blue-500/10 cursor-wait' : showDebugDepthMap ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-[#27272a]'}`}
                                title={state.depthMapUrl ? "Visualizes the internal estimated spatial hint." : "Generate an internal estimated spatial hint for staging helpers."}
                            >
                                {state.isDepthProcessing && <RefreshCcw className="w-3 h-3 animate-spin" />}
                                {state.isDepthProcessing ? 'Generating...' : state.depthMapUrl ? 'Spatial Hint' : 'Generate Hint'}
                            </button>
                            <button
                                onClick={onRefreshSpatialData}
                                disabled={state.isDepthProcessing || !state.backgroundUrl}
                                className="px-2 py-2 bg-blue-900/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Generate or regenerate internal spatial hint"
                            >
                                <RefreshCcw className="w-3 h-3" />
                            </button>
                        </div>

                        {/* 2. Advisory Grounding */}
                        <button
                            onClick={() => setShowDebugFloor(!showDebugFloor)}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded border transition-colors ${showDebugFloor ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-[#27272a]'}`}
                            title="Visualizes the internal estimated grounding line."
                        >
                            Ground Hint
                        </button>

                        {/* 3. Layout Volumes */}
                        <button
                            onClick={() => setShowDebugVolumes(!showDebugVolumes)}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded border transition-colors ${showDebugVolumes ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-[#27272a]'}`}
                            title="Visualizes internal estimated layout volumes."
                        >
                            Layout Volumes
                        </button>

                        {/* 4. Hint Bands */}
                        <button
                            onClick={() => setShowDebugBands(!showDebugBands)}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded border transition-colors ${showDebugBands ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-[#27272a]'}`}
                            title="Visualizes the internal staging hint band assigned to each actor."
                        >
                            Hint Bands
                        </button>

                        {/* 5. HUD */}
                        <button
                            onClick={() => setShowDebugActorOverlay(!showDebugActorOverlay)}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded border transition-colors col-span-2 ${showDebugActorOverlay ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-black/20 text-gray-400 border-white/10 hover:bg-[#27272a]'}`}
                            title="Overlays raw internal spatial metrics on top of each actor."
                        >
                            Actor HUD
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {state.tokens.length === 0 ? (
                    <div className="text-[11px] text-gray-600 italic py-4 border border-dashed border-gray-800 rounded-lg text-center">
                        No actors on stage.
                    </div>
                ) : (
                    state.tokens.map((token) => (
                        <div key={token.id} className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 group">
                            <div className="actor-intelligence-selected-token flex items-center justify-between mb-2">
                                <span className="token-label text-[11px] font-bold text-white uppercase" title={token.tag}>{getCompactActorLabel(token.tag)}</span>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (state.billingEntitlements.effectiveBillingMode === 'byok' && !state.apiKey) {
                                            dispatch({ type: 'ADD_LOG', payload: { message: "BYOK mode is selected. Add your API key in Settings to continue.", type: 'error' } });
                                            return;
                                        }
                                        if (!(await ensureAuthenticatedForGeneration({ billingMode: state.billingEntitlements.effectiveBillingMode, featureLabel: 'Actor intelligence analysis' }))) {
                                            return;
                                        }
                                        setAnalyzingTokenId(token.id);
                                        const abortController = new AbortController();
                                        let timeoutId: ReturnType<typeof setTimeout> | null = null;
                                        try {
                                            const imageUrl =
                                                token.sourceImageUrl ||
                                                token.cutoutUrl ||
                                                token.url ||
                                                state.actorLibrary.find(actor => actor.id === token.castId)?.url ||
                                                state.cast.find(actor => actor.id === token.castId)?.url;

                                            if (!imageUrl) {
                                                throw new Error('No analyzable actor image was found.');
                                            }

                                            const analysisPromise = GeminiService.runHostedImageAnalysis({
                                                analysisKind: 'actor_intelligence',
                                                prompt: "Describe this character's pose, expression, and physical action in this scene context. Be very specific about lighting interaction. Max 30 words.",
                                                imageUrl,
                                                apiKey: state.apiKey || '',
                                                model: state.model,
                                                billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                                                uiWaitWindowMs: ACTOR_ANALYSIS_UI_WAIT_MS,
                                                signal: abortController.signal
                                            });
                                            analysisPromise.catch(() => undefined);

                                            const timeoutPromise = new Promise<never>((_, reject) => {
                                                timeoutId = setTimeout(() => {
                                                    abortController.abort();
                                                    reject(new Error(`Actor analysis timed out after ${Math.round(ACTOR_ANALYSIS_HARD_TIMEOUT_MS / 1000)} seconds. The hosted backend may still be processing or unavailable.`));
                                                }, ACTOR_ANALYSIS_HARD_TIMEOUT_MS);
                                            });

                                            const intelligence = await Promise.race([analysisPromise, timeoutPromise]);
                                            dispatch({ type: 'UPDATE_TOKEN', payload: { id: token.id, intelligence } });
                                            dispatch({ type: 'ADD_LOG', payload: { message: `Actor analysis complete: ${token.tag}`, type: 'success' } });
                                        } catch (error) {
                                            dispatch({ type: 'ADD_LOG', payload: { message: `Actor analysis failed: ${getErrorMessage(error)}`, type: 'error' } });
                                        } finally {
                                            if (timeoutId) clearTimeout(timeoutId);
                                            setAnalyzingTokenId(null);
                                        }
                                    }}
                                    disabled={analyzingTokenId === token.id}
                                    className="text-[11px] text-blue-400 hover:text-blue-300 font-bold uppercase flex items-center gap-1"
                                >
                                    {analyzingTokenId === token.id ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                    Auto Analyze
                                </button>
                                <button
                                    onClick={() => {
                                        const imageUrl = token.sourceImageUrl || token.cutoutUrl || token.url;
                                        if (imageUrl) {
                                            dispatch({ type: 'SET_PRODUCTION_ACTOR_WORKFLOW_SOURCE', payload: { imageUrl, suggestedName: token.tag } });
                                        }
                                    }}
                                    className="text-[11px] text-accent hover:text-accent-2 font-bold uppercase flex items-center gap-1"
                                    title="Convert this token into a reusable Production Actor."
                                >
                                    <ShieldCheck className="w-3 h-3" />
                                    Prod Actor
                                </button>
                            </div>
                            <div className="flex flex-col gap-2">
                                <DebouncedTextarea
                                    value={token.intelligence || ''}
                                    onChange={(val) => dispatch({ type: 'UPDATE_TOKEN', payload: { id: token.id, intelligence: val } })}
                                    className="w-full min-h-[132px] max-h-[280px] bg-[#09090b] border border-[#27272a] rounded p-2 text-xs text-gray-400 focus:border-blue-500 outline-none resize-y overflow-y-auto leading-relaxed"
                                    rows={6}
                                    placeholder="Pose, Action, Lighting DNA..."
                                />

                                {/* Internal advisory grounding control */}
                                {showInternalDepthControls && (
                                <div className="flex items-center justify-between gap-2 px-1">
                                    <button
                                        onClick={() => {
                                            const nextGrounding = !token.groundingEnabled;
                                            if (nextGrounding && state.floorPlane?.confidence === 'fallback' && !token.manualGroundingOverride) {
                                                dispatch({ type: 'ADD_LOG', payload: { message: "GROUNDING BLOCKED: Low-confidence floor detection.", type: 'info' } });
                                                return;
                                            }

                                            const audit: GroundingAudit | undefined = nextGrounding && state.floorPlane?.confidence === 'fallback' && token.manualGroundingOverride
                                                ? { overriddenAt: Date.now(), confidenceAtTime: 'fallback' }
                                                : token.groundingAudit;

                                            dispatch({
                                                type: 'UPDATE_TOKEN', payload: {
                                                    id: token.id,
                                                    groundingEnabled: nextGrounding,
                                                    depth: nextGrounding && state.floorPlane ? (state.floorPlane.depth / 255) : token.depth,
                                                    groundingAudit: audit
                                                }
                                            });
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-[11px] font-bold uppercase transition-all ${token.groundingEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:bg-gray-800'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${token.groundingEnabled ? 'bg-emerald-400 -[0_0_4px_rgba(52,211,153,0.5)]' : 'bg-gray-600'}`} />
                                        Ground Hint
                                    </button>

                                    <div className="flex-1 flex items-center gap-2 bg-black/40 px-2 py-1 rounded border border-white/5">
                                        <input
                                            type="checkbox"
                                            id={`manual-${token.id}`}
                                            checked={token.manualGroundingOverride || false}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                const auditData = checked && state.floorPlane?.confidence === 'fallback'
                                                    ? { overriddenAt: Date.now(), confidenceAtTime: 'fallback' as const }
                                                    : undefined;

                                                dispatch({
                                                    type: 'UPDATE_TOKEN', payload: {
                                                        id: token.id,
                                                        manualGroundingOverride: checked,
                                                        groundingAudit: auditData
                                                    }
                                                });
                                            }}
                                            className="w-3.5 h-3.5 rounded bg-zinc-800 border-zinc-700 text-yellow-500"
                                        />
                                        <label htmlFor={`manual-${token.id}`} className="text-[10px] font-bold text-gray-500 uppercase cursor-pointer select-none">Manual</label>
                                    </div>
                                </div>
                                )}


                            </div>
                        </div>
                    ))
                )}
            </div>
        </SidebarPanel>
    );
};



