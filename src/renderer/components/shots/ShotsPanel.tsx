import React, { useState, useRef, useEffect } from 'react';
import type { ShotSession, ShotPackId, ShotLocks, ShotVariant, ShotPresetId, DirectedShotSlot } from '../../types/shots';
import type { ActorIdentityReferenceSet, ShotsActorOption } from '../../context/AppContext';
import { SHOT_PRESETS, buildShotPresetIdsForPack } from '../../utils/shotsPresets';
import { buildShotVariantPrompt, buildShotFinalRerenderPrompt } from '../../utils/promptHelpers';
import { GeminiService } from '../../services/GeminiService';
import { stripIdentityOverridingAnalysis } from '../../utils/analysisSanitizers';
import { hasStrongFaceAnchor } from '../../utils/identityReferenceHelpers';
import { inferCoverageSceneType, extractRoleHints } from '../../utils/sceneTypeInference';
import { COVERAGE_TEMPLATES } from '../../utils/coverageTemplates';
import { ShotGrid } from './ShotGrid';
import { DirectedShotCard } from './DirectedShotCard';

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

    const variants: ShotVariant[] = slots.map((slot, idx) => {
      const preset = SHOT_PRESETS[slot.shotType];
      const prompt = buildShotVariantPrompt({
        sourceResultUrl: effectiveResultImageUrl,
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

    const newSession: ShotSession = {
      id: `session-${Date.now()}`,
      sceneId,
      sourceResultUrl: effectiveResultImageUrl,
      actorIdentitySets,
      packId,
      count,
      directedShots: slots,
      locks,
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
          model
        });

        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { ...v, status: 'done', previewUrl } : v)
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
          model
        });

        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { ...v, status: 'done', finalUrl } : v)
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

      onUpdateSession(sceneId, prev => {
        if (!prev) return prev;
        return {
          ...prev,
          variants: prev.variants.map(v => v.id === variantId ? { ...v, status: 'done', previewUrl } : v)
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
    <div className="flex flex-col w-full h-full bg-gray-950 overflow-hidden text-gray-200">
      
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-gray-900 border-b border-gray-800 gap-4">
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Shot Pack</label>
            <select 
              value={packId} 
              onChange={(e) => setPackId(e.target.value as ShotPackId)}
              disabled={isGeneratingFull || isRerenderingFull}
              className="bg-gray-800 text-sm border-gray-700 rounded px-2 py-1 outline-none"
            >
              <option value="auto">Auto (Scene-Aware)</option>
              <option value="cinematic">Cinematic</option>
              <option value="portrait">Portrait</option>
              <option value="coverage">Coverage</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Count</label>
            <select 
              value={count} 
              onChange={(e) => setCount(Number(e.target.value) as 4 | 6 | 9)}
              disabled={isGeneratingFull || isRerenderingFull}
              className="bg-gray-800 text-sm border-gray-700 rounded px-2 py-1 outline-none"
            >
              <option value={4}>4 Variants</option>
              <option value={6}>6 Variants</option>
              <option value={9}>9 Variants</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Locks</label>
            <div className="flex bg-gray-800 rounded p-1 gap-1">
              {(['identity', 'wardrobe', 'background', 'lighting'] as Array<keyof ShotLocks>).map(lockKey => (
                <button
                  key={lockKey}
                  disabled={isGeneratingFull || isRerenderingFull}
                  onClick={() => setLocks(p => ({ ...p, [lockKey]: !p[lockKey] }))}
                  className={`text-xs px-2 py-1 rounded capitalize transition-colors ${locks[lockKey] ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'}`}
                >
                  {lockKey}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasResult && !isConfiguring && (
            <button
              disabled={isGeneratingFull || isRerenderingFull}
              onClick={() => setIsConfiguring(true)}
              className="px-4 py-2 font-medium text-sm rounded transition-all bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              CONFIGURE PLAN
            </button>
          )}

          <button
            disabled={!hasResult || isGeneratingFull || isRerenderingFull || (isConfiguring && slots.length === 0)}
            onClick={handleGenerateShots}
            className={`px-4 py-2 font-medium text-sm rounded transition-all ${!hasResult || isGeneratingFull || isRerenderingFull ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-500'}`}
          >
            {isGeneratingFull ? 'GENERATING...' : 'GENERATE SHOTS'}
          </button>
          
          <button
            disabled={!hasSelectedVariants || isGeneratingFull || isRerenderingFull}
            onClick={handleRender4K}
            className={`px-4 py-2 font-medium text-sm rounded transition-all ${!hasSelectedVariants || isGeneratingFull || isRerenderingFull ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
            {isRerenderingFull ? 'RENDERING...' : 'RENDER SELECTED IN 4K'}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 text-xs text-gray-400">
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
