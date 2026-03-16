import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SceneSpecOverlay from "./SceneSpecOverlay"

import {
    RotateCw,
    RefreshCcw,
    X,
    Copy,
    Trash2 as TrashIcon,
    Link2,
    Layers,
    StickyNote,
    BoxSelect,
    UserPlus,
    Pipette,
    Undo,
    Redo,
    Settings as SettingsIcon,
    Square,
    Pencil,
    Target,
    MoveUpRight,
    MonitorPlay
} from 'lucide-react';
import { NumericInput } from './ui/NumericInput';
import { SidebarPanel } from './ui/SidebarPanel';

import { useAppContext } from '../context/AppContext';
import type {
    DirectorAspectRatio,
    ReferenceSlot,
    Shot,
    StageToken,
    SpatialAuthorityStatus,
    CastMember,
    DirectorSettings,
    DepthAssistWarning,
    WhitelistProfile
} from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { DepthService } from '../services/DepthService';
import { compileV3DirectorPrompt, buildPlacementPrompt, getActiveReferenceSlots, buildStrictAnchorReplacementPrompt } from '../utils/promptHelpers';
import { useProductionExports } from '../hooks/useProductionExports';
import { useAdvancedRender } from '../hooks/useAdvancedRender';
import { buildPlacementIntentsFromAnnotations, buildAnchorSurfaceFromZone, buildAllowanceMaskFromAnchor, buildForegroundProtectMaskFromDepth } from '../utils/spatialHelpers';
import { CutoutService } from '../services/CutoutService';

import React from 'react';

// UI Components
import ConfirmDialog from './ui/ConfirmDialog';
import { DebouncedHueSlider } from './ui/DebouncedHueSlider';
import { NanobananaThinking } from './ui/NanobananaThinking';

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

import { DEPTH_BAND_RADIUS } from '../services/SpatialIntelligence';

import { useSceneSpec } from "../../scene/useSceneSpec"


// B. Scene Blocking Component

const SceneCanvas = () => {



    const { state, dispatch } = useAppContext();
    const stageRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    // Camera Gate: an inner viewport that always matches the selected aspect ratio.
    // All staging (tokens, notes, masks) must live inside this gate to guarantee WYSIWYG export.
    const [viewportBox, setViewportBox] = useState<{ x: number; y: number; w: number; h: number }>({
        x: 0,
        y: 0,
        w: 1,
        h: 1
    });

    // --- MANUAL DOWNLOADS ---
    const downloadStageImage = async () => {
        if (!viewportRef.current) return;
        dispatch({ type: 'SET_PROCESSING', payload: true });

        try {
            // IF we are looking at the final result, just download that image directly
            if (viewMode === 'result' && (state.resultImage || (activeShot && activeShot.latestCompositeResultUrl))) {
                dispatch({ type: 'ADD_LOG', payload: { message: 'Downloading Final Result Image...', type: 'info' } });
                const url = state.resultImage || activeShot?.latestCompositeResultUrl;
                if (!url) throw new Error("No result image available.");
                
                // For data URLs we can download directly
                const link = document.createElement('a');
                link.href = url;
                link.download = `NB_Result_${Date.now()}.png`;
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
                link.download = `NB_Stage_${Date.now()}.png`;
                link.click();
                dispatch({ type: 'ADD_LOG', payload: { message: 'Stage captured successfully.', type: 'success' } });
            } else {
                throw new Error("Canvas composition returned empty.");
            }
        } catch (e: any) {
             dispatch({ type: 'ADD_LOG', payload: { message: `Download failed: ${e.message}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const downloadDepthMap = () => {
        if (!state.depthMapUrl) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No depth map available to capture.', type: 'error' } });
            return;
        }
        dispatch({ type: 'ADD_LOG', payload: { message: 'Capturing Scene Depth Map...', type: 'info' } });
        const depthLink = document.createElement('a');
        depthLink.href = state.depthMapUrl;
        depthLink.download = `NB_Scene_Depth_${Date.now()}.png`;
        depthLink.click();
        dispatch({ type: 'ADD_LOG', payload: { message: 'Depth map captured successfully.', type: 'success' } });
    };

    // --- DOM CAPTURE FOR SHOTS ---
    // Tracks processing status by `${tokenId}-${sourceUrl}` to allow retries if image changes
    const [cutoutStatuses, setCutoutStatuses] = useState<Record<string, 'processing' | 'failed'>>({});

    // Auto-Cutout Effect
    useEffect(() => {
        if (!state.tokens || state.tokens.length === 0) return;

        console.log('[CutoutTrigger] Evaluating tokens...', state.tokens.map(t => ({ id: t.id, tag: t.tag, type: t.elementType, hasUrl: !!t.url, cutout: !!t.cutoutUrl })));

        state.tokens.forEach(async (t) => {
            // Only process actors or newly dropped assets (we assume missing type is actor from CastingForge)
            const isEligibleToken = t.elementType === 'actor' || t.elementType === 'prop' || !t.elementType;
            
            console.log(`[CutoutTrigger] Checking ${t.id} - isEligible: ${isEligibleToken}, hasUrl: ${!!t.url}, hasCutout: ${!!t.cutoutUrl}`);

            if (!isEligibleToken || !t.url) return;
            // If already has cutout, skip
            if (t.cutoutUrl) return;

            const jobKey = `${t.id}-${t.url}`;
            // If currently processing or permanently failed for THIS exact image, skip
            if (cutoutStatuses[jobKey]) {
                console.log(`[CutoutTrigger] Skipping ${t.id} - status is already ${cutoutStatuses[jobKey]}`);
                return;
            }

            console.log(`[CutoutTrigger] Starting cutout process for ${t.id} (${t.tag})`);
            setCutoutStatuses(prev => ({ ...prev, [jobKey]: 'processing' }));

            try {
                // Generate Cutouts
                const { cutoutUrl, alphaMaskUrl } = await CutoutService.processImage(t.url);
                
                console.log(`[CutoutTrigger] Success for ${t.id}`);
                // Update Token cleanly preserving source
                dispatch({
                    type: 'UPDATE_TOKEN',
                    payload: {
                        id: t.id,
                        cutoutUrl,
                        alphaMaskUrl,
                        sourceImageUrl: t.url // Preserve original as source
                    }
                });

                setCutoutStatuses(prev => {
                    const next = { ...prev };
                    delete next[jobKey];
                    return next;
                });
                
                dispatch({ type: 'ADD_LOG', payload: { message: `Cutout ready for ${t.tag}`, type: 'success' } });

            } catch (err) {
                console.warn(`[CutoutTrigger] Failed for ${t.id}`, err);
                setCutoutStatuses(prev => ({ ...prev, [jobKey]: 'failed' }));
            }
        });
    }, [state.tokens, cutoutStatuses, dispatch]);
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
            const existingActor = currentActors.find(a => a.id === t.id);

            const boundingBox = {
                x: (t.x - (t.width * (t.anchorX ?? 0.5))) / viewportBox.w,
                y: (t.y - (t.height * (t.anchorY ?? 0.8))) / viewportBox.h,
                width: t.width / viewportBox.w,
                height: t.height / viewportBox.h
            };

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
                // Differential update for bounding box
                const boxChanged =
                    Math.abs(existingActor.boundingBox.x - boundingBox.x) > 0.001 ||
                    Math.abs(existingActor.boundingBox.y - boundingBox.y) > 0.001 ||
                    Math.abs(existingActor.boundingBox.width - boundingBox.width) > 0.001 ||
                    Math.abs(existingActor.boundingBox.height - boundingBox.height) > 0.001;

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
    const colorPickerRef = useRef<HTMLInputElement>(null);
    const [lastCustomColor, setLastCustomColor] = useState('#ffffff');
    const [showColorEditor, setShowColorEditor] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // --- STAGING & RESULT VIEWS ---
    const [viewMode, setViewMode] = useState<'stage' | 'result'>('stage');
    
    // --- ADVANCED RENDER CONTROLS ---
    const {
        strictMode, setStrictMode,
        autoAnchorDNA, setAutoAnchorDNA,
        dnaStatus, anchorDNA, analyzeBackgroundDNA,
        autoTokenProfiles, setAutoTokenProfiles, ensureTokenProfiles,
        handleAnalyzeMissingTokenProfiles,
        tokenProfilesReady, tokenProfilesTotal
    } = useAdvancedRender(state, dispatch as any);

    useProductionExports(state, dispatch as any);

    const [bgPrompt, setBgPrompt] = useState('');

    const activeReferences = useMemo(() => getActiveReferenceSlots(state.referenceSlots), [state.referenceSlots]);
    
    const compiledPrompt = useMemo(() => {
        if (!strictMode) return compileV3DirectorPrompt(state.director, state.referenceSlots, state.tokens);
        return buildStrictAnchorReplacementPrompt({
            bgPrompt: bgPrompt || state.director.subject,
            mergeStrategy: state.director.mergeStrategy,
            sceneLock: state.director.sceneLock,
            replaceAnchorSubjects: state.director.replaceAnchorSubjects,
            globalReplaceTarget: state.director.globalReplaceTarget,
            hasDepthMap: !!state.depthMapUrl,
            activeRefs: activeReferences
        });
    }, [strictMode, bgPrompt, state.director, state.depthMapUrl, activeReferences, state.tokens]);


    const [dragItem, setDragItem] = useState<{ id: string, type: 'token' | 'annotation', startX: number, startY: number, initialX: number, initialY: number } | null>(null);
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



    // SPATIAL INTELLIGENCE: Auto-Generate Depth Map on Background Change
    const lastBgRef = useRef<string | null>(state.backgroundUrl);

    const refreshSpatialData = useCallback(async () => {
        if (!state.backgroundUrl || !state.apiKey || state.isDepthProcessing) return;

        dispatch({ type: 'SET_DEPTH_PROCESSING', payload: true });

        try {
            // "Ghost" generation: Use Gemini to infer the depth map from the RGB image
            const depthPrompt = "Generate a high-fidelity grayscale depth map of this scene. White represents near objects (foreground), Black represents far objects (background). The output must be a strict grayscale depth mask. Maintain exact aspect ratio and composition.";

            const depthUrl = await GeminiService.generateImage(
                depthPrompt,
                state.apiKey,
                state.model,
                [{ url: state.backgroundUrl, label: "Scene Context" }]
            );

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
            }
        } catch (error) {
            console.error("[Spatial Intelligence] Auto-Depth Failed:", error);
        } finally {
            dispatch({ type: 'SET_DEPTH_PROCESSING', payload: false });
        }
    }, [state.backgroundUrl, state.apiKey, state.model, state.isDepthProcessing, dispatch]);

    // Lifted utilities from ProductionConsole

    // analyzeBackgroundDNA extracted to useAdvancedRender hook
    useEffect(() => {
        const syncSpatialData = async () => {
            // 1. Detect Change
            if (state.backgroundUrl !== lastBgRef.current) {
                lastBgRef.current = state.backgroundUrl;

                // 2. Clear Stale Data (Immediate Visual Feedback)
                if (state.depthMapUrl) {
                    dispatch({ type: 'SET_DEPTH_MAP', payload: null });
                    dispatch({ type: 'SET_FLOOR_PLANE', payload: null });
                    dispatch({ type: 'SET_OCCUPIED_VOLUMES', payload: [] });
                }

                // 3. Trigger Refresh
                refreshSpatialData();
            }
        };

        syncSpatialData();
    }, [state.backgroundUrl, refreshSpatialData, state.depthMapUrl, dispatch]);

    /**
    * GROUNDING SYNCHRONIZATION
    * Ensures that all actors with groundingEnabled are automatically re-snapped
    * to the current floor authority whenever the floor plane changes or is recalculated.
    */
    // Compute Ground Depth (ONCE per depth map)
    // Compute Ground Depth (ONCE per depth map)
    useEffect(() => {
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
        // BAILOUT: If there is no depth map or no background, we cannot compute grounding.
        if (groundDepth === null || !state.depthMapUrl || !state.backgroundUrl) {
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

            const footY = token.y + token.height * (token.anchorY ?? 1.0);
            const footYClamped = Math.min(Math.max(footY, 0), viewportBox.h - 1);
            
            const rawDepth = DepthService.getDepthAtPointSync(
                state.depthMapUrl!,
                token.x / viewportBox.w,
                footYClamped / viewportBox.h
            );

            const clamped = DepthService.clampDepthToGround(rawDepth, groundDepth);

            // ONLY dispatch if depth ACTUALLY changed to avoid infinite loop
            if (Math.abs(clamped - (token.depth || 0)) > 0.01) {
                dispatch({
                    type: 'UPDATE_TOKEN',
                    payload: { id: token.id, depth: clamped },
                });
            }
        });
    }, [state.depthMapUrl, state.backgroundUrl, groundDepth, viewportBox.h, viewportBox.w, state.tokens, dispatch]);

    /**
    * OCCLUSION MASKS (PER-TOKEN)
    * Generates a per-token alpha mask derived ONLY from the depth map (background), so actors never self-occlude.
    * Mask semantics: alpha=255 means token pixel is visible; alpha=0 means occluded by a nearer background pixel.
    */
    useEffect(() => {
        // Avoid heavy work while dragging (masks will refresh on drag end)
        if (dragItem) return;

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
                    if ((token as any).hasConfirmedPlacement === false) continue;

                    const tokenW = Math.max(1, Number((token as any).width) || 1);
                    const tokenH = Math.max(1, Number((token as any).height) || 1);
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
                    const anchorX = (token as any).anchorX ?? 0.5;
                    const anchorY = (token as any).anchorY ?? 0.8;
                    const left = (token.x || 0) - (tokenW * anchorX);
                    const top = (token.y || 0) - (tokenH * anchorY);

                    // Transform mapping so occlusion stays correct under rotate/scale
                    const originX = tokenW * anchorX;
                    const originY = tokenH * anchorY;
                    const rot = ((token.rotation || 0) * Math.PI) / 180;
                    const cos = Math.cos(rot);
                    const sin = Math.sin(rot);
                    const sx = (token.scaleX ?? 1);
                    const sy = (token.scaleY ?? 1);

                    const stepX = tokenW / maskW;
                    const stepY = tokenH / maskH;
                    const tokenDepth = token.depth;

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
                            const sceneDepth = DepthService.getDepthAtPointSync(
                                state.depthMapUrl,
                                stageXClamped / viewportBox.w,
                                stageYClamped / viewportBox.h
                            );

                            const occluded = token.occlusionMode === 'front'
                                ? false
                                : sceneDepth > (tokenDepth - (token.occlusionBias || 0) + EPS);

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
    }, [state.depthMapUrl, state.tokens, viewportBox.w, viewportBox.h, dragItem]);


    const parseAspectRatioToNumber = (ar: DirectorAspectRatio | string | undefined): number => {
        const raw = String(ar || '16:9');
        const parts = raw.split(':').map((p) => Number(p));
        if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[1] !== 0) {
            return parts[0] / parts[1];
        }
        return 16 / 9;
    };

    // Keep the camera gate centered and sized correctly even when the stage container changes.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;

        const update = () => {
            const cw = Math.max(1, stage.clientWidth);
            const ch = Math.max(1, stage.clientHeight);
            const ratio = parseAspectRatioToNumber(state.director.aspectRatio);

            let w = cw;
            let h = w / ratio;

            if (h > ch) {
                h = ch;
                w = h * ratio;
            }

            const x = (cw - w) / 2;
            const y = (ch - h) / 2;

            setViewportBox((prev) => {
                const changed =
                    prev.x !== x || prev.y !== y || prev.w !== w || prev.h !== h;
                return changed ? { x, y, w, h } : prev;
            });
        };

        update();
        const obs = new ResizeObserver(update);
        obs.observe(stage);
        return () => obs.disconnect();
    }, [state.director.aspectRatio]);

    // analyzeWhitelistProfile was moved to useAdvancedRender
    const buildRegionPlan = (overrides?: { token?: Map<string, WhitelistProfile>; cast?: Map<string, WhitelistProfile> }) => {
        const sorted = [...state.tokens].sort((a, b) => (a.zIndex - b.zIndex) || (a.x - b.x));

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

    const buildAnchorPlate = async (regionPlan: ReturnType<typeof buildRegionPlan>): Promise<string> => {
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
        if (state.backgroundUrl) {
            const bg = await loadDataUrlImage(state.backgroundUrl);
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

        // Draw tokens
        const tokensByDepth = [...regionPlan].sort((a, b) => a.token.zIndex - b.token.zIndex);
        for (const r of tokensByDepth) {
            try {
                const t = r.token;
                const img = await loadDataUrlImage(t.url);

                const ax = (t.anchorX ?? 0.5) * t.width;
                const ay = (t.anchorY ?? 0.8) * t.height;

                const imgRatio = img.width / img.height;
                const boxRatio = t.width / t.height;
                let drawW = t.width;
                let drawH = t.height;
                let offX = 0;
                let offY = 0;

                if (imgRatio > boxRatio) {
                    drawW = t.width;
                    drawH = t.width / imgRatio;
                    offY = (t.height - drawH) / 2;
                } else {
                    drawH = t.height;
                    drawW = t.height * imgRatio;
                    offX = (t.width - drawW) / 2;
                }

                ctx.save();
                ctx.translate(t.x + ax, t.y + ay);
                ctx.rotate((t.rotation * Math.PI) / 180);
                ctx.scale(t.scaleX, t.scaleY || 1);
                ctx.drawImage(img, -ax + offX, -ay + offY, drawW, drawH);
                ctx.restore();
            } catch (e) {
                console.warn("Failed to draw token on anchor plate", r.token.id, e);
            }
        }

        return canvas.toDataURL('image/png');
    };

    // Unified Workflow Generate Button
    const generateBg = async () => {
        if (!state.apiKey) return;
        const hasSourceScene = !!state.backgroundUrl;
        const hasPromptText = !!bgPrompt?.trim() || !!state.director.subject?.trim();

        if (!hasPromptText && !hasSourceScene) return;

        dispatch({ type: 'SET_PROCESSING', payload: true });

        // Show result view right away so users see the loader overlay
        setViewMode('result');

        let currentPercent = 5;
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
            if (currentPercent >= 95) text = "Rendering Cinematic Shot... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, 1000);

        try {
            let dnaForRender = anchorDNA;

            // In Strict Mode, we attempt to refresh the Anchor DNA if it is missing
            if (
                strictMode &&
                autoAnchorDNA &&
                state.backgroundUrl &&
                state.apiKey &&
                !dnaForRender.environment &&
                !dnaForRender.lighting &&
                !dnaForRender.camera
            ) {
                const fresh = await analyzeBackgroundDNA();
                if (fresh) dnaForRender = fresh;
            }

            const tokenOverrides = await ensureTokenProfiles(state.tokens, { force: autoTokenProfiles });

            const { buildStrictPrompt, buildLoosePrompt } = await import('../utils/promptHelpers');

            if (strictMode) {
                const plan = buildRegionPlan({ token: tokenOverrides });
                const anchorPlate = await buildAnchorPlate(plan);
                
                const strictPromptText = buildStrictPrompt(
                    plan, 
                    dnaForRender, 
                    compiledPrompt, // reusing real-time compiledPrompt as notes
                    state.tokens, 
                    state.annotations, 
                    state.referenceSlots, 
                    state.director
                );

                const refs: { url: string; label: string }[] = [];
                refs.push({ url: anchorPlate, label: "ANCHOR_GUIDE" });

                if (state.backgroundUrl) refs.push({ url: state.backgroundUrl, label: "CLEAN_BG_PLATE" });
                for (const r of plan) refs.push({ url: r.token.url, label: `REGION_${r.region}_REF` });

                const activeRefs = getActiveReferenceSlots(state.referenceSlots);
                const urls = new Set(refs.map(r => r.url));
                for (const rs of activeRefs) {
                    if (!rs.url) continue;
                    if (refs.length >= 14) break;
                    if (urls.has(rs.url)) continue;
                    refs.push({ url: rs.url, label: `REFERENCE ${rs.index} (global consistency)` });
                    urls.add(rs.url);
                }

                const limitedRefs = refs.slice(0, 14);

                const img = await GeminiService.generateImage(
                    strictPromptText,
                    state.apiKey!,
                    state.model,
                    limitedRefs,
                    { aspectRatio: '16:9', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding, strictMode: true }
                );

                dispatch({ type: 'SET_RESULT_IMAGE', payload: img });
                dispatch({ type: 'SET_COMPOSITE_METADATA', payload: { latestCompositeSource: 'directorCanvas', latestCompositeResultUrl: img } });
                setViewMode('result');
                dispatch({ type: 'ADD_LOG', payload: { message: "Staging strictly rendered.", type: 'success' } });
            } else {
                const references: { url: string; label: string }[] = [];
                const activeRefs = getActiveReferenceSlots(state.referenceSlots);
                if (activeRefs.length > 0) {
                    for (const r of activeRefs) {
                        if (!r.url) continue;
                        references.push({ url: r.url, label: `REFERENCE ${r.index}: ${r.name || r.analysis || ''}`.trim() });
                    }
                } else {
                    const uniqueCastIds = new Set(state.tokens.map(t => t.castId));
                    uniqueCastIds.forEach(id => {
                        const member = (state.cast || []).find(c => c.id === id);
                        if (member) references.push({ url: member.url, label: `Character: ${member.name}` });
                    });
                }

                if (state.backgroundUrl && !references.some(r => r.url === state.backgroundUrl)) {
                    references.push({ url: state.backgroundUrl, label: "Environment/Lighting Anchor" });
                }

                const safeCast = state.cast || [];
                if (references.length === 0 && safeCast.length > 0) {
                    references.push({ url: safeCast[0].url, label: "Style Reference" });
                }

                const loosePromptText = buildLoosePrompt(
                    dnaForRender,
                    state.tokens,
                    state.annotations,
                    state.referenceSlots,
                    state.director
                );

                const img = await GeminiService.generateImage(
                    loosePromptText,
                    state.apiKey!,
                    state.model,
                    references.slice(0, 14),
                    { aspectRatio: state.director.aspectRatio, imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding }
                );

                dispatch({ type: 'SET_RESULT_IMAGE', payload: img });
                dispatch({ type: 'SET_COMPOSITE_METADATA', payload: { latestCompositeSource: 'directorCanvas', latestCompositeResultUrl: img } });
                setViewMode('result');
                dispatch({ type: 'ADD_LOG', payload: { message: "Staging (loose) rendered.", type: 'success' } });
            }
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
            setViewMode('stage');
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
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
                // @ts-ignore
                if (import.meta.env?.DEV) {
                    e.preventDefault();
                    setShowDebugActorOverlay(prev => !prev);
                }
            }
            if (e.shiftKey && e.key === 'G') {
                // @ts-ignore
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
    const [panelOrder, setPanelOrder] = useState<string[]>(['specs', 'layers', 'shots', 'advanced_render', 'ref_stacks', 'region_edit', 'scene_director']);

    // Use global panel state from AppContext to persist during navigation
    const collapsedPanels = (state as any).stagePanelState || {
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
        } as any);
    };

    const handlePanelDrop = (targetId: string) => {
        if (!draggedPanelId || draggedPanelId === targetId) return;
        const newOrder = [...panelOrder];
        const fromIndex = newOrder.indexOf(draggedPanelId);
        const toIndex = newOrder.indexOf(targetId);
        if (fromIndex === -1 || toIndex === -1) return;
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, draggedPanelId);
        setPanelOrder(newOrder);
        setDraggedPanelId(null);
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

    useEffect(() => {
        setActiveShotNameDraft(activeShot?.name || '');
    }, [activeShotId]);


    // --- REGION EDIT (Mask / Brush) ---
    const regionEdit = (state as any).regionEdit as any;
    const activeLayer = regionEdit?.layers?.find((l: any) => l.id === regionEdit.activeLayerId) || regionEdit?.layers?.[0] || null;

    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskIsDownRef = useRef(false);
    const lastPtRef = useRef<{ x: number; y: number } | null>(null);

    // --- PROTECTION MASK (Face / Hair / Subject lock) ---
    const [protectEnabled, setProtectEnabled] = useState(true);
    const [protectMaskUrl, setProtectMaskUrl] = useState<string | null>(null);
    const [rawProtectMaskUrl, setRawProtectMaskUrl] = useState<string | null>(null);
    const [protectErosion, setProtectErosion] = useState(0);
    const [protectStatus, setProtectStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');




    const loadDataUrlImage = (url: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    // Erode (shrink) a white mask by radius pixels
    const erodeMask = async (srcUrl: string, radius: number): Promise<string> => {
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
    };

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
    }, [rawProtectMaskUrl, protectErosion]);

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
        if (!state.apiKey) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for protection mask.', type: 'error' } } as any);
            return;
        }
        setProtectStatus('generating');
        try {
            const captured = await captureSceneImage();
            if (!captured) throw new Error('Stage capture returned empty.');

            // Pick a Gemini image model for mask generation
            const maskModel = (state.model && String(state.model).includes('gemini')) ? state.model : 'gemini-2.5-flash-image';

            const prompt =
                "FACE + HAIR PROTECTION MASK: Create a pure black & white segmentation mask where ONLY the subject's face and hair are PURE WHITE (#FFFFFF). Everything else MUST be PURE BLACK (#000000). No gray. No gradients. No background. Use clean edges.";

            const res = await GeminiService.generateImage(
                prompt,
                state.apiKey,
                maskModel as any,
                [{ url: captured, label: 'Base Frame' }],
                { aspectRatio: state.director.aspectRatio }
            );

            setRawProtectMaskUrl(res);
            setProtectMaskUrl(res); // Initial set (erosion 0)
            setProtectStatus('ready');
            dispatch({ type: 'ADD_LOG', payload: { message: 'Protection mask generated (face/hair).', type: 'success' } } as any);
        } catch (e: any) {
            setProtectStatus('error');
            dispatch({ type: 'ADD_LOG', payload: { message: `Protection mask failed: ${e?.message || e}`, type: 'error' } } as any);
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
        dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: activeLayer.id, updates: { maskDataUrl: dataUrl } } } as any);
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
        dispatch({ type: 'CLEAR_REGION_LAYER_MASK', payload: activeLayer.id } as any);
        const c = maskCanvasRef.current;
        const ctx = c?.getContext('2d');
        if (c && ctx) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, c.width, c.height);
        }
    };

    const applyRegionEditQueue = async () => {
        if (!state.apiKey) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for Region Edit.', type: 'error' } } as any);
            return;
        }
        if (!regionEdit?.layers?.some((l: any) => l.enabled && l.maskDataUrl && (l.prompt || '').trim())) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No enabled mask layers with both mask + prompt.', type: 'error' } } as any);
            return;
        }

        cancelRegionEditRef.current = false;
        setIsRegionEditRunning(true);
        dispatch({ type: 'SET_PROCESSING', payload: true } as any);
        try {
            const editModel = state.model === 'imagen-4.0-generate-001' ? 'gemini-2.5-flash-image' : state.model;

            const captured = await captureSceneImage();
            if (!captured) throw new Error('Stage capture returned empty.');

            let base: string = captured;

            // 1. Process standard regions
            const layers = (regionEdit.layers as any[]).filter((l: any) => l.enabled);

            // 2. Process intentional placements (Auto-Generated Region Edits)
            const intents = buildPlacementIntentsFromAnnotations(state.annotations as any, state.tokens as any);
            const intentLayers = [];

            for (const intent of intents) {
                const token = state.tokens.find(t => t.id === intent.actorId);
                const anchor = state.annotations.find(a => a.id === intent.anchorId);
                if (!token || !anchor) continue;

                const lookAt = intent.lookAtId ? state.annotations.find(a => a.id === intent.lookAtId) : undefined;

                // Build literal mask
                const anchorSurface = buildAnchorSurfaceFromZone(anchor as any);
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
                        prompt: buildPlacementPrompt(intent, token, anchor as any, lookAt as any),
                        enabled: true,
                        status: 'idle'
                    });
                }
            }

            const allLayers = [...layers, ...intentLayers];

            // mark queued
            for (const layer of allLayers) {
                if (cancelRegionEditRef.current) {
                    dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit cancelled.', type: 'info' } } as any);
                    break;
                }
                // Skip UI updates for virtual intent layers
                if (!layer.id.startsWith('intent-')) {
                    dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'running', lastError: null } } } as any);
                    dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'queued', lastError: null } } } as any);
                }
            }

            for (const layer of allLayers) {
                if (cancelRegionEditRef.current) {
                    dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit cancelled.', type: 'info' } } as any);
                    break;
                }

                if (!layer.id.startsWith('intent-')) {
                    dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'running', lastError: null } } } as any);
                }

                const mask: string | null = layer.maskDataUrl ?? null;
                const promptText: string = String(layer.prompt || '').trim();

                if (!mask || !promptText) {
                    if (!layer.id.startsWith('intent-')) dispatch({ type: 'UPDATE_REGION_LAYER', payload: { id: layer.id, updates: { status: 'idle' } } } as any);
                    continue;
                }

                dispatch({ type: 'ADD_LOG', payload: { message: `Applying ${layer.name}...`, type: 'info' } } as any);

                let maskToSend: string = mask;
                if (protectEnabled && protectMaskUrl && !layer.id.startsWith('intent-')) { // intentional protects its own via depth
                    maskToSend = await subtractProtectionMask(mask, protectMaskUrl);
                }

                base = await GeminiService.editImageWithMask(
                    base,
                    maskToSend,
                    promptText,
                    state.apiKey,
                    editModel,
                    [],
                    { aspectRatio: state.director.aspectRatio }
                );
            }

            dispatch({ type: 'SET_RESULT_IMAGE', payload: base } as any);
            dispatch({ type: 'ADD_LOG', payload: { message: 'Region Edit complete.', type: 'success' } } as any);
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Region Edit failed: ${e?.message || e}`, type: 'error' } } as any);
        } finally {
            setIsRegionEditRunning(false);
            dispatch({ type: 'SET_PROCESSING', payload: false } as any);
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

    const refAnalysisPrompt = "Describe the subject, their clothing/appearance, and the specific art style or texture details. Be concise (max 20 words).";

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

    const analyzeRefSlot = async (index: number, imageUrl: string) => {
        if (!state.apiKey) {
            updateRefSlot(index, { analysis: 'Analysis unavailable (Manual Mode)', status: 'ready' });
            return;
        }

        try {
            const text = await GeminiService.analyzeImage(refAnalysisPrompt, state.apiKey, state.model, imageUrl);
            updateRefSlot(index, { analysis: text, status: 'ready' });
        } catch (e: any) {
            updateRefSlot(index, { analysis: `Analysis unavailable (${e.message || 'error'})`, status: 'ready' });
        }
    };

    const setSlotFromUrl = async (index: number, url: string, name?: string, castId?: string) => {
        updateRefSlot(index, {
            url,
            name: name || `Ref ${index}`,
            castId,
            active: true,
            status: 'analyzing',
            analysis: 'Analyzing…'
        });
        await analyzeRefSlot(index, url);
    };

    const handleRefSlotFile = async (index: number, file: File) => {
        const url = await fileToDataUrl(file);
        await setSlotFromUrl(index, url, file.name, undefined);
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
                    await setSlotFromUrl(index, cast.url, cast.name || (cast as any).tag, cast.id);
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
        return compileV3DirectorPrompt(state.director, state.referenceSlots, state.tokens);
    }, [state.director, state.referenceSlots, state.tokens]);

    const handleCopyDirectorPrompt = async () => {
        const text = v3DirectorPrompt || '';
        try {
            await navigator.clipboard.writeText(text);
            dispatch({ type: 'ADD_LOG', payload: { message: 'Director prompt copied to clipboard.', type: 'success' } });
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
            const TARGET_W = viewportBox.w;
            const TARGET_H = viewportBox.h;
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
                .sort((a, b) => a.zIndex - b.zIndex);

            for (const t of sortedTokens) {
                try {
                    const img = await loadImage(t.url);
                    ctx.save();

                    const ax = t.anchorX !== undefined ? t.anchorX : 0.5;
                    const ay = t.anchorY !== undefined ? t.anchorY : 0.8;

                    // Coordinate Transform
                    ctx.translate(t.x, t.y);
                    ctx.rotate((t.rotation * Math.PI) / 180);
                    ctx.scale(t.scaleX, t.scaleY);

                    // "Object-Contain" Logic
                    const imgRatio = img.width / img.height;
                    const boxRatio = t.width / t.height;
                    let drawW = t.width;
                    let drawH = t.height;
                    let offX = 0;
                    let offY = 0;

                    if (imgRatio > boxRatio) {
                        drawW = t.width;
                        drawH = t.width / imgRatio;
                        offY = (t.height - drawH) / 2;
                    } else {
                        drawH = t.height;
                        drawW = t.height * imgRatio;
                        offX = (t.width - drawW) / 2;
                    }

                    ctx.drawImage(img, (-t.width * ax) + offX, (-t.height * ay) + offY, drawW, drawH);
                    ctx.restore();
                } catch (e) {
                    console.error("Token load failed", t.tag, e);
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
            const TARGET_W = viewportBox.w;
            const TARGET_H = viewportBox.h;
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
                    ctx.fillRect(r.x, r.y, r.w, r.h);
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
        if ((state as any).regionEdit?.isMaskMode) return;
        if (dragItem) {
            const dx = e.clientX - dragItem.startX;
            const dy = e.clientY - dragItem.startY;
            const updates = { x: dragItem.initialX + dx, y: dragItem.initialY + dy };

            if (dragItem.type === 'token') {
                // Pure visual movement during drag (Authority Handoff Contract)
                dispatch({ type: 'UPDATE_TOKEN', payload: { id: dragItem.id, x: updates.x, y: updates.y } });
            } else {
                dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: dragItem.id, ...updates } });
            }
        } else if (resizeItem) {
            const dx = e.clientX - resizeItem.startX;
            const dy = e.clientY - resizeItem.startY;

            let nw = resizeItem.initialW;
            let nh = resizeItem.initialH;

            // Better: we need the resizeItem to store the anchor to do this math properly if it varies per token.
            // Assuming 'token' type has anchorX/Y. We need to pass it in setResizeItem.
            // Let's assume passed in resizeItem.

            const ax = (resizeItem as any).anchorX ?? 0.5;
            const ay = (resizeItem as any).anchorY ?? 0.8;

            let oldLeft = resizeItem.initialX - (resizeItem.initialW * ax);
            let oldTop = resizeItem.initialY - (resizeItem.initialH * ay);

            let newLeft = oldLeft;
            let newTop = oldTop;

            // Calculate new dimensions based on handle
            if (resizeItem.handle.includes('r')) nw = Math.max(20, resizeItem.initialW + dx);
            if (resizeItem.handle.includes('l')) {
                nw = Math.max(20, resizeItem.initialW - dx);
                newLeft = oldLeft + (resizeItem.initialW - nw);
            }
            if (resizeItem.handle.includes('b')) nh = Math.max(20, resizeItem.initialH + dy);
            if (resizeItem.handle.includes('t')) {
                nh = Math.max(20, resizeItem.initialH - dy);
                newTop = oldTop + (resizeItem.initialH - nh);
            }

            // Aspect Ratio Lock
            if (resizeItem.uniformScale) {
                const ratio = resizeItem.initialW / resizeItem.initialH;
                if (resizeItem.handle === 'br' || resizeItem.handle === 'tl') {
                    if (Math.abs(dx) > Math.abs(dy)) {
                        nh = nw / ratio;
                        if (resizeItem.handle === 'tl') newTop = oldTop + (resizeItem.initialH - nh);
                    } else {
                        nw = nh * ratio;
                        if (resizeItem.handle === 'tl') newLeft = oldLeft + (resizeItem.initialW - nw);
                    }
                } else if (resizeItem.handle === 'tr') {
                    if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio; else nw = nh * ratio;
                    newTop = oldTop + (resizeItem.initialH - nh);
                } else if (resizeItem.handle === 'bl') {
                    if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio; else nw = nh * ratio;
                    newLeft = oldLeft + (resizeItem.initialW - nw);
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
                        scaleX: resizeItem.initialScaleX,
                        scaleY: resizeItem.initialScaleY,
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
            const dx = e.clientX - rotateItem.centerX;
            const dy = e.clientY - rotateItem.centerY;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            // Delta from start click
            const delta = angle - rotateItem.startAngle;
            const newRot = (rotateItem.initialRotation + delta + 360) % 360; // Normalize 0-360

            if (rotateItem.type === 'token') {
                dispatch({ type: 'UPDATE_TOKEN', payload: { id: rotateItem.id, rotation: newRot } });
            } else {
                dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: rotateItem.id, rotation: newRot } });
            }
        }
    };


    const handleStageMouseUp = () => {
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
                    let payload: any = { id, x, y, rotation: 0, scaleX: 1, scaleY: 1 };

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
                    castItem = (state.cast || []).find(c => c.id === item.id);
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
                        x: x - 100,
                        y: y - 150,
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
        const id = `shot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        dispatch({ type: 'ADD_SHOT_FROM_STAGE', payload: { id, name: newShotName.trim() || undefined } } as any);
        setNewShotName('');

        // Auto-capture the visual state into the newly created shot's Start Plate
        captureAndSetShotFrame('start', id);
    };

    const setActiveShot = (id: string) => {
        dispatch({ type: 'SET_ACTIVE_SHOT', payload: { id } } as any);
    };

    const duplicateShot = (id: string) => {
        dispatch({ type: 'DUPLICATE_SHOT', payload: { id } } as any);
    };

    const removeShot = (id: string) => {
        dispatch({ type: 'REMOVE_SHOT', payload: { id } } as any);
    };

    const renameActiveShot = () => {
        if (!activeShotId) return;
        const name = activeShotNameDraft.trim();
        if (!name) return;
        dispatch({ type: 'UPDATE_SHOT_META', payload: { id: activeShotId, updates: { name } } } as any);
    };

    const captureAndSetShotFrame = async (which: 'start' | 'end', targetId?: string) => {
        const idToUse = targetId || activeShotId;
        if (!idToUse) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } } as any);
            return;
        }
        dispatch({ type: 'SET_PROCESSING', payload: true } as any);
        try {
            const dataUrl = await captureSceneImage();
            if (!dataUrl) throw new Error('Stage capture returned empty.');
            dispatch({ type: 'SET_SHOT_FRAME', payload: { id: idToUse, which, url: dataUrl } } as any);
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved ${which.toUpperCase()} frame from stage.`, type: 'success' } } as any);
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to capture ${which} frame: ${e?.message || e}`, type: 'error' } } as any);
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false } as any);
        }
    };







    // --- DIRECTOR CANVAS LAYOUT COMPOSITE PIPELINE (NEW) ---

    const collectVisibleCompositeElements = useCallback(() => {
        return state.tokens
            .filter(t => t.visible !== false && !!t.url)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map(t => ({
                id: t.id,
                url: t.cutoutUrl || t.url,
                sourceImageUrl: t.sourceImageUrl || t.url,
                label: t.tag,
                type: t.elementType || 'actor',
                x: t.x,
                y: t.y,
                width: t.width,
                height: t.height,
                anchorX: t.anchorX !== undefined ? t.anchorX : 0.5,
                anchorY: t.anchorY !== undefined ? t.anchorY : 0.8,
                preserveIdentity: t.preserveIdentity,
                preserveWardrobe: t.preserveWardrobe,
                groundingMode: t.groundingMode,
                notes: t.notes
            }));
    }, [state.tokens]);

    const collectDepthAssistWarnings = useCallback((): DepthAssistWarning[] => {
        const warnings: DepthAssistWarning[] = [];
        if (!state.depthMapUrl || state.isDepthProcessing) return warnings;

        const elements = collectVisibleCompositeElements();
        
        elements.forEach(t => {
            // Normalized center-ish point for depth check
            const nx = (t.x) / viewportBox.w;
            const ny = (t.y) / viewportBox.h;
            
            // Fast synchronous sample from pre-cached depth data via DepthService
            const anchorDepth = DepthService.getDepthAtPointSync(state.depthMapUrl, nx, ny);
            
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
                   const vx = vol.footprint.x * viewportBox.w;
                   const vy = vol.footprint.y * viewportBox.h;
                   const vw = vol.footprint.w * viewportBox.w;
                   const vh = vol.footprint.h * viewportBox.h;
                   
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
    }, [selectedAnnotation?.id, dispatch]);

    const duplicateSelection = () => {
        if (!state.selection || !state.selectionType) return;

        if (state.selectionType === 'token') {
            const original = state.tokens.find(t => t.id === state.selection);
            if (!original) return;

            const newId = `token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            // Find max zIndex to place on top (optional, or just +1)
            const maxZ = Math.max(...state.tokens.map(t => t.zIndex), 10);

            const cloneToken: StageToken = {
                ...original,
                id: newId,
                x: original.x + 40,
                y: original.y,
                zIndex: maxZ + 1
            };
            dispatch({ type: 'ADD_TOKEN', payload: cloneToken });
            dispatch({ type: 'SELECT_ITEM', payload: { id: newId, type: 'token' } });

        } else if (state.selectionType === 'annotation') {
            const original = state.annotations.find(a => a.id === state.selection);
            if (!original) return;

            const newId = `ann-${Date.now()}`;
            const maxZ = Math.max(...state.annotations.map(a => a.zIndex), 10);
            const cloneAnn = {
                ...original,
                id: newId,
                x: original.x + 40,
                y: original.y,
                zIndex: maxZ + 1
            };

            dispatch({ type: 'ADD_ANNOTATION', payload: cloneAnn });
            dispatch({ type: 'SELECT_ITEM', payload: { id: newId, type: 'annotation' } });
        }
    };


    const processingCutoutsCount = Object.values(cutoutStatuses).filter(v => v === 'processing').length;
    const isProcessingCutouts = processingCutoutsCount > 0;

    return (
        <>
            <div className={`flex flex-col h-full overflow-hidden`}>
                {state.isProcessing && <NanobananaThinking />}
            {isProcessingCutouts && (
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-indigo-950/80 border border-indigo-500/30 rounded shadow-lg text-indigo-200">
                    <Layers className="w-4 h-4 animate-pulse text-indigo-400" />
                    <span className="text-xs font-bold tracking-wider">Removing Background ({processingCutoutsCount})...</span>
                </div>
            )}

            <div className="flex h-full gap-4 p-4 overflow-hidden select-none">
                {/* 1. LEFT SIDEBAR: ACTIVE ACTOR INTELLIGENCE & PROPERTIES */}
                <div className="w-96 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar shrink-0">



                    <AnchorRefPanel
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
                    />

                    <ActorIntelligencePanel
                        state={state}
                        dispatch={dispatch}
                        updateToken={updateToken}
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
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[10px] text-yellow-500 truncate">{selectedToken.tag}</span>
                                        <div className="flex gap-1.5">
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
                                            <button onClick={() => updateToken(selectedToken.id, { x: selectedToken.x - 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] rounded border border-white/30 !text-[10px] text-white font-bold transition-colors shadow-sm">LEFT</button>
                                            <button onClick={() => updateToken(selectedToken.id, { x: selectedToken.x + 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] rounded border border-white/30 !text-[10px] text-white font-bold transition-colors shadow-sm">RIGHT</button>
                                            <button onClick={() => updateToken(selectedToken.id, { y: selectedToken.y - 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] rounded border border-white/30 !text-[10px] text-white font-bold transition-colors shadow-sm">UP</button>
                                            <button onClick={() => updateToken(selectedToken.id, { y: selectedToken.y + 5 })} className="flex-1 !p-0 !h-8 bg-[#27272a] hover:bg-[#3f3f46] rounded border border-white/30 !text-[10px] text-white font-bold transition-colors shadow-sm">DOWN</button>
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
                                                    const currentZ = selectedToken.zIndex;
                                                    const sorted = [...state.tokens].sort((a, b) => a.zIndex - b.zIndex);
                                                    const lower = sorted.reverse().find(t => t.zIndex < currentZ);
                                                    if (lower) {
                                                        updateToken(lower.id, { zIndex: currentZ });
                                                        updateToken(selectedToken.id, { zIndex: lower.zIndex });
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
                                                    const currentZ = selectedToken.zIndex;
                                                    const sorted = [...state.tokens].sort((a, b) => a.zIndex - b.zIndex);
                                                    const higher = sorted.find(t => t.zIndex > currentZ);
                                                    if (higher) {
                                                        updateToken(higher.id, { zIndex: currentZ });
                                                        updateToken(selectedToken.id, { zIndex: higher.zIndex });
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
                                <div className="space-y-4 pt-4 border-t border-white/5 pb-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)] animate-pulse"></div>
                                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Spatial & Occlusion</span>
                                            <span className="text-[8px] bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded border border-yellow-500/20 font-bold">CUSTOM</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4 px-1">
                                        <div>
                                            <span className="text-[9px] text-gray-300 uppercase font-bold block mb-2">Occlusion Mode</span>
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={() => updateToken(selectedToken.id, { occlusionMode: 'auto' })}
                                                    className={`group !p-0 flex-1 h-11 flex items-center justify-center text-[10px] font-bold uppercase rounded border transition-all ${(selectedToken.occlusionMode || 'auto') === 'auto'
                                                        ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                                                        : 'bg-[#27272a] border-white/30 text-gray-200 hover:text-white hover:bg-[#3f3f46]'
                                                        }`}
                                                >
                                                    AUTO (DEPTH)
                                                </button>
                                                <button
                                                    onClick={() => updateToken(selectedToken.id, { occlusionMode: 'front' })}
                                                    className={`group !p-0 flex-1 h-11 flex items-center justify-center text-[10px] font-bold uppercase rounded border transition-all ${selectedToken.occlusionMode === 'front'
                                                        ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                                                        : 'bg-[#27272a] border-white/30 text-gray-200 hover:text-white hover:bg-[#3f3f46]'
                                                        }`}
                                                >
                                                    FORCE FRONT
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] text-gray-300 uppercase font-bold">Depth Bias</span>
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
                            </div>
                        ) : null}
                    </SidebarPanel>
                    {/* End Token Properties */}


                    {/* CAST PALETTE */}
                    <SidebarPanel
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
                        <div className="p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            <div className="grid grid-cols-3 gap-2 pb-2">
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
                                        <img src={c.url} className="w-full h-full object-contain pointer-events-none" draggable={false} onDragStart={(e) => e.preventDefault()} />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <span className="text-[8px] font-bold text-white uppercase px-1 text-center leading-tight truncate w-full">{c.tag}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SidebarPanel>
                    {/* End Cast Palette */}

                    {/* ANNOTATION PROPERTIES (NEW) */}
                    {selectedAnnotation && (
                        <SidebarPanel
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
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                    <div className="flex shrink-0 h-14 w-full bg-[#09090b] border border-[#27272a] rounded-xl items-center px-4 justify-between">
                        <div className="flex flex-col gap-0.5 justify-center max-w-[60%]">
                            {/* Depth Assist UI */}
                            {(() => {
                                const warnings = collectDepthAssistWarnings();
                                const topWarnings = warnings.filter(w => w.severity === 'high' || w.severity === 'medium').slice(0, 2);
                                const hasDepth = !!state.depthMapUrl && !state.isDepthProcessing;
                                
                                let depthStatusText = "Unavailable";
                                let depthStatusColor = "text-gray-500";
                                if (hasDepth) {
                                     if (topWarnings.length > 0) {
                                         depthStatusText = "Available with warnings";
                                         depthStatusColor = "text-yellow-500";
                                     } else {
                                         depthStatusText = "Available";
                                         depthStatusColor = "text-green-500";
                                     }
                                }

                                return (
                                    <div className="flex items-center gap-2 pl-2 overflow-hidden truncate">
                                        <span className={`text-[9px] uppercase font-bold tracking-wider ${depthStatusColor}`}>
                                            Depth Assist: {depthStatusText}
                                        </span>
                                        {hasDepth && topWarnings.length > 0 && (
                                            <span className="text-[9px] text-gray-500 truncate">
                                                | {topWarnings.map(w => w.message).join(' | ')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Technical Specs Moved to right header space */}
                        <div className="flex items-center gap-4 text-[10px] text-gray-500 font-mono">
                            VB: {Math.round(viewportBox.w)}x{Math.round(viewportBox.h)} @ {Math.round(viewportBox.x)},{Math.round(viewportBox.y)} | Img: {state.backgroundUrl ? 'YES' : 'NO'} | Depth: {state.depthMapUrl ? 'YES' : 'NO'}
                        </div>
                    </div>
                    
                    {/* --- PRIMARY ACTION BAR --- */}
                    <div className="flex w-full bg-[#18181b] border border-[#27272a] rounded-lg items-center px-4 py-2 justify-between shrink-0 mb-4 shadow-xl">
                        <div className="flex items-center gap-4">
                            {/* VIEW MODE TOGGLE */}
                            <div className="flex bg-black rounded p-1 border border-gray-800 relative shadow-inner">
                                <button
                                    onClick={() => setViewMode('stage')}
                                    className={`px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded transition-colors z-10 ${viewMode === 'stage' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    Stage
                                </button>
                                <button
                                    onClick={() => {
                                        if (state.resultImage || (activeShot && activeShot.latestCompositeResultUrl)) {
                                            setViewMode('result');
                                        } else {
                                            dispatch({ type: 'ADD_LOG', payload: { message: "No result generated yet.", type: 'error' } });
                                        }
                                    }}
                                    className={`px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded transition-colors z-10 flex items-center gap-2 ${viewMode === 'result' ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'} ${!(state.resultImage || (activeShot && activeShot.latestCompositeResultUrl)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    Result
                                    {viewMode === 'result' && <span className="text-[8px] text-green-500/80 font-mono tracking-tighter uppercase leading-none mt-0.5">(Final Output Monitor)</span>}
                                </button>
                                {/* Animated Background Pill */}
                                <div 
                                    className="absolute top-1 bottom-1 w-1/2 bg-gray-800 rounded transition-transform duration-300 ease-in-out border border-gray-700/50 -z-0"
                                    style={{ transform: `translateX(${viewMode === 'stage' ? '0%' : '100%'})` }}
                                />
                            </div>

                            {/* ACTIVE REFERENCES SUMMARY */}
                            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-[#09090b] border border-white/5 rounded">
                                <span className="text-[9px] font-bold text-gray-500 tracking-wider uppercase">Active Scene References:</span>
                                <span className="text-[10px] text-purple-400 font-mono">
                                    {activeReferences.length} Slots
                                </span>
                                {activeReferences.length > 0 && (
                                    <span className="text-[9px] text-gray-500 truncate max-w-[200px]">
                                        ({activeReferences.map(r => r.name || `Ref ${r.index}`).join(', ')})
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* RENDER ACTIONS */}
                        <div className="flex gap-2">

                            <button
                                onClick={generateBg}
                                disabled={state.isProcessing}
                                className="relative group px-8 py-2 bg-[#09090b] hover:bg-black border border-white/10 hover:border-purple-500/50 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 shadow-lg overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <span className={`relative transition-colors duration-300 ${state.isProcessing ? 'text-gray-400' : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.5)] group-hover:from-cyan-300 group-hover:via-purple-300 group-hover:to-pink-300'}`}>
                                    {state.isProcessing ? 'Processing... ' : 'Generate Composite'}
                                </span>
                            </button>
                        </div>
                    </div>
                    {/* --- END ACTION BAR --- */}

                    {/* Compact Director Canvas Shot State Block */}
                    {activeShot && (
                        <div className="flex flex-col gap-1 w-full relative">
                            <div className="flex shrink-0 w-full bg-[#0e0e11] border border-[#27272a]/50 rounded items-center px-4 py-1.5 justify-between">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    Director Canvas Shot State: <span className="text-white ml-2">{activeShot.latestCompositeStage === 'generate' ? 'Generated' : activeShot.latestCompositeStage === 'refine' ? 'Refined' : 'None'}</span>
                                </span>
                                {(activeShot.latestCompositeTimestamp || activeShot.latestCompositeTemplateId) && (
                                    <div className="flex gap-4 text-[9px] text-gray-500 font-mono">
                                        {activeShot.latestCompositeTemplateId && <span>TEMPLATE: {activeShot.latestCompositeTemplateId}</span>}
                                        {activeShot.latestCompositeTimestamp && <span>UPDATED: {new Date(activeShot.latestCompositeTimestamp).toLocaleTimeString()}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div
                        ref={stageRef}
                        className="flex-1 bg-[#09090b] border border-[#27272a] rounded-xl relative overflow-hidden group"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onMouseMove={handleStageMouseMove}
                        onMouseUp={handleStageMouseUp}
                        onMouseLeave={handleStageMouseUp}
                    >
                        {/* Stage Matte (outside the camera gate) */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#111111_0%,_#000000_100%)]" />

                        {/* Camera Gate / Viewport (this is the actual rendered frame) */}
                        <div
                            ref={viewportRef}
                            className="absolute bg-black overflow-hidden rounded-xl ring-1 ring-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                            style={{
                                left: `${viewportBox.x}px`,
                                top: `${viewportBox.y}px`,
                                width: `${Math.max(10, viewportBox.w)}px`,
                                height: `${Math.max(10, viewportBox.h)}px`,
                                zIndex: 10
                            }}
                        >
                            {viewMode === 'result' && (state.resultImage || (activeShot && activeShot.latestCompositeResultUrl)) ? (
                                <img
                                    src={state.resultImage || activeShot?.latestCompositeResultUrl || undefined}
                                    alt="Generated Result"
                                    className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none z-[60]"
                                />
                            ) : state.backgroundUrl ? (
                                <img
                                    src={state.backgroundUrl}
                                    alt="Stage Background"
                                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
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
                                        if (token.depth === undefined) return null;
                                        const dRaw = token.depth * 255;
                                        return (
                                            <div
                                                key={`band-${token.id}`}
                                                className="absolute border border-[#ff00ff]/50"
                                                style={{
                                                    left: token.x - (token.width * token.anchorX),
                                                    top: token.y - (token.height * token.anchorY),
                                                    width: token.width,
                                                    height: token.height,
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
                            {(state as any).regionEdit?.isMaskMode && (
                                <canvas
                                    ref={maskCanvasRef}
                                    className="absolute inset-0 z-[55] opacity-40"
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
                                    {[...state.tokens].filter(t => t.visible !== false).sort((a, b) => a.zIndex - b.zIndex).map(token => (
                                <div
                                    key={token.id}
                                    className={`absolute cursor-move group/token ${state.selection === token.id ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-[#09090b]' : ''}`}
                                    style={{
                                        left: token.x - (token.width * (token.anchorX ?? 0.5)),
                                        top: token.y - (token.height * (token.anchorY ?? 0.8)),
                                        width: token.width,
                                        height: token.height,
                                        transformOrigin: `${(token.anchorX ?? 0.5) * 100}% ${(token.anchorY ?? 0.8) * 100}%`,
                                        transform: `perspective(800px) rotateX(${token.pitch || 0}deg) rotateY(${token.yaw || 0}deg) rotate(${token.rotation}deg) scale(${token.scaleX}, ${token.scaleY})`,
                                        zIndex: state.selection === token.id ? 1000 : (token.zIndex ?? 10),
                                        ...((tokenMasks[token.id] && dragItem?.id !== token.id && resizeItem?.id !== token.id && rotateItem?.id !== token.id) ? {
                                            WebkitMaskImage: `url(${tokenMasks[token.id]})`,
                                            WebkitMaskSize: `${token.width}px ${token.height}px`,
                                            WebkitMaskPosition: `0px 0px`,
                                            WebkitMaskRepeat: 'no-repeat',
                                            WebkitMaskComposite: 'source-over',
                                            maskImage: `url(${tokenMasks[token.id]})`,
                                            maskSize: `${token.width}px ${token.height}px`,
                                            maskPosition: `0px 0px`,
                                            maskRepeat: 'no-repeat',
                                        } : {})

                                    }}
                                    onMouseDown={(e) => {
                                        if ((state as any).regionEdit?.isMaskMode) return;
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
                                            initialX: token.x,
                                            initialY: token.y
                                        });
                                    }}
                                >
                                    <div className={`absolute inset-0 transition-all duration-500 pointer-events-none`} />
                                    {/* Cutout Status Fallback Badge */}
                                    <div className="absolute top-0 right-0 z-50 pointer-events-none p-1 flex items-center justify-end">
                                        {token.cutoutUrl ? (
                                            <span className="bg-green-500/80 text-white text-[8px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">Cutout Ready</span>
                                        ) : cutoutStatuses[`${token.id}-${token.url}`] === 'failed' ? (
                                            <span className="bg-red-500/80 text-white text-[8px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">Cutout Failed</span>
                                        ) : cutoutStatuses[`${token.id}-${token.url}`] === 'processing' ? (
                                            <span className="bg-blue-500/80 text-white text-[8px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">Removing BG...</span>
                                        ) : (
                                            <span className="bg-gray-700/80 text-white text-[8px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">Original Image</span>
                                        )}
                                    </div>
                                    {(() => {
                                        const finalUrl = token.cutoutUrl || token.url || state.actorLibrary.find(a => a.id === token.castId)?.url;
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
                                                        if (token. intelligence) f += (f ? ' ' : '') + 'drop-shadow(0 0 8px rgba(34,197,94,0.6))';

                                                        // Apply manual filters
                                                        const bright = token.brightness ?? 100;
                                                        const contrast = token.contrast ?? 100;
                                                        const saturate = token.saturation ?? 100;
                                                        const blur = token.blur ?? 0;

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
                                            {['tl', 'tr', 'bl', 'br'].map((handle) => (
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
                                                            handle: handle as any,
                                                            startX: e.clientX,
                                                            startY: e.clientY,
                                                            initialW: token.width,
                                                            initialH: token.height,
                                                            initialX: token.x,
                                                            initialY: token.y,
                                                            initialScaleX: token.scaleX,
                                                            initialScaleY: token.scaleY,
                                                            uniformScale: token.uniformScale,
                                                            // Pass anchor for resize math
                                                            anchorX: token.anchorX,
                                                            anchorY: token.anchorY
                                                        } as any);
                                                    }}
                                                />
                                            ))}
                                        </>
                                    )}

                                    {/* Label */}
                                    <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/60 px-2 py-0.5 rounded text-[8px] text-white uppercase font-bold tracking-wider pointer-events-none transition-opacity ${state.selection === token.id ? 'opacity-100' : 'opacity-0 group-hover/token:opacity-100'}`}>
                                        {token.tag}
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
                            ))}

                            {/* Annotations Layer */}
                            {[...state.annotations].filter(a => a.visible !== false).sort((a, b) => a.zIndex - b.zIndex).map(note => (
                                <div
                                    key={note.id}
                                    className={`absolute cursor-move group/note ${state.selection === note.id ? 'z-50' : ''}`}
                                    style={{
                                        left: note.x,
                                        top: note.y,
                                        width: note.width,
                                        height: note.height,
                                        zIndex: note.zIndex,
                                        transform: `rotate(${note.rotation}deg)`
                                    }}
                                    onMouseDown={(e) => {
                                        if ((state as any).regionEdit?.isMaskMode) return;
                                        e.stopPropagation();
                                        dispatch({ type: 'SELECT_ITEM', payload: { id: note.id, type: 'annotation' } });
                                        setDragItem({
                                            id: note.id,
                                            type: 'annotation',
                                            startX: e.clientX,
                                            startY: e.clientY,
                                            initialX: note.x,
                                            initialY: note.y
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
                                        <div className="w-full h-full flex flex-col border-2 border-yellow-400 bg-yellow-900/40 backdrop-blur-sm rounded-lg overflow-hidden">
                                            {/* Fixed Header Label - Outside the note content area */}
                                            <div className="bg-yellow-400 text-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center justify-between shrink-0 select-none">
                                                <span>Director Note</span>
                                                <Pencil className="w-2.5 h-2.5 opacity-50" />
                                            </div>

                                            {/* Content Area */}
                                            <div
                                                className="flex-1 p-2 overflow-hidden bg-black/40"
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingAnnotationId(note.id);
                                                }}
                                            >
                                                {editingAnnotationId === note.id ? (
                                                    <textarea
                                                        autoFocus
                                                        className="w-full h-full bg-transparent text-yellow-100 font-bold font-mono text-[11px] resize-none outline-none leading-relaxed placeholder:text-yellow-500/30"
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
                                                    <p className="text-yellow-100 font-bold font-mono text-[11px] whitespace-pre-wrap leading-relaxed select-none pointer-events-none break-words min-h-[1em]">
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
                                                strokeWidth={note.thickness ?? 2}
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
                                                    initialW: note.width,
                                                    initialH: note.height,
                                                    initialX: note.x,
                                                    initialY: note.y,
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
                                                const cx = rect.left + note.x + (note.width / 2);
                                                const cy = rect.top + note.y + (note.height / 2);

                                                const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

                                                setRotateItem({
                                                    id: note.id,
                                                    type: 'annotation',
                                                    centerX: cx,
                                                    centerY: cy,
                                                    startAngle: angle,
                                                    initialRotation: note.rotation
                                                });
                                            }}
                                        >
                                            <RotateCw className="w-3 h-3 text-blue-500 group-hover/rotate:animate-spin" />
                                        </div>
                                    )}
                                </div>
                            ))}
                            </>
                            )}
                        </div>
                    </div>

                    {/* 2b. CANVAS TOOLBAR (Moved Horizontal Below Stage) */}
                    <div className="flex items-center justify-between gap-4 p-2 bg-[#09090b] border border-[#27272a] rounded-xl shrink-0">

                        {/* Left Group: History & Edit */}
                        <div className="flex items-center gap-2 flex-1">
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

                        </div>

                        {/* Center Group: Edit & Add Tools */}
                        <div className="flex items-center justify-center gap-2 shrink-0">
                            {/* EDIT TOOLS (Moved here) */}
                            <button
                                onClick={duplicateSelection}
                                disabled={!state.selection}
                                className={`flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md transition-colors ${!state.selection ? 'opacity-50 pointer-events-none' : 'hover:bg-black'}`}
                                title="Duplicate Selection"
                            >
                                <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                                    <Copy className={`w-4 h-4 ${!state.selection ? 'text-gray-600' : 'text-purple-400'}`} />
                                </div>
                                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-purple-400">Copy</span>
                            </button>

                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                                title="Clear Everything"
                            >
                                <div className="p-2 bg-red-500/10 rounded-lg group-hover:bg-red-500/20 transition-colors">
                                    <TrashIcon className="w-4 h-4 text-red-500" />
                                </div>
                                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-red-400">CLEAR STAGE</span>
                            </button>

                            <div className="w-px h-10 bg-white/10 mx-2" />

                            {/* ADD TOOLS */}
                            <button
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({ templateType: 'annotation', annotationType: 'note' }));
                                }}
                                onClick={() => {
                                    const id = `ann-${Date.now()}`;
                                    dispatch({
                                        type: 'ADD_ANNOTATION', payload: {
                                            id, type: 'note', x: 50, y: 50, width: 150, height: 100, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 10, text: ''
                                        }
                                    });
                                    dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                                }}
                                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                            >
                                <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                                    <StickyNote className="w-4 h-4 text-blue-400" />
                                </div>
                                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-blue-400">Note</span>
                            </button>

                            <button
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({ templateType: 'annotation', annotationType: 'zone' }));
                                }}
                                onClick={() => {
                                    const id = `ann-${Date.now()}`;
                                    dispatch({
                                        type: 'ADD_ANNOTATION', payload: {
                                            id, type: 'zone', x: 100, y: 100, width: 200, height: 150, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 5
                                        }
                                    });
                                    dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                                }}
                                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                            >
                                <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                                    <BoxSelect className="w-4 h-4 text-emerald-400" />
                                </div>
                                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-emerald-400">Zone</span>
                            </button>

                            <button
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({ templateType: 'annotation', annotationType: 'arrow' }));
                                }}
                                onClick={() => {
                                    const id = `ann-${Date.now()}`;
                                    dispatch({
                                        type: 'ADD_ANNOTATION', payload: {
                                            id, type: 'arrow', x: 200, y: 200, width: 60, height: 60, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 11
                                        }
                                    });
                                    dispatch({ type: 'SELECT_ITEM', payload: { id, type: 'annotation' } });
                                }}
                                className="flex flex-col items-center gap-1 group bg-black/80 p-2 rounded-xl border border-white/5 backdrop-blur-md hover:bg-black transition-colors"
                            >
                                <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                                    <MoveUpRight className="w-4 h-4 text-purple-400" />
                                </div>
                                <span className="text-[8px] font-bold text-gray-500 uppercase group-hover:text-purple-400">Path</span>
                            </button>
                        </div>

                        {/* Right Group: Capture */}
                        <div className="flex items-center gap-2 flex-1 justify-end">
                            <button
                                onClick={downloadStageImage}
                                className="bg-black/80 hover:bg-black border border-white/10 text-blue-500 hover:text-green-500 px-4 py-1.5 rounded-md flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95"
                                title="Download composed stage image"
                            >
                                <MonitorPlay className="w-3 h-3" />
                                Save Image
                            </button>
                            <button
                                onClick={downloadDepthMap}
                                disabled={!state.depthMapUrl}
                                className={`bg-black/80 hover:bg-black border border-white/10 text-purple-500 px-4 py-1.5 rounded-md flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest transition-all ${state.depthMapUrl ? 'hover:text-purple-400 active:scale-95' : 'opacity-50 cursor-not-allowed'}`}
                                title="Download generated Depth Map"
                            >
                                <MonitorPlay className="w-3 h-3" />
                                Save Depth
                            </button>
                        </div>
                    </div>
                </div>

                {/* 3. RIGHT SIDEBAR: GLOBAL SPECS, ANCHOR, & REFERENCES */}
                <div className="w-[400px] flex flex-col gap-4 h-full overflow-hidden">
                    {/* DYNAMIC SIDEBAR PANELS */}
                    <div className="flex-1 overflow-y-auto pl-2 custom-scrollbar flex flex-col gap-3 pb-4">
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
                                            regionEdit={(state as any).regionEdit}
                                            dispatch={dispatch}
                                            protectEnabled={protectEnabled}
                                            setProtectEnabled={setProtectEnabled}
                                            protectStatus={protectStatus as any}
                                            protectMaskUrl={protectMaskUrl ?? null}
                                            protectErosion={protectErosion}
                                            setProtectErosion={setProtectErosion}
                                            generateFaceProtectionMask={generateFaceProtectionMask}
                                            setProtectMaskUrl={setProtectMaskUrl}
                                            setRawProtectMaskUrl={setRawProtectMaskUrl}
                                            setProtectStatus={setProtectStatus as any}
                                            isProcessing={state.isProcessing ?? false}
                                            apiKey={state.apiKey || ''}
                                            collapsed={collapsedPanels['region_edit']}
                                            onToggle={togglePanel}
                                            onDragStart={setDraggedPanelId}
                                            onDrop={handlePanelDrop}
                                            cursorMode={(state as any).cursorMode}
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
                                            key="anchor"
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
                    <div className="pl-2 shrink-0 pt-2 border-t border-white/5 bg-[#09090b]">
                        <PromptTerminalPanel
                            v3DirectorPrompt={v3DirectorPrompt}
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
                        />
                    )}
                </div>
            </div>
        </div>
        <ConfirmDialog
            isOpen={showClearConfirm}
            onClose={() => setShowClearConfirm(false)}
            onConfirm={() => dispatch({ type: 'CLEAR_STAGE' })}
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
