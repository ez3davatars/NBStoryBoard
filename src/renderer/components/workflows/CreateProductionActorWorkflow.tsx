import React, { useState } from 'react';
import { 
    X, UserCheck, ShieldCheck, ChevronRight, Check, 
    Camera, Shirt, Clapperboard, Briefcase, RefreshCw, Edit2
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { GeminiService } from '../../services/GeminiService';
import type { ProductionActorProfile } from '../../types/ProductionActorProfile';
import { LibraryAssetMaterializer } from '../../services/LibraryAssetMaterializer';
import { createBiometricIdentityLock } from '../../../prompts/identityContracts';

export const CreateProductionActorWorkflow: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const source = state.productionActorWorkflowSource;

    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    
    // Form fields
    const [actorName, setActorName] = useState(source?.suggestedName || 'New Production Actor');
    const [identitySummary, setIdentitySummary] = useState('');
    const [styleSummary, setStyleSummary] = useState('');
    const [wardrobeSummary, setWardrobeSummary] = useState('');
    const [preserveRules, setPreserveRules] = useState<string>('Biometric Identity, Facial Proportions');
    const [avoidRules, setAvoidRules] = useState<string>('Identity Drift, Generic Face Replacement');

    if (!source) return null;

    const closeWorkflow = () => {
        dispatch({ type: 'SET_PRODUCTION_ACTOR_WORKFLOW_SOURCE', payload: null });
    };

    const handleAnalysis = async () => {
        setIsAnalyzing(true);
        setAnalysisError(null);
        try {
            const prompt = `Analyze this character for production use. Return a JSON object with these exact keys:
            "name": A guessed name or role (e.g. "Lead Protagonist", "Sci-Fi Soldier").
            "identitySummary": A concise summary of facial structure, age, and notable features.
            "styleSummary": A concise summary of the rendering style and mood.
            "wardrobeSummary": A concise summary of the clothing.
            "preserveRules": An array of strings, listing 3-4 visual traits to strictly preserve.
            "avoidRules": An array of strings, listing 2-3 traits/errors to strictly avoid.`;
            
            const analysis = await GeminiService.analyzeMultiFrameJson<{
                name: string;
                identitySummary: string;
                styleSummary: string;
                wardrobeSummary: string;
                preserveRules: string[];
                avoidRules: string[];
            }>(
                prompt,
                state.apiKey || '',
                state.model,
                [{ url: source.imageUrl, label: 'Source Material' }],
                {
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                }
            );
            
            if (analysis.name) setActorName(analysis.name);
            if (analysis.identitySummary) setIdentitySummary(analysis.identitySummary);
            if (analysis.styleSummary) setStyleSummary(analysis.styleSummary);
            if (analysis.wardrobeSummary) setWardrobeSummary(analysis.wardrobeSummary);
            if (Array.isArray(analysis.preserveRules)) setPreserveRules(analysis.preserveRules.join(', '));
            if (Array.isArray(analysis.avoidRules)) setAvoidRules(analysis.avoidRules.join(', '));
            
            setStep(3);
        } catch (e) {
            console.error("Actor analysis failed", e);
            setAnalysisError('Actor intelligence analysis failed. Please try again or use Manual Entry.');
            dispatch({ type: 'ADD_LOG', payload: { message: 'Actor intelligence analysis failed.', type: 'error' } });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleManualEntry = () => {
        setActorName(source?.suggestedName || 'New Production Actor');
        setIdentitySummary('');
        setStyleSummary('');
        setWardrobeSummary('');
        setPreserveRules('');
        setAvoidRules('');
        setStep(3);
    };

    const handleSaveAndRoute = async (route?: 'wardrobe' | 'staging' | 'props' | 'pitch', saveToLibrary = true) => {
        try {
            dispatch({ type: 'ADD_LOG', payload: { message: "Materializing Production Actor...", type: 'info' } });
            
            const actorId = `prod-actor-${Date.now()}`;
            const nowIso = new Date().toISOString();
            const pendingProfile = {
                id: actorId,
                name: actorName,
                identitySummary,
                styleSummary,
                wardrobeSummary,
                preserveRules: preserveRules.split(',').map(s => s.trim()),
                avoidRules: avoidRules.split(',').map(s => s.trim()),
                createdAt: nowIso,
                updatedAt: nowIso
            };

            const mat = await LibraryAssetMaterializer.materializeCastAsset({
                sourceUrl: source.imageUrl,
                saveDirectoryPath: state.saveDirectoryPath,
                actorName: actorName,
                category: 'Production Cast',
                productionProfile: saveToLibrary ? pendingProfile : undefined,
                sourcePitchSheetUrl: (source as any).pitchSheetUrl || state.storyboardSource?.url || undefined
            });

            const profile: ProductionActorProfile = {
                ...pendingProfile,
                sourceImageUrl: mat.sourceUrl,
                approvedImageUrl: mat.previewUrl
            };

            const newActor = {
                id: profile.id,
                url: mat.previewUrl,
                localPath: mat.localPath || undefined,
                previewUrl: mat.previewUrl,
                sourceUrl: mat.sourceUrl,
                tag: 'front' as const,
                name: profile.name,
                filename: mat.filename,
                isProductionActor: true,
                assetType: "production_actor" as const,
                productionActorProfile: profile,
                productionProfile: profile,
                category: "production_actors",
                studio: "production_actors",
                categoryKey: "production_actors",
                profile: {
                    identity: profile.name,
                    wardrobe: profile.wardrobeSummary || '',
                    accessories: '',
                    style: profile.styleSummary || 'biometric_realism'
                }
            };

            dispatch({
                type: 'ADD_CAST',
                payload: newActor
            });

            if (saveToLibrary) {
                dispatch({
                    type: 'ADD_ACTOR_LIBRARY',
                    payload: newActor
                });
            }

            const logMsg = saveToLibrary 
                ? `Production Actor ${profile.name} saved to library and cast.`
                : `Production Actor ${profile.name} added to cast only.`;
            dispatch({ type: 'ADD_LOG', payload: { message: logMsg, type: 'success' } });
            
            if (route) {
                if (route === 'pitch') {
                   dispatch({
                       type: 'SET_PENDING_PITCH_SHEET_HANDOFF',
                       payload: {
                           source: 'production_actor_workflow',
                           createdAt: Date.now(),
                           characterId: profile.id,
                           identityLock: createBiometricIdentityLock({ characterId: profile.id }),
                           identityImages: [{ angle: 'center', imageUrl: mat.previewUrl }],
                           identityStrength: 100,
                           mode: 'scan_plus_character',
                           finalCharacterUrl: mat.previewUrl,
                           productionActorProfile: profile
                       }
                   });
                   dispatch({ type: 'SET_VIEW', payload: 'portrait' });
                } else {
                   dispatch({ type: 'SET_VIEW', payload: route });
                }
            }
            closeWorkflow();

        } catch (e) {
            console.error("Save failed", e);
            dispatch({ type: 'ADD_LOG', payload: { message: 'Failed to save Production Actor.', type: 'error' } });
        }
    };

    return (
        <div className="fixed inset-0 z-[5000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300 select-none">
            <div className="w-full max-w-5xl h-[85vh] bg-[#121214] border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
                {/* Header */}
                <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-surface shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">Create Production Actor</h2>
                            <p className="text-[10px] text-muted tracking-wider uppercase">Identity Lock & Routing Workflow</p>
                        </div>
                    </div>
                    <button onClick={closeWorkflow} className="text-muted hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Preview */}
                    <div className="w-[45%] bg-black/50 border-r border-border p-6 flex flex-col items-center justify-center relative group">
                        <div className="absolute top-4 left-4 text-[10px] font-black uppercase tracking-widest text-muted z-10 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full backdrop-blur-md border border-white/5">
                            <Camera className="w-3 h-3" /> Source Material
                        </div>
                        <img 
                            src={source.imageUrl} 
                            alt="Actor Source" 
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
                        />
                    </div>

                    {/* Right Panel: Workflow Steps */}
                    <div className="w-[55%] flex flex-col relative bg-surface-2/30">
                        {/* Progress Bar */}
                        <div className="flex w-full h-1 bg-surface-2 absolute top-0 left-0">
                            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            {/* STEP 1: Initiation */}
                            {step === 1 && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-500">
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">Initialize Profile</h3>
                                    <p className="text-sm text-muted mb-8">Promote this character generation to an approved Production Actor. This locks their biometric identity and makes them available globally for scene generation and wardrobe.</p>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 block">Actor Designation</label>
                                            <input 
                                                type="text" 
                                                value={actorName}
                                                onChange={e => setActorName(e.target.value)}
                                                className="w-full bg-black/40 border border-border rounded-lg p-3 text-white focus:border-accent outline-none font-medium"
                                                placeholder="e.g. Lead Protagonist, Background Extra A"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-border flex justify-end">
                                        <button 
                                            onClick={() => setStep(2)}
                                            className="px-6 py-3 bg-accent/10 text-accent border border-accent/20 font-black uppercase tracking-widest rounded-lg hover:bg-accent/20 hover:text-accent-2 hover:border-accent/40 transition-colors flex items-center gap-2"
                                        >
                                            Next: Intelligence <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: Intelligence */}
                            {step === 2 && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-500">
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">Actor Intelligence</h3>
                                    <p className="text-sm text-muted mb-8">Run AI analysis to detect identity traits, style, wardrobe, and preservation rules — or enter the actor details manually.</p>
                                    
                                    <div className="flex flex-col gap-4 items-center justify-center py-12 bg-black/20 border border-border/50 rounded-xl">
                                        <ShieldCheck className="w-12 h-12 text-accent/50 mb-2" />
                                        {isAnalyzing && (
                                            <p className="text-xs text-accent font-bold uppercase tracking-widest animate-pulse mb-2">Analyzing actor identity from the source image…</p>
                                        )}
                                        {analysisError && (
                                            <p className="text-xs text-red-400 font-bold mb-4">{analysisError}</p>
                                        )}
                                        <div className="flex gap-4">
                                            <button 
                                                onClick={() => void handleAnalysis()}
                                                disabled={isAnalyzing}
                                                className="px-6 py-3 bg-surface border border-accent/30 text-accent font-black uppercase tracking-widest rounded-lg hover:bg-accent/10 transition-colors flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                                                {isAnalyzing ? "ANALYZING..." : "AUTO-ANALYZE IDENTITY"}
                                            </button>
                                            <button 
                                                onClick={handleManualEntry}
                                                disabled={isAnalyzing}
                                                className="px-6 py-3 bg-transparent text-muted font-bold uppercase tracking-widest rounded-lg hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                                            >
                                                Manual Entry
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* STEP 3: Confirmation */}
                            {step === 3 && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-500">
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">Review & Adjust</h3>
                                    <p className="text-sm text-muted mb-6">Review the locked metadata for this Production Actor.</p>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 block">Identity Summary</label>
                                            <textarea 
                                                value={identitySummary}
                                                onChange={e => setIdentitySummary(e.target.value)}
                                                className="w-full h-16 bg-black/40 border border-border rounded-lg p-3 text-sm text-white focus:border-accent outline-none resize-none"
                                                placeholder="Describe facial structure, age, notable features..."
                                            />
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 block">Style Summary</label>
                                                <textarea 
                                                    value={styleSummary}
                                                    onChange={e => setStyleSummary(e.target.value)}
                                                    className="w-full h-16 bg-black/40 border border-border rounded-lg p-3 text-sm text-white focus:border-accent outline-none resize-none"
                                                    placeholder="Describe rendering style and mood..."
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 block">Wardrobe Summary</label>
                                                <textarea 
                                                    value={wardrobeSummary}
                                                    onChange={e => setWardrobeSummary(e.target.value)}
                                                    className="w-full h-16 bg-black/40 border border-border rounded-lg p-3 text-sm text-white focus:border-accent outline-none resize-none"
                                                    placeholder="Describe clothing and accessories..."
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 block">Preservation Rules (Comma separated)</label>
                                            <input 
                                                type="text" 
                                                value={preserveRules}
                                                onChange={e => setPreserveRules(e.target.value)}
                                                className="w-full bg-black/40 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-100 focus:border-emerald-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 block">Avoidance Rules (Comma separated)</label>
                                            <input 
                                                type="text" 
                                                value={avoidRules}
                                                onChange={e => setAvoidRules(e.target.value)}
                                                className="w-full bg-black/40 border border-red-500/30 rounded-lg p-3 text-sm text-red-100 focus:border-red-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-border flex justify-between">
                                        <button onClick={() => setStep(2)} className="px-4 py-2 text-muted hover:text-white uppercase text-xs font-bold">Back</button>
                                        <button 
                                            onClick={() => setStep(4)}
                                            className="px-6 py-3 bg-accent/10 text-accent border border-accent/20 font-black uppercase tracking-widest rounded-lg hover:bg-accent/20 hover:text-accent-2 hover:border-accent/40 transition-colors flex items-center gap-2"
                                        >
                                            Confirm Identity Lock <Check className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* STEP 4: Routing */}
                            {step === 4 && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-500">
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start justify-between gap-4 mb-8">
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                                <UserCheck className="w-5 h-5 text-emerald-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-emerald-400 font-black uppercase tracking-widest text-sm mb-1">Identity Approved</h4>
                                                <p className="text-emerald-100/70 text-xs leading-relaxed">This actor's identity is now locked. Where would you like to send them next?</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setStep(3)}
                                            className="px-3 py-1.5 bg-black/20 hover:bg-black/40 text-emerald-400/80 hover:text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded flex items-center gap-1.5 transition-colors border border-emerald-500/20 shrink-0"
                                        >
                                            <Edit2 className="w-3 h-3" /> Edit Actor Details
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <button 
                                            onClick={() => void handleSaveAndRoute('staging')}
                                            className="p-6 bg-surface border border-border hover:border-accent hover:bg-accent/5 rounded-xl text-left transition-all group relative overflow-hidden"
                                        >
                                            <Clapperboard className="w-8 h-8 text-muted group-hover:text-accent mb-4 transition-colors" />
                                            <h5 className="font-black text-white uppercase tracking-wider mb-1">Send to Stage</h5>
                                            <p className="text-xs text-muted">Place this actor directly onto the Scene Canvas.</p>
                                        </button>

                                        <button 
                                            onClick={() => void handleSaveAndRoute('wardrobe')}
                                            className="p-6 bg-surface border border-border hover:border-accent hover:bg-accent/5 rounded-xl text-left transition-all group"
                                        >
                                            <Shirt className="w-8 h-8 text-muted group-hover:text-accent mb-4 transition-colors" />
                                            <h5 className="font-black text-white uppercase tracking-wider mb-1">Wardrobe Studio</h5>
                                            <p className="text-xs text-muted">Design and fit costumes for this locked identity.</p>
                                        </button>

                                        <button 
                                            onClick={() => void handleSaveAndRoute('props')}
                                            className="p-6 bg-surface border border-border hover:border-accent hover:bg-accent/5 rounded-xl text-left transition-all group"
                                            title="Coming soon: direct Prop Studio handoff"
                                        >
                                            <Briefcase className="w-8 h-8 text-muted group-hover:text-accent mb-4 transition-colors" />
                                            <h5 className="font-black text-white uppercase tracking-wider mb-1">Props & Accessories</h5>
                                            <p className="text-xs text-muted">Coming soon: Equip this actor.</p>
                                        </button>

                                        <button 
                                            onClick={() => void handleSaveAndRoute('pitch')}
                                            className="p-6 bg-surface border border-border hover:border-accent hover:bg-accent/5 rounded-xl text-left transition-all group relative overflow-hidden"
                                        >
                                            <ShieldCheck className="w-8 h-8 text-muted group-hover:text-accent mb-4 transition-colors" />
                                            <h5 className="font-black text-white uppercase tracking-wider mb-1">Create Pitch Sheet</h5>
                                            <p className="text-xs text-muted">Generate a production-ready actor reference sheet from this approved identity.</p>
                                        </button>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                                        <button onClick={() => setStep(3)} className="px-4 py-2 text-muted hover:text-white uppercase text-xs font-bold">Back</button>
                                        <div className="flex gap-4">
                                            <button 
                                                onClick={() => void handleSaveAndRoute(undefined, false)}
                                                className="px-6 py-3 bg-white/5 border border-white/10 text-muted hover:bg-white/10 hover:text-white font-black uppercase tracking-widest rounded-lg transition-all text-xs"
                                            >
                                                Save to Cast Only
                                            </button>
                                            <button 
                                                onClick={() => void handleSaveAndRoute(undefined, true)}
                                                className="px-6 py-3 bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 hover:text-accent-2 hover:border-accent/50 font-black uppercase tracking-widest rounded-lg transition-all text-xs"
                                            >
                                                Save Production Actor
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
