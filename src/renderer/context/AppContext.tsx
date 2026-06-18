/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { StorageService } from '../services/StorageService';
import { isNativeParams, nativeJoinPath } from '../utils/NativeFileAssets';
import { computeDepthScore } from '../utils/spatialHelpers';
import { resolveDisplayUrl } from '../utils/assetUrlResolver';
import { DEPTH_FEATURE_ENABLED } from '../config/featureFlags';

import type { VeoFivePartDraft, VeoAudioBlock, VeoTimestampBeat } from '../promptEngine/veoFivePart';
import type { ShotSession, ShotActorReferenceInput } from '../types/shots';
import { EntitlementResolver, type Entitlements } from '../utils/EntitlementResolver';
import {
    calculateRequiredGenerationCredits,
    type InsufficientCreditModalState
} from '../utils/billingProducts';
import {
    normalizeImageGenerationModel,
    type ImageGenerationModel
} from '../constants/generationModels';
import {
    createBiometricIdentityLock,
    type BiometricIdentityLock
} from '../../prompts/identityContracts';
import {
    hasSeenWelcomeForInstall,
    markWelcomeSeenForInstall
} from '../utils/welcomeState';
import {
    clearVolatileWorkspaceDataStores,
    clearVolatileWorkspaceStorage
} from '../utils/resetVolatileWorkspaceState';
import { FRESH_STAGING_SESSION as FRESH_STAGING_SESSION_DEFAULTS } from '../state/freshStagingSession';
import type { HeadwearSubtype, WearableClass } from '../services/WearableAnchorEngine';

export const APP_SCHEMA_VERSION = 5; // bump when persisted state shape changes
const POST_LAUNCH_HYDRATION_DELAY_MS = 8500;
const WELCOME_INSTALL_CONTEXT_TIMEOUT_MS = 1500;
clearVolatileWorkspaceStorage();
// --- SHARED TYPES ---

export type ViewMode =
    | 'forge'
    | 'casting'
    | 'wardrobe'
    | 'props'
    | 'staging'
    | 'veo'
    | 'settings'
    | 'blocking'
    | 'nano_cast'
    | 'portrait';

export interface WardrobeItem {
    id: string;
    url: string;
    localPath?: string;
    sourceUrl?: string;
    filename?: string;
    name: string;
    prompt: string;
    category?: string;
    timestamp: number;
}

export interface PropItem {
    id: string;
    url: string;
    localPath?: string;
    sourceUrl?: string;
    filename?: string;
    name: string;
    prompt: string;
    category?: string;
    timestamp: number;
    classHint?: WearableClass;
    subtypeHint?: HeadwearSubtype;
    metadataVersion?: number;
    originalPrompt?: string;
    sourceKind?: 'generated' | 'uploaded' | 'saved' | 'unknown';
}
export interface WhitelistProfile {
    identity: string;
    wardrobe: string;
    accessories: string;
    style: string;
    generationStatus?: 'preview';
    featureSource?: 'character_pitch_sheet' | string;
}

import type { ProductionActorProfile } from '../types/ProductionActorProfile';

export interface CastMember {
    id: string;
    url: string;
    previewUrl?: string; // hydrating preview
    sourceUrl?: string;
    localPath?: string;
    tag: 'front' | 'side' | 'back' | '3/4' | 'detail';
    name: string;
    filename?: string;
    profile?: WhitelistProfile;
    identityLock?: BiometricIdentityLock;
    productionProfile?: ProductionActorProfile;
    source?: string;
    isProductionActor?: boolean;
    productionActorProfile?: any;
    assetType?: string;
    category?: string;
    studio?: string;
    categoryKey?: string;
}

export interface HostedSession {
    user?: {
        id?: string;
        email?: string | null;
    } | null;
}
import type { SpatialAuthorityStatus, PlacementAuthority } from '../services/SpatialIntelligence';
export type { SpatialAuthorityStatus, PlacementAuthority };

export interface FloorPlane {
    depth: number;
    confidence: 'high' | 'fallback';
    computedAt: number;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PlacementResolutionResult {
    status: 'accepted' | 'adjusted' | 'rejected';
    finalPosition: { x: number; y: number };
    finalDepth?: number;
    reason?: string;
    adjustmentVector?: { dx: number; dy: number };
}

export interface OccupiedVolume {
    id: string;
    footprint: Rect;
    minDepth: number; // 0-255 derived from depth map
    maxDepth: number;
    heightEstimate: number;
    confidence: 'high' | 'approximate';
}

export interface GroundingAudit {
    overriddenAt: number;
    confidenceAtTime: 'high' | 'fallback';
}

export interface ActorSpatialDescriptor {
    depthScore: number;
    depthLayer: 'foreground' | 'midground' | 'background';
    zIndex: number;
}

export type OcclusionMode = 'auto' | 'front';

export interface OcclusionStroke {
    mode?: 'reveal' | 'erase';
    points: Array<{ u: number; v: number }>;
    radiusNorm: number;
}

export interface StageToken {
    id: string;
    castId: string;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    pitch: number;
    yaw: number;
    anchorX: number;
    anchorY: number;
    tag: string;
    actionNote?: string;
    intelligence?: string;
    profile?: WhitelistProfile;
    // New fields for Layout Composite Pipeline
    elementType?: 'actor' | 'prop';
    preserveIdentity?: boolean;
    preserveWardrobe?: boolean;
    groundingMode?: 'auto' | 'floor' | 'seat' | 'lean' | 'float';
    locked?: boolean;
    notes?: string;
    cutoutUrl?: string;
    alphaMaskUrl?: string;
    sourceImageUrl?: string;
    sourceFraming?: 'head' | 'bust' | 'waist' | 'threeQuarter' | 'fullBody';
    // ---
    uniformScale: boolean;
    zIndex: number;
    visible?: boolean;
    depth?: number; // 0.0 (Near) to 1.0 (Far), optional now
    groundingEnabled?: boolean;
    groundingNonce?: number;
    manualGroundingOverride?: boolean;
    placementAuthority?: PlacementAuthority;
    hasUserCommittedIntent?: boolean;
    hasConfirmedPlacement?: boolean;
    resolvedPosition?: { x: number; y: number } | null;
    groundingAudit?: GroundingAudit;
    anchorLayer?: 'foreground' | 'midground' | 'background';
    spatialDescriptor?: ActorSpatialDescriptor;

    // Occlusion controls
    occlusionMode?: OcclusionMode;
    occlusionBias?: number;
    occlusionStrokes?: OcclusionStroke[];

    // Image Filters
    brightness?: number; // 0-200, default 100
    contrast?: number;   // 0-200, default 100
    saturation?: number; // 0-200, default 100
    blur?: number;       // 0-10, default 0
}

export interface StageAnnotation {
    id: string;
    type: 'note' | 'zone' | 'arrow';
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    text?: string;
    color?: string;
    thickness?: number;
    zIndex: number;
    visible?: boolean;

    // Semantic Intent Fields
    role?: 'note' | 'anchor' | 'lookAt' | 'protect' | 'edit';
    label?: string;
    hard?: boolean;
    anchorKind?: 'floor' | 'seat' | 'wall' | 'rail' | 'table' | 'counter' | 'doorway' | 'bed' | 'stairs' | 'vehicle' | 'object' | 'path' | 'gazeTarget';
    relation?: 'place' | 'lookAt' | 'moveToward' | 'interact';
    sourceId?: string;
    targetId?: string;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    targetTokenId?: string;
    blueprintType?: 'floorLine' | 'gazeArrow' | 'pathArrow' | 'protectRegion' | 'editRegion' | 'occlusionHint' | 'poseStick';
}

export interface DepthAssistWarning {
    id: string;
    type: 'scale' | 'grounding' | 'occlusion' | 'perspective';
    severity: 'low' | 'medium' | 'high';
    message: string;
    tokenId?: string;
}

export type RefSlotStatus = 'empty' | 'loading' | 'analyzed' | 'error' | 'ready' | 'analyzing';

export interface ReferenceSlot {
    index: number;
    url?: string;
    sourceUrl?: string;
    localPath?: string;
    name?: string;
    analysis?: string;
    target?: string;
    active: boolean;
    status: RefSlotStatus;
    castId?: string;
    productionActorProfile?: any;
    productionProfile?: any;
    isProductionActor?: boolean;
    assetType?: string;
}
export type DirectorSpatialLayout = '' | 'horizontal' | 'vertical' | 'center';
export type DirectorMarkerType =
    | ''
    | 'Colored Bounding Boxes'
    | 'Hand-Drawn Circles'
    | 'Directional Arrows'
    | 'Crude Sketches'
    | 'Numeric Markers';

export type DirectorResolution = 'Native 4K' | '2K QHD' | '1K' | { width: number; height: number };
export type DirectorQualityMode = 'Standard' | 'Raw Uncompressed' | '3D Render' | 'Stylized';
export type DirectorSafety = 'Standard' | 'Strict';

export type DirectorAspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | '3:4' | '21:9' | '3:2' | '4:5';
export type DirectorLighting = 'Studio Flash' | 'Natural Window' | 'Cinematic Dark' | 'Neon Cyberpunk' | 'Overcast' | 'Golden Hour';
export type DirectorRenderScale = '1K (Draft)' | '2K (HD)' | '4K (Pro)';
export type DirectorMergeStrategy = 'Character Identity' | 'Style Transfer' | 'Composition Reference' | 'Photo Merge';

export interface DirectorSettings {
    prompt: string;
    aspectRatio: DirectorAspectRatio;
    resolution: DirectorResolution;
    qualityMode: DirectorQualityMode;
    safety: DirectorSafety;
    subject: string;
    environment: string;
    knowledge: string;
    lighting: string;
    camera: string;
    filmStock: string;
    textRender: string;
    textStyle: string;
    envAuto: boolean;
    mergeStrategy: DirectorMergeStrategy;
    replaceAnchorSubjects: boolean;
    globalReplaceTarget: string;
    spatialLayout: DirectorSpatialLayout;
    markerType: DirectorMarkerType;
    negativePrompt: string;
    sceneLock: boolean;
}

export interface StoryboardGeneration {
    id: string;
    angle: string;
    promptSuffix: string;
    url: string | null;
    status: 'pending' | 'success' | 'error';
}

// --- REGION EDIT (Multi-mask) ---

export type RegionEditMode = 'paint' | 'erase';
export type RegionLayerId = 'A' | 'B' | 'C';

export interface RegionEditLayer {
    id: RegionLayerId; // 'A' | 'B' | 'C'
    name: string;
    enabled: boolean;
    maskDataUrl: string | null;
    prompt: string; lastOutputUrl?: string | null;
    status?: 'idle' | 'queued' | 'running' | 'success' | 'error';
    lastError?: string | null;

}

export type RegionContextSizingMode = 'manual' | 'source-auto';

export interface RegionSourceImageMeta {
    width: number;
    height: number;
    derivedRenderWidth: number;
    derivedRenderHeight: number;
    aspectRatio: number;
}

export interface RegionEditState {
    isMaskMode: boolean;
    mode: RegionEditMode;
    brushSize: number;
    brushSoftness: number;
    activeLayerId: RegionLayerId;
    layers: RegionEditLayer[];
    sourceImageMeta?: RegionSourceImageMeta;
    contextSizingMode?: RegionContextSizingMode;

    // Protection mask: white = protected (do not edit)
    protectEnabled: boolean;
    protectMaskDataUrl: string | null;
}

export const smartClone = <T,>(v: T): T => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
        return v.map(item => smartClone(item)) as unknown as T;
    }
    // OOM Guard: Prevent deep cloning native binary objects which freezes the V8 thread
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
        return v;
    }
    const source = v as Record<string, unknown>;
    const cloned: Record<string, unknown> = {};
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const val = source[key];
            // Critical OOM Guard: Pass massive base64 URIs by reference instead of deep copying into V8 heap
            if (typeof val === 'string' && val.length > 500 && (key.toLowerCase().includes('url') || val.startsWith('data:'))) {
                cloned[key] = val;
            } else {
                cloned[key] = smartClone(val);
            }
        }
    }
    return cloned as T;
};

export type SceneResultAnchor = {
  kind: 'generated_result' | 'uploaded_result';
  imageUrl: string;
  sourceImageId?: string;
  visibleActorCount?: number;
};

export interface Shot {
    id: string;
    name: string;
    createdAt: number; // epoch ms
    updatedAt: number; // epoch ms

    backgroundUrl: string | null;
    depthMapUrl?: string | null; // Associated monocular depth
    depthMapHash?: string | null; // SHA-256 hash for integrity contract
    sourceBackgroundHash?: string | null; // Binding invariant link
    floorPlane?: FloorPlane | null; // Floor authority
    occupiedVolumes: OccupiedVolume[]; // Derived 3D bounds
    tokens: StageToken[];
    annotations: StageAnnotation[];
    referenceSlots: ReferenceSlot[];
    director: DirectorSettings;

    startFrameUrl?: string | null;
    endFrameUrl?: string | null;
    notes?: string;
    veoPromptDraft?: VeoFivePartDraft & { audio?: VeoAudioBlock, concept?: string, negativePrompt?: string };
    veoTimeline?: VeoTimestampBeat[];

    // ✅ store full region edit state per shot (optional for backwards compatibility)
    regionEdit?: RegionEditState;

    // Director Canvas Result Context
    promotedResultAnchor?: SceneResultAnchor;
    latestCompositeResultUrl?: string | null;
    latestCompositeSource?: 'directorCanvas' | 'legacy';
    latestCompositeStage?: 'generate' | 'refine';
    latestCompositeTemplateId?: string;
    latestCompositeTemplateNotes?: string;
    latestCompositeTimestamp?: string;
    
    // Director Canvas Result History (Max 4 for performance)
    compositeHistory?: Array<{
        id: string;
        url: string;
        stage: 'generate' | 'refine';
        timestamp: string;
        label: string; // E.g., G1, R1, R2
        templateId?: string;
        templateNotes?: string;
        isActive?: boolean;
    }>;
    _internalGenerateCount?: number;
    _internalRefineCount?: number;
}

export interface LogEntry {
    id: string;
    timestamp: Date;
    message: string;
    type: 'info' | 'success' | 'error';
}

export type BackgroundJobSurface = 'casting' | 'wardrobe_designer' | 'prop_designer' | 'prop_applied' | 'scene_render';

export type LiveStatusMessage = {
  id: string;
  text: string;
  type: 'info' | 'success' | 'error';
  createdAt: number;
};

export type PitchSheetHandoffAngle = 'center' | 'left' | 'right' | 'up' | 'down';

export type NanoCastSessionDirectorControls = {
    identityStrength: number;
    stylization: number;
    age: number;
    outfit: string;
    hairStyle: string;
    lighting: string;
    shotFraming: 'bust' | 'half_body' | 'full_body';
    logoImage: string | null;
    logoPlacement: string;
};

export type NanoCastSessionState = {
    characterId: string;
    biometricImages: Record<PitchSheetHandoffAngle, string | null>;
    generatedCharacterUrl: string | null;
    generatedCharacterApprovedForPitchSheet: boolean;
    approvedPitchSheetSourceUrl: string | null;
    identityLock: BiometricIdentityLock | null;
    selectedStyle: string | null;
    selectedBody: string | null;
    bodyScope: 'head' | 'torso' | 'full' | null;
    identitySource: 'hybrid' | 'biometric' | 'generated';
    heightIn: number;
    weightLbs: number;
    directorControls: NanoCastSessionDirectorControls;
    updatedAt: number | null;
    approvedNanoCastStyle?: string | null;
    approvedPitchSheetRenderStyle?: string | null;
};

export type PendingPitchSheetHandoff = {
    source: 'nanocast_biometric_scan' | 'production_actor_workflow';
    createdAt: number;
    characterId: string;
    identityLock: BiometricIdentityLock;
    identityImages: Array<{
        angle: PitchSheetHandoffAngle;
        imageUrl: string;
    }>;
    identityStrength: number;
    heightIn?: number;
    weightLbs?: number;
    age?: number;
    hairStyle?: string;
    outfit?: string;
    selectedStyle?: string | null;
    finalCharacterUrl?: string | null;
    mode: 'scan_only' | 'scan_plus_character';
    characterStyleReferenceUrl?: string | null;
    generatedSourceImageIndex?: number | null;
    generatedSourceRole?: string | null;
    approvedNanoCastStyle?: string | null;
    approvedPitchSheetRenderStyle?: string | null;
    productionActorProfile?: import('../types/ProductionActorProfile').ProductionActorProfile;
};

export type PendingRefSheetHandoff = {
    source: 'portrait_studio';
    createdAt: number;
    imageUrl: string;
    compiledPrompt: string;
    weightLbs: number;
    heightIn: number;
    age: number;
    hairStyle?: string;
    identityImages?: Array<{
        angle?: PitchSheetHandoffAngle | string;
        imageUrl: string;
        label?: string;
    }>;
    generatedSheetRole?: 'layout_reference_only' | 'identity_fallback';
};

export interface BackgroundJob {
    id: string;
    status: 'polling_foreground' | 'pending_background' | 'completed' | 'failed';
    context: BackgroundJobSurface;
    startedAt: number;
    timing?: {
        submittedAt: number;
        edgeAcceptedAt?: number;
        clientTimeoutAt?: number;
        observedCompletedAt?: number;
    };
    assetUrl?: string;
    errorMessage?: string | null;
}

export type ActorLibraryStatus = 'idle' | 'hydrating' | 'ready' | 'error';

export interface AppState {
    apiKey: string;
    model: ImageGenerationModel;
    view: ViewMode;
    cast: CastMember[];
    tokens: StageToken[];
    annotations: StageAnnotation[];
    referenceSlots: ReferenceSlot[];
    director: DirectorSettings;
    selection: string | null;
    selectionType: 'token' | 'annotation' | null;
    backgroundUrl: string | null;
    depthMapUrl: string | null;
    depthMapHash: string | null;
    sourceBackgroundHash: string | null;
    floorPlane: FloorPlane | null;
    occupiedVolumes: OccupiedVolume[];
    resultImage: string | null;
    logs: LogEntry[];
    isProcessing: boolean;
    saveDirectoryHandle: FileSystemDirectoryHandle | null;
    saveDirectoryPath: string | null;
    wardrobeItems: WardrobeItem[];
    storyboardSource: { url: string; dna?: string } | null;
    storyboardEndSource: { url: string; dna?: string } | null;
    storyboardGenerations: StoryboardGeneration[];
    lastCastedImage: string | null;
    lastCastedPrompt: string;
    lastCastedMask: string | null;
    inspectImage: string | null;
    inspectImageLocalPath?: string;
    inspectImageSourceUrl?: string;
    inspectMask: string | null;
    actorLibrary: CastMember[];
    propItems: PropItem[];
    customCovers: Record<string, string>; // Studio ID -> Data URI/Blob URL
    isDepthProcessing: boolean;
    isActorLibraryLoading: boolean;
    actorLibraryStatus: ActorLibraryStatus;

    regionEdit: RegionEditState;

    historyPast: HistorySnapshot[];
    historyFuture: HistorySnapshot[];


    shots: Shot[];
    activeShotId: string | null;
    shotSessionsBySceneId: Record<string, ShotSession>;
    isStoryboardEnabled: boolean;
    showHelpHints: boolean;

    // --- HELP CENTER STATE ---
    isHelpOpen: boolean;
    helpContextSection: string;
    hasSeenWelcome: boolean;
    welcomeInstallId: string | null;
    isWelcomeStateReady: boolean;
    // -------------------------

    imageResolution: '1K' | '2K' | '4K';
    enableImageThinking: boolean;
    enableGoogleGrounding: boolean;
    biometricSoundEnabled: boolean;
    biometricSoundVolume: number;

    // Director Canvas Refinement Tracking
    latestCompositeSource?: 'directorCanvas' | 'legacy';
    latestCompositeResultUrl?: string | null;

    // Director Blocking Templates
    activeTemplateId?: string;
    templateNotes?: string;

    // Persist panel open/closed states in memory only (reset on reload)
    stagePanelState: Record<string, boolean>;

    // WARDROBE PERSISTENCE
    wardrobeState: WardrobeState;

    // PROP STUDIO PERSISTENCE
    propStudioState: PropAccessoryState;

    globalProgress?: { percent: number; text: string };
    sessionName: string | null;
    sessionFilePath: string | null;

    // GLOBAL VEO DRAFT (Fallback when no shot is selected)
    veoPromptDraft?: VeoFivePartDraft & { audio?: VeoAudioBlock, concept?: string, negativePrompt?: string };

    // BILLING & AUTH
    billingMode: 'hosted' | 'byok';
    billingEntitlements: Entitlements;
    hostedSession: HostedSession | null;
    hostedCredits: number | null;
    showCreditModal: boolean;
    productionActorWorkflowSource: { imageUrl: string; suggestedName?: string } | null;
    creditModal: InsufficientCreditModalState | null;

    backgroundJobs: BackgroundJob[];
    liveStatus: LiveStatusMessage | null;
    pendingPitchSheetHandoff: PendingPitchSheetHandoff | null;
    pendingRefSheetHandoff: PendingRefSheetHandoff | null;
    nanoCastSession: NanoCastSessionState;
    volatileWorkspaceResetNonce: number;
}

export interface WardrobeState {
    fittedImage: string | null;
    tryOnMask: string | null;
    restorationLayer: string | null;
    removeBg: boolean;
    fringeSize: number;
    brushSize: number;
    history: string[];
    historyIndex: number;
    isBrushActive: boolean;
    tryOnNote: string;
    processedTryOnUrl: string | null;
    selectedCharacter: CastMember | null;
    selectedCostume: WardrobeItem | null;
    brandingLogo: string | null;
    logoPosition: string;
    tryOnGarmentFit: 'slim' | 'tailored' | 'standard' | 'relaxed' | 'oversized';
    tryOnFabricBehavior: 'structured_crisp' | 'balanced' | 'soft_draped';
    tryOnOutputFraming: 'bust' | 'half_body' | 'full_body';
    // New persistent fields for Virtual Try-On
    tryOnOutputMode: 'front' | 'turnaround';
    tryOnViews: Record<'front' | 'back' | 'left' | 'right', string> | null;
    tryOnSheetFB: string | null;
    tryOnSheetLR: string | null;
    activeTryOnView: 'front' | 'back' | 'left' | 'right' | 'sheetFB' | 'sheetLR';
    designerImage?: string | null;
}

export interface PropAccessoryState {
    activeTab: 'designer' | 'library';
    designerPrompt: string;
    designerImage: string | null;
    selectedProp: PropItem | null;
    selectedCharacter: CastMember | null;
    appliedImage: string | null;
    applyNote: string;
}

const DEFAULT_WARDROBE_STATE: WardrobeState = {
    fittedImage: null,
    tryOnMask: null,
    restorationLayer: null,
    removeBg: false,
    fringeSize: 0,
    brushSize: 20,
    history: [],
    historyIndex: -1,
    isBrushActive: false,
    tryOnNote: "",
    processedTryOnUrl: null,
    selectedCharacter: null,
    selectedCostume: null,
    brandingLogo: null,
    logoPosition: "Center Chest",
    tryOnGarmentFit: 'standard',
    tryOnFabricBehavior: 'balanced',
    tryOnOutputFraming: 'full_body',
    tryOnOutputMode: 'front',
    tryOnViews: null,
    tryOnSheetFB: null,
    tryOnSheetLR: null,
    activeTryOnView: 'front',
    designerImage: null
};

const DEFAULT_PROP_STUDIO_STATE: PropAccessoryState = {
    activeTab: 'designer',
    designerPrompt: '',
    designerImage: null,
    selectedProp: null,
    selectedCharacter: null,
    appliedImage: null,
    applyNote: 'Automatically fit and anchor the prop proportionately to the correct body part.'
};

export type Action =
    | { type: 'SET_VIEW'; payload: ViewMode }
    | { type: 'SET_PENDING_PITCH_SHEET_HANDOFF'; payload: PendingPitchSheetHandoff }
    | { type: 'CLEAR_PENDING_PITCH_SHEET_HANDOFF' }
    | { type: 'SET_PENDING_REF_SHEET_HANDOFF'; payload: PendingRefSheetHandoff }
    | { type: 'CLEAR_PENDING_REF_SHEET_HANDOFF' }
    | { type: 'SET_API_KEY'; payload: string }
    | { type: 'SET_MODEL'; payload: AppState['model'] }
    | { type: 'ADD_CAST'; payload: CastMember }
    | { type: 'REMOVE_CAST'; payload: string }
    | { type: 'REMOVE_FROM_AVAILABLE_CAST'; payload: { actorId: string } }
    | { type: 'CLEAR_CAST' }
    | { type: 'UPDATE_CAST'; payload: Partial<CastMember> & { id: string } }
    | { type: 'ADD_TOKEN'; payload: StageToken }
    | { type: 'UPDATE_TOKEN'; payload: Partial<StageToken> & { id: string } }
    | { type: 'REMOVE_TOKEN'; payload: string }
    | { type: 'ADD_ANNOTATION'; payload: StageAnnotation }
    | { type: 'UPDATE_ANNOTATION'; payload: Partial<StageAnnotation> & { id: string } }
    | { type: 'REMOVE_ANNOTATION'; payload: string }
    | { type: 'UPDATE_REF_SLOT'; payload: { index: number; updates: Partial<ReferenceSlot> } }
    | { type: 'CLEAR_REF_SLOTS' }
    | { type: 'SET_DIRECTOR'; payload: Partial<DirectorSettings> }
    | { type: 'SELECT_ITEM'; payload: { id: string | null; type: 'token' | 'annotation' | null } }
    | { type: 'CLEAR_STAGE' }
    | { type: 'SET_BG'; payload: string | null }
    | { type: 'SET_DEPTH_MAP'; payload: { url: string | null; hash?: string | null; sourceHash?: string | null } | string | null }
    | { type: 'SET_FLOOR_PLANE'; payload: FloorPlane | null }
    | { type: 'SET_OCCUPIED_VOLUMES'; payload: OccupiedVolume[] }
    | { type: 'SET_RESULT_IMAGE'; payload: string | null }
    | { type: 'SET_COMPOSITE_METADATA'; payload: { latestCompositeSource?: 'directorCanvas' | 'legacy'; latestCompositeResultUrl?: string } }
    | { type: 'ADD_LOG'; payload: Omit<LogEntry, 'id' | 'timestamp'> }
    | { type: 'SET_PROCESSING'; payload: boolean }
    | { type: 'SET_GLOBAL_PROGRESS'; payload: { percent: number; text: string } | null }
    | { type: 'SET_SAVE_DIRECTORY'; payload: FileSystemDirectoryHandle | null }
    | { type: 'SET_SAVE_PATH'; payload: string | null }
    | { type: 'ADD_WARDROBE_ITEM'; payload: WardrobeItem }
    | { type: 'REMOVE_WARDROBE_ITEM'; payload: string }
    | { type: 'SET_WARDROBE_ITEMS'; payload: WardrobeItem[] }
    | { type: 'SET_STORYBOARD_SOURCE'; payload: { url: string; dna?: string } | null }
    | { type: 'SET_STORYBOARD_END_SOURCE'; payload: { url: string; dna?: string } | null }
    | { type: 'SET_STORYBOARD_GENERATIONS'; payload: StoryboardGeneration[] }
    | { type: 'UPDATE_STORYBOARD_GENERATION'; payload: { id: string; url?: string; status: 'success' | 'error' } }
    | { type: 'SET_LAST_CASTED_IMAGE'; payload: string | null }
    | { type: 'SET_LAST_CASTED_PROMPT'; payload: string }
    | { type: 'SET_LAST_CASTED_MASK'; payload: string | null }
    | { type: 'SET_INSPECT_IMAGE'; payload: string | null }
    | { type: 'SET_INSPECT_MASK'; payload: string | null }
    | { type: 'UPDATE_TOKEN_INTELLIGENCE'; payload: { id: string; intelligence: string } }
    | { type: 'ADD_ACTOR_LIBRARY'; payload: CastMember }
    | { type: 'REMOVE_ACTOR_LIBRARY'; payload: string }
    | { type: 'REMOVE_ACTOR_LIBRARY_BY_URL'; payload: string }
    | { type: 'UPDATE_ACTOR_LIBRARY'; payload: { id: string; updates: Partial<CastMember> } }
    | { type: 'SET_ACTOR_LIBRARY'; payload: CastMember[] }
    | { type: 'SET_ACTOR_LIBRARY_LOADING'; payload: boolean }
    | { type: 'SET_ACTOR_LIBRARY_STATUS'; payload: ActorLibraryStatus }
    | { type: 'ADD_PROP_ITEM'; payload: PropItem }
    | { type: 'REMOVE_PROP_ITEM'; payload: string }
    | { type: 'SET_PROP_ITEMS'; payload: PropItem[] }
    // Region Edit
    | { type: 'SET_REGION_EDIT'; payload: Partial<RegionEditState> }
    | { type: 'SET_REGION_ACTIVE_LAYER'; payload: { id: RegionLayerId } }
    | { type: 'UPDATE_REGION_LAYER'; payload: { id: RegionLayerId; updates: Partial<RegionEditLayer> } }
    | { type: 'CLEAR_REGION_LAYER_MASK'; payload: string }
    | { type: 'CLEAR_ALL_REGION_MASKS' }
    | { type: 'DISCARD_SESSION' }
    | { type: 'SET_REGION_PROTECT'; payload: { enabled: boolean } }
    | { type: 'SET_REGION_PROTECT_MASK'; payload: { maskDataUrl: string | null } }
    // Shots
    | { type: 'SET_SESSION_INFO'; payload: { name: string | null; path: string | null } }
    | { type: 'LOAD_SESSION_STATE'; payload: Partial<AppState> }
    | { type: 'SET_SHOTS'; payload: Shot[] }
    | { type: 'ADD_SHOT_FROM_STAGE'; payload: { name?: string } }
    | { type: 'CREATE_OR_REPLACE_SHOT_SESSION'; payload: { sceneId: string; session: ShotSession } }
    | { type: 'UPDATE_SHOT_SESSION'; payload: { sceneId: string; updater: (prev?: ShotSession) => ShotSession | undefined } }
    | { type: 'SET_SHOT_VARIANT_SELECTED'; payload: { sceneId: string; variantId: string; selected: boolean } }
    | { type: 'CLEAR_SHOT_SESSION'; payload: { sceneId: string } }
    | { type: 'DUPLICATE_SHOT'; payload: { id: string } }
    | { type: 'REMOVE_SHOT'; payload: { id: string } }
    | { type: 'CLEAR_SHOTS' }
    | { type: 'SET_ACTIVE_SHOT'; payload: { id: string | null } }
    | { type: 'SAVE_ACTIVE_SHOT'; payload?: { touchUpdatedAt?: boolean } }
    | { type: 'UPDATE_SHOT_META'; payload: { id: string; updates: Partial<Pick<Shot, 'name' | 'notes' | 'veoPromptDraft' | 'veoTimeline' | 'latestCompositeResultUrl' | 'latestCompositeSource' | 'latestCompositeStage' | 'latestCompositeTemplateId' | 'latestCompositeTemplateNotes' | 'latestCompositeTimestamp' | 'compositeHistory' | '_internalGenerateCount' | '_internalRefineCount'>> } }
    | { type: 'SET_SHOT_FRAME'; payload: { id: string; which: 'start' | 'end'; url: string | null } }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'SET_STORYBOARD_ENABLED'; payload: boolean }
    | { type: 'SET_SHOW_HELP_HINTS'; payload: boolean }
    | { type: 'TOGGLE_HELP'; payload: boolean }
    | { type: 'SET_HELP_SECTION'; payload: string }
    | { type: 'SET_WELCOME_INSTALL_CONTEXT'; payload: { installId: string | null } }
    | { type: 'SET_SEEN_WELCOME'; payload: boolean }
    | { type: 'SET_CUSTOM_COVERS'; payload: Record<string, string> }
    | { type: 'SET_STAGE_PANEL_STATE'; payload: { id: string; isOpen: boolean } }
    | { type: 'SET_WARDROBE_STATE'; payload: Partial<WardrobeState> }
    | { type: 'SET_PROP_STUDIO_STATE'; payload: Partial<PropAccessoryState> }
    | { type: 'SET_DEPTH_PROCESSING'; payload: boolean }
    | { type: 'SET_IMAGE_RESOLUTION'; payload: '1K' | '2K' | '4K' }
    | { type: 'SET_ENABLE_IMAGE_THINKING'; payload: boolean }
    | { type: 'SET_ENABLE_GOOGLE_GROUNDING'; payload: boolean }
    | { type: 'SET_BIOMETRIC_SOUND_ENABLED'; payload: boolean }
    | { type: 'SET_BIOMETRIC_SOUND_VOLUME'; payload: number }
    | { type: 'SET_TOKENS'; payload: StageToken[] }
    | { type: 'SET_ANNOTATIONS'; payload: StageAnnotation[] }
    | { type: 'SYNC_SPATIAL_DESCRIPTORS' }
    | { type: 'DUPLICATE_TOKEN'; payload: { id: string } }
    | { type: 'SET_GLOBAL_VEO_DRAFT'; payload: VeoFivePartDraft & { audio?: VeoAudioBlock, concept?: string, negativePrompt?: string } | undefined }
    | { type: 'SET_SCENE_RESULT_ANCHOR'; payload: { sceneId: string; anchor?: SceneResultAnchor } }
    | { type: 'SET_TEMPLATE_NOTES'; payload: { activeTemplateId?: string; templateNotes?: string } }
    | { type: 'SET_BILLING_MODE'; payload: 'hosted' | 'byok' }
    | { type: 'SET_BILLING_ENTITLEMENTS'; payload: Entitlements }
    | { type: 'SET_HOSTED_SESSION'; payload: HostedSession | null }
    | { type: 'SET_HOSTED_CREDITS'; payload: number | null }
    | { type: 'SET_CREDIT_MODAL'; payload: boolean | Omit<InsufficientCreditModalState, 'openedAt'> | InsufficientCreditModalState }
    | { type: 'SET_NANO_CAST_BIOMETRIC_IMAGE'; payload: { angle: PitchSheetHandoffAngle; imageUrl: string | null } }
    | { type: 'SET_NANO_CAST_GENERATED_RESULT'; payload: string | null }
    | { type: 'SET_NANO_CAST_SESSION_METADATA'; payload: Partial<Omit<NanoCastSessionState, 'biometricImages' | 'generatedCharacterUrl' | 'identityLock' | 'updatedAt'>> }
    | { type: 'CLEAR_NANO_CAST_SESSION' }
    | { type: 'RESET_VOLATILE_WORKSPACE_STATE' }
    | { type: 'ADD_BACKGROUND_JOB'; payload: BackgroundJob }
    | { type: 'UPDATE_BACKGROUND_JOB'; payload: { id: string; updates: Partial<BackgroundJob> } }
    | { type: 'REMOVE_BACKGROUND_JOB'; payload: string }
    | { type: 'COMPLETE_BACKGROUND_JOB'; payload: { id: string; assetUrl: string } }
    | { type: 'FAIL_BACKGROUND_JOB'; payload: { id: string; errorMessage?: string } }
    | { type: 'SET_LIVE_STATUS'; payload: LiveStatusMessage | null }
    | { type: 'SET_PRODUCTION_ACTOR_WORKFLOW_SOURCE'; payload: { imageUrl: string; suggestedName?: string } | null };

// --- HELPERS ---

const loadJson = <T,>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;

        const parsed = JSON.parse(raw);

        // ✅ preserve explicit nulls
        if (parsed === null) return fallback;

        // Arrays: require array shape
        if (Array.isArray(fallback)) {
            return Array.isArray(parsed) ? (parsed as T) : fallback;
        }

        // Objects: merge only when both are plain-ish objects
        if (typeof fallback === 'object' && fallback !== null && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return { ...(fallback as Record<string, unknown>), ...(parsed as Record<string, unknown>) } as T;
        }

        // Primitives / fallback=null cases: return parsed as-is
        return parsed as T;
    } catch {
        return fallback;
    }
};

const getInitialWelcomeStatus = (): Pick<AppState, 'hasSeenWelcome' | 'welcomeInstallId' | 'isWelcomeStateReady'> => {
    const canResolveNativeInstall = Boolean(window.electronAPI?.getAppInstallInfo);

    return {
        // Native installs resolve this asynchronously so old app data cannot hide a fresh reinstall.
        hasSeenWelcome: canResolveNativeInstall ? true : hasSeenWelcomeForInstall(localStorage, null),
        welcomeInstallId: null,
        isWelcomeStateReady: !canResolveNativeInstall
    };
};

const clampBiometricSoundVolume = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 70;
    return Math.min(100, Math.max(0, Math.round(numeric)));
};

const createNanoCastCharacterId = (): string => {
    const randomId = globalThis.crypto?.randomUUID?.();
    return `nanocast_${randomId || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
};

const buildNanoCastSessionIdentityLock = (session: NanoCastSessionState): BiometricIdentityLock | null => {
    const referenceViews = (Object.keys(session.biometricImages) as PitchSheetHandoffAngle[])
        .filter(angle => Boolean(session.biometricImages[angle]));

    if (referenceViews.length === 0) return null;

    return createBiometricIdentityLock({
        characterId: session.characterId,
        referenceViews,
        identityRangeText: referenceViews.length === 1
            ? "[IMAGE 1]"
            : `[IMAGE 1] to [IMAGE ${referenceViews.length}]`,
        identityStrength: session.directorControls.identityStrength,
        appliesTo: "NanoCast generation, regeneration, refinement, preview, validation, pitch-sheet handoff, reference-sheet generation, wardrobe/prop/staging handoffs, and export requests for this character",
        faceDominant: true
    });
};

const createDefaultNanoCastSession = (): NanoCastSessionState => ({
    characterId: createNanoCastCharacterId(),
    biometricImages: {
        center: null,
        left: null,
        right: null,
        up: null,
        down: null
    },
    generatedCharacterUrl: null,
    generatedCharacterApprovedForPitchSheet: false,
    approvedPitchSheetSourceUrl: null,
    identityLock: null,
    selectedStyle: null,
    selectedBody: null,
    bodyScope: null,
    identitySource: 'biometric',
    heightIn: 70,
    weightLbs: 170,
    directorControls: {
        identityStrength: 85,
        stylization: 50,
        age: 25,
        outfit: "Black polo t-shirt",
        hairStyle: "",
        lighting: "studio_default",
        shotFraming: "full_body",
        logoImage: null,
        logoPlacement: "Center Chest"
    },
    updatedAt: null
});

// --- UNDO / REDO HISTORY (paid-launch safety) ---
export type HistorySnapshot = {
    backgroundUrl: string | null;
    depthMapUrl: string | null;
    depthMapHash: string | null;
    sourceBackgroundHash: string | null;
    floorPlane: FloorPlane | null; // Floor authority
    occupiedVolumes: OccupiedVolume[]; // Derived 3D bounds
    tokens: StageToken[];
    annotations: StageAnnotation[];
    referenceSlots: ReferenceSlot[];
    director: DirectorSettings;
    regionEdit: RegionEditState;
    shots: Shot[];
    activeShotId: string | null;
    resultImage: string | null;
    latestCompositeSource?: 'directorCanvas' | 'legacy';
    latestCompositeResultUrl?: string | null;
};

export const deduplicateTokens = (tokens: StageToken[]): StageToken[] => {
    const seenIds = new Set<string>();
    const seenPos = new Set<string>();
    const unique: StageToken[] = [];

    tokens.forEach(t => {
        if (!t) return;
        
        // 1. Strict ID uniqueness
        if (t.id && seenIds.has(t.id)) return;

        // 2. Content-based de-duplication (heuristic for bug-induced duplicates)
        // If exact same cast member at exact same position/scale/z-index
        const xStr = typeof t.x === 'number' ? t.x.toFixed(2) : '0.00';
        const yStr = typeof t.y === 'number' ? t.y.toFixed(2) : '0.00';
        const posKey = `${t.castId || 'unknown'}-${xStr}-${yStr}-${t.zIndex || 0}`;
        
        if (seenPos.has(posKey)) return;

        unique.push(t);
        if (t.id) seenIds.add(t.id);
        seenPos.add(posKey);
    });
    return unique;
};

const MAX_HISTORY = 30;

const snapshotOf = (s: AppState): HistorySnapshot => ({
    backgroundUrl: s.backgroundUrl,
    depthMapUrl: s.depthMapUrl,
    tokens: smartClone(s.tokens),
    annotations: smartClone(s.annotations),
    referenceSlots: smartClone(s.referenceSlots),
    director: smartClone(s.director),
    regionEdit: smartClone(s.regionEdit),
    shots: smartClone(s.shots),
    activeShotId: s.activeShotId,
    resultImage: s.resultImage,
    depthMapHash: s.depthMapHash,
    sourceBackgroundHash: s.sourceBackgroundHash,
    floorPlane: s.floorPlane,
    occupiedVolumes: smartClone(s.occupiedVolumes),
    latestCompositeSource: s.latestCompositeSource,
    latestCompositeResultUrl: s.latestCompositeResultUrl,
});

const applySnapshot = (s: AppState, snap: HistorySnapshot): AppState => ({
    ...s,
    ...snap,
    selection: null,
    selectionType: null,
});

const shouldRecordHistory = (action: Action) => {
    const type = action.type;

    // Region Edit can touch large mask data URLs many times during one operation.
    // Treat mask/status/prompt layer mutations as tool state, not stage history.
    if (
        type === 'SET_REGION_EDIT' ||
        type === 'SET_REGION_ACTIVE_LAYER' ||
        type === 'UPDATE_REGION_LAYER' ||
        type === 'CLEAR_REGION_LAYER_MASK' ||
        type === 'CLEAR_ALL_REGION_MASKS' ||
        type === 'SET_REGION_PROTECT' ||
        type === 'SET_REGION_PROTECT_MASK'
    ) {
        return false;
    }

    if (type === 'SET_COMPOSITE_METADATA' || type === 'SET_SCENE_RESULT_ANCHOR') {
        return false;
    }

    if (type === 'UPDATE_SHOT_META') {
        const keys = Object.keys(action.payload.updates);
        return keys.some(key => key === 'name' || key === 'notes' || key === 'veoPromptDraft' || key === 'veoTimeline');
    }

    const set = new Set<Action['type']>([
        'SET_BG',
        'ADD_TOKEN', 'UPDATE_TOKEN', 'REMOVE_TOKEN',
        'ADD_ANNOTATION', 'UPDATE_ANNOTATION', 'REMOVE_ANNOTATION',
        'UPDATE_REF_SLOT', 'CLEAR_REF_SLOTS',
        'SET_DIRECTOR',
        'CLEAR_STAGE',
        'SET_SHOTS', 'ADD_SHOT_FROM_STAGE', 'DUPLICATE_SHOT', 'REMOVE_SHOT', 'SET_ACTIVE_SHOT', 'SAVE_ACTIVE_SHOT', 'UPDATE_SHOT_META', 'SET_SHOT_FRAME',
        'SET_STORYBOARD_SOURCE', 'SET_STORYBOARD_END_SOURCE', 'SET_STORYBOARD_GENERATIONS', 'UPDATE_STORYBOARD_GENERATION',
        'SET_RESULT_IMAGE'
    ]);
    return set.has(type);
};


const defaultDirector: DirectorSettings = {
    prompt: '',
    aspectRatio: '16:9',
    resolution: 'Native 4K',
    qualityMode: 'Standard',
    safety: 'Standard',
    subject: '',
    environment: '',
    knowledge: '',
    lighting: '',
    camera: '',
    filmStock: '',
    textRender: '',
    textStyle: '',
    envAuto: false,
    mergeStrategy: 'Character Identity',
    sceneLock: false,
    replaceAnchorSubjects: false,
    globalReplaceTarget: '',
    spatialLayout: '',
    markerType: 'Colored Bounding Boxes',
    negativePrompt:
        'text, watermark, extra limbs, duplicate subjects, distorted anatomy, unrealistic lighting',
};

const resetDirectorSessionFields = (director: DirectorSettings): DirectorSettings => ({
    ...director,
    replaceAnchorSubjects: false,
    globalReplaceTarget: '',
});

const loadStoredDirector = (): DirectorSettings =>
    resetDirectorSessionFields({ ...defaultDirector });

const defaultRefSlots: ReferenceSlot[] = Array.from({ length: 10 }, (_, i) => ({
    index: i + 1,
    url: undefined,
    name: undefined,
    analysis: undefined,
    target: undefined,
    active: false,
    status: 'empty' as const,
    castId: undefined,
}));

const getInitialModel = (): AppState['model'] => {
    const saved = localStorage.getItem('nano_model');
    const normalized = normalizeImageGenerationModel(saved);
    if (saved !== normalized) {
        localStorage.setItem('nano_model', normalized);
    }
    return normalized;
};

const DEFAULT_REGION_EDIT: RegionEditState = {
    isMaskMode: false,
    mode: 'paint',
    brushSize: 40,
    brushSoftness: 0.35,
    activeLayerId: 'A',
    contextSizingMode: 'manual',
    sourceImageMeta: undefined,
    protectEnabled: false,
    protectMaskDataUrl: null,
    layers: [
        { id: 'A', name: 'Mask A', enabled: true, maskDataUrl: null, prompt: '', lastOutputUrl: null, status: 'idle', lastError: null },
        { id: 'B', name: 'Mask B', enabled: false, maskDataUrl: null, prompt: '', lastOutputUrl: null, status: 'idle', lastError: null },
        { id: 'C', name: 'Mask C', enabled: false, maskDataUrl: null, prompt: '', lastOutputUrl: null, status: 'idle', lastError: null },
    ],
};

export const FRESH_STAGING_CONTEXT_STATE = {
    tokens: [] as StageToken[],
    annotations: [] as StageAnnotation[],
    referenceSlots: smartClone(defaultRefSlots),
    selection: null as string | null,
    selectionType: null as AppState['selectionType'],
    backgroundUrl: null as string | null,
    depthMapUrl: FRESH_STAGING_SESSION_DEFAULTS.depthMapUrl as string | null,
    depthMapHash: null as string | null,
    sourceBackgroundHash: null as string | null,
    floorPlane: FRESH_STAGING_SESSION_DEFAULTS.floorPlane as FloorPlane | null,
    occupiedVolumes: [...FRESH_STAGING_SESSION_DEFAULTS.occupiedVolumes] as OccupiedVolume[],
    resultImage: FRESH_STAGING_SESSION_DEFAULTS.resultImage as string | null,
    storyboardSource: null as AppState['storyboardSource'],
    storyboardEndSource: null as AppState['storyboardEndSource'],
    storyboardGenerations: [] as StoryboardGeneration[],
    lastCastedImage: null as string | null,
    lastCastedPrompt: '',
    lastCastedMask: null as string | null,
    inspectImage: null as string | null,
    inspectMask: null as string | null,
    inspectImageLocalPath: undefined as string | undefined,
    inspectImageSourceUrl: undefined as string | undefined,
    isDepthProcessing: FRESH_STAGING_SESSION_DEFAULTS.isDepthProcessing,
    regionEdit: smartClone(DEFAULT_REGION_EDIT),
    historyPast: [] as HistorySnapshot[],
    historyFuture: [] as HistorySnapshot[],
    shots: [] as Shot[],
    activeShotId: null as string | null,
    shotSessionsBySceneId: {} as Record<string, ShotSession>,
    veoPromptDraft: undefined as AppState['veoPromptDraft'],
    globalProgress: undefined as AppState['globalProgress'],
    liveStatus: null as LiveStatusMessage | null,
    backgroundJobs: [] as BackgroundJob[],
    sessionName: null as string | null,
    sessionFilePath: null as string | null,
    latestCompositeSource: undefined as AppState['latestCompositeSource'],
    latestCompositeResultUrl: null as AppState['latestCompositeResultUrl'],
    activeTemplateId: undefined as string | undefined,
    templateNotes: undefined as string | undefined,
    director: {
        ...smartClone(defaultDirector),
        subject: FRESH_STAGING_SESSION_DEFAULTS.sceneDirectorSubject,
        environment: FRESH_STAGING_SESSION_DEFAULTS.sceneDirectorEnvironment,
        lighting: FRESH_STAGING_SESSION_DEFAULTS.sceneDirectorLighting ?? '',
        camera: FRESH_STAGING_SESSION_DEFAULTS.sceneDirectorCamera ?? '',
        replaceAnchorSubjects: FRESH_STAGING_SESSION_DEFAULTS.replaceAnchorSubjects,
        globalReplaceTarget: FRESH_STAGING_SESSION_DEFAULTS.anchorSubjectText,
        mergeStrategy: 'Character Identity' as DirectorMergeStrategy,
    },
    productionActorWorkflowSource: null as AppState['productionActorWorkflowSource'],
    nanoCastSession: createDefaultNanoCastSession(),
    volatileWorkspaceResetNonce: 0,
};

const loadedPropStudioState = loadJson<PropAccessoryState>('nano_prop_studio_state', DEFAULT_PROP_STUDIO_STATE);
const initialPropStudioState: PropAccessoryState = {
    ...loadedPropStudioState,
    selectedProp: null,
    selectedCharacter: null,
    appliedImage: null,
    applyNote: ''
};

const loadedWardrobeState = loadJson<WardrobeState>('nano_wardrobe_state', DEFAULT_WARDROBE_STATE);
const initialWardrobeState: WardrobeState = {
    ...loadedWardrobeState,
    fittedImage: loadedWardrobeState.tryOnViews?.front ?? (
        loadedWardrobeState.tryOnSheetFB || loadedWardrobeState.tryOnSheetLR
            ? null
            : loadedWardrobeState.fittedImage
    ),
    tryOnOutputMode: 'front',
    tryOnViews: null,
    tryOnSheetFB: null,
    tryOnSheetLR: null,
    activeTryOnView: 'front',
    tryOnGarmentFit: loadedWardrobeState.tryOnGarmentFit ?? DEFAULT_WARDROBE_STATE.tryOnGarmentFit,
    tryOnFabricBehavior: loadedWardrobeState.tryOnFabricBehavior ?? DEFAULT_WARDROBE_STATE.tryOnFabricBehavior,
    tryOnOutputFraming: DEFAULT_WARDROBE_STATE.tryOnOutputFraming
};

const initialWelcomeStatus = getInitialWelcomeStatus();

export const initialState: AppState = {
    apiKey: localStorage.getItem('nano_api_key') || '',
    model: getInitialModel(),
    view: 'casting',
    cast: [],
    tokens: [],
    annotations: [],
    referenceSlots: defaultRefSlots,
    director: loadStoredDirector(),
    selection: null,
    selectionType: null,
    backgroundUrl: null,
    resultImage: null,
    logs: [],
    isProcessing: false,
    saveDirectoryHandle: null,
    saveDirectoryPath: localStorage.getItem('nano_save_path') || null,
    wardrobeItems: [], // initialize empty, load async
    storyboardSource: null,
    storyboardEndSource: null,
    storyboardGenerations: [],
    lastCastedImage: null,
    lastCastedPrompt: '',
    lastCastedMask: null,
    inspectImage: null,
    inspectMask: null,
    actorLibrary: [],
    propItems: [], // initialize empty, load async
    customCovers: {},
    depthMapUrl: null,
    depthMapHash: null,
    sourceBackgroundHash: null,
    imageResolution: loadJson<'1K' | '2K' | '4K'>('nano_image_resolution', '2K'),
    enableImageThinking: localStorage.getItem('nano_enable_image_thinking') !== 'false',
    enableGoogleGrounding: localStorage.getItem('nano_enable_google_grounding') === 'true' ? true : false,
    biometricSoundEnabled: loadJson<boolean>('nano_biometric_sound_enabled', true),
    biometricSoundVolume: clampBiometricSoundVolume(loadJson<number>('nano_biometric_sound_volume', 70)),
    floorPlane: loadJson<FloorPlane | null>('nano_floor_plane', null),
    occupiedVolumes: loadJson<OccupiedVolume[]>('nano_occupied_volumes', []),
    isDepthProcessing: false,
    isActorLibraryLoading: true,
    actorLibraryStatus: 'hydrating',

    regionEdit: smartClone(DEFAULT_REGION_EDIT),
    backgroundJobs: [],

    historyPast: [],
    historyFuture: [],

    shots: [],
    activeShotId: null,
    shotSessionsBySceneId: {},
    isStoryboardEnabled: loadJson<boolean>('nano_storyboard_enabled', false), // Persistent setting
    showHelpHints: loadJson<boolean>('nano_help_hints', true),
    
    isHelpOpen: false,
    helpContextSection: 'start',
    hasSeenWelcome: initialWelcomeStatus.hasSeenWelcome,
    welcomeInstallId: initialWelcomeStatus.welcomeInstallId,
    isWelcomeStateReady: initialWelcomeStatus.isWelcomeStateReady,

    stagePanelState: loadJson<Record<string, boolean>>('nano_stage_panel_state', {
        'anchor': false,       // Scene Generator (Open = false)
        'cast_palette': false,  // Available Cast (Open = false)
        'actor_intel': true,   // Actor Intelligence (Collapsed = true)
        'token_props': true,   // Token Properties (Collapsed = true)
        'annotation_props': true,
        'shots': true,
        'advanced_render': true,
        'region_edit': true,
        'layers': true,
        'specs': false,        // Context Specs (Open = false)
        'ref_stacks': true,
        'scene_director': true,
        'v3_terminal': false,
    }),

    // WARDROBE PERSISTENCE
    wardrobeState: initialWardrobeState,

    // PROP STUDIO PERSISTENCE
    propStudioState: initialPropStudioState,

    sessionName: null,
    sessionFilePath: null,

    billingMode: loadJson<'hosted' | 'byok'>('nano_billing_mode', 'byok'),
    billingEntitlements: {
        hasHostedAccess: true,
        hasByokAccess: true,
        effectiveBillingMode: loadJson<'hosted' | 'byok'>('nano_billing_mode', 'byok'),
        byokTier: null,
        ownedProductKeys: []
    },
    hostedSession: null,
    hostedCredits: null,
    showCreditModal: false,
    productionActorWorkflowSource: null,
    creditModal: null,
    liveStatus: null,
    pendingPitchSheetHandoff: null,
    pendingRefSheetHandoff: null,
    nanoCastSession: createDefaultNanoCastSession(),
    volatileWorkspaceResetNonce: 0,
};

// --- DATA SANITIZATION ---

const coerceFiniteNumber = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

type SanitizeTokenOptions = {
    stripDataUrl?: boolean;
};

const sanitizeToken = (token: StageToken, options: SanitizeTokenOptions = {}): StageToken => {
    const stripDataUrl = options.stripDataUrl === true;

    return {
        ...token,
        x: coerceFiniteNumber(token.x, 0),
        y: coerceFiniteNumber(token.y, 0),
        width: Math.max(20, coerceFiniteNumber(token.width, 200)),
        height: Math.max(20, coerceFiniteNumber(token.height, 300)),
        rotation: coerceFiniteNumber(token.rotation, 0),
        scaleX: coerceFiniteNumber(token.scaleX, 1),
        scaleY: coerceFiniteNumber(token.scaleY, 1),
        pitch: coerceFiniteNumber(token.pitch, 0),
        yaw: coerceFiniteNumber(token.yaw, 0),
        anchorX: clampNumber(coerceFiniteNumber(token.anchorX, 0.5), 0, 1),
        anchorY: clampNumber(coerceFiniteNumber(token.anchorY, 0.8), 0, 1),
        zIndex: coerceFiniteNumber(token.zIndex, 1),
        depth: token.depth === undefined ? undefined : clampNumber(coerceFiniteNumber(token.depth, 0.5), 0, 1),
        occlusionBias: token.occlusionBias === undefined ? undefined : coerceFiniteNumber(token.occlusionBias, 0),
        brightness: token.brightness === undefined ? undefined : coerceFiniteNumber(token.brightness, 100),
        contrast: token.contrast === undefined ? undefined : coerceFiniteNumber(token.contrast, 100),
        saturation: token.saturation === undefined ? undefined : coerceFiniteNumber(token.saturation, 100),
        blur: token.blur === undefined ? undefined : Math.max(0, coerceFiniteNumber(token.blur, 0)),
        // Persistence can opt into stripping heavy base64 strings; live editing must keep them.
        url: stripDataUrl && typeof token.url === 'string' && token.url.startsWith('data:') ? '' : token.url,
    };
};

function sanitizeTokens(tokens: StageToken[], options: SanitizeTokenOptions = {}): StageToken[] {
    return tokens.map(t => sanitizeToken(t, options));
}

const sanitizeAnnotation = (annotation: StageAnnotation): StageAnnotation => {
    const type = annotation.type === 'zone' || annotation.type === 'arrow' || annotation.type === 'note'
        ? annotation.type
        : 'note';
    const defaultWidth = type === 'arrow' ? 60 : type === 'zone' ? 220 : 150;
    const defaultHeight = type === 'arrow' ? 60 : type === 'zone' ? 140 : 100;

    return {
        ...annotation,
        type,
        x: coerceFiniteNumber(annotation.x, 0),
        y: coerceFiniteNumber(annotation.y, 0),
        width: Math.max(20, coerceFiniteNumber(annotation.width, defaultWidth)),
        height: Math.max(20, coerceFiniteNumber(annotation.height, defaultHeight)),
        rotation: coerceFiniteNumber(annotation.rotation, 0),
        scaleX: coerceFiniteNumber(annotation.scaleX, 1),
        scaleY: coerceFiniteNumber(annotation.scaleY, 1),
        zIndex: coerceFiniteNumber(annotation.zIndex, 10),
        thickness: annotation.thickness === undefined
            ? annotation.thickness
            : Math.max(1, coerceFiniteNumber(annotation.thickness, 2)),
        x1: annotation.x1 === undefined ? undefined : coerceFiniteNumber(annotation.x1, 0),
        y1: annotation.y1 === undefined ? undefined : coerceFiniteNumber(annotation.y1, 0),
        x2: annotation.x2 === undefined ? undefined : coerceFiniteNumber(annotation.x2, 0),
        y2: annotation.y2 === undefined ? undefined : coerceFiniteNumber(annotation.y2, 0),
    };
};

function sanitizeAnnotations(ann: StageAnnotation[]): StageAnnotation[] {
    return ann.map(sanitizeAnnotation);
}

function sanitizeReferenceSlots(slots: ReferenceSlot[]): ReferenceSlot[] {
    return slots.map(s => {
        let url = s.url;
        if (s.localPath && url && url.startsWith('data:')) {
            url = undefined; // Strip large base64 if canonical local metadata exists
        }
        return { ...s, url };
    });
}

function sanitizeShot(shot: Shot, options: SanitizeTokenOptions = {}): Shot {
    return {
        ...shot,
        occupiedVolumes: smartClone(shot.occupiedVolumes || []),
        tokens: sanitizeTokens(deduplicateTokens(smartClone(shot.tokens) || []), options),
        annotations: sanitizeAnnotations(smartClone(shot.annotations) || []),
        referenceSlots: sanitizeReferenceSlots(shot.referenceSlots || []),
        regionEdit: smartClone(shot.regionEdit ?? DEFAULT_REGION_EDIT),
    };
}

function sanitizeShots(shots: Shot[], options: SanitizeTokenOptions = { stripDataUrl: true }): Shot[] {
    return shots.map(s => sanitizeShot(s, options));
}

function sanitizeSnapshotForRestore(snap: HistorySnapshot): HistorySnapshot {
    return {
        ...snap,
        tokens: sanitizeTokens(deduplicateTokens(smartClone(snap.tokens) || [])),
        annotations: sanitizeAnnotations(smartClone(snap.annotations) || []),
        shots: sanitizeShots(smartClone(snap.shots) || [], { stripDataUrl: false }),
    };
}

const buildDefaultCreditModalState = (state: AppState): InsufficientCreditModalState => ({
    requiredCredits: calculateRequiredGenerationCredits({ imageSize: state.imageResolution }),
    currentCredits: state.hostedCredits ?? 0,
    imageSize: state.imageResolution,
    renderType: 'standard',
    openedAt: Date.now()
});

// --- REDUCER ---

export const reducer = (state: AppState, action: Action): AppState => {
    // Auto-record history for stage-impacting actions
    if (action.type !== 'UNDO' && action.type !== 'REDO' && shouldRecordHistory(action)) {
        const past = [...(state.historyPast || []), snapshotOf(state)].slice(-MAX_HISTORY);
        state = { ...state, historyPast: past, historyFuture: [] };
    }

    switch (action.type) {

        case 'UNDO': {
            if (!state.historyPast || state.historyPast.length === 0) return state;
            const past = [...state.historyPast];
            const snap = past.pop()!;
            const future = [snapshotOf(state), ...(state.historyFuture || [])].slice(0, MAX_HISTORY);
            return applySnapshot({ ...state, historyPast: past, historyFuture: future }, sanitizeSnapshotForRestore(snap));
        }
        case 'REDO': {
            if (!state.historyFuture || state.historyFuture.length === 0) return state;
            const future = [...state.historyFuture];
            const snap = future.shift()!;
            const past = [...(state.historyPast || []), snapshotOf(state)].slice(-MAX_HISTORY);
            return applySnapshot({ ...state, historyPast: past, historyFuture: future }, sanitizeSnapshotForRestore(snap));
        }
        case 'SET_VIEW':
            return { ...state, view: action.payload };
        case 'SET_PENDING_PITCH_SHEET_HANDOFF':
            return { ...state, pendingPitchSheetHandoff: action.payload };
        case 'CLEAR_PENDING_PITCH_SHEET_HANDOFF':
            return { ...state, pendingPitchSheetHandoff: null };
        case 'SET_PENDING_REF_SHEET_HANDOFF':
            return { ...state, pendingRefSheetHandoff: action.payload };
        case 'CLEAR_PENDING_REF_SHEET_HANDOFF':
            return { ...state, pendingRefSheetHandoff: null };
        case 'SET_NANO_CAST_BIOMETRIC_IMAGE': {
            const session = state.nanoCastSession ?? createDefaultNanoCastSession();
            const previousImageUrl = session.biometricImages[action.payload.angle];
            const biometricSourceChanged = previousImageUrl !== action.payload.imageUrl;
            const shouldClearGeneratedResult = biometricSourceChanged && Boolean(session.generatedCharacterUrl);
            const nextSession: NanoCastSessionState = {
                ...session,
                characterId: shouldClearGeneratedResult ? createNanoCastCharacterId() : session.characterId,
                biometricImages: {
                    ...session.biometricImages,
                    [action.payload.angle]: action.payload.imageUrl
                },
                generatedCharacterUrl: shouldClearGeneratedResult ? null : session.generatedCharacterUrl,
                generatedCharacterApprovedForPitchSheet: shouldClearGeneratedResult ? false : session.generatedCharacterApprovedForPitchSheet,
                approvedPitchSheetSourceUrl: shouldClearGeneratedResult ? null : session.approvedPitchSheetSourceUrl,
                updatedAt: Date.now()
            };
            return {
                ...state,
                nanoCastSession: {
                    ...nextSession,
                    identityLock: buildNanoCastSessionIdentityLock(nextSession)
                }
            };
        }
        case 'SET_NANO_CAST_GENERATED_RESULT': {
            const session = state.nanoCastSession ?? createDefaultNanoCastSession();
            return {
                ...state,
                nanoCastSession: {
                    ...session,
                    generatedCharacterUrl: action.payload,
                    generatedCharacterApprovedForPitchSheet: false,
                    approvedPitchSheetSourceUrl: null,
                    updatedAt: Date.now()
                }
            };
        }
        case 'SET_NANO_CAST_SESSION_METADATA': {
            const session = state.nanoCastSession ?? createDefaultNanoCastSession();
            const nextSession: NanoCastSessionState = {
                ...session,
                ...action.payload,
                directorControls: {
                    ...session.directorControls,
                    ...(action.payload.directorControls ?? {})
                },
                updatedAt: Date.now()
            };
            return {
                ...state,
                nanoCastSession: {
                    ...nextSession,
                    identityLock: buildNanoCastSessionIdentityLock(nextSession)
                }
            };
        }
        case 'CLEAR_NANO_CAST_SESSION':
            return { ...state, nanoCastSession: createDefaultNanoCastSession() };
        case 'RESET_VOLATILE_WORKSPACE_STATE':
            return {
                ...state,
                ...smartClone(FRESH_STAGING_CONTEXT_STATE),
                referenceSlots: smartClone(defaultRefSlots),
                director: smartClone(FRESH_STAGING_CONTEXT_STATE.director),
                regionEdit: smartClone(DEFAULT_REGION_EDIT),
                nanoCastSession: createDefaultNanoCastSession(),
                propStudioState: {
                    ...state.propStudioState,
                    selectedProp: null,
                    selectedCharacter: null,
                    designerImage: null,
                    appliedImage: null,
                    applyNote: ''
                },
                wardrobeState: {
                    ...state.wardrobeState,
                    selectedCharacter: null,
                    selectedCostume: null,
                    fittedImage: null,
                    processedTryOnUrl: null,
                    tryOnViews: null,
                    tryOnSheetFB: null,
                    tryOnSheetLR: null,
                    activeTryOnView: 'front',
                    designerImage: null
                },
                volatileWorkspaceResetNonce: state.volatileWorkspaceResetNonce + 1,
            };
        case 'SET_API_KEY': {
            const nextKey = action.payload;
            return { 
                ...state, 
                apiKey: nextKey,
                billingEntitlements: EntitlementResolver.resolveEntitlements(state.hostedSession, nextKey, import.meta.env.DEV, state.billingMode)
            };
        }
        case 'SET_MODEL':
            return { ...state, model: normalizeImageGenerationModel(action.payload) };
        case 'SET_BILLING_MODE': {
            const overrideMode = action.payload;
            return { 
                ...state, 
                billingMode: overrideMode,
                billingEntitlements: EntitlementResolver.resolveEntitlements(state.hostedSession, state.apiKey, import.meta.env.DEV, overrideMode)
            };
        }
        case 'SET_BILLING_ENTITLEMENTS':
            return { ...state, billingEntitlements: action.payload };
        case 'SET_HOSTED_SESSION': {
            const nextSession = action.payload;
            const currentUserId = state.hostedSession?.user?.id ?? null;
            const nextUserId = nextSession?.user?.id ?? null;
            return { 
                ...state, 
                hostedSession: nextSession,
                hostedCredits: currentUserId && currentUserId === nextUserId ? state.hostedCredits : null,
                billingEntitlements: EntitlementResolver.resolveEntitlements(nextSession, state.apiKey, import.meta.env.DEV, state.billingMode)
            };
        }
        case 'SET_HOSTED_CREDITS':
            return { ...state, hostedCredits: action.payload };
        case 'SET_CREDIT_MODAL': {
            if (typeof action.payload === 'boolean') {
                return {
                    ...state,
                    showCreditModal: action.payload,
                    creditModal: action.payload ? buildDefaultCreditModalState(state) : null
                };
            }

            return {
                ...state,
                showCreditModal: true,
                productionActorWorkflowSource: null,
                creditModal: {
                    ...action.payload,
                    openedAt: 'openedAt' in action.payload ? action.payload.openedAt : Date.now()
                }
            };
        }

        case 'ADD_CAST': {
            if (state.cast.some(c => c.id === action.payload.id)) return state;
            return { ...state, cast: [...state.cast, action.payload] };
        }
        case 'CLEAR_CAST':
            return { ...state, cast: [] };
        case 'UPDATE_CAST':
            return { ...state, cast: state.cast.map(c => (c.id === action.payload.id ? { ...c, ...action.payload } : c)) };
        case 'REMOVE_CAST': {
            const nextCast = state.cast.filter(c => c.id !== action.payload);
            const nextTokens = state.tokens.filter(t => t.castId !== action.payload);
            const nextSelection = state.selection && !nextTokens.find(t => t.id === state.selection) ? null : state.selection;
            return { ...state, cast: nextCast, tokens: nextTokens, selection: nextSelection };
        }
        case 'REMOVE_FROM_AVAILABLE_CAST': {
            const nextCast = state.cast.filter(c => c.id !== action.payload.actorId);
            return { ...state, cast: nextCast };
        }

        case 'ADD_TOKEN': {
            // Safety: Prevent adding a token that already exists in the array (ID check)
            if (state.tokens.some(t => t.id === action.payload.id)) return state;
            return { ...state, tokens: [...state.tokens, sanitizeToken(action.payload)] };
        }
        case 'UPDATE_TOKEN':
            return {
                ...state,
                tokens: state.tokens.map(t => (
                    t.id === action.payload.id
                        ? sanitizeToken({ ...t, ...action.payload })
                        : t
                ))
            };
        case 'REMOVE_TOKEN': {
            const nextTokens = state.tokens.filter(t => t.id !== action.payload);
            const nextSelection = state.selection === action.payload ? null : state.selection;
            return { ...state, tokens: nextTokens, selection: nextSelection };
        }
        case 'DUPLICATE_TOKEN': {
            const src = state.tokens.find(t => t.id === action.payload.id);
            if (!src) return state;
            const now = Date.now();
            const nextId = `token-${now}-${Math.random().toString(16).slice(2)}`;
            const copy: StageToken = {
                ...smartClone(src),
                id: nextId,
                x: coerceFiniteNumber(src.x, 0) + 20,
                y: coerceFiniteNumber(src.y, 0) + 20,
                zIndex: Math.max(...state.tokens.map(t => coerceFiniteNumber(t.zIndex, 0)), 0) + 1
            };
            return {
                ...state,
                tokens: [...state.tokens, sanitizeToken(copy)],
                selection: copy.id,
                selectionType: 'token'
            };
        }

        case 'ADD_ANNOTATION':
            return { ...state, annotations: [...state.annotations, sanitizeAnnotation(action.payload)] };
        case 'UPDATE_ANNOTATION':
            return {
                ...state,
                annotations: state.annotations.map(a => (
                    a.id === action.payload.id
                        ? sanitizeAnnotation({ ...a, ...action.payload })
                        : a
                ))
            };
        case 'SET_TOKENS':
            return { ...state, tokens: sanitizeTokens(deduplicateTokens(action.payload)) };

        case 'SET_ANNOTATIONS':
            return { ...state, annotations: sanitizeAnnotations(action.payload) };

        case 'REMOVE_ANNOTATION': {
            const nextAnnotations = state.annotations.filter(a => a.id !== action.payload);
            const nextSelection = state.selection === action.payload ? null : state.selection;
            return { ...state, annotations: nextAnnotations, selection: nextSelection };
        }

        case 'UPDATE_REF_SLOT': {
            const next = state.referenceSlots.map(s => (s.index === action.payload.index ? { ...s, ...action.payload.updates } : s));
            return { ...state, referenceSlots: next };
        }
        case 'CLEAR_REF_SLOTS':
            return { ...state, referenceSlots: defaultRefSlots };

        case 'SET_PROP_STUDIO_STATE': {
            const nextState = { ...state.propStudioState, ...action.payload };
            
            // Immediately persist a sanitized version
            const persistedPropStudioState = {
                ...nextState,
                selectedProp: null,
                selectedCharacter: null,
                appliedImage: null,
                applyNote: ''
            };
            try {
                localStorage.setItem('nano_prop_studio_state', JSON.stringify(persistedPropStudioState));
            } catch (e) {
                console.warn('Failed to persist clean prop studio state', e);
            }
            
            return { ...state, propStudioState: nextState };
        }
        case 'SET_DIRECTOR': {
            const next = { ...state.director, ...action.payload };
            return { ...state, director: next };
        }

        case 'SELECT_ITEM':
            return { ...state, selection: action.payload.id, selectionType: action.payload.type };

        case 'CLEAR_STAGE': {
            const nextState = {
                ...state,
                ...smartClone(FRESH_STAGING_CONTEXT_STATE),
                regionEdit: smartClone(DEFAULT_REGION_EDIT),
                director: smartClone(FRESH_STAGING_CONTEXT_STATE.director),
                historyPast: [],
                historyFuture: [],
            };

            // Also clear the currently active shot so persistence matches the cleared stage
            let nextShots = state.shots;
            if (state.activeShotId) {
                nextShots = state.shots.map(s => {
                    if (s.id !== state.activeShotId) return s;
                    return {
                        ...s,
                        backgroundUrl: null,
                        depthMapUrl: null,
                        tokens: [],
                        annotations: [],
                        floorPlane: null,
                        occupiedVolumes: [],
                        regionEdit: smartClone(DEFAULT_REGION_EDIT),
                        director: smartClone(FRESH_STAGING_CONTEXT_STATE.director),
                        updatedAt: Date.now(),
                        promotedResultAnchor: undefined,
                        latestCompositeResultUrl: undefined,
                        latestCompositeStage: undefined,
                        latestCompositeTimestamp: undefined,
                        latestCompositeSource: undefined,
                    };
                });
            }

            return { ...nextState, shots: nextShots };
        }

        case 'SET_SCENE_RESULT_ANCHOR': {
            let found = false;
            const nextShots = state.shots.map(s => {
                if (s.id !== action.payload.sceneId) return s;
                found = true;
                return { ...s, promotedResultAnchor: action.payload.anchor, updatedAt: Date.now() };
            });
            if (!found) {
                nextShots.push({
                    id: action.payload.sceneId,
                    name: 'Scene 1',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    backgroundUrl: null,
                    tokens: [],
                    annotations: [],
                    occupiedVolumes: [],
                    referenceSlots: defaultRefSlots,
                    director: defaultDirector,
                    promotedResultAnchor: action.payload.anchor
                });
            }
            return { ...state, shots: nextShots, activeShotId: action.payload.sceneId };
        }

        case 'SYNC_SPATIAL_DESCRIPTORS': {
            const STAGE_H = 540;
            const safeTokens = sanitizeTokens(state.tokens);

            // 1. Recompute depthScore for all actors
            // Using ONLY: scale, y, anchorLayer (Authority #1 & #2)
            const withScores = safeTokens.map(t => ({
                ...t,
                _depthScore: computeDepthScore(
                    {
                        scale: t.scaleX,
                        position: { y: t.y },
                        height: t.height,
                        depthLayer: t.anchorLayer // Using input constraint as bias (Authority #1)
                    },
                    { height: STAGE_H }
                )
            }));

            // 2. Sort actors by depthScore descending
            const sorted = [...withScores].sort((a, b) => b._depthScore - a._depthScore);

            // 3. Assign derived layers (Authority #3 - Read Only)
            const count = sorted.length;
            const nextTokens = safeTokens.map(t => {
                const sortedItem = sorted.find(s => s.id === t.id);
                const index = sorted.findIndex(s => s.id === t.id);
                const score = sortedItem?._depthScore || 0.5;

                // "Assign: top third -> foreground, middle third -> midground, bottom third -> background"
                let derivedLayer: 'foreground' | 'midground' | 'background' = 'midground';
                if (index < count / 3) derivedLayer = 'foreground';
                else if (index > (count * 2) / 3) derivedLayer = 'background';

                // Authority #3 assignment (zIndex)
                const newZ = (count - index) + 10;

                return {
                    ...t,
                    zIndex: newZ,
                    spatialDescriptor: {
                        depthScore: score,
                        depthLayer: derivedLayer, // This is the READ-ONLY derived layer (Authority #3)
                        zIndex: newZ
                    }
                };
            });

            return { ...state, tokens: nextTokens };
        }

        case 'SET_STORYBOARD_ENABLED':
            localStorage.setItem('nano_storyboard_enabled', JSON.stringify(action.payload));
            return { ...state, isStoryboardEnabled: action.payload };

        case 'SET_SHOW_HELP_HINTS':
            return { ...state, showHelpHints: action.payload };

        case 'SET_BG': {
            const resetRegionEditSizing: Pick<RegionEditState, 'contextSizingMode' | 'sourceImageMeta'> = {
                contextSizingMode: 'manual',
                sourceImageMeta: undefined
            };
            let nextShots = state.shots;
            if (state.activeShotId) {
                nextShots = state.shots.map(s => {
                    if (s.id !== state.activeShotId) return s;
                    return { 
                        ...s, 
                        backgroundUrl: action.payload,
                        depthMapUrl: null,
                        depthMapHash: null,
                        sourceBackgroundHash: null,
                        floorPlane: null,
                        occupiedVolumes: [],
                        promotedResultAnchor: undefined,
                        latestCompositeResultUrl: undefined,
                        latestCompositeStage: undefined,
                        latestCompositeTimestamp: undefined,
                        latestCompositeSource: undefined,
                        updatedAt: Date.now() 
                    };
                });
            }
            return {
                ...state,
                backgroundUrl: action.payload,
                regionEdit: { ...state.regionEdit, ...resetRegionEditSizing },
                depthMapUrl: null,
                depthMapHash: null,
                sourceBackgroundHash: null,
                floorPlane: null,
                occupiedVolumes: [],
                shots: nextShots
            };
        }
        case 'SET_DEPTH_MAP': {
            if (!DEPTH_FEATURE_ENABLED) return state;
            const { url, hash, sourceHash } = typeof action.payload === 'string' || action.payload === null
                ? { url: action.payload, hash: null, sourceHash: null }
                : action.payload;
            // Invalidate floor plane when depth map changes
            return {
                ...state,
                depthMapUrl: url,
                depthMapHash: hash || null,
                sourceBackgroundHash: sourceHash || null,
                floorPlane: null,
                occupiedVolumes: []
            };
        }
        case 'SET_FLOOR_PLANE':
            if (!DEPTH_FEATURE_ENABLED) return state;
            return { ...state, floorPlane: action.payload };
        case 'SET_OCCUPIED_VOLUMES':
            if (!DEPTH_FEATURE_ENABLED) return state;
            return { ...state, occupiedVolumes: action.payload };
        case 'SET_RESULT_IMAGE':
            return { ...state, resultImage: action.payload };
        case 'SET_COMPOSITE_METADATA':
            return {
                ...state,
                latestCompositeSource: action.payload.latestCompositeSource !== undefined ? action.payload.latestCompositeSource : state.latestCompositeSource,
                latestCompositeResultUrl: action.payload.latestCompositeResultUrl !== undefined ? action.payload.latestCompositeResultUrl : state.latestCompositeResultUrl
            };
        case 'SET_PROCESSING':
            return {
                ...state,
                isProcessing: action.payload,
                globalProgress: action.payload ? state.globalProgress : undefined,
            };
        case 'SET_GLOBAL_PROGRESS':
            return { ...state, globalProgress: action.payload || undefined };
        case 'SET_DEPTH_PROCESSING':
            if (!DEPTH_FEATURE_ENABLED) return state;
            return { ...state, isDepthProcessing: action.payload };
        case 'SET_GLOBAL_VEO_DRAFT':
            return { ...state, veoPromptDraft: action.payload };
        case 'ADD_LOG': {
            const nextLog = { ...action.payload, id: Math.random().toString(), timestamp: new Date() };
            return { 
                ...state, 
                logs: [...state.logs, nextLog].slice(-50),
                liveStatus: {
                    id: nextLog.id,
                    text: nextLog.message,
                    type: nextLog.type,
                    createdAt: Date.now()
                }
            };
        }
        case 'SET_LIVE_STATUS':
            return { ...state, liveStatus: action.payload };
        case 'SET_PRODUCTION_ACTOR_WORKFLOW_SOURCE':
            return { ...state, productionActorWorkflowSource: action.payload };
        case 'DISCARD_SESSION': {
            return {
                ...state,
                ...smartClone(FRESH_STAGING_CONTEXT_STATE),
                sessionName: null,
                sessionFilePath: null,
                nanoCastSession: createDefaultNanoCastSession()
            };
        }
        case 'SET_SESSION_INFO':
            return { ...state, sessionName: action.payload.name, sessionFilePath: action.payload.path };
        case 'LOAD_SESSION_STATE': {
            const loaded = action.payload;

            return {
                ...initialState,

                // loaded session payload becomes authoritative for canvas content
                ...loaded,

                // RE-ASSERT GLOBALS (prevents old session payloads from overwriting active system settings and libraries)
                apiKey: state.apiKey,
                model: state.model,
                view: state.view,
                saveDirectoryHandle: state.saveDirectoryHandle,
                saveDirectoryPath: state.saveDirectoryPath,
                isHelpOpen: state.isHelpOpen,
                helpContextSection: state.helpContextSection,
                hasSeenWelcome: state.hasSeenWelcome,
                welcomeInstallId: state.welcomeInstallId,
                isWelcomeStateReady: state.isWelcomeStateReady,
                showHelpHints: state.showHelpHints,
                stagePanelState: state.stagePanelState,
                imageResolution: state.imageResolution,
                enableImageThinking: state.enableImageThinking,
                enableGoogleGrounding: state.enableGoogleGrounding,
                biometricSoundEnabled: state.biometricSoundEnabled,
                biometricSoundVolume: state.biometricSoundVolume,
                isStoryboardEnabled: state.isStoryboardEnabled,
                billingMode: state.billingMode,
                billingEntitlements: state.billingEntitlements,
                hostedSession: state.hostedSession,
                hostedCredits: state.hostedCredits,
                showCreditModal: state.showCreditModal,
                creditModal: state.creditModal,
                actorLibrary: state.actorLibrary,
                wardrobeItems: state.wardrobeItems,
                propItems: state.propItems,
                customCovers: state.customCovers,

                // re-normalize nested structures
                tokens: sanitizeTokens(deduplicateTokens(smartClone(loaded.tokens) || [])),
                annotations: sanitizeAnnotations(smartClone(loaded.annotations) || []),
                shots: sanitizeShots(smartClone(loaded.shots) || [], { stripDataUrl: false }),
                director: { ...defaultDirector, ...(loaded.director || {}) },
                regionEdit: {
                    ...smartClone(DEFAULT_REGION_EDIT),
                    ...(loaded.regionEdit || {}),
                    layers: loaded.regionEdit?.layers
                        ? loaded.regionEdit.layers.map((layer, index: number) => ({
                            ...smartClone(DEFAULT_REGION_EDIT.layers[index] || DEFAULT_REGION_EDIT.layers[0]),
                            ...layer
                        }))
                        : smartClone(DEFAULT_REGION_EDIT.layers)
                },

                // kill stale transient UI/session artifacts
                selection: null,
                selectionType: null,
                logs: state.logs,
                isProcessing: false,
                globalProgress: undefined,
                liveStatus: null,
                backgroundJobs: [],
                inspectImage: null,
                inspectMask: null,
                inspectImageLocalPath: undefined,
                inspectImageSourceUrl: undefined,
                lastCastedImage: null,
                lastCastedPrompt: '',
                lastCastedMask: null,
                storyboardSource: null,
                storyboardEndSource: null,
                storyboardGenerations: [],

                // reset studio transient state that should not bleed across sessions
                wardrobeState: {
                    ...DEFAULT_WARDROBE_STATE,
                    designerImage: null,
                    fittedImage: null,
                    processedTryOnUrl: null,
                    tryOnViews: null,
                    tryOnSheetFB: null,
                    tryOnSheetLR: null,
                    selectedCharacter: null,
                    selectedCostume: null,
                    brandingLogo: null,
                },

                propStudioState: {
                    ...DEFAULT_PROP_STUDIO_STATE,
                    selectedProp: null,
                    selectedCharacter: null,
                    designerImage: null,
                    appliedImage: null,
                    applyNote: ''
                },

                historyPast: (loaded.historyPast || []).map(sanitizeSnapshotForRestore),
                historyFuture: (loaded.historyFuture || []).map(sanitizeSnapshotForRestore),
                sessionName: loaded.sessionName ?? state.sessionName ?? null,
                sessionFilePath: loaded.sessionFilePath ?? state.sessionFilePath ?? null,
            };
        }
        case 'SET_SAVE_DIRECTORY':
            return { ...state, saveDirectoryHandle: action.payload };
        case 'SET_IMAGE_RESOLUTION':
            return { ...state, imageResolution: action.payload };
        case 'SET_ENABLE_IMAGE_THINKING':
            return { ...state, enableImageThinking: action.payload };
        case 'SET_ENABLE_GOOGLE_GROUNDING':
            return { ...state, enableGoogleGrounding: action.payload };
        case 'SET_BIOMETRIC_SOUND_ENABLED':
            return { ...state, biometricSoundEnabled: action.payload };
        case 'SET_BIOMETRIC_SOUND_VOLUME':
            return { ...state, biometricSoundVolume: clampBiometricSoundVolume(action.payload) };
        case 'SET_SAVE_PATH':
            localStorage.setItem('nano_save_path', action.payload || '');
            return { ...state, saveDirectoryPath: action.payload };

        case 'ADD_WARDROBE_ITEM':
            return { ...state, wardrobeItems: [...state.wardrobeItems, action.payload] };
        case 'REMOVE_WARDROBE_ITEM':
            return { ...state, wardrobeItems: state.wardrobeItems.filter(item => item.id !== action.payload) };
        case 'SET_WARDROBE_ITEMS':
            return { ...state, wardrobeItems: action.payload };

        case 'SET_STORYBOARD_SOURCE':
            return { ...state, storyboardSource: action.payload };
        case 'SET_STORYBOARD_END_SOURCE':
            return { ...state, storyboardEndSource: action.payload };
        case 'SET_STORYBOARD_GENERATIONS':
            return { ...state, storyboardGenerations: action.payload };
        case 'UPDATE_STORYBOARD_GENERATION':
            return {
                ...state,
                storyboardGenerations: state.storyboardGenerations.map(g => (g.id === action.payload.id ? { ...g, ...action.payload } : g)),
            };

        case 'SET_LAST_CASTED_IMAGE':
            return { ...state, lastCastedImage: action.payload };
        case 'SET_LAST_CASTED_PROMPT':
            return { ...state, lastCastedPrompt: action.payload };
        case 'SET_LAST_CASTED_MASK':
            return { ...state, lastCastedMask: action.payload };
        case 'SET_INSPECT_IMAGE':
            return { ...state, inspectImage: action.payload };
        case 'SET_INSPECT_MASK':
            return { ...state, inspectMask: action.payload };

        case 'UPDATE_TOKEN_INTELLIGENCE':
            return { ...state, tokens: state.tokens.map(t => (t.id === action.payload.id ? { ...t, intelligence: action.payload.intelligence } : t)) };

        case 'ADD_ACTOR_LIBRARY':
            return { ...state, actorLibrary: [action.payload, ...state.actorLibrary] };
        case 'REMOVE_ACTOR_LIBRARY':
            return { ...state, actorLibrary: state.actorLibrary.filter(a => a.id !== action.payload) };
        case 'REMOVE_ACTOR_LIBRARY_BY_URL':
            return { ...state, actorLibrary: state.actorLibrary.filter(a => a.url !== action.payload) };
        case 'UPDATE_ACTOR_LIBRARY': {
            const { id, updates } = action.payload;
            const targetActor = state.actorLibrary.find(a => a.id === id);
            let nextCast = state.cast;
            let nextTokens = state.tokens;

            if (targetActor && updates.name) {
                nextCast = state.cast.map(c => c.url === targetActor.url ? { ...c, name: updates.name! } : c);
                nextTokens = state.tokens.map(t => t.url === targetActor.url ? { ...t, tag: updates.name! } : t);
            }

            return {
                ...state,
                actorLibrary: state.actorLibrary.map(a => (a.id === id ? { ...a, ...updates } : a)),
                cast: nextCast,
                tokens: nextTokens
            };
        }
        // --- BACKGROUND JOBS ---
        case 'ADD_BACKGROUND_JOB':
            return {
                ...state,
                backgroundJobs: [...(state.backgroundJobs || []), action.payload]
            };
        case 'UPDATE_BACKGROUND_JOB':
            return {
                ...state,
                backgroundJobs: (state.backgroundJobs || []).map(job =>
                    job.id === action.payload.id ? { ...job, ...action.payload.updates } : job
                )
            };
        case 'REMOVE_BACKGROUND_JOB':
            return {
                ...state,
                backgroundJobs: (state.backgroundJobs || []).filter(job => job.id !== action.payload)
            };

        case 'COMPLETE_BACKGROUND_JOB': {
            const job = (state.backgroundJobs || []).find(j => j.id === action.payload.id);
            if (!job) return state;

            const newState = { ...state };
            
            // Route asset based on STRICT context
            if (job.context === 'casting') {
                newState.lastCastedImage = action.payload.assetUrl;
            } else if (job.context === 'wardrobe_designer') {
                newState.wardrobeState = { ...newState.wardrobeState, designerImage: action.payload.assetUrl };
            } else if (job.context === 'prop_designer') {
                newState.propStudioState = { ...newState.propStudioState, designerImage: action.payload.assetUrl };
            } else if (job.context === 'prop_applied') {
                newState.propStudioState = { ...newState.propStudioState, appliedImage: action.payload.assetUrl };
            } else if (job.context === 'scene_render') {
                newState.liveStatus = {
                    id: action.payload.id,
                    text: 'Staging render completed in background. Open Recent Generations or promote it explicitly before using it as a prompt source.',
                    type: 'success',
                    createdAt: Date.now()
                };
            }

            // Remove the completed job
            newState.backgroundJobs = (newState.backgroundJobs || []).filter(j => j.id !== action.payload.id);
            return newState;
        }

        case 'FAIL_BACKGROUND_JOB':
            return {
                ...state,
                backgroundJobs: (state.backgroundJobs || []).map(j =>
                    j.id === action.payload.id
                        ? { ...j, status: 'failed', errorMessage: action.payload.errorMessage }
                        : j
                )
            };

        case 'SET_ACTOR_LIBRARY':
            return { ...state, actorLibrary: action.payload };

        case 'SET_ACTOR_LIBRARY_LOADING':
            return {
                ...state,
                isActorLibraryLoading: action.payload,
                // Backward-compatible boolean only. Do not promote false -> "ready" here:
                // the explicit SET_ACTOR_LIBRARY_STATUS action is the source of truth.
                // This prevents the library from flashing as empty before native hydration starts.
                actorLibraryStatus: action.payload ? 'hydrating' : state.actorLibraryStatus
            };

        case 'SET_ACTOR_LIBRARY_STATUS':
            return { 
                ...state, 
                actorLibraryStatus: action.payload,
                isActorLibraryLoading: action.payload === 'hydrating'
            };

        case 'ADD_PROP_ITEM':
            return { ...state, propItems: [...state.propItems, action.payload] };
        case 'REMOVE_PROP_ITEM':
            return { ...state, propItems: state.propItems.filter(item => item.id !== action.payload) };
        case 'SET_PROP_ITEMS':
            return { ...state, propItems: action.payload };

        case 'SET_CUSTOM_COVERS':
            console.log(`[AppContext] SET_CUSTOM_COVERS dispatched. Keys: ${Object.keys(action.payload).join(', ')}`);
            return { ...state, customCovers: action.payload };

        case 'SET_STAGE_PANEL_STATE': {
            const nextPanelState = {
                ...state.stagePanelState,
                [action.payload.id]: action.payload.isOpen
            };
            localStorage.setItem('nano_stage_panel_state', JSON.stringify(nextPanelState));
            return {
                ...state,
                stagePanelState: nextPanelState
            };
        }

        case 'SET_WARDROBE_STATE':
            return { ...state, wardrobeState: { ...state.wardrobeState, ...action.payload } };

        case 'TOGGLE_HELP':
            return { ...state, isHelpOpen: action.payload };
        case 'SET_HELP_SECTION':
            return { ...state, helpContextSection: action.payload };
        case 'SET_WELCOME_INSTALL_CONTEXT':
            return {
                ...state,
                welcomeInstallId: action.payload.installId,
                isWelcomeStateReady: true,
                hasSeenWelcome: hasSeenWelcomeForInstall(localStorage, action.payload.installId)
            };
        case 'SET_SEEN_WELCOME':
            markWelcomeSeenForInstall(localStorage, action.payload, state.welcomeInstallId);
            return { ...state, hasSeenWelcome: action.payload };

        // --- REGION EDIT ---
        case 'SET_REGION_EDIT':
            return { ...state, regionEdit: { ...state.regionEdit, ...action.payload } };
        case 'SET_REGION_ACTIVE_LAYER':
            return { ...state, regionEdit: { ...state.regionEdit, activeLayerId: action.payload.id } };
        case 'UPDATE_REGION_LAYER': {
            const nextLayers = state.regionEdit.layers.map(l => (l.id === action.payload.id ? { ...l, ...action.payload.updates } : l));
            return { ...state, regionEdit: { ...state.regionEdit, layers: nextLayers } };
        }
        case 'CLEAR_REGION_LAYER_MASK': {
            const nextLayers = state.regionEdit.layers.map(l => (l.id === action.payload ? { ...l, maskDataUrl: null } : l));
            return { ...state, regionEdit: { ...state.regionEdit, layers: nextLayers } };
        }
        case 'CLEAR_ALL_REGION_MASKS': {
            const nextLayers = state.regionEdit.layers.map(l => ({ ...l, maskDataUrl: null }));
            return { ...state, regionEdit: { ...state.regionEdit, layers: nextLayers } };
        }

        case 'SET_REGION_PROTECT':
            return { ...state, regionEdit: { ...state.regionEdit, protectEnabled: action.payload.enabled } };
        case 'SET_REGION_PROTECT_MASK':
            return { ...state, regionEdit: { ...state.regionEdit, protectMaskDataUrl: action.payload.maskDataUrl } };

        // --- SHOTS ---
        case 'CREATE_OR_REPLACE_SHOT_SESSION':
            return {
                ...state,
                shotSessionsBySceneId: {
                    ...state.shotSessionsBySceneId,
                    [action.payload.sceneId]: action.payload.session
                }
            };
        case 'UPDATE_SHOT_SESSION': {
            const currentSession = state.shotSessionsBySceneId[action.payload.sceneId];
            if (!currentSession) return state;
            const updated = action.payload.updater(currentSession);
            if (!updated) return state;
            return {
                ...state,
                shotSessionsBySceneId: {
                    ...state.shotSessionsBySceneId,
                    [action.payload.sceneId]: updated
                }
            };
        }
        case 'SET_SHOT_VARIANT_SELECTED': {
            const currentSession = state.shotSessionsBySceneId[action.payload.sceneId];
            if (!currentSession) return state;
            const updatedVariants = currentSession.variants.map(v => 
                v.id === action.payload.variantId ? { ...v, selected: action.payload.selected } : v
            );
            return {
                ...state,
                shotSessionsBySceneId: {
                    ...state.shotSessionsBySceneId,
                    [action.payload.sceneId]: {
                        ...currentSession,
                        variants: updatedVariants,
                        updatedAt: new Date().toISOString()
                    }
                }
            };
        }
        case 'CLEAR_SHOT_SESSION': {
            const { [action.payload.sceneId]: _, ...rest } = state.shotSessionsBySceneId;
            return { ...state, shotSessionsBySceneId: rest };
        }
        case 'SET_SHOTS':
            return { ...state, shots: sanitizeShots(action.payload, { stripDataUrl: false }) };

        case 'ADD_SHOT_FROM_STAGE': {
            const now = Date.now();
            const nextId = `shot-${now}-${Math.random().toString(16).slice(2)}`;
            const name = action.payload?.name?.trim() || `Shot ${state.shots.length + 1}`;

            const newShot: Shot = sanitizeShot({
                id: nextId,
                name,
                createdAt: now,
                updatedAt: now,
                backgroundUrl: state.backgroundUrl,
                depthMapUrl: state.depthMapUrl,
                depthMapHash: state.depthMapHash,
                sourceBackgroundHash: state.sourceBackgroundHash,
                floorPlane: state.floorPlane,
                occupiedVolumes: smartClone(state.occupiedVolumes) || [],
                tokens: smartClone(state.tokens) || [],
                annotations: smartClone(state.annotations) || [],
                referenceSlots: smartClone(state.referenceSlots) || [],
                director: smartClone(state.director),
                startFrameUrl: null,
                endFrameUrl: null,
                notes: '',
                regionEdit: smartClone(state.regionEdit),
            });

            return { ...state, shots: [...state.shots, newShot], activeShotId: newShot.id };
        }

        case 'DUPLICATE_SHOT': {
            const src = state.shots.find(s => s.id === action.payload.id);
            if (!src) return state;
            const now = Date.now();
            const nextId = `shot-${now}-${Math.random().toString(16).slice(2)}`;
            const copy: Shot = sanitizeShot({
                ...smartClone(src),
                id: nextId,
                name: `${src.name} Copy`,
                createdAt: now,
                updatedAt: now,
            });
            return {
                ...state,
                shots: [...state.shots, copy],
                activeShotId: copy.id,
                backgroundUrl: copy.backgroundUrl,
                depthMapUrl: copy.depthMapUrl || null,
                tokens: sanitizeTokens(deduplicateTokens(smartClone(copy.tokens) || [])),
                annotations: sanitizeAnnotations(smartClone(copy.annotations) || []),
                referenceSlots: smartClone(copy.referenceSlots) || [],
                director: smartClone(copy.director),
                floorPlane: copy.floorPlane || null,
                occupiedVolumes: smartClone(copy.occupiedVolumes) || [],
                regionEdit: smartClone(copy.regionEdit ?? DEFAULT_REGION_EDIT),
                selection: null,
                selectionType: null,
            };
        }

        case 'REMOVE_SHOT': {
            const remaining = state.shots.filter(s => s.id !== action.payload.id);
            const removingActive = state.activeShotId === action.payload.id;

            if (!removingActive) return { ...state, shots: remaining };

            const nextActiveRaw = remaining[remaining.length - 1] || null;
            const nextActive = nextActiveRaw ? sanitizeShot(nextActiveRaw) : null;
            if (!nextActive) {
                return { 
                    ...state, 
                    shots: [], 
                    activeShotId: null,
                    storyboardSource: null,
                    storyboardEndSource: null
                };
            }

            return {
                ...state,
                shots: remaining,
                activeShotId: nextActive.id,
                backgroundUrl: nextActive.backgroundUrl,
                depthMapUrl: nextActive.depthMapUrl || null,
                depthMapHash: nextActive.depthMapHash || null,
                sourceBackgroundHash: nextActive.sourceBackgroundHash || null,
                floorPlane: nextActive.floorPlane || null,
                occupiedVolumes: smartClone(nextActive.occupiedVolumes) || [],
                tokens: sanitizeTokens(deduplicateTokens(smartClone(nextActive.tokens) || [])),
                annotations: sanitizeAnnotations(smartClone(nextActive.annotations) || []),
                referenceSlots: smartClone(nextActive.referenceSlots) || [],
                director: smartClone(nextActive.director),
                regionEdit: smartClone(nextActive.regionEdit ?? DEFAULT_REGION_EDIT),
                selection: null,
                selectionType: null,
                storyboardSource: nextActive.startFrameUrl ? { url: nextActive.startFrameUrl, dna: 'Shot Start' } : null,
                storyboardEndSource: nextActive.endFrameUrl ? { url: nextActive.endFrameUrl, dna: 'Shot End' } : null,
            };
        }

        case 'CLEAR_SHOTS': {
            return {
                ...state,
                shots: [],
                activeShotId: null,
                storyboardSource: null,
                storyboardEndSource: null
            };
        }

        case 'SET_ACTIVE_SHOT': {
            const id = action.payload.id;
            if (!id) return { ...state, activeShotId: null };

            const rawShot = state.shots.find(s => s.id === id);
            if (!rawShot) return state;
            const shot = sanitizeShot(rawShot);

            return {
                ...state,
                activeShotId: shot.id,
                backgroundUrl: shot.backgroundUrl,
                depthMapUrl: shot.depthMapUrl || null,
                depthMapHash: shot.depthMapHash || null,
                sourceBackgroundHash: shot.sourceBackgroundHash || null,
                tokens: sanitizeTokens(deduplicateTokens(smartClone(shot.tokens) || [])),
                annotations: sanitizeAnnotations(smartClone(shot.annotations) || []),
                referenceSlots: smartClone(shot.referenceSlots) || [],
                director: smartClone(shot.director) || smartClone(defaultDirector),
                floorPlane: shot.floorPlane || null,
                occupiedVolumes: smartClone(shot.occupiedVolumes) || [],
                regionEdit: smartClone(shot.regionEdit ?? DEFAULT_REGION_EDIT),
                selection: null,
                selectionType: null,
                latestCompositeSource: shot.latestCompositeSource,
                latestCompositeResultUrl: shot.latestCompositeResultUrl,
                ...(shot.latestCompositeResultUrl ? { resultImage: shot.latestCompositeResultUrl } : {})
            };
        }

        case 'SAVE_ACTIVE_SHOT': {
            if (!state.activeShotId) return state;
            const now = Date.now();
            const touch = action.payload?.touchUpdatedAt ?? true;

            const nextShots = state.shots.map(s => {
                if (s.id !== state.activeShotId) return s;
                return sanitizeShot({
                    ...s,
                    backgroundUrl: state.backgroundUrl,
                    depthMapUrl: state.depthMapUrl,
                    depthMapHash: state.depthMapHash,
                    sourceBackgroundHash: state.sourceBackgroundHash,
                    tokens: sanitizeTokens(deduplicateTokens(smartClone(state.tokens) || [])),
                    annotations: sanitizeAnnotations(smartClone(state.annotations) || []),
                    referenceSlots: smartClone(state.referenceSlots) || [],
                    director: smartClone(state.director),
                    floorPlane: state.floorPlane,
                    occupiedVolumes: smartClone(state.occupiedVolumes) || [],
                    regionEdit: smartClone(state.regionEdit),
                    updatedAt: touch ? now : s.updatedAt,
                });
            });

            return { ...state, shots: nextShots };
        }

        case 'UPDATE_SHOT_META': {
            return {
                ...state,
                shots: state.shots.map(s => {
                    if (s.id !== action.payload.id) return s;
                    
                    const updates = { ...action.payload.updates };
                    
                    if (updates.compositeHistory && updates.compositeHistory.length > 0) {
                        const history = [...updates.compositeHistory];
                        let foundActive = false;
                        
                        // Keep only the newest active entry if multiple exist
                        for (let i = history.length - 1; i >= 0; i--) {
                            if (history[i].isActive) {
                                if (!foundActive) {
                                    foundActive = true;
                                } else {
                                    history[i] = { ...history[i], isActive: false };
                                }
                            }
                        }
                        
                        // If none are active, mark the newest as active
                        if (!foundActive) {
                            history[history.length - 1] = { ...history[history.length - 1], isActive: true };
                        }
                        
                        updates.compositeHistory = history;
                    }

                    return {
                        ...s,
                        ...updates,
                        updatedAt: Date.now()
                    };
                })
            };
        }

        case 'SET_SHOT_FRAME': {
            const now = Date.now();
            const nextShots = state.shots.map(s => {
                if (s.id !== action.payload.id) return s;
                const updates = action.payload.which === 'start' ? { startFrameUrl: action.payload.url } : { endFrameUrl: action.payload.url };
                return { ...s, ...updates, updatedAt: now };
            });
            return { ...state, shots: nextShots };
        }

        case 'SET_TEMPLATE_NOTES':
            return {
                ...state,
                activeTemplateId: action.payload.activeTemplateId,
                templateNotes: action.payload.templateNotes
            };

        default:
            return state;
    }
};

// --- SELECTORS ---

export type ActorIdentityReferenceSet = {
    actorId: string;
    actorLabel?: string;
    primaryFaceAnchor?: string;
    angleFaceAnchors: string[];
    supportIdentityRefs: string[];
    wardrobeRefs: string[];
    biometricProfile?: string;
    identityPriority?: 'strict';
    identityLock?: BiometricIdentityLock;
};

export type ShotsActorOption = {
    actorId: string;
    actorLabel: string;
    referenceSlotId?: string;
    targetInAnchorScene?: string;
    isActiveInScene?: boolean;
};

const pickPrimaryReferenceSlotForActor = (referenceSlots: ReferenceSlot[], castId: string): ReferenceSlot | undefined => {
    const slots = referenceSlots
        .filter(s => s.castId === castId && s.active)
        .sort((a, b) => a.index - b.index);

    if (slots.length === 0) return undefined;
    return slots.find(s => s.name?.trim()) || slots.find(s => s.target?.trim()) || slots[0];
};

const resolveReferenceActorLabel = (
    slot: ReferenceSlot | undefined,
    castName: string | undefined,
    fallbackIndex: number
): string => {
    const alias = slot?.name?.trim();
    if (alias) return alias;

    const target = slot?.target?.trim();
    if (target) return target;

    if (slot?.index !== undefined) return `Reference ${slot.index}`;

    const normalizedCastName = castName?.trim();
    if (normalizedCastName) return normalizedCastName;

    return `Actor ${fallbackIndex}`;
};

export function getShotsActorOptionsForScene(state: AppState, sceneId: string): ShotsActorOption[] {
    let tokens = state.tokens || [];
    let referenceSlots = state.referenceSlots || [];
    
    if (sceneId && sceneId !== state.activeShotId && sceneId !== 'default') {
        const archived = state.shots?.find(s => s.id === sceneId);
        if (archived) {
            tokens = archived.tokens || [];
            referenceSlots = archived.referenceSlots || [];
        } else {
            return [];
        }
    }

    const activeCastIds = new Set(tokens.map(t => t.castId).filter(Boolean));

    const options: ShotsActorOption[] = [];
    const castMembers = state.cast || [];

    for (const actor of castMembers) {
        if (!actor) continue;

        const hasToken = activeCastIds.has(actor.id);
        const hasRefSlot = referenceSlots.some(s => s.castId === actor.id && s.active);

        // Rule: Only include if linked to the current scene
        if (!hasToken && !hasRefSlot) continue;

        const slot = pickPrimaryReferenceSlotForActor(referenceSlots, actor.id);
        const targetInAnchor = slot?.target || undefined;

        const parsedLabel = resolveReferenceActorLabel(slot, actor.name, options.length + 1);

        options.push({
            actorId: actor.id,
            actorLabel: parsedLabel,
            referenceSlotId: slot?.index?.toString(),
            targetInAnchorScene: targetInAnchor,
            isActiveInScene: hasToken || hasRefSlot
        });
    }

    return options.sort((a, b) => {
        if (a.isActiveInScene && !b.isActiveInScene) return -1;
        if (!a.isActiveInScene && b.isActiveInScene) return 1;
        return 0;
    });
}

export function getActorIdentityReferenceSetsForScene(state: AppState, sceneId: string): ActorIdentityReferenceSet[] {
    let tokens = state.tokens || [];
    let referenceSlots = state.referenceSlots || [];
    
    if (sceneId && sceneId !== state.activeShotId && sceneId !== 'default') {
        const archived = state.shots?.find(s => s.id === sceneId);
        if (archived) {
            tokens = archived.tokens || [];
            referenceSlots = archived.referenceSlots || [];
        } else {
            return [];
        }
    }

    const activeCastIds = new Set(tokens.map(t => t?.castId).filter(Boolean));
    // also include anyone strictly in reference array just in case they have no explicit token staged yet!
    referenceSlots.filter(s => s.active && s.castId).forEach(s => activeCastIds.add(s.castId!));
    
    const referenceSets: ActorIdentityReferenceSet[] = [];
    const castMembers = state.cast || [];
    
    for (const castId of Array.from(activeCastIds)) {
        const actor = castMembers.find(c => c?.id === castId);
        const slots = referenceSlots
            .filter(s => s?.castId === castId && s?.url && s?.active)
            .sort((a, b) => a.index - b.index);
        
        if (slots.length > 0) {
            let primaryFaceAnchor: string | undefined = undefined;
            const angleFaceAnchors: string[] = [];
            const supportIdentityRefs: string[] = [];
            const wardrobeRefs: string[] = [];
            
            const remainingSlots: string[] = [];
            
            // Heuristic sorting based on available metadata
            for (const s of slots) {
                const text = `${s.name || ''} ${s.analysis || ''} ${s.target || ''}`.toLowerCase();
                const isWardrobe = text.includes('wardrobe') || text.includes('outfit') || text.includes('clothes') || text.includes('style') || text.includes('costume') || text.includes('body');
                const isAngle = text.includes('profile') || text.includes('3/4') || text.includes('angle') || text.includes('side');
                
                if (isWardrobe) {
                    wardrobeRefs.push(s.url!);
                } else if (isAngle) {
                    angleFaceAnchors.push(s.url!);
                } else {
                    remainingSlots.push(s.url!);
                }
            }
            
            if (remainingSlots.length > 0) {
                primaryFaceAnchor = remainingSlots[0];
                supportIdentityRefs.push(...remainingSlots.slice(1));
            } else if (angleFaceAnchors.length > 0) {
                // Fallback: promote an angle anchor if no primary straight face exists
                primaryFaceAnchor = angleFaceAnchors.shift();
            }
            
            if (!primaryFaceAnchor) {
                console.warn(`[IdentityLock] Missing primary face anchor for actor ${actor?.name || castId}`);
            }

            const profileSlot = slots.find(s => s.analysis && s.analysis.trim());
            const identityReferenceViews = slots
                .filter(s => s.url && !wardrobeRefs.includes(s.url))
                .map(s => s.name?.trim() || s.target?.trim() || `reference_slot_${s.index}`);
            let actorIdentityLock = actor?.identityLock ?? (
                primaryFaceAnchor || angleFaceAnchors.length || supportIdentityRefs.length
                    ? createBiometricIdentityLock({
                        characterId: castId as string,
                        referenceViews: identityReferenceViews,
                        identityRangeText: `${actor?.name?.trim() || castId} uploaded actor reference stack`,
                        identityStrength: 100,
                        appliesTo: "staging generation, region replacement, multi-actor previews, validation, refinements, and export requests for this character",
                        faceDominant: false,
                        productionProfile: actor?.productionProfile
                    })
                    : undefined
            );
            if (actorIdentityLock && actor?.productionProfile) {
                actorIdentityLock = {
                    ...actorIdentityLock,
                    productionProfile: actor.productionProfile
                };
            }

            referenceSets.push({
                actorId: castId as string,
                // Keep generation identity labels stable to cast identity; alias labels are UI-only in shot selector.
                actorLabel: actor?.name?.trim() || resolveReferenceActorLabel(slots[0], actor?.name, referenceSets.length + 1),
                primaryFaceAnchor,
                angleFaceAnchors,
                supportIdentityRefs,
                wardrobeRefs,
                biometricProfile: profileSlot?.analysis,
                identityPriority: 'strict',
                identityLock: actorIdentityLock
            });
        }
    }
    
    return referenceSets;
}

export function getActorIdentityReferencesForScene(state: AppState, sceneId: string): ShotActorReferenceInput[] {
    const shots = state.shots || [];
    const shot = shots.find(s => s?.id === sceneId);
    if (!shot) return [];
    
    // The active actors are built from the reference slots that have a cast member matched in the shot's tokens.
    const tokens = shot.tokens || [];
    const activeCastIds = new Set(tokens.map(t => t?.castId).filter(Boolean));
    
    const references: ShotActorReferenceInput[] = [];
    const castMembers = state.cast || [];
    const referenceSlots = shot.referenceSlots || [];
    
    for (const castId of Array.from(activeCastIds)) {
        const actor = castMembers.find(c => c?.id === castId);
        // Find reference slots for this castId
        const slots = referenceSlots
            .filter(s => s?.castId === castId && s?.url && s?.active)
            .sort((a, b) => a.index - b.index);
        if (slots.length > 0) {
            references.push({
                actorId: castId,
                // Keep generation identity labels stable to cast identity; alias labels are UI-only in shot selector.
                actorLabel: actor?.name?.trim() || resolveReferenceActorLabel(slots[0], actor?.name, references.length + 1),
                referenceImageUrls: slots.map(s => s.url!),
                referenceStackId: `stack_for_${castId}`
            });
        }
    }
    
    return references;
}

export const getActiveShotActorReferencesForScene = getActorIdentityReferencesForScene;

// --- CONTEXT ---

export const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, initialState);

    const hydratedRef = useRef(false);
    const persistTimerRef = useRef<number | null>(null);

    useEffect(() => {
        clearVolatileWorkspaceStorage();
        dispatch({ type: 'RESET_VOLATILE_WORKSPACE_STATE' });
        void clearVolatileWorkspaceDataStores();
    }, []);

    useEffect(() => {
        let cancelled = false;
        let settled = false;

        const fallbackTimer = window.setTimeout(() => {
            if (cancelled || settled) return;
            settled = true;
            dispatch({ type: 'SET_WELCOME_INSTALL_CONTEXT', payload: { installId: null } });
        }, WELCOME_INSTALL_CONTEXT_TIMEOUT_MS);

        const resolveWelcomeInstallContext = async () => {
            if (!window.electronAPI?.getAppInstallInfo) {
                if (settled) return;
                settled = true;
                window.clearTimeout(fallbackTimer);
                dispatch({ type: 'SET_WELCOME_INSTALL_CONTEXT', payload: { installId: null } });
                return;
            }

            try {
                const installInfo = await window.electronAPI.getAppInstallInfo();
                if (!cancelled && !settled) {
                    settled = true;
                    window.clearTimeout(fallbackTimer);
                    dispatch({
                        type: 'SET_WELCOME_INSTALL_CONTEXT',
                        payload: { installId: installInfo.installId || null }
                    });
                }
            } catch (error) {
                console.warn('Failed to resolve welcome install context', error);
                if (!cancelled && !settled) {
                    settled = true;
                    window.clearTimeout(fallbackTimer);
                    dispatch({ type: 'SET_WELCOME_INSTALL_CONTEXT', payload: { installId: null } });
                }
            }
        };

        resolveWelcomeInstallContext();

        return () => {
            cancelled = true;
            window.clearTimeout(fallbackTimer);
        };
    }, []);

    // --- EFFECT 1: Restore / Migration ---
    useEffect(() => {
        let cancelled = false;

        const migrateOrLoad = async <T,>(
            key: string,
            sanitize?: (v: T) => T
        ): Promise<T | null> => {
            // 1) try IndexedDB
            const fromDb = await StorageService.load<T | null>(key, null);
            if (fromDb != null) {
                // ✅ cleanup legacy localStorage regardless
                if (localStorage.getItem(key) != null) localStorage.removeItem(key);
                return fromDb;
            }

            // 2) migrate from localStorage if present
            const fromLsRaw = localStorage.getItem(key);
            if (!fromLsRaw) return null;

            try {
                const parsed = JSON.parse(fromLsRaw) as T;
                const value = sanitize ? sanitize(parsed) : parsed;
                await StorageService.save(key, value);
                localStorage.removeItem(key);
                return value as T;
            } catch {
                localStorage.removeItem(key);
                return null;
            }
        };

        void migrateOrLoad;

        const restore = async () => {
            try {
                const [rawActors, rawWardrobe, rawProps] = await Promise.all([
                    StorageService.load<CastMember[]>('nano_actors', []),
                    StorageService.load<WardrobeItem[]>('nano_wardrobe', []),
                    StorageService.load<PropItem[]>('nano_props', []),
                ]);

                if (cancelled) return;

                const actors = await Promise.all(rawActors.map(async (actor) => {
                    try {
                        let resolvedPath = actor.localPath;
                        const savePath = localStorage.getItem('nano_save_path');
                        
                        if (!resolvedPath && actor.filename && isNativeParams() && savePath) {
                            if (actor.filename.startsWith('Library/') || actor.filename.startsWith('Library\\')) {
                                resolvedPath = await nativeJoinPath(savePath, actor.filename);
                            } else {
                                resolvedPath = await nativeJoinPath(savePath, 'Actors', actor.filename);
                            }
                        }

                        let finalDisplayUrl: string | null = null;

                        // Native mode: rebuild thumbnail directly from disk into a data URL
                        if (isNativeParams() && resolvedPath && window.electronAPI?.readFile) {
                            try {
                                const base64 = await window.electronAPI.readFile(resolvedPath);
                                if (base64) {
                                    finalDisplayUrl = `data:image/png;base64,${base64}`;
                                }
                            } catch (readErr) {
                                console.warn(`[AppContext] Native thumbnail read failed for actor ${actor.id}`, readErr);
                            }
                        }

                        // Web / fallback path
                        if (!finalDisplayUrl) {
                            const cleanPreviewUrl =
                                actor.previewUrl && actor.previewUrl.startsWith('blob:') ? undefined : actor.previewUrl;
                            const cleanUrl =
                                actor.url && actor.url.startsWith('blob:') ? undefined : actor.url;

                            finalDisplayUrl = await resolveDisplayUrl({
                                localPath: resolvedPath,
                                sourcePreviewUrl: actor.sourceUrl,
                                previewUrl: cleanPreviewUrl || cleanUrl
                            });
                        }

                        const safeUrl =
                            finalDisplayUrl ||
                            (actor.url && !actor.url.startsWith('blob:') ? actor.url : '') ||
                            '';

                        let productionProfile: ProductionActorProfile | undefined = actor.productionProfile;
                        if (isNativeParams() && resolvedPath && window.electronAPI?.readTextFile && window.electronAPI?.exists) {
                            const jsonPath = resolvedPath.replace(/\.png$/i, '.json');
                            try {
                                if (await window.electronAPI.exists(jsonPath)) {
                                    const jsonText = await window.electronAPI.readTextFile(jsonPath);
                                    if (jsonText) {
                                        const parsed = JSON.parse(jsonText);
                                        if (parsed && typeof parsed === 'object') {
                                            productionProfile = parsed;
                                            console.debug('[ProductionActor Load]', { 
                                                actorId: parsed.id, 
                                                hasJsonSidecar: true, 
                                                isIdentityLocked: true 
                                            });
                                        }
                                    }
                                }
                            } catch (jsonErr) {
                                console.warn(`[AppContext] Failed to read/parse sidecar JSON for actor ${actor.id}`, jsonErr);
                            }
                        }

                        return {
                            ...actor,
                            localPath: resolvedPath,
                            previewUrl: undefined,
                            url: safeUrl,
                            productionProfile: productionProfile || actor.productionProfile
                        };
                    } catch (e) {
                        console.warn(`[AppContext] Failed to hydrate previewUrl for actor ${actor.id}`, e);
                        return actor;
                    }
                }));

                if (actors.length > 0) dispatch({ type: 'SET_ACTOR_LIBRARY', payload: actors });

                const hydratedWardrobe = await Promise.all(rawWardrobe.map(async (item) => {
                    try {
                        let resolvedPath = item.localPath;
                        const savePath = localStorage.getItem('nano_save_path');
                        
                        if (!resolvedPath && item.filename && isNativeParams() && savePath) {
                            resolvedPath = await nativeJoinPath(savePath, 'wardrobe', item.filename);
                        }
                        
                        if (isNativeParams() && resolvedPath && window.electronAPI?.readFile) {
                            try {
                                const base64 = await window.electronAPI.readFile(resolvedPath);
                                if (base64) {
                                    return { ...item, localPath: resolvedPath, url: `data:image/png;base64,${base64}` };
                                }
                            } catch {}
                        }
                        
                        const finalDisplayUrl = await resolveDisplayUrl({
                            localPath: resolvedPath,
                            sourcePreviewUrl: item.sourceUrl,
                            previewUrl: item.url
                        });
                        return { ...item, localPath: resolvedPath, url: finalDisplayUrl || item.url };
                    } catch {
                        return item;
                    }
                }));

                const hydratedProps = await Promise.all(rawProps.map(async (item) => {
                    try {
                        let resolvedPath = item.localPath;
                        const savePath = localStorage.getItem('nano_save_path');
                        
                        if (!resolvedPath && item.filename && isNativeParams() && savePath) {
                            resolvedPath = await nativeJoinPath(savePath, 'props', item.filename);
                        }
                        
                        if (isNativeParams() && resolvedPath && window.electronAPI?.readFile) {
                            try {
                                const base64 = await window.electronAPI.readFile(resolvedPath);
                                if (base64) {
                                    return { ...item, localPath: resolvedPath, url: `data:image/png;base64,${base64}` };
                                }
                            } catch {}
                        }
                        
                        const finalDisplayUrl = await resolveDisplayUrl({
                            localPath: resolvedPath,
                            sourcePreviewUrl: item.sourceUrl,
                            previewUrl: item.url
                        });
                        return { ...item, localPath: resolvedPath, url: finalDisplayUrl || item.url };
                    } catch {
                        return item;
                    }
                }));

                if (hydratedWardrobe.length > 0) dispatch({ type: 'SET_WARDROBE_ITEMS', payload: hydratedWardrobe });
                if (hydratedProps.length > 0) dispatch({ type: 'SET_PROP_ITEMS', payload: hydratedProps });

                // Load Library Assets instead
                hydratedRef.current = true;
            } catch (e) {
                console.error('Restore failed', e);
                if (!cancelled) hydratedRef.current = true;
            }
        };
        const restoreTimer = window.setTimeout(() => {
            void restore();
        }, POST_LAUNCH_HYDRATION_DELAY_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(restoreTimer);
        };
    }, []);

    // --- EFFECT 2: Persistence (Tokens & Annotations) - Debounced ---
    useEffect(() => {
        if (!hydratedRef.current) return;

        if (persistTimerRef.current) {
            window.clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = window.setTimeout(async () => {
            try {
                await StorageService.save('nano_tokens', sanitizeTokens(state.tokens, { stripDataUrl: true }));
                await StorageService.save('nano_annotations', sanitizeAnnotations(state.annotations));
            } catch (e) {
                console.error('Token/Annotation persistence failed', e);
            }
        }, 400);

        return () => {
            if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
        };
    }, [state.tokens, state.annotations]);

    // --- EFFECT 3: Persistence (Small Config / localStorage) ---
    useEffect(() => {
        try {
            localStorage.setItem('nano_api_key', state.apiKey);
            localStorage.setItem('nano_model', state.model);
            localStorage.setItem('nano_help_hints', JSON.stringify(state.showHelpHints));
            localStorage.setItem('nano_image_resolution', JSON.stringify(state.imageResolution));
            localStorage.setItem('nano_enable_image_thinking', JSON.stringify(state.enableImageThinking));
            localStorage.setItem('nano_enable_google_grounding', JSON.stringify(state.enableGoogleGrounding));
            localStorage.setItem('nano_biometric_sound_enabled', JSON.stringify(state.biometricSoundEnabled));
            localStorage.setItem('nano_biometric_sound_volume', JSON.stringify(state.biometricSoundVolume));
            localStorage.setItem('nano_billing_mode', JSON.stringify(state.billingMode));
        } catch (e) {
            console.warn('Config persistence failed', e);
        }
    }, [
        state.apiKey,
        state.model,
        state.showHelpHints,
        state.imageResolution,
        state.enableImageThinking,
        state.enableGoogleGrounding,
        state.biometricSoundEnabled,
        state.biometricSoundVolume,
        state.billingMode
    ]);

    // --- EFFECT 3.5: Debounced UI State Persistence ---
    useEffect(() => {
        if (!hydratedRef.current) return;
        const timer = setTimeout(() => {
            try {
                // propStudioState is persisted synchronously in the reducer to strip transient session fields
                localStorage.setItem('nano_wardrobe_state', JSON.stringify(state.wardrobeState));
            } catch (e) {
                console.warn('UI state persistence failed', e);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [state.wardrobeState]);

    // --- EFFECT 4: Persistence (Large Collections / StorageService) ---
    useEffect(() => {
        if (!hydratedRef.current) return;

        const timer = setTimeout(() => {
            const persistCollections = async () => {
                try {
                    // Sanitize shot sessions to drop heavy base64 strings if native path exists
                    const sanitizedShotSessions: Record<string, ShotSession> = {};
                    for (const [sceneId, session] of Object.entries(state.shotSessionsBySceneId)) {
                        const variants = session.variants.map((v) => {
                            let { previewUrl, finalUrl } = v;
                            if (v.localPreviewPath && previewUrl && previewUrl.startsWith('data:')) {
                                previewUrl = undefined;
                            }
                            if (v.localFinalPath && finalUrl && finalUrl.startsWith('data:')) {
                                finalUrl = undefined;
                            }
                            return { ...v, previewUrl, finalUrl };
                        });
                        sanitizedShotSessions[sceneId] = { ...session, variants };
                    }

                    // Sanitize Actors array
                    const sanitizedActors = state.actorLibrary.map(actor => {
                        let { url, previewUrl } = actor;
                        if (actor.localPath || actor.filename) {
                            if (url && url.startsWith('data:')) url = '';
                            if (previewUrl && previewUrl.startsWith('data:')) previewUrl = undefined;
                        }
                        
                        // Treat object blob URLs as session-ephemeral only
                        if (url && url.startsWith('blob:')) url = '';
                        if (previewUrl && previewUrl.startsWith('blob:')) previewUrl = undefined;

                        return { ...actor, url, previewUrl };
                    });

                    const sanitizedWardrobe = state.wardrobeItems.map(item => {
                        let { url } = item;
                        if (item.localPath || item.filename) {
                            if (url && url.startsWith('data:')) url = '';
                        }
                        return { ...item, url };
                    });

                    const sanitizedProps = state.propItems.map(item => {
                        let { url } = item;
                        if (item.localPath || item.filename) {
                            if (url && url.startsWith('data:')) url = '';
                        }
                        return { ...item, url };
                    });

                    await Promise.all([
                        StorageService.save('nano_wardrobe', sanitizedWardrobe),
                        StorageService.save('nano_actors', sanitizedActors),
                        StorageService.save('nano_props', sanitizedProps),
                        StorageService.save('nano_shots', sanitizeShots(state.shots)),
                        StorageService.save('nano_shot_sessions', sanitizedShotSessions),
                    ]);
                } catch (e) {
                    console.error('Collections persistence failed', e);
                }
            };
            persistCollections();
        }, 5000); // 5-second debounce

        return () => clearTimeout(timer);
    }, [state.wardrobeItems, state.actorLibrary, state.propItems, state.shots, state.shotSessionsBySceneId]);

    // --- EFFECT 5: Blob URL Garbage Collection ---
    const activeBlobsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const extractBlobs = (obj: unknown, blobs: Set<string>) => {
            if (!obj) return;
            if (typeof obj === 'string') {
                if (obj.startsWith('blob:')) blobs.add(obj);
            } else if (Array.isArray(obj)) {
                obj.forEach(item => extractBlobs(item, blobs));
            } else if (typeof obj === 'object') {
                Object.values(obj as Record<string, unknown>).forEach(val => extractBlobs(val, blobs));
            }
        };

        const currentBlobs = new Set<string>();
        extractBlobs(state.cast, currentBlobs);
        extractBlobs(state.actorLibrary, currentBlobs);
        extractBlobs(state.wardrobeItems, currentBlobs);
        extractBlobs(state.propItems, currentBlobs);
        extractBlobs(state.lastCastedImage, currentBlobs);
        extractBlobs(state.lastCastedMask, currentBlobs);
        extractBlobs(state.inspectImage, currentBlobs);
        extractBlobs(state.inspectMask, currentBlobs);
        extractBlobs(state.wardrobeState, currentBlobs);
        extractBlobs(state.propStudioState, currentBlobs);
        extractBlobs(state.resultImage, currentBlobs);
        extractBlobs(state.tokens, currentBlobs);

        activeBlobsRef.current.forEach(blobUrl => {
            if (!currentBlobs.has(blobUrl)) {
                URL.revokeObjectURL(blobUrl);
            }
        });

        activeBlobsRef.current = currentBlobs;
    }, [
        state.cast, state.actorLibrary, state.wardrobeItems, state.propItems,
        state.lastCastedImage, state.lastCastedMask, state.inspectImage, state.inspectMask,
        state.wardrobeState, state.propStudioState, state.resultImage, state.tokens
    ]);

    useEffect(() => {
        return () => {
            activeBlobsRef.current.forEach(blobUrl => URL.revokeObjectURL(blobUrl));
        };
    }, []);

    return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useAppContext must be used within an AppProvider');
    return context;
};

export const getEffectiveResultAnchorForScene = (state: AppState, sceneId: string): SceneResultAnchor | undefined => {
    const shot = state.shots.find(s => s.id === sceneId);
    if (!shot) return undefined;
    if (shot.promotedResultAnchor) {
        return shot.promotedResultAnchor;
    }
    if (shot.latestCompositeResultUrl) {
        return { kind: 'generated_result', imageUrl: shot.latestCompositeResultUrl };
    }
    return undefined;
};


