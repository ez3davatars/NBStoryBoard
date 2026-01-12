import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import { StorageService } from '../services/StorageService';

// --- SHARED TYPES ---

export type ViewMode = 'forge' | 'casting' | 'wardrobe' | 'props' | 'staging' | 'veo' | 'production' | 'settings' | 'blocking';


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
  zIndex: number;
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
export type DirectorResolution = 'Native 4K' | '2K QHD' | '1K';
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
}

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
  | { type: 'SET_PROP_ITEMS'; payload: PropItem[] };

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
  markerType: '',
  negativePrompt: 'worst quality, low quality, normal quality, lowres, monochrome, grayscale, watermark, signature, username, error, blurry, jpeg artifacts, cropped, duplicate, out of frame, ugly, morbid, mutilated, out of focus, dehydration, long neck, bad anatomy, bad proportions, extra limbs, cloned face, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, deformed, disfigured, mutation, mutated hands, mutated fingers, long body, tiling, poorly drawn hands, poorly drawn face, disfigured face, skin spots, acnes, skin blemishes, bad reflections, overexposed, underexposed, harsh lighting, unrealistic lighting',
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
  const valid: AppState['model'][] = ['imagen-4.0-generate-001', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
  if (saved && valid.includes(saved as any)) return saved as AppState['model'];
  return 'gemini-2.5-flash-image';
};

export const initialState: AppState = {
  apiKey: localStorage.getItem('nano_api_key') || '',
  model: getInitialModel(),
  view: 'forge',
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
};

// --- REDUCER ---

export const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_VIEW': return { ...state, view: action.payload };
    case 'SET_API_KEY': 
      return { ...state, apiKey: action.payload };
    case 'SET_MODEL': 
      return { ...state, model: action.payload };
    case 'ADD_CAST': return { ...state, cast: [...state.cast, action.payload] };
    case 'UPDATE_CAST':
      return {
        ...state,
        cast: state.cast.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c)
      };
    case 'REMOVE_CAST': return { ...state, cast: state.cast.filter(c => c.id !== action.payload) };
    case 'ADD_TOKEN': return { ...state, tokens: [...state.tokens, action.payload] };
    case 'UPDATE_TOKEN': 
      return { 
        ...state, 
        tokens: state.tokens.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t) 
      };
    case 'REMOVE_TOKEN': return { ...state, tokens: state.tokens.filter(t => t.id !== action.payload), selection: state.selection === action.payload ? null : state.selection };
    case 'ADD_ANNOTATION': return { ...state, annotations: [...state.annotations, action.payload] };
    case 'UPDATE_ANNOTATION':
        return {
            ...state,
            annotations: state.annotations.map(a => a.id === action.payload.id ? { ...a, ...action.payload } : a)
        };
    case 'REMOVE_ANNOTATION': return { ...state, annotations: state.annotations.filter(a => a.id !== action.payload), selection: state.selection === action.payload ? null : state.selection };
    case 'UPDATE_REF_SLOT': {
      const next = state.referenceSlots.map(s => s.index === action.payload.index ? { ...s, ...action.payload.updates } : s);
      return { ...state, referenceSlots: next };
    }
    case 'CLEAR_REF_SLOTS': {
      return { ...state, referenceSlots: defaultRefSlots };
    }
    case 'SET_DIRECTOR': {
      const next = { ...state.director, ...action.payload };
      return { ...state, director: next };
    }
    case 'SELECT_ITEM': return { ...state, selection: action.payload.id, selectionType: action.payload.type };
    case 'CLEAR_STAGE': return { ...state, tokens: [], annotations: [], backgroundUrl: null, selection: null, selectionType: null, storyboardSource: null, storyboardGenerations: [], lastCastedImage: null, lastCastedPrompt: '', lastCastedMask: null }; 
    case 'SET_BG': return { ...state, backgroundUrl: action.payload };
    case 'SET_RESULT_IMAGE': return { ...state, resultImage: action.payload };
    case 'SET_PROCESSING': return { ...state, isProcessing: action.payload };
    case 'ADD_LOG': 
      return { 
        ...state, 
        logs: [...state.logs, { ...action.payload, id: Math.random().toString(), timestamp: new Date() }] 
      };
    case 'SET_SAVE_DIRECTORY': return { ...state, saveDirectoryHandle: action.payload };
    case 'ADD_WARDROBE_ITEM': {
      return { ...state, wardrobeItems: [...state.wardrobeItems, action.payload] };
    }
    case 'REMOVE_WARDROBE_ITEM': {
      return { ...state, wardrobeItems: state.wardrobeItems.filter(item => item.id !== action.payload) };
    }
    case 'SET_WARDROBE_ITEMS': {
      return { ...state, wardrobeItems: action.payload };
    }
    case 'SET_STORYBOARD_SOURCE': return { ...state, storyboardSource: action.payload };
    case 'SET_STORYBOARD_END_SOURCE': return { ...state, storyboardEndSource: action.payload };
    case 'SET_STORYBOARD_GENERATIONS': return { ...state, storyboardGenerations: action.payload };
    case 'UPDATE_STORYBOARD_GENERATION': 
        return {
            ...state,
            storyboardGenerations: state.storyboardGenerations.map(g => 
                g.id === action.payload.id ? { ...g, ...action.payload } : g
            )
        };
    case 'SET_LAST_CASTED_IMAGE': return { ...state, lastCastedImage: action.payload };
    case 'SET_LAST_CASTED_PROMPT': return { ...state, lastCastedPrompt: action.payload };
    case 'SET_LAST_CASTED_MASK': return { ...state, lastCastedMask: action.payload };
    case 'SET_INSPECT_IMAGE': return { ...state, inspectImage: action.payload };
    case 'SET_INSPECT_MASK': return { ...state, inspectMask: action.payload };
    case 'UPDATE_TOKEN_INTELLIGENCE':
      return {
        ...state,
        tokens: state.tokens.map(t => t.id === action.payload.id ? { ...t, intelligence: action.payload.intelligence } : t)
      };
    case 'ADD_ACTOR_LIBRARY': return { ...state, actorLibrary: [action.payload, ...state.actorLibrary] };
    case 'REMOVE_ACTOR_LIBRARY': return { ...state, actorLibrary: state.actorLibrary.filter(a => a.id !== action.payload) };
    case 'REMOVE_ACTOR_LIBRARY_BY_URL': return { ...state, actorLibrary: state.actorLibrary.filter(a => a.url !== action.payload) };
    case 'UPDATE_ACTOR_LIBRARY':
      return {
        ...state,
        actorLibrary: state.actorLibrary.map(a => a.id === action.payload.id ? { ...a, ...action.payload.updates } : a)
      };
    case 'SET_ACTOR_LIBRARY': return { ...state, actorLibrary: action.payload };
    case 'ADD_PROP_ITEM': {
      return { ...state, propItems: [...state.propItems, action.payload] };
    }
    case 'REMOVE_PROP_ITEM': {
      return { ...state, propItems: state.propItems.filter(item => item.id !== action.payload) };
    }
    case 'SET_PROP_ITEMS': {
      return { ...state, propItems: action.payload };
    }
    default: return state;
  }
};

// --- CONTEXT ---

export const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Sync state to localStorage / IndexedDB for persistence
  useEffect(() => {
    const persist = async () => {
      try {
        localStorage.setItem('nano_api_key', state.apiKey);
        localStorage.setItem('nano_model', state.model);
        localStorage.setItem('nano_director_v3', JSON.stringify(state.director));
        localStorage.setItem('nano_bg_url', state.backgroundUrl || '');
        
        // Large assets go to IndexedDB to avoid QuotaExceededError
        // For now, tokens and annotations are small enough for localStorage (json text)
        // If they get too big (due to many items), we might move them to IDB later.
        localStorage.setItem('nano_tokens', JSON.stringify(state.tokens));
        localStorage.setItem('nano_annotations', JSON.stringify(state.annotations));

        await StorageService.save('nano_wardrobe', state.wardrobeItems);
        await StorageService.save('nano_actors', state.actorLibrary);
        await StorageService.save('nano_props', state.propItems);
      } catch (e) {
        console.error("Persistence failed", e);
      }
    };
    persist();
  }, [state.apiKey, state.model, state.director, state.wardrobeItems, state.actorLibrary, state.propItems, state.tokens, state.annotations, state.backgroundUrl]);

  // Initial Load from Persistent Storage
  useEffect(() => {
    const restore = async () => {
      try {
        const actors = await StorageService.load<CastMember[]>('nano_actors', []);
        const wardrobe = await StorageService.load<WardrobeItem[]>('nano_wardrobe', []);
        const props = await StorageService.load<PropItem[]>('nano_props', []);
        
        if (actors.length > 0) dispatch({ type: 'SET_ACTOR_LIBRARY', payload: actors });
        if (wardrobe.length > 0) dispatch({ type: 'SET_WARDROBE_ITEMS', payload: wardrobe });
        if (props.length > 0) dispatch({ type: 'SET_PROP_ITEMS', payload: props });
      } catch (e) {
        console.error("Restore failed", e);
      }
    };
    restore();
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within an AppProvider");
  return context;
};
