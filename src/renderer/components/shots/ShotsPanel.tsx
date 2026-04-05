import React, { useState, useRef, useEffect } from 'react';
import type { ShotSession, ShotPackId, ShotLocks, ShotVariant, ShotPresetId, DirectedShotSlot } from '../../types/shots';
import type { ActorIdentityReferenceSet, ShotsActorOption } from '../../context/AppContext';
import { SHOT_PRESETS, buildShotPresetIdsForPack } from '../../utils/shotsPresets';
import { buildShotVariantPrompt, buildShotFinalRerenderPrompt } from '../../utils/promptHelpers';
import { GeminiService } from '../../services/GeminiService';
import { stripIdentityOverridingAnalysis } from '../../utils/analysisSanitizers';
import { LocalAssetService } from '../../services/LocalAssetService';
import { hasStrongFaceAnchor } from '../../utils/identityReferenceHelpers';
import { inferCoverageSceneType, extractRoleHints } from '../../utils/sceneTypeInference';
import { COVERAGE_TEMPLATES } from '../../utils/coverageTemplates';
import { ShotGrid } from './ShotGrid';
import { DirectedShotCard } from './DirectedShotCard';
import { useAppContext } from '../../context/AppContext';
import { buildSceneTruthSnapshot } from '../../utils/sceneTruthHelpers';

export type ShotsPanelProps = {
  sceneId: string;
  apiKey: string;
  model: string;
  effectiveResultImageUrl?: string;
  subjectActionText?: string;
  environmentText?: string;
  lightingText?: string;
  expectedActorCount?: number;
  actorIdentitySets?: ActorIdentityReferenceSet[];
  shotsActorOptions?: ShotsActorOption[];
  session?: ShotSession;
  onCreateOrReplaceSession: (sceneId: string, session: ShotSession) => void;
  onUpdateSession: (sceneId: string, updater: (prev?: ShotSession) => ShotSession | undefined) => void;
  onToggleVariantSelected: (sceneId: string, variantId: string, selected: boolean) => void;
  onSaveVariant?: (url: string, prefix: string) => void;
};

export const ShotsPanel: React.FC<ShotsPanelProps> = ({
  sceneId,
  apiKey,
  model,
  effectiveResultImageUrl,
  subjectActionText,
  environmentText,
  lightingText,
  expectedActorCount,
  actorIdentitySets = [],
  shotsActorOptions = [],
  session,
  onCreateOrReplaceSession,
  onUpdateSession,
  onToggleVariantSelected,
  onSaveVariant,
}) => {
  const { state, dispatch } = useAppContext();
  
  const [packId, setPackId] = useState<ShotPackId>('cinematic');
  const [count, setCount] = useState<4 | 6 | 9>(9);
  const [locks, setLocks] = useState<ShotLocks>({
    identity: true,
    wardrobe: true,
    background: true,
    lighting: true,
  });
  
  const [isConfiguring, setIsConfiguring] = useState(!session || session.variants.length === 0);
  const [slots, setSlots] = useState<DirectedShotSlot[]>([]);

  const isGeneratingRef = useRef(false);

  const panelRef = useRef<HTMLDivElement>(null);


  // Sync state with existing session if any
  useEffect(() => {
    if (session) {
      setPackId(session.packId);
      setCount(session.count);
      setLocks(session.locks);
      if (session.directedShots && session.directedShots.length > 0) {
        setSlots(session.directedShots);
      }
      setIsConfiguring(session.variants.length === 0);
    }
  }, [session]);

  // Auto-build slots when configuration changes
  useEffect(() => {
    if (!isConfiguring) return;

    const newSlots: DirectedShotSlot[] = [];
    if (packId === 'auto') {
      const sceneType = inferCoverageSceneType({ subjectActionText, environmentText });
      const roles = extractRoleHints(subjectActionText);
      const template = COVERAGE_TEMPLATES[sceneType];
      const templateShots = count === 4 ? template.shots4 : count === 6 ? template.shots6 : template.shots9;
      
      templateShots.forEach((item, idx) => {
        let finalPurpose = item.purpose;
        if (item.targetRole && !roles[item.targetRole]) {
           finalPurpose = finalPurpose.replace(/judge|defendant|attorney|hero|product|speaker/gi, 'subject');
        }
        const finalRole = item.targetRole && roles[item.targetRole] ? item.targetRole : undefined;
        
        newSlots.push({
           id: `slot-${Date.now()}-${idx}`,
           index: idx,
           targetType: finalRole ? 'actor' : 'scene',
           shotType: item.presetId,
           cameraFlavor: 'neutral',
           coveragePurpose: finalPurpose,
           targetLabel: finalRole
        });
      });
    } else {
      const presets = buildShotPresetIdsForPack(packId, count);
      presets.forEach((pid, idx) => {
        newSlots.push({
           id: `slot-${Date.now()}-${idx}`,
           index: idx,
           targetType: 'scene',
           shotType: pid as ShotPresetId,
           cameraFlavor: 'neutral'
        });
      });
    }
    setSlots(newSlots);
  }, [packId, count, isConfiguring, subjectActionText, environmentText]);

  const handleGenerateShots = async () => {
    if (!effectiveResultImageUrl) return;
    
    // Identity Precedence: Scrub analysis if we have strict face anchors
    const hasStrictIdentityRefs = actorIdentitySets.some(s => s.identityPriority === 'strict' && hasStrongFaceAnchor(s));
    let safeSubjectActionText = subjectActionText;
    if (hasStrictIdentityRefs && subjectActionText) {
        safeSubjectActionText = stripIdentityOverridingAnalysis(subjectActionText);
        if (safeSubjectActionText !== subjectActionText) {
            console.warn(`[IdentityPrecedence] Subject/style analysis demoted in SHOTS preview generation because strict actor refs are present`);
        }
    }

    const invalidPair = slots.find(s => s.targetType === 'pair' && !s.secondaryActorId);
    if (invalidPair) {
       alert(`Shot ${invalidPair.index + 1} is a Pair shot but is missing a Secondary Actor selection.`);
       return;
    }

    setIsConfiguring(false);

    let variants: ShotVariant[] = [];
    let sceneTruth: import('../../types/shots').SceneTruthSnapshot;

    try {
      sceneTruth = buildSceneTruthSnapshot({
        sourceResultUrl: effectiveResultImageUrl,
        actorIdentitySets,
        shotsActorOptions,
        tokens: state.tokens,
        environmentText
      });

      variants = slots.map((slot, idx) => {
        const preset = SHOT_PRESETS[slot.shotType];
        const prompt = buildShotVariantPrompt({
          sourceResultUrl: effectiveResultImageUrl,
          sceneTruth,
          actorIdentitySets,
          shotsActorOptions,
          packId,
          presetId: slot.shotType,
          directedSlot: slot,
          locks: { ...locks, identity: true },
          environmentText,
          subjectActionText: safeSubjectActionText,
          lightingText,
          expectedActorCount
        });

        return {
          id: `shot-variant-${Date.now()}-${idx}`,
          presetId: slot.shotType,
          label: preset.label,
          description: preset.description,
          prompt,
          targetType: slot.targetType,
          actionText: slot.actionText,
          cameraFlavor: slot.cameraFlavor,
          shotNotes: slot.shotNotes,
          coveragePurpose: slot.coveragePurpose,
          selected: false,
          status: 'queued'
        };
      });
    } catch (compilationError: any) {
      console.error("[ShotsPanel] Failed to compile shot variants:", compilationError);
      dispatch({ 
        type: 'ADD_LOG', 
        payload: { message: `Failed to compile scene snapshot: ${compilationError.message}`, type: 'error' } 
      } as any);
      setIsConfiguring(true);
      return;
    }

    const newSession: ShotSession = {
      id: `session-${Date.now()}`,
      sceneId,
      sourceResultUrl: effectiveResultImageUrl,
      actorIdentitySets,
      packId,
      count,
      directedShots: slots,
      locks,
      sceneTruth,
      variants,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isGenerating: true,
      isRerenderingSelected: false
    };

    onCreateOrReplaceSession(sceneId, newSession);

    // Start Async Loop
    isGeneratingRef.current = true;

    for (const variant of variants) {
      if (!isGeneratingRef.current) break; // User cancelled or component unmounted

      onUpdateSession(sceneId, prev => {
        if (!prev) return prev;
        return {
          ...prev,
          variants: prev.variants.map(v => v.id === variant.id ? { ...v, status: 'generating' } : v)
        };
      });

      try {
        const previewUrl = await GeminiService.generateShotPreview({
          anchorImageUrl: effectiveResultImageUrl,
          actorIdentitySets,
          prompt: variant.prompt,
          apiKey,
          model,
          sceneTruth,
          presetId: variant.presetId,
          hasSubjectStyleAnalysis: !!safeSubjectActionText 
        });

        const materialized = await LocalAssetService.materializeImageAsset({
          sourceUrl: previewUrl,
          sceneId: sceneId,
          variantId: variant.id,
          kind: 'preview',
          saveDirectoryPath: state.saveDirectoryPath
        });

        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { 
              ...v, 
              status: 'done', 
              previewUrl: materialized.displayUrl,
              localPreviewPath: materialized.localPath || undefined,
              sourcePreviewUrl: previewUrl
            } : v)
          };
        });
      } catch (err: any) {
        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { ...v, status: 'error', error: err.message } : v)
          };
        });
      }
    }

    isGeneratingRef.current = false;
    onUpdateSession(sceneId, prev => {
      if (!prev) return prev;
      return { ...prev, isGenerating: false };
    });
  };

  const handleRender4K = async () => {
    if (!session || !effectiveResultImageUrl) return;

    const selectedVariants = session.variants.filter(v => v.selected && (v.status === 'done' || v.status === 'error'));
    if (selectedVariants.length === 0) return;

    onUpdateSession(sceneId, prev => {
      if (!prev) return prev;
      return {
        ...prev,
        isRerenderingSelected: true,
        variants: prev.variants.map(v => selectedVariants.some(sel => sel.id === v.id) ? { ...v, status: 'rerendering' } : v),
      };
    });

    let safeSubjectActionText = subjectActionText;
    const hasStrictIdentityRefs = (session.actorIdentitySets || []).some(s => s.identityPriority === 'strict' && hasStrongFaceAnchor(s));
    if (hasStrictIdentityRefs && subjectActionText) {
        safeSubjectActionText = stripIdentityOverridingAnalysis(subjectActionText);
        if (safeSubjectActionText !== subjectActionText) {
            console.warn(`[IdentityPrecedence] Subject/style analysis demoted in SHOTS final rerender because strict actor refs are present`);
        }
    }

    for (const variant of selectedVariants) {
      if (!variant.previewUrl) continue;
      try {
        const finalPrompt = buildShotFinalRerenderPrompt({
          sourceResultUrl: effectiveResultImageUrl,
          sceneTruth: session.sceneTruth!,
          selectedShotPreviewUrl: variant.previewUrl,
          actorIdentitySets: session.actorIdentitySets,
          shotsActorOptions,
          presetId: variant.presetId,
          directedSlot: session.directedShots?.find(s => s.shotType === variant.presetId && s.cameraFlavor === variant.cameraFlavor),
          locks: { ...session.locks, identity: true },
          environmentText,
          subjectActionText: safeSubjectActionText,
          lightingText,
          expectedActorCount
        });

        const finalUrl = await GeminiService.rerenderShotFinal({
          sourceResultUrl: effectiveResultImageUrl,
          selectedShotPreviewUrl: variant.previewUrl,
          actorIdentitySets: session.actorIdentitySets,
          prompt: finalPrompt,
          apiKey,
          model,
          sceneTruth: session.sceneTruth,
          presetId: variant.presetId
        });

        const materialized = await LocalAssetService.materializeImageAsset({
          sourceUrl: finalUrl,
          sceneId: sceneId,
          variantId: variant.id,
          kind: 'final',
          saveDirectoryPath: state.saveDirectoryPath
        });

        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { 
              ...v, 
              status: 'done', 
              finalUrl: materialized.displayUrl,
              localFinalPath: materialized.localPath || undefined,
              sourceFinalUrl: finalUrl
            } : v)
          };
        });
      } catch (err: any) {
        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { ...v, status: 'error', error: err.message } : v)
          };
        });
      }
    }

    onUpdateSession(sceneId, prev => {
      if (!prev) return prev;
      return { ...prev, isRerenderingSelected: false };
    });
  };

  const handleSaveVariant = (variantId: string) => {
    if (!session || !onSaveVariant) return;
    const variant = session.variants.find(v => v.id === variantId);
    if (!variant) return;
    
    const url = variant.finalUrl || variant.previewUrl;
    if (!url) return;

    const prefix = `shot_${variant.presetId}`;
    onSaveVariant(url, prefix);
  };

  const handleRegenerateOne = async (variantId: string) => {
    // Basic implementation for single tile retry
    if (!session || !effectiveResultImageUrl) return;
    const variant = session.variants.find(v => v.id === variantId);
    if (!variant) return;

    onUpdateSession(sceneId, prev => {
      if (!prev) return prev;
      return {
        ...prev,
        variants: prev.variants.map(v => v.id === variantId ? { ...v, status: 'generating', error: undefined } : v)
      };
    });

    try {
      const previewUrl = await GeminiService.generateShotPreview({
        anchorImageUrl: effectiveResultImageUrl,
        actorIdentitySets: session.actorIdentitySets,
        prompt: variant.prompt,
        apiKey,
        model
      });

      const materialized = await LocalAssetService.materializeImageAsset({
        sourceUrl: previewUrl,
        sceneId: sceneId,
        variantId: variant.id,
        kind: 'preview',
        saveDirectoryPath: state.saveDirectoryPath
      });

      onUpdateSession(sceneId, prev => {
        if (!prev) return prev;
        return {
          ...prev,
          variants: prev.variants.map(v => v.id === variantId ? { 
            ...v, 
            status: 'done', 
            previewUrl: materialized.displayUrl,
            localPreviewPath: materialized.localPath || undefined,
            sourcePreviewUrl: previewUrl
          } : v)
        };
      });
    } catch (err: any) {
      onUpdateSession(sceneId, prev => {
        if (!prev) return prev;
        return {
          ...prev,
          variants: prev.variants.map(v => v.id === variantId ? { ...v, status: 'error', error: err.message } : v)
        };
      });
    }
  };

  const isGeneratingFull = session?.isGenerating || false;
  const isRerenderingFull = session?.isRerenderingSelected || false;
  const hasResult = !!effectiveResultImageUrl;
  const hasSelectedVariants = session?.variants.some(v => v.selected) || false;

  return (
    <div ref={panelRef} className="flex flex-col w-full h-full bg-[#09090b] overflow-hidden text-gray-200">
      
      {/* Top Controls Bar */}
      <div className="flex flex-col w-full bg-[#18181b] border-b border-[#27272a] shrink-0">

             <div className="flex flex-col p-2 gap-2">
                 {/* Row 1: Left Dropdowns, Right Config Actions */}
                 <div className="flex justify-between items-center w-full gap-2">
                     <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide shrink-0">
                         {/* Pack */}
                         <div className="flex items-center bg-black border border-gray-800 rounded pl-2 overflow-hidden shrink-0">
                             <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mr-1.5 whitespace-nowrap">Pack</span>
                             <select 
                               value={packId} onChange={(e) => setPackId(e.target.value as ShotPackId)} disabled={isGeneratingFull || isRerenderingFull}
                               className="bg-transparent text-[10px] text-gray-200 outline-none border-l border-gray-800 py-1 px-1.5 hover:bg-gray-900 cursor-pointer w-[140px]"
                             >
                               <option value="auto" className="bg-[#18181b] text-gray-200">Auto (Scene-Aware)</option>
                               <option value="cinematic" className="bg-[#18181b] text-gray-200">Cinematic</option>
                               <option value="portrait" className="bg-[#18181b] text-gray-200">Portrait</option>
                               <option value="coverage" className="bg-[#18181b] text-gray-200">Coverage</option>
                             </select>
                         </div>
                         {/* Count */}
                         <div className="flex items-center bg-black border border-gray-800 rounded pl-2 overflow-hidden shrink-0">
                             <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mr-1.5 whitespace-nowrap">Count</span>
                             <select 
                               value={count} onChange={(e) => setCount(Number(e.target.value) as 4|6|9)} disabled={isGeneratingFull || isRerenderingFull}
                               className="bg-transparent text-[10px] text-gray-200 outline-none border-l border-gray-800 py-1 px-1.5 hover:bg-gray-900 cursor-pointer w-[110px]"
                             >
                               <option value={4} className="bg-[#18181b] text-gray-200">4 Variants</option>
                               <option value={6} className="bg-[#18181b] text-gray-200">6 Variants</option>
                               <option value={9} className="bg-[#18181b] text-gray-200">9 Variants</option>
                             </select>
                         </div>
                     </div>
                     
                     <div className="flex items-center gap-2 shrink-0">
                         <button 
                             onClick={() => {
                               isGeneratingRef.current = false;
                               onUpdateSession(sceneId, prev => {
                                 if (!prev) return prev;
                                 return { ...prev, isGenerating: false, isRerenderingSelected: false, variants: [] };
                               });
                             }} 
                             className="text-[12px] text-gray-500 hover:text-red-400 font-bold uppercase tracking-widest transition-colors"
                         >Reset Session</button>
                     </div>
                 </div>

                 {/* Row 2: Locks and Generate */}
                 <div className="flex justify-between items-center w-full gap-2 border-t border-[#27272a] pt-2">
                     <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto scrollbar-hide pr-2">
                         <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mr-1 whitespace-nowrap hidden sm:block">Semantic Locks</span>
                         <div className="flex bg-black border border-gray-800 rounded p-0.5 gap-0.5 shadow-inner">
                             {(['identity', 'wardrobe', 'background', 'lighting'] as Array<keyof ShotLocks>).map(lockKey => (
                                 <button
                                     key={lockKey} disabled={isGeneratingFull || isRerenderingFull} onClick={() => setLocks(p => ({ ...p, [lockKey]: !p[lockKey] }))}
                                     className={`uppercase font-bold px-3 py-1.5 rounded transition-colors ${locks[lockKey] ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-transparent text-gray-500 hover:text-gray-300 border border-transparent'}`}
                                     style={{ fontSize: '14px', letterSpacing: '0.05em' }}
                                 >{lockKey}</button>
                             ))}
                         </div>
                     </div>
                     <div className="flex items-center gap-1.5 shrink-0">
                          {hasResult && !isConfiguring && (
                              <button onClick={() => setIsConfiguring(true)} className="font-bold uppercase tracking-widest text-gray-400 hover:text-white bg-black border border-gray-800 hover:border-gray-600 rounded px-4 py-2 transition-colors" style={{ fontSize: '14.5px' }}>Config</button>
                          )}
                          <button onClick={handleGenerateShots} disabled={!hasResult || isGeneratingFull || isRerenderingFull || (isConfiguring && slots.length === 0)} className={`font-bold uppercase tracking-widest rounded transition-all border px-4 py-2 ${!hasResult || isGeneratingFull || isRerenderingFull ? 'bg-black border-gray-800 text-gray-600 cursor-not-allowed' : 'bg-green-600/10 border-green-500/30 text-green-500 hover:bg-green-600/20 hover:border-green-400/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]'}`} style={{ fontSize: '14.5px' }}>
                              {isGeneratingFull ? 'Generating...' : 'Generate'}
                          </button>
                          <button onClick={handleRender4K} disabled={!hasSelectedVariants || isGeneratingFull || isRerenderingFull} className={`font-bold uppercase tracking-widest rounded transition-all border px-4 py-2 ${!hasSelectedVariants || isGeneratingFull || isRerenderingFull ? 'bg-black border-gray-800 text-gray-600 cursor-not-allowed' : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400 hover:bg-indigo-900/60 shadow-[0_0_15px_rgba(99,102,241,0.1)]'}`} style={{ fontSize: '14.5px' }}>
                              {isRerenderingFull ? 'Rendering...' : 'Render 4K'}
                          </button>
                     </div>
                 </div>
             </div>

      </div>

      <div className="px-4 py-1.5 bg-black/40 border-b border-[#27272a] text-[9px] text-gray-500 font-mono tracking-wider truncate shrink-0">
        Generate cinematic angle variations from the current staged result.
      </div>

      {/* Main Content Area */}
      {!hasResult ? (
        <div className="flex-grow flex flex-col items-center justify-center text-center p-8">
          <div className="text-4xl mb-4 opacity-50">🎬</div>
          <h3 className="text-xl font-medium text-gray-300 mb-2">Create or choose a result first</h3>
          <p className="text-gray-500 max-w-md">Generate a composite, or select an uploaded image to use as the result source for SHOTS.</p>
        </div>
      ) : isConfiguring ? (
        <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-3 bg-gray-950">
          <div className="text-sm font-medium text-gray-400 mb-2">Directed Shot Plan ({count} shots)</div>
          {slots.map((slot, idx) => (
            <DirectedShotCard
              key={slot.id}
              slot={slot}
              actors={shotsActorOptions}
              onChange={(updatedSlot) => {
                const newSlots = [...slots];
                newSlots[idx] = updatedSlot;
                setSlots(newSlots);
              }}
              disabled={isGeneratingFull}
            />
          ))}
        </div>
      ) : (
        <ShotGrid 
          variants={session?.variants || []} 
          onToggleSelected={(id, val) => onToggleVariantSelected(sceneId, id, val)}
          onSave={handleSaveVariant}
          onRegenerateOne={handleRegenerateOne}
        />
      )}

    </div>
  );
};
