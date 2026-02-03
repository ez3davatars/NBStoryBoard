import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import { StorageService } from '../services/StorageService';

export const APP_SCHEMA_VERSION = 4; // bump when persisted state shape changes
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
  | 'nano_cast';

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
  uniformScale: boolean;
  zIndex: number;
  visible?: boolean;
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

export type DirectorMergeStrategy = 'Character Identity' | 'Style Transfer' | 'Composition Reference' | 'Photo Merge';
export type DirectorSpatialLayout = '' | 'horizontal' | 'vertical' | 'depth' | 'center';
export type DirectorMarkerType =
  | ''
  | 'Colored Bounding Boxes'
  | 'Hand-Drawn Circles'
  | 'Directional Arrows'
  | 'Crude Sketches'
  | 'Numeric Markers';

export type DirectorAspectRatio = '16:9' | '21:9' | '3:2' | '4:3' | '9:16' | '1:1' | '4:5';
export type DirectorResolution = 'Native 4K' | '2K QHD' | '1K' | { width: number; height: number };
export type DirectorQualityMode = 'Standard' | 'Raw Uncompressed' | '3D Render' | 'Stylized';
export type DirectorSafety = 'Standard' | 'Strict';

export interface DirectorSettings {
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

const clone = <T,>(v: T): T => {
  // structuredClone is ideal; JSON clone is fine for our plain objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).structuredClone ? (globalThis as any).structuredClone(v) : JSON.parse(JSON.stringify(v));
};

export interface Shot {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms

  backgroundUrl: string | null;
  tokens: StageToken[];
  annotations: StageAnnotation[];
  referenceSlots: ReferenceSlot[];
  director: DirectorSettings;

  startFrameUrl?: string | null;
  endFrameUrl?: string | null;
  notes?: string;

  // ✅ store full region edit state per shot (optional for backwards compatibility)
  regionEdit?: RegionEditState;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface AppState {
  apiKey: string;
  model: 'imagen-4.0-generate-001' | 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';
  view: ViewMode;
  cast: CastMember[];
  tokens: StageToken[];
  annotations: StageAnnotation[];
  referenceSlots: ReferenceSlot[];
  director: DirectorSettings;
  selection: string | null;
  selectionType: 'token' | 'annotation' | null;
  backgroundUrl: string | null;
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

  regionEdit: RegionEditState;

  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];


  shots: Shot[];
  activeShotId: string | null;
  isStoryboardEnabled: boolean;

  // Persist panel open/closed states in memory only (reset on reload)
  stagePanelState: Record<string, boolean>;

  // WARDROBE PERSISTENCE
  wardrobeState: WardrobeState;
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
  selectedCostume: null
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
  | { type: 'SET_RESULT_IMAGE'; payload: string | null }
  | { type: 'ADD_LOG'; payload: Omit<LogEntry, 'id' | 'timestamp'> }
  | { type: 'SET_PROCESSING'; payload: boolean }
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
  | { type: 'CLEAR_REGION_LAYER_MASK'; payload: { id: RegionLayerId } }
  | { type: 'CLEAR_ALL_REGION_MASKS' }
  | { type: 'SET_REGION_PROTECT'; payload: { enabled: boolean } }
  | { type: 'SET_REGION_PROTECT_MASK'; payload: { maskDataUrl: string | null } }
  // Shots
  | { type: 'SET_SHOTS'; payload: Shot[] }
  | { type: 'ADD_SHOT_FROM_STAGE'; payload: { name?: string } }
  | { type: 'DUPLICATE_SHOT'; payload: { id: string } }
  | { type: 'REMOVE_SHOT'; payload: { id: string } }
  | { type: 'SET_ACTIVE_SHOT'; payload: { id: string | null } }
  | { type: 'SAVE_ACTIVE_SHOT'; payload?: { touchUpdatedAt?: boolean } }
  | { type: 'UPDATE_SHOT_META'; payload: { id: string; updates: Partial<Pick<Shot, 'name' | 'notes'>> } }
  | { type: 'SET_SHOT_FRAME'; payload: { id: string; which: 'start' | 'end'; url: string | null } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_STORYBOARD_ENABLED'; payload: boolean }
  | { type: 'SET_CUSTOM_COVERS'; payload: Record<string, string> }
  | { type: 'SET_STAGE_PANEL_STATE'; payload: { id: string; isOpen: boolean } }
  | { type: 'SET_WARDROBE_STATE'; payload: Partial<WardrobeState> }
  ;

// --- HELPERS ---

const loadJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return parsed as T;
    return { ...(fallback as any), ...(parsed as any) } as T;
  } catch {
    return fallback;
  }
};

// --- UNDO / REDO HISTORY (paid-launch safety) ---
export type HistorySnapshot = {
  backgroundUrl: string | null;
  tokens: StageToken[];
  annotations: StageAnnotation[];
  referenceSlots: ReferenceSlot[];
  director: DirectorSettings;
  regionEdit: RegionEditState;
  shots: Shot[];
  activeShotId: string | null;
  resultImage: string | null;
};

const MAX_HISTORY = 30;

const snapshotOf = (s: AppState): HistorySnapshot => ({
  backgroundUrl: s.backgroundUrl,
  tokens: clone(s.tokens),
  annotations: clone(s.annotations),
  referenceSlots: clone(s.referenceSlots),
  director: clone(s.director),
  regionEdit: clone(s.regionEdit),
  shots: clone(s.shots),
  activeShotId: s.activeShotId,
  resultImage: s.resultImage,
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
    'SET_RESULT_IMAGE'
  ]);
  return set.has(type);
};


const defaultDirector: DirectorSettings = {
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
  replaceAnchorSubjects: false,
  globalReplaceTarget: '',
  spatialLayout: '',
  markerType: 'Colored Bounding Boxes',
  negativePrompt:
    'worst quality, low quality, normal quality, lowres, monochrome, grayscale, watermark, signature, username, error, blurry, jpeg artifacts, cropped, duplicate, out of frame, ugly, morbid, mutilated, out of focus, dehydration, long neck, bad anatomy, bad proportions, extra limbs, cloned face, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, deformed, disfigured, mutation, mutated hands, mutated fingers, long body, tiling, poorly drawn hands, poorly drawn face, disfigured face, skin spots, acnes, skin blemishes, bad reflections, overexposed, underexposed, harsh lighting, unrealistic lighting',
  sceneLock: false,
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
    'gemini-3-pro-image-preview',
  ];
  if (saved && valid.includes(saved as any)) return saved as AppState['model'];
  return 'gemini-2.5-flash-image';
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
  tokens: loadJson<StageToken[]>('nano_tokens', []),
  annotations: loadJson<StageAnnotation[]>('nano_annotations', []),
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
  wardrobeItems: loadJson<WardrobeItem[]>('nano_wardrobe', []),
  storyboardSource: null,
  storyboardEndSource: null,
  storyboardGenerations: [],
  lastCastedImage: null,
  lastCastedPrompt: '',
  lastCastedMask: null,
  inspectImage: null,
  inspectMask: null,
  actorLibrary: [],
  propItems: loadJson<PropItem[]>('nano_props', []),
  customCovers: {},

  regionEdit: clone(DEFAULT_REGION_EDIT),


  historyPast: [],
  historyFuture: [],

  shots: [],
  activeShotId: localStorage.getItem('nano_active_shot_id') || null,
  isStoryboardEnabled: false, // ADMIN: MASTER TOGGLE OFF
  stagePanelState: {
    'ref_stacks': true,
    'region_edit': true,
    'layers': true,
    'specs': true,
    'anchor': true,
    'scene_director': true
  },
  wardrobeState: clone(DEFAULT_WARDROBE_STATE)
};

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
    case 'REMOVE_CAST':
      return { ...state, cast: state.cast.filter(c => c.id !== action.payload) };

    case 'ADD_TOKEN':
      return { ...state, tokens: [...state.tokens, action.payload] };
    case 'UPDATE_TOKEN':
      return { ...state, tokens: state.tokens.map(t => (t.id === action.payload.id ? { ...t, ...action.payload } : t)) };
    case 'REMOVE_TOKEN': {
      const nextTokens = state.tokens.filter(t => t.id !== action.payload);
      const nextSelection = state.selection === action.payload ? null : state.selection;
      // SAFEGUARD: This action removes visual tokens only. DO NOT filter state.actorLibrary or state.cast here.
      return { ...state, tokens: nextTokens, selection: nextSelection };
    }

    case 'ADD_ANNOTATION':
      return { ...state, annotations: [...state.annotations, action.payload] };
    case 'UPDATE_ANNOTATION':
      return { ...state, annotations: state.annotations.map(a => (a.id === action.payload.id ? { ...a, ...action.payload } : a)) };
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

    case 'SET_DIRECTOR': {
      const next = { ...state.director, ...action.payload };
      return { ...state, director: next };
    }

    case 'SELECT_ITEM':
      return { ...state, selection: action.payload.id, selectionType: action.payload.type };

    case 'CLEAR_STAGE':
      return {
        ...state,
        tokens: [],
        annotations: [],
        backgroundUrl: null,
        selection: null,
        selectionType: null,
        storyboardSource: null,
        storyboardEndSource: null,
        storyboardGenerations: [],
        lastCastedImage: null,
        lastCastedPrompt: '',
        lastCastedMask: null,
        activeShotId: null,
        regionEdit: clone(DEFAULT_REGION_EDIT),
        historyPast: [],
        historyFuture: [],
      };

    case 'SET_BG':
      return { ...state, backgroundUrl: action.payload };
    case 'SET_RESULT_IMAGE':
      return { ...state, resultImage: action.payload };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, { ...action.payload, id: Math.random().toString(), timestamp: new Date() }] };
    case 'SET_SAVE_DIRECTORY':
      return { ...state, saveDirectoryHandle: action.payload };
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


    case 'SET_STORYBOARD_ENABLED':
      // ADMIN LOCK: Prevent changes via action
      return state;
    // return { ...state, isStoryboardEnabled: action.payload };

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
      const nextLayers = state.regionEdit.layers.map(l => (l.id === action.payload.id ? { ...l, maskDataUrl: null } : l));
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
        tokens: clone(state.tokens),
        annotations: clone(state.annotations),
        referenceSlots: clone(state.referenceSlots),
        director: clone(state.director),
        startFrameUrl: null,
        endFrameUrl: null,
        notes: '',
        regionEdit: clone(state.regionEdit),
      };

      return { ...state, shots: [...state.shots, newShot], activeShotId: newShot.id };
    }

    case 'DUPLICATE_SHOT': {
      const src = state.shots.find(s => s.id === action.payload.id);
      if (!src) return state;
      const now = Date.now();
      const nextId = `shot-${now}-${Math.random().toString(16).slice(2)}`;
      const copy: Shot = {
        ...clone(src),
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
        tokens: clone(copy.tokens),
        annotations: clone(copy.annotations),
        referenceSlots: clone(copy.referenceSlots),
        director: clone(copy.director),
        regionEdit: clone(copy.regionEdit ?? DEFAULT_REGION_EDIT),
        selection: null,
        selectionType: null,
      };
    }

    case 'REMOVE_SHOT': {
      const remaining = state.shots.filter(s => s.id !== action.payload.id);
      const removingActive = state.activeShotId === action.payload.id;

      if (!removingActive) return { ...state, shots: remaining };

      const nextActive = remaining[remaining.length - 1] || null;
      if (!nextActive) return { ...state, shots: [], activeShotId: null };

      return {
        ...state,
        shots: remaining,
        activeShotId: nextActive.id,
        backgroundUrl: nextActive.backgroundUrl,
        tokens: clone(nextActive.tokens),
        annotations: clone(nextActive.annotations),
        referenceSlots: clone(nextActive.referenceSlots),
        director: clone(nextActive.director),
        regionEdit: clone(nextActive.regionEdit ?? DEFAULT_REGION_EDIT),
        selection: null,
        selectionType: null,
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
        tokens: clone(shot.tokens),
        annotations: clone(shot.annotations),
        referenceSlots: clone(shot.referenceSlots),
        director: clone(shot.director),
        regionEdit: clone(shot.regionEdit ?? DEFAULT_REGION_EDIT),
        selection: null,
        selectionType: null,
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
          tokens: clone(state.tokens),
          annotations: clone(state.annotations),
          referenceSlots: clone(state.referenceSlots),
          director: clone(state.director),
          regionEdit: clone(state.regionEdit),
          updatedAt: touch ? now : s.updatedAt,
        };
      });

      return { ...state, shots: nextShots };
    }

    case 'UPDATE_SHOT_META': {
      const now = Date.now();
      const nextShots = state.shots.map(s => (s.id === action.payload.id ? { ...s, ...action.payload.updates, updatedAt: now } : s));
      return { ...state, shots: nextShots };
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

    default:
      return state;
  }
};

// --- CONTEXT ---

export const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const persist = async () => {
      try {
        localStorage.setItem('nano_api_key', state.apiKey);
        localStorage.setItem('nano_model', state.model);
        localStorage.setItem('nano_director_v3', JSON.stringify(state.director));
        localStorage.setItem('nano_bg_url', state.backgroundUrl || '');
        localStorage.setItem('nano_active_shot_id', state.activeShotId || '');

        localStorage.setItem('nano_tokens', JSON.stringify(state.tokens));
        localStorage.setItem('nano_annotations', JSON.stringify(state.annotations));

        await StorageService.save('nano_wardrobe', state.wardrobeItems);
        await StorageService.save('nano_actors', state.actorLibrary);
        await StorageService.save('nano_props', state.propItems);
        await StorageService.save('nano_shots', state.shots);
      } catch (e) {
        console.error('Persistence failed', e);
      }
    };
    persist();
  }, [
    state.apiKey,
    state.model,
    state.director,
    state.wardrobeItems,
    state.actorLibrary,
    state.propItems,
    state.shots,
    state.tokens,
    state.annotations,
    state.backgroundUrl,
    state.activeShotId,
  ]);

  useEffect(() => {
    const restore = async () => {
      try {
        const actors = await StorageService.load<CastMember[]>('nano_actors', []);
        const wardrobe = await StorageService.load<WardrobeItem[]>('nano_wardrobe', []);
        const props = await StorageService.load<PropItem[]>('nano_props', []);
        const shots = await StorageService.load<Shot[]>('nano_shots', []);

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
      } catch (e) {
        console.error('Restore failed', e);
      }
    };
    restore();
  }, []);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};