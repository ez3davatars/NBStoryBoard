import React, { useState, useRef, useEffect } from 'react';
import type { ShotSession, ShotPackId, ShotLocks, ShotVariant, ShotPresetId, DirectedShotSlot } from '../../types/shots';
import type { ActorIdentityReferenceSet, ShotsActorOption } from '../../context/AppContext';
import { SHOT_PRESETS, buildShotPresetIdsForPack } from '../../utils/shotsPresets';
import { buildShotVariantPrompt, buildShotFinalRerenderPrompt } from '../../utils/promptHelpers';
import { GeminiService } from '../../services/GeminiService';
import { stripIdentityOverridingAnalysis, stripShotDirectiveContamination } from '../../utils/analysisSanitizers';
import { LocalAssetService } from '../../services/LocalAssetService';
import { hasStrongFaceAnchor } from '../../utils/identityReferenceHelpers';
import { inferCoverageSceneType, extractRoleHints } from '../../utils/sceneTypeInference';
import { COVERAGE_TEMPLATES } from '../../utils/coverageTemplates';
import { ShotGrid } from './ShotGrid';
import { DirectedShotCard } from './DirectedShotCard';
import { useAppContext } from '../../context/AppContext';
import { buildSceneTruthSnapshot } from '../../utils/sceneTruthHelpers';
import { buildShotBlueprintImage } from '../../utils/shotBlueprintHelpers';
import { computeImageSimilarity } from '../../utils/similarityHelpers';

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

const deriveShotsStyleLock = (qualityMode?: string): string => {
  switch (qualityMode) {
    case '3D Render':
      return [
        'Preserve the exact source render medium as stylized 3D CGI.',
        'Keep the result in the same animated / digital 3D world.',
        'Do not convert to live-action photography.',
        'Do not generate realistic human skin, photographic pores, or real-camera film still aesthetics.',
        'Do not reinterpret the source as photoreal cinema.'
      ].join(' ');
    case 'Stylized':
      return [
        'Preserve the exact stylized non-photographic render treatment of the source.',
        'Do not convert to photorealism or live-action.'
      ].join(' ');
    case 'Raw Uncompressed':
      return [
        'Preserve the exact raw visual treatment of the source.',
        'Do not change the source medium.'
      ].join(' ');
    default:
      return 'Preserve the exact render medium and visual treatment of the source image. Do not change the source medium.';
  }
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
  
  const [autoReroll, setAutoReroll] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
       return localStorage.getItem('nano_shots_auto_reroll') !== 'false';
    }
    return true;
  });

  const toggleAutoReroll = () => {
    setAutoReroll(prev => {
        const next = !prev;
        if (typeof localStorage !== 'undefined') localStorage.setItem('nano_shots_auto_reroll', String(next));
        return next;
    });
  };

  const [isConfiguring, setIsConfiguring] = useState(!session || session.variants.length === 0);
  const [slots, setSlots] = useState<DirectedShotSlot[]>([]);
  const sourceStyleLock = deriveShotsStyleLock(state.director?.qualityMode);
  const [inspectVariantId, setInspectVariantId] = useState<string | null>(null);

  // Responsive UI: Collapse config on smaller vertical screens (like 1080p laptops)
  const [isConfigExpanded, setIsConfigExpanded] = useState(typeof window !== 'undefined' ? window.innerHeight > 1050 : true);

  const isGeneratingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    const shotSanitizedActionText = stripShotDirectiveContamination(subjectActionText);
    if (subjectActionText && shotSanitizedActionText !== subjectActionText) {
        console.warn(`[ShotsPanel] Shot directive text removed from Scene Action context before SHOTS preview prompt assembly.`);
    }

    let safeSubjectActionText = shotSanitizedActionText;
    if (hasStrictIdentityRefs && safeSubjectActionText) {
        const identitySanitizedActionText = stripIdentityOverridingAnalysis(safeSubjectActionText);
        if (identitySanitizedActionText !== safeSubjectActionText) {
            console.warn(`[IdentityPrecedence] Subject/style analysis demoted in SHOTS preview generation because strict actor refs are present`);
        }
        safeSubjectActionText = identitySanitizedActionText;
    }

    // Phase 1: Preflight Actor Binding
    const preparedSlots = slots.map((slot) => {
      if (slot.targetActorId || !slot.targetLabel) return slot;

      const wanted = slot.targetLabel.trim().toLowerCase();
      const match = shotsActorOptions.find((a) => {
        const label = a.actorLabel?.trim().toLowerCase();
        const role = a.targetInAnchorScene?.trim().toLowerCase();
        return label === wanted || role === wanted;
      });

      return match ? { ...slot, targetActorId: match.actorId } : slot;
    });

    const invalidActor = preparedSlots.find(
      s => s.targetType === 'actor' && !s.targetActorId
    );
    if (invalidActor) {
       alert(`Shot ${invalidActor.index + 1} requires a primary actor but none was matched/selected.`);
       return;
    }

    const invalidPair = preparedSlots.find(
      s => s.targetType === 'pair' && (!s.targetActorId || !s.secondaryActorId)
    );
    if (invalidPair) {
       alert(`Shot ${invalidPair.index + 1} is a Pair shot but is missing one or both actors.`);
       return;
    }

    setIsConfiguring(false);

    let variants: ShotVariant[] = [];
    let sceneTruth: import('../../types/shots').SceneTruthSnapshot;

    try {
      sceneTruth = buildSceneTruthSnapshot({
        sourceResultUrl: effectiveResultImageUrl,
        expectedActorCount,
        actorIdentitySets,
        shotsActorOptions,
        tokens: state.tokens,
        environmentText
      });

      variants = preparedSlots.map((slot, idx) => {
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
          expectedActorCount,
          sourceStyleLock
        });

        return {
          id: `shot-variant-${Date.now()}-${idx}`,
          slotId: slot.id,
          slotIndex: slot.index,
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
        } as unknown as ShotVariant;
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
    abortControllerRef.current = new AbortController();

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
        const preset = SHOT_PRESETS[variant.presetId];
        const directedSlot = preparedSlots.find(s => s.id === (variant as any).slotId);
        
        const rawBlueprintUrl = await buildShotBlueprintImage({
            anchorImageUrl: effectiveResultImageUrl,
            preset,
            directedSlot
        });

        // Materialize the blueprint so we can inspect it without dealing with 2MB base64 strings in redux
        let materializedBlueprintUrl = rawBlueprintUrl;
        try {
            const matBp = await LocalAssetService.materializeImageAsset({
                sourceUrl: rawBlueprintUrl,
                sceneId: sceneId,
                variantId: variant.id,
                kind: 'blueprint' as any,
                saveDirectoryPath: state.saveDirectoryPath
            });
            materializedBlueprintUrl = matBp.displayUrl;
        } catch (bpErr) {
            console.warn("Could not materialize blueprint for variant", variant.id, bpErr);
        }

        const previewBaseArgs = {
          anchorImageUrl: effectiveResultImageUrl,
          actorIdentitySets,
          prompt: variant.prompt,
          apiKey,
          model,
          options: { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, signal: abortControllerRef.current?.signal }
        };

        const isHostedShots = state.billingEntitlements.effectiveBillingMode === 'hosted';
        let previewUrl: string;

        if (isHostedShots) {
          // Thin payload only for hosted mode to avoid oversized Edge Function requests
          previewUrl = await GeminiService.generateShotPreview(previewBaseArgs);
        } else {
          try {
            previewUrl = await GeminiService.generateShotPreview({
              ...previewBaseArgs,
              shotBlueprintUrl: rawBlueprintUrl,
              sceneTruth,
              presetId: variant.presetId,
              hasSubjectStyleAnalysis: !!safeSubjectActionText,
            });
          } catch (err: any) {
            const msg = String(err?.message || err || '');
            if (/400|Bad Request|413|Payload/i.test(msg)) {
              console.warn('[ShotsPanel] Preview payload rejected. Original Error:', msg, 'Retrying thin payload for:', {
                variantId: variant.id,
                presetId: variant.presetId,
              });
              previewUrl = await GeminiService.generateShotPreview(previewBaseArgs);
            } else {
              throw err;
            }
          }
        }

        // Phase 7: Similarity Rejection
        let attempts = 1;
        let isDuplicate = false;
        const SIMILARITY_THRESHOLD = 0.94; // If similarity >= 94%, it basically returned the anchor image or a trivial crop.
        try {
           let similarity = await computeImageSimilarity(effectiveResultImageUrl, previewUrl);
           console.log(`[ShotsPanel] Shot ${variant.presetId} similarity check: ${(similarity*100).toFixed(1)}%`);
           while (autoReroll && similarity >= SIMILARITY_THRESHOLD && attempts < 3) {
              console.warn(`[ShotsPanel] Shot ${variant.presetId} rejected for duplicate framing (${(similarity*100).toFixed(1)}%). Auto-retrying...`);
              
              onUpdateSession(sceneId, prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  variants: prev.variants.map(v => v.id === variant.id ? { 
                    ...v, 
                    status: 'generating', 
                    error: `Similar composition detected (${(similarity*100).toFixed(0)}%). Rerolling alternative angle (Try ${attempts+1}/3)...` 
                  } : v)
                };
              });

              attempts++;
              const appendedPrompt = `${variant.prompt}\nCRITICAL: PREVIOUS ATTEMPT FAILED. YOU MUST MATERIALLY CHANGE THE CAMERA ANGLE AND CROP. DO NOT REPRODUCE THE SOURCE COMPOSITION.`;
              
              if (isHostedShots) {
                  previewUrl = await GeminiService.generateShotPreview({
                     anchorImageUrl: effectiveResultImageUrl,
                     actorIdentitySets,
                     prompt: appendedPrompt,
                     apiKey,
                     model,
                     options: { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, signal: abortControllerRef.current?.signal }
                  });
              } else {
                  previewUrl = await GeminiService.generateShotPreview({
                     anchorImageUrl: effectiveResultImageUrl,
                     shotBlueprintUrl: rawBlueprintUrl,
                     actorIdentitySets,
                     prompt: appendedPrompt,
                     apiKey,
                     model,
                     sceneTruth,
                     presetId: variant.presetId,
                     hasSubjectStyleAnalysis: !!safeSubjectActionText,
                     options: { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, signal: abortControllerRef.current?.signal }
                  });
              }
              similarity = await computeImageSimilarity(effectiveResultImageUrl, previewUrl);
              console.log(`[ShotsPanel] Shot ${variant.presetId} retry ${attempts} similarity check: ${(similarity*100).toFixed(1)}%`);
           }
           if (autoReroll && similarity >= SIMILARITY_THRESHOLD) {
              isDuplicate = true; // Still a duplicate after max retries
           }
        } catch (simErr) {
           console.error("[ShotsPanel] Failed to compute image similarity:", simErr);
        }

        const materialized = await LocalAssetService.materializeImageAsset({
          sourceUrl: previewUrl,
          sceneId: sceneId,
          variantId: variant.id,
          kind: 'preview',
          saveDirectoryPath: state.saveDirectoryPath
        });

        console.log("[ShotsPanel] Materialized preview asset:", {
          variantId: variant.id,
          displayUrl: materialized.displayUrl,
          localPath: materialized.localPath,
          sourcePreviewUrl: previewUrl
        });

        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { 
              ...v, 
              status: 'done', 
              previewUrl: materialized.displayUrl,
              blueprintUrl: materializedBlueprintUrl,
              localPreviewPath: materialized.localPath || undefined,
              sourcePreviewUrl: previewUrl,
              error: isDuplicate ? 'CRITICAL: Failed to materially change framing.' : undefined
            } : v)
          };
        });
      } catch (err: any) {
        console.error("SHOTS PANEL FATAL:", err);
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

    abortControllerRef.current = new AbortController();

    onUpdateSession(sceneId, prev => {
      if (!prev) return prev;
      return {
        ...prev,
        isRerenderingSelected: true,
        variants: prev.variants.map(v => selectedVariants.some(sel => sel.id === v.id) ? { ...v, status: 'rerendering' } : v),
      };
    });

    const shotSanitizedActionText = stripShotDirectiveContamination(subjectActionText);
    if (subjectActionText && shotSanitizedActionText !== subjectActionText) {
      console.warn(`[ShotsPanel] Shot directive text removed from Scene Action context before SHOTS final rerender prompt assembly.`);
    }

    let safeSubjectActionText = shotSanitizedActionText;
    const hasStrictIdentityRefs = (session.actorIdentitySets || []).some(s => s.identityPriority === 'strict' && hasStrongFaceAnchor(s));
    if (hasStrictIdentityRefs && safeSubjectActionText) {
        const identitySanitizedActionText = stripIdentityOverridingAnalysis(safeSubjectActionText);
        if (identitySanitizedActionText !== safeSubjectActionText) {
            console.warn(`[IdentityPrecedence] Subject/style analysis demoted in SHOTS final rerender because strict actor refs are present`);
        }
        safeSubjectActionText = identitySanitizedActionText;
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
          directedSlot: session.directedShots?.find(s => s.id === (variant as any).slotId),
          locks: { ...session.locks, identity: true },
          environmentText,
          subjectActionText: safeSubjectActionText,
          lightingText,
          expectedActorCount,
          sourceStyleLock
        });

        let finalUrl: string | undefined;
        let attempts = 0;
        let lastErr: any;
        
        while (attempts < 3) {
          try {
            finalUrl = await GeminiService.rerenderShotFinal({
              sourceResultUrl: effectiveResultImageUrl,
              selectedShotPreviewUrl: variant.previewUrl!,
              actorIdentitySets: session.actorIdentitySets,
              prompt: finalPrompt,
              apiKey,
              model,
              sceneTruth: session.sceneTruth,
              presetId: variant.presetId,
              options: { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, signal: abortControllerRef.current?.signal }
            });
            break; 
          } catch (e: any) {
            lastErr = e;
            const msg = e.message.toLowerCase();
            if (msg.includes('failed to fetch') || msg.includes('429') || msg.includes('timeout')) {
              attempts++;
              console.warn(`[ShotsPanel] 4K Render failed (network/rate limit). Retrying ${attempts}/3 in 6 seconds...`);
              await new Promise(r => setTimeout(r, 6000));
            } else {
              throw e;
            }
          }
        }
        
        if (!finalUrl) throw lastErr || new Error("Failed to render 4K after multiple attempts");

        const materialized = await LocalAssetService.materializeImageAsset({
          sourceUrl: finalUrl,
          sceneId: sceneId,
          variantId: variant.id,
          kind: 'final',
          saveDirectoryPath: state.saveDirectoryPath
        });

        console.log("[ShotsPanel] Materialized final asset:", {
          variantId: variant.id,
          displayUrl: materialized.displayUrl,
          localPath: materialized.localPath,
          sourceFinalUrl: finalUrl
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

  const handleRegenerateOne = async (variantId: string, instruction?: string) => {
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

    abortControllerRef.current = new AbortController();

    try {
      const directedSlot = session.directedShots?.find(s => s.id === (variant as any).slotId);
      const preset = SHOT_PRESETS[variant.presetId];
      
      let rawBlueprintUrl = variant.sourcePreviewUrl; // Fallback, will regenerate below if we can
      if (directedSlot && preset) {
         rawBlueprintUrl = await buildShotBlueprintImage({
            anchorImageUrl: effectiveResultImageUrl,
            preset,
            directedSlot
         });
      }

      const extraInstruction = instruction?.trim();
      const basePrompt = extraInstruction
        ? `${variant.prompt}\n### SHOT-SPECIFIC REGENERATE ADJUSTMENT\n${extraInstruction}\nRespect all core scene, identity, and continuity locks while applying this adjustment.`
        : variant.prompt;

      const previewBaseArgs = {
        anchorImageUrl: effectiveResultImageUrl,
        actorIdentitySets: session.actorIdentitySets,
        prompt: basePrompt,
        apiKey,
        model,
        options: { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, signal: abortControllerRef.current?.signal }
      };

      const isHostedShots = state.billingEntitlements.effectiveBillingMode === 'hosted';
      let previewUrl: string;

      if (isHostedShots) {
        previewUrl = await GeminiService.generateShotPreview(previewBaseArgs);
      } else {
        try {
          previewUrl = await GeminiService.generateShotPreview({
            ...previewBaseArgs,
            shotBlueprintUrl: rawBlueprintUrl,
            sceneTruth: session.sceneTruth,
            presetId: variant.presetId,
            hasSubjectStyleAnalysis: false,
          });
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          if (/400|Bad Request|413|Payload/i.test(msg)) {
            console.warn('[ShotsPanel] Rich preview payload rejected; retrying thin payload', {
              variantId: variant.id,
              presetId: variant.presetId,
            });
            previewUrl = await GeminiService.generateShotPreview(previewBaseArgs);
          } else {
            throw err;
          }
        }
      }

      // Phase 7: Similarity Rejection
      let attempts = 1;
      let isDuplicate = false;
      const SIMILARITY_THRESHOLD = 0.94;
      try {
         let similarity = await computeImageSimilarity(effectiveResultImageUrl, previewUrl);
         console.log(`[ShotsPanel] Shot ${variant.presetId} similarity check: ${(similarity*100).toFixed(1)}%`);
         while (autoReroll && similarity >= SIMILARITY_THRESHOLD && attempts < 3) {
            console.warn(`[ShotsPanel] Shot ${variant.presetId} rejected for duplicate framing (${(similarity*100).toFixed(1)}%). Auto-retrying...`);
            
            onUpdateSession(sceneId, prev => {
              if (!prev) return prev;
              return {
                ...prev,
                variants: prev.variants.map(v => v.id === variantId ? { 
                  ...v, 
                  status: 'generating', 
                  error: `Similar composition detected (${(similarity*100).toFixed(0)}%). Rerolling alternative angle (Try ${attempts+1}/3)...` 
                } : v)
              };
            });

            attempts++;
            const appendedPrompt = `${basePrompt}\nCRITICAL: PREVIOUS ATTEMPT FAILED. YOU MUST MATERIALLY CHANGE THE CAMERA ANGLE AND CROP. DO NOT REPRODUCE THE SOURCE COMPOSITION.`;
            
            if (isHostedShots) {
                previewUrl = await GeminiService.generateShotPreview({
                   anchorImageUrl: effectiveResultImageUrl,
                   actorIdentitySets: session.actorIdentitySets,
                   prompt: appendedPrompt,
                   apiKey,
                   model,
                   options: { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, signal: abortControllerRef.current?.signal }
                });
            } else {
                previewUrl = await GeminiService.generateShotPreview({
                   anchorImageUrl: effectiveResultImageUrl,
                   shotBlueprintUrl: rawBlueprintUrl,
                   actorIdentitySets: session.actorIdentitySets,
                   prompt: appendedPrompt,
                   apiKey,
                   model,
                   sceneTruth: session.sceneTruth,
                   presetId: variant.presetId,
                   hasSubjectStyleAnalysis: false,
                   options: { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, signal: abortControllerRef.current?.signal }
                });
            }
            similarity = await computeImageSimilarity(effectiveResultImageUrl, previewUrl);
         }
         if (autoReroll && similarity >= SIMILARITY_THRESHOLD) isDuplicate = true;
      } catch (simErr) {
         console.error("[ShotsPanel] Failed to compute image similarity:", simErr);
      }

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
            blueprintUrl: rawBlueprintUrl, // Fallback if no materialized one exists
            localPreviewPath: materialized.localPath || undefined,
            sourcePreviewUrl: previewUrl,
            error: isDuplicate ? 'CRITICAL: Failed to materially change framing.' : undefined
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
    <div ref={panelRef} className="flex flex-col w-full h-full min-w-0 bg-[#09090b] overflow-hidden text-gray-200">
      
      {/* Top Controls Bar */}
      <div className="flex flex-col w-full bg-[#18181b] border-b border-[#27272a] shrink-0">

          {/* Accordion Toggle Header */}
          <div 
             className="flex flex-wrap justify-between items-center px-4 py-2 hover:bg-white/5 cursor-pointer select-none transition-colors"
             onClick={() => setIsConfigExpanded(!isConfigExpanded)}
          >
               <div className="flex items-center gap-2 text-[11px] font-bold text-gray-300 uppercase tracking-widest shrink-0">
                   <svg className={`w-4 h-4 text-gray-500 transition-transform ${isConfigExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                   Shot Configuration
               </div>
               
               {/* Mini Action Buttons always visible when collapsed */}
               {!isConfigExpanded && (
                   <div className="flex items-center gap-2">
                        {hasResult && !isConfiguring && (
                            <button onClick={(e) => { e.stopPropagation(); setIsConfigExpanded(true); setIsConfiguring(true); }} className="font-bold uppercase tracking-wider text-gray-400 hover:text-white bg-black border border-gray-800 hover:border-gray-600 rounded px-3 py-1 transition-colors text-[10px]">Config</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleGenerateShots(); }} disabled={!hasResult || isGeneratingFull || isRerenderingFull || (isConfiguring && slots.length === 0)} className={`font-bold uppercase tracking-wider rounded transition-all border px-3 py-1 ${!hasResult || isGeneratingFull || isRerenderingFull ? 'bg-black border-gray-800 text-gray-600' : 'bg-green-600/10 border-green-500/30 text-green-500'} text-[10px]`}>
                            {isGeneratingFull ? 'Generating...' : 'Generate'}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleRender4K(); }} disabled={!hasSelectedVariants || isGeneratingFull || isRerenderingFull} className={`font-bold uppercase tracking-wider rounded transition-all border px-3 py-1 ${!hasSelectedVariants || isGeneratingFull || isRerenderingFull ? 'bg-black border-gray-800 text-gray-600' : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400'} text-[10px]`}>
                            {isRerenderingFull ? 'Rendering...' : 'Render 4K'}
                        </button>
                   </div>
               )}
          </div>

          <div className={`flex-col p-2 gap-2 border-t border-[#27272a] ${isConfigExpanded ? 'flex' : 'hidden'}`}>
                 {/* Row 1: Left Dropdowns, Right Config Actions */}
                 <div className="flex flex-wrap justify-between items-center w-full gap-2 min-w-0">
                     <div className="flex flex-wrap items-center gap-2 min-w-0">
                         {/* Pack */}
                         <div className="flex items-center bg-black border border-gray-800 rounded pl-2 overflow-hidden shrink-0">
                             <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mr-1.5 whitespace-nowrap">Pack</span>
                             <select 
                               value={packId} onChange={(e) => setPackId(e.target.value as ShotPackId)} disabled={isGeneratingFull || isRerenderingFull}
                               className="bg-transparent text-[10px] text-gray-200 outline-none border-l border-gray-800 py-1 px-1.5 hover:bg-gray-900 cursor-pointer min-w-[120px] sm:min-w-[140px]"
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
                               className="bg-transparent text-[10px] text-gray-200 outline-none border-l border-gray-800 py-1 px-1.5 hover:bg-gray-900 cursor-pointer min-w-[96px] sm:min-w-[110px]"
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
                               abortControllerRef.current?.abort();
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
                 <div className="flex flex-wrap justify-between items-center w-full gap-2 border-t border-[#27272a] pt-2 min-w-0">
                     <div className="flex flex-wrap items-center gap-1.5 min-w-0 pr-2">
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
                         <div className="ml-2 flex flex-col items-start justify-center">
                             <label className="flex items-center gap-1.5 cursor-pointer text-gray-400 hover:text-gray-200 transition-colors" title="Automatically reroll shots that look completely identical to the source anchor (e.g. if the AI ignores the camera instruction)">
                                 <input type="checkbox" className="form-checkbox w-3.5 h-3.5 bg-black border-gray-700 text-blue-500 rounded cursor-pointer" checked={autoReroll} onChange={toggleAutoReroll} disabled={isGeneratingFull || isRerenderingFull} />
                                 <span className="text-[10px] font-bold uppercase tracking-widest select-none">Auto-Reroll</span>
                             </label>
                         </div>
                     </div>
                     <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                          {hasResult && !isConfiguring && (
                              <button onClick={() => setIsConfiguring(true)} className="font-bold uppercase tracking-widest text-gray-400 hover:text-white bg-black border border-gray-800 hover:border-gray-600 rounded px-4 py-2 transition-colors" style={{ fontSize: '14.5px' }}>Config</button>
                          )}
                          <button onClick={handleGenerateShots} disabled={!hasResult || isGeneratingFull || isRerenderingFull || (isConfiguring && slots.length === 0)} className={`font-bold uppercase tracking-widest rounded transition-all border px-4 py-2 ${(!hasResult && !isGeneratingFull) ? 'bg-black border-gray-800 text-gray-600 cursor-not-allowed' : (isGeneratingFull ? 'bg-green-600/30 border-green-500/80 text-green-400 cursor-not-allowed shadow-[0_0_20px_rgba(34,197,94,0.2)] animate-pulse' : 'bg-green-600/10 border-green-500/30 text-green-500 hover:bg-green-600/20 hover:border-green-400/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]')}`} style={{ fontSize: '14.5px' }}>
                              {isGeneratingFull ? 'GENERATING...' : 'GENERATE'}
                          </button>
                          <button onClick={handleRender4K} disabled={!hasSelectedVariants || isGeneratingFull || isRerenderingFull} className={`font-bold uppercase tracking-widest rounded transition-all border px-4 py-2 ${(!hasSelectedVariants && !isRerenderingFull) ? 'bg-black border-gray-800 text-gray-600 cursor-not-allowed' : (isRerenderingFull ? 'bg-indigo-600/30 border-indigo-400/80 text-indigo-300 cursor-not-allowed shadow-[0_0_20px_rgba(99,102,241,0.2)] animate-pulse' : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400 hover:bg-indigo-900/60 shadow-[0_0_15px_rgba(99,102,241,0.1)]')}`} style={{ fontSize: '14.5px' }}>
                              {isRerenderingFull ? 'RENDERING 4K...' : 'RENDER 4K'}
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
        <div className="flex-grow overflow-y-auto p-3 sm:p-4 flex flex-col gap-3 bg-gray-950 min-w-0">
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
        <div className="flex-grow min-h-0 overflow-hidden relative">
          <ShotGrid 
            variants={session?.variants || []} 
            onToggleSelected={(id, val) => onToggleVariantSelected(sceneId, id, val)}
            onSave={handleSaveVariant}
            onRegenerateOne={handleRegenerateOne}
            onInspect={setInspectVariantId}
          />
        </div>
      )}

      {/* Inspect Modal Overlay */}
      {inspectVariantId && session?.variants && (
        <div 
          className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setInspectVariantId(null)}
        >
          {(() => {
            const v = session.variants.find(vx => vx.id === inspectVariantId);
            if (!v) return null;
            const targetUrl = v.finalUrl || v.previewUrl;
            return (
              <div className="relative w-full h-full p-8 flex flex-col items-center justify-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setInspectVariantId(null)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-white bg-black/50 hover:bg-black rounded-full p-2 transition-colors z-20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                {targetUrl ? (
                  <>
                    <img 
                      src={targetUrl} 
                      alt="Inspect" 
                      className="max-w-full max-h-[85%] object-contain rounded shadow-2xl border border-gray-800"
                    />
                    <div className="mt-4 text-center">
                      <h3 className="text-xl font-bold text-gray-100">{v.label}</h3>
                      <p className="text-gray-400 mt-1 max-w-2xl">{v.description}</p>
                    </div>
                    {/* Add quick download to inspect view too */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSaveVariant(v.id); }}
                      className="absolute bottom-6 right-6 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded shadow-lg border border-blue-400 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      {v.finalUrl ? 'Download 4K' : 'Download Preview'}
                    </button>
                  </>
                ) : (
                  <div className="text-gray-500">Image is currently generating...</div>
                )}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
};
