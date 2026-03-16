import { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { StorageService } from '../services/StorageService';
import { computeDepthScore } from '../utils/spatialHelpers';

import type { VeoFivePartDraft, VeoAudioBlock, VeoTimestampBeat } from '../promptEngine/veoFivePart';

export const APP_SCHEMA_VERSION = 5; // bump when persisted state shape changes
// --- SHARED TYPES ---

export type ViewMode =
    | 'forge'
    | 'casting'
    | 'wardrobe'
    | 'props'
    | 'staging'
    | 'veo'
    | 'production'
    | 'settings'
    | 'blocking'
    | 'nano_cast'
    | 'portrait';

export interface WardrobeItem {
    id: string;
    url: string;
    name: string;
    prompt: string;
    category?: string;
    timestamp: number;
}

export interface PropItem {
    id: string;
    url: string;
    name: string;
    prompt: string;
    category?: string;
    timestamp: number;
}

export interface WhitelistProfile {
    identity: string;
    wardrobe: string;
    accessories: string;
    style: string;
}

export interface CastMember {
    id: string;
    url: string;
    tag: 'front' | 'side' | 'back' | '3/4' | 'detail';
    name: string;
    filename?: string;
    profile?: WhitelistProfile;
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
    name?: string;
    analysis?: string;
    target?: string;
    active: boolean;
    status: RefSlotStatus;
    castId?: string;
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

export interface RegionEditState {
    isMaskMode: boolean;
    mode: RegionEditMode;
    brushSize: number;
    brushSoftness: number;
    activeLayerId: RegionLayerId;
    layers: RegionEditLayer[];

    // Protection mask: white = protected (do not edit)
    protectEnabled: boolean;
    protectMaskDataUrl: string | null;
}

export const smartClone = <T,>(v: T): T => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
        return v.map(smartClone) as any;
    }
    // OOM Guard: Prevent deep cloning native binary objects which freezes the V8 thread
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
        return v;
    }
    const cloned = {} as any;
    for (const key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key)) {
            const val = (v as any)[key];
            // Critical OOM Guard: Pass massive base64 URIs by reference instead of deep copying into V8 heap
            if (typeof val === 'string' && val.length > 500 && (key.toLowerCase().includes('url') || val.startsWith('data:'))) {
                cloned[key] = val;
            } else {
                cloned[key] = smartClone(val);
            }
        }
    }
    return cloned;
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

export interface AppState {
    apiKey: string;
    model: 'imagen-4.0-generate-001' | 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview';
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
    inspectMask: string | null;
    actorLibrary: CastMember[];
    propItems: PropItem[];
    customCovers: Record<string, string>; // Studio ID -> Data URI/Blob URL
    isDepthProcessing: boolean;

    regionEdit: RegionEditState;

    historyPast: HistorySnapshot[];
    historyFuture: HistorySnapshot[];


    shots: Shot[];
    activeShotId: string | null;
    isStoryboardEnabled: boolean;
    showHelpHints: boolean;
    imageResolution: '1K' | '2K' | '4K';
    enableImageThinking: boolean;
    enableGoogleGrounding: boolean;

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
    // New persistent fields for Virtual Try-On
    tryOnOutputMode: 'front' | 'turnaround';
    tryOnViews: Record<'front' | 'back' | 'left' | 'right', string> | null;
    tryOnSheetFB: string | null;
    tryOnSheetLR: string | null;
    activeTryOnView: 'front' | 'back' | 'left' | 'right' | 'sheetFB' | 'sheetLR';
}

export interface PropAccessoryState {
    activeTab: 'designer' | 'library';
    designerPrompt: string;
    designerImage: string | null;
    selectedProp: PropItem | null;
    selectedCharacter: CastMember | null;
    appliedImage: string | null;
    applyNote: string;
    applyMask: string | null;
    removeApplyBg: boolean;
    applyAiMaskActive: boolean;
    applyTolerance: number;
    applySpillSuppression: number;
    applyMaskSoftening: number;
    applyInvertBg: boolean;
    matteErosion: number;
    processedApplyUrl: string | null;
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
    tryOnOutputMode: 'front',
    tryOnViews: null,
    tryOnSheetFB: null,
    tryOnSheetLR: null,
    activeTryOnView: 'front'
};

const DEFAULT_PROP_STUDIO_STATE: PropAccessoryState = {
    activeTab: 'designer',
    designerPrompt: '',
    designerImage: null,
    selectedProp: null,
    selectedCharacter: null,
    appliedImage: null,
    applyNote: '',
    applyMask: null,
    removeApplyBg: false,
    applyAiMaskActive: true,
    applyTolerance: 15,
    applySpillSuppression: 100,
    applyMaskSoftening: 1.5,
    applyInvertBg: false,
    matteErosion: 1,
    processedApplyUrl: null
};

export type Action =
    | { type: 'SET_VIEW'; payload: ViewMode }
    | { type: 'SET_API_KEY'; payload: string }
    | { type: 'SET_MODEL'; payload: AppState['model'] }
    | { type: 'ADD_CAST'; payload: CastMember }
    | { type: 'REMOVE_CAST'; payload: string }
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
    | { type: 'SET_CUSTOM_COVERS'; payload: Record<string, string> }
    | { type: 'SET_STAGE_PANEL_STATE'; payload: { id: string; isOpen: boolean } }
    | { type: 'SET_WARDROBE_STATE'; payload: Partial<WardrobeState> }
    | { type: 'SET_PROP_STUDIO_STATE'; payload: Partial<PropAccessoryState> }
    | { type: 'SET_DEPTH_PROCESSING'; payload: boolean }
    | { type: 'SET_IMAGE_RESOLUTION'; payload: '1K' | '2K' | '4K' }
    | { type: 'SET_ENABLE_IMAGE_THINKING'; payload: boolean }
    | { type: 'SET_ENABLE_GOOGLE_GROUNDING'; payload: boolean }
    | { type: 'SET_TOKENS'; payload: StageToken[] }
    | { type: 'SET_ANNOTATIONS'; payload: StageAnnotation[] }
    | { type: 'SYNC_SPATIAL_DESCRIPTORS' }
    | { type: 'DUPLICATE_TOKEN'; payload: { id: string } }
    | { type: 'SET_GLOBAL_VEO_DRAFT'; payload: VeoFivePartDraft & { audio?: VeoAudioBlock, concept?: string, negativePrompt?: string } | undefined }
    | { type: 'SET_TEMPLATE_NOTES'; payload: { activeTemplateId?: string; templateNotes?: string } };

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
            return { ...(fallback as any), ...(parsed as any) } as T;
        }

        // Primitives / fallback=null cases: return parsed as-is
        return parsed as T;
    } catch {
        return fallback;
    }
};

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

const shouldRecordHistory = (type: Action['type']) => {
    const set = new Set<Action['type']>([
        'SET_BG',
        'ADD_TOKEN', 'UPDATE_TOKEN', 'REMOVE_TOKEN',
        'ADD_ANNOTATION', 'UPDATE_ANNOTATION', 'REMOVE_ANNOTATION',
        'UPDATE_REF_SLOT', 'CLEAR_REF_SLOTS',
        'SET_DIRECTOR',
        'CLEAR_STAGE',
        'SET_REGION_EDIT', 'SET_REGION_ACTIVE_LAYER', 'UPDATE_REGION_LAYER', 'CLEAR_REGION_LAYER_MASK', 'CLEAR_ALL_REGION_MASKS',
        'SET_SHOTS', 'ADD_SHOT_FROM_STAGE', 'DUPLICATE_SHOT', 'REMOVE_SHOT', 'SET_ACTIVE_SHOT', 'SAVE_ACTIVE_SHOT', 'UPDATE_SHOT_META', 'SET_SHOT_FRAME',
        'SET_STORYBOARD_SOURCE', 'SET_STORYBOARD_END_SOURCE', 'SET_STORYBOARD_GENERATIONS', 'UPDATE_STORYBOARD_GENERATION',
        'SET_RESULT_IMAGE', 'SET_COMPOSITE_METADATA'
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
    const valid: AppState['model'][] = [
        'imagen-4.0-generate-001',
        'gemini-2.5-flash-image',
        'gemini-3.1-flash-image-preview',
    ];
    if (saved && valid.includes(saved as any)) return saved as AppState['model'];
    return 'gemini-3.1-flash-image-preview';
};

const DEFAULT_REGION_EDIT: RegionEditState = {
    isMaskMode: false,
    mode: 'paint',
    brushSize: 40,
    brushSoftness: 0.35,
    activeLayerId: 'A',
    protectEnabled: false,
    protectMaskDataUrl: null,
    layers: [
        { id: 'A', name: 'Mask A', enabled: true, maskDataUrl: null, prompt: '', lastOutputUrl: null, status: 'idle', lastError: null },
        { id: 'B', name: 'Mask B', enabled: false, maskDataUrl: null, prompt: '', lastOutputUrl: null, status: 'idle', lastError: null },
        { id: 'C', name: 'Mask C', enabled: false, maskDataUrl: null, prompt: '', lastOutputUrl: null, status: 'idle', lastError: null },
    ],
};

export const initialState: AppState = {
    apiKey: localStorage.getItem('nano_api_key') || '',
    model: getInitialModel(),
    view: 'casting',
    cast: [],
    tokens: [],
    annotations: [],
    referenceSlots: defaultRefSlots,
    director: loadJson<DirectorSettings>('nano_director_v3', defaultDirector),
    selection: null,
    selectionType: null,
    backgroundUrl: localStorage.getItem('nano_bg_url') || null,
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
    depthMapUrl: localStorage.getItem('nano_depth_url') || null,
    depthMapHash: localStorage.getItem('nano_depth_hash') || null,
    sourceBackgroundHash: localStorage.getItem('nano_source_hash') || null,
    imageResolution: loadJson<'1K' | '2K' | '4K'>('nano_image_resolution', '2K'),
    enableImageThinking: localStorage.getItem('nano_enable_image_thinking') !== 'false',
    enableGoogleGrounding: localStorage.getItem('nano_enable_google_grounding') === 'true' ? true : false,
    floorPlane: loadJson<FloorPlane | null>('nano_floor_plane', null),
    occupiedVolumes: loadJson<OccupiedVolume[]>('nano_occupied_volumes', []),
    isDepthProcessing: false,

    regionEdit: smartClone(DEFAULT_REGION_EDIT),


    historyPast: [],
    historyFuture: [],

    shots: [],
    activeShotId: localStorage.getItem('nano_active_shot_id') || null,
    isStoryboardEnabled: loadJson<boolean>('nano_storyboard_enabled', false), // Persistent setting
    showHelpHints: loadJson<boolean>('nano_help_hints', true),
    stagePanelState: {
        'ref_stacks': true,
        'region_edit': true,
        'layers': true,
        'actor_library': true,
    },

    // WARDROBE PERSISTENCE
    wardrobeState: loadJson<WardrobeState>('nano_wardrobe_state', DEFAULT_WARDROBE_STATE),

    // PROP STUDIO PERSISTENCE
    propStudioState: loadJson<PropAccessoryState>('nano_prop_studio_state', DEFAULT_PROP_STUDIO_STATE),

    sessionName: null,
    sessionFilePath: null,
};

// --- DATA SANITIZATION ---

function sanitizeTokens(tokens: StageToken[]): StageToken[] {
    return tokens.map(t => ({
        ...t,
        // Ensure we don't store heavy base64 strings in the persistence layer
        url: typeof t.url === 'string' && t.url.startsWith('data:') ? '' : t.url,
    }));
}

function sanitizeAnnotations(ann: StageAnnotation[]): StageAnnotation[] {
    return ann.map(a => ({
        ...a,
    }));
}

function sanitizeShots(shots: Shot[]): Shot[] {
    return shots.map(s => ({
        ...s,
        tokens: sanitizeTokens(s.tokens),
        annotations: sanitizeAnnotations(s.annotations),
    }));
}

// --- REDUCER ---

export const reducer = (state: AppState, action: Action): AppState => {
    // Auto-record history for stage-impacting actions
    if (action.type !== 'UNDO' && action.type !== 'REDO' && shouldRecordHistory(action.type)) {
        const past = [...(state.historyPast || []), snapshotOf(state)].slice(-MAX_HISTORY);
        state = { ...state, historyPast: past, historyFuture: [] };
    }

    switch (action.type) {

        case 'UNDO': {
            if (!state.historyPast || state.historyPast.length === 0) return state;
            const past = [...state.historyPast];
            const snap = past.pop()!;
            const future = [snapshotOf(state), ...(state.historyFuture || [])].slice(0, MAX_HISTORY);
            return applySnapshot({ ...state, historyPast: past, historyFuture: future }, snap);
        }
        case 'REDO': {
            if (!state.historyFuture || state.historyFuture.length === 0) return state;
            const future = [...state.historyFuture];
            const snap = future.shift()!;
            const past = [...(state.historyPast || []), snapshotOf(state)].slice(-MAX_HISTORY);
            return applySnapshot({ ...state, historyPast: past, historyFuture: future }, snap);
        }
        case 'SET_VIEW':
            return { ...state, view: action.payload };
        case 'SET_API_KEY':
            return { ...state, apiKey: action.payload };
        case 'SET_MODEL':
            return { ...state, model: action.payload };

        case 'ADD_CAST':
            return { ...state, cast: [...state.cast, action.payload] };
        case 'UPDATE_CAST':
            return { ...state, cast: state.cast.map(c => (c.id === action.payload.id ? { ...c, ...action.payload } : c)) };
        case 'REMOVE_CAST': {
            const nextCast = state.cast.filter(c => c.id !== action.payload);
            const nextTokens = state.tokens.filter(t => t.castId !== action.payload);
            const nextSelection = state.selection && !nextTokens.find(t => t.id === state.selection) ? null : state.selection;
            return { ...state, cast: nextCast, tokens: nextTokens, selection: nextSelection };
        }

        case 'ADD_TOKEN': {
            // Safety: Prevent adding a token that already exists in the array (ID check)
            if (state.tokens.some(t => t.id === action.payload.id)) return state;
            return { ...state, tokens: [...state.tokens, action.payload] };
        }
        case 'UPDATE_TOKEN':
            return { ...state, tokens: state.tokens.map(t => (t.id === action.payload.id ? { ...t, ...action.payload } : t)) };
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
                x: src.x + 20,
                y: src.y + 20,
                zIndex: Math.max(...state.tokens.map(t => t.zIndex), 0) + 1
            };
            return {
                ...state,
                tokens: [...state.tokens, copy],
                selection: copy.id,
                selectionType: 'token'
            };
        }

        case 'ADD_ANNOTATION':
            return { ...state, annotations: [...state.annotations, action.payload] };
        case 'UPDATE_ANNOTATION':
            return { ...state, annotations: state.annotations.map(a => (a.id === action.payload.id ? { ...a, ...action.payload } : a)) };
        case 'SET_TOKENS':
            return { ...state, tokens: deduplicateTokens(action.payload) };

        case 'SET_ANNOTATIONS':
            return { ...state, annotations: action.payload };

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
            localStorage.setItem('nano_prop_studio_state', JSON.stringify(nextState));
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
                tokens: [],
                annotations: [],
                backgroundUrl: null,
                depthMapUrl: null,
                depthMapHash: null,
                sourceBackgroundHash: null,
                imageResolution: '1K' as const, // Reset to default
                enableImageThinking: false, // Reset to default
                floorPlane: null,
                occupiedVolumes: [],
                selection: null,
                selectionType: null,
                storyboardSource: null,
                storyboardEndSource: null,
                storyboardGenerations: [],
                lastCastedImage: null,
                lastCastedPrompt: '',
                lastCastedMask: null,
                regionEdit: smartClone(DEFAULT_REGION_EDIT),
                director: smartClone(defaultDirector),
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
                        director: smartClone(defaultDirector),
                        updatedAt: Date.now(),
                    };
                });
            }

            return { ...nextState, shots: nextShots };
        }

        case 'SYNC_SPATIAL_DESCRIPTORS': {
            const STAGE_H = 540;

            // 1. Recompute depthScore for all actors
            // Using ONLY: scale, y, anchorLayer (Authority #1 & #2)
            const withScores = state.tokens.map(t => ({
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
            const nextTokens = state.tokens.map(t => {
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

        case 'SET_BG':
            return { ...state, backgroundUrl: action.payload };
        case 'SET_DEPTH_MAP': {
            const { url, hash, sourceHash } = typeof action.payload === 'string' || action.payload === null
                ? { url: action.payload, hash: null, sourceHash: null }
                : action.payload;
            // Invalidate floor plane when depth map changes
            return { ...state, depthMapUrl: url, depthMapHash: hash || null, sourceBackgroundHash: sourceHash || null, floorPlane: null };
        }
        case 'SET_FLOOR_PLANE':
            return { ...state, floorPlane: action.payload };
        case 'SET_OCCUPIED_VOLUMES':
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
            // Clear global progress when processing stops
            return {
                ...state,
                isProcessing: action.payload,
                globalProgress: action.payload ? state.globalProgress : undefined,
                sessionName: action.payload ? state.sessionName : null,
                sessionFilePath: action.payload ? state.sessionFilePath : null,
            };
        case 'SET_GLOBAL_PROGRESS':
            return { ...state, globalProgress: action.payload || undefined };
        case 'SET_DEPTH_PROCESSING':
            return { ...state, isDepthProcessing: action.payload };
        case 'SET_GLOBAL_VEO_DRAFT':
            return { ...state, veoPromptDraft: action.payload };
        case 'ADD_LOG':
            return { ...state, logs: [...state.logs, { ...action.payload, id: Math.random().toString(), timestamp: new Date() }].slice(-50) };
        case 'DISCARD_SESSION': {
            return {
                ...state,
                tokens: [],
                annotations: [],
                shots: [],
                activeShotId: null,
                backgroundUrl: null,
                depthMapUrl: null,
                depthMapHash: null,
                sourceBackgroundHash: null,
                floorPlane: null,
                occupiedVolumes: [],
                selection: null,
                selectionType: null,
                storyboardGenerations: [],
                wardrobeItems: [],
                propItems: [],
                veoPromptDraft: undefined,
                historyPast: [],
                historyFuture: [],
                resultImage: null,
                inspectImage: null,
                inspectMask: null,
                regionEdit: smartClone(DEFAULT_REGION_EDIT)
            };
        }
        case 'SET_SESSION_INFO':
            return { ...state, sessionName: action.payload.name, sessionFilePath: action.payload.path };
        case 'LOAD_SESSION_STATE':
            return { ...state, ...action.payload };
        case 'SET_SAVE_DIRECTORY':
            return { ...state, saveDirectoryHandle: action.payload };
        case 'SET_IMAGE_RESOLUTION':
            return { ...state, imageResolution: action.payload };
        case 'SET_ENABLE_IMAGE_THINKING':
            return { ...state, enableImageThinking: action.payload };
        case 'SET_ENABLE_GOOGLE_GROUNDING':
            return { ...state, enableGoogleGrounding: action.payload };
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
        case 'SET_ACTOR_LIBRARY':
            return { ...state, actorLibrary: action.payload };

        case 'ADD_PROP_ITEM':
            return { ...state, propItems: [...state.propItems, action.payload] };
        case 'REMOVE_PROP_ITEM':
            return { ...state, propItems: state.propItems.filter(item => item.id !== action.payload) };
        case 'SET_PROP_ITEMS':
            return { ...state, propItems: action.payload };

        case 'SET_CUSTOM_COVERS':
            console.log(`[AppContext] SET_CUSTOM_COVERS dispatched. Keys: ${Object.keys(action.payload).join(', ')}`);
            return { ...state, customCovers: action.payload };

        case 'SET_STAGE_PANEL_STATE':
            return {
                ...state,
                stagePanelState: {
                    ...state.stagePanelState,
                    [action.payload.id]: action.payload.isOpen
                }
            }

        case 'SET_WARDROBE_STATE':
            return { ...state, wardrobeState: { ...state.wardrobeState, ...action.payload } };

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
        case 'SET_SHOTS':
            return { ...state, shots: action.payload };

        case 'ADD_SHOT_FROM_STAGE': {
            const now = Date.now();
            const nextId = `shot-${now}-${Math.random().toString(16).slice(2)}`;
            const name = action.payload?.name?.trim() || `Shot ${state.shots.length + 1}`;

            const newShot: Shot = {
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
            };

            return { ...state, shots: [...state.shots, newShot], activeShotId: newShot.id };
        }

        case 'DUPLICATE_SHOT': {
            const src = state.shots.find(s => s.id === action.payload.id);
            if (!src) return state;
            const now = Date.now();
            const nextId = `shot-${now}-${Math.random().toString(16).slice(2)}`;
            const copy: Shot = {
                ...smartClone(src),
                id: nextId,
                name: `${src.name} Copy`,
                createdAt: now,
                updatedAt: now,
            };
            return {
                ...state,
                shots: [...state.shots, copy],
                activeShotId: copy.id,
                backgroundUrl: copy.backgroundUrl,
                depthMapUrl: copy.depthMapUrl || null,
                tokens: smartClone(copy.tokens) || [],
                annotations: smartClone(copy.annotations) || [],
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

            const nextActive = remaining[remaining.length - 1] || null;
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
                tokens: smartClone(nextActive.tokens) || [],
                annotations: smartClone(nextActive.annotations) || [],
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

            const shot = state.shots.find(s => s.id === id);
            if (!shot) return state;

            return {
                ...state,
                activeShotId: shot.id,
                backgroundUrl: shot.backgroundUrl,
                depthMapUrl: shot.depthMapUrl || null,
                tokens: deduplicateTokens(smartClone(shot.tokens) || []),
                annotations: smartClone(shot.annotations) || [],
                referenceSlots: smartClone(shot.referenceSlots) || [],
                director: smartClone(shot.director),
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
                return {
                    ...s,
                    backgroundUrl: state.backgroundUrl,
                    depthMapUrl: state.depthMapUrl,
                    tokens: deduplicateTokens(smartClone(state.tokens) || []),
                    annotations: smartClone(state.annotations) || [],
                    referenceSlots: smartClone(state.referenceSlots) || [],
                    director: smartClone(state.director),
                    floorPlane: state.floorPlane,
                    occupiedVolumes: smartClone(state.occupiedVolumes) || [],
                    regionEdit: smartClone(state.regionEdit),
                    updatedAt: touch ? now : s.updatedAt,
                };
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

// --- CONTEXT ---

export const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, initialState);

    const hydratedRef = useRef(false);
    const persistTimerRef = useRef<number | null>(null);

    // --- EFFECT 1: Restore / Migration ---
    useEffect(() => {
        let cancelled = false;

        const migrateOrLoad = async <T,>(
            key: string,
            sanitize?: (v: any) => any
        ): Promise<T | null> => {
            // 1) try IndexedDB
            const fromDb = await StorageService.load<T>(key, null as any);
            if (fromDb != null) {
                // ✅ cleanup legacy localStorage regardless
                if (localStorage.getItem(key) != null) localStorage.removeItem(key);
                return fromDb;
            }

            // 2) migrate from localStorage if present
            const fromLsRaw = localStorage.getItem(key);
            if (!fromLsRaw) return null;

            try {
                const parsed = JSON.parse(fromLsRaw);
                const value = sanitize ? sanitize(parsed) : parsed;
                await StorageService.save(key, value);
                localStorage.removeItem(key);
                return value as T;
            } catch {
                localStorage.removeItem(key);
                return null;
            }
        };

        const restore = async () => {
            try {
                const [_tokens, _annotations, actors, wardrobe, props, shots] = await Promise.all([
                    migrateOrLoad<StageToken[]>('nano_tokens', sanitizeTokens),
                    migrateOrLoad<StageAnnotation[]>('nano_annotations', sanitizeAnnotations),
                    StorageService.load<CastMember[]>('nano_actors', []),
                    StorageService.load<WardrobeItem[]>('nano_wardrobe', []),
                    StorageService.load<PropItem[]>('nano_props', []),
                    StorageService.load<Shot[]>('nano_shots', []),
                ]);

                if (cancelled) return;

                // CLEAR TRANSIENT STAGE (USER REQUEST)
                // We no longer restore nano_tokens or nano_annotations on cold start to ensure a clean stage.
                // Persistence is now entirely shot-authoritative.
                /* 
                if (tokens) dispatch({ type: 'SET_TOKENS', payload: deduplicateTokens(tokens) });
                if (annotations) dispatch({ type: 'SET_ANNOTATIONS', payload: annotations });
                */
                if (actors.length > 0) dispatch({ type: 'SET_ACTOR_LIBRARY', payload: actors });
                if (wardrobe.length > 0) dispatch({ type: 'SET_WARDROBE_ITEMS', payload: wardrobe });
                if (props.length > 0) dispatch({ type: 'SET_PROP_ITEMS', payload: props });

                if (shots.length > 0) {
                    dispatch({ type: 'SET_SHOTS', payload: shots });
                    const savedActive = localStorage.getItem('nano_active_shot_id');
                    const preferred = savedActive ? shots.find(s => s.id === savedActive) : null;
                    const fallback = shots[shots.length - 1];
                    dispatch({ type: 'SET_ACTIVE_SHOT', payload: { id: (preferred || fallback).id } });
                }

                hydratedRef.current = true;
            } catch (e) {
                console.error('Restore failed', e);
                if (!cancelled) hydratedRef.current = true;
            }
        };
        restore();

        return () => { cancelled = true; };
    }, []);

    // --- EFFECT 2: Persistence (Tokens & Annotations) - Debounced ---
    useEffect(() => {
        if (!hydratedRef.current) return;

        if (persistTimerRef.current) {
            window.clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = window.setTimeout(async () => {
            try {
                await StorageService.save('nano_tokens', sanitizeTokens(state.tokens));
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
            localStorage.setItem('nano_director_v3', JSON.stringify(state.director));
            localStorage.setItem('nano_bg_url', state.backgroundUrl || '');
            localStorage.setItem('nano_depth_url', state.depthMapUrl || '');
            localStorage.setItem('nano_depth_hash', state.depthMapHash || '');
            localStorage.setItem('nano_source_hash', state.sourceBackgroundHash || '');
            localStorage.setItem('nano_floor_plane', JSON.stringify(state.floorPlane));
            localStorage.setItem('nano_occupied_volumes', JSON.stringify(state.occupiedVolumes));
            localStorage.setItem('nano_active_shot_id', state.activeShotId || '');
            localStorage.setItem('nano_help_hints', JSON.stringify(state.showHelpHints));
            localStorage.setItem('nano_image_resolution', JSON.stringify(state.imageResolution));
            localStorage.setItem('nano_enable_image_thinking', JSON.stringify(state.enableImageThinking));
            localStorage.setItem('nano_enable_google_grounding', JSON.stringify(state.enableGoogleGrounding));
        } catch (e) {
            console.warn('Config persistence failed', e);
        }
    }, [
        state.apiKey,
        state.model,
        state.director,
        state.backgroundUrl,
        state.depthMapUrl,
        state.depthMapHash,
        state.sourceBackgroundHash,
        state.floorPlane,
        state.occupiedVolumes,
        state.activeShotId,
        state.showHelpHints,
        state.imageResolution,
        state.enableImageThinking,
        state.enableGoogleGrounding
    ]);

    // --- EFFECT 4: Persistence (Large Collections / StorageService) ---
    useEffect(() => {
        if (!hydratedRef.current) return;

        const timer = setTimeout(() => {
            const persistCollections = async () => {
                try {
                    await Promise.all([
                        StorageService.save('nano_wardrobe', state.wardrobeItems),
                        StorageService.save('nano_actors', state.actorLibrary),
                        StorageService.save('nano_props', state.propItems),
                        StorageService.save('nano_shots', sanitizeShots(state.shots)),
                    ]);
                } catch (e) {
                    console.error('Collections persistence failed', e);
                }
            };
            persistCollections();
        }, 5000); // 5-second debounce to prevent V8 OOM crashes from heavy IDB cloning

        return () => clearTimeout(timer);
    }, [state.wardrobeItems, state.actorLibrary, state.propItems, state.shots]);

    return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useAppContext must be used within an AppProvider');
    return context;
};


