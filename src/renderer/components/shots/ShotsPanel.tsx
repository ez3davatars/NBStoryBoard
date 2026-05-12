import React, { useState, useRef, useEffect } from 'react';
import type { ShotSession, ShotPackId, ShotLocks, ShotVariant, ShotPresetId, DirectedShotSlot, SceneTruthSnapshot } from '../../types/shots';
import type { ActorIdentityReferenceSet, ShotsActorOption } from '../../context/AppContext';
import { SHOT_PRESETS, buildShotPresetIdsForPack } from '../../utils/shotsPresets';
import { buildShotVariantPrompt, buildShotFinalRerenderPrompt } from '../../utils/promptHelpers';
import { GeminiService } from '../../services/GeminiService';
import { ensureAuthenticatedForGeneration } from '../../services/AuthGenerationGate';
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
import { renderContinuityShotImage } from '../../utils/continuityShotRenderer';

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
  onSetAsStage?: (url: string) => void;
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isNoImageShotResponse = (message: string): boolean =>
  /No image data in shot preview response|No image data|no image/i.test(message);

type ShotIntegrityReport = {
  passed?: boolean;
  score?: number;
  issues?: string[];
  correction?: string;
  actorCountPreserved?: boolean;
  actorRelationshipPreserved?: boolean;
  actorPosePreserved?: boolean;
  sceneContinuityPreserved?: boolean;
  shotDesignationSatisfied?: boolean;
  within180Rule?: boolean;
  environmentViewpointPlausible?: boolean;
  viewpointChangeSufficient?: boolean;
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
  onSetAsStage,
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

  const generateAiShotPreview = async (args: {
    anchorImageUrl: string;
    actorIdentitySets?: ActorIdentityReferenceSet[];
    prompt: string;
    shotBlueprintUrl?: string;
    sceneTruth?: SceneTruthSnapshot;
    presetId: ShotPresetId;
    hasSubjectStyleAnalysis?: boolean;
  }): Promise<string> => {
    const baseArgs = {
      anchorImageUrl: args.anchorImageUrl,
      actorIdentitySets: args.actorIdentitySets,
      prompt: args.prompt,
      apiKey,
      model,
      options: {
        billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
        entitlements: state.billingEntitlements,
        signal: abortControllerRef.current?.signal
      }
    };

    const isHostedShots = state.billingEntitlements.effectiveBillingMode === 'hosted';
    if (isHostedShots) {
      return GeminiService.generateShotPreview(baseArgs);
    }

    try {
      return await GeminiService.generateShotPreview({
        ...baseArgs,
        shotBlueprintUrl: args.shotBlueprintUrl,
        sceneTruth: args.sceneTruth,
        presetId: args.presetId,
        hasSubjectStyleAnalysis: args.hasSubjectStyleAnalysis,
      });
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (/400|Bad Request|413|Payload/i.test(msg)) {
        console.warn('[ShotsPanel] Rich preview payload rejected; retrying thin payload', {
          presetId: args.presetId,
          error: msg
        });
        return GeminiService.generateShotPreview(baseArgs);
      }
      throw err;
    }
  };

  const validateShotIntegrity = async (args: {
    sourceUrl: string;
    previewUrl: string;
    presetId: ShotPresetId;
    directedSlot?: DirectedShotSlot;
    sceneTruth?: SceneTruthSnapshot;
  }): Promise<{ passed: boolean; report: ShotIntegrityReport }> => {
    const preset = SHOT_PRESETS[args.presetId];
    const actorSummary = (args.sceneTruth?.actors || [])
      .slice()
      .sort((a, b) => a.leftToRightIndex - b.leftToRightIndex)
      .map((actor) => `${actor.actorLabel || 'Actor'}: zone=${actor.approxZone}, role=${actor.role}, target=${actor.targetInScene || 'source relationship'}`)
      .join('\n');

    const prompt = `
Compare SOURCE_ANCHOR and GENERATED_SHOT as a shot-continuity supervisor.

Expected shot designation: ${preset.label}
Preset instruction: ${preset.shotInstruction}
Directed slot notes: ${args.directedSlot?.actionText || args.directedSlot?.shotNotes || args.directedSlot?.coveragePurpose || 'none'}
Expected visible actor count: ${args.sceneTruth?.expectedActorCount ?? 'preserve source count'}
Known source blocking:
${actorSummary || 'Preserve the same actor positions, poses, and actor-to-object contact relationships from SOURCE_ANCHOR.'}

The generated shot is allowed to simulate a new camera angle, crop, lens, parallax, depth of field, and occlusion.
It is NOT allowed to move actors to new world positions, detach actors from animals/vehicles/seats/props, change pose/action, change actor count, swap identities, or redesign the scene.

Camera-axis requirement:
- Infer the same source action axis from subject relationships, screen direction, gaze/action flow, mounts/seats/props, and dominant environment geometry.
- GENERATED_SHOT must stay on the same side of that axis within a plausible 180-degree camera arc. It must not flip left/right geography or reverse the subject relationship.
- For angle/elevation presets, GENERATED_SHOT must show real environment viewpoint change: shifted foreground/background overlap, changed occlusion, visible side/top/low surfaces when appropriate, and plausible parallax around preserved landmarks.
- Do not accept a shot that only crops, zooms, or pans the original front-facing environment while claiming to be a new camera angle.

Return JSON with:
{
  "passed": boolean,
  "score": number from 0 to 1,
  "actorCountPreserved": boolean,
  "actorRelationshipPreserved": boolean,
  "actorPosePreserved": boolean,
  "sceneContinuityPreserved": boolean,
  "shotDesignationSatisfied": boolean,
  "within180Rule": boolean,
  "environmentViewpointPlausible": boolean,
  "viewpointChangeSufficient": boolean,
  "issues": string[],
  "correction": "one concise correction prompt for regeneration"
}
`;

    try {
      const report = await GeminiService.analyzeMultiFrameJson<ShotIntegrityReport>(
        prompt,
        apiKey,
        model,
        [
          { url: args.sourceUrl, label: 'SOURCE_ANCHOR' },
          { url: args.previewUrl, label: 'GENERATED_SHOT' }
        ],
        {
          billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
          entitlements: state.billingEntitlements
        }
      );

      const passed = Boolean(report.passed)
        && report.actorCountPreserved !== false
        && report.actorRelationshipPreserved !== false
        && report.actorPosePreserved !== false
        && report.sceneContinuityPreserved !== false
        && report.shotDesignationSatisfied !== false
        && report.within180Rule !== false
        && report.environmentViewpointPlausible !== false
        && report.viewpointChangeSufficient !== false
        && (report.score ?? 1) >= 0.74;

      return { passed, report };
    } catch (err) {
      console.warn('[ShotsPanel] Integrity check unavailable.', err);
      return {
        passed: true,
        report: {
          passed: true,
          score: undefined,
          issues: ['Integrity check unavailable; accepted spatial simulation without verification.'],
          correction: ''
        }
      };
    }
  };


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
    const billingMode = state.billingEntitlements.effectiveBillingMode;
    if (billingMode === 'byok' && !apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for BYOK SHOTS generation.', type: 'error' } });
      return;
    }
    if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'SHOTS preview generation' }))) {
      return;
    }

    const enforcedLocks: ShotLocks = { ...locks, identity: true, background: true, lighting: true };
    if (
      locks.identity !== enforcedLocks.identity ||
      locks.background !== enforcedLocks.background ||
      locks.lighting !== enforcedLocks.lighting
    ) {
      setLocks(enforcedLocks);
    }
    
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
        tokens: state.tokens
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
          locks: enforcedLocks,
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
          renderMode: 'ai_camera_move',
          integrity: { status: 'unchecked' },
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
    } catch (compilationError: unknown) {
      const compilationErrorMessage = getErrorMessage(compilationError);
      console.error("[ShotsPanel] Failed to compile shot variants:", compilationError);
      dispatch({ 
        type: 'ADD_LOG', 
        payload: { message: `Failed to compile scene snapshot: ${compilationErrorMessage}`, type: 'error' } 
      });
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
      locks: enforcedLocks,
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
        const directedSlot = preparedSlots.find(s => s.id === variant.slotId);
        
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
                kind: 'blueprint',
                saveDirectoryPath: state.saveDirectoryPath
            });
            materializedBlueprintUrl = matBp.displayUrl;
        } catch (bpErr) {
            console.warn("Could not materialize blueprint for variant", variant.id, bpErr);
        }

        let previewUrl = '';
        let integrityReport: ShotIntegrityReport | null = null;
        let integrityPassed = false;
        let usedFallback = false;
        const MAX_INTEGRITY_ATTEMPTS = 3;

        for (let attempt = 1; attempt <= MAX_INTEGRITY_ATTEMPTS; attempt++) {
          const attemptPrompt = attempt === 1
            ? variant.prompt
            : [
                variant.prompt,
                '### SHOT INTEGRITY CORRECTION',
                integrityReport?.correction || 'Regenerate while preserving source actor positions, poses, contact relationships, actor count, and scene continuity.',
                integrityReport?.issues?.length ? `Failed issues: ${integrityReport.issues.join('; ')}` : '',
                'OUTPUT REQUIREMENT: Return exactly one completed image. Do not answer with text, JSON, analysis, explanation, or a blank response.',
                '180-RULE REPAIR: Stay on the same side of the action axis while showing real environment parallax from the requested camera position.',
                'Keep this as a true spatial camera simulation, but do not re-stage actors or detach subjects from animals, seats, props, or other contact relationships.'
              ].filter(Boolean).join('\n');

          try {
            previewUrl = await generateAiShotPreview({
              anchorImageUrl: effectiveResultImageUrl,
              actorIdentitySets,
              prompt: attemptPrompt,
              shotBlueprintUrl: rawBlueprintUrl,
              sceneTruth,
              presetId: variant.presetId,
              hasSubjectStyleAnalysis: !!safeSubjectActionText
            });
          } catch (previewErr: unknown) {
            const previewErrorMessage = getErrorMessage(previewErr);
            if (!isNoImageShotResponse(previewErrorMessage)) throw previewErr;

            integrityReport = {
              passed: false,
              score: 0,
              issues: [previewErrorMessage],
              correction: 'Return exactly one completed image for the requested shot. Do not answer with text, JSON, analysis, explanation, or a blank response.'
            };

            if (attempt < MAX_INTEGRITY_ATTEMPTS) {
              onUpdateSession(sceneId, prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  variants: prev.variants.map(v => v.id === variant.id ? {
                    ...v,
                    status: 'generating',
                    integrity: {
                      status: 'needs_review',
                      score: 0,
                      issues: [previewErrorMessage],
                      attempts: attempt
                    },
                    error: `Shot renderer returned no image. Retrying spatial shot (${attempt}/${MAX_INTEGRITY_ATTEMPTS})...`
                  } : v)
                };
              });
              continue;
            }

            break;
          }

          const validation = await validateShotIntegrity({
            sourceUrl: effectiveResultImageUrl,
            previewUrl,
            presetId: variant.presetId,
            directedSlot,
            sceneTruth
          });

          integrityReport = validation.report;
          integrityPassed = validation.passed;

          if (integrityPassed) break;

          onUpdateSession(sceneId, prev => {
            if (!prev) return prev;
            return {
              ...prev,
              variants: prev.variants.map(v => v.id === variant.id ? {
                ...v,
                status: 'generating',
                integrity: {
                  status: 'needs_review',
                  score: integrityReport?.score,
                  issues: integrityReport?.issues,
                  attempts: attempt
                },
                error: `Integrity issue detected. Rerolling spatial shot (${attempt}/${MAX_INTEGRITY_ATTEMPTS})...`
              } : v)
            };
          });
        }

        if (!integrityPassed) {
          previewUrl = await renderContinuityShotImage({
            sourceImageUrl: effectiveResultImageUrl,
            preset,
            sceneTruth
          });
          usedFallback = true;
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
              renderMode: usedFallback ? 'continuity_reframe' : 'ai_camera_move',
              integrity: usedFallback
                ? {
                    status: 'fallback',
                    score: integrityReport?.score,
                    issues: integrityReport?.issues?.length
                      ? integrityReport.issues
                      : ['Spatial simulation failed integrity checks; continuity crop fallback used.'],
                    attempts: MAX_INTEGRITY_ATTEMPTS
                  }
                : {
                    status: integrityReport?.issues?.some(issue => issue.toLowerCase().includes('unavailable')) ? 'unverified' : 'verified',
                    score: integrityReport?.score,
                    issues: integrityReport?.issues,
                    attempts: integrityReport ? Math.min(MAX_INTEGRITY_ATTEMPTS, Math.max(1, integrityReport.issues?.length ? 2 : 1)) : 1
                  },
              error: usedFallback ? 'Spatial simulation failed integrity checks; used continuity crop fallback.' : undefined
            } : v)
          };
        });
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        console.error("SHOTS PANEL FATAL:", err);
        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { ...v, status: 'error', error: errorMessage } : v)
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
    const billingMode = state.billingEntitlements.effectiveBillingMode;
    if (billingMode === 'byok' && !apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for BYOK SHOTS final render.', type: 'error' } });
      return;
    }
    if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'SHOTS final render' }))) {
      return;
    }

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
        const preset = SHOT_PRESETS[variant.presetId];
        const renderMode = variant.renderMode || 'ai_camera_move';

        if (renderMode === 'continuity_reframe') {
          const finalUrl = await renderContinuityShotImage({
            sourceImageUrl: effectiveResultImageUrl,
            preset,
            sceneTruth: session.sceneTruth,
            outputWidth: 3840
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
                sourceFinalUrl: finalUrl,
                renderMode: 'continuity_reframe'
              } : v)
            };
          });
          continue;
        }

        const finalPrompt = buildShotFinalRerenderPrompt({
          sourceResultUrl: effectiveResultImageUrl,
          sceneTruth: session.sceneTruth!,
          selectedShotPreviewUrl: variant.previewUrl,
          actorIdentitySets: session.actorIdentitySets,
          shotsActorOptions,
          presetId: variant.presetId,
          directedSlot: session.directedShots?.find(s => s.id === variant.slotId),
          locks: { ...session.locks, identity: true, background: true, lighting: true },
          environmentText,
          subjectActionText: safeSubjectActionText,
          lightingText,
          expectedActorCount,
          sourceStyleLock
        });

        let finalUrl: string | undefined;
        let attempts = 0;
        let lastErr: unknown;
        
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
          } catch (e: unknown) {
            lastErr = e;
            const msg = getErrorMessage(e).toLowerCase();
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
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        onUpdateSession(sceneId, prev => {
          if (!prev) return prev;
          return {
            ...prev,
            variants: prev.variants.map(v => v.id === variant.id ? { ...v, status: 'error', error: errorMessage } : v)
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

  const handleSetVariantAsStage = (variantId: string) => {
    if (!session || !onSetAsStage) return;
    const variant = session.variants.find(v => v.id === variantId);
    if (!variant) return;

    const url = variant.finalUrl || variant.previewUrl || variant.sourceFinalUrl || variant.sourcePreviewUrl;
    if (!url) return;

    onSetAsStage(url);
  };

  const handleRegenerateOne = async (variantId: string, instruction?: string) => {
    // Basic implementation for single tile retry
    if (!session || !effectiveResultImageUrl) return;
    const variant = session.variants.find(v => v.id === variantId);
    if (!variant) return;
    const billingMode = state.billingEntitlements.effectiveBillingMode;
    if (billingMode === 'byok' && !apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for BYOK SHOTS regeneration.', type: 'error' } });
      return;
    }
    if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'SHOTS regeneration' }))) {
      return;
    }

    onUpdateSession(sceneId, prev => {
      if (!prev) return prev;
      return {
        ...prev,
        variants: prev.variants.map(v => v.id === variantId ? { ...v, status: 'generating', error: undefined } : v)
      };
    });

    abortControllerRef.current = new AbortController();

    try {
      const directedSlot = session.directedShots?.find(s => s.id === variant.slotId);
      const preset = SHOT_PRESETS[variant.presetId];
      
      let rawBlueprintUrl = variant.blueprintUrl; // Fallback, will regenerate below if we can
      if (directedSlot && preset) {
         rawBlueprintUrl = await buildShotBlueprintImage({
            anchorImageUrl: effectiveResultImageUrl,
            preset,
            directedSlot
         });
      }

      const extraInstruction = instruction?.trim();
      const environmentHardLock =
        `\n### HARD ENVIRONMENT LOCK (NON-NEGOTIABLE)\n` +
        `Preserve the exact source anchor environment and architectural setting.\n` +
        `No relocation, no indoor/outdoor conversion, no time-of-day/weather/era drift.\n` +
        `If any text conflicts with the anchor image environment, ignore the text and follow the anchor image.\n`;

      const basePrompt = extraInstruction
        ? `${variant.prompt}\n### SHOT-SPECIFIC REGENERATE ADJUSTMENT\n${extraInstruction}\nApply this as camera/framing/visibility guidance unless it explicitly says to move, reposition, re-pose, stand, sit, turn, remount, dismount, or change an actor's action. Preserve actor positions, pose, and actor-to-object contact relationships by default.`
        : variant.prompt;
      const lockedPrompt = `${basePrompt}${environmentHardLock}`;

      const generateRegeneratedPreview = async (prompt: string): Promise<string> =>
        generateAiShotPreview({
          anchorImageUrl: effectiveResultImageUrl,
          actorIdentitySets: session.actorIdentitySets,
          prompt,
          shotBlueprintUrl: rawBlueprintUrl,
          sceneTruth: session.sceneTruth,
          presetId: variant.presetId,
          hasSubjectStyleAnalysis: false
        });

      let previewUrl: string;
      try {
        previewUrl = await generateRegeneratedPreview(lockedPrompt);
      } catch (previewErr: unknown) {
        const previewErrorMessage = getErrorMessage(previewErr);
        if (!isNoImageShotResponse(previewErrorMessage)) throw previewErr;
        previewUrl = await generateRegeneratedPreview([
          lockedPrompt,
          '### OUTPUT RECOVERY',
          'Return exactly one completed image for this shot. No text, JSON, explanation, analysis, or blank response.'
        ].join('\n'));
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
            const appendedPrompt = `${lockedPrompt}\nCRITICAL: PREVIOUS ATTEMPT FAILED. YOU MUST MATERIALLY CHANGE THE CAMERA ANGLE AND CROP. DO NOT REPRODUCE THE SOURCE COMPOSITION.`;
            
            try {
              previewUrl = await generateRegeneratedPreview(appendedPrompt);
            } catch (previewErr: unknown) {
              const previewErrorMessage = getErrorMessage(previewErr);
              if (!isNoImageShotResponse(previewErrorMessage)) throw previewErr;
              previewUrl = await generateRegeneratedPreview([
                appendedPrompt,
                '### OUTPUT RECOVERY',
                'Return exactly one completed image for this shot. No text, JSON, explanation, analysis, or blank response.'
              ].join('\n'));
            }
            similarity = await computeImageSimilarity(effectiveResultImageUrl, previewUrl);
         }
         if (autoReroll && similarity >= SIMILARITY_THRESHOLD) isDuplicate = true;
      } catch (simErr) {
         console.error("[ShotsPanel] Failed to compute image similarity:", simErr);
      }

      let integrityReport: ShotIntegrityReport | null = null;
      let integrityPassed = false;
      let renderMode: ShotVariant['renderMode'] = 'ai_camera_move';

      const firstValidation = await validateShotIntegrity({
        sourceUrl: effectiveResultImageUrl,
        previewUrl,
        presetId: variant.presetId,
        directedSlot,
        sceneTruth: session.sceneTruth
      });
      integrityReport = firstValidation.report;
      integrityPassed = firstValidation.passed;

      if (!integrityPassed) {
        const correctionPrompt = [
          lockedPrompt,
          '### SHOT INTEGRITY CORRECTION',
          integrityReport?.correction || 'Regenerate while preserving source actor positions, poses, contact relationships, actor count, and scene continuity.',
          integrityReport?.issues?.length ? `Failed issues: ${integrityReport.issues.join('; ')}` : '',
          'OUTPUT REQUIREMENT: Return exactly one completed image. Do not answer with text, JSON, analysis, explanation, or a blank response.',
          '180-RULE REPAIR: Stay on the same side of the action axis while showing real environment parallax from the requested camera position.'
        ].filter(Boolean).join('\n');

        try {
          previewUrl = await generateRegeneratedPreview(correctionPrompt);
        } catch (previewErr: unknown) {
          const previewErrorMessage = getErrorMessage(previewErr);
          if (!isNoImageShotResponse(previewErrorMessage)) throw previewErr;
          integrityReport = {
            passed: false,
            score: 0,
            issues: [previewErrorMessage],
            correction: 'Return exactly one completed image for the requested shot.'
          };
          integrityPassed = false;
          previewUrl = '';
        }

        if (previewUrl) {
          const secondValidation = await validateShotIntegrity({
            sourceUrl: effectiveResultImageUrl,
            previewUrl,
            presetId: variant.presetId,
            directedSlot,
            sceneTruth: session.sceneTruth
          });
          integrityReport = secondValidation.report;
          integrityPassed = secondValidation.passed;
        }
      }

      if (!integrityPassed) {
        previewUrl = await renderContinuityShotImage({
          sourceImageUrl: effectiveResultImageUrl,
          preset,
          sceneTruth: session.sceneTruth
        });
        renderMode = 'continuity_reframe';
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
            renderMode,
            integrity: renderMode === 'continuity_reframe'
              ? {
                  status: 'fallback',
                  score: integrityReport?.score,
                  issues: integrityReport?.issues?.length
                    ? integrityReport.issues
                    : ['Spatial simulation failed integrity checks; continuity crop fallback used.'],
                  attempts: 2
                }
              : {
                  status: integrityReport?.issues?.some(issue => issue.toLowerCase().includes('unavailable')) ? 'unverified' : 'verified',
                  score: integrityReport?.score,
                  issues: integrityReport?.issues,
                  attempts: integrityPassed ? 1 : 2
                },
            error: renderMode === 'continuity_reframe'
              ? 'Spatial simulation failed integrity checks; used continuity crop fallback.'
              : isDuplicate ? 'CRITICAL: Failed to materially change framing.' : undefined
          } : v)
        };
      });
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      if (isNoImageShotResponse(errorMessage)) {
        try {
          const preset = SHOT_PRESETS[variant.presetId];
          const fallbackUrl = await renderContinuityShotImage({
            sourceImageUrl: effectiveResultImageUrl,
            preset,
            sceneTruth: session.sceneTruth
          });
          const materialized = await LocalAssetService.materializeImageAsset({
            sourceUrl: fallbackUrl,
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
                sourcePreviewUrl: fallbackUrl,
                renderMode: 'continuity_reframe',
                integrity: {
                  status: 'fallback',
                  score: 0,
                  issues: [errorMessage, 'Shot renderer returned no image; continuity crop fallback used.'],
                  attempts: 2
                },
                error: 'Shot renderer returned no image; used continuity crop fallback.'
              } : v)
            };
          });
          return;
        } catch (fallbackErr) {
          console.warn('[ShotsPanel] No-image regenerate fallback failed.', fallbackErr);
        }
      }
      onUpdateSession(sceneId, prev => {
        if (!prev) return prev;
        return {
          ...prev,
          variants: prev.variants.map(v => v.id === variantId ? { ...v, status: 'error', error: errorMessage } : v)
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
            onSetAsStage={handleSetVariantAsStage}
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
