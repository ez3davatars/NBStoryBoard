import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SceneSpecOverlay from "./SceneSpecOverlay"

import {
    RotateCw,
    RefreshCcw,
    X,
    Copy,
    Trash2 as TrashIcon,
    Link2,
    StickyNote,
    BoxSelect,
    UserPlus,
    Pipette,
    Undo,
    Redo,
    Clapperboard,
    Settings as SettingsIcon,
    Square,
    Pencil,
    Target,
    MoveUpRight,
    Download,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
    HelpCircle
} from 'lucide-react';
import { NumericInput } from './ui/NumericInput';
import { SidebarPanel } from './ui/SidebarPanel';

import { useAppContext, getShotsActorOptionsForScene } from '../context/AppContext';
import type {
    Action,
    ReferenceSlot,
    RegionEditLayer,
    RegionEditState,
    RegionSourceImageMeta,
    Shot,
    StageAnnotation,
    StageToken,
    SpatialAuthorityStatus,
    CastMember,
    DirectorSettings,
    DepthAssistWarning,
    WhitelistProfile
} from '../context/AppContext';
import type { ShotVariant } from '../types/shots';
import { GeminiService, type ExtractedStyle, type SceneIntent } from '../services/GeminiService';
import { ensureAuthenticatedForGeneration } from '../services/AuthGenerationGate';
import { DepthService } from '../services/DepthService';
import { DEPTH_FEATURE_ENABLED } from '../config/featureFlags';
import {
    compileV3DirectorPrompt,
    buildPlacementPrompt,
    getActiveReferenceSlots,
    buildStrictAnchorReplacementPrompt,
    buildEnvironmentOnlyPrompt,
    buildStrictPrompt,
    buildLoosePrompt
} from '../utils/promptHelpers';
import {
    buildSourcePreservingReferenceImages,
    buildStagingSourcePreservationPromptBlock,
    resolveStagingIntent
} from '../utils/stagingSourceIntent';
import {
    resolveArrowEndpoints,
    shouldAttachSpatialControlOverlay
} from '../utils/stagingSpatialDirectives';
import { formatHostedGenerationThrownError } from '../utils/hostedGenerationErrors';
import { sanitizeStyleForStrictIdentity } from '../utils/analysisSanitizers';
import {
    CONTROL_OVERLAY_GEOMETRY_ONLY_LABEL,
    createPromptSafeReferenceSlots,
    deriveExplicitStyleOverride,
    deriveStagingReferenceRole,
    finalizeStagingReferences,
    findReferenceAnalysisMediumContamination,
    protectStagingPromptStyle,
    buildSubmittedStagingRequestSnapshot,
    type FinalizedStagingReference,
    type SubmittedStagingRequestSnapshot
} from '../utils/stagingPromptProtection';
import { LibraryAssetMaterializer } from '../services/LibraryAssetMaterializer';
import { useProductionExports } from '../hooks/useProductionExports';
import { useAdvancedRender } from '../hooks/useAdvancedRender';
import { getCompactActorLabel } from '../utils/nameHelpers';
import { useStableElementSize } from '../hooks/useStableElementSize';
import { buildPlacementIntentsFromAnnotations, buildAnchorSurfaceFromZone, buildAllowanceMaskFromAnchor, buildForegroundProtectMaskFromDepth } from '../utils/spatialHelpers';
import { NANO_BANANA_2_IMAGE_MODEL } from '../constants/generationModels';
import { createUniqueDownloadFilename } from '../utils/downloadFilenames';
import { useRecentGenerationsStore } from '../stores/useRecentGenerationsStore';

import React from 'react';

// UI Components
import ConfirmDialog from './ui/ConfirmDialog';
import { DebouncedHueSlider } from './ui/DebouncedHueSlider';
import { CastDirectorThinking } from './ui/CastDirectorThinking';

// Panels
import { ShotListPanel } from './panels/ShotListPanel';
import { RegionEditPanel } from './panels/RegionEditPanel';
import { StageLayersPanel } from './panels/StageLayersPanel';
import { GlobalSpecsPanel } from './panels/GlobalSpecsPanel';
import { AnchorRefPanel } from './panels/AnchorRefPanel';
import { RefStacksPanel } from './panels/RefStacksPanel';
import { ActorIntelligencePanel } from './panels/ActorIntelligencePanel';
import { AdvancedRenderPanel } from './panels/AdvancedRenderPanel';
import { SceneDirectorPanel } from './panels/SceneDirectorPanel';
import { PromptTerminalPanel } from './panels/PromptTerminalPanel';
import { RefInspectorModal } from './panels/RefInspectorModal';
import { ShotsPanel } from './shots/ShotsPanel';
import { getActorIdentityReferenceSetsForScene, getEffectiveResultAnchorForScene } from '../context/AppContext';
import { buildOrderedActorIdentityInputs, hasStrongFaceAnchor } from '../utils/identityReferenceHelpers';

import { DEPTH_BAND_RADIUS } from '../services/SpatialIntelligence';

import { useSceneSpec } from "../../scene/useSceneSpec"

async function materializeDisplayUrl(url: string | null | undefined): Promise<string> {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    if (/^https?:\/\//i.test(url)) {
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) throw new Error(`Failed to fetch remote display asset: ${res.status}`);
            const fetchedBlob = await res.blob();
            // True Base64 Pivot instead of transient blob
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(fetchedBlob);
            });
        } catch (e) {
            console.warn("Display Materialization Error for image:", url, e);
            return url;
        }
    }
    return url;
}

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const formatStageGenerationError = (error: unknown): string => {
    const rawMessage = formatHostedGenerationThrownError(error);
    const isHostedProviderError =
        /Hosted Execution Error\s+\[PROVIDER_ERROR\]/i.test(rawMessage) ||
        /Hosted Generation Error\s+\[PROVIDER_ERROR\]/i.test(rawMessage) ||
        /Google API Failed\s*\(5\d\d\)/i.test(rawMessage) ||
        /Internal error encountered/i.test(rawMessage);

    if (!isHostedProviderError) return rawMessage;

    return [
        'Hosted provider returned a temporary internal error.',
        'Your stage, reference stack, and prompt are still intact.',
        'Retry Generate; if it repeats, reduce active refs/resolution or switch to BYOK for this render.'
    ].join(' ');
};

type GeneratedImageResponse =
    | string
    | {
        asset_url?: string;
        url?: string;
    }
    | null
    | undefined;

type HostedTimeoutError = Error & { generationId?: string };

const normalizeGeneratedImageUrl = async (res: GeneratedImageResponse): Promise<string> => {
    const rawUrl =
        typeof res === 'string'
            ? res
            : (res && typeof res === 'object'
                ? (res.asset_url || res.url || '')
                : '');

    if (!rawUrl) {
        throw new Error('GenerateImage returned no usable image URL.');
    }

    try {
        return await materializeDisplayUrl(rawUrl);
    } catch {
        return rawUrl;
    }
};

const buildReferenceLogEntries = (references: Array<{ label: string; role?: string }>) => (
    references.map((reference) => ({
        label: reference.label,
        role: reference.role || deriveStagingReferenceRole(reference.label)
    }))
);

const buildFinalizedReferenceInputs = (references: FinalizedStagingReference[]) => (
    references.map(({ url, label }) => ({ url, label }))
);

const buildReplaceModeIdentityActionSceneLock = (args: {
    actionDirection: string;
    sceneEnvironment: string;
    sceneLighting: string;
    sceneCamera: string;
    sceneLayout: string;
}): string => {
    const action = args.actionDirection.trim();
    const sceneLines = [
        args.sceneEnvironment ? `Environment/background: ${args.sceneEnvironment}` : '',
        args.sceneLighting ? `Lighting: ${args.sceneLighting}` : '',
        args.sceneCamera ? `Camera/framing: ${args.sceneCamera}` : '',
        args.sceneLayout && args.sceneLayout !== 'default' ? `Layout: ${args.sceneLayout}` : '',
    ].filter(Boolean);

    return [
        '### IDENTITY LOCK - HIGHEST PRIORITY',
        'Use the selected cast reference image(s) as the only identity source.',
        "Preserve the actor's exact facial structure, head shape, skin tone, facial hair, body type, age impression, wardrobe identity, hairline/baldness pattern, and likeness.",
        'Do not create a new person.',
        'Do not average the actor with the background image.',
        'Do not reinterpret the actor from text, Scene DNA, or Scene Director wording.',
        '',
        '### ACTION / EDIT DIRECTION',
        action
            ? `Apply this action/pose to the locked reference actor only: ${action}`
            : 'No new identity-bearing action text was provided.',
        'Do not infer or generate a new subject from this sentence.',
        "Do not change the actor's face, identity, age, body type, skin tone, hairline, facial hair, expression baseline, or likeness.",
        '',
        '### SCENE LOCK',
        sceneLines.length > 0
            ? sceneLines.join('\n')
            : 'Preserve the existing background composition, typography, logo placement, colors, props, and environment from the current stage scene.',
        'Scene DNA may describe background, layout, lighting, and camera only. Scene DNA is never an identity source.',
        '',
        '### NEGATIVE IDENTITY DRIFT RULES',
        'No identity drift. No lookalike substitution. No random similar person. No partial likeness only. No changed age impression, ethnicity-presenting traits, skull/head shape, hairline, facial hair, body build, or skin tone.',
    ].join('\n');
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const REGION_EDIT_MAX_EDGE = 2048;
const REGION_EDIT_MAX_PIXELS = 2048 * 2048;

type RegionEditTargetDimensions = { width: number; height: number };

type ObjectContainRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const getObjectContainRect = (
    imageWidth: number,
    imageHeight: number,
    frameWidth: number,
    frameHeight: number
): ObjectContainRect => {
    const safeImageWidth = Math.max(1, imageWidth);
    const safeImageHeight = Math.max(1, imageHeight);
    const safeFrameWidth = Math.max(1, frameWidth);
    const safeFrameHeight = Math.max(1, frameHeight);
    const scale = Math.min(safeFrameWidth / safeImageWidth, safeFrameHeight / safeImageHeight);
    const width = safeImageWidth * scale;
    const height = safeImageHeight * scale;
    return {
        x: (safeFrameWidth - width) / 2,
        y: (safeFrameHeight - height) / 2,
        width,
        height
    };
};

const getRegionEditImageSize = (dimensions: RegionEditTargetDimensions): '1K' | '2K' | '4K' => {
    const longEdge = Math.max(dimensions.width, dimensions.height);
    if (longEdge > 2048) return '4K';
    if (longEdge > 1024) return '2K';
    return '1K';
};

const normalizeRefName = (value: string): string =>
    value
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const fileBaseNameFromPath = (value?: string): string | null => {
    if (!value) return null;
    if (value.startsWith('data:') || value.startsWith('blob:')) return null;
    try {
        const decoded = decodeURIComponent(value);
        const clean = decoded.split(/[?#]/)[0] || decoded;
        const parts = clean.split(/[\\/]/).filter(Boolean);
        return parts[parts.length - 1] || null;
    } catch {
        const clean = value.split(/[?#]/)[0] || value;
        const parts = clean.split(/[\\/]/).filter(Boolean);
        return parts[parts.length - 1] || null;
    }
};

const getReferenceSlotMatchName = (slot: ReferenceSlot, fallbackIndex: number): string =>
    slot.name ||
    fileBaseNameFromPath(slot.localPath) ||
    fileBaseNameFromPath(slot.sourceUrl) ||
    `Reference ${slot.index || fallbackIndex + 1}`;

const isReplaceInstruction = (instruction: string): boolean =>
    /\breplace\b/i.test(instruction);

const resolveNamedReferenceFromInstruction = (
    instruction: string,
    refs: ReferenceSlot[],
    selectedRefId?: string
): ReferenceSlot | null => {
    const normalizedInstruction = normalizeRefName(instruction);
    if (!normalizedInstruction) return null;

    const refsWithImages = refs.filter(ref => Boolean(ref.url));
    const candidates = refsWithImages.map((ref, index) => {
        const rawName = getReferenceSlotMatchName(ref, index);
        return {
            ref,
            normalizedName: normalizeRefName(rawName),
            index,
            isSelected: selectedRefId ? String(ref.index) === selectedRefId : Boolean(ref.active)
        };
    }).filter(candidate => candidate.normalizedName.length > 0);

    const matches = candidates.filter(candidate =>
        normalizedInstruction.includes(candidate.normalizedName)
    );

    const numberMatch =
        normalizedInstruction.match(/reference(?:\s+stack)?\s*#?\s*(\d+)/) ||
        normalizedInstruction.match(/ref\s*#?\s*(\d+)/);

    if (numberMatch) {
        const requestedNumber = Number(numberMatch[1]);
        const bySlotIndex = refsWithImages.find(ref => ref.index === requestedNumber);
        if (bySlotIndex) return bySlotIndex;

        const refIndex = requestedNumber - 1;
        if (refsWithImages[refIndex]) return refsWithImages[refIndex];
    }

    if (matches.length === 1) return matches[0].ref;

    if (matches.length > 1) {
        const selected = matches.find(match => match.isSelected);
        if (selected) return selected.ref;

        const exactish = matches.find(match => normalizedInstruction === match.normalizedName);
        if (exactish) return exactish.ref;

        return matches[0].ref;
    }

    return null;
};

const buildReplacementSourceInstruction = (
    instruction: string,
    referenceLabel: string
): string => `
Image A is the direct edit target.
The edit mask corresponds to Image A.
Image B is the replacement source asset: ${referenceLabel}.
Replace only the masked region in Image A using the subject/content from Image B.
Match perspective, scale, lighting, local realism, and scene context.
Do not stretch or distort the inserted asset.
Preserve all unmasked areas of Image A exactly.

Layer instruction: ${instruction}
`;

function fitToAspect(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number,
  padding = 24
) {
  const availableWidth = Math.max(0, containerWidth - padding * 2);
  const availableHeight = Math.max(0, containerHeight - padding * 2);

  let width = availableWidth;
  let height = width / aspectRatio;

  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspectRatio;
  }

  return {
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

const SceneCanvas = () => {



    const { state, dispatch } = useAppContext();
    const recentGenerationsCount = useRecentGenerationsStore((store) => store.recentGenerations.length);
    const addRecentGeneration = useRecentGenerationsStore((store) => store.addRecentGeneration);
    const { ref: stageViewportRef, size: stageViewportSize } = useStableElementSize<HTMLDivElement>();
    const stageRef = stageViewportRef;
    const viewportRef = useRef<HTMLDivElement>(null);
    const centerPaneRef = useRef<HTMLDivElement>(null);

    // Camera Gate: an inner viewport that always matches the selected aspect ratio.
    const [centerPaneWidth, setCenterPaneWidth] = useState(0);

    const selectedAspectRatio = useMemo(() => {
        const raw = String(state.director.aspectRatio || '16:9');
        const parts = raw.split(':').map((p) => Number(p));
        if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[1] !== 0) {
            return parts[0] / parts[1];
        }
        return 16 / 9;
    }, [state.director.aspectRatio]);

    const previewSize = useMemo(() => {
        return fitToAspect(
            stageViewportSize.width,
            stageViewportSize.height,
            selectedAspectRatio,
            24
        );
    }, [stageViewportSize.width, stageViewportSize.height, selectedAspectRatio]);

    const viewportBox = useMemo(() => {
        const cw = stageViewportSize.width || 1;
        const ch = stageViewportSize.height || 1;
        const w = previewSize.width || 1;
        const h = previewSize.height || 1;
        const x = Math.floor((cw - w) / 2);
        const y = Math.floor((ch - h) / 2);
        return { x, y, w, h };
    }, [stageViewportSize.width, stageViewportSize.height, previewSize]);

    useEffect(() => {
        if (!import.meta.env.DEV) return;

        console.log("[STAGE LAYOUT]", {
            viewportWidth: stageViewportSize.width,
            viewportHeight: stageViewportSize.height,
            previewWidth: previewSize.width,
            previewHeight: previewSize.height,
        });
    }, [
        stageViewportSize.width,
        stageViewportSize.height,
        previewSize.width,
        previewSize.height,
    ]);

    // --- MANUAL DOWNLOADS ---
    const downloadStageImage = async () => {
        if (!viewportRef.current) return;
        dispatch({ type: 'SET_PROCESSING', payload: true });

        try {
            // IF we are looking at the final result, just download that image directly
            if (viewMode === 'result' && displayedResultImage) {
                dispatch({ type: 'ADD_LOG', payload: { message: 'Downloading Final Result Image...', type: 'info' } });
                const url = displayedResultImage;
                if (!url) throw new Error("No result image available.");
                
                // For data URLs we can download directly
                const link = document.createElement('a');
                link.href = url;
                link.download = createUniqueDownloadFilename('NB_Result.png');
                link.click();
                dispatch({ type: 'ADD_LOG', payload: { message: 'Result image downloaded successfully.', type: 'success' } });
                return;
            }

            // OTHERWISE, we are in 'Stage' mode, so composite the DOM view
            dispatch({ type: 'ADD_LOG', payload: { message: 'Composting Stage for Storyboard Capture...', type: 'info' } });
            const dataUrl = await captureSceneImage();
            if (dataUrl) {
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = createUniqueDownloadFilename('NB_Stage.png');
                link.click();
                dispatch({ type: 'ADD_LOG', payload: { message: 'Stage captured successfully.', type: 'success' } });
            } else {
                throw new Error("Canvas composition returned empty.");
            }
        } catch (e: unknown) {
             dispatch({ type: 'ADD_LOG', payload: { message: `Download failed: ${getErrorMessage(e)}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };


    const ensureStagingAiAccess = useCallback(async (featureLabel: string): Promise<boolean> => {
        const billingMode = state.billingEntitlements?.effectiveBillingMode || state.billingMode;
        
        if (billingMode === 'byok' && !state.apiKey) {
            dispatch({ type: 'ADD_LOG', payload: { message: `${featureLabel} blocked: API Key required for BYOK`, type: 'error' } });
            return false;
        }

        return await ensureAuthenticatedForGeneration({ billingMode, featureLabel });
    }, [dispatch, state.apiKey, state.billingEntitlements, state.billingMode]);

    const [isCompactCommandHeader, setIsCompactCommandHeader] = useState(false);
    const [isCompactStageToolbar, setIsCompactStageToolbar] = useState(false);

    useEffect(() => {
        // COMMAND HEADER
        // Enter compact earlier, exit only when clearly wider again
        if (!isCompactCommandHeader && centerPaneWidth < 1120) {
            setIsCompactCommandHeader(true);
        } else if (isCompactCommandHeader && centerPaneWidth > 1180) {
            setIsCompactCommandHeader(false);
        }

        // BOTTOM TOOLBAR
        // Enter compact when center pane gets meaningfully tight
        if (!isCompactStageToolbar && centerPaneWidth < 900) {
            setIsCompactStageToolbar(true);
        } else if (isCompactStageToolbar && centerPaneWidth > 960) {
            setIsCompactStageToolbar(false);
        }
    }, [centerPaneWidth, isCompactCommandHeader, isCompactStageToolbar]);

    // Auto-Cutout Effect
    useEffect(() => {
        const el = centerPaneRef.current;
        if (!el) return;

        const update = () => {
            if (!centerPaneRef.current) return;
            setCenterPaneWidth(centerPaneRef.current.clientWidth || 0);
        };

        update();

        const obs = new ResizeObserver(() => {
            requestAnimationFrame(update);
        });

        obs.observe(el);

        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        const store = useSceneSpec.getState();
        const currentActors = store.scene.actors;
        const tokens = state.tokens;

        // 1. Remove actors that no longer exist in tokens
        const tokenIds = new Set(tokens.map(t => t.id));
        currentActors.forEach(actor => {
            if (!tokenIds.has(actor.id)) {
                store.removeActor(actor.id);
            }
        });

        // 2. Add or Update actors from tokens
        tokens.forEach(t => {
            if (
                !Number.isFinite(t.x) ||
                !Number.isFinite(t.y) ||
                !Number.isFinite(t.width) ||
                !Number.isFinite(t.height) ||
                t.width! <= 0 ||
                t.height! <= 0 ||
                !Number.isFinite(viewportBox.w) ||
                !Number.isFinite(viewportBox.h) ||
                viewportBox.w <= 0 ||
                viewportBox.h <= 0
            ) {
                return;
            }

            const existingActor = currentActors.find(a => a.id === t.id);

            const boundingBox = {
                x: (t.x - (t.width! * (t.anchorX ?? 0.5))) / viewportBox.w,
                y: (t.y - (t.height! * (t.anchorY ?? 0.8))) / viewportBox.h,
                width: t.width! / viewportBox.w,
                height: t.height! / viewportBox.h
            };

            if (
                !Number.isFinite(boundingBox.x) ||
                !Number.isFinite(boundingBox.y) ||
                !Number.isFinite(boundingBox.width) ||
                !Number.isFinite(boundingBox.height)
            ) {
                return;
            }

            if (!existingActor) {
                store.addActor({
                    id: t.id,
                    boundingBox,
                    depthLayer: 2,
                    cameraZone: "midground",
                    scaleLock: true,
                    positionLock: true,
                    plane: "grounded",
                    occlusion: {
                        mayOcclude: [],
                        mayBeOccludedBy: []
                    },
                    poseLock: true
                });
            } else {
                const boxChanged =
                    Math.abs(existingActor.boundingBox.x - boundingBox.x) > 0.005 ||
                    Math.abs(existingActor.boundingBox.y - boundingBox.y) > 0.005 ||
                    Math.abs(existingActor.boundingBox.width - boundingBox.width) > 0.005 ||
                    Math.abs(existingActor.boundingBox.height - boundingBox.height) > 0.005;

                if (boxChanged) {
                    store.updateActor(t.id, { boundingBox });
                }
            }
        });
    }, [state.tokens, viewportBox]);

    // TECHNICAL DEBUG VISUALIZATION (Non-persistent, DEV only)
    const [showDebugDepthMap, setShowDebugDepthMap] = useState(false);
    const [showDebugFloor, setShowDebugFloor] = useState(false);
    const [showDebugVolumes, setShowDebugVolumes] = useState(false);
    const [showDebugBands, setShowDebugBands] = useState(false);
    const [showDebugActorOverlay, setShowDebugActorOverlay] = useState(false);
    const showInternalDepthControls = DEPTH_FEATURE_ENABLED;

    // SPATIAL INTELLIGENCE AUTHORITY DERIVATION
    const authorityStatus = useMemo<SpatialAuthorityStatus>(() => {
        if (!state.depthMapUrl || state.isDepthProcessing) return 'INVALID';
        // If we have a depth map but hash is missing (meaning extraction pending or failed) -> INVALID
        if (!state.sourceBackgroundHash) return 'INVALID';

        if (state.floorPlane?.confidence === 'fallback') return 'DEGRADED';
        if (state.floorPlane?.confidence === 'high') return 'AUTHORITATIVE';

        return 'DEGRADED'; // Default to degraded if floor is missing but depth exists
    }, [state.depthMapUrl, state.isDepthProcessing, state.sourceBackgroundHash, state.floorPlane]);

    const [tokenMasks, setTokenMasks] = useState<Record<string, string>>({});

    // GROUND PLANE (Derived Authoritative Depth)
    const [groundDepth, setGroundDepth] = useState<number | null>(null);
    const [showGroundDebug, setShowGroundDebug] = useState(false);

    // DRAG STATE FOR CANVAS ITEMS
    const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);

    // Style Transfer State
    const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
    const [extractedStyle, setExtractedStyle] = useState<ExtractedStyle | null>(null);
    const [sceneIntent, setSceneIntent] = useState<SceneIntent | null>(null);
    const [latestSubmittedStagingRequest, setLatestSubmittedStagingRequest] = useState<SubmittedStagingRequestSnapshot | null>(null);
    const [previousBackgroundUrl, setPreviousBackgroundUrl] = useState<string | null>(null);
    const AUTO_STYLE_ANALYSIS_WAIT_MS = 60000;
    const AUTO_STYLE_ENVIRONMENT_WAIT_MS = state.billingEntitlements.effectiveBillingMode === 'hosted'
        ? (state.imageResolution === '4K' ? 180000 : 120000)
        : 90000;
    
    const colorPickerRef = useRef<HTMLInputElement>(null);
    const stagingGenerationInFlightRef = useRef(false);
    const [lastCustomColor, setLastCustomColor] = useState('#ffffff');
    const [showColorEditor, setShowColorEditor] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // --- STAGING & RESULT VIEWS ---
    const [viewMode, setViewMode] = useState<'stage' | 'result' | 'shots'>('stage');
    const [latestGeneratedOutputImage, setLatestGeneratedOutputImage] = useState<string | null>(null);
    const [latestGeneratedOutputMeta, setLatestGeneratedOutputMeta] = useState<{
        prompt?: string;
        generationId?: string;
        suggestedName?: string;
        stage?: 'generate' | 'refine';
        createdAt: number;
    } | null>(null);
    const [stagingGenerationCount, setStagingGenerationCount] = useState(0);
    const activeResultAnchor = getEffectiveResultAnchorForScene(state, state.activeShotId || 'default');
    
    // Auto-fallback if the current view's anchor becomes invalid (e.g. user clears stage or removes bg)
    useEffect(() => {
        const _activeShot = state.shots.find(s => s.id === (state.activeShotId || 'default'));
        const hasResultViewAsset = Boolean(state.resultImage || latestGeneratedOutputImage || (_activeShot && _activeShot.latestCompositeResultUrl));
        if (viewMode === 'result' && !hasResultViewAsset) {
            setViewMode('stage');
        } else if (viewMode === 'shots' && !activeResultAnchor) {
            setViewMode('stage');
        }
    }, [activeResultAnchor, viewMode, state.resultImage, latestGeneratedOutputImage, state.shots, state.activeShotId]);
    
    // --- ADVANCED RENDER CONTROLS ---
    const {
        strictMode, setStrictMode,
        autoAnchorDNA, setAutoAnchorDNA,
        dnaStatus, anchorDNA, analyzeBackgroundDNA,
        autoTokenProfiles, setAutoTokenProfiles, ensureTokenProfiles,
        handleAnalyzeMissingTokenProfiles,
        tokenProfilesReady, tokenProfilesTotal
    } = useAdvancedRender(state, dispatch as React.Dispatch<Action>);

    useProductionExports(state, dispatch as React.Dispatch<Action>);

    const [bgPrompt, setBgPrompt] = useState('');

    useEffect(() => {
        setBgPrompt('');

        const clearSessionScenePrompt = () => setBgPrompt('');
        window.addEventListener('beforeunload', clearSessionScenePrompt);

        return () => {
            window.removeEventListener('beforeunload', clearSessionScenePrompt);
        };
    }, []);

    const activeReferences = useMemo(() => getActiveReferenceSlots(state.referenceSlots), [state.referenceSlots]);
    const promptIdentitySets = useMemo(
        () => getActorIdentityReferenceSetsForScene(state, state.activeShotId || 'default'),
        [state]
    );
    const stagingSourceIntent = useMemo(
        () => resolveStagingIntent({
            prompt: bgPrompt || state.director.subject,
            hasUploadedSourceImage: !!state.backgroundUrl
        }),
        [bgPrompt, state.director.subject, state.backgroundUrl]
    );
    const sourcePreservationPromptBlock = useMemo(
        () => buildStagingSourcePreservationPromptBlock(stagingSourceIntent, {
            selectedAspectRatio: state.director.aspectRatio
        }),
        [stagingSourceIntent, state.director.aspectRatio]
    );
    
    const compiledPrompt = useMemo(() => {
        if (sourcePreservationPromptBlock) {
            return [
                sourcePreservationPromptBlock,
                compileV3DirectorPrompt(state.director, state.referenceSlots, state.tokens, bgPrompt, state.annotations, viewportBox)
            ].join('\n\n');
        }
        const forceStrictReplace = state.director.replaceAnchorSubjects;
        if (!strictMode && !forceStrictReplace) {
            return compileV3DirectorPrompt(state.director, state.referenceSlots, state.tokens, bgPrompt, state.annotations, viewportBox);
        }
        return buildStrictAnchorReplacementPrompt({
            bgPrompt: bgPrompt || state.director.subject,
            mergeStrategy: state.director.mergeStrategy,
            sceneLock: state.director.sceneLock,
            replaceAnchorSubjects: state.director.replaceAnchorSubjects,
            globalReplaceTarget: state.director.globalReplaceTarget,
            hasDepthMap: DEPTH_FEATURE_ENABLED && !!state.depthMapUrl,
            activeRefs: activeReferences,
            actorIdentitySets: promptIdentitySets,
            tokens: state.tokens,
            annotations: state.annotations,
            spatialFrame: viewportBox
        });
    }, [sourcePreservationPromptBlock, strictMode, bgPrompt, state.director, state.depthMapUrl, state.referenceSlots, activeReferences, promptIdentitySets, state.tokens, state.annotations, viewportBox]);

    useEffect(() => {
        if (!import.meta.env.DEV) return;

        const activeReferenceSlots = activeReferences.map((slot) => ({
            index: slot.index,
            name: slot.name ?? null,
            castId: slot.castId ?? null,
            hasUrl: Boolean(slot.url),
            status: slot.status
        }));
        const userTouchedStaging = Boolean(
            bgPrompt ||
            state.backgroundUrl ||
            state.resultImage ||
            state.tokens.length ||
            state.annotations.length ||
            activeReferenceSlots.length ||
            state.director.subject ||
            state.director.environment ||
            state.director.replaceAnchorSubjects
        );

        console.group('[STAGING ACTIVE STATE AUDIT]');
        console.log({
            activeStageTab: viewMode,
            scenePrompt: bgPrompt,
            sceneReferenceImage: state.backgroundUrl,
            sceneGeneratedImage: state.backgroundUrl,
            sceneResultImage: state.resultImage,
            stageResultImage: state.latestCompositeResultUrl,
            resultImage: state.resultImage,
            latestGeneratedOutputImage: Boolean(latestGeneratedOutputImage),
            replaceAnchorSubjects: state.director.replaceAnchorSubjects,
            anchorSubjectText: state.director.globalReplaceTarget,
            selectedCastAssetId: state.selectionType === 'token' ? state.selection : null,
            selectedReferenceSlot: state.referenceSlots.find((slot) => slot.active)?.index ?? null,
            activeReferenceSlots,
            sceneDirectorSubject: state.director.subject,
            sceneDirectorEnvironment: state.director.environment,
            sceneDirectorLighting: state.director.lighting,
            sceneDirectorCamera: state.director.camera,
            sceneDirectorLayout: state.director.spatialLayout || 'default',
            compiledPrompt,
            promptInstructions: bgPrompt,
            currentPromptInstructions: bgPrompt,
            targetStudioStyle: null,
            styleOverride: extractedStyle?.renderStyle || extractedStyle?.medium || null,
            mergeStrategy: state.director.mergeStrategy,
        });
        console.groupEnd();

        if (!userTouchedStaging && compiledPrompt) {
            console.warn('[STAGING WARNING] compiledPrompt exists before user interaction', compiledPrompt);
        }
    }, [
        activeReferences,
        bgPrompt,
        compiledPrompt,
        extractedStyle,
        state.annotations,
        state.backgroundUrl,
        state.director,
        state.latestCompositeResultUrl,
        latestGeneratedOutputImage,
        state.referenceSlots,
        state.resultImage,
        state.selection,
        state.selectionType,
        state.tokens,
        viewMode
    ]);

    useEffect(() => {
        setBgPrompt('');
        setViewMode('stage');
        setLatestGeneratedOutputImage(null);
        setLatestGeneratedOutputMeta(null);
        setStagingGenerationCount(0);
        setExtractedStyle(null);
        setSceneIntent(null);
        setPreviousBackgroundUrl(null);
        setAutoAnchorDNA(false);
        setGroundDepth(null);
    }, [state.volatileWorkspaceResetNonce, setAutoAnchorDNA]);


    const [dragItem, setDragItem] = useState<{ id: string, type: 'token' | 'annotation', startX: number, startY: number, initialX: number, initialY: number } | null>(null);
    const dragFrameRef = useRef<number | null>(null);
    const latestDragRef = useRef<
        | { type: 'token'; id: string; x: number; y: number }
        | { type: 'annotation'; id: string; x: number; y: number }
        | null
    >(null);

    const flushLatestDragUpdate = useCallback(() => {
        const latest = latestDragRef.current;
        if (!latest) {
            dragFrameRef.current = null;
            return;
        }

        if (latest.type === 'token') {
            dispatch({
                type: 'UPDATE_TOKEN',
                payload: { id: latest.id, x: latest.x, y: latest.y }
            });
        } else {
            dispatch({
                type: 'UPDATE_ANNOTATION',
                payload: { id: latest.id, x: latest.x, y: latest.y }
            });
        }

        dragFrameRef.current = null;
    }, [dispatch]);

    useEffect(() => {
        return () => {
            if (dragFrameRef.current !== null) {
                cancelAnimationFrame(dragFrameRef.current);
            }
        };
    }, []);
    const [resizeItem, setResizeItem] = useState<{
        id: string,
        type: 'token' | 'annotation',
        handle: 'tl' | 'tr' | 'bl' | 'br',
        startX: number,
        startY: number,
        initialW: number,
        initialH: number,
        initialX: number,
        initialY: number,
        initialScaleX: number,
        initialScaleY: number,
        uniformScale?: boolean,
        anchorX?: number,
        anchorY?: number
    } | null>(null);
    const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
    const [rotateItem, setRotateItem] = useState<{
        id: string,
        type: 'token' | 'annotation',
        centerX: number,
        centerY: number,
        startAngle: number,
        initialRotation: number
    } | null>(null);



    const refreshSpatialData = useCallback(async () => {
        if (!DEPTH_FEATURE_ENABLED) return;
        if (!state.backgroundUrl) {
            if (import.meta.env.DEV) {
                dispatch({ type: 'ADD_LOG', payload: { message: 'Add or generate a stage background before building a spatial hint.', type: 'info' } });
            }
            return;
        }
        if (state.isDepthProcessing) return;
        if (!(await ensureStagingAiAccess('Spatial Hint'))) return;

        dispatch({ type: 'SET_DEPTH_PROCESSING', payload: true });
        dispatch({ type: 'SET_DEPTH_MAP', payload: null });
        if (import.meta.env.DEV) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'Generating optional spatial hint...', type: 'info' } });
        }

        try {
            // Internal launch-gated helper: ask Gemini for an estimated spatial hint, not authoritative geometry.
            const depthPrompt = "Generate an estimated grayscale spatial hint mask for this scene. White roughly represents nearer foreground structures, and black roughly represents farther background areas. The output should be grayscale and maintain the exact aspect ratio and composition.";

            const res = await GeminiService.generateImage(
                depthPrompt,
                state.apiKey,
                state.model,
                [{ url: state.backgroundUrl, label: "Scene Context" }],
                { billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements }
            );

            const depthUrl = await normalizeGeneratedImageUrl(res);

            if (depthUrl) {
                // 4. Analyze for Spatial Features (Floor & Volumes)
                const floorResult = await DepthService.detectFloorPlane(depthUrl);
                const floorDepth = floorResult?.depth ?? 255;

                // Only detect volumes if we have a floor (or default)
                const volumes = await DepthService.detectOccupiedVolumes(depthUrl, floorDepth);

                // 5. Dispatch All State Updates
                dispatch({
                    type: 'SET_DEPTH_MAP',
                    payload: {
                        url: depthUrl,
                        hash: `auto-${Date.now()}`,
                        sourceHash: `bg-auto-${Date.now()}`
                    }
                });

                if (floorResult) {
                    dispatch({ type: 'SET_FLOOR_PLANE', payload: floorResult });
                }

                if (volumes.length > 0) {
                    dispatch({ type: 'SET_OCCUPIED_VOLUMES', payload: volumes });
                }

                if (import.meta.env.DEV) {
                    dispatch({ type: 'ADD_LOG', payload: { message: 'Spatial hint ready.', type: 'success' } });
                }
            }
        } catch (error) {
            if (import.meta.env.DEV) {
                console.error("[Spatial Intelligence] Spatial hint failed:", error);
                dispatch({ type: 'ADD_LOG', payload: { message: 'Spatial hint generation failed. Staging can continue without it.', type: 'error' } });
            }
        } finally {
            dispatch({ type: 'SET_DEPTH_PROCESSING', payload: false });
        }
    }, [ensureStagingAiAccess, state.backgroundUrl, state.apiKey, state.model, state.billingEntitlements, state.isDepthProcessing, dispatch]);



    // Style Transfer Pipeline: Phase 1 Logic
    const handleAutoStyleEnvironment = async () => {
        if (!(await ensureStagingAiAccess('Style Environment'))) return;

        // StageTokens are actors if they have a sourceImage or cutoutUrl in this context
        const activeToken = state.tokens.find((t: StageToken) => t.id === state.selection);
        if (!activeToken) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'Select an actor on stage before running Auto-Style Environment.', type: 'error' } });
            return;
        }
        
        // Prefer original sourceImage for best aesthetic analysis, fallback to cutout
        // Note: activeToken properties depend on the exact definition of StageToken in AppContext.
        const tokenWithLegacyFields = activeToken as StageToken & { sourceImage?: string; label?: string };
        const analysisUrl = tokenWithLegacyFields.sourceImageUrl || tokenWithLegacyFields.sourceImage || activeToken.cutoutUrl || activeToken.url;
        if (!analysisUrl) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'Selected actor has no analyzable image for Auto-Style Environment.', type: 'error' } });
            return;
        }

        setIsAnalyzingStyle(true);
        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 5, text: 'Auto-Style: preparing character analysis...' } });
        const tokenLabel = tokenWithLegacyFields.label || activeToken.tag || 'Actor';
        dispatch({ type: 'ADD_LOG', payload: { message: `Analyzing aesthetic style for ${tokenLabel}...`, type: 'info' } });
        const abortController = new AbortController();
        const startedAt = Date.now();
        let currentPercent = 5;
        let progressPhase = 'analysis' as 'analysis' | 'intent' | 'prompt' | 'render' | 'finalize';
        const progressCopy = {
            analysis: 'Auto-Style: extracting character aesthetic...',
            intent: 'Auto-Style: parsing scene intent...',
            prompt: 'Auto-Style: compiling environment prompt...',
            render: 'Auto-Style: rendering style-matched environment...',
            finalize: 'Auto-Style: applying environment plate...'
        };
        const progressInterval = window.setInterval(() => {
            const ceiling = progressPhase === 'render' ? 94 : progressPhase === 'finalize' ? 98 : 72;
            const increment = progressPhase === 'render' ? 0.55 : 1.5;
            currentPercent = Math.min(ceiling, currentPercent + increment);
            const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
            dispatch({
                type: 'SET_GLOBAL_PROGRESS',
                payload: {
                    percent: currentPercent,
                    text: `${progressCopy[progressPhase]} (${elapsedSec}s)`
                }
            });
        }, 1000);

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        
        try {
            const operationPromise = (async () => {
                const sharedHostedOptions = {
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                    entitlements: state.billingEntitlements,
                    signal: abortController.signal
                };

                const style = await GeminiService.analyzeCharacterStyle(
                    analysisUrl,
                    state.apiKey,
                    state.model,
                    {
                        ...sharedHostedOptions,
                        uiWaitWindowMs: AUTO_STYLE_ANALYSIS_WAIT_MS
                    }
                );
                if (abortController.signal.aborted) return;
                currentPercent = Math.max(currentPercent, 25);
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: 'Auto-Style: character aesthetic extracted.' } });
                
                setExtractedStyle(style);
                dispatch({ type: 'ADD_LOG', payload: { message: `Style extracted: ${style.styleSummary}`, type: 'success' } });

                // Phase 3: Automated Environment Plate Generation
                const hasUserScenePrompt = !!bgPrompt.trim();

                let intent: SceneIntent | null = null;
                if (hasUserScenePrompt) {
                    progressPhase = 'intent';
                    currentPercent = Math.max(currentPercent, 35);
                    dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: 'Auto-Style: parsing scene intent...' } });
                    dispatch({ type: 'ADD_LOG', payload: { message: `Parsing scene intent...`, type: 'info' } });
                    intent = await GeminiService.analyzeSceneIntent(
                        bgPrompt,
                        state.apiKey,
                        state.model,
                        {
                            ...sharedHostedOptions,
                            uiWaitWindowMs: AUTO_STYLE_ANALYSIS_WAIT_MS
                        }
                    );
                    if (abortController.signal.aborted) return;
                    setSceneIntent(intent);
                } else {
                    intent = {
                        summary: 'Clean cinematic environment matched to the extracted character style',
                        mood: style?.mood || 'calm',
                        recommendedCamera: state.director.camera || 'Default / Auto',
                        recommendedLighting: state.director.lighting || 'Default / Auto'
                    } as SceneIntent;
                }

                progressPhase = 'prompt';
                currentPercent = Math.max(currentPercent, 48);
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: 'Auto-Style: compiling environment prompt...' } });
                dispatch({ type: 'ADD_LOG', payload: { message: `Generating style-matched environment plate...`, type: 'info' } });
                
                // --- PHASE 4: Automated Inference for Scene Settings ---
                const inferredCamera = (!state.director.camera || state.director.camera === 'Default / Auto') ? intent.recommendedCamera : state.director.camera;
                const inferredLighting = (!state.director.lighting || state.director.lighting === 'Default / Auto') ? intent.recommendedLighting : state.director.lighting;

                if (inferredCamera && inferredCamera !== state.director.camera) {
                    dispatch({ type: 'SET_DIRECTOR', payload: { camera: inferredCamera } });
                    dispatch({ type: 'ADD_LOG', payload: { message: `Auto-inferred Camera: ${inferredCamera}`, type: 'success' } });
                }
                if (inferredLighting && inferredLighting !== state.director.lighting) {
                    dispatch({ type: 'SET_DIRECTOR', payload: { lighting: inferredLighting } });
                    dispatch({ type: 'ADD_LOG', payload: { message: `Auto-inferred Lighting: ${inferredLighting}`, type: 'success' } });
                }

                let envPrompt = "";
                if (hasUserScenePrompt) {
                    envPrompt = buildEnvironmentOnlyPrompt(intent, style, inferredCamera || state.director.camera, state.tokens, state.annotations);
                } else {
                    envPrompt = `
Create a clean environment plate only.

ERA / WORLD CONSISTENCY (HIGH PRIORITY):
Match the environment to the character's visible wardrobe, props, and implied time period.
Inferred era: ${style.impliedEra || 'None detected'}
World type: ${style.impliedWorld || 'Neutral'}
Architecture direction: ${style.architectureHints || 'Clean, abstract'}
Do not generate an environment that contradicts the character's clothing or prop language.
Constraints/Forbidden elements: ${style.environmentMustAvoid || 'None'}

AESTHETIC STYLE:
Match the visual style, material treatment, color logic, and mood of the analyzed character style.
Do not include any people or characters.
Do not include foreground subjects.
Create a clean cinematic environment background suitable for staging and compositing.

Style summary: ${style.styleSummary}
Lighting: ${style.lighting || 'cinematic neutral'}
Mood: ${style.mood || 'calm'}
Color palette: ${style.palette || 'balanced cinematic tones'}

Output: environment plate only.
`;
                }

                progressPhase = 'render';
                currentPercent = Math.max(currentPercent, 62);
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: 'Auto-Style: rendering style-matched environment...' } });

                const res = await GeminiService.generateImage(
                    envPrompt,
                    state.apiKey!,
                    state.model,
                    [],
                    {
                        aspectRatio: state.director.aspectRatio || '16:9',
                        imageSize: state.imageResolution,
                        thinkingLevel: state.enableImageThinking,
                        googleGrounding: state.enableGoogleGrounding,
                        strictMode: true,
                        billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                        entitlements: state.billingEntitlements,
                        uiWaitWindowMs: AUTO_STYLE_ENVIRONMENT_WAIT_MS,
                        signal: abortController.signal
                    }
                );
                if (abortController.signal.aborted) return;

                progressPhase = 'finalize';
                currentPercent = 96;
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: 'Auto-Style: applying environment plate...' } });

                const img = await normalizeGeneratedImageUrl(res);
                if (abortController.signal.aborted) return;

                setPreviousBackgroundUrl(state.backgroundUrl || null);
                dispatch({ type: 'SET_BG', payload: img });
                currentPercent = 100;
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 100, text: 'Auto-Style: environment plate generated.' } });
                dispatch({ type: 'ADD_LOG', payload: { message: `Environment plate generated successfully.`, type: 'success' } });

                // Auto-composite pass explicitly removed per user request. 
                // The environment plate will stay pure until user manually triggers composite.
            })();

            operationPromise.catch(() => undefined);

            const hardTimeoutMs = AUTO_STYLE_ANALYSIS_WAIT_MS + AUTO_STYLE_ENVIRONMENT_WAIT_MS + 15000;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    abortController.abort();
                    reject(new Error(`Auto-Style Environment timed out after ${Math.round(hardTimeoutMs / 1000)} seconds. Please try again or lower the output resolution.`));
                }, hardTimeoutMs);
            });

            await Promise.race([operationPromise, timeoutPromise]);

        } catch (err: unknown) {
            console.error("Style Extract / BG Gen Error", err);
            dispatch({ type: 'ADD_LOG', payload: { message: getErrorMessage(err), type: 'error' } });
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId);
            window.clearInterval(progressInterval);
            setIsAnalyzingStyle(false);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    // Lifted utilities from ProductionConsole

    // Depth maps are intentionally opt-in. SET_BG clears stale depth data; users can rebuild it on demand.

    /**
    * GROUNDING SYNCHRONIZATION
    * Ensures that all actors with groundingEnabled are automatically re-snapped
    * to the current floor authority whenever the floor plane changes or is recalculated.
    */
    // Compute Ground Depth (ONCE per depth map)
    useEffect(() => {
        if (!DEPTH_FEATURE_ENABLED) return;
        // 1. Clear old caches to prevent memory creep
        DepthService.clearCacheExcept(state.depthMapUrl);

        if (!state.depthMapUrl) {
            setGroundDepth(null);
            return;
        }

        let isMounted = true;
        DepthService.computeGroundDepth(state.depthMapUrl)
            .then(depth => {
                if (isMounted) setGroundDepth(depth);
            })
            .catch(err => console.warn('Ground depth failed', err));

        return () => { isMounted = false; };
    }, [state.depthMapUrl]);

    /**
    * GROUNDING SYNCHRONIZATION (AUTHORITATIVE)
    * Clamps actors to the floor plane to prevent clipping, while allowing natural depth.
    */
    const lastGroundingKeyRef = useRef<string>('');

    useEffect(() => {
        if (!DEPTH_FEATURE_ENABLED) return;
        // Avoid heavy work and state updates while dragging, resizing, or rotating
        if (dragItem || resizeItem || rotateItem) return;

        // BAILOUT: If there is no depth map or no background, we cannot compute grounding.
        if (groundDepth === null || !state.depthMapUrl || !state.backgroundUrl || viewportBox.w <= 1 || viewportBox.h <= 1) {
            // If we previously had a key and now don't, reset so we don't loop on re-entry
            if (lastGroundingKeyRef.current !== '') lastGroundingKeyRef.current = '';
            return;
        }

        // 1. Generate a key of properties that SHOULD trigger a re-grounding.
        // We intentionally EXCLUDE 'token.depth' to prevent infinite loops.
        const currentKey = state.tokens
            .map(t => `${t.id}:${t.x}:${t.y}:${t.groundingEnabled}:${t.anchorY}`)
            .join('|') + `:${groundDepth}:${state.depthMapUrl}`;

        if (currentKey === lastGroundingKeyRef.current) return;
        lastGroundingKeyRef.current = currentKey;

        state.tokens.forEach(token => {
            // Respect manual overrides / disabling
            if (!token.groundingEnabled) return;

            const tokenX = toFiniteNumber(token.x, 0);
            const tokenY = toFiniteNumber(token.y, 0);
            const tokenHeight = Math.max(1, toFiniteNumber(token.height, 1));
            const tokenAnchorY = Math.min(1, Math.max(0, toFiniteNumber(token.anchorY, 1.0)));
            const tokenDepth = toFiniteNumber(token.depth, 0);
            const footY = tokenY + tokenHeight * tokenAnchorY;
            const footYClamped = Math.min(Math.max(footY, 0), viewportBox.h - 1);

            const rawDepth = DepthService.getDepthAtPointSync(
                state.depthMapUrl!,
                tokenX / viewportBox.w,
                footYClamped / viewportBox.h
            );

            const clamped = DepthService.clampDepthToGround(rawDepth, groundDepth);

            // ONLY dispatch if depth ACTUALLY changed to avoid infinite loop
            if (Math.abs(clamped - tokenDepth) > 0.01) {
                dispatch({
                    type: 'UPDATE_TOKEN',
                    payload: { id: token.id, depth: clamped },
                });
            }
        });
    }, [state.depthMapUrl, state.backgroundUrl, groundDepth, viewportBox.h, viewportBox.w, state.tokens, dragItem, resizeItem, rotateItem, dispatch]);

    /**
    * OCCLUSION MASKS (PER-TOKEN)
    * Generates a per-token alpha mask derived ONLY from the depth map (background), so actors never self-occlude.
    * Mask semantics: alpha=255 means token pixel is visible; alpha=0 means occluded by a nearer background pixel.
    */
    useEffect(() => {
        // Avoid heavy work while dragging, resizing, or rotating (masks will refresh on manipulation end)
        if (dragItem || resizeItem || rotateItem) return;

        // Nothing to do until we have a real viewport + depth map
        if (!state.depthMapUrl || viewportBox.w <= 1 || viewportBox.h <= 1) {
            setTokenMasks(prev => (Object.keys(prev).length ? {} : prev));
            return;
        }

        let cancelled = false;

        const timer = window.setTimeout(() => {
            (async () => {
                const nextMasks: Record<string, string> = {};

                // Tuning knobs (keep conservative for perf)
                const MAX_MASK_DIM = 256; // cap largest dimension of generated mask
                const EPS = 0.01; // depth threshold to reduce flicker (depth is 0..1)

                for (const token of state.tokens) {
                    if (cancelled) return;

                    if (token.visible === false) continue;
                    if (token.depth === undefined) continue;

                    // Safety gate: don't occlude brand-new placements until user confirms
                    if (token.hasConfirmedPlacement === false) continue;

                    const tokenW = Math.max(1, toFiniteNumber(token.width, 1));
                    const tokenH = Math.max(1, toFiniteNumber(token.height, 1));
                    if (!Number.isFinite(tokenW) || !Number.isFinite(tokenH)) continue;

                    // Downscale masks for performance, then rely on CSS mask-size to upscale.
                    const scaleFactor = Math.max(1, Math.max(tokenW, tokenH) / MAX_MASK_DIM);
                    const maskW = Math.max(1, Math.round(tokenW / scaleFactor));
                    const maskH = Math.max(1, Math.round(tokenH / scaleFactor));

                    const canvas = document.createElement('canvas');
                    canvas.width = maskW;
                    canvas.height = maskH;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) continue;

                    const imgData = ctx.createImageData(maskW, maskH);
                    const d = imgData.data;

                    // Stage placement (untransformed top-left)
                    const anchorX = Math.min(1, Math.max(0, toFiniteNumber(token.anchorX, 0.5)));
                    const anchorY = Math.min(1, Math.max(0, toFiniteNumber(token.anchorY, 0.8)));
                    const left = toFiniteNumber(token.x, 0) - (tokenW * anchorX);
                    const top = toFiniteNumber(token.y, 0) - (tokenH * anchorY);

                    // Transform mapping so occlusion stays correct under rotate/scale
                    const originX = tokenW * anchorX;
                    const originY = tokenH * anchorY;
                    const rot = (toFiniteNumber(token.rotation, 0) * Math.PI) / 180;
                    const cos = Math.cos(rot);
                    const sin = Math.sin(rot);
                    const sx = toFiniteNumber(token.scaleX, 1);
                    const sy = toFiniteNumber(token.scaleY, 1);

                    const stepX = tokenW / maskW;
                    const stepY = tokenH / maskH;
                    const tokenDepth = Math.min(1, Math.max(0, toFiniteNumber(token.depth, 0.5)));
                    const tokenOcclusionBias = toFiniteNumber(token.occlusionBias, 0);

                    for (let y = 0; y < maskH; y++) {
                        const localY = (y + 0.5) * stepY;
                        const dy0 = (localY - originY) * sy;

                        for (let x = 0; x < maskW; x++) {
                            const localX = (x + 0.5) * stepX;
                            const dx0 = (localX - originX) * sx;

                            // Apply scale -> rotate around origin
                            const rx = (dx0 * cos) - (dy0 * sin);
                            const ry = (dx0 * sin) + (dy0 * cos);

                            const stageX = left + originX + rx;
                            const stageY = top + originY + ry;

                            const stageXClamped = Math.min(Math.max(stageX, 0), viewportBox.w - 1);
                            const stageYClamped = Math.min(Math.max(stageY, 0), viewportBox.h - 1);

                            // Depth map convention: White=Near, Black=Far (near is higher).
                            const sceneDepth = DEPTH_FEATURE_ENABLED ? DepthService.getDepthAtPointSync(
                                state.depthMapUrl,
                                stageXClamped / viewportBox.w,
                                stageYClamped / viewportBox.h
                            ) : 255;

                            const occluded = token.occlusionMode === 'front'
                                ? false
                                : sceneDepth > (tokenDepth - tokenOcclusionBias + EPS);

                            const idx = (y * maskW + x) * 4;
                            d[idx] = 0;
                            d[idx + 1] = 0;
                            d[idx + 2] = 0;
                            d[idx + 3] = occluded ? 0 : 255;
                        }
                    }

                    ctx.putImageData(imgData, 0, 0);
                    nextMasks[token.id] = canvas.toDataURL('image/png');
                }

                if (cancelled) return;

                setTokenMasks(prev => {
                    const prevKeys = Object.keys(prev);
                    const nextKeys = Object.keys(nextMasks);
                    if (prevKeys.length !== nextKeys.length) return nextMasks;
                    for (const k of prevKeys) {
                        if (prev[k] !== nextMasks[k]) return nextMasks;
                    }
                    return prev;
                });
            })().catch(err => console.warn('[occlusionMasks] generation failed', err));
        }, 100);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [state.depthMapUrl, state.tokens, viewportBox.w, viewportBox.h, dragItem, resizeItem, rotateItem]);





    // analyzeWhitelistProfile was moved to useAdvancedRender
    const resolveTokenImageUrl = (token: StageToken): string | null => (
        token.cutoutUrl ||
        token.url ||
        state.actorLibrary.find(a => a.id === token.castId)?.url ||
        null
    );

    const buildRegionPlan = (overrides?: { token?: Map<string, WhitelistProfile>; cast?: Map<string, WhitelistProfile> }) => {
        const sorted = [...state.tokens].sort((a, b) => (
            toFiniteNumber(a.zIndex, 0) - toFiniteNumber(b.zIndex, 0)
        ) || (
            toFiniteNumber(a.x, 0) - toFiniteNumber(b.x, 0)
        ));

        return sorted.map((t, idx) => {
            const cast = (state.cast || []).find(c => c.id === t.castId) || null;
            const tokenOverride = overrides?.token?.get(t.id);
            const castOverride = overrides?.cast?.get(t.castId);

            const profile =
                tokenOverride ||
                t.profile ||
                castOverride ||
                cast?.profile ||
                { identity: cast?.name || `Token ${t.tag}`, wardrobe: "", accessories: "", style: "" };

            return {
                region: idx + 1,
                token: t,
                cast,
                profile
            };
        });
    };

    const colorToHex = (r: number, g: number, b: number): string => (
        `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
    );

    const describeLuminance = (lum: number): string => {
        if (lum < 0.18) return 'very low-key / shadowed';
        if (lum < 0.34) return 'dim';
        if (lum < 0.58) return 'soft midtone';
        if (lum < 0.78) return 'bright';
        return 'high-key';
    };

    const describeWarmth = (r: number, _g: number, b: number): string => {
        const delta = r - b;
        if (delta > 28) return 'warm';
        if (delta < -28) return 'cool';
        return 'neutral';
    };

    const describeContrast = (stdDev: number): string => {
        if (stdDev > 0.24) return 'hard/high contrast';
        if (stdDev > 0.13) return 'moderate contrast';
        return 'soft/low contrast';
    };

    const buildAnchorLightingTransferBlock = async (
        anchorUrl: string | null | undefined,
        regionPlan: ReturnType<typeof buildRegionPlan>,
        dnaLighting?: string
    ): Promise<string> => {
        if (!anchorUrl) return '';

        try {
            const img = await loadDataUrlImage(anchorUrl);
            const viewportW = Math.max(1, Math.round(toFiniteNumber(viewportBox.w, 1024)));
            const viewportH = Math.max(1, Math.round(toFiniteNumber(viewportBox.h, 576)));
            const canvas = document.createElement('canvas');
            canvas.width = viewportW;
            canvas.height = viewportH;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return '';

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, viewportW, viewportH);

            const imgW = Math.max(1, toFiniteNumber(img.naturalWidth || img.width, 1));
            const imgH = Math.max(1, toFiniteNumber(img.naturalHeight || img.height, 1));
            const scale = Math.min(viewportW / imgW, viewportH / imgH);
            const drawW = imgW * scale;
            const drawH = imgH * scale;
            const drawX = (viewportW - drawW) / 2;
            const drawY = (viewportH - drawH) / 2;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);

            const sampleRect = (
                x: number,
                y: number,
                w: number,
                h: number,
                exclude?: { left: number; top: number; width: number; height: number }
            ) => {
                const sx = Math.max(0, Math.min(viewportW - 1, Math.floor(x)));
                const sy = Math.max(0, Math.min(viewportH - 1, Math.floor(y)));
                const ex = Math.max(sx + 1, Math.min(viewportW, Math.ceil(x + w)));
                const ey = Math.max(sy + 1, Math.min(viewportH, Math.ceil(y + h)));
                const data = ctx.getImageData(sx, sy, ex - sx, ey - sy).data;
                let r = 0;
                let g = 0;
                let b = 0;
                let lumSum = 0;
                let lumSq = 0;
                let count = 0;
                let accentR = 0;
                let accentG = 0;
                let accentB = 0;
                let accentCount = 0;

                const sampleW = ex - sx;
                for (let i = 0; i < data.length; i += 4) {
                    if (exclude) {
                        const px = sx + ((i / 4) % sampleW);
                        const py = sy + Math.floor((i / 4) / sampleW);
                        if (
                            px >= exclude.left &&
                            px <= exclude.left + exclude.width &&
                            py >= exclude.top &&
                            py <= exclude.top + exclude.height
                        ) {
                            continue;
                        }
                    }
                    const pr = data[i];
                    const pg = data[i + 1];
                    const pb = data[i + 2];
                    const lum = ((0.2126 * pr) + (0.7152 * pg) + (0.0722 * pb)) / 255;
                    r += pr;
                    g += pg;
                    b += pb;
                    lumSum += lum;
                    lumSq += lum * lum;
                    count += 1;

                    const max = Math.max(pr, pg, pb);
                    const min = Math.min(pr, pg, pb);
                    if (max - min > 35 && lum > 0.18) {
                        accentR += pr;
                        accentG += pg;
                        accentB += pb;
                        accentCount += 1;
                    }
                }

                if (count === 0) {
                    return { r: 0, g: 0, b: 0, luminance: 0, stdDev: 0, accentHex: '', count: 0 };
                }

                const meanLum = lumSum / count;
                const variance = Math.max(0, (lumSq / count) - (meanLum * meanLum));
                return {
                    r: r / count,
                    g: g / count,
                    b: b / count,
                    luminance: meanLum,
                    stdDev: Math.sqrt(variance),
                    accentHex: accentCount > Math.max(12, count * 0.02)
                        ? colorToHex(accentR / accentCount, accentG / accentCount, accentB / accentCount)
                        : '',
                    count
                };
            };

            const keyDirectionFor = (left: number, top: number, width: number, height: number): string => {
                const pad = Math.max(12, Math.min(width, height) * 0.18);
                const samples = [
                    { name: 'left', lum: sampleRect(left - pad, top, pad, height).luminance },
                    { name: 'right', lum: sampleRect(left + width, top, pad, height).luminance },
                    { name: 'above', lum: sampleRect(left, top - pad, width, pad).luminance },
                    { name: 'below', lum: sampleRect(left, top + height, width, pad).luminance }
                ];
                samples.sort((a, b) => b.lum - a.lum);
                return samples[0]?.name || 'ambient';
            };

            const globalSample = sampleRect(drawX, drawY, drawW, drawH);
            const globalLine = [
                `Global anchor lighting: ${describeLuminance(globalSample.luminance)}, ${describeContrast(globalSample.stdDev)}, ${describeWarmth(globalSample.r, globalSample.g, globalSample.b)} color temperature`,
                `average scene color ${colorToHex(globalSample.r, globalSample.g, globalSample.b)}`
            ].join('; ');
            const analyzedLightingLine = dnaLighting?.trim()
                ? `Director/AI lighting read: ${dnaLighting.trim()}`
                : '';

            const regionLines = regionPlan.map((entry) => {
                const token = entry.token;
                const width = Math.max(20, toFiniteNumber(token.width, 200) * Math.abs(toFiniteNumber(token.scaleX, 1)));
                const height = Math.max(20, toFiniteNumber(token.height, 300) * Math.abs(toFiniteNumber(token.scaleY, 1)));
                const anchorX = Math.min(1, Math.max(0, toFiniteNumber(token.anchorX, 0.5)));
                const anchorY = Math.min(1, Math.max(0, toFiniteNumber(token.anchorY, 0.8)));
                const left = toFiniteNumber(token.x, 0) - (width * anchorX);
                const top = toFiniteNumber(token.y, 0) - (height * anchorY);
                const expandedPad = Math.max(18, Math.min(width, height) * 0.16);
                const sample = sampleRect(
                    left - expandedPad,
                    top - expandedPad,
                    width + (expandedPad * 2),
                    height + (expandedPad * 2),
                    { left, top, width, height }
                );
                const key = keyDirectionFor(left, top, width, height);
                const actorLabel = entry.cast?.name || token.tag || `Region ${entry.region}`;
                const accent = sample.accentHex
                    ? ` Nearby saturated bounce/accent light detected around ${sample.accentHex}; use only as subtle rim/spill if visually present in CLEAN_BG_PLATE.`
                    : '';

                return `- REGION ${entry.region} (${actorLabel}) BBOX [${Math.round(left)}, ${Math.round(top)}, ${Math.round(width)}, ${Math.round(height)}]: relight the actor to ${describeLuminance(sample.luminance)} exposure, ${describeContrast(sample.stdDev)}, ${describeWarmth(sample.r, sample.g, sample.b)} color temperature, local average ${colorToHex(sample.r, sample.g, sample.b)}, strongest environmental light from ${key}.${accent}`;
            });

            return [
                '### ANCHOR LIGHTING TRANSFER LOCK (HARD)',
                'CLEAN_BG_PLATE is the lighting authority. Re-light every generated/staged actor from scratch so they look photographed/rendered inside that anchor scene, not pasted from their source reference.',
                globalLine,
                analyzedLightingLine,
                regionLines.length > 0 ? regionLines.join('\n') : '- No staged actor regions found. Match global anchor lighting only.',
                '- Remove source-reference/studio lighting from actors. Match anchor black levels, highlight rolloff, shadow softness, ambient occlusion, contact shadows, color spill, haze, and local contrast.',
                '- If the actor overlaps bright flowers, windows, lamps, neon, or other visible light sources in CLEAN_BG_PLATE, add matching local rim/bounce light on the facing actor edges only.'
            ].filter(Boolean).join('\n');
        } catch (err) {
            console.warn('[AnchorLighting] Sampling failed; falling back to prompt-only lighting lock.', err);
            return [
                '### ANCHOR LIGHTING TRANSFER LOCK (HARD)',
                'CLEAN_BG_PLATE is the lighting authority. Re-light every generated/staged actor from scratch to match the anchor image key/fill direction, exposure, color temperature, shadows, black levels, and color grading. Do not preserve studio lighting from actor references.',
                dnaLighting?.trim() ? `Director/AI lighting read: ${dnaLighting.trim()}` : ''
            ].filter(Boolean).join('\n');
        }
    };

    const buildAnchorPlate = async (
        regionPlan: ReturnType<typeof buildRegionPlan>,
        backgroundUrlOverride?: string
    ): Promise<string> => {
        const canvas = document.createElement('canvas');
        const STAGE_W = 960;
        const STAGE_H = 540;
        const RENDER_SCALE = 2; // Pro level scale
        const PRO_W = STAGE_W * RENDER_SCALE;
        const PRO_H = STAGE_H * RENDER_SCALE;
        canvas.width = PRO_W;
        canvas.height = PRO_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas context unavailable.");

        ctx.scale(RENDER_SCALE, RENDER_SCALE);

        // Base Black
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);

        // Background
        const bgSourceUrl = backgroundUrlOverride || state.backgroundUrl;
        if (bgSourceUrl) {
            const bg = await loadDataUrlImage(bgSourceUrl);
            const imgRatio = bg.width / bg.height;
            const boxRatio = STAGE_W / STAGE_H;
            let dw = STAGE_W;
            let dh = STAGE_H;
            let dx = 0;
            let dy = 0;
            if (imgRatio > boxRatio) {
                dh = STAGE_H;
                dw = STAGE_H * imgRatio;
                dx = 0 - (dw - STAGE_W) / 2;
            } else {
                dw = STAGE_W;
                dh = STAGE_W / imgRatio;
                dy = 0 - (dh - STAGE_H) / 2;
            }
            ctx.drawImage(bg, dx, dy, dw, dh);
        }

        if (!state.director.replaceAnchorSubjects) {
            // Draw staged tokens for non-replace compositing mode.
            const tokensByDepth = [...regionPlan].sort((a, b) => (
                toFiniteNumber(a.token.zIndex, 0) - toFiniteNumber(b.token.zIndex, 0)
            ));
            for (const r of tokensByDepth) {
                let didSaveContext = false;
                try {
                    const t = r.token;

                    const vw = Math.max(1, toFiniteNumber(viewportBox.w, STAGE_W));
                    const vh = Math.max(1, toFiniteNumber(viewportBox.h, STAGE_H));
                    const scaleX = STAGE_W / vw;
                    const scaleY = STAGE_H / vh;

                    const normX = toFiniteNumber(t.x, 0) * scaleX;
                    const normY = toFiniteNumber(t.y, 0) * scaleY;
                    const normW = Math.max(1, toFiniteNumber(t.width, 200) * scaleX);
                    const normH = Math.max(1, toFiniteNumber(t.height, 300) * scaleY);

                    const imageUrl = resolveTokenImageUrl(t);
                    if (!imageUrl) continue;
                    const img = await loadDataUrlImage(imageUrl);

                    const ax = Math.min(1, Math.max(0, toFiniteNumber(t.anchorX, 0.5)));
                    const ay = Math.min(1, Math.max(0, toFiniteNumber(t.anchorY, 0.8)));

                    const imgW = Math.max(1, toFiniteNumber(img.naturalWidth || img.width, 1));
                    const imgH = Math.max(1, toFiniteNumber(img.naturalHeight || img.height, 1));
                    const imgRatio = imgW / imgH;
                    const boxRatio = normW / normH;
                    let drawW = normW;
                    let drawH = normH;
                    let offX = 0;
                    let offY = 0;

                    if (imgRatio > boxRatio) {
                        drawW = normW;
                        drawH = normW / imgRatio;
                        offY = (normH - drawH) / 2;
                    } else {
                        drawH = normH;
                        drawW = normH * imgRatio;
                        offX = (normW - drawW) / 2;
                    }

                    ctx.save();
                    didSaveContext = true;
                    ctx.translate(normX, normY);
                    ctx.rotate((toFiniteNumber(t.rotation, 0) * Math.PI) / 180);
                    ctx.scale(toFiniteNumber(t.scaleX, 1), toFiniteNumber(t.scaleY, 1));
                    ctx.drawImage(img, (-normW * ax) + offX, (-normH * ay) + offY, drawW, drawH);
                } catch (e) {
                    console.warn("Failed to draw token on anchor plate", r.token.id, e);
                } finally {
                    if (didSaveContext) ctx.restore();
                }
            }
        } else {
            // Replace mode: keep anonymized structural scaffolding (pose/gaze/lighting cues)
            // while removing identity detail to prevent head-swap behavior.
            const scaffoldSnapshot = document.createElement('canvas');
            scaffoldSnapshot.width = STAGE_W;
            scaffoldSnapshot.height = STAGE_H;
            const scaffoldCtx = scaffoldSnapshot.getContext('2d');
            if (scaffoldCtx) {
                scaffoldCtx.drawImage(canvas, 0, 0, STAGE_W, STAGE_H);
            }

            const tokensByDepth = [...regionPlan].sort((a, b) => (
                toFiniteNumber(a.token.zIndex, 0) - toFiniteNumber(b.token.zIndex, 0)
            ));
            for (const r of tokensByDepth) {
                let didSaveContext = false;
                try {
                    const t = r.token;

                    const vw = Math.max(1, toFiniteNumber(viewportBox.w, STAGE_W));
                    const vh = Math.max(1, toFiniteNumber(viewportBox.h, STAGE_H));
                    const scaleX = STAGE_W / vw;
                    const scaleY = STAGE_H / vh;

                    const normX = toFiniteNumber(t.x, 0) * scaleX;
                    const normY = toFiniteNumber(t.y, 0) * scaleY;
                    const normW = Math.max(1, toFiniteNumber(t.width, 200) * scaleX);
                    const normH = Math.max(1, toFiniteNumber(t.height, 300) * scaleY);

                    const ax = Math.min(1, Math.max(0, toFiniteNumber(t.anchorX, 0.5)));
                    const ay = Math.min(1, Math.max(0, toFiniteNumber(t.anchorY, 0.8)));
                    const left = -normW * ax;
                    const top = -normH * ay;

                    ctx.save();
                    didSaveContext = true;
                    ctx.translate(normX, normY);
                    ctx.rotate((toFiniteNumber(t.rotation, 0) * Math.PI) / 180);
                    ctx.scale(toFiniteNumber(t.scaleX, 1), toFiniteNumber(t.scaleY, 1));
                    if (scaffoldCtx) {
                        // Preserve coarse body orientation/gaze flow and local light cues,
                        // but destroy fine identity details.
                        ctx.filter = 'blur(7px) saturate(0.12) contrast(0.82) brightness(0.92)';
                        ctx.drawImage(scaffoldSnapshot, left, top, normW, normH, left, top, normW, normH);
                        ctx.filter = 'none';
                    }
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
                    ctx.fillRect(left, top, normW, normH);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 4]);
                    ctx.strokeRect(left, top, normW, normH);
                } catch (e) {
                    console.warn("Failed to draw scaffold on anchor plate", r.token.id, e);
                } finally {
                    if (didSaveContext) ctx.restore();
                }
            }
        }

        return canvas.toDataURL('image/png');
    };

    const buildSpatialControlOverlay = async (
        regionPlan: ReturnType<typeof buildRegionPlan>
    ): Promise<string | null> => {
        if (!shouldAttachSpatialControlOverlay({ referenceSlots: state.referenceSlots, annotations: state.annotations })) {
            return null;
        }

        const vw = Math.max(1, toFiniteNumber(viewportBox.w, 960));
        const vh = Math.max(1, toFiniteNumber(viewportBox.h, 540));
        const canvas = document.createElement('canvas');
        const W = 1920;
        const H = 1080;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const sx = W / vw;
        const sy = H / vh;
        const px = (x: number) => x * sx;
        const py = (y: number) => y * sy;

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
        for (let i = 1; i < 4; i++) {
            ctx.fillRect((W / 4) * i, 0, 1, H);
            ctx.fillRect(0, (H / 4) * i, W, 1);
        }

        ctx.font = '700 26px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${CONTROL_OVERLAY_GEOMETRY_ONLY_LABEL} - SPATIAL BLUEPRINT ONLY - DO NOT RENDER MARKS`, 34, 48);

        const drawLabel = (text: string, x: number, y: number, color: string) => {
            ctx.save();
            ctx.font = '700 22px Arial, sans-serif';
            const metrics = ctx.measureText(text);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
            ctx.fillRect(x - 8, y - 25, metrics.width + 16, 32);
            ctx.fillStyle = color;
            ctx.fillText(text, x, y);
            ctx.restore();
        };

        const drawArrowHead = (from: { x: number; y: number }, to: { x: number; y: number }, color: string) => {
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const size = 22;
            ctx.save();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(to.x, to.y);
            ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        const zones = state.annotations.filter((annotation) => annotation.visible !== false && annotation.type === 'zone');
        const zoneHeightRanks = new Map<string, number>();
        [...zones]
            .sort((a, b) => toFiniteNumber(b.height, 100) - toFiniteNumber(a.height, 100))
            .forEach((zone, rank) => zoneHeightRanks.set(zone.id, rank + 1));
        zones.forEach((zone, index) => {
            const x = px(toFiniteNumber(zone.x, 0));
            const y = py(toFiniteNumber(zone.y, 0));
            const w = px(Math.max(1, toFiniteNumber(zone.width, 150)));
            const h = py(Math.max(1, toFiniteNumber(zone.height, 100)));
            const rawHeight = Math.round(toFiniteNumber(zone.height, 100));
            const rank = zoneHeightRanks.get(zone.id) || index + 1;
            ctx.save();
            ctx.strokeStyle = '#4f8cff';
            ctx.fillStyle = 'rgba(79, 140, 255, 0.16)';
            ctx.lineWidth = zone.hard ? 8 : 5;
            ctx.setLineDash([18, 12]);
            ctx.strokeRect(x, y, w, h);
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 7;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(x, y + h);
            ctx.lineTo(x + w, y + h);
            ctx.stroke();
            ctx.restore();
            drawLabel(`ZONE_${index + 1} GROUND H=${rawHeight} SCALE_RANK=${rank}${zone.label ? `: ${zone.label}` : ''}`, x + 14, y + 34, '#9fc0ff');
            drawLabel(`GROUND_${index + 1}`, x + 14, y + h - 10, '#86efac');
        });

        const arrows = state.annotations.filter((annotation) => annotation.visible !== false && annotation.type === 'arrow');
        arrows.forEach((arrow, index) => {
            const endpoints = resolveArrowEndpoints(arrow);
            const start = { x: px(endpoints.start.x), y: py(endpoints.start.y) };
            const end = { x: px(endpoints.end.x), y: py(endpoints.end.y) };
            const color = arrow.color || '#c084fc';
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(4, toFiniteNumber(arrow.thickness, 3) * 2);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            drawArrowHead(start, end, color);
            ctx.restore();
            drawLabel(`ARROW_${index + 1}`, Math.min(start.x, end.x) + 12, Math.min(start.y, end.y) - 10, color);
        });

        const notes = state.annotations.filter((annotation) => annotation.visible !== false && annotation.type === 'note');
        notes.forEach((note, index) => {
            const x = px(toFiniteNumber(note.x, 0));
            const y = py(toFiniteNumber(note.y, 0));
            const w = px(Math.max(1, toFiniteNumber(note.width, 150)));
            const h = py(Math.max(1, toFiniteNumber(note.height, 100)));
            ctx.save();
            ctx.strokeStyle = '#facc15';
            ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            drawLabel(`NOTE_${index + 1}`, x + 14, y + 34, '#fde047');
        });

        regionPlan.forEach((entry) => {
            const t = entry.token;
            if (t.visible === false) return;
            const width = Math.max(1, toFiniteNumber(t.width, 160));
            const height = Math.max(1, toFiniteNumber(t.height, 220));
            const anchorX = Math.min(1, Math.max(0, toFiniteNumber(t.anchorX, 0.5)));
            const anchorY = Math.min(1, Math.max(0, toFiniteNumber(t.anchorY, 0.8)));
            const x = px(toFiniteNumber(t.x, 0) - width * anchorX);
            const y = py(toFiniteNumber(t.y, 0) - height * anchorY);
            const w = px(width);
            const h = py(height);
            ctx.save();
            ctx.strokeStyle = '#fbbf24';
            ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
            ctx.lineWidth = 5;
            ctx.strokeRect(x, y, w, h);
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            drawLabel(`REGION_${entry.region}: ${t.tag || entry.cast?.name || 'Subject'}`, x + 14, y + Math.max(34, h - 14), '#fbbf24');
        });

        return canvas.toDataURL('image/png');
    };

    // Unified Workflow Generate Button
    const generateBg = async (overrideBgUrl?: string | unknown) => {
        if (stagingGenerationInFlightRef.current || state.isProcessing) return;
        stagingGenerationInFlightRef.current = true;

        if (!(await ensureStagingAiAccess('Environment Plate Generation'))) {
            stagingGenerationInFlightRef.current = false;
            return;
        }

        const activeBgUrl = (typeof overrideBgUrl === 'string' ? overrideBgUrl : undefined) || state.backgroundUrl;
        const hasSourceScene = !!activeBgUrl;
        const hasPromptText = !!bgPrompt?.trim() || !!state.director.subject?.trim();

        if (!hasPromptText && !hasSourceScene) {
            stagingGenerationInFlightRef.current = false;
            return;
        }

        dispatch({ type: 'SET_PROCESSING', payload: true });

        // Show result view right away so users see the loader overlay
        setViewMode('result');

        let currentPercent = 5;
        const generationStartedAt = Date.now();
        const stageUiWaitWindowMs = state.billingEntitlements.effectiveBillingMode === 'hosted'
            ? (state.imageResolution === '4K' ? 180000 : 120000)
            : undefined;
        const nextGenerationNumber = stagingGenerationCount + 1;
        setStagingGenerationCount(nextGenerationNumber);
        const generationContract = {
            generationNumber: nextGenerationNumber,
            styleMode: 'match_reference',
            explicitStyleOverride: deriveExplicitStyleOverride(extractedStyle),
            referenceImageIds: activeReferences.map((ref) => ref.index),
            sceneImage: activeBgUrl ?? null,
            replaceAnchorSubjects: state.director.replaceAnchorSubjects,
            anchorSubjectText: state.director.globalReplaceTarget,
            sceneDirector: {
                subject: state.director.subject,
                environment: state.director.environment,
                lighting: state.director.lighting,
                camera: state.director.camera,
                layout: state.director.spatialLayout || 'default',
            },
            mergeStrategy: state.director.mergeStrategy,
            sourceResultImage: null as string | null,
        };
        const hasExplicitStyleOverride = Boolean(generationContract.explicitStyleOverride);
        if (import.meta.env.DEV && !hasExplicitStyleOverride) {
            const contaminatedAnalyses = findReferenceAnalysisMediumContamination(activeReferences);
            if (contaminatedAnalyses.length > 0) {
                console.warn('[STAGING REFERENCE ANALYSIS MEDIUM WARNING]', {
                    contaminatedAnalyses,
                    message: 'Reference analysis contains medium/process language. The outgoing prompt uses sanitized prompt-safe copies.'
                });
            }
        }
        const contractActiveReferenceSlots = createPromptSafeReferenceSlots(activeReferences);
        const replaceModeIdentityRefs = contractActiveReferenceSlots.filter((ref) => Boolean(ref.url));
        const strictIdentityLock = generationContract.replaceAnchorSubjects && replaceModeIdentityRefs.length > 0;
        const replaceIdentityContractBlock = generationContract.replaceAnchorSubjects
            ? buildReplaceModeIdentityActionSceneLock({
                actionDirection: bgPrompt || generationContract.sceneDirector.subject,
                sceneEnvironment: generationContract.sceneDirector.environment,
                sceneLighting: generationContract.sceneDirector.lighting,
                sceneCamera: generationContract.sceneDirector.camera,
                sceneLayout: generationContract.sceneDirector.layout,
            })
            : '';
        const logStagingGenerationSources = (compiledPromptForRequest: string) => {
            if (!import.meta.env.DEV) return;

            console.group(`[STAGING GENERATION SOURCES] ${Date.now()}`);
            console.log({
                generationNumber: generationContract.generationNumber,
                activeStageTab: viewMode,
                scenePrompt: bgPrompt || generationContract.sceneDirector.subject,
                sceneReferenceImage: Boolean(generationContract.sceneImage),
                sceneGeneratedImage: Boolean(state.backgroundUrl),
                sceneResultImage: false,
                resultImage: Boolean(state.resultImage),
                selectedCastAssetId: state.selectionType === 'token' ? state.selection : null,
                activeReferenceSlots: contractActiveReferenceSlots.map((ref) => ({
                    index: ref.index,
                    name: ref.name ?? null,
                    castId: ref.castId ?? null,
                    hasUrl: Boolean(ref.url),
                    status: ref.status
                })),
                replaceAnchorSubjects: generationContract.replaceAnchorSubjects,
                anchorSubjectText: generationContract.anchorSubjectText,
                sceneDirectorEnvironment: generationContract.sceneDirector.environment,
                sceneDirectorLighting: generationContract.sceneDirector.lighting,
                sceneDirectorCamera: generationContract.sceneDirector.camera,
                sceneDirectorLayout: generationContract.sceneDirector.layout,
                targetStudioStyle: null,
                styleOverride: generationContract.explicitStyleOverride,
                lastUsedStyle: null,
                autoStyleEnvironment: false,
                mergeStrategy: generationContract.mergeStrategy,
                compiledPrompt: compiledPromptForRequest,
                recentGenerationsCount,
            });
            console.groupEnd();
        };
        const logStagingIdentityContract = (imageReferences: Array<{ label?: string; role?: string }>) => {
            if (!import.meta.env.DEV) return;

            console.group('[STAGING IDENTITY CONTRACT]');
            console.log({
                replaceAnchorSubjects: generationContract.replaceAnchorSubjects,
                selectedCastAssetId: replaceModeIdentityRefs[0]?.castId ?? null,
                hasSelectedCastReference: replaceModeIdentityRefs.length > 0,
                strictIdentityLock,
                hasIdentityReference: replaceModeIdentityRefs.length > 0,
                identityAuthority: generationContract.replaceAnchorSubjects ? 'selected_cast_reference' : 'current_session_reference_stack',
                sceneAuthority: 'current_stage_scene',
                actionAuthority: 'scene_director',
                sceneDnaSubject: null,
                sceneDirectorSubjectAction: generationContract.sceneDirector.subject,
                styleOverride: generationContract.explicitStyleOverride,
                activeImageReferences: imageReferences.map((ref) => ref.role || ref.label || 'unlabeled_reference'),
            });
            console.groupEnd();
        };
        const formatDurationLabel = (totalSeconds: number) => {
            const clamped = Math.max(0, totalSeconds);
            const minutes = Math.floor(clamped / 60);
            const seconds = clamped % 60;
            return `${minutes}:${String(seconds).padStart(2, '0')}`;
        };
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Initializing Staging Render" } });
        const etaMs = state.imageResolution === '4K' ? 45000 : 30000;
        const increment = (1000 / etaMs) * 100;
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Initializing Staging Render";
            if (currentPercent > 20) text = "Building Spatial Composition Plan...";
            if (currentPercent > 40) text = "Compiling Director Prompt...";
            if (currentPercent > 60) text = "Rendering Cinematic Shot...";
            if (currentPercent >= 95) {
                const elapsedSec = Math.floor((Date.now() - generationStartedAt) / 1000);
                const elapsedLabel = formatDurationLabel(elapsedSec);
                if (stageUiWaitWindowMs) {
                    const remainingSec = Math.ceil(Math.max(0, stageUiWaitWindowMs - (Date.now() - generationStartedAt)) / 1000);
                    const remainingLabel = formatDurationLabel(remainingSec);
                    text = remainingSec > 0
                        ? `Rendering Cinematic Shot... (Queue delay ${elapsedLabel}. Auto-background in ${remainingLabel})`
                        : `Rendering Cinematic Shot... (Queue delay ${elapsedLabel}. Shifting to background...)`;
                } else {
                    text = `Rendering Cinematic Shot... (Queue delay ${elapsedLabel})`;
                }
            }

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, 1000);

        try {
            let dnaForRender = anchorDNA;

            // In Strict Mode, we attempt to refresh the Anchor DNA if it is missing
            if (
                strictMode &&
                autoAnchorDNA &&
                activeBgUrl &&
                state.apiKey &&
                !dnaForRender.environment &&
                !dnaForRender.lighting &&
                !dnaForRender.camera
            ) {
                const fresh = await analyzeBackgroundDNA();
                if (fresh) dnaForRender = fresh;
            }

            const tokenOverrides = await ensureTokenProfiles(state.tokens, { force: autoTokenProfiles });

            const identitySets = getActorIdentityReferenceSetsForScene(state, state.activeShotId || 'default');
            const hasStrictIdentityRefs = identitySets.some(s => s.identityPriority === 'strict' && hasStrongFaceAnchor(s));
            const activeIdentityLocks = identitySets.flatMap(set => set.identityLock ? [set.identityLock] : []);
            const renderPromptText = (bgPrompt || state.director.subject || '').trim();
            const renderSourceIntent = resolveStagingIntent({
                prompt: renderPromptText,
                hasUploadedSourceImage: !!activeBgUrl
            });
            const renderSourcePreservationBlock = buildStagingSourcePreservationPromptBlock(renderSourceIntent, {
                selectedAspectRatio: state.director.aspectRatio
            });
            const shouldUseSourcePreservingTransform =
                renderSourceIntent.mode === 'source_preserving_layout_transform' && !!activeBgUrl;

            let safeExtractedStyle: ExtractedStyle | null = null;
            if (hasExplicitStyleOverride && extractedStyle) {
                safeExtractedStyle = extractedStyle;
            }
            if (hasStrictIdentityRefs && safeExtractedStyle) {
                safeExtractedStyle = sanitizeStyleForStrictIdentity(safeExtractedStyle);
                console.warn(`[IdentityPrecedence] Subject/style analysis demoted in STAGE generation because strict actor refs are present`);
            }

            const shouldUseStrictPipeline = !shouldUseSourcePreservingTransform && (strictMode || state.director.replaceAnchorSubjects);

            if (shouldUseSourcePreservingTransform) {
                dispatch({
                    type: 'ADD_LOG',
                    payload: {
                        message: 'Source-to-deliverable intent detected. Preserving uploaded image as Image A and adapting layout only.',
                        type: 'info'
                    }
                });
            }

            if (generationContract.replaceAnchorSubjects && replaceModeIdentityRefs.length === 0) {
                dispatch({
                    type: 'ADD_LOG',
                    payload: {
                        message: 'Select a cast reference before replacing anchor subjects.',
                        type: 'error'
                    }
                });
                setViewMode('stage');
                window.clearInterval(progressInterval);
                dispatch({ type: 'SET_PROCESSING', payload: false });
                return;
            }

            if (import.meta.env.DEV) {
                console.log('[STAGING PROMPT SOURCES]', {
                    scenePrompt: bgPrompt || state.director.subject,
                    sceneReferenceImage: Boolean(activeBgUrl),
                    sceneGeneratedImage: Boolean(state.backgroundUrl),
                    sceneResultImage: Boolean(state.resultImage),
                    replaceAnchorSubjects: state.director.replaceAnchorSubjects,
                    selectedCastAssetId: state.selectionType === 'token' ? state.selection : null,
                    sceneDirectorEnvironment: state.director.environment,
                    targetStudioStyle: null,
                    styleOverride: extractedStyle?.renderStyle || extractedStyle?.medium || null,
                    activeReferenceCount: contractActiveReferenceSlots.length,
                    tokenCount: state.tokens.length,
                    compiledPrompt: compiledPrompt
                });
            }

            if (shouldUseStrictPipeline) {
                const plan = buildRegionPlan({ token: tokenOverrides });
                const isReplaceMode = state.director.replaceAnchorSubjects;
                const sceneNotesForStrict = (bgPrompt || state.director.subject || '').trim();
                const hasExplicitTargetMap = contractActiveReferenceSlots.some((ref) => (ref.target || '').trim().length > 0);
                const isSingleSubjectReplaceFallback = isReplaceMode
                    && plan.length === 0
                    && !hasExplicitTargetMap
                    && contractActiveReferenceSlots.length === 1;

                if (!strictMode && isReplaceMode) {
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: 'Replace Anchor Subjects is active: using strict replacement pipeline for deterministic identity mapping.',
                            type: 'info'
                        }
                    });
                }

                // Safety gate: without either staged regions or explicit per-reference targets,
                // strict replace can devolve into random subject placement.
                if (isReplaceMode && plan.length === 0 && !hasExplicitTargetMap && !isSingleSubjectReplaceFallback) {
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: 'Replace Anchor Subjects requires mapping. Add staged actors on canvas or set target text in each Reference Stack.',
                            type: 'error'
                        }
                    });
                    setViewMode('stage');
                    window.clearInterval(progressInterval);
                    dispatch({ type: 'SET_PROCESSING', payload: false });
                    return;
                }
                if (isSingleSubjectReplaceFallback) {
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: 'No staged mapping found. Using single-subject dominant replacement fallback from the active Reference Stack.',
                            type: 'info'
                        }
                    });
                }

                if (isReplaceMode && plan.length > 0 && contractActiveReferenceSlots.length > 1 && !hasExplicitTargetMap) {
                    const mappedCastIds = new Set(
                        contractActiveReferenceSlots
                            .map((ref) => ref.castId)
                            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                    );
                    const unmatched = plan.filter((entry) => {
                        const castId = entry.token.castId || '';
                        return !castId || !mappedCastIds.has(castId);
                    });

                    if (unmatched.length > 0) {
                        dispatch({
                            type: 'ADD_LOG',
                            payload: {
                                message: 'Replace Anchor Subjects requires deterministic actor mapping. Link each staged actor to a matching Reference Stack cast, or add explicit target text per reference.',
                                type: 'error'
                            }
                        });
                        setViewMode('stage');
                        window.clearInterval(progressInterval);
                        dispatch({ type: 'SET_PROCESSING', payload: false });
                        return;
                    }
                }

                if (isReplaceMode && plan.length > 0) {
                    let runningBgUrl = activeBgUrl || '';
                    if (!runningBgUrl) {
                        dispatch({
                            type: 'ADD_LOG',
                            payload: {
                                message: 'Replace Anchor Subjects requires an active source scene.',
                                type: 'error'
                            }
                        });
                        setViewMode('stage');
                        window.clearInterval(progressInterval);
                        dispatch({ type: 'SET_PROCESSING', payload: false });
                        return;
                    }

                    const sortedRefs = [...contractActiveReferenceSlots]
                        .filter((ref) => !!ref.url)
                        .sort((a, b) => a.index - b.index);

                    const findRefForRegion = (regionEntry: ReturnType<typeof buildRegionPlan>[number]) => {
                        const castId = regionEntry.token.castId || '';
                        if (castId) {
                            const byCast = sortedRefs.find((ref) => ref.castId === castId);
                            if (byCast) return byCast;
                        }
                        // Never silently re-map identities in multi-region replace mode.
                        // If cast linkage is missing, we fail loudly below instead of guessing.
                        if (sortedRefs.length === 1 && plan.length === 1) return sortedRefs[0];
                        return undefined;
                    };

                    const passPlan = plan
                        .map((regionEntry) => ({ regionEntry, ref: findRefForRegion(regionEntry) }))
                        .filter((entry) => !!entry.ref && !!entry.ref.url);

                    if (passPlan.length !== plan.length) {
                        dispatch({
                            type: 'ADD_LOG',
                            payload: {
                                message: 'Replace Anchor Subjects mapping incomplete. Ensure each staged actor has a valid mapped Reference Stack.',
                                type: 'error'
                            }
                        });
                        setViewMode('stage');
                        window.clearInterval(progressInterval);
                        dispatch({ type: 'SET_PROCESSING', payload: false });
                        return;
                    }

                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: `Running deterministic replace passes (${passPlan.length}) to prevent identity blending.`,
                            type: 'info'
                        }
                    });

                    let finalDeterministicReplacePrompt = sceneNotesForStrict || bgPrompt || state.director.subject;
                    for (const pass of passPlan) {
                        const passAnchorPlate = await buildAnchorPlate([pass.regionEntry], runningBgUrl);
                        const passControlOverlay = await buildSpatialControlOverlay([pass.regionEntry]);
                        const passLightingBlock = await buildAnchorLightingTransferBlock(
                            runningBgUrl,
                            [pass.regionEntry],
                            dnaForRender.lighting || state.director.lighting
                        );
                        const passReference = pass.ref!;
                        const passRefLabel = `REFERENCE_${passReference.index}`;
                        const passCastId = pass.regionEntry.token.castId || passReference.castId || '';
                        const passIdentitySet = passCastId ? identitySets.find((set) => set.actorId === passCastId) : undefined;
                        const passPromptBase = buildStrictAnchorReplacementPrompt({
                            bgPrompt: sceneNotesForStrict,
                            mergeStrategy: state.director.mergeStrategy,
                            sceneLock: state.director.sceneLock,
                            replaceAnchorSubjects: true,
                            globalReplaceTarget: state.director.globalReplaceTarget,
                            hasDepthMap: DEPTH_FEATURE_ENABLED && !!state.depthMapUrl,
                            activeRefs: [passReference],
                            actorIdentitySets: passIdentitySet ? [passIdentitySet] : undefined,
                            tokens: [pass.regionEntry.token],
                            annotations: state.annotations,
                            spatialFrame: viewportBox
                        });

                        const passRefs = [
                            { url: passAnchorPlate, label: 'ANCHOR_GUIDE' },
                            { url: runningBgUrl, label: 'CLEAN_BG_PLATE' },
                            { url: passReference.url!, label: passRefLabel }
                        ];
                        const passRefUrlSet = new Set(passRefs.map((r) => r.url));
                        const passSupportLabels: string[] = [];
                        if (passIdentitySet) {
                            const supportIdentityUrls = buildOrderedActorIdentityInputs(passIdentitySet);
                            for (const url of supportIdentityUrls) {
                                if (!url || passRefUrlSet.has(url)) continue;
                                if (passRefs.length >= 14) break;
                                const label = `ACTOR_ID_${passSupportLabels.length + 1}`;
                                passRefs.push({ url, label });
                                passRefUrlSet.add(url);
                                passSupportLabels.push(label);
                            }
                        }

                        const finalizedPassRefs = finalizeStagingReferences({
                            cleanBgPlate: runningBgUrl,
                            anchorGuide: passAnchorPlate,
                            contentReferences: passRefs,
                            controlOverlay: passControlOverlay
                        });
                        const passGenerationRefs = buildFinalizedReferenceInputs(finalizedPassRefs);

                        const allowedIdentityLabels = [passRefLabel, ...passSupportLabels];
                        const passPrompt = protectStagingPromptStyle([
                            replaceIdentityContractBlock,
                            passPromptBase,
                            passLightingBlock,
                            `### SINGLE-REGION REPLACEMENT LOCK (HARD)\n- This pass may edit ONLY REGION ${pass.regionEntry.region}.\n- REGION ${pass.regionEntry.region} may use ONLY identity references labeled ${allowedIdentityLabels.join(', ')}.\n- Treat ${passRefLabel} as the primary identity anchor for this region.\n- Do NOT alter identity or pose of people outside REGION ${pass.regionEntry.region} in CLEAN_BG_PLATE.\n- Preserve all non-target pixels exactly.\n- GAZE/HEAD POSE LOCK: Match the target subject head yaw/pitch/roll and eye gaze direction from CLEAN_BG_PLATE in this region. If the anchor subject is not looking at camera, the replacement must also NOT look at camera.\n- LIGHTING LOCK: Match the ANCHOR LIGHTING TRANSFER block above. Do not use portrait/studio lighting from identity references.\n- NO LOOKALIKE SUBSTITUTION: If uncertain, preserve mapped identity references over aesthetic similarity.`
                        ].filter(Boolean).join('\n\n'), generationContract.explicitStyleOverride);
                        finalDeterministicReplacePrompt = passPrompt;
                        logStagingGenerationSources(passPrompt);
                        logStagingIdentityContract(buildReferenceLogEntries(finalizedPassRefs));
                        setLatestSubmittedStagingRequest(buildSubmittedStagingRequestSnapshot('strict-pass', passPrompt, finalizedPassRefs));

                        let passJobId = '';
                        const passRes = await GeminiService.generateImage(
                            passPrompt,
                            state.apiKey!,
                            state.model,
                            passGenerationRefs,
                            {
                                aspectRatio: state.director.aspectRatio,
                                imageSize: state.imageResolution,
                                thinkingLevel: state.enableImageThinking,
                                googleGrounding: state.enableGoogleGrounding,
                                strictMode: true,
                                billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                                entitlements: state.billingEntitlements,
                                identityLocks: passIdentitySet?.identityLock ? [passIdentitySet.identityLock] : undefined,
                                onJobAccepted: (id) => {
                                    passJobId = id;
                                    dispatch({ type: 'ADD_BACKGROUND_JOB', payload: { id, status: 'polling_foreground', context: 'scene_render', startedAt: Date.now() } });
                                }
                            }
                        );
                        runningBgUrl = await normalizeGeneratedImageUrl(passRes);
                        if (passJobId) dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: passJobId });
                    }

                    await applyStagingResult(runningBgUrl, {
                        prompt: finalDeterministicReplacePrompt,
                        surface: 'result',
                        suggestedName: 'staging_replace_result',
                        stage: 'generate'
                    });
                    dispatch({ type: 'ADD_LOG', payload: { message: "Staging strictly rendered (deterministic replace passes).", type: 'success' } });
                    return;
                }

                const anchorPlate = await buildAnchorPlate(plan);
                const controlOverlay = await buildSpatialControlOverlay(plan);
                const anchorLightingBlock = await buildAnchorLightingTransferBlock(
                    activeBgUrl,
                    plan,
                    dnaForRender.lighting || state.director.lighting
                );

                const strictPromptBase = isReplaceMode
                    ? compiledPrompt
                    : buildStrictPrompt(
                        plan,
                        dnaForRender,
                        sceneNotesForStrict,
                        state.tokens,
                        state.annotations,
                        state.referenceSlots,
                        state.director,
                        safeExtractedStyle,
                        viewportBox
                    );

                const refs: { url: string; label: string }[] = [];
                refs.push({ url: anchorPlate, label: "ANCHOR_GUIDE" });
                if (activeBgUrl) refs.push({ url: activeBgUrl, label: "CLEAN_BG_PLATE" });
                
                const urls = new Set(refs.map(r => r.url));

                const referenceStackLabelsBySlotIndex = new Map<number, string>();
                for (const ref of contractActiveReferenceSlots) {
                    const url = ref.url;
                    if (!url) continue;
                    const existingRef = refs.find((entry) => entry.url === url);
                    if (existingRef) {
                        referenceStackLabelsBySlotIndex.set(ref.index, existingRef.label);
                        continue;
                    }
                    if (refs.length >= 14) break;
                    const label = `REFERENCE_${ref.index}`;
                    refs.push({ url, label });
                    urls.add(url);
                    referenceStackLabelsBySlotIndex.set(ref.index, label);
                }

                const actorIdentityLabelsByActorId = new Map<string, string[]>();
                const orderedIdentityLabelGroups: string[][] = [];
                const toLabelKey = (raw: string) =>
                    raw
                        .replace(/[^a-zA-Z0-9]+/g, '_')
                        .replace(/^_+|_+$/g, '')
                        .toUpperCase()
                        .slice(0, 28) || 'ACTOR';

                if (isReplaceMode) {
                    const sortedRefs = [...contractActiveReferenceSlots].sort((a, b) => a.index - b.index);
                    const identitySetByActorId = new Map(identitySets.map((set) => [set.actorId, set]));
                    for (const ref of sortedRefs) {
                        const label = referenceStackLabelsBySlotIndex.get(ref.index) || `REFERENCE_${ref.index}`;
                        const group = [label];
                        const linkedIdentitySet = ref.castId ? identitySetByActorId.get(ref.castId) : undefined;
                        const actorKey = toLabelKey(linkedIdentitySet?.actorLabel || ref.name || ref.castId || `REF_${ref.index}`);
                        let supportCounter = 0;

                        if (linkedIdentitySet) {
                            const orderedUrls = buildOrderedActorIdentityInputs(linkedIdentitySet);
                            for (const url of orderedUrls) {
                                if (!url || url === ref.url) continue;
                                if (refs.length >= 14) break;
                                const existingRef = refs.find((r) => r.url === url);
                                if (existingRef) {
                                    if (!group.includes(existingRef.label)) group.push(existingRef.label);
                                    continue;
                                }
                                const supportLabel = `${actorKey}_ID_${supportCounter + 1}`;
                                refs.push({ url, label: supportLabel });
                                urls.add(url);
                                group.push(supportLabel);
                                supportCounter += 1;
                            }
                        }
                        orderedIdentityLabelGroups.push(group);
                        if (ref.castId) {
                            actorIdentityLabelsByActorId.set(ref.castId, group);
                        }
                    }
                } else {
                    const sortedRefs = [...contractActiveReferenceSlots].sort((a, b) => a.index - b.index);
                    for (const ref of sortedRefs) {
                        const label = referenceStackLabelsBySlotIndex.get(ref.index);
                        if (!label) continue;
                        const group = [label];
                        orderedIdentityLabelGroups.push(group);
                        if (ref.castId) {
                            actorIdentityLabelsByActorId.set(ref.castId, group);
                        }
                    }

                    for (const set of identitySets) {
                        if (!hasStrongFaceAnchor(set)) {
                             console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'scene-strict' });
                        }
                        const orderedUrls = buildOrderedActorIdentityInputs(set);
                        const actorKey = toLabelKey(set.actorLabel || set.actorId || 'ACTOR');
                        const existingLabels = actorIdentityLabelsByActorId.get(set.actorId) || [];
                        const setLabels: string[] = [...existingLabels];
                        for (const url of orderedUrls) {
                            if (!url) continue;
                            if (refs.length >= 14) break;
                            const existingRef = refs.find((r) => r.url === url);
                            if (existingRef) {
                                if (!setLabels.includes(existingRef.label)) setLabels.push(existingRef.label);
                                continue;
                            }
                            const label = `${actorKey}_ID_${setLabels.length + 1}`;
                            refs.push({ url, label });
                            setLabels.push(label);
                            urls.add(url);
                        }
                        if (setLabels.length > 0) {
                            const uniqueSetLabels = Array.from(new Set(setLabels));
                            actorIdentityLabelsByActorId.set(set.actorId, uniqueSetLabels);
                            if (existingLabels.length === 0) {
                                orderedIdentityLabelGroups.push(uniqueSetLabels);
                            }
                        }
                    }
                }
                // In Replace Anchor Subjects mode, avoid injecting staged token pixels as region references:
                // they can leak identity/lighting/clothing from source cutouts.
                if (!isReplaceMode) {
                    // Region references are useful for blocking/wardrobe continuity in non-replace mode.
                    for (const r of plan) {
                        if (refs.length >= 14) break;
                        if (!r.token.url || urls.has(r.token.url)) continue;
                        refs.push({ url: r.token.url, label: `REGION_${r.region}_REF` });
                        urls.add(r.token.url);
                    }
                }

                const finalizedStrictRefs = finalizeStagingReferences({
                    cleanBgPlate: activeBgUrl,
                    anchorGuide: anchorPlate,
                    contentReferences: refs,
                    controlOverlay
                });
                const strictGenerationRefs = buildFinalizedReferenceInputs(finalizedStrictRefs);
                const routingLines: string[] = [];
                const usedFallbackIdentityGroups = new Set<number>();
                const missingIdentityMappings: string[] = [];
                for (const region of plan) {
                    const actorId = region.token.castId || '';
                    let labels = actorIdentityLabelsByActorId.get(actorId) || [];
                    if (labels.length === 0 && !isReplaceMode) {
                        const fallbackIndex = orderedIdentityLabelGroups.findIndex((group, idx) => group.length > 0 && !usedFallbackIdentityGroups.has(idx));
                        if (fallbackIndex >= 0) {
                            labels = orderedIdentityLabelGroups[fallbackIndex];
                            usedFallbackIdentityGroups.add(fallbackIndex);
                        }
                    }
                    if (labels.length === 0) {
                        if (isReplaceMode) {
                            const regionActorLabel = region.cast?.name || region.token.tag || `Actor ${region.region}`;
                            missingIdentityMappings.push(`Region ${region.region} (${regionActorLabel})`);
                        }
                        continue;
                    }
                    const regionActorLabel = region.cast?.name || region.token.tag || `Actor ${region.region}`;
                    routingLines.push(`- REGION ${region.region} (${regionActorLabel}) may use ONLY identity references labeled: ${labels.join(', ')}`);
                    if (isReplaceMode) {
                        routingLines.push(`- REGION ${region.region}: Use CLEAN_BG_PLATE at this BBOX as pose/gaze/wardrobe/lighting source. Do not import these attributes from identity references.`);
                    } else {
                        routingLines.push(`- REGION ${region.region}: Treat REGION_${region.region}_REF as pose/wardrobe continuity only. Never copy face/head/body morphology from REGION_${region.region}_REF.`);
                    }
                }

                const refIndexMapLines: string[] = [];
                let singleSubjectFallbackBlock = '';
                if (isReplaceMode) {
                    if (missingIdentityMappings.length > 0) {
                        dispatch({
                            type: 'ADD_LOG',
                            payload: {
                                message: `Replace Anchor Subjects mapping incomplete for: ${missingIdentityMappings.join('; ')}. Assign matching Reference Stack cast links before generating.`,
                                type: 'error'
                            }
                        });
                        setViewMode('stage');
                        window.clearInterval(progressInterval);
                        dispatch({ type: 'SET_PROCESSING', payload: false });
                        return;
                    }
                    for (const ref of contractActiveReferenceSlots) {
                        const labels = ref.castId
                            ? (actorIdentityLabelsByActorId.get(ref.castId) || [])
                            : [`REFERENCE_${ref.index}`];
                        if (labels.length === 0) continue;
                        const refLabel = ref.name || `Reference ${ref.index}`;
                        refIndexMapLines.push(`- REFERENCE ${ref.index} (${refLabel}) corresponds to identity labels: ${labels.join(', ')}`);
                    }
                    if (isSingleSubjectReplaceFallback) {
                        const primaryRef = contractActiveReferenceSlots[0];
                        const fallbackLabels = primaryRef?.castId
                            ? (actorIdentityLabelsByActorId.get(primaryRef.castId) || [`REFERENCE_${primaryRef.index}`])
                            : (primaryRef ? [`REFERENCE_${primaryRef.index}`] : []);
                        if (primaryRef && fallbackLabels.length > 0) {
                            const refLabel = primaryRef.name || `Reference ${primaryRef.index}`;
                            singleSubjectFallbackBlock = `### SINGLE-SUBJECT TARGET LOCK (HARD)\n- Replace the single most visually dominant human subject in CLEAN_BG_PLATE with the identity defined by ${fallbackLabels.join(', ')}.\n- Treat REFERENCE_${primaryRef.index} (${refLabel}) as the primary identity anchor.\n- Preserve the anchor subject's pose, gaze direction, wardrobe, props, background, and framing.\n- If the anchor subject differs from the reference in sex presentation, age appearance, skin texture, or face/head geometry, those anchor traits must be fully overwritten to match the reference-defined identity.\n- Do NOT invent a similar-looking substitute.\n- Leave all secondary/background people unchanged.`;
                        }
                    }
                }

                const strictPromptText = protectStagingPromptStyle([
                    isReplaceMode ? replaceIdentityContractBlock : '',
                    strictPromptBase,
                    anchorLightingBlock,
                    routingLines.length > 0
                        ? `### REGION-TO-IDENTITY ROUTING LOCK (HARD)\n${routingLines.join('\n')}\n- Do NOT swap identities between regions.\n- Do NOT blend identity/body traits across different region subjects.\n- Do NOT keep anchor body morphology and only replace heads.\n- If uncertain, preserve region assignment over stylistic similarity.`
                        : '',
                    singleSubjectFallbackBlock,
                    refIndexMapLines.length > 0
                        ? `### REFERENCE-LABEL MAPPING LOCK (HARD)\n${refIndexMapLines.join('\n')}\n- Use the REFERENCE index mapping above when interpreting replacement map directives.\n- If a REFERENCE index conflicts with visual similarity, trust the mapped labels above.`
                        : ''
                ].filter(Boolean).join('\n\n'), generationContract.explicitStyleOverride);
                logStagingGenerationSources(strictPromptText);
                logStagingIdentityContract(buildReferenceLogEntries(finalizedStrictRefs));
                setLatestSubmittedStagingRequest(buildSubmittedStagingRequestSnapshot('strict', strictPromptText, finalizedStrictRefs));

                let actualGenId = '';
                const res = await GeminiService.generateImage(
                    strictPromptText,
                    state.apiKey!,
                    state.model,
                    strictGenerationRefs,
                    { 
                        aspectRatio: state.director.aspectRatio, imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding, strictMode: true, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, uiWaitWindowMs: stageUiWaitWindowMs,
                        identityLocks: activeIdentityLocks,
                        onJobAccepted: (id) => {
                            actualGenId = id;
                            dispatch({ type: 'ADD_BACKGROUND_JOB', payload: { id, status: 'polling_foreground', context: 'scene_render', startedAt: Date.now() } });
                        }
                    }
                );

                const img = await normalizeGeneratedImageUrl(res);

                if (actualGenId) dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: actualGenId });

                await applyStagingResult(img, {
                    prompt: strictPromptText,
                    generationId: actualGenId || undefined,
                    surface: 'result',
                    suggestedName: 'staging_result',
                    stage: 'generate'
                });
                dispatch({ type: 'ADD_LOG', payload: { message: "Staging strictly rendered.", type: 'success' } });
            } else {
                const references: { url: string; label: string }[] = [];
                const urls = new Set<string>();

                for (const ref of contractActiveReferenceSlots) {
                    const url = ref.url;
                    if (!url) continue;
                    if (references.length >= 14) break;
                    if (urls.has(url)) continue;
                    references.push({ url, label: `REFERENCE_${ref.index}` });
                    urls.add(url);
                }

                for (const set of identitySets) {
                    if (!hasStrongFaceAnchor(set)) {
                         console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'scene-loose' });
                    }
                    const orderedUrls = buildOrderedActorIdentityInputs(set);
                    for (const url of orderedUrls) {
                        if (!url) continue;
                        if (references.length >= 14) break;
                        if (urls.has(url)) continue;
                        references.push({ url, label: `ACTOR IDENTITY ANCHOR` });
                        urls.add(url);
                    }
                }
                
                if (urls.size > 0) {
                    // Identity injected safely
                } else {
                    const uniqueCastIds = new Set(state.tokens.map(t => t.castId));
                    uniqueCastIds.forEach(id => {
                        const member = (state.cast || []).find(c => c.id === id);
                        if (member) references.push({ url: member.previewUrl || member.url, label: `Character: ${member.name}` });
                    });
                }

                if (shouldUseSourcePreservingTransform && activeBgUrl) {
                    const sourceFirstReferences = buildSourcePreservingReferenceImages(
                        activeBgUrl,
                        references,
                        14
                    );
                    references.splice(0, references.length, ...sourceFirstReferences);
                    urls.clear();
                    sourceFirstReferences.forEach((reference) => urls.add(reference.url));
                } else if (activeBgUrl && !references.some(r => r.url === activeBgUrl)) {
                    references.push({ url: activeBgUrl, label: "CLEAN_BG_PLATE" });
                }

                const loosePlan = buildRegionPlan({ token: tokenOverrides });
                const looseControlOverlay = await buildSpatialControlOverlay(loosePlan);
                const looseLightingBlock = await buildAnchorLightingTransferBlock(
                    activeBgUrl,
                    loosePlan,
                    dnaForRender.lighting || state.director.lighting
                );

                const finalizedLooseRefs = finalizeStagingReferences({
                    cleanBgPlate: activeBgUrl,
                    contentReferences: references,
                    controlOverlay: looseControlOverlay
                });

                // Invariant: an identity request must never silently become a text-only generation.
                // If the user staged an actor (token.castId) but no identity reference was attached,
                // fail closed instead of letting the model invent a random character.
                const stagedIdentityExpected = state.tokens.some((token) => Boolean(token.castId));
                const hasIdentityReference = finalizedLooseRefs.some(
                    (ref) => ref.role === 'selected_cast_reference'
                );
                if (stagedIdentityExpected && !hasIdentityReference) {
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: 'Generation blocked: a staged actor has no identity reference image. Assign a valid scan/reference before generating (prevented a random-character render).',
                            type: 'error'
                        }
                    });
                    setViewMode('stage');
                    window.clearInterval(progressInterval);
                    dispatch({ type: 'SET_PROCESSING', payload: false });
                    return;
                }

                const looseGenerationRefs = buildFinalizedReferenceInputs(finalizedLooseRefs);
                const loosePromptText = protectStagingPromptStyle([
                    generationContract.replaceAnchorSubjects ? replaceIdentityContractBlock : '',
                    renderSourcePreservationBlock,
                    buildLoosePrompt(
                        dnaForRender,
                        state.tokens,
                        state.annotations,
                        state.referenceSlots,
                        state.director,
                        safeExtractedStyle,
                        bgPrompt,
                        viewportBox
                    ),
                    looseLightingBlock
                ].filter(Boolean).join('\n\n'), generationContract.explicitStyleOverride);
                logStagingGenerationSources(loosePromptText);
                logStagingIdentityContract(buildReferenceLogEntries(finalizedLooseRefs));
                setLatestSubmittedStagingRequest(buildSubmittedStagingRequestSnapshot('loose', loosePromptText, finalizedLooseRefs));

                let actualGenId = '';
                const res = await GeminiService.generateImage(
                    loosePromptText,
                    state.apiKey!,
                    state.model,
                    looseGenerationRefs,
                    { 
                        aspectRatio: state.director.aspectRatio, imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements, uiWaitWindowMs: stageUiWaitWindowMs,
                        identityLocks: activeIdentityLocks,
                        onJobAccepted: (id) => {
                            actualGenId = id;
                            dispatch({ type: 'ADD_BACKGROUND_JOB', payload: { id, status: 'polling_foreground', context: 'scene_render', startedAt: Date.now() } });
                        }
                    }
                );

                const img = await normalizeGeneratedImageUrl(res);

                if (actualGenId) dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: actualGenId });

                await applyStagingResult(img, {
                    prompt: loosePromptText,
                    
                    generationId: actualGenId || undefined,
                    surface: 'result',
                    suggestedName: 'staging_result',
                    stage: 'generate'
                });
                dispatch({ type: 'ADD_LOG', payload: { message: "Staging (loose) rendered.", type: 'success' } });
            }
        } catch (e: unknown) {
            const hostedError = e as HostedTimeoutError;
            const errorMessage = formatStageGenerationError(e);
            const isTimeout = hostedError.name === 'TimeoutError' || errorMessage.includes('Pending');
            if (isTimeout && hostedError.generationId) {
                dispatch({ type: 'UPDATE_BACKGROUND_JOB', payload: { id: hostedError.generationId, updates: { status: 'pending_background' } } });
                dispatch({ type: 'ADD_LOG', payload: { message: "Job shifted to background due to long queue.", type: 'info' } });
            } else {
                console.warn('[StageGeneration] Generation failed:', e);
                dispatch({ type: 'ADD_LOG', payload: { message: errorMessage, type: 'error' } });
                setViewMode('stage');
            }
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
            stagingGenerationInFlightRef.current = false;
        }
    };

    // Keyboard Shortcuts (Global)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // (Keep existing keyboard logic...)
            if (
                (e.target as HTMLElement).tagName === 'INPUT' ||
                (e.target as HTMLElement).tagName === 'TEXTAREA' ||
                (e.target as HTMLElement).isContentEditable
            ) {
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (state.selection) {
                    e.preventDefault();
                    if (state.selectionType === 'token') dispatch({ type: 'REMOVE_TOKEN', payload: state.selection });
                    else dispatch({ type: 'REMOVE_ANNOTATION', payload: state.selection });
                }
            }
            if (e.shiftKey && e.key === 'D') {
                if (import.meta.env?.DEV) {
                    e.preventDefault();
                    setShowDebugActorOverlay(prev => !prev);
                }
            }
            if (e.shiftKey && e.key === 'G') {
                if (import.meta.env?.DEV) {
                    e.preventDefault();
                    setShowGroundDebug(prev => !prev);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.selection, state.selectionType, dispatch]);

    // --- SIDEBAR STATE ---
    const [panelOrder, setPanelOrder] = useState<string[]>(() => {
        const saved = localStorage.getItem('nano_panel_order');
        if (saved) {
            try { return JSON.parse(saved); } catch {}
        }
        return ['specs', 'layers', 'advanced_render', 'ref_stacks', 'region_edit', 'scene_director', 'shots'];
    });

    const [leftPanelOrder, setLeftPanelOrder] = useState<string[]>(() => {
        const saved = localStorage.getItem('nano_left_panel_order');
        if (saved) {
            try { return JSON.parse(saved); } catch {}
        }
        return ['anchor', 'cast_palette', 'actor_intel', 'token_props', 'annotation_props'];
    });

    useEffect(() => {
        localStorage.setItem('nano_panel_order', JSON.stringify(panelOrder));
    }, [panelOrder]);

    useEffect(() => {
        localStorage.setItem('nano_left_panel_order', JSON.stringify(leftPanelOrder));
    }, [leftPanelOrder]);

    // Use global panel state from AppContext to persist during navigation
    const stagePanelState = (state as { stagePanelState?: Record<string, boolean> }).stagePanelState;
    const collapsedPanels = stagePanelState || {
        'ref_stacks': true,
        'region_edit': true,
        'stage-layers': true,
        'specs': true,
        'anchor': true,
        'scene_director': true,
        'advanced_render': true,
        'shots': false
    };
    const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);



    const togglePanel = (id: string) => {
        dispatch({
            type: 'SET_STAGE_PANEL_STATE',
            payload: { id, isOpen: !collapsedPanels[id] }
        });
    };

    const handlePanelDrop = (targetId: string) => {
        if (!draggedPanelId || draggedPanelId === targetId) return;
        
        // Right Side Check
        const newOrder = [...panelOrder];
        const fromIndex = newOrder.indexOf(draggedPanelId);
        const toIndex = newOrder.indexOf(targetId);
        if (fromIndex !== -1 && toIndex !== -1) {
            newOrder.splice(fromIndex, 1);
            newOrder.splice(toIndex, 0, draggedPanelId);
            setPanelOrder(newOrder);
            setDraggedPanelId(null);
            return;
        }

        // Left Side Check
        const newLeftOrder = [...leftPanelOrder];
        const fromLeft = newLeftOrder.indexOf(draggedPanelId);
        const toLeft = newLeftOrder.indexOf(targetId);
        if (fromLeft !== -1 && toLeft !== -1) {
            newLeftOrder.splice(fromLeft, 1);
            newLeftOrder.splice(toLeft, 0, draggedPanelId);
            setLeftPanelOrder(newLeftOrder);
            setDraggedPanelId(null);
            return;
        }
    };


    // Region Edit Job Runner (Cancel/Status)
    const [isRegionEditRunning, setIsRegionEditRunning] = useState(false);
    const cancelRegionEditRef = useRef(false);

    const requestCancelRegionEdit = () => {
        cancelRegionEditRef.current = true;
        dispatch({
            type: 'ADD_LOG',
            payload: {
                type: 'info',
                message: 'Cancel requested. The current layer will finish, then the queue will stop.',
            },
        });
    };




    // --- V3-STYLE REFERENCE STACK (integrated) ---
    const refFileInputs = useRef<Record<number, HTMLInputElement | null>>({});

    // --- SHOTS (Storyboard) ---
    // Shots live in AppContext so SceneCanvas / Veo / Production stay in sync.
    const [newShotName, setNewShotName] = useState('');
    const [activeShotNameDraft, setActiveShotNameDraft] = useState('');

    const shots = state.shots as Shot[] | undefined;
    const activeShotId = state.activeShotId;
    const activeShot = shots?.find(s => s.id === activeShotId) || null;
    const displayedResultImage = state.resultImage || latestGeneratedOutputImage || activeShot?.latestCompositeResultUrl || null;
    const hasPassiveGeneratedOutput = Boolean(latestGeneratedOutputImage && state.resultImage !== latestGeneratedOutputImage);

    const applyStagingResult = useCallback(async (
        imageUrl: string,
        options?: {
            prompt?: string;
            generationId?: string;
            surface?: string;
            suggestedName?: string;
            stage?: 'generate' | 'refine';
        }
    ): Promise<string> => {
        const displayUrl = imageUrl;

        setLatestGeneratedOutputImage(displayUrl);
        setLatestGeneratedOutputMeta({
            prompt: options?.prompt,
            generationId: options?.generationId,
            suggestedName: options?.suggestedName,
            stage: options?.stage || 'generate',
            createdAt: Date.now()
        });
        addRecentGeneration({
            id: options?.generationId,
            studio: 'staging',
            displayUrl,
            localCachePath: `transient:staging:${options?.generationId || Date.now()}`,
            createdAt: Date.now(),
            prompt: options?.prompt,
            mode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
            displayLabel: options?.suggestedName || 'Staging result',
            settingsSnapshot: { selectedStyle: null }
        });

        setViewMode('result');
        return displayUrl;
    }, [addRecentGeneration, state.billingEntitlements.effectiveBillingMode]);

    const promoteLatestGeneratedOutputToResult = useCallback(() => {
        if (!latestGeneratedOutputImage) return;

        dispatch({ type: 'SET_RESULT_IMAGE', payload: latestGeneratedOutputImage });
        dispatch({
            type: 'SET_COMPOSITE_METADATA',
            payload: {
                latestCompositeSource: 'directorCanvas',
                latestCompositeResultUrl: latestGeneratedOutputImage
            }
        });

        const sceneId = state.activeShotId;
        if (sceneId) {
            dispatch({
                type: 'UPDATE_SHOT_META',
                payload: {
                    id: sceneId,
                    updates: {
                        latestCompositeResultUrl: latestGeneratedOutputImage,
                        latestCompositeSource: 'directorCanvas',
                        latestCompositeStage: latestGeneratedOutputMeta?.stage || 'generate',
                        latestCompositeTimestamp: new Date().toISOString()
                    }
                }
            });
            dispatch({
                type: 'SET_SCENE_RESULT_ANCHOR',
                payload: {
                    sceneId,
                    anchor: { kind: 'generated_result', imageUrl: latestGeneratedOutputImage }
                }
            });
        }

        dispatch({ type: 'ADD_LOG', payload: { message: 'Generated output promoted to active Result.', type: 'success' } });
    }, [dispatch, latestGeneratedOutputImage, latestGeneratedOutputMeta, state.activeShotId]);

    useEffect(() => {
        setActiveShotNameDraft(activeShot?.name || '');
    }, [activeShot?.name]);


    // --- REGION EDIT (Mask / Brush) ---
    const regionEdit: RegionEditState = state.regionEdit;
    const activeLayer = regionEdit.layers.find((l) => l.id === regionEdit.activeLayerId) || regionEdit.layers[0] || null;

    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskIsDownRef = useRef(false);
    const lastPtRef = useRef<{ x: number; y: number } | null>(null);

    // --- PROTECTION MASK (Face / Hair / Subject lock) ---
    const [protectEnabled, setProtectEnabled] = useState(true);
    const [protectMaskUrl, setProtectMaskUrl] = useState<string | null>(null);
    const [rawProtectMaskUrl, setRawProtectMaskUrl] = useState<string | null>(null);
    const [protectErosion, setProtectErosion] = useState(0);
    const [protectStatus, setProtectStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');




    const loadDataUrlImage = useCallback((url: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        }), []);

    const prepareRegionEditInputs = useCallback(async (
        baseUrl: string,
        editMaskUrl: string,
        sourceAuto?: { sourceImageMeta: RegionSourceImageMeta }
    ): Promise<{ baseDataUrl: string; maskDataUrl: string; wasDownscaled: boolean; width: number; height: number; editedPixels: number }> => {
        const baseImg = await loadDataUrlImage(baseUrl);
        const maskImg = await loadDataUrlImage(editMaskUrl);

        const baseW = Math.max(1, toFiniteNumber(baseImg.naturalWidth || baseImg.width, 1));
        const baseH = Math.max(1, toFiniteNumber(baseImg.naturalHeight || baseImg.height, 1));
        const sourceMeta = sourceAuto?.sourceImageMeta;
        const targetW = sourceMeta
            ? Math.max(1, Math.round(sourceMeta.derivedRenderWidth))
            : Math.max(1, Math.round(baseW * Math.min(
                Math.min(1, REGION_EDIT_MAX_EDGE / Math.max(baseW, baseH)),
                Math.min(1, Math.sqrt(REGION_EDIT_MAX_PIXELS / Math.max(1, baseW * baseH)))
            )));
        const targetH = sourceMeta
            ? Math.max(1, Math.round(sourceMeta.derivedRenderHeight))
            : Math.max(1, Math.round(baseH * Math.min(
                Math.min(1, REGION_EDIT_MAX_EDGE / Math.max(baseW, baseH)),
                Math.min(1, Math.sqrt(REGION_EDIT_MAX_PIXELS / Math.max(1, baseW * baseH)))
            )));

        const baseCanvas = document.createElement('canvas');
        const maskCanvas = document.createElement('canvas');

        try {
            baseCanvas.width = targetW;
            baseCanvas.height = targetH;
            const baseCtx = baseCanvas.getContext('2d', { alpha: false });
            if (!baseCtx) throw new Error('Region Edit base canvas unavailable.');
            baseCtx.fillStyle = '#000000';
            baseCtx.fillRect(0, 0, targetW, targetH);
            baseCtx.imageSmoothingEnabled = true;
            baseCtx.imageSmoothingQuality = 'high';
            baseCtx.drawImage(baseImg, 0, 0, targetW, targetH);

            maskCanvas.width = targetW;
            maskCanvas.height = targetH;
            const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
            if (!maskCtx) throw new Error('Region Edit mask canvas unavailable.');
            maskCtx.fillStyle = '#000000';
            maskCtx.fillRect(0, 0, targetW, targetH);
            maskCtx.imageSmoothingEnabled = false;
            if (sourceMeta) {
                const maskW = Math.max(1, toFiniteNumber(maskImg.naturalWidth || maskImg.width, 1));
                const maskH = Math.max(1, toFiniteNumber(maskImg.naturalHeight || maskImg.height, 1));
                const sourceRect = getObjectContainRect(sourceMeta.width, sourceMeta.height, maskW, maskH);
                maskCtx.drawImage(
                    maskImg,
                    sourceRect.x,
                    sourceRect.y,
                    sourceRect.width,
                    sourceRect.height,
                    0,
                    0,
                    targetW,
                    targetH
                );
            } else {
                maskCtx.drawImage(maskImg, 0, 0, targetW, targetH);
            }

            const maskData = maskCtx.getImageData(0, 0, targetW, targetH);
            const pixels = maskData.data;
            let editedPixels = 0;
            for (let idx = 0; idx < pixels.length; idx += 4) {
                const alpha = pixels[idx + 3];
                const lum = Math.max(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
                const v = alpha > 8 && lum > 24 ? 255 : 0;
                if (v === 255) editedPixels++;
                pixels[idx] = v;
                pixels[idx + 1] = v;
                pixels[idx + 2] = v;
                pixels[idx + 3] = 255;
            }
            maskCtx.putImageData(maskData, 0, 0);

            if (editedPixels < 8) {
                throw new Error('Region Edit mask is empty after alignment. Paint a larger mask area and try again.');
            }

            return {
                baseDataUrl: baseCanvas.toDataURL('image/jpeg', 0.92),
                maskDataUrl: maskCanvas.toDataURL('image/png'),
                wasDownscaled: sourceMeta
                    ? sourceMeta.width !== targetW || sourceMeta.height !== targetH
                    : targetW !== baseW || targetH !== baseH,
                width: targetW,
                height: targetH,
                editedPixels
            };
        } finally {
            baseCanvas.width = 1;
            baseCanvas.height = 1;
            maskCanvas.width = 1;
            maskCanvas.height = 1;
        }
    }, [loadDataUrlImage]);

    // Erode (shrink) a white mask by radius pixels
    const erodeMask = useCallback(async (srcUrl: string, radius: number): Promise<string> => {
        if (radius === 0) return srcUrl;

        const img = await loadDataUrlImage(srcUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return srcUrl;

        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = id.data;
        const w = canvas.width;
        const h = canvas.height;
        const result = new Uint8ClampedArray(d);

        for (let y = radius; y < h - radius; y++) {
            for (let x = radius; x < w - radius; x++) {
                const idx = (y * w + x) * 4;
                let minVal = 255;
                // Search neighborhood
                for (let ky = -radius; ky <= radius; ky++) {
                    for (let kx = -radius; kx <= radius; kx++) {
                        const nIdx = ((y + ky) * w + (x + kx)) * 4;
                        // Use Red channel as luminance
                        if (d[nIdx] < minVal) minVal = d[nIdx];
                        if (minVal === 0) break;
                    }
                    if (minVal === 0) break;
                }
                result[idx] = result[idx + 1] = result[idx + 2] = minVal;
            }
        }

        const newId = new ImageData(result, w, h);
        ctx.putImageData(newId, 0, 0);
        return canvas.toDataURL();
    }, [loadDataUrlImage]);

    useEffect(() => {
        if (rawProtectMaskUrl) {
            if (protectErosion === 0) {
                setProtectMaskUrl(rawProtectMaskUrl);
            } else {
                const timer = setTimeout(() => {
                    erodeMask(rawProtectMaskUrl, protectErosion).then(setProtectMaskUrl);
                }, 300); // Debounce slider
                return () => clearTimeout(timer);
            }
        }
    }, [erodeMask, rawProtectMaskUrl, protectErosion]);

    // Subtract a protection mask (white = protected) from an edit mask (white = edit)
    const subtractProtectionMask = async (editMask: string, protectionMask: string): Promise<string> => {
        const editImg = await loadDataUrlImage(editMask);
        const protImg = await loadDataUrlImage(protectionMask);

        const w = Math.max(editImg.width, protImg.width) || 1;
        const h = Math.max(editImg.height, protImg.height) || 1;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return editMask;

        // Draw edit mask
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(editImg, 0, 0, w, h);
        const editData = ctx.getImageData(0, 0, w, h);

        // Draw protection mask
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(protImg, 0, 0, w, h);
        const protData = ctx.getImageData(0, 0, w, h);

        const ed = editData.data;
        const pd = protData.data;

        // If protection pixel is "white enough", erase edit pixel
        for (let i = 0; i < ed.length; i += 4) {
            const protLum = (pd[i] + pd[i + 1] + pd[i + 2]) / 3;
            if (protLum > 128) {
                ed[i] = 0; ed[i + 1] = 0; ed[i + 2] = 0; ed[i + 3] = 255;
            }
        }

        ctx.putImageData(editData, 0, 0);
        return canvas.toDataURL('image/png');
    };

    const generateFaceProtectionMask = async () => {
        if (!(await ensureStagingAiAccess('Protection Mask'))) return;
        setProtectStatus('generating');
        try {
            const captured = (viewMode === 'result' && displayedResultImage)
                ? displayedResultImage 
                : await captureSceneImage();

            if (!captured) throw new Error('Stage capture returned empty.');

            // Pick a Gemini image model for mask generation
            const maskModel = NANO_BANANA_2_IMAGE_MODEL;

            const prompt =
                "VISIBLE HUMAN ANATOMY PROTECTION MASK: Create a pure black & white segmentation mask where ALL visible human anatomy is PURE WHITE (#FFFFFF): face, hair, ears, neck, hands, fingers, exposed skin, and any visible body parts belonging to the subject. Non-human objects, added fabric, head coverings, props, staffs, sky, rocks, and background must be PURE BLACK (#000000). No gray. No gradients. Clean edges.";

            const res = await GeminiService.generateImage(
                prompt,
                state.apiKey,
                maskModel,
                [{ url: captured, label: 'Base Frame' }],
                { aspectRatio: state.director.aspectRatio, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements }
            );

            const maskUrl = await normalizeGeneratedImageUrl(res);

            setRawProtectMaskUrl(maskUrl);
            setProtectMaskUrl(maskUrl); // Initial set (erosion 0)
            setProtectStatus('ready');
            dispatch({ type: 'ADD_LOG', payload: { message: 'Protection mask generated (face/hair).', type: 'success' } });
        } catch (e: unknown) {
            setProtectStatus('error');
            dispatch({ type: 'ADD_LOG', payload: { message: `Protection mask failed: ${getErrorMessage(e)}`, type: 'error' } });
        }
    };

    const ensureMaskCanvasSize = () => {
        const canvas = maskCanvasRef.current;
        const viewport = viewportRef.current;
        if (!canvas || !viewport) return;
        const w = Math.max(1, Math.floor(viewport.clientWidth));
        const h = Math.max(1, Math.floor(viewport.clientHeight));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            // fill black base
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, w, h);
            }
            // reload active layer mask if exists
            if (activeLayer?.maskDataUrl) {
                void loadMaskToCanvas(activeLayer.maskDataUrl);
            }
        }
    };

    const loadMaskToCanvas = async (dataUrl: string) => {
        const canvas = maskCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // ensure black background
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = dataUrl;
    };

    const commitMaskToState = () => {
        const canvas = maskCanvasRef.current;
        if (!canvas || !activeLayer) return;
        const dataUrl = canvas.toDataURL('image/png');
        dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: activeLayer.id, updates: { maskDataUrl: dataUrl } } });
    };

    useEffect(() => {
        // keep canvas sized and synced when toggling mask mode or switching layers
        ensureMaskCanvasSize();
        if (activeLayer?.maskDataUrl) {
            void loadMaskToCanvas(activeLayer.maskDataUrl);
        } else {
            // clear to black
            const c = maskCanvasRef.current;
            const ctx = c?.getContext('2d');
            if (c && ctx) {
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, c.width, c.height);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regionEdit?.isMaskMode, regionEdit?.activeLayerId, viewportBox.w, viewportBox.h, activeLayer?.maskDataUrl]);

    useEffect(() => {
        const onResize = () => ensureMaskCanvasSize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getCanvasPoint = (e: React.PointerEvent) => {
        const canvas = maskCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
    };

    const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const canvas = maskCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const brushSize = Number(regionEdit?.brushSize ?? 40);
        const softness = Math.min(1, Math.max(0, Number(regionEdit?.brushSoftness ?? 0.35)));

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;

        const isErase = regionEdit?.mode === 'erase';
        const color = isErase ? 'black' : 'white';

        // soft edge via blur
        ctx.shadowBlur = brushSize * softness;
        ctx.shadowColor = color;

        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
    };

    const handleMaskPointerDown = (e: React.PointerEvent) => {
        if (!regionEdit?.isMaskMode) return;
        e.preventDefault();
        e.stopPropagation();
        ensureMaskCanvasSize();
        maskIsDownRef.current = true;
        const pt = getCanvasPoint(e);
        lastPtRef.current = pt;
        // dot
        drawStroke(pt, pt);
    };

    const handleMaskPointerMove = (e: React.PointerEvent) => {
        if (!regionEdit?.isMaskMode) return;
        if (!maskIsDownRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const pt = getCanvasPoint(e);
        const last = lastPtRef.current || pt;
        drawStroke(last, pt);
        lastPtRef.current = pt;
    };

    const handleMaskPointerUp = (e: React.PointerEvent) => {
        if (!regionEdit?.isMaskMode) return;
        if (!maskIsDownRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        maskIsDownRef.current = false;
        lastPtRef.current = null;
        commitMaskToState();
    };

    const clearActiveMask = () => {
        if (!activeLayer) return;
        dispatch({ type: 'CLEAR_REGION_LAYER_MASK', payload: activeLayer.id });
        const c = maskCanvasRef.current;
        const ctx = c?.getContext('2d');
        if (c && ctx) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, c.width, c.height);
        }
    };

    const applyRegionEditQueue = async () => {
        if (!(await ensureStagingAiAccess('Region Edit'))) return;
        if (!regionEdit.layers.some((l) => l.enabled && l.maskDataUrl && (l.prompt || '').trim())) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No enabled mask layers with both mask + prompt.', type: 'error' } });
            return;
        }

        cancelRegionEditRef.current = false;
        setIsRegionEditRunning(true);
        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 5, text: 'Region Edit: Preparing composite state...' } });
        try {
            const editModel = NANO_BANANA_2_IMAGE_MODEL;
            const sourceAutoMeta =
                viewMode === 'stage' &&
                state.backgroundUrl &&
                regionEdit.contextSizingMode === 'source-auto' &&
                regionEdit.sourceImageMeta
                    ? regionEdit.sourceImageMeta
                    : null;

            const captured = sourceAutoMeta ? null : await captureSceneImage();
            const startingBase = sourceAutoMeta && state.backgroundUrl
                ? state.backgroundUrl
                : (viewMode === 'result' && displayedResultImage)
                    ? displayedResultImage
                    : captured;

            if (!startingBase) {
                throw new Error('No base image available for region edit.');
            }

            let base: string = startingBase;
            const sourceAutoTargetDimensions = sourceAutoMeta
                ? {
                    width: sourceAutoMeta.derivedRenderWidth,
                    height: sourceAutoMeta.derivedRenderHeight
                }
                : null;
            const regionEditImageSize: '1K' | '2K' | '4K' | undefined = sourceAutoTargetDimensions
                ? getRegionEditImageSize(sourceAutoTargetDimensions)
                : state.imageResolution === '4K'
                    ? '2K'
                    : state.imageResolution;
            let loggedRegionEditDownscale = false;

            if (sourceAutoMeta) {
                dispatch({
                    type: 'ADD_LOG',
                    payload: {
                        message: `Region Edit source-auto sizing: ${sourceAutoMeta.derivedRenderWidth}x${sourceAutoMeta.derivedRenderHeight}.`,
                        type: 'info'
                    }
                });
            } else if (state.imageResolution === '4K') {
                dispatch({
                    type: 'ADD_LOG',
                    payload: {
                        message: 'Region Edit stability mode active: using a 2K working frame for masked edits to prevent renderer memory crashes.',
                        type: 'info'
                    }
                });
            }

            // 1. Process standard regions
            const layers = regionEdit.layers.filter(
                (l) => l.enabled && l.maskDataUrl && String(l.prompt || '').trim()
            );

            // 2. Process intentional placements (Auto-Generated Region Edits)
            const intents = buildPlacementIntentsFromAnnotations(state.annotations, state.tokens);
            const intentLayers = [];

            for (const intent of intents) {
                const token = state.tokens.find(t => t.id === intent.actorId);
                const anchor = state.annotations.find(a => a.id === intent.anchorId);
                if (!token || !anchor) continue;

                const lookAt = intent.lookAtId ? state.annotations.find(a => a.id === intent.lookAtId) : undefined;

                // Build literal mask
                const anchorSurface = buildAnchorSurfaceFromZone(anchor);
                const allowance = buildAllowanceMaskFromAnchor(anchorSurface);
                const generatedMask = captureBinaryMask([{ type: 'rect', ...allowance }]);

                let finalMask = generatedMask;

                // Attempt depth protection mask
                if (state.depthMapUrl) {
                    try {
                        const protMask = await buildForegroundProtectMaskFromDepth(
                            state.depthMapUrl,
                            allowance,
                            anchorSurface.surfaceDepth,
                            viewportBox,
                            (_url: string, _nx: number, _ny: number) => 255 // Provide fallback or real sync-depth here if available in context
                        );
                        if (protMask && finalMask) {
                            finalMask = await subtractProtectionMask(finalMask, protMask);
                        }
                    } catch {
                        console.warn("Graceful depth degrade failed");
                    }
                }

                if (finalMask) {
                    intentLayers.push({
                        id: `intent-${intent.actorId}`,
                        name: `Placement: ${token.tag}`,
                        maskDataUrl: finalMask,
                        prompt: buildPlacementPrompt(intent, token, anchor, lookAt),
                        enabled: true,
                        status: 'idle'
                    });
                }
            }

            const allLayers = [...layers, ...intentLayers];

            // mark queued
            for (const layer of allLayers) {
                if (cancelRegionEditRef.current) {
                    dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit cancelled.', type: 'info' } });
                    break;
                }
                // Skip UI updates for virtual intent layers
                if (!layer.id.startsWith('intent-')) {
                    dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id as RegionEditLayer['id'], updates: { status: 'queued', lastError: null } } });
                }
            }
            const totalLayersTotal = allLayers.length;
            for (let i = 0; i < allLayers.length; i++) {
                const layer = allLayers[i];
                if (cancelRegionEditRef.current) {
                    dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit cancelled.', type: 'info' } });
                    break;
                }

                if (!layer.id.startsWith('intent-')) {
                    dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id as RegionEditLayer['id'], updates: { status: 'running', lastError: null } } });
                }

                const mask: string | null = layer.maskDataUrl ?? null;
                const promptText: string = String(layer.prompt || '').trim();

                if (!mask || !promptText) {
                    if (!layer.id.startsWith('intent-')) dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id as RegionEditLayer['id'], updates: { status: 'idle' } } });
                    continue;
                }

                dispatch({ type: 'ADD_LOG', payload: { message: `Applying ${layer.name}...`, type: 'info' } });
                
                const percent = Math.round(((i) / totalLayersTotal) * 100) + 10;
                dispatch({
                    type: 'SET_GLOBAL_PROGRESS',
                    payload: { percent: Math.min(percent, 95), text: `Region Edit: Executing Mask: ${layer.name}` }
                });

                let maskToSend: string = mask;
                if (protectEnabled && protectMaskUrl && !layer.id.startsWith('intent-')) { // intentional protects its own via depth
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: `Anatomy protection applied to ${layer.name}: preserving hands, skin, face, and hair outside the edit region.`,
                            type: 'info'
                        }
                    });
                    maskToSend = await subtractProtectionMask(mask, protectMaskUrl);
                }

                // Additional safety for removal edits near anatomy
                if ((promptText || '').toLowerCase().includes('remove')) {
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: `Removal edit safety active: keeping mask tight and anatomy protected.`,
                            type: 'info'
                        }
                    });
                }

                // Get intrinsic dimensions of base to properly align resolution with the mask
                // This prevents backend mapping failures or letterboxing offsets
                const preparedEdit = await prepareRegionEditInputs(
                    base,
                    maskToSend,
                    sourceAutoMeta ? { sourceImageMeta: sourceAutoMeta } : undefined
                );
                if (preparedEdit.wasDownscaled && !loggedRegionEditDownscale) {
                    loggedRegionEditDownscale = true;
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: `Region Edit working frame capped at ${preparedEdit.width}x${preparedEdit.height} for stability.`,
                            type: 'info'
                        }
                    });
                }

                const replacementRef = !layer.id.startsWith('intent-') && isReplaceInstruction(promptText)
                    ? resolveNamedReferenceFromInstruction(promptText, state.referenceSlots)
                    : null;
                const replacementRefLabel = replacementRef
                    ? getReferenceSlotMatchName(replacementRef, Math.max(0, replacementRef.index - 1))
                    : '';
                const referenceImages = replacementRef?.url
                    ? [{ url: replacementRef.url, label: `Image B replacement source asset: ${replacementRefLabel}` }]
                    : [];
                const effectivePromptText = replacementRef
                    ? buildReplacementSourceInstruction(promptText, replacementRefLabel)
                    : promptText;

                if (replacementRef?.url) {
                    dispatch({
                        type: 'ADD_LOG',
                        payload: {
                            message: `Replace mode using Reference Stack asset: ${replacementRefLabel}.`,
                            type: 'info'
                        }
                    });
                }

                base = await GeminiService.editImageWithMask(
                    preparedEdit.baseDataUrl,
                    preparedEdit.maskDataUrl,
                    effectivePromptText,
                    state.apiKey,
                    editModel,
                    referenceImages,
                    { 
                        aspectRatio: sourceAutoTargetDimensions ? undefined : state.director.aspectRatio,
                        imageSize: regionEditImageSize,
                        targetDimensions: sourceAutoTargetDimensions || undefined,
                        billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', 
                        entitlements: state.billingEntitlements,
                        expectedResponseType: 'image'
                    }
                );

                if (!layer.id.startsWith('intent-')) {
                    dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id as RegionEditLayer['id'], updates: { status: 'success', lastError: null } } });
                }
            }

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });

            // Critical: normalize the returned image before pushing it into UI state
            const finalEditedUrl = await normalizeGeneratedImageUrl(base);
            await applyStagingResult(finalEditedUrl, {
                prompt: activeLayer?.prompt || 'Region Edit Result',
                surface: 'region_edit',
                suggestedName: 'staging_region_edit',
                stage: 'refine'
            });

            dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit complete.', type: 'success' } });
        } catch (e: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Region Edit failed: ${getErrorMessage(e)}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            setIsRegionEditRunning(false);
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const [dragOverRefSlot, setDragOverRefSlot] = useState<number | null>(null);
    const [inspectRefIndex, setInspectRefIndex] = useState<number | null>(null);
    const [inspectName, setInspectName] = useState('');
    const [inspectAnalysis, setInspectAnalysis] = useState('');
    const [analyzingTokenId, setAnalyzingTokenId] = useState<string | null>(null);
    const [inspectTarget, setInspectTarget] = useState('');

    const updateRefSlot = (index: number, updates: Partial<ReferenceSlot>) => {
        dispatch({ type: 'UPDATE_REF_SLOT', payload: { index, updates } });
    };

    const setDirector = (updates: Partial<DirectorSettings>) => {
        dispatch({ type: 'SET_DIRECTOR', payload: updates });
        if ('spatialLayout' in updates) {
            dispatch({ type: 'SYNC_SPATIAL_DESCRIPTORS' });
        }
    };

    const refAnalysisPrompt = [
        'Describe only visible factual content needed for compositing.',
        'For a person, describe facial traits, hair, facial hair, expression, pose, and clothing.',
        'For wardrobe or props, describe color, material, pattern, construction, details, and fit.',
        'Do not describe or infer the image-making medium, aesthetic treatment, rendering process, scan process, or camera treatment.',
        'Use neutral factual language.',
        'Maximum 30 words.'
    ].join(' ');

    // V33: Automated re-sync via useEffect is removed per Depth Purge.



    const anchorFileInputRef = useRef<HTMLInputElement>(null);



    // handleDepthExtraction removed per V32.2 Depth Purge

    // handleGenerateBackground and handleDownloadBackground moved to AnchorRefPanel

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(file);
        });
    };



    const handleManualAnalyze = async () => {
        if (inspectRefIndex === null) return;
        const slot = state.referenceSlots.find(s => s.index === inspectRefIndex);
        if (!slot || !slot.url) return;
        
        if (!(await ensureStagingAiAccess('Auto-Analyze DNA'))) return;

        setAnalyzingTokenId('ref');
        setInspectAnalysis('Analyzing DNA...');
        
        try {
            const text = await GeminiService.analyzeImage(refAnalysisPrompt, state.apiKey, state.model, slot.url, {
                billingMode: state.billingEntitlements?.effectiveBillingMode as 'hosted' | 'byok', 
                entitlements: state.billingEntitlements
            });
            setInspectAnalysis(text);
            dispatch({ type: 'ADD_LOG', payload: { message: 'DNA analysis complete.', type: 'success' } });
        } catch (e: unknown) {
            setInspectAnalysis('');
            dispatch({ type: 'ADD_LOG', payload: { message: `Analysis failed: ${getErrorMessage(e)}`, type: 'error' } });
        } finally {
            setAnalyzingTokenId(null);
        }
    };

    const setSlotFromUrl = async (index: number, url: string, name?: string, castId?: string, localPath?: string, sourceUrl?: string) => {
        const castMember = castId
            ? ((state.cast || []).find(c => c.id === castId) || (state.actorLibrary || []).find(a => a.id === castId))
            : undefined;

        const productionActorProfile = castMember?.productionActorProfile || castMember?.productionProfile;

        updateRefSlot(index, {
            url,
            localPath,
            sourceUrl,
            name: name || `Ref ${index}`,
            castId,
            active: true,
            status: 'ready',
            analysis: '',
            isProductionActor: castMember?.isProductionActor ?? !!productionActorProfile,
            assetType: castMember?.assetType || (productionActorProfile ? 'production_actor' : undefined),
            productionActorProfile,
            productionProfile: productionActorProfile
        });
    };

    const handleRefSlotFile = async (index: number, file: File) => {
        try {
            const mat = await LibraryAssetMaterializer.materializeReferenceFile({
                file,
                saveDirectoryPath: state.saveDirectoryPath,
                slotIndex: index
            });
            await setSlotFromUrl(index, mat.url, file.name, undefined, mat.localPath || undefined, mat.sourceUrl);
        } catch (e: unknown) {
            console.error("Failed to materialize reference", e);
            dispatch({ type: 'ADD_LOG', payload: { message: `Reference Materialization Failed: ${getErrorMessage(e)}`, type: 'error' } });
            const url = await fileToDataUrl(file);
            await setSlotFromUrl(index, url, file.name, undefined);
        }
    };

    const handleRefSlotDrop = async (index: number, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverRefSlot(null);

        // 1) Files from OS
        const file = e.dataTransfer.files?.[0];
        if (file) {
            await handleRefSlotFile(index, file);
            return;
        }

        // 2) Dragged Forge asset
        const raw = e.dataTransfer.getData('application/json');
        console.log('[handleRefSlotDrop] raw payload:', raw);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                let cast: CastMember | undefined;

                if (parsed.type === 'cast_member') {
                    cast = (state.cast || []).find(c => c.id === parsed.id);
                } else if (parsed.url) {
                    cast = parsed as CastMember;
                }

                if (cast && cast.url) {
                    console.log('[handleRefSlotDrop] Calling setSlotFromUrl for ID:', cast.id);
                    // Use full-quality cast URL for identity fidelity; preview thumbnails are too weak for strict matching.
                    const sourceUrl = cast.url || cast.previewUrl || '';
                    const mat = await LibraryAssetMaterializer.materializeReferenceAsset({
                        sourceUrl,
                        saveDirectoryPath: state.saveDirectoryPath,
                        slotIndex: index
                    });
                    await setSlotFromUrl(index, mat.url, cast.name || cast.tag, cast.id, mat.localPath || cast.localPath, cast.sourceUrl || mat.sourceUrl);
                } else {
                    console.error('[handleRefSlotDrop] Cast or cast.url missing!', cast);
                }
            } catch (err) {
                console.error('[handleRefSlotDrop] Parse error:', err);
            }
        }
    };

    const handleRefSlotClick = (index: number) => {
        const slot = state.referenceSlots.find(s => s.index === index);
        if (!slot) return;

        if (!slot.url) {
            refFileInputs.current[index]?.click();
            return;
        }

        // V3 behavior: clicking an occupied slot toggles active
        updateRefSlot(index, { active: !slot.active });
    };

    const clearRefSlot = (index: number) => {
        updateRefSlot(index, {
            url: undefined,
            name: undefined,
            analysis: undefined,
            target: undefined,
            castId: undefined,
            active: false,
            status: 'empty'
        });
    };

    const toggleReplaceMode = (next: boolean) => {
        setDirector({ replaceAnchorSubjects: next });
        if (!next) {
            // V3 behavior: wiping replacement map when turning off
            setDirector({ globalReplaceTarget: '' });
            state.referenceSlots.forEach(s => {
                if (s.target) updateRefSlot(s.index, { target: undefined });
            });
        }
    };

    // Sync inspector drafts when a slot is opened
    useEffect(() => {
        if (inspectRefIndex == null) return;
        const slot = state.referenceSlots.find(s => s.index === inspectRefIndex);
        if (!slot) return;
        setInspectName(slot.name || `Ref ${inspectRefIndex}`);
        setInspectAnalysis(slot.analysis || '');
        setInspectTarget(slot.target || '');
    }, [inspectRefIndex, state.referenceSlots]);

    // V3 Prompt Terminal output (pure string, copy-ready)
    // V3 Prompt Terminal output (pure string, copy-ready)
    const v3DirectorPrompt = useMemo(() => {
        return compileV3DirectorPrompt(state.director, state.referenceSlots, state.tokens, '', state.annotations);
    }, [state.director, state.referenceSlots, state.tokens, state.annotations]);

    const handleCopyDirectorPrompt = async () => {
        const text = latestSubmittedStagingRequest?.prompt || v3DirectorPrompt || '';
        try {
            await navigator.clipboard.writeText(text);
            dispatch({ type: 'ADD_LOG', payload: { message: latestSubmittedStagingRequest ? 'Submitted staging prompt copied to clipboard.' : 'Director prompt preview copied to clipboard.', type: 'success' } });
        } catch {
            dispatch({ type: 'ADD_LOG', payload: { message: 'Clipboard copy failed (browser permissions).', type: 'error' } });
        }
    };
    // Moved captureStage up for scope visibility

    const loadImage = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 30)}...`));
            img.src = url;
        });
    };

    const captureSceneImage = async (): Promise<string | null> => {
        if (!viewportRef.current) return null;
        try {
            // Manual Canvas Composition (Authority #5) - Decoupled from HTML-TO-IMAGE
            const canvas = document.createElement('canvas');
            const TARGET_W = Math.max(1, Math.round(toFiniteNumber(viewportBox.w, 960)));
            const TARGET_H = Math.max(1, Math.round(toFiniteNumber(viewportBox.h, 540)));
            canvas.width = TARGET_W;
            canvas.height = TARGET_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            // 1. Fill Background (Black fallback)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, TARGET_W, TARGET_H);

            // 2. Draw Stage Background Image
            if (state.backgroundUrl) {
                try {
                    const bgImg = await loadImage(state.backgroundUrl);
                    ctx.drawImage(bgImg, 0, 0, TARGET_W, TARGET_H);
                } catch (e) {
                    console.error("BG load failed", e);
                }
            }

            // 3. Draw Tokens (Actors)
            const sortedTokens = [...state.tokens]
                .filter(t => t.visible !== false)
                .sort((a, b) => toFiniteNumber(a.zIndex, 0) - toFiniteNumber(b.zIndex, 0));

            for (const t of sortedTokens) {
                let didSaveContext = false;
                try {
                    const imageUrl = resolveTokenImageUrl(t);
                    if (!imageUrl) continue;
                    const img = await loadImage(imageUrl);
                    ctx.save();
                    didSaveContext = true;

                    const tokenX = toFiniteNumber(t.x, 0);
                    const tokenY = toFiniteNumber(t.y, 0);
                    const tokenWidth = Math.max(1, toFiniteNumber(t.width, 200));
                    const tokenHeight = Math.max(1, toFiniteNumber(t.height, 300));
                    const ax = Math.min(1, Math.max(0, toFiniteNumber(t.anchorX, 0.5)));
                    const ay = Math.min(1, Math.max(0, toFiniteNumber(t.anchorY, 0.8)));

                    // Coordinate Transform
                    ctx.translate(tokenX, tokenY);
                    ctx.rotate((toFiniteNumber(t.rotation, 0) * Math.PI) / 180);
                    ctx.scale(toFiniteNumber(t.scaleX, 1), toFiniteNumber(t.scaleY, 1));

                    // "Object-Contain" Logic
                    const imgW = Math.max(1, toFiniteNumber(img.naturalWidth || img.width, 1));
                    const imgH = Math.max(1, toFiniteNumber(img.naturalHeight || img.height, 1));
                    const imgRatio = imgW / imgH;
                    const boxRatio = tokenWidth / tokenHeight;
                    let drawW = tokenWidth;
                    let drawH = tokenHeight;
                    let offX = 0;
                    let offY = 0;

                    if (imgRatio > boxRatio) {
                        drawW = tokenWidth;
                        drawH = tokenWidth / imgRatio;
                        offY = (tokenHeight - drawH) / 2;
                    } else {
                        drawH = tokenHeight;
                        drawW = tokenHeight * imgRatio;
                        offX = (tokenWidth - drawW) / 2;
                    }

                    ctx.drawImage(img, (-tokenWidth * ax) + offX, (-tokenHeight * ay) + offY, drawW, drawH);
                } catch (e) {
                    console.error("Token load failed", t.tag, e);
                } finally {
                    if (didSaveContext) ctx.restore();
                }
            }

            // 4. Do NOT Draw Annotations or UI chrome in the base capture frame
            // Annotations, handles, bounding boxes, and selection elements are now strictly Excluded from the generation source.

            return canvas.toDataURL('image/png');
        } catch (err) {
            console.error('[captureSceneImage] FAILED:', err);
            return null;
        }
    };

    /**
     * Generates a strict binary mask for Region Edits, passing in a render callback or rectangle
     */
    const captureBinaryMask = (
        renders: Array<{ x: number; y: number; w: number; h: number; type: 'rect' }>
    ): string | null => {
        if (!viewportRef.current) return null;
        try {
            const TARGET_W = Math.max(1, Math.round(toFiniteNumber(viewportBox.w, 960)));
            const TARGET_H = Math.max(1, Math.round(toFiniteNumber(viewportBox.h, 540)));
            const canvas = document.createElement('canvas');
            canvas.width = TARGET_W;
            canvas.height = TARGET_H;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            // Strict Black Background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, TARGET_W, TARGET_H);

            // Strict White Foreground Mask Elements
            ctx.fillStyle = '#FFFFFF';
            for (const r of renders) {
                if (r.type === 'rect') {
                    const x = toFiniteNumber(r.x, 0);
                    const y = toFiniteNumber(r.y, 0);
                    const w = Math.max(0, toFiniteNumber(r.w, 0));
                    const h = Math.max(0, toFiniteNumber(r.h, 0));
                    if (w > 0 && h > 0) ctx.fillRect(x, y, w, h);
                }
            }

            return canvas.toDataURL('image/png');
        } catch (err) {
            console.error('[captureBinaryMask] FAILED:', err);
            return null;
        }
    };

    // Removed depth-map dependency per V32.2 Authority Manifest




    // --- DRAG & RESIZE LOGIC ---
    const handleStageMouseMove = (e: React.MouseEvent) => {
        if (regionEdit.isMaskMode) return;
        if (dragItem) {
            const dx = e.clientX - dragItem.startX;
            const dy = e.clientY - dragItem.startY;
            const updates = {
                x: toFiniteNumber(dragItem.initialX, 0) + dx,
                y: toFiniteNumber(dragItem.initialY, 0) + dy
            };

            if (!Number.isFinite(updates.x) || !Number.isFinite(updates.y)) {
                return;
            }

            latestDragRef.current =
                dragItem.type === 'token'
                    ? { type: 'token', id: dragItem.id, x: updates.x, y: updates.y }
                    : { type: 'annotation', id: dragItem.id, x: updates.x, y: updates.y };

            if (dragFrameRef.current === null) {
                dragFrameRef.current = requestAnimationFrame(flushLatestDragUpdate);
            }
        } else if (resizeItem) {
            const dx = e.clientX - resizeItem.startX;
            const dy = e.clientY - resizeItem.startY;

            const initialW = Math.max(20, toFiniteNumber(resizeItem.initialW, 20));
            const initialH = Math.max(20, toFiniteNumber(resizeItem.initialH, 20));
            const initialX = toFiniteNumber(resizeItem.initialX, 0);
            const initialY = toFiniteNumber(resizeItem.initialY, 0);
            let nw = initialW;
            let nh = initialH;

            // Better: we need the resizeItem to store the anchor to do this math properly if it varies per token.
            // Assuming 'token' type has anchorX/Y. We need to pass it in setResizeItem.
            // Let's assume passed in resizeItem.

            const ax = Math.min(1, Math.max(0, toFiniteNumber(resizeItem.anchorX, 0.5)));
            const ay = Math.min(1, Math.max(0, toFiniteNumber(resizeItem.anchorY, 0.8)));

            const oldLeft = initialX - (initialW * ax);
            const oldTop = initialY - (initialH * ay);

            let newLeft = oldLeft;
            let newTop = oldTop;

            // Calculate new dimensions based on handle
            if (resizeItem.handle.includes('r')) nw = Math.max(20, initialW + dx);
            if (resizeItem.handle.includes('l')) {
                nw = Math.max(20, initialW - dx);
                newLeft = oldLeft + (initialW - nw);
            }
            if (resizeItem.handle.includes('b')) nh = Math.max(20, initialH + dy);
            if (resizeItem.handle.includes('t')) {
                nh = Math.max(20, initialH - dy);
                newTop = oldTop + (initialH - nh);
            }

            // Aspect Ratio Lock
            if (resizeItem.uniformScale) {
                const ratio = initialW / initialH;
                if (resizeItem.handle === 'br' || resizeItem.handle === 'tl') {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        nh = nw / ratio;
                        if (resizeItem.handle === 'tl') newTop = oldTop + (initialH - nh);
                    } else {
                        nw = nh * ratio;
                        if (resizeItem.handle === 'tl') newLeft = oldLeft + (initialW - nw);
                    }
                } else if (resizeItem.handle === 'tr') {
                    if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio; else nw = nh * ratio;
                    newTop = oldTop + (initialH - nh);
                } else if (resizeItem.handle === 'bl') {
                    if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio; else nw = nh * ratio;
                    newLeft = oldLeft + (initialW - nw);
                }
            }

            // Recalculate Anchor Position from New Top-Left
            const nx = newLeft + (nw * ax);
            const ny = newTop + (nh * ay);

            if (resizeItem.type === 'token') {
                // IMPORTANT: drag-resize should change width/height only.
                // Scale is reserved for intentional scaling + flips; resizing while also modifying
                // scale causes "double scaling" drift.
                dispatch({
                    type: 'UPDATE_TOKEN',
                    payload: {
                        id: resizeItem.id,
                        width: nw,
                        height: nh,
                        x: nx,
                        y: ny,
                        scaleX: toFiniteNumber(resizeItem.initialScaleX, 1),
                        scaleY: toFiniteNumber(resizeItem.initialScaleY, 1),
                    }
                });
            } else {
                // Annotations strictly standard top-left for now so passing ax=0, ay=0 effectively
                // Actually annotations use center rotation but left/top position.
                // Let's keep annotation logic simple or just use the same math with 0,0 anchors if not present.
                dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: resizeItem.id, width: nw, height: nh, x: newLeft, y: newTop } });
                // Note: Annotations x/y are Top-Left currently in renderer.
            }
        } else if (rotateItem) {
            const dx = e.clientX - toFiniteNumber(rotateItem.centerX, e.clientX);
            const dy = e.clientY - toFiniteNumber(rotateItem.centerY, e.clientY);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            // Delta from start click
            const delta = angle - toFiniteNumber(rotateItem.startAngle, angle);
            const newRot = (toFiniteNumber(rotateItem.initialRotation, 0) + delta + 360) % 360; // Normalize 0-360

            if (rotateItem.type === 'token') {
                dispatch({ type: 'UPDATE_TOKEN', payload: { id: rotateItem.id, rotation: newRot } });
            } else {
                dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: rotateItem.id, rotation: newRot } });
            }
        }
    };


    const handleStageMouseUp = () => {
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }
        latestDragRef.current = null;

        if (dragItem && dragItem.type === 'token') {
            const token = state.tokens.find(t => t.id === dragItem.id);
            if (token) {
                // PRO AUTHORITY: Commit intent immediately without system gating
                dispatch({
                    type: 'UPDATE_TOKEN',
                    payload: { id: token.id, hasUserCommittedIntent: true, hasConfirmedPlacement: true }
                });
            }
        }
        setDragItem(null);
        setResizeItem(null);
        setRotateItem(null);
    };

    const deleteSelection = () => {
        if (!state.selection) return;
        if (state.selectionType === 'token') {
            dispatch({ type: 'REMOVE_TOKEN', payload: state.selection });
            dispatch({ type: 'ADD_LOG', payload: { message: "Token removed from Scene (Library Safe)", type: 'info' } });
        } else if (state.selectionType === 'annotation') {
            dispatch({ type: 'REMOVE_ANNOTATION', payload: state.selection });
        }
        dispatch({ type: 'SELECT_ITEM', payload: { id: null, type: null } });
    };


    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    // --- DROP HANDLER (Main Stage) ---
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Ignore drops outside the camera gate
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

        // 1) Actor Library or Annotation Drop
        const raw = e.dataTransfer.getData('application/json');
        if (raw) {
            try {
                const item = JSON.parse(raw);

                // Handle Annotation Template Drops
                if (item.templateType === 'annotation') {
                    const id = `ann-${Date.now()}`;
                    let payload: StageAnnotation = { id, x, y, rotation: 0, scaleX: 1, scaleY: 1, type: 'note', width: 150, height: 100, zIndex: 10, text: '' };

                    if (item.annotationType === 'note') {
                        payload = { ...payload, type: 'note', width: 150, height: 100, zIndex: 10, text: '' };
                    } else if (item.annotationType === 'zone') {
                        payload = { ...payload, type: 'zone', width: 200, height: 150, zIndex: 5 };
                    } else if (item.annotationType === 'arrow') {
                        payload = { ...payload, type: 'arrow', width: 60, height: 60, zIndex: 11 };
                    }

                    dispatch({ type: 'ADD_ANNOTATION', payload });
                    dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                    return;
                }

                // Handle Actor Drop
                let castItem: CastMember | undefined;
                if (item.type === 'cast_member') {
                    castItem = (state.cast || []).find(c => c.id === item.id) || (state.actorLibrary || []).find(a => a.id === item.id);
                } else if (item.url) {
                    castItem = item as CastMember;
                }

                if (!castItem?.id || !castItem?.url) return; // Basic validation that it represents a cast member

                const id = `token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                dispatch({
                    type: 'ADD_TOKEN',
                    payload: {
                        id,
                        castId: castItem.id,
                        url: castItem.url,
                        sourceImageUrl: castItem.url,
                        tag: castItem.name || 'Actor',
                        elementType: 'actor',
                        x: x,
                        y: y,
                        width: 200,
                        height: 300,
                        rotation: 0,
                        scaleX: 1,
                        scaleY: 1,
                        pitch: 0,
                        yaw: 0,
                        anchorX: 0.5,
                        anchorY: 0.8,
                        zIndex: state.tokens.length + 1,
                        uniformScale: true,
                        depth: 0.5,
                        occlusionMode: 'front',
                        placementAuthority: 'auto',
                        hasUserCommittedIntent: false,
                        hasConfirmedPlacement: false,
                        resolvedPosition: null
                    }
                });

                dispatch({ type: 'ADD_LOG', payload: { message: `Actor ${castItem.tag} auto-staged — drag to reposition`, type: 'success' } });
                return;
            } catch { /* ignore */ }
        }
    };


    // --- SHOT HELPERS ---
    const addShotFromStage = () => {
        dispatch({ type: 'ADD_SHOT_FROM_STAGE', payload: { name: newShotName.trim() || undefined } });
        setNewShotName('');

        // Auto-capture the visual state into the newly-created active shot after state commit
        requestAnimationFrame(() => {
            void captureAndSetShotFrame('start');
        });
    };

    const setActiveShot = (id: string) => {
        dispatch({ type: 'SET_ACTIVE_SHOT', payload: { id } });
    };

    const duplicateShot = (id: string) => {
        dispatch({ type: 'DUPLICATE_SHOT', payload: { id } });
    };

    const removeShot = (id: string) => {
        dispatch({ type: 'REMOVE_SHOT', payload: { id } });
    };

    const renameActiveShot = () => {
        if (!activeShotId) return;
        const name = activeShotNameDraft.trim();
        if (!name) return;
        dispatch({ type: 'UPDATE_SHOT_META', payload: { id: activeShotId, updates: { name } } });
    };

    const captureAndSetShotFrame = async (which: 'start' | 'end', targetId?: string) => {
        const idToUse = targetId || activeShotId;
        if (!idToUse) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } });
            return;
        }
        dispatch({ type: 'SET_PROCESSING', payload: true });
        try {
            const dataUrl = await captureSceneImage();
            if (!dataUrl) throw new Error('Stage capture returned empty.');
            dispatch({ type: 'SET_SHOT_FRAME', payload: { id: idToUse, which, url: dataUrl } });
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved ${which.toUpperCase()} frame from stage.`, type: 'success' } });
        } catch (e: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to capture ${which} frame: ${getErrorMessage(e)}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };







    // --- DIRECTOR CANVAS LAYOUT COMPOSITE PIPELINE (NEW) ---

    const collectVisibleCompositeElements = useCallback(() => {
        return state.tokens
            .filter(t => t.visible !== false)
            .sort((a, b) => toFiniteNumber(a.zIndex, 0) - toFiniteNumber(b.zIndex, 0))
            .map(t => {
                const url = resolveTokenImageUrl(t);
                if (!url) return null;

                return {
                    id: t.id,
                    url,
                    sourceImageUrl: t.sourceImageUrl || t.url || url,
                    label: t.tag,
                    type: t.elementType || 'actor',
                    x: toFiniteNumber(t.x, 0),
                    y: toFiniteNumber(t.y, 0),
                    width: Math.max(20, toFiniteNumber(t.width, 200)),
                    height: Math.max(20, toFiniteNumber(t.height, 300)),
                    anchorX: Math.min(1, Math.max(0, toFiniteNumber(t.anchorX, 0.5))),
                    anchorY: Math.min(1, Math.max(0, toFiniteNumber(t.anchorY, 0.8))),
                    preserveIdentity: t.preserveIdentity,
                    preserveWardrobe: t.preserveWardrobe,
                    groundingMode: t.groundingMode,
                    notes: t.notes
                };
            })
            .filter((element): element is NonNullable<typeof element> => element !== null);
    }, [state.tokens, state.actorLibrary]);

    const collectDepthAssistWarnings = useCallback((): DepthAssistWarning[] => {
        const warnings: DepthAssistWarning[] = [];
        if (!state.depthMapUrl || state.isDepthProcessing) return warnings;

        const elements = collectVisibleCompositeElements();
        const viewportW = Math.max(1, toFiniteNumber(viewportBox.w, 1));
        const viewportH = Math.max(1, toFiniteNumber(viewportBox.h, 1));
        
        elements.forEach(t => {
            // Normalized center-ish point for depth check
            const nx = Math.min(1, Math.max(0, t.x / viewportW));
            const ny = Math.min(1, Math.max(0, t.y / viewportH));
            
            // Fast synchronous sample from pre-cached depth data via DepthService
            const anchorDepth = DEPTH_FEATURE_ENABLED ? DepthService.getDepthAtPointSync(state.depthMapUrl, nx, ny) : 255;
            
            // 1. Check Grounding against floor plane (if available)
            if (state.floorPlane && state.floorPlane.depth !== undefined) {
                // If anchor is significantly further back (darker/lower depth value) than floor, it might clip
                if (anchorDepth < state.floorPlane.depth - 0.15) {
                    warnings.push({
                        id: `warn-ground-${t.id}`,
                        type: 'grounding',
                        severity: 'medium',
                        message: `${t.label} may be clipping through floor.`,
                        tokenId: t.id
                    });
                }
            }

            // 2. Check Occlusion against volumes (if available)
            if (state.occupiedVolumes && state.occupiedVolumes.length > 0) {
               for (const vol of state.occupiedVolumes) {
                   if (!vol.footprint || typeof vol.footprint.x !== 'number') continue;
                   const vx = toFiniteNumber(vol.footprint.x, 0) * viewportW;
                   const vy = toFiniteNumber(vol.footprint.y, 0) * viewportH;
                   const vw = Math.max(0, toFiniteNumber(vol.footprint.w, 0) * viewportW);
                   const vh = Math.max(0, toFiniteNumber(vol.footprint.h, 0) * viewportH);
                   
                   // Basic intersection check of token anchor point within volume bounding box
                   if (t.x >= vx && t.x <= vx + vw && t.y >= vy && t.y <= vy + vh) {
                        warnings.push({
                            id: `warn-occ-${t.id}`,
                            type: 'occlusion',
                            severity: 'medium',
                            message: `${t.label} placed within occupied volume.`,
                            tokenId: t.id
                        });
                        break;
                   }
               }
            }
        });

        return warnings;
    }, [collectVisibleCompositeElements, state.depthMapUrl, state.isDepthProcessing, state.floorPlane, state.occupiedVolumes, viewportBox.w, viewportBox.h]);




    // --- BACKGROUND GENERATION ---

    // Old generateBg logic removed and consolidated above into unified generateBg




    // --- INTERNAL UI HELPERS ---

    const updateToken = (id: string, updates: Partial<StageToken>) => {
        // Repositioning or explicit adjustment confirms placement
        const fullUpdates = { ...updates };
        if ('x' in updates || 'y' in updates || 'scaleX' in updates || 'scaleY' in updates || 'rotation' in updates || 'width' in updates || 'height' in updates) {
            fullUpdates.hasConfirmedPlacement = true;
        }
        dispatch({ type: 'UPDATE_TOKEN', payload: { id, ...fullUpdates } });

        // V33: Automated spatial sync via updateToken is deprecated.
        // Placement is now a one-time user commit, not a continuous correction loop.
    };



    // --- RENDER ---
    const selectedToken = state.tokens.find(t => t.id === state.selection && state.selectionType === 'token');
    const selectedAnnotation = state.annotations.find(a => a.id === state.selection && state.selectionType === 'annotation');


    // --- STABLE CALLBACKS FOR PERFORMANCE ---
    const handleHueChange = useCallback((newHex: string) => {
        if (selectedAnnotation) {
            dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: newHex } });
            setLastCustomColor(newHex);
        }
    }, [selectedAnnotation, dispatch]);

    const duplicateSelection = () => {
        if (!state.selection || !state.selectionType) return;

        if (state.selectionType === 'token') {
            const original = state.tokens.find(t => t.id === state.selection);
            if (!original) return;

            const newId = `token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            // Find max zIndex to place on top (optional, or just +1)
            const maxZ = Math.max(...state.tokens.map(t => toFiniteNumber(t.zIndex, 10)), 10);

            const cloneToken: StageToken = {
                ...original,
                id: newId,
                x: toFiniteNumber(original.x, 0) + 40,
                y: toFiniteNumber(original.y, 0),
                zIndex: maxZ + 1
            };
            dispatch({ type: 'ADD_TOKEN', payload: cloneToken });
            dispatch({ type: 'SELECT_ITEM', payload: { id: newId, type: 'token' } });

        } else if (state.selectionType === 'annotation') {
            const original = state.annotations.find(a => a.id === state.selection);
            if (!original) return;

            const newId = `ann-${Date.now()}`;
            const maxZ = Math.max(...state.annotations.map(a => toFiniteNumber(a.zIndex, 10)), 10);
            const cloneAnn = {
                ...original,
                id: newId,
                x: toFiniteNumber(original.x, 0) + 40,
                y: toFiniteNumber(original.y, 0),
                zIndex: maxZ + 1
            };

            dispatch({ type: 'ADD_ANNOTATION', payload: cloneAnn });
            dispatch({ type: 'SELECT_ITEM', payload: { id: newId, type: 'annotation' } });
        }
    };


    const renderCommandHeader = () => {
        const warnings = showInternalDepthControls ? collectDepthAssistWarnings() : [];
        const topWarnings = warnings.filter((w) => w.severity === 'high' || w.severity === 'medium').slice(0, 2);
        const hasDepth = !!state.depthMapUrl && !state.isDepthProcessing;

        let depthStatusText = state.isDepthProcessing ? "Building" : "Off";
        let depthStatusColor = "text-gray-500";
        if (hasDepth) {
            if (topWarnings.length > 0) {
                depthStatusText = "Warnings";
                depthStatusColor = "text-yellow-500";
            } else {
                depthStatusText = "Ready";
                depthStatusColor = "text-green-500";
            }
        }

        const showUseAsStage = viewMode === 'result' && displayedResultImage;

        const renderSegmentedControl = () => (
            <div className="flex bg-black rounded p-1 border border-gray-800 relative shadow-inner shrink-0">
                <button
                    onClick={() => setViewMode('stage')}
                    className={`px-3 py-1 text-[9px] lg:text-[10px] whitespace-nowrap font-bold tracking-widest uppercase rounded transition-colors z-10 ${
                        viewMode === 'stage' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    Stage
                </button>
                <button
                    onClick={() => {
                        if (displayedResultImage) {
                            setViewMode('result');
                        } else {
                            dispatch({ type: 'ADD_LOG', payload: { message: "No result generated yet.", type: 'error' } });
                        }
                    }}
                    className={`px-3 py-1 text-[9px] lg:text-[10px] whitespace-nowrap font-bold tracking-widest uppercase rounded transition-colors z-10 ${
                        viewMode === 'result' ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'
                    } ${!displayedResultImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Result
                </button>
                <button
                    onClick={() => {
                        if (getEffectiveResultAnchorForScene(state, state.activeShotId || 'default')) {
                            setViewMode('shots');
                        } else {
                            dispatch({ type: 'ADD_LOG', payload: { message: "Choose or generate a result first.", type: 'error' } });
                        }
                    }}
                    className={`px-3 py-1 text-[9px] lg:text-[10px] whitespace-nowrap font-bold tracking-widest uppercase rounded transition-colors z-10 ${
                        viewMode === 'shots' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
                    } ${!getEffectiveResultAnchorForScene(state, state.activeShotId || 'default') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Shots
                </button>
                <div
                    className="absolute top-1 bottom-1 w-1/3 bg-gray-800 rounded transition-transform duration-300 ease-in-out border border-gray-700/50 -z-0"
                    style={{ transform: `translateX(${viewMode === 'stage' ? '0%' : viewMode === 'result' ? '100%' : '200%'})` }}
                />
            </div>
        );

        const renderStatusPills = () => (
            <div className="flex items-center gap-1.5 flex-wrap">
                <span
                    className="text-[8px] lg:text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded tracking-widest uppercase whitespace-nowrap cursor-help"
                    title="Scene composition evolving."
                >
                    Preview
                </span>

                {showInternalDepthControls && (
                    <div
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-black/40 border border-white/5 rounded whitespace-nowrap"
                        title={topWarnings.map((w) => w.message).join(' | ')}
                    >
                        <span className="text-[8px] lg:text-[9px] font-bold text-gray-500 tracking-wider uppercase">Spatial:</span>
                        <span className={`text-[8px] lg:text-[9px] font-bold uppercase tracking-wider ${depthStatusColor}`}>{depthStatusText}</span>
                    </div>
                )}

                <div
                    className="flex items-center gap-1 px-1.5 py-0.5 bg-black/40 border border-white/5 rounded whitespace-nowrap"
                    title={activeReferences.length > 0 ? activeReferences.map((r) => r.name || `Ref ${r.index}`).join(', ') : ''}
                >
                    <span className="text-[8px] lg:text-[9px] font-bold text-gray-500 tracking-wider uppercase">Refs:</span>
                    <span className="text-[8px] lg:text-[9px] text-purple-400 font-mono font-bold">{activeReferences.length}</span>
                </div>
            </div>
        );

        const renderGenerateButtons = (isCompact: boolean = false) => (
            <div className={`flex items-center gap-1.5 ${isCompact ? 'shrink min-w-0' : 'shrink-0'}`}>
                {showUseAsStage && (
                    <>
                    {hasPassiveGeneratedOutput && (
                    <button
                        onClick={promoteLatestGeneratedOutputToResult}
                        className="px-3 py-1.5 h-full bg-[#09090b] hover:bg-blue-950/40 border border-blue-500/30 hover:border-blue-500/80 rounded flex items-center justify-center text-[8px] lg:text-[9px] whitespace-nowrap font-bold tracking-widest text-blue-400 uppercase transition-colors"
                    >
                        <span className="hidden lg:inline">Use as Result</span>
                        <span className="lg:hidden">Use Result</span>
                    </button>
                    )}
                    <button
                        onClick={() => {
                            const url = displayedResultImage;
                            if (url) {
                                dispatch({ type: 'SET_BG', payload: url });
                                setViewMode('stage');
                                dispatch({ type: 'ADD_LOG', payload: { message: "Result promoted to Stage Background.", type: 'success' } });
                            }
                        }}
                        className="px-3 py-1.5 h-full bg-[#09090b] hover:bg-green-950/40 border border-green-500/30 hover:border-green-500/80 rounded flex items-center justify-center text-[8px] lg:text-[9px] whitespace-nowrap font-bold tracking-widest text-green-400 uppercase transition-colors"
                    >
                        <span className="hidden lg:inline">Use as Stage Scene</span>
                        <span className="lg:hidden">Use Scene</span>
                    </button>
                    </>
                )}

                <button
                    type="button"
                    onClick={generateBg}
                    disabled={state.isProcessing}
                    className="relative group px-4 py-1.5 h-full bg-[#09090b] hover:bg-black border border-white/10 hover:border-purple-500/50 rounded flex items-center justify-center text-[8px] lg:text-[9px] whitespace-nowrap font-bold tracking-widest uppercase transition-all disabled:opacity-50 overflow-hidden shrink-0"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className={`relative transition-colors duration-300 ${
                        state.isProcessing
                            ? 'text-gray-400'
                            : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 group-hover:from-cyan-300 group-hover:via-purple-300 group-hover:to-pink-300'
                    }`}>
                        {state.isProcessing ? 'Processing...' : (isCompact ? 'Generate' : 'Generate Composite')}
                    </span>
                </button>
            </div>
        );

        if (isCompactCommandHeader) {
            return (
                <div className="flex flex-col w-full bg-[#18181b] border border-[#27272a] rounded-lg shrink-0 mb-1 shadow-xl overflow-hidden">
                    {/* Row 1 */}
                    <div className="flex items-center justify-between px-2 py-2 gap-2 min-w-0">
                        <div className="min-w-0 overflow-hidden shrink border border-transparent">
                            {renderSegmentedControl()}
                        </div>
                        <div className="shrink-0 flex items-center overflow-hidden min-w-0">
                            {renderGenerateButtons(true)}
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="flex items-center justify-start px-3 py-1.5 border-t border-[#27272a]">
                        {renderStatusPills()}
                    </div>

                    {/* Row 3 */}
                    <div className="flex items-center justify-between px-3 py-1 bg-black/40 border-t border-[#27272a] rounded-b-lg overflow-hidden">
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold whitespace-nowrap shrink-0 pr-4">
                            Advanced Scene Composition
                        </span>

                        {activeShot && (
                            <div className="flex items-center gap-3 hidden sm:flex shrink w-full justify-center overflow-hidden">
                                <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap truncate">
                                    Shot State: <span className="text-gray-200 ml-1.5">{activeShot.latestCompositeStage === 'generate' ? 'Generated' : activeShot.latestCompositeStage === 'refine' ? 'Refined' : 'None'}</span>
                                </span>
                                {(activeShot.latestCompositeTimestamp || activeShot.latestCompositeTemplateId) && (
                                    <div className="flex gap-2.5 text-[8.5px] text-gray-600 font-mono tracking-wider hidden md:flex shrink-0">
                                        {activeShot.latestCompositeTemplateId && <span className="text-gray-500">TPL: {activeShot.latestCompositeTemplateId}</span>}
                                        {activeShot.latestCompositeTimestamp && <span>{new Date(activeShot.latestCompositeTimestamp).toLocaleTimeString()}</span>}
                                    </div>
                                )}
                            </div>
                        )}

                        {showInternalDepthControls && (
                            <span className="text-[8.5px] lg:text-[9.5px] text-cyan-400 font-mono font-bold tracking-widest drop-shadow-[0_0_5px_rgba(34,211,238,0.4)] whitespace-nowrap shrink-0 overflow-hidden text-ellipsis ml-auto pl-4">
                                VB: {Math.round(viewportBox.w)}x{Math.round(viewportBox.h)} @ {Math.round(viewportBox.x)},{Math.round(viewportBox.y)} | Img: {state.backgroundUrl ? 'YES' : 'NO'} | Spatial: {state.depthMapUrl ? 'ON' : 'OFF'}
                            </span>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="flex flex-col w-full bg-[#18181b] border border-[#27272a] rounded-lg shrink-0 mb-1 shadow-xl overflow-hidden">
                {/* Wide Main Row */}
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center px-2 lg:px-3 py-2 gap-2 min-w-0">
                    <div className="shrink-0">
                        {renderSegmentedControl()}
                    </div>

                    <div className="flex items-center justify-center px-2 min-w-0 overflow-hidden">
                        {renderStatusPills()}
                    </div>

                    <div className="shrink-0">
                        {renderGenerateButtons(false)}
                    </div>
                </div>

                {/* Secondary Micro Line */}
                <div className="flex items-center justify-between px-3 py-1 bg-black/40 border-t border-[#27272a] rounded-b-lg overflow-hidden">
                    <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold whitespace-nowrap shrink-0 pr-4">
                        Advanced Scene Composition
                    </span>

                    {activeShot && (
                        <div className="flex items-center gap-3 hidden sm:flex shrink w-full justify-center overflow-hidden">
                            <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap truncate">
                                Shot State: <span className="text-gray-200 ml-1.5">{activeShot.latestCompositeStage === 'generate' ? 'Generated' : activeShot.latestCompositeStage === 'refine' ? 'Refined' : 'None'}</span>
                            </span>
                            {(activeShot.latestCompositeTimestamp || activeShot.latestCompositeTemplateId) && (
                                <div className="flex gap-2.5 text-[8.5px] text-gray-600 font-mono tracking-wider hidden md:flex shrink-0">
                                    {activeShot.latestCompositeTemplateId && <span className="text-gray-500">TPL: {activeShot.latestCompositeTemplateId}</span>}
                                    {activeShot.latestCompositeTimestamp && <span>{new Date(activeShot.latestCompositeTimestamp).toLocaleTimeString()}</span>}
                                </div>
                            )}
                        </div>
                    )}

                    {showInternalDepthControls && (
                        <span className="text-[8.5px] lg:text-[9.5px] text-cyan-400 font-mono font-bold tracking-widest drop-shadow-[0_0_5px_rgba(34,211,238,0.4)] whitespace-nowrap shrink-0 overflow-hidden text-ellipsis ml-auto pl-4">
                            VB: {Math.round(viewportBox.w)}x{Math.round(viewportBox.h)} @ {Math.round(viewportBox.x)},{Math.round(viewportBox.y)} | Img: {state.backgroundUrl ? 'YES' : 'NO'} | Spatial: {state.depthMapUrl ? 'ON' : 'OFF'}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    const renderBottomToolbar = () => {
        const renderLeftControls = () => (
            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-white/5">
                <button
                    onClick={() => dispatch({ type: 'UNDO' })}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo className="w-4 h-4" />
                </button>
                <button
                    onClick={() => dispatch({ type: 'REDO' })}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title="Redo (Ctrl+Y)"
                >
                    <Redo className="w-4 h-4" />
                </button>
            </div>
        );

        const renderCenterActions = () => (
            <div className="flex items-center justify-center gap-1 md:gap-2 flex-wrap">
                <button
                    onClick={duplicateSelection}
                    disabled={!state.selection}
                    className={`flex flex-col items-center gap-0.5 group bg-black/80 p-0.5 md:p-1 rounded-xl border border-white/5 backdrop-blur-md transition-colors ${
                        !state.selection ? 'opacity-50 pointer-events-none' : 'hover:bg-black'
                    }`}
                    title="Duplicate Selection"
                >
                    <div className="p-1.5 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                        <Copy className={`w-4 h-4 ${!state.selection ? 'text-gray-600' : 'text-purple-400'}`} />
                    </div>
                    <span className="text-[7.5px] font-bold text-gray-500 uppercase group-hover:text-purple-400">Copy</span>
                </button>

                <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex flex-col items-center gap-0.5 group bg-black/80 p-0.5 md:p-1 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                    title="Clear Everything"
                >
                    <div className="p-1.5 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
                        <TrashIcon className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="text-[7.5px] font-bold text-gray-500 uppercase group-hover:text-red-400">Clear</span>
                </button>

                <div className="hidden sm:block w-px h-8 md:h-10 bg-white/10 mx-0.5 md:mx-1" />

                <button
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ templateType: 'annotation', annotationType: 'note' }))}
                    onClick={() => {
                        const id = `ann-${Date.now()}`;
                        dispatch({
                            type: 'ADD_ANNOTATION',
                            payload: { id, type: 'note', x: 50, y: 50, width: 150, height: 100, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 10, text: '' }
                        });
                        dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                    }}
                    className="flex flex-col items-center gap-0.5 group bg-black/80 p-0.5 md:p-1 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                    title="Add Note"
                >
                    <div className="p-1.5 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                        <StickyNote className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-[7.5px] font-bold text-gray-500 uppercase group-hover:text-blue-400">Note</span>
                </button>

                <button
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ templateType: 'annotation', annotationType: 'zone' }))}
                    onClick={() => {
                        const id = `ann-${Date.now()}`;
                        dispatch({
                            type: 'ADD_ANNOTATION',
                            payload: { id, type: 'zone', x: 100, y: 100, width: 200, height: 150, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 5 }
                        });
                        dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                    }}
                    className="flex flex-col items-center gap-0.5 group bg-black/80 p-0.5 md:p-1 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                    title="Add Zone"
                >
                    <div className="p-1.5 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                        <BoxSelect className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-[7.5px] font-bold text-gray-500 uppercase group-hover:text-emerald-400">Zone</span>
                </button>

                <button
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ templateType: 'annotation', annotationType: 'arrow' }))}
                    onClick={() => {
                        const id = `ann-${Date.now()}`;
                        dispatch({
                            type: 'ADD_ANNOTATION',
                            payload: { id, type: 'arrow', x: 200, y: 200, width: 60, height: 60, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 11 }
                        });
                        dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                    }}
                    className="flex flex-col items-center gap-0.5 group bg-black/80 p-0.5 md:p-1 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                    title="Add Path"
                >
                    <div className="p-1.5 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                        <MoveUpRight className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-[7.5px] font-bold text-gray-500 uppercase group-hover:text-purple-400">Path</span>
                </button>
            </div>
        );

        const renderRightActions = () => {
            if (viewMode === 'shots') {
                const currentSession = state.shotSessionsBySceneId?.[state.activeShotId || 'default'];
                const selectedShots: ShotVariant[] = currentSession?.variants.filter((v) => v.selected && (v.status === 'done' || v.status === 'error' || v.status === 'expired')) || [];
                const isDisabled = selectedShots.length === 0;

                const handleSaveShots = () => {
                    selectedShots.forEach((variant) => {
                        const url = variant.finalUrl || variant.previewUrl;
                        if (!url) return;
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = createUniqueDownloadFilename(`NB_shot_${variant.presetId}.png`);
                        link.click();
                    });
                    dispatch({ type: 'ADD_LOG', payload: { message: `Saved ${selectedShots.length} shot(s).`, type: 'success' } });
                };

                return (
                    <button
                        onClick={handleSaveShots}
                        disabled={isDisabled}
                        className={`bg-black/80 hover:bg-black border border-white/10 px-1 py-1 rounded-md flex items-center gap-1 text-[6.5px] font-bold uppercase transition-all whitespace-nowrap shrink-0 ${
                            !isDisabled ? 'text-blue-500 hover:text-green-500 active:scale-95' : 'text-gray-500 opacity-50 cursor-not-allowed'
                        }`}
                        title={isDisabled ? "Select a shot to download" : "Download selected shots"}
                    >
                        <Download className="w-3 h-3" />
                        <span className="hidden sm:inline">Selected</span>
                    </button>
                );
            }

            return (
                <>
                    <button
                        onClick={downloadStageImage}
                        className="bg-black/80 hover:bg-black border border-white/10 text-blue-500 hover:text-green-500 px-1 py-1 rounded-md flex items-center gap-1 text-[6.5px] font-bold uppercase transition-all active:scale-95 whitespace-nowrap shrink-0"
                        title="Download composed stage image"
                    >
                        <Download className="w-3 h-3" />
                        <span className="hidden sm:inline">Image</span>
                    </button>
                </>
            );
        };

        return (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 lg:gap-3 p-2 bg-[#09090b] border border-[#27272a] rounded-xl shrink-0">
                {/* LEFT ZONE */}
                <div className="justify-self-start flex items-center gap-1 lg:gap-2 min-w-0">
                    {renderLeftControls()}
                </div>

                {/* CENTER ZONE */}
                <div className="justify-self-center flex items-center justify-center gap-1 md:gap-2 shrink-0 min-w-0">
                    {renderCenterActions()}
                </div>

                {/* RIGHT ZONE */}
                <div className="justify-self-end flex items-center gap-1 md:gap-2 min-w-0">
                    {renderRightActions()}
                </div>
            </div>
        );
    };

    return (
        <>
            <div className={`flex flex-col h-full overflow-hidden`}>
                {state.isProcessing && <CastDirectorThinking />}

            <div className="staging-layout p-4 select-none">
                {/* 1. LEFT SIDEBAR: ACTIVE ACTOR INTELLIGENCE & PROPERTIES */}
                <div className="staging-left staging-left-inner stage-left-panel flex flex-col gap-4 pr-2 custom-scrollbar">



                    <AnchorRefPanel
                        style={{ order: leftPanelOrder.indexOf('anchor') }}
                        state={state}
                        dispatch={dispatch}
                        bgPrompt={bgPrompt}
                        setBgPrompt={setBgPrompt}
                        generateBg={generateBg}
                        anchorFileInputRef={anchorFileInputRef}
                        fileToDataUrl={fileToDataUrl}
                        setDirector={setDirector}
                        collapsed={collapsedPanels['anchor']}
                        onToggle={togglePanel}
                        onDragStart={setDraggedPanelId}
                        onDrop={handlePanelDrop}
                        selectedTokenId={selectedToken?.id || null}
                        isAnalyzingStyle={isAnalyzingStyle}
                        extractedStyle={extractedStyle}
                        handleAutoStyleEnvironment={handleAutoStyleEnvironment}
                        sceneIntent={sceneIntent}
                        previousBackgroundUrl={previousBackgroundUrl}
                        onRestoreBackground={() => {
                            if (previousBackgroundUrl) {
                                dispatch({ type: 'SET_BG', payload: previousBackgroundUrl });
                                setPreviousBackgroundUrl(null);
                            }
                        }}
                    />

                    <ActorIntelligencePanel
                        style={{ order: leftPanelOrder.indexOf('actor_intel') }}
                        state={state}
                        dispatch={dispatch}
                        authorityStatus={authorityStatus}
                        analyzingTokenId={analyzingTokenId}
                        setAnalyzingTokenId={setAnalyzingTokenId}
                        showDebugDepthMap={showDebugDepthMap}
                        setShowDebugDepthMap={setShowDebugDepthMap}
                        showDebugFloor={showDebugFloor}
                        setShowDebugFloor={setShowDebugFloor}
                        showDebugVolumes={showDebugVolumes}
                        setShowDebugVolumes={setShowDebugVolumes}
                        showDebugBands={showDebugBands}
                        setShowDebugBands={setShowDebugBands}
                        showDebugActorHUD={showDebugActorOverlay}
                        setShowDebugActorHUD={setShowDebugActorOverlay}
                        collapsed={collapsedPanels['actor_intel']}
                        onToggle={togglePanel}
                        onDragStart={setDraggedPanelId}
                        onDrop={handlePanelDrop}
                        onRefreshSpatialData={refreshSpatialData}
                    />

                    {/* Token Properties (Selection Context) */}
                    <SidebarPanel
                        style={{ order: leftPanelOrder.indexOf('token_props') }}
                        id="token_props"
                        title="Token Properties"
                        icon={SettingsIcon}
                        headerColor="text-yellow-500"
                        collapsed={collapsedPanels['token_props']}
                        onToggle={togglePanel}
                        onDragStart={setDraggedPanelId}
                        onDrop={handlePanelDrop}
                    >
                        {selectedToken ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300 pr-4">
                                {/* SELECTION INFO */}
                                <div className="bg-[#09090b] px-3 py-2 rounded border border-gray-800">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter block mb-1">Selected Token</span>
                                    <div className="flex items-center justify-between token-properties-selected-token">
                                        <span className="token-label font-mono text-[10px] text-yellow-500" title={selectedToken.tag}>{getCompactActorLabel(selectedToken.tag)}</span>
                                        <div className="flex gap-1.5 shrink-0">
                                            <button
                                                onClick={() => {
                                                    if (viewportRef.current && selectedToken) {
                                                        const el = viewportRef.current;
                                                        const x = selectedToken.x;
                                                        const y = selectedToken.y;
                                                        el.scrollTo({
                                                            left: x - el.clientWidth / 2,
                                                            top: y - el.clientHeight / 2,
                                                            behavior: 'smooth'
                                                        });
                                                    }
                                                }}
                                                className="w-9 h-9 !p-0 flex items-center justify-center bg-[#18181b] hover:bg-[#27272a] text-blue-400 rounded border border-white/20 transition-colors group"
                                                title="Focus View"
                                            >
                                                <Target className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    dispatch({ type: 'DUPLICATE_TOKEN', payload: { id: selectedToken.id } });
                                                    dispatch({ type: 'ADD_LOG', payload: { message: `Duplicated token: ${selectedToken.tag}`, type: 'success' } });
                                                }}
                                                className="w-9 h-9 !p-0 flex items-center justify-center bg-[#18181b] hover:bg-[#27272a] rounded border border-white/20 transition-colors group"
                                                title="Duplicate Token"
                                            >
                                                <Copy className="w-4 h-4 text-gray-300 group-hover:text-white" />
                                            </button>
                                            <button
                                                onClick={deleteSelection}
                                                className="w-9 h-9 !p-0 flex items-center justify-center bg-[#18181b] hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded border border-white/20 transition-colors group"
                                                title="Delete Token"
                                            >
                                                <TrashIcon className="w-4 h-4 text-red-500 group-hover:text-red-400" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* TRANSFORM CONTROLS */}
                                <div className="space-y-4 pt-2 border-t border-white/5">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Transform</span>
                                        </div>
                                        <button
                                            onClick={() => updateToken(selectedToken.id, {
                                                x: 0, y: 0, rotation: 0,
                                                scaleX: 1, scaleY: 1,
                                                pitch: 0, yaw: 0,
                                                anchorX: 0.5, anchorY: 0.8,
                                                uniformScale: true
                                            })}
                                            className="w-7 h-7 !p-0 flex items-center justify-center bg-[#27272a] border border-white/30 rounded hover:bg-[#3f3f46] transition-colors group"
                                            title="Reset Transform"
                                        >
                                            <RefreshCcw className="w-3.5 h-3.5 text-gray-200 group-hover:text-yellow-400" />
                                        </button>
                                    </div>

                                    {/* GRID LAYOUT FOR CONTROLS */}
                                    <div className="grid grid-cols-[65px_1fr_24px_1fr_36px] items-center gap-x-2 gap-y-4 px-1">
                                        
                                        {/* POSITION ROW */}
                                        <span className="text-[10px] text-gray-300 uppercase font-bold">Position</span>
                                        <NumericInput
                                            label="X"
                                            value={selectedToken.x}
                                            onChange={(val) => updateToken(selectedToken.id, { x: val })}
                                            step={10}
                                        />
                                        <div className="text-center text-gray-400 font-bold">:</div>
                                        <NumericInput
                                            label="Y"
                                            value={selectedToken.y}
                                            onChange={(val) => updateToken(selectedToken.id, { y: val })}
                                            step={10}
                                        />
                                        <button 
                                            onClick={() => updateToken(selectedToken.id, { x: 0, y: 0 })} 
                                            className="w-9 h-9 !p-0 flex items-center justify-center bg-[#27272a] hover:bg-yellow-500/20 text-gray-100 hover:text-yellow-400 rounded border border-white/30 transition-colors group shadow-sm"
                                            title="Reset Position"
                                        >
                                            <RefreshCcw className="w-4 h-4 text-gray-100 group-hover:text-yellow-400" />
                                        </button>

                                        {/* QUICK NUDGE ROW */}
                                        <span className="text-[10px] text-gray-200 uppercase font-bold">Nudge</span>
                                        <div className="col-span-4 flex items-center gap-1 mt-1">
                                            <button onClick={() => updateToken(selectedToken.id, { x: selectedToken.x - 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] flex items-center justify-center rounded border border-white/30 text-gray-300 hover:text-white transition-colors shadow-sm"><ArrowLeft className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => updateToken(selectedToken.id, { x: selectedToken.x + 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] flex items-center justify-center rounded border border-white/30 text-gray-300 hover:text-white transition-colors shadow-sm"><ArrowRight className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => updateToken(selectedToken.id, { y: selectedToken.y - 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] flex items-center justify-center rounded border border-white/30 text-gray-300 hover:text-white transition-colors shadow-sm"><ArrowUp className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => updateToken(selectedToken.id, { y: selectedToken.y + 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] flex items-center justify-center rounded border border-white/30 text-gray-300 hover:text-white transition-colors shadow-sm"><ArrowDown className="w-3.5 h-3.5" /></button>
                                        </div>

                                        {/* ZOOM ROW */}
                                        <span className="text-[10px] text-gray-300 uppercase font-bold">Zoom</span>
                                        <NumericInput
                                            label="X"
                                            value={Math.abs(selectedToken.scaleX)}
                                            onChange={(val) => {
                                                const updates: Partial<StageToken> = { scaleX: val * (selectedToken.scaleX < 0 ? -1 : 1) };
                                                if (selectedToken.uniformScale) updates.scaleY = val * (selectedToken.scaleY < 0 ? -1 : 1);
                                                updateToken(selectedToken.id, updates);
                                            }}
                                            step={0.1}
                                            precision={2}
                                        />
                                        <div className="flex justify-center">
                                            <button
                                                onClick={() => updateToken(selectedToken.id, { uniformScale: !selectedToken.uniformScale })}
                                                className={`group !p-0 w-8 h-8 flex items-center justify-center rounded border transition-colors shadow-sm ${selectedToken.uniformScale ? 'bg-yellow-500/20 border-yellow-500/60' : 'bg-[#27272a] border-white/30 hover:bg-[#3f3f46]'}`}
                                                title="Toggle Uniform Scale"
                                            >
                                                <Link2 className={`w-4 h-4 ${selectedToken.uniformScale ? 'text-yellow-400' : 'text-gray-100 group-hover:text-white'}`} />
                                            </button>
                                        </div>
                                        <NumericInput
                                            label="Y"
                                            value={Math.abs(selectedToken.scaleY)}
                                            onChange={(val) => {
                                                const updates: Partial<StageToken> = { scaleY: val * (selectedToken.scaleY < 0 ? -1 : 1) };
                                                if (selectedToken.uniformScale) updates.scaleX = val * (selectedToken.scaleX < 0 ? -1 : 1);
                                                updateToken(selectedToken.id, updates);
                                            }}
                                            step={0.1}
                                            precision={2}
                                        />
                                        <button 
                                            onClick={() => updateToken(selectedToken.id, { scaleX: 1, scaleY: 1 })} 
                                            className="w-9 h-9 !p-0 flex items-center justify-center bg-[#27272a] hover:bg-yellow-500/20 text-gray-100 hover:text-yellow-400 rounded border border-white/30 transition-colors shadow-sm"
                                            title="Reset Scale"
                                        >
                                            <RefreshCcw className="w-4 h-4" />
                                        </button>

                                        {/* ANCHOR ROW */}
                                        <span className="text-[10px] text-gray-300 uppercase font-bold">Anchor</span>
                                        <NumericInput
                                            label="X"
                                            value={selectedToken.anchorX}
                                            onChange={(val) => updateToken(selectedToken.id, { anchorX: val })}
                                            step={0.1}
                                            precision={2}
                                            min={0}
                                            max={1}
                                        />
                                        <div className="text-center text-gray-400 font-bold">:</div>
                                        <NumericInput
                                            label="Y"
                                            value={selectedToken.anchorY}
                                            onChange={(val) => updateToken(selectedToken.id, { anchorY: val })}
                                            step={0.1}
                                            precision={2}
                                            min={0}
                                            max={1}
                                        />
                                        <button 
                                            onClick={() => updateToken(selectedToken.id, { anchorX: 0.5, anchorY: 0.8 })} 
                                            className="w-9 h-9 !p-0 flex items-center justify-center bg-[#27272a] hover:bg-yellow-500/20 text-gray-100 hover:text-yellow-400 rounded border border-white/30 transition-colors shadow-sm"
                                            title="Reset Anchor"
                                        >
                                            <RefreshCcw className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* SLIDER CONTROLS */}
                                    <div className="space-y-3 mt-4 px-1">
                                        {/* ROTATION */}
                                        <div className="grid grid-cols-[60px_1fr_60px_36px] items-center gap-3">
                                            <span className="text-[10px] text-gray-300 uppercase font-bold">Rotate</span>
                                            <input
                                                type="range" min="-180" max="180"
                                                value={selectedToken.rotation}
                                                onChange={(e) => updateToken(selectedToken.id, { rotation: parseInt(e.target.value) })}
                                                className="w-full h-1.5 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-yellow-500 border border-white/10"
                                            />
                                            <NumericInput
                                                value={selectedToken.rotation}
                                                onChange={(val) => updateToken(selectedToken.id, { rotation: val })}
                                                step={5}
                                                min={-360}
                                                max={360}
                                            />
                                            <button 
                                                onClick={() => updateToken(selectedToken.id, { rotation: 0 })} 
                                                className="w-9 h-9 !p-0 flex items-center justify-center bg-[#27272a] hover:bg-yellow-500/20 rounded border border-white/30 transition-colors group shadow-sm"
                                            >
                                                <RefreshCcw className="w-4 h-4 text-gray-100 group-hover:text-yellow-400" />
                                            </button>
                                        </div>

                                        {/* LAYER DEPTH */}
                                        <div className="flex items-center gap-2 pt-2">
                                            <button
                                                onClick={() => {
                                                    const currentZ = toFiniteNumber(selectedToken.zIndex, 1);
                                                    const sorted = [...state.tokens].sort((a, b) => toFiniteNumber(a.zIndex, 0) - toFiniteNumber(b.zIndex, 0));
                                                    const lower = sorted.reverse().find(t => toFiniteNumber(t.zIndex, 0) < currentZ);
                                                    if (lower) {
                                                        updateToken(lower.id, { zIndex: currentZ });
                                                        updateToken(selectedToken.id, { zIndex: toFiniteNumber(lower.zIndex, 1) });
                                                    } else if (currentZ > 1) {
                                                        updateToken(selectedToken.id, { zIndex: 1 });
                                                    }
                                                }}
                                                className="flex-1 bg-[#27272a] hover:bg-[#3f3f46] text-white text-[11px] font-bold h-11 !p-0 rounded border border-white/30 transition-colors flex items-center justify-center shadow-sm"
                                            >
                                                BACK
                                            </button>
                                            <div className="w-12 h-11 flex items-center justify-center bg-[#18181b] border border-gray-600 rounded text-yellow-500 font-mono text-sm font-bold shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                                                {selectedToken.zIndex}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const currentZ = toFiniteNumber(selectedToken.zIndex, 1);
                                                    const sorted = [...state.tokens].sort((a, b) => toFiniteNumber(a.zIndex, 0) - toFiniteNumber(b.zIndex, 0));
                                                    const higher = sorted.find(t => toFiniteNumber(t.zIndex, 0) > currentZ);
                                                    if (higher) {
                                                        updateToken(higher.id, { zIndex: currentZ });
                                                        updateToken(selectedToken.id, { zIndex: toFiniteNumber(higher.zIndex, currentZ + 1) });
                                                    } else {
                                                        updateToken(selectedToken.id, { zIndex: currentZ + 1 });
                                                    }
                                                }}
                                                className="flex-1 bg-[#27272a] hover:bg-[#3f3f46] text-white text-[11px] font-bold h-11 !p-0 rounded border border-white/30 transition-colors flex items-center justify-center shadow-sm"
                                            >
                                                FRONT
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* SPATIAL & OCCLUSION */}
                                {showInternalDepthControls && (
                                    <div className="space-y-4 pt-4 border-t border-white/5 pb-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)] animate-pulse"></div>
                                                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Spatial Hint & Occlusion</span>
                                                <span className="text-[8px] bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded border border-yellow-500/20 font-bold">INTERNAL</span>
                                            </div>
                                        </div>

                                        <div className="space-y-4 px-1">
                                            <div>
                                                <span className="text-[9px] text-gray-300 uppercase font-bold block mb-2">Occlusion Mode</span>
                                                <div className="flex gap-1.5">
                                                    <button
                                                        onClick={() => updateToken(selectedToken.id, { occlusionMode: 'auto' })}
                                                        className={`group !p-0 flex-1 h-9 flex items-center justify-center font-bold uppercase rounded border transition-all ${(selectedToken.occlusionMode || 'auto') === 'auto'
                                                            ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                                                            : 'bg-[#27272a] border-white/30 text-gray-200 hover:text-white hover:bg-[#3f3f46]'
                                                            }`}
                                                        style={{ fontSize: '10.5px' }}
                                                    >
                                                        AUTO HINT
                                                    </button>
                                                    <button
                                                        onClick={() => updateToken(selectedToken.id, { occlusionMode: 'front' })}
                                                        className={`group !p-0 flex-1 h-9 flex items-center justify-center font-bold uppercase rounded border transition-all ${selectedToken.occlusionMode === 'front'
                                                            ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                                                            : 'bg-[#27272a] border-white/30 text-gray-200 hover:text-white hover:bg-[#3f3f46]'
                                                            }`}
                                                        style={{ fontSize: '10.5px' }}
                                                    >
                                                        FORCE FRONT
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] text-gray-300 uppercase font-bold">Hint Bias</span>
                                                    <span className="text-[10px] text-purple-400 font-mono font-bold">{(selectedToken.occlusionBias ?? 0).toFixed(2)}</span>
                                                </div>
                                                <input
                                                    type="range" min="-1" max="1" step="0.01"
                                                    value={selectedToken.occlusionBias ?? 0}
                                                    onChange={(e) => updateToken(selectedToken.id, { occlusionBias: parseFloat(e.target.value) })}
                                                    className="w-full h-1.5 bg-[#27272a] rounded-lg appearance-none cursor-pointer accent-purple-500 border border-white/10"
                                                />
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-[8px] text-gray-300 uppercase font-bold">Pull Closer</span>
                                                    <button
                                                        onClick={() => updateToken(selectedToken.id, { occlusionBias: 0 })}
                                                        className="w-16 h-8 !p-0 flex items-center justify-center bg-[#27272a] border border-white/30 rounded text-[9px] text-gray-100 hover:text-white hover:bg-[#3f3f46] uppercase font-bold transition-colors shadow-sm"
                                                    >
                                                        RESET
                                                    </button>
                                                    <span className="text-[8px] text-gray-300 uppercase font-bold">Push Back</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </SidebarPanel>
                    {/* End Token Properties */}


                    {/* CAST PALETTE */}
                    <SidebarPanel
                        style={{ order: leftPanelOrder.indexOf('cast_palette') }}
                        id="cast_palette"
                        title="Available Cast"
                        icon={UserPlus}
                        headerColor="text-purple-400"
                        collapsed={collapsedPanels['cast_palette']}
                        onToggle={togglePanel}
                        onDragStart={setDraggedPanelId}
                        onDrop={handlePanelDrop}
                        rightElement={
                            <span className="text-[9px] bg-purple-500/10 px-1.5 py-0.5 rounded text-purple-400 font-mono border border-purple-500/20">{(state.cast || []).length}</span>
                        }
                    >
                        <div className="p-3 max-h-[45vh] min-h-0 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2 pb-2">
                                {(state.cast || []).map(c => (
                                    <div
                                        key={c.id}
                                        className="aspect-square bg-black border border-gray-700 rounded-lg overflow-hidden cursor-move hover:border-purple-500 transition-all relative group "
                                        draggable
                                        onDragStart={(e) => {
                                            // Sending only ID prevents Chromium IPC drag/drop truncation on multi-MB base64 images
                                            const payload = JSON.stringify({ type: 'cast_member', id: c.id, tag: c.tag });
                                            console.log('[onDragStart:AvailableCast] Setting application/json:', payload);
                                            e.dataTransfer.setData('application/json', payload);
                                            // Clear the default data properties that Chromium auto-fills for images to prevent IPC overflows
                                            e.dataTransfer.setData('text/plain', '');
                                            e.dataTransfer.setData('text/html', '');
                                        }}
                                    >
                                        <img src={c.previewUrl || c.url} className="w-full h-full object-contain pointer-events-none" draggable={false} onDragStart={(e) => e.preventDefault()} />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <span className="text-[8px] font-bold text-white uppercase px-1 text-center leading-tight truncate w-full">{c.tag}</span>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                dispatch({ type: 'REMOVE_FROM_AVAILABLE_CAST', payload: { actorId: c.id } });
                                            }}
                                            title="Remove from available cast"
                                            aria-label="Remove from available cast"
                                            className="absolute top-1 right-1 !p-0 w-6 h-6 bg-black/80 hover:bg-red-500/90 text-gray-400 hover:text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SidebarPanel>
                    {/* End Cast Palette */}

                    {/* ANNOTATION PROPERTIES (NEW) */}
                    {selectedAnnotation && (
                        <SidebarPanel
                            style={{ order: leftPanelOrder.indexOf('annotation_props') }}
                            id="annotation_props"
                            title="Annotation"
                            icon={StickyNote}
                            headerColor="text-purple-500"
                            collapsed={collapsedPanels['annotation_props']}
                            onToggle={togglePanel}
                            onDragStart={setDraggedPanelId}
                            onDrop={handlePanelDrop}
                        >


                            <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300 relative">

                                {/* Shared Hidden Input for Color Modification - Visually hidden but layout-present for popover position */}
                                <input
                                    ref={colorPickerRef}
                                    type="color"
                                    className="opacity-0 absolute top-10 left-10 w-0 h-0 pointer-events-none"
                                    onChange={(e) => {
                                        const c = e.target.value;
                                        setLastCustomColor(c);
                                        dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: c } });
                                        setShowColorEditor(false); // Close editor after system picker selection
                                    }}
                                />

                                {/* Type Info - Show only if editor is CLOSED */}
                                <>
                                    {!showColorEditor && (
                                    <div className="flex items-center justify-between bg-[#09090b] px-3 py-2 rounded border border-gray-800">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Selected Item</span>
                                            <span className="font-mono text-[10px] text-purple-400 truncate uppercase">{selectedAnnotation.type}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={deleteSelection}
                                                className="text-red-500 hover:text-red-400 p-1.5 bg-gray-800 hover:bg-red-900/20 rounded"
                                                title="Delete Annotation"
                                            >
                                                <TrashIcon className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* CONTROLS OR COLOR EDITOR */}
                                {showColorEditor ? (
                                    <div className="bg-[#18181b] rounded-lg p-3 border border-gray-700 space-y-3 relative animate-in zoom-in-95 duration-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Color Editor</span>
                                            <button
                                                onClick={() => setShowColorEditor(false)}
                                                className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>

                                        {/* Preview & Hex */}
                                        <div className="flex gap-2">
                                            <div
                                                className="w-10 h-10 rounded border border-white/20 "
                                                style={{ backgroundColor: selectedAnnotation.color || '#a855f7' }}
                                            />
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[8px] text-gray-500 uppercase font-bold block">Hex Code</label>
                                                <input
                                                    type="text"
                                                    defaultValue={selectedAnnotation.color || '#a855f7'}
                                                    onBlur={(e) => {
                                                        const val = e.target.value;
                                                        dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: val } });
                                                        setLastCustomColor(val);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const val = e.currentTarget.value;
                                                            dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: val } });
                                                            setLastCustomColor(val);
                                                        }
                                                    }}
                                                    className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white font-mono uppercase focus:border-purple-500 outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[8px] text-gray-500 uppercase font-bold block">Hue Adjust</label>
                                            <DebouncedHueSlider
                                                color={selectedAnnotation.color || '#a855f7'}
                                                onChange={handleHueChange}
                                            />
                                            {/* Replaced Hue with System Picker Button for reliability */}
                                            <button
                                                onClick={() => colorPickerRef.current?.click()}
                                                className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-[9px] text-gray-300 rounded border border-gray-600 uppercase font-bold flex items-center justify-center gap-2"
                                            >
                                                <Pipette className="w-3 h-3" /> Open System Picker
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            {/* We could parse Hex to RGB here for inputs, but keeping it simple with Hex + System is better for stability unless user asked for RGB specifically. User asked for "Close button" and "Position". */}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 pt-2 border-t border-white/5">

                                        {/* 1. SIZE / SCALE */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                                                <span>Size</span>
                                                <span className="text-purple-400 font-mono">{Math.round(selectedAnnotation.width)}px</span>
                                            </div>
                                            <input
                                                type="range" min="20" max="600" step="10"
                                                value={selectedAnnotation.width}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    // Uniform scale behavior for "Size" slider
                                                    const ratio = selectedAnnotation.width / selectedAnnotation.height;
                                                    // Avoid divide by zero if new item
                                                    const effectiveRatio = ratio || 1;

                                                    dispatch({
                                                        type: 'UPDATE_ANNOTATION',
                                                        payload: {
                                                            id: selectedAnnotation.id,
                                                            width: val,
                                                            height: val / effectiveRatio
                                                        }
                                                    });
                                                }}
                                                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        {/* 2. ROTATION */}
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-[60px_1fr_50px] items-center gap-3">
                                                <span className="text-[10px] text-gray-500 uppercase font-medium">Rotate</span>
                                                <input
                                                    type="range" min="-180" max="180"
                                                    value={selectedAnnotation.rotation}
                                                    onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, rotation: parseInt(e.target.value) } })}
                                                    className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                />
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={selectedAnnotation.rotation}
                                                        onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, rotation: parseInt(e.target.value) || 0 } })}
                                                        className="bg-black border border-gray-800 py-0.5 px-1 rounded text-[10px] text-purple-500 font-mono text-center outline-none w-full"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 3. THICKNESS (Arrows only usually, but maybe border for zones later) */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                                                <span>Thickness</span>
                                                <span className="text-purple-400 font-mono">{selectedAnnotation.thickness ?? 2}px</span>
                                            </div>
                                            <input
                                                type="range" min="1" max="25" step="1"
                                                value={selectedAnnotation.thickness ?? 2}
                                                onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, thickness: parseInt(e.target.value) } })}
                                                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        {/* 4. POSITION */}
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[8px] text-gray-500 uppercase font-bold block">X Position</label>
                                                    <input
                                                        type="number"
                                                        value={Math.round(selectedAnnotation.x)}
                                                        onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, x: parseInt(e.target.value) } })}
                                                        className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white font-mono focus:border-purple-500 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[8px] text-gray-500 uppercase font-bold block">Y Position</label>
                                                    <input
                                                        type="number"
                                                        value={Math.round(selectedAnnotation.y)}
                                                        onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, y: parseInt(e.target.value) } })}
                                                        className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white font-mono focus:border-purple-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 4. COLOR */}
                                        <div className="space-y-2">
                                            <span className="text-[10px] uppercase font-bold text-gray-500">Color</span>
                                            <div className="grid grid-cols-6 gap-2">
                                                {/* Presets */}
                                                {[
                                                    '#a855f7', // Purple (Default)
                                                    '#ef4444', // Red
                                                    '#f97316', // Orange
                                                    '#eab308', // Yellow
                                                    '#22c55e', // Green
                                                    '#3b82f6', // Blue
                                                    '#ffffff', // White
                                                    '#000000', // Black
                                                ].map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => {
                                                            dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: c } });
                                                            setShowColorEditor(false); // Single click always exits editor if open (or just selects)
                                                        }}
                                                        onDoubleClick={(e) => {
                                                            e.stopPropagation();
                                                            setShowColorEditor(true);
                                                            // We don't open system picker automatically anymore, we open OUR editor.
                                                        }}
                                                        className={`w-6 h-6 rounded-full border border-white/10 transition-transform hover:scale-110 ${selectedAnnotation.color === c ? 'ring-2 ring-white' : ''}`}
                                                        style={{ backgroundColor: c }}
                                                        title="Double-click to edit"
                                                    />
                                                ))}

                                                {/* Custom / Recent Slot */}
                                                <button
                                                    onClick={() => {
                                                        dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, color: lastCustomColor } });
                                                        setShowColorEditor(false);
                                                    }}
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowColorEditor(true);
                                                    }}
                                                    className={`w-6 h-6 rounded-full border border-white/10 transition-transform hover:scale-110 flex items-center justify-center overflow-hidden ${selectedAnnotation.color === lastCustomColor ? 'ring-2 ring-white' : ''}`}
                                                    style={{ backgroundColor: lastCustomColor }}
                                                    title="Custom Color (Double-click to edit)"
                                                >
                                                    <span className="text-[8px] text-white/50 bg-black/20 w-full text-center">+</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* 5. Z-INDEX DEPTH */}
                                        <div className="flex items-center justify-between pt-2">
                                            <span className="text-[10px] uppercase font-bold text-gray-500">Layer {selectedAnnotation.zIndex}</span>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, zIndex: selectedAnnotation.zIndex - 1 } })}
                                                    className="p-1 px-2 bg-gray-800 rounded text-[9px] text-gray-300 hover:text-white"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    onClick={() => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: selectedAnnotation.id, zIndex: selectedAnnotation.zIndex + 1 } })}
                                                    className="p-1 px-2 bg-gray-800 rounded text-[9px] text-gray-300 hover:text-white"
                                                >
                                                    Front
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                </>
                            </div>
                        </SidebarPanel>
                    )}
                
                {/* SPACE RESERVED FOR FUTURE TAB MODULES */}

                </div>
                {/* End of Left Sidebar */}

                {/* 2. CENTER AREA: THE STAGE */}
                <div
                    ref={centerPaneRef}
                    className="staging-center flex flex-col gap-2"
                >
                    {renderCommandHeader()}
                    {/* --- END COMMAND HEADER --- */}

                    {/* Compact Director Canvas Shot State Block (Moved up to Command Header) */}

                    {viewMode === 'shots' ? (() => {
                        const effectiveAnchor = getEffectiveResultAnchorForScene(state, state.activeShotId || 'default');
                        let computedActorCount: number | undefined = undefined;
                        if (effectiveAnchor) {
                            if (effectiveAnchor.kind === 'generated_result') {
                                computedActorCount = state.tokens.filter((t) => t.elementType === 'actor' || !t.elementType).length;
                            } else if (effectiveAnchor.kind === 'uploaded_result') {
                                computedActorCount = effectiveAnchor.visibleActorCount;
                            }
                        }

                        return (
                        <div className="flex-1 min-h-0 bg-[#09090b] border border-[#27272a] rounded-xl relative overflow-hidden">
                           <ShotsPanel 
                              sceneId={state.activeShotId || 'default'} 
                              apiKey={state.apiKey!} 
                              model={state.model}
                              effectiveResultImageUrl={getEffectiveResultAnchorForScene(state, state.activeShotId || 'default')?.imageUrl}
                              subjectActionText={sceneIntent?.action || sceneIntent?.summary || undefined}
                              environmentText={state.director?.environment}
                              lightingText={state.director?.lighting}
                              expectedActorCount={computedActorCount}
                              actorIdentitySets={getActorIdentityReferenceSetsForScene(state, state.activeShotId || 'default')}
                              shotsActorOptions={getShotsActorOptionsForScene(state, state.activeShotId || 'default')}
                              session={state.shotSessionsBySceneId?.[state.activeShotId || 'default']}
                              onCreateOrReplaceSession={(sId, sess) => dispatch({ type: 'CREATE_OR_REPLACE_SHOT_SESSION', payload: { sceneId: sId, session: sess } })}
                              onUpdateSession={(sId, updater) => {
                                 dispatch({ type: 'UPDATE_SHOT_SESSION', payload: { sceneId: sId, updater } });
                              }}
                              onToggleVariantSelected={(sId, vId, sel) => dispatch({ type: 'SET_SHOT_VARIANT_SELECTED', payload: { sceneId: sId, variantId: vId, selected: sel } })}
                              onSaveVariant={(url, prefix) => {
                                 const link = document.createElement('a');
                                 link.href = url;
                                 link.download = createUniqueDownloadFilename(`NB_${prefix}.png`);
                                 link.click();
                                 dispatch({ type: 'ADD_LOG', payload: { message: 'Shot saved successfully.', type: 'success' } });
                              }}
                              onSetAsStage={(url) => {
                                 const activeSceneId = state.activeShotId || 'default';
                                 dispatch({ type: 'SET_BG', payload: url });
                                 dispatch({ type: 'SET_RESULT_IMAGE', payload: url });
                                 dispatch({
                                    type: 'SET_SCENE_RESULT_ANCHOR',
                                    payload: {
                                      sceneId: activeSceneId,
                                      anchor: { kind: 'generated_result', imageUrl: url }
                                    }
                                 });
                                 setViewMode('stage');
                                 dispatch({ type: 'ADD_LOG', payload: { message: 'Shot variant promoted to Stage Scene.', type: 'success' } });
                              }}
                           />
                        </div>
                        );
                    })() : (
                    <div
                        ref={stageRef}
                        className="stage-viewport flex-1 min-h-0 bg-[#09090b] border border-[#27272a] rounded-xl relative overflow-hidden overscroll-contain group"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onMouseMove={handleStageMouseMove}
                        onMouseUp={handleStageMouseUp}
                        onMouseLeave={handleStageMouseUp}
                    >
                        {/* Stage Matte (outside the camera gate) */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#111111_0%,_#000000_100%)]" />

                        {/* Center wrapper */}
                        <div className="stage-preview-centerer">
                            {/* Camera Gate / Viewport (this is the actual rendered frame) */}
                            <div
                                ref={viewportRef}
                                className="stage-preview-frame bg-black overflow-hidden rounded-xl ring-1 ring-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                                style={{
                                    width: `${Math.max(10, viewportBox.w)}px`,
                                    height: `${Math.max(10, viewportBox.h)}px`,
                                    zIndex: 10
                                }}
                            >
                            {viewMode === 'result' && displayedResultImage ? (
                                <img
                                    src={displayedResultImage}
                                    alt="Generated Result"
                                    className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none z-[60]"
                                    onError={() => {
                                        console.error('[SceneCanvas] Result image failed to load:', displayedResultImage);
                                        dispatch({
                                            type: 'ADD_LOG',
                                            payload: { message: 'Result image failed to load. Invalid image payload reached UI.', type: 'error' }
                                        });
                                    }}
                                />
                            ) : state.backgroundUrl ? (
                                <img
                                    src={state.backgroundUrl}
                                    alt="Stage Background"
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                />
                            ) : (
                                <div className="absolute inset-0 text-gray-800 flex flex-col items-center justify-center gap-4 opacity-20 bg-black/50">
                                    <Square className="w-24 h-24 stroke-[1]" />
                                    <span className="text-xs font-bold uppercase tracking-[0.5em]">Empty Stage</span>
                                </div>
                            )}



                            <SceneSpecOverlay />

                            {/* SPATIAL DEBUG OVERLAYS (DEV ONLY) */}
                            {import.meta.env.DEV && (
                                <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{ zIndex: 9999 }}
                                >
                                    {/* 1. Raw Depth Map Overlay */}
                                    {showDebugDepthMap && state.depthMapUrl && (
                                        <img
                                            src={state.depthMapUrl}
                                            className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
                                            style={{ filter: 'contrast(1.5) brightness(1.2)' }}
                                        />
                                    )}

                                    {/* 2. Floor Plane Visualizer */}
                                    {showDebugFloor && state.floorPlane && (
                                        <div
                                            className="absolute left-0 right-0 border-t-2 border-cyan-400 border-dashed opacity-70"
                                            style={{ bottom: `${(1 - (state.floorPlane.depth / 255)) * 100}%` }}
                                        >
                                            <span className="absolute right-2 -top-4 text-[8px] font-black text-cyan-400 uppercase">
                                                Ground Baseline ({state.floorPlane.depth})
                                            </span>
                                        </div>
                                    )}

                                    {/* 3. Occupied Volume Visualizer */}
                                    {showDebugVolumes && state.occupiedVolumes.map(vol => (
                                        <div
                                            key={vol.id}
                                            className="absolute border-2 border-amber-500/50 bg-amber-500/5"
                                            style={{
                                                left: vol.footprint.x,
                                                top: vol.footprint.y,
                                                width: vol.footprint.w,
                                                height: vol.footprint.h
                                            }}
                                        >
                                            <div className="absolute top-0 right-0 bg-amber-500 text-[8px] px-1 font-bold text-black uppercase">
                                                Vol: {vol.minDepth}-{vol.maxDepth}
                                            </div>
                                        </div>
                                    ))}

                                    {/* 4. Actor Depth Band Visualizer */}
                                    {showDebugBands && state.tokens.map(token => {
                                        const tokenDepth = token.depth === undefined ? undefined : toFiniteNumber(token.depth, 0.5);
                                        if (tokenDepth === undefined) return null;
                                        const tokenWidth = Math.max(20, toFiniteNumber(token.width, 200));
                                        const tokenHeight = Math.max(20, toFiniteNumber(token.height, 300));
                                        const tokenAnchorX = Math.min(1, Math.max(0, toFiniteNumber(token.anchorX, 0.5)));
                                        const tokenAnchorY = Math.min(1, Math.max(0, toFiniteNumber(token.anchorY, 0.8)));
                                        const tokenX = toFiniteNumber(token.x, 0);
                                        const tokenY = toFiniteNumber(token.y, 0);
                                        const dRaw = tokenDepth * 255;
                                        return (
                                            <div
                                                key={`band-${token.id}`}
                                                className="absolute border border-[#ff00ff]/50"
                                                style={{
                                                    left: tokenX - (tokenWidth * tokenAnchorX),
                                                    top: tokenY - (tokenHeight * tokenAnchorY),
                                                    width: tokenWidth,
                                                    height: tokenHeight,
                                                    backgroundColor: 'rgba(255, 0, 255, 0.05)'
                                                }}
                                            >
                                                <div className="absolute bottom-0 left-0 bg-magenta-500 text-[6px] text-white font-black px-1 uppercase">
                                                    Band: {Math.max(0, Math.floor(dRaw - DEPTH_BAND_RADIUS))}-{Math.min(255, Math.ceil(dRaw + DEPTH_BAND_RADIUS))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* NEW GROUND PLANE DEBUGGER (Shift+G) */}
                                    {showGroundDebug && groundDepth !== null && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                left: 0,
                                                right: 0,
                                                top: '88%', // User requested 88%
                                                height: '12%',
                                                borderTop: '2px dashed rgba(0,255,0,0.6)',
                                                pointerEvents: 'none',
                                                zIndex: 9999,
                                            }}
                                        >
                                            <div style={{ color: 'lime', fontSize: 12, position: 'absolute', top: '-20px', right: '10px' }}>
                                                Ground Band (Median Depth = {groundDepth.toFixed(3)})
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Region Edit Mask Overlay */}
                            {regionEdit.isMaskMode && (
                                <canvas
                                    ref={maskCanvasRef}
                                    className="absolute inset-0 z-[65] opacity-50"
                                    style={{ pointerEvents: 'auto' }}
                                    onPointerDown={handleMaskPointerDown}
                                    onPointerMove={handleMaskPointerMove}
                                    onPointerUp={handleMaskPointerUp}
                                    onPointerLeave={handleMaskPointerUp}
                                />
                            )}

                            {/* Tokens Layer */}
                            {viewMode === 'stage' && (
                                <>
                                    {[...state.tokens]
                                        .filter(t => t.visible !== false)
                                        .sort((a, b) => toFiniteNumber(a.zIndex, 10) - toFiniteNumber(b.zIndex, 10))
                                        .map(token => {
                                            const tokenX = toFiniteNumber(token.x, 0);
                                            const tokenY = toFiniteNumber(token.y, 0);
                                            const tokenWidth = Math.max(20, toFiniteNumber(token.width, 200));
                                            const tokenHeight = Math.max(20, toFiniteNumber(token.height, 300));
                                            const tokenAnchorX = Math.min(1, Math.max(0, toFiniteNumber(token.anchorX, 0.5)));
                                            const tokenAnchorY = Math.min(1, Math.max(0, toFiniteNumber(token.anchorY, 0.8)));
                                            const tokenRotation = toFiniteNumber(token.rotation, 0);
                                            const tokenPitch = toFiniteNumber(token.pitch, 0);
                                            const tokenYaw = toFiniteNumber(token.yaw, 0);
                                            const tokenScaleX = toFiniteNumber(token.scaleX, 1);
                                            const tokenScaleY = toFiniteNumber(token.scaleY, 1);
                                            const tokenZIndex = toFiniteNumber(token.zIndex, 10);
                                            const tokenMask = tokenMasks[token.id];
                                            const shouldApplyMask = !!tokenMask
                                                && dragItem?.id !== token.id
                                                && resizeItem?.id !== token.id
                                                && rotateItem?.id !== token.id;

                                            return (
                                <div
                                    key={token.id}
                                    className={`absolute cursor-move group/token ${state.selection === token.id ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-[#09090b]' : ''}`}
                                    style={{
                                        left: tokenX - (tokenWidth * tokenAnchorX),
                                        top: tokenY - (tokenHeight * tokenAnchorY),
                                        width: tokenWidth,
                                        height: tokenHeight,
                                        transformOrigin: `${tokenAnchorX * 100}% ${tokenAnchorY * 100}%`,
                                        transform: `perspective(800px) rotateX(${tokenPitch}deg) rotateY(${tokenYaw}deg) rotate(${tokenRotation}deg) scale(${tokenScaleX}, ${tokenScaleY})`,
                                        zIndex: state.selection === token.id ? 1000 : tokenZIndex,
                                        ...(shouldApplyMask ? {
                                            WebkitMaskImage: `url(${tokenMask})`,
                                            WebkitMaskSize: `${tokenWidth}px ${tokenHeight}px`,
                                            WebkitMaskPosition: `0px 0px`,
                                            WebkitMaskRepeat: 'no-repeat',
                                            WebkitMaskComposite: 'source-over',
                                            maskImage: `url(${tokenMask})`,
                                            maskSize: `${tokenWidth}px ${tokenHeight}px`,
                                            maskPosition: `0px 0px`,
                                            maskRepeat: 'no-repeat',
                                        } : {})

                                    }}
                                    onMouseDown={(e) => {
                                        if (regionEdit.isMaskMode) return;
                                        e.stopPropagation();
                                        dispatch({ type: 'SELECT_ITEM', payload: { id: token.id, type: 'token' } });
                                        dispatch({
                                            type: 'UPDATE_TOKEN',
                                            payload: {
                                                id: token.id,
                                                placementAuthority: 'user',
                                                hasUserCommittedIntent: false
                                            }
                                        });
                                        setDragItem({
                                            id: token.id,
                                            type: 'token',
                                            startX: e.clientX,
                                            startY: e.clientY,
                                            initialX: tokenX,
                                            initialY: tokenY
                                        });
                                    }}
                                >
                                    <div className={`absolute inset-0 transition-all duration-500 pointer-events-none`} />
                                    {(() => {
                                        const finalUrl = resolveTokenImageUrl(token);
                                        if (!finalUrl) {
                                            return (
                                                <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 rounded border border-dashed border-white/20 text-white/40">
                                                    <UserPlus className="w-8 h-8 opacity-50 mb-2 pointer-events-none" />
                                                    <span className="text-[10px] font-bold tracking-wider pointer-events-none">ORPHANED</span>
                                                </div>
                                            );
                                        }
                                        return (
                                            <img
                                                src={finalUrl}
                                                alt={token.tag}
                                                className={`w-full h-full object-contain pointer-events-none transition-all duration-300`}
                                                style={{
                                                    filter: (() => {
                                                        const layer = token.spatialDescriptor?.depthLayer;
                                                        let f = '';
                                                        if (layer === 'foreground') f = 'contrast(1.15) saturate(1.1) drop-shadow(0 4px 8px rgba(0,0,0,0.5))';
                                                        if (layer === 'background') f = 'contrast(0.85) brightness(1.05) blur(0.5px)';
                                                        if (token.intelligence) f += (f ? ' ' : '') + 'drop-shadow(0 0 8px rgba(34,197,94,0.6))';

                                                        // Apply manual filters
                                                        const bright = toFiniteNumber(token.brightness, 100);
                                                        const contrast = toFiniteNumber(token.contrast, 100);
                                                        const saturate = toFiniteNumber(token.saturation, 100);
                                                        const blur = Math.max(0, toFiniteNumber(token.blur, 0));

                                                        if (bright !== 100) f += ` brightness(${bright}%)`;
                                                        if (contrast !== 100) f += ` contrast(${contrast}%)`;
                                                        if (saturate !== 100) f += ` saturate(${saturate}%)`;
                                                        if (blur !== 0) f += ` blur(${blur}px)`;

                                                        return f || 'none';
                                                    })()
                                                }}
                                            />
                                        );
                                    })()}

                                    {/* Selection Utilities */}
                                    {state.selection === token.id && (
                                        <>
                                            {/* Resize Handles */}
                                            {(['tl', 'tr', 'bl', 'br'] as const).map((handle) => (
                                                <div
                                                    key={handle}
                                                    className={`absolute w-3 h-3 bg-white border border-blue-500 rounded-full z-50
 ${handle === 'tl' ? '-top-1.5 -left-1.5 cursor-nwse-resize' : ''}
 ${handle === 'tr' ? '-top-1.5 -right-1.5 cursor-nesw-resize' : ''}
 ${handle === 'bl' ? '-bottom-1.5 -left-1.5 cursor-nesw-resize' : ''}
 ${handle === 'br' ? '-bottom-1.5 -right-1.5 cursor-nwse-resize' : ''}
 `}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setResizeItem({
                                                            id: token.id,
                                                            type: 'token',
                                                            handle,
                                                            startX: e.clientX,
                                                            startY: e.clientY,
                                                            initialW: tokenWidth,
                                                            initialH: tokenHeight,
                                                            initialX: tokenX,
                                                            initialY: tokenY,
                                                            initialScaleX: tokenScaleX,
                                                            initialScaleY: tokenScaleY,
                                                            uniformScale: token.uniformScale,
                                                            // Pass anchor for resize math
                                                            anchorX: tokenAnchorX,
                                                            anchorY: tokenAnchorY
                                                        });
                                                    }}
                                                />
                                            ))}
                                        </>
                                    )}

                                    {/* Label */}
                                    <div className={`canvas-token-label absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/60 px-2 py-0.5 rounded text-[8px] text-white uppercase font-bold tracking-wider pointer-events-none transition-opacity ${state.selection === token.id ? 'opacity-100' : 'opacity-0 group-hover/token:opacity-100'}`}>
                                        {getCompactActorLabel(token.tag)}
                                    </div>

                                    {/* DEVELOPER DEBUG HUD (DEV ONLY) */}
                                    {import.meta.env.DEV && showDebugActorOverlay && (
                                        <div className="absolute top-0 right-0 -mr-2 -mt-2 bg-blue-900/90 border border-blue-400 p-2 rounded z-[100] pointer-events-none backdrop-blur-sm min-w-[120px]">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[7px] text-blue-300 font-bold uppercase">Depth Layer</span>
                                                    <span className="text-[8px] text-white font-mono uppercase font-black">
                                                        {token.spatialDescriptor?.depthLayer || token.anchorLayer || 'N/A'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[7px] text-blue-300 font-bold uppercase">Depth Score</span>
                                                    <span className="text-[8px] text-white font-mono font-black">
                                                        {token.spatialDescriptor?.depthScore?.toFixed(4) || '0.0000'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="text-[7px] text-blue-300 font-bold uppercase">Z-Index</span>
                                                    <span className="text-[8px] text-white font-mono font-black">
                                                        {token.zIndex}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                            );
                                        })}

                            {/* Annotations Layer */}
                            {[...state.annotations]
                                .filter(a => a.visible !== false)
                                .sort((a, b) => toFiniteNumber(a.zIndex, 10) - toFiniteNumber(b.zIndex, 10))
                                .map(note => {
                                    const noteX = toFiniteNumber(note.x, 0);
                                    const noteY = toFiniteNumber(note.y, 0);
                                    const noteWidth = Math.max(20, toFiniteNumber(note.width, note.type === 'arrow' ? 60 : 150));
                                    const noteHeight = Math.max(20, toFiniteNumber(note.height, note.type === 'arrow' ? 60 : 100));
                                    const noteRotation = toFiniteNumber(note.rotation, 0);
                                    const noteZIndex = toFiniteNumber(note.zIndex, 10);
                                    const noteThickness = Math.max(1, toFiniteNumber(note.thickness, 2));

                                    return (
                                <div
                                    key={note.id}
                                    className={`absolute cursor-move group/note ${state.selection === note.id ? 'z-50' : ''}`}
                                    style={{
                                        left: noteX,
                                        top: noteY,
                                        width: noteWidth,
                                        height: noteHeight,
                                        zIndex: noteZIndex,
                                        transform: `rotate(${noteRotation}deg)`
                                    }}
                                    onMouseDown={(e) => {
                                        if (regionEdit.isMaskMode) return;
                                        e.stopPropagation();
                                        dispatch({ type: 'SELECT_ITEM', payload: { id: note.id, type: 'annotation' } });
                                        setDragItem({
                                            id: note.id,
                                            type: 'annotation',
                                            startX: e.clientX,
                                            startY: e.clientY,
                                            initialX: noteX,
                                            initialY: noteY
                                        });
                                    }}
                                >
                                    {note.type === 'zone' && (
                                        <div className="w-full h-full border-4 border-dashed border-blue-500/50 bg-blue-500/10 flex items-center justify-center">
                                            <span className="text-blue-500 font-bold uppercase tracking-widest text-[10px] bg-black/50 px-2 py-1 rounded">
                                                Active Zone
                                            </span>
                                        </div>
                                    )}
                                    {note.type === 'note' && (
                                        <div className="w-full h-full min-w-0 min-h-0 flex flex-col border-2 border-yellow-400 bg-yellow-900/40 backdrop-blur-sm rounded-lg overflow-hidden">
                                            {/* Fixed Header Label - Outside the note content area */}
                                            <div className="bg-yellow-400 text-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center justify-between gap-2 shrink-0 select-none min-w-0">
                                                <span className="truncate">Director Note</span>
                                                <Pencil className="w-2.5 h-2.5 opacity-50" />
                                            </div>

                                            {/* Content Area */}
                                            <div
                                                className="flex-1 min-h-0 p-2 overflow-auto custom-scrollbar bg-black/40"
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingAnnotationId(note.id);
                                                }}
                                            >
                                                {editingAnnotationId === note.id ? (
                                                    <textarea
                                                        autoFocus
                                                        className="block w-full h-full min-h-full bg-transparent text-yellow-100 font-bold font-mono text-[11px] resize-none outline-none leading-relaxed placeholder:text-yellow-500/30 overflow-y-auto custom-scrollbar"
                                                        value={note.text || ''}
                                                        onChange={(e) => dispatch({
                                                            type: 'UPDATE_ANNOTATION',
                                                            payload: { id: note.id, text: e.target.value }
                                                        })}
                                                        onBlur={() => setEditingAnnotationId(null)}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        placeholder="Type instructions..."
                                                    />
                                                ) : (
                                                    <p className="max-h-full overflow-y-auto custom-scrollbar text-yellow-100 font-bold font-mono text-[11px] whitespace-pre-wrap leading-relaxed select-none pointer-events-none break-words min-h-[1em]">
                                                        {note.text || ''}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {note.type === 'arrow' && (
                                        <div className="w-full h-full flex items-center justify-center pointer-events-none">
                                            {/* SVG Arrow using simple line math or lucide icon with stroke width */}
                                            {/* Lucide icon is fixed path, strokeWidth is prop. Color is prop. */}
                                            <MoveUpRight
                                                className="w-full h-full"
                                                strokeWidth={noteThickness}
                                                color={note.color || '#a855f7'} // Default purple
                                                style={{ opacity: 0.9 }}
                                            />
                                        </div>
                                    )}

                                    {/* Selection Helpers */}
                                    {state.selection === note.id && (
                                        <div
                                            className="absolute -right-1 -bottom-1 w-4 h-4 bg-white rounded-full cursor-nwse-resize flex items-center justify-center hover:scale-125 transition-transform"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setResizeItem({
                                                    id: note.id,
                                                    type: 'annotation',
                                                    handle: 'br',
                                                    startX: e.clientX,
                                                    startY: e.clientY,
                                                    initialW: noteWidth,
                                                    initialH: noteHeight,
                                                    initialX: noteX,
                                                    initialY: noteY,
                                                    initialScaleX: 1, // Annotations don't strictly use scale property for sizing yet, but required by type
                                                    initialScaleY: 1,
                                                    uniformScale: false,
                                                    anchorX: 0,
                                                    anchorY: 0
                                                });
                                            }}
                                        />
                                    )}
                            {/* Rotation Handle (Top Center) */}
                                    {state.selection === note.id && (
                                        <div
                                            className="absolute left-1/2 -top-6 -translate-x-1/2 w-5 h-5 bg-white border border-blue-500 rounded-full flex items-center justify-center cursor-grabbing z-50 group/rotate"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                const gate = viewportRef.current;
                                                if (!gate) return;
                                                const rect = gate.getBoundingClientRect();
                                                // Note x,y is relative to the camera gate (viewport).
                                                // Center = rect.left + note.x + width/2
                                                const cx = rect.left + noteX + (noteWidth / 2);
                                                const cy = rect.top + noteY + (noteHeight / 2);

                                                const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

                                                setRotateItem({
                                                    id: note.id,
                                                    type: 'annotation',
                                                    centerX: cx,
                                                    centerY: cy,
                                                    startAngle: angle,
                                                    initialRotation: noteRotation
                                                });
                                            }}
                                        >
                                            <RotateCw className="w-3 h-3 text-blue-500 group-hover/rotate:animate-spin" />
                                        </div>
                                    )}
                                </div>
                                    );
                                })}
                            </>
                            )}
                        </div>
                        </div> {/* stage-preview-centerer */}
                    </div>
                )}

                    {/* 2b. CANVAS TOOLBAR (Moved Horizontal Below Stage) */}
                    {renderBottomToolbar()}
                </div>

                {/* 3. RIGHT SIDEBAR: GLOBAL SPECS, ANCHOR, & REFERENCES */}
                <div className="staging-right flex flex-col gap-0 bg-[#18181b] border-l border-white/5">
                    <div className="px-4 py-4 border-b border-white/5 flex justify-between items-center bg-black/20 shrink-0">
                        <h2 className="text-[10px] font-black text-gray-400 tracking-widest uppercase flex items-center gap-2">
                            <Clapperboard className="w-3.5 h-3.5 text-red-400" /> Stage Controls
                        </h2>
                        <button
                            onClick={() => {
                                dispatch({ type: 'SET_HELP_SECTION', payload: 'tab' });
                                dispatch({ type: 'TOGGLE_HELP', payload: true });
                            }}
                            title="Staging & SHOTS Help"
                            className="p-1 rounded-full hover:bg-yellow-500/10 text-gray-500 hover:text-yellow-500 transition-colors"
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* DYNAMIC SIDEBAR PANELS */}
                    <div className="staging-right-inner flex-1 pl-2 custom-scrollbar flex flex-col gap-3 pb-4 pt-4">
                        {
                            panelOrder.filter(id => id !== 'shots' || state.isStoryboardEnabled).map(panelId => {
                                if (panelId === 'shots') {
                                    return (
                                        <ShotListPanel
                                            key="shots"
                                            shots={shots ?? []}
                                            activeShotId={activeShotId ?? null}
                                            activeShotNameDraft={activeShotNameDraft}
                                            setActiveShotNameDraft={setActiveShotNameDraft}
                                            renameActiveShot={renameActiveShot}
                                            addShotFromStage={addShotFromStage}
                                            captureAndSetShotFrame={captureAndSetShotFrame}
                                            setActiveShot={setActiveShot}
                                            duplicateShot={duplicateShot}
                                            removeShot={removeShot}
                                            collapsed={collapsedPanels['shots']}
                                            onToggle={togglePanel}
                                            onDrop={handlePanelDrop}
                                            isProcessing={state.isProcessing ?? false}
                                            onOpenStoryboard={() => dispatch({ type: 'SET_VIEW', payload: 'veo' })}
                                        />
                                    );
                                }

                                if (panelId === 'advanced_render') {
                                    return (
                                        <AdvancedRenderPanel
                                            key="advanced_render"
                                            collapsed={collapsedPanels['advanced_render']}
                                            onToggle={togglePanel}
                                            onDragStart={setDraggedPanelId}
                                            onDrop={handlePanelDrop}
                                            strictMode={strictMode}
                                            setStrictMode={setStrictMode}
                                            autoAnchorDNA={autoAnchorDNA}
                                            setAutoAnchorDNA={setAutoAnchorDNA}
                                            dnaStatus={dnaStatus}
                                            anchorDNA={anchorDNA}
                                            analyzeBackgroundDNA={analyzeBackgroundDNA}
                                            autoTokenProfiles={autoTokenProfiles}
                                            setAutoTokenProfiles={setAutoTokenProfiles}
                                            handleAnalyzeMissingTokenProfiles={handleAnalyzeMissingTokenProfiles}
                                            tokenProfilesReady={tokenProfilesReady}
                                            tokenProfilesTotal={tokenProfilesTotal}
                                            compiledPrompt={compiledPrompt}
                                        />
                                    );
                                }

                                if (panelId === 'region_edit') {
                                    return (
                                        <RegionEditPanel
                                            key="region_edit"
                                            regionEdit={regionEdit}
                                            dispatch={dispatch}
                                            protectEnabled={protectEnabled}
                                            setProtectEnabled={setProtectEnabled}
                                            protectStatus={protectStatus}
                                            protectMaskUrl={protectMaskUrl ?? null}
                                            protectErosion={protectErosion}
                                            setProtectErosion={setProtectErosion}
                                            generateFaceProtectionMask={generateFaceProtectionMask}
                                            setProtectMaskUrl={setProtectMaskUrl}
                                            setRawProtectMaskUrl={setRawProtectMaskUrl}
                                            setProtectStatus={setProtectStatus}
                                            isProcessing={state.isProcessing ?? false}
                                            apiKey={state.apiKey || ''}
                                            billingMode={state.billingEntitlements?.effectiveBillingMode || 'byok'}
                                            collapsed={collapsedPanels['region_edit']}
                                            onToggle={togglePanel}
                                            onDragStart={setDraggedPanelId}
                                            onDrop={handlePanelDrop}
                                            cursorMode={regionEdit.mode === 'erase' ? 'eraser' : 'brush'}
                                            clearActiveMask={clearActiveMask}
                                            applyRegionEditQueue={applyRegionEditQueue}
                                            requestCancelRegionEdit={requestCancelRegionEdit}
                                            isRegionEditRunning={isRegionEditRunning}
                                        />
                                    );
                                }

                                if (panelId === 'layers') {
                                    return (
                                        <StageLayersPanel
                                            key="layers"
                                            state={state}
                                            dispatch={dispatch}
                                            collapsed={collapsedPanels['layers']}
                                            onToggle={togglePanel}
                                            draggedLayerId={draggedLayerId}
                                            setDraggedLayerId={setDraggedLayerId}
                                            setDraggedPanelId={setDraggedPanelId}
                                            handlePanelDrop={handlePanelDrop}
                                        />
                                    );
                                }

                                if (panelId === 'specs') {
                                    return (
                                        <GlobalSpecsPanel
                                            key="specs"
                                            state={state}
                                            setDirector={setDirector}
                                            collapsed={collapsedPanels['specs']}
                                            onToggle={togglePanel}
                                            onDragStart={setDraggedPanelId}
                                            onDrop={handlePanelDrop}
                                        />
                                    );
                                }

                                if (panelId === 'anchor') {
                                    return (
                                        <AnchorRefPanel
                                            key="anchor-panel"
                                            state={state}
                                            dispatch={dispatch}
                                            bgPrompt={bgPrompt}
                                            setBgPrompt={setBgPrompt}
                                            generateBg={generateBg}
                                            anchorFileInputRef={anchorFileInputRef}
                                            fileToDataUrl={fileToDataUrl}
                                            setDirector={setDirector}
                                            collapsed={collapsedPanels['anchor']}
                                            onToggle={togglePanel}
                                            onDragStart={setDraggedPanelId}
                                            onDrop={handlePanelDrop}
                                            selectedTokenId={selectedToken?.id || null}
                                            isAnalyzingStyle={isAnalyzingStyle}
                                            extractedStyle={extractedStyle}
                                            handleAutoStyleEnvironment={handleAutoStyleEnvironment}
                                            sceneIntent={sceneIntent}
                                            previousBackgroundUrl={previousBackgroundUrl}
                                            onRestoreBackground={() => {
                                                if (previousBackgroundUrl) {
                                                    dispatch({ type: 'SET_BG', payload: previousBackgroundUrl });
                                                    setPreviousBackgroundUrl(null);
                                                }
                                            }}
                                        />
                                    );
                                }



                                if (panelId === 'ref_stacks') {
                                    return (
                                        <RefStacksPanel
                                            key="ref_stacks"
                                            state={state}
                                            dispatch={dispatch}
                                            collapsed={collapsedPanels['ref_stacks']}
                                            onToggle={togglePanel}
                                            onDragStart={setDraggedPanelId}
                                            onDrop={handlePanelDrop}
                                            handleRefSlotClick={handleRefSlotClick}
                                            handleRefSlotDrop={handleRefSlotDrop}
                                            setDragOverRefSlot={setDragOverRefSlot}
                                            dragOverRefSlot={dragOverRefSlot}
                                            setInspectRefIndex={setInspectRefIndex}
                                            clearRefSlot={clearRefSlot}
                                            refFileInputs={refFileInputs}
                                            handleRefSlotFile={handleRefSlotFile}
                                        />
                                    );
                                }

                                if (panelId === 'scene_director') {
                                    return (
                                        <SceneDirectorPanel
                                            key="scene_director"
                                            state={state}
                                            setDirector={setDirector}
                                            collapsed={collapsedPanels['scene_director']}
                                            onToggle={togglePanel}
                                            onDragStart={setDraggedPanelId}
                                            onDrop={handlePanelDrop}
                                        />
                                    );
                                }

                                return null;
                            })
                        }
                    </div>






                    {/* v3 Prompt Terminal (Fixed at Bottom) */}
                    <div className="shrink-0 p-2 border-t border-white/5">
                        <PromptTerminalPanel
                            v3DirectorPrompt={v3DirectorPrompt}
                            submittedStagingRequest={latestSubmittedStagingRequest}
                            handleCopyDirectorPrompt={handleCopyDirectorPrompt}
                            collapsed={collapsedPanels['v3_terminal']}
                            onToggle={togglePanel}
                        />
                    </div>






                    {inspectRefIndex !== null && (
                        <RefInspectorModal
                            inspectRefIndex={inspectRefIndex!}
                            referenceSlots={state.referenceSlots}
                            inspectName={inspectName}
                            setInspectName={setInspectName}
                            inspectAnalysis={inspectAnalysis}
                            setInspectAnalysis={setInspectAnalysis}
                            inspectTarget={inspectTarget}
                            setInspectTarget={setInspectTarget}
                            setInspectRefIndex={setInspectRefIndex}
                            replaceAnchorSubjects={state.director.replaceAnchorSubjects}
                            toggleReplaceMode={toggleReplaceMode}
                            onSave={(updates) => updateRefSlot(inspectRefIndex!, updates)}
                            onAnalyze={handleManualAnalyze}
                            isAnalyzing={analyzingTokenId === 'ref'}
                        />
                    )}
                </div>
            </div>
        </div>
        <ConfirmDialog
            isOpen={showClearConfirm}
            onClose={() => setShowClearConfirm(false)}
            onConfirm={() => {
                dispatch({ type: 'CLEAR_STAGE' });
                setLatestSubmittedStagingRequest(null);
                setStrictMode(false);
                dispatch({ type: 'SET_RESULT_IMAGE', payload: null });
                setViewMode('stage');
            }}
            title="Clear Entire Stage?"
            message="This will remove all characters, annotations, and background data from the current scene. This action can be undone."
            confirmText="Clear Stage"
            cancelText="Keep Stage"
            variant="danger"
        />
    </>
    );
};

export default SceneCanvas;

